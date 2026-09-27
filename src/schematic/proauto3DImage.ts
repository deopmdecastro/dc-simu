import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MODEL_PATHS } from '../three/modelPaths'

/** PNG frontal gerado do mesmo GLB real do Painel 3D; um WebGL context por captura. */
let imagePromise: Promise<string> | undefined
export function getProauto3DImage(): Promise<string> {
  if (imagePromise) return imagePromise
  imagePromise = new GLTFLoader().loadAsync(MODEL_PATHS.powerSupplyProauto24A).then(({ scene: source }) => {
    const canvas = document.createElement('canvas')
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
    try {
      renderer.setSize(560, 720, false)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      const scene = new THREE.Scene()
      scene.add(new THREE.AmbientLight('#ffffff', 1.35))
      const key = new THREE.DirectionalLight('#ffffff', 2)
      key.position.set(3, 5, 7)
      scene.add(key)
      const fill = new THREE.DirectionalLight('#d6e5ff', 0.65)
      fill.position.set(-4, 2, -2)
      scene.add(fill)
      const model = source.clone(true)
      // Este GLB já usa Y para cima e +Z como face frontal (ao contrário do LOGO!).
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      model.position.sub(center)
      model.updateMatrixWorld(true)
      scene.add(model)
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      const halfHeight = Math.max(size.y * 0.55, size.x * 720 / 560 * 0.55)
      const halfWidth = halfHeight * 560 / 720
      const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.001, Math.max(10, size.z * 10))
      camera.position.set(0, 0, Math.max(3, size.z * 3))
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
      return canvas.toDataURL('image/png')
    } finally { renderer.dispose() }
  }).catch((error) => { imagePromise = undefined; throw error })
  return imagePromise
}
