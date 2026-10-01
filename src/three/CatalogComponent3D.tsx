import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { useCatalogStore } from '../catalog/registry'
import { parseCatalogType, type TriggerName } from '../catalog/types'
import { interactionsFor, runInteractions } from '../catalog/interactions'
import { StateAnimator } from '../catalog/stateAnimator'
import { cloneModelScene } from './modelFit'
import { getComponentModelSpec, PANEL_UNITS_PER_MM } from './modelPaths'

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
  const spec = getComponentModelSpec(c.type)!
  const { scene } = useGLTF(spec.path)
  const entries = useCatalogStore((s) => s.entries)
  const version = useMemo(() => entries.find((entry) => entry.id === link?.id)?.versions.find((item) => item.version === link?.version), [entries, link?.id, link?.version])
  const invalidate = useThree((state) => state.invalidate)
  const animator = useRef<StateAnimator | null>(null)
  const timers = useRef<number[]>([])

  const origin = version?.runtime.originMm
  const { model, topY } = useMemo(() => {
    const object = cloneModelScene(scene)
    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
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

  useEffect(() => {
    if (!version) { animator.current = null; return }
    animator.current = new StateAnimator(version.definition, model, c.state?.catalogState ?? version.definition.initialState)
    invalidate()
    return () => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current = [] }
  }, [version, model])

  const stateId = String(c.state?.catalogState ?? version?.definition.initialState ?? '')
  useEffect(() => { animator.current?.setState(stateId); invalidate() }, [stateId])
  useFrame((_, delta) => { if (animator.current?.update(Math.min(delta, 0.1))) invalidate() })

  const known = useMemo(() => new Set(version?.definition.parts.map((part) => part.id) ?? []), [version])
  const fire = (event: ThreeEvent<MouseEvent | PointerEvent>, trigger: TriggerName) => {
    if (!version) return
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
    onPointerDown={(event) => fire(event, 'pressDown')}
    onPointerUp={(event) => fire(event, 'pressUp')}
  >
    <primitive object={model} />
    {children?.(topY)}
  </group>
}
