import * as THREE from 'three'
import { cloneModelScene, fitComponentModel } from '../three/modelFit'
import type { ComponentModelSpec } from '../three/modelPaths'
import { createGltfLoader } from '../three/gltfLoader'
import { CAPTURE_FRAME_PADDING as FRAME_PADDING } from '../three/captureFrame'
import { MODEL_PATHS } from '../three/modelPaths'
import { applyEmergencyButtonFinish, finishCadMaterial } from '../three/catalogMaterials'
import { applyEditorMotorTextures, waitMotorTextures } from '../three/motorEditorTextures'
import { applyCadSurfaceTextures } from '../three/cadSurface'
import { addStudioLights, getStudioEnvironment, STUDIO_EXPOSURE, STUDIO_TONE_MAPPING } from '../three/studioEnvironment'

export interface OrthographicModelImageOptions {
  path: string
  rotation: [number, number, number]
  /** Orientação da instância, composta POR CIMA da rotação base (igual ao Painel 3D).
   * Somar ângulos de Euler não é o mesmo que compor rotações. */
  viewRotation?: [number, number, number]
  flipDepth?: boolean
  physicalSizeMm?: ComponentModelSpec['physicalSizeMm']
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
  sharedRenderer.toneMapping = STUDIO_TONE_MAPPING
  sharedRenderer.toneMappingExposure = STUDIO_EXPOSURE
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

/** Captura uma composição de modelos já montada, mantendo o mesmo renderizador e enquadramento. */
export function captureOrthographicObjectImage(object: THREE.Object3D, viewRotation?: [number, number, number]): Promise<string> {
  const job = queue.then(() => {
    const model = new THREE.Group()
    model.add(object)
    if (viewRotation) model.rotation.set(...viewRotation)
    model.updateMatrixWorld(true)
    return renderModelImage(model)
  })
  queue = job.catch(() => undefined)
  return job
}

async function capture(options: OrthographicModelImageOptions): Promise<string> {
  const source = await loadSource(options.path)
  const inner = cloneModelScene(source)

  // Mesmo acabamento do Painel 3D (antes: materiais em bruto do CAD, rugosidade 1 = gesso).
  const motor = options.path === MODEL_PATHS.motorSewDrn80Mk4B3
  const emergency = options.path === MODEL_PATHS.emergencyButtonP20AKR ? 'emergencyButton'
    : options.path === MODEL_PATHS.emergencyButtonKeyP20ACR ? 'emergencyButtonKeyP20ACR' : null
  if (motor) applyEditorMotorTextures(inner)
  else if (emergency) applyEmergencyButtonFinish(inner, emergency)
  else inner.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const materials = originals.map((material) => finishCadMaterial(material, { envMapIntensity: 1.15 }))
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0]
  })
  options.configureObject?.(inner)

  let fitted: THREE.Object3D = inner
  if (options.physicalSizeMm) {
    fitted = fitComponentModel(inner, { ...options, physicalSizeMm: options.physicalSizeMm, placement: 'machine', targetHeight: options.physicalSizeMm.height }, 1)
  } else {
    inner.rotation.set(...options.rotation)
    if (options.flipDepth) inner.scale.z = -1
  }
  if (motor) await waitMotorTextures()
  else await applyCadSurfaceTextures(fitted, { unitsPerMm: 1 })
  const model = new THREE.Group()
  model.add(fitted)
  if (options.viewRotation) model.rotation.set(...options.viewRotation)
  model.updateMatrixWorld(true)

  return renderModelImage(model, { motor, emergency: !!emergency })
}

function renderModelImage(model: THREE.Group, _shared: { motor?: boolean; emergency?: boolean } = {}): string {
  const initialBounds = new THREE.Box3().setFromObject(model, true)
  if (initialBounds.isEmpty()) throw new Error('Modelo sem geometria.')
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
  // Estúdio de produto comum (reflexos reais); uma luz frontal suave porque a vista é de frente.
  scene.environment = getStudioEnvironment(renderer)
  const radius = Math.max(size.length(), 1)
  addStudioLights(scene, radius)
  const front = new THREE.DirectionalLight('#ffffff', 0.3)
  front.position.set(-radius * 0.3, radius * 0.6, radius * 3)
  scene.add(front)

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
    // Os materiais do motor estão em cache partilhado (texturas já carregadas).
    materials.forEach((material) => { if (!material.userData?.__dcMotorTextured) material.dispose() })
    if (mesh.userData.generatedTerminalSocket) mesh.geometry.dispose()
  })
  return image
}
