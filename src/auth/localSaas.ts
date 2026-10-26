import type { User } from '../dashboard/Dashboard'
import type { PlanRequest, ProjectComment } from '../admin/adminTypes'
import {
  canCommentOn, commentPermissions, effectivePlanId, isPlanId, periodEnd, readPricing, sanitizeCommentAnchor,
  sanitizeCommentBody, sanitizePricing, upgradeMessage, type PlanId, type PlanSubject, type PricingConfig,
} from '../saas/platformCore.mjs'
import { recordLocalAudit } from './auditLocal'

/**
 * SaaS no modo local (deploy estático, sem servidor): planos, pedidos de plano e
 * comentários guardados no localStorage deste navegador. Mantém o mesmo contrato
 * de API do servidor (server/saas.mjs). Aqui as regras são de interface — num
 * navegador não há forma de as impor a quem controla o próprio cliente.
 */
export const PRICING_KEY = 'dcsimu:saas:pricing:v1'
export const PLANS_KEY = 'dcsimu:saas:plans:v1'
export const REQUESTS_KEY = 'dcsimu:saas:requests:v1'
export const COMMENTS_KEY = 'dcsimu:saas:comments:v1'

type StoredPlan = { plan: PlanId; planExpiresAt: string | null; adminNote?: string }

const read = <T,>(key: string, fallback: T): T => {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback } catch { return fallback }
}
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { throw new Error('Não foi possível guardar neste navegador.') }
}
const newId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)

export function localPricing(): PricingConfig { return readPricing(read(PRICING_KEY, null)) }

export function localPlanRecord(userId: string): StoredPlan {
  const all = read<Record<string, StoredPlan>>(PLANS_KEY, {})
  const entry = all[userId]
  return entry && isPlanId(entry.plan) ? entry : { plan: localPricing().defaultPlan, planExpiresAt: null }
}

export function setLocalPlanRecord(userId: string, patch: Partial<StoredPlan>) {
  const all = read<Record<string, StoredPlan>>(PLANS_KEY, {})
  all[userId] = { ...localPlanRecord(userId), ...patch }
  write(PLANS_KEY, all)
  return all[userId]
}

export function localSubject(user: Pick<User, 'id' | 'role'>): PlanSubject {
  const record = localPlanRecord(user.id)
  return { id: user.id, role: user.role, plan: record.plan, planExpiresAt: record.planExpiresAt }
}

type Ctx = {
  parts: string[]
  url: string
  verb: string
  payload: Record<string, unknown>
  user: User
  /** Projeto acessível (lança se não tiver acesso). */
  project: (id: string) => { id: string; name: string; ownerId: string; role: 'owner' | 'editor' }
  accountName: (id: string) => string | undefined
  accountEmail: (id: string) => string | undefined
}

/** Devolve undefined quando a rota não é deste módulo. */
export function localSaasApi(ctx: Ctx): unknown {
  const { parts, url, verb, payload, user } = ctx
  const path = url.split('?')[0]

  if (path === '/admin/pricing' && verb === 'PUT') {
    if (user.role !== 'admin') throw new Error('Acesso reservado ao administrador')
    const config = sanitizePricing(payload)
    const saved = { ...config, updatedAt: new Date().toISOString(), updatedBy: user.name }
    write(PRICING_KEY, saved)
    const visible = config.plans.filter((p) => p.showOnLanding).map((p) => p.name).join(', ') || 'nenhum'
    recordLocalAudit(user, 'pricing.update', { type: 'system', id: 'pricing', label: 'Planos e preços' }, `${config.showPricing ? 'secção visível' : 'secção oculta'} · cartões: ${visible}`)
    return saved
  }

  const requests = () => read<PlanRequest[]>(REQUESTS_KEY, [])
  const decorate = (r: PlanRequest): PlanRequest => ({ ...r, userName: ctx.accountName(r.userId), userEmail: ctx.accountEmail(r.userId) })

  if (path === '/account/plan' && verb === 'GET') {
    const record = localPlanRecord(user.id)
    const pending = requests().find((r) => r.userId === user.id && r.status === 'pending')
    return { plan: effectivePlanId(localSubject(user), localPricing()), assigned: record.plan, planExpiresAt: record.planExpiresAt, pending: pending ? decorate(pending) : null }
  }
  if (path === '/account/plan-request' && verb === 'POST') {
    const plan = payload.plan, period = payload.period === 'yearly' ? 'yearly' : 'monthly'
    if (!isPlanId(plan)) throw new Error('Plano inválido.')
    if (user.role === 'admin') throw new Error('O administrador tem acesso total; não precisa de plano.')
    if (effectivePlanId(localSubject(user), localPricing()) === plan) throw new Error('Já tem este plano.')
    const all = requests()
    if (all.some((r) => r.userId === user.id && r.status === 'pending')) throw new Error('Já tem um pedido de plano pendente.')
    const request: PlanRequest = { id: newId(), userId: user.id, plan, period, message: String(payload.message || '').trim().slice(0, 500) || undefined, status: 'pending', createdAt: new Date().toISOString() }
    write(REQUESTS_KEY, [request, ...all].slice(0, 200))
    recordLocalAudit(user, 'plan.request', { type: 'user', id: user.id, label: user.email }, `${plan} (${period === 'yearly' ? 'anual' : 'mensal'})`)
    return decorate(request)
  }
  if (path === '/account/plan-request' && verb === 'DELETE') {
    const all = requests(), pending = all.find((r) => r.userId === user.id && r.status === 'pending')
    if (!pending) throw new Error('Não tem pedidos pendentes.')
    pending.status = 'cancelled'
    pending.decidedAt = new Date().toISOString()
    write(REQUESTS_KEY, all)
    recordLocalAudit(user, 'plan.cancel', { type: 'user', id: user.id, label: user.email })
    return { ok: true }
  }
  if (path === '/admin/plan-requests' && verb === 'GET') {
    if (user.role !== 'admin') throw new Error('Acesso reservado ao administrador')
    const status = new URLSearchParams(url.split('?')[1] || '').get('status') || ''
    return requests().filter((r) => !status || r.status === status).map(decorate)
  }
  if (parts[0] === 'admin' && parts[1] === 'plan-requests' && parts[2] && verb === 'POST') {
    if (user.role !== 'admin') throw new Error('Acesso reservado ao administrador')
    const all = requests(), request = all.find((r) => r.id === parts[2])
    if (!request) throw new Error('Pedido não encontrado.')
    if (request.status !== 'pending') throw new Error('Este pedido já foi decidido.')
    const action = payload.action
    if (action !== 'approve' && action !== 'reject') throw new Error('Ação inválida.')
    const note = String(payload.note || '').trim().slice(0, 300)
    Object.assign(request, { status: action === 'approve' ? 'approved' : 'rejected', decidedAt: new Date().toISOString(), decidedBy: user.name, decisionNote: note || undefined })
    write(REQUESTS_KEY, all)
    if (action === 'approve') setLocalPlanRecord(request.userId, { plan: request.plan, planExpiresAt: request.plan === 'free' ? null : periodEnd(request.period) })
    recordLocalAudit(user, action === 'approve' ? 'plan.approve' : 'plan.reject', { type: 'user', id: request.userId, label: ctx.accountEmail(request.userId) }, `${request.plan} (${request.period === 'yearly' ? 'anual' : 'mensal'})${note ? ' · ' + note : ''}`)
    return decorate(request)
  }

  // ---- Comentários ----
  if (parts[0] === 'projects' && parts[1] && parts[2] === 'comments') {
    const project = ctx.project(parts[1])
    const all = read<ProjectComment[]>(COMMENTS_KEY, [])
    const pricing = localPricing()
    const owner = localSubject({ id: project.ownerId, role: project.ownerId === 'dcsimu-admin' ? 'admin' : 'user' })
    const canWrite = canCommentOn(localSubject(user), owner, pricing)
    const named = (c: ProjectComment) => ({ ...c, authorName: ctx.accountName(c.authorId) || c.authorName || 'Conta removida' })
    const target = { type: 'project', id: project.id, label: project.name }
    if (!parts[3] && verb === 'GET') {
      return { comments: all.filter((c) => c.projectId === project.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(named), canWrite, reason: canWrite ? null : upgradeMessage(pricing, 'comments') }
    }
    if (!parts[3] && verb === 'POST') {
      if (!canWrite) throw new Error(upgradeMessage(pricing, 'comments'))
      const body = sanitizeCommentBody(payload.body)
      const comment: ProjectComment = { id: newId(), projectId: project.id, authorId: user.id, authorName: user.name, body, anchor: sanitizeCommentAnchor(payload.anchor), resolved: false, createdAt: new Date().toISOString(), editedAt: null }
      write(COMMENTS_KEY, [...all, comment])
      recordLocalAudit(user, 'comment.create', target, body.slice(0, 80))
      return named(comment)
    }
    const comment = all.find((c) => c.id === parts[3] && c.projectId === project.id)
    if (!comment) throw new Error('Comentário não encontrado.')
    const perms = commentPermissions(comment, user, project.role)
    if (verb === 'PATCH') {
      if (payload.body !== undefined) {
        if (!perms.edit) throw new Error('Só o autor pode editar o comentário.')
        comment.body = sanitizeCommentBody(payload.body)
        comment.editedAt = new Date().toISOString()
        recordLocalAudit(user, 'comment.update', target, comment.body.slice(0, 80))
      }
      if (payload.resolved !== undefined) {
        if (!perms.resolve) throw new Error('Só o autor ou o proprietário do projeto podem resolver o comentário.')
        comment.resolved = !!payload.resolved
        if (comment.resolved) recordLocalAudit(user, 'comment.resolve', target)
      }
      write(COMMENTS_KEY, all)
      return named(comment)
    }
    if (verb === 'DELETE') {
      if (!perms.remove) throw new Error('Só o autor ou o proprietário do projeto podem eliminar o comentário.')
      write(COMMENTS_KEY, all.filter((c) => c.id !== comment.id))
      recordLocalAudit(user, 'comment.delete', target, comment.body.slice(0, 80))
      return { ok: true }
    }
  }
  return undefined
}

/** Remove os comentários de um projeto eliminado. */
export function dropLocalComments(projectId: string) {
  const all = read<ProjectComment[]>(COMMENTS_KEY, [])
  if (all.some((c) => c.projectId === projectId)) write(COMMENTS_KEY, all.filter((c) => c.projectId !== projectId))
}
