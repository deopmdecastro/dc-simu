import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createComponent } from '../src/electrical/factory'
import { computeContinuity, isLoadPowered, sourceTerminalIds } from '../src/electrical/engine'
import { isPanelBound } from '../src/three/panelBounds'
import {
  JUNCTION_WAGO_DATASHEETS,
  computeJunctionBoxSurfaceSnap,
  isJunctionBoxType,
  isWagoConnectorType,
} from '../src/three/junctionWagoModel'
import type { Wire } from '../src/types'

let passed = 0
const check = (name: string, fn: () => void) => {
  fn()
  passed += 1
  console.log(`  PASS: ${name}`)
}

console.log('Running OBO Junction Boxes & WAGO 221 smoke suite...')

check('All 7 OBO & WAGO types exist in factory and have valid PDF datasheets', () => {
  const types = [
    'junctionBoxOboT60',
    'junctionBoxOboA6',
    'junctionBoxOboT25',
    'wago221_2',
    'wago221_5',
    'wago221_inline',
    'wago221_double',
  ] as const
  for (const t of types) {
    const inst = createComponent(t, 'TEST', 100, 100)
    assert.equal(inst.type, t, `Factory failed for ${t}`)
    const ds = JUNCTION_WAGO_DATASHEETS[t]
    assert.ok(ds, `Missing datasheet entry for ${t}`)
    const pdfPath = path.join(process.cwd(), 'public', ds.path.replace(/^\//, ''))
    assert.ok(fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 500, `Missing/empty PDF ${pdfPath}`)
  }
})

check('PanelBounds: OBO boxes stay external; WAGO switches between panel vs free/box', () => {
  const t60 = createComponent('junctionBoxOboT60', 'CX1', 100, 100)
  const w5 = createComponent('wago221_5', 'W1', 200, 100)
  assert.equal(isJunctionBoxType(t60.type), true)
  assert.equal(isWagoConnectorType(w5.type), true)
  assert.equal(isPanelBound(t60), false)
  assert.equal(isPanelBound(w5), false)
  w5.state.hostLocation = 'panel'
  assert.equal(isPanelBound(w5), true)
  w5.state.hostLocation = 'box'
  w5.state.hostBoxId = t60.id
  assert.equal(isPanelBound(w5), false)
})

check('Electrical engine: WAGO 221-415 bridges closed levers and disconnects open lever!', () => {
  const src = createComponent('powerSource1ph', 'AL1', 100, 100)
  const w5 = createComponent('wago221_5', 'W1', 260, 100)
  const lamp = createComponent('ledGreen', 'H1', 420, 100)
  const tL = src.terminals.find((t) => t.label === 'L')!
  const tN = src.terminals.find((t) => t.label === 'N')!
  const w1 = w5.terminals[0]!
  const w2 = w5.terminals[1]!
  const lX1 = lamp.terminals[0]!
  const lX2 = lamp.terminals[1]!

  const wires: Wire[] = [
    { id: 'w-a', fromComponentId: src.id, fromTerminalId: tL.id, toComponentId: w5.id, toTerminalId: w1.id, color: '#92400e', gauge: 1.5, kind: 'power' },
    { id: 'w-b', fromComponentId: w5.id, fromTerminalId: w2.id, toComponentId: lamp.id, toTerminalId: lX1.id, color: '#92400e', gauge: 1.5, kind: 'power' },
    { id: 'w-n', fromComponentId: src.id, fromTerminalId: tN.id, toComponentId: lamp.id, toTerminalId: lX2.id, color: '#2563eb', gauge: 1.5, kind: 'neutral' },
  ]

  // All levers closed -> lamp energized!
  const comps1 = [src, w5, lamp]
  const resClosed = computeContinuity(comps1, wires, sourceTerminalIds(comps1, undefined, wires))
  assert.equal(isLoadPowered(lamp, resClosed.energizedTerminals), true, 'Lamp should be energized with WAGO levers closed')

  // Open lever #2 -> breaks continuity!
  w5.state.leversOpen = [false, true, false, false, false]
  const resOpen = computeContinuity(comps1, wires, sourceTerminalIds(comps1, undefined, wires))
  assert.equal(isLoadPowered(lamp, resOpen.energizedTerminals), false, 'Lamp must turn OFF when WAGO lever #2 is opened')
})

check('Electrical engine: WAGO 221 double 2x5 keeps rows A and B isolated unless commonBus=true', () => {
  const src = createComponent('powerSource1ph', 'AL1', 100, 100)
  const wd = createComponent('wago221_double', 'W2', 260, 100)
  const lamp = createComponent('ledGreen', 'H2', 420, 100)
  const tL = src.terminals.find((t) => t.label === 'L')!
  const tN = src.terminals.find((t) => t.label === 'N')!
  const a1 = wd.terminals.find((t) => t.label === 'A1')!
  const b1 = wd.terminals.find((t) => t.label === 'B1')!
  const lX1 = lamp.terminals[0]!
  const lX2 = lamp.terminals[1]!

  const wires: Wire[] = [
    { id: 'w1', fromComponentId: src.id, fromTerminalId: tL.id, toComponentId: wd.id, toTerminalId: a1.id, color: '#92400e', gauge: 1.5, kind: 'power' },
    { id: 'w2', fromComponentId: wd.id, fromTerminalId: b1.id, toComponentId: lamp.id, toTerminalId: lX1.id, color: '#92400e', gauge: 1.5, kind: 'power' },
    { id: 'w3', fromComponentId: src.id, fromTerminalId: tN.id, toComponentId: lamp.id, toTerminalId: lX2.id, color: '#2563eb', gauge: 1.5, kind: 'neutral' },
  ]

  const comps2 = [src, wd, lamp]
  const resIso = computeContinuity(comps2, wires, sourceTerminalIds(comps2, undefined, wires))
  assert.equal(isLoadPowered(lamp, resIso.energizedTerminals), false, 'Rows A and B must be isolated by default')

  wd.state.commonBus = true
  const resCommon = computeContinuity(comps2, wires, sourceTerminalIds(comps2, undefined, wires))
  assert.equal(isLoadPowered(lamp, resCommon.energizedTerminals), true, 'Rows A and B should bridge when commonBus=true')
})

check('OBO Junction Box quick-snap attaches onto nearby waterTank or industrialWall', () => {
  const tank = createComponent('waterTank', 'R1', 100, 100)
  tank.panel3DPosition = { x: 4, y: 0, z: 4 }
  const t60 = createComponent('junctionBoxOboT60', 'CX1', 200, 100)
  const snapTank = computeJunctionBoxSurfaceSnap(t60, [tank, t60], { x: 5.5, y: 1.0, z: 4.5 }, -0.34)
  assert.ok(snapTank.surfaceLabel.includes('Reservatório'), `Expected tank snap, got ${snapTank.surfaceLabel}`)

  const wall = createComponent('industrialWall', 'P1', 100, 100)
  wall.panel3DPosition = { x: -3, y: 0, z: 1.0 }
  const snapWall = computeJunctionBoxSurfaceSnap(t60, [wall, t60], { x: -3.2, y: 0.4, z: 1.5 }, -0.34)
  assert.ok(snapWall.surfaceLabel.includes('Parede'), `Expected wall snap, got ${snapWall.surfaceLabel}`)
})

console.log(`ALL ${passed} OBO/WAGO SMOKE CHECKS PASSED!`)
