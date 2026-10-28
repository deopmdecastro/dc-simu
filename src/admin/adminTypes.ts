import type { ProjectPreviewData } from '../dashboard/projectPreview'
import type { ComponentType } from '../types'
import type { ComponentStatus, PlanId } from '../saas/platformCore.mjs'

export type Role = 'admin' | 'user'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  /** Conta de origem (seed): protegida contra alterações e eliminação. */
  fixed: boolean
  createdAt?: string
  lastLogin?: string
  projects: number
  contributions: number
  sessions: number
  /** Plano SaaS atribuído (SAAS-PLANS-01). */
  plan?: PlanId
  /** Fim do período pago; depois disso aplica-se o plano por omissão. */
  planExpiresAt?: string | null
  /** Nota interna do administrador (nunca mostrada ao utilizador). */
  adminNote?: string
  /** Fotografia de perfil (URL ou data URL); sem ela usam-se as iniciais. */
  avatarUrl?: string
}

export interface PlanRequest {
  id: string
  userId: string
  userName?: string
  userEmail?: string
  plan: PlanId
  period: 'monthly' | 'yearly'
  message?: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  createdAt: string
  decidedAt?: string
  decidedBy?: string
  decisionNote?: string
}

export interface ProjectComment {
  id: string
  projectId: string
  authorId: string
  authorName: string
  body: string
  anchor: 'geral' | 'esquema' | '3d' | 'ladder' | 'grafcet'
  resolved: boolean
  createdAt: string
  editedAt?: string | null
}

export interface AdminProject {
  id: string
  name: string
  owner: string
  updated_at: string
  revision?: number
  size?: number
  members?: number
  /** Composição do esquema para a capa do projeto (como no painel de projetos). */
  preview?: ProjectPreviewData
  /** Publicado na landing page (apenas um de cada vez). */
  isPublished?: boolean
}

export interface ComponentSetting {
  type: ComponentType | string
  enabled: boolean
  /** ADMIN-COMP-01: ativo · bloqueado · arquivado · eliminado. */
  status?: ComponentStatus
  /** Plano mínimo para inserir o componente (null = todos). */
  minPlan?: PlanId | null
  note?: string
  updatedAt?: string
  updatedBy?: string
}

export interface AuditEntry {
  id: string
  at: string
  actorId?: string
  actorName?: string
  actorEmail?: string
  action: string
  targetType?: string
  targetId?: string
  targetLabel?: string
  detail?: string
  ip?: string
}

export type LogCategory = 'auth' | 'user' | 'project' | 'contribution' | 'component' | 'system'

export interface LogQuery {
  category?: LogCategory | ''
  action?: string
  actor?: string
  q?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export interface SystemInfo {
  backend: 'server' | 'local'
  version?: string
  node?: string
  startedAt?: string
  uptimeSec?: number
  memoryMb?: number
  databaseBytes: number
  filesBytes: number
  projectBytes: number
  counts: { users: number; activeUsers: number; projects: number; contributions: number; sessions: number; logs: number; disabledComponents: number }
}

export const CATEGORY_LABEL: Record<LogCategory, string> = {
  auth: 'Autenticação', user: 'Utilizadores', project: 'Projetos', contribution: 'Contribuições', component: 'Componentes', system: 'Sistema',
}

export const ACTION_LABEL: Record<string, string> = {
  'login.success': 'Sessão iniciada', 'login.failed': 'Início de sessão falhado', 'login.denied': 'Acesso negado (conta desativada)', 'login.blocked': 'Bloqueio por tentativas', logout: 'Sessão terminada',
  'user.create': 'Conta criada', 'user.update': 'Conta alterada', 'user.enable': 'Conta ativada', 'user.disable': 'Conta desativada', 'user.password': 'Palavra-passe reposta', 'user.password.self': 'Palavra-passe alterada', 'user.delete': 'Conta eliminada', 'session.revoke': 'Sessões terminadas',
  'project.create': 'Projeto criado', 'project.delete': 'Projeto eliminado', 'project.invite': 'Convite enviado', 'invite.accept': 'Convite aceite', 'invite.reject': 'Convite recusado',
  'contribution.create': 'Contribuição criada', 'contribution.upload': 'Ficheiro enviado', 'contribution.update': 'Contribuição editada', 'contribution.delete': 'Contribuição eliminada',
  'contribution.approved': 'Contribuição aprovada', 'contribution.rejected': 'Contribuição rejeitada', 'contribution.pending': 'Contribuição reposta em revisão',
  'component.enable': 'Componente ativado', 'component.disable': 'Componente desativado',
  'component.block': 'Componente bloqueado', 'component.archive': 'Componente arquivado', 'component.delete': 'Componente eliminado', 'component.restore': 'Componente reposto', 'component.plan': 'Plano mínimo do componente alterado',
  'user.plan': 'Plano alterado', 'user.note': 'Nota interna alterada', 'plan.request': 'Pedido de plano', 'plan.approve': 'Pedido de plano aprovado', 'plan.reject': 'Pedido de plano recusado', 'plan.cancel': 'Pedido de plano cancelado',
  'pricing.update': 'Planos e preços alterados',
  'comment.create': 'Comentário criado', 'comment.update': 'Comentário editado', 'comment.delete': 'Comentário eliminado', 'comment.resolve': 'Comentário resolvido',
  'component.catalog.create': 'Componente 3D criado', 'component.catalog.save': 'Rascunho 3D guardado', 'component.catalog.publish': 'Componente 3D publicado',
  'component.catalog.archive': 'Componente 3D arquivado', 'component.catalog.restore': 'Componente 3D reposto', 'component.catalog.delete': 'Componente 3D eliminado', 'component.profile.save': 'Perfil de bornes guardado', 'component.profile.delete': 'Perfil de bornes eliminado',
  'logs.purge': 'Registos antigos apagados', 'export.data': 'Dados exportados',
}

export const actionLabel = (action: string) => ACTION_LABEL[action] ?? action

export function categoryOf(action: string): LogCategory {
  if (action.startsWith('login.') || action === 'logout') return 'auth'
  if (action.startsWith('user.') || action.startsWith('session.')) return 'user'
  if (action.startsWith('project.') || action.startsWith('invite.')) return 'project'
  if (action.startsWith('contribution.')) return 'contribution'
  if (action.startsWith('component.')) return 'component'
  if (action.startsWith('plan.') || action.startsWith('pricing.')) return 'user'
  if (action.startsWith('comment.')) return 'project'
  return 'system'
}

/** Gravidade visual: falhas e ações destrutivas destacam-se. */
export function severityOf(action: string): 'info' | 'warn' | 'danger' {
  if (['login.failed', 'login.blocked', 'login.denied'].includes(action)) return 'danger'
  if (/\.(delete|disable|purge|rejected|revoke|block|archive|reject)$/.test(action) || action === 'session.revoke') return 'warn'
  return 'info'
}

/** Filtro em memória com a mesma semântica do servidor (usado no modo local e nos testes). */
export function queryAudit(entries: AuditEntry[], query: LogQuery): { items: AuditEntry[]; total: number } {
  const q = (query.q || '').trim().toLowerCase().slice(0, 100)
  const from = query.from ? Date.parse(query.from) : NaN
  const to = query.to ? Date.parse(query.to) : NaN
  const matched = entries.filter((entry) => {
    if (query.category && categoryOf(entry.action) !== query.category) return false
    if (query.action && entry.action !== query.action) return false
    if (query.actor && entry.actorEmail !== query.actor && entry.actorId !== query.actor) return false
    if (q && !`${entry.actorEmail ?? ''} ${entry.actorName ?? ''} ${entry.targetLabel ?? ''} ${entry.detail ?? ''} ${entry.action}`.toLowerCase().includes(q)) return false
    const at = Date.parse(entry.at)
    if (Number.isFinite(from) && at < from) return false
    if (Number.isFinite(to) && at > to) return false
    return true
  }).sort((a, b) => b.at.localeCompare(a.at))
  const offset = Math.max(0, query.offset ?? 0)
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 5000)
  return { items: matched.slice(offset, offset + limit), total: matched.length }
}

export function logsToQueryString(query: LogQuery) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value))
  const text = params.toString()
  return text ? `?${text}` : ''
}

const csvCell = (value: unknown) => {
  let text = String(value ?? '')
  // Evita a injeção de fórmulas ao abrir o CSV numa folha de cálculo.
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function logsToCsv(entries: AuditEntry[]) {
  const header = ['data', 'utilizador', 'nome', 'ação', 'descrição', 'tipo_alvo', 'alvo', 'detalhe', 'ip']
  const rows = entries.map((e) => [e.at, e.actorEmail, e.actorName, e.action, actionLabel(e.action), e.targetType, e.targetLabel, e.detail, e.ip].map(csvCell).join(','))
  return '\ufeff' + [header.join(','), ...rows].join('\r\n')
}

/** Mesmas regras do servidor para palavras-passe de contas criadas pelo administrador. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'A palavra-passe deve ter pelo menos 10 caracteres.'
  if (password.length > 200) return 'A palavra-passe é demasiado longa.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return 'Use maiúsculas, minúsculas e pelo menos um número.'
  return null
}

export function generatePassword(length = 14) {
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789']
  const all = sets.join('')
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (value) => all[value % all.length])
  // Garante uma de cada classe.
  sets.forEach((set, index) => { chars[index] = set[bytes[index] % set.length] })
  const shuffle = new Uint32Array(length)
  crypto.getRandomValues(shuffle)
  for (let index = chars.length - 1; index > 0; index--) { const other = shuffle[index] % (index + 1); [chars[index], chars[other]] = [chars[other], chars[index]] }
  return chars.join('')
}

export const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
