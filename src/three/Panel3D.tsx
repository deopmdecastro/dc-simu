import { isTabletDesktop } from '../ui/device'
import CatalogComponent3D from './CatalogComponent3D'
import { isCatalogType } from '../catalog/types'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Text, TransformControls, Edges, useGLTF } from '@react-three/drei'
import { useRef, useMemo, useState, useEffect, Suspense, Component } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import { TbButton } from '../ui/toolbarKit'
import { useWireActionSlot } from '../ui/wireActionSlot'
import { useEditorShortcuts } from '../ui/shortcuts'
import ShortcutHelp, { type ShortcutHelpExtra } from '../ui/ShortcutHelp'
import { SCHEMATIC_TOOL_SHORTCUTS, VIEW_SHORTCUTS } from '../ui/shortcutLists'
import { useCanvasAction, useShortcutsRequest, useSimUi } from '../ui/simUi'
import { ContextLossGuard, ContextLossNotice } from './ContextLossGuard'
import { EDITOR_THEME, editorPalette } from '../ui/editorTheme'
import { IconClose, IconFocus, IconDelete, IconHelp, IconKeyboard, IconLink, IconMove, IconPlus, IconSave, IconUnlock } from '../ui/icons'
import type { ElectricalComponent, ComponentType, SpatialPoint3D, Wire } from '../types'
import * as THREE from 'three'
import { LOGO_SCREEN_FALLBACK, logoScreenRect, type LogoFaceRect } from './logoScreen'
import { cloneModelScene, fitComponentModel } from './modelFit'
import { applyEmergencyButtonFinish, finishCadMaterial } from './catalogMaterials'
import { applyCadSurfaceTextures, onCadTexturesReady } from './cadSurface'
import CanvasAnnotations3D from './CanvasAnnotations3D'
import NeonCurrent3D from './NeonCurrent3D'
import TextStyleBar from '../ui/TextStyleBar'
import { DEFAULT_TEXT_STYLE_3D, NOTE_COLORS } from '../ui/textStyle'
import { getStudioEnvironment, STUDIO_EXPOSURE, STUDIO_TONE_MAPPING } from './studioEnvironment'
import { applyEditorMotorTextures } from './motorEditorTextures'
import { canInsertComponent3D, getCommandModelSpec, getComponentModelSpec, hasDinRailModel, isMountingRail, PANEL_UNITS_PER_MM, BREAKER_HANDLE_RIG } from './modelPaths'
import { componentHalfExtents, isPanelBound, PLATE_THICKNESS, PLATE_Z, RAIL_Y } from './panelBounds'
import { buildDinRailGroup, clampRailLengthMm, createGalvanizedMaterial, DIN_RAIL_15X55 } from './dinRailGeometry'
import { RAIL_MOUNT_TYPE_PREFIXES } from './railMount'
import { PANEL_UNITS_PER_PX, componentPanelXY, dropOnSchematic, panelToSchematicX, panelToSchematicY, schematicToPanelX, schematicToPanelY } from './panelLayout'
import { componentOrientationOf, orientationRadians } from './componentOrientation'
import { component3DDimensions, component3DScaleOf, component3DVolumeCenter, schematicRotationRadians, terminalLocal3D, terminalMarkerRadius, terminalPositionFromLocal3D, terminalWorld3D } from './terminal3D'
import ViewCube, { cameraFacingFace, type ViewCubeFace, type ViewCubeRequest } from '../components/ViewCube'
import { floorGridVisible, wireEnergyEffectVisible } from './panel3DEditing'
import { registerCoverCapture } from './coverCapture'
import { WireEnd3D } from './WireEnd3D'
import { GlowHalo } from './GlowHalo'
import { stepSpring, type SpringState } from '../catalog/controlMotion'
import MultimeterDm20Panel from './MultimeterDm20Panel'
import MotorTerminalBoard3D from './MotorTerminalBoard3D'
import MotorShaftFan3D from './MotorShaftFan3D'
import { MOTOR_FAN, motorCadToCentered } from './motorTerminalLayout'
import { extractBreakerHandle, extractKeyBarrel } from './breakerHandle'
import { extractActuatorHead } from './actuatorHead'
import { WireDrawController, type DrawTerminal, type WireDraft } from './WireDraw3D'
import { wireEndColor } from '../schematic/wireEndColor'
import { buildAllWirePaths3D, buildWirePath3D, cableOuterDiameterMm, componentObstacles, closestPointOnPolyline, fromSpatial, toSpatial, waypointInsertIndex, wireEndpoint3D, wireLengthMm, WIRE_3D_COLORS, type V3, type WireEndpoint3D, type WirePath3D, type WireObstacle } from './wireGeometry3D'

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
  // As referências acima dos equipamentos eram claras (chapa escura); na chapa clara ficam ilegíveis.
  const ink = color.toLowerCase() === '#e2e8f0' ? '#1e293b' : color
  return (
    <Text position={position} fontSize={size} color={ink} anchorX="center" anchorY="middle">
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
    <mesh position={[(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, PLATE_Z]} receiveShadow userData={{ wireSurface: true }}>
      <boxGeometry args={[width, height, PLATE_THICKNESS]} />
      <meshPhysicalMaterial color="#eef2f6" emissive="#e2e8f0" emissiveIntensity={0.14} metalness={0.2} roughness={0.38} clearcoat={0.2} clearcoatRoughness={0.42} envMapIntensity={0.95} />
      <Edges color="#8b9bb0" threshold={15} />
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
  const simActive = useSimStore((s) => s.sim.runState !== 'stopped')
  const en = simActive && !!c.state.energized
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
        <meshStandardMaterial color={en ? '#22c55e' : '#334155'} emissive={en ? '#22c55e' : '#000000'} emissiveIntensity={en ? 2.2 : 0} toneMapped={!en} />
      </mesh>
      <GlowHalo color="#22c55e" on={en} radius={0.05} kind="led" position={[0.2, 0.34, 0.3]} />
      <Label text={c.ref} position={[0, 0.52, 0.23]} />
    </group>
  )
}

/* ---------- Siemens LOGO! 12/24RC — modelo 3D real (GLTF/GLB) ---------- */
const LOGO_1224RC_SPEC = getComponentModelSpec('plcSiemensLogo1224RC')!
const LOGO_1224RC_MODEL_URL = LOGO_1224RC_SPEC.path
const LOGO_1224RC_TARGET_HEIGHT = LOGO_1224RC_SPEC.targetHeight

function applyRenderMode(group: THREE.Group | null, mode: ElectricalComponent['view3DRenderMode'], bodyColor?: string) {
  if (!group) return
  group.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.presentationOverlay) return
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
      const physicalSurface = material instanceof THREE.MeshStandardMaterial
      visual.wireframe = mode === 'wireframe' ? true : base.wireframe
      visual.opacity = mode === 'xray' ? Math.min(0.34, base.opacity) : physicalSurface ? 1 : base.opacity
      visual.transparent = mode === 'xray' ? true : physicalSurface ? false : base.transparent
      visual.depthWrite = mode === 'xray' ? false : physicalSurface ? true : base.depthWrite
      if (physicalSurface) visual.depthTest = true
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
  const radius = terminalMarkerRadius(component, terminal) * (active ? 1.1 : hover ? 1.05 : 1)
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
      <sphereGeometry args={[radius, 18, 18]} />
      <meshStandardMaterial color={active ? '#22d3ee' : terminal.color} emissive={active ? '#0891b2' : '#000000'} emissiveIntensity={active ? 0.7 : 0} metalness={0.2} roughness={0.35} />
    </mesh>
    {active && <mesh renderOrder={30}>
      <sphereGeometry args={[radius * 1.2, 18, 18]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.22} depthWrite={false} />
    </mesh>}
    {showLabel && <Text position={[0, 0.05 + 0.035 * k, 0]} fontSize={0.06} color={active ? '#0e7490' : '#1e293b'} anchorX="center" anchorY="bottom" depthOffset={-2}>{terminal.label}</Text>}
  </group>
}

function ConnectionTerminal3D({ component, terminal, active, onPick }: {
  component: ElectricalComponent
  terminal: ElectricalComponent['terminals'][number]
  active: boolean
  onPick?: (id: string) => void
}) {
  const position = terminalLocal3D(component, terminal)
  const k = terminalMarkerScale(terminal)
  const [hover, setHover] = useState(false)
  const radius = terminalMarkerRadius(component, terminal) * (active ? 1.1 : hover ? 1.05 : 1)
  return <group position={position}
    onClick={onPick ? (event) => { event.stopPropagation(); onPick(terminal.id) } : undefined}
    onPointerDown={(event) => event.stopPropagation()}
    onPointerOver={(event) => { event.stopPropagation(); setHover(true) }}
    onPointerOut={() => setHover(false)}>
    <mesh renderOrder={30}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshStandardMaterial color={active ? '#22d3ee' : terminal.color} emissive={active ? '#0891b2' : terminal.color} emissiveIntensity={active ? 1 : hover ? 0.45 : 0.2} />
    </mesh>
    <mesh><sphereGeometry args={[Math.max(0.012, radius * 1.8), 10, 10]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    {(active || hover) && <Text position={[0, 0.045 + 0.035 * k, 0]} fontSize={0.048} color="#0f172a" anchorX="center" anchorY="bottom" depthOffset={-3}>{terminal.label}</Text>}
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
  return <sprite position={[center.x, center.y, center.z]} scale={[diameter, diameter, 1]} material={material} renderOrder={-1} raycast={() => null} userData={{ noSnapshot: true }} />
}

function OrientedInstance({ c, pivot, sourcePivot, orientation, selected, editingTerminals, movable, draggable, connectionMode, connectionStartId, probing, onTerminalPick, onSelect, onMove, onDragStart, onDragTo, onDragEnd, children }: {
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
  probing: boolean
  onSelect: (additive?: boolean) => void
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
    if (!draggable || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || !rootRef.current) return
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
    userData={{ wireSurface: true }}
    onClick={(event) => { event.stopPropagation(); if (!connectionMode) onSelect(event.ctrlKey || event.metaKey || event.shiftKey) }}
    onPointerDown={startDrag}
    onPointerOver={() => { if (draggable) gl.domElement.style.cursor = 'grab' }}
    onPointerOut={() => { if (!dragRef.current) gl.domElement.style.cursor = '' }}
  >
    {selected && <SelectionGlow component={c} />}
    <group rotation={[0, 0, schematicRotation]} scale={[c.mirrored ? -1 : 1, 1, 1]}>
      <group rotation={rotation}>
        <group scale={[scale.x, scale.y, scale.z]}>
          <group ref={modelRef} position={[-sourcePivot[0], -sourcePivot[1], -sourcePivot[2]]}>{children}</group>
          {editingTerminals && <group userData={{ noSnapshot: true }}>{c.terminals.map((terminal) => <EditableTerminal3D key={terminal.id} component={c} terminal={terminal} active={terminal.id === activeTerminalId} />)}</group>}
          {connectionMode && !editingTerminals && <group userData={{ noSnapshot: true }}>{c.terminals.map((terminal) => <ConnectionTerminal3D key={terminal.id} component={c} terminal={terminal} active={terminal.id === connectionStartId} onPick={probing ? onTerminalPick : undefined} />)}</group>}
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

type LogoPage = 'home' | 'io' | 'clock' | 'diagnostics'
const LOGO_PAGES: LogoPage[] = ['home', 'io', 'clock', 'diagnostics']

/** Painel frontal funcional do LOGO!: LCD, seis teclas e LEDs ligados ao runtime. */
/**
 * Geometria da face frontal do LOGO! 12/24RC medida no CAD (unidades do painel,
 * modelo ajustado com a base em y = 0): janela do LCD (malha verde do GLB),
 * cruz de cursores e teclas ESC/OK (malha azul). O ecrã desenhado assenta
 * exatamente sobre a janela verde, sem flutuar nem tapar o corpo.
 */
const PANEL3D_SHORTCUTS: ShortcutHelpExtra[] = [
  SCHEMATIC_TOOL_SHORTCUTS,
  { title: 'Vista e câmara', items: [
    { keys: 'Home', action: 'Enquadrar tudo' },
    { keys: 'F', action: 'Enquadrar a seleção' },
    { keys: 'Num 1 · Num 3 · Num 7', action: 'Vista de frente · direita · superior (Ctrl inverte: trás · esquerda · inferior)' },
    { keys: 'Num 5', action: 'Vista isométrica' },
    { keys: 'G', action: 'Mostrar / ocultar a malha' },
    { keys: 'B', action: 'Mudar o fundo' },
    { keys: 'Botão do meio · Alt+arrastar', action: 'Mover a vista' },
    { keys: 'Roda do rato', action: 'Zoom' },
  ] },
  { title: 'Cabos', items: [
    { keys: 'Esc', action: 'Terminar o cabo / voltar a Selecionar' },
    { keys: 'Delete', action: 'Apagar o ponto de passagem selecionado' },
    { keys: 'Duplo clique no cabo', action: 'Criar uma curva (ponto de passagem)' },
  ] },
  VIEW_SHORTCUTS,
]

const LOGO_KEYS = { esc: [0.163, 0.289], ok: [0.276, 0.289], up: [0.218, 0.458], down: [0.218, 0.355], left: [0.166, 0.406], right: [0.27, 0.406], z: 0.276 } as const

function LogoFrontPanel({ c, interactive = true, screen = LOGO_SCREEN_FALLBACK }: { c: ElectricalComponent; interactive?: boolean; screen?: LogoFaceRect }) {
  const runState = useSimStore((s) => s.sim.runState)
  const scanCount = useSimStore((s) => s.sim.scanCount)
  const diagnostics = useSimStore((s) => s.sim.diagnostics)
  const [page, setPage] = useState<LogoPage>('home')
  // Margem de 1,5 mm dentro da janela (a moldura do visor fica à vista).
  const inset = 0.015
  const width = Math.max(0.05, screen.maxX - screen.minX - inset * 2)
  const height = Math.max(0.05, screen.maxY - screen.minY - inset * 2)
  const cx = (screen.minX + screen.maxX) / 2, cy = (screen.minY + screen.maxY) / 2
  const canvas = useMemo(() => { const node = document.createElement('canvas'); node.width = 384; node.height = Math.round(384 * height / width); return node }, [width, height])
  const texture = useMemo(() => { const value = new THREE.CanvasTexture(canvas); value.colorSpace = THREE.SRGBColorSpace; value.anisotropy = 4; return value }, [canvas])
  const powered = runState !== 'stopped' && !!c.state.powered
  const inputs = c.terminals.filter((t) => /^I\d+\.\d+$/i.test(t.label)).map((t) => !!t.energized)
  const outputs = c.terminals.filter((t) => /^Q\d+\.\d+$/i.test(t.label) && !t.label.includes('·')).map((t) => !!c.state.outputs?.[t.label])
  const errors = diagnostics.filter((item) => item.level === 'error').length
  const warnings = diagnostics.filter((item) => item.level === 'warning').length
  const running = powered && runState === 'running' && errors === 0
  const communication = running && scanCount % 6 < 2

  useEffect(() => {
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    // LCD monocromático com retroiluminação: verde-amarelado aceso, quase negro apagado.
    ctx.fillStyle = powered ? '#a9c28a' : '#1a221b'; ctx.fillRect(0, 0, W, H)
    if (!powered) { texture.needsUpdate = true; return }
    const grad = ctx.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, 'rgba(255,255,255,.12)'); grad.addColorStop(1, 'rgba(0,0,0,.08)')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)
    // 4 linhas × 12 carateres, como o visor do LOGO! 0BA6.
    const lineH = H / 4.4, size = Math.min(lineH * 0.78, W / 12 / 0.62)
    ctx.fillStyle = '#16231a'; ctx.textBaseline = 'middle'; ctx.font = `bold ${size}px ui-monospace, monospace`
    const line = (value: string, row: number) => ctx.fillText(value.slice(0, 12), W * 0.05, lineH * (row + 0.7))
    const bits = (list: boolean[], n: number) => Array.from({ length: n }, (_, i) => list[i] ? '1' : '0').join('')
    if (page === 'home') {
      line('LOGO! 12/24', 0); line(running ? '> RUN' : runState === 'paused' ? '> PAUSE' : '> STOP', 1)
      line(`I ${bits(inputs, 8)}`, 2); line(`Q ${bits(outputs, 4)}`, 3)
    } else if (page === 'io') {
      line('I 12345678', 0); line(`  ${bits(inputs, 8)}`, 1); line('Q 1234', 2); line(`  ${bits(outputs, 4)}`, 3)
    } else if (page === 'clock') {
      const now = new Date(); const days = ['Do', 'Se', 'Te', 'Qa', 'Qi', 'Sx', 'Sa']
      line(`${days[now.getDay()]} ${now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`, 0); line(now.toLocaleDateString('pt-PT'), 1)
      line(`SCAN ${String(scanCount % 1e6).padStart(6, '0')}`, 3)
    } else {
      line('DIAGNOSTICO', 0); line(`ERROS  ${errors}`, 1); line(`AVISOS ${warnings}`, 2); line(`COM ${communication ? 'ATIVA' : running ? 'PRONTA' : 'OFF'}`, 3)
    }
    texture.needsUpdate = true
  }, [canvas, texture, powered, page, running, runState, scanCount, errors, warnings, communication, inputs.join(''), outputs.join('')])

  useEffect(() => () => { texture.dispose() }, [texture])
  const move = (step: number) => setPage((current) => LOGO_PAGES[(LOGO_PAGES.indexOf(current) + step + LOGO_PAGES.length) % LOGO_PAGES.length])
  const key = (id: keyof typeof LOGO_KEYS, radius: number, action: () => void) => {
    const [px, py] = LOGO_KEYS[id] as readonly [number, number]
    return <mesh key={id} name={`logo-tecla-${id}`} position={[px, py, LOGO_KEYS.z + 0.002]}
      onPointerDown={(event) => { if (interactive) event.stopPropagation() }}
      onPointerUp={(event) => {
        if (!interactive) return
        event.stopPropagation()
        const state = useSimStore.getState()
        const locked = state.demoMode || state.sim.runState === 'running' || state.sim.runState === 'paused'
        if (!locked) state.selectComponents([c.id])
        action()
      }}>
      <circleGeometry args={[radius, 18]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  }

  return <group>
    <mesh name="logo-lcd" position={[cx, cy, screen.z + 0.0012]}><planeGeometry args={[width, height]} /><meshBasicMaterial map={texture} toneMapped={false} polygonOffset polygonOffsetFactor={-2} /></mesh>
    {key('esc', 0.045, () => setPage('home'))}{key('ok', 0.045, () => setPage(page === 'home' ? 'io' : page))}
    {key('up', 0.035, () => move(-1))}{key('down', 0.035, () => move(1))}
    {key('left', 0.035, () => move(-1))}{key('right', 0.035, () => move(1))}
  </group>
}

function LogoSiemens1224RCMesh({ c, x, interactive = true }: { c: ElectricalComponent; x: number; interactive?: boolean }) {
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
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((mat) => finishCadMaterial(mat, { envMapIntensity: 1.1 })) : finishCadMaterial(mesh.material, { envMapIntensity: 1.1 })
    })
    const fitted = fitComponentModel(obj, getComponentModelSpec(c.type)!, PANEL_UNITS_PER_MM, 'bottom')
    void applyCadSurfaceTextures(fitted)
    return fitted
  }, [scene])
  const screen = useMemo(() => logoScreenRect(model), [model])

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
          // A janela verde do CAD passa a moldura escura do visor; o LCD desenhado assenta por cima.
          std.color = new THREE.Color('#1c2620')
          std.emissive = new THREE.Color(on ? '#3f5f35' : '#000000')
          std.emissiveIntensity = on ? 0.35 : 0
        }
      }
    })
  }, [model, on])

  return (
    <group position={[x, RAIL_Y, 0]}>
      <primitive object={model} castShadow receiveShadow />
      <LogoFrontPanel c={c} interactive={interactive && !c.locked} screen={screen} />
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
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => finishCadMaterial(material, { envMapIntensity: 1.1 })) : finishCadMaterial(mesh.material, { envMapIntensity: 1.1 })
    })
    const fitted = fitComponentModel(obj, spec, PANEL_UNITS_PER_MM, 'bottom')
    void applyCadSurfaceTextures(fitted)
    return fitted
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
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((mat) => finishCadMaterial(mat, { envMapIntensity: 1.1 })) : finishCadMaterial(mesh.material, { envMapIntensity: 1.1 })
    })
    const fitted = fitComponentModel(obj, spec, PANEL_UNITS_PER_MM, 'bottom')
    void applyCadSurfaceTextures(fitted)
    return fitted
  }, [scene, spec])
  const simActive = useSimStore((s) => s.sim.runState !== 'stopped')
  const en = simActive && !!c.state.energized
  const armature = useMemo(() => model.getObjectByName('Node10'), [model])
  useFrame((_, delta) => {
    if (!armature) return
    armature.userData.contactorBaseZ ??= armature.position.z
    // Node10 é o núcleo/atuador frontal original do CWC. Ao energizar,
    // aproxima-se do corpo como a armadura de um contator real.
    const target = Number(armature.userData.contactorBaseZ) + (en ? -2.4 : 0)
    armature.position.z = THREE.MathUtils.damp(armature.position.z, target, 18, delta)
    armature.updateMatrixWorld(true)
  })
  return <group position={[x, RAIL_Y, 0]}>
    <primitive object={model} castShadow receiveShadow />
    {en && <pointLight color="#22c55e" intensity={0.22} distance={1.3} position={[0, spec.targetHeight * 0.5, 0.35]} />}
    <Label text={c.ref} position={[0, spec.targetHeight + 0.12, 0.24]} color={en ? '#4ade80' : '#e2e8f0'} />
  </group>
}

/** Indicadores de estado para equipamentos GLB integrados que possuem sinalização frontal. */
function EquipmentStatusLights({ c, height }: { c: ElectricalComponent; height: number }) {
  const runState = useSimStore((s) => s.sim.runState)
  const scanCount = useSimStore((s) => s.sim.scanCount)
  const diagnostics = useSimStore((s) => s.sim.diagnostics)
  const plc = ['plcLsXbmDn32s', 'siemensTsAdapterIeBasic'].includes(c.type)
  const safety = c.type === 'safetyRelay'
  // Disjuntores não têm LEDs reais: o estado vê-se na posição do manípulo, não em luzes inventadas.
  if (!plc && !safety) return null
  const error = diagnostics.some((item) => item.level === 'error') || !!c.state.tripped
  const powered = runState !== 'stopped' && !!c.state.powered
  const run = powered && runState === 'running' && !error
  const comm = plc && run && scanCount % 6 < 2
  const lights = plc
    ? [{ c: '#22c55e', on: run }, { c: '#ef4444', on: error }, { c: '#38bdf8', on: comm }]
    : safety
      ? [{ c: '#22c55e', on: powered && !error }, { c: '#ef4444', on: error }]
      : []
  const physical = getComponentModelSpec(c.type)?.physicalSizeMm
  const halfDepth = ((physical?.depth ?? 68) * PANEL_UNITS_PER_MM) / 2
  // Dentro da face frontal: os três aparelhos são slim (22–30 mm); a 24 mm fixos os LED ficavam no ar.
  const ledX = (physical?.width ?? 60) * PANEL_UNITS_PER_MM * 0.24
  return <group position={[ledX, height * 0.64, halfDepth + 0.002]}>{lights.map((light, index) => <group key={index} position={[0, -index * 0.055, 0]}>
    <mesh raycast={() => null}>
      <circleGeometry args={[0.018, 14]} /><meshStandardMaterial color={light.on ? light.c : '#334155'} emissive={light.on ? light.c : '#000'} emissiveIntensity={light.on ? 2.4 : 0} toneMapped={!light.on} />
    </mesh>
    <GlowHalo color={light.c} on={light.on} radius={0.018} kind="led" position={[0, 0, 0.002]} />
  </group>)}</group>
}

/** CAD genérico de calha DIN, normalizado a partir da especificação partilhada. */
function CadComponentReal3D({ c, x, position, interactive = true }: { c: ElectricalComponent; x: number; position?: [number, number, number]; interactive?: boolean }) {
  const spec = getComponentModelSpec(c.type)!
  const centered = !!position
  const { scene } = useGLTF(spec.path)
  const model = useMemo(() => {
    const obj = cloneModelScene(scene)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => finishCadMaterial(material, { envMapIntensity: 1.1 })) : finishCadMaterial(mesh.material, { envMapIntensity: 1.1 })
    })
    const fitted = fitComponentModel(obj, spec, PANEL_UNITS_PER_MM, centered ? 'center' : 'bottom')
    void applyCadSurfaceTextures(fitted)
    return fitted
  }, [scene, spec, centered])
  const simActive = useSimStore((s) => s.sim.runState !== 'stopped')
  const active = simActive && !!(c.state.energized || c.state.powered)
  const breaker = ['breaker1p', 'breaker2p', 'breaker3p', 'breakerSteckSdC25', 'motorBreakerPkzmC10', 'phoenixEcb3000760'].includes(c.type)
  /** Manípulo marcado no GLB (`dcsimu_handle_*`): charneira e curso medidos no CAD. */
  const rig = BREAKER_HANDLE_RIG[c.type]
  const breakerClosed = !!c.state.closed && !c.state.tripped
  const tripped = !!c.state.tripped

  // O manípulo é descoberto pela geometria (o que sai da frente da caixa), não
  // pelo nome do nó: cada CAD nomeia as peças à sua maneira.
  // Só depois de montado é que o modelo tem pai (o grupo do componente), e é
  // nesse referencial que a frente é mesmo +Z.
  const [handle, setHandle] = useState<ReturnType<typeof extractBreakerHandle>>(null)
  useEffect(() => {
    if (!breaker) { setHandle(null); return }
    const frame = model.parent
    if (!frame) return
    // A charneira vem da tabela `BREAKER_HANDLE_RIG`: o cubo redondo da alavanca (Easy9, Steck) nunca
    // coincide com o centro da caixa do manípulo, e sem isto a alavanca orbitaria em vez de rodar sobre si.
    const extracted = extractBreakerHandle(model, frame, rig?.hinge)
    setHandle(extracted)
    return () => { if (extracted) extracted.pivot.removeFromParent() }
  }, [model, breaker, rig])
  // Curso real: o ECB é um botão de pressão, os outros são alavancas.
  const pushButton = c.type === 'phoenixEcb3000760'
  const throwDeg = 17

  /* Animação do disjuntor (mola, não interpolação linear):
   *  · manobra manual → engate rápido com um ligeiro ressalto, como o estalo real;
   *  · disparo        → largada violenta para a posição intermédia de «disparado»;
   *  · posição        → 0 desligado · 0,55 disparado · 1 ligado.
   */
  const motion = useRef({ value: breakerClosed ? 1 : 0, velocity: 0, tripped })
  useFrame((_, delta) => {
    if (!handle) return
    const target = breakerClosed ? 1 : tripped ? 0.55 : 0
    const justTripped = tripped && !motion.current.tripped
    motion.current.tripped = tripped
    const stiffness = justTripped || tripped ? 2600 : 1400
    const zeta = justTripped ? 0.3 : 0.5
    const damping = 2 * Math.sqrt(stiffness) * zeta
    if (justTripped) motion.current.velocity -= 6
    const step = Math.min(delta, 1 / 45)
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const sub = step / 3
      const accel = (target - motion.current.value) * stiffness - motion.current.velocity * damping
      motion.current.velocity += accel * sub
      motion.current.value += motion.current.velocity * sub
    }
    if (Math.abs(target - motion.current.value) < 0.0008 && Math.abs(motion.current.velocity) < 0.02) {
      motion.current.value = target
      motion.current.velocity = 0
    }
    const value = THREE.MathUtils.clamp(motion.current.value, -0.12, 1.12)
    if (pushButton) {
      // botão: curso axial para dentro da caixa
      handle.pivot.position.z = handle.pivot.userData.restZ ?? (handle.pivot.userData.restZ = handle.pivot.position.z)
      handle.pivot.position.z -= handle.protrusion * 0.45 * value
    } else {
      /* Ligado = manípulo levantado (para o topo do aparelho).
       * Nos GLB montados com espelho em Z (`flipDepth`) o pivot está dentro do
       * nó espelhado, e o mesmo ângulo aparece ao contrário — daí o sinal. */
      const sense = spec.flipDepth ? 1 : -1
      if (rig?.axis === 'z') {
        // Botão rotativo (PKZM): sentido invertido face ao CAD para coincidir com o aparelho real
        // (OFF = pose CAD «O»; ON = 90° no sentido correto até «I»). 0,55 = disparado a meio.
        handle.pivot.rotation.z = (-value * rig.throwDeg * Math.PI) / 180
      } else if (rig) {
        // O CAD vem na posição DESLIGADA (alavanca para baixo, marcação legível): OFF = pose do CAD (0°) e
        // ON levanta a alavanca `throwDeg` graus à volta do cubo, em vez de oscilar simetricamente à volta da
        // pose desligada. Disparado (0,55) pára a meio, com a alavanca na horizontal, como num disjuntor real.
        handle.pivot.rotation.x = (-value * rig.throwDeg * Math.PI) / 180
      } else handle.pivot.rotation.x = (sense * -(value * 2 - 1) * throwDeg * Math.PI) / 180
    }
    handle.pivot.updateMatrixWorld(true)
  })
  return <group position={position ?? [x, RAIL_Y, 0]}>
    <primitive object={model} castShadow receiveShadow />
    {c.type === 'multimeterDm20' && <MultimeterDm20Panel component={c} model={model} interactive={interactive && !c.locked} />}
    <EquipmentStatusLights c={c} height={spec.targetHeight} />
    {active && !breaker && <pointLight color="#22c55e" intensity={0.18} distance={1.1} position={[0, spec.targetHeight * 0.55, 0.32]} />}
    <Label text={c.ref} position={[0, spec.targetHeight * (centered ? 0.5 : 1) + 0.1, 0.22]} color={active ? '#4ade80' : '#e2e8f0'} />
  </group>
}

/** Botão de emergência Metaltex com modelo CAD real e acionamento equivalente ao modelo procedural. */
function EmergencyButtonReal3D({ c, x, onPress }: { c: ElectricalComponent; x: number; onPress: (pressed: boolean) => void }) {
  const spec = getCommandModelSpec(c.type)!
  const { scene } = useGLTF(spec.path)
  const model = useMemo(() => {
    const fitted = fitComponentModel(cloneModelScene(scene), spec, PANEL_UNITS_PER_MM, 'center')
    applyEmergencyButtonFinish(fitted, c.type)
    void applyCadSurfaceTextures(fitted)
    return fitted
  }, [scene, spec, c.type])
  const pressed = !!c.state.pressed
  const keyOperated = c.type === 'emergencyButtonKeyP20ACR'

  /* Cabeça do botão (cogumelo + fole) separada do corpo pela geometria: é a única
   * peça que se afunda. Antes mexia-se o nó `…-solid1` inteiro, o que arrastava a
   * carcaça e o aro de fixação para dentro da chapa — a animação acontecia no
   * sítio errado. */
  const [head, setHead] = useState<ReturnType<typeof extractActuatorHead>>(null)
  useEffect(() => {
    if (keyOperated) { setHead(null); return }
    const frame = model.parent
    if (!frame) return
    const extracted = extractActuatorHead(model, frame)
    setHead(extracted)
    return () => { if (extracted) extracted.pivot.removeFromParent() }
  }, [model, keyOperated])

  /* Chave seletora (P20ACR): não se carrega, roda-se.
   * A peça que roda é descoberta pela geometria — tudo o que sai à frente da
   * caixa —, nunca pelo nome do nó, que muda de CAD para CAD. O curso é o da
   * chave real: um quarto de volta entre as duas posições. */
  const [keyHandle, setKeyHandle] = useState<ReturnType<typeof extractKeyBarrel>>(null)
  useEffect(() => {
    if (!keyOperated) { setKeyHandle(null); return }
    const frame = model.parent
    if (!frame) return
    const extracted = extractKeyBarrel(model, frame)
    setKeyHandle(extracted)
    return () => { if (extracted) extracted.pivot.removeFromParent() }
  }, [model, keyOperated])

  const KEY_TURN_DEG = 90
  useFrame((_, delta) => {
    if (keyOperated) {
      if (!keyHandle) return
      // Roda em torno do eixo do próprio botão (Z); a caixa e o bloco de contactos ficam quietos.
      const target = (pressed ? -KEY_TURN_DEG : 0) * Math.PI / 180
      keyHandle.pivot.rotation.z = THREE.MathUtils.damp(keyHandle.pivot.rotation.z, target, 14, delta)
      keyHandle.pivot.updateMatrixWorld(true)
      return
    }
    if (!head) return
    head.pivot.userData.restZ ??= head.pivot.position.z
    // Só a cabeça se afunda, no eixo do próprio botão (Z). 1 mm = PANEL_UNITS_PER_MM.
    const target = Number(head.pivot.userData.restZ) - (pressed ? head.travelMm * PANEL_UNITS_PER_MM : 0)
    head.pivot.position.z = THREE.MathUtils.damp(head.pivot.position.z, target, 16, delta)
    head.pivot.updateMatrixWorld(true)
  })
  return <group
    position={[x, RAIL_Y + 1.05, 0.4]}
    onClick={(event) => { event.stopPropagation(); onPress(c.state.latched ? true : !pressed) }}
    onContextMenu={(event) => { event.stopPropagation(); event.nativeEvent.preventDefault(); if (pressed) onPress(c.state.latched ? true : false) }}
  >
    <primitive object={model} castShadow receiveShadow />
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
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => finishCadMaterial(material, { envMapIntensity: 1.1 })) : finishCadMaterial(mesh.material, { envMapIntensity: 1.1 })
    })
    const fitted = fitComponentModel(obj, spec, PANEL_UNITS_PER_MM, 'center')
    void applyCadSurfaceTextures(fitted)
    return fitted
  }, [scene, spec])
  /* As tampas são encontradas pela cor do material do GLB, não pelo nome do nó:
   * o `Node8` (vermelho) nem sempre é o que se vê, e era por isso que só o
   * verde reagia. Verde = START (NA 13-14), vermelho = STOP (NF 21-22). */
  const caps = useMemo(() => {
    const found: { start: THREE.Object3D[]; stop: THREE.Object3D[] } = { start: [], stop: [] }
    model.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        const color = (material as THREE.MeshStandardMaterial).color
        if (!color) continue
        const { r, g, b } = color
        if (g > 0.35 && g > r * 2.2 && g > b * 2.2) { found.start.push(mesh); return }
        if (r > 0.35 && r > g * 2.2 && r > b * 2.2) { found.stop.push(mesh); return }
      }
    })
    return found
  }, [model])

  useFrame((_, delta) => {
    const moveCap = (parts: THREE.Object3D[], down: boolean) => {
      for (const part of parts) {
        part.userData.pushBaseZ ??= part.position.z
        const target = Number(part.userData.pushBaseZ) + (down ? 2.2 : 0)
        part.position.z = THREE.MathUtils.damp(part.position.z, target, 28, delta)
        part.updateMatrixWorld(true)
      }
    }
    moveCap(caps.start, !!c.state.startPressed)
    moveCap(caps.stop, !!c.state.stopPressed)
  })

  // Largar a tecla se o componente sair de cena a meio de um toque.
  const pressRelease = useRef<(() => void) | null>(null)
  useEffect(() => () => pressRelease.current?.(), [])

  // Qual das tampas foi clicada: sobe na hierarquia a partir da malha atingida.
  const capOf = (object: THREE.Object3D | null): 'start' | 'stop' | null => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      if (caps.start.includes(node)) return 'start'
      if (caps.stop.includes(node)) return 'stop'
    }
    return null
  }
  const press = (object: THREE.Object3D | null, down: boolean) => {
    const cap = capOf(object)
    if (cap === 'start') onStart(down)
    else if (cap === 'stop') onStop(down)
    else if (!down) { onStart(false); onStop(false) }
  }

  const release = () => { onStart(false); onStop(false) }
  // Sem `stopPropagation`: o arrasto do componente no painel continua a funcionar.
  return <group position={[x, RAIL_Y + 1.05, 0.4]}
    onPointerDown={(event) => { if (!capOf(event.object)) return; pressRelease.current = pressWhileHeld(event, () => press(event.object, true), release) }}
    onPointerOut={() => { pressRelease.current?.(); pressRelease.current = null }}>
    <primitive object={model} castShadow receiveShadow />
    <Label text={`${c.ref} · STOP / START`} position={[0, 0.35, 0.08]} />
  </group>
}

/** Caixa procedural de reserva; o GLB Proauto ainda não foi disponibilizado. */
function PowerSupply3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const simActive = useSimStore((s) => s.sim.runState !== 'stopped')
  const powered = simActive && (c.type === 'powerSupplyProauto24A' ? !!c.state.powered : !!c.state.on)
  if (c.type === 'powerSource1ph' || c.type === 'powerSource3ph') return <TerminalAssembly3D c={c} x={x} />
  const title = c.type === 'powerSupplyProauto24A' ? '24V / 5A' : '24V'
  return <group position={[x, RAIL_Y + 0.48, 0]}>
    <mesh castShadow><boxGeometry args={[0.85, 0.96, 0.48]} /><meshStandardMaterial color="#46515c" metalness={0.18} roughness={0.72} /></mesh>
    <mesh position={[0, 0.04, 0.25]}><boxGeometry args={[0.68, 0.65, 0.015]} /><meshStandardMaterial color="#d9e0e4" roughness={0.8} /></mesh>
    <mesh position={[0.22, -0.14, 0.27]}><sphereGeometry args={[0.045, 12, 12]} /><meshStandardMaterial color={powered ? '#16a34a' : '#64748b'} emissive={powered ? '#16a34a' : '#000000'} emissiveIntensity={powered ? 0.8 : 0} /></mesh>
    <Label text={title} position={[0, 0.1, 0.27]} size={0.1} />
    <Label text={c.ref} position={[0, 0.56, 0.22]} color="#e2e8f0" />
  </group>
}

/** Conjunto nativo completo, carregado do GLB composto pelos bornes originais. */
function TerminalAssembly3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const spec = getComponentModelSpec(c.type)!
  const { scene } = useGLTF(spec.path)
  const model = useMemo(() => {
    const object = fitComponentModel(cloneModelScene(scene), spec, PANEL_UNITS_PER_MM, 'bottom')
    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((mat) => finishCadMaterial(mat, { envMapIntensity: 1.3 }))
        : finishCadMaterial(mesh.material, { envMapIntensity: 1.3 })
      mesh.castShadow = mesh.receiveShadow = true
    })
    void applyCadSurfaceTextures(object)
    return object
  }, [scene, spec])
  return <group position={[x, RAIL_Y + 0.48, 0.12]}><primitive object={model} /></group>
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

function PLC3D({ c, x, interactive = true }: { c: ElectricalComponent; x: number; interactive?: boolean }) {
  if (c.type === 'plcSiemensLogo1224RC') {
    return (
      <Model3DErrorBoundary fallback={<PLCBox3D c={c} x={x} />}>
        <Suspense fallback={<PLCBox3D c={c} x={x} />}>
          <LogoSiemens1224RCMesh c={c} x={x} interactive={interactive} />
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
  const simActive = useSimStore((s) => s.sim.runState !== 'stopped')
  const color = c.state.color ?? (c.type === 'ledGreen' ? '#22c55e' : c.type === 'ledRed' ? '#ef4444' : '#eab308')
  const on = simActive && !!c.state.on
  return (
    <group position={[x, RAIL_Y + 1.15, 0.12]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.115, 0.115, 0.14, 24]} />
        <meshStandardMaterial color={on ? color : '#374151'} emissive={on ? color : '#000000'} emissiveIntensity={on ? 2.2 : 0} roughness={on ? 0.25 : 0.5} toneMapped={!on} />
      </mesh>
      {/* Halo encostado diretamente à superfície frontal do cilindro/lente */}
      <GlowHalo color={color} on={on} radius={0.115} kind="lamp" position={[0, 0, 0.116]} />
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
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => finishCadMaterial(material, { envMapIntensity: 1.1 })) : finishCadMaterial(mesh.material, { envMapIntensity: 1.1 })
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    const fitted = fitComponentModel(object, spec, PANEL_UNITS_PER_MM, 'center')
    void applyCadSurfaceTextures(fitted)
    return fitted
  }, [scene, spec])
  const simActive = useSimStore((s) => s.sim.runState !== 'stopped')
  const on = simActive && !!c.state.on
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
    {/* Halo encostado diretamente ao vidro exterior da lente frontal (z = +0,2575 no AD22 centrado) */}
    <GlowHalo color={color} on={on} radius={0.11} kind="lamp" position={[0, 0, 0.258]} />
    <Label text={`${c.ref} · AD22`} position={[0, 0.3, 0.08]} color="#334155" />
  </group>
}

function TowerLight3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const simActive = useSimStore((s) => s.sim.runState !== 'stopped')
  const bulbs: Array<[string, boolean]> = [
    ['#ef4444', simActive && !!c.state.red],
    ['#eab308', simActive && !!c.state.yellow],
    ['#22c55e', simActive && !!c.state.green],
  ]
  return (
    <group position={[x, RAIL_Y + 1.3, 0.12]}>
      {bulbs.map(([col, on], i) => (
        <group key={i} position={[0, 0.22 - i * 0.2, 0]}>
          <mesh>
            <cylinderGeometry args={[0.12, 0.12, 0.16, 20]} />
            <meshStandardMaterial color={on ? col : '#334155'} emissive={on ? col : '#000'} emissiveIntensity={on ? 2 : 0} toneMapped={!on} />
          </mesh>
          <GlowHalo color={col} on={on} radius={0.12} kind="tower" castLight={false} position={[0, 0, 0.12]} />
        </group>
      ))}
      <Label text={c.ref} position={[0, 0.42, 0]} />
    </group>
  )
}

/**
 * Botão que se pode carregar MAS sem impedir que o componente seja arrastado.
 *
 * O `pointerdown` NÃO é consumido: se o fosse, o grupo do componente nunca o
 * receberia e a botoeira deixaria de se poder mover no painel (era o que
 * acontecia com a botoeira verde/vermelha). A tecla carrega ao primeiro toque e
 * larga no `pointerup` — ou mal o cursor se desloque, porque aí o gesto é um
 * arrasto e não um toque no botão.
 */
function pressWhileHeld(event: ThreeEvent<PointerEvent>, press: () => void, release: () => void): () => void {
  press()
  const start = { x: event.clientX, y: event.clientY }
  const finish = () => {
    release()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
  }
  const onMove = (domEvent: PointerEvent) => {
    if (Math.hypot(domEvent.clientX - start.x, domEvent.clientY - start.y) >= 4) finish()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
  return finish
}

function PushButton3D({ c, x, onPress }: { c: ElectricalComponent; x: number; onPress: (p: boolean) => void }) {
  const pressed = !!c.state.pressed
  const isEmg = c.type === 'emergencyButton' || c.type === 'emergencyButtonKeyP20ACR'
  const isNC = c.type === 'buttonNC'
  const color = isEmg ? '#dc2626' : isNC ? '#ef4444' : c.type === 'buttonNO' ? '#22c55e' : '#eab308'
  const r = isEmg ? 0.17 : 0.1
  // Curso com mola: afunda depressa, regressa com ligeiro ressalto (emergência mantém-se travada em baixo).
  const cap = useRef<THREE.Mesh>(null)
  const spring = useRef<SpringState>({ value: pressed ? 1 : 0, velocity: 0 })
  useFrame((_, delta) => {
    if (!cap.current) return
    const latched = isEmg && pressed
    stepSpring(spring.current, pressed || latched ? 1 : 0, delta, pressed ? 'smooth' : 'snap', pressed ? 70 : 220)
    cap.current.position.y = -0.05 * spring.current.value
  })
  return (
    <group position={[x, RAIL_Y + 1.05, 0.4]}>
      <mesh castShadow position={[0, -0.06, -0.05]}>
        <cylinderGeometry args={[r + 0.03, r + 0.03, 0.05, 20]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh
        ref={cap}
        position={[0, pressed ? -0.05 : 0, 0]}
        onPointerDown={(event) => pressWhileHeld(event, () => onPress(true), () => onPress(false))}
        onPointerOut={() => pressed && onPress(false)}
      >
        <cylinderGeometry args={[r, r, 0.1, 24]} />
        <meshStandardMaterial color={color} emissive={pressed ? color : '#000'} emissiveIntensity={pressed ? 0.6 : 0} roughness={0.35} metalness={0.05} />
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

function Motor3D({ c, x, interactive = true }: { c: ElectricalComponent; x: number; interactive?: boolean }) {
  const running = !!c.state.running
  const dir = c.state.direction
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
      {c.state.showFan !== false && <group position={[0.78, 0, 0]}>
        <MotorShaftFan3D component={c} diameterMm={120} />
      </group>}
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
function MotorSewDrn80Mk4B3Real3D({ c, x, interactive = true }: { c: ElectricalComponent; x: number; interactive?: boolean }) {
  const spec = getComponentModelSpec('motor3ph')!
  const { scene } = useGLTF(spec.path)
  const shaftIndicator = useRef<THREE.Group>(null)
  const model = useMemo(() => {
    const object = cloneModelScene(scene)
    applyEditorMotorTextures(object)
    return fitComponentModel(object, spec, PANEL_UNITS_PER_MM, 'bottom')
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
      <MotorTerminalBoard3D c={c} interactive={interactive && !c.locked} />
      {/* Pá de três pás no veio (Ø19, x = 241…264 mm do CAD): roda com a velocidade simulada.
          Mostrar/ocultar: olho «Pá do veio» nas propriedades (state.showFan). */}
      {c.state.showFan !== false && <group position={motorCadToCentered([MOTOR_FAN.hubX, 0, 0]).map((v) => v * PANEL_UNITS_PER_MM) as [number, number, number]}>
        <MotorShaftFan3D component={c} />
      </group>}
      <group ref={shaftIndicator} position={[0.67 * MOTOR_SCALE_RATIO, 0.4 * MOTOR_SCALE_RATIO, 0]}>
        <mesh><boxGeometry args={[0.018, 0.1, 0.02]} /><meshStandardMaterial color={markerColor} emissive={running ? markerColor : '#000000'} emissiveIntensity={running ? 0.65 : 0} /></mesh>
      </group>
      {running && <pointLight color="#22c55e" intensity={0.22} distance={1.2} position={[0.58, 0.4, 0.2]} />}
    </group>
    <Text position={[0, MOTOR_TARGET_HEIGHT / 2 + 0.17, 0]} fontSize={0.105} color="#24324a" anchorX="center">
      {`${c.ref} · DRN80MK4/B3 ${running ? (direction === 'cw' ? '↻' : '↺') : '· parado'}`}
    </Text>
  </group>
}

/* ------------------------------------------------------------------ cabos 3D */

/** O modo vem da barra de ferramentas principal: ferramenta Cabo = ligar (e clicar num cabo para o editar); restantes = navegar/mover componentes. */
type Panel3DEditMode = 'navigate' | 'connect' | 'erase' | 'probe' | 'pan'

function cableCurve3D(points: Array<[number, number, number]>, _smooth: boolean): THREE.Curve<THREE.Vector3> {
  const plateSafeZ = PLATE_Z + PLATE_THICKNESS / 2 + 0.015
  const vectors: THREE.Vector3[] = []
  for (const point of points) {
    const next = new THREE.Vector3(point[0], point[1], Math.max(point[2], plateSafeZ))
    if (vectors.length === 0 || vectors[vectors.length - 1].distanceToSquared(next) > 1e-8) vectors.push(next)
  }
  if (vectors.length <= 2) {
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let index = 1; index < vectors.length; index += 1) path.add(new THREE.LineCurve3(vectors[index - 1], vectors[index]))
    return path
  }
  // O caminho já contém os arcos. Uma segunda spline pode voltar a entrar nos
  // sólidos depois da verificação de colisões; desenhar exatamente o traçado validado.
  const path = new THREE.CurvePath<THREE.Vector3>()
  for (let i = 1; i < vectors.length; i++) path.add(new THREE.LineCurve3(vectors[i - 1], vectors[i]))
  return path
}

/** Pega genérica para editar cabos: arrasta-se diretamente (sem gizmo) num plano virado para a câmara, com resposta em tempo real. */
function DragHandle3D({ position, onPress, onLive, onCommit, snap, onDoubleClick, children }: {
  position: V3
  onPress?: () => void
  onLive: (point: V3 | null) => void
  onCommit: (point: V3) => void
  snap?: (point: V3) => V3
  onDoubleClick?: () => void
  children: ReactNode
}) {
  const { camera, gl, controls } = useThree() as { camera: THREE.Camera; gl: THREE.WebGLRenderer; controls: { enabled: boolean } | null }
  const begin = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (event.nativeEvent.button !== 0) return
    onPress?.()
    const dom = gl.domElement
    const origin = new THREE.Vector3(position[0], position[1], position[2])
    const normal = camera.getWorldDirection(new THREE.Vector3())
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin)
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hitAt = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect()
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(plane, new THREE.Vector3())
    }
    const grab = hitAt(event.nativeEvent.clientX, event.nativeEvent.clientY) ?? origin.clone()
    const offset = origin.clone().sub(grab)
    const startX = event.nativeEvent.clientX
    const startY = event.nativeEvent.clientY
    let moved = false
    let last: V3 = position
    if (controls) controls.enabled = false
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return
      moved = true
      const hit = hitAt(e.clientX, e.clientY)
      if (!hit) return
      hit.add(offset)
      let next: V3 = [hit.x, hit.y, hit.z]
      if (snap && !e.altKey) next = snap(next)
      last = next
      onLive(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (controls) controls.enabled = true
      dom.style.cursor = ''
      if (moved) onCommit(last)
      onLive(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    dom.style.cursor = 'grabbing'
  }
  return <group position={position} userData={{ noPick: true }}
    onPointerDown={begin}
    onPointerOver={(event) => { event.stopPropagation(); gl.domElement.style.cursor = 'grab' }}
    onPointerOut={() => { gl.domElement.style.cursor = '' }}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={onDoubleClick ? (event) => { event.stopPropagation(); onDoubleClick() } : undefined}>
    {children}
    {/* área de captura generosa, invisível */}
    <mesh><sphereGeometry args={[0.12, 12, 12]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
  </group>
}

function EditableWireWaypoint3D({ point, index, active, onSelect, onLive, onCommit, onRemove }: {
  point: V3
  index: number
  active: boolean
  onSelect: (index: number) => void
  onLive: (index: number, point: V3 | null) => void
  onCommit: (index: number, point: V3) => void
  onRemove: (index: number) => void
}) {
  return <DragHandle3D position={point} onPress={() => onSelect(index)} onLive={(next) => onLive(index, next)} onCommit={(next) => onCommit(index, next)} onDoubleClick={() => onRemove(index)}>
    <mesh renderOrder={32}><sphereGeometry args={[active ? 0.075 : 0.058, 18, 18]} /><meshStandardMaterial color={active ? '#2563eb' : '#ffffff'} emissive={active ? '#1d4ed8' : '#64748b'} emissiveIntensity={active ? 0.65 : 0.18} depthTest={false} /></mesh>
    <Text position={[0, 0.1, 0]} fontSize={0.052} color="#1e3a8a" anchorX="center" anchorY="bottom" depthOffset={-4} raycast={() => null}>{index + 1}</Text>
  </DragHandle3D>
}

/** Pega numa ponta do cabo: arrasta-se (ligada ou livre) e encaixa no borne mais próximo ao largar; Religar/Soltar continuam no editor. */
function EditableWireEnd3D({ side, point, free, active, label, onSelect, onLive, onCommit, snap, probe = false }: {
  side: 'from' | 'to'
  point: V3
  free: boolean
  active: boolean
  label: string
  onSelect: (side: 'from' | 'to') => void
  onLive: (side: 'from' | 'to', point: V3 | null) => void
  onCommit: (side: 'from' | 'to', point: V3) => void
  snap: (point: V3) => V3
  /** Pinça/sonda do multímetro: pega maior e mais visível para arrastar. */
  probe?: boolean
}) {
  const size = probe ? (active ? 0.12 : 0.095) : (active ? 0.085 : 0.065)
  return <DragHandle3D position={point} onPress={() => onSelect(side)} onLive={(next) => onLive(side, next)} onCommit={(next) => onCommit(side, next)} snap={snap}>
    <mesh renderOrder={33}><octahedronGeometry args={[size, 0]} /><meshStandardMaterial color={active ? '#f59e0b' : free ? '#16a34a' : probe ? '#38bdf8' : '#ffffff'} emissive={active ? '#b45309' : free ? '#15803d' : probe ? '#0284c7' : '#475569'} emissiveIntensity={active ? 0.7 : probe ? 0.45 : 0.3} depthTest={false} /></mesh>
    <Text position={[0, probe ? 0.14 : 0.12, 0]} fontSize={probe ? 0.06 : 0.055} color="#7c2d12" anchorX="center" anchorY="bottom" depthOffset={-4} raycast={() => null}>{label}</Text>
  </DragHandle3D>
}

/** Pega no centro do cabo para o deslocar inteiro (curvas e pontas livres; os bornes ficam onde estão). */
function WireMoveHandle3D({ origin, onLive, onCommit }: { origin: V3; onLive: (point: V3 | null) => void; onCommit: (point: V3) => void }) {
  return <DragHandle3D position={origin} onLive={onLive} onCommit={onCommit}>
    <mesh renderOrder={33}><boxGeometry args={[0.1, 0.1, 0.1]} /><meshStandardMaterial color="#7c3aed" emissive="#5b21b6" emissiveIntensity={0.6} depthTest={false} /></mesh>
  </DragHandle3D>
}

type WireEditHandlers = {
  activeWaypointIndex: number | null
  activeEnd: 'from' | 'to' | null
  moveAll: boolean
  onSelectWire: (wireId: string) => void
  onSelectWaypoint: (index: number) => void
  onMoveWaypoint: (wireId: string, index: number, point: SpatialPoint3D) => void
  onRemoveWaypoint: (wireId: string, index: number) => void
  onInsertWaypoint: (wireId: string, index: number, point: SpatialPoint3D) => void
  onSelectEnd: (side: 'from' | 'to') => void
  onMoveEnd: (wireId: string, side: 'from' | 'to', point: SpatialPoint3D) => void
  onMoveAll: (wireId: string, delta: SpatialPoint3D) => void
  terminals: DrawTerminal[]
}

/* Cache de geometria de cabos (caminho + curva + nº de segmentos):
 * a chave cobre posições das pontas, waypoints manuais e opções de traçado;
 * a simulação muda apenas bandeiras energéticas e não entra na chave. */
type WireGeom = { path: WirePath3D; curve: THREE.Curve<THREE.Vector3>; segments: number; points: V3[] }
const wireGeomCache = new Map<string, WireGeom>()
function cachedWireGeometry(wire: Wire, from: WireEndpoint3D, to: WireEndpoint3D, obstacles: WireObstacle[], prebuiltPath?: WirePath3D): WireGeom {
  const round = (n: number) => n.toFixed(4)
  const pathSig = prebuiltPath
    ? prebuiltPath.points.map(p => p.map(round).join(',')).join(';')
    : 'solo'
  const key = [
    wire.id, wire.route, wire.bend, wire.curveOffset, wire.gauge, wire.flexibility,
    wire.fromEndType, wire.toEndType, wire.endType,
    from.position.map(round).join(','), to.position.map(round).join(','),
    (wire.waypoints3D ?? []).map((p) => `${round(p.x)},${round(p.y)},${round(p.z)}`).join(';'),
    pathSig,
    ...(prebuiltPath ? [] : obstacles.map(box => `${box.min.toArray().map(round)}:${box.max.toArray().map(round)}`)),
  ].join('|')
  const hit = wireGeomCache.get(key)
  if (hit) return hit
  const path = prebuiltPath ?? buildWirePath3D(wire, from, to, obstacles)
  const points = path.points
  const curve = cableCurve3D(points, wire.route === 'arc')
  const geom: WireGeom = { path, curve, segments: Math.min(180, Math.max(28, Math.round(points.length * 1.25))), points }
  if (wireGeomCache.size > 400) wireGeomCache.clear()
  wireGeomCache.set(key, geom)
  return geom
}

function Wires3D({ pivots, editMode, selectedWireId, ...handlers }: {
  pivots: Record<string, THREE.Vector3>
  editMode: Panel3DEditMode
  selectedWireId: string | null
} & WireEditHandlers) {
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

  // sólidos a contornar: os cabos passam à frente dos componentes, nunca por dentro.
  // A chave posicional mantém as caixas estáveis durante os ticks da simulação
  // (RUN muda c.state, não as posições): sem isto, cada scan re-gerava as caixas.
  const obstaclesKey = useMemo(() => components.map((c) => {
    const p = pivots[c.id]
    return p ? `${c.id}:${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}:${c.state.lengthMm ?? 0}:${c.rotation ?? 0}:${c.mirrored}:${JSON.stringify([componentOrientationOf(c), component3DScaleOf(c), c.terminals.map(t=>[t.id,t.position3D,t.socket3D])])}` : ''
  }).join('|'), [components, pivots])
  const obstacles = useMemo(() => componentObstacles(components, pivots), [obstaclesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Encaminhamento coordenado de todos os cabos: recalcula apenas quando mudam traçados/posições (nunca nos ticks de RUN).
  const wiresGeoKey = useMemo(() => wires.map((w) => [
    w.id, w.fromTerminalId, w.toTerminalId, w.route, w.bend, w.curveOffset, w.gauge, w.flexibility,
    w.fromEndType, w.toEndType, w.endType,
    w.fromPoint ? `${w.fromPoint.x},${w.fromPoint.y}` : '',
    w.toPoint ? `${w.toPoint.x},${w.toPoint.y}` : '',
    w.fromPoint3D ? `${w.fromPoint3D.x},${w.fromPoint3D.y},${w.fromPoint3D.z}` : '',
    w.toPoint ? `${w.toPoint3D?.x ?? ''},${w.toPoint3D?.y ?? ''},${w.toPoint3D?.z ?? ''}` : '',
    (w.waypoints3D ?? []).map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`).join(';'),
  ].join(':')).join('||'), [wires])
  const coordinatedPaths = useMemo(
    () => buildAllWirePaths3D(wires, components, pivots, obstacles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wiresGeoKey, obstaclesKey, obstacles],
  )
  const blockedNotice = useRef('')
  useEffect(() => {
    const blocked = wires.filter(w => coordinatedPaths.has(w.id) && coordinatedPaths.get(w.id)!.points.length < 2)
    const key = blocked.map(w => w.id).sort().join('|')
    if (key && key !== blockedNotice.current) useSimStore.getState().pushEvent('warning',
      `Não foi possível traçar ${blocked.map(w => w.number || w.id).join(', ')} sem atravessar um aparelho. Mova a ponta livre para fora do corpo ou afaste os aparelhos sobrepostos.`)
    blockedNotice.current = key
  }, [coordinatedPaths, wires])

  type LiveDrag = { wireId: string; kind: 'waypoint' | 'end' | 'all'; index?: number; side?: 'from' | 'to'; point: V3; origin?: V3 }
  const [drag, setDrag] = useState<LiveDrag | null>(null)
  const nearestTerminalPoint = (side: 'from' | 'to', wire: Wire) => (point: V3): V3 => {
    const otherId = side === 'from' ? wire.toTerminalId : wire.fromTerminalId
    let best: V3 = point
    let bestDistance = 0.12
    for (const terminal of handlers.terminals) {
      if (terminal.id === otherId) continue
      const distance = Math.hypot(terminal.position[0] - point[0], terminal.position[1] - point[1], terminal.position[2] - point[2])
      if (distance < bestDistance) { bestDistance = distance; best = terminal.position }
    }
    return best
  }
  const asFreeEnd = (point: V3) => ({ point: { x: panelToSchematicX(point[0]), y: panelToSchematicY(point[1]) }, point3D: toSpatial(point) })
  /** Cabo tal como está durante o arrasto (sem tocar na store até largar). */
  const applyDrag = (wire: Wire, base: { from: WireEndpoint3D | null; to: WireEndpoint3D | null }): Wire => {
    if (!drag || drag.wireId !== wire.id) return wire
    if (drag.kind === 'waypoint' && drag.index !== undefined) {
      const next = [...(wire.waypoints3D ?? [])]
      next[drag.index] = toSpatial(drag.point)
      return { ...wire, waypoints3D: next }
    }
    if (drag.kind === 'end' && drag.side) {
      const free = asFreeEnd(drag.point)
      return drag.side === 'from'
        ? { ...wire, fromTerminalId: '', fromPoint: free.point, fromPoint3D: free.point3D }
        : { ...wire, toTerminalId: '', toPoint: free.point, toPoint3D: free.point3D }
    }
    if (drag.kind === 'all' && drag.origin) {
      const delta: V3 = [drag.point[0] - drag.origin[0], drag.point[1] - drag.origin[1], drag.point[2] - drag.origin[2]]
      const shift = (p: V3): V3 => [p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]]
      const next: Wire = { ...wire, waypoints3D: wire.waypoints3D?.map((p) => toSpatial(shift(fromSpatial(p)))) }
      if (base.from?.free) { const f = asFreeEnd(shift(base.from.position)); next.fromPoint = f.point; next.fromPoint3D = f.point3D }
      if (base.to?.free) { const f = asFreeEnd(shift(base.to.position)); next.toPoint = f.point; next.toPoint3D = f.point3D }
      return next
    }
    return wire
  }

  return <group userData={{ noPick: true }}>{wires.map((storedWire) => {
    const baseFrom = wireEndpoint3D(storedWire, 'from', components, pivots, wires)
    const baseTo = wireEndpoint3D(storedWire, 'to', components, pivots, wires)
    if (!baseFrom || !baseTo) return null
    const wire = applyDrag(storedWire, { from: baseFrom, to: baseTo })
    const from = wireEndpoint3D(wire, 'from', components, pivots, wires) ?? baseFrom
    const to = wireEndpoint3D(wire, 'to', components, pivots, wires) ?? baseTo
    // Geometria do cabo em cache: durante RUN as bandeiras energizadas mudam em
    // cada scan, mas posições/traçado não — sem cache, cada tick reconstruía a
    // curva e os 3-4 TubeGeometry (centenas de segmentos) por cabo. Era o peso.
    const prebuilt = drag?.wireId === wire.id ? undefined : coordinatedPaths.get(storedWire.id)
    const { path, curve, segments, points } = cachedWireGeometry(wire, from, to, obstacles, prebuilt)
    if (points.length < 2) return null
    const selected = wire.id === selectedWireId
    const outerDiameterMm = cableOuterDiameterMm(wire.gauge)
    const radius = (outerDiameterMm * PANEL_UNITS_PER_MM) / 2
    const flowing = wireEnergyEffectVisible(runState, wire.energized)
    const wireColor = WIRE_3D_COLORS[wire.color]
    const editing = selected && (editMode === 'navigate' || editMode === 'connect')
    const manual = wire.waypoints3D ?? []
    const chain = [from.position, ...manual.map(fromSpatial), to.position]
    const label = (side: 'from' | 'to') => {
      const id = side === 'from' ? wire.fromTerminalId : wire.toTerminalId
      const free = side === 'from' ? from.free : to.free
      if (free) return side === 'from' ? 'A livre' : 'B livre'
      for (const component of components) {
        const terminal = component.terminals.find((candidate) => candidate.id === id)
        if (terminal) return `${side === 'from' ? 'A' : 'B'} ${component.ref}.${terminal.label}`
      }
      return side === 'from' ? 'A' : 'B'
    }
    const centroidOf = (waypoints: SpatialPoint3D[], a: WireEndpoint3D, b: WireEndpoint3D): V3 => {
      const pts = [...waypoints.map(fromSpatial), ...(a.free ? [a.position] : []), ...(b.free ? [b.position] : [])]
      const source = pts.length ? pts : [points[Math.floor(points.length / 2)]]
      return [source.reduce((sum, p) => sum + p[0], 0) / source.length, source.reduce((sum, p) => sum + p[1], 0) / source.length, source.reduce((sum, p) => sum + p[2], 0) / source.length]
    }
    const baseCentroid = drag?.kind === 'all' && drag.wireId === wire.id && drag.origin ? drag.origin : centroidOf(storedWire.waypoints3D ?? [], baseFrom, baseTo)
    const centroid = centroidOf(manual, from, to)
    return <group key={wire.id} userData={{ noPick: true }}>
      {selected && <mesh renderOrder={18} raycast={() => null} userData={{ noSnapshot: true }}>
        <tubeGeometry args={[curve, segments, radius + 0.014, 10, false]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.34} depthWrite={false} />
      </mesh>}
      <mesh castShadow receiveShadow renderOrder={19} raycast={() => null}>
        <tubeGeometry args={[curve, segments, radius, 14, false]} />
        <meshPhysicalMaterial color={wireColor} roughness={0.32} metalness={0.03} clearcoat={0.55} clearcoatRoughness={0.24} envMapIntensity={1.15} emissive={flowing ? wireColor : '#000000'} emissiveIntensity={flowing ? 0.07 : 0} />
      </mesh>
      {/* Volume transparente maior: seleção fiável (clique) e curvas novas (duplo clique) sem falsificar a secção visível. */}
      <mesh userData={{ wireHit: true }}
        onClick={(event) => { event.stopPropagation(); handlers.onSelectWire(wire.id) }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (editMode !== 'navigate' && editMode !== 'connect') return
          const hit: V3 = [event.point.x, event.point.y, event.point.z]
          const onCable = closestPointOnPolyline(points, hit)
          handlers.onInsertWaypoint(wire.id, waypointInsertIndex(chain, onCable), toSpatial(onCable))
        }}>
        <tubeGeometry args={[curve, Math.min(96, segments), Math.max(0.04, radius * 2.5), 8, false]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {!from.sharedFollower && <WireEnd3D geometry={path.starts[0]} wireRadius={radius} color={wireEndColor(wire, 'from', from.terminalColor)} />}
      {!to.sharedFollower && <WireEnd3D geometry={path.starts[1]} wireRadius={radius} color={wireEndColor(wire, 'to', to.terminalColor)} />}
      {flowing && <NeonCurrent3D curve={curve} segments={segments} radius={radius} color={wireColor} />}
      {editing && !handlers.moveAll && manual.map((point, index) => <EditableWireWaypoint3D key={`${wire.id}-${index}`} point={fromSpatial(point)} index={index} active={handlers.activeWaypointIndex === index}
        onSelect={handlers.onSelectWaypoint}
        onLive={(waypointIndex, next) => setDrag(next ? { wireId: wire.id, kind: 'waypoint', index: waypointIndex, point: next } : null)}
        onCommit={(waypointIndex, next) => handlers.onMoveWaypoint(wire.id, waypointIndex, toSpatial(next))}
        onRemove={(waypointIndex) => handlers.onRemoveWaypoint(wire.id, waypointIndex)} />)}
      {editing && !handlers.moveAll && (['from', 'to'] as const).map((side) => {
        const endKind = (side === 'from' ? wire.fromEndType : wire.toEndType) ?? wire.endType ?? 'none'
        return <EditableWireEnd3D key={`${wire.id}-${side}`} side={side} point={side === 'from' ? from.position : to.position} free={side === 'from' ? from.free : to.free} active={handlers.activeEnd === side} label={label(side)}
          probe={endKind === 'probe'}
          onSelect={handlers.onSelectEnd}
          snap={nearestTerminalPoint(side, storedWire)}
          onLive={(endSide, next) => setDrag(next ? { wireId: wire.id, kind: 'end', side: endSide, point: next } : null)}
          onCommit={(endSide, next) => handlers.onMoveEnd(wire.id, endSide, toSpatial(next))} />
      })}
      {editing && handlers.moveAll && <WireMoveHandle3D origin={centroid}
        onLive={(next) => setDrag(next ? { wireId: wire.id, kind: 'all', point: next, origin: baseCentroid } : null)}
        onCommit={(next) => handlers.onMoveAll(wire.id, { x: next[0] - baseCentroid[0], y: next[1] - baseCentroid[1], z: next[2] - baseCentroid[2] })} />}
    </group>
  })}</group>
}

/* -------------------------------------------------------------------- cena */

type PanelCameraView = 'fit' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric' | 'focus' | 'orbit' | 'angles'
type PanelCameraCommand = { id: number; view: PanelCameraView; target: [number, number, number]; dx?: number; dy?: number; yaw?: number; pitch?: number; radius?: number }

/** Estúdio de fotografia de produto gerado localmente (caixas de luz, sem HDR externo):
 *  brilho especular nítido nos termoplásticos e reflexos nos metais. Redesenha quando
 *  os mapas reais das superfícies CAD acabam de carregar (frameloop a pedido). */
function StudioEnvironment() {
  const { gl, scene, invalidate } = useThree()
  useEffect(() => {
    const prevEnv = scene.environment
    scene.environment = getStudioEnvironment(gl)
    if ('environmentIntensity' in scene) (scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 1
    invalidate()
    const stop = onCadTexturesReady(() => {
      gl.shadowMap.needsUpdate = true
      invalidate()
    })
    return () => {
      stop()
      if (scene.environment !== prevEnv) scene.environment = prevEnv
    }
  }, [gl, scene, invalidate])
  return null
}

/** Sombras sob pedido: o shadow map só é recalculado quando a cena muda e nos
 * primeiros segundos após o mount (os GLBs entram via Suspense já depois). */
function ShadowsOnDemand({ watch }: { watch: string }) {
  const gl = useThree((state) => state.gl)
  useEffect(() => { if (gl.shadowMap.enabled) gl.shadowMap.needsUpdate = true }, [gl, watch])
  useEffect(() => {
    if (!gl.shadowMap.enabled) return
    gl.shadowMap.needsUpdate = true
    const timers = [150, 450, 1000, 2000, 3500, 6000].map((ms) => window.setTimeout(() => { if (gl.shadowMap.enabled) gl.shadowMap.needsUpdate = true }, ms))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [gl])
  return null
}

const IS_SOFTWARE_WEBGL = (() => {
  if (typeof document === 'undefined') return false
  try {
    const probe = document.createElement('canvas')
    const ctx = (probe.getContext('webgl2') || probe.getContext('webgl')) as WebGLRenderingContext | null
    if (!ctx) return false
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info')
    const name = String((dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)) ?? '')
    ctx.getExtension('WEBGL_lose_context')?.loseContext()
    return /swiftshader|llvmpipe|software|lavapipe/i.test(name)
  } catch {
    return false
  }
})()

/** Em rasterizadores WebGL por software (SwiftShader / llvmpipe em CI), reduz DPR e cadencia frames em RUN sem bloquear o compositor. */
function SoftwareRunInvalidator({ active }: { active: boolean }) {
  const invalidate = useThree((state) => state.invalidate)
  const setDpr = useThree((state) => state.setDpr)
  useEffect(() => {
    if (IS_SOFTWARE_WEBGL) setDpr(0.5)
  }, [setDpr])
  useEffect(() => {
    if (!active) return
    let cancelled = false
    let timer = 0
    const step = () => {
      if (cancelled) return
      invalidate()
      requestAnimationFrame(() => {
        if (!cancelled) timer = window.setTimeout(step, 220)
      })
    }
    step()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [active, invalidate])
  return null
}

/** Câmara previsível: presets e foco não alteram qualquer posição do projeto. */
function PanelCameraRig({ command, railWidth, onStats, frontEdit = false, panMode = false, viewLocked = false }: { command: PanelCameraCommand; railWidth: number; onStats: (stats: { yaw: number; pitch: number; zoom: number }) => void; frontEdit?: boolean; panMode?: boolean; viewLocked?: boolean }) {
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
  // Transição suave entre vistas (cubo, botões, atalhos): a câmara desliza em arco em ~0,4 s.
  const firstCommandRef = useRef(true)
  const animRef = useRef<{ start: number; duration: number; fromDir: THREE.Vector3; toDir: THREE.Vector3; fromDist: number; toDist: number; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; fromUp: THREE.Vector3; toUp: THREE.Vector3 } | null>(null)
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const cancel = () => { animRef.current = null }
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [])
  useFrame(() => {
    const anim = animRef.current
    const controls = controlsRef.current
    if (!anim || !controls) return
    const raw = Math.min(1, (performance.now() - anim.start) / anim.duration)
    const t = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2
    const dot = anim.fromDir.dot(anim.toDir)
    const q = new THREE.Quaternion()
    if (dot < -0.999) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * t)
    else q.slerp(new THREE.Quaternion().setFromUnitVectors(anim.fromDir, anim.toDir), t)
    const dir = anim.fromDir.clone().applyQuaternion(q).normalize()
    const dist = THREE.MathUtils.lerp(anim.fromDist, anim.toDist, t)
    const target = anim.fromTarget.clone().lerp(anim.toTarget, t)
    camera.up.copy(anim.fromUp).lerp(anim.toUp, t).normalize()
    camera.position.copy(target).add(dir.multiplyScalar(dist))
    controls.target.copy(target)
    camera.lookAt(target)
    controls.update()
    report()
    if (raw >= 1) { camera.up.copy(anim.toUp); animRef.current = null }
  })
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    animRef.current = null
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
    const fitDistanceH = (Math.max(3.5, fit.railWidth) * 0.62) / Math.max(0.2, Math.tan(horizontalFov / 2))
    const fitDistanceV = (Math.max(5.0, fit.railWidth * 0.62) * 0.60) / Math.max(0.2, Math.tan(verticalFov / 2))
    const fitDistance = Math.max(3.6, Math.min(40, Math.max(fitDistanceH, fitDistanceV)))
    let position: THREE.Vector3
    const fromUp = camera.up.clone()
    const fromPosition = camera.position.clone()
    const fromTarget = controls.target.clone()
    camera.up.set(0, 1, 0)
    // Distância: se veio de um foco (radius), enquadra o objeto; senão usa a largura da cena.
    const limitingFov = Math.min(verticalFov, horizontalFov)
    const framedDistance = command.radius != null
      ? Math.max(0.5, command.radius / Math.sin(limitingFov / 2) * 1.18)
      : fitDistance
    if (command.view === 'focus') {
      const direction = camera.position.clone().sub(controls.target).normalize()
      if (!Number.isFinite(direction.x) || direction.lengthSq() < 0.1) direction.set(0.25, 0.35, 1)
      position = target.clone().add(direction.multiplyScalar(framedDistance))
    } else if (command.view === 'front') {
      position = target.clone().add(new THREE.Vector3(0, 0.02, framedDistance))
    } else if (command.view === 'back') {
      position = target.clone().add(new THREE.Vector3(0, 0.02, -framedDistance))
    } else if (command.view === 'right') {
      position = target.clone().add(new THREE.Vector3(framedDistance, 0.02, 0))
    } else if (command.view === 'left') {
      position = target.clone().add(new THREE.Vector3(-framedDistance, 0.02, 0))
    } else if (command.view === 'angles') {
      // Ângulos livres (cantos do cubo / vista vinda do Esquema 2D): yaw 0° = frente, pitch > 0 = por cima.
      const yaw = THREE.MathUtils.degToRad(command.yaw ?? 0)
      const pitch = THREE.MathUtils.degToRad(Math.max(-89, Math.min(89, command.pitch ?? 0)))
      position = target.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch) + 0.02, Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(framedDistance))
    } else if (command.view === 'top') {
      camera.up.set(0, 0, -1)
      position = target.clone().add(new THREE.Vector3(0, framedDistance, 0.01))
    } else if (command.view === 'bottom') {
      camera.up.set(0, 0, 1)
      position = target.clone().add(new THREE.Vector3(0, -framedDistance, 0.01))
    } else {
      // Isométrica: motor e equipamento isolado usam framedDistance; cena completa usa fit.
      position = target.clone().add(new THREE.Vector3(framedDistance * 0.68, framedDistance * 0.48, framedDistance * 0.78))
    }
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const fromOffset = fromPosition.clone().sub(fromTarget)
    const toOffset = position.clone().sub(target)
    if (firstCommandRef.current || reduceMotion || fromOffset.lengthSq() < 1e-6 || toOffset.lengthSq() < 1e-6) {
      firstCommandRef.current = false
      camera.position.copy(position)
      controls.target.copy(target)
      camera.lookAt(target)
      camera.updateProjectionMatrix()
      controls.update()
      report()
      return
    }
    const toUp = camera.up.clone()
    camera.up.copy(fromUp)
    animRef.current = {
      start: performance.now(), duration: 420,
      fromDir: fromOffset.clone().normalize(), toDir: toOffset.clone().normalize(),
      fromDist: fromOffset.length(), toDist: toOffset.length(),
      fromTarget, toTarget: target.clone(), fromUp, toUp,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, command])
  // A mão «Arrastar malha» faz pan também no esquema 3D. Fora desse modo,
  // o botão esquerdo continua a orbitar e o direito a deslocar a vista.
  const buttons = panMode || frontEdit
    ? { LEFT: panMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    : undefined
  const touches = panMode
    ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
    : frontEdit ? { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN } : undefined
  return <OrbitControls ref={controlsRef} minDistance={0.6} maxDistance={60} minPolarAngle={0.08} maxPolarAngle={Math.PI - 0.08} enablePan={!viewLocked} enableRotate={!viewLocked} enableZoom={!viewLocked} rotateSpeed={0.82} panSpeed={0.72} makeDefault onChange={report} mouseButtons={buttons} touches={touches} screenSpacePanning autoRotate={false} />
}

/** Textura repetível da grelha. Mipmaps e filtragem anisotrópica evitam o
 * efeito moiré em leque que surgia no Safari ao inclinar milhares de pontos. */
function editorGridTexture(style: 'dots' | 'lines', color: string, repeatX: number, repeatY: number, anisotropy: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')!
  context.clearRect(0, 0, 64, 64)
  if (style === 'lines') {
    context.strokeStyle = color
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(.5, 0)
    context.lineTo(.5, 64)
    context.moveTo(0, .5)
    context.lineTo(64, .5)
    context.stroke()
  } else {
    context.fillStyle = color
    context.beginPath()
    context.arc(1.5, 1.5, 1, 0, Math.PI * 2)
    context.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = Math.min(8, anisotropy)
  texture.needsUpdate = true
  return texture
}

/** Grelha partilhada do Esquema: usa o mesmo passo, pontos ou linhas e paleta
 * das superfícies 2D. Mipmaps e filtragem anisotrópica evitam moiré em 3D. */
function DotGrid({ size, style, dark, bounds }: { size: number; style: 'dots' | 'lines'; dark: boolean; bounds: PlateBounds | null }) {
  const { gl } = useThree()
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const cameraDirection = useMemo(() => new THREE.Vector3(), [])
  const step = Math.max(5, size)
  const widthPx = 2000
  const heightPx = 1400
  const fullW = widthPx * PANEL_UNITS_PER_PX
  const fullH = heightPx * PANEL_UNITS_PER_PX
  const cx = bounds ? (bounds.minX + bounds.maxX) / 2 : 0
  const cy = bounds ? (bounds.minY + bounds.maxY) / 2 : 0
  const width = bounds ? Math.min(fullW, bounds.maxX - bounds.minX) : fullW
  const height = bounds ? Math.min(fullH, bounds.maxY - bounds.minY) : fullH
  const texture = useMemo(() => {
    const anisotropy = gl.capabilities.getMaxAnisotropy()
    const t = editorGridTexture(style, dark ? EDITOR_THEME.dotDark : EDITOR_THEME.dot, (width / fullW) * (widthPx / step), (height / fullH) * (heightPx / step), anisotropy)
    // Mantém a grelha alinhada com o encaixe do Esquema, mesmo com a chapa recortada.
    t.offset.set(((cx - width / 2 + fullW / 2) / fullW) * (widthPx / step), ((cy - height / 2 + fullH / 2) / fullH) * (heightPx / step))
    return t
  }, [style, dark, gl, step, width, height, cx, cy, fullW, fullH])
  useEffect(() => () => texture.dispose(), [texture])
  const z = PLATE_Z + PLATE_THICKNESS / 2 + 0.004
  // Uma grelha plana deixa de representar distâncias quando vista de perfil: o fade
  // angular remove linhas em leque/moiré, mas mantém os pontos nas vistas úteis para editar.
  useFrame(({ camera }) => {
    camera.getWorldDirection(cameraDirection)
    const fade = THREE.MathUtils.smoothstep(Math.abs(cameraDirection.z), 0.3, 0.7)
    if (material.current) {
      material.current.opacity = (dark ? 0.55 : 0.6) * fade
      material.current.visible = fade > 0.015
    }
  })
  return (
    <mesh position={[cx, cy, z]} renderOrder={1}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial ref={material} map={texture} transparent opacity={dark ? 0.55 : 0.6} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  )
}

/** Fundo “mundo” partilhado pelo Esquema e pela Visualização 3D: chão + parede
 * de quadrícula atrás da chapa, para a cena ter profundidade em qualquer vista. */
/** Regista a captura da miniatura do projeto: renderiza uma vista frontal enquadrada
 *  na própria cena (mesmo renderer, mesmas luzes/modelos) e exporta um JPEG leve. */
function CoverSnapshotBridge({ bounds, background }: { bounds: PlateBounds | null; background: string }) {
  const { gl, scene, invalidate } = useThree()
  const ref = useRef({ bounds, background })
  ref.current = { bounds, background }
  useEffect(() => {
    registerCoverCapture(() => {
      const { bounds: b, background: bg } = ref.current
      const src = gl.domElement
      if (!b || src.width < 16 || src.height < 16) return null
      const fov = 44
      const aspect = src.width / src.height
      // Janela de recorte com formato de cover (16:10) centrada no painel.
      const target = 1.6
      const fh = Math.min(1, aspect / target)
      const fw = Math.min(1, (fh * target) / aspect)
      const cx = (b.minX + b.maxX) / 2
      const cy = (b.minY + b.maxY) / 2
      const halfTan = Math.tan((fov * Math.PI) / 360)
      const windowHeight = Math.max(b.maxY - b.minY, (b.maxX - b.minX) / target) * 1.1
      const dist = windowHeight / fh / 2 / halfTan + 0.6
      const cam = new THREE.PerspectiveCamera(fov, aspect, 0.05, 400)
      cam.position.set(cx, cy, dist)
      cam.lookAt(cx, cy, 0)
      cam.updateMatrixWorld()
      const hidden: THREE.Object3D[] = []
      scene.traverse((o) => { if (o.userData?.noSnapshot && o.visible) { o.visible = false; hidden.push(o) } })
      try {
        gl.render(scene, cam)
        const sw = src.width * fw, sh = src.height * fh
        const scale = Math.min(1, 800 / sw)
        const out = document.createElement('canvas')
        out.width = Math.max(1, Math.round(sw * scale))
        out.height = Math.max(1, Math.round(sh * scale))
        const ctx = out.getContext('2d')
        if (!ctx) return null
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, out.width, out.height)
        ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, out.width, out.height)
        return out.toDataURL('image/jpeg', 0.8)
      } finally {
        hidden.forEach((o) => { o.visible = true })
        invalidate()
      }
    })
    return () => registerCoverCapture(null)
  }, [gl, scene, invalidate])
  return null
}

function WorldBackdrop({ center, floorY, dark, showFloor = true }: { center: [number, number, number]; floorY: number; dark: boolean; showFloor?: boolean }) {
  const { floorMain: main, floorSub: sub } = editorPalette(dark)
  return (
    <group>
      {showFloor && <gridHelper args={[40, 80, main, sub]} position={[center[0], floorY, 0]} />}
      <gridHelper args={[40, 80, main, sub]} position={[center[0], center[1], PLATE_Z - 1.4]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  )
}

/** Plano que recebe o clique de colocação e mostra um "fantasma" alinhado à grelha sob o cursor. */
function PlacementPlane({ onPlace, step, size = 80 }: { onPlace: (x: number, y: number) => void; step: number; size?: number }) {
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const z = PLATE_Z + PLATE_THICKNESS / 2
  const snapPanel = (x: number, y: number) => {
    if (!step) return { x, y }
    const sx = Math.round((panelToSchematicX(x) - size / 2) / step) * step + size / 2
    const sy = Math.round((panelToSchematicY(y) - size / 2) / step) * step + size / 2
    return { x: schematicToPanelX(sx), y: schematicToPanelY(sy) }
  }
  const w = size * PANEL_UNITS_PER_PX
  return (
    <group>
      <mesh
        position={[0, 0, z + 0.001]}
        onPointerMove={(event) => { event.stopPropagation(); setGhost(snapPanel(event.point.x, event.point.y)) }}
        onPointerOut={() => setGhost(null)}
        onClick={(event) => { event.stopPropagation(); onPlace(event.point.x, event.point.y) }}
      >
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {ghost && (
        <mesh position={[ghost.x, ghost.y, z + 0.004]} renderOrder={3}>
          <planeGeometry args={[w, w]} />
          <meshBasicMaterial color="#2563eb" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

/** Visualização 3D do Esquema: mesmo projeto, à escala real, em sintonia com o Esquema 2D. */
export default function Panel3D({ initialCamera = null, onInitialCameraUsed, frontEdit = false }: { initialCamera?: ViewCubeRequest | null; onInitialCameraUsed?: () => void; /** Edição frontal: mesma cena 3D, vista frontal por prioridade e grelha por pontos do Esquema. */ frontEdit?: boolean } = {}) {
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  /** Telemóvel: a explicação da ferramenta fica a um toque (o cartão ocupava um quarto do ecrã). */
  useShortcutsRequest('schematic', () => setShortcutHelpOpen(true))
  const [glLost, setGlLost] = useState(false)
  const [softwareGl, setSoftwareGl] = useState(IS_SOFTWARE_WEBGL)
  const gridSettings = useSimStore((s) => s.grid)
  const placingType = useSimStore((s) => s.placingType)
  const setPlacingType = useSimStore((s) => s.setPlacingType)
  const storedComponents = useSimStore((s) => s.components)
  const addCanvasNote = useSimStore((s) => s.addCanvasNote)
  const updateCanvasNote = useSimStore((s) => s.updateCanvasNote)
  const canvasTexts = useSimStore((s) => s.canvasTexts)
  const updateCanvasText = useSimStore((s) => s.updateCanvasText)
  const removeCanvasText = useSimStore((s) => s.removeCanvasText)
  const pressButton = useSimStore((s) => s.pressButton)
  const setComponentState = useSimStore((s) => s.setComponentState)
  const addComponent = useSimStore((s) => s.addComponent)
  const selectComponents = useSimStore((s) => s.selectComponents)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const wires = useSimStore((s) => s.wires)
  const selectedWireId = useSimStore((s) => s.selectedWireId)
  const selectWire = useSimStore((s) => s.selectWire)
  const deleteWire = useSimStore((s) => s.deleteWire)
  const wireDefaults = useSimStore((s) => s.wireDefaults)
  const viewOrientationEditor = useSimStore((s) => s.viewOrientationEditor)
  const tool = useSimStore((s) => s.tool)
  const runState = useSimStore((s) => s.sim.runState)
  const demoMode = useSimStore((s) => s.demoMode)
  const viewLocked = useSimStore((s) => s.viewLocked)
  const gridDragEnabled = useSimStore((s) => s.gridDragEnabled)
  const editMode: Panel3DEditMode = demoMode ? 'navigate' : tool === 'wire' ? 'connect' : tool === 'select' ? 'navigate' : tool
  // Atuar botões, disjuntores e seletores apenas quando a simulação está ativa (RUN ou PAUSA).
  // Em STOP mantém-se apenas seleção/edição (e visualização estática na demonstração).
  const canActuate = runState !== 'stopped' && (demoMode || tool === 'select') && !viewOrientationEditor
  const interactive = canActuate
  const simLocked = demoMode || ((runState === 'running' || runState === 'paused') && !viewOrientationEditor)

  const probeA = useSimStore((state) => state.probeA)
  const probeResult = useSimStore((state) => state.probeResult)
  const [reconnect, setReconnect] = useState<{ wireId: string; end: 'from' | 'to' } | null>(null)
  const [activeWaypointIndex, setActiveWaypointIndex] = useState<number | null>(null)
  const [activeEnd, setActiveEnd] = useState<'from' | 'to' | null>(null)
  const [moveAllWire, setMoveAllWire] = useState(false)
  const [draft, setDraftState] = useState<WireDraft | null>(null)
  const draftRef = useRef<WireDraft | null>(null)
  const setDraft = (next: WireDraft | null | ((current: WireDraft | null) => WireDraft | null)) => {
    const resolved = typeof next === 'function' ? next(draftRef.current) : next
    draftRef.current = resolved
    setDraftState(resolved)
  }
  const wireEditBaselineRef = useRef<{ id: string; wire: Wire } | null>(null)
  const [wireEditDirty, setWireEditDirty] = useState(false)
  // As ações do traçado do cabo vivem no painel lateral esquerdo (ver ui/wireActionSlot).
  const wireActionSlot = useWireActionSlot()
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
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageVisible, setStageVisible] = useState(true)
  const [burstActive, setBurstActive] = useState(true)
  // No simulador a câmara abre sempre em vista frontal; apenas o motor tem orientação isométrica.
  const [cameraCommand, setCameraCommand] = useState<PanelCameraCommand>({ id: 0, view: 'front', target: [0, 0, 0.3] })
  useEffect(() => {
    setBurstActive(true)
    const timer = window.setTimeout(() => setBurstActive(false), 950)
    return () => window.clearTimeout(timer)
  }, [cameraCommand.id, storedComponents])
  useEffect(() => {
    const node = stageRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setStageVisible(entry.isIntersecting), { threshold: 0.01 })
    io.observe(node)
    const onVis = () => setStageVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
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
  /* Anotações: comentário em nota (abre já para escrever, sem caixa do sistema) e texto livre (clicar para colocar). */
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [placingText, setPlacingText] = useState(false)
  useEffect(() => {
    useSimUi.setState({ textPlacement: placingText })
    return () => { useSimUi.setState({ textPlacement: false }) }
  }, [placingText])
  const annotationView = frontEdit ? 'schematic' as const : '3d' as const
  const textPlaneZ = PLATE_Z + PLATE_THICKNESS / 2 + 0.004
  const addNote = () => {
    const [x, y, z] = sceneCenterRef.current
    const before = new Set(useSimStore.getState().canvasNotes.map((note) => note.id))
    addCanvasNote({ text: '', view: annotationView, x, y, z, color: NOTE_COLORS[0].id, messages: [] })
    const created = useSimStore.getState().canvasNotes.find((note) => !before.has(note.id))
    setPlacingText(false)
    if (created) setOpenNoteId(created.id)
  }
  const placeText = (point: [number, number, number]) => {
    const id = useSimStore.getState().addCanvasText({ ...DEFAULT_TEXT_STYLE_3D, view: annotationView, text: 'Texto', x: point[0], y: point[1], z: point[2] })
    setPlacingText(false)
    setSelectedTextId(id)
    setEditingTextId(id)
  }
  const selectedText = canvasTexts.find((item) => item.id === selectedTextId) ?? null
  useEffect(() => {
    if (!placingText && !selectedTextId) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setPlacingText(false); setSelectedTextId(null); return }
      if (selectedTextId && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault(); event.stopImmediatePropagation()
        removeCanvasText(selectedTextId); setSelectedTextId(null)
      }
      if (selectedTextId && (event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
        event.preventDefault(); event.stopImmediatePropagation()
        const item = useSimStore.getState().canvasTexts.find((text) => text.id === selectedTextId)
        if (!item) return
        const key = event.key.toLowerCase() === 'b' ? 'bold' : event.key.toLowerCase() === 'i' ? 'italic' : 'underline'
        updateCanvasText(selectedTextId, { [key]: !item[key] })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [placingText, selectedTextId, removeCanvasText, updateCanvasText])
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
  // Primeira vez que o projeto tem equipamento: enquadra-o em vista frontal (apenas o motor é isométrico).
  const fittedRef = useRef(false)
  const initialCameraRef = useRef(initialCamera)
  useEffect(() => {
    if (!initialCameraRef.current) moveCamera('front')
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
      if (initialCameraRef.current) applyCubeRequest(initialCameraRef.current)
      else moveCamera('front')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasComponents])
  const toggleGrid = () => setShowGrid((current) => {
    const next = !current
    try { localStorage.setItem('dc-simu:panel3d:grid', next ? '1' : '0') } catch {}
    return next
  })

  /* As dicas e o enquadramento vivem na barra de ferramentas: o canvas não tem cartões
   * flutuantes (DC-ADR-059). Este componente publica a dica da ferramenta ativa (a barra
   * mostra-a) e executa os pedidos de enquadramento que ela envia. */
  const setCanvasHint = useSimUi((state) => state.setCanvasHint)
  const canvasHint = useMemo(() => {
    if (placingText) return 'Clique no desenho para colocar o texto · Esc cancela'
    const base = tool === 'wire' ? 'Cabo: clique nos bornes para ligar · Esc termina'
      : tool === 'erase' ? 'Apagar: clique num componente ou cabo · Ctrl+Z desfaz'
      : tool === 'probe' ? (probeA ? 'Sonda: escolha o segundo borne' : 'Sonda: escolha o primeiro borne')
      : tool === 'pan' ? 'Mover vista: arraste o desenho'
      : interactive ? 'Simulação: clique nos dispositivos para os acionar'
      : selectedIds.length ? `${selectedIds.length} selecionado${selectedIds.length > 1 ? 's' : ''} · F enquadra`
      : 'Selecionar: clique para escolher · arraste para mover'
    return probeResult ? `${base} · ${probeResult.note}${probeResult.b ? ` · ${probeResult.voltage}` : ''}` : base
  }, [tool, probeA, probeResult, interactive, selectedIds.length, placingText])
  useEffect(() => { setCanvasHint(canvasHint) }, [canvasHint, setCanvasHint])
  useCanvasAction((action) => {
    if (demoMode && (action === 'addNote' || action === 'addText')) return
    if (action === 'fit') moveCamera('fit')
    else if (action === 'focusSelection' && selectedTarget) focusSelection()
    else if (action === 'addNote') addNote()
    else if (action === 'addText') { setPlacingText(value => !value); setSelectedTextId(null) }
  })

  // ao trocar de ferramenta na barra principal, larga qualquer ligação/edição a meio
  const resetInteraction = () => {
    setReconnect(null)
    setDraft(null)
    setActiveEnd(null)
    setMoveAllWire(false)
    setActiveWaypointIndex(null)
  }
  useEffect(() => {
    resetInteraction()
    if (tool === 'wire') selectComponents([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])
  const pickConnectionTerminal = (terminalId: string) => {
    const store = useSimStore.getState()
    if (store.tool === 'probe') { store.selectTerminal(terminalId); store.runProbe(); return }
    if (reconnect) {
      const wire = store.wires.find((candidate) => candidate.id === reconnect.wireId)
      if (!wire) return setReconnect(null)
      const otherId = reconnect.end === 'from' ? wire.toTerminalId : wire.fromTerminalId
      if (terminalId === otherId) return
      store.commitHistory()
      store.updateWire(wire.id, reconnect.end === 'from' ? { fromTerminalId: terminalId, fromPoint: undefined, fromPoint3D: undefined } : { toTerminalId: terminalId, toPoint: undefined, toPoint3D: undefined })
      store.step()
      store.selectWire(wire.id)
      setReconnect(null)
      return
    }
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
  /** Só geometria/posições contam para sombras: RUN mexe estados, não posições. */
  const shadowWatch = useMemo(() => {
    const pos = components.map((c) => { const p = panelPivots[c.id]; return p ? `${c.id}:${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}:${c.rotation ?? 0}` : c.id }).join('|')
    return `${pos}#${wires.length}#${runState}`
    // panelPivots é objecto novo em cada render; a chave deriva de valores, não da identidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, wires.length, runState])

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
  const removePanelComponent = (id: string) => {
    const store = useSimStore.getState()
    const component = store.components.find((item) => item.id === id)
    if (!component) return
    if (component.locked) { store.pushEvent('warning', `${component.ref} está bloqueado. Desbloqueie-o no Inspetor para o eliminar.`); return }
    store.deleteComponents([id])
  }
  const activateComponent = (component: ElectricalComponent, action: () => void) => {
    const currentTool = useSimStore.getState().tool
    if (currentTool === 'erase') { removePanelComponent(component.id); return }
    if (currentTool !== 'select') return
    if (component.locked) return
    if (canActuate) {
      // Botões, cogumelo, START/STOP: atuam em STOP e em RUN.
      action()
      // Em RUN/PAUSA não mexer na seleção; em STOP o dispositivo fica no Inspetor.
      if (!simLocked) selectComponents([component.id])
    } else if (!simLocked) {
      selectComponents([component.id])
    }
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
      movable={false}
      draggable={tool === 'select' && !simLocked && !gridDragEnabled && !component.locked && !viewOrientationEditor && !reconnect}
      connectionMode={editMode === 'connect' || tool === 'probe' || reconnect !== null}
      probing={tool === 'probe'}
      connectionStartId={tool === 'probe' ? probeA : draft && 'terminalId' in draft.from ? draft.from.terminalId : null}
      onSelect={(additive) => {
        if (tool === 'erase') { removePanelComponent(component.id); return }
        if (tool !== 'select') return
        // Em RUN/PAUSA a seleção está bloqueada — só botões e liga/desliga respondem.
        if (simLocked) return
        // Ctrl/Shift + clique: seleção múltipla, como no esquema 2D e no Admin.
        const current = useSimStore.getState().selectedComponentIds
        if (additive && current.includes(component.id)) selectComponents(current.filter((id) => id !== component.id))
        else selectComponents([component.id], additive)
      }}
      onMove={(position) => movePanelComponent(component, position)}
      onDragStart={() => beginPanelDrag(component.id)}
      onDragTo={(point) => dragPanelTo(component.id, point)}
      onDragEnd={() => endPanelDrag(component.id)}
      onTerminalPick={pickConnectionTerminal}
    >{content}</OrientedInstance>
  }
  const selectedWire = selectedWireId ? wires.find((wire) => wire.id === selectedWireId) : undefined
  useEffect(() => {
    wireEditBaselineRef.current = selectedWire ? { id: selectedWire.id, wire: structuredClone(selectedWire) } : null
    setWireEditDirty(false)
  }, [selectedWire?.id])
  // A esfera contém os volumes reais, incluindo rotação/escala e seleção múltipla.
  const selectionBox = new THREE.Box3()
  for (const component of components.filter((item) => selectedIds.includes(item.id))) {
    const pivot = panelPivots[component.id]
    const half = componentHalfExtents(component, orientationFor(component))
    selectionBox.expandByPoint(new THREE.Vector3(pivot.x - half.x, pivot.y - half.y, pivot.z - half.z))
    selectionBox.expandByPoint(new THREE.Vector3(pivot.x + half.x, pivot.y + half.y, pivot.z + half.z))
  }
  const selectionSphere = selectionBox.isEmpty() ? null : selectionBox.getBoundingSphere(new THREE.Sphere())
  const selectedTarget = selectionSphere ? selectionSphere.center.toArray() as [number, number, number] : null
  /** Motor fora do painel: isométrica; equipamento no painel: frontal. */
  const focusSelection = () => {
    if (!selectedTarget || !selectionSphere) return
    const selected = components.filter((item) => selectedIds.includes(item.id))
    const onlyMotor = selected.length > 0 && selected.every((c) => c.type === 'motor3ph' || !isPanelBound(c))
    const hasMotor = selected.some((c) => c.type === 'motor3ph')
    const view: PanelCameraView = hasMotor && (onlyMotor || selected.length === 1) ? 'isometric' : 'front'
    setCameraCommand((current) => ({
      id: current.id + 1,
      view,
      target: selectedTarget,
      radius: selectionSphere.radius,
    }))
  }
  const beginWireEdit = (wire: Wire) => {
    const store = useSimStore.getState()
    if (!wireEditDirty || wireEditBaselineRef.current?.id !== wire.id) {
      wireEditBaselineRef.current = { id: wire.id, wire: structuredClone(wire) }
      store.commitHistory()
    }
    setWireEditDirty(true)
    return store
  }
  const saveWireEdit = () => {
    if (!selectedWire) return
    const current = useSimStore.getState().wires.find((wire) => wire.id === selectedWire.id)
    if (current) wireEditBaselineRef.current = { id: current.id, wire: structuredClone(current) }
    setWireEditDirty(false)
    useSimStore.getState().pushEvent('info', `Cabo ${selectedWire.number || selectedWire.id} guardado no projeto.`)
  }
  const cancelWireEdit = () => {
    const baseline = wireEditBaselineRef.current
    if (!baseline) return
    const store = useSimStore.getState()
    store.updateWire(baseline.id, structuredClone(baseline.wire))
    store.step()
    setWireEditDirty(false)
    setActiveWaypointIndex(null)
    store.pushEvent('info', 'Edição 3D do cabo cancelada; os valores anteriores foram repostos.')
  }
  const wireEnds = (wire: Wire) => {
    const from = wireEndpoint3D(wire, 'from', components, panelPivots, wires)
    const to = wireEndpoint3D(wire, 'to', components, panelPivots, wires)
    return from && to ? { from, to } : null
  }
  const selectedWirePath = (() => {
    if (!selectedWire) return null
    const ends = wireEnds(selectedWire)
    return ends ? buildWirePath3D(selectedWire, ends.from, ends.to, componentObstacles(components, panelPivots)) : null
  })()
  const addWireWaypoint = () => {
    if (!selectedWire) return
    const ends = wireEnds(selectedWire)
    if (!ends) return
    const current = selectedWire.waypoints3D ?? []
    const chain = [ends.from.position, ...current.map(fromSpatial), ends.to.position]
    // novo ponto a meio do troço mais longo, à frente do painel, para ficar logo visível e arrastável
    let longest = 0
    let longestLength = -1
    for (let i = 0; i < chain.length - 1; i += 1) {
      const length = Math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1], chain[i + 1][2] - chain[i][2])
      if (length > longestLength) { longestLength = length; longest = i }
    }
    const a = chain[longest]
    const b = chain[longest + 1]
    const point: SpatialPoint3D = { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - (current.length === 0 ? 0.25 : 0), z: Math.max(a[2], b[2]) + 0.12 }
    insertWireWaypoint(selectedWire.id, longest, point)
  }
  const insertWireWaypoint = (wireId: string, index: number, point: SpatialPoint3D) => {
    const wire = useSimStore.getState().wires.find((candidate) => candidate.id === wireId)
    if (!wire) return
    const next = [...(wire.waypoints3D ?? [])]
    next.splice(Math.max(0, Math.min(index, next.length)), 0, point)
    beginWireEdit(wire).updateWire(wireId, { waypoints3D: next, route: wire.flexibility === 'flexible' && wire.route !== 'arc' ? 'arc' : wire.route })
    useSimStore.getState().selectWire(wireId)
    setMoveAllWire(false)
    setActiveEnd(null)
    setActiveWaypointIndex(Math.max(0, Math.min(index, next.length - 1)))
  }
  const moveWireWaypoint = (wireId: string, index: number, point: SpatialPoint3D) => {
    const wire = useSimStore.getState().wires.find((candidate) => candidate.id === wireId)
    if (!wire) return
    const next = [...(wire.waypoints3D ?? [])]
    next[index] = point
    beginWireEdit(wire).updateWire(wireId, { waypoints3D: next })
  }
  const removeWireWaypointAt = (wireId: string, index: number) => {
    const wire = useSimStore.getState().wires.find((candidate) => candidate.id === wireId)
    if (!wire) return
    const next = (wire.waypoints3D ?? []).filter((_, i) => i !== index)
    beginWireEdit(wire).updateWire(wireId, { waypoints3D: next.length ? next : undefined })
    setActiveWaypointIndex(null)
  }
  const removeWireWaypoint = () => {
    if (!selectedWire || activeWaypointIndex === null) return
    removeWireWaypointAt(selectedWire.id, activeWaypointIndex)
  }
  /** Pontas livres: ao largar perto de um borne, o cabo liga-se a ele; senão fica livre nesse ponto do espaço. */
  const moveWireEnd = (wireId: string, side: 'from' | 'to', point: SpatialPoint3D) => {
    const wire = useSimStore.getState().wires.find((candidate) => candidate.id === wireId)
    if (!wire) return
    const otherId = side === 'from' ? wire.toTerminalId : wire.fromTerminalId
    let nearest: DrawTerminal | null = null
    let nearestDistance = 0.12
    for (const terminal of drawTerminals) {
      if (terminal.id === otherId) continue
      const distance = Math.hypot(terminal.position[0] - point.x, terminal.position[1] - point.y, terminal.position[2] - point.z)
      if (distance < nearestDistance) { nearestDistance = distance; nearest = terminal }
    }
    const store = beginWireEdit(wire)
    if (nearest) {
      store.updateWire(wireId, side === 'from' ? { fromTerminalId: nearest.id, fromPoint: undefined, fromPoint3D: undefined } : { toTerminalId: nearest.id, toPoint: undefined, toPoint3D: undefined })
      store.pushEvent('info', `Ponta ${side === 'from' ? 'A' : 'B'} do cabo ${wire.number ?? ''} ligada a ${nearest.ref}.${nearest.label}.`)
      setActiveEnd(null)
    } else {
      const projected = { x: Math.round(panelToSchematicX(point.x)), y: Math.round(panelToSchematicY(point.y)) }
      store.updateWire(wireId, side === 'from' ? { fromTerminalId: '', fromPoint: projected, fromPoint3D: point } : { toTerminalId: '', toPoint: projected, toPoint3D: point })
    }
    store.step()
  }
  /** Solta uma ponta ligada: o cabo mantém a forma, a ponta fica livre onde o borne estava. */
  const detachWireEnd = (side: 'from' | 'to') => {
    if (!selectedWire) return
    const ends = wireEnds(selectedWire)
    if (!ends) return
    const end = side === 'from' ? ends.from : ends.to
    if (end.free) return
    const point: SpatialPoint3D = { x: end.position[0], y: end.position[1], z: end.position[2] }
    const projected = { x: Math.round(panelToSchematicX(point.x)), y: Math.round(panelToSchematicY(point.y)) }
    const store = beginWireEdit(selectedWire)
    store.updateWire(selectedWire.id, side === 'from' ? { fromTerminalId: '', fromPoint: projected, fromPoint3D: point } : { toTerminalId: '', toPoint: projected, toPoint3D: point })
    store.step()
    setActiveEnd(side)
  }
  const moveWholeWire = (wireId: string, delta: SpatialPoint3D) => {
    const wire = useSimStore.getState().wires.find((candidate) => candidate.id === wireId)
    if (!wire || (Math.abs(delta.x) + Math.abs(delta.y) + Math.abs(delta.z) < 1e-5)) return
    const shift = (p: SpatialPoint3D): SpatialPoint3D => ({ x: p.x + delta.x, y: p.y + delta.y, z: p.z + delta.z })
    const ends = wireEnds(wire)
    const patch: Partial<Wire> = {}
    if (wire.waypoints3D?.length) patch.waypoints3D = wire.waypoints3D.map(shift)
    const freeEnd = (side: 'from' | 'to') => {
      const end = side === 'from' ? ends?.from : ends?.to
      if (!end?.free) return
      const moved = shift({ x: end.position[0], y: end.position[1], z: end.position[2] })
      const projected = { x: Math.round(panelToSchematicX(moved.x)), y: Math.round(panelToSchematicY(moved.y)) }
      if (side === 'from') { patch.fromPoint = projected; patch.fromPoint3D = moved } else { patch.toPoint = projected; patch.toPoint3D = moved }
    }
    freeEnd('from')
    freeEnd('to')
    beginWireEdit(wire).updateWire(wireId, patch)
  }

  /** Bornes disponíveis para o desenho/ligação de cabos no 3D (posição física real). */
  const drawTerminals: DrawTerminal[] = components.flatMap((component) => {
    const pivot = panelPivots[component.id]
    if (!pivot) return []
    return component.terminals.map((terminal) => {
      const world = terminalWorld3D(component, terminal, pivot)
      return { id: terminal.id, position: [world.x, world.y, world.z] as V3, label: terminal.label, ref: component.ref, color: terminal.color }
    })
  })
  const draftStart = (from: WireDraft['from']) => setDraft({ from, points: [] })
  const draftAddPoint = (point: V3) => setDraft((current) => current ? { ...current, points: [...current.points, point] } : current)
  const draftFinish = (to: { terminalId: string } | { point: V3 }) => {
    const current = draftRef.current
    if (!current) return
    const lastIsEnd = 'point' in to && current.points.length && current.points[current.points.length - 1] === to.point
    const waypoints = (lastIsEnd ? current.points.slice(0, -1) : current.points).map(toSpatial)
    const from = 'terminalId' in current.from ? current.from : { point: toSpatial(current.from.point) }
    const end = 'terminalId' in to ? to : { point: toSpatial(to.point) }
    const id = useSimStore.getState().addWire3D(from, end, waypoints)
    setDraft(null)
    if (id) useSimStore.getState().selectWire(id)
  }
  const draftUndoPoint = () => setDraft((current) => {
    if (!current) return current
    if (current.points.length) return { ...current, points: current.points.slice(0, -1) }
    return null
  })
  const draftFinishFree = () => {
    const current = draftRef.current
    if (!current || !current.points.length) return
    draftFinish({ point: current.points[current.points.length - 1] })
  }
  const startReconnect = (end: 'from' | 'to') => {
    if (!selectedWire) return
    setDraft(null)
    setActiveEnd(null)
    setActiveWaypointIndex(null)
    setReconnect({ wireId: selectedWire.id, end })
  }
  // Legenda do cubo: diz em que vista estás (alinhada a uma face ≤ 4° ou livre) e lembra os atalhos.
  const cubeNote = (() => {
    const names: Record<string, string> = { front: 'Frontal', back: 'Trás', left: 'Esquerda', right: 'Direita', top: 'Superior', bottom: 'Inferior' }
    const wrapped = ((((cameraStats.yaw + 180) % 360) + 360) % 360) - 180
    const near = (v: number, a: number) => Math.abs(v - a) <= 4
    const aligned = (near(cameraStats.pitch, 0) && [0, 90, -90, 180, -180].some((a) => near(wrapped, a))) || Math.abs(cameraStats.pitch) >= 86
    const label = aligned ? `Vista ${names[cameraFacingFace(cameraStats.yaw, cameraStats.pitch)].toLowerCase()}` : 'Vista livre'
    return `${frontEdit ? 'Edição · ' : ''}${label} · Numpad 1/3/7/5`
  })()
  // Mesmo espaço de edição do editor de componentes do Admin: fundo liso com
  // grelha de pontos de 20 px e as mesmas cores de chão.
  const stageBackground = ''
  const palette = editorPalette(backgroundMode === 'dark')
  const sceneBackground = backgroundMode === 'white' ? '#ffffff' : palette.background
  const stageStyle = backgroundMode === 'white'
    ? { background: '#ffffff' }
    : {
        backgroundColor: palette.background,
        backgroundImage: `radial-gradient(circle, ${palette.dot} 1px, transparent 1px)`,
        backgroundSize: `${EDITOR_THEME.step}px ${EDITOR_THEME.step}px`,
      }

  // Atalhos dos cabos (leem sempre o estado atual através da ref).
  const wireKeysRef = useRef<(event: KeyboardEvent) => boolean>(() => false)
  wireKeysRef.current = (event) => {
    if (event.key === 'Escape') {
      if (draft) { setDraft(null); return true }
      if (activeWaypointIndex !== null || activeEnd || moveAllWire) { setActiveWaypointIndex(null); setActiveEnd(null); setMoveAllWire(false); return true }
      return false
    }
    if (draft && event.key === 'Enter') { event.preventDefault(); draftFinishFree(); return true }
    if (draft && (event.key === 'Backspace' || event.key === 'Delete')) { event.preventDefault(); draftUndoPoint(); return true }
    if (selectedWire && activeWaypointIndex !== null && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); removeWireWaypoint(); return true }
    return false
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || shortcutHelpOpen || (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return
      if (wireKeysRef.current(event)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setReconnect(null); setActiveWaypointIndex(null); setDraft(null)
        const store = useSimStore.getState()
        store.selectWire(null)
        store.clearProbe()
        if (store.tool !== 'select') store.setTool('select')
      }
      else if (event.key === 'Home' && event.code !== 'Numpad7' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); moveCamera('fit') }
      else if (/^Numpad[1357]$/.test(event.code) && !event.altKey && !event.metaKey) {
        // Como nos CAD: 1 frente · 3 direita · 7 superior · 5 isométrica; Ctrl inverte (trás · esquerda · inferior).
        event.preventDefault()
        const map: Record<string, PanelCameraView> = { Numpad1: event.ctrlKey ? 'back' : 'front', Numpad3: event.ctrlKey ? 'left' : 'right', Numpad7: event.ctrlKey ? 'bottom' : 'top', Numpad5: 'isometric' }
        moveCamera(map[event.code])
      }
      else if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey && selectedTarget) { event.preventDefault(); focusSelection() }
      else if (event.key.toLowerCase() === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); toggleGrid() }
      else if (event.key.toLowerCase() === 'b' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); cycleBackground() }
      else if (/^Digit[1-5]$/.test(event.code) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        // Mesmas teclas que a barra mostra: 1 Selecionar · 2 Cabo · 3 Sonda · 4 Apagar · 5 Mover vista
        event.preventDefault()
        useSimStore.getState().setTool((['select', 'wire', 'probe', 'erase', 'pan'] as const)[Number(event.code.slice(5)) - 1])
      }

    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // O alvo é recalculado apenas quando a seleção/posição visual muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join(','), selectedTarget?.[0], selectedTarget?.[1], selectedTarget?.[2], selectionSphere?.radius, shortcutHelpOpen])

  // Atalhos universais (desfazer, refazer, duplicar e apagar). O enquadramento
  // fica a cargo das teclas de vista do próprio 3D (Home e teclado numérico).
  useEditorShortcuts({
    undo: () => useSimStore.getState().undo(),
    redo: () => useSimStore.getState().redo(),
    remove: () => {
      const store = useSimStore.getState()
      if (store.selectedWireId) { store.deleteWire(store.selectedWireId); return }
      const unlocked = store.selectedComponentIds.filter((id) => !store.components.find((item) => item.id === id)?.locked)
      if (unlocked.length) store.deleteComponents(unlocked)
      if (unlocked.length < store.selectedComponentIds.length) store.pushEvent('warning', 'Os componentes bloqueados foram mantidos.')
    },
    duplicate: () => { const ids = useSimStore.getState().selectedComponentIds; if (ids.length) useSimStore.getState().duplicateComponents(ids) },
    group: () => useSimStore.getState().groupSelection(),
    ungroup: () => useSimStore.getState().ungroupSelection(),
    copy: () => useSimStore.getState().copySelection(),
    paste: () => useSimStore.getState().pasteClipboard(),
    help: () => setShortcutHelpOpen((open) => !open),
  }, { enabled: !shortcutHelpOpen && !demoMode })

   return (
     <div
       ref={stageRef}
       className={`panel3d-stage relative w-full h-full ${stageBackground}`}
       style={stageStyle}
       data-embedded-in-schematic="true"
       data-front-edit={frontEdit ? 'true' : 'false'}
       data-edit-mode={editMode}
       data-operating={interactive ? 'true' : 'false'}
       data-component-editing={viewOrientationEditor ? 'true' : 'false'}
       aria-label="Visualização 3D do Esquema"
       onDragOver={(e) => {
         if (demoMode) return
         e.preventDefault()
         e.dataTransfer.dropEffect = 'copy'
       }}
       onDrop={(e) => {
         if (demoMode) return
         e.preventDefault()
         const compType = e.dataTransfer.getData('text/plain') as ComponentType
         if (!compType || !canInsertComponent3D(compType)) return
         // Entra no centro da vista atual, à escala real, e o imã fixa-o à calha se ficar ao alcance.
         const [cx, cy] = sceneCenterRef.current
         const id = addComponent(compType, Math.round(panelToSchematicX(cx) - 40), Math.round(panelToSchematicY(cy) - 40))
         selectComponents(id ? [id] : [])
       }}
     >
      <ViewCube
          yaw={cameraStats.yaw}
          pitch={cameraStats.pitch}
          onPick={pickCubeView}
          onAngles={pickCubeAngles}
          onOrbit={orbitCamera}
          note={cubeNote}
          placement="top"
        />
      {selectedWire && !demoMode && wireActionSlot && createPortal(<div className="panel3d-wire-actions-panel" role="region" aria-label="Traçado do cabo no esquema 3D">
        <div className="panel3d-wire-actions-head">
          <strong>{selectedWire.number || 'Cabo'}</strong>
          <small>{selectedWire.gauge} · Ø {cableOuterDiameterMm(selectedWire.gauge).toFixed(1)} mm{selectedWirePath ? ` · ≈ ${wireLengthMm(selectedWirePath)} mm` : ''}</small>
          <i className={wireEditDirty ? 'is-dirty' : ''}>{wireEditDirty ? 'Alterado' : 'Sincronizado'}</i>
        </div>
        <div className="panel3d-wire-actions">
          <button type="button" onClick={addWireWaypoint} title="Adiciona um ponto de curva (também: duplo clique sobre o cabo)"><IconPlus size={11} />Ponto</button>
          <button type="button" disabled={activeWaypointIndex === null} onClick={removeWireWaypoint} title="Remove o ponto ativo (Delete, ou duplo clique no ponto)"><IconDelete size={11} />Ponto</button>
          <button type="button" className={moveAllWire ? 'is-active' : ''} aria-pressed={moveAllWire} onClick={() => { setMoveAllWire((value) => !value); setActiveWaypointIndex(null); setActiveEnd(null) }} title="Desloca o cabo inteiro com o manipulador 3D"><IconMove size={11} />Mover cabo</button>
          {activeEnd && <>
            <button type="button" onClick={() => startReconnect(activeEnd)} title="Escolher outro borne para esta ponta"><IconLink size={11} />Religar {activeEnd === 'from' ? 'A' : 'B'}</button>
            <button type="button" onClick={() => detachWireEnd(activeEnd)} title="Soltar a ponta do borne (fica livre no espaço)"><IconUnlock size={11} />Soltar {activeEnd === 'from' ? 'A' : 'B'}</button>
          </>}
          {wireEditDirty && <>
            <button type="button" onClick={cancelWireEdit}><IconClose size={11} />Repor traçado</button>
            <button type="button" className="is-primary" onClick={saveWireEdit}><IconSave size={11} />Fixar traçado</button>
          </>}
          <button type="button" className="is-danger" onClick={() => { deleteWire(selectedWire.id); setActiveWaypointIndex(null); setActiveEnd(null) }}><IconDelete size={11} />Eliminar cabo</button>
        </div>
        <small className="panel3d-wire-actions-hint">{moveAllWire ? 'Arraste o cubo roxo para mover o cabo.' : reconnect ? 'Clique no novo borne da ponta.' : 'Arraste as bolas no esquema 3D para curvar · duplo clique no cabo cria um ponto · cor, secção e terminações acima'}</small>
      </div>, wireActionSlot)}
      {!hasComponents && <div className="panel3d-empty"><strong>{frontEdit ? 'O esquema está vazio' : 'O esquema 3D está vazio'}</strong><span>Adicione equipamento na biblioteca ou arraste um componente para esta vista.</span></div>}
      <ContextLossNotice lost={glLost} />
      <Canvas frameloop={!stageVisible ? 'never' : (!softwareGl && (runState === 'running' || burstActive)) ? 'always' : 'demand'} shadows dpr={[1, 1.5]} gl={{ alpha: true, antialias: !IS_SOFTWARE_WEBGL, powerPreference: 'high-performance' }} camera={{ position: [0.6, 2.4, 6.4], fov: 44 }} onPointerMissed={() => { if (!demoMode && editMode !== 'connect') selectComponents([]) }}
        onCreated={({ gl }) => {
          gl.toneMapping = STUDIO_TONE_MAPPING
          gl.toneMappingExposure = STUDIO_EXPOSURE
          // Sombras calculadas só quando a cena muda (não a cada frame): durante o
          // RUN a re-sombra contínua era a maior fatia do custo de renderização.
          gl.shadowMap.autoUpdate = false
          gl.shadowMap.needsUpdate = true
          try {
            const ctx = gl.getContext()
            const dbg = ctx.getExtension('WEBGL_debug_renderer_info')
            const rendererName = String((dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)) ?? '')
            if (/swiftshader|llvmpipe|software|lavapipe/i.test(rendererName)) {
              gl.setPixelRatio(1)
              gl.shadowMap.enabled = false
              gl.shadowMap.needsUpdate = false
              setSoftwareGl(true)
            }
          } catch { /* ignore */ }
        }}>
        <StudioEnvironment />
        <SoftwareRunInvalidator active={softwareGl && stageVisible && (runState === 'running' || burstActive)} />
        <ShadowsOnDemand watch={shadowWatch} />
        <ContextLossGuard onChange={setGlLost} />
        <CoverSnapshotBridge bounds={plateBounds} background={sceneBackground} />
        <hemisphereLight args={['#f8fafc', '#3b4350', 0.38]} />
        <directionalLight position={[-3.2, 7.5, 6.2]} intensity={1.25} color="#fff7ee" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} />
        <directionalLight position={[5.8, 3.2, 2.4]} intensity={0.45} color="#e8f0ff" />
        {/* A grelha de edição partilhada permanece montada em todas as vistas 3D.
            A grelha de piso acrescenta profundidade nas vistas livres sem substituir a escala X/Y. */}
        {backgroundMode !== 'white' && <WorldBackdrop center={sceneCenter} floorY={floorY} dark={backgroundMode === 'dark'} showFloor={floorGridVisible(cameraStats.pitch)} />}
        {showGrid && gridSettings.enabled && <DotGrid size={gridSettings.size} style={gridSettings.style} dark={backgroundMode === 'dark'} bounds={frontEdit ? null : plateBounds} />}
        {frontEdit && placingType && canInsertComponent3D(placingType) && <PlacementPlane step={gridSettings.enabled && gridSettings.snap && gridSettings.size > 0 ? gridSettings.size : 0} onPlace={(x, y) => {
          const step = gridSettings.enabled && gridSettings.snap && gridSettings.size > 0 ? gridSettings.size : 0
          const snapTo = (value: number) => step ? Math.round(value / step) * step : Math.round(value)
          const id = addComponent(placingType, snapTo(panelToSchematicX(x) - 40), snapTo(panelToSchematicY(y) - 40))
          setPlacingType(null)
          selectComponents(id ? [id] : [])
        }} />}

        {plateBounds && <MountingPlate bounds={plateBounds} />}
        <CanvasAnnotations3D view={annotationView} readOnly={demoMode} placeZ={textPlaneZ}
          openNoteId={openNoteId} setOpenNoteId={setOpenNoteId}
          selectedTextId={selectedTextId} setSelectedTextId={setSelectedTextId}
          editingTextId={editingTextId} setEditingTextId={setEditingTextId}
          placingText={placingText} onPlaceText={placeText} />
        {railComponents.map((c) => {
          const x = positions[c.id].x
          let content: ReactNode
          if (isCatalogType(c.type)) content = <Model3DErrorBoundary fallback={<Breaker3D c={c} x={x} />}><Suspense fallback={<Breaker3D c={c} x={x} />}><CatalogComponent3D c={c} interactive={interactive && !c.locked} position={[x, RAIL_Y, 0]} anchor="bottom">{(top) => <Label text={c.ref} position={[0, top + 0.1, 0.22]} />}</CatalogComponent3D></Suspense></Model3DErrorBoundary>
          else if (c.type === 'plcSiemensLogo1224RC') content = <Model3DErrorBoundary fallback={<PLC3D c={c} x={x} interactive={interactive && !c.locked} />}><Suspense fallback={<PLC3D c={c} x={x} interactive={interactive && !c.locked} />}><LogoSiemens1224RCMesh c={c} x={x} interactive={interactive && !c.locked} /></Suspense></Model3DErrorBoundary>
          else if (c.type === 'powerSupplyProauto24A') content = <Model3DErrorBoundary fallback={<PowerSupply3D c={c} x={x} />}><Suspense fallback={<PowerSupply3D c={c} x={x} />}><ProautoReal3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          else if (c.type === 'contactorWegCWC09') content = <Model3DErrorBoundary fallback={<Contactor3D c={c} x={x} />}><Suspense fallback={<Contactor3D c={c} x={x} />}><WegContactorReal3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          else if (c.type === 'thermalRelay') content = <ThermalRelay3D c={c} x={x} />
          else if (hasDinRailModel(c.type)) {
            const fallback = c.type === 'phoenixEcb3000760' ? <PhoenixEcb3D c={c} x={x} /> : <Breaker3D c={c} x={x} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={fallback}><CadComponentReal3D c={c} x={x} interactive={interactive && !c.locked} /></Suspense></Model3DErrorBoundary>
          } else if (c.type.startsWith('contactor')) content = <Contactor3D c={c} x={x} />
          else if (c.type === 'powerSupply') content = <PowerSupply3D c={c} x={x} />
          else if (c.type === 'powerSource1ph' || c.type === 'powerSource3ph') content = <PowerSupply3D c={c} x={x} />
          else if (c.type === 'terminalSet1ph' || c.type === 'terminalSet3ph') content = <TerminalAssembly3D c={c} x={x} />
          else if (c.type.startsWith('plc')) content = <PLC3D c={c} x={x} interactive={interactive && !c.locked} />
          else if (c.type === 'vfd' || c.type === 'softStarter') content = <Drive3D c={c} x={x} />
          else content = <Breaker3D c={c} x={x} />
          const isBreaker = ['breaker1p', 'breaker2p', 'breaker3p', 'breaker4p', 'breakerSteckSdC25', 'motorBreakerPkzmC10', 'phoenixEcb3000760', 'motorBreaker', 'residualBreaker'].includes(c.type)
          if (isBreaker) content = <group onClick={(event) => {
            if (c.locked) return
            if (!canActuate) {
              if (!simLocked && useSimStore.getState().tool === 'select') {
                event.stopPropagation()
                useSimStore.getState().selectComponents([c.id])
              }
              return
            }
            event.stopPropagation()
            if (!simLocked) useSimStore.getState().selectComponents([c.id])
            const closed = !!c.state.closed && !c.state.tripped
            useSimStore.getState().setComponentState(c.id, { closed: !closed, tripped: false })
          }}>{content}</group>
          return wrapOriented(c, content)
        })}

        {mountingRails.map((c) => {
          const base = basePivots[c.id]
          return wrapOriented(c, <MountingRail3D c={c} position={[base.x, base.y, base.z]} />)
        })}

        {offRail.map((c) => {
          const x = front[c.id]
          let content: ReactNode
          if (isCatalogType(c.type)) {
            const fallback = <PushButton3D c={c} x={x} onPress={(pressed) => activateComponent(c, () => pressButton(c.id, pressed))} />
            const [px, py, pz] = frontPivot(c)
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={fallback}><CatalogComponent3D c={c} interactive={interactive && !c.locked} position={[x + px, py, pz]} anchor="center">{(top) => <Label text={c.ref} position={[0, top + 0.1, 0.1]} />}</CatalogComponent3D></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'multimeterDm20') {
            // O CAD e os bornes usam o mesmo pivô central também fora da calha.
            // A antiga montagem pela base deslocava o corpo 40 mm em profundidade.
            const [px, py, pz] = frontPivot(c)
            content = <Model3DErrorBoundary fallback={<Sensor3D c={c} x={x} onToggle={() => {}} />}><Suspense fallback={<Sensor3D c={c} x={x} onToggle={() => {}} />}><CadComponentReal3D c={c} x={x} position={[x + px, py, pz]} interactive={interactive && !c.locked} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'pilotLightAd22') {
            const fallback = <Lamp3D c={c} x={x} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={fallback}><PilotLightAd22Real3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'ledGreen' || c.type === 'ledRed' || c.type === 'ledYellow' || c.type === 'ledWhite' || c.type === 'buzzer') content = <Lamp3D c={c} x={x} />
          else if (c.type === 'towerLight') content = <TowerLight3D c={c} x={x} />
          else if (c.type === 'motor3ph') {
            const fallback = <Motor3D c={c} x={x} interactive={interactive && !c.locked} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={fallback}><MotorSewDrn80Mk4B3Real3D c={c} x={x} interactive={interactive && !c.locked} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'motor1ph') content = <Motor3D c={c} x={x} interactive={interactive && !c.locked} />
          else if (c.type === 'dualPushButtonNpb22D11' && getCommandModelSpec(c.type)) {
            const fallback = <PushButton3D c={c} x={x} onPress={(pressed) => activateComponent(c, () => setComponentState(c.id, { startPressed: pressed }))} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={fallback}><DualPushButtonReal3D c={c} x={x}
              onStart={(pressed) => activateComponent(c, () => setComponentState(c.id, { startPressed: pressed }))}
              onStop={(pressed) => activateComponent(c, () => setComponentState(c.id, { stopPressed: pressed }))} /></Suspense></Model3DErrorBoundary>
          } else if ((c.type === 'emergencyButton' || c.type === 'emergencyButtonKeyP20ACR') && getCommandModelSpec(c.type)) content = <Model3DErrorBoundary fallback={<PushButton3D c={c} x={x} onPress={(pressed) => activateComponent(c, () => pressButton(c.id, pressed))} />}><Suspense fallback={<PushButton3D c={c} x={x} onPress={(pressed) => activateComponent(c, () => pressButton(c.id, pressed))} />}><EmergencyButtonReal3D c={c} x={x} onPress={(pressed) => activateComponent(c, () => pressButton(c.id, pressed))} /></Suspense></Model3DErrorBoundary>
          else if (['proximitySensor', 'photoSensor', 'pressureSwitch', 'thermostat', 'floatSwitch'].includes(c.type)) content = <Sensor3D c={c} x={x} onToggle={() => activateComponent(c, () => setComponentState(c.id, { triggered: !c.state.triggered }))} />
          else content = <PushButton3D c={c} x={x} onPress={(pressed) => activateComponent(c, () => pressButton(c.id, pressed))} />
          return wrapOriented(c, content)
        })}
        <Wires3D
          pivots={panelPivots}
          editMode={editMode}
          selectedWireId={demoMode ? null : selectedWireId}
          activeWaypointIndex={demoMode ? null : activeWaypointIndex}
          activeEnd={demoMode ? null : activeEnd}
          moveAll={demoMode ? false : moveAllWire}
          onSelectWire={(wireId) => { if (demoMode) return; if (tool === 'erase') { deleteWire(wireId); return }; if (tool !== 'select' && tool !== 'wire') return; if (draftRef.current || reconnect) return; selectWire(wireId); setActiveWaypointIndex(null); setActiveEnd(null); setMoveAllWire(false) }}
          onSelectWaypoint={(index) => { setActiveWaypointIndex(index); setActiveEnd(null) }}
          onMoveWaypoint={moveWireWaypoint}
          onRemoveWaypoint={removeWireWaypointAt}
          onInsertWaypoint={insertWireWaypoint}
          onSelectEnd={(side) => { setActiveEnd(side); setActiveWaypointIndex(null) }}
          onMoveEnd={moveWireEnd}
          onMoveAll={moveWholeWire}
          terminals={drawTerminals}
        />
        <WireDrawController
          active={!demoMode && (editMode === 'connect' || reconnect !== null)}
          draft={draft}
          getDraft={() => draftRef.current}
          terminals={drawTerminals}
          wireRadius={(cableOuterDiameterMm(wireDefaults.gauge) * PANEL_UNITS_PER_MM) / 2}
          wireColor={WIRE_3D_COLORS[wireDefaults.autoColor ? 'red' : wireDefaults.color]}
          smooth={wireDefaults.flexibility === 'flexible'}
          reconnecting={reconnect !== null}
          fallbackCenter={sceneCenter}
          obstacles={componentObstacles(components, panelPivots)}
          onStart={draftStart}
          onAddPoint={draftAddPoint}
          onFinish={draftFinish}
          onReconnectPick={pickConnectionTerminal}
        />

        <PanelCameraRig command={cameraCommand} railWidth={sceneWidth} onStats={setCameraStats} frontEdit={frontEdit} panMode={gridDragEnabled || tool === 'pan'} viewLocked={viewLocked} />
      </Canvas>

      {!demoMode && selectedText && <div className="canvas-textbar-slot">
        <TextStyleBar style={selectedText} unit="mm"
          onChange={(patch) => updateCanvasText(selectedText.id, patch)}
          onEdit={() => setEditingTextId(selectedText.id)}
          onDelete={() => { removeCanvasText(selectedText.id); setSelectedTextId(null) }}
          onDone={() => { setSelectedTextId(null); setEditingTextId(null) }} />
      </div>}
      <div className="panel3d-axis-hud" aria-label="Orientação da câmara 3D">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="30" cy="34" r="3" fill="#334155" />
          <path d="M30 34 L55 34" stroke="#ef4444" strokeWidth="3" /><path d="M55 34 l-7 -4 v8 z" fill="#ef4444" /><text x="56" y="30" fill="#ef4444">X</text>
          <path d="M30 34 L30 8" stroke="#22c55e" strokeWidth="3" /><path d="M30 8 l-4 7 h8 z" fill="#22c55e" /><text x="35" y="10" fill="#16a34a">Y</text>
          <path d="M30 34 L13 51" stroke="#3b82f6" strokeWidth="3" /><path d="M13 51 l3 -8 5 5 z" fill="#3b82f6" /><text x="5" y="59" fill="#2563eb">Z</text>
        </svg>
        <div><span>Yaw <strong>{cameraStats.yaw.toFixed(1)}°</strong></span><span>Pitch <strong>{cameraStats.pitch.toFixed(1)}°</strong></span><span>Zoom <strong>{cameraStats.zoom}%</strong></span></div>
      </div>

      {/* overlay HTML normal (fora do Canvas) — evita que o drei <Html> projete o botão para o centro do ecrã */}
      <ShortcutHelp open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} editor={frontEdit ? 'Esquema 2D' : 'Esquema 3D'} extra={PANEL3D_SHORTCUTS} />
    </div>
  )
}
