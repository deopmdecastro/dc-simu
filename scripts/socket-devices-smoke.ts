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
// A ficha CEE 16A (ceePlug16A) partilha o catálogo das tomadas mas não tem tampa de serviço nem
// alvéolos: tem verificações próprias no fim deste ficheiro.
for(const type of (Object.keys(SOCKET_DEVICES) as SocketDeviceType[]).filter(type=>type!=='ceePlug16A')){
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
ok('Ficha CEE 16A: pinos L/N/PE, bucim traseiro e bornes alinhados com a ligação dos cabos',()=>{
  const c=createComponent('ceePlug16A'),root=createSocketDeviceObject('ceePlug16A')
  root.updateMatrixWorld(true)
  assert.ok(hasProceduralCapture('ceePlug16A'),'a Biblioteca e o esquema capturam a geometria real')
  assert.deepEqual(c.terminals.map(t=>t.label).sort(),['L','N','PE'])
  for(const pin of ['pin-L','pin-N','pin-PE'])assert.ok(root.getObjectByName(pin),pin+' modelado')
  assert.ok(root.getObjectByName('auto-cable-gland'),'entrada do cabo revestido pelo bucim')
  for(const t of c.terminals){
    const point=root.getObjectByName('socket-terminal-'+t.label)!.getWorldPosition(new T.Vector3())
    assert.ok(point.distanceTo(terminalLocal3D(c,t).multiplyScalar(100))<.01,t.label+' alinhado com o ponto de ligação do cabo')
  }
  disposeSocketDeviceObject(root)
})
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

ok('Ficha CEE: desencaixar abre L/N/PE, recua a ficha ao longo do eixo, fecha a tampa e volta tudo ao sítio ao encaixar',()=>{
  const st=useSimStore.getState()
  st.newProject('all')
  const ac=createComponent('powerSource1ph','F0','Rede 230 V');ac.state.nominalV=230
  const sock=createComponent('socketFamatelSwitch','XS','Tomada');sock.state.blueCoverOpen=true
  const plug=createComponent('ceePlug16A','F1','Ficha')
  sock.panel3DPosition={x:0,y:5,z:0};plug.panel3DPosition={x:-0.47,y:4.97,z:0.805};plug.viewOrientation={x:0,y:180,z:0}
  const tidOf=(c:typeof ac,l:string)=>c.terminals.find(t=>t.label===l)!.id
  const W=(id:string,a:string,b:string,extra:Record<string,unknown>={})=>({id,fromTerminalId:a,toTerminalId:b,color:'black',gauge:'2.5mm²',kind:'power',flexibility:'flexible',route:'direct',bend:.5,energized:false,...extra}) as any
  const cord={ ...W('cord',tidOf(plug,'L'),tidOf(plug,'N')), waypoints3D:[{x:-0.47,y:4.97,z:1.32},{x:-0.47,y:2,z:1.4}] }
  const wires=[W('aL',tidOf(ac,'L'),tidOf(sock,'L')),W('aN',tidOf(ac,'N'),tidOf(sock,'N')),
    W('cL',tidOf(sock,'OUT.L'),tidOf(plug,'L'),{waypoints3D:[{x:-0.47,y:5.03,z:0.69}]}),W('cN',tidOf(sock,'OUT.N'),tidOf(plug,'N')),W('cPE',tidOf(sock,'OUT.PE'),tidOf(plug,'PE')),cord]
  useSimStore.setState({components:[ac,sock,plug],wires,demoMode:false})
  const live=()=>{const s=useSimStore.getState();return computeContinuity(s.components,s.wires,[tidOf(ac,'L')]).energizedTerminals.has(tidOf(plug,'L'))}
  assert.equal(live(),true,'ficha encaixada: borne L da ficha com tensão')
  useSimStore.getState().togglePlug(plug.id)
  let s=useSimStore.getState(),p=s.components.find(c=>c.id===plug.id)!
  assert.equal(p.state.plugged,false)
  assert.equal(live(),false,'ficha fora: o borne L da ficha fica sem tensão')
  // y=180 → −Z local da ficha = +Z do mundo: recua 90 mm para longe da tomada.
  assert.ok(Math.abs(p.panel3DPosition!.z-(0.805+0.9))<1e-6&&Math.abs(p.panel3DPosition!.x+0.47)<1e-6,'recua 90 mm no eixo da ficha')
  assert.equal(s.components.find(c=>c.id===sock.id)!.state.blueCoverOpen,false,'tampa da tomada fecha')
  const cordW=s.wires.find(w=>w.id==='cord')!
  assert.ok(Math.abs(cordW.waypoints3D![0].z-(1.32+0.9))<1e-6,'o cabo junto à ficha acompanha-a')
  assert.ok(Math.abs(cordW.waypoints3D![1].z-1.4)<1e-6,'o resto do cabo fica no sítio')
  useSimStore.getState().togglePlug(plug.id)
  s=useSimStore.getState();p=s.components.find(c=>c.id===plug.id)!
  assert.ok(p.state.plugged===true&&Math.abs(p.panel3DPosition!.z-0.805)<1e-6,'encaixar repõe a posição')
  assert.ok(Math.abs(s.wires.find(w=>w.id==='cord')!.waypoints3D![0].z-1.32)<1e-6,'e o cabo volta ao sítio')
  assert.equal(live(),true,'ficha encaixada de novo: volta a ter tensão')
  assert.equal(s.components.find(c=>c.id===sock.id)!.state.blueCoverOpen,true,'tampa abre para a ficha')
})
console.log(`${checks} verificações das tomadas passaram`)
