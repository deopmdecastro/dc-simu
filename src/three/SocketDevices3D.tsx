import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { isSocketDevice } from '../electrical/socketDevices'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { applySocketDeviceState, createSocketDeviceObject, disposeSocketDeviceObject } from './socketDeviceModel'

export function SocketDevice3D({c,position,interactive=true}:{c:ElectricalComponent;position:[number,number,number];interactive?:boolean}) {
  const wires=useSimStore(s=>s.wires),invalidate=useThree(s=>s.invalidate)
  const object=useMemo(()=>{if(!isSocketDevice(c.type))throw new Error('Tipo de tomada inválido');return createSocketDeviceObject(c.type)},[c.type])
  const connected=useMemo(()=>{const ids=new Set(c.terminals.map(t=>t.id));return wires.some(w=>ids.has(w.fromTerminalId)||ids.has(w.toTerminalId))},[c.terminals,wires])
  useLayoutEffect(()=>{applySocketDeviceState(object,c.state,connected);invalidate()},[object,c.state,connected,invalidate])
  useEffect(()=>()=>disposeSocketDeviceObject(object),[object])
  const click=(e:ThreeEvent<MouseEvent>)=>{
    let action:string|undefined
    for(let p:typeof e.object|null=e.object;p;p=p.parent){if(p.userData.socketAction){action=p.userData.socketAction;break}}
    if(!action||!interactive)return
    e.stopPropagation()
    const store=useSimStore.getState()
    if(action==='socket-isolator')store.operateComponent(c.id,{switchOn:c.state.switchOn===false})
    else {
      const key=action==='socket-cover-blue'?'blueCoverOpen':action==='socket-cover-red'?'redCoverOpen':'coverOpen'
      store.setComponentState(c.id,{[key]:!(c.state[key]??c.state.coverOpen)})
    }
  }
  // Ficha CEE: duplo clique tira/encaixa a ficha (também no inspetor). Clique simples continua a selecionar.
  const dbl=(e:ThreeEvent<MouseEvent>)=>{
    if(c.type!=='ceePlug16A'||useSimStore.getState().demoMode)return
    e.stopPropagation()
    useSimStore.getState().togglePlug(c.id)
  }
  return <group position={position} scale={PANEL_UNITS_PER_MM} onClick={click} onDoubleClick={dbl}><primitive object={object}/></group>
}