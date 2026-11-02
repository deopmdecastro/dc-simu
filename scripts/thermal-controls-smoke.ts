import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createComponent } from '../src/electrical/factory'
import { importedActuationPatch } from '../src/electrical/importedComponents'
import { animateImportedRig, paintImportedModel, rigImportedModel } from '../src/three/importedFinish'
import { THERMAL_RESET_MAX_DEG, thermalResetAccepted, thermalResetTurn } from '../src/three/thermalResetControl'
import { linkedThermalComponent, linkedThermalTrips } from '../src/commands/thermalSync'
import { buildNativePartidaDireta, nativePartidaDiretaContent } from '../src/project/nativeProjects'

let checks = 0
const check = (ok: unknown, message: string) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
const c = createComponent('thermalRelaySiemens3ru1116')
const press = (control: 'test' | 'stop' | 'reset', down = true) => { Object.assign(c.state, importedActuationPatch(c, down, control) ?? {}) }
press('test')
check(c.state.testPressed && c.state.tripped, 'TEST arma a falha no instante em que é premido')
press('reset')
check(c.state.tripped, 'RESET bloqueado com TEST premido')
press('test', false); press('stop'); press('reset')
check(c.state.tripped, 'RESET bloqueado com STOP premido')
press('stop', false); press('reset')
check(!c.state.tripped, 'RESET desbloqueado depois de libertar os dois botões')
for (const down of [false, true, true, false]) {
  Object.assign(c.state, importedActuationPatch(c, down, 'test') ?? {})
  check(c.state.testPressed === down, `TEST repetido/libertação coerente: ${down}`)
}
check(c.state.tripped, 'Repetição não transforma TEST num toggle de rearme')
check(thermalResetTurn(-28) === -1 && thermalResetTurn(28) === 1, 'Arrasto igual nos dois sentidos, limitado a −1/1')
check(thermalResetTurn(0) === 0 && thermalResetTurn(Infinity) === 0 && thermalResetTurn(NaN) === 0, 'Gesto vazio ou não finito não roda o mecanismo')
check(!thermalResetAccepted(thermalResetTurn(10)) && thermalResetAccepted(thermalResetTurn(-17)) && thermalResetAccepted(thermalResetTurn(17)), 'Gesto curto não rearma; curso suficiente rearma à esquerda ou direita')
const bytes = await fs.readFile('public/models/importados/thermalRelaySiemens3ru1116.glb')
const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
const rig = rigImportedModel(c.type, scene, paintImportedModel(c.type, scene))
const reset = rig.pivots.find(p => p.role === 'reset')!
const stop = rig.pivots.find(p => p.role === 'stop')!
check(!!reset && !!stop, 'Peças azuis e vermelhas existentes conservam pivôs próprios')
const restZ = reset.pivot.rotation.z
for (const turn of [-1, 1]) {
  animateImportedRig(rig, c.type, { resetTurn: turn }, false, 2)
  check(Math.abs(Math.abs(THREE.MathUtils.radToDeg(reset.pivot.rotation.z - restZ)) - THERMAL_RESET_MAX_DEG) < .01, `RESET roda 35° para ${turn < 0 ? 'a esquerda' : 'a direita'}`)
}
animateImportedRig(rig, c.type, { resetTurn: 0 }, false, 2)
check(Math.abs(reset.pivot.rotation.z - restZ) < 1e-5, 'RESET regressa ao centro ao largar')
const stopZ = stop.pivot.position.z
animateImportedRig(rig, c.type, { stopPressed: true }, false, 2)
check(Math.abs(stopZ - stop.pivot.position.z - .0028) < 1e-6, 'STOP vermelho mantém o curso axial de 2,8 mm')
const seed = buildNativePartidaDireta()
const content = nativePartidaDiretaContent()
const diagram = content.commands as import('../src/commands/model').CommandsDiagram
check(linkedThermalComponent(seed.components, diagram, content.nativeId as string, 'F1')?.id === 'native-f1', 'IEC encontra o F1 físico pela referência, sem duplicar o aparelho')
check(linkedThermalComponent(seed.components, diagram, null, 'F1') === undefined, 'Projeto não nativo não liga aparelhos por coincidência de referência')
check(linkedThermalTrips(seed.components, diagram, content.nativeId as string).F1 === false, 'Projeção IEC começa armada')
seed.components.find(x => x.id === 'native-f1')!.state.tripped = true
check(linkedThermalTrips(seed.components, diagram, content.nativeId as string).F1 === true, 'Projeção IEC acompanha o disparo do 3D')
console.log(`\n${checks} verificações TEST/RESET passaram`)
