import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { cloneModelScene, disposeModelClone, fitComponentModel } from './modelFit'
import { getComponentModelSpec, PANEL_UNITS_PER_MM } from './modelPaths'
import { finishCadMaterial } from './catalogMaterials'
import { applyProtectionMarkings, protectionMarkingSignature } from './protectionMarkings'
import { applySchneiderRcdState, prepareSchneiderRcdModel, schneiderRcdAction, schneiderRcdActionPatch } from './schneiderRcdModel'

type Props = { c: ElectricalComponent; x: number; position?: [number, number, number]; interactive?: boolean }

/** A malha do STEP, e não um volume genérico com uma fotografia por cima. */
function SchneiderRcdCad({ c, x, position, interactive = true }: Props) {
  const spec = getComponentModelSpec(c.type)!
  const { scene } = useGLTF(spec.path)
  const model = useMemo(() => {
    const raw = cloneModelScene(scene)
    prepareSchneiderRcdModel(raw)
    raw.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => finishCadMaterial(material)) : finishCadMaterial(mesh.material)
    })
    return fitComponentModel(raw, spec, PANEL_UNITS_PER_MM, 'center')
  }, [scene, spec])
  const { invalidate, controls } = useThree()
  const orbitHold = useRef<{ orbit: { enabled: boolean }; enabled: boolean } | null>(null)
  // As inscrições nominais não dependem da manobra. Reconstruí-las em cada
  // down/up alocava de novo todas as placas CAD e a origem da letra T.
  useEffect(() => () => disposeModelClone(model), [model])
  const signature = protectionMarkingSignature(c.type, { ...c.state, closed: false, tripped: false })
  useEffect(() => {
    applyProtectionMarkings(model, c.type, { state: c.state, unitsPerMm: PANEL_UNITS_PER_MM, anchor: 'center', heightMm: spec.physicalSizeMm.height })
    invalidate()
  }, [model, c.type, signature, spec.physicalSizeMm.height, invalidate])
  useEffect(() => {
    applySchneiderRcdState(model, c.state)
    invalidate()
  }, [model, c.state.closed, c.state.tripped, c.state.testPressed, invalidate])

  const testHandled = useRef(false)
  const testHeld = useRef(false)
  const mayActuate = () => interactive && !c.locked && useSimStore.getState().tool === 'select'
  const actuate = (action: 'test' | 'toggle', pressed = false) => {
    const store = useSimStore.getState()
    if (store.sim.runState === 'stopped' && !store.demoMode) {
      store.selectComponents([c.id])
      return
    }
    const current = store.components.find((component) => component.id === c.id) ?? c
    const patch = schneiderRcdActionPatch(current, action)
    if (!patch) return
    store.setComponentState(c.id, { ...patch, testPressed: pressed })
    store.pushEvent(action === 'test' ? 'warning' : 'info', action === 'test'
      ? `${c.ref}: Disparo diferencial de ensaio (botão T).`
      : `${c.ref}: ${patch.closed ? 'Ligado (I.ON)' : 'Desligado (O.OFF)'}.`)
  }
  // O T tem mola: afunda enquanto é premido, regressa mesmo se o ponteiro
  // for largado fora do aparelho; o disparo elétrico mantém-se retido.
  useEffect(() => {
    const release = () => {
      if (orbitHold.current) {
        orbitHold.current.orbit.enabled = orbitHold.current.enabled
        orbitHold.current = null
      }
      if (!testHeld.current) return
      testHeld.current = false
      useSimStore.getState().setComponentState(c.id, { testPressed: false })
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', release)
      release()
    }
  }, [c.id])
  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!mayActuate() || event.button !== 0) return
    const action = schneiderRcdAction(event.object)
    if (!action) return // O corpo continua a permitir seleção/arrasto.
    event.stopPropagation()
    // stopPropagation do R3F não bloqueia o OrbitControls nativo: premir T e
    // largar fora do aparelho não deve rodar a câmara juntamente com a mola.
    const orbit = controls as unknown as { enabled: boolean } | null
    if (orbit && !orbitHold.current) {
      orbitHold.current = { orbit, enabled: orbit.enabled }
      orbit.enabled = false
    }
    if (action === 'test') {
      testHeld.current = testHandled.current = true
      actuate('test', true)
    }
  }
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (!mayActuate()) return
    const action = schneiderRcdAction(event.object)
    if (!action) return
    event.stopPropagation()
    if (action === 'test' && testHandled.current) { testHandled.current = false; return }
    actuate(action)
  }
  return <group position={position ?? [x, 0, 0]}><primitive dispose={null} object={model} onPointerDown={onPointerDown} onClick={onClick} /></group>
}

export function SchneiderRcd4P_3D(props: Props) {
  return <Suspense fallback={null}><SchneiderRcdCad {...props} /></Suspense>
}
export function SchneiderRcd1PN_3D(props: Props) {
  return <Suspense fallback={null}><SchneiderRcdCad {...props} /></Suspense>
}
