import type { User } from '../dashboard/Dashboard'
import { getLocalSession, localApi, rememberFixedSession, verifyFixedCredentials } from './localBackend'

type BackendMode = 'unknown' | 'local' | 'server'
let mode: BackendMode = 'unknown'

async function serverApi<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) throw new Error('API indisponível')
  const data = await response.json() as { error?: string }
  if (!response.ok) throw new Error(data.error || 'Falha no servidor')
  return data as T
}

/**
 * Usa a API SQLite quando ela existe (Docker) e o backend local em deployments
 * estáticos. A validação cliente ocorre primeiro, por isso nem um servidor
 * antigo pode introduzir uma terceira identidade pela interface atual.
 */
export async function accountApi<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const verb = method.toUpperCase()

  if (url === '/register') return localApi<T>(url, verb, body)

  if (url === '/login' && verb === 'POST') {
    const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const approved = await verifyFixedCredentials(String(payload.email || ''), String(payload.password || ''))
    if (!approved) throw new Error('Credenciais inválidas')

    // Cria sempre o marcador local; não contém palavra-passe nem token.
    const localResponse = await localApi<T>(url, verb, body)
    try {
      const serverResponse = await serverApi<{ user: User }>(url, verb, body)
      rememberFixedSession(serverResponse.user)
      mode = 'server'
      return serverResponse as T
    } catch {
      mode = 'local'
      return localResponse
    }
  }

  if (url === '/me' && verb === 'GET' && mode === 'unknown') {
    try {
      const response = await serverApi<{ user: User }>(url, verb)
      const user = rememberFixedSession(response.user)
      mode = 'server'
      return { user } as T
    } catch {
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
