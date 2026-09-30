import { queryAudit, type AuditEntry, type LogQuery } from '../admin/adminTypes'

const KEY = 'dcsimu:audit:v1'
const MAX_ENTRIES = 1000

type Actor = { id?: string; name?: string; email?: string } | null | undefined
type Target = { type?: string; id?: string; label?: string }

export function readLocalAudit(): AuditEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(parsed) ? parsed as AuditEntry[] : []
  } catch { return [] }
}

function write(entries: AuditEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES))) } catch { /* registo nunca bloqueia a ação */ }
}

const newId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)

/** Regista um evento no navegador (modo sem servidor). Guarda as últimas 1000 entradas. */
export function recordLocalAudit(actor: Actor, action: string, target: Target = {}, detail = '') {
  const entry: AuditEntry = {
    id: newId(), at: new Date().toISOString(), actorId: actor?.id, actorName: actor?.name, actorEmail: actor?.email,
    action, targetType: target.type, targetId: target.id, targetLabel: target.label, detail: detail.slice(0, 500) || undefined,
  }
  write([entry, ...readLocalAudit()])
  return entry
}

export function queryLocalAudit(query: LogQuery) {
  return queryAudit(readLocalAudit(), query)
}

export function purgeLocalAudit(olderThanDays: number) {
  const limit = Date.now() - olderThanDays * 86_400_000
  const all = readLocalAudit()
  const kept = all.filter((entry) => Date.parse(entry.at) >= limit)
  write(kept)
  return all.length - kept.length
}
