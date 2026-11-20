import { Suspense, useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { getComponentModelSpec, PANEL_UNITS_PER_MM } from './modelPaths'
import { cloneModelScene, disposeModelClone, fitComponentModel } from './modelFit'
import { finishCadMaterial } from './catalogMaterials'
import { applyProtectionMarkings, protectionMarkingSignature } from './protectionMarkings'
import { applySchneiderModularState, prepareSchneiderModular, schneiderModularAction, type SchneiderModularType } from './schneiderModularModel'

type Props = { c: ElectricalComponent; x: number; position?: [number, number, number]; interactive?: boolean }

/** Shared actual STEP geometry for Panel/Admin/covers, not a 54 mm generic iIL. */
function SchneiderModularCad({ c, x, position, interactive = true }: Props) {
  const type = c.type as SchneiderModularType, spec = getComponentModelSpec(c.type)!
  const { scene } = useGLTF(spec.path), { invalidate } = useThree()
  const model = useMemo(() => {
    const raw = cloneModelScene(scene)
    prepareSchneiderModular(raw)
    raw.traverse(node => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => finishCadMaterial(m)) : finishCadMaterial(mesh.material)
      mesh.castShadow = mesh.receiveShadow = true
    })
    return fitComponentModel(raw, spec, PANEL_UNITS_PER_MM, 'center')
  }, [scene, spec])
  useEffect(() => () => disposeModelClone(model), [model])
  const signature = protectionMarkingSignature(c.type, { ...c.state, closed: false, tripped: false })
  useEffect(() => {
    applyProtectionMarkings(model, c.type, { state: c.state, unitsPerMm: PANEL_UNITS_PER_MM, anchor: 'center', heightMm: spec.physicalSizeMm.height })
    invalidate()
  }, [model, type, signature, spec.physicalSizeMm.height, invalidate])
  const simTick = useSimStore(s => s.simTick)
  useEffect(() => { applySchneiderModularState(model, type, c.state); invalidate() }, [model, type, c.state, simTick, invalidate])
  const toggle = (event: ThreeEvent<MouseEvent>) => {
    const store = useSimStore.getState()
    if (!interactive || c.locked || store.tool !== 'select' || !schneiderModularAction(event.object)) return
    event.stopPropagation()
    const current = store.components.find(item => item.id === c.id) ?? c
    store.operateComponent(c.id, { closed: current.state.tripped ? true : !current.state.closed, tripped: false, tripReason: '' })
  }
  return <group position={position ?? [x,0,0]}><primitive dispose={null} object={model} onClick={toggle} /></group>
}
export function SchneiderBreaker1P_3D(props: Props) { return <Suspense fallback={null}><SchneiderModularCad {...props} /></Suspense> }
export function SchneiderPilotLight1P_3D(props: Props) { return <Suspense fallback={null}><SchneiderModularCad {...props} /></Suspense> }
export function SchneiderPilotLight3P_3D(props: Props) { return <Suspense fallback={null}><SchneiderModularCad {...props} /></Suspense> }
export { SchneiderRcd4P_3D, SchneiderRcd1PN_3D } from './SchneiderRcd3D'
