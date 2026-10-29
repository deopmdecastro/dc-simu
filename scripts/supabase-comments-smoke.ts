import assert from 'node:assert/strict'

// REST sintético: executa o cliente PostgREST real sem contas nem base de dados remotas.
const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) }, configurable: true })
const { saveSupabaseConfig, getSupabase, clearSupabaseConfig } = await import('../src/supabase/supabaseClient')
const api = await import('../src/supabase/supabaseBackend')
const user = '00000000-0000-4000-8000-000000000001'
const project = '00000000-0000-4000-8000-000000000002'
let rows = [{ id: 'comment-1', project_id: project, author_id: user, body: 'Verificar ligação', anchor: '3d', resolved: false, created_at: '2026-10-29T00:00:00Z' }]
const requests: { method: string; url: URL }[] = []
let hiddenNames = false, nameFailure = false, denied = false
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input))
  assert.equal(url.origin, 'https://synthetic-comments.invalid', 'nenhum pedido externo')
  const method = init?.method ?? 'GET'
  requests.push({ method, url })
  const table = url.pathname.split('/').at(-1), select = url.searchParams.get('select') ?? ''
  let data: unknown = []
  if (select.includes('(')) return new Response(JSON.stringify({ code: 'PGRST200', message: "Could not find a relationship between 'project_comments' and 'author_id' in the schema cache" }), { status: 400 })
  if (table === 'profiles') {
    if (select === 'id,name') {
      if (nameFailure) throw new TypeError('falha sintética ao ler nomes')
      data = hiddenNames ? [] : [{ id: user, name: 'Autor de teste' }]
    } else data = [{ id: user, role: 'admin', plan: 'free', plan_expires_at: null }]
  } else if (table === 'projects') data = [{ owner_id: user }]
  else if (table === 'platform_settings') data = []
  else if (table === 'project_comments') {
    assert.equal(method === 'POST' ? JSON.parse(String(init?.body)).project_id : url.searchParams.get('project_id'), method === 'POST' ? project : `eq.${project}`, 'comentários limitados ao projeto pedido')
    if (denied) return new Response(JSON.stringify({ message: 'Sem acesso ao projeto', code: '42501' }), { status: 403 })
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body)); const row = { ...rows[0], ...body, id: 'comment-2' }; rows.push(row); data = row
    } else if (method === 'PATCH') {
      rows[0] = { ...rows[0], ...JSON.parse(String(init?.body)) }; data = rows[0]
    } else data = select === 'author_id' ? [{ author_id: user }] : rows
  } else throw new Error(`Pedido não previsto: ${url.pathname}`)
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
try {
  saveSupabaseConfig('https://synthetic-comments.invalid', 'synthetic-publishable-key')
  const client = getSupabase()!
  client.auth.getUser = async () => ({ data: { user: { id: user } }, error: null }) as any
  const listed = await api.supabaseListComments(project)
  assert.equal(listed.comments[0].authorName, 'Autor de teste')
  assert.equal(listed.canWrite, true)
  assert.equal((await api.supabaseAddComment(project, { body: 'Nova nota', anchor: 'grafcet' })).body, 'Nova nota')
  assert.equal((await api.supabaseUpdateComment(project, 'comment-1', { resolved: true })).resolved, true)
  hiddenNames = true
  assert.equal((await api.supabaseListComments(project)).comments[0].authorName, 'Utilizador', 'RLS pode ocultar um perfil sem ocultar o comentário')
  hiddenNames = false; nameFailure = true
  assert.equal((await api.supabaseAddComment(project, { body: 'Envio único' })).body, 'Envio único', 'falha no nome não faz falhar uma escrita concluída')
  nameFailure = false; denied = true
  await assert.rejects(api.supabaseListComments(project), /Sem acesso/)
  assert.ok(requests.filter(r => r.url.pathname.endsWith('/project_comments')).every(r => !r.url.searchParams.get('select')?.includes('(')))
  console.log('PASS — Comentários Supabase: listar, criar e resolver sem joins; nomes com RLS; escrita preservada e erros de acesso propagados')
} finally {
  clearSupabaseConfig(); globalThis.fetch = originalFetch
}
