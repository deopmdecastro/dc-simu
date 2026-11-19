import * as THREE from 'three'
import { createDigitalMeterObject } from '../src/three/digitalMeterModel'
import { PANEL_UNITS_PER_MM } from '../src/three/modelPaths'

const root = createDigitalMeterObject('meterD522066', {})
root.updateMatrixWorld(true)
const U = PANEL_UNITS_PER_MM // 0.01
const ray = new THREE.Raycaster()
const cast = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) => {
  ray.set(new THREE.Vector3(ox * U, oy * U, oz * U), new THREE.Vector3(dx, dy, dz))
  return ray.intersectObject(root, true).filter(i => i.distance > 1e-7)
}

let ok = true
console.log('== wells 3/4 (x=-14/-4, y=68, from z=50) ==')
for (const x of [-14, -4]) {
  const hits = cast(x, 68, 50, 0, 0, -1)
  const screw = hits.find(h => h.object.name.startsWith('terminal_screw_slot_floor_d52_'))
  const body = hits.find(h => h.object.name === 'digital_meter_body')
  console.log(`x=${x}: ${hits.length} hits; body at z=${body ? (50 - body.distance / U).toFixed(2) : 'none'}; screw slot at z=${screw ? (50 - screw.distance / U).toFixed(2) : 'not hit'}`)
  if (body && (50 - body.distance / U) > 43.0) { console.error('SEALED WELL', x); ok = false }
  if (!screw) { console.error('SCREW NOT HIT', x); ok = false }
}
console.log('== through body 1/2 (x=-14/-4, z=30, from y=-10) ==')
for (const x of [-14, -4]) {
  const hits = cast(x, -10, 30, 0, 1, 0)
  console.log(`x=${x}: ${hits.length} hits`)
  if (!hits.length) { console.error('THROUGH HOLE', x); ok = false }
}
process.exit(ok ? 0 : 1)
