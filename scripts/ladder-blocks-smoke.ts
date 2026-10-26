import assert from 'node:assert/strict'
import type { LadderBranch, LadderCoilEl, LadderContact, LadderRung } from '../src/types'
import { runScan, collectUsedAddresses, rungWriteTargets, type CounterTable, type EdgeTable, type RungTraceEntry, type TimerTable } from '../src/ladder/ladderEngine'
import { computeLimit, computeScale } from '../src/ladder/ladderMath'
import type { DbTable } from '../src/ladder/dataBlocks'
import { lintLadder, LABEL_RE } from '../src/ladder/ladderLint'
import { applyKind, isContactKind, isJumpKind } from '../src/ladder/ladderDnd'
import { findBreakpointHit, describeBreakHit, formatTraceValue } from '../src/ladder/ladderDebug'

// LADDER-SIM-03 (XOR, LIMIT, SCALE, JMP/JMPN/LBL) e LADDER-SIM-02 (passo a passo + pontos de paragem).
let checks = 0
const check = (name: string, ok: boolean) => { assert.ok(ok, name); checks++ }

let n = 0
const contact = (address: string, contactType: LadderContact['contactType'] = 'NO', extra: Partial<LadderContact> = {}): LadderContact => ({ kind: 'contact', id: `c${n++}`, address, contactType, ...extra })
const coil = (address: string, coilType: LadderCoilEl['coilType'] = 'COIL'): LadderCoilEl => ({ kind: 'coil', id: `k${n++}`, address, coilType })
const branch = (...elements: LadderContact[]): LadderBranch => ({ id: `b${n++}`, elements })
const rung = (id: string, branches: LadderBranch[], coils: LadderCoilEl[], extra: Partial<LadderRung> = {}): LadderRung => ({ id, name: '', enabled: true, branches, coils, ...extra })

function scan(rungs: LadderRung[], table: Record<string, boolean>, db: DbTable = {}, trace?: RungTraceEntry[]) {
  const timers: TimerTable = {}
  const counters: CounterTable = {}
  const edges: EdgeTable = {}
  return runScan({ rungs }, table, timers, counters, 100, {}, [], db, edges, {}, { trace })
}

// ---------------------------------------------------------------- XOR
{
  const prog = [rung('x', [branch(contact('I0.0', 'XOR', { xorAddress: 'I0.1' }))], [coil('Q0.0')])]
  const truth: Array<[boolean, boolean, boolean]> = [[false, false, false], [true, false, true], [false, true, true], [true, true, false]]
  for (const [a, b, q] of truth) {
    const t: Record<string, boolean> = { 'I0.0': a, 'I0.1': b }
    scan(prog, t)
    check(`XOR ${+a}/${+b} → Q0.0 = ${+q}`, !!t['Q0.0'] === q)
  }
  // Em série faz E com o RLO à esquerda.
  const serie = [rung('x2', [branch(contact('M0.0'), contact('I0.0', 'XOR', { xorAddress: 'I0.1' }))], [coil('Q0.1')])]
  const t1: Record<string, boolean> = { 'M0.0': false, 'I0.0': true }
  scan(serie, t1)
  check('XOR em série com M0.0 = 0 não conduz', !t1['Q0.1'])
  t1['M0.0'] = true; scan(serie, t1)
  check('XOR em série com M0.0 = 1 conduz', !!t1['Q0.1'])
  // Lê bits de DB BOOL.
  const dbx: DbTable = { 'DB1.A': { type: 'BOOL', value: true } }
  const t2: Record<string, boolean> = { 'I0.1': true }
  scan([rung('x3', [branch(contact('DB1.A', 'XOR', { xorAddress: 'I0.1' }))], [coil('Q0.2')])], t2, dbx)
  check('XOR com DB1.A = 1 e I0.1 = 1 não conduz', !t2['Q0.2'])
  check('collectUsedAddresses inclui o 2.º operando do XOR', collectUsedAddresses({ rungs: prog }).includes('I0.1'))
  const lint = lintLadder({ rungs: [rung('xl', [branch(contact('I0.0', 'XOR'))], [coil('Q0.0')])] })
  check('lint: XOR sem 2.º operando é erro', lint.some((i) => i.id.endsWith(':xor-b') && i.level === 'error'))
  const lintSame = lintLadder({ rungs: [rung('xs', [branch(contact('I0.0', 'XOR', { xorAddress: 'I0.0' }))], [coil('Q0.0')])] })
  check('lint: XOR consigo próprio é aviso', lintSame.some((i) => i.id.endsWith(':xor-same')))
  check('paleta: XOR é contacto', isContactKind('XOR'))
  const created = applyKind(rung('p', [], []), 'XOR').rung.branches[0].elements[0] as LadderContact
  check('paleta: XOR nasce com dois endereços distintos', created.contactType === 'XOR' && !!created.xorAddress && created.xorAddress !== created.address)
}

// ---------------------------------------------------------------- LIMIT
{
  check('computeLimit: abaixo do mínimo', computeLimit(0, -5, 100).value === 0)
  check('computeLimit: dentro da gama', computeLimit(0, 42, 100).value === 42)
  check('computeLimit: acima do máximo', computeLimit(0, 140, 100).value === 100)
  check('computeLimit: MN > MX não limita e ENO = 0', computeLimit(10, 5, 1).value === 5 && !computeLimit(10, 5, 1).ok)
  const db: DbTable = { MW0: { type: 'INT', value: 250 } }
  const prog = [rung('l', [branch(contact('I0.0'))], [], { limit: { mn: '0', in: 'MW0', mx: '100', out: 'MW2' } })]
  const t: Record<string, boolean> = { 'I0.0': false }
  scan(prog, t, db)
  check('LIMIT só corre com RLO = 1', db.MW2 === undefined)
  t['I0.0'] = true; scan(prog, t, db)
  check('LIMIT 250 em [0,100] → MW2 = 100', db.MW2?.value === 100)
  db.MW0.value = 37; scan(prog, t, db)
  check('LIMIT 37 → MW2 = 37', db.MW2?.value === 37)
  check('rungWriteTargets inclui o OUT do LIMIT', rungWriteTargets(prog[0]).includes('MW2'))
  const lint = lintLadder({ rungs: [rung('lx', [branch(contact('I0.0'))], [], { limit: { mn: '100', in: 'MW0', mx: '0', out: 'MW2' } })] })
  check('lint: LIMIT com MN > MX constante é erro', lint.some((i) => i.id.endsWith(':limit-range')))
  const ok = lintLadder({ rungs: prog })
  check('lint: LIMIT válido conta como saída (sem «não tem nenhuma saída»)', !ok.some((i) => i.id.endsWith(':no-output')))
}

// ---------------------------------------------------------------- SCALE
{
  check('computeScale: 0…27648 → 0…100, 13824 = 50', computeScale(13824, 0, 27648, 0, 100) === 50)
  check('computeScale: limita IN acima da gama', computeScale(40000, 0, 27648, 0, 100) === 100)
  check('computeScale: gama de saída invertida', computeScale(0, 0, 100, 100, 0) === 100)
  check('computeScale: IN_MIN = IN_MAX → indefinido (ENO = 0)', computeScale(5, 3, 3, 0, 1) === undefined)
  const db: DbTable = { MW0: { type: 'INT', value: 6912 } }
  const prog = [rung('s', [branch(contact('I0.0'))], [], { scale: { in: 'MW0', inMin: '0', inMax: '27648', outMin: '0', outMax: '1000', out: 'MW4' } })]
  const t: Record<string, boolean> = { 'I0.0': true }
  scan(prog, t, db)
  check('SCALE 6912 de 0…27648 para 0…1000 → MW4 = 250', db.MW4?.value === 250)
  db.MW0.value = 1000; scan(prog, t, db)
  check('SCALE arredonda para Int (36,17 → 36)', db.MW4?.value === 36)
  const dbr: DbTable = { MW0: { type: 'INT', value: 13824 }, 'DB1.NIVEL': { type: 'REAL', value: 0 } }
  scan([rung('sr', [branch(contact('I0.0'))], [], { scale: { in: 'MW0', inMin: '0', inMax: '27648', outMin: '0', outMax: '2.5', out: 'DB1.NIVEL' } })], t, dbr)
  check('SCALE para Real mantém decimais (1,25)', dbr['DB1.NIVEL'].value === 1.25)
  const lint = lintLadder({ rungs: [rung('sx', [branch(contact('I0.0'))], [], { scale: { in: 'MW0', inMin: '5', inMax: '5', outMin: '0', outMax: '1', out: 'MW2' } })] })
  check('lint: SCALE com IN_MIN = IN_MAX é erro', lint.some((i) => i.id.endsWith(':scale-range')))
}

// ---------------------------------------------------------------- JMP / JMPN / LBL
{
  const prog = (mode: 'JMP' | 'JMPN') => [
    rung('j1', [branch(contact('I0.0'))], [], { jump: { label: 'FIM', mode } }),
    rung('j2', [branch(contact('I0.1'))], [coil('Q0.0')]),
    rung('j3', [branch(contact('I0.1'))], [coil('Q0.1')], { label: 'FIM' }),
  ]
  const t: Record<string, boolean> = { 'I0.0': false, 'I0.1': true }
  let r = scan(prog('JMP'), t)
  check('JMP com RLO = 0 não salta: Q0.0 = 1', !!t['Q0.0'] && r.skipped.length === 0)
  t['I0.0'] = true; t['I0.1'] = false
  r = scan(prog('JMP'), t)
  check('JMP com RLO = 1 salta a network 2 (Q0.0 mantém 1)', !!t['Q0.0'] && r.skipped.includes('j2'))
  check('a network do LBL corre (Q0.1 = 0 com I0.1 = 0)', !t['Q0.1'] && !r.skipped.includes('j3'))
  check('a network saltada fica com RLO = 0 no ecrã', r.rungPowered.j2 === false)
  const t2: Record<string, boolean> = { 'I0.0': false, 'I0.1': true }
  r = scan(prog('JMPN'), t2)
  check('JMPN com RLO = 0 salta', r.skipped.includes('j2') && !t2['Q0.0'] && !!t2['Q0.1'])
  // Salto para trás e etiqueta inexistente são ignorados em execução e são erro no lint.
  const back = [rung('b1', [branch(contact('I0.0'))], [coil('Q0.0')], { label: 'INI' }), rung('b2', [branch(contact('I0.0'))], [], { jump: { label: 'INI', mode: 'JMP' } })]
  const tb: Record<string, boolean> = { 'I0.0': true }
  r = scan(back, tb)
  check('JMP para trás não fica em ciclo infinito', r.skipped.length === 0 && !!tb['Q0.0'])
  const lb = lintLadder({ rungs: back })
  check('lint: JMP para trás é erro', lb.some((i) => i.id.endsWith(':jmp-back') && i.level === 'error'))
  const lm = lintLadder({ rungs: [rung('m1', [branch(contact('I0.0'))], [], { jump: { label: 'NADA', mode: 'JMP' } })] })
  check('lint: JMP para etiqueta inexistente é erro', lm.some((i) => i.id.endsWith(':jmp-missing')))
  const ld = lintLadder({ rungs: [rung('d1', [], [coil('Q0.0')], { label: 'A1' }), rung('d2', [], [coil('Q0.1')], { label: 'a1' })] })
  check('lint: LBL duplicada (sem distinguir maiúsculas) é erro', ld.some((i) => i.id === 'lbl-dup:A1'))
  check('lint: JMP válido para a frente não gera erro', !lintLadder({ rungs: prog('JMP') }).some((i) => i.level === 'error'))
  check('LABEL_RE aceita M001/FIM_1 e recusa 1A', LABEL_RE.test('M001') && LABEL_RE.test('FIM_1') && !LABEL_RE.test('1A'))
  check('paleta: JMP/JMPN', isJumpKind('JMP') && isJumpKind('JMPN') && !isJumpKind('LBL'))
  const pj = applyKind(rung('p', [], []), 'JMPN').rung
  check('paleta: JMPN cria jump com modo JMPN', pj.jump?.mode === 'JMPN' && !!pj.jump.label)
  check('paleta: LBL cria etiqueta', !!applyKind(rung('p', [], []), 'LBL').rung.label)
  // Temporizador numa network saltada fica parado (não acumula).
  const timers: TimerTable = {}
  const tt: Record<string, boolean> = { 'I0.0': true, 'I0.1': true }
  const tprog = [rung('t1', [branch(contact('I0.0'))], [], { jump: { label: 'X', mode: 'JMP' } }), rung('t2', [branch(contact('I0.1'))], [], { timer: { address: 'T1', timerType: 'TON', presetMs: 1000 } as LadderRung['timer'] }), rung('t3', [], [coil('Q0.3')], { label: 'X' })]
  runScan({ rungs: tprog }, tt, timers, {}, 500, {}, [], {}, {}, {})
  check('temporizador numa network saltada não acumula', !timers.T1 || timers.T1.elapsedMs === 0)
}

// ---------------------------------------------------------------- rasto + pontos de paragem
{
  const db: DbTable = { MW0: { type: 'INT', value: 500 } }
  const prog = [
    rung('a', [branch(contact('I0.0'))], [coil('Q0.0')]),
    rung('b', [branch(contact('I0.0'))], [], { limit: { mn: '0', in: 'MW0', mx: '100', out: 'MW2' }, jump: { label: 'FIM', mode: 'JMP' } }),
    rung('c', [branch(contact('I0.0'))], [coil('Q0.1')]),
    rung('d', [branch(contact('I0.0'))], [coil('Q0.2')], { label: 'FIM' }),
  ]
  const t: Record<string, boolean> = { 'I0.0': true }
  const trace: RungTraceEntry[] = []
  scan(prog, t, db, trace)
  check('rasto: uma entrada por network, pela ordem', trace.map((e) => e.rungId).join() === 'a,b,c,d')
  check('rasto: valores escritos logo após a network', trace[0].writes['Q0.0'] === true && trace[1].writes.MW2 === 100)
  check('rasto: salto e network saltada', trace[1].jumpedTo === 'FIM' && trace[2].skipped && !trace[3].skipped)
  check('ponto de paragem «ao ligar» dispara no flanco 0→1', findBreakpointHit({ a: 'rising' }, { a: false }, trace, 7)?.rungId === 'a')
  check('ponto de paragem «ao ligar» não dispara se já conduzia', findBreakpointHit({ a: 'rising' }, { a: true }, trace, 8) === null)
  check('ponto de paragem «enquanto conduz» dispara sempre com RLO = 1', findBreakpointHit({ a: 'on' }, { a: true }, trace, 8)?.mode === 'on')
  check('ponto de paragem numa network saltada não dispara', findBreakpointHit({ c: 'scan' }, {}, trace, 9) === null)
  check('o primeiro ponto pela ordem de execução ganha', findBreakpointHit({ d: 'scan', b: 'scan' }, {}, trace, 9)?.rungId === 'b')
  check('«em cada ciclo» dispara com RLO = 0', findBreakpointHit({ x: 'scan' }, {}, [{ rungId: 'x', index: 0, powered: false, skipped: false, writes: {} }], 1)?.rungId === 'x')
  check('mensagem do ponto de paragem em PT-PT', /^Ponto de paragem: Network 2 passou a conduzir \(ciclo 1\.?234\)/.test(describeBreakHit({ rungId: 'b', index: 1, mode: 'rising', scan: 1234 }, 2)))
  check('formatTraceValue', formatTraceValue(true) === '1' && formatTraceValue(false) === '0' && formatTraceValue(12) === '12')
  const noTrace = scan(prog, { 'I0.0': true }, { MW0: { type: 'INT', value: 1 } })
  check('sem opção trace o scan continua igual (skipped presente)', Array.isArray(noTrace.skipped))
}

console.log(`ladder-blocks: ${checks} verificações OK`)
