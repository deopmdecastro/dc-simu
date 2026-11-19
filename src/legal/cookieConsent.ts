/** Consentimento de cookies / armazenamento local (RGPD). */

export type CookieConsent = {
  /** Aceitou a política (essenciais + preferências de interface). */
  accepted: boolean
  /** Data ISO da decisão. */
  at: string
  /** Versão do texto da política aceite. */
  version: number
}

/** Subir quando o texto da política de cookies mudar de forma material. */
export const COOKIE_POLICY_VERSION = 1

const STORAGE_KEY = 'dcsimu:cookie-consent:v1'

export function readCookieConsent(): CookieConsent | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CookieConsent>
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.accepted !== true) return null
    if (typeof parsed.at !== 'string' || typeof parsed.version !== 'number') return null
    return { accepted: true, at: parsed.at, version: parsed.version }
  } catch {
    return null
  }
}

/** True quando já existe aceitação da versão atual da política. */
export function hasAcceptedCookies(): boolean {
  const c = readCookieConsent()
  return !!c && c.version >= COOKIE_POLICY_VERSION
}

export function acceptCookies(): CookieConsent {
  const value: CookieConsent = {
    accepted: true,
    at: new Date().toISOString(),
    version: COOKIE_POLICY_VERSION,
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    }
  } catch { /* private mode / quota */ }
  return value
}

/** Revoga o consentimento (o utilizador pode voltar a ver o banner). */
export function revokeCookieConsent(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}
