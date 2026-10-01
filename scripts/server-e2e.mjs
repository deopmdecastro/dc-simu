// Teste de ponta a ponta do servidor (Express + SQLite): `npm run test:server`.
// Arranca o servidor numa pasta temporária e percorre a administração.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = 3900 + Math.floor(Math.random() * 90)
const dataDir = mkdtempSync(join(tmpdir(), 'dcsimu-'))
const execArgv = process.env.SERVER_NODE_ARGS ? process.env.SERVER_NODE_ARGS.split(' ') : []
// Base de dados de uma versão anterior: sem papel/estado nas contas e com uma conta antiga já bloqueada.
{
  const { default: Database } = await import('better-sqlite3')
  const { randomBytes, scryptSync } = await import('node:crypto')
  const legacy = new Database(join(dataDir, 'dcsimu.sqlite'))
  legacy.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL);CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);')
  const salt = randomBytes(16).toString('hex')
  legacy.prepare('INSERT INTO users VALUES (?,?,?,?)').run('legacy-1', 'antigo@exemplo.pt', 'Antigo', salt + ':' + scryptSync('Antigo12345', salt, 64).toString('hex'))
  legacy.close()
}
const child = spawn(process.execPath, [...execArgv, 'server/index.mjs'], { env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'inherit'] })
let failures = 0, passed = 0
const check = (name, ok, extra = '') => { if (ok) { passed++; console.log('PASS', name) } else { failures++; console.log('FAIL', name, extra) } }

class Client {
  cookie = ''
  async call(method, path, body, { raw = false } = {}) {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const set = res.headers.get('set-cookie')
    if (set) this.cookie = set.split(';')[0]
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data }
  }
  login(email, password) { return this.call('POST', '/login', { email, password }) }
}

try {
  for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${port}/api/me`); break } catch { await new Promise(r => setTimeout(r, 100)) } }
  const admin = new Client(), user = new Client(), other = new Client()
  check('conta antiga migrada fica desativada e não entra', (await new Client().login('antigo@exemplo.pt', 'Antigo12345')).status === 403)
  check('admin entra', (await admin.login('admin@dcsimu.local', 'AdminDcsimu2026!')).status === 200)
  check('user entra', (await user.login('user@dcsimu.local', 'UserDcsimu2026!')).status === 200)
  {
    const profile = { name: 'Meu perfil', category: 'Proteção', description: 'teste', specs: [{ label: '1', name: 'Entrada', fn: 'L', kind: 'power-in', polarity: 'ac', electricalClass: 'ac', direction: 'in', terminalType: 'screw', color: '#92400e', face: 'top' }] }
    check('perfis de bornes: utilizador não grava', (await user.call('PUT', '/admin/terminal-profiles/p_teste1', profile)).status === 403)
    check('perfis de bornes: admin grava', (await admin.call('PUT', '/admin/terminal-profiles/p_teste1', profile)).status === 200)
    check('perfis de bornes: perfil vazio é recusado', (await admin.call('PUT', '/admin/terminal-profiles/p_teste2', { ...profile, specs: [] })).status === 400)
    const listed = await user.call('GET', '/terminal-profiles')
    check('perfis de bornes: utilizador lê o perfil do admin', listed.status === 200 && listed.data.some((entry) => entry.id === 'p_teste1' && entry.specs.length === 1))
    check('perfis de bornes: utilizador não elimina', (await user.call('DELETE', '/admin/terminal-profiles/p_teste1')).status === 403)
    check('perfis de bornes: admin elimina', (await admin.call('DELETE', '/admin/terminal-profiles/p_teste1')).status === 200 && (await user.call('GET', '/terminal-profiles')).data.length === 0)
  }
  check('user não acede à administração', (await user.call('GET', '/admin/users')).status === 403)
  check('user não lê registos', (await user.call('GET', '/admin/logs')).status === 403)

  let users = (await admin.call('GET', '/admin/users')).data
  check('lista tem as duas contas fixas protegidas e a conta antiga desativada', users.length === 3 && users.filter(u => u.fixed).length === 2 && users.filter(u => u.fixed).every(u => u.active) && users.find(u => u.email === 'antigo@exemplo.pt')?.active === false)
  const fixedUser = users.find(u => u.email === 'user@dcsimu.local')
  check('conta fixa não pode ser desativada', (await admin.call('PATCH', `/admin/users/${fixedUser.id}`, { active: false })).status === 403)
  check('conta fixa não pode ser eliminada', (await admin.call('DELETE', `/admin/users/${fixedUser.id}`)).status === 403)

  // criação
  check('palavra-passe fraca rejeitada', (await admin.call('POST', '/admin/users', { name: 'Ana', email: 'ana@exemplo.pt', password: 'curta' })).status === 400)
  check('e-mail inválido rejeitado', (await admin.call('POST', '/admin/users', { name: 'Ana', email: 'ana', password: 'Segredo12345' })).status === 400)
  const created = await admin.call('POST', '/admin/users', { name: 'Ana Silva', email: 'Ana@Exemplo.pt', password: 'Segredo12345' })
  check('conta criada', created.status === 201 && created.data.email === 'ana@exemplo.pt' && created.data.role === 'user' && !created.data.fixed)
  check('e-mail duplicado rejeitado', (await admin.call('POST', '/admin/users', { name: 'Ana 2', email: 'ana@exemplo.pt', password: 'Segredo12345' })).status === 409)
  const ana = created.data
  check('utilizador não cria contas', (await user.call('POST', '/admin/users', { name: 'X Y', email: 'x@y.pt', password: 'Segredo12345' })).status === 403)

  // login do novo utilizador + contribuições + projeto
  check('novo utilizador entra', (await other.login('ana@exemplo.pt', 'Segredo12345')).status === 200)
  check('palavra-passe errada falha', (await new Client().login('ana@exemplo.pt', 'errada')).status === 401)
  const project = await other.call('POST', '/projects', { name: 'Projeto da Ana', content: { a: 1 } })
  check('novo utilizador cria projeto', project.status === 201)
  const contrib = await other.call('POST', '/contributions', { kind: 'datasheet', title: 'Ficha teste', description: '', componentType: 'contactor', fileName: 'a.pdf', size: 10 })
  check('novo utilizador cria contribuição', contrib.status === 201)
  const inv = await other.call('POST', `/projects/${project.data.id}/invitations`, { email: 'user@dcsimu.local' })
  check('convite a conta existente', inv.status === 201)
  check('convite a conta inexistente falha', (await other.call('POST', `/projects/${project.data.id}/invitations`, { email: 'nao@existe.pt' })).status === 404)

  // edição
  check('promover a admin', (await admin.call('PATCH', `/admin/users/${ana.id}`, { role: 'admin', name: 'Ana S.' })).data.role === 'admin')
  check('novo admin acede à administração', (await other.call('GET', '/admin/users')).status === 200)
  check('rebaixar a utilizador', (await admin.call('PATCH', `/admin/users/${ana.id}`, { role: 'user' })).data.role === 'user')
  check('papel inválido rejeitado', (await admin.call('PATCH', `/admin/users/${ana.id}`, { role: 'root' })).status === 400)
  const self = users.find(u => u.email === 'admin@dcsimu.local')
  check('admin não altera a própria conta', (await admin.call('PATCH', `/admin/users/${self.id}`, { active: false })).status === 403)

  // desativar
  users = (await admin.call('GET', '/admin/users')).data
  check('sessão conta como ativa', users.find(u => u.id === ana.id).sessions === 1)
  const off = await admin.call('PATCH', `/admin/users/${ana.id}`, { active: false })
  check('conta desativada', off.status === 200 && off.data.active === false && off.data.sessions === 0)
  check('sessão da conta desativada termina', (await other.call('GET', '/me')).status === 401)
  const denied = await new Client().login('ana@exemplo.pt', 'Segredo12345')
  check('conta desativada não entra', denied.status === 403)
  await admin.call('PATCH', `/admin/users/${ana.id}`, { active: true })
  check('conta reativada entra', (await other.login('ana@exemplo.pt', 'Segredo12345')).status === 200)

  // palavra-passe e sessões
  check('nova palavra-passe fraca rejeitada', (await admin.call('POST', `/admin/users/${ana.id}/password`, { password: 'abc' })).status === 400)
  const reset = await admin.call('POST', `/admin/users/${ana.id}/password`, { password: 'NovaSenha2026x' })
  check('repor palavra-passe termina sessões', reset.status === 200 && reset.data.sessionsClosed === 1 && (await other.call('GET', '/me')).status === 401)
  check('palavra-passe antiga deixa de servir', (await new Client().login('ana@exemplo.pt', 'Segredo12345')).status === 401)
  check('palavra-passe nova serve', (await other.login('ana@exemplo.pt', 'NovaSenha2026x')).status === 200)
  const revoked = await admin.call('POST', `/admin/users/${ana.id}/revoke-sessions`)
  check('terminar sessões', revoked.status === 200 && revoked.data.sessionsClosed === 1)
  check('admin não termina a própria sessão aqui', (await admin.call('POST', `/admin/users/${self.id}/revoke-sessions`)).status === 400)

  // componentes
  check('utilizador vê definições', (await user.call('GET', '/settings')).data.disabledComponents.length === 0)
  check('desativar exige motivo', (await admin.call('PUT', '/admin/components/contactor', { enabled: false })).status === 400)
  check('tipo inválido rejeitado', (await admin.call('PUT', '/admin/components/a-b', { enabled: false, note: 'x' })).status === 400)
  check('utilizador não altera componentes', (await user.call('PUT', '/admin/components/contactor', { enabled: false, note: 'x' })).status === 403)
  check('componente desativado', (await admin.call('PUT', '/admin/components/contactor', { enabled: false, note: 'Modelo em revisão' })).data.enabled === false)
  const settings = (await user.call('GET', '/settings')).data.disabledComponents
  check('definições chegam ao utilizador', settings.length === 1 && settings[0].type === 'contactor' && settings[0].note === 'Modelo em revisão')
  check('lista admin de componentes', (await admin.call('GET', '/admin/components')).data.length === 1)
  check('componente reativado', (await admin.call('PUT', '/admin/components/contactor', { enabled: true })).data.enabled === true && (await user.call('GET', '/settings')).data.disabledComponents.length === 0)

  // projetos
  const projects = (await admin.call('GET', '/admin/projects')).data
  check('admin lista projetos com tamanho e membros', projects.length === 1 && projects[0].size > 0 && projects[0].members === 0 && projects[0].owner === 'ana@exemplo.pt')

  // eliminar utilizador com dados
  const blocked = await admin.call('DELETE', `/admin/users/${ana.id}`)
  check('eliminar com dados pede confirmação', blocked.status === 409 && /1 projeto/.test(blocked.data.error))
  check('eliminar com confirmação', (await admin.call('DELETE', `/admin/users/${ana.id}?force=1`)).status === 200)
  users = (await admin.call('GET', '/admin/users')).data
  check('conta eliminada', users.length === 3)
  check('dados da conta eliminados', (await admin.call('GET', '/admin/projects')).data.length === 0 && (await admin.call('GET', '/contributions')).data.length === 0)
  check('convites pendentes removidos', (await user.call('GET', '/invitations')).data.length === 0)

  // registos
  const all = (await admin.call('GET', '/admin/logs?limit=500')).data
  const actions = new Set(all.items.map(i => i.action))
  for (const action of ['login.success', 'login.failed', 'login.denied', 'user.create', 'user.update', 'user.disable', 'user.enable', 'user.password', 'session.revoke', 'user.delete', 'component.disable', 'component.enable', 'project.create', 'contribution.create']) check('registo ' + action, actions.has(action))
  check('total coerente', all.total === all.items.length)
  check('registos ordenados do mais recente', all.items.every((item, i) => i === 0 || all.items[i - 1].at >= item.at))
  check('nenhum registo contém palavras-passe', !JSON.stringify(all).includes('Segredo12345') && !JSON.stringify(all).includes('NovaSenha2026x'))
  const auth = (await admin.call('GET', '/admin/logs?category=auth&limit=500')).data
  check('filtro por categoria', auth.items.length > 0 && auth.items.every(i => i.action.startsWith('login.') || i.action === 'logout'))
  const search = (await admin.call('GET', '/admin/logs?q=' + encodeURIComponent('ana@exemplo.pt') + '&action=user.create')).data
  check('pesquisa e ação', search.total === 1 && search.items[0].targetLabel === 'ana@exemplo.pt')
  check('pesquisa com curingas não parte', (await admin.call('GET', '/admin/logs?q=%25_%5C')).status === 200)
  check('paginação', (await admin.call('GET', '/admin/logs?limit=3&offset=2')).data.items.length === 3)
  check('filtro por data futura vazio', (await admin.call('GET', '/admin/logs?from=2999-01-01')).data.total === 0)
  check('user não apaga registos', (await user.call('DELETE', '/admin/logs?olderThanDays=1')).status === 403)
  check('purga exige dias válidos', (await admin.call('DELETE', '/admin/logs?olderThanDays=0')).status === 400)
  const purge = await admin.call('DELETE', '/admin/logs?olderThanDays=30')
  check('purga não apaga registos recentes', purge.status === 200 && purge.data.removed === 0)

  // bloqueio por tentativas
  const brute = new Client()
  let last = 0
  for (let i = 0; i < 8; i++) last = (await brute.login('user@dcsimu.local', 'errada' + i)).status
  check('bloqueio após tentativas falhadas', last === 429)
  check('bloqueado mesmo com a palavra-passe certa', (await brute.login('user@dcsimu.local', 'UserDcsimu2026!')).status === 429)
  check('registo de bloqueio', (await admin.call('GET', '/admin/logs?action=login.blocked')).data.total >= 1)

  // sistema e exportação
  const system = (await admin.call('GET', '/admin/system')).data
  check('estado do sistema', system.backend === 'server' && system.counts.users === 3 && system.uptimeSec >= 0 && system.databaseBytes > 0)
  check('utilizador não vê o sistema', (await user.call('GET', '/admin/system')).status === 403)
  const exported = (await admin.call('GET', '/admin/export')).data
  check('exportação sem segredos', exported.users.length === 3 && !JSON.stringify(exported).match(/"password"|scrypt|Dcsimu2026!/i) && exported.logs.length > 0)
} catch (error) {
  failures++
  console.log('FAIL exceção', error)
} finally {
  child.kill()
  rmSync(dataDir, { recursive: true, force: true })
}
console.log(`\n${passed} passaram, ${failures} falharam`)
process.exit(failures ? 1 : 0)
