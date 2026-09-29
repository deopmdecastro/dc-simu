import * as THREE from 'three'
import { getComponentModelSpec } from '../three/modelPaths'
import { captureOrthographicModelImage } from './orthographicModelImage'

/** Vistas frontais produzidas diretamente do GLB usado no Painel 3D. */
let imagePromise: Promise<{ off: string; on: string }> | undefined

function screenState(powered: boolean) {
  return (model: THREE.Object3D) => {
    model.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const nameHint = mesh.name.toLowerCase()
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((material) => {
        const mat = material as THREE.MeshStandardMaterial
        if (!('emissive' in mat) || !mat.color) return
        const greenMaterial = mat.color.g > 0.85 && mat.color.r < 0.15 && mat.color.b < 0.15
        const namedScreen = nameHint.includes('screen') || nameHint.includes('display') || nameHint.includes('ecra')
        if (!greenMaterial && !namedScreen) return
        mat.color.set(powered ? '#22c55e' : '#173b24')
        mat.emissive.set(powered ? '#22c55e' : '#052e16')
        mat.emissiveIntensity = powered ? 1.1 : 0.15
      })
    })
  }
}

export function getLogo3DImages() {
  if (imagePromise) return imagePromise
  const spec = getComponentModelSpec('plcSiemensLogo1224RC')!
  imagePromise = Promise.all([
    captureOrthographicModelImage({ path: spec.path, rotation: spec.rotation, flipDepth: spec.flipDepth, configureObject: screenState(false) }),
    captureOrthographicModelImage({ path: spec.path, rotation: spec.rotation, flipDepth: spec.flipDepth, configureObject: screenState(true) }),
  ]).then(([off, on]) => ({ off, on })).catch((error) => {
    imagePromise = undefined
    throw error
  })
  return imagePromise
}
