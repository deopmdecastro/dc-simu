import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, TransformControls, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import { buildDefinitionObject } from '../../catalog/definition'
import { StateAnimator } from '../../catalog/stateAnimator'
import { interactionsFor, runInteractions } from '../../catalog/interactions'
import type { Vec3 } from '../../catalog/types'
import { checkConnection } from '../../catalog/terminalCompat'
import { FACE_NORMAL } from '../../catalog/terminalProfiles'
import { BASE_STATE, glbCache, posePart, patchTerminal, removeParts, useEditorStore } from './editorStore'
import { addTerminalAt, defBounds, faceCenter } from './terminalOps'
import { registerCapture, renderCapture } from './capture'
import { WireDrawController } from './WireDraw'
import TestWires from './WiresView'
import { wireModel } from './wirePath'
import { MeasureController } from './MeasureTool'
import { dragState } from './dragState'

const DEG = 180 / Math.PI
let lastDragEnd = 0
const dragRecent = () => performance.now() - lastDragEnd < 250 || performance.now() - dragState.endedAt < 250
const r2 = (value: number) => Math.round(value * 100) / 100

function partIdOf(object: THREE.Object3D | null, known: Set<string>): string {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (known.has(node.name)) return node.name
  return ''
}

/** Clique num borne, conforme a ferramenta ativa (usado pelo marcador e pelo clique no modelo). */
function terminalClick(id: string) {
  if (performance.now() - lastDragEnd < 250) return
  const state = useEditorStore.getState()
  if (state.placing) return // a colocar bornes: o clique pertence ao modelo, não aos bornes existentes
  if (state.ribbon === 'wire' || state.ribbon === 'measure') return // o desenho de cabos / a régua tratam o clique
  if (state.mode === 'simulate') { state.setRibbon('wire'); state.startWire({ terminalId: id }); return }
  if (state.ribbon === 'delete') { state.edit((def) => ({ ...def, terminals: def.terminals.filter((item) => item.id !== id) })); return }
  if (state.ribbon === 'pan') return
  state.select({ kind: 'terminal', id })
}

const WIRE_COLOR = { ok: '#16a34a', warn: '#f59e0b', error: '#dc2626' } as const
/** Seta/haste do borne ao longo da normal (mostra por onde o cabo sai). */
function TerminalMarker({ id, selected, hidden, onRef }: { id: string; selected: boolean; hidden: boolean; onRef?: (object: THREE.Group | null) => void }) {
  const terminal = useEditorStore((s) => s.def.terminals.find((item) => item.id === id))
  const showLabel = useEditorStore((s) => s.view.terminals)
  const pending = useEditorStore((s) => s.wireFrom === id)
  const origin = useEditorStore((s) => (s.wireFrom && s.wireFrom !== id ? s.def.terminals.find((item) => item.id === s.wireFrom) : undefined))
  const interactive = useEditorStore((s) => s.mode === 'simulate' || ['wire', 'delete', 'select'].includes(s.ribbon))
  const [hovered, setHovered] = useState(false)
  useCursor(hovered && interactive)
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...(terminal?.normal ?? [0, 0, 1])).normalize()), [terminal?.normal])
  if (!terminal || hidden) return null
  // com um cabo em curso, os restantes bornes mostram o veredicto de compatibilidade
  const verdict = origin ? checkConnection(origin, terminal).level : null
  const base = pending ? '#f59e0b' : verdict ? WIRE_COLOR[verdict] : selected ? '#2655e5' : terminal.color
  const radius = (selected ? 2.4 : 1.8) + (pending || hovered ? 0.8 : 0) + (verdict ? 0.4 : 0)
  const lift = new THREE.Vector3(...terminal.normal).multiplyScalar(1.6)
  return <group ref={onRef} position={terminal.position}>
    {/* zona de clique generosa e à frente da superfície: o modelo nunca "rouba" o clique ao borne */}
    <mesh position={lift} userData={{ terminalId: id }} renderOrder={6}
      onClick={(event) => { if (useEditorStore.getState().placing) return; event.stopPropagation(); terminalClick(id) }}
      onPointerOver={(event) => { if (useEditorStore.getState().placing) return; event.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}>
      <sphereGeometry args={[4.4, 12, 10]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
    </mesh>
    <mesh renderOrder={5} position={lift}>
      <sphereGeometry args={[radius, 16, 12]} />
      <meshBasicMaterial color={base} depthTest={false} transparent opacity={0.95} />
    </mesh>
    {(pending || verdict || hovered) && <mesh renderOrder={4} position={lift}>
      <ringGeometry args={[radius + 1, radius + 1.8, 28]} />
      <meshBasicMaterial color={base} depthTest={false} transparent opacity={0.55} side={THREE.DoubleSide} />
    </mesh>}
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
  const ribbon = useEditorStore((s) => s.ribbon)
  const snap = useEditorStore((s) => s.snap)
  const placing = useEditorStore((s) => s.placing)
  const view = useEditorStore((s) => s.view)
  const viewCommand = useEditorStore((s) => s.viewCommand)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const testWiresState = useEditorStore((s) => s.testWires)
  const wireFromState = useEditorStore((s) => s.wireFrom)
  const wirePointsState = useEditorStore((s) => s.wirePoints)
  const selectedWireState = useEditorStore((s) => s.selectedWire)
  const hiddenTerminals = useEditorStore((s) => s.hiddenTerminals)
  const measurementsState = useEditorStore((s) => s.measurements)
  const gizmoSpace = useEditorStore((s) => s.gizmoSpace)
  const { invalidate, camera, controls, gl } = useThree()
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

  // miniaturas por vista e capa: a UI pede imagens ao renderer/modelo atuais
  useEffect(() => {
    registerCapture((options) => renderCapture(gl, root, options), camera)
    return () => registerCapture(null)
  }, [gl, root, camera])

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
  useEffect(() => { invalidate() }, [def, selection, view, mode, tool, ribbon, hover, placing, testWiresState, wireFromState, wirePointsState, selectedWireState, hiddenTerminals, measurementsState])
  useEffect(() => () => { timers.current.forEach((id) => window.clearTimeout(id)) }, [])

  // enquadramento único para todas as vistas: a distância sai do tamanho real do modelo e do campo de visão,
  // por isso componentes pequenos (bornes) e grandes (quadros) ficam igualmente centrados e com a mesma navegação
  const modelBox = () => {
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root, true)
    if (box.isEmpty()) box.set(new THREE.Vector3(-30, 0, -30), new THREE.Vector3(30, 60, 30))
    return box
  }
  const applyLimits = (radius: number) => {
    const persp = camera as THREE.PerspectiveCamera
    persp.near = Math.max(0.05, radius * 0.01)
    persp.far = Math.max(4000, radius * 400)
    persp.updateProjectionMatrix()
    const orbit = controls as unknown as { minDistance: number; maxDistance: number } | null
    if (orbit) { orbit.minDistance = Math.max(2, radius * 0.12); orbit.maxDistance = Math.max(400, radius * 14) }
  }
  const frameBox = (box: THREE.Box3, direction: THREE.Vector3, padding: number) => {
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, 4)
    const persp = camera as THREE.PerspectiveCamera
    const vFov = (persp.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (persp.aspect || 1))
    const distance = (radius * padding) / Math.sin(Math.min(vFov, hFov) / 2)
    const modelRadius = Math.max(radius, modelBox().getBoundingSphere(new THREE.Sphere()).radius)
    applyLimits(modelRadius)
    camera.position.copy(sphere.center).addScaledVector(direction, distance)
    camera.lookAt(sphere.center)
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (orbit) { orbit.target.copy(sphere.center); orbit.update() }
    reportAngles(); invalidate()
  }
  // enquadra sozinho enquanto o utilizador não mexer na câmara: o GLB carrega depois de abrir o editor e muda o tamanho do modelo
  const autoFit = useRef(true)
  const entryId = useEditorStore((s) => s.entry?.id)
  useEffect(() => { autoFit.current = true }, [entryId])
  useEffect(() => {
    if (!autoFit.current || !controls) return
    frameBox(modelBox(), new THREE.Vector3(0.8, 0.6, 1).normalize(), 1.12)
  }, [glbRevision, controls, entryId])

  // enquadramentos de câmara (mesma convenção do Esquema 3D: yaw 0° = frente, pitch > 0 = por cima)
  useEffect(() => {
    if (!viewCommand.n) return
    if (viewCommand.kind !== 'fit') autoFit.current = false
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (viewCommand.kind === 'orbit' && orbit) {
      const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(orbit.target))
      spherical.theta -= ((viewCommand.dx ?? 0) * Math.PI) / 180 * 0.8
      spherical.phi = Math.max(0.02, Math.min(Math.PI - 0.02, spherical.phi - ((viewCommand.dy ?? 0) * Math.PI) / 180 * 0.8))
      camera.position.copy(orbit.target).add(new THREE.Vector3().setFromSpherical(spherical))
      camera.lookAt(orbit.target)
      orbit.update(); reportAngles(); invalidate()
      return
    }
    if (viewCommand.kind === 'fitSel') {
      const state = useEditorStore.getState()
      const picked = new THREE.Box3()
      if (state.selection?.kind === 'part') { const node = root.getObjectByName(state.selection.id); if (node) picked.setFromObject(node, true) }
      else if (state.selection?.kind === 'terminal') { const terminal = state.def.terminals.find((item) => item.id === state.selection!.id); if (terminal) picked.setFromCenterAndSize(new THREE.Vector3(...terminal.position), new THREE.Vector3(24, 24, 24)) }
      else if (state.selectedWire) {
        const wire = state.testWires.find((item) => item.id === state.selectedWire)
        const chain = wire ? wireModel(state.def.terminals, wire)?.chain : undefined
        chain?.forEach((point) => picked.expandByPoint(point))
      }
      if (!picked.isEmpty()) {
        const direction = camera.position.clone().sub((controls as unknown as { target: THREE.Vector3 } | null)?.target ?? new THREE.Vector3()).normalize()
        frameBox(picked, direction, 1.25)
        return
      }
    }
    const box = modelBox()
    const yaw = (viewCommand.yaw ?? 0) / DEG, pitch = (viewCommand.pitch ?? 0) / DEG
    const dirs: Record<string, number[]> = {
      front: [0, 0.05, 1], back: [0, 0.05, -1], left: [-1, 0.05, 0], right: [1, 0.05, 0], top: [0, 1, 0.001], bottom: [0, -1, 0.001], iso: [0.8, 0.6, 1], fit: [0.8, 0.6, 1],
      fitSel: [0.8, 0.6, 1],
      angles: [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch) + 0.02, Math.cos(yaw) * Math.cos(pitch)],
    }
    frameBox(box, new THREE.Vector3(...dirs[viewCommand.kind]).normalize(), 1.12)
    return
  }, [viewCommand])

  // yaw/pitch da câmara para o cubo de vista
  const reportAngles = () => {
    const orbit = controls as unknown as { target: THREE.Vector3 } | null
    const target = orbit?.target ?? new THREE.Vector3()
    const offset = camera.position.clone().sub(target)
    const distance = Math.max(0.001, offset.length())
    const yaw = Math.round(Math.atan2(offset.x, offset.z) * DEG * 2) / 2
    const pitch = Math.round(Math.asin(Math.max(-1, Math.min(1, offset.y / distance))) * DEG * 2) / 2
    const current = useEditorStore.getState().camAngles
    if (current.yaw !== yaw || current.pitch !== pitch) useEditorStore.setState({ camAngles: { yaw, pitch } })
  }
  useEffect(() => { reportAngles() }, [controls])

  // largada a partir da biblioteca: raycast do ponto do rato contra o modelo
  const dropRequest = useEditorStore((s) => s.dropRequest)
  useEffect(() => {
    if (!dropRequest) return
    const state = useEditorStore.getState()
    state.set({ dropRequest: null })
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((dropRequest.x - rect.left) / rect.width) * 2 - 1, -(((dropRequest.y - rect.top) / rect.height) * 2 - 1))
    const caster = new THREE.Raycaster()
    caster.setFromCamera(ndc, camera)
    const hit = caster.intersectObject(root, true)[0]
    if (hit?.face) {
      const normal = state.faceLock ? FACE_NORMAL[state.faceLock] : hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray() as Vec3
      addTerminalAt(dropRequest.spec, hit.point.toArray() as Vec3, normal)
    } else {
      const face = dropRequest.spec.face
      addTerminalAt(dropRequest.spec, faceCenter(defBounds(state.def), face), FACE_NORMAL[face])
    }
  }, [dropRequest])

  const selectedPart = selection?.kind === 'part' ? def.parts.find((part) => part.id === selection.id) : undefined
  const selectedNode = selectedPart ? root.getObjectByName(selectedPart.id) ?? null : null
  const highlightPart = selection?.kind === 'part' ? selection.id : selection?.kind === 'light' ? def.lights.find((light) => light.id === selection.id)?.partId : undefined
  const highlightNode = highlightPart ? root.getObjectByName(highlightPart) ?? null : null
  const helper = useMemo(() => (highlightNode ? new THREE.BoxHelper(highlightNode, '#2655e5') : null), [highlightNode, root])
  useFrame(() => { helper?.update() })

  const gizmoEnabled = mode === 'edit' && !placing && ribbon === 'select'
  const partGizmo = gizmoEnabled && selectedPart && !selectedPart.locked && selectedNode
  const selectedTerminal = selection?.kind === 'terminal' ? def.terminals.find((terminal) => terminal.id === selection.id) : undefined
  const terminalGizmo = gizmoEnabled && selectedTerminal && markerObject && !hiddenTerminals.includes(selectedTerminal.id)

  const onModelClick = (event: ThreeEvent<MouseEvent>) => {
    if (performance.now() - lastDragEnd < 250) return
    event.stopPropagation()
    // o modelo pode estar à frente do borne ao longo do raio: procurar o borne entre todas as interseções
    const terminalHit = !placing ? event.intersections.find((item) => typeof item.object.userData?.terminalId === 'string') : undefined
    if (terminalHit) { terminalClick(terminalHit.object.userData.terminalId as string); return }
    if (mode === 'simulate' && (ribbon === 'wire' || ribbon === 'measure')) return
    if (mode === 'simulate') {
      const hit = partIdOf(event.object, known)
      const result = runInteractions(interactionsFor(def, 'click', hit), previewState)
      useEditorStore.getState().set({ previewState: result.state })
      result.delayed.forEach((action) => timers.current.push(window.setTimeout(() => useEditorStore.getState().set({ previewState: action.state }), action.afterMs)))
      return
    }
    if (ribbon === 'wire' || ribbon === 'pan' || ribbon === 'measure') return
    if (ribbon === 'delete') {
      const target = partIdOf(event.object, known)
      if (target) { const state = useEditorStore.getState(); state.edit((current) => removeParts(current, [target])); state.select(null) }
      return
    }
    if (placing && event.face) {
      const state = useEditorStore.getState()
      const normal = state.faceLock ? FACE_NORMAL[state.faceLock] : (event.face.normal.clone().transformDirection(event.object.matrixWorld).toArray() as Vec3)
      addTerminalAt(state.placingSpec, event.point.toArray() as Vec3, normal)
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
    <hemisphereLight args={['#ffffff', view.dark ? '#1f2937' : '#9aa7ba', 0.9]} />
    <directionalLight position={[160, 260, 200]} intensity={1.4} castShadow shadow-bias={-0.0004} shadow-normalBias={0.6} shadow-mapSize={[1024, 1024]} shadow-camera-left={-220} shadow-camera-right={220} shadow-camera-top={220} shadow-camera-bottom={-220} shadow-camera-near={10} shadow-camera-far={900} />
    <directionalLight position={[-180, 120, -160]} intensity={0.5} />
    {view.floor && <gridHelper args={[400, 40, view.dark ? '#475569' : '#b4c0d2', view.dark ? '#273244' : '#d5dce8']} position={[0, -0.05, 0]} />}
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
      hidden={hiddenTerminals.includes(terminal.id)} onRef={selection?.kind === 'terminal' && selection.id === terminal.id ? setMarkerObject : undefined} />)}
    <TestWires />
    <WireDrawController active={ribbon === 'wire'} root={root} />
    <MeasureController active={ribbon === 'measure'} root={root} />
    {placing && hover && <mesh position={hover.point}><sphereGeometry args={[2, 12, 10]} /><meshBasicMaterial color="#16a34a" depthTest={false} transparent opacity={0.85} /></mesh>}

    {partGizmo && selectedNode && <TransformControls object={selectedNode} mode={tool} space={gizmoSpace} size={0.8}
      translationSnap={snap.on ? snap.mm : null} rotationSnap={snap.on ? snap.deg / DEG : null} scaleSnap={snap.on ? 0.05 : null} onMouseUp={commitPart} />}
    {terminalGizmo && markerObject && <TransformControls object={markerObject} mode="translate" size={0.7} translationSnap={snap.on ? Math.min(snap.mm, 0.5) : null} onMouseUp={commitTerminal} />}
    <OrbitControls makeDefault enableDamping={false} onChange={reportAngles} onStart={() => { autoFit.current = false }}
      mouseButtons={{ LEFT: ribbon === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }} />
  </>
}

function BoundsBox({ root }: { root: THREE.Object3D }) {
  const box = useMemo(() => new THREE.Box3Helper(new THREE.Box3().setFromObject(root), '#f59e0b'), [root])
  return <primitive object={box} />
}

export default function Viewport() {
  const select = useEditorStore((s) => s.select)
  return <Canvas frameloop="demand" shadows dpr={[1, 2]} gl={{ alpha: true }} camera={{ position: [150, 110, 190], fov: 35, near: 1, far: 4000 }}
    style={{ cursor: undefined }}
    onPointerMissed={() => { if (dragRecent()) return; const state = useEditorStore.getState(); if (state.selectedWire && state.ribbon === 'select') state.set({ selectedWire: null }); if (!state.placing && state.mode === 'edit' && state.ribbon === 'select') select(null) }}>
    <Scene />
  </Canvas>
}
