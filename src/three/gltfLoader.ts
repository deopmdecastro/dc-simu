/**
 * Pipeline GLB/GLTF do DC-Simu — descompressão e pré-carga partilhadas por todo o app.
 *
 * - Meshopt (EXT_meshopt_compression): modelos do Admin / glTF-Transform / gltfpack
 * - Draco (KHR_draco_mesh_compression): CAD exportados com compressão de malha
 * - Pré-carga com concorrência limitada (não satura a rede no telemóvel)
 * - Integração com `@react-three/drei` (`useGLTF` / `useProgress`)
 */
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { useGLTF } from '@react-three/drei'
import type { ComponentType } from '../types'
import { getComponentGlbSpec } from './modelPaths'

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.5/'

let sharedDraco: DRACOLoader | null = null
let installed = false

function getDracoLoader(): DRACOLoader {
  if (!sharedDraco) {
    sharedDraco = new DRACOLoader()
    sharedDraco.setDecoderPath(DRACO_DECODER_PATH)
    // Um único worker pool — vários GLB em paralelo partilham o descodificador.
    sharedDraco.setWorkerLimit(2)
  }
  return sharedDraco
}

/**
 * Configura um GLTFLoader com Meshopt + Draco.
 * Usar em qualquer sítio fora do drei (Admin, pré-visualização, workers de capa).
 */
export function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  loader.setDRACOLoader(getDracoLoader())
  return loader
}

/**
 * Instala descompressores no caminho do drei (`useGLTF`).
 * Idempotente — chamar uma vez no arranque do Painel 3D / app.
 *
 * Sem isto, modelos com EXT_meshopt_compression ou KHR_draco_mesh_compression
 * falham ou forçam fallback lento; o descodificador Draco só descarrega se necessário.
 */
export function installGltfLoaders(): void {
  if (installed) return
  installed = true
  try {
    // drei: caminho dos WASM Draco partilhado por todos os useGLTF(..., true, ...)
    useGLTF.setDecoderPath(DRACO_DECODER_PATH)
  } catch {
    // Ambiente sem drei (testes Node) — createGltfLoader continua válido.
  }
}

/** URLs GLB únicas para um conjunto de tipos de componente (cena atual). */
export function collectGlbUrlsForTypes(types: Iterable<ComponentType>): string[] {
  const urls = new Set<string>()
  for (const type of types) {
    const spec = getComponentGlbSpec(type)
    if (spec?.path) urls.add(spec.path)
  }
  return [...urls]
}

/**
 * Pré-carrega uma lista de GLB com concorrência limitada.
 * 1) `loadAsync` com Meshopt+Draco (cache do FileLoader)
 * 2) `useGLTF.preload` para aquecer a cache do drei/R3F
 */
export async function preloadGlbUrls(
  urls: string[],
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<{ loaded: number; failed: number }> {
  installGltfLoaders()
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 6))
  const unique = [...new Set(urls.filter(Boolean))]
  let loaded = 0
  let failed = 0
  let index = 0
  const loader = createGltfLoader()

  async function worker() {
    while (index < unique.length) {
      if (options.signal?.aborted) return
      const i = index++
      const url = unique[i]
      try {
        await loader.loadAsync(url)
        try {
          ;(useGLTF.preload as (path: string, useDraco?: boolean, useMeshopt?: boolean) => void)(url, true, true)
        } catch { /* preload pode ser síncrono */ }
        loaded++
      } catch {
        failed++
      }
    }
  }

  const n = Math.min(concurrency, Math.max(unique.length, 1))
  await Promise.all(Array.from({ length: unique.length ? n : 0 }, () => worker()))
  return { loaded, failed }
}

/**
 * Pré-carga prioritária dos modelos presentes na cena (todos os projetos).
 * Não bloqueia a UI — fire-and-forget com abort ao desmontar.
 */
export function scheduleSceneGlbPreload(
  types: Iterable<ComponentType>,
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<{ loaded: number; failed: number }> {
  const urls = collectGlbUrlsForTypes(types)
  if (!urls.length) return Promise.resolve({ loaded: 0, failed: 0 })
  return preloadGlbUrls(urls, options)
}
