import { statSync, rmSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Rotas de administração: utilizadores, projetos, componentes, registos de
 * auditoria, sessões e estado do sistema. Todas exigem sessão de administrador.
 * As duas contas fixas (seed) são protegidas: não podem ser alteradas nem apagadas.
 */
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
const COMPONENT_TYPE = /^[A-Za-z0-9]{1,60}$/

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 10) return 'A palavra-passe deve ter pelo menos 10 caracteres.'
  if (password.length > 200) return 'A palavra-passe é demasiado longa.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return 'Use maiúsculas, minúsculas e pelo menos um número.'
  return null
}

const CATEGORIES = {
  auth: ["action LIKE 'login.%'", "action='logout'"],
  user: ["action LIKE 'user.%'", "action LIKE 'session.%'"],
  project: ["action LIKE 'project.%'", "action LIKE 'invite.%'"],
  contribution: ["action LIKE 'contribution.%'"],
  component: ["action LIKE 'component.%'"],
  system: ["action LIKE 'logs.%'", "action LIKE 'system.%'", "action LIKE 'export.%'"],
}
const escapeLike = value => value.replace(/[\\%_]/g, m => '\\' + m)

export function registerAdmin({ app, db, auth, admin, fail, id, pwd, audit, auditReq, clientIp, fixedAccounts, contribDir, dataDir }) {
  const fixed = new Set(fixedAccounts.map(a => a.email))
  const startedAt = new Date().toISOString()
  const target = user => ({ type: 'user', id: user.id, label: user.email })
  const userOut = row => ({
    id: row.id, name: row.name, email: row.email, role: row.role, active: !!row.active, fixed: fixed.has(row.email),
    createdAt: row.created_at || undefined, lastLogin: row.last_login || undefined,
    projects: row.projects, contributions: row.contributions, sessions: row.sessions,
  })
  const USER_SELECT = `SELECT u.id,u.email,u.name,u.role,u.active,u.created_at,u.last_login,
    (SELECT count(*) FROM projects p WHERE p.owner_id=u.id) projects,
    (SELECT count(*) FROM contributions c WHERE c.author_id=u.id AND c.file_ready=1) contributions,
    (SELECT count(*) FROM sessions s WHERE s.user_id=u.id AND s.expires>?) sessions FROM users u`
  const loadUser = userId => db.prepare(USER_SELECT + ' WHERE u.id=?').get(Date.now(), userId)
  const revokeSessions = userId => db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId).changes

  // Definições públicas (para o simulador esconder componentes desativados).
  app.get('/api/settings', auth, (_req, res) => {
    const rows = db.prepare('SELECT type,note FROM component_settings WHERE enabled=0 ORDER BY type').all()
    res.json({ disabledComponents: rows.map(r => ({ type: r.type, note: r.note || undefined })) })
  })

  // ---- Utilizadores ----
  app.get('/api/admin/users', auth, admin, (_req, res) => {
    res.json(db.prepare(USER_SELECT + ' ORDER BY u.role DESC,u.created_at,u.email').all(Date.now()).map(userOut))
  })

  app.post('/api/admin/users', auth, admin, (req, res) => {
    const name = String(req.body?.name || '').trim(), email = String(req.body?.email || '').trim().toLowerCase()
    const role = req.body?.role === 'admin' ? 'admin' : 'user', password = req.body?.password
    if (name.length < 2 || name.length > 60) return fail(res, 400, 'O nome deve ter entre 2 e 60 caracteres.')
    if (!EMAIL.test(email) || email.length > 254) return fail(res, 400, 'E-mail inválido.')
    const problem = passwordProblem(password)
    if (problem) return fail(res, 400, problem)
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return fail(res, 409, 'Já existe uma conta com esse e-mail.')
    const userId = id()
    db.prepare('INSERT INTO users(id,email,name,password,role,active,created_at) VALUES (?,?,?,?,?,1,?)').run(userId, email, name, pwd(password), role, new Date().toISOString())
    auditReq(req, 'user.create', { type: 'user', id: userId, label: email }, `papel: ${role}`)
    res.status(201).json(userOut(loadUser(userId)))
  })

  const editable = (req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id)
    if (!row) { fail(res, 404, 'Utilizador não encontrado'); return null }
    if (fixed.has(row.email)) { fail(res, 403, 'As duas contas fixas não podem ser alteradas nem eliminadas.'); return null }
    if (row.id === req.user.id) { fail(res, 400, 'Não pode alterar a sua própria conta por aqui.'); return null }
    return row
  }

  app.patch('/api/admin/users/:id', auth, admin, (req, res) => {
    const row = editable(req, res); if (!row) return
    const body = req.body || {}, changes = []
    let name = row.name, role = row.role, active = row.active
    if (body.name !== undefined) {
      name = String(body.name).trim()
      if (name.length < 2 || name.length > 60) return fail(res, 400, 'O nome deve ter entre 2 e 60 caracteres.')
      if (name !== row.name) changes.push(`nome: ${row.name} → ${name}`)
    }
    if (body.role !== undefined) {
      if (!['admin', 'user'].includes(body.role)) return fail(res, 400, 'Papel inválido.')
      role = body.role
      if (role !== row.role) changes.push(`papel: ${row.role} → ${role}`)
    }
    if (body.active !== undefined) {
      active = body.active ? 1 : 0
      if (active !== row.active) changes.push(active ? 'conta ativada' : 'conta desativada')
    }
    if (!changes.length) return res.json(userOut(loadUser(row.id)))
    db.prepare('UPDATE users SET name=?,role=?,active=? WHERE id=?').run(name, role, active, row.id)
    if (!active) revokeSessions(row.id)
    auditReq(req, active !== row.active ? (active ? 'user.enable' : 'user.disable') : 'user.update', target(row), changes.join('; '))
    res.json(userOut(loadUser(row.id)))
  })

  app.post('/api/admin/users/:id/password', auth, admin, (req, res) => {
    const row = editable(req, res); if (!row) return
    const problem = passwordProblem(req.body?.password)
    if (problem) return fail(res, 400, problem)
    db.prepare('UPDATE users SET password=? WHERE id=?').run(pwd(req.body.password), row.id)
    const closed = revokeSessions(row.id)
    auditReq(req, 'user.password', target(row), `${closed} sessão(ões) terminada(s)`)
    res.json({ ok: true, sessionsClosed: closed })
  })

  app.post('/api/admin/users/:id/revoke-sessions', auth, admin, (req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id)
    if (!row) return fail(res, 404, 'Utilizador não encontrado')
    if (row.id === req.user.id) return fail(res, 400, 'Use «Terminar sessão» para fechar a sua própria sessão.')
    const closed = revokeSessions(row.id)
    auditReq(req, 'session.revoke', target(row), `${closed} sessão(ões)`)
    res.json({ ok: true, sessionsClosed: closed })
  })

  app.delete('/api/admin/users/:id', auth, admin, (req, res) => {
    const row = editable(req, res); if (!row) return
    const projects = db.prepare('SELECT count(*) n FROM projects WHERE owner_id=?').get(row.id).n
    const contributions = db.prepare('SELECT count(*) n FROM contributions WHERE author_id=?').get(row.id).n
    const force = req.query.force === '1'
    if ((projects || contributions) && !force) return fail(res, 409, `Esta conta tem ${projects} projeto(s) e ${contributions} contribuição(ões). Confirme para eliminar também estes dados.`)
    const files = db.prepare('SELECT id FROM contributions WHERE author_id=?').all(row.id)
    db.transaction(() => {
      db.prepare('DELETE FROM projects WHERE owner_id=?').run(row.id)
      db.prepare('DELETE FROM contributions WHERE author_id=?').run(row.id)
      db.prepare('DELETE FROM invitations WHERE user_id=? OR sender_id=?').run(row.id, row.id)
      db.prepare('DELETE FROM members WHERE user_id=?').run(row.id)
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id)
      db.prepare('DELETE FROM users WHERE id=?').run(row.id)
    })()
    for (const file of files) rmSync(resolve(contribDir, file.id), { force: true })
    auditReq(req, 'user.delete', target(row), `${projects} projeto(s) e ${contributions} contribuição(ões) eliminados`)
    res.json({ ok: true })
  })

  // ---- Projetos ----
  app.get('/api/admin/projects', auth, admin, (_req, res) => {
    res.json(db.prepare(`SELECT p.id,p.name,p.updated_at,p.revision,length(p.content) size,u.email owner,
      (SELECT count(*) FROM members m WHERE m.project_id=p.id) members FROM projects p JOIN users u ON u.id=p.owner_id ORDER BY p.updated_at DESC`).all())
  })
  app.delete('/api/admin/projects/:id', auth, admin, (req, res) => {
    const row = db.prepare('SELECT id,name FROM projects WHERE id=?').get(req.params.id)
    if (!row) return fail(res, 404, 'Projeto não encontrado')
    db.prepare('DELETE FROM projects WHERE id=?').run(row.id)
    auditReq(req, 'project.delete', { type: 'project', id: row.id, label: row.name }, 'pelo administrador')
    res.json({ ok: true })
  })

  // ---- Componentes ----
  app.get('/api/admin/components', auth, admin, (_req, res) => {
    res.json(db.prepare('SELECT type,enabled,note,updated_at,updated_by FROM component_settings ORDER BY type').all()
      .map(r => ({ type: r.type, enabled: !!r.enabled, note: r.note || undefined, updatedAt: r.updated_at, updatedBy: r.updated_by || undefined })))
  })
  app.put('/api/admin/components/:type', auth, admin, (req, res) => {
    const type = req.params.type
    if (!COMPONENT_TYPE.test(type)) return fail(res, 400, 'Tipo de componente inválido')
    const enabled = req.body?.enabled === false ? 0 : 1, note = String(req.body?.note || '').trim().slice(0, 300)
    if (!enabled && !note) return fail(res, 400, 'Indique o motivo para desativar o componente.')
    const now = new Date().toISOString()
    if (enabled) db.prepare('DELETE FROM component_settings WHERE type=?').run(type)
    else db.prepare('INSERT INTO component_settings(type,enabled,note,updated_at,updated_by) VALUES (?,0,?,?,?) ON CONFLICT(type) DO UPDATE SET enabled=0,note=excluded.note,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(type, note, now, req.user.name)
    auditReq(req, enabled ? 'component.enable' : 'component.disable', { type: 'component', id: type, label: type }, note)
    res.json({ type, enabled: !!enabled, note: note || undefined, updatedAt: now, updatedBy: req.user.name })
  })

  // ---- Registos de auditoria ----
  const logWhere = query => {
    const where = [], args = []
    const category = String(query.category || '')
    if (CATEGORIES[category]) where.push('(' + CATEGORIES[category].join(' OR ') + ')')
    if (query.action) { where.push('action=?'); args.push(String(query.action)) }
    if (query.actor) { where.push('(actor_email=? OR actor_id=?)'); args.push(String(query.actor), String(query.actor)) }
    const q = String(query.q || '').trim().slice(0, 100)
    if (q) { const like = '%' + escapeLike(q.toLowerCase()) + '%'; where.push("(lower(coalesce(actor_email,'')||' '||coalesce(actor_name,'')||' '||coalesce(target_label,'')||' '||coalesce(detail,'')||' '||action) LIKE ? ESCAPE '\\')"); args.push(like) }
    const from = Date.parse(String(query.from || '')), to = Date.parse(String(query.to || ''))
    if (Number.isFinite(from)) { where.push('at>=?'); args.push(new Date(from).toISOString()) }
    if (Number.isFinite(to)) { where.push('at<=?'); args.push(new Date(to).toISOString()) }
    return { clause: where.length ? ' WHERE ' + where.join(' AND ') : '', args }
  }
  const logOut = r => ({ id: r.id, at: r.at, actorId: r.actor_id || undefined, actorName: r.actor_name || undefined, actorEmail: r.actor_email || undefined, action: r.action, targetType: r.target_type || undefined, targetId: r.target_id || undefined, targetLabel: r.target_label || undefined, detail: r.detail || undefined, ip: r.ip || undefined })
  app.get('/api/admin/logs', auth, admin, (req, res) => {
    const { clause, args } = logWhere(req.query)
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 5000), offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
    const total = db.prepare('SELECT count(*) n FROM audit_log' + clause).get(...args).n
    const items = db.prepare('SELECT * FROM audit_log' + clause + ' ORDER BY at DESC,rowid DESC LIMIT ? OFFSET ?').all(...args, limit, offset).map(logOut)
    res.json({ items, total })
  })
  app.delete('/api/admin/logs', auth, admin, (req, res) => {
    const days = parseInt(req.query.olderThanDays, 10)
    if (!Number.isInteger(days) || days < 1 || days > 3650) return fail(res, 400, 'Indique uma antiguidade entre 1 e 3650 dias.')
    const removed = db.prepare('DELETE FROM audit_log WHERE at<?').run(new Date(Date.now() - days * 86400000).toISOString()).changes
    auditReq(req, 'logs.purge', { type: 'system', label: 'registos' }, `${removed} registo(s) com mais de ${days} dia(s)`)
    res.json({ removed })
  })

  // ---- Sistema ----
  const fileSize = path => { try { return statSync(path).size } catch { return 0 } }
  const version = (() => { try { return JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version } catch { return undefined } })()
  app.get('/api/admin/system', auth, admin, (_req, res) => {
    const count = sql => db.prepare(sql).get().n
    const dbFile = resolve(dataDir, 'dcsimu.sqlite')
    res.json({
      backend: 'server', version, node: process.version, startedAt, uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      databaseBytes: fileSize(dbFile) + fileSize(dbFile + '-wal'),
      filesBytes: db.prepare('SELECT coalesce(sum(size),0) n FROM contributions WHERE file_ready=1').get().n,
      projectBytes: db.prepare('SELECT coalesce(sum(length(content)),0) n FROM projects').get().n,
      counts: {
        users: count('SELECT count(*) n FROM users'), activeUsers: count('SELECT count(*) n FROM users WHERE active=1'),
        projects: count('SELECT count(*) n FROM projects'), contributions: count('SELECT count(*) n FROM contributions WHERE file_ready=1'),
        sessions: db.prepare('SELECT count(*) n FROM sessions WHERE expires>?').get(Date.now()).n, logs: count('SELECT count(*) n FROM audit_log'),
        disabledComponents: count('SELECT count(*) n FROM component_settings WHERE enabled=0'),
      },
    })
  })

  // ---- Exportação (sem palavras-passe nem tokens) ----
  app.get('/api/admin/export', auth, admin, (req, res) => {
    auditReq(req, 'export.data', { type: 'system', label: 'exportação' })
    res.setHeader('Content-Disposition', `attachment; filename="dcsimu-export-${new Date().toISOString().slice(0, 10)}.json"`)
    res.json({
      exportedAt: new Date().toISOString(), version,
      users: db.prepare(USER_SELECT + ' ORDER BY u.email').all(Date.now()).map(userOut),
      projects: db.prepare('SELECT p.id,p.name,p.revision,p.updated_at,u.email owner FROM projects p JOIN users u ON u.id=p.owner_id').all(),
      contributions: db.prepare('SELECT c.id,c.kind,c.title,c.component_type,c.custom_name,c.file_name,c.size,c.status,c.review_note,c.created_at,c.updated_at,u.email author FROM contributions c JOIN users u ON u.id=c.author_id WHERE c.file_ready=1').all(),
      disabledComponents: db.prepare('SELECT type,note,updated_at,updated_by FROM component_settings WHERE enabled=0').all(),
      logs: db.prepare('SELECT * FROM audit_log ORDER BY at DESC LIMIT 5000').all().map(logOut),
    })
  })
}
