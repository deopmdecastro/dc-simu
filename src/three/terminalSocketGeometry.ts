import * as THREE from 'three'
import { getComponentModelSpec, type ComponentModelSpec } from './modelPaths'
import type { ComponentType } from '../types'
import { REAL_TERMINALS } from '../electrical/realInterfaces'
import { buildMotorTerminalBox, MOTOR_FLOOR_Y, MOTOR_CAD } from './motorTerminalBox'
import { motorVariantOf } from './motorTerminalLayout'

/** CAD sem réguas completas: tampas funcionais com cavidades reais para cada ligação. */
export const SOCKET_BLOCK_TYPES: ComponentType[] = ['safetyRelay', 'plcLsXbmDn32s', 'motor3ph', 'motor1ph']
const CAP_MM = 6

/** Recorta apenas os triângulos que atravessam a tampa, no referencial da malha.
 * Mantém UVs/normais; a geometria original do cache nunca é alterada. */
function clipGeometry(source: THREE.BufferGeometry, planes: THREE.Plane[]): THREE.BufferGeometry {
  const names = Object.keys(source.attributes).filter((name) => source.attributes[name].itemSize <= 4)
  const attrs = names.map((name) => source.attributes[name])
  const sizes = attrs.map((attr) => attr.itemSize)
  const offsets = sizes.map((_, index) => sizes.slice(0, index).reduce((sum, n) => sum + n, 0))
  const output = names.map(() => [] as number[])
  const groups: Array<{ start: number; count: number; materialIndex: number }> = []
  const positionIndex = names.indexOf('position'), p = new THREE.Vector3()
  const vertex = (index: number) => attrs.flatMap((attr) => Array.from({ length: attr.itemSize }, (_, axis) => attr.getComponent(index, axis)))
  const distance = (v: number[], plane: THREE.Plane) => plane.distanceToPoint(p.fromArray(v, offsets[positionIndex]))
  const indexCount = source.index?.count ?? source.attributes.position.count
  for (let index = 0; index < indexCount; index += 3) {
    const start = output[positionIndex].length / 3
    let polygon = [0, 1, 2].map((n) => vertex(source.index ? source.index.getX(index + n) : index + n))
    for (const plane of planes) {
      const next: number[][] = []
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[j], b = polygon[(j + 1) % polygon.length]
        const da = distance(a, plane), db = distance(b, plane)
        if (da >= 0) next.push(a)
        if ((da >= 0) !== (db >= 0)) next.push(a.map((value, k) => value + (b[k] - value) * da / (da - db)))
      }
      polygon = next
      if (!polygon.length) break
    }
    for (let j = 1; j < polygon.length - 1; j++) for (const v of [polygon[0], polygon[j], polygon[j + 1]]) {
      output.forEach((array, k) => array.push(...v.slice(offsets[k], offsets[k] + sizes[k])))
    }
    const count = output[positionIndex].length / 3 - start
    if (count && source.groups.length) {
      const materialIndex = source.groups.find((group) => index >= group.start && index < group.start + group.count)?.materialIndex ?? 0
      const previous = groups[groups.length - 1]
      if (previous?.materialIndex === materialIndex) previous.count += count
      else groups.push({ start, count, materialIndex })
    }
  }
  const geometry = new THREE.BufferGeometry()
  names.forEach((name, index) => geometry.setAttribute(name, new THREE.Float32BufferAttribute(output[index], sizes[index])))
  groups.forEach((group) => geometry.addGroup(group.start, group.count, group.materialIndex))
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  return geometry
}

export function addTerminalSocketBlocks(model: THREE.Group, spec: ComponentModelSpec, units: number): void {
  const type = SOCKET_BLOCK_TYPES.find((type) => getComponentModelSpec(type)?.path === spec.path)
  if (!type) return
  const spots = REAL_TERMINALS[type]
  if (!spots?.length) return
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model, true)
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
  const motorVariant = motorVariantOf(type)
  if (motorVariant) {
    // Motor: retira a tampa da caixa de bornes e constrói o compartimento real
    // (paredes, fundo, placa isolante, bornes M4, PE e bucim) no sítio da caixa do CAD.
    const cut = box.min.y + (MOTOR_FLOOR_Y - MOTOR_CAD.minY) * units
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), cut)
    let body: THREE.Material | null = null, most = 0
    model.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const count = mesh.geometry.attributes.position?.count ?? 0
      if (count > most && !Array.isArray(mesh.material)) { most = count; body = mesh.material }
      mesh.geometry = clipGeometry(mesh.geometry, [plane.clone().applyMatrix4(mesh.matrixWorld.clone().invert())])
      mesh.userData.generatedTerminalSocket = true
    })
    model.add(buildMotorTerminalBox(box.min, units, body, motorVariant))
    model.updateMatrixWorld(true)
    return
  }
  const depth = CAP_MM * units
  const faces = [...new Set(spots.map((spot) => spot.face))].filter((face) => face === 'top' || face === 'bottom')
  const planes = faces.map((face) => face === 'top'
    ? new THREE.Plane(new THREE.Vector3(0, -1, 0), box.max.y - depth)
    : new THREE.Plane(new THREE.Vector3(0, 1, 0), -box.min.y - depth))
  model.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const inverse = mesh.matrixWorld.clone().invert()
    const local = planes.map((plane) => plane.clone().applyMatrix4(inverse))
    mesh.geometry = clipGeometry(mesh.geometry, local)
    mesh.userData.generatedTerminalSocket = true
  })
  for (const face of faces) {
    const shape = new THREE.Shape()
    const halfW = size.x / 2
    const halfD = size.z / 2
    shape.moveTo(-halfW, -halfD); shape.lineTo(halfW, -halfD); shape.lineTo(halfW, halfD); shape.lineTo(-halfW, halfD); shape.closePath()
    for (const spot of spots.filter((spot) => spot.face === face)) {
      const hole = new THREE.Path()
      hole.absarc((spot.x - .5) * size.x, -((spot.z - .5) * size.z), (spot.diameterMm ?? 3) * units / 2, 0, Math.PI * 2, true)
      shape.holes.push(hole)
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 20 })
    geometry.rotateX(-Math.PI / 2)
    const shell = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#4a535b', roughness: .65 }))
    shell.position.set(center.x, face === 'top' ? box.max.y - depth : box.min.y, center.z)
    shell.userData.generatedTerminalSocket = true
    model.add(shell)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, units * .6, halfD * 2), new THREE.MeshStandardMaterial({ color: '#30343b', roughness: .7 }))
    floor.position.set(center.x, face === 'top' ? box.max.y - depth + units * .3 : box.min.y + depth - units * .3, center.z)
    floor.userData.generatedTerminalSocket = true
    model.add(floor)
  }
  model.updateMatrixWorld(true)
}
