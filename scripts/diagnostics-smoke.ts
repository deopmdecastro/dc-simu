// Diagnósticos novos: Ladder (NO/NC contraditórios, presets a 0) e GRAFCET (armadilha sem retorno à etapa inicial).
import assert from 'node:assert/strict'
import { lintLadder } from '../src/ladder/ladderLint'
import { validateGrafcet, type GrafcetProgram } from '../src/grafcet/engine'
import { GRAFCET_TEMPLATES } from '../src/grafcet/templates'
import type { LadderRung } from '../src/types'

const contact = (id: string, address: string, contactType: 'NO' | 'NC') => ({ kind: 'contact' as const, id, address, contactType })
const rung = (id: string, extra: Partial<LadderRung>): LadderRung => ({ id, name: id, branches: [], coils: [], enabled: true, ...extra })
const coil = { kind: 'coil' as const, id: 'k', address: 'Q1', coilType: 'COIL' as const }

// Ladder — contradição NO/NC no mesmo ramo
const clash = lintLadder({ rungs: [rung('r', { branches: [{ id: 'b', elements: [contact('c1', 'I1', 'NO'), contact('c2', 'I1', 'NC')] }], coils: [coil] })] })
assert.ok(clash.some((i) => i.id === 'b:contradiction'), 'NO+NC do mesmo endereço avisa')
const fine = lintLadder({ rungs: [rung('r', { branches: [{ id: 'b', elements: [contact('c1', 'I1', 'NO'), contact('c2', 'I2', 'NC')] }], coils: [coil] })] })
assert.ok(!fine.some((i) => i.id.endsWith(':contradiction')), 'endereços distintos não avisam')
const parallel = lintLadder({ rungs: [rung('r', { branches: [{ id: 'b1', elements: [contact('c1', 'I1', 'NO')] }, { id: 'b2', elements: [contact('c2', 'I1', 'NC')] }], coils: [coil] })] })
assert.ok(!parallel.some((i) => i.id.endsWith(':contradiction')), 'ramos paralelos (OR) não são contraditórios')

// Ladder — presets a 0
const t0 = lintLadder({ rungs: [rung('r', { branches: [{ id: 'b', elements: [contact('c1', 'I1', 'NO')] }], timer: { kind: 'timer', id: 't', address: 'T1', timerType: 'TON', presetMs: 0 } })] })
assert.ok(t0.some((i) => i.id === 'r:timer-preset'), 'TON com preset 0 avisa')
const t5 = lintLadder({ rungs: [rung('r', { branches: [{ id: 'b', elements: [contact('c1', 'I1', 'NO')] }], timer: { kind: 'timer', id: 't', address: 'T1', timerType: 'TON', presetMs: 5000 } })] })
assert.ok(!t5.some((i) => i.id === 'r:timer-preset'), 'TON com preset > 0 não avisa')
const c0 = lintLadder({ rungs: [rung('r', { branches: [{ id: 'b', elements: [contact('c1', 'I1', 'NO')] }], counter: { kind: 'counter', id: 'c', address: 'C1', counterType: 'CTU', preset: 0, resetAddress: 'I2' } })] })
assert.ok(c0.some((i) => i.id === 'r:counter-preset'), 'contador com preset 0 avisa')

// GRAFCET — armadilha
const step = (id: string, name: string, initial = false) => ({ id, name, initial, actions: [] }) as unknown as GrafcetProgram['steps'][number]
const trap: GrafcetProgram = {
  steps: [step('a', '0', true), step('b', '1'), step('c', '2')],
  transitions: [
    { id: 't0', from: ['a'], to: ['b'], condition: 'I1' },
    { id: 't1', from: ['b'], to: ['c'], condition: 'I2' },
    { id: 't2', from: ['c'], to: ['b'], condition: 'I3' },
  ],
}
const trapIssues = validateGrafcet(trap).filter((i) => i.id.endsWith(':trap'))
assert.deepEqual(trapIssues.map((i) => i.entityId).sort(), ['b', 'c'], 'ciclo 1↔2 sem retorno à etapa 0 é armadilha')
const loop: GrafcetProgram = { ...trap, transitions: [...trap.transitions.slice(0, 2), { id: 't2', from: ['c'], to: ['a'], condition: 'I3' }] }
assert.ok(!validateGrafcet(loop).some((i) => i.id.endsWith(':trap')), 'ciclo completo não avisa')

// Os modelos incluídos não podem gerar avisos de armadilha
for (const template of GRAFCET_TEMPLATES) {
  const bad = validateGrafcet(template.program).filter((i) => i.id.endsWith(':trap'))
  assert.equal(bad.length, 0, `modelo «${template.name}» gera armadilha: ${bad.map((i) => i.message).join(' | ')}`)
}
console.log(`diagnósticos: OK (${GRAFCET_TEMPLATES.length} modelos verificados)`)
