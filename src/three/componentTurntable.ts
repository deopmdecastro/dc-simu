import * as THREE from 'three'
import { createGltfLoader } from './gltfLoader'
import type { ComponentType } from '../types'
import { cloneModelScene, fitComponentModel } from './modelFit'
import { getComponentGlbSpec } from './modelPaths'
import { applyEditorMotorTextures, waitMotorTextures } from './motorEditorTextures'
import { applyCadSurfaceTextures } from './cadSurface'
import { addStudioLights, getStudioEnvironment, STUDIO_EXPOSURE, STUDIO_TONE_MAPPING } from './studioEnvironment'
import { applyEmergencyButtonFinish, finishCadMaterial } from './catalogMaterials'

export interface ComponentTurntableFrames {
  frames: string[]
  yawSteps: number
  pitchIndex: number
  pitchSteps: number
}

const YAW_STEPS = 12
/** Elevação suficiente para observar topo, frente e base sem inverter o equipamento. */
const PITCH_ANGLES = [-Math.PI / 3, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 3] as const
const DEFAULT_PITCH_INDEX = 2
const rowCache = new Map<string, Promise<ComponentTurntableFrames>>()
const heroCache = new Map<string, Promise<string>>()
const blobUrls = new Set<string>()
const sourceCache = new Map<string, Promise<THREE.Object3D>>()
let renderQueue: Promise<void> = Promise.resolve()

/** Contexto WebGL único e partilhado para todas as miniaturas (evita compilar shaders
 *  e gerar PMREM 18 vezes seguidas na landing, mantendo apenas 1 contexto ativo). */
let sharedStudio: {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  turntable: THREE.Group
  camera: THREE.PerspectiveCamera
  environment: THREE.Texture
} | null = null

function getSharedStudio() {
  if (sharedStudio) return sharedStudio
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'default',
    stencil: false,
  })
  renderer.setSize(192, 192, false)
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, 1.25), 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = STUDIO_TONE_MAPPING
  renderer.toneMappingExposure = STUDIO_EXPOSURE
  renderer.setClearColor(0x000000, 0)

  // Mesmo estúdio de produto do Painel 3D: capa, miniatura e cena coincidem.
  const environment = getStudioEnvironment(renderer)
  const scene = new THREE.Scene()
  scene.environment = environment
  const turntable = new THREE.Group()
  scene.add(turntable)
  addStudioLights(scene, 4)

  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 50)
  camera.position.set(0, 0.05, 4.2)
  camera.lookAt(0, 0, 0)

  sharedStudio = { renderer, scene, turntable, camera, environment }
  return sharedStudio
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  for (const value of Array.isArray(material) ? material : [material]) {
    if (value.userData?.__dcMotorTextured) continue
    value.dispose()
  }
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    if (mesh.material) disposeMaterial(mesh.material)
  })
}

function loadSource(path: string) {
  const cached = sourceCache.get(path)
  if (cached) return cached
  const pending = new Promise<THREE.Object3D>((resolve, reject) => {
    createGltfLoader().load(path, (gltf) => resolve(gltf.scene), undefined, reject)
  })
  sourceCache.set(path, pending)
  pending.catch(() => sourceCache.delete(path))
  return pending
}

const nextIdle = () => new Promise<void>((resolve) => {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
  if (typeof ric === 'function') ric(() => resolve(), { timeout: 60 })
  else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
  else setTimeout(resolve, 0)
})

function canvasToImageUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            blobUrls.add(url)
            resolve(url)
            return
          }
          resolve(canvas.toDataURL('image/webp', 0.88))
        },
        'image/webp',
        0.88,
      )
      return
    }
    resolve(canvas.toDataURL('image/webp', 0.88))
  })
}

function normalizeObject(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root, true)
  if (bounds.isEmpty()) throw new Error('Modelo 3D sem geometria visível')
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const scale = 2.42 / Math.max(size.length(), 0.001)
  root.scale.multiplyScalar(scale)
  root.position.copy(center).multiplyScalar(-scale)
  root.updateMatrixWorld(true)
  return scale
}

/** Acabamento igual ao do Painel 3D; resolve quando os mapas reais estão aplicados. */
async function enhanceTurntableMaterials(root: THREE.Object3D, type: ComponentType, renderUnitsPerMm: number): Promise<void> {
  if (type === 'motor3ph' || type === 'motor1ph') {
    applyEditorMotorTextures(root)
    // A capa só é tirada com a pintura e o aço já carregados (antes saía cinzenta).
    await waitMotorTextures()
    return
  }
  if (type === 'emergencyButton' || type === 'emergencyButtonKeyP20ACR') {
    applyEmergencyButtonFinish(root, type)
  } else {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const enhanced = source.map((entry) => finishCadMaterial(entry, { envMapIntensity: 1.2 }))
      mesh.material = Array.isArray(mesh.material) ? enhanced : enhanced[0]
    })
  }
  // O modelo foi ajustado a 1 unidade/mm (fitComponentModel(…, 1)).
  await applyCadSurfaceTextures(root, { unitsPerMm: 1, renderUnitsPerMm })
}

function cleanupPreparedObject(turntable: THREE.Group, object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.isMesh && mesh.material) disposeMaterial(mesh.material)
    if (mesh.isMesh && mesh.userData.generatedTerminalSocket) mesh.geometry.dispose()
    if (child.userData.turntableOutline) {
      const line = child as THREE.LineSegments
      line.geometry.dispose()
      disposeMaterial(line.material)
    }
  })
  turntable.remove(object)
}

/** Ângulo de repouso (capa e 1.º fotograma): 3/4 de cima, lado direito à vista. */
function restPose(type: ComponentType, pitchIndex = DEFAULT_PITCH_INDEX): [number, number] {
  if (type === 'motor3ph' || type === 'motor1ph') return [0.34, -0.58]
  const placement = getComponentGlbSpec(type)?.placement
  // Botoneiras e sinaleiros vivem na porta: a face de comando tem de ficar bem de frente.
  if (placement === 'panel-front') return [pitchIndex === DEFAULT_PITCH_INDEX ? 0.2 : PITCH_ANGLES[pitchIndex] ?? 0, -0.42]
  return [pitchIndex === DEFAULT_PITCH_INDEX ? 0.26 : PITCH_ANGLES[pitchIndex] ?? 0, -0.5]
}

/** Calha DIN: 1 m não cabe numa capa — mostra-se um troço real de ~18 cm (sem esmagar a furação). */
const RAIL_SECTION_MM = 180

async function prepareObject(type: ComponentType): Promise<THREE.Object3D> {
  const spec = getComponentGlbSpec(type)
  if (!spec) throw new Error('Modelo GLB indisponível')
  const source = await loadSource(spec.path)
  await nextIdle()
  const object = fitComponentModel(cloneModelScene(source), spec, 1)
  let scale: number
  if (spec.placement === 'rail') {
    object.updateMatrixWorld(true)
    const center = new THREE.Box3().setFromObject(object, true).getCenter(new THREE.Vector3())
    scale = 2.42 / RAIL_SECTION_MM
    object.scale.multiplyScalar(scale)
    object.position.copy(center).multiplyScalar(-scale)
    object.updateMatrixWorld(true)
  } else {
    scale = normalizeObject(object)
  }
  await enhanceTurntableMaterials(object, type, scale)
  return object
}

async function renderPose(type: ComponentType, poses: Array<[number, number]>): Promise<string[]> {
  const object = await prepareObject(type)
  const { renderer, scene, turntable, camera } = getSharedStudio()
  turntable.add(object)
  const frames: string[] = []
  try {
    for (let index = 0; index < poses.length; index += 1) {
      turntable.rotation.set(poses[index][0], poses[index][1], 0)
      renderer.render(scene, camera)
      frames.push(await canvasToImageUrl(renderer.domElement))
      if (index < poses.length - 1) await nextIdle()
    }
  } finally {
    cleanupPreparedObject(turntable, object)
  }
  return frames
}

async function renderHeroFrame(type: ComponentType, pitchIndex: number): Promise<string> {
  const [frame] = await renderPose(type, [restPose(type, pitchIndex)])
  return frame
}

async function renderRow(type: ComponentType, pitchIndex: number): Promise<ComponentTurntableFrames> {
  // A faixa começa no ângulo de repouso: arrastar não salta para outra vista.
  const [pitch, yaw0] = restPose(type, pitchIndex)
  const poses = Array.from({ length: YAW_STEPS }, (_, yaw) => [pitch, yaw0 + (yaw / YAW_STEPS) * Math.PI * 2] as [number, number])
  const frames = await renderPose(type, poses)
  return { frames, yawSteps: YAW_STEPS, pitchIndex, pitchSteps: PITCH_ANGLES.length }
}

const coverCache = new Map<string, Promise<string>>()

/**
 * Capa do elemento (biblioteca, inspetor, objetos, administração): fotografia de
 * produto a 3/4, com o mesmo acabamento e estúdio do Painel 3D.
 */
export function getComponentCoverImage(type: ComponentType): Promise<string> {
  const cached = coverCache.get(type)
  if (cached) return cached
  const pending = renderQueue.then(async () => (await renderPose(type, [restPose(type)]))[0])
  renderQueue = pending.then(() => undefined, () => undefined)
  coverCache.set(type, pending)
  pending.catch(() => coverCache.delete(type))
  return pending
}

/**
 * Gera apenas 1 fotograma inicial rápido (sem bloquear a thread principal com
 * 12 capturas síncronas por cartão). A faixa completa de rotação só é gerada
 * quando o utilizador interage com a miniatura.
 */
export function getComponentTurntableHero(type: ComponentType, pitchIndex = DEFAULT_PITCH_INDEX): Promise<string> {
  const normalizedPitch = Math.max(0, Math.min(PITCH_ANGLES.length - 1, Math.round(pitchIndex)))
  const key = `${type}:${normalizedPitch}`
  const cachedRow = rowCache.get(key)
  if (cachedRow) return cachedRow.then((row) => row.frames[0])
  const cached = heroCache.get(key)
  if (cached) return cached
  const pending = renderQueue.then(() => renderHeroFrame(type, normalizedPitch))
  renderQueue = pending.then(() => undefined, () => undefined)
  heroCache.set(key, pending)
  pending.catch(() => heroCache.delete(key))
  return pending
}

export function getComponentTurntableFrames(type: ComponentType, pitchIndex = DEFAULT_PITCH_INDEX) {
  const normalizedPitch = Math.max(0, Math.min(PITCH_ANGLES.length - 1, Math.round(pitchIndex)))
  const key = `${type}:${normalizedPitch}`
  const cached = rowCache.get(key)
  if (cached) return cached
  const pending = renderQueue.then(() => renderRow(type, normalizedPitch))
  renderQueue = pending.then(() => undefined, () => undefined)
  rowCache.set(key, pending)
  pending.catch(() => rowCache.delete(key))
  return pending
}

export function defaultComponentTurntablePitch() {
  return DEFAULT_PITCH_INDEX
}

export function clearComponentTurntableCache() {
  rowCache.clear()
  heroCache.clear()
  coverCache.clear()
  for (const url of blobUrls) URL.revokeObjectURL(url)
  blobUrls.clear()
  for (const pending of sourceCache.values()) {
    void pending.then(disposeObject).catch(() => undefined)
  }
  sourceCache.clear()
}
