import assert from 'node:assert/strict'
import * as T from 'three'
import { createComponent, upgradeRealInterfacePositions } from '../src/electrical/factory'
import { computeContinuity, internalBridges } from '../src/electrical/engine'
import { SOCKET_DEVICES, type SocketDeviceType } from '../src/electrical/socketDevices'
import { createSocketDeviceObject, applySocketDeviceState, disposeSocketDeviceObject } from '../src/three/socketDeviceModel'
import { terminalLocal3D, terminalNormalWorld3D } from '../src/three/terminal3D'
import { hasProceduralCapture } from '../src/three/proceduralKinds'
import { useSimStore } from '../src/store/useSimStore'

let checks=0
const ok=(label:string,fn:()=>void)=>{fn();checks++;console.log('PASS — '+label)}
const visible=(o:T.Object3D)=>{for(let p:T.Object3D|null=o;p;p=p.parent)if(!p.visible)return false;return true}
for(const type of Object.keys(SOCKET_DEVICES) as SocketDeviceType[]){
  const c=createComponent(type),root=createSocketDeviceObject(type)
  applySocketDeviceState(root,{coverOpen:true})
  const meshes:T.Object3D[]=[];root.traverse(o=>{if((o as T.Mesh).isMesh && visible(o))meshes.push(o)})
  ok(type+': tampa de uso expõe contactos, sem expor a cablagem',()=>{
    assert.equal(root.getObjectByName('socket-wiring-compartment')!.visible,false)
    assert.ok(hasProceduralCapture(type),'a Biblioteca e o esquema capturam a geometria real')
  })
  const wells:T.Object3D[]=[];root.traverse(o=>{if(o.name==='schuko-well'||o.name==='cee-barrel')wells.push(o)})
  for(const well of wells)ok(type+': alvéolos são cavidades na malha '+well.name,()=>{
    const frame=well.parent!,ray=new T.Raycaster()
    const hole=well.name==='schuko-well'?[-9.5,0]:type==='socketFamatelSwitch'?[-9,6]:[-11,8]
    const sample=(x:number,y:number)=>{
      const origin=frame.localToWorld(new T.Vector3(x,y,150)),normal=new T.Vector3(0,0,-1).transformDirection(frame.matrixWorld)
      ray.set(origin,normal);const hit=ray.intersectObjects(meshes,false)[0];assert.ok(hit,'há fundo físico');return hit.distance
    }
    const depth=sample(hole[0],hole[1]),face=sample(5,8)
    assert.ok(depth>face+4,`o alvéolo é mais profundo do que a face circundante (${depth.toFixed(2)} vs ${face.toFixed(2)})`)
  })
  ok(type+': entrada e alvéolos têm continuidade sem curto entre L/N/PE',()=>{
    const t=(label:string)=>c.terminals.find(t=>t.label===label)!.id
    const outputs=type==='socketFamatelCombo'?['S.L','S.N','S.PE','CEE.L1','CEE.L2','CEE.L3','CEE.N','CEE.PE']:['OUT.L','OUT.N','OUT.PE']
    for(const out of outputs){
      const source=out.startsWith('S.')?(out==='S.L'?'L1':out.split('.')[1]):out.startsWith('CEE.')?out.slice(4):out.slice(4)
      const reached=computeContinuity([c],[],[t(source)]).energizedTerminals
      assert.ok(reached.has(t(out)),out+' ligado ao seu polo')
      assert.ok(!reached.has(t(source==='PE'?'N':'PE')),'PE isolado dos polos ativos')
    }
  })
  ok(type+': bornes de serviço alinhados e IDs legados preservados',()=>{
    applySocketDeviceState(root,{serviceOpen:true})
    for(const t of c.terminals.filter(t=>!t.label.includes('.'))){
      const point=root.getObjectByName('socket-terminal-'+t.label)!.getWorldPosition(new T.Vector3())
      assert.ok(point.distanceTo(terminalLocal3D(c,t).multiplyScalar(100))<.01)
    }
    // A malha é a referência independente, incluindo os clips PE (não são furos).
    for(const t of c.terminals.filter(t=>t.label.includes('.'))){
      const schuko=t.label.startsWith('S.')||type==='socketEfapelIp65'
      let well:T.Object3D|undefined
      root.traverse(o=>{if(o.name===(schuko?'schuko-well':'cee-barrel'))well=o})
      assert.ok(well)
      let physical:T.Vector3
      if(schuko&&t.label.endsWith('.PE'))physical=well.parent!.getObjectByName('schuko-earth-1')!.getWorldPosition(new T.Vector3())
      else{
        const index=t.label.endsWith('.L')||t.label.endsWith('.L1')?0:t.label.endsWith('.N')?(schuko||type==='socketFamatelSwitch'?1:3):t.label.endsWith('.L2')?1:t.label.endsWith('.L3')||type==='socketFamatelSwitch'?2:4
        const sleeve=well.parent!.getObjectByName('socket-contact-'+index)!
        const normal=new T.Vector3(0,0,1).transformDirection(well.parent!.matrixWorld)
        physical=sleeve.getWorldPosition(new T.Vector3()).addScaledVector(normal,5)
      }
      assert.ok(physical.distanceTo(terminalLocal3D(c,t).multiplyScalar(100))<.01,t.label+' alinhado com o contacto modelado')
    }
    const legacy={...c,terminals:c.terminals.filter(t=>!t.label.includes('.')).map(t=>({...t,position3D:{x:.5,y:.2,z:.6}})),state:{...c.state,socketGeometryRevision:1}}
    const updated=upgradeRealInterfacePositions(legacy)
    for(const t of legacy.terminals)assert.equal(updated.terminals.find(n=>n.label===t.label)!.id,t.id)
    assert.equal(updated.terminals.length,c.terminals.length)
    assert.deepEqual(upgradeRealInterfacePositions(updated),updated,'migração idempotente')
    assert.equal(new Set(updated.terminals.map(t=>t.id)).size,updated.terminals.length)
    const manual={...legacy,terminals:legacy.terminals.map((t,i)=>i===0?{...t,position3D:{x:.33,y:.44,z:.55}}:t)}
    assert.deepEqual(upgradeRealInterfacePositions(manual).terminals[0].position3D,{x:.33,y:.44,z:.55},'não apaga um borne ajustado à mão')
    for(const t of c.terminals.filter(t=>t.label.startsWith('CEE.'))){
      assert.ok(terminalNormalWorld3D(c,t).distanceTo(new T.Vector3(0,-Math.sin(Math.PI/18),Math.cos(Math.PI/18)))<1e-6,'saída segue a base inclinada 10°')
    }
  })
  if(type==='socketFamatelCombo')ok('FAMATEL: tampas independentes',()=>{
    applySocketDeviceState(root,{blueCoverOpen:true,redCoverOpen:false})
    assert.notEqual(root.getObjectByName('socket-cover-blue')!.rotation.x,0)
    assert.equal(root.getObjectByName('socket-cover-red')!.rotation.x,0)
  })
  disposeSocketDeviceObject(root)
}
ok('RoadEu: seccionador corta L/N e mantém PE; manobra bloqueada em STOP',()=>{
  const c=createComponent('socketFamatelSwitch'),t=(label:string)=>c.terminals.find(t=>t.label===label)!.id
  c.state.switchOn=false
  const bridges=internalBridges(c)
  assert.equal(bridges.length,1)
  assert.deepEqual(bridges[0],[t('PE'),t('OUT.PE')])
  const store=useSimStore.getState();store.newProject('all');useSimStore.setState({components:[c]})
  useSimStore.getState().operateComponent(c.id,{switchOn:true})
  assert.equal(useSimStore.getState().components[0].state.switchOn,false)
  useSimStore.setState({sim:{...useSimStore.getState().sim,runState:'paused'}})
  useSimStore.getState().operateComponent(c.id,{switchOn:true})
  assert.equal(internalBridges(useSimStore.getState().components[0]).length,3)
  const saved=useSimStore.getState().saveJSON();useSimStore.getState().newProject('all');useSimStore.getState().loadJSON(saved)
  assert.equal(useSimStore.getState().components[0].state.switchOn,true)
})
console.log(`${checks} verificações das tomadas passaram`)
