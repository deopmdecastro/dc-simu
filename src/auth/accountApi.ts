import type { User } from '../dashboard/Dashboard'
import { fixedAccountEmails, getLocalSession, isFixedAccount, localApi, rememberFixedSession } from './localBackend'

type BackendMode = 'unknown' | 'local' | 'server'
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
    // Hosts estáticos costumam responder 404/405 em JSON próprio. Isso não é
    // uma decisão semântica da nossa API e deve ativar o backend local.
    if ((response.status === 404 || response.status === 405) && typeof error !== 'string') {
      throw new ApiUnavailable('API indisponível')
    }
    throw new Error(readableApiError(error ?? data, `Falha no servidor (${response.status})`))
  }
  return data as T
}

/**
 * Usa a API SQLite quando ela existe (Docker) — é ela que decide quem entra,
 * incluindo as contas criadas pelo administrador. Sem servidor (deploy estático)
 * cai no backend local, limitado às duas contas fixas.
 */
export async function accountApi<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const verb = method.toUpperCase()

  if (url === '/register') return localApi<T>(url, verb, body)

  if (url === '/login' && verb === 'POST') {
    const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {}
    const email = String(payload.email ?? '').trim().toLowerCase()

    // As duas contas autorizadas são deliberadamente locais primeiro. Assim o
    // login funciona num deploy estático mesmo quando /api/login responde com
    // uma página/JSON de erro da plataforma em vez de não responder.
    if (fixedAccountEmails().some((fixedEmail) => fixedEmail === email)) {
      mode = 'local'
      return localApi<T>(url, verb, body)
    }

    try {
      const serverResponse = await serverApi<{ user: User }>(url, verb, body)
      // As contas fixas também ficam lembradas localmente (modo offline); as restantes vivem só no servidor.
      if (isFixedAccount(serverResponse.user)) rememberFixedSession(serverResponse.user)
      mode = 'server'
      return serverResponse as T
    } catch (error) {
      if (!(error instanceof ApiUnavailable)) throw error
      mode = 'local'
      return localApi<T>(url, verb, body)
    }
  }

  if (url === '/me' && verb === 'GET' && mode === 'unknown') {
    try {
      const response = await serverApi<{ user: User }>(url, verb)
      const user = isFixedAccount(response.user) ? rememberFixedSession(response.user) : response.user
      mode = 'server'
      return { user } as T
    } catch (error) {
      // Sessão expirada/terminada no servidor: não a substituir pela sessão local.
      if (!(error instanceof ApiUnavailable)) { mode = 'server'; throw error }
      mode = 'local'
      return localApi<T>(url, verb)
    }
  }

  if (url === '/logout' && verb === 'POST') {
    if (mode === 'server') {
      try { await serverApi(url, verb) } catch { /* a sessão local é encerrada mesmo offline */ }
    }
    mode = 'local'
    if (!getLocalSession()) return { ok: true } as T
    return localApi<T>(url, verb)
  }

  if (mode === 'server') return serverApi<T>(url, verb, body)
  mode = 'local'
  return localApi<T>(url, verb, body)
}

export function activeAccountBackend() {
  return mode
}
