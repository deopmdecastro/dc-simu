import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ComponentType } from '../src/types'
import { createComponent, TEMPLATES } from '../src/electrical/factory'
import { internalBridges } from '../src/electrical/engine'
import { importedActuationPatch, updateImportedPower } from '../src/electrical/importedComponents'
import { IMPORTED_COMPONENT_TYPES } from '../src/types/imported'
import { canInsertComponent3D, getComponentGlbSpec } from '../src/three/modelPaths'
import { useSimStore } from '../src/store/useSimStore'
import models from '../src/data/imported-component-models.json'

let checks=0
const check=(ok: unknown,message:string)=>{assert.ok(ok,message);checks++;console.log('PASS — '+message)}
const labels=(component:ReturnType<typeof createComponent>)=>internalBridges(component).map(([a,b])=>[a,b].map(id=>component.terminals.find(t=>t.id===id)!.label).sort().join(':')).sort()
const type='fuseHolderSchneiderDf103nv'
const fuse=createComponent(type)
assert.deepEqual(labels(fuse),['1:2','3:4','5:6','N1:N2']);checks++
fuse.state.blown=true
assert.deepEqual(labels(fuse),['N1:N2']);checks++
fuse.state.closed=false
check(labels(fuse).length===0,'porta-fusíveis aberto isola também o neutro; fusíveis fundidos mantêm a ponte de neutro quando fechado')
for(const id of ['surgeProtectorWegSpw02','surgeProtectorWegSpw12'] as const){
 const c=createComponent(id)
 for(const failed of [false,true]){c.state.failed=failed;check(labels(c).length===0,`${id}: sem curto permanente através do DPS (failed=${failed})`)}
}
const residual=createComponent('residualBreakerHagerCfc225p')
check(residual.terminals.length===4 && residual.state.sensmA===300,'CFC225P: dois polos, 300 mA, não um diferencial tetrapolar de 30 mA')
residual.state.closed=true;assert.deepEqual(labels(residual),['1:2','N1:N2']);checks++
residual.state.tripped=true;check(labels(residual).length===0,'disparo abre fase e neutro do CFC225P')
const thermal=createComponent('thermalRelaySiemens3ru1116')
thermal.state.tripped=true
const thermalPairs=labels(thermal)
check(thermalPairs.includes('1L1:2T1')&&thermalPairs.includes('97:98')&&!thermalPairs.includes('95:96'),'térmico disparado conserva potência e comuta os auxiliares')
const selector=createComponent('selectorSchneiderXa2ed33')
for(const [position,expected] of [[-1,['13:14']],[0,[]],[1,['23:24']]] as const){selector.state.position=position;assert.deepEqual(labels(selector),expected);checks++}
check(importedActuationPatch(selector,true)?.position===-1,'seletor mantém três posições distintas, sem fechar os dois contactos em conjunto')
const sensor=createComponent('photoSensorXukt1ksml2')
sensor.state.triggered=true
check(labels(sensor).length===0,'sensor sem alimentação não cria uma saída')
sensor.state.powered=true
assert.deepEqual(labels(sensor),['OUT:V+']);checks++
sensor.state.type='NPN';assert.deepEqual(labels(sensor),['0V:OUT']);checks++
sensor.state.type='PNP';sensor.state.no=false
check(labels(sensor).length===0,'sensor NF abre quando deteta o objeto')
sensor.state.triggered=false;check(labels(sensor).length===1,'sensor NF fecha sem deteção quando alimentado')
const safety=createComponent('safetyRelaySiemens3tk2840')
const terminal=(label:string)=>safety.terminals.find(t=>t.label===label)!.id
const graph=new Map<string,Set<string>>()
const link=(a:string,b:string)=>{graph.set(terminal(a),new Set([terminal(b)]));graph.set(terminal(b),new Set([terminal(a)]))}
const live=new Set([terminal('A1'),terminal('A2')])
link('Y11','Y12');link('Y33','Y34');safety.state.resetRequested=true
updateImportedPower(safety,live,graph)
check(!safety.state.energized,'3TK2840 não habilita com um canal aberto')
link('Y21','Y22');updateImportedPower(safety,live,graph)
check(!safety.state.energized,'repor o canal não substitui um novo pedido de rearme')
safety.state.resetRequested=true;updateImportedPower(safety,live,graph)
check(safety.state.energized && labels(safety).includes('14:A1') && labels(safety).includes('24:A1'),'rearme com os dois canais e retorno fechados alimenta as duas saídas estáticas')
updateImportedPower(safety,new Set(),graph)
check(!safety.state.energized && labels(safety).length===0,'perda de alimentação desabilita imediatamente o relé e as saídas')
for(const id of ['keyActuatorEao61','towerLightSb23011'] as const)check(createComponent(id).terminals.length===0,`${id}: nenhum contacto/pino inventado sem identificação`)

for(const id of IMPORTED_COMPONENT_TYPES){
 check(!!TEMPLATES[id],`${id}: referência disponível no catálogo`)
 if(['limitSwitchLongRoller','buttonStart22','buttonStop22'].includes(id))check(!canInsertComponent3D(id),`${id}: bloqueado enquanto falta o modelo neutro`)
}
for(const model of models){
 const file=path.resolve('public','.'+model.path)
 check(file.startsWith(path.resolve('public')+path.sep),'caminho GLB contido em public')
 const bytes=await fs.readFile(file)
 assert.equal(createHash('sha256').update(bytes).digest('hex'),model.glbSha256)
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')
 const size=new THREE.Box3().setFromObject(scene,true).getSize(new THREE.Vector3()).multiplyScalar(1000)
 const expected=model.physicalSizeMm
 check(size.distanceTo(new THREE.Vector3(expected.width,expected.height,expected.depth))<.01,`${model.type}: GLB íntegro, escala métrica e dimensões coerentes`)
 check(!!getComponentGlbSpec(model.type as ComponentType)&&canInsertComponent3D(model.type as ComponentType),`${model.type}: inserção 3D disponível`)
}
useSimStore.getState().newProject()
for(const model of models)check(!!useSimStore.getState().addComponent(model.type as ComponentType,200,200),`${model.type}: inserção real na store`)
const saved=useSimStore.getState().saveJSON()
useSimStore.getState().newProject();useSimStore.getState().loadJSON(saved)
check(useSimStore.getState().components.length===models.length,'guardar/reabrir conserva os 14 componentes e os tipos específicos')
console.log(`\n${checks} verificações de componentes importados passaram`)
