/** Real local adapter and real PostgREST client, with isolated synthetic storage.
 * Does not contact or migrate the user's cloud projects. */
import assert from 'node:assert/strict'
import { isNativeProjectId, RETAINED_NATIVE_PROJECT_ID as retained } from '../src/project/nativeProjectIds'
import { isNativeProjectMeta, buildProjectPreview } from '../src/dashboard/projectPreview'
import * as sandbox from '../src/project/freeNativeSandbox'

let checks = 0
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); console.log('PASS — ' + label); checks++ }
const memory = new Map<string, string>()
let writes = 0
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { writes++; memory.set(key, value) },
  removeItem: (key: string) => { writes++; memory.delete(key) },
}
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
const old = 'native-partida-direta-v5', legacy = 'grafcet-exemplo-basico'
for (const id of [old, legacy, 'grafcet-personal', 'native-estrela-personal', 'my-project']) {
  equal(isNativeProjectId(id), false, 'not native by prefix: ' + id)
  equal(isNativeProjectMeta(id, 'O meu trabalho (nativo)'), false, 'not native by name: ' + id)
}
equal(isNativeProjectId(retained), true, 'only the retained cloud identity is native')
equal(sandbox.freeNativeProjectSeeds(), [], 'no synthetic native seeds')
equal(sandbox.listMissingFreeNativeProjects('u', []), [], 'new account has no fabricated cards')
equal(sandbox.hasLegacyFreeNativeDraft('u', retained), false, 'retained UUID is never intercepted by offline sandbox')
assert.throws(() => sandbox.openFreeNativeProject('u', retained), /não encontrado/); checks++

const draftKey = 'dcsimu:free-native-draft:v1:u:' + legacy
const draft = { revision: 7, updatedAt: '2026-11-17T00:00:00Z', content: { projectName: 'Meu rascunho', grafcet: { steps: [{ id: 'mine', x: 42, y: 13 }] } } }
memory.set(draftKey, JSON.stringify(draft))
const beforeDraft = memory.get(draftKey)
equal(sandbox.openFreeNativeProject('u', legacy).content, draft.content, 'legacy content is opened without reconstruction')
equal(sandbox.listMissingFreeNativeProjects('u', []).map(p => [p.id, p.revision]), [[legacy, 7]], 'only an actually saved draft is listed')
equal(sandbox.listMissingFreeNativeProjects('v', []), [], 'another account cannot see this draft')
equal(sandbox.listMissingFreeNativeProjects('u', [{ id: legacy }]), [], 'real row takes precedence over legacy draft')
equal(memory.get(draftKey), beforeDraft, 'reading never migrates or rewrites draft bytes')
equal(writes, 0, 'all classification and draft reads are write-free')
assert.throws(() => sandbox.saveFreeNativeProject('u', legacy, {}, 6), /outro separador/); checks++
const changedDraft = { ...draft.content, annotation: 'explicit save' }
equal(sandbox.saveFreeNativeProject('u', legacy, changedDraft, 7).revision, 8, 'explicit draft save preserves revision semantics')
equal(sandbox.openFreeNativeProject('u', legacy).content, changedDraft, 'saved legacy draft remains editable')
equal(sandbox.resetFreeNativeProject('u', legacy), { ok: true }, 'explicit deletion removes only this draft')
equal(sandbox.listMissingFreeNativeProjects('u', []), [], 'deleting a legacy draft never reseeds it')

const { localApi } = await import('../src/auth/localBackend')
const dataKey = 'dcsimu:account:data:v1'
memory.set('dcsimu:account:session:v1', 'dcsimu-admin')
memory.set(dataKey, JSON.stringify({ projects: [], invitations: [] }))
writes = 0
equal(await localApi('/projects'), [], 'local admin list has no auto-created examples')
equal(writes, 0, 'reading empty local data is write-free')
const content = { components: [], wires: [], nativeId: 'personal-marker', note: 'empty is a valid saved project' }
const row = (id: string, ownerId = 'dcsimu-admin') => ({ id, name: 'Same name (nativo)', ownerId, memberIds: ['dcsimu-user', 'dcsimu-admin'], content: structuredClone(content), revision: 23, updatedAt: '2026-11-17T00:00:00Z' })
const stored = { projects: [row(retained), row(old), row('grafcet-personal'), row('another-personal', 'dcsimu-user')], invitations: [] }
memory.set(dataKey, JSON.stringify(stored)); writes = 0
const listed = await localApi<any[]>('/projects')
equal(listed.map(p => p.id).sort(), stored.projects.map(p => p.id).sort(), 'local list retains every accessible personal/legacy row')
equal(listed.find(p => p.id === retained).preview, buildProjectPreview(content), 'empty retained project does not receive a fake cover')
equal((await localApi<any>('/projects/' + retained)).content, content, 'local opening returns the actual retained content')
equal((await localApi<any>('/landing/published')).content, content, 'local landing uses actual retained row if present')
equal(memory.get(dataKey), JSON.stringify(stored), 'local reads preserve all original project bytes')
equal(writes, 0, 'local list/open/landing never write')
await assert.rejects(localApi('/projects/' + retained, 'DELETE'), /retido/); checks++
await assert.rejects(localApi('/admin/projects/' + retained, 'DELETE'), /retido/); checks++
equal(memory.get(dataKey), JSON.stringify(stored), 'protected deletion does not reset the retained project')
memory.set('dcsimu:account:session:v1', 'dcsimu-user')
equal((await localApi<any[]>('/projects')).map(p => p.id).sort(), stored.projects.map(p => p.id).sort(), 'ordinary user list preserves sharing without adding examples')
memory.set(dataKey, JSON.stringify({ projects: [], invitations: [] }))
equal((await localApi<any>('/landing/published')).isNative, false, 'offline demo is explicitly not a real native cloud project')
equal((await localApi<any>('/landing/published')).projectId, '', 'offline demo never borrows the retained UUID')

const { saveSupabaseConfig, getSupabase, clearSupabaseConfig } = await import('../src/supabase/supabaseClient')
const api = await import('../src/supabase/supabaseBackend')
const originalFetch = globalThis.fetch
let remoteRows = stored.projects.map(p => ({ id: p.id, name: p.name, owner_id: 'policy-user', revision: p.revision, updated_at: p.updatedAt, content: p.content }))
const requests: Array<{ method: string; path: string }> = []
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input)), method = init?.method ?? 'GET'
  assert.equal(url.origin, 'https://synthetic-native-policy.invalid', 'no external requests')
  requests.push({ method, path: url.pathname })
  if (method !== 'GET') throw new Error('Unexpected remote mutation: ' + method)
  const table = url.pathname.split('/').at(-1)
  let value: unknown
  if (table === 'projects') {
    const filter = url.searchParams.get('id')?.replace(/^eq\./, '')
    value = filter ? remoteRows.find(p => p.id === filter) ?? null : remoteRows
    if (!value) return Response.json({ message: 'No row visible', code: 'PGRST116' }, { status: 406 })
  } else if (table === 'platform_settings') value = null
  else if (table === 'profiles') value = { role: 'admin' }
  else throw new Error('Unexpected table: ' + table)
  return Response.json(value)
}
try {
  saveSupabaseConfig('https://synthetic-native-policy.invalid', 'synthetic-publishable-key')
  const client = getSupabase()!
  client.auth.getUser = async () => ({ data: { user: { id: 'policy-user' } }, error: null }) as any
  equal((await api.supabaseGetProjects()).map(p => p.id).sort(), remoteRows.map(p => p.id).sort(), 'PostgREST list preserves same-name and prefixed personal projects')
  const actual = await api.supabaseGetProject(retained)
  equal([actual.id, actual.revision, actual.content], [retained, 23, content], 'retained project goes to actual REST row, never a local seed')
  equal((await api.supabaseGetLandingPublished()).content, content, 'cloud landing reads retained content instead of a bundled example')
  equal(requests.every(r => r.method === 'GET'), true, 'cloud list/open/landing issue zero mutations')
  remoteRows = remoteRows.filter(p => p.id !== retained)
  equal((await api.supabaseGetProjects()).some(p => p.id === retained), false, 'missing retained row is not fabricated')
  await assert.rejects(api.supabaseGetProject(retained), /No row visible/); checks++
  equal((await api.supabaseGetLandingPublished()).isNative, false, 'missing/denied cloud row is an honest offline demo')
  await assert.rejects(api.supabaseDeleteProject(retained), /retido/); checks++
  equal(requests.every(r => r.method === 'GET'), true, 'protected cloud delete makes no request and never reseeds')
  equal(remoteRows.find(p => p.id === 'grafcet-personal')?.content, content, 'personal cloud content is untouched')
} finally { clearSupabaseConfig(); globalThis.fetch = originalFetch }
console.log(`\nPASS — ${checks} native-policy assertions (isolated local/REST, not live cloud acceptance)`)
