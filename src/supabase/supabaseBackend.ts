import type { Invite, Project, User } from '../dashboard/Dashboard'
import { getSupabase } from './supabaseClient'
import type { AdminUser, ComponentSetting, PlanRequest, ProjectComment } from '../admin/adminTypes'
import {
  canCommentOn, commentPermissions, componentStatusOf, effectivePlanId, isDefaultComponentSetting, isPlanId, periodEnd, readPricing,
  sanitizeCommentAnchor, sanitizeCommentBody, sanitizeComponentChange, sanitizePricing, upgradeMessage,
  type ComponentStatus, type PlanId, type PlanSubject, type PricingConfig,
} from '../saas/platformCore.mjs'

function clientOrThrow() {
  const client = getSupabase()
  if (!client) throw new Error('Supabase não está configurado. Configure o URL e a Chave Anon.')
  return client
}

class BlockedAccountError extends Error {
  constructor() { super('Esta conta foi bloqueada pelo administrador.') }
}

/** O papel vem sempre da tabela `profiles` (protegida por RLS/trigger); os
 * metadados do utilizador são editáveis pelo próprio cliente e não são fiáveis. */
async function resolveRole(userId: string): Promise<'admin' | 'user'> {
  const client = getSupabase()
  if (client) {
    try {
      const { data } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()
      // ADMIN-USERS-01: conta bloqueada pelo administrador (coluna da migração SaaS).
      if (data && data.active === false) {
        await client.auth.signOut()
        throw new BlockedAccountError()
      }
      if (data?.role === 'admin' || data?.role === 'user') return data.role
    } catch (error) {
      if (error instanceof BlockedAccountError) throw error
      /* perfil ainda indisponível: cai para utilizador comum */
    }
  }
  return 'user'
}

/** Regista o último acesso na base de dados (melhor esforço, nunca bloqueia o login). */
async function touchLogin() {
  try {
    await getSupabase()?.rpc('touch_login')
  } catch {
    /* função opcional: depende da migração de contas */
  }
}

/** Retorna o utilizador atualmente autenticado no Supabase ou null */
export async function supabaseGetCurrentUser(): Promise<User | null> {
  const client = getSupabase()
  if (!client) return null

  try {
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return null

    // Procura metadados do utilizador ou perfil
    const metadata = user.user_metadata ?? {}
    const role = await resolveRole(user.id)
    const name = (metadata.name as string) || user.email?.split('@')[0] || 'Utilizador'

    return {
      id: user.id,
      email: user.email ?? '',
      name,
      role,
    }
  } catch (error) {
    if (error instanceof BlockedAccountError) return null
    return null
  }
}

/** Alteração da palavra-passe da sessão Supabase atual. */
export async function supabaseChangePassword(password: string): Promise<void> {
  const { error } = await clientOrThrow().auth.updateUser({ password })
  if (error) throw new Error(error.message || 'Não foi possível alterar a palavra-passe no Supabase.')
}

/** Login com email e palavra-passe no Supabase */
export async function supabaseLogin(email: string, password: string): Promise<{ user: User }> {
  const client = clientOrThrow()

  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    throw new Error(error?.message || 'Falha ao autenticar no Supabase.')
  }

  const metadata = data.user.user_metadata ?? {}
  const role = await resolveRole(data.user.id)
  const name = (metadata.name as string) || data.user.email?.split('@')[0] || 'Utilizador'
  void touchLogin()

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? '',
      name,
      role,
    },
  }
}

/**
 * Garante que uma conta existe no Supabase e abre sessão com ela.
 * Usada pelas contas fixas: entram localmente (offline) e passam a ficar
 * também guardadas na base de dados. Devolve null se não for possível
 * (conta inexistente com confirmação de email ativa, rede em baixo, etc.).
 */
export async function supabaseEnsureAccount(email: string, password: string, name: string): Promise<{ user: User } | null> {
  const client = getSupabase()
  if (!client) return null
  try {
    return await supabaseLogin(email, password)
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (!message.includes('invalid login credentials')) return null
  }
  try {
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { name } } })
    if (error || !data.user || !data.session) return null
    return await supabaseLogin(email, password)
  } catch {
    return null
  }
}

/** Registo de nova conta no Supabase */
export async function supabaseRegister(email: string, password: string, name: string): Promise<{ user: User }> {
  const client = clientOrThrow()

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  })

  if (error || !data.user) {
    throw new Error(error?.message || 'Falha ao criar conta no Supabase.')
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? '',
      name,
      role: 'user',
    },
  }
}

/** Encerra a sessão no Supabase */
export async function supabaseLogout(): Promise<{ ok: boolean }> {
  const client = getSupabase()
  if (client) {
    try {
      await client.auth.signOut()
    } catch {
      /* noop */
    }
  }
  return { ok: true }
}

/** Lista todos os projetos acessíveis pelo utilizador atual */
export async function supabaseGetProjects(): Promise<Project[]> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()

  if (!user) throw new Error('Sessão expirada. Por favor autentique-se no Supabase.')

  // Consulta projetos próprios e projetos onde é membro
  const { data: ownedProjects, error: errOwned } = await client
    .from('projects')
    .select('id, name, revision, updated_at, content, owner_id')
    .order('updated_at', { ascending: false })

  if (errOwned) {
    throw new Error(`Erro ao carregar projetos do Supabase: ${errOwned.message}`)
  }

  return (ownedProjects || []).map((row) => ({
    id: row.id,
    name: row.name,
    revision: row.revision ?? 0,
    updated_at: row.updated_at,
    content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
    owner: row.owner_id === user.id ? 'Você' : 'Colaborador',
    role: row.owner_id === user.id ? 'owner' : 'editor',
  }))
}

/** Cria um novo projeto na base de dados Supabase */
export async function supabaseCreateProject(name: string, content: unknown): Promise<{ id: string; name: string; revision: number }> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()

  if (!user) throw new Error('Sessão expirada. Por favor autentique-se no Supabase.')

  const newProject = {
    name,
    owner_id: user.id,
    content: typeof content === 'string' ? JSON.parse(content) : content,
    revision: 0,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from('projects')
    .insert(newProject)
    .select('id, name, revision')
    .single()

  if (error || !data) {
    throw new Error(`Erro ao criar projeto no Supabase: ${error?.message || 'Sem resposta'}`)
  }

  return {
    id: data.id,
    name: data.name,
    revision: data.revision ?? 0,
  }
}

/** Carrega um projeto específico pelo ID */
export async function supabaseGetProject(id: string): Promise<{ id: string; name: string; role: 'owner' | 'editor'; revision: number; content: unknown }> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()

  if (!user) throw new Error('Sessão expirada.')

  const { data, error } = await client
    .from('projects')
    .select('id, name, owner_id, revision, content, updated_at')
    .eq('id', id)
    .single()

  if (error || !data) {
    throw new Error(`Projeto não encontrado no Supabase: ${error?.message || 'Sem dados'}`)
  }

  return {
    id: data.id,
    name: data.name,
    role: data.owner_id === user.id ? 'owner' : 'editor',
    revision: data.revision ?? 0,
    content: typeof data.content === 'string' ? JSON.parse(data.content) : data.content,
  }
}

/** Muda apenas o nome do projeto (barra do editor), sem tocar no conteúdo nem na revisão. */
export async function supabaseRenameProject(id: string, name: string): Promise<{ id: string; name: string; revision: number }> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Sessão expirada.')
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 120) throw new Error('Nome inválido')
  const { data, error } = await client
    .from('projects')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, revision')
    .single()
  if (error || !data) throw new Error(`Erro ao mudar o nome do projeto: ${error?.message || 'Sem resposta'}`)
  return { id: data.id, name: data.name, revision: data.revision ?? 0 }
}

/** Atualiza o conteúdo de um projeto com controle de revisão */
export async function supabaseUpdateProject(id: string, content: unknown, revision: number): Promise<{ ok: boolean; revision: number }> {
  const client = clientOrThrow()

  const nextRevision = revision + 1
  const payload = {
    content: typeof content === 'string' ? JSON.parse(content) : content,
    revision: nextRevision,
    updated_at: new Date().toISOString(),
  }

  const { error } = await client
    .from('projects')
    .update(payload)
    .eq('id', id)

  if (error) {
    throw new Error(`Erro ao guardar projeto no Supabase: ${error.message}`)
  }

  return { ok: true, revision: nextRevision }
}

/** Elimina um projeto no Supabase */
export async function supabaseDeleteProject(id: string): Promise<{ ok: boolean }> {
  const client = clientOrThrow()

  const { error } = await client
    .from('projects')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Erro ao eliminar projeto no Supabase: ${error.message}`)
  }

  return { ok: true }
}

/** Obtém a lista de convites do utilizador atual */
export async function supabaseGetInvitations(): Promise<Invite[]> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()

  if (!user) return []

  try {
    const { data, error } = await client
      .from('project_invitations')
      .select('id, project_id, sender_id, created_at, projects(name)')
      .eq('user_id', user.id)

    if (error || !data) return []

    return data.map((row: any) => ({
      id: row.id,
      project: row.projects?.name || 'Projeto Partilhado',
      sender: 'Colaborador',
    }))
  } catch {
    return []
  }
}

/** Responde a um convite de projeto */
export async function supabaseReplyInvitation(id: string, action: 'accept' | 'reject'): Promise<{ ok: boolean }> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  if (action === 'accept') {
    const { data: invite } = await client
      .from('project_invitations')
      .select('project_id')
      .eq('id', id)
      .single()

    if (invite) {
      await client.from('project_members').insert({
        project_id: invite.project_id,
        user_id: user.id,
        role: 'editor',
      })
    }
  }

  await client.from('project_invitations').delete().eq('id', id)
  return { ok: true }
}

/** Convida um utilizador para um projeto */
export async function supabaseInviteMember(projectId: string, email: string): Promise<{ ok: boolean }> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  // Procura perfil do utilizador convidado
  const { data: targetUser } = await client
    .from('profiles')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (!targetUser) {
    throw new Error(`Utilizador com o e-mail «${email}» não encontrado no Supabase.`)
  }

  const { error } = await client.from('project_invitations').insert({
    project_id: projectId,
    user_id: targetUser.id,
    sender_id: user.id,
  })

  if (error) {
    throw new Error(`Não foi possível enviar o convite: ${error.message}`)
  }

  return { ok: true }
}

/** Obtém membros de um projeto */
export async function supabaseFetchProjectMembers(projectId: string): Promise<{ members: Array<{ name: string; email: string }> }> {
  const client = clientOrThrow()

  const { data, error } = await client
    .from('project_members')
    .select('user_id, profiles(name, email)')
    .eq('project_id', projectId)

  if (error || !data) return { members: [] }

  return {
    members: data.map((m: any) => ({
      name: m.profiles?.name || 'Membro',
      email: m.profiles?.email || '',
    })),
  }
}

/** Definições do simulador: estado dos componentes, preços e plano em vigor. */
export async function supabaseGetSettings(): Promise<{
  disabledComponents: Array<{ type: string; note?: string }>
  components: Array<{ type: string; status: ComponentStatus; note?: string; minPlan: PlanId | null }>
  pricing: PricingConfig
  plan: PlanId | null
}> {
  const client = getSupabase()
  const pricing = await supabaseGetPricing()
  const empty = { disabledComponents: [], components: [], pricing, plan: pricing.defaultPlan }
  if (!client) return empty
  try {
    let rows: any[] | null = null
    const full = await client.from('component_settings').select('type, enabled, status, note, min_plan')
    if (!full.error) rows = full.data
    else {
      // Migração SaaS ainda não aplicada: só existe enabled/note.
      const legacy = await client.from('component_settings').select('type, enabled, note')
      rows = legacy.data
    }
    const components = (rows ?? []).map((d: any) => ({ type: d.type, status: componentStatusOf({ status: d.status, enabled: d.enabled }), note: d.note || undefined, minPlan: isPlanId(d.min_plan) ? d.min_plan : null }))
    const me = await supabaseProfilePlan()
    return {
      disabledComponents: components.filter((c) => c.status === 'blocked').map((c) => ({ type: c.type, note: c.note })),
      components, pricing, plan: me?.role === 'admin' ? null : effectivePlanId(me, pricing),
    }
  } catch {
    return empty
  }
}

/** Atualiza o estado de um componente (ativo/bloqueado/arquivado/eliminado e plano mínimo). */
export async function supabaseSetComponent(type: string, body: unknown): Promise<ComponentSetting> {
  const client = clientOrThrow()
  const change = sanitizeComponentChange(body)
  const { data: { user } } = await client.auth.getUser()
  const now = new Date().toISOString()
  if (isDefaultComponentSetting(change)) {
    const { error } = await client.from('component_settings').delete().eq('type', type)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await client.from('component_settings').upsert({
      type, enabled: change.status === 'active', status: change.status, min_plan: change.minPlan, note: change.note,
      updated_at: now, updated_by: user?.email || 'admin',
    })
    if (error) throw new Error(error.message)
  }
  return { type, enabled: change.status === 'active', status: change.status, minPlan: change.minPlan, note: change.note || undefined, updatedAt: now, updatedBy: user?.email || 'admin' }
}

export async function supabaseGetAdminComponents(): Promise<ComponentSetting[]> {
  const client = clientOrThrow()
  const { data, error } = await client.from('component_settings').select('*').order('type')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => { const status = componentStatusOf({ status: r.status, enabled: r.enabled }); return { type: r.type, enabled: status === 'active', status, minPlan: isPlanId(r.min_plan) ? r.min_plan : null, note: r.note || undefined, updatedAt: r.updated_at, updatedBy: r.updated_by || undefined } })
}

// ---------------------------------------------------------------------------
// SaaS (migração 20261026120000_saas_plans_comments.sql)
// ---------------------------------------------------------------------------

async function supabaseProfilePlan(): Promise<(PlanSubject & { id: string; role: 'admin' | 'user' }) | null> {
  const client = getSupabase()
  if (!client) return null
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null
  const { data } = await client.from('profiles').select('id, role, plan, plan_expires_at').eq('id', user.id).maybeSingle()
  return { id: user.id, role: data?.role === 'admin' ? 'admin' : 'user', plan: data?.plan, planExpiresAt: data?.plan_expires_at }
}

/** Leitura pública (anon) dos preços; sem migração devolve os planos por omissão. */
export async function supabaseGetPricing(): Promise<PricingConfig> {
  const client = getSupabase()
  if (!client) return readPricing(null)
  try {
    const { data } = await client.from('platform_settings').select('value, updated_at').eq('key', 'pricing').maybeSingle()
    return readPricing(data ? { ...(data.value as object), updatedAt: data.updated_at } : null)
  } catch {
    return readPricing(null)
  }
}

export async function supabaseSetPricing(body: unknown): Promise<PricingConfig> {
  const client = clientOrThrow()
  const config = sanitizePricing(body)
  const { data: { user } } = await client.auth.getUser()
  const { updatedAt: _a, updatedBy: _b, ...value } = config
  const now = new Date().toISOString()
  const { error } = await client.from('platform_settings').upsert({ key: 'pricing', value, updated_at: now, updated_by: user?.email || 'admin' })
  if (error) throw new Error(error.message)
  return { ...config, updatedAt: now, updatedBy: user?.email || 'admin' }
}

const requestOut = (r: any): PlanRequest => ({ id: r.id, userId: r.user_id, userName: r.profiles?.name, userEmail: r.profiles?.email, plan: r.plan, period: r.period, message: r.message || undefined, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at || undefined, decidedBy: r.decided_by || undefined, decisionNote: r.decision_note || undefined })

export async function supabaseAccountPlan() {
  const client = clientOrThrow()
  const me = await supabaseProfilePlan()
  if (!me) throw new Error('Inicie sessão')
  const pricing = await supabaseGetPricing()
  const { data } = await client.from('plan_requests').select('*').eq('user_id', me.id).eq('status', 'pending').maybeSingle()
  const { count } = await client.from('projects').select('id', { count: 'exact', head: true }).eq('owner_id', me.id)
  return { plan: effectivePlanId(me, pricing), assigned: me.plan || 'free', planExpiresAt: me.planExpiresAt || null, pending: data ? requestOut(data) : null, projects: count ?? 0 }
}

export async function supabaseRequestPlan(body: { plan?: unknown; period?: unknown; message?: unknown }) {
  const client = clientOrThrow()
  const me = await supabaseProfilePlan()
  if (!me) throw new Error('Inicie sessão')
  if (!isPlanId(body.plan)) throw new Error('Plano inválido.')
  if (me.role === 'admin') throw new Error('O administrador tem acesso total; não precisa de plano.')
  const { data, error } = await client.from('plan_requests').insert({ user_id: me.id, plan: body.plan, period: body.period === 'yearly' ? 'yearly' : 'monthly', message: String(body.message || '').trim().slice(0, 500) || null }).select('*').single()
  if (error) throw new Error(error.code === '23505' ? 'Já tem um pedido de plano pendente.' : error.message)
  return requestOut(data)
}

export async function supabaseCancelPlanRequest() {
  const client = clientOrThrow()
  const me = await supabaseProfilePlan()
  if (!me) throw new Error('Inicie sessão')
  const { error } = await client.from('plan_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('user_id', me.id).eq('status', 'pending')
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function supabaseListPlanRequests(status = ''): Promise<PlanRequest[]> {
  const client = clientOrThrow()
  let query = client.from('plan_requests').select('*, profiles:user_id(name, email)').order('created_at', { ascending: false }).limit(200)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(requestOut)
}

export async function supabaseDecidePlanRequest(id: string, body: { action?: unknown; note?: unknown }) {
  const client = clientOrThrow()
  const action = body.action
  if (action !== 'approve' && action !== 'reject') throw new Error('Ação inválida.')
  const { data: row, error } = await client.from('plan_requests').select('*').eq('id', id).maybeSingle()
  if (error || !row) throw new Error('Pedido não encontrado.')
  if (row.status !== 'pending') throw new Error('Este pedido já foi decidido.')
  const { data: { user } } = await client.auth.getUser()
  const note = String(body.note || '').trim().slice(0, 300)
  const { error: decideError } = await client.from('plan_requests').update({ status: action === 'approve' ? 'approved' : 'rejected', decided_at: new Date().toISOString(), decided_by: user?.email || 'admin', decision_note: note || null }).eq('id', id)
  if (decideError) throw new Error(decideError.message)
  if (action === 'approve') {
    const { error: planError } = await client.from('profiles').update({ plan: row.plan, plan_expires_at: row.plan === 'free' ? null : periodEnd(row.period) }).eq('id', row.user_id)
    if (planError) throw new Error(planError.message)
  }
  return requestOut({ ...row, status: action === 'approve' ? 'approved' : 'rejected', decision_note: note })
}

/** Lista de contas a partir de `profiles` (o administrador lê todos os perfis). */
export async function supabaseAdminUsers(): Promise<AdminUser[]> {
  const client = clientOrThrow()
  const { data, error } = await client.from('profiles').select('*').order('created_at')
  if (error) throw new Error(error.message)
  const { data: owned } = await client.from('projects').select('owner_id')
  const counts = new Map<string, number>()
  for (const p of owned ?? []) counts.set(p.owner_id, (counts.get(p.owner_id) ?? 0) + 1)
  return (data ?? []).map((p: any) => ({
    id: p.id, name: p.name, email: p.email, role: p.role === 'admin' ? 'admin' : 'user', active: p.active !== false,
    fixed: p.email === 'admin@dcsimu.local' || p.email === 'user@dcsimu.local', createdAt: p.created_at, lastLogin: p.last_login || undefined,
    projects: counts.get(p.id) ?? 0, contributions: 0, sessions: 0,
    plan: isPlanId(p.plan) ? p.plan : 'free', planExpiresAt: p.plan_expires_at || null, adminNote: p.admin_note || undefined,
  }))
}

/** Supabase: plano, fim do período, nota interna e estado (ativo) são editáveis pelo admin. */
export async function supabaseAdminUpdateUser(id: string, body: Record<string, unknown>): Promise<AdminUser> {
  const client = clientOrThrow()
  const patch: Record<string, unknown> = {}
  if (body.plan !== undefined) { if (!isPlanId(body.plan)) throw new Error('Plano inválido.'); patch.plan = body.plan }
  if (body.planExpiresAt !== undefined) {
    if (body.planExpiresAt === null || body.planExpiresAt === '') patch.plan_expires_at = null
    else { const t = Date.parse(String(body.planExpiresAt)); if (!Number.isFinite(t)) throw new Error('Data de fim do plano inválida.'); patch.plan_expires_at = new Date(t).toISOString() }
  }
  if (body.adminNote !== undefined) patch.admin_note = String(body.adminNote || '').trim().slice(0, 500) || null
  if (body.active !== undefined) patch.active = !!body.active
  if (body.name !== undefined) { const name = String(body.name).trim(); if (name.length < 2 || name.length > 60) throw new Error('O nome deve ter entre 2 e 60 caracteres.'); patch.name = name }
  if (body.role !== undefined) throw new Error('No Supabase o papel é definido pela base de dados (default_role_for) e não pelo painel.')
  if (!Object.keys(patch).length) throw new Error('Nada para alterar.')
  const { error } = await client.from('profiles').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  const row = (await supabaseAdminUsers()).find((u) => u.id === id)
  if (!row) throw new Error('Utilizador não encontrado')
  return row
}

const commentOut = (r: any): ProjectComment => ({ id: r.id, projectId: r.project_id, authorId: r.author_id, authorName: r.profiles?.name || 'Conta removida', body: r.body, anchor: r.anchor, resolved: !!r.resolved, createdAt: r.created_at, editedAt: r.edited_at || null })

async function commentContext(projectId: string) {
  const client = clientOrThrow()
  const me = await supabaseProfilePlan()
  if (!me) throw new Error('Inicie sessão')
  const pricing = await supabaseGetPricing()
  const { data: project } = await client.from('projects').select('owner_id').eq('id', projectId).maybeSingle()
  if (!project) throw new Error('Projeto não encontrado ou sem acesso')
  const { data: owner } = await client.from('profiles').select('id, role, plan, plan_expires_at').eq('id', project.owner_id).maybeSingle()
  const ownerSubject = owner ? { id: owner.id, role: owner.role, plan: owner.plan, planExpiresAt: owner.plan_expires_at } : null
  return { client, me, pricing, role: project.owner_id === me.id ? 'owner' as const : 'editor' as const, canWrite: canCommentOn(me, ownerSubject, pricing) }
}

export async function supabaseListComments(projectId: string) {
  const { client, pricing, canWrite } = await commentContext(projectId)
  const { data, error } = await client.from('project_comments').select('*, profiles:author_id(name)').eq('project_id', projectId).order('created_at')
  if (error) throw new Error(error.message)
  return { comments: (data ?? []).map(commentOut), canWrite, reason: canWrite ? null : upgradeMessage(pricing, 'comments') }
}

export async function supabaseAddComment(projectId: string, body: { body?: unknown; anchor?: unknown }) {
  const { client, me, pricing, canWrite } = await commentContext(projectId)
  if (!canWrite) throw new Error(upgradeMessage(pricing, 'comments'))
  const { data, error } = await client.from('project_comments').insert({ project_id: projectId, author_id: me.id, body: sanitizeCommentBody(body.body), anchor: sanitizeCommentAnchor(body.anchor) }).select('*, profiles:author_id(name)').single()
  if (error) throw new Error(error.message)
  return commentOut(data)
}

export async function supabaseUpdateComment(projectId: string, commentId: string, body: { body?: unknown; resolved?: unknown }) {
  const { client, me, role } = await commentContext(projectId)
  const { data: row } = await client.from('project_comments').select('author_id').eq('id', commentId).eq('project_id', projectId).maybeSingle()
  if (!row) throw new Error('Comentário não encontrado.')
  const perms = commentPermissions({ authorId: row.author_id }, me, role)
  const patch: Record<string, unknown> = {}
  if (body.body !== undefined) { if (!perms.edit) throw new Error('Só o autor pode editar o comentário.'); patch.body = sanitizeCommentBody(body.body); patch.edited_at = new Date().toISOString() }
  if (body.resolved !== undefined) { if (!perms.resolve) throw new Error('Só o autor ou o proprietário do projeto podem resolver o comentário.'); patch.resolved = !!body.resolved }
  const { data, error } = await client.from('project_comments').update(patch).eq('id', commentId).select('*, profiles:author_id(name)').single()
  if (error) throw new Error(error.message)
  return commentOut(data)
}

export async function supabaseDeleteComment(projectId: string, commentId: string) {
  const { client, me, role } = await commentContext(projectId)
  const { data: row } = await client.from('project_comments').select('author_id').eq('id', commentId).eq('project_id', projectId).maybeSingle()
  if (!row) throw new Error('Comentário não encontrado.')
  if (!commentPermissions({ authorId: row.author_id }, me, role).remove) throw new Error('Só o autor ou o proprietário do projeto podem eliminar o comentário.')
  const { error } = await client.from('project_comments').delete().eq('id', commentId)
  if (error) throw new Error(error.message)
  return { ok: true }
}

/** Obtém todos os projetos no modo administrativo a partir do Supabase */
export async function supabaseGetAdminProjects(): Promise<Array<{ id: string; name: string; revision: number; updated_at: string; owner: string; size: number; members: number }>> {
  const client = clientOrThrow()
  const { data, error } = await client
    .from('projects')
    .select('id, name, revision, updated_at, owner_id')
    .order('updated_at', { ascending: false })
  if (error || !data) return []
  return data.map((p: any) => ({
    id: p.id,
    name: p.name,
    revision: p.revision ?? 0,
    updated_at: p.updated_at,
    owner: p.owner_id,
    size: 0,
    members: 0,
  }))
}
