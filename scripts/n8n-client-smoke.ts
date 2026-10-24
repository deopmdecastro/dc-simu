import assert from 'node:assert/strict'
import { getN8nConfig, saveN8nConfig, testN8nConnection, triggerN8nWorkflow } from '../src/n8n/n8nClient'

const storageValues = new Map<string, string>()
const storage = {
  getItem: (key: string) => storageValues.get(key) ?? null,
  setItem: (key: string, value: string) => { storageValues.set(key, value) },
  removeItem: (key: string) => { storageValues.delete(key) },
  clear: () => storageValues.clear(),
}
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })

const requests: Array<{ url: string; method: string; headers: Headers; body?: string }> = []
let respond: (url: string, init?: RequestInit) => Response | Promise<Response> = () => new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } })
const originalFetch = globalThis.fetch
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push({ url, method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: typeof init?.body === 'string' ? init.body : undefined })
    return respond(url, init)
  },
})

const check = (name: string, condition: unknown) => {
  assert.ok(condition, name)
  console.log(`PASS — ${name}`)
}
const reset = () => { requests.length = 0; storage.clear() }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

try {
  reset()
  saveN8nConfig({ url: 'https://n8n.example', workflowId: 'workflow_test', webhookUrl: 'https://hooks.example/run', apiKey: 'must-not-persist' })
  check('chave pessoal não é persistida na configuração', JSON.parse(storage.getItem('dcsimu:n8n:config:v1') || '{}').apiKey === '' && getN8nConfig().apiKey === '')

  reset()
  storage.setItem('dcsimu:n8n:config:v1', JSON.stringify({ url: 'https://n8n.example', workflowId: 'workflow_test', webhookUrl: '', apiKey: 'legacy-secret' }))
  getN8nConfig()
  check('chave legada de localStorage é apagada', JSON.parse(storage.getItem('dcsimu:n8n:config:v1') || '{}').apiKey === '')

  reset()
  respond = (url) => url === '/api/n8n/test' ? json({ error: 'rota não disponível' }, 404) : json({ name: 'Workflow validado' })
  const directTest = await testN8nConnection({ url: 'https://n8n.example', workflowId: 'workflow_test', apiKey: 'personal-test-key' })
  check('chave pessoal é usada apenas no teste direto HTTPS', directTest.ok && requests.length === 2 && requests[1].url === 'https://n8n.example/api/v1/workflows/workflow_test' && requests[1].headers.get('X-N8N-API-KEY') === 'personal-test-key')

  reset()
  respond = () => json({ error: 'rota não disponível' }, 404)
  const insecureTest = await testN8nConnection({ url: 'http://n8n.example:5678', workflowId: 'workflow_test', apiKey: 'personal-test-key' })
  check('chave pessoal não é enviada por HTTP remoto', !insecureTest.ok && requests.length === 1)

  reset()
  saveN8nConfig({ webhookUrl: 'https://hooks.example/run' })
  respond = () => json({ error: 'Inicie sessão' }, 401)
  const unauthorizedTrigger = await triggerN8nWorkflow({ event: 'manual.trigger' })
  check('resposta 401 do servidor não contorna a sessão via webhook direto', !unauthorizedTrigger.ok && requests.length === 1)

  reset()
  saveN8nConfig({ webhookUrl: 'https://hooks.example/run' })
  respond = (url) => url === '/api/n8n/trigger'
    ? new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
    : json({ accepted: true })
  const staticTrigger = await triggerN8nWorkflow({ event: 'grafcet.export' })
  check('deploy estático pode usar o webhook explicitamente configurado', staticTrigger.ok && requests.length === 2 && requests[1].url === 'https://hooks.example/run' && !requests[1].headers.has('X-N8N-API-KEY'))

  reset()
  saveN8nConfig({ webhookUrl: 'https://hooks.example/run' })
  respond = () => json({ ok: true, source: 'webhook' })
  const proxiedTrigger = await triggerN8nWorkflow({ event: 'grafcet.export' })
  check('proxy autenticado com sucesso não dispara um segundo pedido direto', proxiedTrigger.ok && requests.length === 1)
} finally {
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch })
  delete (globalThis as typeof globalThis & { localStorage?: unknown }).localStorage
}
