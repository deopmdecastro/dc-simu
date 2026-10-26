import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const STORAGE_KEY = 'dcsimu:supabase:config:v1'

export type SupabaseConfig = {
  url: string
  anonKey: string
}

let cachedClient: SupabaseClient | null = null
let cachedConfigKey = ''

/**
 * Obtém a configuração do Supabase:
 * 1. Primeiro verifica variáveis de ambiente (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY)
 * 2. Se não existirem, verifica o localStorage (permite configurar diretamente pela UI)
 */
export function getSupabaseConfig(): SupabaseConfig {
  const envUrl = (import.meta.env?.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
  const envKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''

  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SupabaseConfig>
      if (parsed.url && parsed.anonKey) {
        return { url: parsed.url.trim(), anonKey: parsed.anonKey.trim() }
      }
    }
  } catch {
    /* navegação privada ou localStorage indisponível */
  }

  return { url: '', anonKey: '' }
}

/** Verifica se o Supabase está com URL e Chave configurados. */
export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig()
  return Boolean(url && anonKey && url.startsWith('http'))
}

/** Guarda a configuração no localStorage (configuração dinâmica via interface). */
export function saveSupabaseConfig(url: string, anonKey: string): void {
  const cleanUrl = url.trim()
  const cleanKey = anonKey.trim()
  try {
    if (cleanUrl && cleanKey) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: cleanUrl, anonKey: cleanKey }))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* noop */
  }
  // Limpa a instância em cache para recriar com a nova configuração
  cachedClient = null
  cachedConfigKey = ''
}

/** Remove a configuração guardada no navegador. */
export function clearSupabaseConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
  cachedClient = null
  cachedConfigKey = ''
}

/** Retorna a instância do cliente Supabase configurada. */
export function getSupabase(): SupabaseClient | null {
  const config = getSupabaseConfig()
  if (!config.url || !config.anonKey) return null

  const currentKey = `${config.url}::${config.anonKey}`
  if (cachedClient && cachedConfigKey === currentKey) {
    return cachedClient
  }

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'dcsimu:supabase:auth-token',
      },
    })
    cachedConfigKey = currentKey
    return cachedClient
  } catch (err) {
    console.error('Falha ao inicializar o cliente Supabase:', err)
    return null
  }
}

/** Testa a conexão ao Supabase fazendo uma chamada de verificação simples. */
export async function testSupabaseConnection(override?: SupabaseConfig): Promise<{ ok: boolean; message: string }> {
  const config = override ?? getSupabaseConfig()
  if (!config.url || !config.anonKey) {
    return { ok: false, message: 'URL ou Chave Anon do Supabase não fornecidos.' }
  }

  if (!config.url.startsWith('https://') && !config.url.startsWith('http://')) {
    return { ok: false, message: 'O URL do Supabase deve iniciar com https:// (ou http://).' }
  }

  try {
    const client = override ? createClient(config.url, config.anonKey) : getSupabase()
    if (!client) {
      return { ok: false, message: 'Não foi possível instanciar o cliente Supabase com estes parâmetros.' }
    }

    // Testa se o endpoint responde e se a tabela projects está acessível
    const { error } = await client.from('projects').select('id', { count: 'exact', head: true })

    if (error) {
      // Se o erro for de tabela inexistente, a conexão ao Supabase foi bem-sucedida, só falta o schema SQL
      if (error.code === '42P01' || error.message.toLowerCase().includes('relation') || error.message.toLowerCase().includes('does not exist')) {
        return {
          ok: true,
          message: 'Conectado ao Supabase com sucesso! (Aviso: execute o script SQL do schema para criar as tabelas).',
        }
      }
      return { ok: false, message: `Erro do Supabase: ${error.message} (código: ${error.code})` }
    }

    return { ok: true, message: 'Conexão ao Supabase estabelecida e tabelas verificadas com sucesso!' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Falha na requisição ao Supabase: ${msg}` }
  }
}

/** Tenta auto-descobrir as credenciais do Supabase a partir do servidor caso configuradas no ambiente. */
export async function initSupabaseFromBackend(): Promise<boolean> {
  if (isSupabaseConfigured()) return true
  // A publicação Vercel é estática; aí não existe endpoint de descoberta.
  if (__APP_STATIC_DEPLOY__) return false
  try {
    const res = await fetch('/api/supabase/config')
    if (res.ok) {
      const data = await res.json()
      if (data.configured && data.url && data.anonKey) {
        saveSupabaseConfig(data.url, data.anonKey)
        return true
      }
    }
  } catch {
    /* backend não disponível ou sem suporte */
  }
  return false
}
