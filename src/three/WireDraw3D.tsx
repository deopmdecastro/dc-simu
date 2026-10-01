import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { create } from 'zustand'
import { useSimStore } from '../store/useSimStore'
import { polylineLengthMm, type V3 } from './wireGeometry3D'

/** Estado do cabo em desenho. A origem é um borne ou um ponto livre no espaço. */
export type WireDraft = { from: { terminalId: string } | { point: V3 }; points: V3[] }
export type DrawTerminal = { id: string; position: V3; label: string; ref: string; color: string }

/** Informação em direto (cursor/comprimento) fora do React da cena, para não re-renderizar o painel a cada movimento do rato. */
export const useWireDrawInfo = create<{ lengthMm: number; hover: string; surface: 'terminal' | 'surface' | 'air' }>(() => ({ lengthMm: 0, hover: '', surface: 'air' }))

const CLICK_SLOP_PX = 5
const TERMINAL_PICK_PX = 18

type Props = {
  active: boolean
  draft: WireDraft | null
  /** Leitura síncrona do rascunho (cliques muito seguidos chegam antes de nova renderização). */
  getDraft: () => WireDraft | null
  terminals: DrawTerminal[]
  wireRadius: number
  wireColor: string
  smooth: boolean
  /** Religar uma ponta de um cabo existente: só aceita bornes. */
  reconnecting: boolean
  fallbackCenter: V3
  onStart: (from: WireDraft['from']) => void
  onAddPoint: (point: V3) => void
  onFinish: (to: { terminalId: string } | { point: V3 }) => void
  onReconnectPick: (terminalId: string) => void
}

const ancestorFlag = (object: THREE.Object3D | null, key: string): boolean => {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node.userData?.[key]) return true
  return false
}

/**
 * Desenho de cabos no espaço 3D: clique num borne (ou numa superfície) para começar, vá orbitando a câmara
 * e clique para largar pontos de curva nas superfícies (ou no plano virado para a câmara); termine num borne,
 * com duplo clique ou Enter para deixar a ponta livre. Shift trava o eixo; Alt desliga o encaixe à grelha.
 */
export function WireDrawController({ active, draft, getDraft, terminals, wireRadius, wireColor, smooth, reconnecting, fallbackCenter, onStart, onAddPoint, onFinish, onReconnectPick }: Props) {
  const { camera, gl, scene, size } = useThree()
  const [cursor, setCursor] = useState<{ point: V3; terminalId?: string } | null>(null)
  const latest = useRef({ draft, getDraft, terminals, reconnecting, fallbackCenter, wireRadius, onStart, onAddPoint, onFinish, onReconnectPick })
  latest.current = { draft, getDraft, terminals, reconnecting, fallbackCenter, wireRadius, onStart, onAddPoint, onFinish, onReconnectPick }

  useEffect(() => {
    if (!active) { setCursor(null); useWireDrawInfo.setState({ lengthMm: 0, hover: '', surface: 'air' }); return }
    const dom = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let down: { x: number; y: number } | null = null
    let frame = 0
    let lastEvent: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean } | null = null

    const locate = (event: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean }) => {
      const state = latest.current
      const rect = dom.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      // 1) borne mais próximo no ecrã (os marcadores são pequenos; a captura é generosa)
      let bestTerminal: DrawTerminal | null = null
      let bestDistance = TERMINAL_PICK_PX
      const projected = new THREE.Vector3()
      for (const terminal of state.terminals) {
        projected.set(...terminal.position).project(camera)
        if (projected.z > 1) continue
        const sx = (projected.x * 0.5 + 0.5) * rect.width
        const sy = (-projected.y * 0.5 + 0.5) * rect.height
        const distance = Math.hypot(sx - px, sy - py)
        if (distance < bestDistance) { bestDistance = distance; bestTerminal = terminal }
      }
      if (bestTerminal) return { point: bestTerminal.position, terminalId: bestTerminal.id, kind: 'terminal' as const }

      // 2) superfície física (componentes, calhas, chapa)
      ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      for (const hit of hits) {
        const mesh = hit.object as THREE.Mesh
        if (!mesh.isMesh || ancestorFlag(mesh, 'noPick') || !ancestorFlag(mesh, 'wireSurface')) continue
        const normal = hit.face ? hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize() : new THREE.Vector3(0, 0, 1)
        if (normal.dot(raycaster.ray.direction) > 0) normal.negate()
        const point = hit.point.clone().addScaledVector(normal, state.wireRadius + 0.004)
        return { point: [point.x, point.y, point.z] as V3, kind: 'surface' as const }
      }

      // 3) plano virado para a câmara, pelo último ponto (permite desenhar "onde quiser" ao navegar)
      const last = state.draft
        ? (state.draft.points[state.draft.points.length - 1] ?? ('terminalId' in state.draft.from
          ? state.terminals.find((t) => t.id === (state.draft!.from as { terminalId: string }).terminalId)?.position
          : (state.draft.from as { point: V3 }).point))
        : undefined
      const anchor = new THREE.Vector3(...(last ?? state.fallbackCenter))
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), anchor)
      const target = raycaster.ray.intersectPlane(plane, new THREE.Vector3())
      const point = target ?? anchor
      if (event.shiftKey && last) {
        // trava no eixo dominante em relação ao ponto anterior
        const delta = point.clone().sub(anchor)
        const axes = [Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z)]
        const keep = axes.indexOf(Math.max(...axes))
        point.set(keep === 0 ? point.x : anchor.x, keep === 1 ? point.y : anchor.y, keep === 2 ? point.z : anchor.z)
      }
      if (!event.altKey) {
        const step = 0.05
        const snap = (value: number) => Math.round(value / step) * step
        if (!(event.shiftKey && last)) point.set(snap(point.x), snap(point.y), snap(point.z))
      }
      return { point: [point.x, point.y, point.z] as V3, kind: 'air' as const }
    }

    const publish = () => {
      frame = 0
      if (!lastEvent) return
      const found = locate(lastEvent)
      setCursor({ point: found.point, terminalId: 'terminalId' in found ? found.terminalId : undefined })
      const state = latest.current
      const chain: V3[] = []
      if (state.draft) {
        const from = state.draft.from
        const start = 'terminalId' in from ? state.terminals.find((t) => t.id === from.terminalId)?.position : from.point
        if (start) chain.push(start)
        chain.push(...state.draft.points)
        chain.push(found.point)
      }
      const terminal = 'terminalId' in found ? state.terminals.find((t) => t.id === found.terminalId) : undefined
      useWireDrawInfo.setState({
        lengthMm: chain.length > 1 ? polylineLengthMm(chain) : 0,
        hover: terminal ? `${terminal.ref}.${terminal.label}` : '',
        surface: found.kind,
      })
    }

    const onMove = (event: PointerEvent) => {
      lastEvent = event
      if (!frame) frame = requestAnimationFrame(publish)
    }
    const onDown = (event: PointerEvent) => { down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null }
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || !down) return
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      down = null
      if (moved > CLICK_SLOP_PX) return // foi uma orbitação, não um clique
      const state = latest.current
      const found = locate(event)
      const draftNow = state.getDraft()
      if (state.reconnecting) {
        if ('terminalId' in found && found.terminalId) state.onReconnectPick(found.terminalId)
        return
      }
      if ('terminalId' in found && found.terminalId) {
        if (!draftNow) state.onStart({ terminalId: found.terminalId })
        else if (!('terminalId' in draftNow.from && draftNow.from.terminalId === found.terminalId)) state.onFinish({ terminalId: found.terminalId })
        return
      }
      if (!draftNow) {
        // clicar num cabo existente seleciona-o para edição (feito pelo próprio cabo); clicar no vazio com um cabo selecionado só o deseleciona
        ndc.set(((event.clientX - dom.getBoundingClientRect().left) / dom.getBoundingClientRect().width) * 2 - 1, -((event.clientY - dom.getBoundingClientRect().top) / dom.getBoundingClientRect().height) * 2 + 1)
        raycaster.setFromCamera(ndc, camera)
        if (raycaster.intersectObjects(scene.children, true).some((hit) => hit.object.userData?.wireHit)) return
        if (useSimStore.getState().selectedWireId) { useSimStore.getState().selectWire(null); return }
        state.onStart({ point: found.point }); return
      }
      if (event.detail >= 2) {
        // duplo clique: o último ponto largado passa a ser a ponta livre do cabo
        const last = draftNow.points[draftNow.points.length - 1]
        if (last) state.onFinish({ point: last })
        return
      }
      state.onAddPoint(found.point)
    }
    const onLeave = () => { lastEvent = null; setCursor(null); useWireDrawInfo.setState({ hover: '', lengthMm: 0 }) }
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
  }, [active, camera, gl, scene, size.width, size.height])

  if (!active) return null
  return <DraftWire draft={draft} terminals={terminals} cursor={cursor} radius={wireRadius} color={wireColor} smooth={smooth} reconnecting={reconnecting} />
}

function DraftWire({ draft, terminals, cursor, radius, color, smooth, reconnecting }: {
  draft: WireDraft | null
  terminals: DrawTerminal[]
  cursor: { point: V3; terminalId?: string } | null
  radius: number
  color: string
  smooth: boolean
  reconnecting: boolean
}) {
  const startPosition = draft ? ('terminalId' in draft.from ? terminals.find((t) => t.id === (draft.from as { terminalId: string }).terminalId)?.position : (draft.from as { point: V3 }).point) : undefined
  const chain = useMemo<V3[]>(() => {
    if (!draft || !startPosition) return []
    return [startPosition, ...draft.points, ...(cursor ? [cursor.point] : [])]
  }, [draft, startPosition, cursor])

  const curve = useMemo(() => {
    if (chain.length < 2) return null
    const vectors = chain.map((p) => new THREE.Vector3(...p))
    // pontos coincidentes (cursor em cima do último ponto) degeneram o tubo
    const clean = vectors.filter((p, i) => i === 0 || p.distanceTo(vectors[i - 1]) > 1e-4)
    if (clean.length < 2) return null
    if (smooth && clean.length > 2) return new THREE.CatmullRomCurve3(clean, false, 'centripetal', 0.5)
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let i = 1; i < clean.length; i += 1) path.add(new THREE.LineCurve3(clean[i - 1], clean[i]))
    return path
  }, [chain, smooth])

  const hovered = cursor?.terminalId ? terminals.find((t) => t.id === cursor.terminalId) : undefined
  const ringRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => { if (ringRef.current) ringRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 6) * 0.12) })

  return <group userData={{ noPick: true }}>
    {curve && <mesh renderOrder={26} raycast={() => null}>
      <tubeGeometry args={[curve, Math.max(24, chain.length * 14), Math.max(radius * 0.9, 0.008), 10, false]} />
      <meshStandardMaterial color={color} roughness={0.5} transparent opacity={0.78} />
    </mesh>}
    {draft && draft.points.map((point, index) => <group key={index} position={point}>
      <mesh renderOrder={34} raycast={() => null}><sphereGeometry args={[0.04, 14, 14]} /><meshStandardMaterial color="#2563eb" emissive="#1d4ed8" emissiveIntensity={0.5} depthTest={false} /></mesh>
      <Text position={[0, 0.085, 0]} fontSize={0.05} color="#1e3a8a" anchorX="center" anchorY="bottom" depthOffset={-4}>{index + 1}</Text>
    </group>)}
    {startPosition && draft && 'point' in draft.from && <mesh position={startPosition} renderOrder={34} raycast={() => null}><sphereGeometry args={[0.05, 14, 14]} /><meshStandardMaterial color="#16a34a" emissive="#15803d" emissiveIntensity={0.6} depthTest={false} /></mesh>}
    {cursor && <group position={cursor.point}>
      <mesh ref={ringRef} renderOrder={36} raycast={() => null}>
        <torusGeometry args={[hovered ? 0.075 : 0.05, 0.009, 10, 32]} />
        <meshBasicMaterial color={hovered ? '#22c55e' : reconnecting ? '#f59e0b' : '#2563eb'} depthTest={false} />
      </mesh>
      {hovered && <Text position={[0, 0.12, 0]} fontSize={0.06} color="#0f172a" anchorX="center" anchorY="bottom" outlineWidth={0.004} outlineColor="#ffffff" depthOffset={-5}>{`${hovered.ref}.${hovered.label}`}</Text>}
    </group>}
  </group>
}

/** Linha de estado em direto (fora do canvas): pontos, comprimento e borne sob o cursor. */
export function WireDrawLive({ points, drafting }: { points: number; drafting: boolean }) {
  const info = useWireDrawInfo()
  return <span className="panel3d-draw-live" aria-live="polite">
    {drafting && <b>{points} {points === 1 ? 'ponto' : 'pontos'}</b>}
    {drafting && info.lengthMm > 0 && <b>≈ {info.lengthMm} mm</b>}
    {info.hover ? <em>Borne {info.hover}</em> : <em>{info.surface === 'surface' ? 'Sobre superfície' : info.surface === 'air' ? 'No espaço' : ''}</em>}
  </span>
}
