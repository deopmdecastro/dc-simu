import type { StoredProfile } from '../catalog/terminalProfiles'
import type { CatalogEntry, CatalogMeta, CatalogVersion, ComponentDefinition } from '../catalog/types'

/** Catálogo oficial no backend local (deploy estático): localStorage, mesma API do servidor. */
type Stored = Omit<CatalogEntry, 'versions'> & { draft: ComponentDefinition; versions: CatalogVersion[] }
const KEY = 'dcsimu:catalog:v1'
const glbKey = (id: string, version: number) => `dcsimu:catalog:glb:${id}:${version}`

function read(): Stored[] {
  try { const parsed = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}
function write(entries: Stored[]) {
  try { localStorage.setItem(KEY, JSON.stringify(entries)) } catch { throw new Error('Sem espaço no navegador para guardar o componente (reduza texturas/modelos GLB).') }
}
const strip = (entry: Stored, withDraft: boolean): CatalogEntry => {
  const { draft, ...rest } = entry
  return withDraft ? { ...rest, draft } : { ...rest }
}
const cleanMeta = (meta: Partial<CatalogMeta> | undefined, fallback?: CatalogMeta): CatalogMeta => {
  const base = fallback ?? { name: 'Novo componente', description: '', category: 'command', group: 'Personalizados', manufacturer: '', reference: '', internalCode: '', tag: 'X', tags: [], properties: [] }
  const merged = { ...base, ...meta } as CatalogMeta
  merged.name = String(merged.name || base.name).trim().slice(0, 80) || base.name
  merged.tags = Array.isArray(merged.tags) ? merged.tags.map((tag) => String(tag).slice(0, 30)).slice(0, 20) : []
  merged.properties = Array.isArray(merged.properties) ? merged.properties.slice(0, 40) : []
  return merged
}

const PROFILES_KEY = 'dcsimu:terminal-profiles:v1'
function readProfiles(): StoredProfile[] {
  try { const parsed = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}

export function localCatalogApi(parts: string[], verb: string, payload: Record<string, unknown>, user: { name: string; role: string }): unknown | undefined {
  const isAdmin = user.role === 'admin'
  // ----- perfis de bornes personalizados -----
  if (parts[0] === 'terminal-profiles' && verb === 'GET') return readProfiles()
  if (parts[0] === 'admin' && parts[1] === 'terminal-profiles') {
    if (!isAdmin) throw new Error('Acesso reservado ao administrador')
    const id = parts[2]
    if (!id || !/^[A-Za-z0-9_-]{3,40}$/.test(id)) throw new Error('Identificador inválido')
    const all = readProfiles()
    if (verb === 'PUT') {
      const specs = Array.isArray(payload.specs) ? (payload.specs as StoredProfile['specs']).slice(0, 200) : []
      if (!specs.length) throw new Error('O perfil precisa de pelo menos um borne')
      const next: StoredProfile = { id, name: String(payload.name ?? '').trim().slice(0, 80) || 'Perfil personalizado', category: String(payload.category ?? '').slice(0, 40), description: String(payload.description ?? '').slice(0, 300), specs, updatedAt: new Date().toISOString(), updatedBy: user.name }
      const index = all.findIndex((entry) => entry.id === id)
      if (index >= 0) all[index] = next; else all.unshift(next)
      try { localStorage.setItem(PROFILES_KEY, JSON.stringify(all)) } catch { throw new Error('Sem espaço no navegador para guardar o perfil.') }
      return next
    }
    if (verb === 'DELETE') {
      if (!all.some((entry) => entry.id === id)) throw new Error('Perfil não encontrado')
      localStorage.setItem(PROFILES_KEY, JSON.stringify(all.filter((entry) => entry.id !== id)))
      return { ok: true }
    }
  }
  // ----- utilizadores -----
  if (parts[0] === 'catalog') {
    if (parts.length === 1 && verb === 'GET') return read().filter((entry) => entry.latestVersion > 0).map((entry) => strip(entry, false))
    if (parts[2] === 'glb' && parts[3] && verb === 'GET') {
      const data = localStorage.getItem(glbKey(parts[1], Number(parts[3])))
      if (!data) throw new Error('Modelo não encontrado')
      return { data }
    }
  }
  if (parts[0] !== 'admin' || parts[1] !== 'catalog') return undefined
  if (!isAdmin) throw new Error('Acesso reservado ao administrador')
  const entries = read()
  if (parts.length === 2 && verb === 'GET') return entries.map((entry) => strip(entry, false))
  const id = parts[2]
  if (!id || !/^[A-Za-z0-9_-]{3,40}$/.test(id)) throw new Error('Identificador inválido')
  const index = entries.findIndex((entry) => entry.id === id)
  if (parts.length === 3 && verb === 'GET') { if (index < 0) throw new Error('Componente não encontrado'); return strip(entries[index], true) }
  if (parts.length === 3 && verb === 'PUT') {
    const now = new Date().toISOString()
    const draft = payload.draft as ComponentDefinition
    if (!draft || !Array.isArray(draft.parts)) throw new Error('Definição inválida')
    const next: Stored = index >= 0
      ? { ...entries[index], meta: cleanMeta(payload.meta as Partial<CatalogMeta>, entries[index].meta), draft, updatedAt: now, updatedBy: user.name }
      : { id, meta: cleanMeta(payload.meta as Partial<CatalogMeta>), draft, status: 'draft', latestVersion: 0, archived: false, updatedAt: now, updatedBy: user.name, versions: [] }
    if (index >= 0) entries[index] = next; else entries.push(next)
    write(entries)
    return strip(next, true)
  }
  if (index < 0) throw new Error('Componente não encontrado')
  if (parts[3] === 'publish' && verb === 'POST') {
    const entry = entries[index]
    const version = entry.latestVersion + 1
    const definition: ComponentDefinition = { ...entry.draft, assets: {} }
    const published: CatalogVersion = {
      version, publishedAt: new Date().toISOString(), publishedBy: user.name, note: String(payload.note || '').slice(0, 300),
      changes: Array.isArray(payload.changes) ? (payload.changes as string[]).map(String).slice(0, 30) : [], definition,
      runtime: payload.runtime as CatalogVersion['runtime'],
    }
    const glb = String(payload.glb || '')
    if (!glb) throw new Error('GLB em falta')
    try { localStorage.setItem(glbKey(id, version), glb) } catch { throw new Error('Sem espaço no navegador para guardar o modelo 3D.') }
    entry.versions = [...entry.versions, published]
    entry.latestVersion = version
    entry.status = 'published'
    entry.archived = false
    entry.updatedAt = published.publishedAt
    write(entries)
    return strip(entry, true)
  }
  if (parts[3] === 'archive' && verb === 'POST') {
    entries[index] = { ...entries[index], archived: payload.archived !== false, updatedAt: new Date().toISOString() }
    write(entries)
    return strip(entries[index], false)
  }
  if (parts.length === 3 && verb === 'DELETE') {
    if (entries[index].latestVersion > 0) throw new Error('Componentes publicados não se eliminam (as versões em uso têm de continuar a abrir). Arquive-o.')
    entries.splice(index, 1)
    write(entries)
    return { ok: true }
  }
  return undefined
}
