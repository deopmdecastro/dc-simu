import * as THREE from 'three'
import { cloneModelScene } from '../three/modelFit'
import { createGltfLoader } from '../three/gltfLoader'
import { CAPTURE_FRAME_PADDING as FRAME_PADDING } from '../three/captureFrame'

export interface OrthographicModelImageOptions {
  path: string
  rotation: [number, number, number]
  /** Orientação da instância, composta POR CIMA da rotação base (igual ao Painel 3D).
   * Somar ângulos de Euler não é o mesmo que compor rotações. */
  viewRotation?: [number, number, number]
  flipDepth?: boolean
  /** Alterações visuais da captura (por exemplo, ecrã ligado do LOGO!). */
  configureObject?: (object: THREE.Object3D) => void
}

const CAPTURE_LONG_SIDE = 560

/**
 * Cache do GLB já descodificado (por caminho). Antes, cada rotação voltava a
 * descarregar e a fazer parse do ficheiro — era isso que mantinha o componente
 * em "A carregar modelo 3D…" enquanto se girava.
 */
const sourceCache = new Map<string, Promise<THREE.Object3D>>()
function loadSource(path: string): Promise<THREE.Object3D> {
  const cached = sourceCache.get(path)
  if (cached) return cached
  const request = createGltfLoader().loadAsync(path).then(({ scene }) => scene)
    .catch((error) => { sourceCache.delete(path); throw error })
  sourceCache.set(path, request)
  return request
}

/** Pré-aquece o GLB (usado ao abrir o editor 3D para a 1.ª rotação ser instantânea). */
export function preloadModelSource(path: string): void {
  void loadSource(path).catch(() => undefined)
}

/**
 * Um único WebGLRenderer partilhado: criar e destruir um contexto por captura
 * é caro e o browser limita o número de contextos ativos (~16).
 */
let sharedRenderer: THREE.WebGLRenderer | null = null
function getRenderer(): THREE.WebGLRenderer {
  if (sharedRenderer && !sharedRenderer.getContext().isContextLost()) return sharedRenderer
  const canvas = document.createElement('canvas')
  sharedRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  sharedRenderer.setPixelRatio(1)
  sharedRenderer.setClearColor(0x000000, 0)
  sharedRenderer.outputColorSpace = THREE.SRGBColorSpace
  sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping
  sharedRenderer.toneMappingExposure = 1.05
  return sharedRenderer
}

/** Capturas em série: nunca duas a competir pelo mesmo canvas partilhado. */
let queue: Promise<unknown> = Promise.resolve()

/**
 * Produz uma captura frontal ortográfica, transparente e justa ao CAD.
 * O canvas acompanha o aspect ratio projetado: peças estreitas deixam de ficar
 * perdidas dentro de um PNG quadrado antes de o SVG aplicar `meet`.
 */
export function captureOrthographicModelImage(options: OrthographicModelImageOptions): Promise<string> {
  const job = queue.then(() => capture(options))
  queue = job.catch(() => undefined)
  return job
}

async function capture(options: OrthographicModelImageOptions): Promise<string> {
  const source = await loadSource(options.path)
  const inner = cloneModelScene(source)

  inner.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const materials = originals.map((material) => material.clone())
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0]
  })
  options.configureObject?.(inner)

  inner.rotation.set(...options.rotation)
  if (options.flipDepth) inner.scale.z = -1
  const model = new THREE.Group()
  model.add(inner)
  if (options.viewRotation) model.rotation.set(...options.viewRotation)
  model.updateMatrixWorld(true)

  const initialBounds = new THREE.Box3().setFromObject(model, true)
  if (initialBounds.isEmpty()) throw new Error(`Modelo sem geometria: ${options.path}`)
  model.position.sub(initialBounds.getCenter(new THREE.Vector3()))
  model.updateMatrixWorld(true)

  const bounds = new THREE.Box3().setFromObject(model, true)
  const size = bounds.getSize(new THREE.Vector3())
  const width = Math.max(size.x, 1e-6)
  const height = Math.max(size.y, 1e-6)
  const aspect = width / height
  const canvasWidth = aspect >= 1 ? CAPTURE_LONG_SIDE : Math.max(1, Math.round(CAPTURE_LONG_SIDE * aspect))
  const canvasHeight = aspect >= 1 ? Math.max(1, Math.round(CAPTURE_LONG_SIDE / aspect)) : CAPTURE_LONG_SIDE

  const renderer = getRenderer()
  const canvas = renderer.domElement
  renderer.setSize(canvasWidth, canvasHeight, false)

  const scene = new THREE.Scene()
  scene.add(model)
  scene.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 1.65))
  const radius = Math.max(size.length(), 1)
  const key = new THREE.DirectionalLight('#ffffff', 2.2)
  key.position.set(radius * 0.8, radius * 1.1, radius * 2.2)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#dbeafe', 0.75)
  fill.position.set(-radius * 1.4, radius * 0.25, radius * 1.2)
  scene.add(fill)

  const halfWidth = width * FRAME_PADDING / 2
  const halfHeight = height * FRAME_PADDING / 2
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, Math.max(radius * 0.001, 0.0001), radius * 10)
  camera.position.set(0, 0, bounds.max.z + radius * 2)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()

  renderer.render(scene, camera)
  const image = canvas.toDataURL('image/png')

  // A geometria pertence ao GLB em cache (partilhada por clone) — só os
  // materiais clonados desta captura são libertados.
  model.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => material.dispose())
  })
  return image
}
