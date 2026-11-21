import { useSimStore } from '../src/store/useSimStore'
import { hasComponent3DVisual, canInsertComponent3D } from '../src/three/modelPaths'
import {
  HYDRAULIC_DATASHEETS,
  HYDRAULIC_GAUGES,
  PNEUMATIC_GAUGES,
  parseTubularDiameterMm,
  waterTankDimensionsOf,
} from '../src/three/hydraulicsModel'
import { cableOuterDiameterMm as styleOuterMm } from '../src/admin/editor3d/wireStyle'
import { cableOuterDiameterMm as geomOuterMm, wireEndLengthMm } from '../src/three/wireGeometry3D'
import { wireStrokeWidth } from '../src/schematic/wireMetrics'
import { detectDiagnostics } from '../src/utils/errorDetection'
import { existsSync } from 'node:fs'
import path from 'node:path'

let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`PASS — ${name}${detail ? ` :: ${detail}` : ''}`)
  else {
    failed++
    console.error(`FAIL — ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

// 1. Visual 3D availability & PDF datasheets
for (const t of ['floatSwitch', 'waterTank', 'waterPump'] as const) {
  check(`3D visual unlocked for ${t}`, hasComponent3DVisual(t) && canInsertComponent3D(t))
  const ds = HYDRAULIC_DATASHEETS[t]
  const abs = path.resolve(process.cwd(), 'public', ds.path.replace(/^\//, ''))
  check(`PDF datasheet exists for ${t}`, existsSync(abs), ds.path)
}

// 2. Parametric water tank dimensions
const smallTank = waterTankDimensionsOf({ diameterMm: 400, heightMm: 500 })
const bigTank = waterTankDimensionsOf({ diameterMm: 1400, heightMm: 1800 })
check(
  'Water tank scales parametrically',
  bigTank.totalWidthMm > smallTank.totalWidthMm * 2 && bigTank.totalHeightMm > smallTank.totalHeightMm * 2,
  `small=${smallTank.totalWidthMm}x${smallTank.totalHeightMm}mm big=${bigTank.totalWidthMm}x${bigTank.totalHeightMm}mm`,
)

// 3. Tubular gauges, diameters, 2D widths, and 3D fittings
for (const g of [...HYDRAULIC_GAUGES, ...PNEUMATIC_GAUGES]) {
  const mm = parseTubularDiameterMm(g)
  check(`parseTubularDiameterMm(${g})`, mm !== null && mm > 0 && styleOuterMm(g) === mm && geomOuterMm(g) === mm, `Ø=${mm}mm 2D=${wireStrokeWidth(g)}px`)
}
check('3D hydraulicFitting length > 0', wireEndLengthMm('hydraulicFitting') >= 20, `${wireEndLengthMm('hydraulicFitting')}mm`)
check('3D pneumaticPushIn length > 0', wireEndLengthMm('pneumaticPushIn') >= 14, `${wireEndLengthMm('pneumaticPushIn')}mm`)

// 4. End-to-end simulation: Power -> WaterPump -> Hydraulic Pipe -> WaterTank -> FloatSwitch
const store = useSimStore.getState()
useSimStore.setState({ components: [], wires: [] })
const srcId = store.addComponent('powerSource1ph', 60, 120)
const pumpId = store.addComponent('waterPump', 240, 120)
const tankId = store.addComponent('waterTank', 520, 100)
const floatId = store.addComponent('floatSwitch', 780, 120)

const state0 = useSimStore.getState()
const src = state0.components.find((c) => c.id === srcId)!
const pump = state0.components.find((c) => c.id === pumpId)!
const tank = state0.components.find((c) => c.id === tankId)!
const flt = state0.components.find((c) => c.id === floatId)!

check('floatSwitch has NA, C, NF terminals', ['NA', 'C', 'NF'].every((l) => flt.terminals.some((t) => t.label === l)))
check('waterTank has IN, OUT hydraulic terminals', ['IN', 'OUT'].every((l) => tank.terminals.some((t) => t.label === l)))
check('waterPump has L1, N, PE, IN, OUT terminals', ['L1', 'N', 'PE', 'IN', 'OUT'].every((l) => pump.terminals.some((t) => t.label === l)))

// Connect electrical power to waterPump
const srcL = src.terminals.find((t) => t.label === 'L')!
const srcN = src.terminals.find((t) => t.label === 'N')!
const pumpL1 = pump.terminals.find((t) => t.label === 'L1')!
const pumpN = pump.terminals.find((t) => t.label === 'N')!
store.addWire(srcL.id, pumpL1.id, 'power')
store.addWire(srcN.id, pumpN.id, 'neutral')

// Connect hydraulic pipe from pump OUT to tank IN using wireDefaults medium='hydraulic'
store.setWireDefaults({ medium: 'hydraulic', gauge: 'DN20 (Ø25mm)', color: 'lightblue', endType: 'hydraulicFitting' })
const pumpOut = pump.terminals.find((t) => t.label === 'OUT')!
const tankIn = tank.terminals.find((t) => t.label === 'IN')!
store.addWire(pumpOut.id, tankIn.id)
const hydWire = useSimStore.getState().wires.find((w) => w.kind === 'hydraulic')!
const hydWireId = hydWire?.id
check('Hydraulic pipe uses hydraulic kind, DN20 gauge, and brass fitting ends', !!hydWire && hydWire.kind === 'hydraulic' && hydWire.gauge === 'DN20 (Ø25mm)' && hydWire.fromEndType === 'hydraulicFitting' && hydWire.toEndType === 'hydraulicFitting')

// Also test a pneumatic tube free wire
store.setWireDefaults({ medium: 'pneumatic', gauge: 'PU Ø8mm', color: 'blue', endType: 'pneumaticPushIn' })
store.addFreeWire({ point: { x: 100, y: 340 } }, { point: { x: 260, y: 340 } })
const pneuWire = useSimStore.getState().wires.find((w) => w.kind === 'pneumatic')!
check('Pneumatic tube uses pneumatic kind, PU Ø8mm gauge, and push-in fitting ends', !!pneuWire && pneuWire.kind === 'pneumatic' && pneuWire.gauge === 'PU Ø8mm' && pneuWire.fromEndType === 'pneumaticPushIn' && pneuWire.toEndType === 'pneumaticPushIn')

// Set tank low level (65%) and start simulation
store.setComponentState(tankId, { levelPct: 65, outletValveOpen: false, manualFill: false })
store.setComponentState(floatId, { triggered: false, level: 'baixo', autoCoupleTank: true })
store.setMode('run')

// Step simulation 2000ms (pump runs, hydraulic pipe carries water, tank fills past 82% -> float trips!)
for (let i = 0; i < 20; i++) {
  useSimStore.getState().step(100)
}
const afterFill = useSimStore.getState()
const pumpRun = afterFill.components.find((c) => c.id === pumpId)!
const tankFilled = afterFill.components.find((c) => c.id === tankId)!
const floatTripped = afterFill.components.find((c) => c.id === floatId)!
const hydFlow = afterFill.wires.find((w) => w.id === hydWireId)!

check('Water pump is running when powered on L1/N', !!pumpRun.state.running && Number(pumpRun.state.rpm) > 0, `rpm=${pumpRun.state.rpm}`)
check('Hydraulic pipe is energized (water flowing)', !!hydFlow.energized)
check('Water tank fills dynamically above 82%', Number(tankFilled.state.levelPct) >= 82 && !!tankFilled.state.filling, `level=${tankFilled.state.levelPct}%`)
check('Float switch auto-couples and trips on high water level', !!floatTripped.state.triggered && floatTripped.state.level === 'alto')

// Check zero bogus electrical diagnostics from hydraulic/pneumatic pipes
const diags = detectDiagnostics(afterFill.components, afterFill.wires, new Set<string>())
const shortErrors = diags.filter((d) => d.severity === 'error')
check('Zero electrical error diagnostics caused by hydraulic/pneumatic pipes', shortErrors.length === 0, shortErrors.map((d) => d.title).join('; '))

// Turn off source and open outlet valve to verify draining and float reset
useSimStore.getState().setComponentState(srcId, { on: false })
useSimStore.getState().setComponentState(tankId, { outletValveOpen: true, levelPct: 30 })
for (let i = 0; i < 15; i++) {
  useSimStore.getState().step(100)
}
const afterDrain = useSimStore.getState()
const tankDrained = afterDrain.components.find((c) => c.id === tankId)!
const floatReset = afterDrain.components.find((c) => c.id === floatId)!
check('Opening outlet valve drains tank and resets float switch below 25%', Number(tankDrained.state.levelPct) <= 25 && !floatReset.state.triggered, `level=${tankDrained.state.levelPct}%`)

if (failed > 0) {
  console.error(`\n❌ ${failed} hydraulic test(s) failed`)
  process.exit(1)
}
console.log('\n✅ ALL HYDRAULICS & PNEUMATICS FUNCTIONAL TESTS PASSED!')
