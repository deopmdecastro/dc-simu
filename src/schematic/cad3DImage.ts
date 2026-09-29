import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ComponentType } from '../types'
import { getComponentModelSpec } from '../three/modelPaths'

const cache = new Map<ComponentType, Promise<string>>()

/**
 * Render frontal partilhado por todos os CAD genéricos. Biblioteca e Esquema
 * recebem exatamente a mesma orientação definida para o Painel 3D.
 */
export function getCad3DImage(type: ComponentType): Promise<string> {
  const spec = getComponentModelSpec(type)
  if (!spec) return Promise.reject(new Error(`Sem modelo CAD associado a ${type}.`))
  const found = cache.get(type)
  if (found) return found

  const request = new GLTFLoader().loadAsync(spec.path).then(({ scene: source }) => {
    const canvas = document.createElement('canvas')
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
    try {
      renderer.setSize(320, 320, false)
      renderer.setPixelRatio(1)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.setClearColor('#ffffff', 0)

      const scene = new THREE.Scene()
      scene.add(new THREE.HemisphereLight('#ffffff', '#8da0b8', 1.3))
      const key = new THREE.DirectionalLight('#ffffff', 1.65)
      key.position.set(3, 5, 5)
      scene.add(key)
      const fill = new THREE.DirectionalLight('#d9e6ff', 0.65)
      fill.position.set(-4, 2, 2)
      scene.add(fill)

      const model = source.clone(true)
      model.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((material) => material.clone())
          : mesh.material.clone()
      })
      model.rotation.set(...spec.rotation)
      model.updateMatrixWorld(true)
      const raw = new THREE.Box3().setFromObject(model)
      const rawSize = raw.getSize(new THREE.Vector3())
      // Atuadores montados na porta são enquadrados pelo diâmetro/face; a
      // haste traseira não deve reduzir o botão a uma miniatura minúscula.
      const frameSize = spec.placement === 'panel-front'
        ? Math.max(rawSize.x, rawSize.y)
        : Math.max(rawSize.x, rawSize.y, rawSize.z)
      const scale = 1.5 / (frameSize || 1)
      model.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
      model.updateMatrixWorld(true)
      const fitted = new THREE.Box3().setFromObject(model)
      model.position.sub(fitted.getCenter(new THREE.Vector3()))
      scene.add(model)

      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30)
      camera.position.set(2.15, 1.5, 4.2)
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
