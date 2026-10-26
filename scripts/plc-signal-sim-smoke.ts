/**
 * Simulador de sinais do PLC (PLC-SIGNALS-01): injetar sinais nas entradas de um
 * PLC do esquema e escolher o tipo de contacto (INT/NO/NC), além da tabela de I/O.
 *
 * Valida no store:
 *  - I0.0 injetada chega à tabela do PLC e o programa (I0.0 → Q0.1) reage;
 *  - NC por tocar repousa a 1; NO repousa a 0; «Limpar» repõe o repouso;
 *  - o estado vai em `plc.state.simInputs/simInputModes` (gravado com o projeto)
 *    e não entra no histórico (desfazer não apaga sinais);
 *  - outro PLC do esquema não é afetado.
 *
 * Corre com `npx tsx scripts/plc-signal-sim-smoke.ts`.
 */
import { useSimStore } from '../src/store/useSimStore'
import type { LadderRung } from '../src/types'

let checks = 0
const ok = (label: string, condition: boolean) => { checks += 1; if (!condition) { console.error(`[plc-signal-sim] ${label}`); process.exit(1) } }
const store = () => useSimStore.getState()
const table = (id: string) => store().runtime.plcRuntime[id]?.table ?? {}
const plcState = (id: string) => store().components.find((c) => c.id === id)!.state

store().newProject()
const logo = store().addComponent('plcSiemensLogo1224RC', 200, 200)!
const other = store().addComponent('plcSiemensLogo1224RC', 600, 200)!
ok('dois LOGO! no esquema', !!logo && !!other)
store().setActivePlc(logo)
const rung: LadderRung = { id: 'r1', name: 'Arranque', branches: [{ id: 'b1', elements: [{ id: 'c1', address: 'I0.0', contactType: 'NO' }, { id: 'c2', address: 'I0.1', contactType: 'NC' }] as never }], coils: [{ id: 'q', address: 'Q0.1', coilType: 'COIL' }] as never, enabled: true, collapsed: false }
useSimStore.setState({ ladder: { ...store().ladder, rungs: [rung] } })
store().step()
ok('sem sinais: I0.0 = 0', !table(logo)['I0.0'])
ok('sem sinais: Q0.1 = 0', !table(logo)['Q0.1'])

const past = store().history.length
store().setPlcSimInput(logo, 'I0.0', true)
ok('I0.0 injetada chega à tabela', table(logo)['I0.0'] === true)
store().step()
ok('programa reage: Q0.1 = 1', table(logo)['Q0.1'] === true)
ok('outro PLC não é afetado', !table(other)['I0.0'])
ok('estado guardado no PLC', (plcState(logo).simInputs as Record<string, boolean>)['I0.0'] === true)
ok('sem entrada no histórico', (store().history.length) === past)
ok('projeto fica por gravar', store().dirty === true)

store().setPlcSimInputMode(logo, 'I0.1', 'nc')
store().step()
ok('NC repousa a 1', table(logo)['I0.1'] === true)
ok('NC a 1 corta o arranque (contacto NC no programa)', table(logo)['Q0.1'] === false)
store().setPlcSimInput(logo, 'I0.1', false)
store().step()
ok('premir NC abre → 0', table(logo)['I0.1'] === false && table(logo)['Q0.1'] === true)

store().setPlcSimInputMode(logo, 'I0.0', 'push')
store().step()
ok('mudar para NO repõe 0', table(logo)['I0.0'] === false)

store().setPlcSimInput(logo, 'I0.2', true)
store().clearPlcSimInputs(logo)
store().step()
ok('Limpar: NO a 0', !table(logo)['I0.2'])
ok('Limpar: NC volta ao repouso 1', table(logo)['I0.1'] === true)
ok('modos preservados', (plcState(logo).simInputModes as Record<string, string>)['I0.1'] === 'nc')

const json = store().saveJSON()
const saved = JSON.parse(json)
const savedLogo = saved.components.find((c: { id: string }) => c.id === logo)
ok('sinais gravados com o projeto', savedLogo.state.simInputModes['I0.1'] === 'nc')
store().newProject()
store().loadJSON(json)
ok('sinais repostos ao abrir o projeto', (plcState(logo).simInputModes as Record<string, string>)['I0.1'] === 'nc')

console.log(`[plc-signal-sim] ${checks} verificações OK`)
