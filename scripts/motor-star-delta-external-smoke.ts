/** Motor com a caixa sem pontes: estrela/triângulo feitos pelos contactores (KM3/KM2) também o fazem rodar. */
import assert from 'node:assert/strict'
import { nativeEstrelaKs1Content } from '../src/project/nativeEstrelaKs1'
import { useSimStore } from '../src/store/useSimStore'

const content = nativeEstrelaKs1Content() as any
assert.equal(content.components.find((c: any) => c.ref === 'M1').state.motorConnection, 'none', 'nativo com a caixa do motor sem pontes')
const store = useSimStore
store.getState().loadJSON(JSON.stringify(content))
const comp = (ref: string) => store.getState().components.find((c) => c.ref === ref)!
const run = (n: number) => { for (let i = 0; i < n; i++) store.getState().step() }
let n = 0
const check = (name: string, ok: boolean) => { assert.ok(ok, name); n++ }
run(5)
comp('KS1').state.resetRequested = true; run(3)
comp('S1').state.startPressed = true; run(3); comp('S1').state.startPressed = false; run(2)
check('estrela pelo KM3 (caixa sem pontes): motor roda', comp('KM3').state.energized && comp('M1').state.running)
run(55)
check('triângulo pelo KM2 (caixa sem pontes): motor roda', comp('KM2').state.energized && comp('M1').state.running)
// Sem os cabos do KM2 e do KM3 ao motor: só o KM1 alimenta U1/V1/W1 — enrolamentos abertos, não roda.
store.setState((s) => ({ wires: s.wires.filter((w) => !['W19', 'W20', 'W21', 'W22', 'W23', 'W24'].includes(String(w.number))) }))
run(6)
check('sem estrela nem triângulo ligados ao motor: não roda', comp('KM1').state.energized && !comp('M1').state.running)
console.log(`[motor-star-delta-external] OK — ${n} verificações`)
