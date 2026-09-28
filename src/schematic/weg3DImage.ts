import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MODEL_PATHS } from '../three/modelPaths'

/**
 * PNG frontal do contator WEG, gerado a partir do mesmo GLB usado no Painel 3D
 * (não é um SVG). O export CAD já vem em Y-up, mas a face frontal está virada
 * para -Z. A profundidade é refletida para mostrar a frente à câmara (+Z), sem
 * inverter a ordem horizontal dos bornes.
 */
let imagePromise: Promise<string> | undefined

export function getWeg3DImage(): Promise<string> {
  if (imagePromise) return imagePromise
  imagePromise = new GLTFLoader().loadAsync(MODEL_PATHS.wegContactorCWC09).then(({ scene: source }) => {
    const canvas = document.createElement('canvas')
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
    try {
      renderer.setSize(560, 720, false)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      const scene = new THREE.Scene()
      scene.add(new THREE.AmbientLight('#ffffff', 1.35))
      const key = new THREE.DirectionalLight('#ffffff', 2.0)
      key.position.set(3, 5, 7)
      scene.add(key)
      const fill = new THREE.DirectionalLight('#d9e6ff', 0.7)
      fill.position.set(-4, 2, -2)
      scene.add(fill)
      const model = source.clone(true)
      // O corpo está em Y-up; refletir apenas Z vira a face frontal (-Z) para a câmara.
      model.scale.z = -1
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      model.position.sub(center)
      model.updateMatrixWorld(true)
      scene.add(model)
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      const halfHeight = Math.max(size.y * 0.55, (size.x * 720) / 560 * 0.55)
      const halfWidth = (halfHeight * 560) / 720
      const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.01, Math.max(100, size.z * 10))
      camera.position.set(0, 0, Math.max(4, size.z * 3))
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
      return canvas.toDataURL('image/png')
    } finally {
      renderer.dispose()
    }
  }).catch((error) => { imagePromise = undefined; throw error })
  return imagePromise
}
