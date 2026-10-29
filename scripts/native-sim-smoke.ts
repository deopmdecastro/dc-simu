/**
 * Projeto nativo «Partida direta» a funcionar de ponta a ponta no motor de simulação:
 * fonte 24 V → PLC alimentado → START/STOP → KM1, H1/H2 e motor a rodar.
 * (Regressões: N do 2P tratado como fase; 0 V da fonte fora do grafo; Q0.2 migrado para «Q0·2».)
 */
import { readFileSync } from 'node:fs'
import { nativePartidaDiretaContent } from '../src/project/nativeProjects'
import { useSimStore } from '../src/store/useSimStore'

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
check('STOP: motor pára', comp('M1').state.running === false && comp('M1').state.rpmVisual < 0.05)

const panel = readFileSync(new URL('../src/three/Panel3D.tsx', import.meta.url), 'utf8')
check('Simulador abre em vista frontal e apenas M1 usa orientação isométrica',
  panel.includes("view: 'front'") && !panel.includes('isoFirst')
  && comp('M1').viewOrientation?.y === -35
  && comp('KM1').viewOrientation?.x === 0 && comp('KM1').viewOrientation?.y === 0)

if (failed) { console.log(`\n❌ ${failed} falha(s)`); process.exit(1) }
console.log('\n✅ TODOS OS TESTES PASSARAM')
