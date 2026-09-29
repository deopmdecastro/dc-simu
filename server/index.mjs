import express from 'express'
import Database from 'better-sqlite3'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

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
const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '8mb' }))
const id = () => randomBytes(16).toString('hex')
const hash = s => createHash('sha256').update(s).digest('hex')
const pwd = p => { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(p, salt, 64).toString('hex') }
const verify = (p, saved) => { const [salt, expected] = saved.split(':'); return timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(expected, 'hex')) }
// Migração não destrutiva das bases existentes.
if (!db.prepare("PRAGMA table_info(users)").all().some(column => column.name === 'role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
const fixedAccounts = [
  { email: 'admin@dcsimu.local', name: 'Admin', password: 'AdminDcsimu2026!', role: 'admin' },
  { email: 'user@dcsimu.local', name: 'User', password: 'UserDcsimu2026!', role: 'user' },
]
const fixedEmails = new Set(fixedAccounts.map(account => account.email))
const seedFixedAccounts = db.transaction(() => {
  for (const account of fixedAccounts) {
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(account.email)
    if (existing) db.prepare('UPDATE users SET name=?,password=?,role=? WHERE id=?').run(account.name,pwd(account.password),account.role,existing.id)
    else db.prepare('INSERT INTO users(id,email,name,password,role) VALUES (?,?,?,?,?)').run(id(),account.email,account.name,pwd(account.password),account.role)
  }
  // Sessões antigas não podem contornar a nova lista fechada de acesso.
  db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email NOT IN (?,?))').run(...fixedAccounts.map(account => account.email))
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
  const sessionUser = token ? db.prepare('SELECT users.id,users.email,users.name,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(hash(token), Date.now()) : null
  req.user = sessionUser && fixedEmails.has(sessionUser.email) ? sessionUser : null
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
function login(email,password,req,res) {
  if (!fixedEmails.has(email)) return fail(res,401,'Credenciais inválidas')
  const user=db.prepare('SELECT * FROM users WHERE email=?').get(email)
  if (!user || !verify(password,user.password)) return fail(res,401,'Credenciais inválidas')
  const token=randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),user.id,Date.now()+30*86400000)
  res.setHeader('Set-Cookie',`dc_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${req.secure || req.get('x-forwarded-proto') === 'https' ? '; Secure' : ''}`)
  res.json({user:{id:user.id,name:user.name,email:user.email,role:user.role}})
}
app.post('/api/login',(req,res)=>login(String(req.body.email||'').trim().toLowerCase(),String(req.body.password||''),req,res))
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}))
app.post('/api/logout',auth,(req,res)=>{ db.prepare('DELETE FROM sessions WHERE token=?').run(hash(cookie(req)));res.setHeader('Set-Cookie','dc_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');res.json({ok:true}) })
app.get('/api/projects',auth,(req,res)=>res.json(db.prepare(`SELECT p.id,p.name,p.revision,p.updated_at,u.name owner,CASE WHEN p.owner_id=? THEN 'owner' ELSE 'editor' END role FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.owner_id=? OR EXISTS(SELECT 1 FROM members m WHERE m.project_id=p.id AND m.user_id=?) ORDER BY p.updated_at DESC`).all(req.user.id,req.user.id,req.user.id)))
app.post('/api/projects',auth,(req,res)=>{
 const name=String(req.body.name||'').trim();if (!name||name.length>120)return fail(res,400,'Nome inválido')
 const p={id:id(),name,owner_id:req.user.id,content:JSON.stringify(req.body.content??{}),updated_at:new Date().toISOString()}
 if(p.content.length>7_000_000)return fail(res,413,'Projeto demasiado grande')
 db.prepare('INSERT INTO projects(id,name,owner_id,content,updated_at) VALUES (@id,@name,@owner_id,@content,@updated_at)').run(p)
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
app.delete('/api/projects/:id',auth,project,(req,res)=>{if(req.project.role!=='owner')return fail(res,403,'Apenas o proprietário pode eliminar');db.prepare('DELETE FROM projects WHERE id=?').run(req.project.id);res.json({ok:true})})
app.get('/api/projects/:id/members',auth,project,(req,res)=>res.json({members:db.prepare('SELECT u.name,u.email FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?').all(req.project.id)}))
app.post('/api/projects/:id/invitations',auth,project,(req,res)=>{
 if(req.project.role!=='owner')return fail(res,403,'Apenas o proprietário pode convidar')
 const targetEmail=String(req.body.email||'').trim().toLowerCase()
 if(!fixedEmails.has(targetEmail))return fail(res,404,'Só é possível convidar uma das duas contas autorizadas')
 const u=db.prepare('SELECT id FROM users WHERE email=?').get(targetEmail)
 if(!u)return fail(res,404,'Conta autorizada não encontrada')
 if(u.id===req.user.id)return fail(res,400,'Já é proprietário')
 if(db.prepare('SELECT 1 FROM members WHERE project_id=? AND user_id=?').get(req.project.id,u.id))return fail(res,409,'Utilizador já é membro')
 try {db.prepare('INSERT INTO invitations VALUES (?,?,?,?,?)').run(id(),req.project.id,u.id,req.user.id,new Date().toISOString());res.status(201).json({ok:true})}catch{return fail(res,409,'Convite já pendente')}
})
app.get('/api/invitations',auth,(req,res)=>res.json(db.prepare('SELECT i.id,p.name project,u.name sender FROM invitations i JOIN projects p ON p.id=i.project_id JOIN users u ON u.id=i.sender_id WHERE i.user_id=?').all(req.user.id)))
app.post('/api/invitations/:id/:action',auth,(req,res)=>{
 const inv=db.prepare('SELECT * FROM invitations WHERE id=? AND user_id=?').get(req.params.id,req.user.id)
 if(!inv)return fail(res,404,'Convite não encontrado')
 if(!['accept','reject'].includes(req.params.action))return fail(res,400,'Ação inválida')
 db.transaction(()=>{if(req.params.action==='accept')db.prepare('INSERT OR IGNORE INTO members VALUES (?,?)').run(inv.project_id,req.user.id);db.prepare('DELETE FROM invitations WHERE id=?').run(inv.id)})()
 res.json({ok:true})
})
// Rotas administrativas separadas das rotas normais de projeto: o papel
// admin não contorna implicitamente as permissões de leitura/escrita do editor.
app.get('/api/admin/users',auth,admin,(req,res)=>res.json(db.prepare(`SELECT u.id,u.email,u.name,u.role,(SELECT count(*) FROM projects p WHERE p.owner_id=u.id) projects FROM users u WHERE u.email IN (?,?) ORDER BY u.email`).all(...fixedAccounts.map(account => account.email))))
app.get('/api/admin/projects',auth,admin,(req,res)=>res.json(db.prepare('SELECT p.id,p.name,p.updated_at,u.email owner FROM projects p JOIN users u ON u.id=p.owner_id ORDER BY p.updated_at DESC').all()))
app.delete('/api/admin/projects/:id',auth,admin,(req,res)=>{
 const result=db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id)
 if(!result.changes)return fail(res,404,'Projeto não encontrado')
 res.json({ok:true})
})
app.delete('/api/admin/users/:id',auth,admin,(req,res)=>{
 const target=db.prepare('SELECT id,email FROM users WHERE id=?').get(req.params.id)
 if(!target)return fail(res,404,'Utilizador não encontrado')
 if(fixedEmails.has(target.email))return fail(res,403,'As duas contas fixas não podem ser eliminadas')
 return fail(res,403,'A eliminação de contas está desativada')
})
app.use('/api',(req,res)=>fail(res,404,'Endpoint não encontrado'))
const root=resolve('dist')
app.use(express.static(root,{setHeaders:(res,file)=>{
 if(/(?:index\.html|sw\.js|version\.json)$/.test(file))res.setHeader('Cache-Control','no-cache, no-store, must-revalidate')
 else if(file.includes('/assets/'))res.setHeader('Cache-Control','public, max-age=31536000, immutable')
}}))
app.get('/{*path}',(_req,res)=>{res.setHeader('Cache-Control','no-cache, no-store, must-revalidate');res.sendFile(resolve(root,'index.html'))})
app.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('DC-SIMU API ready'))
