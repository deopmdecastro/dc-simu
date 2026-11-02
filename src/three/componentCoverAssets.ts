/**
 * Capas estáticas da biblioteca 3D.
 *
 * A biblioteca mostra imagens (WebP/PNG) em vez de manter contextos WebGL por cartão.
 * Ordem de resolução:
 *  1. Ficheiro em /component-covers/{type}.webp|.png (pré-gerado, sem fundo)
 *  2. Cache IndexedDB (última capa já gerada neste dispositivo)
 *  3. null → o chamador usa a miniatura procedimental leve
 *
 * Para publicar capas fiéis ao GLB: renderizar offline e colocar em
 * public/component-covers/{ComponentType}.webp
 */
import type { ComponentType } from '../types'

const IDB_NAME = 'dc-simu-covers'
const IDB_STORE = 'covers'
const IDB_VERSION = 1
/** Prefixo de versão: mudar quando o enquadramento/estilo das capas mudar. */
const COVER_KEY_PREFIX = 'v1:'

const staticProbe = new Map<string, Promise<string | null>>()
const memory = new Map<string, string>()

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(key)
      req.onsuccess = () => {
        const value = req.result
        resolve(typeof value === 'string' && value.length > 32 ? value : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** URL pública candidata para a capa estática do tipo. */
export function staticCoverCandidates(type: ComponentType | string): string[] {
  const safe = String(type).replace(/[^a-zA-Z0-9._-]/g, '_')
  return [
    `/component-covers/${safe}.webp`,
    `/component-covers/${safe}.png`,
  ]
}

function probeUrl(url: string): Promise<string | null> {
  const cached = staticProbe.get(url)
  if (cached) return cached
  const pending = new Promise<string | null>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null)
      return
    }
    const img = new Image()
    img.onload = () => resolve(url)
    img.onerror = () => resolve(null)
    img.src = url
  })
  staticProbe.set(url, pending)
  return pending
}

/** Devolve a primeira URL estática que existe, ou null. */
export async function findStaticCover(type: ComponentType | string): Promise<string | null> {
  for (const url of staticCoverCandidates(type)) {
    const hit = await probeUrl(url)
    if (hit) return hit
  }
  return null
}

/**
 * Resolve a capa a mostrar na biblioteca: estático → IndexedDB → null.
 * Não dispara WebGL.
 */
export async function resolveLibraryCover(type: ComponentType | string): Promise<string | null> {
  const key = COVER_KEY_PREFIX + String(type)
  const mem = memory.get(key)
  if (mem) return mem

  const staticUrl = await findStaticCover(type)
  if (staticUrl) {
    memory.set(key, staticUrl)
    return staticUrl
  }

  const stored = await idbGet(key)
  if (stored) {
    memory.set(key, stored)
    return stored
  }
  return null
}

/** Guarda uma data-URL (ou blob URL persistível) no IndexedDB para sessões futuras. */
export async function rememberLibraryCover(type: ComponentType | string, dataUrl: string): Promise<void> {
  if (!dataUrl || dataUrl.length < 32) return
  const key = COVER_KEY_PREFIX + String(type)
  memory.set(key, dataUrl)
  await idbSet(key, dataUrl)
}
