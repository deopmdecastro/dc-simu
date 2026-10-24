import assert from 'node:assert/strict'
import { runScan, type CounterTable, type TimerTable } from '../src/ladder/ladderEngine'
import { evalCompare, compareNumbers } from '../src/ladder/compare'
import { applyKind } from '../src/ladder/ladderDnd'
import { lintLadder } from '../src/ladder/ladderLint'
import type { LadderContact, LadderProgram, LadderRung } from '../src/types'
import type { DbTable } from '../src/ladder/dataBlocks'

const cmp = (address: string, op: LadderContact['compareOp'], value: string, type: LadderContact['compareType'] = 'Int'): LadderContact =>
  ({ kind: 'contact', id: `c-${address}-${op}-${value}`, address, contactType: 'CMP', compareOp: op, compareType: type, compareValue: value })

// 1) operadores
for (const [op, a, b, expected] of [
  ['==', 2, 2, true], ['==', 2, 3, false], ['<>', 2, 3, true], ['<>', 2, 2, false],
  ['>=', 3, 3, true], ['>=', 2, 3, false], ['<=', 3, 3, true], ['<=', 4, 3, false],
  ['>', 4, 3, true], ['>', 3, 3, false], ['<', 2, 3, true], ['<', 3, 3, false],
] as const) assert.equal(compareNumbers(op, a, b), expected, `${a} ${op} ${b}`)

// 2) operandos: MW (0 por omissão), literais, hex, DB, contador, temporizador
const db: DbTable = { 'DB1.NIVEL': { type: 'INT', value: 7 }, MW2: { type: 'INT', value: 5 } }
const timers = { T1: { elapsedMs: 1500, presetMs: 3000, done: false, running: true } } as TimerTable
const counters = { C1: { count: 4, preset: 5, done: false, prevPulse: false } } as CounterTable
const ctx = { db, timers, counters }
assert.equal(evalCompare(cmp('MW0', '==', '0'), ctx), true)
assert.equal(evalCompare(cmp('MW2', '>=', '5'), ctx), true)
assert.equal(evalCompare(cmp('DB1.NIVEL', '>', '6'), ctx), true)
assert.equal(evalCompare(cmp('C1', '<', '5'), ctx), true)
assert.equal(evalCompare(cmp('T1', '>=', '1000'), ctx), true)
assert.equal(evalCompare(cmp('MW2', '==', '16#5', 'Word'), ctx), true)
assert.equal(evalCompare(cmp('MW2', '==', 'LIXO'), ctx), false, 'operando desconhecido nunca conduz')
// Word é 16 bits sem sinal; Int mantém o sinal
assert.equal(evalCompare(cmp('-1', '==', '65535', 'Word'), ctx), true)
assert.equal(evalCompare(cmp('-1', '==', '65535', 'Int'), ctx), false)
assert.equal(evalCompare(cmp('1.5', '>', '1', 'Real'), ctx), true)

// 3) integração no scan: MOVE 5 → MW0 e depois o comparador liga Q1
const rung = (id: string, patch: Partial<LadderRung>): LadderRung => ({ id, name: id, branches: [], coils: [], enabled: true, ...patch })
const program: LadderProgram = {
  rungs: [
    rung('r1', { branches: [{ id: 'b', elements: [] }], move: { source: '5', target: 'MW0' } }),
    rung('r2', { branches: [{ id: 'b', elements: [cmp('MW0', '==', '5')] }], coils: [{ kind: 'coil', id: 'k1', address: 'Q1', coilType: 'COIL' }] }),
    rung('r3', { branches: [{ id: 'b', elements: [cmp('MW0', '<>', '5')] }], coils: [{ kind: 'coil', id: 'k2', address: 'Q2', coilType: 'COIL' }] }),
  ],
}
const table: Record<string, boolean> = {}
const runtimeDb: DbTable = {}
runScan(program, table, {}, {}, 10, {}, [], runtimeDb)
assert.equal(runtimeDb.MW0?.value, 5, 'MOVE cria MW0 como INT')
assert.equal(table.Q1, true)
assert.equal(!!table.Q2, false)

// 4) inserção pela paleta: nasce como comparador pronto a editar, MW0 → MW2 → …
const empty = rung('r', {})
const first = applyKind(empty, 'CMP_GE')
const el1 = first.rung.branches[0].elements[0]
assert.deepEqual([el1.contactType, el1.compareOp, el1.compareType, el1.address, el1.compareValue], ['CMP', '>=', 'Int', 'MW0', '0'])
const second = applyKind(first.rung, 'CMP_LT')
assert.equal(second.rung.branches[0].elements[1].address, 'MW2')

// 5) lint: endereços MW não são erros; operandos inválidos são
assert.equal(lintLadder({ rungs: [rung('r', { branches: [{ id: 'b', elements: [cmp('MW0', '==', '2')] }], coils: [{ kind: 'coil', id: 'k', address: 'Q1', coilType: 'COIL' }] })] }).some((i) => i.level === 'error'), false)
assert.equal(lintLadder({ rungs: [rung('r', { branches: [{ id: 'b', elements: [cmp('??', '==', '2')] }], coils: [{ kind: 'coil', id: 'k', address: 'Q1', coilType: 'COIL' }] })] }).some((i) => i.level === 'error'), true)

console.log('ladder-compare-smoke: ok')
