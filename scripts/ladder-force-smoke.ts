import { runScan, type TimerTable, type CounterTable } from '../src/ladder/ladderEngine'
import type { LadderProgram } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) failed++ }
const contact = (id: string, address: string, contactType: 'NO' | 'NC' = 'NO') => ({ kind: 'contact' as const, id, address, contactType })
const rung = (id: string, input: string, output: string, nc = false) => ({
  id, name: id, enabled: true,
  branches: [{ id: `${id}-b`, elements: [contact(`${id}-c`, input, nc ? 'NC' : 'NO')] }],
  coils: [{ kind: 'coil' as const, id: `${id}-k`, address: output, coilType: 'COIL' as const }],
})
const run = (p: LadderProgram, table: Record<string, boolean>, forces: Record<string, boolean>) => {
  const t: TimerTable = {}; const c: CounterTable = {}
  return runScan(p, table, t, c, 10, {}, [], {}, {}, forces).table
}

// 1) entrada forçada a 1 liga a saída mesmo com a entrada física a 0
const p1: LadderProgram = { rungs: [rung('r1', 'I0.0', 'Q0.0')] }
check('entrada forçada a 1 aciona a bobina', run(p1, { 'I0.0': false, 'Q0.0': false }, { 'I0.0': true })['Q0.0'] === true)
// 2) entrada forçada a 0 impede a bobina mesmo com a entrada física a 1
check('entrada forçada a 0 bloqueia a bobina', run(p1, { 'I0.0': true, 'Q0.0': false }, { 'I0.0': false })['Q0.0'] === false)
// 3) saída forçada a 0 prevalece sobre a bobina
check('saída forçada a 0 prevalece sobre a bobina', run(p1, { 'I0.0': true, 'Q0.0': false }, { 'Q0.0': false })['Q0.0'] === false)
// 4) saída forçada a 1 prevalece sobre a bobina desligada
check('saída forçada a 1 prevalece sobre a bobina', run(p1, { 'I0.0': false, 'Q0.0': false }, { 'Q0.0': true })['Q0.0'] === true)
// 5) o forçar de um rung é visto pelos rungs seguintes (M0.0 forçada a 1 → Q0.1)
const p2: LadderProgram = { rungs: [rung('r1', 'I0.0', 'M0.0'), rung('r2', 'M0.0', 'Q0.1')] }
check('rungs seguintes leem o valor forçado', run(p2, { 'I0.0': false, 'M0.0': false, 'Q0.1': false }, { 'M0.0': true })['Q0.1'] === true)
// 6) sem forçar o comportamento mantém-se
check('sem forçar não altera o comportamento', run(p1, { 'I0.0': true, 'Q0.0': false }, {})['Q0.0'] === true)
if (failed) { console.error(`${failed} falha(s)`); process.exit(1) }
console.log('ladder-force: tudo OK')
