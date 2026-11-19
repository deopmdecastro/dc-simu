import './node-env'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { make,cable,graph,assertions,terminal } from './lib/electrical-fixture'
import { updatePanelMeters } from '../src/electrical/panelMeterModel'
import { internalBridges } from '../src/electrical/engine'
import { cloneModelScene,disposeModelClone,fitComponentModel } from '../src/three/modelFit'
import { getComponentModelSpec } from '../src/three/modelPaths'
import { terminalLocal3D } from '../src/three/terminal3D'
import { REAL_TERMINALS,terminalInsetMm } from '../src/electrical/realInterfaces'
import { applySchneiderModularState } from '../src/three/schneiderModularModel'
import { createDigitalMeterObject, digitalMeterSpec } from '../src/three/digitalMeterModel'
import { buildBuiltinDraft } from '../src/admin/editor3d/builtinComponents'
import { boundsMm, buildDefinitionObject, loadGlbAssets, runtimeSpec } from '../src/catalog/definition'
import { measureSeat } from '../src/catalog/terminalSeat'
import type { ComponentType } from '../src/types'
const {check,done}=assertions(),ac=make('powerSource1ph'),meter=make('meterD522066'),motor=make('motor1ph'),other=make('motor1ph')
Object.assign(ac.state,{nominalV:240,frequencyHz:60});Object.assign(motor.state,{running:true,currentA:2.5,powerFactor:.8});Object.assign(other.state,{running:true,currentA:99})
let components=[ac,meter,motor,other],wires=[cable(ac,'L',meter,'1'),cable(ac,'N',meter,'2')]
const scan=(dt=100,running=true)=>updatePanelMeters(components,wires,graph(components,wires),dt,running)
scan();check(meter.state.on&&meter.state.voltage===240&&meter.state.frequency===60,'D52 uses the connected source voltage and frequency')
check(meter.state.current===0&&meter.state.energy===0,'unrelated running motors do not create phantom meter current/energy')
const extCt=make('currentTransformerSplitCore');components=[ac,extCt,meter,motor,other]
// TC externo (variante YD52 real): o primário P1/P2 leva a carga; o secundário
// S1/S2 liga aos bornes 3/4 do medidor. Sem CT-IN/CT-OUT internos.
wires.push(cable(ac,'L',extCt,'P1'),cable(extCt,'P2',motor,'U1'),cable(ac,'N',motor,'U2'),cable(extCt,'S1',meter,'3'),cable(extCt,'S2',meter,'4'));scan(3_600_000)
check(meter.state.current===2.5&&meter.state.power===480,'D52 CT passage measures only its real series load')
check(Math.abs(meter.state.energy-.48)<1e-12,'energy integrates watts × elapsed milliseconds in kWh')
const energy=meter.state.energy;scan(10000,false);scan(0);check(meter.state.energy===energy,'pause and zero-time recomputation never add energy')
scan(1);check(meter.state.energy>energy&&meter.state.energy-energy<.000001,'sub-display precision is retained; no fixed rounded increments')
wires.push(cable(ac,'L',motor,'U1'));scan();check(meter.state.current===0&&meter.state.measurementAmbiguous,'bypassed CT primary is explicitly ambiguous, not double-counted')
wires=wires.filter(w=>w.toTerminalId!==terminal(meter,'2'));scan();check(!meter.state.on&&meter.state.power===0,'loss of actual D52 neutral blanks readings')
const ct=make('currentTransformerSplitCore'),primary=internalBridges(ct)
check(primary.length===1&&primary[0].includes(terminal(ct,'P1'))&&primary[0].includes(terminal(ct,'P2')),'CT primary is continuous while secondary remains isolated')
check(!graph([ac,ct],[cable(ac,'L',ct,'P1')]).energizedTerminals.has(terminal(ct,'S1')),'mains through TC window never energizes S1/S2')
const kws=make('meterKws306'),three=make('powerSource3ph');components=[three,kws,motor];wires=[cable(three,'N',kws,'N-IN'),cable(three,'L1',kws,'L1-IN'),cable(kws,'L1-OUT',motor,'U1'),cable(three,'N',motor,'U2')];scan()
check(kws.state.vA>230&&kws.state.vB===0&&kws.state.vC===0&&kws.state.iA===2.5,'KWS phase channels reflect independent actual wiring')
kws.state.switchOn=false;scan();check(kws.state.iA===0&&kws.state.on,'KWS switch opens outgoing branch, does not invent lost input supply')
for(const type of ['meterD522066','meterKws306'] as const){const m=make(type);check(!m.state.on&&m.state.energy===0,type+': new instance has no fabricated demo readings')}
const tcObject=createDigitalMeterObject('currentTransformerSplitCore');tcObject.updateMatrixWorld(true)
check(new THREE.Raycaster(new THREE.Vector3(0,.28,.5),new THREE.Vector3(0,0,-1)).intersectObject(tcObject,true).length===0,'TC Ø16 mm window is a real open bore, not a black disk')
for (const type of ['meterD522066','meterKws306','currentTransformerSplitCore'] as const) {
 const physical=digitalMeterSpec(type).physicalSizeMm,expected=fitComponentModel(createDigitalMeterObject(type),digitalMeterSpec(type),1,'bottom'),expectedBox=new THREE.Box3().setFromObject(expected,true)
 const {def,usedComposite,usedModel}=await buildBuiltinDraft(type),cache=new Map<string,THREE.Object3D>();await loadGlbAssets(def,cache)
 const actual=buildDefinitionObject(def,cache),box=boundsMm(def,cache),volume=box.getSize(new THREE.Vector3()),c=make(type),runtime=runtimeSpec(def,box)
 check(usedComposite&&!usedModel&&box.min.distanceTo(expectedBox.min)<.0001&&box.max.distanceTo(expectedBox.max)<.0001,type+': Admin preserves exact procedural nominal frame and geometry, not a 50 mm envelope fit')
 const errors=def.terminals.map(t=>({label:t.label,distance:new THREE.Vector3(...t.position).distanceTo(terminalLocal3D(c,c.terminals.find(s=>s.label===t.label)!).multiplyScalar(100).add(new THREE.Vector3(0,physical.height/2,0)))}))
 check(errors.every(t=>t.distance<.0001),type+': every Admin endpoint equals its actual simulator endpoint '+JSON.stringify(errors))
 const sockets=def.terminals.filter(t=>!/^P[12]$|^CT-/.test(t.label)),seats=sockets.map(t=>({label:t.label,...measureSeat(actual,t.position,t.normal,t.diameterMm)}))
 check(seats.length>0&&seats.every(t=>t.status==='seated'),type+': real procedural secondary/voltage sockets contain cable endpoints '+JSON.stringify(seats))
 check(def.terminals.every(t=>{const q=runtime.terminals.find(s=>s.id===t.id)!.position3D;return new THREE.Vector3(box.min.x+q.x*volume.x,box.min.y+q.y*volume.y,box.min.z+q.z*volume.z).distanceTo(new THREE.Vector3(...t.position))<.0001}),type+': catalog export keeps measured inset instead of projecting sockets onto the face')
 disposeModelClone(expected);disposeModelClone(actual)
}
const types:ComponentType[]=['breakerSchneiderIc60h1p','pilotLightSchneiderIil1p','pilotLightSchneiderIil3p','residualBreakerSchneiderIid4p','residualBreakerSchneiderIdpnVigi']
const records=['modular','rcd'].flatMap(group=>JSON.parse(fs.readFileSync(`public/models/protecao/schneider-acti9-${group}-sources.json`,'utf8')).models)
for(const type of types){
 const spec=getComponentModelSpec(type)!,bytes=fs.readFileSync('public'+spec.path),record=records.find((r:any)=>r.path===spec.path)
 check(record?.sha256===createHash('sha256').update(bytes).digest('hex')&&record.source.sha256.length===64,type+': exported asset and manufacturer STEP provenance hashes match')
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
 const clone=cloneModelScene(scene),fitted=fitComponentModel(clone,spec,.01,'center'),rawSize=new THREE.Box3().setFromObject(scene,true).getSize(new THREE.Vector3()),size=new THREE.Box3().setFromObject(fitted,true).getSize(new THREE.Vector3())
 check([size.x/rawSize.x,size.y/rawSize.y,size.z/rawSize.z].every(k=>Math.abs(k-10)<.0001),type+': uniform source-mm scale, never clip-envelope stretching')
 const c=make(type),misaligned:string[]=[],occluded:string[]=[]
 for(const t of c.terminals){
  const mouth=fitted.getObjectByName('acti9_connection_'+THREE.PropertyBinding.sanitizeNodeName(t.label))
  const spot=REAL_TERMINALS[type]?.find(s=>s.label===t.label)
  if(!mouth||!spot){misaligned.push(t.label+':missing');continue}
  const normal=new THREE.Vector3(...(spot.face==='top'?[0,1,0]:[0,-1,0]) as [number,number,number]),at=mouth.getWorldPosition(new THREE.Vector3()),tip=terminalLocal3D(c,t),inset=terminalInsetMm(spot)*.01
  if(at.clone().addScaledVector(normal,-inset).distanceTo(tip)>.0002)misaligned.push(t.label)
  const ray=new THREE.Raycaster(at.clone().addScaledVector(normal,.001),normal.clone().negate(),0,(spot.holeDepthMm??6)*.01)
  const hit=ray.intersectObject(fitted,true).filter(h=>!h.object.userData.protectionMarking)[0]
  if(hit&&hit.distance<((spot.holeDepthMm??6)-1.3)*.01)occluded.push(t.label+':'+hit.object.name+'@'+(hit.distance*100).toFixed(2))
 }
 check(!misaligned.length,type+': CAD cavity axes and live electrical endpoints share the physical frame '+misaligned.join(','))
 check(!occluded.length,type+': terminal rays enter a finite unobstructed cavity '+occluded.join(','))
 if(type==='pilotLightSchneiderIil3p'){
  const second=fitComponentModel(cloneModelScene(scene),spec,.01,'center');applySchneiderModularState(fitted,type,{l1On:true,l2On:false,l3On:true});applySchneiderModularState(second,type,{l1On:false,l2On:true,l3On:false})
  const lens=(r:THREE.Object3D,n:number)=>(r.getObjectByName('acti9_lens_'+n) as THREE.Mesh).material as THREE.MeshStandardMaterial
  check(size.x<.181&&lens(fitted,1).emissiveIntensity>0&&lens(second,1).emissiveIntensity===0&&lens(fitted,2)!==lens(second,2),'iIL3P stays 18 mm wide with independent optical channels and instances');disposeModelClone(second)
 }
 let sourceDisposed=0,instanceDisposed=0;scene.traverse(o=>{if((o as THREE.Mesh).isMesh)(o as THREE.Mesh).geometry.addEventListener('dispose',()=>sourceDisposed++)});clone.traverse(o=>{if((o as THREE.Mesh).isMesh)for(const m of Array.isArray((o as THREE.Mesh).material)?(o as THREE.Mesh).material as THREE.Material[]:[(o as THREE.Mesh).material as THREE.Material])m.addEventListener('dispose',()=>instanceDisposed++)})
 disposeModelClone(fitted);check(!sourceDisposed&&instanceDisposed>0,type+': unmount cleanup disposes owned materials without destroying cached geometry')
}
done('meter/Schneider geometry, electrical and ownership assertions')
