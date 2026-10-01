import * as THREE from 'three'

/**
 * Acabamento de catálogo para os CAD GLB reais.
 *
 * Os GLB do fabricante trazem apenas cor base (sem texturas): muitos vêm com
 * `roughness = 1` e `metalness = 0`, o que dá um aspeto totalmente baço.
 * Aqui preservamos SEMPRE a cor original e só corrigimos o acabamento físico:
 *  - metais mantêm-se metálicos e polidos;
 *  - plásticos recebem verniz fino (clearcoat), como os invólucros reais;
 *  - lentes/vidros e partes escuras ficam brilhantes;
 *  - nada é tingido nem escurecido.
 */
const hsl = { h: 0, s: 0, l: 0 }

export interface FinishOptions {
  envMapIntensity?: number
  /** Verniz só em materiais opacos; custa um passe extra, por isso é opcional. */
  clearcoat?: boolean
}

export function finishCadMaterial(source: THREE.Material, options: FinishOptions = {}): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial) || source.map) return source.clone()
  const { envMapIntensity = 1.0, clearcoat = true } = options
  const lightness = source.color.getHSL(hsl).l
  const metallic = source.metalness >= 0.5
  const transparent = source.transparent || source.opacity < 0.98
  const dark = lightness < 0.2

  let roughness: number
  let metalness = source.metalness
  if (metallic) {
    roughness = THREE.MathUtils.clamp(source.roughness, 0.22, 0.42)
  } else if (transparent) {
    roughness = 0.12
  } else if (dark) {
    roughness = 0.3 // plásticos pretos: brilho de moldação
  } else {
    // Roughness 1 (omissão do exportador CAD) → plástico acetinado.
    roughness = source.roughness >= 0.85 ? 0.42 : THREE.MathUtils.clamp(source.roughness, 0.28, 0.5)
    metalness = Math.min(metalness, 0.08)
  }

  const useCoat = clearcoat && !metallic && !transparent
  const material = useCoat
    ? new THREE.MeshPhysicalMaterial({ clearcoat: 0.45, clearcoatRoughness: 0.22 })
    : new THREE.MeshStandardMaterial()
  // MeshPhysicalMaterial.copy exige propriedades físicas que a origem não tem.
  THREE.MeshStandardMaterial.prototype.copy.call(material, source)
  material.roughness = roughness
  material.metalness = metalness
  material.envMapIntensity = envMapIntensity
  material.name = source.name
  material.needsUpdate = true
  return material
}

/** Clona os materiais de um modelo (a fonte em cache nunca é alterada) e aplica o acabamento. */
export function applyCatalogFinish(root: THREE.Object3D, options: FinishOptions = {}) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const finished = list.map((material) => finishCadMaterial(material, options))
    mesh.material = Array.isArray(mesh.material) ? finished : finished[0]
  })
}
