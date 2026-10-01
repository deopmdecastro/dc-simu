import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { create } from 'zustand'
import type { Vec3 } from '../../catalog/types'
import { useEditorStore } from './editorStore'
import { WIRE_RADIUS_MM, wireChain, wireCurve } from './wirePath'

/** Informação em direto (cursor, comprimento, borne sob o rato) fora do React da cena. */
export const useWireInfo = create<{ cursor: { point: Vec3; terminalId?: string } | null; lengthMm: number; hover: string; surface: 'terminal' | 'surface' | 'air' }>(() => ({ cursor: null, lengthMm: 0, hover: '', surface: 'air' }))
const RESET = { cursor: null, lengthMm: 0, hover: '', surface: 'air' as const }

const CLICK_SLOP_PX = 5
const TERMINAL_PICK_PX = 18
const r1 = (value: number) => Math.round(value * 10) / 10
const flash = (text: string) => window.dispatchEvent(new CustomEvent('ce-flash', { detail: text }))

type Found = { point: Vec3; kind: 'terminal' | 'surface' | 'air'; terminalId?: string }

/**
 * Desenho de cabos no editor — igual ao do Painel 3D do simulador: clique num borne (ou numa superfície) para
 * começar, clique para largar pontos de curva nas superfícies (ou no plano virado para a câmara) e termine num
 * borne, com duplo clique ou Enter para deixar a ponta livre. Shift trava o eixo; Alt desliga o encaixe à grelha.
 */
export function WireDrawController({ active, root }: { active: boolean; root: THREE.Object3D }) {
  const { camera, gl, invalidate } = useThree()
  const rootRef = useRef(root)
  rootRef.current = root

  useEffect(() => {
    if (!active) { useWireInfo.setState(RESET); return }
    const dom = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let down: { x: number; y: number } | null = null
    let frame = 0
    let lastEvent: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean } | null = null

    const locate = (event: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean }): Found => {
      const state = useEditorStore.getState()
      const rect = dom.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      // 1) borne mais próximo no ecrã (marcadores pequenos, captura generosa)
      let best: { id: string; position: Vec3 } | null = null
      let bestDistance = TERMINAL_PICK_PX
      const projected = new THREE.Vector3()
      for (const terminal of state.def.terminals) {
        const lifted = new THREE.Vector3(...terminal.position).addScaledVector(new THREE.Vector3(...terminal.normal), 1.6)
        projected.copy(lifted).project(camera)
        if (projected.z > 1) continue
        const distance = Math.hypot((projected.x * 0.5 + 0.5) * rect.width - px, (-projected.y * 0.5 + 0.5) * rect.height - py)
        if (distance < bestDistance) { bestDistance = distance; best = { id: terminal.id, position: terminal.position } }
      }
      if (best) return { point: best.position, kind: 'terminal', terminalId: best.id }

      // 2) superfície do modelo
      ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObject(rootRef.current, true).find((item) => (item.object as THREE.Mesh).isMesh && item.object.visible)
      if (hit) {
        const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize() : new THREE.Vector3(0, 1, 0)
        if (normal.dot(raycaster.ray.direction) > 0) normal.negate()
        const point = hit.point.clone().addScaledVector(normal, WIRE_RADIUS_MM + 0.15)
        return { point: [r1(point.x), r1(point.y), r1(point.z)], kind: 'surface' }
      }

      // 3) plano virado para a câmara, pelo último ponto (permite desenhar «onde quiser» ao navegar)
      const last = state.wirePoints[state.wirePoints.length - 1]
        ?? (state.wireFrom ? state.def.terminals.find((item) => item.id === state.wireFrom)?.position : undefined)
        ?? state.wireStart ?? undefined
      const box = new THREE.Box3().setFromObject(rootRef.current)
      const anchor = new THREE.Vector3(...(last ?? (box.isEmpty() ? [0, 0, 0] as Vec3 : box.getCenter(new THREE.Vector3()).toArray() as Vec3)))
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), anchor)
      const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3()) ?? anchor
      if (event.shiftKey && last) {
        const delta = point.clone().sub(anchor)
        const axes = [Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z)]
        const keep = axes.indexOf(Math.max(...axes))
        point.set(keep === 0 ? point.x : anchor.x, keep === 1 ? point.y : anchor.y, keep === 2 ? point.z : anchor.z)
      } else if (!event.altKey && state.snap.on) {
        const step = state.snap.mm
        point.set(Math.round(point.x / step) * step, Math.round(point.y / step) * step, Math.round(point.z / step) * step)
      }
      return { point: [r1(point.x), r1(point.y), r1(point.z)], kind: 'air' }
    }

    const publish = () => {
      frame = 0
      if (!lastEvent) return
      const found = locate(lastEvent)
      const state = useEditorStore.getState()
      let lengthMm = 0
      if (state.wireFrom || state.wireStart) {
        const chain = wireChain(state.def.terminals, { a: state.wireFrom, b: found.terminalId ?? null, start: state.wireStart ?? undefined, end: found.terminalId ? undefined : found.point, points: state.wirePoints })
        const curve = wireCurve(chain, state.wireSmooth)
        lengthMm = curve ? Math.round(curve.getLength()) : 0
      }
      const terminal = found.terminalId ? state.def.terminals.find((item) => item.id === found.terminalId) : undefined
      useWireInfo.setState({ cursor: { point: found.point, terminalId: found.terminalId }, lengthMm, hover: terminal ? `${terminal.label}${terminal.name ? ` · ${terminal.name}` : ''}` : '', surface: found.kind })
      invalidate()
    }
    const onMove = (event: PointerEvent) => { lastEvent = event; if (!frame) frame = requestAnimationFrame(publish) }
    const onDown = (event: PointerEvent) => { down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null }
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || !down) return
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      down = null
      if (moved > CLICK_SLOP_PX) return // foi uma orbitação, não um clique
      const state = useEditorStore.getState()
      const found = locate(event)
      const drafting = !!(state.wireFrom || state.wireStart)
      if (found.terminalId) {
        if (!drafting) state.startWire({ terminalId: found.terminalId })
        else if (state.wireFrom !== found.terminalId) { const problem = state.finishWire({ terminalId: found.terminalId }); if (problem) flash(problem) }
        return
      }
      if (!drafting) { state.startWire({ point: found.point }); return }
      if (event.detail >= 2) { const problem = state.finishWireFree(); if (problem) flash(problem); return }
      state.addWirePoint(found.point)
    }
    const onLeave = () => { lastEvent = null; useWireInfo.setState(RESET); invalidate() }
    dom.addEventListener('pointermove', onMove)
    dom.addEventListener('pointerdown', onDown)
    dom.addEventListener('click', onClick)
    dom.addEventListener('pointerleave', onLeave)
    dom.style.cursor = 'crosshair'
    return () => {
      dom.removeEventListener('pointermove', onMove)
      dom.removeEventListener('pointerdown', onDown)
      dom.removeEventListener('click', onClick)
      dom.removeEventListener('pointerleave', onLeave)
      if (frame) cancelAnimationFrame(frame)
      dom.style.cursor = ''
    }
  }, [active, camera, gl, invalidate])

  if (!active) return null
  return <DraftWire />
}

/** Cabo em desenho: segue os pontos largados e o cursor; anel verde sobre bornes, azul no espaço. */
function DraftWire() {
  const wireFrom = useEditorStore((s) => s.wireFrom)
  const wireStart = useEditorStore((s) => s.wireStart)
  const points = useEditorStore((s) => s.wirePoints)
  const smooth = useEditorStore((s) => s.wireSmooth)
  const terminals = useEditorStore((s) => s.def.terminals)
  const cursor = useWireInfo((s) => s.cursor)
  const invalidate = useThree((s) => s.invalidate)
  const ringRef = useRef<THREE.Mesh>(null)
  useEffect(() => { invalidate() }, [wireFrom, wireStart, points, cursor, smooth, invalidate])
  useFrame(({ clock }) => { if (ringRef.current) ringRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 6) * 0.12) })

  const drafting = !!(wireFrom || wireStart)
  const curve = useMemo(() => {
    if (!drafting) return null
    const target = cursor?.terminalId ?? null
    return wireCurve(wireChain(terminals, { a: wireFrom, b: target, start: wireStart ?? undefined, end: target ? undefined : cursor?.point, points }), smooth)
  }, [drafting, terminals, wireFrom, wireStart, points, cursor, smooth])
  const hovered = cursor?.terminalId ? terminals.find((item) => item.id === cursor.terminalId) : undefined

  return <group>
    {curve && <mesh renderOrder={26} raycast={() => null}>
      <tubeGeometry args={[curve, 48, WIRE_RADIUS_MM * 0.9, 10, false]} />
      <meshBasicMaterial color="#2563eb" transparent opacity={0.75} depthTest={false} />
    </mesh>}
    {points.map((point, index) => <group key={index} position={point}>
      <mesh renderOrder={34} raycast={() => null}><sphereGeometry args={[1.5, 14, 14]} /><meshBasicMaterial color="#2563eb" depthTest={false} /></mesh>
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }} position={[0, 4, 0]}><span className="ce-wire-pt">{index + 1}</span></Html>
    </group>)}
    {wireStart && <mesh position={wireStart} renderOrder={34} raycast={() => null}><sphereGeometry args={[1.9, 14, 14]} /><meshBasicMaterial color="#16a34a" depthTest={false} /></mesh>}
    {cursor && <group position={cursor.point}>
      <mesh ref={ringRef} renderOrder={36} raycast={() => null}>
        <torusGeometry args={[hovered ? 3.4 : 2.2, 0.35, 10, 32]} />
        <meshBasicMaterial color={hovered ? '#22c55e' : '#2563eb'} depthTest={false} />
      </mesh>
      {hovered && <Html center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }} position={[0, 6, 0]}><span className="ce-term-tag is-on">{hovered.label}</span></Html>}
    </group>}
  </group>
}
