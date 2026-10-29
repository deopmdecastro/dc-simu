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
import { buildAllWirePaths3D, buildWirePath3D, cableOuterDiameterMm, componentObstacles, keepInFrontOfPlate, wireEndpoint3D } from '../src/three/wireGeometry3D'
import { componentOrientationOf, MOTOR_ISOMETRIC_ORIENTATION } from '../src/three/componentOrientation'
import { segmentEntersBox } from '../src/three/solidWireRouting'

let failed = 0
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`); if (!ok) failed++ }

const RAIL_FLUSH_Z = PLATE_Z + PLATE_THICKNESS / 2 + (DIN_RAIL_15X55.height / 2) * PANEL_UNITS_PER_MM
const built = buildNativePartidaDireta()
const pivots: Record<string, THREE.Vector3> = {}
for (const c of built.components) {
  const { x, y } = componentPanelXY(c)
  if (isMountingRail(c.type)) pivots[c.id] = new THREE.Vector3(x, y, RAIL_FLUSH_Z)
  else if (!isPanelBound(c)) pivots[c.id] = new THREE.Vector3(x, y, c.type === 'motor3ph' || c.type === 'motor1ph' ? 0.7 : 0.4)
  else pivots[c.id] = new THREE.Vector3(x, y, RAIL_FLUSH_Z + (DIN_RAIL_15X55.height / 2) * PANEL_UNITS_PER_MM + componentHalfExtents(c).z)
}
const obstacles = componentObstacles(built.components, pivots)
const motor = built.components.find((c) => c.type === 'motor3ph')!
const mi = built.components.indexOf(motor)
const motorBox = obstacles[mi].clone()
console.log('motor box', motorBox.min.toArray().map((n) => +n.toFixed(2)), motorBox.max.toArray().map((n) => +n.toFixed(2)))

let crossing = 0
let behindPlate = 0
let ferruleBehindPlate = 0
let minZ = Infinity
const solidOffenders: string[] = []
const plateFront = PLATE_Z + PLATE_THICKNESS / 2
const plateOffenders: string[] = []
const offenders: string[] = []
const coordinated = buildAllWirePaths3D(built.wires, built.components, pivots, obstacles)
check('Todos os cabos têm traçado visível', built.wires.every(w => (coordinated.get(w.id)?.points.length ?? 0) >= 2), built.wires.filter(w => (coordinated.get(w.id)?.points.length ?? 0) < 2).map(w => w.number).join(', '))
for (const lead of built.wires.filter(w => w.id.startsWith('native-meter-'))) {
  const path = coordinated.get(lead.id)!
  const points = path.points.map(p => new THREE.Vector3(...p))
  const directions = points.slice(1).map((p, i) => p.clone().sub(points[i]).normalize())
  check(`${lead.number}: cabo sai axialmente da ficha e do punho`, directions[0].dot(new THREE.Vector3(...path.starts[0].axis)) > 0.995 && directions.at(-1)!.clone().negate().dot(new THREE.Vector3(...path.starts[1].axis)) > 0.995)
  check(`${lead.number}: curva contínua sem cotovelos agudos`, directions.slice(1).every((d, i) => d.angleTo(directions[i]) < Math.PI / 9))
  const feed = built.wires.find(w => w.id !== lead.id && w.toTerminalId === lead.toTerminalId)!
  const ferrule = coordinated.get(feed.id)!.starts[1]
  const axis = new THREE.Vector3(...ferrule.axis)
  const offset = new THREE.Vector3(...path.starts[1].origin).sub(new THREE.Vector3(...ferrule.origin))
  check(`${lead.number}: sonda na segunda entrada da ponteira dupla`, ferrule.type === 'ferruleDouble' && Math.abs(offset.dot(axis) - 0.1) < 1e-8 && Math.abs(offset.clone().cross(axis).length() - 0.024) < 1e-8)
  check(`${lead.number}: alimentação separada da sonda`, new THREE.Vector3(...coordinated.get(feed.id)!.points.at(-1)!).distanceTo(new THREE.Vector3(...path.starts[1].origin)) > 0.048)
}
for (const wire of built.wires) {
  const from = wireEndpoint3D(wire, 'from', built.components, pivots, built.wires)
  const to = wireEndpoint3D(wire, 'to', built.components, pivots, built.wires)
  if (!from || !to) continue
  const { points, starts } = coordinated.get(wire.id) ?? buildWirePath3D(wire, from, to, obstacles)
  for (const obstacle of obstacles) {
    if (obstacle.componentId === from.componentId || obstacle.componentId === to.componentId) continue
    const solid = obstacle.clone().expandByScalar(cableOuterDiameterMm(wire.gauge) * PANEL_UNITS_PER_MM * 0.49)
    if (points.some((p,i)=>i>0&&segmentEntersBox(points[i-1],p,solid))) solidOffenders.push(`${wire.number}/${obstacle.componentId}`)
  }
  // o cabo e as ponteiras nunca podem ficar atrás da face frontal da chapa (atravessar o painel)
  const wireMinZ = Math.min(...points.map((q) => q[2]))
  minZ = Math.min(minZ, wireMinZ)
  if (wireMinZ < plateFront - 1e-6) { behindPlate++; plateOffenders.push(`${wire.number} z=${wireMinZ.toFixed(3)}`) }
  for (const s of starts) {
    const tipZ = s.origin[2] + s.axis[2] * s.length
    if (s.origin[2] < plateFront - 1e-6 || tipZ < plateFront - 1e-6) ferruleBehindPlate++
  }
  const endsOnMotor = [wire.fromTerminalId, wire.toTerminalId].some((id) => id.startsWith(motor.id))
  // zona de chegada ao borne do motor: 0,25 u (25 mm) à volta da ponta que lá está
  const motorEnds = [from, to].filter((_, i) => (i === 0 ? wire.fromTerminalId : wire.toTerminalId).startsWith(motor.id)).map((e) => new THREE.Vector3(...e.position))
  const inner = motorBox.clone().expandByScalar(-0.02)
  let hit = false
  for (let i = 0; i < points.length - 1 && !hit; i++) {
    const a = new THREE.Vector3(...points[i]); const b = new THREE.Vector3(...points[i + 1])
    for (let s = 0; s <= 40; s++) {
      const p = a.clone().lerp(b, s / 40)
      if (!inner.containsPoint(p)) continue
      if (endsOnMotor && motorEnds.some((e) => e.distanceTo(p) < 0.6)) continue
      hit = true; break
    }
    // vista de frente: troço que passa por cima do motor (x/y dentro da caixa) mesmo à frente dele
  }
  // projeção frontal: qualquer ponto do cabo (fora da zona do borne) dentro do retângulo x/y do motor
  if (!hit) {
    for (let i = 0; i < points.length - 1 && !hit; i++) {
      const a = new THREE.Vector3(...points[i]); const b = new THREE.Vector3(...points[i + 1])
      for (let s = 0; s <= 40; s++) {
        const p = a.clone().lerp(b, s / 40)
        if (p.x > motorBox.min.x + 0.02 && p.x < motorBox.max.x - 0.02 && p.y > motorBox.min.y + 0.02 && p.y < motorBox.max.y - 0.02) {
          if (endsOnMotor && motorEnds.some((e) => e.distanceTo(p) < 0.6)) continue
          hit = true; break
        }
      }
    }
  }
  if (hit) { crossing++; offenders.push(`${wire.number} ${wire.fromTerminalId}->${wire.toTerminalId}`) }
}
check('Nenhum cabo 3D passa pelo motor (nem à frente dele)', crossing === 0, crossing ? `${crossing}: ${offenders.slice(0, 6).join(' | ')}` : '')
check('Nenhum cabo 3D atravessa a chapa do painel (z ≥ face frontal)', behindPlate === 0, behindPlate ? `${behindPlate}: ${plateOffenders.slice(0, 6).join(' | ')}` : `z mínimo ${minZ.toFixed(3)} ≥ ${plateFront.toFixed(3)}`)
check('Nenhuma ponteira/terminal atravessa a chapa do painel', ferruleBehindPlate === 0)
check('Todos os cabos contornam os outros aparelhos e a calha com a sua espessura física', solidOffenders.length === 0, solidOffenders.join(', '))

function segDist3D(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3) {
  const u = new THREE.Vector3().subVectors(q1, p1)
  const v = new THREE.Vector3().subVectors(q2, p2)
  const w = new THREE.Vector3().subVectors(p1, p2)
  const a = u.dot(u); const b = u.dot(v); const c = v.dot(v); const d = u.dot(w); const e = v.dot(w)
  const D = a * c - b * b
  let sN: number; let sD = D; let tN: number; let tD = D
  if (D < 1e-10) { sN = 0; sD = 1; tN = e; tD = c } else {
    sN = b * e - c * d; tN = a * e - b * d
    if (sN < 0) { sN = 0; tN = e; tD = c } else if (sN > sD) { sN = sD; tN = e + b; tD = c }
  }
  if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a } }
  else if (tN > tD) { tN = tD; if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a } }
  const s = Math.abs(sN) < 1e-10 ? 0 : sN / sD
  const t = Math.abs(tN) < 1e-10 ? 0 : tN / tD
  const c1 = p1.clone().addScaledVector(u, s)
  const c2 = p2.clone().addScaledVector(v, t)
  return { dist: c1.distanceTo(c2), c1, c2 }
}

const wireCapsules = built.wires.map((w) => {
  const path = coordinated.get(w.id)!
  const outer = cableOuterDiameterMm(w.gauge)
  return { w, r: (outer * PANEL_UNITS_PER_MM) / 2, pts: path.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])) }
})
let wireInsideWire = 0
const wireCollisions: string[] = []
for (let i = 0; i < wireCapsules.length; i++) {
  for (let j = i + 1; j < wireCapsules.length; j++) {
    const A = wireCapsules[i]; const B = wireCapsules[j]
    const shared: THREE.Vector3[] = []
    if (A.w.fromTerminalId && (A.w.fromTerminalId === B.w.fromTerminalId || A.w.fromTerminalId === B.w.toTerminalId)) shared.push(A.pts[0])
    if (A.w.toTerminalId && (A.w.toTerminalId === B.w.fromTerminalId || A.w.toTerminalId === B.w.toTerminalId)) shared.push(A.pts[A.pts.length - 1])
    let minD = Infinity
    for (let s1 = 0; s1 < A.pts.length - 1; s1++) {
      for (let s2 = 0; s2 < B.pts.length - 1; s2++) {
        const h = segDist3D(A.pts[s1], A.pts[s1 + 1], B.pts[s2], B.pts[s2 + 1])
        if (shared.some((sp) => sp.distanceTo(h.c1) < 0.22 || sp.distanceTo(h.c2) < 0.22)) continue
        if (h.dist < minD) minD = h.dist
      }
    }
    if (minD < (A.r + B.r) * 0.98) { wireInsideWire++; wireCollisions.push(`${A.w.number}/${B.w.number}: ${minD.toFixed(4)}`) }
  }
}
check(`Nenhum cabo 3D atravessa dentro de outro cabo (${built.wires.length} cabos)`, wireInsideWire === 0, `colisões=${wireInsideWire}: ${wireCollisions.join(', ')}`)

const xg = built.components.find((c) => c.type === 'powerSource3ph')!
const xgIds = new Set(xg.terminals.map((t) => t.id))
const xgCleanExit = wireCapsules
  .filter((item) => xgIds.has(item.w.fromTerminalId) || xgIds.has(item.w.toTerminalId))
  .every((item) => {
    const startY = item.pts[0].y
    return item.pts.slice(0, 10).every((p) => p.y >= startY - 0.02)
  })
check('Bornes superiores de XG saem para cima sem dobrar pela frente do bloco', xgCleanExit)
const clampedManual = keepInFrontOfPlate([[0, 0, -0.5], [1, -1, -0.8], [2, 0, -0.4]], 3.2, true)
check('Waypoints manuais também respeitam a face frontal da chapa', clampedManual.every((p) => p[2] > plateFront))
const motorOrient = componentOrientationOf(motor)
const nonMotorsFront = built.components
  .filter((c) => c.type !== 'motor3ph' && c.type !== 'motor1ph')
  .every((c) => {
    const o = componentOrientationOf(c)
    return o.x === 0 && o.y === 0 && o.z === 0
  })
check('Apenas o motor usa vista isométrica; restantes aparelhos mantêm vista frontal', motorOrient.x === MOTOR_ISOMETRIC_ORIENTATION.x && motorOrient.y === MOTOR_ISOMETRIC_ORIENTATION.y && nonMotorsFront)
if (failed) { console.log(`\n❌ ${failed} falha(s)`); process.exit(1) }
console.log('\n✅ TODOS OS TESTES PASSARAM')
