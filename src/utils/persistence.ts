// ============================================================================
// Persistência local (localStorage) — projetos nomeados + autosave.
//
// Permite guardar o projeto (Ctrl+S) e fechar a aba/reiniciar o computador
// sem perder o trabalho: ao reabrir a aplicação, o último projeto guardado
// (ou o autosave, se nada foi guardado explicitamente) é recarregado
// automaticamente. Isto é armazenamento no navegador do próprio dispositivo,
// não sincronização entre dispositivos — isso exigiria um backend (ver
// README, secção "Próximos passos naturais"). Para levar o projeto para
// outro computador continua a existir o "Salvar/Abrir JSON" (arquivo local).
// ============================================================================

const NS = 'dcsimu'
const INDEX_KEY = `${NS}:projects:index`
const AUTOSAVE_KEY = `${NS}:autosave`
const LAST_OPENED_KEY = `${NS}:lastOpened`
const projectKey = (name: string) => `${NS}:project:${name}`

export interface ProjectMeta {
  name: string
  savedAt: string
}

export interface AutosaveEntry {
  savedAt: string
  json: string
}

function readIndex(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    return raw ? (JSON.parse(raw) as ProjectMeta[]) : []
  } catch {
    return []
  }
}

function writeIndex(list: ProjectMeta[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list))
  } catch {
    // armazenamento indisponível (navegação privada, quota cheia…) — falha silenciosa
  }
}

/** Lista os projetos guardados neste navegador, mais recente primeiro. */
export function listProjects(): ProjectMeta[] {
  return readIndex().sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export function setLastOpened(name: string | null) {
  try {
    if (name) localStorage.setItem(LAST_OPENED_KEY, name)
    else localStorage.removeItem(LAST_OPENED_KEY)
  } catch {
    // ignora
  }
}

export function getLastOpenedProjectName(): string | null {
  try {
    return localStorage.getItem(LAST_OPENED_KEY)
  } catch {
    return null
  }
}

/** Guarda (cria ou sobrescreve) um projeto nomeado. Devolve false se o
 * armazenamento do navegador estiver indisponível ou cheio. */
export function saveProject(name: string, json: string): boolean {
  try {
    localStorage.setItem(projectKey(name), json)
    writeIndex([...readIndex().filter((p) => p.name !== name), { name, savedAt: new Date().toISOString() }])
    return true
  } catch {
    return false
  }
}

export function loadProject(name: string): string | null {
  try {
    return localStorage.getItem(projectKey(name))
  } catch {
    return null
  }
}

export function deleteProject(name: string) {
  try {
    localStorage.removeItem(projectKey(name))
    writeIndex(readIndex().filter((p) => p.name !== name))
    if (getLastOpenedProjectName() === name) setLastOpened(null)
  } catch {
    // ignora
  }
}

/** Autosave silencioso — sempre a mesma chave, não aparece na lista de projetos. */
export function saveAutosave(json: string) {
  try {
    const entry: AutosaveEntry = { savedAt: new Date().toISOString(), json }
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(entry))
  } catch {
    // autosave é best-effort
  }
}

export function loadAutosave(): AutosaveEntry | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    return raw ? (JSON.parse(raw) as AutosaveEntry) : null
  } catch {
    return null
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY)
  } catch {
    // ignora
  }
}
