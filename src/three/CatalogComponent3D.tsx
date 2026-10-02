import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { builtinOriginType, useCatalogStore } from '../catalog/registry'
import { parseCatalogType, type TriggerName } from '../catalog/types'
import { interactionsFor, runInteractions } from '../catalog/interactions'
import { StateAnimator } from '../catalog/stateAnimator'
import { ComponentRig } from '../catalog/componentRig'
import { triggerControl, useCatalogMeter } from '../catalog/runtimeControls'
import { setBeep } from '../catalog/beep'
import { cloneModelScene } from './modelFit'
import { finishCadMaterial } from './catalogMaterials'
import { getComponentModelSpec, PANEL_UNITS_PER_MM } from './modelPaths'
import MultimeterDm20Panel from './MultimeterDm20Panel'
import MotorTerminalBoard3D from './MotorTerminalBoard3D'

/** Procura a peça (nome do nó = id da peça) a partir do objeto atingido. */
function partIdOf(object: THREE.Object3D | null, known: Set<string>): string {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (known.has(node.name)) return node.name
  return ''
}

/**
 * Componente do catálogo oficial no painel 3D: carrega o GLB assado, aplica estados/animações
 * (escritos pelo Admin) e executa as interações. O estado fica em `component.state.catalogState`.
 */
export default function CatalogComponent3D({ c, position, anchor, children }: {
  c: ElectricalComponent
  position: [number, number, number]
  anchor: 'bottom' | 'center'
  children?: (topY: number) => ReactNode
}) {
  const link = parseCatalogType(c.type)
  // Quando esta versão substitui um componente integrado, os extras desse
  // componente (LCD e botões do DM-20, placa de bornes Y/Δ do motor) continuam
  // a ser desenhados por cima do modelo publicado.
  const builtin = builtinOriginType(c.type)
  const spec = getComponentModelSpec(c.type)!
  const { scene } = useGLTF(spec.path)
  const entries = useCatalogStore((s) => s.entries)
  const version = useMemo(() => entries.find((entry) => entry.id === link?.id)?.versions.find((item) => item.version === link?.version), [entries, link?.id, link?.version])
  const invalidate = useThree((state) => state.invalidate)
  const animator = useRef<StateAnimator | null>(null)
  const rig = useRef<ComponentRig | null>(null)
  const pressed = useRef<{ id: string; at: number } | null>(null)
  const timers = useRef<number[]>([])

  const origin = version?.runtime.originMm
  const { model, topY } = useMemo(() => {
    const object = cloneModelScene(scene)
    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => finishCadMaterial(material, { envMapIntensity: 1.1 })) : finishCadMaterial(mesh.material, { envMapIntensity: 1.1 })
      mesh.castShadow = mesh.receiveShadow = true
    })
    object.scale.setScalar(PANEL_UNITS_PER_MM)
    object.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(object, true)
    const height = box.max.y - box.min.y
    const cx = origin ? origin[0] * PANEL_UNITS_PER_MM : (box.min.x + box.max.x) / 2
    const cz = origin ? origin[2] * PANEL_UNITS_PER_MM : (box.min.z + box.max.z) / 2
    object.position.set(-cx, anchor === 'bottom' ? -box.min.y : -box.min.y - height / 2, -cz)
    return { model: object, topY: anchor === 'bottom' ? height : height / 2 }
  }, [scene, origin, anchor])

  const { vars, reading } = useCatalogMeter(c, version?.definition)
  const runState = useSimStore((s) => s.sim.runState)
  const scanCount = useSimStore((s) => s.sim.scanCount)
  const diagnostics = useSimStore((s) => s.sim.diagnostics)
  const systemVars = useMemo(() => ({
    '$powered': c.state?.powered !== false,
    '$run': runState === 'running' && !diagnostics.some((item) => item.level === 'error'),
    '$stop': runState === 'stopped', '$pause': runState === 'paused',
    '$error': diagnostics.some((item) => item.level === 'error') || !!c.state?.tripped,
    '$warning': diagnostics.some((item) => item.level === 'warning'),
    '$communication': runState === 'running' && scanCount % 6 < 2,
    '$tripped': !!c.state?.tripped,
  }), [c.state?.powered, c.state?.tripped, runState, scanCount, diagnostics])
  const displayVars = useMemo(() => ({ ...vars, ...systemVars, ...Object.fromEntries(Object.entries((c.state?.catalogColors as Record<string, string> | undefined) ?? {}).map(([id, color]) => [`color.${id}`, color])) }), [vars, systemVars, c.state?.catalogColors])
  useEffect(() => {
    if (!version) { animator.current = null; rig.current = null; return }
    animator.current = new StateAnimator(version.definition, model, c.state?.catalogState ?? version.definition.initialState)
    rig.current = new ComponentRig(version.definition, model, animator.current)
    rig.current.setVars(displayVars, reading, version.definition.states.find((item) => item.id === (c.state?.catalogState ?? version.definition.initialState))?.name ?? '')
    rig.current.snap()
    invalidate()
    return () => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current = []; rig.current?.dispose(); rig.current = null }
  }, [version, model])
  useEffect(() => { rig.current?.setVars(displayVars, reading); invalidate() }, [displayVars, reading])
  useEffect(() => { setBeep(!!reading?.beep); return () => setBeep(false) }, [reading?.beep])

  const stateId = String(c.state?.catalogState ?? version?.definition.initialState ?? '')
  useEffect(() => { animator.current?.setState(stateId); invalidate() }, [stateId])
  useFrame((_, delta) => { const a = animator.current?.update(Math.min(delta, 0.1)); const b = rig.current?.update(Math.min(delta, 0.1)); if (a || b) invalidate() })

  const known = useMemo(() => new Set(version?.definition.parts.map((part) => part.id) ?? []), [version])
  /** Botões/seletores do modelo: premir (visual), largar (ação) e rodar o seletor. */
  const controlDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.intersections[0]?.object !== event.object) return false
    const id = rig.current?.controlFromHits(event.intersections, 3 * PANEL_UNITS_PER_MM)
    const control = id ? rig.current?.controlById(id) : undefined
    if (!id || !control || !version) return false
    event.stopPropagation()
    if (control.kind === 'selector') { triggerControl(version.definition, c.id, control, { step: event.shiftKey ? -1 : 1 }); return true }
    pressed.current = { id, at: performance.now() }
    rig.current?.hold(id, true); invalidate()
    const release = () => {
      window.removeEventListener('pointerup', release)
      const press = pressed.current
      pressed.current = null
      rig.current?.hold(id, false); invalidate()
      if (press) triggerControl(version.definition, c.id, control, performance.now() - press.at >= 600 ? 'long' : 'press')
    }
    window.addEventListener('pointerup', release)
    return true
  }
  const fire = (event: ThreeEvent<MouseEvent | PointerEvent>, trigger: TriggerName) => {
    if (!version) return
    if (trigger !== 'pressDown' && rig.current?.controlFromHits(event.intersections, 3 * PANEL_UNITS_PER_MM)) return
    const interactions = interactionsFor(version.definition, trigger, partIdOf(event.object, known))
    if (!interactions.length) return
    const store = useSimStore.getState()
    const live = store.components.find((item) => item.id === c.id)
    const result = runInteractions(interactions, String(live?.state?.catalogState ?? version.definition.initialState))
    if (result.changed) store.setComponentState(c.id, { catalogState: result.state })
    for (const action of result.delayed) {
      timers.current.push(window.setTimeout(() => useSimStore.getState().setComponentState(c.id, { catalogState: action.state }), Math.max(0, action.afterMs)))
    }
  }

  return <group
    position={position}
    onClick={(event) => fire(event, 'click')}
    onDoubleClick={(event) => fire(event, 'doubleClick')}
    onPointerDown={(event) => { if (!controlDown(event)) fire(event, 'pressDown') }}
    onPointerUp={(event) => fire(event, 'pressUp')}
  >
    <primitive object={model} />
    {builtin === 'multimeterDm20' && <MultimeterDm20Panel component={c} model={model} />}
    {builtin === 'motor3ph' && <MotorTerminalBoard3D c={c} position={[0, topY * 0.82, 0.08]} />}
    {children?.(topY)}
  </group>
}
