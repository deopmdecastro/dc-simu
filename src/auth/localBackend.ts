import { localCatalogApi } from './localCatalog'
import type { Invite, Project, User } from '../dashboard/Dashboard'
import { buildProjectPreview, type ProjectPreviewData } from '../dashboard/projectPreview'
import type { AdminProject as AdminProjectRow, AdminUser as AdminUserRow, ComponentSetting, LogQuery, SystemInfo } from '../admin/adminTypes'
import { purgeLocalAudit, queryLocalAudit, readLocalAudit, recordLocalAudit } from './auditLocal'

const SESSION_KEY = 'dcsimu:account:session:v1'
const DATA_KEY = 'dcsimu:account:data:v1'

/**
 * Autenticação local deliberadamente limitada às duas identidades aprovadas.
 * Guardamos apenas o SHA-256 das palavras-passe: numa aplicação estática isto
 * reduz exposição acidental, mas não transforma o cliente num servidor seguro.
 */
const ACCOUNTS = [
  {
    id: 'dcsimu-admin',
    name: 'Admin',
    email: 'admin@dcsimu.local',
    role: 'admin',
    passwordHash: 'f8eaa92fb19063c355a4b28ffdc502c61d8a401646a1eacb819cbb964288889a',
  },
  {
    id: 'dcsimu-user',
    name: 'User',
    email: 'user@dcsimu.local',
    role: 'user',
    passwordHash: 'b6b5374f4d4ae57d621a6c831c5a0184ab5b1191b100b3dc85559e60692deda7',
  },
] as const

type Account = (typeof ACCOUNTS)[number]
type StoredProject = {
  id: string
  name: string
  ownerId: string
  memberIds: string[]
  content: unknown
  revision: number
  updatedAt: string
}
type StoredInvitation = {
  id: string
  projectId: string
  userId: string
  senderId: string
  createdAt: string
}
type LocalData = { projects: StoredProject[]; invitations: StoredInvitation[] }

const SETTINGS_KEY = 'dcsimu:components:v1'

function readSettings(): ComponentSetting[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed as ComponentSetting[] : []
  } catch { return [] }
}

function writeSettings(settings: ComponentSetting[]) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) }
  catch { throw new Error('Não foi possível guardar neste navegador.') }
}

function contributionCount() {
  try {
    const parsed = JSON.parse(localStorage.getItem('dcsimu:contrib:meta:v1') || '[]')
    return Array.isArray(parsed) ? parsed.length : 0
  } catch { return 0 }
}

const LOCAL_ONLY = 'Esta operação só está disponível quando a aplicação corre com o servidor (Docker/SQLite). Sem servidor existem apenas as duas contas fixas.'

function publicUser(account: Account): User {
  return { id: account.id, name: account.name, email: account.email, role: account.role }
}

function accountById(id: string) {
  return ACCOUNTS.find((account) => account.id === id)
}

function accountByEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  return ACCOUNTS.find((account) => account.email === normalized)
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function sameText(a: string, b: string) {
  let difference = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index++) difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0)
  return difference === 0
}

export function isFixedAccount(user: Pick<User, 'email' | 'role'>) {
  const account = accountByEmail(user.email)
  return !!account && account.role === user.role
}

/** Função pura o suficiente para os testes: nunca cria uma sessão. */
export async function verifyFixedCredentials(email: string, password: string): Promise<User | null> {
  const account = accountByEmail(email)
  const candidateHash = await sha256(password)
  if (!account || !sameText(candidateHash, account.passwordHash)) return null
  return publicUser(account)
}

function newId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function readData(): LocalData {
  try {
    const parsed = JSON.parse(localStorage.getItem(DATA_KEY) || '{}') as Partial<LocalData>
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      invitations: Array.isArray(parsed.invitations) ? parsed.invitations : [],
    }
  } catch {
    return { projects: [], invitations: [] }
  }
}

function writeData(data: LocalData) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data))
  } catch {
    throw new Error('Não foi possível guardar neste navegador. Verifique o espaço disponível e permita o armazenamento local.')
  }
}

export function getLocalSession(): User | null {
  try {
    const id = localStorage.getItem(SESSION_KEY)
    const account = id ? accountById(id) : undefined
    return account ? publicUser(account) : null
  } catch {
    return null
  }
}

function setLocalSession(user: User | null) {
  try {
    if (user) localStorage.setItem(SESSION_KEY, user.id)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    if (user) throw new Error('O navegador bloqueou a sessão local. Autorize o armazenamento deste site.')
  }
}

/** Sincroniza uma sessão já validada pelo servidor sem guardar credenciais. */
export function rememberFixedSession(user: User) {
  const account = accountById(user.id) || accountByEmail(user.email)
  if (!account || account.role !== user.role) throw new Error('Conta não autorizada')
  const fixedUser = publicUser(account)
  setLocalSession(fixedUser)
  return fixedUser
}

function requireSession() {
  const user = getLocalSession()
  if (!user) throw new Error('Inicie sessão')
  return user
}

function requireAdmin() {
  const user = requireSession()
  if (user.role !== 'admin') throw new Error('Acesso reservado ao administrador')
  return user
}

function roleFor(project: StoredProject, userId: string): 'owner' | 'editor' | null {
  if (project.ownerId === userId) return 'owner'
  return project.memberIds.includes(userId) ? 'editor' : null
}

function accessibleProject(data: LocalData, id: string, userId: string) {
  const project = data.projects.find((entry) => entry.id === id)
  if (!project || !roleFor(project, userId)) throw new Error('Projeto não encontrado ou sem acesso')
  return project
}

const previewCache = new Map<string, ProjectPreviewData>()
function previewFor(project: StoredProject): ProjectPreviewData {
  const key = `${project.id}:${project.revision}:${project.updatedAt}`
  let preview = previewCache.get(key)
  if (!preview) {
    preview = buildProjectPreview(project.content)
    previewCache.set(key, preview)
    if (previewCache.size > 200) previewCache.delete(previewCache.keys().next().value as string)
  }
  return preview
}

function projectSummary(project: StoredProject, userId: string): Project {
  const owner = accountById(project.ownerId)
  return {
    id: project.id,
    name: project.name,
    revision: project.revision,
    owner: owner?.name || 'Conta local',
    role: roleFor(project, userId) || 'editor',
    updated_at: project.updatedAt,
    preview: previewFor(project),
  }
}

/**
 * Pequeno backend no navegador. Mantém o contrato da API usado pelo dashboard,
 * por isso o editor continua igual e funciona num deploy puramente estático.
 */
export async function localApi<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const verb = method.toUpperCase()
  const parts = url.split('?')[0].split('/').filter(Boolean)
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>

  if (url === '/login' && verb === 'POST') {
    const user = await verifyFixedCredentials(String(payload.email || ''), String(payload.password || ''))
    if (!user) {
      recordLocalAudit({ email: String(payload.email || '').trim().toLowerCase() }, 'login.failed', { type: 'user', label: String(payload.email || '').trim().toLowerCase() }, 'Credenciais inválidas')
      throw new Error('Credenciais inválidas')
    }
    setLocalSession(user)
    recordLocalAudit(user, 'login.success', { type: 'user', id: user.id, label: user.email })
    return { user } as T
  }

  if (url === '/register') throw new Error('O registo está desativado. Utilize uma das duas contas autorizadas.')
  if (url === '/me' && verb === 'GET') return { user: requireSession() } as T
  if (url === '/logout' && verb === 'POST') {
    const leaving = requireSession()
    recordLocalAudit(leaving, 'logout', { type: 'user', id: leaving.id, label: leaving.email })
    setLocalSession(null)
    return { ok: true } as T
  }

  const user = requireSession()
  const data = readData()

  if (url === '/projects' && verb === 'GET') {
    return data.projects
      .filter((project) => roleFor(project, user.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((project) => projectSummary(project, user.id)) as T
  }

  if (url === '/projects' && verb === 'POST') {
    const name = String(payload.name || '').trim()
    if (!name || name.length > 120) throw new Error('Nome inválido')
    const project: StoredProject = {
      id: newId(),
      name,
      ownerId: user.id,
      memberIds: [],
      content: payload.content ?? {},
      revision: 0,
      updatedAt: new Date().toISOString(),
    }
    data.projects.push(project)
    writeData(data)
    recordLocalAudit(user, 'project.create', { type: 'project', id: project.id, label: project.name })
    return { id: project.id, name: project.name, revision: project.revision } as T
  }

  if (parts[0] === 'projects' && parts[1] && parts.length === 2 && verb === 'GET') {
    const project = accessibleProject(data, parts[1], user.id)
    return {
      id: project.id,
      name: project.name,
      role: roleFor(project, user.id),
      revision: project.revision,
      content: project.content,
    } as T
  }

  if (parts[0] === 'projects' && parts[1] && parts.length === 2 && verb === 'PUT') {
    const project = accessibleProject(data, parts[1], user.id)
    const revision = Number(payload.revision)
    if (!Number.isInteger(revision)) throw new Error('Revisão obrigatória')
    if (revision !== project.revision) throw new Error('Este projeto foi alterado noutro separador. Reabra-o antes de guardar.')
    project.content = payload.content
    project.revision += 1
    project.updatedAt = new Date().toISOString()
    writeData(data)
    return { revision: project.revision } as T
  }

  if (parts[0] === 'projects' && parts[1] && parts.length === 2 && verb === 'DELETE') {
    const project = accessibleProject(data, parts[1], user.id)
    if (project.ownerId !== user.id) throw new Error('Apenas o proprietário pode eliminar')
    data.projects = data.projects.filter((entry) => entry.id !== project.id)
    data.invitations = data.invitations.filter((entry) => entry.projectId !== project.id)
    writeData(data)
    recordLocalAudit(user, 'project.delete', { type: 'project', id: project.id, label: project.name })
    return { ok: true } as T
  }

  if (parts[0] === 'projects' && parts[1] && parts[2] === 'members' && verb === 'GET') {
    const project = accessibleProject(data, parts[1], user.id)
    const members = project.memberIds
      .map(accountById)
      .filter((account): account is Account => !!account)
      .map((account) => ({ name: account.name, email: account.email }))
    return { members } as T
  }

  if (parts[0] === 'projects' && parts[1] && parts[2] === 'invitations' && verb === 'POST') {
    const project = accessibleProject(data, parts[1], user.id)
    if (project.ownerId !== user.id) throw new Error('Apenas o proprietário pode convidar')
    const target = accountByEmail(String(payload.email || ''))
    if (!target) throw new Error('Só é possível convidar uma das duas contas autorizadas')
    if (target.id === user.id) throw new Error('Já é proprietário')
    if (project.memberIds.includes(target.id)) throw new Error('Utilizador já é membro')
    if (data.invitations.some((invite) => invite.projectId === project.id && invite.userId === target.id)) throw new Error('Convite já pendente')
    data.invitations.push({ id: newId(), projectId: project.id, userId: target.id, senderId: user.id, createdAt: new Date().toISOString() })
    writeData(data)
    recordLocalAudit(user, 'project.invite', { type: 'project', id: project.id, label: project.name }, target.email)
    return { ok: true } as T
  }

  if (url === '/invitations' && verb === 'GET') {
    const invitations: Invite[] = data.invitations
      .filter((invite) => invite.userId === user.id)
      .map((invite) => ({
        id: invite.id,
        project: data.projects.find((project) => project.id === invite.projectId)?.name || 'Projeto',
        sender: accountById(invite.senderId)?.name || 'Utilizador',
      }))
    return invitations as T
  }

  if (parts[0] === 'invitations' && parts[1] && parts[2] && verb === 'POST') {
    const invitation = data.invitations.find((entry) => entry.id === parts[1] && entry.userId === user.id)
    if (!invitation) throw new Error('Convite não encontrado')
    if (!['accept', 'reject'].includes(parts[2])) throw new Error('Ação inválida')
    if (parts[2] === 'accept') {
      const project = data.projects.find((entry) => entry.id === invitation.projectId)
      if (project && !project.memberIds.includes(user.id)) project.memberIds.push(user.id)
    }
    data.invitations = data.invitations.filter((entry) => entry.id !== invitation.id)
    writeData(data)
    recordLocalAudit(user, `invite.${parts[2]}`, { type: 'project', id: invitation.projectId })
    return { ok: true } as T
  }

  if (parts[0] === 'catalog' || parts[0] === 'terminal-profiles' || (parts[0] === 'admin' && (parts[1] === 'catalog' || parts[1] === 'terminal-profiles'))) {
    const catalogUser = requireSession()
    const handled = localCatalogApi(parts, verb, payload, catalogUser)
    if (handled !== undefined) return handled as T
  }

  if (url === '/settings' && verb === 'GET') {
    return { disabledComponents: readSettings().filter((entry) => !entry.enabled).map((entry) => ({ type: entry.type, note: entry.note })) } as T
  }

  if (url === '/admin/users' && verb === 'GET') {
    requireAdmin()
    const audit = readLocalAudit()
    return ACCOUNTS.map((account): AdminUserRow => ({
      ...publicUser(account),
      role: account.role,
      active: true,
      fixed: true,
      projects: data.projects.filter((project) => project.ownerId === account.id).length,
      contributions: 0,
      sessions: getLocalSession()?.id === account.id ? 1 : 0,
      lastLogin: audit.find((entry) => entry.action === 'login.success' && entry.actorId === account.id)?.at,
    })) as T
  }

  if (parts[0] === 'admin' && parts[1] === 'users' && (verb === 'POST' || verb === 'PATCH' || verb === 'DELETE')) {
    requireAdmin()
    throw new Error(LOCAL_ONLY)
  }

  if (url === '/admin/projects' && verb === 'GET') {
    requireAdmin()
    return [...data.projects]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((project): AdminProjectRow => ({
        id: project.id,
        name: project.name,
        owner: accountById(project.ownerId)?.email || 'conta local',
        updated_at: project.updatedAt,
        revision: project.revision,
        size: JSON.stringify(project.content ?? {}).length,
        members: project.memberIds.length,
      })) as T
  }

  if (parts[0] === 'admin' && parts[1] === 'projects' && parts[2] && verb === 'DELETE') {
    const admin = requireAdmin()
    const project = data.projects.find((entry) => entry.id === parts[2])
    if (!project) throw new Error('Projeto não encontrado')
    data.projects = data.projects.filter((entry) => entry.id !== parts[2])
    data.invitations = data.invitations.filter((invite) => invite.projectId !== parts[2])
    writeData(data)
    recordLocalAudit(admin, 'project.delete', { type: 'project', id: project.id, label: project.name }, 'pelo administrador')
    return { ok: true } as T
  }

  if (url === '/admin/components' && verb === 'GET') {
    requireAdmin()
    return readSettings() as T
  }

  if (parts[0] === 'admin' && parts[1] === 'components' && parts[2] && verb === 'PUT') {
    const admin = requireAdmin()
    const type = parts[2]
    if (!/^[A-Za-z0-9]{1,60}$/.test(type)) throw new Error('Tipo de componente inválido')
    const enabled = payload.enabled !== false
    const note = String(payload.note || '').trim().slice(0, 300)
    if (!enabled && !note) throw new Error('Indique o motivo para desativar o componente.')
    const others = readSettings().filter((entry) => entry.type !== type)
    const setting: ComponentSetting = { type, enabled, note: note || undefined, updatedAt: new Date().toISOString(), updatedBy: admin.name }
    writeSettings(enabled ? others : [...others, setting])
    recordLocalAudit(admin, enabled ? 'component.enable' : 'component.disable', { type: 'component', id: type, label: type }, note)
    return setting as T
  }

  if (url.split('?')[0] === '/admin/logs' && verb === 'GET') {
    requireAdmin()
    const query: LogQuery = Object.fromEntries(new URLSearchParams(url.split('?')[1] || '')) as LogQuery
    return queryLocalAudit({ ...query, limit: Number(query.limit) || 50, offset: Number(query.offset) || 0 }) as T
  }

  if (url.split('?')[0] === '/admin/logs' && verb === 'DELETE') {
    const admin = requireAdmin()
    const days = Number(new URLSearchParams(url.split('?')[1] || '').get('olderThanDays'))
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Indique uma antiguidade entre 1 e 3650 dias.')
    const removed = purgeLocalAudit(days)
    recordLocalAudit(admin, 'logs.purge', { type: 'system', label: 'registos' }, `${removed} registo(s) com mais de ${days} dia(s)`)
    return { removed } as T
  }

  if (url === '/admin/system' && verb === 'GET') {
    requireAdmin()
    const size = (key: string) => { try { return (localStorage.getItem(key) || '').length * 2 } catch { return 0 } }
    const info: SystemInfo = {
      backend: 'local',
      databaseBytes: size(DATA_KEY) + size('dcsimu:contrib:meta:v1') + size('dcsimu:audit:v1') + size(SETTINGS_KEY),
      filesBytes: 0,
      projectBytes: data.projects.reduce((sum, project) => sum + JSON.stringify(project.content ?? {}).length, 0),
      counts: {
        users: ACCOUNTS.length, activeUsers: ACCOUNTS.length, projects: data.projects.length, contributions: contributionCount(),
        sessions: 1, logs: readLocalAudit().length, disabledComponents: readSettings().filter((entry) => !entry.enabled).length,
      },
    }
    return info as T
  }

  if (url === '/admin/export' && verb === 'GET') {
    const admin = requireAdmin()
    recordLocalAudit(admin, 'export.data', { type: 'system', label: 'exportação' })
    return {
      exportedAt: new Date().toISOString(),
      users: ACCOUNTS.map(publicUser),
      projects: data.projects.map((project) => ({ id: project.id, name: project.name, revision: project.revision, updated_at: project.updatedAt, owner: accountById(project.ownerId)?.email })),
      disabledComponents: readSettings().filter((entry) => !entry.enabled),
      logs: readLocalAudit(),
    } as T
  }

  throw new Error('Operação local não suportada')
}

export function fixedAccountEmails() {
  return ACCOUNTS.map((account) => account.email)
}
