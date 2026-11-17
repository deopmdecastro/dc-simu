/**
 * Smoke + unit suite for the live GRAFCET dock monitor (`liveFollow.ts` + `GrafcetLiveDock.tsx`):
 *  - Active-step focus and automatic progression (`X0 -> X1`, `X22 -> X27`)
 *  - Concurrent dual-GRAFCET side-by-side layout (multi-page `charts[]` AND same-page disconnected sub-graphs)
 *  - Parallel AND-divergence kept as a single GRAFCET unit (frames both active branches together)
 *  - 3+ concurrent GRAFCET prioritization (`isProgressed` + `lastChangeSeq`) + manual `G<n>` chip pinning
 *  - Phone & desktop CSS / component invariants (no 0px collapse, `GRAFCET completo` button, scoped SVG markers)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GrafcetProgram } from '../src/grafcet/engine'
import {
  computeLiveUnitStatuses,
  formatLiveStepCode,
  pickVisibleLiveUnits,
  resolveLiveGrafcetUnits,
} from '../src/grafcet/liveFollow'
import { grafcetExamples } from '../src/project/grafcetExamples'

const root = resolve(import.meta.dirname, '..')
let passed = 0
const check = (name: string, fn: () => void) => {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

check('formatLiveStepCode normalizes IEC step labels with X prefix', () => {
  assert.equal(formatLiveStepCode({ id: 's0', name: '0', initial: true, actions: [] }, 0), 'X0')
  assert.equal(formatLiveStepCode({ id: 's22', name: '22', initial: false, actions: [] }, 5), 'X22')
  assert.equal(formatLiveStepCode({ id: 's7', name: 'X7', initial: false, actions: [] }, 1), 'X7')
  assert.equal(formatLiveStepCode({ id: 's12', name: 'x12', initial: false, actions: [] }, 2), 'X12')
  assert.equal(formatLiveStepCode({ id: 's4', name: '', initial: false, actions: [] }, 4), 'X4')
})

check('single GRAFCET focuses initial step at idle, follows active step, and updates on transition', () => {
  const prog: GrafcetProgram = {
    name: 'Partida direta',
    steps: [
      { id: 's0', name: '0', initial: true, comment: 'Parado', actions: [] },
      { id: 's1', name: '1', initial: false, comment: 'Marcha', actions: [] },
    ],
    transitions: [
      { id: 't1', name: 'T1', condition: 'I0.1', from: ['s0'], to: ['s1'] },
      { id: 't2', name: 'T2', condition: '!I0.2', from: ['s1'], to: ['s0'] },
    ],
  }
  const units = resolveLiveGrafcetUnits(prog)
  assert.equal(units.length, 1)

  const idle = pickVisibleLiveUnits(computeLiveUnitStatuses(prog, units, []))
  assert.equal(idle.length, 1)
  assert.equal(idle[0].isActive, false)
  assert.deepEqual(idle[0].focusStepIds, ['s0'])

  const atX0 = pickVisibleLiveUnits(computeLiveUnitStatuses(prog, units, ['s0']))
  assert.equal(atX0.length, 1)
  assert.deepEqual(atX0[0].focusStepIds, ['s0'])
  assert.deepEqual(atX0[0].activeLabels, ['X0'])
  assert.equal(atX0[0].activeComment, 'Parado')

  const atX1 = pickVisibleLiveUnits(computeLiveUnitStatuses(prog, units, ['s1']))
  assert.equal(atX1.length, 1)
  assert.deepEqual(atX1[0].focusStepIds, ['s1'])
  assert.deepEqual(atX1[0].activeLabels, ['X1'])
  assert.equal(atX1[0].activeComment, 'Marcha')
  assert.equal(atX1[0].isProgressed, true)
})

check('multi-page concurrent GRAFCETs display side-by-side when 2 are active and track steps independently', () => {
  const est = grafcetExamples().find((e) => (e.program.charts?.length ?? 0) >= 3)
  assert.ok(est, 'expected multi-chart Estampagem example')
  const prog = est.program
  const units = resolveLiveGrafcetUnits(prog)
  assert.ok(units.length >= 3, `expected >=3 units, got ${units.length}`)

  const x1 = prog.steps.find((s) => s.name === '1')!
  const x22 = prog.steps.find((s) => s.name === '22')!
  const x27 = prog.steps.find((s) => s.name === '27')!
  assert.ok(x1 && x22 && x27)

  // Only 1 active -> 1 full-width pane
  const single = pickVisibleLiveUnits(computeLiveUnitStatuses(prog, units, [x1.id]))
  assert.equal(single.length, 1)
  assert.equal(single[0].unit.key, 'G0')
  assert.deepEqual(single[0].activeLabels, ['X1'])

  // 2 active simultaneously -> 2 side-by-side panes in stable G0 | G2 order
  const dual1 = pickVisibleLiveUnits(computeLiveUnitStatuses(prog, units, [x1.id, x22.id]))
  assert.equal(dual1.length, 2)
  assert.deepEqual(dual1.map((p) => p.unit.key), ['G0', 'G2'])
  assert.deepEqual(dual1[0].activeLabels, ['X1'])
  assert.deepEqual(dual1[1].activeLabels, ['X22'])

  // Right GRAFCET advances X22 -> X27 -> right pane auto-follows X27 while left stays on X1
  const dual2 = pickVisibleLiveUnits(computeLiveUnitStatuses(prog, units, [x1.id, x27.id]))
  assert.equal(dual2.length, 2)
  assert.deepEqual(dual2[0].activeLabels, ['X1'])
  assert.deepEqual(dual2[1].activeLabels, ['X27'])
  assert.deepEqual(dual2[1].focusStepIds, [x27.id])

  // Manual pin to G1 -> single pane on G1; clearing pin restores dual
  const g1 = units.find((u) => u.key === 'G1')!
  const pinned = pickVisibleLiveUnits(computeLiveUnitStatuses(prog, units, [x1.id, x27.id]), {
    pinnedUnitId: g1.id,
  })
  assert.equal(pinned.length, 1)
  assert.equal(pinned[0].unit.key, 'G1')
})

check('3+ concurrent GRAFCETs prioritize progressed and most recently changed units side-by-side', () => {
  const est = grafcetExamples().find((e) => (e.program.charts?.length ?? 0) >= 4)!
  const prog = est.program
  const units = resolveLiveGrafcetUnits(prog)
  const g0Init = prog.steps.find((s) => s.chart === units[0].chartId && s.initial)!
  const g1Prog = prog.steps.find((s) => s.chart === units[1].chartId && !s.initial)!
  const g2Prog = prog.steps.find((s) => s.chart === units[2].chartId && !s.initial)!
  const g3Init = prog.steps.find((s) => s.chart === units[3].chartId && s.initial)!

  const seq = new Map<string, number>([
    [units[0].id, 10],
    [units[1].id, 3],
    [units[2].id, 7],
    [units[3].id, 9],
  ])
  const visible = pickVisibleLiveUnits(
    computeLiveUnitStatuses(prog, units, [g0Init.id, g1Prog.id, g2Prog.id, g3Init.id], seq),
  )
  assert.equal(visible.length, 2)
  assert.deepEqual(visible.map((v) => v.unit.key), [units[1].key, units[2].key])
})

check('same-page disconnected GRAFCETs split into G0 | G1 side-by-side while AND-divergence stays 1 unit', () => {
  const twoLoops: GrafcetProgram = {
    name: 'Dois ciclos em paralelo',
    steps: [
      { id: 'a0', name: '0', initial: true, x: 180, y: 80, actions: [] },
      { id: 'a1', name: '1', initial: false, x: 180, y: 220, actions: [] },
      { id: 'b0', name: '10', initial: true, x: 560, y: 80, actions: [] },
      { id: 'b1', name: '11', initial: false, x: 560, y: 220, actions: [] },
    ],
    transitions: [
      { id: 'ta0', name: 'T1', condition: 'S1', from: ['a0'], to: ['a1'] },
      { id: 'ta1', name: 'T2', condition: 'S2', from: ['a1'], to: ['a0'] },
      { id: 'tb0', name: 'T10', condition: 'B1', from: ['b0'], to: ['b1'] },
      { id: 'tb1', name: 'T11', condition: 'B2', from: ['b1'], to: ['b0'] },
    ],
  }
  const loopUnits = resolveLiveGrafcetUnits(twoLoops)
  assert.equal(loopUnits.length, 2)
  assert.deepEqual(loopUnits.map((u) => u.key), ['G0', 'G1'])
  assert.deepEqual(loopUnits[0].stepIds, ['a0', 'a1'])
  assert.deepEqual(loopUnits[1].stepIds, ['b0', 'b1'])

  const dual = pickVisibleLiveUnits(computeLiveUnitStatuses(twoLoops, loopUnits, ['a1', 'b1']))
  assert.equal(dual.length, 2)
  assert.deepEqual(dual.map((p) => p.activeLabels[0]), ['X1', 'X11'])

  // Parallel AND divergence inside ONE GRAFCET must NOT split into 2 units
  const andProg: GrafcetProgram = {
    name: 'Divergência E',
    steps: [
      { id: 'p0', name: '0', initial: true, actions: [] },
      { id: 'p1', name: '1', initial: false, actions: [] },
      { id: 'p2', name: '2', initial: false, actions: [] },
    ],
    transitions: [
      { id: 'tp1', name: 'T1', condition: 'S1', from: ['p0'], to: ['p1', 'p2'] },
      { id: 'tp2', name: 'T2', condition: 'S2', from: ['p1', 'p2'], to: ['p0'] },
    ],
  }
  const andUnits = resolveLiveGrafcetUnits(andProg)
  assert.equal(andUnits.length, 1)
  const andVis = pickVisibleLiveUnits(computeLiveUnitStatuses(andProg, andUnits, ['p1', 'p2']))
  assert.equal(andVis.length, 1)
  assert.deepEqual(andVis[0].activeLabels, ['X1', 'X2'])
  assert.deepEqual(andVis[0].focusStepIds, ['p1', 'p2'])
})

check('component & CSS contracts: GRAFCET completo CTA, dual grid, phone flex non-collapse, scoped SVG markers', () => {
  const dockSrc = readFileSync(resolve(root, 'src/grafcet/GrafcetLiveDock.tsx'), 'utf8')
  const rightDock = readFileSync(resolve(root, 'src/components/RightDockPanel.tsx'), 'utf8')
  const editorSrc = readFileSync(resolve(root, 'src/grafcet/GrafcetEditor.tsx'), 'utf8')
  const editorCss = readFileSync(resolve(root, 'src/styles/grafcet-editor.css'), 'utf8')
  const mobileCss = readFileSync(resolve(root, 'src/styles/mobile-refine.css'), 'utf8')

  assert.match(dockSrc, /GRAFCET completo/)
  assert.match(dockSrc, /data-open-full-grafcet/)
  assert.match(rightDock, /GrafcetLiveDock/)
  assert.doesNotMatch(editorSrc, /url\(#grafcet-arrow/)
  assert.match(editorCss, /\.grafcet-live-grid\.is-dual[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(mobileCss, /\.schematic-sim-dock-phone\.grafcet-properties\.is-open > \.grafcet-live-dock/)
  assert.match(mobileCss, /\.dc-cmd \.cmd-dock\.grafcet-properties\.is-open > \.grafcet-live-dock/)
})

console.log(`PASS grafcet-live-dock-smoke (${passed}/${passed})`)
