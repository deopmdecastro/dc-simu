import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Catálogo oficial de componentes 3D (criados no Editor 3D do Admin).
 * - `catalog_components`: metadados + rascunho (inclui assets) + estado
 * - `catalog_versions`: versões publicadas, imutáveis (definição sem assets + runtime)
 * - GLB assado por versão em <data>/catalog/<id>-<versão>.glb
 */
const ID = /^[A-Za-z0-9_-]{3,40}$/
const MAX_GLB_BASE64 = 6_000_000

export function registerCatalog({ app, db, auth, admin, fail, auditReq, dataDir }) {
  const glbDir = resolve(dataDir, 'catalog')
  mkdirSync(glbDir, { recursive: true })
  db.exec(`CREATE TABLE IF NOT EXISTS catalog_components(id TEXT PRIMARY KEY,meta TEXT NOT NULL,draft TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',latest_version INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT);
CREATE TABLE IF NOT EXISTS catalog_versions(component_id TEXT NOT NULL,version INTEGER NOT NULL,note TEXT,changes TEXT,definition TEXT NOT NULL,runtime TEXT NOT NULL,published_at TEXT NOT NULL,published_by TEXT,PRIMARY KEY(component_id,version));`)

  // Perfis de bornes personalizados (biblioteca de bornes): leitura para todos, escrita só do admin.
  db.exec(`CREATE TABLE IF NOT EXISTS terminal_profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT)`)
  const PROFILE_ID = /^[A-Za-z0-9_-]{3,40}$/
  const cleanProfile = (id, body) => {
    const specs = Array.isArray(body?.specs) ? body.specs.slice(0, 200) : null
    if (!specs || !specs.length) return null
    const text = (value, max) => String(value ?? '').trim().slice(0, max)
    return {
      id, name: text(body.name, 80) || 'Perfil personalizado', category: text(body.category, 40), description: text(body.description, 300),
      specs: specs.map(item => ({
        label: text(item.label, 12) || '?', name: text(item.name, 60), fn: text(item.fn, 16), kind: text(item.kind, 20) || 'io', polarity: text(item.polarity, 12) || 'none',
        electricalClass: text(item.electricalClass, 12) || 'other', direction: text(item.direction, 4) || 'io', terminalType: text(item.terminalType, 16) || 'screw',
        color: /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : '#cbd5e1', contact: ['NO', 'NC', 'COM'].includes(item.contact) ? item.contact : undefined,
        group: item.group ? text(item.group, 40) : undefined, face: ['front', 'back', 'left', 'right', 'top', 'bottom'].includes(item.face) ? item.face : 'front', row: item.row ? text(item.row, 20) : undefined,
      })),
    }
  }
  const profileOut = row => ({ ...JSON.parse(row.data), updatedAt: row.updated_at, updatedBy: row.updated_by || undefined })
  app.get('/api/terminal-profiles', auth, (_req, res) => {
    res.json(db.prepare('SELECT * FROM terminal_profiles ORDER BY updated_at DESC').all().map(profileOut))
  })
  app.put('/api/admin/terminal-profiles/:id', auth, admin, (req, res) => {
    const { id } = req.params
    if (!PROFILE_ID.test(id)) return fail(res, 400, 'Identificador inválido')
    const data = cleanProfile(id, req.body)
    if (!data) return fail(res, 400, 'O perfil precisa de pelo menos um borne')
    const now = new Date().toISOString()
    db.prepare('INSERT INTO terminal_profiles(id,data,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(id, JSON.stringify(data), now, req.user.name)
    auditReq(req, 'component.profile.save', { type: 'component', id, label: data.name })
    res.json(profileOut(db.prepare('SELECT * FROM terminal_profiles WHERE id=?').get(id)))
  })
  app.delete('/api/admin/terminal-profiles/:id', auth, admin, (req, res) => {
    const { id } = req.params
    const row = PROFILE_ID.test(id) && db.prepare('SELECT * FROM terminal_profiles WHERE id=?').get(id)
    if (!row) return fail(res, 404, 'Perfil não encontrado')
    db.prepare('DELETE FROM terminal_profiles WHERE id=?').run(id)
    auditReq(req, 'component.profile.delete', { type: 'component', id, label: JSON.parse(row.data).name })
    res.json({ ok: true })
  })

  const versionsOf = componentId => db.prepare('SELECT * FROM catalog_versions WHERE component_id=? ORDER BY version').all(componentId).map(row => ({
    version: row.version, publishedAt: row.published_at, publishedBy: row.published_by || undefined, note: row.note || '',
    changes: JSON.parse(row.changes || '[]'), definition: JSON.parse(row.definition), runtime: JSON.parse(row.runtime),
  }))
  const out = (row, withDraft) => ({
    id: row.id, meta: JSON.parse(row.meta), status: row.status, latestVersion: row.latest_version, archived: !!row.archived,
    updatedAt: row.updated_at, updatedBy: row.updated_by || undefined, versions: versionsOf(row.id),
    ...(withDraft ? { draft: JSON.parse(row.draft) } : {}),
  })
  const glbPath = (componentId, version) => resolve(glbDir, `${componentId}-${version}.glb`)

  app.get('/api/catalog', auth, (_req, res) => {
    res.json(db.prepare('SELECT * FROM catalog_components WHERE latest_version>0 ORDER BY updated_at DESC').all().map(row => out(row, false)))
  })
  app.get('/api/catalog/:id/glb/:version', auth, (req, res) => {
    const { id, version } = req.params
    if (!ID.test(id) || !/^\d{1,4}$/.test(version)) return fail(res, 400, 'Pedido inválido')
    const file = glbPath(id, version)
    if (!existsSync(file)) return fail(res, 404, 'Modelo não encontrado')
    res.setHeader('Content-Type', 'model/gltf-binary')
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    res.send(readFileSync(file))
  })

  app.get('/api/admin/catalog', auth, admin, (_req, res) => {
    res.json(db.prepare('SELECT * FROM catalog_components ORDER BY updated_at DESC').all().map(row => out(row, false)))
  })
  app.get('/api/admin/catalog/:id', auth, admin, (req, res) => {
    const row = ID.test(req.params.id) && db.prepare('SELECT * FROM catalog_components WHERE id=?').get(req.params.id)
    if (!row) return fail(res, 404, 'Componente não encontrado')
    res.json(out(row, true))
  })
  app.put('/api/admin/catalog/:id', auth, admin, (req, res) => {
    const { id } = req.params
    if (!ID.test(id)) return fail(res, 400, 'Identificador inválido')
    const meta = req.body?.meta, draft = req.body?.draft
    if (!meta || typeof meta.name !== 'string' || !draft || !Array.isArray(draft.parts)) return fail(res, 400, 'Definição inválida')
    meta.name = meta.name.trim().slice(0, 80) || 'Novo componente'
    // capa: só imagens em data URL e de tamanho razoável
    if (typeof meta.thumbnail !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(meta.thumbnail) || meta.thumbnail.length > 300000) delete meta.thumbnail
    if (typeof meta.coverLocked !== 'boolean') delete meta.coverLocked
    const now = new Date().toISOString()
    const exists = db.prepare('SELECT 1 FROM catalog_components WHERE id=?').get(id)
    if (exists) db.prepare('UPDATE catalog_components SET meta=?,draft=?,updated_at=?,updated_by=? WHERE id=?').run(JSON.stringify(meta), JSON.stringify(draft), now, req.user.name, id)
    else db.prepare('INSERT INTO catalog_components(id,meta,draft,status,latest_version,archived,created_at,updated_at,updated_by) VALUES (?,?,?,?,0,0,?,?,?)').run(id, JSON.stringify(meta), JSON.stringify(draft), 'draft', now, now, req.user.name)
    auditReq(req, exists ? 'component.catalog.save' : 'component.catalog.create', { type: 'component', id, label: meta.name })
    res.json(out(db.prepare('SELECT * FROM catalog_components WHERE id=?').get(id), true))
  })
  app.post('/api/admin/catalog/:id/publish', auth, admin, (req, res) => {
    const { id } = req.params
    const row = ID.test(id) && db.prepare('SELECT * FROM catalog_components WHERE id=?').get(id)
    if (!row) return fail(res, 404, 'Componente não encontrado')
    const glb = String(req.body?.glb || '')
    if (!glb) return fail(res, 400, 'Modelo 3D em falta')
    if (glb.length > MAX_GLB_BASE64) return fail(res, 413, 'O modelo 3D é demasiado grande (máx. ≈ 4,5 MB).')
    const runtime = req.body?.runtime
    if (!runtime || !Array.isArray(runtime.terminals)) return fail(res, 400, 'Dados de execução em falta')
    const version = row.latest_version + 1
    const now = new Date().toISOString()
    const draft = JSON.parse(row.draft)
    draft.assets = {}
    writeFileSync(glbPath(id, version), Buffer.from(glb, 'base64'))
    db.prepare('INSERT INTO catalog_versions(component_id,version,note,changes,definition,runtime,published_at,published_by) VALUES (?,?,?,?,?,?,?,?)').run(
      id, version, String(req.body?.note || '').slice(0, 300), JSON.stringify(Array.isArray(req.body?.changes) ? req.body.changes.map(String).slice(0, 30) : []),
      JSON.stringify(draft), JSON.stringify(runtime), now, req.user.name)
    db.prepare("UPDATE catalog_components SET latest_version=?,status='published',archived=0,updated_at=?,updated_by=? WHERE id=?").run(version, now, req.user.name, id)
    auditReq(req, 'component.catalog.publish', { type: 'component', id, label: JSON.parse(row.meta).name }, `v${version}`)
    res.json(out(db.prepare('SELECT * FROM catalog_components WHERE id=?').get(id), true))
  })
  app.post('/api/admin/catalog/:id/archive', auth, admin, (req, res) => {
    const { id } = req.params
    const row = ID.test(id) && db.prepare('SELECT * FROM catalog_components WHERE id=?').get(id)
    if (!row) return fail(res, 404, 'Componente não encontrado')
    const archived = req.body?.archived === false ? 0 : 1
    db.prepare('UPDATE catalog_components SET archived=?,updated_at=? WHERE id=?').run(archived, new Date().toISOString(), id)
    auditReq(req, archived ? 'component.catalog.archive' : 'component.catalog.restore', { type: 'component', id, label: JSON.parse(row.meta).name })
    res.json(out(db.prepare('SELECT * FROM catalog_components WHERE id=?').get(id), false))
  })
  app.delete('/api/admin/catalog/:id', auth, admin, (req, res) => {
    const { id } = req.params
    const row = ID.test(id) && db.prepare('SELECT * FROM catalog_components WHERE id=?').get(id)
    if (!row) return fail(res, 404, 'Componente não encontrado')
    if (row.latest_version > 0) return fail(res, 409, 'Componentes publicados não se eliminam (as versões em uso têm de continuar a abrir). Arquive-o.')
    db.prepare('DELETE FROM catalog_components WHERE id=?').run(id)
    auditReq(req, 'component.catalog.delete', { type: 'component', id, label: JSON.parse(row.meta).name })
    res.json({ ok: true })
  })
}
