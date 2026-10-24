export type N8nConfig = {
  url: string
  apiKey: string
  workflowId: string
  webhookUrl: string
}

const STORAGE_KEY = 'dcsimu:n8n:config:v1'

const DEFAULT_CONFIG: N8nConfig = {
  url: 'http://localhost:5678',
  // Nunca embutir credenciais em código Vite: qualquer valor VITE_* é público.
  apiKey: '',
  workflowId: 'MipSJCjJ6fya9UGt',
  webhookUrl: '',
}

/** Obtém a configuração atual do n8n (localStorage > env público > defaults). */
export function getN8nConfig(): N8nConfig {
  const env = import.meta.env
  const envUrl = (env?.VITE_N8N_URL as string | undefined)?.trim()
  const envWorkflowId = (env?.VITE_N8N_WORKFLOW_ID as string | undefined)?.trim()
  const envWebhook = (env?.VITE_N8N_WEBHOOK_URL as string | undefined)?.trim()

  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<N8nConfig>
      // Chaves antigas (incluindo uma chave que chegou a estar no bundle) têm de ser reintroduzidas conscientemente.
      if (parsed.apiKey) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, apiKey: '' }))
      }
      return {
        url: parsed.url?.trim() || envUrl || DEFAULT_CONFIG.url,
        apiKey: '',
        workflowId: parsed.workflowId?.trim() || envWorkflowId || DEFAULT_CONFIG.workflowId,
        webhookUrl: parsed.webhookUrl?.trim() || envWebhook || DEFAULT_CONFIG.webhookUrl,
      }
    }
  } catch {
    /* fallback */
  }

  return {
    url: envUrl || DEFAULT_CONFIG.url,
    apiKey: '',
    workflowId: envWorkflowId || DEFAULT_CONFIG.workflowId,
    webhookUrl: envWebhook || DEFAULT_CONFIG.webhookUrl,
  }
}

/** Guarda apenas URLs/IDs públicos; nunca persiste chaves fornecidas pelo utilizador. */
export function saveN8nConfig(patch: Partial<N8nConfig>): void {
  try {
    const current = getN8nConfig()
    const next = { ...current, ...patch, apiKey: '' }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* noop */
  }
}

/** Verifica se há um destino ou uma chave de API pessoal configurados. */
export function isN8nConfigured(): boolean {
  const { url, apiKey, workflowId, webhookUrl } = getN8nConfig()
  return Boolean(webhookUrl || (url && apiKey && workflowId))
}

export type N8nPayload = {
  event: 'grafcet.export' | 'grafcet.run' | 'project.save' | 'simulation.start' | 'manual.trigger'
  workflowId?: string
  timestamp: string
  grafcet?: {
    stepsCount: number
    transitionsCount: number
    steps: unknown[]
    transitions: unknown[]
    ladder?: string
  }
  project?: {
    name?: string
    id?: string
  }
  meta?: Record<string, unknown>
}

type N8nResult = { ok: boolean; message: string; details?: unknown }

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => ({}))
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function validApiUrl(base: string, workflowId: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(workflowId)) return null
  try {
    const url = new URL(base)
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.protocol === 'http:' && !isLoopback)) return null
    return new URL(`/api/v1/workflows/${encodeURIComponent(workflowId)}`, url).toString()
  } catch {
    return null
  }
}

/** Envia apenas para o proxy autenticado ou para o webhook escolhido pelo utilizador. */
export async function triggerN8nWorkflow(
  payload: Partial<N8nPayload>
): Promise<N8nResult> {
  const config = getN8nConfig()
  const fullPayload: N8nPayload = {
    event: payload.event || 'manual.trigger',
    workflowId: config.workflowId,
    timestamp: new Date().toISOString(),
    ...payload,
  }

  // O servidor ignora destinos enviados pelo navegador; usa apenas N8N_WEBHOOK_URL.
  try {
    const proxyRes = await fetch('/api/n8n/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ payload: fullPayload }),
    })
    const contentType = proxyRes.headers.get('content-type') || ''
    if (contentType.toLowerCase().includes('application/json')) {
      const data = await responseJson(proxyRes)
      if (proxyRes.ok && data.ok === true) {
        return { ok: true, message: 'Workflow n8n acionado com sucesso (via servidor)!', details: data }
      }
      // Um servidor respondeu com erro real: não repetir um disparo que possa ter sido aceite.
      if (![404, 405].includes(proxyRes.status)) {
        return { ok: false, message: typeof data.error === 'string' ? data.error : `Falha no servidor n8n (${proxyRes.status}).` }
      }
    }
  } catch {
    /* Deploy estático/API indisponível: tenta o webhook configurado no navegador. */
  }

  if (!config.webhookUrl) return { ok: false, message: 'Configure o webhook n8n antes de enviar.' }
  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullPayload),
    })
    if (!response.ok) return { ok: false, message: `O webhook n8n respondeu com erro HTTP ${response.status}.` }
    return { ok: true, message: 'Dados enviados para o webhook n8n.' }
  } catch {
    return { ok: false, message: 'Não foi possível contactar o webhook n8n. Verifique o URL, a rede e o CORS.' }
  }
}

/** Testa a ligação sem executar o workflow. */
export async function testN8nConnection(overrides: Partial<N8nConfig> = {}): Promise<{ ok: boolean; message: string; workflowName?: string }> {
  const config = { ...getN8nConfig(), ...overrides }

  // Preferir as credenciais privadas do servidor, sem expor a chave à aplicação cliente.
  try {
    const proxyRes = await fetch('/api/n8n/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: '{}',
    })
    const data = await responseJson(proxyRes)
    if (proxyRes.ok && data.ok === true) {
      const workflowName = typeof data.workflowName === 'string' ? data.workflowName : config.workflowId
      return { ok: true, message: `Workflow «${workflowName}» verificado no servidor n8n.`, workflowName }
    }
  } catch {
    /* Deploy estático/API indisponível: tenta a chave pessoal guardada no navegador. */
  }

  if (config.apiKey && config.workflowId) {
    const endpoint = validApiUrl(config.url, config.workflowId)
    if (!endpoint) return { ok: false, message: 'URL inválido: use HTTPS (ou localhost) e um identificador de workflow válido.' }
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'X-N8N-API-KEY': config.apiKey, Accept: 'application/json' },
      })
      if (response.ok) {
        const workflow = await responseJson(response)
        const workflowName = typeof workflow.name === 'string' ? workflow.name : config.workflowId
        return { ok: true, message: `Workflow «${workflowName}» verificado.`, workflowName }
      }
      return { ok: false, message: `A API n8n respondeu com erro HTTP ${response.status}.` }
    } catch {
      return { ok: false, message: 'Não foi possível verificar a API n8n. Confirme o URL, a chave e o CORS.' }
    }
  }

  return { ok: false, message: 'Não foi possível confirmar a ligação. Configure N8N_URL e as credenciais no servidor ou introduza uma chave de API pessoal.' }
}
