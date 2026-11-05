import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nativeEstrelaTrianguloContent, NATIVE_ESTRELA_FEATURE } from '../src/project/nativeEstrelaTriangulo'
import { upgradeNativeEstrela } from '../src/project/nativeEstrelaUpgrade'
import { detectDiagnostics } from '../src/utils/errorDetection'
import { useSimStore } from '../src/store/useSimStore'
import * as THREE from 'three'
import { doorMountMotion, doorMountedComponent } from '../src/three/doorMount'
import { componentOrientationOf, orientationRadians } from '../src/three/componentOrientation'

const store = useSimStore
const comp = (ref: string) => store.getState().components.find(c => c.ref === ref)!
const run = (n: number) => {
  for (let i = 0; i < n; i++) {
    store.getState().step()
    assert.ok(!(comp('KM2').state.energized && comp('KM3').state.energized), 'estrela e triângulo nunca fecham simultaneamente')
  }
}
const diagnostics = () => detectDiagnostics(store.getState().components, store.getState().wires, new Set())
const fresh = nativeEstrelaTrianguloContent()
store.getState().loadJSON(JSON.stringify(fresh))
assert.deepEqual(diagnostics(), [], 'semente carregada sem erros nem avisos')
assert.equal(upgradeNativeEstrela(fresh), fresh, 'migração idempotente')
assert.equal(store.getState().activePlcId, comp('A1').id)
assert.ok(!comp('A1').terminals.some(t => /^Q0\.[45]/.test(t.label)), 'apenas os quatro relés físicos do LOGO!')
assert.ok(store.getState().wires.filter(w => w.color === 'green-yellow').every(w => w.kind === 'earth'))
assert.equal(new Set(store.getState().components.filter(c => c.panelMount).map(c => `${c.panelMount!.offsetXmm}:${c.panelMount!.offsetYmm}`)).size, 7, 'comandos da porta separados')
const parts = store.getState().components
assert.equal(doorMountMotion(comp('S1'), parts, 0), null, 'porta fechada mantém a posição')
comp('QE1').state.doorOpen = true
for (const side of ['right', 'left']) {
  comp('QE1').state.hingeSide = side
  const motion = doorMountMotion(comp('S1'), parts, 0)!
  const point = motion.hinge.clone().add(new THREE.Vector3(side === 'right' ? -2 : 2, 0, 0))
  point.sub(motion.hinge).applyAxisAngle(new THREE.Vector3(0,1,0), motion.angle).add(motion.hinge)
  assert.ok(point.z > motion.hinge.z, 'ambas as dobradiças abrem para fora')
  const mounted = doorMountedComponent(comp('S1'), parts)
  const normal = new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(...orientationRadians(componentOrientationOf(mounted))))
  assert.ok(Math.abs(normal.x) > 0.9 && normal.z < 0, 'aparelho roda com a porta')
  assert.equal(comp('S1').viewOrientation?.y ?? 0, 0, 'orientação guardada não é alterada')
}
comp('QE1').state.hingeSide = 'right'; comp('QE1').state.doorOpen = false

comp('QM1').state.closed = true
run(5)
assert.equal(comp('A1').state.powered, true)
assert.equal(comp('KM3').state.energized, false, 'repouso não liga estrela')
comp('S3').state.pressed = true
const start = () => { comp('S1').state.pressed = true; run(3); comp('S1').state.pressed = false; run(2) }
start()
assert.deepEqual(store.getState().grafcetRuntime.active, ['gs10'])
assert.ok(comp('KM1').state.energized && comp('KM3').state.energized && comp('M1').state.running && comp('H3').state.on)
comp('S0').state.pressed = true; run(4)
assert.equal(comp('M1').state.running, false, 'STOP também para durante estrela')
comp('S0').state.pressed = false; start(); run(55)
assert.deepEqual(store.getState().grafcetRuntime.active, ['gs11'])
assert.ok(comp('KM1').state.energized && comp('KM2').state.energized && comp('M1').state.running && comp('H1').state.on)
assert.equal(comp('H3').state.on, false)
comp('B0').state.pressed = true; run(4)
assert.equal(comp('M1').state.running, false, 'emergência NF para em triângulo')
comp('B0').state.pressed = false; run(4)
assert.equal(comp('M1').state.running, false, 'rearmar não rearranca')
start(); comp('F1').state.tripped = true; run(5)
assert.equal(comp('M1').state.running, false)
assert.equal(comp('H2').state.on, true, 'sinalização física de falha térmica')
comp('F1').state.tripped = false; run(5)
assert.equal(comp('M1').state.running, false)
assert.deepEqual(diagnostics(), [], 'diagnóstico continua limpo depois do ciclo e das falhas')

// A regra DC/AC continua a detetar a ligação errada original.
const wrong = store.getState().wires.map(w => w.number === 'W39'
  ? { ...w, fromTerminalId: comp('X3').terminals.find(t => t.label === '+24V-OUT')!.id } : w)
assert.ok(detectDiagnostics(store.getState().components, wrong, new Set()).some(d => d.level === 'error' && d.message.includes('W39')))

// Fixture sintética local capturada da semente v2 antes da alteração, se indicada.
if (process.argv[2]) {
  const legacy = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  legacy.canvasTexts.push({ id: 'nota-pessoal', text: 'Preservar' })
  legacy.components.find((c: any) => c.ref === 'F1').state.tripped = true
  const upgraded = upgradeNativeEstrela(legacy)
  assert.ok(upgraded.nativeFeatures.includes(NATIVE_ESTRELA_FEATURE))
  assert.equal(upgraded.canvasTexts, legacy.canvasTexts)
  assert.equal(upgraded.components.find((c: any) => c.ref === 'A1').id, legacy.components.find((c: any) => c.ref === 'A1').id)
  assert.equal(upgradeNativeEstrela(upgraded), upgraded)
  assert.equal(upgraded.components.find((c: any) => c.ref === 'F1').state.tripped, true, 'disparo térmico preservado')
  const delta = upgraded.components.find((c: any) => c.ref === 'KM2')
  assert.equal(delta.state.interlockWith, upgraded.components.find((c: any) => c.ref === 'KM3').id)
  store.getState().loadJSON(JSON.stringify(legacy))
  assert.equal(comp('F1').state.tripped, true, 'carregamento conserva o disparo')
  comp('F1').state.tripped = false
  assert.deepEqual(diagnostics(), [], 'v2 atualizada pelo carregamento normal')
  legacy.components[5].schematicX += 15
  assert.equal(upgradeNativeEstrela(legacy), legacy, 'cópia personalizada preservada')
}
console.log('PASS — nativo 2: diagnóstico, porta, E/S, estrela/triângulo, STOP, emergência, térmico e migração')
