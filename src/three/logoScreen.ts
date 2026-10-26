import * as THREE from 'three'

export interface LogoFaceRect { minX: number; maxX: number; minY: number; maxY: number; z: number }
export const LOGO_SCREEN_FALLBACK: LogoFaceRect = { minX: -0.277, maxX: 0.045, minY: 0.3, maxY: 0.55, z: 0.25 }

/** Janela do LCD no modelo: caixa dos vértices realmente usados pela malha verde (o GLB partilha o buffer). */
export function logoScreenRect(model: THREE.Object3D): LogoFaceRect {
  model.updateMatrixWorld(true)
  const inverse = model.matrixWorld.clone().invert()
  const box = new THREE.Box3(), v = new THREE.Vector3(), m = new THREE.Matrix4()
  model.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (!mats.some((mat) => { const c = (mat as THREE.MeshStandardMaterial).color; return !!c && c.g > 0.85 && c.r < 0.15 && c.b < 0.15 })) return
    const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.index
    m.multiplyMatrices(inverse, mesh.matrixWorld)
    const count = index ? index.count : pos.count
    for (let i = 0; i < count; i++) box.expandByPoint(v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(m))
  })
  if (box.isEmpty()) return LOGO_SCREEN_FALLBACK
  return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, z: box.max.z }
}

