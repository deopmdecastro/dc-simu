// Teste de ponta a ponta do servidor (Express + SQLite): `npm run test:server`.
// Arranca o servidor numa pasta temporária e percorre a administração.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = 3900 + Math.floor(Math.random() * 90)
const dataDir = mkdtempSync(join(tmpdir(), 'dcsimu-'))
const n8nRequests = []
const n8nMock = createServer((req, res) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    n8nRequests.push({ method: req.method, url: req.url, headers: req.headers, body })
    if (req.method === 'GET' && req.url === '/api/v1/workflows/workflow_test') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name: 'Workflow seguro' }))
    } else if (req.method === 'POST' && req.url === '/webhook/configured') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ responseSecret: 'não devolver ao cliente' }))
    } else {
      res.writeHead(404).end('not found')
    }
  })
})
await new Promise((resolve) => n8nMock.listen(0, '127.0.0.1', resolve))
const n8nPort = n8nMock.address().port
const execArgv = process.env.SERVER_NODE_ARGS ? process.env.SERVER_NODE_ARGS.split(' ') : []
// Base de dados de uma versão anterior: sem papel/estado nas contas e com uma conta antiga já bloqueada.
{
  const { default: Database } = await import('better-sqlite3')
  const { randomBytes, scryptSync } = await import('node:crypto')
  const legacy = new Database(join(dataDir, 'dcsimu.sqlite'))
  legacy.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL);CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);')
  const salt = randomBytes(16).toString('hex')
  legacy.prepare('INSERT INTO users VALUES (?,?,?,?)').run('legacy-1', 'antigo@exemplo.pt', 'Antigo', salt + ':' + scryptSync('Antigo12345', salt, 64).toString('hex'))
  const adminSalt = randomBytes(16).toString('hex')
  legacy.prepare('INSERT INTO users VALUES (?,?,?,?)').run('legacy-admin', 'admin@dcsimu.local', 'Admin anterior', adminSalt + ':' + scryptSync('ExistingAdmin2026!Private', adminSalt, 64).toString('hex'))
  legacy.close()
}
const child = spawn(process.execPath, [...execArgv, 'server/index.mjs'], { env: {
  ...process.env,
  PORT: String(port), DATA_DIR: dataDir,
  ADMIN_INITIAL_PASSWORD: 'AdminSeed2026!Secure', USER_INITIAL_PASSWORD: 'UserSeed2026!Secure',
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: '', VITE_SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-test', SUPABASE_SECRET_KEY: 'secret-key-test',
  N8N_URL: `http://127.0.0.1:${n8nPort}`, N8N_API_KEY: 'server-only-test-key', N8N_WORKFLOW_ID: 'workflow_test', N8N_WEBHOOK_URL: `http://127.0.0.1:${n8nPort}/webhook/configured`,
  VITE_N8N_API_KEY: 'must-not-be-used',
}, stdio: ['ignore', 'pipe', 'inherit'] })
let failures = 0, passed = 0
const check = (name, ok, extra = '') => { if (ok) { passed++; console.log('PASS', name) } else { failures++; console.log('FAIL', name, extra) } }

class Client {
  cookie = ''
  async call(method, path, body, { raw = false, headers: extraHeaders = {} } = {}) {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...extraHeaders, ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
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
  const configResponse = await fetch(`http://127.0.0.1:${port}/api/supabase/config`)
  const publicConfig = await configResponse.json()
  check('API não expõe chaves service-role/secret', !JSON.stringify(publicConfig).includes('service-role-secret-test') && !JSON.stringify(publicConfig).includes('secret-key-test') && publicConfig.configured === false && publicConfig.anonKey === '')
  check('API sem cache e com cabeçalhos de segurança', configResponse.headers.get('cache-control') === 'no-store' && configResponse.headers.get('x-content-type-options') === 'nosniff' && !!configResponse.headers.get('referrer-policy'))
  check('mutação com Origin externo é recusada', (await new Client().call('POST', '/login', { email: 'user@dcsimu.local', password: 'x' }, { headers: { Origin: 'https://evil.example' } })).status === 403)
  check('proxy n8n exige sessão', (await new Client().call('POST', '/n8n/trigger', { payload: { event: 'test' }, webhookUrl: 'http://127.0.0.1:1/leak' })).status === 401)
  check('teste n8n exige sessão', (await new Client().call('POST', '/n8n/test', {})).status === 401)
  check('conta antiga migrada fica desativada e não entra', (await new Client().login('antigo@exemplo.pt', 'Antigo12345')).status === 403)
  check('admin entra sem repor a palavra-passe antiga', (await admin.login('admin@dcsimu.local', 'ExistingAdmin2026!Private')).status === 200)
  check('senha inicial não substitui a palavra-passe já guardada', (await new Client().login('admin@dcsimu.local', 'AdminSeed2026!Secure')).status === 401)
  check('user entra com a senha inicial configurada', (await user.login('user@dcsimu.local', 'UserSeed2026!Secure')).status === 200)
  const n8nTrigger = await user.call('POST', '/n8n/trigger', { payload: { event: 'test' }, webhookUrl: 'http://127.0.0.1:1/leak', workflowId: 'evil' })
  check('proxy n8n usa o destino do servidor, não o URL do corpo', n8nTrigger.status === 200 && n8nTrigger.data.ok === true && n8nRequests.some((r) => r.method === 'POST' && r.url === '/webhook/configured' && JSON.parse(r.body).event === 'test'))
  check('proxy n8n não encaminha nem devolve segredos', !JSON.stringify(n8nTrigger.data).includes('responseSecret') && !JSON.stringify(n8nRequests.find((r) => r.method === 'POST')?.headers).includes('server-only-test-key') && !JSON.stringify(n8nTrigger.data).includes('server-only-test-key'))
  const n8nTest = await user.call('POST', '/n8n/test', {})
  check('teste n8n confirma workflow sem executar webhook', n8nTest.status === 200 && n8nTest.data.workflowName === 'Workflow seguro' && n8nRequests.some((r) => r.method === 'GET' && r.url === '/api/v1/workflows/workflow_test'))
  check('chave da API n8n só segue na consulta server-side', n8nRequests.find((r) => r.method === 'GET')?.headers['x-n8n-api-key'] === 'server-only-test-key' && !JSON.stringify(n8nTest.data).includes('server-only-test-key'))
  const secondUserSession = new Client()
  check('segunda sessão do utilizador inicia', (await secondUserSession.login('user@dcsimu.local', 'UserSeed2026!Secure')).status === 200)
  check('alteração exige palavra-passe atual correta', (await user.call('POST', '/account/password', { currentPassword: 'errada', newPassword: 'UserRotated2026!Secure' })).status === 401)
  check('alteração rejeita palavra-passe fraca', (await user.call('POST', '/account/password', { currentPassword: 'UserSeed2026!Secure', newPassword: 'curta' })).status === 400)
  const changedPassword = await user.call('POST', '/account/password', { currentPassword: 'UserSeed2026!Secure', newPassword: 'UserRotated2026!Secure' })
  check('alteração renova a sessão e termina as outras', changedPassword.status === 200 && changedPassword.data.sessionsClosed === 1 && (await user.call('GET', '/me')).status === 200 && (await secondUserSession.call('GET', '/me')).status === 401)
  check('palavra-passe anterior deixa de funcionar', (await new Client().login('user@dcsimu.local', 'UserSeed2026!Secure')).status === 401)
  check('palavra-passe nova permite iniciar sessão', (await new Client().login('user@dcsimu.local', 'UserRotated2026!Secure')).status === 200)
  {
    // Perfil do criador (ACCOUNT-PAGE-01): nome, avatar e e-mail com confirmação da palavra-passe.
    const pass = 'UserRotated2026!Secure'
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    check('perfil: nome muda e aparece em /me', (await user.call('PATCH', '/account/profile', { name: '  Criador   Teste ' })).status === 200 && (await user.call('GET', '/me')).data.user.name === 'Criador Teste')
    check('perfil: nome curto é recusado', (await user.call('PATCH', '/account/profile', { name: 'A' })).status === 400)
    check('perfil: avatar PNG é aceite e devolvido', (await user.call('PATCH', '/account/profile', { avatar: png })).status === 200 && (await user.call('GET', '/me')).data.user.avatar === png)
    check('perfil: avatar que não é imagem raster é recusado', (await user.call('PATCH', '/account/profile', { avatar: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })).status === 400 && (await user.call('PATCH', '/account/profile', { avatar: 'https://exemplo.pt/a.png' })).status === 400)
    check('perfil: avatar removido volta a null', (await user.call('PATCH', '/account/profile', { avatar: null })).status === 200 && (await user.call('GET', '/me')).data.user.avatar === null)
    check('perfil: e-mail inválido é recusado', (await user.call('PATCH', '/account/profile', { email: 'sem-arroba' })).status === 400)
    check('perfil: mudar e-mail exige a palavra-passe atual', (await user.call('PATCH', '/account/profile', { email: 'novo@exemplo.pt' })).status === 401 && (await user.call('PATCH', '/account/profile', { email: 'novo@exemplo.pt', currentPassword: 'errada' })).status === 401)
    check('perfil: e-mail já em uso é recusado', (await user.call('PATCH', '/account/profile', { email: 'admin@dcsimu.local', currentPassword: pass })).status === 409)
    check('perfil: e-mail muda com a palavra-passe e o login segue o novo', (await user.call('PATCH', '/account/profile', { email: 'novo@exemplo.pt', currentPassword: pass })).status === 200 && (await new Client().login('novo@exemplo.pt', pass)).status === 200 && (await new Client().login('user@dcsimu.local', pass)).status === 401)
    check('perfil: e-mail volta ao original (testes seguintes)', (await user.call('PATCH', '/account/profile', { email: 'user@dcsimu.local', currentPassword: pass })).status === 200 && (await new Client().login('user@dcsimu.local', pass)).status === 200)
    check('perfil: sem sessão é recusado', (await new Client().call('PATCH', '/account/profile', { name: 'Intruso' })).status === 401)
  }
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
  // SAAS-PLANS-01: no plano Free não há partilha; o administrador atribui o plano Pro.
  check('plano por omissão é free', created.data.plan === 'free')
  check('admin atribui plano Pro', (await admin.call('PATCH', `/admin/users/${created.data.id}`, { plan: 'pro' })).data.plan === 'pro')
  const project = await other.call('POST', '/projects', { name: 'Projeto da Ana', content: { a: 1 } })
  check('novo utilizador cria projeto', project.status === 201)
  const contrib = await other.call('POST', '/contributions', { kind: 'datasheet', title: 'Ficha teste', description: '', componentType: 'contactor', fileName: 'a.pdf', size: 10 })
  check('novo utilizador cria contribuição', contrib.status === 201)
  const inv = await other.call('POST', `/projects/${project.data.id}/invitations`, { email: 'user@dcsimu.local' })
  check('convite a conta existente', inv.status === 201)
  check('convite a conta inexistente falha', (await other.call('POST', `/projects/${project.data.id}/invitations`, { email: 'nao@existe.pt' })).status === 404)

  // mudar o nome do projeto (barra do editor)
  const renamed = await other.call('PUT', `/projects/${project.data.id}`, { name: 'Projeto da Ana II' })
  check('proprietário muda o nome sem conteúdo', renamed.status === 200 && renamed.data.name === 'Projeto da Ana II' && renamed.data.revision === 0)
  check('nome mudado persiste', (await other.call('GET', `/projects/${project.data.id}`)).data.name === 'Projeto da Ana II')
  check('nome vazio rejeitado', (await other.call('PUT', `/projects/${project.data.id}`, { name: '   ' })).status === 400)
  check('mudar a revisão não é preciso ao mudar o nome', renamed.data.revision === 0)
  const memberInvites = (await user.call('GET', '/invitations')).data
  const memberInv = memberInvites.find((entry) => entry.project === 'Projeto da Ana II')
  check('convite pendente lista novo nome', !!memberInv)
  await user.call('POST', `/invitations/${memberInv.id}/accept`)
  check('membro editor não muda o nome', (await user.call('PUT', `/projects/${project.data.id}`, { name: 'Alterado pela E.' })).status === 403)
  check('membro editor guarda conteúdo', (await user.call('PUT', `/projects/${project.data.id}`, { content: { b: 2 }, revision: 0 })).status === 200)

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
  check('admin lista projetos com tamanho e membros', projects.length === 1 && projects[0].size > 0 && projects[0].members === 1 && projects[0].owner === 'ana@exemplo.pt')

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
  for (const action of ['login.success', 'login.failed', 'login.denied', 'user.create', 'user.update', 'user.disable', 'user.enable', 'user.password', 'user.password.self', 'session.revoke', 'user.delete', 'component.disable', 'component.enable', 'project.create', 'contribution.create']) check('registo ' + action, actions.has(action))
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
  const spoofedIp = new Client()
  let spoofedStatus = 0
  for (let i = 0; i < 6; i++) spoofedStatus = (await spoofedIp.call('POST', '/login', { email: 'limiter@example.pt', password: `errada-${i}` }, { headers: { 'X-Forwarded-For': `203.0.113.${i + 1}` } })).status
  check('X-Forwarded-For não permite contornar o bloqueio', spoofedStatus === 401 && (await spoofedIp.call('POST', '/login', { email: 'limiter@example.pt', password: 'qualquer' }, { headers: { 'X-Forwarded-For': '198.51.100.77' } })).status === 429)

  // sistema e exportação
  const system = (await admin.call('GET', '/admin/system')).data
  check('estado do sistema', system.backend === 'server' && system.counts.users === 3 && system.uptimeSec >= 0 && system.databaseBytes > 0)
  check('utilizador não vê o sistema', (await user.call('GET', '/admin/system')).status === 403)
  const exported = (await admin.call('GET', '/admin/export')).data
  check('exportação sem segredos', exported.users.length === 3 && !JSON.stringify(exported).match(/"password"|scrypt|Dcsimu2026!/i) && exported.logs.length > 0)

  // ---- SaaS: planos, limites, pedidos de plano, componentes e comentários ----
  {
    const pub = await new Client().call('GET', '/pricing')
    check('saas: preços públicos sem sessão', pub.status === 200 && pub.data.plans.length === 4 && pub.data.plans.some(p => p.id === 'pro' && p.highlighted) && !('updatedBy' in pub.data && pub.data.updatedBy))
    check('saas: utilizador não altera preços', (await user.call('PUT', '/admin/pricing', pub.data)).status === 403)
    check('saas: preço inválido recusado', (await admin.call('PUT', '/admin/pricing', { ...pub.data, plans: pub.data.plans.map(p => p.id === 'pro' ? { ...p, priceMonthly: -5 } : p) })).status === 400)
    check('saas: dois destaques recusados', (await admin.call('PUT', '/admin/pricing', { ...pub.data, plans: pub.data.plans.map(p => ({ ...p, highlighted: true })) })).status === 400)
    const edited = await admin.call('PUT', '/admin/pricing', { ...pub.data, plans: pub.data.plans.map(p => p.id === 'pro' ? { ...p, priceMonthly: 15, priceYearly: 150 } : p.id === 'escola' ? { ...p, showOnLanding: false } : p.id === 'free' ? { ...p, limits: { ...p.limits, projects: 2 } } : p) })
    const after = (await new Client().call('GET', '/pricing')).data
    check('saas: admin altera preços e cartões', edited.status === 200 && after.plans.find(p => p.id === 'pro').priceMonthly === 15 && after.plans.find(p => p.id === 'escola').showOnLanding === false)
    const settings = (await user.call('GET', '/settings')).data
    check('saas: definições trazem plano e preços', settings.plan === 'free' && settings.pricing.plans.length === 4 && Array.isArray(settings.components))
    // limite de projetos do Free (2)
    const plan0 = (await user.call('GET', '/account/plan')).data
    for (let i = plan0.projects; i < 2; i++) await user.call('POST', '/projects', { name: 'Free ' + i, content: {} })
    const over = await user.call('POST', '/projects', { name: 'Excesso', content: {} })
    check('saas: limite de projetos do Free aplicado no servidor', over.status === 402 && /2 projeto/.test(over.data.error))
    const mine = (await user.call('GET', '/projects')).data.filter(p => p.role === 'owner')
    check('saas: Free não partilha projetos', (await user.call('POST', `/projects/${mine[0].id}/invitations`, { email: 'admin@dcsimu.local' })).status === 402)
    const cFree = await user.call('GET', `/projects/${mine[0].id}/comments`)
    check('saas: Free lê mas não escreve comentários', cFree.status === 200 && cFree.data.canWrite === false && (await user.call('POST', `/projects/${mine[0].id}/comments`, { body: 'olá' })).status === 402)
    // pedido de plano → aprovação
    check('saas: admin não pede plano', (await admin.call('POST', '/account/plan-request', { plan: 'pro' })).status === 400)
    check('saas: plano inválido recusado', (await user.call('POST', '/account/plan-request', { plan: 'ouro' })).status === 400)
    const req1 = await user.call('POST', '/account/plan-request', { plan: 'pro', period: 'yearly', message: 'Para a turma' })
    check('saas: pedido de plano criado', req1.status === 201 && req1.data.status === 'pending')
    check('saas: pedido duplicado recusado', (await user.call('POST', '/account/plan-request', { plan: 'pro' })).status === 409)
    const pending = (await admin.call('GET', '/admin/plan-requests?status=pending')).data
    check('saas: admin vê pedidos pendentes', pending.length === 1 && pending[0].userEmail === 'user@dcsimu.local')
    check('saas: utilizador não aprova', (await user.call('POST', `/admin/plan-requests/${req1.data.id}`, { action: 'approve' })).status === 403)
    const approved = await admin.call('POST', `/admin/plan-requests/${req1.data.id}`, { action: 'approve', note: 'Pagamento confirmado' })
    const planNow = (await user.call('GET', '/account/plan')).data
    const days = (Date.parse(planNow.planExpiresAt) - Date.now()) / 86400000
    check('saas: aprovação aplica o plano com fim anual', approved.data.status === 'approved' && planNow.plan === 'pro' && days > 360 && days < 370 && planNow.pending === null)
    check('saas: pedido decidido não se decide outra vez', (await admin.call('POST', `/admin/plan-requests/${req1.data.id}`, { action: 'reject' })).status === 409)
    check('saas: Pro cria acima do limite Free', (await user.call('POST', '/projects', { name: 'Pro 3', content: {} })).status === 201)
    // conta fixa: plano editável, resto protegido
    const fixedU = (await admin.call('GET', '/admin/users')).data.find(u => u.email === 'user@dcsimu.local')
    check('saas: lista de utilizadores traz o plano', fixedU.plan === 'pro' && !!fixedU.planExpiresAt)
    check('saas: conta fixa continua protegida no nome', (await admin.call('PATCH', `/admin/users/${fixedU.id}`, { name: 'Outro', plan: 'free' })).status === 403)
    check('saas: plano inválido no PATCH', (await admin.call('PATCH', `/admin/users/${fixedU.id}`, { plan: 'ouro' })).status === 400)
    const expired = await admin.call('PATCH', `/admin/users/${fixedU.id}`, { planExpiresAt: '2000-01-01', adminNote: 'Cliente piloto' })
    check('saas: plano expirado volta ao Free', expired.status === 200 && expired.data.adminNote === 'Cliente piloto' && (await user.call('GET', '/settings')).data.plan === 'free')
    await admin.call('PATCH', `/admin/users/${fixedU.id}`, { plan: 'pro', planExpiresAt: null })
    // comentários num projeto partilhado: convidado Free comenta porque o dono é Pro
    const rui = (await admin.call('POST', '/admin/users', { name: 'Rui Free', email: 'rui@exemplo.pt', password: 'Segredo12345' })).data
    const ruiC = new Client()
    await ruiC.login('rui@exemplo.pt', 'Segredo12345')
    const shared = mine[0]
    check('saas: Pro convida', (await user.call('POST', `/projects/${shared.id}/invitations`, { email: 'rui@exemplo.pt' })).status === 201)
    check('saas: não membro não lê comentários', (await ruiC.call('GET', `/projects/${shared.id}/comments`)).status >= 403)
    const invR = (await ruiC.call('GET', '/invitations')).data[0]
    await ruiC.call('POST', `/invitations/${invR.id}/accept`)
    const c1 = await user.call('POST', `/projects/${shared.id}/comments`, { body: '  Revê o KM1, por favor.  ', anchor: 'ladder' })
    check('saas: dono comenta', c1.status === 201 && c1.data.body === 'Revê o KM1, por favor.' && c1.data.anchor === 'ladder')
    const c2 = await ruiC.call('POST', `/projects/${shared.id}/comments`, { body: 'Feito, troquei o contacto.' })
    check('saas: convidado Free comenta em projeto Pro', c2.status === 201 && c2.data.authorName === 'Rui Free')
    check('saas: comentário vazio recusado', (await ruiC.call('POST', `/projects/${shared.id}/comments`, { body: '   ' })).status === 400)
    check('saas: comentário longo recusado', (await ruiC.call('POST', `/projects/${shared.id}/comments`, { body: 'x'.repeat(2001) })).status === 400)
    check('saas: convidado não edita comentário alheio', (await ruiC.call('PATCH', `/projects/${shared.id}/comments/${c1.data.id}`, { body: 'hack' })).status === 403)
    check('saas: convidado não apaga comentário alheio', (await ruiC.call('DELETE', `/projects/${shared.id}/comments/${c1.data.id}`)).status === 403)
    const ed = await ruiC.call('PATCH', `/projects/${shared.id}/comments/${c2.data.id}`, { body: 'Feito: troquei o contacto NA.' })
    check('saas: autor edita o seu comentário', ed.status === 200 && !!ed.data.editedAt)
    check('saas: dono resolve comentário', (await user.call('PATCH', `/projects/${shared.id}/comments/${c2.data.id}`, { resolved: true })).data.resolved === true)
    const list = (await ruiC.call('GET', `/projects/${shared.id}/comments`)).data
    check('saas: ambos veem a conversa', list.comments.length === 2 && list.canWrite === true && list.comments[0].id === c1.data.id)
    check('saas: dono apaga comentário do convidado', (await user.call('DELETE', `/projects/${shared.id}/comments/${c2.data.id}`)).status === 200)
    // componentes: arquivar, eliminar, plano mínimo
    check('saas: bloquear exige motivo', (await admin.call('PUT', '/admin/components/timer', { status: 'blocked' })).status === 400)
    check('saas: estado inválido cai para ativo e plano inválido recusado', (await admin.call('PUT', '/admin/components/timer', { status: 'active', minPlan: 'ouro' })).status === 400)
    const arch = await admin.call('PUT', '/admin/components/timer', { status: 'archived', note: 'Substituído' })
    const del = await admin.call('PUT', '/admin/components/lamp', { status: 'deleted' })
    const prem = await admin.call('PUT', '/admin/components/vfd', { status: 'active', minPlan: 'pro' })
    const blk = await admin.call('PUT', '/admin/components/contactor', { status: 'blocked', note: 'Recolha' })
    const sets = (await ruiC.call('GET', '/settings')).data
    const st = Object.fromEntries(sets.components.map(c => [c.type, c]))
    check('saas: estados de componentes publicados', arch.data.status === 'archived' && del.data.status === 'deleted' && prem.data.minPlan === 'pro' && st.timer.status === 'archived' && st.lamp.status === 'deleted' && st.vfd.minPlan === 'pro' && st.contactor.status === 'blocked')
    check('saas: compatibilidade disabledComponents só com bloqueados', sets.disabledComponents.length === 1 && sets.disabledComponents[0].type === 'contactor')
    const restored = await admin.call('PUT', '/admin/components/timer', { status: 'active' })
    check('saas: repor componente arquivado', restored.data.status === 'active' && !(await ruiC.call('GET', '/settings')).data.components.some(c => c.type === 'timer'))
    const logs = new Set((await admin.call('GET', '/admin/logs?limit=500')).data.items.map(i => i.action))
    for (const action of ['pricing.update', 'plan.request', 'plan.approve', 'user.plan', 'comment.create', 'comment.update', 'comment.resolve', 'comment.delete', 'component.archive', 'component.delete', 'component.plan', 'component.block', 'component.restore']) check('saas: registo ' + action, logs.has(action))
    // eliminar conta com comentários não falha (FK em cascata)
    check('saas: eliminar conta com comentários', (await admin.call('DELETE', `/admin/users/${rui.id}?force=1`)).status === 200)
  }
} catch (error) {
  failures++
  console.log('FAIL exceção', error)
} finally {
  child.kill()
  await new Promise((resolve) => n8nMock.close(resolve))
  rmSync(dataDir, { recursive: true, force: true })
}
console.log(`\n${passed} passaram, ${failures} falharam`)
process.exit(failures ? 1 : 0)
