import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export function compressorShroudBulge(x: number, y: number): number {
  return 10 * Math.max(0, Math.sin((x + 214) / 320 * Math.PI)) * Math.max(0, Math.sin((y - 37) / 255 * Math.PI))
}

/** Subdivisão uniforme: as arestas vizinhas mantêm exatamente os mesmos pontos. */
function subdivideUniformly(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = source.attributes.position, uv = source.attributes.uv
  const positions: number[] = [], uvs: number[] = [], divisions = 4
  const vertex = (base: number, i: number, j: number) => {
    const a = 1 - (i + j) / divisions, b = i / divisions, c = j / divisions
    positions.push(a*pos.getX(base)+b*pos.getX(base+1)+c*pos.getX(base+2), a*pos.getY(base)+b*pos.getY(base+1)+c*pos.getY(base+2), a*pos.getZ(base)+b*pos.getZ(base+1)+c*pos.getZ(base+2))
    uvs.push(a*uv.getX(base)+b*uv.getX(base+1)+c*uv.getX(base+2), a*uv.getY(base)+b*uv.getY(base+1)+c*uv.getY(base+2))
  }
  for (let base = 0; base < pos.count; base += 3) {
    for (let i = 0; i < divisions; i++) for (let j = 0; j < divisions-i; j++) {
      vertex(base,i,j); vertex(base,i+1,j); vertex(base,i,j+1)
      if (i+j < divisions-1) { vertex(base,i+1,j); vertex(base,i+1,j+1); vertex(base,i,j+1) }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2))
  return geo
}

/** Perfis proporcionais à fotografia fornecida; não são cotas de fabrico. */
export function createCompressorTankGeometry(unit: number): THREE.BufferGeometry {
  // Um único sólido de revolução: fundos elípticos rasos, sem hemisférios
  // cortados em longitude nem sobreposição de superfícies no corpo central.
  const points: THREE.Vector2[] = []
  for (let i = 0; i <= 24; i++) {
    const a = i / 24 * Math.PI / 2
    points.push(new THREE.Vector2(99 * Math.sin(a) * unit, (-194 - 31 * Math.cos(a)) * unit))
  }
  points.push(new THREE.Vector2(99 * unit, 194 * unit))
  for (let i = 1; i <= 24; i++) {
    const a = i / 24 * Math.PI / 2
    points.push(new THREE.Vector2(99 * Math.cos(a) * unit, (194 + 31 * Math.sin(a)) * unit))
  }
  const geo = new THREE.LatheGeometry(points, 80)
  geo.rotateZ(-Math.PI / 2)
  return geo
}

export function createCompressorShroudGeometry(unit: number): THREE.BufferGeometry {
  // O perfil observado está no plano XY; a espessura percorre Z.
  const s = new THREE.Shape()
  s.moveTo(-207, 215)
  s.lineTo(-209, 252)
  s.bezierCurveTo(-212, 276, -194, 281, -174, 281)
  s.bezierCurveTo(-78, 290, 16, 255, 62, 194)
  s.bezierCurveTo(85, 165, 102, 122, 99, 99)
  s.bezierCurveTo(97, 67, 78, 43, 48, 42)
  s.lineTo(-123, 42)
  s.quadraticCurveTo(-136, 42, -136, 57)
  s.lineTo(-136, 215)
  s.closePath()
  const extruded = new THREE.ExtrudeGeometry(s, {
    depth: 122, steps: 1, curveSegments: 36,
    bevelEnabled: true, bevelThickness: 12, bevelSize: 5, bevelSegments: 8,
  })
  const geo = subdivideUniformly(extruded)
  extruded.dispose()
  geo.translate(0, 0, -61)
  // Abaulamento discreto das faces laterais do plástico moldado.
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const bulge = compressorShroudBulge(x, y)
    pos.setZ(i, z + Math.sign(z) * bulge * Math.min(1, Math.abs(z) / 61))
  }
  const smooth = mergeVertices(geo)
  geo.dispose()
  smooth.computeVertexNormals()
  smooth.scale(unit, unit, unit)
  return smooth
}

export function createCompressorSpecsGeometry(unit: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(119, 34, 24, 8)
  geo.translate(-48, 101, 0)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setZ(i, 73.7 + compressorShroudBulge(pos.getX(i), pos.getY(i)))
  geo.computeVertexNormals()
  geo.scale(unit,unit,unit)
  return geo
}

export function createCompressorTube(points: number[][], radius: number, unit: number): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x * unit, y * unit, z * unit)))
  return new THREE.TubeGeometry(curve, 80, radius * unit, 12, false)
}
