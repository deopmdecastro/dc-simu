import * as THREE from 'three'
import { buildDefinitionObject, loadGlbAssets, type GlbCache } from '../../catalog/definition'
import { catalogApi } from '../../catalog/catalogApi'
import type { CatalogEntry } from '../../catalog/types'
import { renderCapture } from './capture'

/**
 * Capas dos cartões da Biblioteca 3D geradas a partir do rascunho atual (ou da última versão publicada),
 * para os cartões nunca mostrarem uma capa vazia ou desatualizada. Um renderer temporário de cada vez;
 * o resultado fica em memória por componente + data de atualização.
 */
const memo = new Map<string, string>()
let chain: Promise<unknown> = Promise.resolve()

const keyOf = (entry: Pick<CatalogEntry, 'id' | 'updatedAt'>) => `${entry.id}@${entry.updatedAt}`
export const cachedCover = (entry: Pick<CatalogEntry, 'id' | 'updatedAt'>) => memo.get(keyOf(entry))

export function generateCover(entry: CatalogEntry): Promise<string | null> {
  const key = keyOf(entry)
  const hit = memo.get(key)
  if (hit) return Promise.resolve(hit)
  const job = chain.then(async () => {
    const full = await catalogApi.adminGet(entry.id)
    const def = full.draft ?? full.versions[full.versions.length - 1]?.definition
    if (!def) return null
    const cache: GlbCache = new Map()
    await loadGlbAssets(def, cache)
    const root = buildDefinitionObject(def, cache)
    const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, preserveDrawingBuffer: true })
    try {
      const url = renderCapture(renderer, root, { view: 'iso', width: 480, height: 360, format: 'jpeg', quality: 0.82 })
      if (url) memo.set(key, url)
      return url
    } finally { renderer.dispose(); renderer.forceContextLoss() }
  }).catch(() => null)
  chain = job
  return job
}
