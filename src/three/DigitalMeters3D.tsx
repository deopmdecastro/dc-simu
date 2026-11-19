import { useEffect, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { PANEL_UNITS_PER_MM as U } from './modelPaths'
import { fitComponentModel } from './modelFit'
import { applyDigitalMeterState, createDigitalMeterObject, digitalMeterSpec, releaseDigitalMeterDisplay, type DigitalMeterType } from './digitalMeterModel'

type DigitalMeterProps = { c: ElectricalComponent; x: number; position?: [number, number, number]; interactive?: boolean }

function DigitalMeter3D({ c, x, position, interactive = true }: DigitalMeterProps) {
  const type = c.type as DigitalMeterType
  const model = useMemo(() => fitComponentModel(createDigitalMeterObject(type), digitalMeterSpec(type), U, 'center'), [type])
  const { invalidate, controls } = useThree()
  const releaseHold = useRef<(() => void) | null>(null)
  useEffect(() => () => releaseHold.current?.(), [c.id, interactive, c.locked])
  const simTick = useSimStore(s => s.simTick)
  useEffect(() => { applyDigitalMeterState(model, type, c.state); invalidate() }, [model, type, c.state, simTick, invalidate])
  useEffect(() => () => {
    releaseDigitalMeterDisplay(model)
    model.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose()
    })
  }, [model])
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (!interactive || c.locked || useSimStore.getState().tool !== 'select') return
    const name = event.object.name
    if (!['digital_meter_reset', 'digital_meter_switch', 'digital_meter_menu','digital_meter_menu_1','digital_meter_menu_2'].includes(name)) return
    event.stopPropagation()
    const store = useSimStore.getState()
    if (store.sim.runState === 'stopped' && !store.demoMode) return
    if (name === 'digital_meter_reset') return // The manufacturer's RESET requires a 5 s hold, never a click.
    if (name === 'digital_meter_switch') store.setComponentState(c.id, { switchOn: c.state.switchOn === false })
    else store.setComponentState(c.id, { screenMode: (Number(c.state.screenMode ?? 0) + (name === 'digital_meter_menu_2' ? 2 : 1)) % 3 })
  }
  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!interactive || c.locked || event.button !== 0 || event.object.name !== 'digital_meter_reset' || useSimStore.getState().tool !== 'select') return
    event.stopPropagation()
    const store = useSimStore.getState()
    if (store.sim.runState === 'stopped' && !store.demoMode) return
    releaseHold.current?.()
    const orbit = controls as unknown as { enabled: boolean } | undefined, enabled = orbit?.enabled
    if (orbit) orbit.enabled = false
    const timer = window.setTimeout(() => {
      const live = store.components.find(item => item.id === c.id)
      if (!live || live.locked || !live.state.on || store.tool !== 'select') return
      store.setComponentState(c.id, { energy: 0 })
      store.pushEvent('info', `${c.ref}: RESET mantido 5 s · energia reposta a 0,00 kWh.`)
    }, 5000)
    const release = () => {
      if (releaseHold.current !== release) return
      releaseHold.current = null
      window.clearTimeout(timer)
      window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('blur', release)
      if (orbit && enabled !== undefined) orbit.enabled = enabled
    }
    releaseHold.current = release
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('blur', release)
  }
  return <group position={position ?? [x, 0, 0]}><primitive dispose={null} object={model} onPointerDown={onPointerDown} onClick={onClick} /></group>
}

export function MeterD522066_3D(props: DigitalMeterProps) { return <DigitalMeter3D {...props} /> }
export function MeterKws306_3D(props: DigitalMeterProps) { return <DigitalMeter3D {...props} /> }

export function CurrentTransformer3D(props:DigitalMeterProps){return <DigitalMeter3D {...props}/> }
