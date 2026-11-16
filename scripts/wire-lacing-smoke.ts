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
import { bundleLacingTies, lacePairBundles, TIE_REACH } from '../src/three/bundleLacing'
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
check('Raio da abraçadeira razoável (< 40 mm)', ties.every((t) => t.radius < 0.4), `max ${Math.max(0, ...ties.map((t) => t.radius / PANEL_UNITS_PER_MM)).toFixed(1)} mm`)
check('Eixo unitário', ties.every((t) => Math.abs(Math.hypot(...t.axis) - 1) < 1e-6))
// Cabos sem chicote não geram abraçadeiras
check('Sem bundleId não há abraçadeiras', bundleLacingTies(built.wires.map((w) => ({ ...w, bundleId: undefined })), paths).length === 0)
// Filaçar por par respeita bloqueio e cabos já filaçados
const locked = built.wires.map((w, i) => ({ ...w, bundleId: undefined, locked: i === 0 }))
const relaced = lacePairBundles(built.components, locked)
check('Cabo bloqueado não é filaçado', !relaced[0].bundleId)
check('Cabos já filaçados mantêm o chicote', lacePairBundles(built.components, built.wires, { skip: (w) => w.id.startsWith('native-meter-') }).every((w, i) => w.bundleId === built.wires[i].bundleId))
console.log(failed ? `\n${failed} falhas` : '\nFilaçamento: todas as verificações passaram')
process.exit(failed ? 1 : 0)
