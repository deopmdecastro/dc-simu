import './node-env'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'meshoptimizer'
import { compactCatalogGlb } from '../src/catalog/glbCompression'
import { buildDefinitionObject } from '../src/catalog/definition'
import { ComponentRig } from '../src/catalog/componentRig'
import { cloneModelScene, disposeModelClone } from '../src/three/modelFit'
import { loadModelMm } from './detect-interfaces'
import { createComponent, upgradeRealInterfacePositions } from '../src/electrical/factory'
import { REAL_TERMINALS, terminalInsetMm } from '../src/electrical/realInterfaces'
import { LEGACY_MODULAR_SIZE, LEGACY_REAL_TERMINALS, MECHANICAL_INTERFACE_TYPES } from '../src/electrical/legacyRealInterfaces'
import { getComponentModelSpec, getComponentPhysicalSizeMm, PANEL_UNITS_PER_MM as U } from '../src/three/modelPaths'
import { componentPanelXY } from '../src/three/panelLayout'
import { componentHalfExtents } from '../src/three/panelBounds'
import { terminalNormalWorld3D } from '../src/three/terminal3D'
import { buildTerminalAssemblyCoverGroup, disposeTerminalAssemblyCover, TERMINAL_ASSEMBLY_TYPES } from '../src/three/terminalAssembly'
import { buildCombConnector, combConnectorBladeTipMm, COMB_CONNECTOR, COMB_BUSBAR } from '../src/three/combBusbarParts'
import { breakerInputLabels, breakerMountInsertionMm, breakerMountMouthWorld3D, combPhysicalTipWorld3D, combMountBridges, combMountDepthOffset, prepareCombConnectorForTopMount } from '../src/three/combMount'
import { buildCaptiveTerminalScrew } from '../src/three/terminalHardware'
import { createDigitalMeterObject } from '../src/three/digitalMeterModel'
import { internalBridges, computeContinuity, sourceTerminalIds } from '../src/electrical/engine'
import { useSimStore } from '../src/store/useSimStore'
import { paintImportedModel, rigImportedModel, animateImportedRig } from '../src/three/importedFinish'
import type { ComponentType } from '../src/types'

let checks=0
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;console.log('PASS — '+label)}
const close=(a:number,b:number,t=.025)=>Math.abs(a-b)<t
const normal={top:[0,1,0],bottom:[0,-1,0],front:[0,0,1],back:[0,0,-1],left:[-1,0,0],right:[1,0,0]} as const
const clone=<T,>(value:T):T=>structuredClone(value)
const originalFetch=globalThis.fetch
globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url
 if(url.startsWith('/models/')||url.startsWith('/datasheets/'))return new Response(await fs.readFile(path.join('public',decodeURIComponent(url))))
 return originalFetch(input,init)
}) as typeof fetch
const {buildBuiltinDraft,upgradeBuiltinDraft}=await import('../src/admin/editor3d/builtinComponents')

function oldTerminalPoint(type:ComponentType, label:string){
 const old=LEGACY_REAL_TERMINALS[type]!.find(t=>t.label===label)!,p=LEGACY_MODULAR_SIZE[type]??getComponentPhysicalSizeMm(type)!,n=normal[old.face],d=terminalInsetMm(old)
 return {old,p,point:{x:old.x-n[0]*d/p.width,y:1-old.y-n[1]*d/p.height,z:old.z-n[2]*d/p.depth}}
}
for(const type of MECHANICAL_INTERFACE_TYPES){
 const c=createComponent(type),fresh=clone(c)
 c.terminals=c.terminals.map(t=>{const {old,point}=oldTerminalPoint(type,t.label);return{...t,position3D:point,face:old.face,contact:old.contact??'socket',diameter:old.diameterMm,socket3D:type.startsWith('timerGeya')?{diameterMm:old.diameterMm!,depthMm:old.holeDepthMm!,insetMm:0,normal:[...normal[old.face]],position:{x:old.x,y:1-old.y,z:old.z}}:undefined}})
 const upgraded=upgradeRealInterfacePositions(c)
 check(upgraded.terminals.every(t=>{const target=fresh.terminals.find(x=>x.label===t.label)!;return t.id===target.id&&JSON.stringify(t.position3D)===JSON.stringify(target.position3D)&&t.contact==='socket'}),type+': only known factory endpoints migrate, retaining terminal IDs')
 check(upgraded.terminals.every(t=>terminalNormalWorld3D(upgraded,t).distanceTo(new THREE.Vector3(...normal[REAL_TERMINALS[type]!.find(s=>s.label===t.label)!.face]))<1e-6),type+': migrated cable normals follow the corrected physical face')
 check(upgradeRealInterfacePositions(upgraded)===upgraded,type+': native migration is idempotent')
 const pinned=clone(c);pinned.terminals[0].pinned=true
 check(upgradeRealInterfacePositions(pinned).terminals[0]===pinned.terminals[0],type+': pinned endpoint is untouched')
 const manual=clone(c);manual.terminals[0].position3D!.x+=.02
 check(upgradeRealInterfacePositions(manual).terminals[0]===manual.terminals[0],type+': manually moved endpoint is untouched')
 const authored=clone(c);authored.editorVersion=2
 check(upgradeRealInterfacePositions(authored)===authored,type+': authored native geometry is not migrated')
 const custom=clone(c),o=oldTerminalPoint(type,custom.terminals[0].label)
 custom.terminals[0].socket3D={position:{...o.point},normal:[1,0,0],diameterMm:o.old.diameterMm!,depthMm:o.old.holeDepthMm!,insetMm:terminalInsetMm(o.old)}
 check(upgradeRealInterfacePositions(custom).terminals[0]===custom.terminals[0],type+': a custom socket/normal is not overwritten')
 for(const field of ['face','contact','socketPosition','socketDiameter','socketNormal'] as const){
  const custom=clone(c),first=custom.terminals[0],o=oldTerminalPoint(type,first.label)
  if(field==='face')first.face='left'
  if(field==='contact')first.contact='surface'
  if(field.startsWith('socket')){
   first.socket3D={position:{x:o.old.x,y:1-o.old.y,z:o.old.z},normal:[...normal[o.old.face]],diameterMm:o.old.diameterMm!,depthMm:o.old.holeDepthMm!,insetMm:0}
   if(field==='socketPosition')first.socket3D.position.x+=.0001
   if(field==='socketDiameter')first.socket3D.diameterMm+=.1
   if(field==='socketNormal')first.socket3D.normal[0]+=.0001
  }
  check(upgradeRealInterfacePositions(custom).terminals[0]===first,type+': preserves manually authored '+field)
 }
 const endpoints=clone(c)
 endpoints.terminals=endpoints.terminals.map(t=>{const {old,point}=oldTerminalPoint(type,t.label);return{...t,socket3D:{position:{...point},normal:[...normal[old.face]],diameterMm:old.diameterMm!,depthMm:old.holeDepthMm!,insetMm:terminalInsetMm(old)}}})
 const endpointResult=upgradeRealInterfacePositions(endpoints)
 check(endpointResult.terminals.every(t=>JSON.stringify(t.socket3D?.position)===JSON.stringify(t.position3D)),type+': legacy socket-at-endpoint representation also follows its automatic endpoint')
 const {def}=await buildBuiltinDraft(type),oldDef=clone(def)
 oldDef.terminals=oldDef.terminals.map(t=>{const {old,p,point}=oldTerminalPoint(type,t.label);return{...t,name:'AUTOR '+t.label,position:[(point.x-.5)*p.width,point.y*p.height,(point.z-.5)*p.depth],normal:[...normal[old.face]],diameterMm:old.diameterMm,socketDepthMm:old.holeDepthMm,socketInsetMm:terminalInsetMm(old)}})
 const admin=await upgradeBuiltinDraft(type,oldDef)
 check(admin?.terminals.every(t=>{const expected=def.terminals.find(x=>x.label===t.label)!;return t.id===expected.id&&t.name==='AUTOR '+t.label&&t.position.every((n,i)=>close(n,expected.position[i]))&&t.normal.every((n,i)=>n===expected.normal[i])}),type+': Admin recognises exact legacy geometry and preserves IDs/authored names')
 const moved=clone(oldDef);moved.terminals[0].position[0]+=.5
 const result=await upgradeBuiltinDraft(type,moved)
 check(JSON.stringify((result??moved).terminals[0])===JSON.stringify(moved.terminals[0]),type+': Admin preserves a manual endpoint')
 const transformed=clone(oldDef);transformed.parts[0].rotation[0]=12
 const held=await upgradeBuiltinDraft(type,transformed)
 check(JSON.stringify((held??transformed).terminals)===JSON.stringify(transformed.terminals),type+': Admin does not rebase authored part transforms')
 for(const field of ['lock','scale','position','normal','diameter','state','split'] as const){
  const custom=clone(oldDef)
  if(field==='lock')custom.parts[0].locked=true
  if(field==='scale')custom.parts[0].scale[0]=1.001
  if(field==='position')custom.parts[0].position[0]=.005
  if(field==='normal')custom.terminals[0].normal[0]=.0001
  if(field==='diameter')custom.terminals[0].diameterMm!+=.1
  if(field==='state')custom.states[0].parts[custom.parts[0].id]={position:[1,2,3]}
  if(field==='split')custom.parts.push({...clone(custom.parts[0]),id:'authored-second-part'})
  const held=await upgradeBuiltinDraft(type,custom)
  const after=(held??custom).terminals,before=custom.terminals
  check(JSON.stringify(field==='normal'||field==='diameter'?after[0]:after)===JSON.stringify(field==='normal'||field==='diameter'?before[0]:before),type+': Admin preserves authored '+field)
 }
 const again=await upgradeBuiltinDraft(type,admin!)
 check(JSON.stringify((again??admin).terminals)===JSON.stringify(admin!.terminals),type+': Admin migration is idempotent')
}

// Animate the actual manufacturer-derived mesh in its native metre frame.
// The newly oriented model must translate its carrier along Z, not orbit a
// stale hinge and not drag either bank of exposed pre-charge resistors.
const bytes=await fs.readFile('public/models/importados/contactorWegCwbc65.glb')
// The exact manufacturer buffer is the regression fixture: no quantisation,
// reordered indices or changed texture bytes are allowed in delivery packing.
const sourceBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)
const packed=await compactCatalogGlb(sourceBuffer)
const parseGlb=(buffer:ArrayBuffer)=>{const view=new DataView(buffer),length=view.getUint32(12,true);return{json:JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length))),binary:new Uint8Array(buffer,28+length,view.getUint32(20+length,true))}}
const rawDoc=parseGlb(sourceBuffer),packedDoc=parseGlb(packed)
await MeshoptDecoder.ready
for(let i=0;i<rawDoc.json.bufferViews.length;i++){
 const old=rawDoc.json.bufferViews[i],next=packedDoc.json.bufferViews[i],extension=next.extensions?.EXT_meshopt_compression
 const expected=rawDoc.binary.subarray(old.byteOffset??0,(old.byteOffset??0)+old.byteLength)
 let actual:Uint8Array
 if(extension){actual=new Uint8Array(next.byteLength);MeshoptDecoder.decodeGltfBuffer(actual,extension.count,extension.byteStride,packedDoc.binary.subarray(extension.byteOffset,extension.byteOffset+extension.byteLength),extension.mode,extension.filter)}
 else actual=packedDoc.binary.subarray(next.byteOffset??0,(next.byteOffset??0)+next.byteLength)
 assert.deepEqual(actual,expected,'CWBC65 packed bufferView '+i+' must decode byte-for-byte')
}
check(packed.byteLength<sourceBuffer.byteLength,'CWBC65: publication packs every original vertex, normal and index byte losslessly')
for(const key of ['meshes','materials','nodes','scenes','accessors'])assert.deepEqual(packedDoc.json[key],rawDoc.json[key])
check(true,'CWBC65: delivery compression preserves topology, authored node names/materials, transforms and accessor bounds')
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const {scene:cwbc}=await loader.parseAsync(packed,'')
const cwbcParts=paintImportedModel('contactorWegCwbc65',cwbc),rig=rigImportedModel('contactorWegCwbc65',cwbc,cwbcParts)
const carrier=rig.pivots.find(p=>p.role==='carrier')!
check(carrier?.pivot.children.length===2&&carrier.pivot.children.every(n=>['cad_38_','cad_39_'].includes(n.name)),'CWBC65: only the two real carrier meshes are reparented to the bounds-derived pivot')
cwbc.updateMatrixWorld(true)
const stationary=cwbcParts.filter(p=>!carrier.pivot.children.includes(p.mesh)).map(p=>({mesh:p.mesh,point:p.mesh.getWorldPosition(new THREE.Vector3())}))
const rest=carrier.pivot.position.clone(),worldRest=carrier.pivot.getWorldPosition(new THREE.Vector3()),rotation=carrier.pivot.quaternion.clone()
animateImportedRig(rig,'contactorWegCwbc65',{energized:true},true,10);cwbc.updateMatrixWorld(true)
const worldCourse=carrier.pivot.getWorldPosition(new THREE.Vector3()).sub(worldRest)
check(worldCourse.distanceTo(new THREE.Vector3(0,0,-.0028))<1e-8&&carrier.pivot.quaternion.equals(rotation),'CWBC65: powered carrier moves axially 2.8 mm in physical front-normal Z, never vertically or by frame rotation')
check(stationary.every(p=>p.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(p.point)<1e-8),'CWBC65: housing, terminal screws and both exposed resistor banks remain fixed')
animateImportedRig(rig,'contactorWegCwbc65',{energized:false},false,10)
check(carrier.pivot.position.distanceTo(rest)<1e-8,'CWBC65: STOP returns the carrier to its original pose')
// The Admin and a baked catalogue use the serialized local course, not the
// native rig object. Its world direction/length must survive cloning and mm fit.
const catalogRoot=cwbc.clone(true);catalogRoot.scale.setScalar(1000);catalogRoot.updateMatrixWorld(true)
const catalogCarrier=catalogRoot.getObjectByName('imported_carrier')!,catalogRest=catalogCarrier.getWorldPosition(new THREE.Vector3())
const {def:cwbcDefinition}=await buildBuiltinDraft('contactorWegCwbc65'),catalogRig=new ComponentRig(cwbcDefinition,catalogRoot)
catalogRig.setVars({energized:true});catalogRig.snap();catalogRoot.updateMatrixWorld(true)
check(catalogCarrier.getWorldPosition(new THREE.Vector3()).sub(catalogRest).distanceTo(new THREE.Vector3(0,0,-2.8))<1e-7,'CWBC65: serialized carrier course survives cloning and mm fitting for the real Admin/catalogue rig')
catalogRig.setVars({energized:true,$simStopped:true});catalogRig.update(10);catalogRoot.updateMatrixWorld(true)
check(catalogCarrier.getWorldPosition(new THREE.Vector3()).distanceTo(catalogRest)<1e-7,'CWBC65: catalogue STOP restores the physical carrier even if a saved coil variable is true')
catalogRig.dispose()


for(const type of TERMINAL_ASSEMBLY_TYPES){
 const {def}=await buildBuiltinDraft(type),part=def.parts.find(part=>part.procedural==='terminal-assembly-cover')!
 check(!!part&&part.optional===true&&part.visible===false,type+': Admin owns one real optional acrylic part, initially OFF')
 const original=clone(def),root=buildDefinitionObject(def,new Map()),shield=root.getObjectByName('terminal-assembly-acrylic-shield') as THREE.Mesh
 check(!!shield&&shield.parent?.visible===false&&(shield.material as THREE.MeshPhysicalMaterial).transmission===.9,type+': Admin builds the same real transparent shield in mm, not an opaque placeholder')
 const author=clone(def);author.parts.find(p=>p.id===part.id)!.position[0]=1.25;author.parts.find(p=>p.id===part.id)!.visible=true;author.parts.find(p=>p.id===part.id)!.rotation[1]=7
 const upgraded=await upgradeBuiltinDraft(type,author)
 check(JSON.stringify((upgraded??author).parts)===JSON.stringify(author.parts)&&JSON.stringify((upgraded??author).terminals)===JSON.stringify(author.terminals),type+': reopening preserves authored cover transforms/visibility and every terminal')
 const deleted=clone(original);deleted.parts=deleted.parts.filter(p=>p.id!==part.id)
 const absent=await upgradeBuiltinDraft(type,deleted)
 check(!(absent??deleted).parts.some(p=>p.procedural==='terminal-assembly-cover'),type+': an author-deleted cover is never silently reseeded')
}
const cachedCover=buildTerminalAssemblyCoverGroup(24,55,55),firstClone=cloneModelScene(cachedCover),secondClone=cloneModelScene(cachedCover)
const cachedLine=cachedCover.children.find(n=>(n as THREE.LineSegments).isLineSegments) as THREE.LineSegments
let cachedGeometryDisposed=0,cachedMaterialDisposed=0
cachedLine.geometry.addEventListener('dispose',()=>cachedGeometryDisposed++);(cachedLine.material as THREE.Material).addEventListener('dispose',()=>cachedMaterialDisposed++)
disposeModelClone(firstClone)
check(!cachedGeometryDisposed&&!cachedMaterialDisposed&&!!secondClone.children.find(n=>(n as THREE.LineSegments).isLineSegments),'Published acrylic: unmounting a clone does not dispose shared edge geometry or another instance material')
disposeModelClone(secondClone);disposeTerminalAssemblyCover(cachedCover)

for(const type of TERMINAL_ASSEMBLY_TYPES){
 const p=getComponentPhysicalSizeMm(type)!,cover=buildTerminalAssemblyCoverGroup(p.width,p.height,p.depth,U)
 const shield=cover.getObjectByName('terminal-assembly-acrylic-shield') as THREE.Mesh
 const box=new THREE.Box3().setFromObject(shield,true)
 check(close(box.getSize(new THREE.Vector3()).x,(p.width+3.2)*U,.0001)&&box.min.z>p.depth*U/2-.013,type+': acrylic is in front of the native assembly, in its physical frame')
 const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();let gd=0,md=0
 cover.traverse(n=>{const mesh=n as THREE.Mesh;if(mesh.geometry)geos.add(mesh.geometry);if(mesh.material)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])mats.add(m)})
 geos.forEach(g=>g.addEventListener('dispose',()=>gd++));mats.forEach(m=>m.addEventListener('dispose',()=>md++))
 disposeTerminalAssemblyCover(cover)
 check(gd===geos.size&&md===mats.size,type+': toggle/unmount disposes owned meshes, edge lines and shared materials exactly once')
}

function crossRecess(group:THREE.Object3D){
 group.updateWorldMatrix(true,true)
 let unit=1
 group.traverse(n=>{const m=n as THREE.Mesh;if(m.isMesh&&n.name.startsWith('terminal_screw_head_')){m.geometry.computeBoundingBox();unit=m.geometry.boundingBox!.getSize(new THREE.Vector3()).z/.52}})
 const ray=new THREE.Raycaster(),sample=(x:number,y:number)=>{
  const origin=group.localToWorld(new THREE.Vector3(x,y,4).multiplyScalar(unit)),end=group.localToWorld(new THREE.Vector3(x,y,-4).multiplyScalar(unit));ray.set(origin,end.sub(origin).normalize())
  const hit=ray.intersectObject(group,true)[0];return hit?group.worldToLocal(hit.point.clone()).z/unit:NaN
 }
 return {floor:sample(0,0),face:sample(.8,.8)}
}
const basic=buildCaptiveTerminalScrew('test',2.18),slot=crossRecess(basic)
check(close(slot.face,0,.0001)&&close(slot.floor,-.52,.0001),'Screw head has a geometric cross recess 0.52 mm deep, not a painted cross')
for(const type of ['timerGeyaGrt8M1','timerGeyaGrt8B1'] as const){
 const model=(await loadModelMm(type))!;let screws=0
 model.root.traverse(n=>{if(n.name.startsWith('terminal_screw_geya_')){const r=crossRecess(n);assert.ok(r.face-r.floor>.5);screws++}})
 check(screws===6,type+': six real captive screws and finite, independent cable mouths')
}
const d52=createDigitalMeterObject('meterD522066');d52.updateMatrixWorld(true)
for(const label of ['1','2']){const r=crossRecess(d52.getObjectByName('terminal_screw_d52_'+label)!);check(r.face-r.floor>.5,'D52 '+label+': front driver well contains a recessed cross screw')}
const ctRay=new THREE.Raycaster(new THREE.Vector3(-1,12*U,18*U),new THREE.Vector3(1,0,0))
check(!ctRay.intersectObject(d52,true).some(h=>h.distance<2),'D52: transverse primary-current passage remains genuinely open')
check(!!d52.getObjectByName('digital_meter_lcd')&&!d52.getObjectByName('digital_meter_connection_3'),'D52: original live LCD and internal-CT electrical interface remain unchanged')

const material=new THREE.MeshStandardMaterial(),materials={housing:material,tinned:material,cage:material,dark:material}
for(const pinStyle of ['cranked','straight'] as const)for(const pinDirection of ['down','up'] as const){
 const state={pinStyle,pinDirection},built=buildCombConnector(state,1,materials),tip=combConnectorBladeTipMm(state),box=new THREE.Box3().setFromObject(built.root,true)
 check(close(pinDirection==='down'?box.min.y:box.max.y,tip[1],.0001),`Feeder ${pinStyle}/${pinDirection}: actual metal tip and mounting datum coincide`)
 const metal=new THREE.Box3().setFromObject(built.root.getObjectByName('comb-connector-tinned-pin')!,true)
 check(metal.min.z>=-COMB_CONNECTOR.depthMm/2-.001&&metal.max.z<=COMB_CONNECTOR.depthMm/2+.001,`Feeder ${pinStyle}/${pinDirection}: cranked/straight metal stays inside its physical depth frame`)
 check(box.max.z<=COMB_CONNECTOR.depthMm/2+.15,`Feeder ${pinStyle}/${pinDirection}: moulded collar bevel stays within 0.15 mm of the nominal frame`)
}
const staticBytes=await fs.readFile('public/models/bornes-e-barras/conector-barramento-pente.glb')
const {scene:staticConnector}=await new GLTFLoader().parseAsync(staticBytes.buffer.slice(staticBytes.byteOffset,staticBytes.byteOffset+staticBytes.byteLength),'')
staticConnector.updateMatrixWorld(true)
const staticPin=staticConnector.getObjectByName('comb-connector-tinned-pin')!,staticBox=new THREE.Box3().setFromObject(staticPin,true),expectedStaticTip=combConnectorBladeTipMm({pinStyle:COMB_CONNECTOR.defaultPinStyle,pinDirection:COMB_CONNECTOR.defaultPinDirection})
const referenceStatic=buildCombConnector({pinStyle:COMB_CONNECTOR.defaultPinStyle,pinDirection:COMB_CONNECTOR.defaultPinDirection},.001,materials).root
const referenceBox=new THREE.Box3().setFromObject(referenceStatic.getObjectByName('comb-connector-tinned-pin')!,true)
check(!!staticPin&&close(staticBox.min.y*1000,expectedStaticTip[1],.0001)&&staticBox.min.distanceTo(referenceBox.min)<1e-8&&staticBox.max.distanceTo(referenceBox.max)<1e-8,'Static feeder GLB: exported metal uses the same corrected physical tip and crank plane as the live generator')
check(staticBox.min.z*1000>=-COMB_CONNECTOR.depthMm/2-.001&&staticBox.max.z*1000<=COMB_CONNECTOR.depthMm/2+.001,'Static feeder GLB: no legacy Z overhang or uncorrected blade survives in the distributed asset')

const s=()=>useSimStore.getState()
s().newProject();useSimStore.setState({demoMode:false,components:[],wires:[]})
const brId=s().addComponent('breaker3p',300,300)!,bpId=s().addComponent('busbarComb',300,200)!,cbId=s().addComponent('combBusbarConnector',300,200)!
s().updateCombBusbar(bpId,{poleCount:3,combMode:'3P',teethDirection:'down'});s().mountCombBusbar(bpId,brId);s().mountCombConnector(cbId,brId,'3')
let br=s().components.find(c=>c.id===brId)!,bp=s().components.find(c=>c.id===bpId)!,cb=s().components.find(c=>c.id===cbId)!
const xyz=componentPanelXY(cb),tip=combPhysicalTipWorld3D(cb,'PINO',new THREE.Vector3(xyz.x,xyz.y,componentHalfExtents(cb).z+combMountDepthOffset(cb,s().components)))!
const bxy=componentPanelXY(br),mouth=breakerMountMouthWorld3D(br,'3','feed',new THREE.Vector3(bxy.x,bxy.y,componentHalfExtents(br).z))!
check(close(tip.x,mouth.x,.0034)&&close(tip.y,mouth.y-.1,.0034)&&close(tip.z,mouth.z,.00001),'Mounted feeder: real tip enters downward 10 mm in the front cable lane')
const back=breakerMountMouthWorld3D(br,'3','comb',new THREE.Vector3())!,front=breakerMountMouthWorld3D(br,'3','feed',new THREE.Vector3())!
check(close((front.z-back.z)/U,5,.001),'Comb and feeder occupy distinct planes 5 mm apart, never the front screwdriver hole')
const bridges=combMountBridges(s().components),target=br.terminals.find(t=>t.label==='3')!,pin=cb.terminals.find(t=>t.label==='PINO')!,input=cb.terminals.find(t=>t.label==='IN')!
check(bridges.some(w=>w.fromTerminalId===pin.id&&w.toTerminalId===target.id)&&internalBridges(cb).some(p=>p.includes(input.id)&&p.includes(pin.id)),'Feeder IN → PINO → original breaker clamp: continuity uses the same logical terminal ID')
const continuity=computeContinuity(s().components,bridges,[input.id])
check(continuity.energizedTerminals.has(target.id),'Physical separation does not break electrical continuity')
check(['1','5'].every(label=>!continuity.energizedTerminals.has(br.terminals.find(t=>t.label===label)!.id)),'Three-phase comb and feeder never short the adjacent phases')
const supplyId=s().addComponent('powerSource3ph',600,200)!,supply=s().components.find(c=>c.id===supplyId)!
s().addWire(supply.terminals.find(t=>t.label==='L2')!.id,input.id,'black')
s().setComponentState(brId,{closed:true})
const actualWires=[...s().wires,...combMountBridges(s().components)],live=computeContinuity(s().components,actualWires,sourceTerminalIds([supply]))
const output=br.terminals.find(t=>t.label==='4')!
check(live.energizedTerminals.has(input.id)&&live.energizedTerminals.has(pin.id)&&live.energizedTerminals.has(target.id)&&live.energizedTerminals.has(output.id),'Actual supply → saved wire → feeder IN/PINO → mounted clamp → closed breaker output is energized end-to-end')
const phasePath=computeContinuity(s().components,actualWires,[supply.terminals.find(t=>t.label==='L2')!.id])
check(['1','5'].every(label=>!phasePath.energizedTerminals.has(br.terminals.find(t=>t.label===label)!.id)),'The separately wired L2 supply never crosses to an adjacent comb phase')
const unplugged=computeContinuity(s().components,combMountBridges(s().components),sourceTerminalIds([supply]))
check(!unplugged.energizedTerminals.has(output.id),'Removing the real supply wire opens the entire feeder path; there is no synthetic source at IN')
const signature=()=>JSON.stringify([s().components.map(c=>[c.id,c.terminals.map(t=>t.id)]),s().wires.map(w=>[w.id,w.fromTerminalId,w.toTerminalId])])
const before=signature(),saved=s().saveJSON();check(s().wires.length===1,'Feeder accepts an actual separate supply wire before project roundtrip');s().loadJSON(saved)
check(before===signature()&&s().components.find(c=>c.id===cbId)?.state.mountedTerminal==='3'&&s().components.find(c=>c.id===cbId)?.mountedOn===brId&&s().components.find(c=>c.id===bpId)?.mountedOn===brId,'Save/reopen preserves both physical mounts, selected phase and every terminal and wire ID')
check(computeContinuity(s().components,[...s().wires,...combMountBridges(s().components)],[supply.terminals.find(t=>t.label==='L2')!.id]).energizedTerminals.has(output.id),'Reopening the wired feeder preserves its actual powered path, not just a mountedTerminal label')
cb=clone(s().components.find(c=>c.id===cbId)!);cb.terminals[0].position3D!.x+=.03
check(prepareCombConnectorForTopMount(cb).terminals[0]===cb.terminals[0],'Mount migration preserves a manually edited feeder terminal')
for(const type of ['breaker1p','breaker2p','breaker3p','breakerSteckSdC25','residualBreakerHagerCfc225p','phoenixEcb3000760'] as const){
 const model=(await loadModelMm(type))!,breaker=createComponent(type),ray=new THREE.Raycaster()
 for(const label of breakerInputLabels(breaker))for(const role of ['comb','feed'] as const){
  const p=breakerMountMouthWorld3D(breaker,label,role,new THREE.Vector3())!.multiplyScalar(100)
  const halfW=(role==='feed'?COMB_CONNECTOR.pinWidthMm:COMB_BUSBAR.pinWidthMm)/2,halfD=(role==='feed'?COMB_CONNECTOR.pinThickMm+.32:COMB_BUSBAR.pinThickMm)/2
  for(let ix=0;ix<=8;ix++)for(let iz=0;iz<=8;iz++){
   const dx=-halfW+ix*halfW/4,dz=-halfD+iz*halfD/4
   ray.set(new THREE.Vector3(p.x+dx,p.y+3,p.z+dz),new THREE.Vector3(0,-1,0))
   const hit=ray.intersectObject(model.root,true)[0]
   assert.ok(hit&&hit.point.y<p.y-breakerMountInsertionMm(breaker,role)-.05,`${type}.${label}/${role}: blade would intersect ${hit?.object.name} at ${hit?.point.y}, mouth ${p.y}`)
  }
 }
 check(true,type+': all comb/feed blade corners enter the measured top cavity without piercing plastic')
}
for(const edit of ['pin','move','normal','face','name'] as const){
 const custom=createComponent('combBusbarConnector'),terminal=custom.terminals[0]
 if(edit==='pin')terminal.pinned=true
 if(edit==='move')terminal.position3D!.x+=.01
 if(edit==='normal')terminal.socket3D!.normal[0]+=.01
 if(edit==='face')terminal.face='left'
 if(edit==='name')terminal.displayName='AUTOR CABO'
 const expected=JSON.stringify(terminal)
 useSimStore.setState({components:[custom],wires:[],demoMode:false})
 s().updateCombConnector(custom.id,{connectorColor:'#2563eb',gaugeRange:'10-35'})
 const actual=s().components[0].terminals[0]
 check(edit==='name'?actual.displayName==='AUTOR CABO':JSON.stringify(actual)===expected,'Feeder inspector colour/gauge changes preserve authored '+edit)
}
const automatic=createComponent('combBusbarConnector');useSimStore.setState({components:[automatic],wires:[]})
s().updateCombConnector(automatic.id,{pinDirection:'up'})
check(s().components[0].terminals.find(t=>t.label==='PINO')!.face==='top'&&s().components[0].terminals.find(t=>t.label==='PINO')!.socket3D!.normal[1]===1,'Unmounted feeder: flipping an automatic blade updates both its physical face and cable normal')
// Load an actual old wired project through the public store loader, not just
// the migration helper. IDs/routes authored by the user remain the wire graph.
s().newProject();useSimStore.setState({demoMode:false,components:[],wires:[]})
const oldSource=s().addComponent('powerSource3ph',20,20)!,oldContactor=s().addComponent('contactorWegCwbc65',300,300)!
const oldGeya=s().addComponent('timerGeyaGrt8M1',500,300)!
const terminalId=(id:string,label:string)=>s().components.find(c=>c.id===id)!.terminals.find(t=>t.label===label)!.id
for(const [a,b]of [['L1','1L1'],['L2','3L2'],['L3','5L3'],['L1','A1'],['N','A2']])s().addWire(terminalId(oldSource,a),terminalId(oldContactor,b),'black',[{x:120,y:80},{x:200,y:80}])
s().addWire(terminalId(oldSource,'L1'),terminalId(oldGeya,'A1'),'black');s().addWire(terminalId(oldSource,'N'),terminalId(oldGeya,'A2'),'blue')
const legacy=JSON.parse(s().saveJSON())
for(const c of legacy.components.filter((c:any)=>MECHANICAL_INTERFACE_TYPES.has(c.type))){
 c.editorVersion=1;c.terminals=c.terminals.map((t:any)=>{const {old,point}=oldTerminalPoint(c.type,t.label);return{...t,position3D:point,face:old.face,contact:old.contact??'socket',diameter:old.diameterMm,socket3D:undefined}})
}
const wiredIdentity=JSON.stringify([legacy.components.map((c:any)=>[c.id,c.terminals.map((t:any)=>t.id)]),legacy.wires.map((w:any)=>[w.id,w.fromTerminalId,w.toTerminalId,w.waypoints,w.color,w.gauge])])
s().loadJSON(JSON.stringify(legacy))
const wiredAfter=()=>JSON.stringify([s().components.map(c=>[c.id,c.terminals.map(t=>t.id)]),s().wires.map(w=>[w.id,w.fromTerminalId,w.toTerminalId,w.waypoints,w.color,w.gauge])])
check(wiredAfter()===wiredIdentity&&s().wires.length===7,'Legacy wired project: real loader migrates known geometry without changing a component/terminal/wire ID, route, colour or gauge')
const migratedCwbc=s().components.find(c=>c.id===oldContactor)!,freshCwbc=createComponent('contactorWegCwbc65')
const migratedMatches=migratedCwbc.terminals.every(t=>JSON.stringify(t.position3D)===JSON.stringify(freshCwbc.terminals.find(next=>next.label===t.label)!.position3D))
check(migratedMatches,'Legacy wired CWBC65: cable endpoints follow the corrected physical front without recreating terminals')
s().step(100)
check(s().components.find(c=>c.id===oldContactor)!.state.energized===true&&s().components.find(c=>c.id===oldGeya)!.state.powered===true,'Legacy wired project still energizes the actual CWBC65 coil and GEYA supply after migration')
s().stop();const migratedSave=s().saveJSON();s().loadJSON(migratedSave)
check(wiredAfter()===wiredIdentity,'Legacy wired migration and save/reopen are idempotent for the complete cable graph')
// There is no manufacturer CAD for the legacy generic 4P renderer. Exercise
// its real store/mount/continuity contract without pretending to certify a
// plastic cavity that its deliberately simplified procedural model lacks.
s().newProject();useSimStore.setState({demoMode:false,components:[],wires:[]})
check(s().addComponent('breaker4p',300,300)===null,'Generic 4P: existing no-CAD insertion guard stays enforced; the regression never enables a blocked library item')
const existing4p=createComponent('breaker4p','QG1','',0,300,300);useSimStore.setState({components:[existing4p]})
const generic4p=existing4p.id,genericComb=s().addComponent('busbarComb',300,200)!,genericFeeder=s().addComponent('combBusbarConnector',300,200)!
s().updateCombBusbar(genericComb,{poleCount:4,combMode:'3P+N',teethDirection:'down'});s().mountCombBusbar(genericComb,generic4p);s().mountCombConnector(genericFeeder,generic4p,'7')
const genericSignature=signature(),genericSaved=s().saveJSON();s().loadJSON(genericSaved)
const four=s().components.find(c=>c.id===generic4p)!,feed4=s().components.find(c=>c.id===genericFeeder)!,comb4=s().components.find(c=>c.id===genericComb)!
check(!getComponentModelSpec('breaker4p')&&signature()===genericSignature&&feed4.mountedOn===four.id&&comb4.mountedOn===four.id&&Number.isFinite(combMountDepthOffset(feed4,s().components)),'Generic 4P (procedural, not CAD): real mounting and save/reopen retain finite positions, both mounts and all identities')
const neutral4=computeContinuity(s().components,combMountBridges(s().components),[feed4.terminals.find(t=>t.label==='IN')!.id])
check(neutral4.energizedTerminals.has(four.terminals.find(t=>t.label==='8')!.id)&&['1','3','5'].every(label=>!neutral4.energizedTerminals.has(four.terminals.find(t=>t.label===label)!.id)),'Generic 4P: the separately selected fourth pole conducts without shorting any of the other three poles')
console.log(`\n${checks} mechanical revision assertions passed`)
