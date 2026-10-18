// Executar dentro do contentor n8n: ver README.md.
import assert from 'node:assert/strict'

const base = process.env.N8N_SANDBOX_SERVICE_URL
const key = process.env.N8N_SANDBOX_SERVICE_API_KEY
assert.ok(base && key, 'A ligação ao sandbox deve estar configurada no n8n')
const headers = { 'X-Api-Key': key, 'Content-Type': 'application/json' }
const request = (path, options = {}) => fetch(`${base}${path}`, {
  ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(90000),
})
const health = await request('/healthz')
assert.equal(health.status, 200)
assert.equal((await health.json()).status, 'ok')
console.log('PASS sandbox API acessível a partir do n8n')

const unauthorized = await fetch(`${base}/sandboxes`, { signal: AbortSignal.timeout(5000) })
assert.ok([401, 403].includes(unauthorized.status), 'Sandbox API deve exigir autenticação')
console.log('PASS sandbox API exige chave')

let sandboxId
try {
  const created = await request('/sandboxes', { method: 'POST', body: JSON.stringify({ ephemeral: true, egress: 'none' }) })
  if (!created.ok) throw new Error(`Criação de sandbox: HTTP ${created.status} ${await created.text()}`)
  sandboxId = (await created.json()).id
  assert.ok(sandboxId)
  const execution = await request(`/sandboxes/${sandboxId}/executions`, {
    method: 'POST', body: JSON.stringify({ command: "python3 -c 'print(6 * 7)'", timeout_ms: 10000 }),
  })
  assert.equal(execution.status, 200)
  const events = (await execution.text()).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  assert.ok(events.some(event => event.type === 'exit' && event.success === true && event.exit_code === 0))
  assert.ok(events.filter(event => event.type === 'stdout').map(event => event.data).join('').includes('42'))
  console.log('PASS execução Python real no sandbox: 6 * 7 = 42')
} finally {
  if (sandboxId) {
    const removed = await request(`/sandboxes/${sandboxId}`, { method: 'DELETE' })
    assert.equal(removed.status, 204)
    console.log('PASS sandbox de teste eliminado')
  }
}

const search = new URL('/search', process.env.N8N_INSTANCE_AI_SEARXNG_URL)
search.searchParams.set('q', 'n8n documentation')
search.searchParams.set('format', 'json')
const response = await fetch(search, { signal: AbortSignal.timeout(30000) })
assert.equal(response.status, 200)
const result = await response.json()
assert.ok(Array.isArray(result.results) && result.results.length > 0)
console.log(`PASS pesquisa SearXNG a partir do n8n: ${result.results.length} resultados JSON`)
