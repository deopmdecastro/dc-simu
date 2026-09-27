import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MODEL_PATHS } from '../three/modelPaths'

/** Vista frontal produzida diretamente do GLB usado no Painel 3D (não é um SVG). */
let imagePromise: Promise<{ off: string; on: string }> | undefined

export function getLogo3DImages() {
  if (imagePromise) return imagePromise
  imagePromise = new GLTFLoader().loadAsync(MODEL_PATHS.plcSiemensLogo1224RC).then(({ scene: source }) => {
    const canvas = document.createElement('canvas')
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(560, 720, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight('#ffffff', 1.4))
    const key = new THREE.DirectionalLight('#ffffff', 2.0)
    key.position.set(3, 5, 7)
    scene.add(key)
    const fill = new THREE.DirectionalLight('#e7efff', 0.8)
    fill.position.set(-4, 2, -2)
    scene.add(fill)
    const model = source.clone(true)
    // Mesma orientação do modelo no Painel 3D: SolidWorks Z-up -> Three Y-up.
    model.rotation.x = Math.PI / 2
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.sub(center)
    model.updateMatrixWorld(true)
    scene.add(model)
    const bounds = new THREE.Box3().setFromObject(model)
    const size = bounds.getSize(new THREE.Vector3())
    const halfHeight = Math.max(size.y * 0.55, size.x * (720 / 560) * 0.55)
    const camera = new THREE.OrthographicCamera(-halfHeight * 560 / 720, halfHeight * 560 / 720, halfHeight, -halfHeight, 0.01, Math.max(100, size.z * 10))
    camera.position.set(0, 0, Math.max(5, size.z * 3))
    camera.lookAt(0, 0, 0)
    // Clonar materiais evita alterar o modelo partilhado pelo Painel 3D.
    const screenMats: THREE.MeshStandardMaterial[] = []
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const cloned = originals.map((material) => material.clone())
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
      cloned.forEach((material) => {
        const mat = material as THREE.MeshStandardMaterial
        if ('emissive' in mat && mat.color && mat.color.g > 0.85 && mat.color.r < 0.15 && mat.color.b < 0.15) screenMats.push(mat)
      })
    })
    const capture = (powered: boolean) => {
      screenMats.forEach((mat) => {
        mat.emissive.set(powered ? '#22c55e' : '#052e16')
        mat.emissiveIntensity = powered ? 1.1 : 0.15
      })
      renderer.render(scene, camera)
      return canvas.toDataURL('image/png')
    }
    const result = { off: capture(false), on: capture(true) }
    renderer.dispose()
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((material) => material.dispose())
    })
    return result
  }).catch((error) => { imagePromise = undefined; throw error })
  return imagePromise
}
