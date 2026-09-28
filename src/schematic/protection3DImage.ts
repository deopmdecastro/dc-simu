import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ComponentType } from '../types'
import { getProtectionModelSpec } from '../three/modelPaths'

const cache = new Map<ComponentType, Promise<string>>()

/** Miniatura frontal renderizada do GLB real para os disjuntores com CAD confirmado. */
export function getProtection3DImage(type: ComponentType): Promise<string> {
  const spec = getProtectionModelSpec(type)
  if (!spec) return Promise.reject(new Error(`Sem modelo CAD associado a ${type}.`))
  const cached = cache.get(type)
  if (cached) return cached

  const request = new GLTFLoader().loadAsync(spec.path).then(({ scene: source }) => {
    const canvas = document.createElement('canvas')
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
    try {
      renderer.setSize(256, 256, false)
      renderer.setPixelRatio(1)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.setClearColor('#ffffff', 0)
      const scene = new THREE.Scene()
      scene.add(new THREE.AmbientLight('#ffffff', 0.85))
      const key = new THREE.DirectionalLight('#ffffff', 1.35)
      key.position.set(3, 5, 4)
      scene.add(key)
      const fill = new THREE.DirectionalLight('#d9e6ff', 0.4)
      fill.position.set(-3, 2, -2)
      scene.add(fill)

      const model = source.clone(true)
      model.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
      })
      model.rotation.set(...spec.rotation)
      model.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(model)
      const size = bounds.getSize(new THREE.Vector3())
      const scale = 1.25 / (Math.max(size.x, size.y, size.z) || 1)
      model.scale.setScalar(scale)
      model.updateMatrixWorld(true)
      const centered = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())
      model.position.sub(centered)
      scene.add(model)

      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
      camera.position.set(2.2, 1.65, 3.3)
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
      return canvas.toDataURL('image/png')
    } finally {
      renderer.dispose()
    }
  }).catch((error) => {
    cache.delete(type)
    throw error
  })
  cache.set(type, request)
  return request
}
