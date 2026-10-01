import * as THREE from 'three'

/**
 * Materiais dos CAD GLB: usam SEMPRE as texturas, cores e parâmetros originais
 * do modelo (o aspeto do painel 3D do simulador). Esta função só clona, para a
 * fonte em cache nunca ser alterada; não altera rugosidade, metalicidade,
 * verniz nem cor.
 */
export interface FinishOptions {
  /** Mantido por compatibilidade; já não altera o material. */
  envMapIntensity?: number
  clearcoat?: boolean
}

export function finishCadMaterial(source: THREE.Material, _options: FinishOptions = {}): THREE.Material {
  return source.clone()
}

/** Clona os materiais de um modelo (a fonte em cache nunca é alterada). */
export function applyCatalogFinish(root: THREE.Object3D, options: FinishOptions = {}) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const finished = list.map((material) => finishCadMaterial(material, options))
    mesh.material = Array.isArray(mesh.material) ? finished : finished[0]
  })
}
