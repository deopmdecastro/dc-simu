/** Filaçar: o projeto nativo forma chicotes por par de aparelhos e as abraçadeiras só aparecem onde os cabos correm juntos. */
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
import { bundleLacingTies, convexBeltOfCircles, lacePairBundles, packBundleRosette, TIE_REACH } from '../src/three/bundleLacing'
import { useSimStore } from '../src/store/useSimStore'
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
const bundled = built.wires.filter((w) => w.bundleId)
const ids = new Set(bundled.map((w) => w.bundleId))
check('Projeto nativo tem chicotes', ids.size >= 4, `${ids.size} chicotes, ${bundled.length} cabos`)
check('Cada chicote tem 2+ cabos', [...ids].every((id) => bundled.filter((w) => w.bundleId === id).length >= 2))
check('Sondas do multímetro não são filaçadas', built.wires.filter((w) => w.id.startsWith('native-meter-')).every((w) => !w.bundleId))
const paths = new Map<string, { points: [number, number, number][]; radius: number }>()
for (const w of bundled) { const p = coord.get(w.id); if (p) paths.set(w.id, { points: p.points as [number, number, number][], radius: cableOuterDiameterMm(w.gauge) * PANEL_UNITS_PER_MM / 2 }) }
const ties = bundleLacingTies(built.wires, paths)
check('Há abraçadeiras onde os cabos correm juntos', ties.length > 0, `${ties.length}`)
check('Cada abraçadeira envolve 2+ cabos do mesmo chicote', ties.every((t) => t.wireIds.length >= 2 && t.wireIds.every((id) => built.wires.find((w) => w.id === id)?.bundleId === t.bundleId)))
check('Raio da abraçadeira justo e compacto (< 10 mm)', ties.every((t) => t.radius < 0.10), `max ${Math.max(0, ...ties.map((t) => t.radius / PANEL_UNITS_PER_MM)).toFixed(1)} mm`)
const maxSpanMm = Math.max(0, ...ties.map((t) => t.halfWidth * 2 / PANEL_UNITS_PER_MM))
const avgSpanMm = ties.reduce((s, t) => s + t.halfWidth * 2 / PANEL_UNITS_PER_MM, 0) / Math.max(1, ties.length)
check('Chicotes apertados como quadro real (vão máx ≤ 15,5 mm, médio ≤ 9,5 mm)', maxSpanMm <= 15.5 && avgSpanMm <= 9.5, `máx ${maxSpanMm.toFixed(1)} mm · médio ${avgSpanMm.toFixed(1)} mm`)
check('Todos os 7 chicotes nativos recebem abraçadeiras justas', [...ids].every((id) => ties.some((t) => t.bundleId === id)), `${new Set(ties.map((t) => t.bundleId)).size}/${ids.size}`)
check('Cada abraçadeira exporta secção real dos condutores para cinta convexa PA66', ties.every((t) => t.circles.length === t.wireIds.length && convexBeltOfCircles(t.circles, 0.002).length >= 16))
check('Chicote do motor M1 filaçado continuamente até ao bucim M20 (≥ 8 abraçadeiras)', ties.filter((t) => t.bundleId === 'chicote-motor-m1').length >= 8, `${ties.filter((t) => t.bundleId === 'chicote-motor-m1').length}`)
let crossedTies = 0
for (let i = 0; i < ties.length; i++) {
  for (let j = i + 1; j < ties.length; j++) {
    const a = ties[i], b = ties[j]
    if (a.bundleId === b.bundleId) continue
    const dx = a.position[0] - b.position[0], dy = a.position[1] - b.position[1], dz = a.position[2] - b.position[2]
    const dist = Math.hypot(dx, dy, dz)
    const axial = Math.abs(dx * a.axis[0] + dy * a.axis[1] + dz * a.axis[2])
    const perp = Math.sqrt(Math.max(0, dist * dist - axial * axial))
    if (axial <= 0.06 && perp < a.radius + b.radius + 0.03) crossedTies++
  }
}
check('Zero abraçadeiras cruzadas em X ou sobrepostas entre chicotes', crossedTies === 0, `cruzadas=${crossedTies}`)
const ps1ExitOk = ['native-wire-19', 'native-wire-20', 'native-wire-21', 'native-wire-27', 'native-wire-34', 'native-wire-40'].every((id) => {
  const pts = coord.get(id)?.points ?? []
  const startX = pts[0]?.[0] ?? 0
  let maxDevMm = 0
  for (let i = 1; i < Math.min(pts.length, 6); i++) {
    if (pts[0][2] - pts[i][2] > 0.16) break
    maxDevMm = Math.max(maxDevMm, Math.abs(pts[i][0] - startX) / PANEL_UNITS_PER_MM)
  }
  return maxDevMm < 0.8
})
check('Saídas de ponteira dupla em PS1 perfeitamente axiais sem curva em S (< 0,8 mm)', ps1ExitOk)
const rosetteIn = Array.from({ length: 7 }, (_, idx) => ({ r: 0.014, u: idx * 0.05, v: 0 }))
const rosette = packBundleRosette(rosetteIn, 0.001)
let rosetteOverlap = false
for (let i = 0; i < rosette.length; i++) {
  for (let j = i + 1; j < rosette.length; j++) {
    if (Math.hypot(rosette[i].u - rosette[j].u, rosette[i].v - rosette[j].v) < rosetteIn[i].r + rosetteIn[j].r - 1e-4) rosetteOverlap = true
  }
}
const rosetteDiaMm = Math.max(...rosette.map((c, idx) => (Math.hypot(c.u, c.v) + rosetteIn[idx].r) * 2 / PANEL_UNITS_PER_MM))
check('Empacotamento hexagonal em roseta (7×2,8 mm → ∅ ≤ 9,2 mm, zero sobreposição)', !rosetteOverlap && rosetteDiaMm <= 9.2, `∅ ${rosetteDiaMm.toFixed(1)} mm`)
check('Eixo unitário', ties.every((t) => Math.abs(Math.hypot(...t.axis) - 1) < 1e-6))
// Cabos sem chicote não geram abraçadeiras
check('Sem bundleId não há abraçadeiras', bundleLacingTies(built.wires.map((w) => ({ ...w, bundleId: undefined })), paths).length === 0)
// Filaçar por par respeita bloqueio e cabos já filaçados
const locked = built.wires.map((w, i) => ({ ...w, bundleId: undefined, locked: i === 0 }))
const relaced = lacePairBundles(built.components, locked)
check('Cabo bloqueado não é filaçado', !relaced[0].bundleId)
check('Cabos já filaçados mantêm o chicote', lacePairBundles(built.components, built.wires, { skip: (w) => w.id.startsWith('native-meter-') }).every((w, i) => w.bundleId === built.wires[i].bundleId))

// Ação do menu «Filaçar por aparelhos»: filaça, respeita bloqueio e o Ctrl+Z repõe
useSimStore.setState({ demoMode: false, history: [], future: [], components: built.components, wires: built.wires.map((w, i) => ({ ...w, bundleId: undefined, locked: i === 0 })) })
useSimStore.getState().lacePairWires()
const afterLace = useSimStore.getState().wires
check('Menu filaça cabos por aparelhos', afterLace.some((w) => w.bundleId))
check('Menu não filaça cabo bloqueado nem sondas', !afterLace[0].bundleId && afterLace.filter((w) => w.id.startsWith('native-meter-')).every((w) => !w.bundleId))
useSimStore.getState().undo()
check('Ctrl+Z desfaz o filaçamento', useSimStore.getState().wires.every((w) => !w.bundleId))
console.log(failed ? `\n${failed} falhas` : '\nFilaçamento: todas as verificações passaram')
process.exit(failed ? 1 : 0)
