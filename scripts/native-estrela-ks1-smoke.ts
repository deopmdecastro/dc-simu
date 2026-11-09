/** Nativo estrela-triângulo com KS1 (a partir do «Testar»): diagnóstico limpo e ciclo Y → Δ, STOP, emergência e térmico. */
import { useSimStore } from '../src/store/useSimStore'
import { nativeEstrelaKs1Content, NATIVE_ESTRELA_KS1_ID } from '../src/project/nativeEstrelaKs1'
import { nativeProjectSeeds } from '../src/project/nativeProjects'
import { detectDiagnostics } from '../src/utils/errorDetection'
import * as THREE from 'three'
import { doorMountMotion, doorMountedComponent } from '../src/three/doorMount'
import { componentOrientationOf, orientationRadians } from '../src/three/componentOrientation'

const store = useSimStore
const content = nativeEstrelaKs1Content()
store.getState().loadJSON(JSON.stringify(content))
const comp = (ref: string) => store.getState().components.find((c) => c.ref === ref)!
let bad = 0
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`); if (!ok) bad++ }
const run = (n: number) => { for (let i = 0; i < n; i++) { store.getState().step(); if (comp('KM2').state.energized && comp('KM3').state.energized) { bad++; console.log('FAIL — KM2 e KM3 fechados ao mesmo tempo') } } }
const diags = () => detectDiagnostics(store.getState().components, store.getState().wires, new Set())
const show = () => diags().map((d) => `${d.level}: ${d.message}`)

const seed = nativeProjectSeeds().find((s) => s.id === NATIVE_ESTRELA_KS1_ID)
check('semeado como projeto nativo com marca própria', !!seed && seed.nativeId === NATIVE_ESTRELA_KS1_ID && (content as any).nativeId === NATIVE_ESTRELA_KS1_ID)
check('diagnóstico completamente limpo (sem erros nem avisos)', diags().length === 0, show().join(' | '))
check('diagnóstico sem erros', !diags().some((d) => d.level === 'error'))
check('PLC ativo é o LOGO! do quadro', store.getState().activePlcId === comp('PLC1').id)
const rearme = () => { comp('KS1').state.resetRequested = true; run(3) }
run(5)
check('LOGO! alimentado (24 V)', comp('PLC1').state.powered === true)
check('KS1 alimentado', comp('KS1').state.powered === true)
rearme()
check('KS1 rearmado com B0 livre', comp('KS1').state.energized === true)
check('repouso: motor parado e KM abertos', !comp('M1').state.running && !comp('KM1').state.energized && !comp('KM3').state.energized)
const start = () => { comp('S1').state.startPressed = true; run(3); comp('S1').state.startPressed = false; run(2) }
start()
check('START → estrela (KM1+KM3, H3)', comp('KM1').state.energized && comp('KM3').state.energized && !comp('KM2').state.energized && comp('H3').state.on, JSON.stringify(store.getState().grafcetRuntime.active))
check('motor roda em estrela', comp('M1').state.running === true)
run(55)
check('5 s depois → triângulo (KM1+KM2, H1)', comp('KM1').state.energized && comp('KM2').state.energized && !comp('KM3').state.energized && comp('H1').state.on && !comp('H3').state.on)
check('motor roda em triângulo', comp('M1').state.running === true)
comp('S1').state.stopPressed = true; run(4); comp('S1').state.stopPressed = false; run(2)
check('STOP → repouso', !comp('KM1').state.energized && !comp('KM2').state.energized)
start(); run(55)
comp('B0').state.pressed = true; run(4)
check('emergência B0 → KS1 abre e motor para', !comp('KS1').state.energized && !comp('KM1').state.energized)
comp('B0').state.pressed = false; run(4)
check('libertar B0 não rearranca sem rearme e START', !comp('KM1').state.energized)
rearme(); start()
check('após rearme do KS1, START volta a arrancar em estrela', comp('KM1').state.energized && comp('KM3').state.energized)
comp('RT1').state.tripped = true; run(5)
check('disparo térmico: para e acende H2', !comp('KM1').state.energized && comp('H2').state.on)
comp('RT1').state.tripped = false; run(5)
check('rearme térmico: continua parado', !comp('KM1').state.energized)
check('diagnóstico sem erros no fim', !diags().some((d) => d.level === 'error'))
// Porta: aparelhos montados na face exterior acompanham a porta (vem do teste do nativo antigo).
{
  const parts = store.getState().components
  check('5 aparelhos na porta, em posições distintas', new Set(parts.filter((c) => c.panelMount).map((c) => `${c.panelMount!.offsetXmm}:${c.panelMount!.offsetYmm}`)).size === 5)
  const qe = comp('QE1'), hinge = qe.state.hingeSide
  qe.state.doorOpen = false
  check('porta fechada mantém a posição dos aparelhos', doorMountMotion(comp('S1'), parts, 0) === null)
  qe.state.doorOpen = true
  for (const side of ['right', 'left']) {
    qe.state.hingeSide = side
    const motion = doorMountMotion(comp('S1'), parts, 0)!
    const point = motion.hinge.clone().add(new THREE.Vector3(side === 'right' ? -2 : 2, 0, 0))
    point.sub(motion.hinge).applyAxisAngle(new THREE.Vector3(0, 1, 0), motion.angle).add(motion.hinge)
    check(`dobradiças à ${side === 'right' ? 'direita' : 'esquerda'}: a porta abre para fora`, point.z > motion.hinge.z)
    const mounted = doorMountedComponent(comp('S1'), parts)
    const normal = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...orientationRadians(componentOrientationOf(mounted))))
    check(`dobradiças à ${side === 'right' ? 'direita' : 'esquerda'}: o aparelho roda com a porta`, Math.abs(normal.x) > 0.9 && normal.z < 0)
  }
  qe.state.hingeSide = hinge
}
console.log(bad ? `${bad} falha(s)` : '[native-estrela-ks1] OK')
process.exit(bad ? 1 : 0)
