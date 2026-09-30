import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

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
const FRAME_PADDING = 1.08

/**
 * Produz uma captura frontal ortográfica, transparente e justa ao CAD.
 * O canvas acompanha o aspect ratio projetado: peças estreitas deixam de ficar
 * perdidas dentro de um PNG quadrado antes de o SVG aplicar `meet`.
 */
export async function captureOrthographicModelImage(options: OrthographicModelImageOptions): Promise<string> {
  const { scene: source } = await new GLTFLoader().loadAsync(options.path)
  const inner = source.clone(true)

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

  const initialBounds = new THREE.Box3().setFromObject(model)
  if (initialBounds.isEmpty()) throw new Error(`Modelo sem geometria: ${options.path}`)
  model.position.sub(initialBounds.getCenter(new THREE.Vector3()))
  model.updateMatrixWorld(true)

  const bounds = new THREE.Box3().setFromObject(model)
  const size = bounds.getSize(new THREE.Vector3())
  const width = Math.max(size.x, 1e-6)
  const height = Math.max(size.y, 1e-6)
  const aspect = width / height
  const canvasWidth = aspect >= 1 ? CAPTURE_LONG_SIDE : Math.max(1, Math.round(CAPTURE_LONG_SIDE * aspect))
  const canvasHeight = aspect >= 1 ? Math.max(1, Math.round(CAPTURE_LONG_SIDE / aspect)) : CAPTURE_LONG_SIDE

  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(canvasWidth, canvasHeight, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

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
  renderer.dispose()
  renderer.forceContextLoss()

  model.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => material.dispose())
  })
  return image
}
