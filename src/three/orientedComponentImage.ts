import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ComponentType, ComponentViewOrientation } from '../types'
import { normalizeComponentOrientation, orientationRadians } from './componentOrientation'
import { getComponentGlbSpec } from './modelPaths'

const sourceCache = new Map<ComponentType, Promise<THREE.Object3D>>()
const imageCache = new Map<string, Promise<string>>()
let renderQueue: Promise<unknown> = Promise.resolve()

function sourceFor(type: ComponentType, path: string) {
  const cached = sourceCache.get(type)
  if (cached) return cached
  const request = new GLTFLoader().loadAsync(path).then(({ scene }) => scene)
    .catch((error) => { sourceCache.delete(type); throw error })
  sourceCache.set(type, request)
  return request
}

function renderOrientation(type: ComponentType, orientation: ComponentViewOrientation): Promise<string> {
  const spec = getComponentGlbSpec(type)
  if (!spec) return Promise.reject(new Error(`Sem GLB real associado a ${type}.`))
  return sourceFor(type, spec.path).then((source) => {
    const canvas = document.createElement('canvas')
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
    const clonedMaterials: THREE.Material[] = []
    try {
      renderer.setSize(320, 320, false)
      renderer.setPixelRatio(1)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.08
      renderer.setClearColor('#ffffff', 0)

      const scene = new THREE.Scene()
      scene.add(new THREE.HemisphereLight('#ffffff', '#8b9bb1', 1.7))
      const key = new THREE.DirectionalLight('#ffffff', 2.2)
      key.position.set(4, 6, 7)
      scene.add(key)
      const fill = new THREE.DirectionalLight('#dbe8ff', 1)
      fill.position.set(-5, 3, 2)
      scene.add(fill)
      const rim = new THREE.DirectionalLight('#ffffff', .7)
      rim.position.set(2, 4, -6)
      scene.add(rim)

      const model = source.clone(true)
      model.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const clones = materials.map((material) => {
          const clone = material.clone()
          clonedMaterials.push(clone)
          return clone
        })
        mesh.material = Array.isArray(mesh.material) ? clones : clones[0]
      })
      model.rotation.set(...spec.rotation)
      if (spec.flipDepth) model.scale.z *= -1
      model.updateMatrixWorld(true)
      model.position.sub(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()))
      model.updateMatrixWorld(true)

      const oriented = new THREE.Group()
      oriented.rotation.set(...orientationRadians(orientation))
      oriented.add(model)
      oriented.updateMatrixWorld(true)
      scene.add(oriented)

      const bounds = new THREE.Box3().setFromObject(oriented)
      const size = bounds.getSize(new THREE.Vector3())
      const halfView = Math.max(size.x, size.y) * .59 || 1
      const distance = Math.max(4, Math.max(size.x, size.y, size.z) * 3.5)
      const camera = new THREE.OrthographicCamera(-halfView, halfView, halfView, -halfView, .01, distance * 3)
      camera.position.set(0, 0, distance)
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
      return canvas.toDataURL('image/webp', .92)
    } finally {
      clonedMaterials.forEach((material) => material.dispose())
      renderer.dispose()
      renderer.forceContextLoss()
    }
  })
}

/** Render frontal do GLB com a rotação visual da instância, usado no Esquema. */
export function getOrientedComponentImage(type: ComponentType, value: ComponentViewOrientation): Promise<string> {
  const normalized = normalizeComponentOrientation(value)
  // Um grau é suficiente no footprint 2D e evita milhares de entradas durante o arraste.
  const orientation = { x: Math.round(normalized.x), y: Math.round(normalized.y), z: Math.round(normalized.z) }
  const key = `${type}:${orientation.x}:${orientation.y}:${orientation.z}`
  const cached = imageCache.get(key)
  if (cached) return cached
  const request = renderQueue.then(() => renderOrientation(type, orientation)) as Promise<string>
  renderQueue = request.catch(() => undefined)
  request.catch(() => imageCache.delete(key))
  imageCache.set(key, request)
  if (imageCache.size > 180) imageCache.delete(imageCache.keys().next().value as string)
  return request
}
