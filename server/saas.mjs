import {
  canCommentOn, canUse, commentPermissions, effectivePlanId, isPlanId, limitFor, limitMessage, periodEnd,
  readPricing, sanitizeCommentAnchor, sanitizeCommentBody, sanitizePricing, upgradeMessage,
} from '../src/saas/platformCore.mjs'

/**
 * SaaS no servidor: planos/preços (SAAS-PLANS-01), pedidos de mudança de plano e
 * comentários de projeto (PROJ-COMMENTS-01). Os limites de projetos, a partilha e
 * os comentários são verificados aqui — a interface só antecipa o bloqueio.
 * O pagamento não está integrado: um pedido de plano é aprovado pelo administrador.
 */
export function migrateSaas(db) {
  const addColumn = (table, column, ddl) => { if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`) }
  db.exec(`CREATE TABLE IF NOT EXISTS platform_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT);
CREATE TABLE IF NOT EXISTS plan_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,plan TEXT NOT NULL,period TEXT NOT NULL,message TEXT,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,decided_at TEXT,decided_by TEXT,decision_note TEXT);
CREATE INDEX IF NOT EXISTS plan_requests_status ON plan_requests(status,created_at DESC);
CREATE TABLE IF NOT EXISTS project_comments(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,anchor TEXT NOT NULL DEFAULT 'geral',resolved INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,edited_at TEXT);
CREATE INDEX IF NOT EXISTS project_comments_project ON project_comments(project_id,created_at);`)
  addColumn('users', 'plan', "TEXT NOT NULL DEFAULT 'free'")
  addColumn('users', 'plan_expires_at', 'TEXT')
  addColumn('users', 'admin_note', 'TEXT')
  addColumn('component_settings', 'status', 'TEXT')
  addColumn('component_settings', 'min_plan', 'TEXT')
}

export function registerSaas({ app, db, auth, admin, project, fail, id, auditReq }) {
  const pricing = () => {
    const row = db.prepare("SELECT value,updated_at,updated_by FROM platform_settings WHERE key='pricing'").get()
    let stored = null
    try { stored = row ? { ...JSON.parse(row.value), updatedAt: row.updated_at, updatedBy: row.updated_by || undefined } : null } catch { stored = null }
    return readPricing(stored)
  }
  const userPlan = userId => db.prepare('SELECT id,role,plan,plan_expires_at FROM users WHERE id=?').get(userId)
  const subject = row => row && ({ id: row.id, role: row.role, plan: row.plan, planExpiresAt: row.plan_expires_at })

  // ---- Planos e preços ----
  // Público: a landing page mostra os cartões ativos sem sessão iniciada.
  app.get('/api/pricing', (_req, res) => {
    const config = pricing()
    res.json({ ...config, updatedBy: undefined })
  })
  app.put('/api/admin/pricing', auth, admin, (req, res) => {
    let config
    try { config = sanitizePricing(req.body) } catch (error) { return fail(res, 400, error.message) }
    const now = new Date().toISOString()
    const { updatedAt: _a, updatedBy: _b, ...value } = config
    db.prepare("INSERT INTO platform_settings(key,value,updated_at,updated_by) VALUES ('pricing',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by").run(JSON.stringify(value), now, req.user.name)
    const visible = config.plans.filter(p => p.showOnLanding).map(p => p.name).join(', ') || 'nenhum'
    auditReq(req, 'pricing.update', { type: 'system', id: 'pricing', label: 'Planos e preços' }, `${config.showPricing ? 'secção visível' : 'secção oculta'} · cartões: ${visible}`)
    res.json({ ...config, updatedAt: now, updatedBy: req.user.name })
  })

  // ---- Pedidos de plano (checkout preparado, sem pagamento real) ----
  const requestOut = r => ({ id: r.id, userId: r.user_id, userName: r.user_name || undefined, userEmail: r.user_email || undefined, plan: r.plan, period: r.period, message: r.message || undefined, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at || undefined, decidedBy: r.decided_by || undefined, decisionNote: r.decision_note || undefined })
  const REQUEST_SELECT = 'SELECT r.*,u.name user_name,u.email user_email FROM plan_requests r JOIN users u ON u.id=r.user_id'
  app.get('/api/account/plan', auth, (req, res) => {
    const config = pricing(), row = userPlan(req.user.id)
    const pending = db.prepare(REQUEST_SELECT + " WHERE r.user_id=? AND r.status='pending' ORDER BY r.created_at DESC").get(req.user.id)
    res.json({ plan: effectivePlanId(subject(row), config), assigned: row?.plan || 'free', planExpiresAt: row?.plan_expires_at || null, pending: pending ? requestOut(pending) : null, projects: db.prepare('SELECT count(*) n FROM projects WHERE owner_id=?').get(req.user.id).n })
  })
  app.post('/api/account/plan-request', auth, (req, res) => {
    const plan = req.body?.plan, period = req.body?.period === 'yearly' ? 'yearly' : 'monthly'
    if (!isPlanId(plan)) return fail(res, 400, 'Plano inválido.')
    if (req.user.role === 'admin') return fail(res, 400, 'O administrador tem acesso total; não precisa de plano.')
    const config = pricing()
    if (effectivePlanId(subject(userPlan(req.user.id)), config) === plan) return fail(res, 409, 'Já tem este plano.')
    if (db.prepare("SELECT 1 FROM plan_requests WHERE user_id=? AND status='pending'").get(req.user.id)) return fail(res, 409, 'Já tem um pedido de plano pendente.')
    const requestId = id(), message = String(req.body?.message || '').trim().slice(0, 500)
    db.prepare('INSERT INTO plan_requests(id,user_id,plan,period,message,status,created_at) VALUES (?,?,?,?,?,?,?)').run(requestId, req.user.id, plan, period, message || null, 'pending', new Date().toISOString())
    auditReq(req, 'plan.request', { type: 'user', id: req.user.id, label: req.user.email }, `${plan} (${period === 'yearly' ? 'anual' : 'mensal'})`)
    res.status(201).json(requestOut(db.prepare(REQUEST_SELECT + ' WHERE r.id=?').get(requestId)))
  })
  app.delete('/api/account/plan-request', auth, (req, res) => {
    const row = db.prepare("SELECT id FROM plan_requests WHERE user_id=? AND status='pending'").get(req.user.id)
    if (!row) return fail(res, 404, 'Não tem pedidos pendentes.')
    db.prepare("UPDATE plan_requests SET status='cancelled',decided_at=? WHERE id=?").run(new Date().toISOString(), row.id)
    auditReq(req, 'plan.cancel', { type: 'user', id: req.user.id, label: req.user.email })
    res.json({ ok: true })
  })
  app.get('/api/admin/plan-requests', auth, admin, (req, res) => {
    const status = ['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status) ? req.query.status : ''
    res.json(db.prepare(REQUEST_SELECT + (status ? ' WHERE r.status=?' : '') + ' ORDER BY r.created_at DESC LIMIT 200').all(...(status ? [status] : [])).map(requestOut))
  })
  app.post('/api/admin/plan-requests/:id', auth, admin, (req, res) => {
    const row = db.prepare(REQUEST_SELECT + ' WHERE r.id=?').get(req.params.id)
    if (!row) return fail(res, 404, 'Pedido não encontrado.')
    if (row.status !== 'pending') return fail(res, 409, 'Este pedido já foi decidido.')
    const action = req.body?.action
    if (!['approve', 'reject'].includes(action)) return fail(res, 400, 'Ação inválida.')
    const note = String(req.body?.note || '').trim().slice(0, 300), now = new Date().toISOString()
    db.transaction(() => {
      db.prepare('UPDATE plan_requests SET status=?,decided_at=?,decided_by=?,decision_note=? WHERE id=?').run(action === 'approve' ? 'approved' : 'rejected', now, req.user.name, note || null, row.id)
      if (action === 'approve') db.prepare('UPDATE users SET plan=?,plan_expires_at=? WHERE id=?').run(row.plan, row.plan === 'free' ? null : periodEnd(row.period), row.user_id)
    })()
    auditReq(req, action === 'approve' ? 'plan.approve' : 'plan.reject', { type: 'user', id: row.user_id, label: row.user_email }, `${row.plan} (${row.period === 'yearly' ? 'anual' : 'mensal'})${note ? ' · ' + note : ''}`)
    res.json(requestOut(db.prepare(REQUEST_SELECT + ' WHERE r.id=?').get(row.id)))
  })

  // ---- Limites aplicados pelo servidor ----
  const projectLimit = (req, res, next) => {
    const config = pricing(), user = subject(userPlan(req.user.id))
    const owned = db.prepare('SELECT count(*) n FROM projects WHERE owner_id=?').get(req.user.id).n
    const max = limitFor(user, config, 'projects')
    if (max !== null && owned >= max) return fail(res, 402, limitMessage(config, user, 'projects'))
    next()
  }
  const inviteLimit = (req, res, next) => {
    if (req.project?.role !== 'owner') return next()
    const config = pricing(), user = subject(userPlan(req.user.id))
    if (!canUse(user, config, 'sharing')) return fail(res, 402, upgradeMessage(config, 'sharing'))
    const used = db.prepare('SELECT (SELECT count(*) FROM members WHERE project_id=?)+(SELECT count(*) FROM invitations WHERE project_id=?) n').get(req.project.id, req.project.id).n
    const max = limitFor(user, config, 'collaborators')
    if (max !== null && used >= max) return fail(res, 402, limitMessage(config, user, 'collaborators'))
    next()
  }

  // ---- Comentários de projeto ----
  const commentOut = r => ({ id: r.id, projectId: r.project_id, authorId: r.author_id, authorName: r.author_name || 'Conta removida', body: r.body, anchor: r.anchor, resolved: !!r.resolved, createdAt: r.created_at, editedAt: r.edited_at || null })
  const COMMENT_SELECT = 'SELECT c.*,u.name author_name FROM project_comments c LEFT JOIN users u ON u.id=c.author_id'
  const ownerOf = projectId => subject(db.prepare('SELECT u.id,u.role,u.plan,u.plan_expires_at FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.id=?').get(projectId))
  const commentAccess = req => canCommentOn(subject(userPlan(req.user.id)), ownerOf(req.project.id), pricing())

  app.get('/api/projects/:id/comments', auth, project, (req, res) => {
    const items = db.prepare(COMMENT_SELECT + ' WHERE c.project_id=? ORDER BY c.created_at,c.rowid').all(req.project.id).map(commentOut)
    const canWrite = commentAccess(req)
    res.json({ comments: items, canWrite, reason: canWrite ? null : upgradeMessage(pricing(), 'comments') })
  })
  app.post('/api/projects/:id/comments', auth, project, (req, res) => {
    if (!commentAccess(req)) return fail(res, 402, upgradeMessage(pricing(), 'comments'))
    let body
    try { body = sanitizeCommentBody(req.body?.body) } catch (error) { return fail(res, 400, error.message) }
    const recent = db.prepare('SELECT count(*) n FROM project_comments WHERE author_id=? AND created_at>?').get(req.user.id, new Date(Date.now() - 60000).toISOString()).n
    if (recent >= 20) return fail(res, 429, 'Demasiados comentários num minuto. Aguarde um pouco.')
    const commentId = id()
    db.prepare('INSERT INTO project_comments(id,project_id,author_id,body,anchor,resolved,created_at) VALUES (?,?,?,?,?,0,?)').run(commentId, req.project.id, req.user.id, body, sanitizeCommentAnchor(req.body?.anchor), new Date().toISOString())
    auditReq(req, 'comment.create', { type: 'project', id: req.project.id, label: req.project.name }, body.slice(0, 80))
    res.status(201).json(commentOut(db.prepare(COMMENT_SELECT + ' WHERE c.id=?').get(commentId)))
  })
  const loadComment = (req, res) => {
    const row = db.prepare(COMMENT_SELECT + ' WHERE c.id=? AND c.project_id=?').get(req.params.cid, req.project.id)
    if (!row) { fail(res, 404, 'Comentário não encontrado.'); return null }
    return { row, perms: commentPermissions({ authorId: row.author_id }, req.user, req.project.role) }
  }
  app.patch('/api/projects/:id/comments/:cid', auth, project, (req, res) => {
    const found = loadComment(req, res); if (!found) return
    const { row, perms } = found
    if (req.body?.body !== undefined) {
      if (!perms.edit) return fail(res, 403, 'Só o autor pode editar o comentário.')
      let body
      try { body = sanitizeCommentBody(req.body.body) } catch (error) { return fail(res, 400, error.message) }
      db.prepare('UPDATE project_comments SET body=?,edited_at=? WHERE id=?').run(body, new Date().toISOString(), row.id)
      auditReq(req, 'comment.update', { type: 'project', id: req.project.id, label: req.project.name }, body.slice(0, 80))
    }
    if (req.body?.resolved !== undefined) {
      if (!perms.resolve) return fail(res, 403, 'Só o autor ou o proprietário do projeto podem resolver o comentário.')
      db.prepare('UPDATE project_comments SET resolved=? WHERE id=?').run(req.body.resolved ? 1 : 0, row.id)
      if (req.body.resolved) auditReq(req, 'comment.resolve', { type: 'project', id: req.project.id, label: req.project.name })
    }
    res.json(commentOut(db.prepare(COMMENT_SELECT + ' WHERE c.id=?').get(row.id)))
  })
  app.delete('/api/projects/:id/comments/:cid', auth, project, (req, res) => {
    const found = loadComment(req, res); if (!found) return
    if (!found.perms.remove) return fail(res, 403, 'Só o autor ou o proprietário do projeto podem eliminar o comentário.')
    db.prepare('DELETE FROM project_comments WHERE id=?').run(found.row.id)
    auditReq(req, 'comment.delete', { type: 'project', id: req.project.id, label: req.project.name }, found.row.body.slice(0, 80))
    res.json({ ok: true })
  })

  return { pricing, projectLimit, inviteLimit }
}
