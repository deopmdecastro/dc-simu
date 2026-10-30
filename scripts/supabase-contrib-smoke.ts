import assert from 'node:assert/strict'

// REST sintético: executa o cliente PostgREST real sem contas nem base de dados remotas.
// Como no Supabase real, contributions.author_id → auth.users: um join com profiles dá PGRST200.
const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) }, configurable: true })
const { saveSupabaseConfig, getSupabase, clearSupabaseConfig } = await import('../src/supabase/supabaseClient')
const { supabaseContrib } = await import('../src/contrib/supabaseContrib')
const user = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000003'
const rows = [
  { id: 'c-1', kind: 'glb', title: 'Relé térmico', component_type: null, description: '', file_name: 'rele.glb', size: 10, author_id: user, status: 'pending', created_at: '2026-10-30T10:00:00Z', updated_at: '2026-10-30T10:00:00Z' },
  { id: 'c-2', kind: 'glb', title: 'Contactor', component_type: null, description: '', file_name: 'km.glb', size: 10, author_id: other, status: 'approved', created_at: '2026-10-29T10:00:00Z', updated_at: '2026-10-29T10:00:00Z' },
]
const requests: URL[] = []
let hiddenProfiles = false
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input))
  assert.equal(url.origin, 'https://synthetic-contrib.invalid', 'nenhum pedido externo')
  requests.push(url)
  const table = url.pathname.split('/').at(-1), select = url.searchParams.get('select') ?? ''
  if (select.includes('(')) return new Response(JSON.stringify({ code: 'PGRST200', message: "Could not find a relationship between 'contributions' and 'author_id' in the schema cache" }), { status: 400 })
  let data: unknown = []
  if (table === 'profiles') data = hiddenProfiles ? [] : [{ id: user, name: 'Autor de teste', email: 'autor@example.invalid' }, { id: other, name: 'Outro autor', email: 'outro@example.invalid' }]
  else if (table === 'contributions') {
    const id = url.searchParams.get('id')?.replace(/^eq\./, '')
    const list = id ? rows.filter((row) => row.id === id) : rows
    data = init?.headers && String((init.headers as Record<string, string>).Accept ?? '').includes('vnd.pgrst.object') ? list[0] ?? null : list
  } else throw new Error(`Pedido não previsto: ${url.pathname}`)
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
try {
  saveSupabaseConfig('https://synthetic-contrib.invalid', 'synthetic-publishable-key')
  const client = getSupabase()!
  client.auth.getUser = async () => ({ data: { user: { id: user } }, error: null }) as any
  const listed = await supabaseContrib.list()
  assert.equal(listed.length, 2)
  assert.deepEqual(listed.map((c) => [c.authorName, c.authorEmail]), [['Autor de teste', 'autor@example.invalid'], ['Outro autor', 'outro@example.invalid']], 'nomes e emails dos autores vêm de profiles')
  hiddenProfiles = true
  assert.equal((await supabaseContrib.list())[0].authorName, 'Utilizador', 'RLS pode ocultar um perfil sem ocultar a contribuição')
  assert.ok(requests.filter((url) => url.pathname.endsWith('/contributions')).every((url) => !url.searchParams.get('select')?.includes('(')), 'nenhum pedido a contributions usa joins')
  console.log('PASS — Contribuições Supabase: listar sem join a profiles (author_id → auth.users), nomes e emails por consulta à parte, perfis ocultos por RLS')
} finally {
  clearSupabaseConfig(); globalThis.fetch = originalFetch
}
