import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { industrialControlPatch, industrialDeviceTypeOf, type IndustrialControl } from '../electrical/industrialDevices'
import { getComponentModelSpec, PANEL_UNITS_PER_MM } from './modelPaths'
import { cloneModelScene, disposeModelClone, fitComponentModel } from './modelFit'
import { applyIndustrialState, applyIndustrialTextures, industrialAction, prepareIndustrialModel, releaseIndustrialLcd } from './industrialFinish'
import { mergeStaticMeshes } from './staticMerge'
import { isInControlModel, useControlWheel } from './useControlWheel'

type Props={c:ElectricalComponent;x:number;position?:[number,number,number];interactive?:boolean}

function IndustrialCad({c,x,position,interactive=true}:Props){
  const type=industrialDeviceTypeOf(c)!,spec=getComponentModelSpec(c.type)!
  const {scene}=useGLTF(spec.path)
  const model=useMemo(()=>{
    const raw=cloneModelScene(scene);prepareIndustrialModel(raw,type)
    const fitted=fitComponentModel(raw,spec,PANEL_UNITS_PER_MM,'center')
    mergeStaticMeshes(fitted)
    return fitted
  },[scene,spec,type])
  const {invalidate,controls}=useThree()
  const held=useRef(false),orbit=useRef<{target:{enabled:boolean};enabled:boolean}|null>(null)
  useEffect(()=>{
    let active=true
    applyIndustrialTextures(model,type,()=>!active).then(()=>{if(active)invalidate()}).catch(error=>console.error(`Impressos locais ${type}:`,error))
    return()=>{active=false;releaseIndustrialLcd(model);disposeModelClone(model)}
  },[model,type,invalidate])
  // Electrical scans mutate state in place; its object identity is not a
  // render clock. Subscribe to the published scan tick as the other live UIs do.
  const simTick=useSimStore(s=>s.simTick)
  useEffect(()=>{applyIndustrialState(model,type,c.state);invalidate()},[model,type,c.state,simTick,invalidate])
  const mayActuate=()=>interactive&&!c.locked&&useSimStore.getState().tool==='select'
  const act=(control:IndustrialControl,step:1|-1=1)=>{
    if(!mayActuate())return
    const store=useSimStore.getState(),live=store.components.find(n=>n.id===c.id)
    if(!live)return
    const patch=industrialControlPatch(type,live.state,control,step)
    if(Object.keys(patch).length)store.setComponentState(c.id,patch)
  }
  useEffect(()=>{
    const release=()=>{
      if(orbit.current){orbit.current.target.enabled=orbit.current.enabled;orbit.current=null}
      if(held.current){held.current=false;const store=useSimStore.getState();if(store.components.some(n=>n.id===c.id))store.setComponentState(c.id,{testPressed:false})}
    }
    window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);window.addEventListener('blur',release)
    return()=>{window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);window.removeEventListener('blur',release);release()}
  },[c.id])
  const down=(event:ThreeEvent<PointerEvent>)=>{
    if(!mayActuate()||event.button!==0)return
    const action=industrialAction(event.object);if(!action)return
    event.stopPropagation()
    const target=controls as unknown as {enabled:boolean}|null
    if(target&&!orbit.current){orbit.current={target,enabled:target.enabled};target.enabled=false}
    if(action==='test'){held.current=true;useSimStore.getState().setComponentState(c.id,{testPressed:true})}
  }
  const click=(event:ThreeEvent<MouseEvent>)=>{
    if(!mayActuate())return
    const action=industrialAction(event.object);if(!action)return
    event.stopPropagation();if(action!=='test')act(action as IndustrialControl,event.shiftKey?-1:1)
  }
  useControlWheel((hits,step)=>{
    if(!mayActuate()||!hits[0]||!isInControlModel(hits[0].object,model))return false
    const action=industrialAction(hits[0].object)
    if(!action||!['enter','range','fraction','function'].includes(action))return false
    act(action==='enter'?'encoder':action as IndustrialControl,step)
    return true
  })
  return <group position={position??[x,0,0]}><primitive dispose={null} object={model} onPointerDown={down} onClick={click}/></group>
}
export function IndustrialDevice3D(props:Props){return <Suspense fallback={null}><IndustrialCad {...props}/></Suspense>}
