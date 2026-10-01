import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ComponentType } from '../types'
import { cloneModelScene } from './modelFit'
import { getComponentGlbSpec } from './modelPaths'
import { finishCadMaterial } from './catalogMaterials'

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
const sourceCache = new Map<string, Promise<THREE.Object3D>>()
let renderQueue: Promise<void> = Promise.resolve()

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  for (const value of Array.isArray(material) ? material : [material]) value.dispose()
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
    new GLTFLoader().load(path, (gltf) => resolve(gltf.scene), undefined, reject)
  })
  sourceCache.set(path, pending)
  pending.catch(() => sourceCache.delete(path))
  return pending
}

const nextPaint = () => new Promise<void>((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
  else setTimeout(resolve, 0)
})

function normalizeObject(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root, true)
  if (bounds.isEmpty()) throw new Error('Modelo 3D sem geometria visível')
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  // A diagonal (não apenas o maior eixo) garante que nenhum canto sai do
  // cartão quando o utilizador combina inclinação vertical e rotação lateral.
  const scale = 2.38 / Math.max(size.length(), 0.001)
  root.scale.multiplyScalar(scale)
  // A posição do Object3D não é afetada pela própria escala: o centro tem de
  // ser convertido explicitamente, caso contrário alguns CAD ficam cortados.
  root.position.copy(center).multiplyScalar(-scale)
  root.updateMatrixWorld(true)
}

/** Materiais originais do CAD (ver `catalogMaterials.ts`). Cada CAD recebe materiais clonados para
 * nunca alterar a fonte GLB em cache. Sem sombras: os componentes flutuam sobre
 * fundo transparente. */
function enhanceTurntableMaterials(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    meshes.push(mesh)
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    mesh.userData.turntableNeedsOutline = source.some((entry) => entry instanceof THREE.MeshStandardMaterial
      && !entry.map && entry.metalness < 0.5 && entry.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.72)
    const enhanced = source.map((entry) => finishCadMaterial(entry))
    mesh.material = Array.isArray(mesh.material) ? enhanced : enhanced[0]
  })
  // Contorno técnico muito fino: recupera parafusos, junções e silhuetas dos
  // plásticos brancos sem substituir as texturas originais do fabricante.
  for (const mesh of meshes) {
    if (!mesh.userData.turntableNeedsOutline) continue
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 34),
      new THREE.LineBasicMaterial({ color: '#53657b', transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false }),
    )
    outline.userData.turntableOutline = true
    outline.renderOrder = 4
    mesh.add(outline)
  }
}

async function renderRow(type: ComponentType, pitchIndex: number): Promise<ComponentTurntableFrames> {
  const spec = getComponentGlbSpec(type)
  if (!spec) throw new Error('Modelo GLB indisponível')
  const source = await loadSource(spec.path)
  const scene = new THREE.Scene()
  const turntable = new THREE.Group()
  scene.add(turntable)

  // A clonagem mantém o CAD de origem imutável e partilha apenas buffers de leitura.
  const object = cloneModelScene(source)
  object.rotation.set(...spec.rotation)
  if (spec.flipDepth) object.rotateY(Math.PI)
  normalizeObject(object)
  enhanceTurntableMaterials(object)
  turntable.add(object)

  scene.add(new THREE.HemisphereLight('#f8fbff', '#334155', 1.2))
  const key = new THREE.DirectionalLight('#fff8e8', 2.8)
  key.position.set(3.8, 5.2, 6)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#a9c8ff', 1.15)
  fill.position.set(-4.5, 2.5, 2.2)
  scene.add(fill)
  const rim = new THREE.DirectionalLight('#ffffff', 0.9)
  rim.position.set(1, 1, -5)
  scene.add(rim)

  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 50)
  camera.position.set(0, 0.05, 4.25)
  camera.lookAt(0, 0, 0)

  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' })
  renderer.setSize(208, 208, false)
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.94
  renderer.setClearColor(0x000000, 0)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, 0.04).texture
  scene.environment = environment

  const frames: string[] = []
  try {
    for (let yaw = 0; yaw < YAW_STEPS; yaw += 1) {
      turntable.rotation.set(PITCH_ANGLES[pitchIndex] ?? 0, (yaw / YAW_STEPS) * Math.PI * 2, 0)
      renderer.render(scene, camera)
      frames.push(renderer.domElement.toDataURL('image/webp', 0.92))
      if (yaw < YAW_STEPS - 1) await nextPaint()
    }
  } finally {
    environment.dispose()
    room.dispose()
    pmrem.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    // O clone partilha geometria com a fonte em cache; os materiais, porém, são próprios.
    object.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && mesh.material) disposeMaterial(mesh.material)
      if (child.userData.turntableOutline) {
        const line = child as THREE.LineSegments
        line.geometry.dispose()
        disposeMaterial(line.material)
      }
    })
    turntable.remove(object)
  }

  return { frames, yawSteps: YAW_STEPS, pitchIndex, pitchSteps: PITCH_ANGLES.length }
}

/**
 * Gera apenas uma faixa de inclinação de cada vez. Assim cada cartão conserva
 * uma imagem leve e o Safari móvel nunca mantém vários contextos WebGL vivos.
 */
export function getComponentTurntableFrames(type: ComponentType, pitchIndex = DEFAULT_PITCH_INDEX) {
  const normalizedPitch = Math.max(0, Math.min(PITCH_ANGLES.length - 1, Math.round(pitchIndex)))
  const key = `${type}:${normalizedPitch}`
  const cached = rowCache.get(key)
  if (cached) return cached
  // Uma fila global garante no máximo um contexto WebGL temporário de cada vez,
  // inclusive quando vários cartões entram juntos no viewport no Safari móvel.
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
  for (const pending of sourceCache.values()) {
    void pending.then(disposeObject).catch(() => undefined)
  }
  sourceCache.clear()
}
