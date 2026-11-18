/** Real Express + SQLite, isolated disposable database; no live cloud or user data. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { RETAINED_NATIVE_PROJECT_ID as retained } from '../src/project/nativeProjectPolicy.mjs'

let checks = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); console.log('PASS — ' + label); checks++ }
const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening')
const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve))
const dataDir = mkdtempSync(path.join(tmpdir(), 'dc-native-policy-'))
const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: path.resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'],
  env: { PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: 'test', ADMIN_INITIAL_PASSWORD: 'SyntheticAdmin2026!Only', USER_INITIAL_PASSWORD: 'SyntheticUser2026!Only' },
})
let logs = '', db
child.stderr.on('data', b => { logs += b })
const call = async (cookie, method, route, body) => {
  const res = await fetch(`http://127.0.0.1:${port}/api${route}`, { method, headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' }
}
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server not ready: ' + logs)), 30000)
    child.stdout.on('data', b => { logs += b; if (logs.includes('DC-SIMU API ready')) { clearTimeout(timer); resolve() } })
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited ' + code + ': ' + logs)) })
    child.once('error', reject)
  })
  db = new Database(path.join(dataDir, 'dcsimu.sqlite'))
  db.pragma('foreign_keys = ON')
  const admin = await call('', 'POST', '/login', { email: 'admin@dcsimu.local', password: 'SyntheticAdmin2026!Only' })
  eq(admin.status, 200, 'isolated admin authenticates against the real server')
  eq((await call(admin.cookie, 'GET', '/projects')).data, [], 'server has no fabricated native cards')
  const owner = await call(admin.cookie, 'POST', '/admin/users', { name: 'Synthetic Owner', email: 'synthetic-owner@example.invalid', password: 'SyntheticOwner2026!Only' })
  eq(owner.status, 201, 'disposable ordinary owner created')
  const user = await call('', 'POST', '/login', { email: 'synthetic-owner@example.invalid', password: 'SyntheticOwner2026!Only' })
  eq(user.status, 200, 'ordinary owner authenticates')
  const insert = db.prepare('INSERT INTO projects(id,name,owner_id,content,revision,updated_at) VALUES(?,?,?,?,?,?)')
  const content = '{"components":[],"wires":[],"nativeId":"personal-marker","annotation":"preserve exact bytes"}'
  for (const id of [retained, 'native-partida-direta-v5', 'grafcet-personal', 'personal-other']) insert.run(id, 'Same name (nativo)', owner.data.id, content, 25, '2026-11-17T00:00:00Z')
  const snapshot = () => db.prepare('SELECT * FROM projects ORDER BY id').all()
  const before = snapshot()
  const list = await call(user.cookie, 'GET', '/projects')
  eq(list.data.map(p => p.id).sort(), before.map(p => p.id).sort(), 'server lists only actual accessible projects without hiding personal/legacy rows')
  eq(list.data.find(p => p.id === retained).preview.components, [], 'empty retained content has an honest empty preview')
  eq((await call(user.cookie, 'GET', '/projects/' + retained)).data.content, JSON.parse(content), 'server opens actual retained content')
  eq(snapshot(), before, 'listing/opening does not rewrite project rows')
  eq((await call(user.cookie, 'DELETE', '/projects/' + retained)).status, 403, 'ordinary owner cannot delete the exact retained identity')
  eq((await call(admin.cookie, 'DELETE', '/admin/projects/' + retained)).status, 403, 'admin cannot delete the exact retained identity')
  eq((await call(admin.cookie, 'DELETE', '/admin/users/' + owner.data.id + '?force=1')).status, 409, 'force user deletion refuses the retained-project cascade')
  eq(snapshot(), before, 'refused cascade preserves every project byte, including personal projects')
  eq(!!db.prepare('SELECT 1 FROM users WHERE id=?').get(owner.data.id), true, 'refused cascade preserves the owner account')
  eq((await call(user.cookie, 'DELETE', '/projects/native-partida-direta-v5')).status, 200, 'an explicitly selected legacy project remains deletable by its owner')
  eq((await call(admin.cookie, 'DELETE', '/admin/projects/grafcet-personal')).status, 200, 'an explicitly selected personal prefix project remains admin-deletable')
  eq(db.prepare('SELECT content,revision,updated_at FROM projects WHERE id=?').get(retained), { content, revision: 25, updated_at: '2026-11-17T00:00:00Z' }, 'explicit unrelated deletions never reset the retained project')
  eq((await call(user.cookie, 'PUT', '/projects/' + retained, { content: { components: [], note: 'explicit save' }, revision: 25 })).data.revision, 26, 'retained protection does not prevent an authorized explicit save')
  eq((await call(user.cookie, 'PUT', '/projects/' + retained, { content: {}, revision: 25 })).status, 409, 'retained project still enforces optimistic revisions')
  eq((await call(user.cookie, 'PUT', '/projects/' + retained, { name: 'Explicit retained rename' })).status, 200, 'retained protection does not infer immutability from a name')
  const final = snapshot()
  eq((await call(user.cookie, 'GET', '/projects')).data.length, 2, 'no old native project is reseeded after explicit deletion')
  eq(snapshot(), final, 'final server reads remain write-free')
  console.log(`\nPASS — ${checks} real Express/SQLite native-policy assertions`)
} finally {
  db?.close()
  if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit') }
  rmSync(dataDir, { recursive: true, force: true })
}
