import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ComponentType, ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { isJunctionBoxType } from './junctionWagoModel'

const U = PANEL_UNITS_PER_MM

export type CableExitDirection = 'bottom' | 'top' | 'left' | 'right' | 'back'

export interface CableWaypointMm {
  x: number
  y: number
  z: number
}

export interface EditableCableConfig {
  enabled: boolean
  lengthMm: number
  diameterMm: number
  color: string
  exitDir: CableExitDirection
  bendXMm: number
  bendYMm: number
  bendZMm: number
  endXMm: number
  endYMm: number
  endZMm: number
  corrugated: boolean
  waypointsMm: CableWaypointMm[]
  linkedJunctionBoxId: string
}

export function isEditableCableDeviceType(type: ComponentType): boolean {
  return (
    type === 'floatSwitch' ||
    type === 'towerLight' ||
    type === 'proximitySensor' ||
    type === 'photoSensor' ||
    type === 'limitSwitch' ||
    type === 'thermostat' ||
    type === 'pressureSwitch' ||
    type === 'hydraulicFlowMeter' ||
    type === 'triProofLedBatten' ||
    type === 'lampLedE27' ||
    type === 'lampIncandescentE27' ||
    type === 'lampFluorescentE27' ||
    type === 'waterPump' ||
    type === 'pneumaticValve52'
  )
}

/** Condutores típicos de cada tipo de equipamento (usados nas pontas descarnadas e dentro de caixas OBO). */
export function editableCableConductorsOf(type: ComponentType): Array<{ color: string; label: string }> {
  if (type === 'floatSwitch') {
    return [
      { color: '#78350f', label: 'NA' },
      { color: '#111827', label: 'C' },
      { color: '#2563eb', label: 'NF' },
    ]
  }
  if (type === 'triProofLedBatten' || type === 'lampLedE27' || type === 'lampIncandescentE27' || type === 'lampFluorescentE27' || type === 'waterPump') {
    return [
      { color: '#92400e', label: 'L' },
      { color: '#2563eb', label: 'N' },
      { color: '#16a34a', label: 'PE' },
    ]
  }
  if (type === 'towerLight') {
    return [
      { color: '#dc2626', label: 'R' },
      { color: '#eab308', label: 'Y' },
      { color: '#16a34a', label: 'G' },
      { color: '#2563eb', label: 'COM' },
    ]
  }
  if (type === 'hydraulicFlowMeter') {
    return [
      { color: '#dc2626', label: '+24V' },
      { color: '#eab308', label: 'PULSE' },
      { color: '#111827', label: 'GND' },
    ]
  }
  return [
    { color: '#92400e', label: '+24V' },
    { color: '#111827', label: 'SIG' },
    { color: '#2563eb', label: '0V' },
  ]
}

export function editableCableConfigOf(
  state: Record<string, unknown> | undefined,
  defaults?: Partial<EditableCableConfig>,
): EditableCableConfig {
  const s = state ?? {}
  const exitRaw = String(s.cableExitDir ?? defaults?.exitDir ?? 'bottom')
  const exitDir: CableExitDirection =
    exitRaw === 'top' || exitRaw === 'left' || exitRaw === 'right' || exitRaw === 'back' ? exitRaw : 'bottom'
  const rawWps = Array.isArray(s.cableWaypointsMm) ? s.cableWaypointsMm : []
  const waypointsMm: CableWaypointMm[] = rawWps
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      x: Math.max(-4000, Math.min(4000, Number(p.x ?? 0) || 0)),
      y: Math.max(-4000, Math.min(4000, Number(p.y ?? 0) || 0)),
      z: Math.max(-4000, Math.min(4000, Number(p.z ?? 0) || 0)),
    }))
  return {
    enabled: s.cableEnabled !== undefined ? Boolean(s.cableEnabled) : (defaults?.enabled ?? false),
    lengthMm: Math.max(150, Math.min(6000, Number(s.cableLengthMm ?? defaults?.lengthMm ?? 900))),
    diameterMm: Math.max(4, Math.min(22, Number(s.cableDiameterMm ?? defaults?.diameterMm ?? 8))),
    color: typeof s.cableColor === 'string' && s.cableColor ? s.cableColor : (defaults?.color ?? '#181c22'),
    exitDir,
    bendXMm: Math.max(-2500, Math.min(2500, Number(s.cableBendXMm ?? defaults?.bendXMm ?? 0))),
    bendYMm: Math.max(-2500, Math.min(2500, Number(s.cableBendYMm ?? defaults?.bendYMm ?? 0))),
    bendZMm: Math.max(-2500, Math.min(2500, Number(s.cableBendZMm ?? defaults?.bendZMm ?? 0))),
    endXMm: Math.max(-4500, Math.min(4500, Number(s.cableEndXMm ?? defaults?.endXMm ?? 0))),
    endYMm: Math.max(-4500, Math.min(4500, Number(s.cableEndYMm ?? defaults?.endYMm ?? 0))),
    endZMm: Math.max(-4500, Math.min(4500, Number(s.cableEndZMm ?? defaults?.endZMm ?? 0))),
    corrugated: Boolean(s.cableCorrugated ?? defaults?.corrugated ?? false),
    waypointsMm,
    linkedJunctionBoxId: typeof s.linkedJunctionBoxId === 'string' ? s.linkedJunctionBoxId : '',
  }
}

/** Pega 3D arrastável no plano paralelo à câmara, convertendo automaticamente para o espaço local do grupo pai. */
function CableHandle3D({
  localPos,
  parentRef,
  onLive,
  onCommit,
  onDoubleClick,
  children,
}: {
  localPos: THREE.Vector3
  parentRef: React.RefObject<THREE.Group | null>
  onLive: (localNext: THREE.Vector3 | null) => void
  onCommit: (localFinal: THREE.Vector3, worldFinal: THREE.Vector3) => void
  onDoubleClick?: () => void
  children: ReactNode
}) {
  const { camera, gl, controls } = useThree() as {
    camera: THREE.Camera
    gl: THREE.WebGLRenderer
    controls: { enabled: boolean } | null
  }

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (event.nativeEvent.button !== 0) return
    const grp = parentRef.current
    if (!grp) return
    const dom = gl.domElement
    const originWorld = grp.localToWorld(localPos.clone())
    const camDir = camera.getWorldDirection(new THREE.Vector3())
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, originWorld)
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hitWorldAt = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect()
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(plane, new THREE.Vector3())
    }
    const grabWorld = hitWorldAt(event.nativeEvent.clientX, event.nativeEvent.clientY) ?? originWorld.clone()
    const offsetWorld = originWorld.clone().sub(grabWorld)
    const startX = event.nativeEvent.clientX
    const startY = event.nativeEvent.clientY
    let moved = false
    let lastWorld = originWorld.clone()
    let lastLocal = localPos.clone()

    if (controls) controls.enabled = false
    dom.style.cursor = 'grabbing'

    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 2.5) return
      moved = true
      const hit = hitWorldAt(e.clientX, e.clientY)
      if (!hit) return
      hit.add(offsetWorld)
      lastWorld = hit.clone()
      lastLocal = grp.worldToLocal(hit.clone())
      onLive(lastLocal)
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (controls) controls.enabled = true
      dom.style.cursor = ''
      if (moved) onCommit(lastLocal, lastWorld)
      onLive(null)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <group
      position={localPos}
      userData={{ noPick: true, noSnapshot: true }}
      onPointerDown={onPointerDown}
      onPointerOver={(e) => {
        e.stopPropagation()
        gl.domElement.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        gl.domElement.style.cursor = ''
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={
        onDoubleClick
          ? (e) => {
              e.stopPropagation()
              onDoubleClick()
            }
          : undefined
      }
    >
      {children}
      {/* Esfera invisível generosa para facilitar agarrar a pega */}
      <mesh>
        <sphereGeometry args={[0.18, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

function CableInsertBead3D({
  position,
  onInsert,
}: {
  position: THREE.Vector3
  onInsert: () => void
}) {
  const { gl } = useThree()
  const [hover, setHover] = useState(false)
  return (
    <group
      position={position}
      userData={{ noPick: true, noSnapshot: true }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        gl.domElement.style.cursor = 'copy'
      }}
      onPointerOut={() => {
        setHover(false)
        gl.domElement.style.cursor = ''
      }}
      onClick={(e) => {
        e.stopPropagation()
        onInsert()
      }}
    >
      <mesh renderOrder={31}>
        <sphereGeometry args={[hover ? 0.056 : 0.036, 12, 12]} />
        <meshStandardMaterial
          color={hover ? '#0ea5e9' : '#7dd3fc'}
          emissive={hover ? '#0284c7' : '#38bdf8'}
          emissiveIntensity={hover ? 0.7 : 0.35}
          transparent
          opacity={hover ? 0.96 : 0.72}
          depthTest={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.13, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

/**
 * Cabo de campo 3D totalmente selecionável e editável diretamente no espaço 3D para
 * luminárias, sensores, bóias, torres de sinalização, contadores e atuadores.
 * - Clique diretamente no cabo para selecionar e exibir pegas 3D de curvas e ponta.
 * - Arraste as pegas azuis para moldar curvas, clique nos pontos intermédios `+` para criar novas curvas,
 *   duplo-clique numa pega azul para a remover, ou arraste a ponta verde até uma caixa OBO para encaixar no bucim!
 */
export function EditableFieldCable3D({
  component,
  anchor = [0, 0, 0],
  defaultConfig,
  conductorColors,
  externalTarget = null,
}: {
  component: ElectricalComponent
  anchor?: [number, number, number]
  defaultConfig?: Partial<EditableCableConfig>
  conductorColors?: string[]
  /** Alvo local 3D (ex.: bucim PG13.5 de uma caixa OBO escolhida) onde a ponta do cabo entra automaticamente. */
  externalTarget?: [number, number, number] | null
}) {
  const cfg = editableCableConfigOf(component.state, defaultConfig)
  const selected = useSimStore((s) => s.selectedComponentIds.includes(component.id))
  const selectComponents = useSimStore((s) => s.selectComponents)
  const setComponentState = useSimStore((s) => s.setComponentState)
  const { gl } = useThree()
  const groupRef = useRef<THREE.Group>(null)
  const [hoverCable, setHoverCable] = useState(false)
  // Pré-visualização ao vivo durante arrasto 3D de um ponto de curva (`index >= 0`) ou da ponta (`index === -1`).
  const [liveDrag, setLiveDrag] = useState<{ kind: 'wp' | 'mid' | 'end'; index: number; pos: THREE.Vector3 } | null>(null)

  const resolvedColors = useMemo(
    () => conductorColors ?? editableCableConductorsOf(component.type).map((c) => c.color),
    [conductorColors, component.type],
  )

  const built = useMemo(() => {
    if (!cfg.enabled) return null
    const L = cfg.lengthMm * U
    const R = Math.max(0.016, cfg.diameterMm * 0.5 * U)
    const dirVec =
      cfg.exitDir === 'top'
        ? new THREE.Vector3(0, 1, 0)
        : cfg.exitDir === 'left'
          ? new THREE.Vector3(-1, 0, 0)
          : cfg.exitDir === 'right'
            ? new THREE.Vector3(1, 0, 0)
            : cfg.exitDir === 'back'
              ? new THREE.Vector3(0, 0, -1)
              : new THREE.Vector3(0, -1, 0)

    const p0 = new THREE.Vector3(anchor[0], anchor[1], anchor[2])
    const p1 = p0.clone().addScaledVector(dirVec, Math.min(L * 0.22, 0.34))

    const defaultEnd = p0
      .clone()
      .addScaledVector(dirVec, L * 0.72)
      .add(new THREE.Vector3(dirVec.x === 0 ? L * 0.2 : 0, dirVec.y === 0 ? -L * 0.2 : 0, 0))

    let pEnd = externalTarget
      ? new THREE.Vector3(externalTarget[0], externalTarget[1], externalTarget[2])
      : new THREE.Vector3(
          defaultEnd.x + cfg.endXMm * U,
          defaultEnd.y + cfg.endYMm * U,
          defaultEnd.z + cfg.endZMm * U,
        )
    if (liveDrag?.kind === 'end') pEnd = liveDrag.pos.clone()

    // Pontos intermédios editáveis (se o utilizador criou waypoints múltiplos usa-os; caso contrário usa o ponto central editável)
    const hasCustomWps = cfg.waypointsMm.length > 0
    const defaultMid = p0.clone().lerp(pEnd, 0.52).add(
      new THREE.Vector3(
        cfg.bendXMm * U,
        cfg.bendYMm * U - (cfg.exitDir === 'left' || cfg.exitDir === 'right' ? 0.12 : 0),
        cfg.bendZMm * U + 0.05,
      ),
    )

    const editPoints: THREE.Vector3[] = hasCustomWps
      ? cfg.waypointsMm.map((wp, idx) =>
          liveDrag?.kind === 'wp' && liveDrag.index === idx
            ? liveDrag.pos.clone()
            : new THREE.Vector3(p0.x + wp.x * U, p0.y + wp.y * U, p0.z + wp.z * U),
        )
      : [liveDrag?.kind === 'mid' ? liveDrag.pos.clone() : defaultMid]

    // Se ligado a uma caixa OBO (`externalTarget`), adicionar aproximação vertical limpa sobre o bucim PG13.5!
    const preEntry = externalTarget ? new THREE.Vector3(pEnd.x, pEnd.y + 0.24, pEnd.z) : null

    const curvePts: THREE.Vector3[] = [p0, p1, ...editPoints, ...(preEntry ? [preEntry] : []), pEnd]
    const curve = new THREE.CatmullRomCurve3(curvePts)
    const segs = Math.max(36, curvePts.length * 14)
    const tube = new THREE.TubeGeometry(curve, segs, R, 12, false)

    // Pontos intermédios para inserir novas curvas com 1 clique
    const chain: THREE.Vector3[] = [p0, ...editPoints, pEnd]
    const insertBeads: Array<{ pos: THREE.Vector3; insertAt: number }> = []
    for (let i = 0; i < chain.length - 1; i++) {
      insertBeads.push({ pos: chain[i].clone().lerp(chain[i + 1], 0.5), insertAt: i })
    }

    const ringMatrices: THREE.Matrix4[] = []
    if (cfg.corrugated) {
      const steps = Math.max(12, Math.min(90, Math.round(curve.getLength() / Math.max(0.032, R * 1.15))))
      const up = new THREE.Vector3(0, 1, 0)
      const q = new THREE.Quaternion()
      const s = new THREE.Vector3(1, 1, 1)
      for (let i = 1; i < steps; i++) {
        const t = i / steps
        const pt = curve.getPointAt(t)
        const tan = curve.getTangentAt(t).normalize()
        q.setFromUnitVectors(up, tan)
        ringMatrices.push(new THREE.Matrix4().compose(pt, q, s))
      }
    }

    const endTan = curve.getTangentAt(1).normalize()
    const endQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), endTan)

    return { tube, R, p0, pEnd, defaultEnd, defaultMid, editPoints, hasCustomWps, insertBeads, endQuat, ringMatrices, dirVec }
  }, [
    cfg.enabled,
    cfg.lengthMm,
    cfg.diameterMm,
    cfg.exitDir,
    cfg.bendXMm,
    cfg.bendYMm,
    cfg.bendZMm,
    cfg.endXMm,
    cfg.endYMm,
    cfg.endZMm,
    cfg.corrugated,
    cfg.waypointsMm,
    anchor[0],
    anchor[1],
    anchor[2],
    externalTarget?.[0],
    externalTarget?.[1],
    externalTarget?.[2],
    liveDrag,
  ])

  useEffect(() => () => { built?.tube.dispose() }, [built])

  if (!built) return null

  const { tube, R, p0, pEnd, defaultEnd, editPoints, hasCustomWps, insertBeads, endQuat, ringMatrices, dirVec } = built
  const glandQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec)

  const commitWaypoint = (idx: number, localPos: THREE.Vector3) => {
    if (!hasCustomWps) {
      // Converte automaticamente para waypoint explícito na posição arrastada
      const wp: CableWaypointMm = {
        x: Math.round((localPos.x - p0.x) / U),
        y: Math.round((localPos.y - p0.y) / U),
        z: Math.round((localPos.z - p0.z) / U),
      }
      setComponentState(component.id, { cableWaypointsMm: [wp] })
      return
    }
    const next = cfg.waypointsMm.slice()
    next[idx] = {
      x: Math.round((localPos.x - p0.x) / U),
      y: Math.round((localPos.y - p0.y) / U),
      z: Math.round((localPos.z - p0.z) / U),
    }
    setComponentState(component.id, { cableWaypointsMm: next })
  }

  const removeWaypoint = (idx: number) => {
    if (!hasCustomWps) {
      setComponentState(component.id, { cableBendXMm: 0, cableBendYMm: 0, cableBendZMm: 0 })
      return
    }
    const next = cfg.waypointsMm.filter((_, i) => i !== idx)
    setComponentState(component.id, { cableWaypointsMm: next })
  }

  const insertWaypointAt = (insertAt: number, pos: THREE.Vector3) => {
    const base: CableWaypointMm[] = hasCustomWps
      ? cfg.waypointsMm.slice()
      : editPoints.map((pt) => ({
          x: Math.round((pt.x - p0.x) / U),
          y: Math.round((pt.y - p0.y) / U),
          z: Math.round((pt.z - p0.z) / U),
        }))
    const newWp: CableWaypointMm = {
      x: Math.round((pos.x - p0.x) / U),
      y: Math.round((pos.y - p0.y) / U),
      z: Math.round((pos.z - p0.z) / U),
    }
    base.splice(insertAt, 0, newWp)
    setComponentState(component.id, { cableWaypointsMm: base })
  }

  const commitTip = (localPos: THREE.Vector3, worldPos: THREE.Vector3) => {
    // Se a ponta verde for largada junto de uma caixa de derivação OBO, liga automaticamente dentro dela!
    const st = useSimStore.getState()
    let snappedBoxId = ''
    let bestDist = 1.15
    for (const other of st.components) {
      if (!isJunctionBoxType(other.type) || other.id === component.id) continue
      const op = other.panel3DPosition
      if (!op) continue
      const d = Math.hypot(worldPos.x - op.x, worldPos.y - op.y, worldPos.z - op.z)
      if (d < bestDist) {
        bestDist = d
        snappedBoxId = other.id
      }
    }
    if (snappedBoxId) {
      setComponentState(component.id, { linkedJunctionBoxId: snappedBoxId })
      return
    }
    setComponentState(component.id, {
      linkedJunctionBoxId: '',
      cableEndXMm: Math.round((localPos.x - defaultEnd.x) / U),
      cableEndYMm: Math.round((localPos.y - defaultEnd.y) / U),
      cableEndZMm: Math.round((localPos.z - defaultEnd.z) / U),
    })
  }

  return (
    <group ref={groupRef} name={`editable-field-cable-${component.id}`}>
      {/* Prensa-cabo PG na saída do equipamento */}
      <group position={p0} quaternion={glandQuat}>
        <mesh position={[0, R * 1.1, 0]} castShadow>
          <cylinderGeometry args={[R * 1.45, R * 1.65, R * 2.2, 6]} />
          <meshStandardMaterial color="#475569" roughness={0.44} metalness={0.35} />
        </mesh>
        <mesh position={[0, R * 2.35, 0]} castShadow>
          <cylinderGeometry args={[R * 1.18, R * 1.38, R * 1.1, 12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.68} />
        </mesh>
      </group>

      {/* Bainha principal clicável para selecionar diretamente o cabo em 3D */}
      <mesh
        geometry={tube}
        castShadow
        receiveShadow
        onPointerOver={(e) => {
          e.stopPropagation()
          setHoverCable(true)
          gl.domElement.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHoverCable(false)
          gl.domElement.style.cursor = ''
        }}
        onClick={(e) => {
          e.stopPropagation()
          selectComponents([component.id])
        }}
      >
        <meshStandardMaterial
          color={cfg.color}
          emissive={selected ? '#0284c7' : hoverCable ? '#38bdf8' : '#000000'}
          emissiveIntensity={selected ? 0.28 : hoverCable ? 0.18 : 0}
          roughness={0.52}
          metalness={0.08}
        />
      </mesh>

      {/* Anéis de tubo corrugado de proteção (se ativo) */}
      {cfg.corrugated &&
        ringMatrices.map((m, idx) => {
          const pos = new THREE.Vector3()
          const quat = new THREE.Quaternion()
          const scl = new THREE.Vector3()
          m.decompose(pos, quat, scl)
          return (
            <mesh key={idx} position={pos} quaternion={quat} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <torusGeometry args={[R * 1.18, R * 0.24, 6, 12]} />
              <meshStandardMaterial color="#1c2026" roughness={0.58} metalness={0.12} />
            </mesh>
          )
        })}

      {/* Pontas descarnadas coloridas + ponteiras metálicas (ocultas quando já está encaixado dentro de uma caixa OBO) */}
      {!externalTarget && (
        <group position={pEnd} quaternion={endQuat}>
          {resolvedColors.map((col, idx) => {
            const offset = (idx - (resolvedColors.length - 1) / 2) * R * 1.05
            return (
              <group key={idx} position={[offset, 0, 0]}>
                <mesh position={[0, -R * 2.4, 0]} castShadow>
                  <cylinderGeometry args={[R * 0.34, R * 0.34, R * 4.8, 8]} />
                  <meshStandardMaterial color={col} roughness={0.45} />
                </mesh>
                <mesh position={[0, -R * 5.2, 0]}>
                  <cylinderGeometry args={[R * 0.22, R * 0.22, R * 1.6, 8]} />
                  <meshStandardMaterial color="#e2e8f0" metalness={0.9} roughness={0.2} />
                </mesh>
              </group>
            )
          })}
        </group>
      )}

      {/* Pegas 3D interativas visíveis quando selecionado: arrastar curvas (azuis), inserir curva (+) e arrastar ponta (verde)! */}
      {selected && (
        <group name={`editable-cable-handles-${component.id}`} userData={{ noSnapshot: true }}>
          {editPoints.map((pt, idx) => (
            <CableHandle3D
              key={`wp-${idx}`}
              localPos={pt}
              parentRef={groupRef}
              onLive={(next) => setLiveDrag(next ? { kind: hasCustomWps ? 'wp' : 'mid', index: idx, pos: next } : null)}
              onCommit={(next) => commitWaypoint(idx, next)}
              onDoubleClick={() => removeWaypoint(idx)}
            >
              <mesh renderOrder={32}>
                <sphereGeometry args={[0.072, 16, 16]} />
                <meshStandardMaterial color="#2563eb" emissive="#1d4ed8" emissiveIntensity={0.65} depthTest={false} />
              </mesh>
            </CableHandle3D>
          ))}

          {insertBeads.map((b, idx) => (
            <CableInsertBead3D key={`ins-${idx}`} position={b.pos} onInsert={() => insertWaypointAt(b.insertAt, b.pos)} />
          ))}

          {/* Pega verde da ponta do cabo: arraste livremente ou solte em cima de uma caixa OBO para ligar lá dentro! */}
          <CableHandle3D
            localPos={pEnd}
            parentRef={groupRef}
            onLive={(next) => setLiveDrag(next ? { kind: 'end', index: -1, pos: next } : null)}
            onCommit={(nextLocal, nextWorld) => commitTip(nextLocal, nextWorld)}
          >
            <mesh renderOrder={32}>
              <sphereGeometry args={[0.082, 16, 16]} />
              <meshStandardMaterial
                color={externalTarget ? '#f59e0b' : '#16a34a'}
                emissive={externalTarget ? '#d97706' : '#15803d'}
                emissiveIntensity={0.68}
                depthTest={false}
              />
            </mesh>
          </CableHandle3D>
        </group>
      )}
    </group>
  )
}
