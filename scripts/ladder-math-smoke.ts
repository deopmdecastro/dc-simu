import assert from 'node:assert/strict'
import { runScan, type CounterTable, type TimerTable } from '../src/ladder/ladderEngine'
import { applyKind } from '../src/ladder/ladderDnd'
import { computeMath, execMath } from '../src/ladder/ladderMath'
import { lintLadder } from '../src/ladder/ladderLint'
import { formatPresetMs, parseAddress, parseCounterPreset, parsePresetMs } from '../src/ladder/ladderInlineEdit'
import type { DbTable } from '../src/ladder/dataBlocks'
import type { LadderProgram, LadderRung } from '../src/types'

// 1) operações
assert.equal(computeMath('ADD', 2, 3, true), 5)
assert.equal(computeMath('SUB', 2, 3, true), -1)
assert.equal(computeMath('MUL', 4, 5, true), 20)
assert.equal(computeMath('DIV', 7, 2, true), 3, 'Int trunca')
assert.equal(computeMath('DIV', 7, 2, false), 3.5, 'Real mantém decimais')
assert.equal(computeMath('MOD', 7, 3, true), 1)
assert.equal(computeMath('DIV', 1, 0, true), undefined)
assert.equal(computeMath('MOD', 1, 0, true), undefined)

// 2) execução: MWn criada como INT; overflow e operando inválido não escrevem
const db: DbTable = { MW0: { type: 'INT', value: 10 }, 'DB1.R': { type: 'REAL', value: 0 }, 'DB1.B': { type: 'BOOL', value: false } }
assert.equal(execMath({ op: 'ADD', in1: 'MW0', in2: '5', out: 'MW2' }, { db }), true)
assert.equal(db.MW2.value, 15)
assert.equal(execMath({ op: 'DIV', in1: 'MW0', in2: '4', out: 'DB1.R' }, { db }), true)
assert.equal(db['DB1.R'].value, 2.5)
assert.equal(execMath({ op: 'MUL', in1: '30000', in2: '2', out: 'MW4' }, { db }), false, 'overflow Int')
assert.equal(execMath({ op: 'ADD', in1: 'LIXO', in2: '1', out: 'MW4' }, { db }), false)
assert.equal(execMath({ op: 'ADD', in1: '1', in2: '1', out: 'DB1.B' }, { db }), false, 'destino BOOL')
assert.equal(execMath({ op: 'DIV', in1: '1', in2: '0', out: 'MW6' }, { db }), false)

// 3) integração no scan: só executa com a network ativa
const rung = (id: string, patch: Partial<LadderRung>): LadderRung => ({ id, name: id, branches: [], coils: [], enabled: true, ...patch })
const on: LadderProgram = { rungs: [rung('r1', { branches: [{ id: 'b', elements: [] }], math: { op: 'ADD', in1: '2', in2: '3', out: 'MW0' } })] }
const off: LadderProgram = { rungs: [rung('r1', { branches: [{ id: 'b', elements: [{ kind: 'contact', id: 'c', address: 'I0.0', contactType: 'NO' }] }], math: { op: 'ADD', in1: '2', in2: '3', out: 'MW0' } })] }
const dbOn: DbTable = {}; const dbOff: DbTable = {}
const t = {} as TimerTable; const c = {} as CounterTable
runScan(on, { I1: false }, t, c, 10, {}, [], dbOn, {} as never)
runScan(off, { I1: false }, t, c, 10, {}, [], dbOff, {} as never)
assert.equal(dbOn.MW0?.value, 5)
assert.equal(dbOff.MW0, undefined)

// 4) paleta e lint
const added = applyKind(rung('r', {}), 'MUL')
assert.equal(added.rung.math?.op, 'MUL')
assert.equal(applyKind(added.rung, 'DIV').rung.math?.op, 'DIV', 'volta a escolher a operação')
assert.ok(lintLadder({ rungs: [rung('r', { math: { op: 'DIV', in1: 'MW0', in2: '0', out: 'MW2' } })] }).some((i) => i.id.endsWith('math-div0')))

// 5) edição inline
assert.deepEqual(parseAddress(' %q1 '), { ok: true, value: 'Q0.0' })
assert.equal(parseAddress('xx').ok, false)
assert.deepEqual(parseAddress('mw4', 'compare'), { ok: true, value: 'MW4' })
assert.equal(parseAddress('I0.0', 'moveTarget').ok, false, 'MOVE não escreve em entradas')
assert.equal(parseAddress('MW2', 'moveTarget').ok, true)
assert.equal(parseAddress('M0.0', 'mathTarget').ok, false)
assert.deepEqual(parsePresetMs('T#3S'), { ok: true, value: 3000 })
assert.deepEqual(parsePresetMs('1,5s'), { ok: true, value: 1500 })
assert.deepEqual(parsePresetMs('500ms'), { ok: true, value: 500 })
assert.deepEqual(parsePresetMs('250'), { ok: true, value: 250 })
assert.equal(parsePresetMs('abc').ok, false)
assert.equal(formatPresetMs(3000), 'T#3S')
assert.equal(formatPresetMs(1500), 'T#1.5S')
assert.deepEqual(parseCounterPreset('12'), { ok: true, value: 12 })
assert.equal(parseCounterPreset('-1').ok, false)
// 6) TONR: acumula, retém ao desligar, reset zera
const tonr = (input: boolean): LadderProgram => ({ rungs: [rung('t', { branches: [{ id: 'b', elements: input ? [] : [{ kind: 'contact', id: 'x', address: 'I1.0', contactType: 'NO' }] }], timer: { kind: 'timer', id: 'tt', address: 'T1', timerType: 'TONR', presetMs: 100, resetAddress: 'M0.0' } })] })
const tt = {} as TimerTable; const tbl: Record<string, boolean> = {}
runScan(tonr(true), tbl, tt, c, 40, {}, [], {}, {} as never)
runScan(tonr(false), tbl, tt, c, 40, {}, [], {}, {} as never)
assert.equal(tt.T1.elapsedMs, 40, 'retém o tempo ao desligar')
runScan(tonr(true), tbl, tt, c, 40, {}, [], {}, {} as never)
runScan(tonr(true), tbl, tt, c, 40, {}, [], {}, {} as never)
assert.equal(tbl.T1, true, 'atinge o preset somando intervalos')
tbl['M0.0'] = true
runScan(tonr(true), tbl, tt, c, 40, {}, [], {}, {} as never)
assert.equal(tt.T1.elapsedMs, 0); assert.equal(tbl.T1, false)
console.log('ladder-math-smoke: OK')
