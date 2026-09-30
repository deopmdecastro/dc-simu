import * as THREE from 'three'

/**
 * Alguns GLB (p.ex. Phoenix PTI6, PE, WEG) trazem `min/max` dos acessores errados
 * (eixos trocados). O GLTFLoader usa esses valores como caixa/esfera de cada
 * geometria, o que falsifica `Box3.setFromObject` (sem `precise`) e o culling.
 * Recalcula as caixas a partir dos vértices reais, uma só vez por geometria
 * (as geometrias são partilhadas entre clones).
 */
export function fixGeometryBounds(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const geometry = mesh.geometry
    if (geometry.userData.__boundsFixed) return
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    geometry.userData.__boundsFixed = true
  })
}

/** Clona a cena do cache do GLTF garantindo caixas exatas. */
export function cloneModelScene<T extends THREE.Object3D>(scene: T): T {
  fixGeometryBounds(scene)
  return scene.clone(true) as T
}
