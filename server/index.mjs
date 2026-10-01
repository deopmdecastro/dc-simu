import express from 'express'
import Database from 'better-sqlite3'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { registerAdmin } from './admin.mjs'

const dir = process.env.DATA_DIR || './data'
mkdirSync(dir, { recursive: true })
const db = new Database(resolve(dir, 'dcsimu.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES users(id),content TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(project_id,user_id));
CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),sender_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,UNIQUE(project_id,user_id));`)
db.exec(`CREATE TABLE IF NOT EXISTS contributions(id TEXT PRIMARY KEY,kind TEXT NOT NULL,title TEXT NOT NULL,component_type TEXT,custom_name TEXT,description TEXT NOT NULL DEFAULT '',file_name TEXT NOT NULL,size INTEGER NOT NULL DEFAULT 0,author_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL DEFAULT 'pending',file_ready INTEGER NOT NULL DEFAULT 0,glb TEXT,review_note TEXT,reviewed_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`)
db.exec(`CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY,at TEXT NOT NULL,actor_id TEXT,actor_name TEXT,actor_email TEXT,action TEXT NOT NULL,target_type TEXT,target_id TEXT,target_label TEXT,detail TEXT,ip TEXT);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at DESC);
CREATE TABLE IF NOT EXISTS component_settings(type TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,note TEXT,updated_at TEXT NOT NULL,updated_by TEXT);`)
const contribDir = resolve(dir, 'contrib')
mkdirSync(contribDir, { recursive: true })
const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '8mb' }))
const id = () => randomBytes(16).toString('hex')
const hash = s => createHash('sha256').update(s).digest('hex')
const pwd = p => { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(p, salt, 64).toString('hex') }
const verify = (p, saved) => { const [salt, expected] = saved.split(':'); return timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(expected, 'hex')) }
// Migração não destrutiva das bases existentes.
const addColumn = (table, column, ddl) => { if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`) }
addColumn('users', 'role', "TEXT NOT NULL DEFAULT 'user'")
// Contas anteriores ao painel de utilizadores estavam bloqueadas (só as duas fixas entravam):
// mantêm-se desativadas até o administrador as reativar.
const hadActive = db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'active')
addColumn('users', 'active', 'INTEGER NOT NULL DEFAULT 1')
if (!hadActive) db.exec('UPDATE users SET active=0')
addColumn('users', 'created_at', 'TEXT')
addColumn('users', 'last_login', 'TEXT')
addColumn('sessions', 'created_at', 'TEXT')
addColumn('sessions', 'last_seen', 'TEXT')
addColumn('sessions', 'ip', 'TEXT')
addColumn('sessions', 'agent', 'TEXT')
const clientIp = req => String(req.get('x-forwarded-for') || '').split(',')[0].trim() || req.socket?.remoteAddress || ''
/** Registo de auditoria: nunca deve impedir a operação que está a registar. */
const audit = (actor, action, target = {}, detail = '', ip = '') => {
  try { db.prepare('INSERT INTO audit_log(id,at,actor_id,actor_name,actor_email,action,target_type,target_id,target_label,detail,ip) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id(), new Date().toISOString(), actor?.id ?? null, actor?.name ?? null, actor?.email ?? null, action, target.type ?? null, target.id ?? null, target.label ?? null, String(detail || '').slice(0, 500), ip) } catch (error) { console.error('audit', error) }
}
const auditReq = (req, action, target, detail) => audit(req.user, action, target, detail, clientIp(req))
const fixedAccounts = [
  { email: 'admin@dcsimu.local', name: 'Admin', password: 'AdminDcsimu2026!', role: 'admin' },
  { email: 'user@dcsimu.local', name: 'User', password: 'UserDcsimu2026!', role: 'user' },
]
const seedFixedAccounts = db.transaction(() => {
  for (const account of fixedAccounts) {
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(account.email)
    if (existing) db.prepare('UPDATE users SET name=?,password=?,role=?,active=1,created_at=COALESCE(created_at,?) WHERE id=?').run(account.name,pwd(account.password),account.role,new Date().toISOString(),existing.id)
    else db.prepare('INSERT INTO users(id,email,name,password,role,active,created_at) VALUES (?,?,?,?,?,1,?)').run(id(),account.email,account.name,pwd(account.password),account.role,new Date().toISOString())
  }
})
seedFixedAccounts()
const fail = (res, code, message) => res.status(code).json({ error: message })
const cookie = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('dc_session='))?.slice(11)
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin
    if (origin && origin !== process.env.PUBLIC_ORIGIN && (() => { try { return new URL(origin).host !== req.get('host') } catch { return true } })()) return fail(res, 403, 'Origem inválida')
  }
  const token = cookie(req)
  const sessionUser = token ? db.prepare('SELECT users.id,users.email,users.name,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>? AND users.active=1').get(hash(token), Date.now()) : null
  req.user = sessionUser || null
  if (sessionUser) { const now = Date.now(), seen = db.prepare('SELECT last_seen FROM sessions WHERE token=?').get(hash(token))?.last_seen; if (!seen || now - Date.parse(seen) > 60000) db.prepare('UPDATE sessions SET last_seen=? WHERE token=?').run(new Date(now).toISOString(), hash(token)) }
  next()
})
const auth = (req,res,next) => req.user ? next() : fail(res,401,'Inicie sessão')
const admin = (req,res,next) => req.user.role === 'admin' ? next() : fail(res,403,'Acesso reservado ao administrador')
const project = (req,res,next) => {
  const p = db.prepare(`SELECT p.*, CASE WHEN p.owner_id=? THEN 'owner' ELSE 'editor' END role FROM projects p WHERE p.id=? AND (p.owner_id=? OR EXISTS (SELECT 1 FROM members m WHERE m.project_id=p.id AND m.user_id=?))`).get(req.user.id,req.params.id,req.user.id,req.user.id)
  if (!p) return fail(res,404,'Projeto não encontrado ou sem acesso')
  req.project=p; next()
}
app.post('/api/register',(_req,res) => fail(res,403,'O registo está desativado. Utilize uma das duas contas autorizadas.'))
const attempts = new Map()
const MAX_ATTEMPTS = 6, WINDOW_MS = 10 * 60_000
const blockedUntil = key => { const e = attempts.get(key); return e && e.count >= MAX_ATTEMPTS && Date.now() - e.first < WINDOW_MS ? e.first + WINDOW_MS : 0 }
const noteFailure = key => { const e = attempts.get(key); if (!e || Date.now() - e.first >= WINDOW_MS) attempts.set(key, { count: 1, first: Date.now() }); else e.count++ }
function login(email,password,req,res) {
  const ip = clientIp(req), key = email + '|' + ip
  const until = blockedUntil(key)
  if (until) { audit({ email }, 'login.blocked', { type: 'user', label: email }, 'Demasiadas tentativas falhadas', ip); return fail(res, 429, `Demasiadas tentativas. Tente novamente dentro de ${Math.ceil((until - Date.now()) / 60000)} min.`) }
  const user=db.prepare('SELECT * FROM users WHERE email=?').get(email)
  if (!user || !verify(password,user.password)) { noteFailure(key); audit(user ? { id: user.id, name: user.name, email: user.email } : { email }, 'login.failed', { type: 'user', id: user?.id, label: email }, 'Credenciais inválidas', ip); return fail(res,401,'Credenciais inválidas') }
  if (!user.active) { audit(user, 'login.denied', { type: 'user', id: user.id, label: email }, 'Conta desativada', ip); return fail(res,403,'Esta conta está desativada. Contacte o administrador.') }
  attempts.delete(key)
  const token=randomBytes(32).toString('hex'), now=new Date().toISOString()
  db.prepare('INSERT INTO sessions(token,user_id,expires,created_at,last_seen,ip,agent) VALUES (?,?,?,?,?,?,?)').run(hash(token),user.id,Date.now()+30*86400000,now,now,ip,String(req.get('user-agent')||'').slice(0,200))
  db.prepare('UPDATE users SET last_login=? WHERE id=?').run(now,user.id)
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now())
  audit(user, 'login.success', { type: 'user', id: user.id, label: user.email }, '', ip)
  res.setHeader('Set-Cookie',`dc_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${req.secure || req.get('x-forwarded-proto') === 'https' ? '; Secure' : ''}`)
  res.json({user:{id:user.id,name:user.name,email:user.email,role:user.role}})
}
app.post('/api/login',(req,res)=>login(String(req.body?.email||'').trim().toLowerCase(),String(req.body?.password||''),req,res))
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}))
app.post('/api/logout',auth,(req,res)=>{ auditReq(req,'logout',{type:'user',id:req.user.id,label:req.user.email}); db.prepare('DELETE FROM sessions WHERE token=?').run(hash(cookie(req)));res.setHeader('Set-Cookie','dc_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');res.json({ok:true}) })
// Miniatura real do projeto: geometria leve (componentes + fios) extraída do conteúdo guardado.
const previewCache=new Map()
function buildPreview(content){
 let data;try{data=JSON.parse(content)}catch{return {components:[],wires:[]}}
 const list=Array.isArray(data?.components)?data.components.slice(0,400):[]
 const at=new Map()
 const components=list.filter(c=>Number.isFinite(c?.schematicX)&&Number.isFinite(c?.schematicY)).map(c=>{
  const w=Number(c.w)||60,h=Number(c.h)||40,r=Number(c.rotation)||0
  const pts=(Array.isArray(c.terminals)?c.terminals:[]).slice(0,64).map(t=>{
   let lx=(Number(t.x)||0)-.5,ly=(Number(t.y)||0)-.5
   if(c.mirrored)lx=-lx
   for(let i=0;i<Math.round(r/90)%4;i++)[lx,ly]=[-ly,lx]
   const x=c.schematicX+w/2+lx*w,y=c.schematicY+h/2+ly*h
   at.set(t.id,[x,y]);return [Math.round(x),Math.round(y)]
  })
  return {x:Math.round(c.schematicX),y:Math.round(c.schematicY),w:Math.round(w),h:Math.round(h),r,t:String(c.type||''),ref:String(c.ref||'').slice(0,8),c:typeof c.bodyColor==='string'?c.bodyColor.slice(0,9):undefined,m:c.mirrored?1:undefined,o:(c.viewOrientation&&(Number(c.viewOrientation.x)||Number(c.viewOrientation.y)||Number(c.viewOrientation.z)))?[Number(c.viewOrientation.x)||0,Number(c.viewOrientation.y)||0,Number(c.viewOrientation.z)||0]:undefined,p:pts}
 })
 const wires=(Array.isArray(data?.wires)?data.wires:[]).slice(0,800).map(w=>{
  const a=at.get(w.fromTerminalId)||(w.fromPoint&&[w.fromPoint.x,w.fromPoint.y]),b=at.get(w.toTerminalId)||(w.toPoint&&[w.toPoint.x,w.toPoint.y])
  return a&&b?{a:[Math.round(a[0]),Math.round(a[1])],b:[Math.round(b[0]),Math.round(b[1])],c:typeof w.color==='string'?w.color.slice(0,16):undefined}:null
 }).filter(Boolean)
 return {components,wires,stats:{components:Array.isArray(data?.components)?data.components.length:0,wires:Array.isArray(data?.wires)?data.wires.length:0,rungs:Array.isArray(data?.ladder?.rungs)?data.ladder.rungs.length:0}}
}
app.get('/api/projects',auth,(req,res)=>{
 const rows=db.prepare(`SELECT p.id,p.name,p.revision,p.updated_at,p.content,u.name owner,CASE WHEN p.owner_id=? THEN 'owner' ELSE 'editor' END role FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.owner_id=? OR EXISTS(SELECT 1 FROM members m WHERE m.project_id=p.id AND m.user_id=?) ORDER BY p.updated_at DESC`).all(req.user.id,req.user.id,req.user.id)
 res.json(rows.map(({content,...row})=>{
  const key=row.id+':'+row.revision+':'+row.updated_at
  let preview=previewCache.get(key)
  if(!preview){preview=buildPreview(content);previewCache.set(key,preview);if(previewCache.size>200)previewCache.delete(previewCache.keys().next().value)}
  return {...row,preview}
 }))
})
app.post('/api/projects',auth,(req,res)=>{
 const name=String(req.body.name||'').trim();if (!name||name.length>120)return fail(res,400,'Nome inválido')
 const p={id:id(),name,owner_id:req.user.id,content:JSON.stringify(req.body.content??{}),updated_at:new Date().toISOString()}
 if(p.content.length>7_000_000)return fail(res,413,'Projeto demasiado grande')
 db.prepare('INSERT INTO projects(id,name,owner_id,content,updated_at) VALUES (@id,@name,@owner_id,@content,@updated_at)').run(p)
 auditReq(req,'project.create',{type:'project',id:p.id,label:name})
 res.status(201).json({id:p.id,name,revision:0})
})
app.get('/api/projects/:id',auth,project,(req,res)=>res.json({id:req.project.id,name:req.project.name,role:req.project.role,revision:req.project.revision,content:JSON.parse(req.project.content)}))
app.put('/api/projects/:id',auth,project,(req,res)=>{
 const content=JSON.stringify(req.body.content), revision=req.body.revision
 if (!content||content.length>7_000_000)return fail(res,413,'Projeto demasiado grande')
 if (!Number.isInteger(revision))return fail(res,400,'Revisão obrigatória')
 const result=db.prepare('UPDATE projects SET content=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').run(content,new Date().toISOString(),req.project.id,revision)
 if (!result.changes)return fail(res,409,'Este projeto foi alterado noutro separador ou por outro membro. Reabra-o antes de guardar.')
 res.json({revision:revision+1})
})
app.delete('/api/projects/:id',auth,project,(req,res)=>{if(req.project.role!=='owner')return fail(res,403,'Apenas o proprietário pode eliminar');db.prepare('DELETE FROM projects WHERE id=?').run(req.project.id);auditReq(req,'project.delete',{type:'project',id:req.project.id,label:req.project.name});res.json({ok:true})})
app.get('/api/projects/:id/members',auth,project,(req,res)=>res.json({members:db.prepare('SELECT u.name,u.email FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?').all(req.project.id)}))
app.post('/api/projects/:id/invitations',auth,project,(req,res)=>{
 if(req.project.role!=='owner')return fail(res,403,'Apenas o proprietário pode convidar')
 const targetEmail=String(req.body.email||'').trim().toLowerCase()
 const u=db.prepare('SELECT id FROM users WHERE email=? AND active=1').get(targetEmail)
 if(!u)return fail(res,404,'Não existe nenhuma conta ativa com esse e-mail')
 if(u.id===req.user.id)return fail(res,400,'Já é proprietário')
 if(db.prepare('SELECT 1 FROM members WHERE project_id=? AND user_id=?').get(req.project.id,u.id))return fail(res,409,'Utilizador já é membro')
 try {db.prepare('INSERT INTO invitations VALUES (?,?,?,?,?)').run(id(),req.project.id,u.id,req.user.id,new Date().toISOString());auditReq(req,'project.invite',{type:'project',id:req.project.id,label:req.project.name},targetEmail);res.status(201).json({ok:true})}catch{return fail(res,409,'Convite já pendente')}
})
app.get('/api/invitations',auth,(req,res)=>res.json(db.prepare('SELECT i.id,p.name project,u.name sender FROM invitations i JOIN projects p ON p.id=i.project_id JOIN users u ON u.id=i.sender_id WHERE i.user_id=?').all(req.user.id)))
app.post('/api/invitations/:id/:action',auth,(req,res)=>{
 const inv=db.prepare('SELECT * FROM invitations WHERE id=? AND user_id=?').get(req.params.id,req.user.id)
 if(!inv)return fail(res,404,'Convite não encontrado')
 if(!['accept','reject'].includes(req.params.action))return fail(res,400,'Ação inválida')
 db.transaction(()=>{if(req.params.action==='accept')db.prepare('INSERT OR IGNORE INTO members VALUES (?,?)').run(inv.project_id,req.user.id);db.prepare('DELETE FROM invitations WHERE id=?').run(inv.id)})()
 auditReq(req,'invite.'+req.params.action,{type:'project',id:inv.project_id})
 res.json({ok:true})
})
// Rotas administrativas separadas das rotas normais de projeto: o papel
// admin não contorna implicitamente as permissões de leitura/escrita do editor.
registerAdmin({ app, db, auth, admin, fail, id, pwd, audit, auditReq, clientIp, fixedAccounts, contribDir, dataDir: dir, attempts })

// ---------------------------------------------------------------------------
// Contribuições (datasheets PDF e modelos 3D GLB) — qualquer conta autenticada
// contribui; só o administrador aprova/rejeita. Ficheiros em DATA_DIR/contrib.
// ---------------------------------------------------------------------------
const MAX_PDF = 25 * 1024 * 1024, MAX_GLB = 40 * 1024 * 1024
const cleanName = name => (String(name || '').split(/[\\/]/).pop() || '').replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim().slice(0, 120) || 'ficheiro'
function validateFileBytes(kind, buf) {
  if (kind === 'datasheet') {
    if (buf.length > MAX_PDF) return 'O PDF não pode exceder 25 MB.'
    return buf.length >= 8 && buf.subarray(0, 5).toString('latin1') === '%PDF-' ? null : 'O ficheiro selecionado não é um PDF válido.'
  }
  if (buf.length > MAX_GLB) return { error: 'O modelo GLB não pode exceder 40 MB.' }
  if (buf.length < 28 || buf.readUInt32LE(0) !== 0x46546c67) return { error: 'Não é um ficheiro GLB (falta o cabeçalho «glTF»).' }
  if (buf.readUInt32LE(4) !== 2) return { error: 'Use glTF 2.0.' }
  if (buf.readUInt32LE(8) !== buf.length) return { error: 'O GLB está truncado ou corrompido.' }
  const jsonLength = buf.readUInt32LE(12)
  if (buf.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength > buf.length) return { error: 'O GLB é inválido.' }
  let json
  try { json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) } catch { return { error: 'O GLB é inválido: JSON ilegível.' } }
  if (!Array.isArray(json.meshes) || !json.meshes.length) return { error: 'O modelo não contém nenhuma malha.' }
  if ([...(json.buffers || []), ...(json.images || [])].some(e => typeof e.uri === 'string' && !e.uri.startsWith('data:'))) return { error: 'O GLB referencia ficheiros externos.' }
  return { info: { version: 2, meshes: json.meshes.length, nodes: (json.nodes || []).length, materials: (json.materials || []).length, generator: typeof json.asset?.generator === 'string' ? json.asset.generator.slice(0, 80) : undefined } }
}
const contribOut = row => ({ id: row.id, kind: row.kind, title: row.title, componentType: row.component_type, customName: row.custom_name || undefined, description: row.description, fileName: row.file_name, size: row.size, authorId: row.author_id, authorName: row.author_name, authorEmail: row.author_email, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, reviewedBy: row.reviewed_by || undefined, reviewNote: row.review_note || undefined, glb: row.glb ? JSON.parse(row.glb) : undefined })
const CONTRIB_SELECT = 'SELECT c.*,u.name author_name,u.email author_email FROM contributions c JOIN users u ON u.id=c.author_id'
const findContribution = id => db.prepare(CONTRIB_SELECT + ' WHERE c.id=? AND c.file_ready IN (0,1)').get(id)
const canSee = (row, user) => user.role === 'admin' || row.author_id === user.id || (row.status === 'approved' && row.file_ready === 1)
const contribBody = body => {
  const kind = body.kind, title = String(body.title || '').trim(), description = String(body.description || '').trim()
  const componentType = body.componentType ? String(body.componentType) : null
  const customName = componentType ? null : String(body.customName || '').trim()
  if (!['datasheet', 'model3d'].includes(kind)) return { error: 'Tipo de contribuição inválido' }
  if (title.length < 3 || title.length > 120) return { error: 'O título deve ter entre 3 e 120 caracteres' }
  if (description.length > 2000) return { error: 'Descrição demasiado longa' }
  if (componentType && !/^[A-Za-z0-9]{1,60}$/.test(componentType)) return { error: 'Tipo de componente inválido' }
  if (!componentType && (!customName || customName.length > 80)) return { error: 'Indique o nome do componente novo (até 80 caracteres)' }
  return { kind, title, description, componentType, customName }
}
app.get('/api/contributions', auth, (req, res) => {
  const where = ['c.file_ready=1'], args = []
  if (req.user.role !== 'admin') { where.push("(c.author_id=? OR c.status='approved')"); args.push(req.user.id) }
  for (const [param, column] of [['status', 'c.status'], ['kind', 'c.kind'], ['componentType', 'c.component_type']]) if (req.query[param]) { where.push(column + '=?'); args.push(String(req.query[param])) }
  if (req.query.mine) { where.push('c.author_id=?'); args.push(req.user.id) }
  res.json(db.prepare(CONTRIB_SELECT + ' WHERE ' + where.join(' AND ') + ' ORDER BY c.updated_at DESC').all(...args).map(contribOut))
})
app.post('/api/contributions', auth, (req, res) => {
  const data = contribBody(req.body || {})
  if (data.error) return fail(res, 400, data.error)
  const now = new Date().toISOString(), cid = id()
  db.prepare('INSERT INTO contributions(id,kind,title,component_type,custom_name,description,file_name,size,author_id,status,file_ready,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(cid, data.kind, data.title, data.componentType, data.customName, data.description, cleanName(req.body.fileName), Math.max(0, Number(req.body.size) || 0), req.user.id, 'pending', 0, now, now)
  auditReq(req, 'contribution.create', { type: 'contribution', id: cid, label: data.title }, data.kind)
  res.status(201).json(contribOut(findContribution(cid)))
})
app.get('/api/contributions/:id', auth, (req, res) => {
  const row = findContribution(req.params.id)
  return row && canSee(row, req.user) ? res.json(contribOut(row)) : fail(res, 404, 'Contribuição não encontrada')
})
const ownEditable = (req, res) => {
  const row = findContribution(req.params.id)
  if (!row || (row.author_id !== req.user.id && req.user.role !== 'admin')) { fail(res, 404, 'Contribuição não encontrada'); return null }
  if (row.author_id !== req.user.id) { fail(res, 403, 'Só o autor pode editar a contribuição'); return null }
  if (row.status === 'approved') { fail(res, 409, 'Uma contribuição aprovada já não pode ser alterada'); return null }
  return row
}
app.patch('/api/contributions/:id', auth, (req, res) => {
  const row = ownEditable(req, res); if (!row) return
  const data = contribBody({ kind: row.kind, title: row.title, description: row.description, componentType: row.component_type, customName: row.custom_name, ...req.body })
  if (data.error) return fail(res, 400, data.error)
  db.prepare("UPDATE contributions SET title=?,component_type=?,custom_name=?,description=?,status='pending',review_note=NULL,reviewed_by=NULL,updated_at=? WHERE id=?").run(data.title, data.componentType, data.customName, data.description, new Date().toISOString(), row.id)
  auditReq(req, 'contribution.update', { type: 'contribution', id: row.id, label: data.title })
  res.json(contribOut(findContribution(row.id)))
})
app.put('/api/contributions/:id/file', auth, express.raw({ type: '*/*', limit: '41mb' }), (req, res) => {
  const row = ownEditable(req, res); if (!row) return
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const checked = validateFileBytes(row.kind, buf)
  const message = typeof checked === 'string' ? checked : checked?.error
  if (message) return fail(res, 400, message)
  writeFileSync(resolve(contribDir, row.id), buf)
  db.prepare("UPDATE contributions SET size=?,glb=?,file_ready=1,status='pending',updated_at=? WHERE id=?").run(buf.length, checked?.info ? JSON.stringify(checked.info) : null, new Date().toISOString(), row.id)
  auditReq(req, 'contribution.upload', { type: 'contribution', id: row.id, label: row.title }, `${row.file_name} · ${buf.length} B`)
  res.json({ ok: true })
})
app.get('/api/contributions/:id/file', auth, (req, res) => {
  const row = findContribution(req.params.id)
  if (!row || !canSee(row, req.user) || !existsSync(resolve(contribDir, row.id))) return fail(res, 404, 'Ficheiro não encontrado')
  res.setHeader('Content-Type', row.kind === 'datasheet' ? 'application/pdf' : 'model/gltf-binary')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`)
  res.send(readFileSync(resolve(contribDir, row.id)))
})
app.delete('/api/contributions/:id', auth, (req, res) => {
  const row = findContribution(req.params.id)
  if (!row || (row.author_id !== req.user.id && req.user.role !== 'admin')) return fail(res, 404, 'Contribuição não encontrada')
  if (req.user.role !== 'admin' && row.status === 'approved') return fail(res, 403, 'Só pode eliminar contribuições suas que ainda não foram aprovadas')
  db.prepare('DELETE FROM contributions WHERE id=?').run(row.id)
  rmSync(resolve(contribDir, row.id), { force: true })
  auditReq(req, 'contribution.delete', { type: 'contribution', id: row.id, label: row.title }, row.author_id === req.user.id ? 'pelo autor' : 'pelo administrador')
  res.json({ ok: true })
})
app.get('/api/admin/contributions/stats', auth, admin, (_req, res) => {
  const rows = db.prepare('SELECT kind,status,size FROM contributions WHERE file_ready=1').all()
  res.json({ total: rows.length, pending: rows.filter(r => r.status === 'pending').length, approved: rows.filter(r => r.status === 'approved').length, rejected: rows.filter(r => r.status === 'rejected').length, datasheets: rows.filter(r => r.kind === 'datasheet').length, models: rows.filter(r => r.kind === 'model3d').length, bytes: rows.reduce((sum, r) => sum + r.size, 0) })
})
app.patch('/api/admin/contributions/:id', auth, admin, (req, res) => {
  const row = findContribution(req.params.id)
  if (!row || !row.file_ready) return fail(res, 404, 'Contribuição não encontrada')
  const status = req.body.status, note = String(req.body.note || '').trim().slice(0, 1000)
  if (!['pending', 'approved', 'rejected'].includes(status)) return fail(res, 400, 'Estado inválido')
  if (status === 'rejected' && !note) return fail(res, 400, 'Indique o motivo da rejeição para o contribuidor.')
  db.prepare('UPDATE contributions SET status=?,review_note=?,reviewed_by=?,updated_at=? WHERE id=?').run(status, note || null, status === 'pending' ? null : req.user.name, new Date().toISOString(), row.id)
  auditReq(req, 'contribution.' + status, { type: 'contribution', id: row.id, label: row.title }, note)
  res.json(contribOut(findContribution(row.id)))
})
app.use('/api',(req,res)=>fail(res,404,'Endpoint não encontrado'))
const root=resolve('dist')
app.use(express.static(root,{setHeaders:(res,file)=>{
 if(/(?:index\.html|sw\.js|version\.json)$/.test(file))res.setHeader('Cache-Control','no-cache, no-store, must-revalidate')
 else if(file.includes('/assets/'))res.setHeader('Cache-Control','public, max-age=31536000, immutable')
}}))
app.get('/{*path}',(_req,res)=>{res.setHeader('Cache-Control','no-cache, no-store, must-revalidate');res.sendFile(resolve(root,'index.html'))})
app.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('DC-SIMU API ready'))
