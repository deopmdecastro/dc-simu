import { useEffect, useMemo, useState } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Vec3 } from '../../catalog/types'
import { WireEnd3D } from '../../three/WireEnd3D'
import { useEditorStore, type TestWire } from './editorStore'
import { dragState } from './dragState'
import { evaluateWire, insertIndexFor, wireModel, type WireEndFit } from './wirePath'
import { WIRE_COLOR_HEX } from './wireStyle'

const U = 0.01
const VERDICT = { ok: '#16a34a', warn: '#f59e0b', error: '#dc2626' } as const
/** Cores normalizadas das ponteiras por secção (DIN 46228). */
const FERRULE_COLOR: Array<[number, string]> = [[0.5, '#f8fafc'], [0.75, '#9ca3af'], [1, '#ef4444'], [1.5, '#374151'], [2.5, '#2563eb'], [4, '#9ca3af'], [6, '#eab308'], [10, '#f5f0dc'], [16, '#2563eb']]
const ferruleColor = (gauge: string) => {
  const area = Number.parseFloat(gauge)
  return FERRULE_COLOR.reduce((best, item) => (Math.abs(item[0] - area) < Math.abs(best[0] - area) ? item : best), FERRULE_COLOR[0])[1]
}
const r1 = (value: number) => Math.round(value * 10) / 10

/** A terminação vive no referencial da cena do Painel 3D (0,01 unidade por mm): escala 100 devolve milímetros. */
function EndFit({ fit, radiusMm, color }: { fit: WireEndFit; radiusMm: number; color: string }) {
  const geometry = useMemo(() => ({
    type: fit.type, origin: fit.origin.map((value) => value * U) as Vec3, axis: fit.axis, normal: fit.normal, embedMm: fit.embedMm, length: fit.lengthMm * U,
  }), [fit])
  return <group scale={100}><WireEnd3D geometry={geometry} wireRadius={radiusMm * U} color={color} /></group>
}

/** Ponto do traçado do cabo selecionado: arrasta-se no plano da câmara; duplo clique remove. */
function PointHandle({ wireId, index, point }: { wireId: string; index: number; point: Vec3 }) {
  const { camera, gl, controls, invalidate } = useThree()
  const [drag, setDrag] = useState(false)
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    if (!drag) return
    const orbit = controls as unknown as { enabled: boolean } | null
    if (orbit) orbit.enabled = false
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(...point))
    const move = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3())
      if (!hit) return
      const state = useEditorStore.getState()
      if (!event.altKey && state.snap.on) { const step = state.snap.mm; hit.set(Math.round(hit.x / step) * step, Math.round(hit.y / step) * step, Math.round(hit.z / step) * step) }
      const wire = state.testWires.find((item) => item.id === wireId)
      if (!wire) return
      state.patchWire(wireId, { points: wire.points.map((item, position) => (position === index ? [r1(hit.x), r1(hit.y), r1(hit.z)] as Vec3 : item)) })
      invalidate()
    }
    const up = () => { dragState.endedAt = performance.now(); setDrag(false) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (orbit) orbit.enabled = true }
    // o plano fixa-se no início do arrasto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])
  return <group position={point}>
    <mesh renderOrder={40}
      onPointerDown={(event) => { event.stopPropagation(); setDrag(true) }}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); gl.domElement.style.cursor = 'grab' }}
      onPointerOut={() => { setHovered(false); gl.domElement.style.cursor = '' }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation()
        const state = useEditorStore.getState()
        const wire = state.testWires.find((item) => item.id === wireId)
        if (wire) state.patchWire(wireId, { points: wire.points.filter((_, position) => position !== index) })
      }}>
      <sphereGeometry args={[hovered || drag ? 2.6 : 2, 16, 12]} />
      <meshBasicMaterial color={drag ? '#f59e0b' : '#2563eb'} depthTest={false} />
    </mesh>
    <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }} position={[0, 5, 0]}><span className="ce-wire-pt">{index + 1}</span></Html>
  </group>
}

function WireMesh({ wire }: { wire: TestWire }) {
  const terminals = useEditorStore((s) => s.def.terminals)
  const selected = useEditorStore((s) => s.selectedWire === wire.id)
  const hover = useEditorStore((s) => s.hoverWire === wire.id)
  const picking = useEditorStore((s) => s.ribbon === 'select' || s.ribbon === 'delete')
  const model = useMemo(() => wireModel(terminals, wire), [terminals, wire])
  const verdict = useMemo(() => evaluateWire(terminals, wire), [terminals, wire])
  if (!model?.curve) return null
  const { curve, radiusMm } = model
  const segments = Math.min(700, Math.max(56, wire.points.length * 24, Math.ceil(curve.getLength() / 1.1)))
  const hex = WIRE_COLOR_HEX[wire.color]
  const collar = ferruleColor(wire.gauge)

  const choose = (event: ThreeEvent<MouseEvent>) => {
    if (!picking) return
    event.stopPropagation()
    const state = useEditorStore.getState()
    if (state.ribbon === 'delete') { state.removeWire(wire.id); return }
    state.set({ selectedWire: wire.id, selection: null, tab: 'wires' })
  }
  const insert = (event: ThreeEvent<MouseEvent>) => {
    if (!picking) return
    event.stopPropagation()
    const state = useEditorStore.getState()
    const index = insertIndexFor(model.chain, wire.points.length, event.point)
    const points = [...wire.points]
    points.splice(index, 0, [r1(event.point.x), r1(event.point.y), r1(event.point.z)])
    state.patchWire(wire.id, { points })
    state.set({ selectedWire: wire.id, selection: null, tab: 'wires' })
  }
  const over = (event: ThreeEvent<PointerEvent>) => { if (!picking) return; event.stopPropagation(); useEditorStore.getState().set({ hoverWire: wire.id }) }
  const out = () => { if (useEditorStore.getState().hoverWire === wire.id) useEditorStore.getState().set({ hoverWire: null }) }

  return <group>
    {(selected || hover) && <mesh renderOrder={2} raycast={() => null}>
      <tubeGeometry args={[curve, segments, radiusMm + 1, 10, false]} />
      <meshBasicMaterial color={selected ? '#2563eb' : '#60a5fa'} transparent opacity={0.4} depthWrite={false} />
    </mesh>}
    {verdict.level !== 'ok' && <mesh renderOrder={2} raycast={() => null}>
      <tubeGeometry args={[curve, segments, radiusMm + 0.6, 10, false]} />
      <meshBasicMaterial color={VERDICT[verdict.level]} transparent opacity={0.55} depthWrite={false} />
    </mesh>}
    <mesh renderOrder={3} onClick={choose} onDoubleClick={insert} onPointerOver={over} onPointerOut={out}>
      <tubeGeometry args={[curve, segments, radiusMm, 14, false]} />
      <meshStandardMaterial color={hex} roughness={0.5} metalness={0.05} />
    </mesh>
    {picking && <mesh onClick={choose} onDoubleClick={insert} onPointerOver={over} onPointerOut={out}>
      <tubeGeometry args={[curve, segments, Math.max(radiusMm * 2, 2.2), 6, false]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>}
    {model.ends.map((fit, side) => <EndFit key={side} fit={fit} radiusMm={radiusMm} color={collar} />)}
    {selected && wire.points.map((point, index) => <PointHandle key={`${wire.id}:${index}`} wireId={wire.id} index={index} point={point} />)}
  </group>
}

/** Cabos de teste: cada cabo mantém a cor, a secção, o condutor e as terminações escolhidos. */
export default function TestWires() {
  const wires = useEditorStore((s) => s.testWires)
  return <>{wires.filter((wire) => !wire.hidden).map((wire) => <WireMesh key={wire.id} wire={wire} />)}</>
}
