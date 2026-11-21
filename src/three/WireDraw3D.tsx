import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from './SceneText'
import * as THREE from 'three'
import { create } from 'zustand'
import { useSimStore } from '../store/useSimStore'
import type { TerminalElectricalClass, TerminalKind, WireRoute } from '../types'
import { TERMINAL_ELECTRICAL_CLASS_LABEL, terminalClassesCompatible } from '../electrical/terminalClassification'
import {
  buildDraftPreviewPoints3D,
  polylineLengthMm,
  snapControlPoint3D,
  wireCurveMetrics3D,
  wireFrontLimit,
  type SnapGuideLine3D,
  type V3,
  type WireObstacle,
} from './wireGeometry3D'

/** Estado do cabo em desenho. A origem é um borne ou um ponto livre no espaço. */
export type WireDraft = { from: { terminalId: string } | { point: V3 }; points: V3[] }
export type DrawTerminal = {
  id: string
  position: V3
  label: string
  ref: string
  color: string
  electricalClass?: TerminalElectricalClass
  kind?: TerminalKind
}

export interface WireDrawLiveState {
  lengthMm: number
  minBendMm: number | null
  recommendedBendMm: number
  bendOk: boolean
  hover: string
  surface: 'terminal' | 'duct' | 'surface' | 'air'
  snapLabel: string
  compat: 'ok' | 'warn' | 'exists' | null
  compatNote: string
}

const INITIAL_LIVE: WireDrawLiveState = {
  lengthMm: 0,
  minBendMm: null,
  recommendedBendMm: 10,
  bendOk: true,
  hover: '',
  surface: 'air',
  snapLabel: '',
  compat: null,
  compatNote: '',
}

/** Informação em direto (cursor/comprimento/curvatura/encaixe) fora do React da cena. */
export const useWireDrawInfo = create<WireDrawLiveState>(() => ({ ...INITIAL_LIVE }))

const CLICK_SLOP_PX = 5
const TERMINAL_PICK_PX = 18

type CursorState = {
  point: V3
  terminalId?: string
  guides: SnapGuideLine3D[]
  compat: 'ok' | 'warn' | 'exists' | null
}

type Props = {
  active: boolean
  draft: WireDraft | null
  /** Leitura síncrona do rascunho (cliques muito seguidos chegam antes de nova renderização). */
  getDraft: () => WireDraft | null
  terminals: DrawTerminal[]
  wireRadius: number
  wireColor: string
  sheathed?: boolean
  sheathColor?: string
  smooth: boolean
  route?: WireRoute
  orthoSnap?: boolean
  /** Religar uma ponta de um cabo existente: só aceita bornes. */
  reconnecting: boolean
  fallbackCenter: V3
  /** Corpos sólidos (componentes e calhas): encaixa em calhas e evita atravessar corpos. */
  obstacles?: WireObstacle[]
  onStart: (from: WireDraft['from']) => void
  onAddPoint: (point: V3) => void
  onFinish: (to: { terminalId: string } | { point: V3 }, opts?: { chain?: boolean }) => void
  onReconnectPick: (terminalId: string) => void
}

const ancestorFlag = (object: THREE.Object3D | null, key: string): boolean => {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node.userData?.[key]) return true
  return false
}

/** Linha 3D leve para guias magnéticas (eixos X/Y/Z e centro de calha). */
export function SnapGuides3D({ guides }: { guides: SnapGuideLine3D[] }) {
  if (!guides.length) return null
  return (
    <group userData={{ noPick: true, noSnapshot: true }}>
      {guides.map((g, i) => {
        const a = new THREE.Vector3(...g.from)
        const b = new THREE.Vector3(...g.to)
        const len = a.distanceTo(b)
        if (len < 0.015) return null
        const mid = a.clone().add(b).multiplyScalar(0.5)
        const dir = b.clone().sub(a).normalize()
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        return (
          <mesh key={`${g.axis}-${i}`} position={mid} quaternion={quat} renderOrder={32} raycast={() => null}>
            <cylinderGeometry args={[0.0045, 0.0045, len, 6, 1]} />
            <meshBasicMaterial color={g.color} transparent opacity={0.78} depthTest={false} />
          </mesh>
        )
      })}
    </group>
  )
}

/**
 * Construção de cabos no espaço 3D com rastreamento de curvas, guias magnéticas X/Y/Z,
 * encaixe no interior de calhas técnicas, validação elétrica prévia nos bornes e
 * verificação em tempo real do raio mínimo de curvatura (IEC 60204-1).
 *
 * Atalhos: Shift trava eixo (ou encadeia ao clicar num borne) · Alt desliga encaixe ·
 * Backspace desfaz o último ponto · Enter / duplo clique termina ponta livre · Esc cancela.
 */
export function WireDrawController({
  active,
  draft,
  getDraft,
  terminals,
  wireRadius,
  wireColor,
  sheathed = false,
  sheathColor,
  smooth,
  route,
  orthoSnap = true,
  reconnecting,
  fallbackCenter,
  obstacles = [],
  onStart,
  onAddPoint,
  onFinish,
  onReconnectPick,
}: Props) {
  const { camera, gl, scene, size } = useThree()
  const [cursor, setCursor] = useState<CursorState | null>(null)
  const effectiveRoute: WireRoute = route ?? (smooth ? 'arc' : 'orthogonal')
  const latest = useRef({
    draft,
    getDraft,
    terminals,
    reconnecting,
    fallbackCenter,
    wireRadius,
    obstacles,
    effectiveRoute,
    orthoSnap,
    onStart,
    onAddPoint,
    onFinish,
    onReconnectPick,
  })
  latest.current = {
    draft,
    getDraft,
    terminals,
    reconnecting,
    fallbackCenter,
    wireRadius,
    obstacles,
    effectiveRoute,
    orthoSnap,
    onStart,
    onAddPoint,
    onFinish,
    onReconnectPick,
  }

  useEffect(() => {
    if (!active) {
      setCursor(null)
      useWireDrawInfo.setState({ ...INITIAL_LIVE })
      return
    }
    const dom = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let down: { x: number; y: number } | null = null
    let frame = 0
    let lastEvent: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean } | null = null

    const originTerminalOf = (d: WireDraft | null) =>
      d && 'terminalId' in d.from ? latest.current.terminals.find((t) => t.id === (d.from as { terminalId: string }).terminalId) : undefined

    const evaluateCompat = (target: DrawTerminal | undefined, d: WireDraft | null): { compat: CursorState['compat']; note: string } => {
      if (!target || !d) return { compat: null, note: '' }
      const origin = originTerminalOf(d)
      if (!origin || origin.id === target.id) return { compat: null, note: '' }
      const wires = useSimStore.getState().wires
      const dup = wires.some(
        (w) =>
          (w.fromTerminalId === origin.id && w.toTerminalId === target.id) ||
          (w.fromTerminalId === target.id && w.toTerminalId === origin.id),
      )
      if (dup) return { compat: 'exists', note: 'Ligação já existe' }
      if (origin.electricalClass && target.electricalClass) {
        if (!terminalClassesCompatible(origin.electricalClass, target.electricalClass)) {
          return {
            compat: 'warn',
            note: `${TERMINAL_ELECTRICAL_CLASS_LABEL[origin.electricalClass]} ↔ ${TERMINAL_ELECTRICAL_CLASS_LABEL[target.electricalClass]}`,
          }
        }
        return { compat: 'ok', note: TERMINAL_ELECTRICAL_CLASS_LABEL[target.electricalClass] }
      }
      return { compat: 'ok', note: '' }
    }

    const locate = (event: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean }) => {
      const state = latest.current
      const outerMm = Math.max(1.8, state.wireRadius * 200)
      const rect = dom.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top

      const startPos = state.draft
        ? ('terminalId' in state.draft.from
            ? state.terminals.find((t) => t.id === (state.draft!.from as { terminalId: string }).terminalId)?.position
            : (state.draft.from as { point: V3 }).point)
        : undefined
      const last = state.draft ? (state.draft.points[state.draft.points.length - 1] ?? startPos) : undefined
      const refs: V3[] = []
      if (startPos && startPos !== last) refs.push(startPos)
      if (state.draft && state.draft.points.length >= 2) refs.push(state.draft.points[state.draft.points.length - 2])

      // 1) Borne mais próximo no ecrã (captura generosa para precisão em bornes pequenos)
      let bestTerminal: DrawTerminal | null = null
      let bestDistance = TERMINAL_PICK_PX
      const projected = new THREE.Vector3()
      for (const terminal of state.terminals) {
        projected.set(...terminal.position).project(camera)
        if (projected.z > 1) continue
        const sx = (projected.x * 0.5 + 0.5) * rect.width
        const sy = (-projected.y * 0.5 + 0.5) * rect.height
        const distance = Math.hypot(sx - px, sy - py)
        if (distance < bestDistance) {
          bestDistance = distance
          bestTerminal = terminal
        }
      }
      if (bestTerminal) {
        return {
          point: bestTerminal.position,
          terminalId: bestTerminal.id,
          kind: 'terminal' as const,
          guides: [] as SnapGuideLine3D[],
          snapLabel: '',
        }
      }

      // 2) Superfície física (calhas técnicas, componentes, chapa) + encaixe magnético de eixo/calha
      ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      for (const hit of hits) {
        const mesh = hit.object as THREE.Mesh
        if (!mesh.isMesh || ancestorFlag(mesh, 'noPick') || !ancestorFlag(mesh, 'wireSurface')) continue
        const normal = hit.face ? hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize() : new THREE.Vector3(0, 0, 1)
        if (normal.dot(raycaster.ray.direction) > 0) normal.negate()
        const rawPt = hit.point.clone().addScaledVector(normal, state.wireRadius + 0.006)
        const snapped = snapControlPoint3D([rawPt.x, rawPt.y, rawPt.z], {
          anchor: last ?? null,
          references: refs,
          obstacles: state.obstacles,
          outerMm,
          axisLock: event.shiftKey && !!last,
          magnetic: state.orthoSnap && !!last,
          fine: event.altKey,
          gridStep: event.altKey ? 0 : 0.025,
        })
        return {
          point: snapped.point,
          kind: snapped.inDuct ? ('duct' as const) : ('surface' as const),
          guides: snapped.guides,
          snapLabel: snapped.label ?? '',
        }
      }

      // 3) Plano virado para a câmara passando pelo último ponto (desenho livre no espaço 3D)
      const anchor = new THREE.Vector3(...(last ?? state.fallbackCenter))
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), anchor)
      const target = raycaster.ray.intersectPlane(plane, new THREE.Vector3()) ?? anchor
      const snapped = snapControlPoint3D([target.x, target.y, target.z], {
        anchor: last ?? null,
        references: refs,
        obstacles: state.obstacles,
        outerMm,
        axisLock: event.shiftKey && !!last,
        magnetic: state.orthoSnap && !!last,
        fine: event.altKey,
        gridStep: event.altKey ? 0 : 0.05,
      })
      const p = new THREE.Vector3(...snapped.point)
      const clearance = state.wireRadius + 0.02
      p.z = Math.max(p.z, wireFrontLimit(outerMm))
      if (!snapped.inDuct) {
        for (const box of state.obstacles) {
          if (box.duct) continue
          if (box.distanceToPoint(p) < clearance) p.z = Math.max(p.z, box.max.z + clearance)
        }
      }
      const finalPt: V3 = [p.x, p.y, p.z]
      const adjustedGuides = snapped.guides.map((g) => ({ ...g, to: finalPt }))
      return {
        point: finalPt,
        kind: snapped.inDuct ? ('duct' as const) : ('air' as const),
        guides: adjustedGuides,
        snapLabel: snapped.label ?? '',
      }
    }

    const publish = () => {
      frame = 0
      if (!lastEvent) return
      const found = locate(lastEvent)
      const state = latest.current
      const terminal = 'terminalId' in found ? state.terminals.find((t) => t.id === found.terminalId) : undefined
      const { compat, note } = evaluateCompat(terminal, state.draft)
      setCursor({
        point: found.point,
        terminalId: terminal?.id,
        guides: found.guides,
        compat,
      })
      const outerMm = Math.max(1.8, state.wireRadius * 200)
      const chain: V3[] = []
      if (state.draft) {
        const from = state.draft.from
        const start = 'terminalId' in from ? state.terminals.find((t) => t.id === from.terminalId)?.position : from.point
        if (start) chain.push(start)
        chain.push(...state.draft.points)
        chain.push(found.point)
      }
      const previewPts = chain.length > 1
        ? buildDraftPreviewPoints3D(chain, state.effectiveRoute, outerMm, state.orthoSnap && state.draft!.points.length === 0)
        : []
      const metrics = previewPts.length > 1
        ? wireCurveMetrics3D(previewPts, outerMm)
        : { lengthMm: 0, minBendRadiusMm: null, recommendedMinRadiusMm: Math.round(outerMm * 4 * 10) / 10, bendOk: true }
      useWireDrawInfo.setState({
        lengthMm: previewPts.length > 1 ? polylineLengthMm(previewPts) : 0,
        minBendMm: metrics.minBendRadiusMm,
        recommendedBendMm: metrics.recommendedMinRadiusMm,
        bendOk: metrics.bendOk,
        hover: terminal ? `${terminal.ref}.${terminal.label}` : '',
        surface: found.kind,
        snapLabel: found.snapLabel,
        compat,
        compatNote: note,
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
        else if (!('terminalId' in draftNow.from && draftNow.from.terminalId === found.terminalId)) {
          state.onFinish({ terminalId: found.terminalId }, { chain: event.shiftKey })
        }
        return
      }
      if (!draftNow) {
        const r = dom.getBoundingClientRect()
        ndc.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1)
        raycaster.setFromCamera(ndc, camera)
        if (raycaster.intersectObjects(scene.children, true).some((hit) => hit.object.userData?.wireHit)) return
        if (useSimStore.getState().selectedWireId) { useSimStore.getState().selectWire(null); return }
        state.onStart({ point: found.point })
        return
      }
      if (event.detail >= 2) {
        const last = draftNow.points[draftNow.points.length - 1]
        if (last) state.onFinish({ point: last })
        return
      }
      state.onAddPoint(found.point)
    }
    const onLeave = () => {
      lastEvent = null
      setCursor(null)
      useWireDrawInfo.setState({ hover: '', lengthMm: 0, snapLabel: '', compat: null, compatNote: '' })
    }
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
  return (
    <DraftWire
      draft={draft}
      terminals={terminals}
      cursor={cursor}
      radius={wireRadius}
      color={wireColor}
      sheathed={sheathed}
      sheathColor={sheathColor}
      route={effectiveRoute}
      orthoSnap={orthoSnap}
      reconnecting={reconnecting}
    />
  )
}

function DraftWire({
  draft,
  terminals,
  cursor,
  radius,
  color,
  sheathed,
  sheathColor,
  route,
  orthoSnap,
  reconnecting,
}: {
  draft: WireDraft | null
  terminals: DrawTerminal[]
  cursor: CursorState | null
  radius: number
  color: string
  sheathed: boolean
  sheathColor?: string
  route: WireRoute
  orthoSnap: boolean
  reconnecting: boolean
}) {
  const outerMm = Math.max(1.8, radius * 200)
  const startPosition = draft
    ? ('terminalId' in draft.from
        ? terminals.find((t) => t.id === (draft.from as { terminalId: string }).terminalId)?.position
        : (draft.from as { point: V3 }).point)
    : undefined

  const { previewPts, tightPoint } = useMemo(() => {
    if (!draft || !startPosition) return { previewPts: [] as V3[], tightPoint: null as V3 | null }
    const raw = [startPosition, ...draft.points, ...(cursor ? [cursor.point] : [])]
    if (raw.length < 2) return { previewPts: [] as V3[], tightPoint: null as V3 | null }
    const pts = buildDraftPreviewPoints3D(raw, route, outerMm, orthoSnap && draft.points.length === 0)
    const metrics = wireCurveMetrics3D(pts, outerMm)
    return { previewPts: pts, tightPoint: metrics.bendOk ? null : metrics.tightestPoint }
  }, [draft, startPosition, cursor, route, outerMm, orthoSnap])

  const curve = useMemo(() => {
    if (previewPts.length < 2) return null
    const vectors = previewPts.map((p) => new THREE.Vector3(...p))
    const clean = vectors.filter((p, i) => i === 0 || p.distanceTo(vectors[i - 1]) > 1e-4)
    if (clean.length < 2) return null
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let i = 1; i < clean.length; i += 1) path.add(new THREE.LineCurve3(clean[i - 1], clean[i]))
    return path
  }, [previewPts])

  const hovered = cursor?.terminalId ? terminals.find((t) => t.id === cursor.terminalId) : undefined
  const ringRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => { if (ringRef.current) ringRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 6) * 0.11) })

  const ringColor = hovered
    ? cursor?.compat === 'warn' || cursor?.compat === 'exists'
      ? '#f59e0b'
      : '#16a34a'
    : reconnecting
      ? '#f59e0b'
      : '#2563eb'
  const visibleColor = sheathed ? (sheathColor ?? '#0f172a') : color
  const visibleRadius = Math.max((sheathed ? radius * 1.25 : radius) * 0.94, 0.009)

  return (
    <group userData={{ noPick: true, noSnapshot: true }}>
      {cursor?.guides && <SnapGuides3D guides={cursor.guides} />}
      {curve && (
        <mesh renderOrder={26} raycast={() => null}>
          <tubeGeometry args={[curve, Math.min(140, Math.max(24, previewPts.length * 2)), visibleRadius, 12, false]} />
          <meshStandardMaterial color={visibleColor} roughness={0.42} transparent opacity={0.84} />
        </mesh>
      )}
      {tightPoint && (
        <group position={tightPoint}>
          <mesh renderOrder={35} raycast={() => null}>
            <torusGeometry args={[visibleRadius * 2.8 + 0.028, 0.008, 8, 24]} />
            <meshBasicMaterial color="#f59e0b" depthTest={false} />
          </mesh>
        </group>
      )}
      {draft && draft.points.map((point, index) => (
        <group key={index} position={point}>
          <mesh renderOrder={34} raycast={() => null}>
            <sphereGeometry args={[0.042, 14, 14]} />
            <meshStandardMaterial color="#2563eb" emissive="#1d4ed8" emissiveIntensity={0.5} depthTest={false} />
          </mesh>
          <Text position={[0, 0.085, 0]} fontSize={0.05} color="#1e3a8a" anchorX="center" anchorY="bottom" outlineWidth={0.003} outlineColor="#ffffff" depthOffset={-4}>
            {index + 1}
          </Text>
        </group>
      ))}
      {startPosition && draft && (
        <mesh position={startPosition} renderOrder={34} raycast={() => null}>
          <sphereGeometry args={[0.048, 14, 14]} />
          <meshStandardMaterial color="#16a34a" emissive="#15803d" emissiveIntensity={0.55} depthTest={false} />
        </mesh>
      )}
      {cursor && (
        <group position={cursor.point}>
          <mesh ref={ringRef} renderOrder={36} raycast={() => null}>
            <torusGeometry args={[hovered ? 0.076 : 0.05, 0.009, 10, 32]} />
            <meshBasicMaterial color={ringColor} depthTest={false} />
          </mesh>
          {hovered && (
            <Text position={[0, 0.125, 0]} fontSize={0.058} color="#0f172a" anchorX="center" anchorY="bottom" outlineWidth={0.004} outlineColor="#ffffff" depthOffset={-5}>
              {`${hovered.ref}.${hovered.label}${cursor.compat === 'exists' ? ' (já ligado)' : cursor.compat === 'warn' ? ' !' : ''}`}
            </Text>
          )}
        </group>
      )}
    </group>
  )
}

/** Linha compacta de estado em direto (fora do canvas). */
export function WireDrawLive({ points, drafting }: { points: number; drafting: boolean }) {
  const info = useWireDrawInfo()
  const surfaceText =
    info.surface === 'duct' ? 'Na calha' : info.surface === 'surface' ? 'Sobre superfície' : info.surface === 'air' ? 'No espaço' : ''
  return (
    <span className="panel3d-draw-live" aria-live="polite">
      {drafting && <b>{points} {points === 1 ? 'ponto' : 'pontos'}</b>}
      {drafting && info.lengthMm > 0 && <b>≈ {info.lengthMm} mm</b>}
      {drafting && info.minBendMm !== null && !info.bendOk && (
        <b className="is-warn" title={`Raio mínimo recomendado: ${info.recommendedBendMm} mm`}>R {info.minBendMm} mm &lt; Rmín</b>
      )}
      {info.snapLabel && <em>{info.snapLabel}</em>}
      {info.hover ? (
        <em className={info.compat === 'warn' || info.compat === 'exists' ? 'is-warn' : ''}>
          Borne {info.hover}{info.compatNote ? ` · ${info.compatNote}` : ''}
        </em>
      ) : (
        surfaceText && <em>{surfaceText}</em>
      )}
    </span>
  )
}

/** Cartão de telemetria e ações em direto para o painel lateral esquerdo durante a construção de cabos 3D. */
export function WireDraftSideCard({
  draft,
  originLabel,
  reconnectingLabel,
  onUndoPoint,
  onFinishFree,
  onCancel,
}: {
  draft: WireDraft | null
  originLabel: string
  reconnectingLabel: string | null
  onUndoPoint: () => void
  onFinishFree: () => void
  onCancel: () => void
}) {
  const info = useWireDrawInfo()
  const medium = useSimStore((state) => state.wireDefaults.medium ?? 'electrical')
  const fluid = medium === 'hydraulic' || medium === 'pneumatic'
  if (reconnectingLabel) {
    return (
      <div className="wo-draft-card is-active" role="status" aria-live="polite">
        <div className="wo-draft-head">
          <strong>A religar {reconnectingLabel}</strong>
          <span className="wo-draft-pill is-warn">{fluid ? 'Escolha conector' : 'Escolha borne'}</span>
        </div>
        {info.hover && <div className="wo-draft-route">Novo destino: <b>{info.hover}</b></div>}
        <div className="wo-draft-actions">
          <button type="button" onClick={onCancel}>Cancelar (Esc)</button>
        </div>
      </div>
    )
  }
  const surfaceLabel =
    info.surface === 'terminal' ? 'Borne' : info.surface === 'duct' ? 'Calha técnica' : info.surface === 'surface' ? 'Superfície' : 'Espaço 3D'
  if (!draft) {
    return (
      <div className="wo-draft-card is-ready" role="status" aria-live="polite">
        <div className="wo-draft-head">
          <strong>{fluid ? 'Escolha um conector assinalado' : 'Escolha o borne de origem'}</strong>
        </div>
        <p className="wo-draft-hint">{info.hover ? `${fluid ? 'Conector' : 'Borne'} ${info.hover}` : 'Depois escolha o destino no desenho.'}</p>
      </div>
    )
  }
  return (
    <div className="wo-draft-card is-active" role="status" aria-live="polite">
      <div className="wo-draft-head">
        <strong>Construção em curso</strong>
        <span className={`wo-draft-pill ${!info.bendOk || info.compat === 'warn' || info.compat === 'exists' ? 'is-warn' : 'is-ok'}`}>
          {info.compat === 'exists' ? 'Já ligado' : info.compat === 'warn' ? 'Verificar classe' : !info.bendOk ? 'Curva apertada' : 'Ativo'}
        </span>
      </div>
      <div className="wo-draft-route">
        <span><b>A</b> {originLabel}</span>
        <span className="wo-draft-arrow" aria-hidden="true">→</span>
        <span><b>B</b> {info.hover || surfaceLabel}</span>
      </div>
      <div className="wo-draft-metrics">
        <div><small>Compr.</small><strong>{info.lengthMm > 0 ? `${info.lengthMm} mm` : '—'}</strong></div>
        <div><small>Pontos</small><strong>{draft.points.length}</strong></div>
        <div>
          <small>Raio mín.</small>
          <strong className={!info.bendOk ? 'is-warn' : ''}>
            {info.minBendMm !== null ? `${info.minBendMm} mm` : 'Reto'}
          </strong>
        </div>
      </div>
      {(info.snapLabel || info.compatNote || !info.bendOk) && (
        <div className="wo-draft-tags">
          {info.snapLabel && <span className="wo-draft-tag">{info.snapLabel}</span>}
          {info.compatNote && <span className={`wo-draft-tag ${info.compat === 'warn' || info.compat === 'exists' ? 'is-warn' : ''}`}>{info.compatNote}</span>}
          {!info.bendOk && <span className="wo-draft-tag is-warn">Rmín ≥ {info.recommendedBendMm} mm</span>}
        </div>
      )}
      <div className="wo-draft-actions">
        <button type="button" onClick={onUndoPoint} title="Remove o último ponto largado (Backspace)">
          {draft.points.length > 0 ? 'Desfazer ponto' : 'Recomeçar'}
        </button>
        <button type="button" disabled={draft.points.length === 0} onClick={onFinishFree} title="Termina o cabo no último ponto largado (Enter / duplo clique)">
          Ponta livre
        </button>
        <button type="button" className="is-danger" onClick={onCancel} title="Cancela o cabo em construção (Esc)">
          Cancelar
        </button>
      </div>
    </div>
  )
}
