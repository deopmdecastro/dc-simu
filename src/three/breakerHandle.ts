import * as THREE from 'three'

/**
 * Separação do manípulo real dentro de um GLB.
 *
 * Alguns CAD trazem o manípulo e a faixa frontal na mesma malha (é o caso do
 * WEG MDW-C10: `WEG_Handle` e `Node2` são a mesma peça azul, duplicada). Para
 * animar só a alavanca — sem nunca acrescentar geometria nova ao equipamento —
 * partimos a malha em dois pela cota do plano frontal: o que fica para fora da
 * caixa é o manípulo; o resto continua fixo.
 */

export interface SplitGeometry {
  /** Parte que se move (o manípulo). */
  moving: THREE.BufferGeometry
  /** Parte que fica quieta (faixa/corpo). */
  fixed: THREE.BufferGeometry
}

/** Parte a malha em duas pelo critério aplicado ao centro de cada triângulo. */
export function splitGeometryByTriangle(
  geometry: THREE.BufferGeometry,
  isMoving: (centroid: THREE.Vector3) => boolean,
): SplitGeometry | null {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  const position = source.getAttribute('position')
  const normal = source.getAttribute('normal')
  if (!position) return null

  const movingPos: number[] = []
  const movingNor: number[] = []
  const fixedPos: number[] = []
  const fixedNor: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const centroid = new THREE.Vector3()

  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index)
    b.fromBufferAttribute(position, index + 1)
    c.fromBufferAttribute(position, index + 2)
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3)
    const target = isMoving(centroid) ? { p: movingPos, n: movingNor } : { p: fixedPos, n: fixedNor }
    for (let vertex = 0; vertex < 3; vertex += 1) {
      target.p.push(position.getX(index + vertex), position.getY(index + vertex), position.getZ(index + vertex))
      if (normal) target.n.push(normal.getX(index + vertex), normal.getY(index + vertex), normal.getZ(index + vertex))
    }
  }
  if (movingPos.length === 0 || fixedPos.length === 0) return null

  const build = (pos: number[], nor: number[]) => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    if (nor.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    else geo.computeVertexNormals()
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    return geo
  }
  return { moving: build(movingPos, movingNor), fixed: build(fixedPos, fixedNor) }
}
