import type { User } from '../dashboard/Dashboard'
import { isSupabaseConfigured } from '../supabase/supabaseClient'
import {
  supabaseCreateProject,
  supabaseChangePassword,
  supabaseDeleteProject,
  supabaseFetchProjectMembers,
  supabaseGetCurrentUser,
  supabaseGetInvitations,
  supabaseGetProject,
  supabaseGetProjects,
  supabaseGetSettings,
  supabaseGetAdminProjects,
  supabaseInviteMember,
  supabaseEnsureAccount,
  supabaseLogin,
  supabaseLogout,
  supabaseRegister,
  supabaseReplyInvitation,
  supabaseSetComponent,
  supabaseGetAdminComponents,
  supabaseGetPricing,
  supabaseSetPricing,
  supabaseAccountPlan,
  supabaseRequestPlan,
  supabaseCancelPlanRequest,
  supabaseListPlanRequests,
  supabaseDecidePlanRequest,
  supabaseAdminUsers,
  supabaseAdminUpdateUser,
  supabaseListComments,
  supabaseAddComment,
  supabaseUpdateComment,
  supabaseDeleteComment,
  supabaseRenameProject,
  supabaseUpdateProject,
  supabaseCatalogList,
  supabaseCatalogAdminList,
  supabaseCatalogAdminGet,
  supabaseCatalogSave,
  supabaseCatalogPublish,
  supabaseCatalogArchive,
  supabaseCatalogRemove,
  supabaseCatalogGlbUrl,
  supabaseTerminalProfiles,
  supabaseSaveTerminalProfile,
  supabaseDeleteTerminalProfile,
  supabaseAdminLogs,
  supabaseAdminPurgeLogs,
  supabaseAdminSystem,
  supabaseAdminExport,
} from '../supabase/supabaseBackend'
import { fixedAccountEmails, getLocalSession, isFixedAccount, isFixedAdminEmail, localApi, rememberFixedSession } from './localBackend'

export type BackendMode = 'unknown' | 'local' | 'server' | 'supabase'
let mode: BackendMode = 'unknown'

/** O servidor não respondeu como API (deploy estático ou rede em baixo). */
class ApiUnavailable extends Error {}

/** Nunca deixe um payload desconhecido chegar à coerção de Error: objetos
 * transformam-se em "[object Object]", que não ajuda o utilizador. */
export function readableApiError(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['message', 'detail', 'title', 'error_description']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
  }
  return fallback
}

async function serverApi<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api' + url, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiUnavailable('API indisponível')
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) throw new ApiUnavailable('API indisponível')
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new ApiUnavailable('API indisponível')
  }
  if (!response.ok) {
    const error = data && typeof data === 'object' ? (data as Record<string, unknown>).error : undefined
    if ((response.status === 404 || response.status === 405) && typeof error !== 'string') {
      throw new ApiUnavailable('API indisponível')
    }
    throw new Error(readableApiError(error ?? data, `Falha no servidor (${response.status})`))
  }
  return data as T
}

/** Roteia chamadas de projetos e dados para o Supabase */
async function supabaseApi<T>(url: string, verb: string, body?: unknown): Promise<T> {
  if (url === '/projects') {
    if (verb === 'GET') return (await supabaseGetProjects()) as T
    if (verb === 'POST') {
      const payload = (body ?? {}) as { name: string; content: unknown }
      return (await supabaseCreateProject(payload.name, payload.content)) as T
    }
  }

  const matchMembers = url.match(/^\/projects\/([^/]+)\/members$/)
  if (matchMembers && verb === 'GET') {
    return (await supabaseFetchProjectMembers(matchMembers[1])) as T
  }

  const matchInvites = url.match(/^\/projects\/([^/]+)\/invitations$/)
  if (matchInvites && verb === 'POST') {
    const payload = (body ?? {}) as { email: string }
    return (await supabaseInviteMember(matchInvites[1], payload.email)) as T
  }

  const matchProject = url.match(/^\/projects\/([^/]+)$/)
  if (matchProject) {
    const projectId = matchProject[1]
    if (verb === 'GET') return (await supabaseGetProject(projectId)) as T
    if (verb === 'PUT') {
      const payload = (body ?? {}) as { content?: unknown; revision?: number; name?: string }
      // Mudar só o nome (barra do editor): pedido sem conteúdo.
      if (typeof payload.name === 'string' && payload.content === undefined) return (await supabaseRenameProject(projectId, payload.name)) as T
      return (await supabaseUpdateProject(projectId, payload.content, payload.revision as number)) as T
    }
    if (verb === 'DELETE') return (await supabaseDeleteProject(projectId)) as T
  }

  if (url === '/invitations') {
    if (verb === 'GET') return (await supabaseGetInvitations()) as T
  }

  const matchAccept = url.match(/^\/invitations\/([^/]+)\/accept$/)
  if (matchAccept && verb === 'POST') {
    return (await supabaseReplyInvitation(matchAccept[1], 'accept')) as T
  }

  const matchReject = url.match(/^\/invitations\/([^/]+)$/)
  if (matchReject && verb === 'DELETE') {
    return (await supabaseReplyInvitation(matchReject[1], 'reject')) as T
  }

  // Componentes e configurações
  if (url === '/settings' && verb === 'GET') {
    return (await supabaseGetSettings()) as T
  }

  const matchComp = url.match(/^\/admin\/components\/([^/]+)$/)
  if (matchComp && verb === 'PUT') return (await supabaseSetComponent(matchComp[1], body)) as T
  if (url === '/admin/components' && verb === 'GET') return (await supabaseGetAdminComponents()) as T
  // Catálogo oficial 3D e modelos publicados em Supabase Storage privado.
  if (url === '/catalog' && verb === 'GET') return (await supabaseCatalogList()) as T
  if (url === '/terminal-profiles' && verb === 'GET') return (await supabaseTerminalProfiles()) as T
  const matchCatalogGlb = url.match(/^\/catalog\/([^/]+)\/glb\/(\d+)$/)
  if (matchCatalogGlb && verb === 'GET') return (await supabaseCatalogGlbUrl(matchCatalogGlb[1], Number(matchCatalogGlb[2]))) as T
  if (url === '/admin/catalog' && verb === 'GET') return (await supabaseCatalogAdminList()) as T
  const matchCatalogPublish = url.match(/^\/admin\/catalog\/([^/]+)\/publish$/)
  if (matchCatalogPublish && verb === 'POST') return (await supabaseCatalogPublish(matchCatalogPublish[1], body as Parameters<typeof supabaseCatalogPublish>[1])) as T
  const matchCatalogArchive = url.match(/^\/admin\/catalog\/([^/]+)\/archive$/)
  if (matchCatalogArchive && verb === 'POST') return (await supabaseCatalogArchive(matchCatalogArchive[1], (body as { archived?: boolean } | undefined)?.archived !== false)) as T
  const matchCatalog = url.match(/^\/admin\/catalog\/([^/]+)$/)
  if (matchCatalog) {
    if (verb === 'GET') return (await supabaseCatalogAdminGet(matchCatalog[1])) as T
    if (verb === 'PUT') {
      const payload = body as { meta: import('../catalog/types').CatalogMeta; draft: import('../catalog/types').ComponentDefinition }
      return (await supabaseCatalogSave(matchCatalog[1], payload.meta, payload.draft)) as T
    }
    if (verb === 'DELETE') return (await supabaseCatalogRemove(matchCatalog[1])) as T
  }
  const matchProfile = url.match(/^\/admin\/terminal-profiles\/([^/]+)$/)
  if (matchProfile && verb === 'PUT') return (await supabaseSaveTerminalProfile({ ...(body as Omit<import('../catalog/terminalProfiles').StoredProfile, 'updatedAt' | 'updatedBy'>), id: matchProfile[1] })) as T
  if (matchProfile && verb === 'DELETE') return (await supabaseDeleteTerminalProfile(matchProfile[1])) as T
  // SaaS: planos, pedidos de plano, utilizadores e comentários (SAAS-PLANS-01, PROJ-COMMENTS-01).
  const payload = (body ?? {}) as Record<string, unknown>
  if (url === '/pricing' && verb === 'GET') return (await supabaseGetPricing()) as T
  if (url === '/admin/pricing' && verb === 'PUT') return (await supabaseSetPricing(body)) as T
  if (url === '/account/plan' && verb === 'GET') return (await supabaseAccountPlan()) as T
  if (url === '/account/plan-request' && verb === 'POST') return (await supabaseRequestPlan(payload)) as T
  if (url === '/account/plan-request' && verb === 'DELETE') return (await supabaseCancelPlanRequest()) as T
  if (url.split('?')[0] === '/admin/plan-requests' && verb === 'GET') return (await supabaseListPlanRequests(new URLSearchParams(url.split('?')[1] || '').get('status') || '')) as T
  const matchDecide = url.match(/^\/admin\/plan-requests\/([^/]+)$/)
  if (matchDecide && verb === 'POST') return (await supabaseDecidePlanRequest(matchDecide[1], payload)) as T
  if (url === '/admin/users' && verb === 'GET') return (await supabaseAdminUsers()) as T
  const matchUser = url.match(/^\/admin\/users\/([^/]+)$/)
  if (matchUser && verb === 'PATCH') return (await supabaseAdminUpdateUser(matchUser[1], payload)) as T
  const matchComments = url.match(/^\/projects\/([^/]+)\/comments(?:\/([^/]+))?$/)
  if (matchComments) {
    const [, projectId, commentId] = matchComments
    if (!commentId && verb === 'GET') return (await supabaseListComments(projectId)) as T
    if (!commentId && verb === 'POST') return (await supabaseAddComment(projectId, payload)) as T
    if (commentId && verb === 'PATCH') return (await supabaseUpdateComment(projectId, commentId, payload)) as T
    if (commentId && verb === 'DELETE') return (await supabaseDeleteComment(projectId, commentId)) as T
  }

  if (url === '/admin/projects' && verb === 'GET') {
    return (await supabaseGetAdminProjects()) as T
  }
  if (url.split('?')[0] === '/admin/logs' && verb === 'GET') {
    const params = new URLSearchParams(url.split('?')[1] || '')
    return (await supabaseAdminLogs(Object.fromEntries(params.entries()) as import('../admin/adminTypes').LogQuery)) as T
  }
  if (url.split('?')[0] === '/admin/logs' && verb === 'DELETE') {
    const days = Number(new URLSearchParams(url.split('?')[1] || '').get('olderThanDays'))
    return (await supabaseAdminPurgeLogs(days)) as T
  }
  if (url === '/admin/system' && verb === 'GET') return (await supabaseAdminSystem()) as T
  if (url === '/admin/export' && verb === 'GET') return (await supabaseAdminExport()) as T

  throw new Error(`A operação ${verb} ${url} ainda não está disponível no backend Supabase.`)
}

/**
 * Usa a base de dados Supabase quando configurada, o servidor SQLite em ambiente Docker
 * e cai no backend local offline quando estático.
 */
export async function accountApi<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const verb = method.toUpperCase()

  // 1. Registo de nova conta
  if (url === '/register') {
    if (isSupabaseConfigured()) {
      const payload = (body ?? {}) as { email?: string; password?: string; name?: string }
      if (payload.email && payload.password) {
        mode = 'supabase'
        return (await supabaseRegister(payload.email, payload.password, payload.name || 'Utilizador')) as T
      }
    }
    if (typeof __APP_STATIC_DEPLOY__ !== 'undefined' && __APP_STATIC_DEPLOY__) {
      throw new Error('Supabase não está configurado nesta versão de produção. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente de build.')
    }
    return localApi<T>(url, verb, body)
  }

  // 2. Login
  if (url === '/login' && verb === 'POST') {
    const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const email = String(payload.email ?? '').trim().toLowerCase()
    const password = String(payload.password ?? '')

    // A conta Admin nunca autentica localmente: a sessão tem de vir da base de dados.
    // Em Docker usa SQLite; num deploy estático, usa Supabase quando configurado.
    if (isFixedAdminEmail(email)) {
      const staticDeploy = typeof __APP_STATIC_DEPLOY__ !== 'undefined' && __APP_STATIC_DEPLOY__
      if (!staticDeploy) {
        try {
          const serverResponse = await serverApi<{ user: User }>(url, verb, body)
          mode = 'server'
          return serverResponse as T
        } catch (error) {
          // Credenciais rejeitadas não podem ser mascaradas por um login local.
          if (!(error instanceof ApiUnavailable)) throw error
          if (!isSupabaseConfigured()) throw new Error('A conta Admin exige uma ligação ativa à base de dados (Docker/SQLite ou Supabase).')
        }
      }
      if (isSupabaseConfigured()) {
        const result = await supabaseLogin(email, password)
        mode = 'supabase'
        return result as T
      }
      throw new Error('A conta Admin exige uma ligação ativa à base de dados (Docker/SQLite ou Supabase).')
    }

    const staticDeploy = typeof __APP_STATIC_DEPLOY__ !== 'undefined' && __APP_STATIC_DEPLOY__
    if (staticDeploy) {
      if (!isSupabaseConfigured()) throw new Error('Supabase não está configurado nesta versão de produção. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente de build.')
      const result = await supabaseLogin(email, password)
      mode = 'supabase'
      return result as T
    }

    // As contas fixas usam primeiro a base de dados em Docker, para ler e alterar
    // os mesmos elementos e definições em todos os dispositivos. User ainda pode
    // trabalhar localmente se não existir backend; Admin nunca pode.
    if (fixedAccountEmails().some((fixedEmail) => fixedEmail === email)) {
      if (!staticDeploy) {
        try {
          const serverResponse = await serverApi<{ user: User }>(url, verb, body)
          if (isFixedAccount(serverResponse.user) && serverResponse.user.role !== 'admin') rememberFixedSession(serverResponse.user)
          mode = 'server'
          return serverResponse as T
        } catch (error) {
          if (!(error instanceof ApiUnavailable)) throw error
        }
      }
      mode = 'local'
      // A palavra-passe é sempre validada localmente (funciona offline)…
      const localResult = await localApi<{ user: User }>(url, verb, body)
      // …e, com o Supabase configurado, a conta fica também guardada na base
      // de dados e os projetos passam a ser gravados lá.
      if (isSupabaseConfigured()) {
        const remote = await supabaseEnsureAccount(email, password, localResult.user.name)
        if (remote) {
          mode = 'supabase'
          return remote as T
        }
      }
      return localResult as T
    }

    // Se o Supabase estiver configurado, tenta login pelo Supabase
    if (isSupabaseConfigured()) {
      try {
        const result = await supabaseLogin(email, password)
        mode = 'supabase'
        return result as T
      } catch (err) {
        if (__APP_STATIC_DEPLOY__) throw err
        // Tenta fallback para o servidor SQLite se existir
        try {
          const serverResponse = await serverApi<{ user: User }>(url, verb, body)
          mode = 'server'
          return serverResponse as T
        } catch {
          throw err
        }
      }
    }

    if (typeof __APP_STATIC_DEPLOY__ !== 'undefined' && __APP_STATIC_DEPLOY__) {
      mode = 'local'
      return localApi<T>(url, verb, body)
    }

    try {
      const serverResponse = await serverApi<{ user: User }>(url, verb, body)
      if (isFixedAccount(serverResponse.user) && serverResponse.user.role !== 'admin') rememberFixedSession(serverResponse.user)
      mode = 'server'
      return serverResponse as T
    } catch (error) {
      if (!(error instanceof ApiUnavailable)) throw error
      mode = 'local'
      return localApi<T>(url, verb, body)
    }
  }

  // 3. Verificação de sessão (/me)
  if (url === '/me' && verb === 'GET' && mode === 'unknown') {
    if (isSupabaseConfigured()) {
      const sbUser = await supabaseGetCurrentUser()
      if (sbUser) {
        mode = 'supabase'
        return { user: sbUser } as T
      }
    }

    if (typeof __APP_STATIC_DEPLOY__ !== 'undefined' && __APP_STATIC_DEPLOY__) {
      throw new Error('Não foi encontrada uma sessão Supabase. Inicie sessão com uma conta registada na base de dados.')
    }

    try {
      const response = await serverApi<{ user: User }>(url, verb)
      const user = isFixedAccount(response.user) && response.user.role !== 'admin' ? rememberFixedSession(response.user) : response.user
      mode = 'server'
      return { user } as T
    } catch (error) {
      if (!(error instanceof ApiUnavailable)) {
        mode = 'server'
        throw error
      }
      if (getLocalSession()?.role === 'admin') throw new Error('A sessão Admin exige uma ligação ativa à base de dados. Confirme que o servidor Docker está disponível.')
      mode = 'local'
      return localApi<T>(url, verb)
    }
  }

  // 4. Logout
  if (url === '/logout' && verb === 'POST') {
    if (mode === 'supabase') {
      await supabaseLogout()
    }
    if (mode === 'server') {
      try {
        await serverApi(url, verb)
      } catch {
        /* a sessão local é encerrada mesmo offline */
      }
    }
    mode = 'local'
    if (!getLocalSession()) return { ok: true } as T
    return localApi<T>(url, verb)
  }

  // 5. Alteração da palavra-passe, confirmada pelo servidor/Supabase (nunca no modo local estático).
  if (url === '/account/password' && verb === 'POST') {
    if (mode === 'server') return serverApi<T>(url, verb, body)
    if (mode === 'supabase') {
      const payload = (body ?? {}) as { newPassword?: string }
      await supabaseChangePassword(String(payload.newPassword ?? ''))
      return { ok: true, sessionsClosed: 0 } as T
    }
    throw new Error('Alterar a palavra-passe exige uma sessão de servidor ou Supabase.')
  }

  // 6. Restantes rotas para projetos e dados
  if (mode === 'supabase' || (isSupabaseConfigured() && mode !== 'server')) {
    return supabaseApi<T>(url, verb, body)
  }

  if (mode === 'server') return serverApi<T>(url, verb, body)
  if (typeof __APP_STATIC_DEPLOY__ !== 'undefined' && __APP_STATIC_DEPLOY__) {
    throw new Error('Supabase é obrigatório em produção. Confirme VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY e inicie sessão novamente.')
  }
  if (mode === 'local' && getLocalSession()?.role === 'admin') {
    throw new Error('A conta Admin não pode usar o modo local. Inicie sessão através da base de dados.')
  }
  mode = 'local'
  return localApi<T>(url, verb, body)
}

export function activeAccountBackend(): BackendMode {
  return mode
}
