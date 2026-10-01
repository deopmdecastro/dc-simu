import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { buildDefinitionObject } from '../../catalog/definition'
import { StateAnimator } from '../../catalog/stateAnimator'
import { interactionsFor, runInteractions } from '../../catalog/interactions'
import type { Vec3 } from '../../catalog/types'
import { BASE_STATE, glbCache, newTerminal, posePart, patchTerminal, useEditorStore } from './editorStore'

const DEG = 180 / Math.PI
let lastDragEnd = 0
const r2 = (value: number) => Math.round(value * 100) / 100

function partIdOf(object: THREE.Object3D | null, known: Set<string>): string {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (known.has(node.name)) return node.name
  return ''
}

/** Seta/haste do borne ao longo da normal (mostra por onde o cabo sai). */
function TerminalMarker({ id, selected, hidden, onRef }: { id: string; selected: boolean; hidden: boolean; onRef?: (object: THREE.Group | null) => void }) {
  const terminal = useEditorStore((s) => s.def.terminals.find((item) => item.id === id))
  const select = useEditorStore((s) => s.select)
  const showLabel = useEditorStore((s) => s.view.terminals)
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...(terminal?.normal ?? [0, 0, 1])).normalize()), [terminal?.normal])
  if (!terminal) return null
  const radius = selected ? 2.4 : 1.8
  return <group ref={onRef} position={terminal.position} visible={!hidden}>
    <mesh onClick={(event) => { event.stopPropagation(); select({ kind: 'terminal', id }) }} renderOrder={5}>
      <sphereGeometry args={[radius, 16, 12]} />
      <meshBasicMaterial color={selected ? '#2655e5' : terminal.color} depthTest={false} transparent opacity={0.95} />
    </mesh>
    <mesh position={new THREE.Vector3(0, 4, 0).applyQuaternion(quaternion)} quaternion={quaternion} renderOrder={4}>
      <cylinderGeometry args={[0.35, 0.35, 8, 6]} />
      <meshBasicMaterial color={selected ? '#2655e5' : '#475569'} depthTest={false} transparent opacity={0.8} />
    </mesh>
    {showLabel && <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }} position={new THREE.Vector3(...terminal.normal).multiplyScalar(6.5)}>
      <span className={`ce-term-tag${selected ? ' is-on' : ''}`}>{terminal.label}</span>
    </Html>}
  </group>
}

function Scene() {
  const def = useEditorStore((s) => s.def)
  const mode = useEditorStore((s) => s.mode)
  const editState = useEditorStore((s) => s.editState)
  const previewState = useEditorStore((s) => s.previewState)
  const selection = useEditorStore((s) => s.selection)
  const tool = useEditorStore((s) => s.tool)
  const snap = useEditorStore((s) => s.snap)
  const placing = useEditorStore((s) => s.placing)
  const view = useEditorStore((s) => s.view)
  const viewCommand = useEditorStore((s) => s.viewCommand)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const { invalidate, camera, controls } = useThree()
  const animator = useRef<StateAnimator | null>(null)
  const timers = useRef<number[]>([])
  const [hover, setHover] = useState<{ point: THREE.Vector3; normal: THREE.Vector3 } | null>(null)
  const [markerObject, setMarkerObject] = useState<THREE.Group | null>(null)

  const root = useMemo(() => buildDefinitionObject(def, glbCache), [def.parts, def.materials, def.assets, glbRevision])
  const known = useMemo(() => new Set(def.parts.map((part) => part.id)), [def.parts])
  useEffect(() => () => {
    root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const owner = def.parts.find((part) => part.id === partIdOf(node, known))
      if (owner && owner.kind !== 'glb') mesh.geometry.dispose()
      ;(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose())
    })
  }, [root])

  const activeState = mode === 'simulate' ? previewState : editState
  useEffect(() => {
    animator.current = new StateAnimator(def, root, activeState)
    invalidate()
  }, [root, def.states, def.lights, def.initialState])
  useEffect(() => {
    animator.current?.setState(activeState, mode === 'edit')
    invalidate()
  }, [activeState, mode, root])
  useFrame((_, delta) => { if (animator.current?.update(Math.min(delta, 0.1))) invalidate() })
  useEffect(() => { invalidate() }, [def, selection, view, mode, tool, hover, placing])
  useEffect(() => () => { timers.current.forEach((id) => window.clearTimeout(id)) }, [])

  // enquadramentos de câmara
  useEffect(() => {
    if (!viewCommand.n) return
    const box = new THREE.Box3().setFromObject(root)
    if (box.isEmpty()) box.set(new THREE.Vector3(-30, 0, -30), new THREE.Vector3(30, 60, 30))
    const center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(60, box.getSize(new THREE.Vector3()).length() * 3)
    const dir = {
      front: [0, 0.05, 1], back: [0, 0.05, -1], left: [-1, 0.05, 0], right: [1, 0.05, 0], top: [0, 1, 0.001], iso: [0.8, 0.6, 1], fit: [0.8, 0.6, 1],
    }[viewCommand.kind]
    const vector = new THREE.Vector3(...dir).normalize().multiplyScalar(radius).add(center)
    camera.position.copy(vector)
    camera.lookAt(center)
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (orbit) { orbit.target.copy(center); orbit.update() }
    invalidate()
  }, [viewCommand])

  const selectedPart = selection?.kind === 'part' ? def.parts.find((part) => part.id === selection.id) : undefined
  const selectedNode = selectedPart ? root.getObjectByName(selectedPart.id) ?? null : null
  const highlightPart = selection?.kind === 'part' ? selection.id : selection?.kind === 'light' ? def.lights.find((light) => light.id === selection.id)?.partId : undefined
  const highlightNode = highlightPart ? root.getObjectByName(highlightPart) ?? null : null
  const helper = useMemo(() => (highlightNode ? new THREE.BoxHelper(highlightNode, '#2655e5') : null), [highlightNode, root])
  useFrame(() => { helper?.update() })

  const gizmoEnabled = mode === 'edit' && !placing
  const partGizmo = gizmoEnabled && selectedPart && !selectedPart.locked && selectedNode
  const selectedTerminal = selection?.kind === 'terminal' ? def.terminals.find((terminal) => terminal.id === selection.id) : undefined
  const terminalGizmo = gizmoEnabled && selectedTerminal && markerObject

  const onModelClick = (event: ThreeEvent<MouseEvent>) => {
    if (performance.now() - lastDragEnd < 250) return
    event.stopPropagation()
    if (mode === 'simulate') {
      const hit = partIdOf(event.object, known)
      const result = runInteractions(interactionsFor(def, 'click', hit), previewState)
      useEditorStore.getState().set({ previewState: result.state })
      result.delayed.forEach((action) => timers.current.push(window.setTimeout(() => useEditorStore.getState().set({ previewState: action.state }), action.afterMs)))
      return
    }
    if (placing && event.face) {
      const normal = event.face.normal.clone().transformDirection(event.object.matrixWorld)
      const terminal = newTerminal(def, event.point.toArray() as Vec3, normal.toArray() as Vec3)
      useEditorStore.getState().edit((current) => ({ ...current, terminals: [...current.terminals, terminal] }))
      useEditorStore.getState().set({ selection: { kind: 'terminal', id: terminal.id }, tab: 'terminals' })
      return
    }
    const hit = partIdOf(event.object, known)
    if (hit) useEditorStore.getState().set({ selection: { kind: 'part', id: hit }, tab: 'object' })
  }

  const commitPart = () => {
    if (!selectedPart || !selectedNode) return
    lastDragEnd = performance.now()
    const state = useEditorStore.getState()
    const position = selectedNode.position.toArray().map(r2) as Vec3
    const rotation = [selectedNode.rotation.x * DEG, selectedNode.rotation.y * DEG, selectedNode.rotation.z * DEG].map(r2) as Vec3
    const scale = selectedNode.scale.toArray().map((value) => Math.max(0.01, r2(value))) as Vec3
    const primitive = !['group', 'glb'].includes(selectedPart.kind)
    if (tool === 'scale' && primitive && state.editState === BASE_STATE) {
      // em primitivas a escala converte-se em dimensões reais (mm) — o "scale" fica a 1
      const size = selectedPart.size.map((value, index) => Math.max(0.1, r2(value * scale[index]))) as Vec3
      state.edit((def) => ({ ...def, parts: def.parts.map((part) => (part.id === selectedPart.id ? { ...part, position, rotation, size, scale: [1, 1, 1] as Vec3 } : part)) }))
    } else state.edit((def) => posePart(def, state.editState, selectedPart.id, { position, rotation, scale }))
  }
  const commitTerminal = () => {
    if (!selectedTerminal || !markerObject) return
    lastDragEnd = performance.now()
    const position = markerObject.position.toArray().map((value) => Math.round(value * 10) / 10) as Vec3
    useEditorStore.getState().edit((current) => patchTerminal(current, selectedTerminal.id, { position }))
  }

  return <>
    <color attach="background" args={[view.dark ? '#111827' : '#e9eef6']} />
    <hemisphereLight args={['#ffffff', view.dark ? '#1f2937' : '#9aa7ba', 0.9]} />
    <directionalLight position={[160, 260, 200]} intensity={1.4} castShadow shadow-bias={-0.0004} shadow-normalBias={0.6} shadow-mapSize={[1024, 1024]} shadow-camera-left={-220} shadow-camera-right={220} shadow-camera-top={220} shadow-camera-bottom={-220} shadow-camera-near={10} shadow-camera-far={900} />
    <directionalLight position={[-180, 120, -160]} intensity={0.5} />
    {view.grid && <gridHelper args={[400, 40, view.dark ? '#475569' : '#94a3b8', view.dark ? '#273244' : '#cbd5e1']} position={[0, -0.05, 0]} />}
    {view.axes && <axesHelper args={[30]} position={[-200, 0, 200]} />}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow><planeGeometry args={[800, 800]} /><shadowMaterial opacity={0.18} /></mesh>

    <primitive
      object={root}
      onClick={onModelClick}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => {
        if (!placing || !event.face) { if (hover) setHover(null); return }
        const normal = event.face.normal.clone().transformDirection(event.object.matrixWorld)
        setHover({ point: event.point.clone(), normal })
      }}
      onPointerOut={() => hover && setHover(null)}
    />
    {helper && mode === 'edit' && <primitive object={helper} />}
    {view.bounds && <BoundsBox root={root} />}

    {def.terminals.map((terminal) => <TerminalMarker key={terminal.id} id={terminal.id} selected={selection?.kind === 'terminal' && selection.id === terminal.id}
      hidden={false} onRef={selection?.kind === 'terminal' && selection.id === terminal.id ? setMarkerObject : undefined} />)}
    {placing && hover && <mesh position={hover.point}><sphereGeometry args={[2, 12, 10]} /><meshBasicMaterial color="#16a34a" depthTest={false} transparent opacity={0.85} /></mesh>}

    {partGizmo && selectedNode && <TransformControls object={selectedNode} mode={tool} space="local" size={0.8}
      translationSnap={snap.on ? snap.mm : null} rotationSnap={snap.on ? snap.deg / DEG : null} scaleSnap={snap.on ? 0.05 : null} onMouseUp={commitPart} />}
    {terminalGizmo && markerObject && <TransformControls object={markerObject} mode="translate" size={0.7} translationSnap={snap.on ? Math.min(snap.mm, 0.5) : null} onMouseUp={commitTerminal} />}
    <OrbitControls makeDefault enableDamping={false} maxDistance={1500} minDistance={20} />
  </>
}

function BoundsBox({ root }: { root: THREE.Object3D }) {
  const box = useMemo(() => new THREE.Box3Helper(new THREE.Box3().setFromObject(root), '#f59e0b'), [root])
  return <primitive object={box} />
}

export default function Viewport() {
  const select = useEditorStore((s) => s.select)
  return <Canvas frameloop="demand" shadows dpr={[1, 2]} camera={{ position: [150, 110, 190], fov: 35, near: 1, far: 4000 }}
    onPointerMissed={() => { if (performance.now() - lastDragEnd < 250) return; if (!useEditorStore.getState().placing && useEditorStore.getState().mode === 'edit') select(null) }}>
    <Scene />
  </Canvas>
}
