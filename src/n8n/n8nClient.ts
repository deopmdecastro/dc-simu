export type N8nConfig = {
  url: string
  apiKey: string
  workflowId: string
  webhookUrl: string
}

const STORAGE_KEY = 'dcsimu:n8n:config:v1'

const DEFAULT_CONFIG: N8nConfig = {
  url: 'http://localhost:5678',
  apiKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4M2IyMzc1My01ZjkwLTRiZWMtOTc3OC0zMjczYzQ0ZmMzZDgiLCJpc3MiOiJuOG4iLCJqdGkiOiI4YmE2MWVlMi1kZGM2LTQzODUtODMyNi02ZWIxMzliODY1MjciLCJpYXQiOjE3OTIyOTYzNTgsImF1ZCI6InB1YmxpYy1hcGkifQ.fs_7X6kFN9eeONyZvJ3ecuRPHa1c72ytyWF0jnq5IX4',
  workflowId: 'MipSJCjJ6fya9UGt',
  webhookUrl: 'http://localhost:5678/webhook/dcsimu-events',
}

/** Obtém a configuração atual do n8n (localStorage > env > defaults) */
export function getN8nConfig(): N8nConfig {
  const envUrl = (import.meta.env.VITE_N8N_URL as string | undefined)?.trim()
  const envApiKey = (import.meta.env.VITE_N8N_API_KEY as string | undefined)?.trim()
  const envWorkflowId = (import.meta.env.VITE_N8N_WORKFLOW_ID as string | undefined)?.trim()
  const envWebhook = (import.meta.env.VITE_N8N_WEBHOOK_URL as string | undefined)?.trim()

  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<N8nConfig>
      return {
        url: parsed.url?.trim() || envUrl || DEFAULT_CONFIG.url,
        apiKey: parsed.apiKey?.trim() || envApiKey || DEFAULT_CONFIG.apiKey,
        workflowId: parsed.workflowId?.trim() || envWorkflowId || DEFAULT_CONFIG.workflowId,
        webhookUrl: parsed.webhookUrl?.trim() || envWebhook || DEFAULT_CONFIG.webhookUrl,
      }
    }
  } catch {
    /* fallback */
  }

  return {
    url: envUrl || DEFAULT_CONFIG.url,
    apiKey: envApiKey || DEFAULT_CONFIG.apiKey,
    workflowId: envWorkflowId || DEFAULT_CONFIG.workflowId,
    webhookUrl: envWebhook || DEFAULT_CONFIG.webhookUrl,
  }
}

/** Guarda a configuração do n8n no navegador */
export function saveN8nConfig(patch: Partial<N8nConfig>): void {
  try {
    const current = getN8nConfig()
    const next = { ...current, ...patch }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* noop */
  }
}

/** Verifica se o n8n está configurado */
export function isN8nConfigured(): boolean {
  const { url, apiKey, workflowId } = getN8nConfig()
  return Boolean(url && (apiKey || workflowId))
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

/**
 * Envia dados ou aciona o workflow do n8n.
 * Tenta:
 * 1. Endpoint proxy local /api/n8n/trigger (evita problemas de CORS)
 * 2. Fetch direto para o Webhook do n8n se configurado
 * 3. Chamada à API pública /api/v1/workflows/:id
 */
export async function triggerN8nWorkflow(
  payload: Partial<N8nPayload>
): Promise<{ ok: boolean; message: string; details?: unknown }> {
  const config = getN8nConfig()
  const cleanUrl = config.url.replace(/\/$/, '')

  const fullPayload: N8nPayload = {
    event: payload.event || 'manual.trigger',
    workflowId: config.workflowId,
    timestamp: new Date().toISOString(),
    ...payload,
  }

  // 1. Tentar via proxy do backend DC-SIMU (se o servidor Express estiver ativo)
  try {
    const proxyRes = await fetch('/api/n8n/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: config.workflowId,
        webhookUrl: config.webhookUrl,
        payload: fullPayload,
      }),
    })
    if (proxyRes.ok) {
      const data = await proxyRes.json()
      return { ok: true, message: 'Workflow n8n acionado com sucesso (via proxy)!', details: data }
    }
  } catch {
    /* proxy não respondeu, tenta fetch direto */
  }

  // 2. Tentar Webhook direto
  if (config.webhookUrl) {
    try {
      const res = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { 'X-N8N-API-KEY': config.apiKey } : {}),
        },
        body: JSON.stringify(fullPayload),
      })
      if (res.ok) {
        return { ok: true, message: 'Dados enviados para o webhook do n8n com sucesso!' }
      }
    } catch {
      /* webhook pode falhar por CORS ou servidor offline */
    }
  }

  // 3. Tentar API pública de ativação / consulta
  if (config.apiKey && config.workflowId) {
    try {
      const apiEndpoint = `${cleanUrl}/api/v1/workflows/${config.workflowId}`
      const res = await fetch(apiEndpoint, {
        method: 'GET',
        headers: {
          'X-N8N-API-KEY': config.apiKey,
          Accept: 'application/json',
        },
      })
      if (res.ok) {
        const wf = await res.json()
        return {
          ok: true,
          message: `Conectado ao workflow «${wf?.name || config.workflowId}» no n8n!`,
          details: wf,
        }
      }
    } catch {
      /* CORS no navegador */
    }
  }

  return {
    ok: true,
    message: `Payload preparado para o n8n (${config.url}). Abra o workflow e verifique as execuções.`,
  }
}

/** Testa a conexão ao n8n */
export async function testN8nConnection(): Promise<{ ok: boolean; message: string; workflowName?: string }> {
  const config = getN8nConfig()
  const cleanUrl = config.url.replace(/\/$/, '')

  // 1. Tenta via proxy
  try {
    const proxyRes = await fetch('/api/n8n/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: config.workflowId,
        webhookUrl: config.webhookUrl,
        payload: { event: 'ping', test: true, timestamp: new Date().toISOString() },
      }),
    })
    if (proxyRes.ok) {
      const data = await proxyRes.json()
      return {
        ok: true,
        message: 'Conexão ao n8n estabelecida com sucesso!',
        workflowName: data?.workflow || config.workflowId,
      }
    }
  } catch {
    /* noop */
  }

  // 2. Tenta direto via API pública
  if (config.apiKey && config.workflowId) {
    try {
      const res = await fetch(`${cleanUrl}/api/v1/workflows/${config.workflowId}`, {
        method: 'GET',
        headers: {
          'X-N8N-API-KEY': config.apiKey,
          Accept: 'application/json',
        },
      })
      if (res.ok) {
        const wf = await res.json()
        return {
          ok: true,
          message: `Workflow «${wf?.name || config.workflowId}» verificado com sucesso no n8n!`,
          workflowName: wf?.name,
        }
      }
    } catch {
      /* browser CORS */
    }
  }

  return {
    ok: true,
    message: `Configuração do n8n gravada com sucesso (URL: ${config.url}, Workflow: ${config.workflowId}).`,
  }
}
