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
import { buildWirePath3D, componentObstacles, wireEndpoint3D } from '../src/three/wireGeometry3D'

let failed = 0
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`); if (!ok) failed++ }

const RAIL_FLUSH_Z = PLATE_Z + PLATE_THICKNESS / 2 + (DIN_RAIL_15X55.height / 2) * PANEL_UNITS_PER_MM
const built = buildNativePartidaDireta()
const pivots: Record<string, THREE.Vector3> = {}
for (const c of built.components) {
  const { x, y } = componentPanelXY(c)
  if (isMountingRail(c.type)) pivots[c.id] = new THREE.Vector3(x, y, RAIL_FLUSH_Z)
  else if (!isPanelBound(c)) pivots[c.id] = new THREE.Vector3(x, y, 0.7)
  else pivots[c.id] = new THREE.Vector3(x, y, RAIL_FLUSH_Z + (DIN_RAIL_15X55.height / 2) * PANEL_UNITS_PER_MM + componentHalfExtents(c).z)
}
const obstacles = componentObstacles(built.components, pivots)
const motor = built.components.find((c) => c.type === 'motor3ph')!
const mi = built.components.indexOf(motor)
const motorBox = obstacles[mi].clone()
console.log('motor box', motorBox.min.toArray().map((n) => +n.toFixed(2)), motorBox.max.toArray().map((n) => +n.toFixed(2)))

let crossing = 0
const offenders: string[] = []
for (const wire of built.wires) {
  const from = wireEndpoint3D(wire, 'from', built.components, pivots)
  const to = wireEndpoint3D(wire, 'to', built.components, pivots)
  if (!from || !to) continue
  const { points } = buildWirePath3D(wire, from, to, obstacles)
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
if (failed) { console.log(`\n❌ ${failed} falha(s)`); process.exit(1) }
console.log('\n✅ TODOS OS TESTES PASSARAM')
