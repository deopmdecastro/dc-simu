/**
 * Capas estáticas da biblioteca 3D.
 *
 * A biblioteca mostra imagens (WebP/PNG) em vez de manter contextos WebGL por cartão.
 * Ordem de resolução:
 *  1. Capa pré-gerada a partir do GLB (scripts/build-component-covers.mjs → /component-covers/{type}.webp,
 *     WebP sem fundo, ~5 KiB) indicada no manifest.json — um só pedido para saber o que existe; nenhum GLB
 *     é descarregado para mostrar a biblioteca
 *  2. Cache IndexedDB (capa GLB já gerada neste dispositivo)
 *  3. Captura única do GLB real (estúdio 3/4, WebP transparente) → IDB
 *  4. null → miniatura procedimental leve (só tipos sem modelo)
 *
 * Preferência: o GLB real, uma vez, em imagem leve — sem WebGL por cartão na grelha.
 */
import type { ComponentType } from '../types'
import { getComponentCoverImage } from './componentTurntable'
import { hasComponent3DVisual } from './modelPaths'
import { componentImageManifest, componentImageUrl } from './staticComponentImages'

const IDB_NAME = 'dc-simu-covers'
const IDB_STORE = 'covers'
const IDB_VERSION = 1
/** Prefixo de versão: mudar quando o enquadramento/estilo das capas mudar. */
const COVER_KEY_PREFIX = 'v3-glb:'

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

/**
 * Devolve a capa estática do tipo, ou null. Com índice, só os tipos listados têm capa (sem pedidos
 * falhados por tipo); a versão do índice evita mostrar uma capa antiga em cache depois de regenerar.
 */
export async function findStaticCover(type: ComponentType | string): Promise<string | null> {
  const index = await componentImageManifest()
  if (index) {
    const file = index.types[String(type)]
    return file ? componentImageUrl(file, index.version) : null
  }
  for (const url of staticCoverCandidates(type)) {
    const hit = await probeUrl(url)
    if (hit) return hit
  }
  return null
}

/** Converte blob: para data: para poder guardar no IndexedDB entre sessões. */
async function toPersistableUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return url
  if (!url.startsWith('blob:')) return url
  try {
    const blob = await fetch(url).then((r) => r.blob())
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return url
  }
}

/**
 * Resolve a capa a mostrar na biblioteca: estático → IndexedDB → GLB real → null.
 * A captura GLB corre uma vez por tipo e fica em cache (memória + IDB).
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

  // Modelo real: uma fotografia de produto a partir do GLB (WebP transparente).
  if (hasComponent3DVisual(type as ComponentType)) {
    try {
      const captured = await getComponentCoverImage(type as ComponentType)
      const persistable = await toPersistableUrl(captured)
      if (persistable && persistable.length > 32) {
        memory.set(key, persistable)
        void idbSet(key, persistable)
        return persistable
      }
      if (captured) {
        memory.set(key, captured)
        return captured
      }
    } catch {
      // Sem GLB carregável → cai no procedimental no ComponentThumb.
    }
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
