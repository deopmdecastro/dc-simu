import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ComponentType } from '../src/types'
import { createComponent, TEMPLATES, upgradeRealInterfacePositions } from '../src/electrical/factory'
import { REAL_TERMINALS, realTerminalPosition } from '../src/electrical/realInterfaces'
import { internalBridges } from '../src/electrical/engine'
import { importedActuationPatch, updateImportedLoads, updateImportedPower } from '../src/electrical/importedComponents'
import { IMPORTED_COMPONENT_TYPES } from '../src/types/imported'
import { canInsertComponent3D, getComponentGlbSpec } from '../src/three/modelPaths'
import { useSimStore } from '../src/store/useSimStore'
import models from '../src/data/imported-component-models.json'
import { parseGlb, redundantPrimitives } from './compact-glb-primitives.mjs'

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
const key=createComponent('keyActuatorEao61')
assert.deepEqual(labels(key),['11:12']);checks++
key.state.pressed=true
check(labels(key).join()==='11:14','chave EAO: repouso 11–12, chave rodada 11–14 (comutador do elemento desenhado no CAD)')
check(Object.assign(key,{state:{...key.state,...importedActuationPatch(key,false)}}).state.pressed===false,'chave EAO volta ao repouso quando se larga (retorno por mola)')
const tower=createComponent('towerLightSb23011')
const towerId=(label:string)=>tower.terminals.find(t=>t.label===label)!.id
check(['R','Y','G','COM'].every(label=>tower.terminals.some(t=>t.label===label)),'torre: um fio por cor e o comum')
updateImportedLoads(tower,new Set([towerId('R')]))
check(!tower.state.red,'torre: a cor não acende sem o comum')
updateImportedLoads(tower,new Set([towerId('R'),towerId('G'),towerId('COM')]))
check(tower.state.red&&tower.state.green&&!tower.state.yellow&&tower.state.on,'torre: cada cor acende com o seu fio e o comum')
for(const id of IMPORTED_COMPONENT_TYPES){
 const spots=REAL_TERMINALS[id as ComponentType]
 const c=createComponent(id as ComponentType)
 if(!c.terminals.length)continue
 check(!!spots&&c.terminals.every(t=>spots.some(s=>s.label===t.label)),`${id}: todos os bornes têm posição medida no CAD`)
 const spot=(label:string)=>spots!.find(s=>s.label===label)!
 check(c.terminals.every(t=>{const p=realTerminalPosition(id as ComponentType,spot(t.label));return Math.hypot(p.x-t.position3D!.x,p.y-t.position3D!.y,p.z-t.position3D!.z)<1e-9}),`${id}: borne criado no sítio medido`)
}
// Projetos gravados com a fila genérica migram para o sítio medido; a torre antiga ganha os fios.
const legacyThermal=createComponent('thermalRelaySiemens3ru1116')
legacyThermal.terminals=legacyThermal.terminals.map(t=>t.label==='95'?{...t,position3D:{x:.7,y:1,z:.5}}:t)
const upgradedThermal=upgradeRealInterfacePositions(legacyThermal)
check(upgradedThermal.terminals.find(t=>t.label==='95')!.position3D!.z>.85,'projeto antigo: 95 passa da fila genérica do topo para a frente do relé')
const legacyTower=createComponent('towerLightSb23011');legacyTower.terminals=[]
check(upgradeRealInterfacePositions(legacyTower).terminals.length===4,'projeto antigo: torre sem fios recebe R/Y/G/COM')

for(const id of IMPORTED_COMPONENT_TYPES){
 check(!!TEMPLATES[id],`${id}: referência disponível no catálogo`)
 if(['limitSwitchLongRoller','buttonStart22','buttonStop22'].includes(id))check(!canInsertComponent3D(id),`${id}: bloqueado enquanto falta o modelo neutro`)
}
for(const model of models){
 const file=path.resolve('public','.'+model.path)
 check(file.startsWith(path.resolve('public')+path.sep),'caminho GLB contido em public')
 const bytes=await fs.readFile(file)
 assert.equal(createHash('sha256').update(bytes).digest('hex'),model.glbSha256)
 check(redundantPrimitives(parseGlb(bytes).json)===0,`${model.type}: uma primitiva por material em cada malha (sem buffers de posições repetidos)`)
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
