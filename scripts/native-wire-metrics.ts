/** Diagnóstico (não é teste): mede desvios, laços e proximidades dos cabos 3D do projeto nativo «Partida direta». */
/**
 * Cabos 3D do projeto nativo «Partida direta»: nenhum troço pode atravessar o corpo do
 * motor (nem à frente dele, vista de frente). Reproduz o cálculo de pivôs do Panel3D sem browser.
 */
import * as THREE from 'three'
import { buildNativePartidaDireta } from '../src/project/nativeProjects'
import { componentPanelXY } from '../src/three/panelLayout'
import { componentHalfExtents, isPanelBound, PLATE_THICKNESS, PLATE_Z } from '../src/three/panelBounds'
import { DIN_RAIL_15X55 } from '../src/three/dinRailGeometry'
import { PANEL_UNITS_PER_MM, isMountingRail } from '../src/three/modelPaths'
import { buildAllWirePaths3D, buildWirePath3D, cableOuterDiameterMm, componentObstacles, keepInFrontOfPlate, wireEndpoint3D, worldToMotorCad } from '../src/three/wireGeometry3D'
import { MOTOR_BOX, MOTOR_FLOOR_Y, MOTOR_GLAND } from '../src/three/motorTerminalLayout'
import { componentOrientationOf, MOTOR_ISOMETRIC_ORIENTATION } from '../src/three/componentOrientation'
import { segmentEntersBox } from '../src/three/solidWireRouting'
import { mountDepthOffset } from '../src/three/thermalMount'

let failed = 0
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`); if (!ok) failed++ }

const RAIL_FLUSH_Z = PLATE_Z + PLATE_THICKNESS / 2 + (DIN_RAIL_15X55.height / 2) * PANEL_UNITS_PER_MM
const built = buildNativePartidaDireta()
const pivots: Record<string, THREE.Vector3> = {}
for (const c of built.components) {
  const { x, y } = componentPanelXY(c)
  if (isMountingRail(c.type)) pivots[c.id] = new THREE.Vector3(x, y, RAIL_FLUSH_Z)
  else if (!isPanelBound(c)) pivots[c.id] = new THREE.Vector3(x, y, c.type === 'motor3ph' || c.type === 'motor1ph' ? 0.7 : 0.4)
  else pivots[c.id] = new THREE.Vector3(x, y, RAIL_FLUSH_Z + (DIN_RAIL_15X55.height / 2) * PANEL_UNITS_PER_MM + componentHalfExtents(c).z + mountDepthOffset(c, built.components))
}
const obstacles = componentObstacles(built.components, pivots)
const motor = built.components.find((c) => c.type === 'motor3ph')!
const mi = built.components.indexOf(motor)
const motorBox = obstacles[mi].clone()
console.log('motor box', motorBox.min.toArray().map((n) => +n.toFixed(2)), motorBox.max.toArray().map((n) => +n.toFixed(2)))


const coord = buildAllWirePaths3D(built.wires, built.components, pivots, obstacles)
type Row = { n: string; len: number; straight: number; ratio: number; over: number; from: string; to: string }
const rows: Row[] = []
const segs: { id: string; a: THREE.Vector3; b: THREE.Vector3 }[] = []
for (const w of built.wires) {
  const p = coord.get(w.id); if (!p) continue
  const pts = p.points.map(q => new THREE.Vector3(...q))
  let len = 0; for (let i = 1; i < pts.length; i++) { len += pts[i].distanceTo(pts[i-1]); segs.push({ id: w.id, a: pts[i-1], b: pts[i] }) }
  const st = pts[0].distanceTo(pts[pts.length-1])
  const ymax = Math.max(...pts.map(q => q.y)); const yend = Math.max(pts[0].y, pts[pts.length-1].y)
  rows.push({ n: w.number ?? w.id, len, straight: st, ratio: len / Math.max(st, 1e-3), over: ymax - yend, from: w.fromTerminalId, to: w.toTerminalId })
}
const U1 = PANEL_UNITS_PER_MM
rows.sort((a, b) => b.ratio - a.ratio)
console.log('TOTAL len(mm)', Math.round(rows.reduce((s, r) => s + r.len / U1, 0)))
console.log('Piores desvios (ratio, len mm, subida acima dos bornes mm):')
for (const r of rows.slice(0, 14)) console.log(r.n.padEnd(6), r.ratio.toFixed(2), Math.round(r.len / U1), Math.round(r.over / U1), r.from, '->', r.to)
// proximidade/cruzamento entre segmentos de cabos diferentes (distância < 1 diâmetro)
const dseg = (s: typeof segs[0], t: typeof segs[0]) => { const l1 = new THREE.Line3(s.a, s.b), l2 = new THREE.Line3(t.a, t.b); let m = Infinity; for (let i = 0; i <= 8; i++) { const p = s.a.clone().lerp(s.b, i / 8), q = new THREE.Vector3(); l2.closestPointToPoint(p, true, q); m = Math.min(m, p.distanceTo(q)) } return m }
let close = 0; const pairs = new Set<string>()
for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) { if (segs[i].id === segs[j].id) continue; if (dseg(segs[i], segs[j]) < 1.0 * U1 && segs[i].a.distanceTo(segs[i].b) > 8 * U1 && segs[j].a.distanceTo(segs[j].b) > 8 * U1) { close++; pairs.add([segs[i].id, segs[j].id].sort().join('|')) } }
console.log('segmentos longos a <1mm de outro cabo:', close, 'pares de cabos:', pairs.size)
