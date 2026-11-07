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
  const from = wireEndpoint3D(lead, 'from', built.components, pivots, built.wires)!
  const to = wireEndpoint3D(lead, 'to', built.components, pivots, built.wires)!
  const standalonePath = buildWirePath3D(lead, from, to, obstacles)
  const standalone = standalonePath.points.map(p => new THREE.Vector3(...p))
  const standaloneDirections = standalone.slice(1).map((p, i) => p.clone().sub(standalone[i]).normalize())
  const joinIndex = standalonePath.motorRoute?.side === 'to'
    ? standalone.length - standalonePath.motorRoute.points.length
    : standalonePath.motorRoute?.points.length ?? -1
  const joinAngle = joinIndex > 0 && joinIndex < standaloneDirections.length
    ? standaloneDirections[joinIndex].angleTo(standaloneDirections[joinIndex - 1])
    : Infinity
  check(`${lead.number}: junção do bucim suave também no traçado individual`, joinAngle < Math.PI / 9)
  const feed = built.wires.find(w => w.id !== lead.id && w.toTerminalId === lead.toTerminalId)!
  const ferrule = coordinated.get(feed.id)!.starts[1]
  const offset = new THREE.Vector3(...path.starts[1].origin).distanceTo(new THREE.Vector3(...ferrule.origin))
  check(`${lead.number}: sonda toca no perno do olhal com porca`, ferrule.type === 'ring' && ferrule.studNut === true && offset < 0.005)
  check(`${lead.number}: alimentação separada da sonda`, new THREE.Vector3(...coordinated.get(feed.id)!.points.at(-1)!).distanceTo(new THREE.Vector3(...path.starts[1].origin)) > 0.037)
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
  const inner = motorBox.clone().expandByScalar(-0.02)
  const inMotorAllowedCorridor = (p: THREE.Vector3) => {
    if (!endsOnMotor) return false
    const cadPt = worldToMotorCad(motor, pivots[motor.id], p)
    // À frente da caixa/motor (aproximação exterior ao bucim)
    if (cadPt.z >= 72.5) return true
    // Passagem pelo interior do bucim M20 (x=128, y=114, r_interno=7.5 mm)
    if (cadPt.z >= 50 && Math.hypot(cadPt.x - MOTOR_GLAND.x, cadPt.y - MOTOR_GLAND.y) <= 7.5) return true
    // Interior livre da caixa de ligação acima do piso cerâmico (sem tocar na carcaça)
    if (cadPt.x >= MOTOR_BOX.x0 + 4 && cadPt.x <= MOTOR_BOX.x1 - 4 && cadPt.y >= MOTOR_FLOOR_Y + 4 && cadPt.z >= MOTOR_BOX.z0 + 4 && cadPt.z <= MOTOR_BOX.z1 + 1) return true
    return false
  }
  let hit = false
  for (let i = 0; i < points.length - 1 && !hit; i++) {
    const a = new THREE.Vector3(...points[i]); const b = new THREE.Vector3(...points[i + 1])
    for (let s = 0; s <= 40; s++) {
      const p = a.clone().lerp(b, s / 40)
      if (!inner.containsPoint(p)) continue
      if (inMotorAllowedCorridor(p)) continue
      hit = true; break
    }
  }
  if (!hit && !endsOnMotor) {
    for (let i = 0; i < points.length - 1 && !hit; i++) {
      const a = new THREE.Vector3(...points[i]); const b = new THREE.Vector3(...points[i + 1])
      for (let s = 0; s <= 40; s++) {
        const p = a.clone().lerp(b, s / 40)
        if (segmentEntersBox([p.x, p.y, motorBox.min.z - 1], [p.x, p.y, p.z], inner)) {
          hit = true; break
        }
      }
    }
  }
  if (hit) { crossing++; offenders.push(`${wire.number} ${wire.fromTerminalId}->${wire.toTerminalId}`) }
}
const motorFeeders = built.wires.filter((w) => [w.fromTerminalId, w.toTerminalId].some((id) => id.startsWith(motor.id)) && !w.id.startsWith('native-meter-'))
const motorGlandWires = built.wires.filter((w) => [w.fromTerminalId, w.toTerminalId].some((id, index) =>
  id.startsWith(motor.id) && (index === 0 ? w.fromEndType : w.toEndType) !== 'banana'))
const feedersThroughGland = motorFeeders.every((w) => {
  const pts = coordinated.get(w.id)?.points ?? []
  return pts.some((pt) => {
    const cadPt = worldToMotorCad(motor, pivots[motor.id], new THREE.Vector3(...pt))
    return cadPt.z >= 54 && cadPt.z <= 75 && Math.hypot(cadPt.x - MOTOR_GLAND.x, cadPt.y - MOTOR_GLAND.y) <= 6.5
  })
})
const allMotorWiresThroughGland = motorGlandWires.every((w) => {
  const pts = coordinated.get(w.id)?.points ?? []
  return pts.some((pt) => {
    const cadPt = worldToMotorCad(motor, pivots[motor.id], new THREE.Vector3(...pt))
    return cadPt.z >= 54 && cadPt.z <= 75 && Math.hypot(cadPt.x - MOTOR_GLAND.x, cadPt.y - MOTOR_GLAND.y) <= 6.5
  })
})
const glandChannels = motorGlandWires.map((wire) => {
  const pts = coordinated.get(wire.id)?.points ?? []
  return pts.map((pt) => worldToMotorCad(motor, pivots[motor.id], new THREE.Vector3(...pt)))
    .filter((point) => point.z >= 54 && point.z <= 75 && Math.hypot(point.x - MOTOR_GLAND.x, point.y - MOTOR_GLAND.y) <= 6.5)
    .sort((a, b) => Math.abs(a.z - (MOTOR_BOX.z1 - MOTOR_BOX.wall / 2)) - Math.abs(b.z - (MOTOR_BOX.z1 - MOTOR_BOX.wall / 2)))[0]
})
let minGlandChannelSpacing = Infinity
for (let i = 0; i < glandChannels.length; i++) {
  for (let j = i + 1; j < glandChannels.length; j++) {
    if (glandChannels[i] && glandChannels[j]) minGlandChannelSpacing = Math.min(minGlandChannelSpacing, Math.hypot(glandChannels[i].x - glandChannels[j].x, glandChannels[i].y - glandChannels[j].y))
  }
}
for (const wire of motorFeeders) {
  const path = coordinated.get(wire.id)!
  const end = path.starts[1]
  check(`${wire.number}: olhal e porca no motor`, end.type === 'ring' && end.studNut === true)
  const last = new THREE.Vector3(...path.points[path.points.length - 2]).sub(new THREE.Vector3(...path.points[path.points.length - 1])).normalize()
  check(`${wire.number}: chegada axial ao borne do motor`, last.dot(new THREE.Vector3(...end.axis)) > 0.995)
  const fixed = path.motorRoute?.points ?? []
  check(`${wire.number}: passagem no motor preservada após separar cabos`, fixed.length > 2 && path.points.slice(-fixed.length).every((p, i) => p.every((n, axis) => Math.abs(n - fixed[i][axis]) < 1e-8)))
  const cadPoints = fixed.map(p => worldToMotorCad(motor, pivots[motor.id], new THREE.Vector3(...p)))
  check(`${wire.number}: sem voltas acima ou abaixo da caixa`, cadPoints.every(p => p.y >= MOTOR_FLOOR_Y + 3 && p.y <= MOTOR_BOX.top + 15))
}
check('Nenhum cabo 3D passa pela carcaça do motor (nem cabos alheios à frente dele)', crossing === 0, crossing ? `${crossing}: ${offenders.slice(0, 6).join(' | ')}` : '')
check('Todos os 4 cabos de força/PE entram no motor pelo bucim M20 (MOTOR_GLAND)', motorFeeders.length === 4 && feedersThroughGland)
check('Cabos do multímetro também entram pelo bucim M20 em canais separados das fases', motorGlandWires.length === 6 && allMotorWiresThroughGland && glandChannels.every(Boolean) && minGlandChannelSpacing >= 3.5 && ['native-meter-red', 'native-meter-black'].every((id) => (coordinated.get(id)?.motorRoute?.points.length ?? 0) > 2), `separação mínima ${minGlandChannelSpacing.toFixed(1)} mm`)
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
{
  // Regressão da vista frontal: baixar o motor deixava as sondas dar a volta
  // pela margem esquerda do quadro, como se fossem alimentadores na calha.
  const movedMotor = { ...motor, schematicY: motor.schematicY + 330 }
  const components = built.components.map(c => c.id === motor.id ? movedMotor : c)
  const center = componentPanelXY(movedMotor)
  const movedPivots = { ...pivots, [motor.id]: new THREE.Vector3(center.x, center.y, pivots[motor.id].z) }
  const boxes = componentObstacles(components, movedPivots)
  const paths = buildAllWirePaths3D(built.wires, components, movedPivots, boxes)
  for (const lead of built.wires.filter(w => w.id.startsWith('native-meter-'))) {
    const from = wireEndpoint3D(lead, 'from', components, movedPivots, built.wires)!
    const to = wireEndpoint3D(lead, 'to', components, movedPivots, built.wires)!
    for (const [name, path] of [['individual', buildWirePath3D(lead, from, to, boxes)], ['coordenado', paths.get(lead.id)!]] as const) {
      const pts = path.points.map(p => new THREE.Vector3(...p))
      const left = Math.min(from.position[0], to.position[0]) - 0.75
      check(`${lead.number} ${name}: motor deslocado não leva sonda de volta ao quadro`, pts.every(p => p.x >= left))
      const length = pts.slice(1).reduce((sum, p, i) => sum + p.distanceTo(pts[i]), 0)
      check(`${lead.number} ${name}: percurso limitado à ligação aparelho–motor`, length < pts[0].distanceTo(pts.at(-1)!) * 3)
      check(`${lead.number} ${name}: mantém entrada pelo bucim`, (path.motorRoute?.points.length ?? 0) > 20)
    }
  }
}
const nonMotorsFront = built.components
  .filter((c) => c.type !== 'motor3ph' && c.type !== 'motor1ph')
  .every((c) => {
    const o = componentOrientationOf(c)
    return o.x === 0 && o.y === 0 && o.z === 0
  })
check('Apenas o motor usa vista isométrica; restantes aparelhos mantêm vista frontal', motorOrient.x === MOTOR_ISOMETRIC_ORIENTATION.x && motorOrient.y === MOTOR_ISOMETRIC_ORIENTATION.y && nonMotorsFront)
for (const pose of [
  { orientation: { x: 0, y: 0, z: 0 }, mirrored: false },
  { orientation: { x: 16, y: 35, z: 0 }, mirrored: false },
  { orientation: { x: 16, y: -35, z: 0 }, mirrored: true },
  { orientation: { x: 16, y: -35, z: 0 }, mirrored: false, scale: { x: 1.2, y: 0.9, z: 1.1 } },
]) {
  motor.viewOrientation = pose.orientation; motor.mirrored = pose.mirrored; motor.view3DScale = pose.scale
  const boxes = componentObstacles(built.components, pivots), own = boxes.find(b => b.componentId === motor.id)!
  const paths = buildAllWirePaths3D(built.wires, built.components, pivots, boxes)
  const exteriorClear = motorGlandWires.every(wire => {
    const path = paths.get(wire.id)!, fixed = path.motorRoute?.points.length ?? 0
    const outer = path.points.slice(0, path.points.length - fixed + 1)
    return fixed > 2 && !outer.some((p, i) => i > 0 && segmentEntersBox(outer[i - 1], p, own))
  })
  check(`Motor ${JSON.stringify(pose)}: cabos visíveis e aproximação fora da carcaça`, built.wires.every(w => (paths.get(w.id)?.points.length ?? 0) > 1) && exteriorClear)
}
// Curvas: sem cantos vivos nem bicos (viragem > 90° entre segmentos de pelo menos 0,2 mm) em nenhum cabo nativo.
{
  const paths = buildAllWirePaths3D(built.wires, built.components, pivots, componentObstacles(built.components, pivots))
  const sharp: string[] = []
  for (const [id, p] of paths) {
    const pts = p.points.map((q) => new THREE.Vector3(...q))
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i].clone().sub(pts[i - 1]), b = pts[i + 1].clone().sub(pts[i])
      if (a.length() < 0.002 || b.length() < 0.002) continue
      if (a.angleTo(b) > Math.PI / 2) { sharp.push(id + '@' + i + ':' + (a.angleTo(b) * 180 / Math.PI).toFixed(0) + '°'); break }
    }
  }
  check('Curvas dos cabos nativos: sem cantos vivos nem bicos (todas as viragens ≤ 90°)', sharp.length === 0, sharp.join(' '))
}
// Cabos do motor desenhados com pontos 3D manuais também entram pelo bucim (e chegam ao borne sem bicos).
{
  const feeder = built.wires.find((w) => w.toTerminalId.startsWith(motor.id) && !w.id.startsWith('native-meter-') && w.kind === 'power')!
  const fromComp = built.components.find((c) => c.terminals.some((t) => t.id === feeder.fromTerminalId))!
  const start = new THREE.Vector3(...wireEndpoint3D(feeder, 'from', built.components, pivots)!.position)
  // Pontos em espaço livre, à frente do quadro e do motor (dentro de sólidos o desvio afasta o cabo deles).
  const manualWire = { ...feeder, waypoints3D: [{ x: start.x, y: start.y - 0.5, z: 1.0 }, { x: pivots[motor.id].x - 2.2, y: pivots[motor.id].y + 0.2, z: 1.6 }] }
  const wires = built.wires.map((w) => (w.id === feeder.id ? manualWire : w))
  const path = buildAllWirePaths3D(wires, built.components, pivots, obstacles).get(feeder.id)!
  const viaGland = path.points.some((pt) => {
    const cadPt = worldToMotorCad(motor, pivots[motor.id], new THREE.Vector3(...pt))
    return cadPt.z >= 54 && cadPt.z <= 75 && Math.hypot(cadPt.x - MOTOR_GLAND.x, cadPt.y - MOTOR_GLAND.y) <= 6.5
  })
  check(`${feeder.number} com pontos manuais: entra no motor pelo bucim`, !!path.motorRoute && viaGland)
  const passes = manualWire.waypoints3D.every((wp) => path.points.some((p) => new THREE.Vector3(...p).distanceTo(new THREE.Vector3(wp.x, wp.y, wp.z)) < 0.12))
  check(`${feeder.number} com pontos manuais: o troço exterior segue os pontos desenhados`, passes)
}
// Dentro da caixa: curva contínua do bucim ao borne (sem «S» nem zigue-zague: viragens ≤ 35° entre segmentos ≥ 1 mm).
{
  const kinks: string[] = []
  for (const wire of motorFeeders) {
    const fixed = (coordinated.get(wire.id)?.motorRoute?.points ?? []).map((p) => new THREE.Vector3(...p))
    const pts = fixed.filter((p, i) => i === 0 || p.distanceTo(fixed[i - 1]) >= 0.01)
    for (let i = 1; i < pts.length - 2; i++) {
      const a = pts[i].clone().sub(pts[i - 1]), b = pts[i + 1].clone().sub(pts[i])
      if (a.angleTo(b) > Math.PI * 35 / 180) { kinks.push(`${wire.number}@${i}:${(a.angleTo(b) * 180 / Math.PI).toFixed(0)}°`); break }
    }
  }
  check('Dentro da caixa de bornes: cabos em curva contínua do bucim ao borne', kinks.length === 0, kinks.join(' '))
}
// Bornes da frente do F1 (95/96/A2): o cabo recua para a calha logo abaixo do relé, em curva contínua,
// em vez de descer à frente até à calha e dobrar 90° para trás (visto de frente parecia um «U»).
{
  const frontEnds = ['native-f1-95', 'native-f1-96', 'native-f1-A2']
  const bad: string[] = []
  for (const wire of built.wires.filter((w) => frontEnds.includes(w.fromTerminalId) || frontEnds.includes(w.toTerminalId))) {
    const points = coordinated.get(wire.id)!.points
    const pts = frontEnds.includes(wire.fromTerminalId) ? points : [...points].reverse()
    const minY = Math.min(...pts.map((p) => p[1]))
    const maxZ = Math.max(...pts.slice(0, Math.ceil(pts.length / 2)).map((p) => p[2]))
    const atLane = pts.find((p) => p[1] <= minY + 0.005)!
    if (maxZ - atLane[2] < 0.35) bad.push(`${wire.id} recua ${((maxZ - atLane[2]) * 100).toFixed(0)} mm`)
  }
  check('cabos dos bornes frontais do F1 chegam à calha já recuados (sem cotovelo à frente)', bad.length === 0, bad.join(', '))
}

if (failed) { console.log(`\n❌ ${failed} falha(s)`); process.exit(1) }
console.log('\n✅ TODOS OS TESTES PASSARAM')
