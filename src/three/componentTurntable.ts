import * as THREE from 'three'
import { createGltfLoader } from './gltfLoader'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ComponentType } from '../types'
import { cloneModelScene, fitComponentModel } from './modelFit'
import { getComponentGlbSpec } from './modelPaths'
import { applyEditorMotorTextures } from './motorEditorTextures'
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.02
  renderer.setClearColor(0x000000, 0)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, 0.04).texture
  room.dispose()
  pmrem.dispose()

  const scene = new THREE.Scene()
  scene.environment = environment
  const turntable = new THREE.Group()
  scene.add(turntable)

  scene.add(new THREE.HemisphereLight('#f8fbff', '#334155', 1.15))
  const key = new THREE.DirectionalLight('#fff8ed', 2.6)
  key.position.set(3.8, 5.2, 6)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#bfd6ff', 1.1)
  fill.position.set(-4.5, 2.5, 2.2)
  scene.add(fill)
  const rim = new THREE.DirectionalLight('#ffffff', 0.85)
  rim.position.set(1, 1, -5)
  scene.add(rim)

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
}

function enhanceTurntableMaterials(root: THREE.Object3D, type: ComponentType) {
  if (type === 'motor3ph') {
    applyEditorMotorTextures(root)
    return
  }
  if (type === 'emergencyButton' || type === 'emergencyButtonKeyP20ACR') {
    applyEmergencyButtonFinish(root, type)
    return
  }
  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    meshes.push(mesh)
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const triCount = (mesh.geometry?.index ? mesh.geometry.index.count : mesh.geometry?.attributes?.position?.count ?? 0) / 3
    mesh.userData.turntableNeedsOutline = triCount > 0 && triCount <= 4500 && source.some((entry) => entry instanceof THREE.MeshStandardMaterial
      && !entry.map && entry.metalness < 0.5 && entry.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.72)
    const enhanced = source.map((entry) => finishCadMaterial(entry, { envMapIntensity: 1.2 }))
    mesh.material = Array.isArray(mesh.material) ? enhanced : enhanced[0]
  })
  for (const mesh of meshes) {
    if (!mesh.userData.turntableNeedsOutline) continue
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 34),
      new THREE.LineBasicMaterial({ color: '#53657b', transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }),
    )
    outline.userData.turntableOutline = true
    outline.renderOrder = 4
    mesh.add(outline)
  }
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

async function renderHeroFrame(type: ComponentType, pitchIndex: number): Promise<string> {
  const spec = getComponentGlbSpec(type)
  if (!spec) throw new Error('Modelo GLB indisponível')
  const source = await loadSource(spec.path)
  await nextIdle()
  const { renderer, scene, turntable, camera } = getSharedStudio()
  const object = fitComponentModel(cloneModelScene(source), spec, 1)
  normalizeObject(object)
  enhanceTurntableMaterials(object, type)
  turntable.add(object)
  try {
    // Ângulo ligeiramente isométrico quando em repouso para dar volume técnico imediato.
    const restYaw = type === 'motor3ph' ? -0.58 : -0.32
    const restPitch = type === 'motor3ph' ? 0.34 : (PITCH_ANGLES[pitchIndex] ?? 0)
    turntable.rotation.set(restPitch, restYaw, 0)
    renderer.render(scene, camera)
    return await canvasToImageUrl(renderer.domElement)
  } finally {
    cleanupPreparedObject(turntable, object)
  }
}

async function renderRow(type: ComponentType, pitchIndex: number): Promise<ComponentTurntableFrames> {
  const spec = getComponentGlbSpec(type)
  if (!spec) throw new Error('Modelo GLB indisponível')
  const source = await loadSource(spec.path)
  const { renderer, scene, turntable, camera } = getSharedStudio()
  const object = fitComponentModel(cloneModelScene(source), spec, 1)
  normalizeObject(object)
  enhanceTurntableMaterials(object, type)
  turntable.add(object)

  const frames: string[] = []
  try {
    for (let yaw = 0; yaw < YAW_STEPS; yaw += 1) {
      turntable.rotation.set(PITCH_ANGLES[pitchIndex] ?? 0, (yaw / YAW_STEPS) * Math.PI * 2, 0)
      renderer.render(scene, camera)
      frames.push(await canvasToImageUrl(renderer.domElement))
      if (yaw < YAW_STEPS - 1) await nextIdle()
    }
  } finally {
    cleanupPreparedObject(turntable, object)
  }

  return { frames, yawSteps: YAW_STEPS, pitchIndex, pitchSteps: PITCH_ANGLES.length }
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
  for (const url of blobUrls) URL.revokeObjectURL(url)
  blobUrls.clear()
  for (const pending of sourceCache.values()) {
    void pending.then(disposeObject).catch(() => undefined)
  }
  sourceCache.clear()
}
