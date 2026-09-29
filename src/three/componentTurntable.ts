import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ComponentType } from '../types'
import { getComponentGlbSpec } from './modelPaths'

const FRAME_COUNT = 16
const FRAME_SIZE = 180
const frameCache = new Map<ComponentType, Promise<string[]>>()

const nextPaint = () => new Promise<void>((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
  else setTimeout(resolve, 0)
})

/**
 * Renderiza um turntable real a partir do GLB do componente.
 *
 * As frames são produzidas uma única vez por tipo, usando um contexto WebGL
 * temporário que é libertado no fim. A landing anima imagens WebP leves em vez
 * de manter um Canvas/WebGL por cartão — importante sobretudo no Safari móvel.
 */
export function getComponentTurntableFrames(type: ComponentType): Promise<string[]> {
  const cached = frameCache.get(type)
  if (cached) return cached

  const spec = getComponentGlbSpec(type)
  if (!spec) return Promise.reject(new Error(`Sem GLB real associado a ${type}.`))

  const request = new GLTFLoader().loadAsync(spec.path).then(async ({ scene: source }) => {
    const canvas = document.createElement('canvas')
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
    const clonedMaterials: THREE.Material[] = []
    try {
      renderer.setSize(FRAME_SIZE, FRAME_SIZE, false)
      renderer.setPixelRatio(1)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.08
      renderer.setClearColor('#ffffff', 0)

      const scene = new THREE.Scene()
      scene.add(new THREE.HemisphereLight('#ffffff', '#8b9bb1', 1.75))
      const key = new THREE.DirectionalLight('#ffffff', 2.25)
      key.position.set(4, 6, 7)
      scene.add(key)
      const fill = new THREE.DirectionalLight('#dbe8ff', 1.05)
      fill.position.set(-5, 3, 2)
      scene.add(fill)
      const rim = new THREE.DirectionalLight('#ffffff', 0.75)
      rim.position.set(2, 4, -6)
      scene.add(rim)

      const model = source.clone(true)
      model.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const clones = materials.map((material) => {
          const cloned = material.clone()
          clonedMaterials.push(cloned)
          return cloned
        })
        mesh.material = Array.isArray(mesh.material) ? clones : clones[0]
      })
      model.rotation.set(...spec.rotation)
      if (spec.flipDepth) model.scale.z *= -1
      model.updateMatrixWorld(true)

      const initialBox = new THREE.Box3().setFromObject(model)
      model.position.sub(initialBox.getCenter(new THREE.Vector3()))
      model.updateMatrixWorld(true)

      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      const rotatingWidth = Math.hypot(size.x, size.z)
      const halfView = Math.max(size.y, rotatingWidth) * 0.61 || 1
      const cameraDistance = Math.max(4, Math.max(size.x, size.y, size.z) * 3.4)
      const camera = new THREE.OrthographicCamera(-halfView, halfView, halfView, -halfView, 0.01, cameraDistance * 3)
      camera.position.set(0, size.y * 0.04, cameraDistance)
      camera.lookAt(0, 0, 0)

      const turntable = new THREE.Group()
      turntable.add(model)
      scene.add(turntable)

      const frames: string[] = []
      for (let frame = 0; frame < FRAME_COUNT; frame++) {
        turntable.rotation.y = (frame / FRAME_COUNT) * Math.PI * 2
        turntable.updateMatrixWorld(true)
        renderer.render(scene, camera)
        frames.push(canvas.toDataURL('image/webp', 0.88))
        // Distribui o custo por vários frames do browser e evita bloquear o scroll.
        if (frame < FRAME_COUNT - 1) await nextPaint()
      }
      return frames
    } finally {
      clonedMaterials.forEach((material) => material.dispose())
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }).catch((error) => {
    frameCache.delete(type)
    throw error
  })

  frameCache.set(type, request)
  return request
}
