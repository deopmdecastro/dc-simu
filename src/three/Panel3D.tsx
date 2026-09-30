import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Text, Line, TransformControls, Edges, useGLTF } from '@react-three/drei'
import { useRef, useMemo, useState, useEffect, Suspense, Component } from 'react'
import type { ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import { IconHelp } from '../ui/icons'
import type { ElectricalComponent, ComponentType, SpatialPoint3D, Wire, WireColor } from '../types'
import * as THREE from 'three'
import { cloneModelScene } from './modelFit'
import { getCommandModelSpec, getComponentModelSpec, hasComponent3DModel, hasDinRailModel, isMountingRail, PANEL_UNITS_PER_MM } from './modelPaths'
import { componentHalfExtents, isPanelBound, PLATE_THICKNESS, PLATE_Z, RAIL_Y } from './panelBounds'
import { buildDinRailGroup, clampRailLengthMm, createGalvanizedMaterial, DIN_RAIL_15X55 } from './dinRailGeometry'
import { RAIL_MOUNT_TYPE_PREFIXES } from './railMount'
import { componentPanelXY, dropOnSchematic, panelToSchematicX, panelToSchematicY, schematicToPanelX, schematicToPanelY } from './panelLayout'
import { componentOrientationOf, orientationRadians } from './componentOrientation'
import { component3DDimensions, component3DScaleOf, component3DVolumeCenter, schematicRotationRadians, terminalLocal3D, terminalPositionFromLocal3D, terminalWorld3D } from './terminal3D'
import ComponentViewEditor from '../components/ComponentViewEditor'
import ViewCube, { type ViewCubeFace, type ViewCubeRequest } from '../components/ViewCube'
import { wireEnergyEffectVisible } from './panel3DEditing'

const SLOT_WIDTH = 0.72
const PANEL_FLOOR_Y = -2.6
/** Margem (1 = 100 mm) da chapa à volta do equipamento. */
const PLATE_MARGIN = 0.6
/** A calha assenta na chapa (mesma cota para todas as calhas). */
const RAIL_FLUSH_Z = PLATE_Z + PLATE_THICKNESS / 2 + (DIN_RAIL_15X55.height / 2) * PANEL_UNITS_PER_MM

const MOTOR_TARGET_HEIGHT = getComponentModelSpec('motor3ph')!.targetHeight
const MOTOR_SCALE_RATIO = MOTOR_TARGET_HEIGHT / 1.04
/** Centro físico do DRN80, com os pés apoiados no piso. */
const MOTOR_CENTER_Y = PANEL_FLOOR_Y + MOTOR_TARGET_HEIGHT / 2

/* ------------------------------------------------------------------ helpers */

/** Marcador 3D do borne acompanha o diâmetro definido no Esquema (9 px = tamanho padrão). */
const terminalMarkerScale = (terminal: { diameter?: number }): number =>
  typeof terminal.diameter === 'number' && terminal.diameter > 0 ? Math.max(0.35, Math.min(2.6, terminal.diameter / 9)) : 1

function Label({ text, position, color = '#0f172a', size = 0.085 }: { text: string; position: [number, number, number]; color?: string; size?: number }) {
  return (
    <Text position={position} fontSize={size} color={color} anchorX="center" anchorY="middle">
      {text}
    </Text>
  )
}

/** Retângulo (unidades de cena) ocupado pela chapa de montagem no plano do painel. */
interface PlateBounds { minX: number; maxX: number; minY: number; maxY: number }

/** Chapa de montagem: acompanha o conteúdo do Esquema (à escala real). As calhas são componentes reais. */
function MountingPlate({ bounds }: { bounds: PlateBounds }) {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  return (
    <mesh position={[(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, PLATE_Z]} receiveShadow>
      <boxGeometry args={[width, height, PLATE_THICKNESS]} />
      <meshStandardMaterial color="#eef1f4" metalness={0.15} roughness={0.75} />
      <Edges color="#9aa7b8" threshold={15} />
    </mesh>
  )
}

/** Calha DIN perfurada 15 × 5,5 mm com comprimento editável (furos regenerados, nunca esticados). */
function MountingRail3D({ c, position, lengthOverrideMm, labelText }: { c?: ElectricalComponent; position: [number, number, number]; lengthOverrideMm?: number; labelText?: string }) {
  const lengthMm = clampRailLengthMm(lengthOverrideMm ?? c?.state.lengthMm)
  const group = useMemo(() => {
    const material = createGalvanizedMaterial()
    const rail = buildDinRailGroup(lengthMm, 0.01, material)
    rail.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true } })
    return rail
  }, [lengthMm])
  useEffect(() => () => {
    group.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
    })
  }, [group])
  const baseCenterZ = (DIN_RAIL_15X55.height / 2) * 0.01
  return <group position={position}>
    <group position={[0, 0, -baseCenterZ]}><primitive object={group} /></group>
    <Label text={labelText ?? `${c?.ref ?? 'TR'} · ${Math.round(lengthMm)} mm`} position={[0, DIN_RAIL_15X55.width * 0.01 * 0.5 + 0.1, baseCenterZ + 0.02]} size={0.065} color="#475569" />
  </group>
}

/* ------------------------------------------------------------------- peças */

function Breaker3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const closed = c.state.closed && !c.state.tripped
  const poles = c.terminals.filter((t) => t.kind === 'power-in').length || 1
  const bodyW = 0.4 + poles * 0.14
  return (
    <group position={[x, RAIL_Y + 0.36, 0]}>
      <mesh castShadow>
        <boxGeometry args={[bodyW, 0.72, 0.36]} />
        <meshStandardMaterial color={c.state.tripped ? '#7f1d1d' : c.bodyColor ?? '#e5e7eb'} />
      </mesh>
      {Array.from({ length: poles }).map((_, i) => (
        <mesh key={i} position={[-bodyW / 2 + 0.18 + i * 0.16, 0.46, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.08, 12]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0.12, 0.2]} rotation={[closed ? -0.32 : 0.5, 0, 0]}>
        <boxGeometry args={[bodyW * 0.35, 0.26, 0.07]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <Label text={c.ref} position={[0, 0.47, 0.2]} />
    </group>
  )
}

function PhoenixEcb3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const closed = !!c.state.closed && !c.state.tripped
  const body = c.state.tripped ? '#26282b' : '#17191b'
  return <group position={[x, RAIL_Y + 0.48, 0]}>
    <mesh castShadow><boxGeometry args={[0.39, 0.94, 0.38]} /><meshStandardMaterial color={body} roughness={0.62} /></mesh>
    <mesh position={[0, 0.04, 0.197]}><boxGeometry args={[0.31, 0.66, 0.018]} /><meshStandardMaterial color="#34383b" roughness={0.7} /></mesh>
    <mesh position={[0, 0.18, 0.211]}><boxGeometry args={[0.23, 0.13, 0.012]} /><meshStandardMaterial color={closed ? '#166534' : c.state.tripped ? '#991b1b' : '#50565b'} emissive={closed ? '#16a34a' : c.state.tripped ? '#ef4444' : '#000000'} emissiveIntensity={closed || c.state.tripped ? 0.35 : 0} /></mesh>
    {[0.34, -0.36].map((y) => <mesh key={y} position={[0, y, 0.22]}><cylinderGeometry args={[0.045, 0.045, 0.025, 12]} /><meshStandardMaterial color="#b3b7ba" metalness={0.72} roughness={0.28} /></mesh>)}
    <Label text="EC-E" position={[0, 0.02, 0.22]} color="#f1f3f4" size={0.075} />
    <Label text="1A · 12V DC" position={[0, -0.13, 0.22]} color="#d1d5d8" size={0.047} />
    <Label text={c.ref} position={[0, 0.55, 0.22]} color="#e2e8f0" size={0.075} />
  </group>
}

function ThermalRelay3D({ c, x }: { c: ElectricalComponent; x: number }) {
  return (
    <group position={[x, RAIL_Y + 0.34, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.6, 0.68, 0.38]} />
        <meshStandardMaterial color={c.state.tripped ? '#b91c1c' : '#c2830a'} />
      </mesh>
      <mesh position={[0, -0.1, 0.21]}>
        <boxGeometry args={[0.26, 0.2, 0.04]} />
        <meshStandardMaterial color={c.state.tripped ? '#ef4444' : '#1c1917'} emissive={c.state.tripped ? '#ef4444' : '#000000'} emissiveIntensity={c.state.tripped ? 1 : 0} />
      </mesh>
      <Label text={c.ref} position={[0, 0.4, 0.2]} />
    </group>
  )
}

function Contactor3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const en = !!c.state.energized
  const poles = c.terminals.filter((t) => t.kind === 'power-in').length || 1
  return (
    <group position={[x, RAIL_Y + 0.4, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.62 + poles * 0.1, 0.82, 0.44]} />
        <meshStandardMaterial color={c.bodyColor ?? '#374151'} />
      </mesh>
      <mesh position={[0, 0.1, 0.23 + (en ? 0.035 : 0)]} castShadow>
        <boxGeometry args={[0.42, 0.32, 0.09]} />
        <meshStandardMaterial color={en ? '#22c55e' : '#6b7280'} emissive={en ? '#16a34a' : '#000000'} emissiveIntensity={en ? 0.55 : 0} />
      </mesh>
      <mesh position={[0.2, 0.34, 0.24]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color={en ? '#22c55e' : '#334155'} emissive={en ? '#22c55e' : '#000000'} emissiveIntensity={en ? 1.2 : 0} />
      </mesh>
      <Label text={c.ref} position={[0, 0.52, 0.23]} />
    </group>
  )
}

/* ---------- Siemens LOGO! 12/24RC — modelo 3D real (GLTF/GLB) ---------- */
const LOGO_1224RC_SPEC = getComponentModelSpec('plcSiemensLogo1224RC')!
const LOGO_1224RC_MODEL_URL = LOGO_1224RC_SPEC.path
const LOGO_1224RC_ROTATION = LOGO_1224RC_SPEC.rotation
const LOGO_1224RC_TARGET_HEIGHT = LOGO_1224RC_SPEC.targetHeight

function applyRenderMode(group: THREE.Group | null, mode: ElectricalComponent['view3DRenderMode'], bodyColor?: string) {
  if (!group) return
  group.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => {
      const visual = material as THREE.Material & { wireframe?: boolean; opacity: number; transparent: boolean; depthWrite: boolean }
      const colorMaterial = visual as typeof visual & { color?: THREE.Color }
      if (!visual.userData.dcSimuPresentationBase) visual.userData.dcSimuPresentationBase = {
        wireframe: !!visual.wireframe,
        opacity: visual.opacity,
        transparent: visual.transparent,
        depthWrite: visual.depthWrite,
        color: colorMaterial.color?.getHexString(),
      }
      const base = visual.userData.dcSimuPresentationBase as { wireframe: boolean; opacity: number; transparent: boolean; depthWrite: boolean; color?: string }
      visual.wireframe = mode === 'wireframe' ? true : base.wireframe
      visual.opacity = mode === 'xray' ? Math.min(0.34, base.opacity) : base.opacity
      visual.transparent = mode === 'xray' ? true : base.transparent
      visual.depthWrite = mode === 'xray' ? false : base.depthWrite
      if (colorMaterial.color && base.color) {
        colorMaterial.color.set(`#${base.color}`)
        if (bodyColor) colorMaterial.color.lerp(new THREE.Color(bodyColor), 0.34)
      }
      visual.needsUpdate = true
    })
  })
}

/** Junta a um ponto do volume (0..1) às faces próximas — bornes ficam colados à superfície do corpo. */
const FACE_SNAP = 0.035
function snapToVolumeFaces(point: { x: number; y: number; z: number }) {
  const snap = (value: number) => (value <= FACE_SNAP ? 0 : value >= 1 - FACE_SNAP ? 1 : value)
  return { x: snap(point.x), y: snap(point.y), z: snap(point.z) }
}

/**
 * Borne editável diretamente no 3D: arraste para o mover num plano paralelo ao ecrã,
 * Shift+arraste move-o em profundidade (eixo Z do componente), Alt desliga o íman às faces.
 * O Esquema 2D acompanha o ponto (ver `setViewTerminalPosition3D`).
 */
function EditableTerminal3D({ component, terminal, active }: { component: ElectricalComponent; terminal: ElectricalComponent['terminals'][number]; active: boolean }) {
  const k = terminalMarkerScale(terminal)
  const handle = useRef<THREE.Group>(null)
  const dragCleanup = useRef<(() => void) | null>(null)
  const { camera, gl, controls } = useThree()
  const setActive = useSimStore((state) => state.setViewActiveTerminal)
  const setPosition3D = useSimStore((state) => state.setViewTerminalPosition3D)
  const labelsMode = useSimStore((state) => state.viewOrientationEditor?.trackingLabels ?? 'active')
  const [hover, setHover] = useState(false)
  const position = terminalLocal3D(component, terminal)
  useEffect(() => () => dragCleanup.current?.(), [])

  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    const node = handle.current
    if (event.button !== 0 || !node?.parent) return
    event.stopPropagation()
    setActive(terminal.id)
    const parent = node.parent
    const depthMode = event.shiftKey
    const startLocal = node.position.clone()
    const world = node.getWorldPosition(new THREE.Vector3())
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), world)
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hit = new THREE.Vector3()
    const startY = event.clientY
    let offset: THREE.Vector3 | null = null
    const control = controls as unknown as { enabled: boolean } | null
    if (control) control.enabled = false
    gl.domElement.style.cursor = 'grabbing'
    const onMove = (domEvent: PointerEvent) => {
      let local: THREE.Vector3
      if (depthMode) {
        local = startLocal.clone().add(new THREE.Vector3(0, 0, (startY - domEvent.clientY) * 0.004))
      } else {
        const rect = gl.domElement.getBoundingClientRect()
        ndc.set(((domEvent.clientX - rect.left) / rect.width) * 2 - 1, -(((domEvent.clientY - rect.top) / rect.height) * 2 - 1))
        raycaster.setFromCamera(ndc, camera)
        if (!raycaster.ray.intersectPlane(plane, hit)) return
        parent.updateWorldMatrix(true, false)
        const pointer = parent.worldToLocal(hit.clone())
        if (!offset) offset = startLocal.clone().sub(pointer) // o ponto agarrado não salta para o cursor
        local = pointer.add(offset)
      }
      const next = terminalPositionFromLocal3D(component, local)
      setPosition3D(terminal.id, domEvent.altKey ? next : snapToVolumeFaces(next))
    }
    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (control) control.enabled = true
      gl.domElement.style.cursor = ''
      dragCleanup.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    dragCleanup.current = finish
  }

  const showLabel = labelsMode === 'all' || (labelsMode !== 'off' && (active || hover))
  return <group
    ref={handle}
    position={position}
    onPointerDown={startDrag}
    onClick={(event) => { event.stopPropagation(); setActive(terminal.id) }}
    onPointerOver={(event) => { event.stopPropagation(); setHover(true); gl.domElement.style.cursor = 'grab' }}
    onPointerOut={() => { setHover(false); if (!dragCleanup.current) gl.domElement.style.cursor = '' }}
  >
    <mesh renderOrder={31}>
      <sphereGeometry args={[(active ? 0.06 : hover ? 0.052 : 0.042) * k, 18, 18]} />
      <meshStandardMaterial color={active ? '#22d3ee' : terminal.color} emissive={active ? '#0891b2' : '#000000'} emissiveIntensity={active ? 0.7 : 0} metalness={0.2} roughness={0.35} depthTest={false} />
    </mesh>
    {active && <mesh renderOrder={30}>
      <sphereGeometry args={[0.095 * k, 18, 18]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.22} depthTest={false} depthWrite={false} />
    </mesh>}
    {showLabel && <Text position={[0, 0.05 + 0.035 * k, 0]} fontSize={0.06} color={active ? '#0e7490' : '#1e293b'} anchorX="center" anchorY="bottom" depthOffset={-2}>{terminal.label}</Text>}
  </group>
}

function ConnectionTerminal3D({ component, terminal, active, onPick }: {
  component: ElectricalComponent
  terminal: ElectricalComponent['terminals'][number]
  active: boolean
  onPick: (terminalId: string) => void
}) {
  const position = terminalLocal3D(component, terminal)
  const k = terminalMarkerScale(terminal)
  return <group position={position} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onPick(terminal.id) }}>
    <mesh renderOrder={30}>
      <sphereGeometry args={[(active ? 0.07 : 0.052) * k, 18, 18]} />
      <meshStandardMaterial color={active ? '#22d3ee' : terminal.color} emissive={active ? '#0891b2' : terminal.color} emissiveIntensity={active ? 1 : 0.3} depthTest={false} />
    </mesh>
    <Text position={[0, 0.05 + 0.04 * k, 0]} fontSize={0.055} color="#0f172a" anchorX="center" anchorY="bottom" depthOffset={-3}>{terminal.label}</Text>
  </group>
}

/** Textura radial partilhada do brilho de seleção. */
let glowTexture: THREE.CanvasTexture | null = null
function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.16, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(125,180,255,0.55)')
  gradient.addColorStop(0.4, 'rgba(96,165,250,0.22)')
  gradient.addColorStop(0.75, 'rgba(59,130,246,0.06)')
  gradient.addColorStop(1, 'rgba(37,99,235,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  glowTexture = new THREE.CanvasTexture(canvas)
  glowTexture.colorSpace = THREE.SRGBColorSpace
  return glowTexture
}

/** Brilho suave atrás do componente selecionado. Substitui o anel do chão, que
 * cortava/tapava o modelo: é um sprite aditivo sem escrita de profundidade. */
function SelectionGlow({ component }: { component: ElectricalComponent }) {
  const size = component3DDimensions(component)
  const scale = component3DScaleOf(component)
  const diameter = Math.max(size.x * scale.x, size.y * scale.y, size.z * scale.z) * 1.7 + 0.12
  const center = component3DVolumeCenter(component)
  const material = useMemo(() => new THREE.SpriteMaterial({
    map: getGlowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
  }), [])
  useEffect(() => () => material.dispose(), [material])
  // Fade-in suave em vez de aparecer de repente.
  useFrame((_, delta) => { material.opacity += (0.6 - material.opacity) * Math.min(1, delta * 9) })
  return <sprite position={[center.x, center.y, center.z]} scale={[diameter, diameter, 1]} material={material} renderOrder={-1} raycast={() => null} />
}

function OrientedInstance({ c, pivot, sourcePivot, orientation, selected, editingTerminals, movable, draggable, connectionMode, connectionStartId, onSelect, onMove, onDragStart, onDragTo, onDragEnd, onTerminalPick, children }: {
  c: ElectricalComponent
  pivot: [number, number, number]
  sourcePivot: [number, number, number]
  orientation: ElectricalComponent['viewOrientation']
  selected: boolean
  editingTerminals: boolean
  movable: boolean
  /** Clicar e arrastar o corpo do componente move-o diretamente no painel. */
  draggable: boolean
  connectionMode: boolean
  connectionStartId: string | null
  onSelect: () => void
  /** Gizmo de mover: posição final (o 3D só edita o plano do painel — X/Y). */
  onMove: (position: SpatialPoint3D) => void
  /** Arrasto direto: início (histórico), posição viva no plano do painel e fim (imã de calha). */
  onDragStart: () => void
  onDragTo: (position: { x: number; y: number }) => void
  onDragEnd: () => void
  onTerminalPick: (terminalId: string) => void
  children: ReactNode
}) {
  const rootRef = useRef<THREE.Group>(null)
  const modelRef = useRef<THREE.Group>(null)
  const dragRef = useRef<{ plane: THREE.Plane; offset: THREE.Vector3; startX: number; startY: number; moved: boolean; cleanup: () => void } | null>(null)
  const { camera, gl, controls } = useThree()
  const activeTerminalId = useSimStore((state) => state.viewOrientationEditor?.activeTerminalId)
  const rotation = orientationRadians(orientation)
  const scale = component3DScaleOf(c)
  const renderMode = c.view3DRenderMode ?? 'solid'
  useEffect(() => applyRenderMode(modelRef.current, renderMode, c.bodyColor), [renderMode, c.bodyColor, children])
  useFrame(() => { if (renderMode !== 'solid' || c.bodyColor) applyRenderMode(modelRef.current, renderMode, c.bodyColor) })
  useEffect(() => () => dragRef.current?.cleanup(), [])

  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!draggable || event.button !== 0 || !rootRef.current) return
    event.stopPropagation()
    onSelect()
    // O Painel 3D e o Esquema partilham o plano X/Y: arrasta-se sempre nesse plano.
    // Vista de topo (plano de frente quase paralelo ao olhar) usa um plano paralelo ao ecrã.
    const dir = camera.getWorldDirection(new THREE.Vector3())
    const normal = Math.abs(dir.z) >= 0.3 ? new THREE.Vector3(0, 0, 1) : dir.clone()
    const origin = rootRef.current.position.clone()
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin)
    const hit = event.ray.intersectPlane(plane, new THREE.Vector3())
    if (!hit) return
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const point = new THREE.Vector3()
    const onMoveDom = (domEvent: PointerEvent) => {
      const state = dragRef.current
      if (!state) return
      if (!state.moved) {
        if (Math.hypot(domEvent.clientX - state.startX, domEvent.clientY - state.startY) < 4) return
        state.moved = true
        // O histórico guarda o estado ANTES do movimento → Desfazer repõe a posição.
        onDragStart()
        gl.domElement.style.cursor = 'grabbing'
      }
      const rect = gl.domElement.getBoundingClientRect()
      ndc.set(((domEvent.clientX - rect.left) / rect.width) * 2 - 1, -(((domEvent.clientY - rect.top) / rect.height) * 2 - 1))
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(state.plane, point)) return
      const next = point.clone().add(state.offset)
      const snap = (value: number) => domEvent.altKey ? value : Math.round(value / 0.05) * 0.05
      onDragTo({ x: snap(next.x), y: snap(next.y) })
    }
    const finish = () => {
      const moved = dragRef.current?.moved
      window.removeEventListener('pointermove', onMoveDom)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true
      gl.domElement.style.cursor = ''
      dragRef.current = null
      if (moved) onDragEnd()
    }
    dragRef.current = { plane, offset: origin.clone().sub(hit), startX: event.clientX, startY: event.clientY, moved: false, cleanup: finish }
    // Sem isto a câmara orbitaria ao mesmo tempo que o componente se move.
    if (controls) (controls as unknown as { enabled: boolean }).enabled = false
    window.addEventListener('pointermove', onMoveDom)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  // Rotação/espelho do Esquema aplicados também no 3D (Z = eixo de visão frontal).
  const schematicRotation = schematicRotationRadians(c)
  const instance = <group
    ref={rootRef}
    position={pivot}
    onClick={(event) => { event.stopPropagation(); onSelect() }}
    onPointerDown={startDrag}
    onPointerOver={() => { if (draggable) gl.domElement.style.cursor = 'grab' }}
    onPointerOut={() => { if (!dragRef.current) gl.domElement.style.cursor = '' }}
  >
    {selected && <SelectionGlow component={c} />}
    <group rotation={[0, 0, schematicRotation]} scale={[c.mirrored ? -1 : 1, 1, 1]}>
      <group rotation={rotation}>
        <group scale={[scale.x, scale.y, scale.z]}>
          <group ref={modelRef} position={[-sourcePivot[0], -sourcePivot[1], -sourcePivot[2]]}>{children}</group>
          {editingTerminals && c.terminals.map((terminal) => <EditableTerminal3D key={terminal.id} component={c} terminal={terminal} active={terminal.id === activeTerminalId} />)}
          {connectionMode && !editingTerminals && c.terminals.map((terminal) => <ConnectionTerminal3D key={terminal.id} component={c} terminal={terminal} active={terminal.id === connectionStartId} onPick={onTerminalPick} />)}
        </group>
      </group>
    </group>
  </group>
  if (!movable) return instance
  return <TransformControls mode="translate" space="world" size={0.72} translationSnap={0.05} showZ={false}
    onMouseUp={() => { const root = rootRef.current; if (root) onMove({ x: root.position.x, y: root.position.y, z: root.position.z }) }}>{instance}</TransformControls>
}

class Model3DErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch() {
    // modelo em falta/inválido — usa o desenho procedural como reserva
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

function LogoSiemens1224RCMesh({ c, x }: { c: ElectricalComponent; x: number }) {
  const { scene } = useGLTF(LOGO_1224RC_MODEL_URL)

  // Normaliza o modelo uma única vez: aplica a rotação de eixo, escala para
  // a altura alvo e recentra-o (x/z no centro, base em y=0), para que
  // qualquer modelo exportado do CAD encaixe automaticamente no cenário
  // sem coordenadas fixas manuais.
  const model = useMemo(() => {
    const obj = cloneModelScene(scene)
    // scene.clone(true) conserva referências aos materiais do cache GLTF;
    // isolá-los evita que o ecrã de um PLC modifique os demais modelos.
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((mat) => mat.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...LOGO_1224RC_ROTATION)
    obj.updateMatrixWorld(true)

    const rawBox = new THREE.Box3().setFromObject(obj, true)
    const rawHeight = rawBox.max.y - rawBox.min.y
    const scale = rawHeight > 0 ? LOGO_1224RC_TARGET_HEIGHT / rawHeight : 1
    obj.scale.setScalar(scale)
    obj.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(obj, true)
    const center = box.getCenter(new THREE.Vector3())
    obj.position.set(-center.x, -box.min.y, -center.z)

    return obj
  }, [scene])

  const on = !!c.state.powered

  useEffect(() => {
    // ecrã aceso/apagado consoante a alimentação (L+): identifica a peça do
    // ecrã pela cor do material original (verde puro — confirmado pela
    // análise da geometria: é a única peça com essa cor, pequena e situada
    // à superfície da face frontal) ou, em alternativa, pelo nome da malha.
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const nameHint = mesh.name.toLowerCase()
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial
        if (!std || !('emissive' in std)) continue
        const isScreenMaterial = std.color && std.color.g > 0.85 && std.color.r < 0.15 && std.color.b < 0.15
        const isScreenName = nameHint.includes('screen') || nameHint.includes('display') || nameHint.includes('ecra')
        if (isScreenMaterial || isScreenName) {
          std.color = new THREE.Color(on ? '#22c55e' : '#173b24')
          std.emissive = new THREE.Color(on ? '#22c55e' : '#052e16')
          std.emissiveIntensity = on ? 1.1 : 0.15
        }
      }
    })
  }, [model, on])

  return (
    <group position={[x, RAIL_Y, 0]}>
      <primitive object={model} castShadow receiveShadow />
      <Label text={c.ref} position={[0, LOGO_1224RC_TARGET_HEIGHT + 0.14, 0.22]} color="#e2e8f0" />
    </group>
  )
}

/** Fonte Proauto normalizada pela mesma dimensão física do Esquema. */
function ProautoReal3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const spec = getComponentModelSpec(c.type)!
  const { scene } = useGLTF(spec.path)
  const model = useMemo(() => {
    const obj = cloneModelScene(scene)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(obj, true)
    const height = bounds.max.y - bounds.min.y
    const scale = height > 0 ? spec.targetHeight / height : 1
    obj.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj, true)
    const center = box.getCenter(new THREE.Vector3())
    obj.position.set(-center.x, -box.min.y, -center.z)
    return obj
  }, [scene, spec])
  return <group position={[x, RAIL_Y, 0]}>
    <primitive object={model} castShadow receiveShadow />
    <Label text={c.ref} position={[0, spec.targetHeight + 0.12, 0.25]} color="#e2e8f0" />
  </group>
}

/** Contator WEG na base frontal +X 90°, partilhada com o Esquema. */
function WegContactorReal3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const spec = getComponentModelSpec(c.type)!
  const { scene } = useGLTF(spec.path)
  const model = useMemo(() => {
    const obj = cloneModelScene(scene)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((mat) => mat.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(obj, true)
    const height = bounds.max.y - bounds.min.y
    const scale = height > 0 ? spec.targetHeight / height : 1
    obj.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj, true)
    const center = box.getCenter(new THREE.Vector3())
    obj.position.set(-center.x, -box.min.y, -center.z)
    return obj
  }, [scene, spec])
  const en = !!c.state.energized
  return <group position={[x, RAIL_Y, 0]}>
    <primitive object={model} castShadow receiveShadow />
    {en && <pointLight color="#22c55e" intensity={0.22} distance={1.3} position={[0, spec.targetHeight * 0.5, 0.35]} />}
    <Label text={c.ref} position={[0, spec.targetHeight + 0.12, 0.24]} color={en ? '#4ade80' : '#e2e8f0'} />
  </group>
}

/** CAD genérico de calha DIN, normalizado a partir da especificação partilhada. */
function CadComponentReal3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const spec = getComponentModelSpec(c.type)!
  const { scene } = useGLTF(spec.path)
  const model = useMemo(() => {
    const obj = cloneModelScene(scene)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const raw = new THREE.Box3().setFromObject(obj, true)
    const height = raw.max.y - raw.min.y
    const scale = height > 0 ? spec.targetHeight / height : 1
    obj.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj, true)
    const center = box.getCenter(new THREE.Vector3())
    obj.position.set(-center.x, -box.min.y, -center.z)
    return obj
  }, [scene, spec])
  const active = !!(c.state.energized || c.state.powered)
  return <group position={[x, RAIL_Y, 0]}>
    <primitive object={model} castShadow receiveShadow />
    {active && <pointLight color="#22c55e" intensity={0.18} distance={1.1} position={[0, spec.targetHeight * 0.55, 0.32]} />}
    <Label text={c.ref} position={[0, spec.targetHeight + 0.1, 0.22]} color={active ? '#4ade80' : '#e2e8f0'} />
  </group>
}

/** Botão de emergência Metaltex com modelo CAD real e acionamento equivalente ao modelo procedural. */
function EmergencyButtonReal3D({ c, x, onPress }: { c: ElectricalComponent; x: number; onPress: (pressed: boolean) => void }) {
  const spec = getCommandModelSpec(c.type)!
  const { scene } = useGLTF(spec.path)
  const model = useMemo(() => {
    const obj = cloneModelScene(scene)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(obj, true)
    const size = bounds.getSize(new THREE.Vector3())
    const scale = size.y > 0 ? spec.targetHeight / size.y : 1
    obj.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    obj.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(obj, true)
    obj.position.sub(fitted.getCenter(new THREE.Vector3()))
    return obj
  }, [scene, spec])
  const pressed = !!c.state.pressed
  return <group
    position={[x, RAIL_Y + 1.05, 0.4]}
    onPointerDown={() => onPress(true)}
    onPointerUp={() => onPress(false)}
    onPointerOut={() => { if (pressed) onPress(false) }}
  >
    <group position={[0, 0, pressed ? -0.025 : 0]}>
      <primitive object={model} castShadow receiveShadow />
    </group>
    <Label text={c.ref} position={[0, spec.targetHeight / 2 + 0.12, 0.08]} />
  </group>
}

/** Botoeira dupla NPB22-D11: zonas independentes STOP (NF) e START (NA). */
function DualPushButtonReal3D({ c, x, onStart, onStop }: {
  c: ElectricalComponent
  x: number
  onStart: (pressed: boolean) => void
  onStop: (pressed: boolean) => void
}) {
  const spec = getCommandModelSpec(c.type)!
  const { scene } = useGLTF(spec.path)
  const model = useMemo(() => {
    const obj = cloneModelScene(scene)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const raw = new THREE.Box3().setFromObject(obj, true)
    const size = raw.getSize(new THREE.Vector3())
    const scale = spec.targetHeight / (size.y || 1)
    obj.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    obj.updateMatrixWorld(true)
    obj.position.sub(new THREE.Box3().setFromObject(obj, true).getCenter(new THREE.Vector3()))
    return obj
  }, [scene, spec])
  const buttonEvents = (handler: (pressed: boolean) => void) => ({
    onPointerDown: () => handler(true),
    onPointerUp: () => handler(false),
    onPointerOut: () => handler(false),
  })
  return <group position={[x, RAIL_Y + 1.05, 0.4]}>
    <primitive object={model} castShadow receiveShadow />
    <mesh position={[-0.13, 0, 0.2]} {...buttonEvents(onStop)}>
      <boxGeometry args={[0.24, 0.42, 0.18]} /><meshBasicMaterial transparent opacity={0} />
    </mesh>
    <mesh position={[0.13, 0, 0.2]} {...buttonEvents(onStart)}>
      <boxGeometry args={[0.24, 0.42, 0.18]} /><meshBasicMaterial transparent opacity={0} />
    </mesh>
    <Label text={`${c.ref} · STOP / START`} position={[0, 0.35, 0.08]} />
  </group>
}

/** Caixa procedural de reserva; o GLB Proauto ainda não foi disponibilizado. */
function PowerSupply3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const powered = c.type === 'powerSupplyProauto24A' ? !!c.state.powered : !!c.state.on
  return <group position={[x, RAIL_Y + 0.48, 0]}>
    <mesh castShadow><boxGeometry args={[0.85, 0.96, 0.48]} /><meshStandardMaterial color="#46515c" metalness={0.25} /></mesh>
    <mesh position={[0, 0.04, 0.25]}><boxGeometry args={[0.68, 0.65, 0.015]} /><meshStandardMaterial color="#d9e0e4" /></mesh>
    <mesh position={[0.22, -0.14, 0.27]}><sphereGeometry args={[0.045, 12, 12]} /><meshStandardMaterial color={powered ? '#16a34a' : '#64748b'} emissive={powered ? '#16a34a' : '#000000'} emissiveIntensity={powered ? 0.8 : 0} /></mesh>
    <Label text={c.type === 'powerSupplyProauto24A' ? '24V / 5A' : '24V'} position={[0, 0.1, 0.27]} size={0.1} />
    <Label text={c.ref} position={[0, 0.56, 0.22]} color="#e2e8f0" />
  </group>
}

function PLCBox3D({ c, x }: { c: ElectricalComponent; x: number }) {
  return (
    <group position={[x, RAIL_Y + 0.46, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.5, 0.92, 0.42]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0, 0.12, 0.22]}>
        <boxGeometry args={[1.05, 0.42, 0.02]} />
        <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={0.35} />
      </mesh>
      {c.terminals
        .filter((t) => t.label.startsWith('I'))
        .slice(0, 8)
        .map((t, i) => (
          <mesh key={t.id} position={[-0.5 + i * 0.14, -0.5, 0.22]}>
            <boxGeometry args={[0.07, 0.05, 0.02]} />
            <meshStandardMaterial color={t.energized ? '#22c55e' : '#111827'} emissive={t.energized ? '#22c55e' : '#000'} emissiveIntensity={t.energized ? 1.1 : 0} />
          </mesh>
        ))}
      {c.terminals
        .filter((t) => t.label.startsWith('Q'))
        .slice(0, 8)
        .map((t, i) => (
          <mesh key={t.id} position={[-0.5 + i * 0.16, -0.34, 0.22]}>
            <boxGeometry args={[0.08, 0.05, 0.02]} />
            <meshStandardMaterial color={t.energized ? '#f59e0b' : '#111827'} emissive={t.energized ? '#f59e0b' : '#000'} emissiveIntensity={t.energized ? 1.1 : 0} />
          </mesh>
        ))}
      <Label text={c.ref} position={[0, 0.58, 0.22]} color="#e2e8f0" />
    </group>
  )
}

function PLC3D({ c, x }: { c: ElectricalComponent; x: number }) {
  if (c.type === 'plcSiemensLogo1224RC') {
    return (
      <Model3DErrorBoundary fallback={<PLCBox3D c={c} x={x} />}>
        <Suspense fallback={<PLCBox3D c={c} x={x} />}>
          <LogoSiemens1224RCMesh c={c} x={x} />
        </Suspense>
      </Model3DErrorBoundary>
    )
  }
  return <PLCBox3D c={c} x={x} />
}

function Drive3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const run = !!c.state.running
  return (
    <group position={[x, RAIL_Y + 0.5, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.9, 1.0, 0.46]} />
        <meshStandardMaterial color={c.bodyColor ?? '#0f172a'} />
      </mesh>
      <mesh position={[0, 0.16, 0.24]}>
        <boxGeometry args={[0.62, 0.3, 0.02]} />
        <meshStandardMaterial color={run ? '#052e16' : '#020617'} emissive={run ? '#166534' : '#000'} emissiveIntensity={0.6} />
      </mesh>
      <Text position={[0, 0.16, 0.26]} fontSize={0.11} color={run ? '#4ade80' : '#64748b'} anchorX="center">
        {c.type === 'vfd' ? `${(c.state.frequencyHz ?? 0).toFixed(1)}Hz` : run ? 'RUN' : 'STOP'}
      </Text>
      <Label text={c.ref} position={[0, 0.62, 0.22]} color="#e2e8f0" />
    </group>
  )
}

function Lamp3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const color = c.state.color ?? (c.type === 'ledGreen' ? '#22c55e' : c.type === 'ledRed' ? '#ef4444' : '#eab308')
  const on = !!c.state.on
  return (
    <group position={[x, RAIL_Y + 1.15, 0.12]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.115, 0.115, 0.14, 24]} />
        <meshStandardMaterial color={on ? color : '#374151'} emissive={on ? color : '#000000'} emissiveIntensity={on ? 1.6 : 0} />
      </mesh>
      {on && <pointLight color={color} intensity={0.8} distance={1.6} position={[0, 0.12, 0.25]} />}
      <Label text={c.ref} position={[0, 0.22, 0]} />
    </group>
  )
}

/** Sinaleiro AD22-22DS real; a lente mantém o CAD e recebe a cor da instância. */
function PilotLightAd22Real3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const spec = getComponentModelSpec('pilotLightAd22')!
  const { scene } = useGLTF(spec.path)
  const model = useMemo(() => {
    const object = cloneModelScene(scene)
    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    object.rotation.set(...spec.rotation)
    object.updateMatrixWorld(true)
    const rawSize = new THREE.Box3().setFromObject(object, true).getSize(new THREE.Vector3())
    const faceDiameter = Math.max(rawSize.x, rawSize.y)
    const scale = faceDiameter > 0 ? spec.targetHeight / faceDiameter : 1
    object.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    object.updateMatrixWorld(true)
    object.position.sub(new THREE.Box3().setFromObject(object, true).getCenter(new THREE.Vector3()))
    return object
  }, [scene, spec])
  const on = !!c.state.on
  const color = typeof c.state.color === 'string' ? c.state.color : '#ef4444'
  useEffect(() => {
    const selected = new THREE.Color(color)
    model.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((material) => {
        const standard = material as THREE.MeshStandardMaterial
        // Material FF0000FF = lente frontal (z 42,5…51,5 mm) no GLB recebido.
        if (standard.name.toUpperCase() !== 'FF0000FF') return
        standard.color.copy(selected).multiplyScalar(on ? 1 : 0.42)
        standard.emissive.copy(selected)
        standard.emissiveIntensity = on ? 1.8 : 0.05
        standard.toneMapped = !on
        standard.needsUpdate = true
      })
    })
  }, [color, model, on])
  return <group position={[x, RAIL_Y + 1.05, 0.4]}>
    <primitive object={model} />
    {on && <pointLight color={color} intensity={0.9} distance={1.7} position={[0, 0, 0.46]} />}
    <Label text={`${c.ref} · AD22`} position={[0, 0.3, 0.08]} color="#334155" />
  </group>
}

function TowerLight3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const bulbs: Array<[string, boolean]> = [
    ['#ef4444', !!c.state.red],
    ['#eab308', !!c.state.yellow],
    ['#22c55e', !!c.state.green],
  ]
  return (
    <group position={[x, RAIL_Y + 1.3, 0.12]}>
      {bulbs.map(([col, on], i) => (
        <mesh key={i} position={[0, 0.22 - i * 0.2, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.16, 20]} />
          <meshStandardMaterial color={on ? col : '#334155'} emissive={on ? col : '#000'} emissiveIntensity={on ? 1.4 : 0} />
        </mesh>
      ))}
      <Label text={c.ref} position={[0, 0.42, 0]} />
    </group>
  )
}

function PushButton3D({ c, x, onPress }: { c: ElectricalComponent; x: number; onPress: (p: boolean) => void }) {
  const pressed = !!c.state.pressed
  const isEmg = c.type === 'emergencyButton' || c.type === 'emergencyButtonKeyP20ACR'
  const isNC = c.type === 'buttonNC'
  const color = isEmg ? '#dc2626' : isNC ? '#ef4444' : c.type === 'buttonNO' ? '#22c55e' : '#eab308'
  const r = isEmg ? 0.17 : 0.1
  return (
    <group position={[x, RAIL_Y + 1.05, 0.4]}>
      <mesh castShadow position={[0, -0.06, -0.05]}>
        <cylinderGeometry args={[r + 0.03, r + 0.03, 0.05, 20]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh
        position={[0, pressed ? -0.05 : 0, 0]}
        onPointerDown={() => onPress(true)}
        onPointerUp={() => onPress(false)}
        onPointerOut={() => pressed && onPress(false)}
      >
        <cylinderGeometry args={[r, r, 0.1, 24]} />
        <meshStandardMaterial color={color} emissive={pressed ? color : '#000'} emissiveIntensity={pressed ? 0.6 : 0} />
      </mesh>
      <Label text={c.ref} position={[0, 0.17, 0]} />
    </group>
  )
}

function Sensor3D({ c, x, onToggle }: { c: ElectricalComponent; x: number; onToggle: () => void }) {
  const trig = !!c.state.triggered
  return (
    <group position={[x, RAIL_Y + 0.9, 0.3]}>
      <mesh castShadow onClick={onToggle}>
        <cylinderGeometry args={[0.09, 0.09, 0.34, 18]} />
        <meshStandardMaterial color={trig ? '#16a34a' : '#334155'} emissive={trig ? '#22c55e' : '#000'} emissiveIntensity={trig ? 1 : 0} />
      </mesh>
      <mesh position={[0.12, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.05, 0.12, 12]} />
        <meshStandardMaterial color={trig ? '#22c55e' : '#0ea5e9'} emissive={trig ? '#22c55e' : '#0ea5e9'} emissiveIntensity={trig ? 1.2 : 0.3} />
      </mesh>
      <Label text={c.ref} position={[0, 0.24, 0]} />
    </group>
  )
}

function Motor3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const running = !!c.state.running
  const dir = c.state.direction
  const fanRef = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    const rpmVisual = Number(c.state.rpmVisual ?? 0)
    if (fanRef.current && rpmVisual > 0) {
      const speed = (dir === 'ccw' ? -1 : 1) * rpmVisual * 9
      fanRef.current.rotation.x += speed * delta
    }
  })
  return (
    <group position={[x, MOTOR_CENTER_Y, 0.7]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.52, 0.52, 1.05, 28]} />
        <meshStandardMaterial color="#1e3a8a" metalness={0.45} roughness={0.5} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} position={[0, Math.cos((i / 8) * Math.PI * 2) * 0.54, Math.sin((i / 8) * Math.PI * 2) * 0.54]}>
          <boxGeometry args={[1.0, 0.06, 0.06]} />
          <meshStandardMaterial color="#334155" metalness={0.5} />
        </mesh>
      ))}
      <mesh ref={fanRef} position={[-0.57, 0, 0]}>
        <boxGeometry args={[0.05, 0.42, 0.42]} />
        <meshStandardMaterial color={running ? '#60a5fa' : '#334155'} />
      </mesh>
      <mesh position={[0.68, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.32, 14]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.65} />
      </mesh>
      <mesh position={[0, -0.48, 0]} receiveShadow>
        <boxGeometry args={[1.3, 0.08, 0.9]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      <Text position={[0, 0.72, 0]} fontSize={0.12} color="#e5e7eb" anchorX="center">
        {`${c.ref} ${running ? (dir === 'cw' ? '(horário ↻)' : '(anti-horário ↺)') : '(parado)'}`}
      </Text>
    </group>
  )
}

/** SEW-EURODRIVE DRN80MK4/B3 — CAD real com indicador funcional no eixo. */
function MotorSewDrn80Mk4B3Real3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const spec = getComponentModelSpec('motor3ph')!
  const { scene } = useGLTF(spec.path)
  const shaftIndicator = useRef<THREE.Group>(null)
  const model = useMemo(() => {
    const object = cloneModelScene(scene)
    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    object.rotation.set(...spec.rotation)
    object.updateMatrixWorld(true)
    const raw = new THREE.Box3().setFromObject(object, true)
    const height = raw.max.y - raw.min.y
    const scale = height > 0 ? spec.targetHeight / height : 1
    object.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    object.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(object, true)
    const center = fitted.getCenter(new THREE.Vector3())
    object.position.set(-center.x, -fitted.min.y, -center.z)
    return object
  }, [scene, spec])
  const running = !!c.state.running
  const direction = c.state.direction
  useFrame((_, delta) => {
    const rpmVisual = Number(c.state.rpmVisual ?? 0)
    if (!shaftIndicator.current || rpmVisual <= 0) return
    const speed = (direction === 'ccw' ? -1 : 1) * rpmVisual * 9
    shaftIndicator.current.rotation.x += speed * delta
  })
  const markerColor = running ? '#22c55e' : '#64748b'
  return <group position={[x, MOTOR_CENTER_Y, 0.7]}>
    {/* O CAD é normalizado pela altura; este deslocamento conserva o pivô no centro do motor. */}
    <group position={[0, -spec.targetHeight / 2, 0]}>
      <primitive object={model} />
      <group ref={shaftIndicator} position={[0.67 * MOTOR_SCALE_RATIO, 0.4 * MOTOR_SCALE_RATIO, 0]}>
        <mesh><boxGeometry args={[0.022, 0.22, 0.026]} /><meshStandardMaterial color={markerColor} emissive={running ? markerColor : '#000000'} emissiveIntensity={running ? 0.65 : 0} /></mesh>
        <mesh><boxGeometry args={[0.022, 0.026, 0.22]} /><meshStandardMaterial color={markerColor} emissive={running ? markerColor : '#000000'} emissiveIntensity={running ? 0.65 : 0} /></mesh>
      </group>
      {running && <pointLight color="#22c55e" intensity={0.22} distance={1.2} position={[0.58, 0.4, 0.2]} />}
    </group>
    <Text position={[0, MOTOR_TARGET_HEIGHT / 2 + 0.17, 0]} fontSize={0.105} color="#24324a" anchorX="center">
      {`${c.ref} · DRN80MK4/B3 ${running ? (direction === 'cw' ? '↻' : '↺') : '· parado'}`}
    </Text>
  </group>
}

/* ------------------------------------------------------------------ cabos 3D */

const WIRE_3D_COLORS: Record<WireColor, string> = {
  red: '#ef4444', blue: '#3b82f6', 'green-yellow': '#84cc16', black: '#1f2937',
  orange: '#f59e0b', grey: '#94a3b8', brown: '#92400e', white: '#f8fafc',
  pink: '#ec4899', violet: '#8b5cf6', green: '#22c55e', yellow: '#eab308', lightblue: '#67e8f9',
}

type Panel3DEditMode = 'navigate' | 'move' | 'connect' | 'curve'

function terminalWorldPosition(components: ElectricalComponent[], pivots: Record<string, THREE.Vector3>, terminalId: string): [number, number, number] | null {
  for (const component of components) {
    const terminal = component.terminals.find((candidate) => candidate.id === terminalId)
    if (!terminal) continue
    const pivot = pivots[component.id]
    if (!pivot) return null
    const world = terminalWorld3D(component, terminal, pivot)
    return [world.x, world.y, world.z]
  }
  return null
}

function wirePoints3D(wire: Wire, a: [number, number, number], b: [number, number, number]): Array<[number, number, number]> {
  const manual = wire.waypoints3D?.map((point) => [point.x, point.y, point.z] as [number, number, number]) ?? []
  const controls = [a, ...manual, b]
  if (manual.length > 0) {
    if (wire.flexibility === 'flexible' || wire.route === 'arc') {
      const curve = new THREE.CatmullRomCurve3(controls.map((point) => new THREE.Vector3(...point)))
      return curve.getPoints(Math.max(24, controls.length * 12)).map((point) => [point.x, point.y, point.z])
    }
    return controls
  }
  if (wire.route === 'direct') return [a, b]
  const drop = -0.55 - Math.min(0.7, Math.abs(a[0] - b[0]) * 0.04)
  const channelY = THREE.MathUtils.lerp(a[1], b[1], Math.max(0, Math.min(1, wire.bend ?? 0.5))) + drop
  const mid: [number, number, number] = [
    (a[0] + b[0]) / 2,
    wire.route === 'arc' ? channelY + (wire.curveOffset ?? 0) * 0.01 : Math.min(a[1], b[1]) + drop * 1.3,
    (a[2] + b[2]) / 2,
  ]
  if (wire.route === 'arc' || wire.flexibility === 'flexible') {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(...a), new THREE.Vector3(...mid), new THREE.Vector3(...b)])
    return curve.getPoints(28).map((point) => [point.x, point.y, point.z])
  }
  return [a, [a[0], channelY, a[2]], [b[0], channelY, b[2]], b]
}

function EnergyFlow3D({ points }: { points: Array<[number, number, number]> }) {
  const refs = useRef<Array<THREE.Mesh | null>>([])
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))), [points])
  useFrame(({ clock }) => {
    refs.current.forEach((mesh, index) => {
      if (!mesh) return
      const point = curve.getPoint((clock.elapsedTime * 0.38 + index / 6) % 1)
      mesh.position.copy(point)
    })
  })
  return <group>{Array.from({ length: 6 }).map((_, index) => <mesh key={index} ref={(mesh) => { refs.current[index] = mesh }} renderOrder={25}>
    <sphereGeometry args={[0.026, 10, 10]} />
    <meshBasicMaterial color="#fde047" transparent opacity={0.95} depthTest={false} />
  </mesh>)}</group>
}

function EditableWireWaypoint3D({ point, index, active, onSelect, onMove }: {
  point: SpatialPoint3D
  index: number
  active: boolean
  onSelect: (index: number) => void
  onMove: (index: number, point: SpatialPoint3D) => void
}) {
  const handleRef = useRef<THREE.Group>(null)
  const marker = <group ref={handleRef} position={[point.x, point.y, point.z]} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSelect(index) }}>
    <mesh renderOrder={32}><sphereGeometry args={[active ? 0.075 : 0.058, 18, 18]} /><meshStandardMaterial color={active ? '#2563eb' : '#ffffff'} emissive={active ? '#1d4ed8' : '#64748b'} emissiveIntensity={active ? 0.65 : 0.18} depthTest={false} /></mesh>
    <Text position={[0, 0.1, 0]} fontSize={0.052} color="#1e3a8a" anchorX="center" anchorY="bottom" depthOffset={-4}>{index + 1}</Text>
  </group>
  if (!active) return marker
  return <TransformControls mode="translate" space="world" size={0.58} translationSnap={0.025} onMouseUp={() => {
    if (!handleRef.current) return
    onMove(index, { x: handleRef.current.position.x, y: handleRef.current.position.y, z: handleRef.current.position.z })
  }}>{marker}</TransformControls>
}

function Wires3D({ pivots, editMode, selectedWireId, activeWaypointIndex, onSelectWire, onSelectWaypoint, onMoveWaypoint }: {
  pivots: Record<string, THREE.Vector3>
  editMode: Panel3DEditMode
  selectedWireId: string | null
  activeWaypointIndex: number | null
  onSelectWire: (wireId: string) => void
  onSelectWaypoint: (index: number) => void
  onMoveWaypoint: (wireId: string, index: number, point: SpatialPoint3D) => void
}) {
  const wires = useSimStore((s) => s.wires)
  const runState = useSimStore((s) => s.sim.runState)
  const storedComponents = useSimStore((s) => s.components)
  const editor = useSimStore((s) => s.viewOrientationEditor)
  const components = useMemo(() => storedComponents.map((component) => editor?.componentId === component.id ? {
    ...component,
    viewOrientation: editor.draft,
    terminals: editor.terminals,
    view3DScale: editor.scale3D,
  } : component), [storedComponents, editor])

  return <group>{wires.map((wire) => {
    const a = terminalWorldPosition(components, pivots, wire.fromTerminalId)
    const b = terminalWorldPosition(components, pivots, wire.toTerminalId)
    if (!a || !b) return null
    const points = wirePoints3D(wire, a, b)
    const selected = wire.id === selectedWireId
    const width = wire.gauge.startsWith('0.') ? 1.4 : wire.gauge.startsWith('1') ? 1.8 : wire.gauge.startsWith('2.5') ? 2.4 : 3
    const flowing = wireEnergyEffectVisible(runState, wire.energized)
    return <group key={wire.id}>
      {selected && <Line points={points} color="#60a5fa" lineWidth={width + 5} transparent opacity={0.5} />}
      {flowing && <Line points={points} color="#fbbf24" lineWidth={width + 4} transparent opacity={0.42} />}
      <Line points={points} color={WIRE_3D_COLORS[wire.color]} lineWidth={selected ? width + 1 : width} onClick={(event) => { event.stopPropagation(); onSelectWire(wire.id) }} />
      {flowing && <EnergyFlow3D points={points} />}
      {selected && editMode === 'curve' && (wire.waypoints3D ?? []).map((point, index) => <EditableWireWaypoint3D key={`${wire.id}-${index}`} point={point} index={index} active={activeWaypointIndex === index} onSelect={onSelectWaypoint} onMove={(waypointIndex, next) => onMoveWaypoint(wire.id, waypointIndex, next)} />)}
    </group>
  })}</group>
}

/* -------------------------------------------------------------------- cena */

type PanelCameraView = 'fit' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric' | 'focus' | 'orbit' | 'angles'
type PanelCameraCommand = { id: number; view: PanelCameraView; target: [number, number, number]; dx?: number; dy?: number; yaw?: number; pitch?: number }

/** Câmara previsível: presets e foco não alteram qualquer posição do projeto. */
function PanelCameraRig({ command, railWidth, onStats }: { command: PanelCameraCommand; railWidth: number; onStats: (stats: { yaw: number; pitch: number; zoom: number }) => void }) {
  const { camera, size } = useThree()
  const controlsRef = useRef<any>(null)
  // Enquadramento usa os valores mais recentes sem reiniciar a câmara quando o conteúdo/tamanho muda.
  const fitRef = useRef({ railWidth, width: size.width, height: size.height })
  fitRef.current = { railWidth, width: size.width, height: size.height }
  const report = () => {
    const controls = controlsRef.current
    if (!controls) return
    const offset = camera.position.clone().sub(controls.target)
    const distance = Math.max(0.001, offset.length())
    onStats({
      yaw: THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z)),
      pitch: THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, offset.y / distance)))),
      zoom: Math.round(Math.max(25, Math.min(400, 620 / distance))),
    })
  }
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    if (command.view === 'orbit') {
      // Arrasto do cubo de vista: orbita em torno do alvo atual (yaw livre, elevação limitada).
      camera.up.set(0, 1, 0)
      const offset = camera.position.clone().sub(controls.target)
      const spherical = new THREE.Spherical().setFromVector3(offset)
      spherical.theta -= ((command.dx ?? 0) * Math.PI) / 180 * 0.8
      spherical.phi = Math.max(0.02, Math.min(Math.PI - 0.02, spherical.phi - ((command.dy ?? 0) * Math.PI) / 180 * 0.8))
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical))
      camera.lookAt(controls.target)
      controls.update()
      report()
      return
    }
    const target = new THREE.Vector3(...command.target)
    const verticalFov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov || 44)
    const fit = fitRef.current
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.55, fit.width / Math.max(1, fit.height)))
    const fitDistance = Math.max(3.2, Math.min(40, (Math.max(3.5, fit.railWidth) * 0.62) / Math.max(0.2, Math.tan(horizontalFov / 2))))
    let position: THREE.Vector3
    camera.up.set(0, 1, 0)
    if (command.view === 'focus') {
      const direction = camera.position.clone().sub(controls.target).normalize()
      if (!Number.isFinite(direction.x) || direction.lengthSq() < 0.1) direction.set(0.25, 0.35, 1)
      position = target.clone().add(direction.multiplyScalar(2.6))
    } else if (command.view === 'front') {
      position = target.clone().add(new THREE.Vector3(0, 0.02, fitDistance))
    } else if (command.view === 'back') {
      position = target.clone().add(new THREE.Vector3(0, 0.02, -fitDistance))
    } else if (command.view === 'right') {
      position = target.clone().add(new THREE.Vector3(fitDistance, 0.02, 0))
    } else if (command.view === 'left') {
      position = target.clone().add(new THREE.Vector3(-fitDistance, 0.02, 0))
    } else if (command.view === 'angles') {
      // Ângulos livres (cantos do cubo / vista vinda do Esquema 2D): yaw 0° = frente, pitch > 0 = por cima.
      const yaw = THREE.MathUtils.degToRad(command.yaw ?? 0)
      const pitch = THREE.MathUtils.degToRad(Math.max(-89, Math.min(89, command.pitch ?? 0)))
      position = target.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch) + 0.02, Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(fitDistance))
    } else if (command.view === 'top') {
      camera.up.set(0, 0, -1)
      position = target.clone().add(new THREE.Vector3(0, fitDistance, 0.01))
    } else if (command.view === 'bottom') {
      camera.up.set(0, 0, 1)
      position = target.clone().add(new THREE.Vector3(0, -fitDistance, 0.01))
    } else {
      position = target.clone().add(new THREE.Vector3(fitDistance * 0.68, fitDistance * 0.48, fitDistance * 0.78))
    }
    camera.position.copy(position)
    controls.target.copy(target)
    camera.lookAt(target)
    camera.updateProjectionMatrix()
    controls.update()
    report()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, command])
  return <OrbitControls ref={controlsRef} minDistance={0.6} maxDistance={60} enableDamping dampingFactor={0.08} makeDefault onChange={report} />
}

/** Grelha por pontos do Esquema, desenhada na cena 3D sobre a placa: acompanha zoom, pan e órbita. */
function DotGrid({ size, dark }: { size: number; dark: boolean }) {
  const positions = useMemo(() => {
    let step = Math.max(5, size)
    while ((2000 / step + 1) * (1400 / step + 1) > 24000) step *= 2
    const xs: number[] = []
    const ys: number[] = []
    for (let x = 0; x <= 2000; x += step) xs.push(schematicToPanelX(x))
    for (let y = 0; y <= 1400; y += step) ys.push(schematicToPanelY(y))
    const array = new Float32Array(xs.length * ys.length * 3)
    let i = 0
    for (const y of ys) for (const x of xs) { array[i++] = x; array[i++] = y; array[i++] = 0 }
    return array
  }, [size])
  return (
    <points position={[0, 0, PLATE_Z + PLATE_THICKNESS / 2 + 0.003]} renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={2.6} sizeAttenuation={false} color={dark ? '#5b6b82' : '#aab8cc'} depthWrite={false} />
    </points>
  )
}

/** Plano invisível que recebe o clique quando há um componente da Biblioteca à espera de ser colocado. */
function PlacementPlane({ onPlace }: { onPlace: (x: number, y: number) => void }) {
  return (
    <mesh position={[0, 0, PLATE_Z + PLATE_THICKNESS / 2 + 0.001]} onClick={(event) => { event.stopPropagation(); onPlace(event.point.x, event.point.y) }}>
      <planeGeometry args={[60, 60]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

/** Visualização 3D do Esquema: mesmo projeto, à escala real, em sintonia com o Esquema 2D. */
export default function Panel3D({ initialCamera = null, onInitialCameraUsed, frontEdit = false }: { initialCamera?: ViewCubeRequest | null; onInitialCameraUsed?: () => void; /** Edição frontal: mesma cena 3D, vista frontal por prioridade e grelha por pontos do Esquema. */ frontEdit?: boolean } = {}) {
  const gridSettings = useSimStore((s) => s.grid)
  const placingType = useSimStore((s) => s.placingType)
  const setPlacingType = useSimStore((s) => s.setPlacingType)
  const storedComponents = useSimStore((s) => s.components)
  const pressButton = useSimStore((s) => s.pressButton)
  const setComponentState = useSimStore((s) => s.setComponentState)
  const addComponent = useSimStore((s) => s.addComponent)
  const selectComponents = useSimStore((s) => s.selectComponents)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const wires = useSimStore((s) => s.wires)
  const selectedWireId = useSimStore((s) => s.selectedWireId)
  const selectWire = useSimStore((s) => s.selectWire)
  const updateWire = useSimStore((s) => s.updateWire)
  const deleteWire = useSimStore((s) => s.deleteWire)
  const addWire = useSimStore((s) => s.addWire)
  const viewOrientationEditor = useSimStore((s) => s.viewOrientationEditor)
  const railMagnet = useSimStore((s) => s.grid.railMagnet !== false)
  const [editMode, setEditMode] = useState<Panel3DEditMode>('navigate')
  const [connectionStartId, setConnectionStartId] = useState<string | null>(null)
  const [reconnect, setReconnect] = useState<{ wireId: string; end: 'from' | 'to' } | null>(null)
  const [activeWaypointIndex, setActiveWaypointIndex] = useState<number | null>(null)
  const components = useMemo(() => storedComponents.map((component) => viewOrientationEditor?.componentId === component.id ? {
    ...component,
    viewOrientation: viewOrientationEditor.draft,
    terminalViewPositions: viewOrientationEditor.terminalViewPositions,
    terminals: viewOrientationEditor.terminals,
    view3DScale: viewOrientationEditor.scale3D,
    view3DRenderMode: viewOrientationEditor.renderMode3D,
    bodyColor: viewOrientationEditor.bodyColor3D,
  } : component), [storedComponents, viewOrientationEditor])
  const sceneCenterRef = useRef<[number, number, number]>([0, 0, 0.3])
  const [cameraCommand, setCameraCommand] = useState<PanelCameraCommand>({ id: 0, view: 'isometric', target: [0, 0, 0.3] })
  const [showGrid, setShowGrid] = useState(() => {
    try { return localStorage.getItem('dc-simu:panel3d:grid') !== '0' } catch { return true }
  })
  const [backgroundMode, setBackgroundMode] = useState<'technical' | 'white' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('dc-simu:panel3d:background')
      return saved === 'white' || saved === 'dark' ? saved : 'technical'
    } catch { return 'technical' }
  })
  const [cameraStats, setCameraStats] = useState({ yaw: 0, pitch: 0, zoom: 100 })
  const cycleBackground = () => setBackgroundMode((current) => {
    const next = current === 'technical' ? 'white' : current === 'white' ? 'dark' : 'technical'
    try { localStorage.setItem('dc-simu:panel3d:background', next) } catch {}
    return next
  })
  const moveCamera = (view: PanelCameraView, target: [number, number, number] = sceneCenterRef.current) =>
    setCameraCommand((current) => ({ id: current.id + 1, view, target }))
  const pickCubeView = (view: ViewCubeFace) => moveCamera(view === 'isometric' ? 'isometric' : view)
  const pickCubeAngles = (yaw: number, pitch: number, target: [number, number, number] = sceneCenterRef.current) =>
    setCameraCommand((current) => ({ id: current.id + 1, view: 'angles', target, yaw, pitch }))
  const applyCubeRequest = (request: ViewCubeRequest) => {
    if ('view' in request) pickCubeView(request.view)
    else pickCubeAngles(request.yaw, request.pitch)
  }
  const orbitCamera = (dx: number, dy: number) =>
    setCameraCommand((current) => ({ id: current.id + 1, view: 'orbit', target: current.target, dx, dy }))
  // Primeira vez que o projeto tem equipamento: enquadra-o em isométrica.
  const fittedRef = useRef(false)
  const initialCameraRef = useRef(initialCamera)
  useEffect(() => {
    if (frontEdit && !initialCameraRef.current) moveCamera('front')
    if (!initialCameraRef.current) return
    onInitialCameraUsed?.()
    // Sem equipamento ainda, aplica já a vista para o cubo refletir o pedido.
    if (!hasComponents) applyCubeRequest(initialCameraRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const hasComponents = storedComponents.length > 0
  useEffect(() => {
    if (!hasComponents) { fittedRef.current = false; return }
    if (!fittedRef.current) {
      fittedRef.current = true
      // Vista pedida no cubo do Esquema 2D (frontal por omissão) tem prioridade sobre a isométrica.
      if (initialCameraRef.current) applyCubeRequest(initialCameraRef.current)
      else moveCamera(frontEdit ? 'front' : 'isometric')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasComponents])
  const toggleGrid = () => setShowGrid((current) => {
    const next = !current
    try { localStorage.setItem('dc-simu:panel3d:grid', next ? '1' : '0') } catch {}
    return next
  })

  const [showHints, setShowHints] = useState(() => {
    try {
      const saved = localStorage.getItem('dc-simu:showHints')
      return saved === null ? !window.matchMedia('(max-width: 700px), (pointer: coarse)').matches : saved === '1'
    } catch {
      return true
    }
  })
  const toggleHints = () => {
    setShowHints((v) => {
      const next = !v
      try {
        localStorage.setItem('dc-simu:showHints', next ? '1' : '0')
      } catch {}
      return next
    })
  }

  const changeEditMode = (mode: Panel3DEditMode) => {
    setEditMode(mode)
    setConnectionStartId(null)
    setReconnect(null)
    setActiveWaypointIndex(null)
    if (mode === 'connect') {
      selectComponents([])
      selectWire(null)
    }
  }
  const pickConnectionTerminal = (terminalId: string) => {
    const store = useSimStore.getState()
    if (reconnect) {
      const wire = store.wires.find((candidate) => candidate.id === reconnect.wireId)
      if (!wire) return setReconnect(null)
      const otherId = reconnect.end === 'from' ? wire.toTerminalId : wire.fromTerminalId
      if (terminalId === otherId) return
      store.commitHistory()
      store.updateWire(wire.id, reconnect.end === 'from' ? { fromTerminalId: terminalId } : { toTerminalId: terminalId })
      store.step()
      store.selectWire(wire.id)
      setReconnect(null)
      return
    }
    if (!connectionStartId) {
      setConnectionStartId(terminalId)
      return
    }
    if (connectionStartId === terminalId) {
      setConnectionStartId(null)
      return
    }
    addWire(connectionStartId, terminalId)
    setConnectionStartId(null)
  }


  const mountingRails = components.filter((c) => isMountingRail(c.type))

  // Layout "de fábrica" de cada peça (pivô de origem do conteúdo procedural/GLB). A posição
  // final de cada instância é derivada do Esquema — ver `panelPivots` mais abaixo.
  const { positions } = useMemo(() => {
    const rail = components.filter((c) => hasDinRailModel(c.type) || RAIL_MOUNT_TYPE_PREFIXES.some((t) => c.type.startsWith(t)))
    const pos: Record<string, THREE.Vector3> = {}
    for (const c of rail) pos[c.id] = new THREE.Vector3(0, RAIL_Y + (getComponentModelSpec(c.type)?.targetHeight ?? 0.8) / 2, 0)
    return { positions: pos }
  }, [components])

  const railComponents = components.filter((c) => positions[c.id])
  const offRail = components.filter((c) => !positions[c.id] && !isMountingRail(c.type))

  const frontPivot = (component: ElectricalComponent): [number, number, number] => {
    if (component.type === 'motor3ph' || component.type === 'motor1ph') return [0, MOTOR_CENTER_Y, 0.7]
    if (component.type === 'towerLight') return [0, RAIL_Y + 1.3, 0.12]
    if (component.type === 'pilotLightAd22') return [0, RAIL_Y + 1.05, 0.4]
    if (component.type === 'ledGreen' || component.type === 'ledRed' || component.type === 'ledYellow' || component.type === 'ledWhite' || component.type === 'buzzer') return [0, RAIL_Y + 1.15, 0.12]
    if (['proximitySensor', 'photoSensor', 'pressureSwitch', 'thermostat', 'floatSwitch'].includes(component.type)) return [0, RAIL_Y + 0.9, 0.3]
    return [0, RAIL_Y + 1.05, 0.4]
  }
  const front = useMemo(() => Object.fromEntries(offRail.map((component) => [component.id, 0])) as Record<string, number>, [offRail])
  const orientationFor = (component: ElectricalComponent) => viewOrientationEditor?.componentId === component.id
    ? viewOrientationEditor.draft
    : componentOrientationOf(component)
  const basePivots: Record<string, THREE.Vector3> = Object.fromEntries(components.map((component) => {
    const railPosition = positions[component.id]
    return [component.id, railPosition
      ? new THREE.Vector3(railPosition.x, railPosition.y, 0)
      : isMountingRail(component.type)
        ? new THREE.Vector3(0, 0, RAIL_FLUSH_Z)
        : new THREE.Vector3(...frontPivot(component))]
  }))

  // Posição 3D = posição no Esquema à escala real (1 mm = 0,01 unidades). O Esquema
  // continua a ser a fonte única de verdade: mover no 3D altera o Esquema e vice-versa.
  const panelPivots: Record<string, THREE.Vector3> = {}
  for (const component of components) {
    const { x, y } = componentPanelXY(component)
    if (isMountingRail(component.type)) {
      panelPivots[component.id] = new THREE.Vector3(x, y, RAIL_FLUSH_Z)
    } else if (!isPanelBound(component)) {
      panelPivots[component.id] = new THREE.Vector3(x, y, frontPivot(component)[2])
    } else {
      // Assente na face da calha (mesma profundidade, esteja ou não fixo numa calha).
      const half = componentHalfExtents(component, orientationFor(component))
      panelPivots[component.id] = new THREE.Vector3(x, y, RAIL_FLUSH_Z + (DIN_RAIL_15X55.height / 2) * PANEL_UNITS_PER_MM + half.z)
    }
  }

  // Chapa e enquadramento derivados do conteúdo real.
  const sceneBounds = (() => {
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    const all = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    for (const component of components) {
      const pivot = panelPivots[component.id]
      const half = componentHalfExtents(component, orientationFor(component))
      const target = isPanelBound(component) ? [box, all] : [all]
      for (const b of target) {
        b.minX = Math.min(b.minX, pivot.x - half.x); b.maxX = Math.max(b.maxX, pivot.x + half.x)
        b.minY = Math.min(b.minY, pivot.y - half.y); b.maxY = Math.max(b.maxY, pivot.y + half.y)
      }
    }
    return { plate: box, all }
  })()
  const plateBounds: PlateBounds | null = Number.isFinite(sceneBounds.plate.minX)
    ? {
      minX: sceneBounds.plate.minX - PLATE_MARGIN, maxX: sceneBounds.plate.maxX + PLATE_MARGIN,
      minY: sceneBounds.plate.minY - PLATE_MARGIN, maxY: sceneBounds.plate.maxY + PLATE_MARGIN,
    }
    : null
  const contentBounds = Number.isFinite(sceneBounds.all.minX) ? sceneBounds.all : null
  const sceneCenter: [number, number, number] = contentBounds
    ? [(contentBounds.minX + contentBounds.maxX) / 2, (contentBounds.minY + contentBounds.maxY) / 2, 0.3]
    : [0, 0, 0.3]
  const sceneWidth = contentBounds ? Math.max(3.5, contentBounds.maxX - contentBounds.minX + 1.2, (contentBounds.maxY - contentBounds.minY + 1.2) * 1.3) : 6
  const floorY = (contentBounds?.minY ?? 0) - 0.35
  sceneCenterRef.current = sceneCenter

  // --- Edição direta no 3D: traduz X/Y do painel para o Esquema (com imã de calha) ---
  const beginPanelDrag = (id: string) => {
    const store = useSimStore.getState()
    store.commitHistory()
    // Durante o arrasto o equipamento larga a calha; o imã volta a fixá-lo ao largar.
    useSimStore.setState((state) => ({
      components: state.components.map((item) => (item.id === id && item.railId ? { ...item, railId: undefined, railOffsetMm: undefined } : item)),
    }))
  }
  const dragPanelTo = (id: string, point: { x: number; y: number }) => {
    const store = useSimStore.getState()
    const component = store.components.find((item) => item.id === id)
    if (!component) return
    const drop = dropOnSchematic(component, point, store.grid.railMagnet === false ? [] : store.components)
    // Edição frontal: o componente alinha à grelha por pontos do projeto (a calha continua a ter prioridade no fim do arrasto).
    const g = store.grid
    const step = frontEdit && g.enabled && g.snap && g.size > 0 ? g.size : 0
    const snapTo = (value: number) => step ? Math.round(value / step) * step : value
    store.moveComponent(id, snapTo(drop.schematicX), snapTo(drop.schematicY))
  }
  const endPanelDrag = (id: string) => {
    const store = useSimStore.getState()
    if (store.grid.railMagnet !== false) store.snapToRails([id], false)
    store.step()
  }
  const movePanelComponent = (component: ElectricalComponent, point: { x: number; y: number }) => {
    const current = panelPivots[component.id]
    if (current && Math.abs(current.x - point.x) < 1e-4 && Math.abs(current.y - point.y) < 1e-4) return
    beginPanelDrag(component.id)
    dragPanelTo(component.id, point)
    endPanelDrag(component.id)
  }
  const wrapOriented = (component: ElectricalComponent, content: ReactNode) => {
    const source = basePivots[component.id]
    const pivot = panelPivots[component.id]
    return <OrientedInstance
      key={component.id}
      c={component}
      pivot={[pivot.x, pivot.y, pivot.z]}
      sourcePivot={[source.x, source.y, source.z]}
      orientation={orientationFor(component)}
      selected={selectedIds.includes(component.id)}
      editingTerminals={viewOrientationEditor?.componentId === component.id}
      movable={editMode === 'move' && selectedIds.includes(component.id) && !component.locked && !viewOrientationEditor}
      draggable={editMode === 'navigate' && !component.locked && !viewOrientationEditor && !reconnect}
      connectionMode={editMode === 'connect' || reconnect !== null}
      connectionStartId={connectionStartId}
      onSelect={() => selectComponents([component.id])}
      onMove={(position) => movePanelComponent(component, position)}
      onDragStart={() => beginPanelDrag(component.id)}
      onDragTo={(point) => dragPanelTo(component.id, point)}
      onDragEnd={() => endPanelDrag(component.id)}
      onTerminalPick={pickConnectionTerminal}
    >{content}</OrientedInstance>
  }
  const selectedComponent = selectedIds.length === 1 ? components.find((component) => component.id === selectedIds[0]) : undefined
  const selectedWire = selectedWireId ? wires.find((wire) => wire.id === selectedWireId) : undefined
  const selectedTarget: [number, number, number] | null = selectedComponent
    ? [panelPivots[selectedComponent.id].x, panelPivots[selectedComponent.id].y, panelPivots[selectedComponent.id].z]
    : null
  const focusSelection = () => {
    if (selectedTarget) moveCamera('focus', selectedTarget)
  }
  const selectedDimensions = selectedComponent ? getComponentModelSpec(selectedComponent.type)?.physicalSizeMm : undefined
  const patchSelectedWire = (patch: Partial<Wire>) => {
    if (!selectedWire) return
    const store = useSimStore.getState()
    store.commitHistory()
    store.updateWire(selectedWire.id, patch)
  }
  const addWireWaypoint = () => {
    if (!selectedWire) return
    const a = terminalWorldPosition(components, panelPivots, selectedWire.fromTerminalId)
    const b = terminalWorldPosition(components, panelPivots, selectedWire.toTerminalId)
    if (!a || !b) return
    const current = selectedWire.waypoints3D ?? []
    const index = current.length
    const point: SpatialPoint3D = {
      x: (a[0] + b[0]) / 2 + index * 0.12,
      y: Math.min(a[1], b[1]) - 0.55 - index * 0.08,
      z: (a[2] + b[2]) / 2 + index * 0.08,
    }
    patchSelectedWire({ waypoints3D: [...current, point], route: selectedWire.flexibility === 'flexible' ? 'arc' : selectedWire.route })
    setActiveWaypointIndex(index)
  }
  const moveWireWaypoint = (wireId: string, index: number, point: SpatialPoint3D) => {
    const wire = useSimStore.getState().wires.find((candidate) => candidate.id === wireId)
    if (!wire) return
    const next = [...(wire.waypoints3D ?? [])]
    next[index] = point
    const store = useSimStore.getState()
    store.commitHistory()
    store.updateWire(wireId, { waypoints3D: next })
  }
  const removeWireWaypoint = () => {
    if (!selectedWire || activeWaypointIndex === null) return
    patchSelectedWire({ waypoints3D: (selectedWire.waypoints3D ?? []).filter((_, index) => index !== activeWaypointIndex) })
    setActiveWaypointIndex(null)
  }
  const startReconnect = (end: 'from' | 'to') => {
    if (!selectedWire) return
    setEditMode('connect')
    setConnectionStartId(null)
    setActiveWaypointIndex(null)
    setReconnect({ wireId: selectedWire.id, end })
  }
  const stageBackground = backgroundMode === 'white'
    ? 'bg-white'
    : backgroundMode === 'dark'
      ? 'bg-gradient-to-b from-[#111827] via-[#1f2937] to-[#0f172a]'
      : 'bg-gradient-to-b from-[#e6ebf3] via-[#f3f5f9] to-[#ccd5e2]'
  const sceneBackground = backgroundMode === 'white' ? '#ffffff' : backgroundMode === 'dark' ? '#111827' : frontEdit ? '#f8fafd' : '#e9eef5'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return
      if (event.key === 'Escape') { setConnectionStartId(null); setReconnect(null); setActiveWaypointIndex(null); changeEditMode('navigate') }
      else if (event.key === 'Home' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); moveCamera('fit') }
      else if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey && selectedTarget) { event.preventDefault(); focusSelection() }
      else if (event.key.toLowerCase() === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); toggleGrid() }
      else if (event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); changeEditMode('move') }
      else if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); changeEditMode('connect') }
      else if (event.key.toLowerCase() === 'v' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); changeEditMode('curve') }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && useSimStore.getState().selectedWireId) { event.preventDefault(); deleteWire(useSimStore.getState().selectedWireId!) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // O alvo é recalculado apenas quando a seleção/posição visual muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComponent?.id, selectedTarget?.[0], selectedTarget?.[1], selectedTarget?.[2]])

   return (
     <div
       className={`panel3d-stage relative w-full h-full ${stageBackground}`}
       data-embedded-in-schematic="true"
       aria-label="Visualização 3D do Esquema"
       onDragOver={(e) => {
         e.preventDefault()
         e.dataTransfer.dropEffect = 'copy'
       }}
       onDrop={(e) => {
         e.preventDefault()
         const compType = e.dataTransfer.getData('text/plain') as ComponentType
         if (!compType || !hasComponent3DModel(compType)) return
         // Entra no centro da vista atual, à escala real, e o imã fixa-o à calha se ficar ao alcance.
         const [cx, cy] = sceneCenterRef.current
         const id = addComponent(compType, Math.round(panelToSchematicX(cx) - 40), Math.round(panelToSchematicY(cy) - 40))
         selectComponents(id ? [id] : [])
       }}
     >
      <ComponentViewEditor />
      <ViewCube yaw={cameraStats.yaw} pitch={cameraStats.pitch} onPick={pickCubeView} onAngles={pickCubeAngles} onOrbit={orbitCamera} placement={viewOrientationEditor ? 'shifted' : selectedIds.length === 1 ? 'below-command' : 'top'} />
      <div className="panel3d-viewbar" role="toolbar" aria-label="Edição, vistas e navegação do painel 3D">
        <button type="button" className={editMode === 'navigate' ? 'is-edit-active' : ''} aria-pressed={editMode === 'navigate'} onClick={() => changeEditMode('navigate')} title="Navegar e orbitar a câmara · clique e arraste um componente para o mover">Navegar</button>
        <button type="button" className={editMode === 'move' ? 'is-edit-active' : ''} aria-pressed={editMode === 'move'} onClick={() => changeEditMode('move')} title="Selecionar e mover componentes diretamente no espaço 3D">Mover</button>
        <button type="button" className={editMode === 'connect' ? 'is-edit-active' : ''} aria-pressed={editMode === 'connect'} onClick={() => changeEditMode('connect')} title="Criar ou religar cabos nos bornes físicos">Ligar</button>
        <button type="button" className={editMode === 'curve' ? 'is-edit-active' : ''} aria-pressed={editMode === 'curve'} onClick={() => changeEditMode('curve')} title="Selecionar cabos e editar os pontos das curvas">Cabos</button>
        <span className="panel3d-viewbar-separator" aria-hidden="true" />
        <button type="button" onClick={() => moveCamera('fit')} title="Enquadrar todo o painel (Home)">Ajustar</button>
        <button type="button" onClick={() => moveCamera('front')} title="Vista frontal">Frente</button>
        <button type="button" onClick={() => moveCamera('top')} title="Vista superior">Superior</button>
        <button type="button" onClick={() => moveCamera('isometric')} title="Vista isométrica">ISO</button>
        <button type="button" onClick={focusSelection} disabled={!selectedTarget} title="Focar o componente selecionado (F)">Focar</button>
        <button type="button" className={railMagnet ? 'is-active' : ''} aria-pressed={railMagnet} onClick={() => useSimStore.getState().setGrid({ railMagnet: !railMagnet })} title="Imã de calha: ao largar, o equipamento centra-se e fixa-se na calha DIN mais próxima (igual ao Esquema 2D)">Imã de calha</button>
        <button type="button" className={showGrid ? 'is-active' : ''} aria-pressed={showGrid} onClick={toggleGrid} title="Mostrar ou ocultar a grelha (G)">Grelha</button>
        <button type="button" onClick={cycleBackground} title="Alternar fundo técnico, branco e escuro"><span className="panel3d-tool-prefix">Fundo: </span>{backgroundMode === 'technical' ? 'Técnico' : backgroundMode === 'white' ? 'Branco' : 'Escuro'}</button>
      </div>
      {editMode === 'move' && <div className="panel3d-edit-context" role="status">
        {selectedComponent ? <>
          <strong>{selectedComponent.ref}</strong>
          <span>{selectedComponent.locked ? 'Componente bloqueado' : 'Arraste os eixos X/Y — o Esquema acompanha e o imã fixa-o à calha'}</span>
        </> : <span>Selecione um componente e arraste o manipulador 3D.</span>}
      </div>}
      {editMode === 'connect' && <div className="panel3d-edit-context" role="status">
        <strong>{reconnect ? `Religar ponta ${reconnect.end === 'from' ? 'A' : 'B'}` : 'Ligação 3D'}</strong>
        <span>{reconnect ? 'Selecione o novo borne físico.' : connectionStartId ? 'Primeiro borne escolhido. Selecione o borne de destino.' : 'Selecione dois bornes físicos para criar o cabo.'}</span>
        {(reconnect || connectionStartId) && <button type="button" onClick={() => { setReconnect(null); setConnectionStartId(null) }}>Cancelar</button>}
      </div>}
      {editMode === 'curve' && <div className="panel3d-edit-context panel3d-wire-context" role="region" aria-label="Editor de cabos 3D">
        {selectedWire ? <>
          <strong>{selectedWire.number || 'Cabo'}</strong>
          <label>Cor<select aria-label="Cor do cabo 3D" value={selectedWire.color} onChange={(event) => patchSelectedWire({ color: event.target.value as WireColor })}>{(Object.keys(WIRE_3D_COLORS) as WireColor[]).map((color) => <option key={color} value={color}>{color}</option>)}</select></label>
          <label>Seção<select aria-label="Seção do cabo 3D" value={selectedWire.gauge} onChange={(event) => patchSelectedWire({ gauge: event.target.value })}>{['0.5mm²', '0.75mm²', '1mm²', '1.5mm²', '2.5mm²', '4mm²', '6mm²'].map((gauge) => <option key={gauge} value={gauge}>{gauge}</option>)}</select></label>
          <label>Traçado<select aria-label="Traçado do cabo 3D" value={selectedWire.route} onChange={(event) => patchSelectedWire({ route: event.target.value as Wire['route'] })}><option value="direct">Direto</option><option value="orthogonal">Ortogonal</option><option value="manhattan">Canalizado</option><option value="arc">Curvo</option></select></label>
          <button type="button" onClick={() => patchSelectedWire({ flexibility: selectedWire.flexibility === 'flexible' ? 'rigid' : 'flexible' })}>{selectedWire.flexibility === 'flexible' ? 'Flexível' : 'Rígido'}</button>
          <button type="button" onClick={addWireWaypoint}>+ ponto</button>
          <button type="button" disabled={activeWaypointIndex === null} onClick={removeWireWaypoint}>− ponto</button>
          <button type="button" disabled={!selectedWire.waypoints3D?.length} onClick={() => { patchSelectedWire({ waypoints3D: undefined }); setActiveWaypointIndex(null) }}>Limpar curvas</button>
          <button type="button" onClick={() => startReconnect('from')}>Religar A</button>
          <button type="button" onClick={() => startReconnect('to')}>Religar B</button>
          <button type="button" className="is-danger" onClick={() => { deleteWire(selectedWire.id); setActiveWaypointIndex(null) }}>Eliminar</button>
        </> : <span>Selecione um cabo no painel para editar cor, seção, traçado, curvas e ligações.</span>}
      </div>}
      {selectedComponent && editMode === 'navigate' && <div className="panel3d-model-badge">
        <span><i />MODELO 3D</span><strong>{selectedComponent.ref} · {selectedComponent.label}</strong>
        {selectedDimensions && <small>{selectedDimensions.width} × {selectedDimensions.height} × {selectedDimensions.depth} mm</small>}
        <small>Escala {Math.round(component3DScaleOf(selectedComponent).x * 100)}·{Math.round(component3DScaleOf(selectedComponent).y * 100)}·{Math.round(component3DScaleOf(selectedComponent).z * 100)}% · {selectedComponent.view3DRenderMode === 'wireframe' ? 'Arame' : selectedComponent.view3DRenderMode === 'xray' ? 'Raio-X' : 'Sólido'}</small>
      </div>}
      <Canvas shadows camera={{ position: [0.6, 2.4, 6.4], fov: 44 }} onPointerMissed={() => selectComponents([])}>
        <color attach="background" args={[sceneBackground]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 7, 5]} intensity={1.15} castShadow />
        <directionalLight position={[-5, 3, -4]} intensity={0.35} />
        {showGrid && !frontEdit && <gridHelper args={[40, 80, '#c3cdda', '#dfe5ee']} position={[sceneCenter[0], floorY, 0]} />}
        {frontEdit && showGrid && gridSettings.enabled && <DotGrid size={gridSettings.size} dark={backgroundMode === 'dark'} />}
        {frontEdit && placingType && hasComponent3DModel(placingType) && <PlacementPlane onPlace={(x, y) => {
          const step = gridSettings.enabled && gridSettings.snap && gridSettings.size > 0 ? gridSettings.size : 0
          const snapTo = (value: number) => step ? Math.round(value / step) * step : Math.round(value)
          const id = addComponent(placingType, snapTo(panelToSchematicX(x) - 40), snapTo(panelToSchematicY(y) - 40))
          setPlacingType(null)
          selectComponents(id ? [id] : [])
        }} />}

        {plateBounds && <MountingPlate bounds={plateBounds} />}
        {railComponents.map((c) => {
          const x = positions[c.id].x
          let content: ReactNode
          if (c.type === 'plcSiemensLogo1224RC') content = <Model3DErrorBoundary fallback={<PLC3D c={c} x={x} />}><Suspense fallback={<PLC3D c={c} x={x} />}><LogoSiemens1224RCMesh c={c} x={x} /></Suspense></Model3DErrorBoundary>
          else if (c.type === 'powerSupplyProauto24A') content = <Model3DErrorBoundary fallback={<PowerSupply3D c={c} x={x} />}><Suspense fallback={<PowerSupply3D c={c} x={x} />}><ProautoReal3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          else if (c.type === 'contactorWegCWC09') content = <Model3DErrorBoundary fallback={<Contactor3D c={c} x={x} />}><Suspense fallback={<Contactor3D c={c} x={x} />}><WegContactorReal3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          else if (c.type === 'thermalRelay') content = <ThermalRelay3D c={c} x={x} />
          else if (hasDinRailModel(c.type)) {
            const fallback = c.type === 'phoenixEcb3000760' ? <PhoenixEcb3D c={c} x={x} /> : <Breaker3D c={c} x={x} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={fallback}><CadComponentReal3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          } else if (c.type.startsWith('contactor')) content = <Contactor3D c={c} x={x} />
          else if (c.type === 'powerSupply') content = <PowerSupply3D c={c} x={x} />
          else if (c.type.startsWith('plc')) content = <PLC3D c={c} x={x} />
          else if (c.type === 'vfd' || c.type === 'softStarter') content = <Drive3D c={c} x={x} />
          else content = <Breaker3D c={c} x={x} />
          return wrapOriented(c, content)
        })}

        {mountingRails.map((c) => {
          const base = basePivots[c.id]
          return wrapOriented(c, <MountingRail3D c={c} position={[base.x, base.y, base.z]} />)
        })}

        {offRail.map((c) => {
          const x = front[c.id]
          let content: ReactNode
          if (c.type === 'pilotLightAd22') {
            const fallback = <Lamp3D c={c} x={x} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={fallback}><PilotLightAd22Real3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'ledGreen' || c.type === 'ledRed' || c.type === 'ledYellow' || c.type === 'ledWhite' || c.type === 'buzzer') content = <Lamp3D c={c} x={x} />
          else if (c.type === 'towerLight') content = <TowerLight3D c={c} x={x} />
          else if (c.type === 'motor3ph') {
            const fallback = <Motor3D c={c} x={x} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={fallback}><MotorSewDrn80Mk4B3Real3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'motor1ph') content = <Motor3D c={c} x={x} />
          else if (c.type === 'dualPushButtonNpb22D11' && getCommandModelSpec(c.type)) {
            const fallback = <PushButton3D c={c} x={x} onPress={(pressed) => setComponentState(c.id, { startPressed: pressed })} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={fallback}><DualPushButtonReal3D c={c} x={x}
              onStart={(pressed) => setComponentState(c.id, { startPressed: pressed })}
              onStop={(pressed) => setComponentState(c.id, { stopPressed: pressed })} /></Suspense></Model3DErrorBoundary>
          } else if ((c.type === 'emergencyButton' || c.type === 'emergencyButtonKeyP20ACR') && getCommandModelSpec(c.type)) content = <Model3DErrorBoundary fallback={<PushButton3D c={c} x={x} onPress={(pressed) => pressButton(c.id, pressed)} />}><Suspense fallback={<PushButton3D c={c} x={x} onPress={(pressed) => pressButton(c.id, pressed)} />}><EmergencyButtonReal3D c={c} x={x} onPress={(pressed) => pressButton(c.id, pressed)} /></Suspense></Model3DErrorBoundary>
          else if (['proximitySensor', 'photoSensor', 'pressureSwitch', 'thermostat', 'floatSwitch'].includes(c.type)) content = <Sensor3D c={c} x={x} onToggle={() => setComponentState(c.id, { triggered: !c.state.triggered })} />
          else content = <PushButton3D c={c} x={x} onPress={(pressed) => pressButton(c.id, pressed)} />
          return wrapOriented(c, content)
        })}
        <Wires3D
          pivots={panelPivots}
          editMode={editMode}
          selectedWireId={selectedWireId}
          activeWaypointIndex={activeWaypointIndex}
          onSelectWire={(wireId) => { selectWire(wireId); setActiveWaypointIndex(null) }}
          onSelectWaypoint={setActiveWaypointIndex}
          onMoveWaypoint={moveWireWaypoint}
        />

        <PanelCameraRig command={cameraCommand} railWidth={sceneWidth} onStats={setCameraStats} />
      </Canvas>

      <div className="panel3d-axis-hud" aria-label="Orientação da câmara 3D">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="30" cy="34" r="3" fill="#334155" />
          <path d="M30 34 L55 34" stroke="#ef4444" strokeWidth="3" /><path d="M55 34 l-7 -4 v8 z" fill="#ef4444" /><text x="56" y="30" fill="#ef4444">X</text>
          <path d="M30 34 L30 8" stroke="#22c55e" strokeWidth="3" /><path d="M30 8 l-4 7 h8 z" fill="#22c55e" /><text x="35" y="10" fill="#16a34a">Y</text>
          <path d="M30 34 L13 51" stroke="#3b82f6" strokeWidth="3" /><path d="M13 51 l3 -8 5 5 z" fill="#3b82f6" /><text x="5" y="59" fill="#2563eb">Z</text>
        </svg>
        <div><span>Yaw <strong>{cameraStats.yaw.toFixed(1)}°</strong></span><span>Pitch <strong>{cameraStats.pitch.toFixed(1)}°</strong></span><span>Zoom <strong>{cameraStats.zoom}%</strong></span></div>
      </div>

      {!components.length && <div className="panel3d-empty-overlay absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="dc-editor-empty panel3d-empty-card pointer-events-auto">
          <span className="dc-empty-kicker">Esquema · Visualização 3D</span>
          <h2>Visualize o esquema em 3D</h2>
          <p>O projeto começa vazio. Adicione componentes pela Biblioteca; o mesmo equipamento, bornes e cabos aparecerão aqui e no Esquema 2D, à escala real.</p>
        </div>
      </div>}

      {/* overlay HTML normal (fora do Canvas) — evita que o drei <Html> projete o botão para o centro do ecrã */}
      <div className="absolute left-2 bottom-2 flex flex-col items-start gap-1.5 z-10">
        {showHints && (
          <div className="text-[10px] text-ink-400 text-left leading-relaxed rounded-md bg-white/95 border border-line shadow-xs px-2 py-1.5 max-w-[260px]">
            <div>Navegar: arraste = orbitar · scroll = zoom</div>
            <div>M mover · C ligar bornes · V editar cabos/curvas</div>
            <div>O fluxo de energia nos cabos aparece apenas em RUN.</div>
          </div>
        )}
        <button
          onClick={toggleHints}
          className="w-6 h-6 flex items-center justify-center rounded-full border border-line bg-white/95 shadow-xs text-ink-500 hover:text-brand-600 hover:border-brand-300 transition-colors"
          title={showHints ? 'Esconder dicas' : 'Mostrar dicas'}
        >
          <IconHelp size={13} />
        </button>
      </div>
    </div>
  )
}
