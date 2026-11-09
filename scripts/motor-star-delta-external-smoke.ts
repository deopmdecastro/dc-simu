/** Motor com a caixa sem pontes: estrela/triângulo feitos pelos contactores (KM3/KM2) também o fazem rodar. */
import assert from 'node:assert/strict'
import { nativeEstrelaTrianguloContent } from '../src/project/nativeEstrelaTriangulo'
import { useSimStore } from '../src/store/useSimStore'

const content = nativeEstrelaTrianguloContent() as any
content.components.find((c: any) => c.ref === 'M1').state.motorConnection = 'none'
const store = useSimStore
store.getState().loadJSON(JSON.stringify(content))
const comp = (ref: string) => store.getState().components.find((c) => c.ref === ref)!
const run = (n: number) => { for (let i = 0; i < n; i++) store.getState().step() }
let n = 0
const check = (name: string, ok: boolean) => { assert.ok(ok, name); n++ }
comp('QM1').state.closed = true
run(5)
comp('S3').state.pressed = true
comp('S1').state.pressed = true; run(3); comp('S1').state.pressed = false; run(2)
check('estrela pelo KM3 (caixa sem pontes): motor roda', comp('KM3').state.energized && comp('M1').state.running)
run(55)
check('triângulo pelo KM2 (caixa sem pontes): motor roda', comp('KM2').state.energized && comp('M1').state.running)
// Só o KM1 (sem estrela nem triângulo): enrolamentos abertos — não roda.
store.setState((s) => ({ wires: s.wires.filter((w) => !['W23', 'W24', 'W25', 'W96', 'W97', 'W98'].includes(String(w.number))) }))
run(6)
check('sem KM2/KM3 ligados ao motor: enrolamentos abertos, não roda', comp('KM1').state.energized && !comp('M1').state.running)
console.log(`[motor-star-delta-external] OK — ${n} verificações`)
