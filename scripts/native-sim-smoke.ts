/**
 * Projeto nativo «Partida direta» a funcionar de ponta a ponta no motor de simulação:
 * fonte 24 V → PLC alimentado → START/STOP → KM1, H1/H2 e motor a rodar.
 * (Regressões: N do 2P tratado como fase; 0 V da fonte fora do grafo; Q0.2 migrado para «Q0·2».)
 */
import { readFileSync } from 'node:fs'
import { nativePartidaDiretaContent } from '../src/project/nativeProjects'
import { useSimStore } from '../src/store/useSimStore'
import { linkedThermalTrips } from '../src/commands/thermalSync'
import { emptyCmdRuntime, stepCommands } from '../src/commands/engine'

let failed = 0
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`); if (!ok) failed++ }

useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
const comp = (ref: string) => useSimStore.getState().components.find((c) => c.ref === ref)!
const run = (n: number) => { for (let i = 0; i < n; i++) useSimStore.getState().step() }

check('LOGO! mantém o borne Q0.2 (migração não o renomeia)', comp('PLC1').terminals.some((t) => t.label === 'Q0.2') && !comp('PLC1').terminals.some((t) => t.label === 'Q0·2'))
run(5)
check('Fonte PS1 alimentada (L/N de um disjuntor 2P)', comp('PS1').state.powered === true)
check('PLC1 alimentado (L+/M)', comp('PLC1').state.powered === true)
check('Repouso: H2 (parado) acesa, H1 e KM1 apagados', comp('H2').state.on === true && comp('H1').state.on === false && comp('KM1').state.energized === false)
check('Repouso: motor parado', comp('M1').state.running === false)

comp('B1').state.startPressed = true; run(3)
comp('B1').state.startPressed = false; run(10)
check('START: KM1 fecha (retenção após largar)', comp('KM1').state.energized === true)
check('START: H1 (marcha) acesa e H2 apagada', comp('H1').state.on === true && comp('H2').state.on === false)
check('START: motor roda em sentido horário', comp('M1').state.running === true && comp('M1').state.direction === 'cw' && comp('M1').state.rpmVisual > 0.9)

comp('B1').state.stopPressed = true; run(3)
comp('B1').state.stopPressed = false; run(10)
check('STOP: KM1 abre, H2 acende, H1 apaga', comp('KM1').state.energized === false && comp('H2').state.on === true && comp('H1').state.on === false)
// Desaceleração com inércia (4d49858): sem tensão já, abranda e pára alguns ciclos depois.
const coasting = comp('M1').state.rpmVisual
check('STOP: motor sem tensão abranda por inércia', comp('M1').state.running === false && coasting < 0.5)
run(40)
check('STOP: motor pára', comp('M1').state.running === false && comp('M1').state.rpmVisual < 0.05 && comp('M1').state.rpmVisual < coasting)

// TEST do F1: contacto NC abre, NA fecha; o PLC perde a marcha e acende a falha real.
comp('B1').state.startPressed = true; run(3); comp('B1').state.startPressed = false; run(10)
check('TEST: preparação com motor em marcha', comp('M1').state.running === true && comp('H1').state.on === true)
useSimStore.getState().actuateImported(comp('F1').id, true, 'test'); run(10)
check('TEST premido: KM1/M1 param, H1 verde apaga e H3 vermelho acende', !comp('KM1').state.energized && !comp('M1').state.running && !comp('H1').state.on && comp('H3').state.on === true)
check('TEST premido: I0.3 recebe 97–98 e GRAFCET regressa a X0', useSimStore.getState().runtime.table['I0.3'] === true && useSimStore.getState().grafcetRuntime.active.includes('native-s0'))
useSimStore.getState().actuateImported(comp('F1').id, false, 'test'); run(10)
check('Largar TEST mantém disparo e falha, sem rearranque', comp('F1').state.tripped === true && !comp('F1').state.testPressed && !comp('M1').state.running && comp('H3').state.on === true)
comp('B1').state.startPressed = true; run(5); comp('B1').state.startPressed = false; run(5)
check('START com F1 disparado continua bloqueado', !comp('M1').state.running && !comp('H1').state.on)
useSimStore.getState().actuateImported(comp('F1').id, true, 'reset'); run(10)
check('RESET rearma sem ligar motor: H3 apaga e H2 parado acende', !comp('F1').state.tripped && !comp('M1').state.running && !comp('H3').state.on && comp('H2').state.on === true)
comp('B1').state.startPressed = true; run(3); comp('B1').state.startPressed = false; run(10)
check('Nova ordem START depois de RESET volta a ligar o motor', comp('M1').state.running === true && comp('H1').state.on === true)
// O IEC nativo usa o mesmo disparo, não uma cópia independente do estado do F1.
{
  const state = useSimStore.getState()
  const linked = linkedThermalTrips(state.components, state.commands, state.nativeId)
  check('IEC: F1 do quadro projeta o estado armado no símbolo F1', linked.F1 === false)
  useSimStore.getState().actuateImported(comp('F1').id, true, 'test'); run(5)
  const st = useSimStore.getState()
  const rt = stepCommands(st.commands, { ...emptyCmdRuntime(), running: true, tripped: linkedThermalTrips(st.components, st.commands, st.nativeId) }, 50)
  const motor = st.commands.parts.find(p => p.kind === 'motor3')!
  check('IEC: TEST do F1 abre o comando e para o motor', !rt.coils.KM1 && rt.motors[motor.id]?.mode !== 'run' && rt.plcInputs?.['I0.3'] === true)
  useSimStore.getState().actuateImported(comp('F1').id, false, 'test')
  useSimStore.getState().actuateImported(comp('F1').id, true, 'reset'); run(5)
}
// STOP de simulação liberta dedos, mas não apaga uma proteção mecânica disparada.
useSimStore.getState().actuateImported(comp('F1').id, true, 'test')
useSimStore.getState().stop()
check('STOP da simulação mantém o disparo do F1', comp('F1').state.tripped === true)
useSimStore.getState().loadJSON(useSimStore.getState().saveJSON())
check('Guardar/reabrir mantém disparo e liberta TEST', comp('F1').state.tripped === true && !comp('F1').state.testPressed)
useSimStore.getState().actuateImported(comp('F1').id, true, 'reset')

const panel = readFileSync(new URL('../src/three/Panel3D.tsx', import.meta.url), 'utf8')
check('Simulador abre em vista frontal e apenas M1 usa orientação isométrica',
  panel.includes("view: 'front'") && !panel.includes('isoFirst')
  && comp('M1').viewOrientation?.y === -35
  && comp('KM1').viewOrientation?.x === 0 && comp('KM1').viewOrientation?.y === 0)

if (failed) { console.log(`\n❌ ${failed} falha(s)`); process.exit(1) }
console.log('\n✅ TODOS OS TESTES PASSARAM')
