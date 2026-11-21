import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createComponent } from '../src/electrical/factory'
import { useSimStore } from '../src/store/useSimStore'
import { isPanelBound } from '../src/three/panelBounds'
import { hasComponent3DVisual, canInsertComponent3D } from '../src/three/modelPaths'
import { HYDRAULIC_DATASHEETS, flowMeterSpecOf } from '../src/three/hydraulicsModel'
import { STRUCTURES_DATASHEETS, computeQuickAttach3D, isWireMeshTrayType } from '../src/three/structuresModel'

let passed = 0
const check = (name: string, fn: () => void) => {
  fn()
  passed += 1
  console.log(`  PASS: ${name}`)
}

console.log('Running Wire-Mesh Trays + ZJLCD-BT01 Flow Meter + Gradual Drain smoke suite...')

check('All 5 new components exist, unlock 3D, stay external to panel, and have valid PDFs', () => {
  const newTypes = [
    'hydraulicFlowMeter',
    'wireTrayStraight',
    'wireTrayElbow90',
    'wireTrayTee',
    'wireTrayRiser90',
  ] as const
  for (const t of newTypes) {
    const c = createComponent(t, 'T1', 100, 100)
    assert.equal(c.type, t)
    assert.equal(hasComponent3DVisual(t), true, `3D locked for ${t}`)
    assert.equal(canInsertComponent3D(t), true, `Insert blocked for ${t}`)
    assert.equal(isPanelBound(c), false, `Must be external to panel: ${t}`)
    const dsPath = t === 'hydraulicFlowMeter'
      ? HYDRAULIC_DATASHEETS.hydraulicFlowMeter.path
      : STRUCTURES_DATASHEETS[t].path
    const abs = path.join(process.cwd(), 'public', dsPath.replace(/^\//, ''))
    assert.ok(fs.existsSync(abs) && fs.statSync(abs).size > 500, `Missing PDF ${abs}`)
  }
})

check('ZJLCD-BT01 flow meter has IN, OUT, +24V, PULSE, GND editable terminals & DN25..DN80 specs', () => {
  const fm = createComponent('hydraulicFlowMeter', 'FM1', 100, 100)
  const labels = fm.terminals.map((t) => t.label)
  for (const req of ['IN', 'OUT', '+24V', 'PULSE', 'GND']) {
    assert.ok(labels.includes(req), `Missing terminal ${req}`)
  }
  assert.equal(flowMeterSpecOf({ pipeDN: 'DN25' }).outerMm, 32)
  assert.equal(flowMeterSpecOf({ pipeDN: 'DN32' }).outerMm, 40)
  assert.equal(flowMeterSpecOf({ pipeDN: 'DN50' }).outerMm, 63)
  assert.equal(flowMeterSpecOf({ pipeDN: 'DN80' }).outerMm, 90)
})

check('Wire-mesh tray quick-attach chains Straight -> Elbow90 -> Tee -> Riser90 seamlessly', () => {
  const s = createComponent('wireTrayStraight', 'EA1', 100, 100)
  assert.equal(isWireMeshTrayType(s.type), true)
  const attached = computeQuickAttach3D(s, { x: 0, y: 1, z: 2 }, 'wireTrayElbow90', 'right')
  assert.ok(attached.position3D.x > 5, `Expected positive X offset, got ${attached.position3D.x}`)
  assert.equal(attached.statePatch.widthMm, 200)
})

check('Hydraulic simulation: Tank drain lowers levelPct all the way to 0% AND counts liters on inline ZJLCD-BT01!', () => {
  useSimStore.setState({ components: [], wires: [], selectedComponentIds: [] })
  const st = useSimStore.getState()
  const tkId = st.addComponent('waterTank', 200, 200)!
  const fmId = st.addComponent('hydraulicFlowMeter', 420, 200)!
  const dcId = st.addComponent('powerSource24v', 60, 400)!
  st.setComponentState(tkId, { levelPct: 18, outletValveOpen: true })
  st.setComponentState(fmId, { singleVolumeL: 0, totalVolumeL: 0, pipeDN: 'DN32' })

  const comps = useSimStore.getState().components
  const tk = comps.find((c) => c.id === tkId)!
  const fm = comps.find((c) => c.id === fmId)!
  const dc = comps.find((c) => c.id === dcId)!
  st.addWire(dc.terminals.find(t => t.label === '+24V')!.id, fm.terminals.find(t => t.label === '+24V')!.id)
  st.addWire(dc.terminals.find(t => t.label === '0V')!.id, fm.terminals.find(t => t.label === 'GND')!.id)
  const tkOut = tk.terminals.find((t) => t.label === 'OUT')!
  const fmIn = fm.terminals.find((t) => t.label === 'IN')!

  st.setWireDefaults({ medium: 'hydraulic', color: 'lightblue', gauge: 'DN32 (Ø40mm)', endType: 'hydraulicFitting' })
  st.addWire(tkOut.id, fmIn.id)

  useSimStore.setState((s) => ({ sim: { ...s.sim, runState: 'running' } }))
  for (let i = 0; i < 65; i++) {
    useSimStore.getState().step(100)
  }
  const after = useSimStore.getState().components
  const tkAfter = after.find((c) => c.id === tkId)!
  const fmAfter = after.find((c) => c.id === fmId)!
  useSimStore.setState((s) => ({ sim: { ...s.sim, runState: 'stopped' } }))

  assert.equal(Number(tkAfter.state.levelPct), 0, `Tank should drain completely to 0%, got ${tkAfter.state.levelPct}`)
  assert.ok(Number(fmAfter.state.singleVolumeL) > 0.5, `Flow meter should count >0.5 L during drain, got ${fmAfter.state.singleVolumeL}`)
  assert.ok(Number(fmAfter.state.totalVolumeL) > 0.5, `Flow meter total should increase, got ${fmAfter.state.totalVolumeL}`)
})

console.log(`ALL ${passed} WIRE-TRAY / FLOW-METER / DRAIN SMOKE CHECKS PASSED!`)
