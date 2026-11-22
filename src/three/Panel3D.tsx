import { applyMsr127Leds } from './msr127Model'
import { IndustrialDevice3D } from './IndustrialDevice3D'
import { industrialDeviceTypeOf } from '../electrical/industrialDevices'
import { CurrentTransformer3D } from './DigitalMeters3D'
import { doorMountMotion, doorMountedComponent } from './doorMount'
import { EquipmentDecal3D } from './EquipmentDecal3D'
import { TerminalJumperBridge3D, TerminalMarkerCard3D } from './terminalMarkings'
import {
  canTerminalHaveJumper,
  isTerminalStripType,
  resolveAdjacentLooseTerminalClusters,
  resolveTerminalStrips,
  terminalFrontBadge,
} from '../electrical/pti6Strip'
import { isTabletDesktop } from '../ui/device'
import CatalogComponent3D from './CatalogComponent3D'
import { isCatalogType } from '../catalog/types'
import { importedComponentInfo, type ImportedControl } from '../electrical/importedComponents'
import { animateImportedRig, importedControlAt, importedPointMm, paintImportedModel, rigImportedModel } from './importedFinish'
import { THERMAL_RESET_TURN_EVENT, THERMAL_RESET_TURN_MS, thermalResetAccepted, thermalResetTurn } from './thermalResetControl'
import { markCadNodes, mergeStaticMeshes } from './staticMerge'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, PerformanceMonitor, TransformControls, Edges, Html, Billboard, useGLTF, useProgress } from '@react-three/drei'
import { Text } from './SceneText'
import { useRef, useMemo, useState, useEffect, useLayoutEffect, useId, Suspense, Component, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import { isManobraAllowed } from '../store/manobra'
import { TbButton } from '../ui/toolbarKit'
import { useWireActionSlot, useWireDraftSlot } from '../ui/wireActionSlot'
import { useEditorShortcuts } from '../ui/shortcuts'
import ShortcutHelp, { type ShortcutHelpExtra } from '../ui/ShortcutHelp'
import { SCHEMATIC_TOOL_SHORTCUTS, VIEW_SHORTCUTS } from '../ui/shortcutLists'
import { useCanvasAction, useShortcutsRequest, useSimUi } from '../ui/simUi'
import { ContextLossGuard, ContextLossNotice } from './ContextLossGuard'
import { EDITOR_THEME, editorPalette, editorGridBackground } from '../ui/editorTheme'
import { IconClose, IconFocus, IconDelete, IconHelp, IconKeyboard, IconLink, IconMove, IconPlus, IconSave, IconUnlock } from '../ui/icons'
import type { ElectricalComponent, ComponentType, SpatialPoint3D, Wire, ConduitMedium } from '../types'
import FluidConnectionMarker3D from './FluidConnectionMarker3D'
import { terminalConnectionMedium, terminalMatchesConnectionMedium } from './connectionMedium'
import { usesProceduralSurface } from './proceduralSurface'
import * as THREE from 'three'
import { LOGO_SCREEN_FALLBACK, logoScreenRect, type LogoFaceRect } from './logoScreen'
import { cloneModelScene, disposeModelClone, fitComponentModel } from './modelFit'
import { applyEmergencyButtonFinish, finishCadMaterial } from './catalogMaterials'
import { applyCadSurfaceTextures, onCadTexturesReady } from './cadSurface'
import CanvasAnnotations3D, { type TextGroupHandlers } from './CanvasAnnotations3D'
import { expandToGroups, toggleInSelection } from '../ui/selectionGroups'
import { alignMessage, alignOffsets, useAlignAction, type AlignBox } from '../ui/alignItems'
import PanelCanvasScrollbars, { type PanelScrollBridge } from './PanelCanvasScrollbars'
import { cameraScrollMetrics, panCameraToScroll, type CameraScrollBounds } from './cameraScroll'
import NeonCurrent3D from './NeonCurrent3D'
import TextStyleBar from '../ui/TextStyleBar'
import { DEFAULT_TEXT_STYLE_3D, NOTE_COLORS } from '../ui/textStyle'
import { getStudioEnvironment, STUDIO_EXPOSURE, STUDIO_TONE_MAPPING } from './studioEnvironment'
import { applyEditorMotorTextures, onMotorTexturesReady } from './motorEditorTextures'
import { FaultEffects3D, type FaultPoint3D } from './FaultEffects3D'
import { canInsertComponent3D, getCommandModelSpec, getComponentModelSpec, getComponentPhysicalSizeMm, hasDinRailModel, isMountingRail, PANEL_UNITS_PER_MM, BREAKER_HANDLE_RIG } from './modelPaths'
import { componentHalfExtents, isPanelBound, PLATE_THICKNESS, PLATE_Z, RAIL_Y } from './panelBounds'
import { hasPlcLamps, lampScenePosition, plcChannelLamps, plcLamps } from './plcStatusLights'
import { mountDepthOffset } from './thermalMount'
import { relaySocketMountDepthOffset } from './relaySocketMount'
import { combMountDepthOffset, isCombBusbar, isCombConnector } from './combMount'
import { buildDinRailGroup, clampRailLengthMm, DIN_RAIL_15X55, DIN_RAIL_FINISHES, dinRailProfileOf } from './dinRailGeometry'
import { applyWorldUv, ENCLOSURE, ENCLOSURE_PLATE_FRONT_MM, enclosureDimsOf, enclosureHingeOf, isPanelAccessoryType } from './enclosureParts'
import { CableDuct3D, Enclosure3D, SpiralWrap3D } from './PanelAccessories3D'
import { ductJunctionOpenings } from '../schematic/ductJunctions'
import { galvanizedSteel } from './proceduralTextures'
import { RAIL_MOUNT_TYPE_PREFIXES } from './railMount'
import { PANEL_UNITS_PER_PX, componentPanelXY, dropOnSchematic, panelToSchematicX, panelToSchematicY, schematicToPanelX, schematicToPanelY } from './panelLayout'
import { componentOrientationOf, orientationRadians } from './componentOrientation'
import { component3DDimensions, component3DScaleOf, component3DVolumeCenter, schematicRotationRadians, terminalLocal3D, terminalMarkerRadius, terminalPositionFromLocal3D, terminalWorld3D } from './terminal3D'
import ViewCube, { cameraFacingFace, type ViewCubeFace, type ViewCubeRequest } from '../components/ViewCube'
import { floorGridVisible, wireEnergyEffectVisible } from './panel3DEditing'
import { registerCoverCapture, setCoverWiresReady } from './coverCapture'
import { WireEnd3D } from './WireEnd3D'
import { OrientedWireBox } from './solidWireRouting'
import { GlowHalo } from './GlowHalo'
import { FactoryEnvironment3D, type FactoryWallMountBounds } from './FactoryEnvironment3D'
import { stepSpring, type SpringState } from '../catalog/controlMotion'
import MultimeterDm20Panel from './MultimeterDm20Panel'
import { MeterD522066_3D, MeterKws306_3D } from './DigitalMeters3D'
import {
  SchneiderBreaker1P_3D,
  SchneiderRcd4P_3D,
  SchneiderRcd1PN_3D,
  SchneiderPilotLight1P_3D,
  SchneiderPilotLight3P_3D,
} from './SchneiderComponents3D'
import { LightingDevice3D } from './LightingDevices3D'
import { isLightingType } from './lightingModel'
import {
  FloatSwitchFelix3D,
  type FloatSwitchTankContext,
  HydraulicTee3D,
  HydraulicValve3D,
  WaterFlowMeterZjLcd3D,
  WaterPumpCalpeda3D,
  WaterSupplyBox3D,
  WaterTankTransparent3D,
} from './HydraulicsDevices3D'
import { tankHasJunctionBracket, tankJunctionBracketOf, waterTankDimensionsOf } from './hydraulicsModel'
import { OboJunctionBox3D, Wago221Connector3D, type OboSpliceCable } from './JunctionWagoDevices3D'
import { isJunctionBoxType, isWagoConnectorType, JUNCTION_WAGO_SIZE_MM, type JunctionBoxType } from './junctionWagoModel'
import { WireTrayElbow903D, WireTrayRiser903D, WireTrayStraight3D, WireTrayTee3D } from './WireMeshTrayDevices3D'
import {
  ConduitCorrugated3D,
  ConduitVdsElbow903D,
  ConduitVdsStraight3D,
  PipeClampStandalone3D,
} from './ConduitDevices3D'
import { TriProofLedBatten3D } from './TriProofBatten3D'
import { EditableFieldCable3D, editableCableConductorsOf, isEditableCableDeviceType } from './EditableCable3D'
import {
  computeFactoryRoomBounds,
  isSolidCollisionComponentType,
  resolveFactoryPlacement3D,
  isFloorStandingComponent,
  type SolidObstacle3D,
} from './factoryPhysics'
import {
  ElectricCylinderEpcs3D,
  PneumaticCylinder3D,
  AirCompressor3D,
  PneumaticFrl3D,
  PneumaticGuidedCylinder3D,
  PneumaticManifold3D,
  PneumaticTee3D,
  PneumaticUnion3D,
  PneumaticElbow3D,
  PneumaticY3D,
  PneumaticVacuumCup3D,
  PneumaticValve523D,
} from './PneumaticsDevices3D'
import {
  CableTrayCross3D,
  CableTrayElbow903D,
  CableTrayRiser903D,
  CableTrayStraight3D,
  CableTrayVerticalBend3D,
  IndustrialPillar3D,
  IndustrialWall3D,
} from './StructuresDevices3D'
import { isFloorGroundedStructureType, isStructureComponentType, snapStructureDragXY } from './structuresModel'
import MotorTerminalBoard3D from './MotorTerminalBoard3D'
import MotorTerminalBoxCover3D from './MotorTerminalBoxCover3D'
import { OpticalReflector3D, RollerConveyor3D } from './ConveyorDevices3D'
import { isFloorMountedMachineType } from './conveyorModel'
import { AcrylicBusbar3D, CombBusbar3D, CombConnector3D, SteppedBusbar3D } from './Busbar3D'
import { isAcrylicBusbarType, isCombBusbarType, isCombConnectorType, isSteppedBusbarType } from './busbarParts'
import MotorShaftFan3D from './MotorShaftFan3D'
import { updateMotorBodyMotion } from './motorBodyMotion'
import { MOTOR_FAN, MOTOR_SIZE, motorCadToCentered } from './motorTerminalLayout'
import { extractBreakerHandle, extractKeyBarrel } from './breakerHandle'
import { applyProtectionMarkings, protectionMarkingSignature } from './protectionMarkings'
import { WireMarkers3D } from './WireMarkers3D'
import { extractActuatorHead } from './actuatorHead'
import LeadPigtails3D from './LeadPigtails3D'
import { SnapGuides3D, WireDraftSideCard, WireDrawController, type DrawTerminal, type WireDraft } from './WireDraw3D'
import { terminalElectricalClassOf } from '../electrical/terminalClassification'
import { wireEndColor } from '../schematic/wireEndColor'
import {
  buildWirePath3D,
  cableOuterDiameterMm,
  componentObstacles,
  closestPointOnPolyline,
  fromSpatial,
  orthogonalizeWaypoints3D,
  sampleCurveInsertPoint3D,
  simplifyWaypoints3D,
  snapControlPoint3D,
  toSpatial,
  waypointInsertIndex,
  wireCurveMetrics3D,
  wireEndpoint3D,
  wireLengthMm,
  WIRE_3D_COLORS,
  type SnapGuideLine3D,
  type V3,
  type WireEndpoint3D,
  type WirePath3D,
  type WireObstacle,
} from './wireGeometry3D'
import { bundleLacingTies, convexBeltOfCircles, type BundleTieCircle } from './bundleLacing'
import { useWireRouting } from './useWireRouting'
import { createWireRoutingJob } from './wireRoutingJob'
import RouteLoading from '../ui/RouteLoading'

const PANEL_FLOOR_Y = -2.6
/** Margem (1 = 100 mm) da chapa à volta do equipamento. */
const PLATE_MARGIN = 0.6
/** A calha assenta na chapa (mesma cota para todas as calhas). */
/** Face da chapa de montagem: plano onde assentam calhas DIN, calhas técnicas e a chapa do quadro. */
const PLATE_FRONT_Z = PLATE_Z + PLATE_THICKNESS / 2
/** Centro (Z) de uma calha DIN conforme o perfil (15 × 5,5, 35 × 7,5 ou 35 × 15). */
const railCenterZ = (rail: ElectricalComponent) => PLATE_FRONT_Z + (dinRailProfileOf(rail.state).height / 2) * PANEL_UNITS_PER_MM
/** Altura (mm) da calha onde o aparelho está fixo — os aparelhos assentam na face do perfil. */
const mountedRailHeightMm = (component: ElectricalComponent, components: ElectricalComponent[]) => {
  const rail = component.railId ? components.find((item) => item.id === component.railId && isMountingRail(item.type)) : undefined
  return rail ? dinRailProfileOf(rail.state).height : DIN_RAIL_15X55.height
}

/** Material da calha DIN: zinco real (textura) tingido pelo acabamento escolhido. */
function railMaterial(finishId: unknown) {
  const finish = DIN_RAIL_FINISHES[typeof finishId === 'string' ? finishId : ''] ?? DIN_RAIL_FINISHES['Aço galvanizado']
  const zinc = galvanizedSteel([2, 2])
  return new THREE.MeshStandardMaterial({
    color: finish.color,
    map: zinc.map,
    bumpMap: zinc.bump,
    bumpScale: 0.35,
    roughnessMap: zinc.rough,
    metalness: finish.metalness,
    roughness: finish.roughness,
    envMapIntensity: 1.15,
    name: 'din-rail-finish',
  })
}

const MOTOR_TARGET_HEIGHT = getComponentModelSpec('motor3ph')!.targetHeight
const MOTOR_SCALE_RATIO = MOTOR_TARGET_HEIGHT / 1.04
/** Centro físico do DRN80, com os pés apoiados no piso. */
const MOTOR_CENTER_Y = PANEL_FLOOR_Y + MOTOR_TARGET_HEIGHT / 2

/* ------------------------------------------------------------------ helpers */

/** Marcador 3D do borne acompanha o diâmetro definido no Esquema (9 px = tamanho padrão). */
const terminalMarkerScale = (terminal: { diameter?: number }): number =>
  typeof terminal.diameter === 'number' && terminal.diameter > 0 ? Math.max(0.35, Math.min(2.6, terminal.diameter / 9)) : 1

/** Reporta o estado de carregamento dos GLB (drei useProgress) para o overlay de página. */
/**
 * Carregamento dos GLB sem atualizar estado a meio de outra renderização: o `useGLTF` arranca o
 * carregamento durante a renderização do aparelho e o `useProgress` notificava logo os subscritores
 * (aviso do React «Cannot update a component while rendering a different component»).
 */
function useModelsLoading() {
  const [active, setActive] = useState(() => useProgress.getState().active)
  useEffect(() => {
    let alive = true
    const unsubscribe = useProgress.subscribe((state) => { queueMicrotask(() => { if (alive) setActive(state.active) }) })
    setActive(useProgress.getState().active)
    return () => { alive = false; unsubscribe() }
  }, [])
  return active
}

function ModelsProgressReporter({ onChange }: { onChange: (active: boolean) => void }) {
  const active = useModelsLoading()
  useEffect(() => { onChange(active) }, [active, onChange])
  return null
}

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
  const profile = dinRailProfileOf(c?.state)
  const perforated = c?.state.perforated !== false
  const finish = c?.state.finish
  const material = useMemo(() => railMaterial(finish), [finish])
  useEffect(() => () => material.dispose(), [material])
  const group = useMemo(() => {
    const rail = buildDinRailGroup(lengthMm, 0.01, material, profile, perforated)
    rail.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true; mesh.receiveShadow = true
      // UV à escala real (posição da peça incluída): o zinco não estica com o comprimento.
      mesh.geometry.translate(mesh.position.x, mesh.position.y, mesh.position.z)
      mesh.position.set(0, 0, 0)
      applyWorldUv(mesh.geometry, 0.01, 60)
    })
    return rail
  }, [lengthMm, material, profile, perforated])
  useEffect(() => () => {
    group.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
    })
  }, [group])
  const baseCenterZ = (profile.height / 2) * 0.01
  return <group position={position}>
    <group position={[0, 0, -baseCenterZ]}><primitive object={group} /></group>
    <Label text={labelText ?? `${c?.ref ?? 'TR'} · ${Math.round(lengthMm)} mm · ${profile.width}×${String(profile.height).replace('.', ',')}`} position={[0, profile.width * 0.01 * 0.5 + 0.1, baseCenterZ + 0.02]} size={0.065} color="#475569" />
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
        <meshStandardMaterial color={en ? '#22c55e' : '#334155'} emissive={en ? '#22c55e' : '#000000'} emissiveIntensity={en ? 2.2 : 0} toneMapped={!en} transparent opacity={en ? 0.85 : 1} depthWrite={!en} />
      </mesh>
      <GlowHalo color="#22c55e" on={en} radius={0.05} kind="lens" position={[0.2, 0.34, 0.24]} />
      <Label text={c.ref} position={[0, 0.52, 0.23]} />
    </group>
  )
}

/* ---------- Siemens LOGO! 12/24RC — modelo 3D real (GLTF/GLB) ---------- */
const LOGO_1224RC_SPEC = getComponentModelSpec('plcSiemensLogo1224RC')!
const LOGO_1224RC_MODEL_URL = LOGO_1224RC_SPEC.path
const LOGO_1224RC_TARGET_HEIGHT = LOGO_1224RC_SPEC.targetHeight

const BODY_TINT = new THREE.Color()
const BODY_BASE = new THREE.Color()
const BODY_HSL = { h: 0, s: 0, l: 0 }
const NON_BODY_MATERIAL_RE = /(lente|lens|led|vidro|glass|visor|screen|display|chrome|cromado|copper|cobre|brass|lat[aã]o|screw|parafuso|terminal|borne|label|etiqueta|sticker|placa|nameplate)/i

/**
 * Modo de apresentação (sólido/arames/raio-X) e tinta do corpo. Só toca no que mudou: a cor do material
 * fica com quem a gere (lentes, LEDs, estados) exceto quando há tinta do corpo — antes cada render repunha
 * a cor original (apagando a cor do vidro dos sinaleiros) e marcava `needsUpdate` em todos os materiais.
 */
function applyRenderMode(
  group: THREE.Group | null,
  mode: ElectricalComponent['view3DRenderMode'],
  bodyColor?: string,
  strongInsulatorTint = false,
) {
  if (!group) return
  const key = `${mode ?? 'solid'}|${bodyColor ?? ''}|${strongInsulatorTint ? 'pa66' : ''}`
  group.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.presentationOverlay || mesh.userData.protectionMarking || mesh.userData.terminalMarking) return
    if (bodyColor && !mesh.userData.dcSimuBodyCloned) {
      // Clona materiais partilhados (cache GLTF/motores) antes de pintar para não tingir outras instâncias iguais.
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone()
      mesh.userData.dcSimuBodyCloned = true
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => {
      const visual = material as THREE.Material & {
        wireframe?: boolean
        opacity: number
        transparent: boolean
        depthWrite: boolean
        metalness?: number
        emissiveIntensity?: number
      }
      if (visual.userData.dcSimuRenderKey === key) return
      const colorMaterial = visual as typeof visual & { color?: THREE.Color }
      if (!visual.userData.dcSimuPresentationBase) visual.userData.dcSimuPresentationBase = {
        wireframe: !!visual.wireframe,
        opacity: visual.opacity,
        transparent: visual.transparent,
        depthWrite: visual.depthWrite,
        color: colorMaterial.color?.getHexString(),
      }
      const base = visual.userData.dcSimuPresentationBase as { wireframe: boolean; opacity: number; transparent: boolean; depthWrite: boolean; color?: string }
      const physicalSurface = material instanceof THREE.MeshStandardMaterial && !visual.userData.keepTransparent
      const wireframe = mode === 'wireframe' ? true : base.wireframe
      const transparent = mode === 'xray' ? true : physicalSurface ? false : base.transparent
      const depthWrite = mode === 'xray' ? false : physicalSurface ? true : base.depthWrite
      // Recompilar só quando muda algo que altera o programa/estado de render.
      const programChange = visual.wireframe !== wireframe || visual.transparent !== transparent || visual.depthWrite !== depthWrite
      visual.wireframe = wireframe
      visual.opacity = mode === 'xray' ? Math.min(0.34, base.opacity) : physicalSurface ? 1 : base.opacity
      visual.transparent = transparent
      visual.depthWrite = depthWrite
      if (physicalSurface) visual.depthTest = true
      if (colorMaterial.color && base.color) {
        const surfaceTag = visual.userData.dcSimuBodySurface as 'body' | 'preserve' | undefined
        const isTransparentPart = !!visual.userData.keepTransparent || base.opacity < 0.85
        const isEmissiveOrLens = !!visual.userData.acti9Lens
          || !!visual.userData.towerLens
          || (typeof visual.emissiveIntensity === 'number' && visual.emissiveIntensity > 0.05)
          || NON_BODY_MATERIAL_RE.test(visual.name || '')
          || NON_BODY_MATERIAL_RE.test(mesh.name || '')
        const isBareMetal = surfaceTag !== 'body'
          && typeof visual.metalness === 'number'
          && visual.metalness > (strongInsulatorTint ? 0.42 : 0.55)
        const preserveMaterial = surfaceTag === 'body'
          ? false
          : surfaceTag === 'preserve' || isTransparentPart || isEmissiveOrLens || isBareMetal

        if (bodyColor && !preserveMaterial) {
          BODY_TINT.set(bodyColor)
          BODY_BASE.set(`#${base.color}`)
          if (surfaceTag === 'body') {
            // Superfície pintada dedicada (ex.: carcaça esmaltada de motor): aplica a cor escolhida fielmente sem misturar matizes (vermelho + azul ≠ roxo).
            colorMaterial.color.copy(BODY_TINT)
          } else if (strongInsulatorTint) {
            // Bornes PA66 (PTI 6 BU/BN/BK/RD/OG): pigmentação fiel preservando ligeiro relevo do molde.
            colorMaterial.color.copy(BODY_BASE).lerp(BODY_TINT, 0.9)
          } else {
            BODY_BASE.getHSL(BODY_HSL)
            if (BODY_HSL.l < 0.14) {
              // Detalhes muito escuros (borrachas, pegas, molduras pretas) mantêm contraste com leve harmonia.
              colorMaterial.color.copy(BODY_BASE).lerp(BODY_TINT, 0.14)
            } else {
              // Substitui o matiz pela cor escolhida preservando variação tonal entre painéis claros e sombreados.
              const shade = Math.min(1.08, Math.max(0.76, 0.76 + 0.32 * Math.min(1, BODY_HSL.l / 0.72)))
              colorMaterial.color.copy(BODY_TINT).multiplyScalar(shade)
            }
          }
          visual.userData.dcSimuBodyTinted = true
        } else if (visual.userData.dcSimuBodyTinted) {
          colorMaterial.color.set(`#${base.color}`)
          delete visual.userData.dcSimuBodyTinted
        }
      }
      visual.userData.dcSimuRenderKey = key
      if (programChange) visual.needsUpdate = true
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

function ConnectionTerminal3D({ component, terminal, active, fluid = false, onPick }: {
  component: ElectricalComponent
  terminal: ElectricalComponent['terminals'][number]
  active: boolean
  fluid?: boolean
  onPick?: (id: string) => void
}) {
  const position = terminalLocal3D(component, terminal)
  const k = terminalMarkerScale(terminal)
  const [hover, setHover] = useState(false)
  const isLead = terminal.contact === 'lead'
  const radius = Math.max(isLead ? 0.014 : 0, terminalMarkerRadius(component, terminal)) * (active ? 1.1 : hover ? 1.05 : 1)
  return <group position={position} userData={{ connectionTerminalId: terminal.id, connectionMedium: terminalConnectionMedium(terminal.kind), fluidConnectionMarker: fluid }}
    onClick={onPick ? (event) => { event.stopPropagation(); onPick(terminal.id) } : undefined}
    onPointerDown={(event) => event.stopPropagation()}
    onPointerOver={(event) => { event.stopPropagation(); setHover(true) }}
    onPointerOut={() => setHover(false)}>
    {fluid ? <FluidConnectionMarker3D active={active} hover={hover} label={`${component.ref} · ${terminal.label}`} /> : <>
    <mesh renderOrder={30}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshStandardMaterial color={active ? '#22d3ee' : terminal.color} emissive={active ? '#0891b2' : terminal.color} emissiveIntensity={active ? 1 : hover ? 0.45 : 0.2} />
    </mesh>
    <mesh><sphereGeometry args={[Math.max(0.012, radius * 1.8), 10, 10]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    {(active || hover || isLead) && <Billboard position={[0, 0.045 + 0.035 * k, 0]}>
      <Text fontSize={0.048} color="#0f172a" anchorX="center" anchorY="bottom" depthOffset={-3}>{terminal.label}</Text>
    </Billboard>}
    </>}
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

/** Mantém a câmara atual acessível fora do Canvas (marquee em ecrã). */
function CameraProjectCapture({ camRef }: { camRef: MutableRefObject<THREE.Camera | null> }) {
  const { camera } = useThree()
  useFrame(() => { camRef.current = camera })
  return null
}

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

function OrientedInstance({ c, pivot, sourcePivot, orientation, selected, editingTerminals, movable, draggable, free3D = false, preferFloorXZ = false, connectionMode, connectionMedium, connectionStartId, probing, onTerminalPick, onSelect, onMove, onDragStart, onDragTo, onDragEnd, children }: {
  c: ElectricalComponent
  pivot: [number, number, number]
  sourcePivot: [number, number, number]
  orientation: ElectricalComponent['viewOrientation']
  selected: boolean
  editingTerminals: boolean
  movable: boolean
  /** Clicar e arrastar o corpo do componente move-o diretamente no painel (ou no chão 3D XZ quando livre). */
  draggable: boolean
  free3D?: boolean
  preferFloorXZ?: boolean
  connectionMode: boolean
  connectionMedium: ConduitMedium
  connectionStartId: string | null
  probing: boolean
  onSelect: (additive?: boolean) => void
  /** Gizmo de mover: posição final (o 3D só edita o plano do painel — X/Y). */
  onMove: (position: SpatialPoint3D) => void
  /** Arrasto direto: início (histórico), posição viva (X/Y ou X/Y/Z livre) e fim (imã de calha/tanque). */
  onDragStart: () => void
  onDragTo: (position: { x: number; y: number; z?: number }) => void
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
  const isTerminalInsulator = isTerminalStripType(c.type) && c.type !== 'terminalPE'
  useEffect(() => applyRenderMode(modelRef.current, renderMode, c.bodyColor, isTerminalInsulator), [renderMode, c.bodyColor, isTerminalInsulator, children])
  const surfaceSize = component3DDimensions(c)
  useEffect(() => {
    const model = modelRef.current
    if (!model || !usesProceduralSurface(c.type)) return
    if (c.type === 'panelEnclosure') model.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material instanceof THREE.MeshStandardMaterial && !material.transparent && material.metalness >= 0.05 && material.metalness < 0.6 && material.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.25) material.userData.cadSurfaceFamily = 'powder-paint'
      }
    })
    void applyCadSurfaceTextures(model, { procedural: true })
  }, [c.type, surfaceSize.x, surfaceSize.y, surfaceSize.z, c.bodyColor, renderMode])
  // Modelos que carregam depois (Suspense/GLB) recebem o modo numa verificação leve, ~3× por segundo
  // (materiais já tratados saltam pela chave) — antes corria a cada frame com `needsUpdate` em todos.
  // Junta as malhas estáticas do CAD por material (menos chamadas de desenho). Corre depois de os efeitos
  // de montagem extraírem pivôs/cabeças/teclas e de o 1.º frame anotar as malhas que se movem; repete
  // algumas vezes para os GLB que chegam mais tarde (Suspense). Catálogo: os nós são procurados pelo nome.
  const invalidateMerge = useThree((three) => three.invalidate)
  const framesSeen = useRef(0)
  useFrame(() => { if (framesSeen.current < 3) framesSeen.current += 1 })
  useEffect(() => {
    if (isCatalogType(c.type)) return
    let cancelled = false
    let runs = 0
    let timer = 0
    const run = () => {
      if (cancelled) return
      // Só depois de pelo menos um frame desenhado: os useFrame anotam as malhas que movem (tampas, botões).
      if (!framesSeen.current) { timer = window.setTimeout(run, 1000); return }
      runs += 1
      if (modelRef.current) {
        const { before, after } = mergeStaticMeshes(modelRef.current)
        if (after < before) invalidateMerge()
      }
      if (runs < 5) timer = window.setTimeout(run, 2500)
    }
    timer = window.setTimeout(run, 1400)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [c.type, c.id, invalidateMerge])
  const renderModeTick = useRef(0)
  useFrame((_, delta) => {
    if (renderMode === 'solid' && !c.bodyColor) return
    renderModeTick.current += delta
    if (renderModeTick.current < 0.33) return
    renderModeTick.current = 0
    applyRenderMode(modelRef.current, renderMode, c.bodyColor, isTerminalInsulator)
  })
  useEffect(() => () => dragRef.current?.cleanup(), [])

  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!draggable || event.button !== 0 || event.ctrlKey || event.metaKey || (!free3D && event.shiftKey) || !rootRef.current) return
    event.stopPropagation()
    onSelect()
    const dir = camera.getWorldDirection(new THREE.Vector3())
    // Equipamentos livres fora do quadro (reservatórios, bombas, motores, esteiras, paredes, pilares, contadores, OBO, WAGO):
    // arrastam livremente por TODO o pavimento XZ (incluindo para o meio da sala fabril!).
    // Segurar Shift arrasta no plano vertical XY para ajustar a altura Y.
    const canDragXZ = free3D && !event.shiftKey && (preferFloorXZ ? Math.abs(dir.y) >= 0.04 : Math.abs(dir.y) >= 0.12)
    const useFloorXZ = canDragXZ
    const normal = useFloorXZ
      ? new THREE.Vector3(0, 1, 0)
      : (Math.abs(dir.z) >= 0.3 ? new THREE.Vector3(0, 0, 1) : dir.clone())
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
      if (free3D) {
        if (useFloorXZ) {
          onDragTo({ x: snap(next.x), y: origin.y, z: snap(next.z) })
        } else if (preferFloorXZ && !domEvent.shiftKey) {
          // Mesmo em vista frontal plana (pitch ~0°), arrastar para baixo puxa o equipamento para o meio da sala (+Z)!
          const depthFromScreenY = -(next.y - origin.y) * 1.4
          onDragTo({ x: snap(next.x), y: origin.y, z: snap(origin.z + depthFromScreenY) })
        } else {
          onDragTo({ x: snap(next.x), y: snap(next.y), z: origin.z })
        }
      } else {
        onDragTo({ x: snap(next.x), y: snap(next.y) })
      }
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
    userData={{ wireSurface: true, componentId: c.id, isComponentRoot: true }}
    onClick={(event) => { event.stopPropagation(); if (!connectionMode) onSelect(event.ctrlKey || event.metaKey || event.shiftKey || useSimStore.getState().multiSelectMode) }}
    onPointerDown={startDrag}
    onPointerOver={() => { if (draggable) gl.domElement.style.cursor = 'grab' }}
    onPointerOut={() => { if (!dragRef.current) gl.domElement.style.cursor = '' }}
  >
    {selected && <SelectionGlow component={c} />}
    <group rotation={[0, 0, schematicRotation]} scale={[c.mirrored ? -1 : 1, 1, 1]}>
      <group rotation={rotation}>
        <group scale={[scale.x, scale.y, scale.z]}>
          <group ref={modelRef} position={[-sourcePivot[0], -sourcePivot[1], -sourcePivot[2]]}>{children}</group>
          <LeadPigtails3D component={c} />
          {editingTerminals && <group userData={{ noSnapshot: true }}>{c.terminals.map((terminal) => <EditableTerminal3D key={terminal.id} component={c} terminal={terminal} active={terminal.id === activeTerminalId} />)}</group>}
          {connectionMode && !editingTerminals && <group userData={{ noSnapshot: true }}>{c.terminals.filter((terminal) => probing || terminalMatchesConnectionMedium(terminal.kind, connectionMedium)).map((terminal) => <ConnectionTerminal3D key={terminal.id} component={c} terminal={terminal} active={terminal.id === connectionStartId} fluid={!probing && connectionMedium !== 'electrical'} onPick={probing ? onTerminalPick : undefined} />)}</group>}
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
    return fitted
  }, [scene])
  // Liberta geometrias/materiais próprios deste clone ao desmontar (sem isto ficavam na GPU).
  useEffect(() => () => disposeModelClone(model), [model])
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
      <primitive dispose={null} object={model} castShadow receiveShadow />
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
  // Liberta geometrias/materiais próprios deste clone ao desmontar (sem isto ficavam na GPU).
  useEffect(() => () => disposeModelClone(model), [model])
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
  // Liberta geometrias/materiais próprios deste clone ao desmontar (sem isto ficavam na GPU).
  useEffect(() => () => disposeModelClone(model), [model])
  const simActive = useSimStore((s) => s.sim.runState !== 'stopped')
  const en = simActive && !!c.state.energized
  const armature = useMemo(() => {
    const node = model.getObjectByName('Node10')
    // Anotar já: a armadura move-se sozinha, por isso nunca entra na junção estática de malhas.
    if (node) node.userData.contactorBaseZ ??= node.position.z
    return node
  }, [model])
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
    <Label text={c.ref} position={[0, spec.targetHeight + 0.12, 0.24]} color={en ? '#4ade80' : '#e2e8f0'} />
  </group>
}

/**
 * Indicadores de estado para equipamentos GLB integrados que possuem sinalização
 * frontal. A posição vem do CAD (`plcStatusLights.ts`): nos Siemens S7 as lâmpadas
 * estão no canto da frente do aparelho e não numa coluna genérica ao centro.
 */
function EquipmentStatusLights({ c, height, centered }: { c: ElectricalComponent; height: number; centered: boolean }) {
  const runState = useSimStore((s) => s.sim.runState)
  const scanCount = useSimStore((s) => s.sim.scanCount)
  const diagnostics = useSimStore((s) => s.sim.diagnostics)
  const error = diagnostics.some((item) => item.level === 'error') || !!c.state.tripped
  const powered = runState !== 'stopped' && !!c.state.powered
  const comm = runState === 'running' && !error && scanCount % 6 < 2
  const siemens = hasPlcLamps(c.type)
  if (siemens) {
    // Lâmpadas de estado (RUN/ERROR/…) + LEDs de canal I/Q (não coincidem com bornes).
    const lamps = [...plcLamps(c.type, { runState, powered, error }), ...plcChannelLamps(c)]
    return <group>{lamps.map((lamp) => {
      const position = lampScenePosition(c, lamp.at, centered ? 'center' : 'bottom')
      const radius = (lamp.sizeMm * PANEL_UNITS_PER_MM) / 2
      return <group key={lamp.name} position={position}>
        <mesh raycast={() => null}>
          <circleGeometry args={[radius, 14]} />
          <meshStandardMaterial color={lamp.on ? lamp.color : '#334155'} emissive={lamp.on ? lamp.color : '#000'} emissiveIntensity={lamp.on ? 2.4 : 0} toneMapped={!lamp.on} />
        </mesh>
        <GlowHalo color={lamp.color} on={lamp.on} radius={radius} kind="led" position={[0, 0, 0.002]} />
      </group>
    })}</group>
  }
  const plc = ['plcLsXbmDn32s', 'siemensTsAdapterIeBasic'].includes(c.type)
  // MSR127 lamps are now in the shared physical model, also used by Admin/bake.
  if (!plc) return null
  const run = powered && runState === 'running' && !error
  const lights = [{ c: '#22c55e', on: run }, { c: '#ef4444', on: error }, { c: '#38bdf8', on: comm && powered }]
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
function CadComponentReal3D({ c, x, position, interactive = true, labelColor, labelText, hideLabel = false, inTerminalStrip = false, anchor, resetTurn = 0 }: { c: ElectricalComponent; x: number; position?: [number, number, number]; interactive?: boolean; labelColor?: string; labelText?: string; hideLabel?: boolean; inTerminalStrip?: boolean; /** Apoio vertical: na calha assenta na base, solto fica centrado. */ anchor?: 'center' | 'bottom'; resetTurn?: number }) {
  const spec = getComponentModelSpec(c.type)!
  const centered = (anchor ?? (position ? 'center' : 'bottom')) === 'center'
  const { scene } = useGLTF(spec.path)
  const importedType = importedComponentInfo(c.type) ? c.type : null
  const { model, importedRig, lenses } = useMemo(() => {
    const obj = cloneModelScene(scene)
    // CAD importados: cores reais por peça antes do acabamento PBR comum.
    const parts = importedType ? paintImportedModel(importedType, obj) : null
    const finish = (root: THREE.Object3D) => root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh || mesh.userData.cadFinished) return
      mesh.userData.cadFinished = true
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => finishCadMaterial(material, { envMapIntensity: 1.1 })) : finishCadMaterial(mesh.material, { envMapIntensity: 1.1 })
    })
    finish(obj)
    // Tudo o que existe até aqui é estático; os pivôs e lentes do rig criados a seguir ficam de fora da junção de malhas.
    markCadNodes(obj)
    // Peças móveis e indicadores (antes do ajuste: charneiras em mm do GLB); peças novas também levam o acabamento.
    const rigged = importedType && parts ? rigImportedModel(importedType, obj, parts) : null
    if (rigged) finish(obj)
    const fitted = fitComponentModel(obj, spec, PANEL_UNITS_PER_MM, centered ? 'center' : 'bottom')
    void applyCadSurfaceTextures(fitted)
    // Torre: centro de cada lente já no referencial do modelo ajustado: a luz fica DENTRO da lente.
    const lenses: Array<{ role: 'red' | 'yellow' | 'green'; color: string; center: [number, number, number]; radius: number }> = []
    if (importedType === 'towerLightSb23011') {
      fitted.updateMatrixWorld(true)
      const colors = { red: '#ef4444', yellow: '#eab308', green: '#22c55e' } as const
      const box = new THREE.Box3()
      const size = new THREE.Vector3()
      fitted.traverse((node) => {
        const mesh = node as THREE.Mesh
        const role = mesh.isMesh ? mesh.userData.towerLens as 'red' | 'yellow' | 'green' | undefined : undefined
        if (!role) return
        box.setFromObject(mesh)
        box.getSize(size)
        lenses.push({ role, color: colors[role], center: [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2], radius: Math.max(size.x, size.z) / 2 })
      })
    }
    return { model: fitted, importedRig: rigged, lenses }
  }, [scene, spec, centered, importedType])
  const invalidateFrame = useThree((three) => three.invalidate)
  useEffect(() => { void applyCadSurfaceTextures(model) }, [model])
  useEffect(() => () => disposeModelClone(model), [model])
  const modelSimTick = useSimStore(s => s.simTick)
  const markingSig = protectionMarkingSignature(c.type, c.state)
  useEffect(() => {
    applyProtectionMarkings(model, c.type, {
      state: c.state,
      unitsPerMm: PANEL_UNITS_PER_MM,
      anchor: centered ? 'center' : 'bottom',
      heightMm: spec.physicalSizeMm.height,
    })
    invalidateFrame()
  }, [model, c.type, centered, spec.physicalSizeMm.height, markingSig, invalidateFrame])
  // The shared markings create the three physical lenses. Apply their state
  // afterwards, and on scan ticks (the solver mutates c.state in place).
  useEffect(() => {
    if (c.type === 'safetyRelay') { applyMsr127Leds(model, c.state); invalidateFrame() }
  }, [model, c.type, c.state, modelSimTick, markingSig, invalidateFrame])
  useFrame((_, delta) => {
    if (!importedRig || !importedType) return
    if (animateImportedRig(importedRig, importedType, { ...c.state, resetTurn }, useSimStore.getState().sim.runState !== 'stopped', Math.min(delta, 1 / 20))) invalidateFrame()
  })
  const simActive = useSimStore((s) => s.sim.runState !== 'stopped')
  const active = simActive && !!(c.state.energized || c.state.powered)
  // These native PTI6 assemblies are routed through this CAD renderer, not
  // TerminalAssembly3D below. The inspector state must drive the actual route.
  const acrylic = useMemo(() => {
    if (!isTerminalAssemblyComponent(c.type) || c.state.acrylicCover !== true) return null
    const { width, height, depth } = spec.physicalSizeMm
    const group = buildTerminalAssemblyCoverGroup(width, height, depth, PANEL_UNITS_PER_MM)
    if (!centered) group.position.y = height * PANEL_UNITS_PER_MM / 2
    return group
  }, [c.type, c.state.acrylicCover, spec, centered])
  useEffect(() => () => { if (acrylic) disposeTerminalAssemblyCover(acrylic) }, [acrylic])
  const breaker = ['breaker1p', 'breaker2p', 'breaker3p', 'switchSchneiderEz9s1p', 'switchSchneiderEz9s2p', 'switchSchneiderEz9s4p', 'breakerSteckSdC25', 'motorBreakerPkzmC10', 'phoenixEcb3000760'].includes(c.type)
  /** Manípulo marcado no GLB (`dcsimu_handle_*`): charneira e curso medidos no CAD. */
  const rig = BREAKER_HANDLE_RIG[c.type]
  const breakerClosed = !!c.state.closed && !c.state.tripped
  const tripped = !!c.state.tripped

  // O manípulo é descoberto pela geometria (o que sai da frente da caixa), não
  // pelo nome do nó: cada CAD nomeia as peças à sua maneira.
  // Só depois de montado é que o modelo tem pai (o grupo do componente), e é
  // nesse referencial que a frente é mesmo +Z.
  const [handle, setHandle] = useState<ReturnType<typeof extractBreakerHandle>>(null)
  // Layout: a limpeza corre antes de o R3F retirar os descendentes do grupo onde o pivô vive.
  useLayoutEffect(() => {
    if (!breaker) { setHandle(null); return }
    const frame = model.parent
    if (!frame) return
    // A charneira vem da tabela `BREAKER_HANDLE_RIG`: o cubo redondo da alavanca (Easy9, Steck) nunca
    // coincide com o centro da caixa do manípulo, e sem isto a alavanca orbitaria em vez de rodar sobre si.
    const extracted = extractBreakerHandle(model, frame, rig?.hinge)
    setHandle(extracted)
    return () => { if (extracted) disposeExtractedPivot(extracted.pivot) }
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
    {acrylic && <primitive object={acrylic} />}
    {/* Torre: halo contido + luz de ponto no centro de cada lente (por dentro), a lente fica translúcida e emissiva quando acesa. */}
    {lenses.map((lens) => <GlowHalo key={lens.role} color={lens.color} on={simActive && !!c.state[lens.role]} radius={lens.radius} kind="lens" position={lens.center} />)}
    {c.type === 'multimeterDm20' && <MultimeterDm20Panel component={c} model={model} interactive={interactive && !c.locked} />}
    {(c.type === 'terminalPhoenixPti6' || c.type === 'terminalPE') && !centered && (
      <TerminalMarkerCard3D
        type={c.type}
        text={terminalFrontBadge(c, inTerminalStrip)}
        disconnected={c.state.bridged === false}
      />
    )}
    <EquipmentStatusLights c={c} height={spec.targetHeight} centered={centered} />
    {/* Sem luz de ponto «energizado»: montar/desmontar luzes recompilava os shaders de toda a cena a cada
        comutação; o estado vê-se no rótulo, nos LEDs e na pose do aparelho. */}
    {/* Relé encaixado por baixo do contactor: o nome vai para baixo. Bornes em régua usam o cabeçalho comum da régua. */}
    {!hideLabel && (
      <Label
        text={labelText ?? c.ref}
        size={c.type === 'terminalPhoenixPti6' || c.type === 'terminalPE' ? 0.068 : 0.085}
        position={c.mountedOn ? [0, spec.targetHeight * (centered ? -0.5 : 0) - 0.1, 0.22] : [0, spec.targetHeight * (centered ? 0.5 : 1) + 0.1, 0.22]}
        color={labelColor ?? (active ? '#4ade80' : '#e2e8f0')}
      />
    )}
  </group>
}

/** Manobra funcional dos CAD importados; o estado elétrico é partilhado com o inspetor. */
function ImportedCadDevice({ c, x, position, mechanical, interactive, labelColor }: { c: ElectricalComponent; x: number; position?: [number,number,number]; /** Botões mecânicos ativos mesmo em STOP. */ mechanical: boolean; interactive: boolean; labelColor: string }) {
  const info = importedComponentInfo(c.type)!
  const spec = getComponentModelSpec(c.type)!
  const simActive = useSimStore(s => s.sim.runState !== 'stopped')
  const { gl, controls, events } = useThree()
  const [resetTurn, setResetTurn] = useState(0)
  const status = info.behavior === 'fuse'
    ? !c.state.closed ? 'Gaveta aberta' : c.state.blown ? 'Fundido' : 'Fechado'
    : info.behavior === 'breaker'
      ? c.state.testPressed ? 'Teste (T)' : c.state.tripped ? 'Disparado' : c.state.closed ? 'Ligado' : 'Desligado'
      : info.behavior === 'selector' ? c.state.position === -1 ? 'Esq.' : c.state.position === 1 ? 'Dir.' : '0'
      : info.behavior === 'thermal' ? c.state.testPressed ? 'Ensaio · disparado' : c.state.tripped ? 'Disparado · RESET' : c.state.stopPressed ? 'STOP' : 'Armado' : ''
  const group = useRef<THREE.Group>(null)
  type ImportedGesture = {
    control: ImportedControl | null
    pointerId: number
    startX: number
    turn: number
    target: { releasePointerCapture: (id: number) => void }
    orbitEnabled: boolean
    eventsEnabled?: boolean
    cleanup?: () => void
  }
  const gesture = useRef<ImportedGesture | null>(null)
  const controlAt = (event: { point: THREE.Vector3 }): ImportedControl | null => {
    const node = group.current
    if (!node) return null
    const point = importedPointMm(node.worldToLocal(event.point.clone()), spec.physicalSizeMm, PANEL_UNITS_PER_MM, position ? 'center' : 'bottom')
    return importedControlAt(c.type, point)
  }
  const apply = (pressed: boolean, control: ImportedControl | null = null) => {
    if (useSimStore.getState().tool !== 'select' || (control ? !mechanical : !interactive)) return
    // Regra global: o store recusa a manobra antes de ▶ (actuateImported).
    useSimStore.getState().actuateImported(c.id, pressed, control)
  }
  const finish = (commit: boolean) => {
    const active = gesture.current
    if (!active) return
    gesture.current = null
    active.cleanup?.()
    if (active.control === 'reset') {
      if (commit && thermalResetAccepted(active.turn)) apply(true, 'reset')
      setResetTurn(0)
    } else apply(false, active.control)
    const orbit = controls as unknown as { enabled?: boolean } | null
    if (orbit && active.orbitEnabled !== undefined) orbit.enabled = active.orbitEnabled
    if (active.eventsEnabled !== undefined) events.enabled = active.eventsEnabled
    gl.domElement.style.cursor = ''
    try { active.target.releasePointerCapture(active.pointerId) } catch { /* já libertada pelo browser */ }
  }
  const finishRef = useRef(finish)
  finishRef.current = finish
  useEffect(() => () => finishRef.current(false), [])
  useEffect(() => { if (!mechanical && !interactive) finishRef.current(false) }, [mechanical, interactive])
  // Rearme pelos botões do inspetor: o botão azul roda para o lado pedido e volta ao repouso.
  useEffect(() => {
    if (c.type !== 'thermalRelaySiemens3ru1116') return
    let timer = 0
    const onTurn = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; direction?: 'left' | 'right' }>).detail
      if (!detail || detail.id !== c.id || gesture.current) return
      setResetTurn(detail.direction === 'left' ? -1 : 1)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setResetTurn(0), THERMAL_RESET_TURN_MS)
    }
    window.addEventListener(THERMAL_RESET_TURN_EVENT, onTurn)
    return () => { window.removeEventListener(THERMAL_RESET_TURN_EVENT, onTurn); window.clearTimeout(timer) }
  }, [c.id, c.type])
  // A libertação fora do modelo, perda de captura ou mudança de janela não deixa TEST preso.
  useEffect(() => {
    const cancel = () => finishRef.current(false)
    window.addEventListener('blur', cancel)
    return () => window.removeEventListener('blur', cancel)
  }, [])
  return <group ref={group} position={position ?? [x, RAIL_Y, 0]} onPointerDown={event => {
    if (event.button !== 0 || gesture.current) return
    if (useSimStore.getState().gridDragEnabled && !simActive) return
    const control = controlAt(event)
    // Controlos que alteram estado elétrico (gaveta, TEST, I/O, alavanca) só em simulação.
    // Em STOP permite-se apenas inspecionar/selecionar o aparelho.
    if (control) {
      if (!mechanical) return
      if (!simActive && !useSimStore.getState().demoMode) {
        useSimStore.getState().selectComponents([c.id])
        return
      }
    } else if (!interactive || !simActive) {
      return
    }
    event.stopPropagation()
    if (!simActive && !useSimStore.getState().demoMode) useSimStore.getState().selectComponents([c.id])
    const target = event.target as unknown as { setPointerCapture: (id: number) => void; releasePointerCapture: (id: number) => void }
    const orbit = controls as unknown as { enabled?: boolean } | null
    const active: ImportedGesture = {
      control,
      pointerId: event.pointerId,
      startX: event.nativeEvent.clientX,
      turn: 0,
      target,
      orbitEnabled: orbit?.enabled ?? true,
      eventsEnabled: events.enabled,
      cleanup: undefined,
    }
    gesture.current = active
    target.setPointerCapture(event.pointerId)
    // O ponteiro já está capturado: durante o gesto não repetir raycasts contra
    // CAD/cabos a cada movimento. Em máquinas sem GPU isso bloqueava TEST/RESET/STOP.
    if (control === 'reset' && orbit) orbit.enabled = false
    events.enabled = false
    if (control === 'reset') gl.domElement.style.cursor = 'ew-resize'
    const move = (e: PointerEvent) => {
      const active = gesture.current
      if (!active || active.pointerId !== e.pointerId || active.control !== 'reset') return
      active.turn = thermalResetTurn(e.clientX - active.startX)
      setResetTurn(active.turn)
    }
    const up = (e: PointerEvent) => { if (gesture.current?.pointerId === e.pointerId) finishRef.current(true) }
    const cancel = (e: PointerEvent) => { if (gesture.current?.pointerId === e.pointerId) finishRef.current(false) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    active.cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    if (control !== 'reset') apply(true, control)
  }} onPointerUp={event => {
    if (gesture.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    finish(true)
  }} onPointerCancel={() => finish(false)}>
    <CadComponentReal3D c={c} x={x} position={[0, 0, 0]} anchor={position ? 'center' : 'bottom'} interactive={interactive} labelColor={labelColor} labelText={status ? `${c.ref} · ${status}` : c.ref} resetTurn={resetTurn} />
  </group>
}

/** A cabeça/chave separada do corpo tem geometrias novas (o material é o do corpo, libertado com o modelo). */
function disposeExtractedPivot(pivot: THREE.Object3D) {
  pivot.removeFromParent()
  pivot.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) mesh.geometry?.dispose() })
}

function EmergencyButtonReal3D({ c, x, onPress }: { c: ElectricalComponent; x: number; onPress: (pressed: boolean) => void }) {
  const spec = getCommandModelSpec(c.type)!
  const { scene } = useGLTF(spec.path)
  const model = useMemo(() => {
    const fitted = fitComponentModel(cloneModelScene(scene), spec, PANEL_UNITS_PER_MM, 'center')
    applyEmergencyButtonFinish(fitted, c.type)
    void applyCadSurfaceTextures(fitted)
    markCadNodes(fitted)
    return fitted
  }, [scene, spec, c.type])
  // Liberta geometrias/materiais próprios deste clone ao desmontar (sem isto ficavam na GPU).
  useEffect(() => () => disposeModelClone(model), [model])
  const pressed = !!c.state.pressed
  const keyOperated = c.type === 'emergencyButtonKeyP20ACR'

  /* Cabeça do botão (cogumelo + fole) separada do corpo pela geometria: é a única
   * peça que se afunda. Antes mexia-se o nó `…-solid1` inteiro, o que arrastava a
   * carcaça e o aro de fixação para dentro da chapa — a animação acontecia no
   * sítio errado. */
  const [head, setHead] = useState<ReturnType<typeof extractActuatorHead>>(null)
  // Layout: a limpeza corre antes de o R3F retirar os descendentes do grupo (o pivô vive lá, fora do modelo).
  useLayoutEffect(() => {
    if (keyOperated) { setHead(null); return }
    const frame = model.parent
    if (!frame) return
    const extracted = extractActuatorHead(model, frame)
    setHead(extracted)
    return () => { if (extracted) disposeExtractedPivot(extracted.pivot) }
  }, [model, keyOperated])

  /* Chave seletora (P20ACR): não se carrega, roda-se.
   * A peça que roda é descoberta pela geometria — tudo o que sai à frente da
   * caixa —, nunca pelo nome do nó, que muda de CAD para CAD. O curso é o da
   * chave real: um quarto de volta entre as duas posições. */
  const [keyHandle, setKeyHandle] = useState<ReturnType<typeof extractKeyBarrel>>(null)
  useLayoutEffect(() => {
    if (!keyOperated) { setKeyHandle(null); return }
    const frame = model.parent
    if (!frame) return
    const extracted = extractKeyBarrel(model, frame)
    setKeyHandle(extracted)
    return () => { if (extracted) disposeExtractedPivot(extracted.pivot) }
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
  // Liberta geometrias/materiais próprios deste clone ao desmontar (sem isto ficavam na GPU).
  useEffect(() => () => disposeModelClone(model), [model])
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
        // As tampas movem-se uma a uma: ficam fora da junção estática de malhas.
        if (g > 0.35 && g > r * 2.2 && g > b * 2.2) { mesh.userData.dcNoMerge = true; found.start.push(mesh); return }
        if (r > 0.35 && r > g * 2.2 && r > b * 2.2) { mesh.userData.dcNoMerge = true; found.stop.push(mesh); return }
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
  if (c.type === 'powerSource1ph' || c.type === 'powerSource3ph' || c.type === 'powerSource24v') return <TerminalAssembly3D c={c} x={x} />
  const title = c.type === 'powerSupplyProauto24A' ? '24V / 5A' : '24V'
  return <group position={[x, RAIL_Y + 0.48, 0]}>
    <mesh castShadow><boxGeometry args={[0.85, 0.96, 0.48]} /><meshStandardMaterial color="#46515c" metalness={0.18} roughness={0.72} /></mesh>
    <mesh position={[0, 0.04, 0.25]}><boxGeometry args={[0.68, 0.65, 0.015]} /><meshStandardMaterial color="#d9e0e4" roughness={0.8} /></mesh>
    <mesh position={[0.22, -0.14, 0.27]}><sphereGeometry args={[0.045, 12, 12]} /><meshStandardMaterial color={powered ? '#16a34a' : '#64748b'} emissive={powered ? '#16a34a' : '#000000'} emissiveIntensity={powered ? 0.8 : 0} /></mesh>
    <Label text={title} position={[0, 0.1, 0.27]} size={0.1} />
    <Label text={c.ref} position={[0, 0.56, 0.22]} color="#e2e8f0" />
  </group>
}

import { buildTerminalAssemblyCoverGroup, disposeTerminalAssemblyCover, isTerminalAssemblyComponent } from './terminalAssembly'

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

  const cover = useMemo(() => {
    if (c.state?.acrylicCover !== true) return null
    const group = buildTerminalAssemblyCoverGroup(spec.physicalSizeMm.width, spec.physicalSizeMm.height, spec.physicalSizeMm.depth, PANEL_UNITS_PER_MM)
    group.position.y = spec.physicalSizeMm.height * PANEL_UNITS_PER_MM / 2
    return group
  }, [c.state?.acrylicCover, spec])
  useEffect(() => () => { if (cover) disposeTerminalAssemblyCover(cover) }, [cover])
  useEffect(() => () => disposeModelClone(model), [model])

  return (
    <group position={[x, RAIL_Y + 0.48, 0.12]}>
      <primitive object={model} />
      {cover && <primitive object={cover} />}
    </group>
  )
}

/** PTI6 multi-pólo: N blocos lado a lado (escala real 8,15 mm/pólo), alinhados à calha DIN com plaquetas ZB 8 e pente FBS opcional. */
function Pti6Strip3D({ c, x, labelColor }: { c: ElectricalComponent; x: number; labelColor?: string }) {
  const n = Math.max(1, Math.min(48, Math.floor(Number(c.state?.poleCount ?? 1)) || 1))
  const spec = getComponentModelSpec('terminalPhoenixPti6')!
  const { scene } = useGLTF(spec.path)
  const poleModels = useMemo(() => {
    const base = cloneModelScene(scene)
    base.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => finishCadMaterial(m, { envMapIntensity: 1.2 }))
        : finishCadMaterial(mesh.material, { envMapIntensity: 1.2 })
      mesh.castShadow = mesh.receiveShadow = true
    })
    const fitted = fitComponentModel(base, spec, PANEL_UNITS_PER_MM, 'bottom')
    void applyCadSurfaceTextures(fitted)
    return Array.from({ length: n }, () => fitted.clone())
  }, [scene, spec, n])
  useEffect(() => () => poleModels.forEach(disposeModelClone), [poleModels])
  const step = 8.15 * PANEL_UNITS_PER_MM // largura física real de 1 borne PTI 6
  const offsets = useMemo(() => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step), [n, step])
  const disconnected = c.state?.bridged === false
  const combJumper = !!c.state?.combJumper && n >= 2
  const baseBadge = typeof c.state?.markerText === 'string' && c.state.markerText.trim() ? c.state.markerText.trim() : ''
  return (
    <group position={[x, RAIL_Y, 0]}>
      {poleModels.map((poleObj, i) => (
        <group key={i} position={[offsets[i], 0, 0]}>
          <primitive object={poleObj} castShadow receiveShadow />
          <TerminalMarkerCard3D
            type="terminalPhoenixPti6"
            text={baseBadge ? (n <= 4 ? `${baseBadge.slice(0, 3)}${i + 1}` : String(i + 1)) : String(i + 1)}
            disconnected={disconnected}
          />
        </group>
      ))}
      {combJumper && (
        <TerminalJumperBridge3D
          spanX={(n - 1) * step}
          centerX={0}
          baseY={0}
          baseZ={0}
          pinOffsetsX={offsets}
        />
      )}
      <Label text={c.ref} size={0.078} position={[0, spec.targetHeight + 0.1, 0.22]} color={labelColor ?? '#e2e8f0'} />
    </group>
  )
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
        <Suspense fallback={null}>
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
  // Vidro (biblioteca de cores de luzes): a lente tem a sua cor mesmo apagada; sem vidro escolhido fica o cinzento antigo.
  const glass = typeof c.state.glassColor === 'string' ? c.state.glassColor : null
  const on = simActive && !!c.state.on
  return (
    <group position={[x, RAIL_Y + 1.15, 0.12]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.115, 0.115, 0.14, 24]} />
        <meshStandardMaterial userData={{ dcSimuBodySurface: 'preserve' }} color={glass ?? (on ? color : '#374151')} emissive={on ? color : '#000000'} emissiveIntensity={on ? 2.2 : 0} roughness={on ? 0.25 : 0.5} toneMapped={!on} transparent opacity={on ? 0.82 : 1} depthWrite={!on} />
      </mesh>
      {/* Luz por dentro da lente: halo no centro do cilindro, vidro translúcido quando aceso */}
      <GlowHalo color={color} on={on} radius={0.115} kind="lens" position={[0, 0, 0]} />
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
  // Liberta geometrias/materiais próprios deste clone ao desmontar (sem isto ficavam na GPU).
  useEffect(() => () => disposeModelClone(model), [model])
  const simActive = useSimStore((s) => s.sim.runState !== 'stopped')
  const on = simActive && !!c.state.on
  const color = typeof c.state.color === 'string' ? c.state.color : '#ef4444'
  const glass = typeof c.state.glassColor === 'string' ? c.state.glassColor : null
  const invalidateFrame = useThree((three) => three.invalidate)
  useEffect(() => {
    const selected = new THREE.Color(color)
    const lens = glass ? new THREE.Color(glass) : null
    model.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((material) => {
        const standard = material as THREE.MeshStandardMaterial
        // Material FF0000FF = lente frontal (z 42,5…51,5 mm) no GLB recebido.
        if (standard.name.toUpperCase() !== 'FF0000FF') return
        standard.userData.dcSimuBodySurface = 'preserve'
        // Vidro: cor própria da lente (biblioteca de cores); sem vidro, deriva do brilho como antes.
        if (lens) standard.color.copy(lens)
        else standard.color.copy(selected).multiplyScalar(on ? 1 : 0.42)
        standard.emissive.copy(selected)
        standard.emissiveIntensity = on ? 1.8 : 0.05
        // Aceso: vidro translúcido que deixa ver a luz por dentro (e não tapa o halo no depth buffer).
        standard.transparent = true; standard.opacity = on ? 0.8 : 1; standard.depthWrite = !on
        const toneMapped = !on
        if (standard.toneMapped !== toneMapped) { standard.toneMapped = toneMapped; standard.needsUpdate = true }
      })
    })
    invalidateFrame()
  }, [color, glass, model, on, invalidateFrame])
  return <group position={[x, RAIL_Y + 1.05, 0.4]}>
    <primitive object={model} />
    {/* Luz por dentro da lente frontal: centro da lente (z 42,5…51,5 mm → +0,2125 no AD22 centrado) */}
    <GlowHalo color={color} on={on} radius={0.11} kind="lens" position={[0, 0, 0.2125]} />
    <Label text={`${c.ref} · AD22`} position={[0, 0.3, 0.08]} color="#334155" />
  </group>
}

function TowerLight3D({ c, x }: { c: ElectricalComponent; x: number }) {
  // Mesmo modelo de brilho dos sinaleiros do projeto nativo (LandingShowcase / AD22):
  // lente emissiva + GlowHalo kind="lamp" com castLight e subida/descida suaves.
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
            <meshStandardMaterial
              color={on ? col : '#334155'}
              emissive={on ? col : '#000000'}
              emissiveIntensity={on ? 2.2 : 0.05}
              toneMapped={!on}
              roughness={0.35}
              metalness={0.05}
              transparent
              opacity={on ? 0.82 : 1}
              depthWrite={!on}
            />
          </mesh>
          <GlowHalo color={col} on={on} radius={0.11} kind="lens" castLight position={[0, 0, 0]} rise={0.05} fall={0.18} />
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
  // Cor do estado (permite botões coloridos via state.color) ou fallback por tipo.
  const color = (typeof c.state.color === 'string' && c.state.color) || (isEmg ? '#dc2626' : isNC ? '#ef4444' : c.type === 'buttonNO' ? '#22c55e' : '#eab308')
  // Cotas aproximadas Ø29 cabeça / furação 22 mm (imagem de referência KEOLEA).
  const headR = isEmg ? 0.17 : 0.145
  const bezelR = headR + 0.018
  const baseW = isEmg ? 0.38 : 0.32
  // Curso com mola: afunda depressa, regressa com ligeiro ressalto (emergência mantém-se travada em baixo).
  const cap = useRef<THREE.Mesh>(null)
  const spring = useRef<SpringState>({ value: pressed ? 1 : 0, velocity: 0 })
  useFrame((_, delta) => {
    if (!cap.current) return
    const latched = isEmg && pressed
    stepSpring(spring.current, pressed || latched ? 1 : 0, delta, pressed ? 'smooth' : 'snap', pressed ? 70 : 220)
    cap.current.position.y = -0.055 * spring.current.value
  })
  const metal = { color: '#c8ccd0', metalness: 0.82, roughness: 0.28 }
  const bodyMat = { color: '#2a2e32', metalness: 0.25, roughness: 0.55 }
  return (
    <group position={[x, RAIL_Y + 1.05, 0.4]}>
      {/* Corpo / base zinc alloy + contact block silhouette */}
      <mesh castShadow position={[0, -0.22, 0]}>
        <boxGeometry args={[baseW, 0.28, baseW * 0.85]} />
        <meshStandardMaterial {...bodyMat} />
      </mesh>
      {/* Placa de fixação / medium plate */}
      <mesh position={[0, -0.05, 0]} castShadow>
        <boxGeometry args={[baseW * 1.05, 0.04, baseW * 0.95]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* Anel metálico (metal head / bezel) */}
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[bezelR, bezelR, 0.035, 32]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* Cabeça colorida (pressionável) */}
      <mesh
        ref={cap}
        position={[0, pressed ? -0.03 : 0.04, 0]}
        onPointerDown={(event) => pressWhileHeld(event, () => onPress(true), () => onPress(false))}
        onPointerOut={() => pressed && !isEmg && onPress(false)}
        castShadow
      >
        <cylinderGeometry args={[headR, headR * 0.98, 0.09, 32]} />
        <meshStandardMaterial color={color} emissive={pressed ? color : '#000'} emissiveIntensity={pressed ? 0.45 : 0} roughness={0.32} metalness={0.08} />
      </mesh>
      {/* Poços de borne (vista frontal inferior) — referência NO/NC */}
      {[[-0.08, -0.28], [0.08, -0.28]].map(([tx, ty], i) => (
        <group key={i} position={[tx, ty, baseW * 0.42]}>
          <mesh>
            <cylinderGeometry args={[0.018, 0.018, 0.04, 12]} />
            <meshStandardMaterial color="#1f2326" />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <cylinderGeometry args={[0.012, 0.012, 0.012, 12]} />
            <meshStandardMaterial color="#b8bcc0" metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      ))}
      <Label text={c.ref} position={[0, 0.22, 0]} />
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
        {/* Sem setas ↻/↺: não existem na fonte do texto 3D e o troika ia buscá-las à CDN (falha offline). */}
        {`${c.ref} ${running ? (dir === 'cw' ? '(horário)' : '(anti-horário)') : '(parado)'}`}
      </Text>
    </group>
  )
}

/** SEW-EURODRIVE DRN80MK4/B3 — CAD real com indicador funcional no eixo. */
/** Motor SEW DRN80MK4/B3: trifásico vermelho (motor3ph) ou o mesmo modelo pintado de azul como monofásico (motor1ph). */
function MotorSewDrn80Mk4B3Real3D({ c, x, interactive = true }: { c: ElectricalComponent; x: number; interactive?: boolean }) {
  const mono = c.type === 'motor1ph'
  const spec = getComponentModelSpec(mono ? 'motor1ph' : 'motor3ph')!
  const { scene } = useGLTF(spec.path)
  const shaftIndicator = useRef<THREE.Group>(null)
  const model = useMemo(() => {
    const object = cloneModelScene(scene)
    applyEditorMotorTextures(object)
    return fitComponentModel(object, spec, PANEL_UNITS_PER_MM, 'bottom')
  }, [scene, spec])
  // Liberta geometrias/materiais próprios deste clone ao desmontar (sem isto ficavam na GPU).
  useEffect(() => () => disposeModelClone(model), [model])
  const running = !!c.state.running
  const direction = c.state.direction
  const bodyRef = useRef<THREE.Group>(null)
  const vibeTime = useRef(0)
  useFrame((_, delta) => {
    const rpmVisual = Number(c.state.rpmVisual ?? 0)
    if (shaftIndicator.current && rpmVisual > 0) {
      const speed = (direction === 'ccw' ? -1 : 1) * rpmVisual * 9.4
      shaftIndicator.current.rotation.x += speed * delta
    }
    if (bodyRef.current) {
      vibeTime.current += delta
      updateMotorBodyMotion(bodyRef.current, -spec.targetHeight / 2, running, rpmVisual, vibeTime.current, delta)
    }
  })
  const markerColor = running ? '#22c55e' : '#64748b'
  return <group position={[x, MOTOR_CENTER_Y, 0.7]}>
    {/* Vibração do corpo + normalização CAD */}
    <group ref={bodyRef} name={`motor-body-${c.id}`} position={[0, -spec.targetHeight / 2, 0]}>
      <primitive object={model} name={`motor-model-${c.id}`} />
      {/* Pontes Y/Δ só no trifásico; a placa monofásica (U1 Z1 / U2 Z2) não tem pontes. */}
      {!mono && <MotorTerminalBoard3D c={c} interactive={interactive && !c.locked} />}
      {/* Tampa da caixa de bornes — destapada por defeito para ver ligações, tapável no Inspetor */}
      <MotorTerminalBoxCover3D covered={!!c.state.terminalBoxCovered} color={mono ? '#2563eb' : '#4a5568'} />
      {/* Pá de três pás no veio (Ø19, x = 241…264 mm do CAD): roda com a velocidade simulada.
          Mostrar/ocultar: olho «Pá do veio» nas propriedades (state.showFan). */}
      {c.state.showFan !== false && <group position={motorCadToCentered([MOTOR_FAN.hubX, 0, 0]).map((v) => v * PANEL_UNITS_PER_MM) as [number, number, number]}>
        <MotorShaftFan3D component={c} />
      </group>}
      <group ref={shaftIndicator} position={[0.67 * MOTOR_SCALE_RATIO, 0.4 * MOTOR_SCALE_RATIO, 0]}>
        <mesh><boxGeometry args={[0.018, 0.1, 0.02]} /><meshStandardMaterial color={markerColor} emissive={running ? markerColor : '#000000'} emissiveIntensity={running ? 0.65 : 0} /></mesh>
      </group>
    </group>
    {/* Etiqueta à frente da base, como uma chapa: por cima ficava à altura da caixa de bornes,
        atravessava-a, tapava as pontas de prova e via-se espelhada de trás. */}
    <Text position={[0, -MOTOR_TARGET_HEIGHT / 2 + 0.07, MOTOR_SIZE.depth / 2 * PANEL_UNITS_PER_MM + 0.04]} fontSize={0.085} color="#24324a" anchorX="center" anchorY="bottom">
      {`${c.ref} · ${mono ? 'DRN80 1~ azul' : 'DRN80MK4/B3'} · ${running ? (direction === 'cw' ? 'horário' : 'anti-horário') : 'parado'}`}
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
  snap?: (point: V3, mods: { shiftKey: boolean; altKey: boolean }) => V3
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
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 2.5) return
      moved = true
      const hit = hitAt(e.clientX, e.clientY)
      if (!hit) return
      hit.add(offset)
      let next: V3 = [hit.x, hit.y, hit.z]
      if (snap && !e.altKey) next = snap(next, { shiftKey: e.shiftKey, altKey: e.altKey })
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
    {/* área de captura generosa (tablet/toque), invisível */}
    <mesh><sphereGeometry args={[0.22, 12, 12]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
  </group>
}

function EditableWireWaypoint3D({ point, index, active, snap, onSelect, onLive, onCommit, onRemove }: {
  point: V3
  index: number
  active: boolean
  snap?: (point: V3, mods: { shiftKey: boolean; altKey: boolean }) => V3
  onSelect: (index: number) => void
  onLive: (index: number, point: V3 | null) => void
  onCommit: (index: number, point: V3) => void
  onRemove: (index: number) => void
}) {
  return <DragHandle3D position={point} snap={snap} onPress={() => onSelect(index)} onLive={(next) => onLive(index, next)} onCommit={(next) => onCommit(index, next)} onDoubleClick={() => onRemove(index)}>
    <mesh renderOrder={32}><sphereGeometry args={[active ? 0.095 : 0.072, 18, 18]} /><meshStandardMaterial color={active ? '#2563eb' : '#ffffff'} emissive={active ? '#1d4ed8' : '#64748b'} emissiveIntensity={active ? 0.75 : 0.28} depthTest={false} /></mesh>
    <Text position={[0, 0.1, 0]} fontSize={0.052} color="#1e3a8a" anchorX="center" anchorY="bottom" outlineWidth={0.003} outlineColor="#ffffff" depthOffset={-4} raycast={() => null}>{index + 1}</Text>
  </DragHandle3D>
}

/** Pega subtil a meio de um segmento manual para inserir rapidamente um novo ponto de curva com um clique. */
function WireMidpointBead3D({ point, onInsert }: { point: V3; onInsert: () => void }) {
  const { gl } = useThree()
  const [hover, setHover] = useState(false)
  return (
    <group
      position={point}
      userData={{ noPick: true, noSnapshot: true }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); gl.domElement.style.cursor = 'copy' }}
      onPointerOut={() => { setHover(false); gl.domElement.style.cursor = '' }}
      onClick={(e) => { e.stopPropagation(); onInsert() }}
    >
      <mesh renderOrder={31}>
        <sphereGeometry args={[hover ? 0.058 : 0.04, 14, 14]} />
        <meshStandardMaterial color={hover ? '#2563eb' : '#93c5fd'} emissive={hover ? '#1d4ed8' : '#3b82f6'} emissiveIntensity={hover ? 0.65 : 0.3} transparent opacity={hover ? 0.96 : 0.72} depthTest={false} />
      </mesh>
      <mesh><sphereGeometry args={[0.14, 10, 10]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    </group>
  )
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
  const size = probe ? (active ? 0.13 : 0.105) : (active ? 0.1 : 0.078)
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
    ...(prebuiltPath ? [] : obstacles.map(box => `${box.min.toArray().map(round)}:${box.max.toArray().map(round)}:${box instanceof OrientedWireBox ? box.localToWorld.elements.map(round).join(',') : ''}`)),
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

function Wires3D({ pivots, editMode, selectedWireId, onRoutingLoadingChange, simLocked = false, ...handlers }: {
  pivots: Record<string, THREE.Vector3>
  editMode: Panel3DEditMode
  selectedWireId: string | null
  onRoutingLoadingChange: (loading: boolean) => void
  /** DC-ADR-071: RUN/PAUSA — o cabo não se seleciona nem se edita. */
  simLocked?: boolean
} & WireEditHandlers) {
  const wires = useSimStore((s) => s.wires)
  const runState = useSimStore((s) => s.sim.runState)
  // Energia dos cabos ao vivo: as listas mantêm a referência entre varreduras,
  // logo o re-render decorre do contador `simTick` (antes: cópias a 10 Hz).
  const simTick = useSimStore((s) => s.simTick)
  const storedComponents = useSimStore((s) => s.components)
  const editor = useSimStore((s) => s.viewOrientationEditor)
  const components = useMemo(() => storedComponents.map((component) => editor?.componentId === component.id ? {
    ...component,
    viewOrientation: editor.draft,
    terminals: editor.terminals,
    view3DScale: editor.scale3D,
  } : component).map(c => doorMountedComponent(c, storedComponents)), [storedComponents, editor])
  // Enquanto modelos GLB ainda estão a carregar (Suspense/useProgress), não mostrar
  // o overlay de cálculo de cabos — evita tela de processamento sobre cena incompleta.
  const modelsLoading = useModelsLoading()

  // sólidos a contornar: os cabos passam à frente dos componentes, nunca por dentro.
  // A chave posicional mantém as caixas estáveis durante os ticks da simulação
  // (RUN muda c.state, não as posições): sem isto, cada scan re-gerava as caixas.
  const obstaclesKey = useMemo(() => components.map((c) => {
    const p = pivots[c.id]
    return p ? `${c.id}:${p.x},${p.y},${p.z}:${c.state.lengthMm ?? 0}:${c.rotation ?? 0}:${c.mirrored}:${JSON.stringify([c.type, c.w, c.h, getComponentModelSpec(c.type)?.physicalSizeMm, componentOrientationOf(c), component3DScaleOf(c), c.terminals.map(t=>[t.id,t.label,t.x,t.y,t.diameter,t.position3D,t.socket3D])])}` : ''
  }).join('|'), [components, pivots])
  const obstacles = useMemo(() => componentObstacles(components, pivots), [obstaclesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Encaminhamento coordenado de todos os cabos: recalcula apenas quando mudam traçados/posições (nunca nos ticks de RUN).
  const wiresGeoKey = useMemo(() => wires.map((w) => [
    w.id, w.fromTerminalId, w.toTerminalId, w.route, w.bend, w.curveOffset, w.gauge, w.flexibility,
    w.fromEndType, w.toEndType, w.endType, w.bundleId ?? '',
    w.fromPoint ? `${w.fromPoint.x},${w.fromPoint.y}` : '',
    w.toPoint ? `${w.toPoint.x},${w.toPoint.y}` : '',
    w.fromPoint3D ? `${w.fromPoint3D.x},${w.fromPoint3D.y},${w.fromPoint3D.z}` : '',
    w.toPoint3D ? `${w.toPoint3D.x},${w.toPoint3D.y},${w.toPoint3D.z}` : '',
    (w.waypoints3D ?? []).map((p) => `${p.x},${p.y},${p.z}`).join(';'),
  ].join(':')).join('||'), [wires])
  const { paths: coordinatedPaths, current: routingCurrent, error: routingError, retry: retryRouting, loading: routingBusy } = useWireRouting(
    `${wiresGeoKey}#${obstaclesKey}`,
    () => createWireRoutingJob(wires, components, pivots),
  )
  // Overlay só na 1.ª carga dos cabos — seleção/cliques não disparam «A carregar…».
  useEffect(() => { onRoutingLoadingChange(routingBusy) }, [routingBusy, onRoutingLoadingChange])
  useEffect(() => {
    // Capa do dashboard/PDF: só capturar com os modelos carregados e o traçado da configuração atual.
    // Falha no cálculo ou traçado antigo nunca contam como prontos (a capa sairia sem cabos).
    setCoverWiresReady(!modelsLoading && (wires.length === 0 || (!!coordinatedPaths && routingCurrent)))
  }, [wires.length, coordinatedPaths, routingCurrent, modelsLoading])
  const blockedNotice = useRef('')
  useEffect(() => {
    if (!coordinatedPaths) return
    const blocked = wires.filter(w => coordinatedPaths.has(w.id) && coordinatedPaths.get(w.id)!.points.length < 2)
    const key = blocked.map(w => w.id).sort().join('|')
    if (key && key !== blockedNotice.current) useSimStore.getState().pushEvent('warning',
      `Não foi possível traçar ${blocked.map(w => w.number || w.id).join(', ')} sem atravessar um aparelho. Mova a ponta livre para fora do corpo ou afaste os aparelhos sobrepostos.`)
    blockedNotice.current = key
  }, [coordinatedPaths, wires])

  type LiveDrag = { wireId: string; kind: 'waypoint' | 'end' | 'all'; index?: number; side?: 'from' | 'to'; point: V3; origin?: V3 }
  const [drag, setDrag] = useState<LiveDrag | null>(null)
  const [dragGuides, setDragGuides] = useState<SnapGuideLine3D[]>([])
  const snapWaypointFor = (wire: Wire, wpIndex: number, fromPos: V3, toPos: V3) => (point: V3, mods: { shiftKey: boolean; altKey: boolean }): V3 => {
    const wps = (wire.waypoints3D ?? []).map(fromSpatial)
    const prev = wpIndex > 0 ? wps[wpIndex - 1] : fromPos
    const next = wpIndex + 1 < wps.length ? wps[wpIndex + 1] : toPos
    const outerMm = cableOuterDiameterMm(wire.gauge, { conductorCount: wire.conductorCount, sheathed: wire.sheathed })
    const res = snapControlPoint3D(point, {
      anchor: prev,
      references: [next, fromPos, toPos],
      obstacles,
      outerMm,
      axisLock: mods.shiftKey,
      magnetic: true,
      fine: mods.altKey,
      gridStep: 0,
    })
    setDragGuides(res.guides)
    return res.point
  }
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

  return <group userData={{ noPick: true }}>
    {!coordinatedPaths && routingError && !modelsLoading && <Html center><div role="alert" className="rounded border border-line-soft bg-white px-3 py-2 text-xs text-slate-700 whitespace-nowrap">
      Não foi possível calcular os cabos. <button type="button" className="underline" onClick={retryRouting}>Tentar novamente</button>
    </div></Html>}
    {wires.map((storedWire) => {
    // Sem traçado confirmado, não fazer o cálculo síncrono de cada cabo como fallback.
    if (!coordinatedPaths?.has(storedWire.id)) return null
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
    const outerDiameterMm = cableOuterDiameterMm(wire.gauge, { conductorCount: wire.conductorCount, sheathed: wire.sheathed })
    const radius = (outerDiameterMm * PANEL_UNITS_PER_MM) / 2
    const flowing = wireEnergyEffectVisible(runState, wire.energized, wire.carryingCurrent)
    const wireColor = WIRE_3D_COLORS[wire.color]
    const isHot = (wire.heatLevel ?? 0) > 0.05
    const isBurnt = !!wire.burnt
    const displayWireColor = isBurnt ? '#18181b' : wireColor
    const emissiveColor = isHot ? '#ff3b00' : flowing ? wireColor : '#000000'
    const emissiveInt = isHot ? Math.min(2.5, (wire.heatLevel ?? 0) * 2.2) : flowing ? 0.07 : 0
    const wireRoughness = isBurnt ? 0.92 : 0.32
    const wireClearcoat = isBurnt ? 0.0 : 0.55
    const editing = selected && !wire.locked && (editMode === 'navigate' || editMode === 'connect')
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
    return <group key={wire.id} userData={{ noPick: true, wireId: wire.id }}>
      {selected && <mesh renderOrder={18} raycast={() => null} userData={{ noSnapshot: true }}>
        <tubeGeometry args={[curve, segments, radius + 0.014, 10, false]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.34} depthWrite={false} />
      </mesh>}
      <mesh castShadow receiveShadow renderOrder={19} raycast={() => null}>
        <tubeGeometry args={[curve, segments, radius, 14, false]} />
        <meshPhysicalMaterial
          color={displayWireColor}
          roughness={wire.kind === 'hydraulic' ? 0.30 : wire.kind === 'pneumatic' ? 0.16 : wireRoughness}
          metalness={wire.kind === 'hydraulic' ? 0.54 : wire.kind === 'pneumatic' ? 0.08 : 0.03}
          clearcoat={wire.kind === 'pneumatic' ? 0.9 : wire.kind === 'hydraulic' ? 0.45 : wireClearcoat}
          clearcoatRoughness={wire.kind === 'pneumatic' ? 0.12 : 0.24}
          envMapIntensity={wire.kind === 'hydraulic' ? 1.45 : 1.15}
          emissive={wire.kind === 'hydraulic' && flowing ? '#0284c7' : emissiveColor}
          emissiveIntensity={wire.kind === 'hydraulic' && flowing ? 0.32 : emissiveInt}
        />
      </mesh>
      {/* Volume transparente maior: seleção fiável (clique) e curvas novas (duplo clique) sem falsificar a secção visível. */}
      <mesh userData={{ wireHit: true }}
        onClick={(event) => { event.stopPropagation(); handlers.onSelectWire(wire.id) }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (simLocked || wire.locked || (editMode !== 'navigate' && editMode !== 'connect')) return
          const hit: V3 = [event.point.x, event.point.y, event.point.z]
          const onCable = closestPointOnPolyline(points, hit)
          handlers.onInsertWaypoint(wire.id, waypointInsertIndex(chain, onCable), toSpatial(onCable))
        }}>
        {/* O volume invisível serve só para picking: manter poucos segmentos evita que uma seleção
            reconstrua dezenas de tubos densos, sem reduzir a qualidade do cabo visível. */}
        <tubeGeometry args={[curve, Math.min(48, Math.max(16, Math.round(segments * 0.4))), Math.max(0.055, radius * 4.2), 6, false]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Clicar na terminação (pinça, ficha, ponteira) seleciona o cabo, como clicar no próprio cabo. */}
      {!from.sharedFollower && <WireEnd3D side="from" geometry={path.starts[0]} wireRadius={radius} color={wireEndColor(wire, 'from', from.terminalColor)} onSelect={() => handlers.onSelectWire(wire.id)} />}
      {!to.sharedFollower && <WireEnd3D side="to" geometry={path.starts[1]} wireRadius={radius} color={wireEndColor(wire, 'to', to.terminalColor)} onSelect={() => handlers.onSelectWire(wire.id)} />}

      {/* Capa exterior global (cabo isolado / multicore) */}
      {wire.sheathed && (() => {
        const sheathRadius = radius * 1.35 + 0.005
        const col = wire.sheathColor ?? '#0f172a'
        return <mesh key="sheath" castShadow receiveShadow renderOrder={19} raycast={() => null}>
          <tubeGeometry args={[curve, segments, sheathRadius, 12, false]} />
          <meshPhysicalMaterial color={col} roughness={0.6} metalness={0.04} clearcoat={0.18} clearcoatRoughness={0.55} envMapIntensity={0.75} />
        </mesh>
      })()}
      {/* Capas de isolamento 3D: tubo mais grosso na secção [start, end] */}
      {(wire.isolation ?? []).map((seg, i) => {
        const a = Math.max(0, Math.min(1, Math.min(seg.start, seg.end)))
        const b = Math.max(0, Math.min(1, Math.max(seg.start, seg.end)))
        if (b - a < 0.02) return null
        const isoCurve = new THREE.CurvePath<THREE.Vector3>()
        const steps = Math.max(8, Math.ceil(segments * (b - a)))
        const pts: THREE.Vector3[] = []
        for (let s = 0; s <= steps; s++) {
          const t = a + (b - a) * (s / steps)
          const p = curve.getPointAt(Math.max(0, Math.min(1, t)))
          pts.push(p)
        }
        for (let s = 0; s < pts.length - 1; s++) isoCurve.add(new THREE.LineCurve3(pts[s], pts[s + 1]))
        const isoRadius = radius * 1.55 + 0.004
        return <mesh key={`iso-${i}`} castShadow receiveShadow renderOrder={20} raycast={() => null}>
          <tubeGeometry args={[isoCurve as unknown as THREE.Curve<THREE.Vector3>, steps, isoRadius, 10, false]} />
          <meshPhysicalMaterial color={seg.color} roughness={0.55} metalness={0.02} clearcoat={0.2} clearcoatRoughness={0.5} envMapIntensity={0.8} />
        </mesh>
      })}

      {/* Espirais de proteção 3D: tubo com padrão helicoidal (aprox. via tubo mais grosso + cor) */}
      {(wire.spirals ?? []).map((seg, i) => {
        const a = Math.max(0, Math.min(1, Math.min(seg.start, seg.end)))
        const b = Math.max(0, Math.min(1, Math.max(seg.start, seg.end)))
        if (b - a < 0.02) return null
        const spCurve = new THREE.CurvePath<THREE.Vector3>()
        const steps = Math.max(10, Math.ceil(segments * (b - a)))
        const pts: THREE.Vector3[] = []
        for (let s = 0; s <= steps; s++) {
          const t = a + (b - a) * (s / steps)
          const p = curve.getPointAt(Math.max(0, Math.min(1, t)))
          pts.push(p)
        }
        for (let s = 0; s < pts.length - 1; s++) spCurve.add(new THREE.LineCurve3(pts[s], pts[s + 1]))
        const spRadius = radius * 1.85 + 0.006
        const col = seg.color ?? "#0a0a0a"
        return <mesh key={`spiral-${i}`} castShadow receiveShadow renderOrder={21} raycast={() => null}>
          <tubeGeometry args={[spCurve as unknown as THREE.Curve<THREE.Vector3>, steps, spRadius, 12, false]} />
          <meshPhysicalMaterial color={col} roughness={0.65} metalness={0.05} clearcoat={0.15} clearcoatRoughness={0.6} envMapIntensity={0.7} />
        </mesh>
      })}
      {/* Anilhas clip-on encaixáveis 3D (código internacional de cores IEC 60062 e letras CAB3/WIC) */}
      {wire.markers && wire.markers.length > 0 && <WireMarkers3D markers={wire.markers} curve={curve} wireRadius={radius} />}
      {flowing && <NeonCurrent3D curve={curve} segments={segments} radius={radius} color={wire.kind === 'hydraulic' ? '#38bdf8' : wireColor} />}
      {editing && !handlers.moveAll && manual.map((point, index) => <EditableWireWaypoint3D key={`${wire.id}-${index}`} point={fromSpatial(point)} index={index} active={handlers.activeWaypointIndex === index}
        snap={snapWaypointFor(storedWire, index, baseFrom.position, baseTo.position)}
        onSelect={handlers.onSelectWaypoint}
        onLive={(waypointIndex, next) => {
          setDrag(next ? { wireId: wire.id, kind: 'waypoint', index: waypointIndex, point: next } : null)
          if (!next) setDragGuides([])
        }}
        onCommit={(waypointIndex, next) => { setDragGuides([]); handlers.onMoveWaypoint(wire.id, waypointIndex, toSpatial(next)) }}
        onRemove={(waypointIndex) => handlers.onRemoveWaypoint(wire.id, waypointIndex)} />)}
      {editing && !handlers.moveAll && !drag && manual.length > 0 && chain.slice(0, -1).map((segA, segIdx) => {
        const segB = chain[segIdx + 1]
        const segLen = Math.hypot(segB[0] - segA[0], segB[1] - segA[1], segB[2] - segA[2])
        if (segLen < 0.34) return null
        const midRaw: V3 = [(segA[0] + segB[0]) / 2, (segA[1] + segB[1]) / 2, (segA[2] + segB[2]) / 2]
        const onCurve = closestPointOnPolyline(points, midRaw)
        return <WireMidpointBead3D key={`${wire.id}-mid-${segIdx}`} point={onCurve} onInsert={() => handlers.onInsertWaypoint(wire.id, segIdx, toSpatial(onCurve))} />
      })}
      {editing && drag?.wireId === wire.id && dragGuides.length > 0 && <SnapGuides3D guides={dragGuides} />}
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
  })}
    <BundleTies3D wires={wires} paths={coordinatedPaths} components={components} obstacles={obstacles} />
  </group>
}

/**
 * Constrói a fita tensionada de uma abraçadeira industrial PA66 (tipo T30R, 3,2 mm × 1,05 mm)
 * seguindo o fecho convexo exato dos condutores abraçados (`circles`), com compressão realista
 * contra o isolamento PVC (zero folga de ar entre a fita e os cabos) e cabeça de fecho encostada.
 */
function buildTensionedStrapGeometry(
  circles: ReadonlyArray<BundleTieCircle> | undefined,
  halfW: number,
  halfH: number,
  thick = 0.0102,
  width = 0.031,
): { geo: THREE.BufferGeometry; headX: number; headY: number; headRotZ: number } {
  let inner: Array<[number, number]> = circles && circles.length >= 2
    ? convexBeltOfCircles(circles, 0.0009, 20)
    : []

  if (inner.length < 6) {
    const hw = Math.max(0.012, halfW - 0.0008)
    const hh = Math.max(0.011, Math.min(hw, halfH - 0.0008))
    const flat = Math.max(0, hw - hh)
    const segs = 12
    inner = []
    for (let i = 0; i <= segs; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / segs
      inner.push([flat + Math.cos(a) * hh, Math.sin(a) * hh])
    }
    for (let i = 0; i <= segs; i++) {
      const a = Math.PI / 2 + (Math.PI * i) / segs
      inner.push([-flat + Math.cos(a) * hh, Math.sin(a) * hh])
    }
  }

  const n = inner.length
  const outer: Array<[number, number]> = new Array(n)
  let bestIdx = 0
  let bestScore = -Infinity
  const normals: Array<[number, number]> = new Array(n)

  for (let i = 0; i < n; i++) {
    const prev = inner[(i - 1 + n) % n]
    const curr = inner[i]
    const next = inner[(i + 1) % n]
    // Contorno CCW → normal exterior à direita da aresta: (dy, -dx).
    const e1x = curr[0] - prev[0], e1y = curr[1] - prev[1]
    const l1 = Math.hypot(e1x, e1y) || 1
    const n1x = e1y / l1, n1y = -e1x / l1
    const e2x = next[0] - curr[0], e2y = next[1] - curr[1]
    const l2 = Math.hypot(e2x, e2y) || 1
    const n2x = e2y / l2, n2y = -e2x / l2
    let nx = n1x + n2x, ny = n1y + n2y
    const nl = Math.hypot(nx, ny)
    if (nl > 1e-6) { nx /= nl; ny /= nl } else { nx = n1x; ny = n1y }
    const miter = 1 / Math.max(0.72, nx * n1x + ny * n1y)
    normals[i] = [nx, ny]
    const ox = curr[0] + nx * thick * miter
    const oy = curr[1] + ny * thick * miter
    outer[i] = [ox, oy]
    // Assenta o fecho no bordo superior/direito acessível (sem tapar o centro do feixe).
    const score = ox * 0.88 + oy * 0.48
    if (score > bestScore) { bestScore = score; bestIdx = i }
  }

  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)))
  const holePts = [...inner].reverse().map(([x, y]) => new THREE.Vector2(x, y))
  shape.holes.push(new THREE.Path(holePts))
  const bevelT = 0.0014
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, width - bevelT * 2),
    bevelEnabled: true,
    bevelThickness: bevelT,
    bevelSize: 0.001,
    bevelSegments: 1,
    curveSegments: 1,
  })
  geo.translate(0, 0, -(width - bevelT * 2) * 0.5)
  geo.computeVertexNormals()

  const [bx, by] = outer[bestIdx]
  const [bnx, bny] = normals[bestIdx]
  return {
    geo,
    headX: bx + bnx * 0.0055,
    headY: by + bny * 0.0055,
    headRotZ: Math.atan2(bny, bnx),
  }
}

/** Abraçadeiras de filaçar (PA66): fita tensionada no fecho convexo dos cabos + cabeça com lingueta e corte rente. */
function BundleTies3D({ wires, paths, components, obstacles }: {
  wires: Wire[]
  paths: Map<string, WirePath3D> | null | undefined
  components: ElectricalComponent[]
  obstacles: WireObstacle[]
}) {
  const closedDucts = useMemo(() => {
    const closedIds = new Set(
      components.filter((c) => c.type === 'cableDuct' && c.state?.coverOn !== false).map((c) => c.id),
    )
    if (!closedIds.size) return []
    return obstacles.filter((o) => o.componentId && closedIds.has(o.componentId))
  }, [components, obstacles])

  const built = useMemo(() => {
    if (!paths || !wires.some((w) => w.bundleId)) return []
    const radii = new Map<string, { points: [number, number, number][]; radius: number }>()
    for (const w of wires) {
      const path = paths.get(w.id)
      if (!path || !w.bundleId) continue
      radii.set(w.id, {
        points: path.points as [number, number, number][],
        radius: (cableOuterDiameterMm(w.gauge, { conductorCount: w.conductorCount, sheathed: w.sheathed }) * PANEL_UNITS_PER_MM) / 2,
      })
    }
    const rawTies = bundleLacingTies(wires, radii).filter((tie) => {
      const [x, y, z] = tie.position
      // Oculta abraçadeiras totalmente tapadas por calha técnica com tampa fechada.
      return !closedDucts.some((d) =>
        x >= d.min.x + 0.01 && x <= d.max.x - 0.01
        && y >= d.min.y + 0.01 && y <= d.max.y - 0.01
        && z >= d.min.z - 0.02 && z <= d.max.z + 0.015)
    })
    return rawTies.map((tie) => {
      const rVec = new THREE.Vector3(...tie.right).normalize()
      const aVec = new THREE.Vector3(...tie.axis).normalize()
      const uVec = new THREE.Vector3().crossVectors(aVec, rVec).normalize()
      rVec.crossVectors(uVec, aVec).normalize()
      const basis = new THREE.Matrix4().makeBasis(rVec, uVec, aVec)
      const quat = new THREE.Quaternion().setFromRotationMatrix(basis)
      const thick = 0.0102
      const width = 0.031
      const pos: [number, number, number] = [tie.position[0], tie.position[1], tie.position[2]]
      const strap = buildTensionedStrapGeometry(tie.circles, tie.halfWidth, tie.halfHeight, thick, width)
      // Achata apenas vértices exteriores traseiros que rocem na chapa, sem deslocar a fita da frente dos cabos.
      if (pos[2] >= PLATE_FRONT_Z - 0.005) {
        const attr = strap.geo.getAttribute('position') as THREE.BufferAttribute
        const minWorldZ = PLATE_FRONT_Z + 0.0012
        const vTmp = new THREE.Vector3()
        const invQ = quat.clone().invert()
        let touched = false
        for (let vi = 0; vi < attr.count; vi++) {
          vTmp.set(attr.getX(vi), attr.getY(vi), attr.getZ(vi)).applyQuaternion(quat)
          const wz = pos[2] + vTmp.z
          if (wz < minWorldZ) {
            vTmp.z = minWorldZ - pos[2]
            vTmp.applyQuaternion(invQ)
            attr.setXYZ(vi, vTmp.x, vTmp.y, vTmp.z)
            touched = true
          }
        }
        if (touched) {
          attr.needsUpdate = true
          strap.geo.computeVertexNormals()
        }
      }
      return { tie, pos, quat, ...strap }
    })
  }, [wires, paths, closedDucts])

  useEffect(() => () => { for (const item of built) item.geo.dispose() }, [built])

  if (!built.length) return null
  return <group userData={{ noPick: true }}>
    {built.map(({ tie, pos, quat, geo, headX, headY, headRotZ }, i) => {
      // Poliamida PA66 preta carbono acetinada (alta nitidez industrial); marfim natural em feixes 100% escuros.
      const strapColor = tie.darkBundle ? '#eae4d5' : '#141920'
      const pawlColor = tie.darkBundle ? '#475569' : '#4b5563'
      return <group key={`tie-${tie.bundleId}-${i}`} position={pos} quaternion={quat} userData={{ noPick: true }}>
        <mesh geometry={geo} raycast={() => null} castShadow receiveShadow>
          <meshPhysicalMaterial color={strapColor} roughness={0.34} metalness={0.05} clearcoat={0.32} clearcoatRoughness={0.36} />
        </mesh>
        <group position={[headX, headY, 0]} rotation={[0, 0, headRotZ]}>
          <mesh raycast={() => null} castShadow receiveShadow>
            <boxGeometry args={[0.017, 0.024, 0.035]} />
            <meshPhysicalMaterial color={strapColor} roughness={0.34} metalness={0.05} clearcoat={0.32} clearcoatRoughness={0.36} />
          </mesh>
          <mesh raycast={() => null} position={[0.0065, 0, 0]}>
            <boxGeometry args={[0.007, 0.013, 0.025]} />
            <meshStandardMaterial color={pawlColor} roughness={0.42} metalness={0.32} />
          </mesh>
        </group>
      </group>
    })}
  </group>
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
    const refreshTextures = () => {
      gl.shadowMap.needsUpdate = true
      invalidate()
    }
    const stop = onCadTexturesReady(refreshTextures)
    const stopMotor = onMotorTexturesReady(refreshTextures)
    return () => {
      stop()
      stopMotor()
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
/**
 * Orçamento de frames em RUN (GPU real). Antes a vista corria em `frameloop="always"`: 60–144 frames/s
 * mesmo com a cena parada. Agora pede frames só quando fazem falta: ritmo total durante 1,2 s depois de
 * qualquer mudança de estado da simulação, de um toque/rato ou do arranque (`burst`), e ~30 frames/s no
 * resto do RUN (motores a rodar, pisca, corrente a fluir continuam fluidos; animações usam o `delta`).
 */
function RunFrameBudget({ active, burst }: { active: boolean; burst: boolean }) {
  const invalidate = useThree((state) => state.invalidate)
  const domElement = useThree((state) => state.gl.domElement)
  useEffect(() => {
    if (!active && !burst) return
    let raf = 0
    let last = 0
    let fullUntil = performance.now() + 1200
    const boost = () => { fullUntil = performance.now() + 1200 }
    const unsubscribe = useSimStore.subscribe((state, previous) => { if (state.components !== previous.components || state.wires !== previous.wires) boost() })
    domElement.addEventListener('pointermove', boost, { passive: true })
    domElement.addEventListener('pointerdown', boost, { passive: true })
    domElement.addEventListener('wheel', boost, { passive: true })
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const full = burst || now < fullUntil
      if (full || now - last >= 1000 / 30 - 2) { last = now; invalidate() }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      unsubscribe()
      domElement.removeEventListener('pointermove', boost)
      domElement.removeEventListener('pointerdown', boost)
      domElement.removeEventListener('wheel', boost)
    }
  }, [active, burst, invalidate, domElement])
  return null
}

/** Resolução adaptativa: se os frames ficam lentos baixa para 1×, e volta a subir quando há folga. */
function AdaptiveResolution({ enabled }: { enabled: boolean }) {
  const setDpr = useThree((state) => state.setDpr)
  const max = Math.min(1.5, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  if (!enabled) return null
  return <PerformanceMonitor flipflops={3} onDecline={() => setDpr(1)} onIncline={() => setDpr(max)} onFallback={() => setDpr(1)} />
}

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

/**
 * Camada 3D de Arco Elétrico, Faíscas e Fumo para curto-circuitos e sobreaquecimento.
 */
function FaultEffectsLayer({ panelPivots }: { panelPivots: Record<string, THREE.Vector3> }) {
  const shortCircuit = useSimStore((s) => s.sim.shortCircuit)
  const components = useSimStore((s) => s.components)
  const wires = useSimStore((s) => s.wires)
  useSimStore((s) => s.simTick)

  const arcActive = !!shortCircuit?.active
  const arcPosition: [number, number, number] = shortCircuit?.focalPoint ?? [0, 0, 0.22]

  const smokePoints = useMemo(() => {
    const list: FaultPoint3D[] = []
    for (const w of wires) {
      const heat = w.heatLevel ?? 0
      if (heat > 0.12 || w.burnt) {
        const cFrom = components.find((c) => c.terminals.some((t) => t.id === w.fromTerminalId))
        const p = cFrom ? panelPivots[cFrom.id] : null
        if (p) {
          list.push({
            position: [p.x, p.y + 0.04, p.z + 0.08],
            intensity: Math.max(0.2, heat),
          })
        }
      }
    }
    for (const c of components) {
      const heat = Number(c.state.heatLevel ?? 0)
      if (heat > 0.12 || c.state.burnt) {
        const p = panelPivots[c.id]
        if (p) {
          list.push({
            position: [p.x, p.y, p.z + 0.07],
            intensity: Math.max(0.25, heat),
          })
        }
      }
    }
    return list
  }, [wires, components, panelPivots])

  const burntPoints = useMemo(() => {
    const list: Array<[number, number, number]> = []
    for (const c of components) {
      if (c.state.burnt) {
        const p = panelPivots[c.id]
        if (p) {
          list.push([p.x, p.y, p.z + 0.08])
        }
      }
    }
    return list
  }, [components, panelPivots])

  return (
    <FaultEffects3D
      arcActive={arcActive}
      arcPosition={arcPosition}
      smokePoints={smokePoints}
      burntPoints={burntPoints}
    />
  )
}

/** Câmara previsível: presets e foco não alteram qualquer posição do projeto. */
function PanelCameraRig({ command, railWidth, onStats, scrollBridge, scrollBounds, frontEdit = false, panMode = false, viewLocked = false, maxDistance = 60 }: { command: PanelCameraCommand; railWidth: number; onStats: (stats: { yaw: number; pitch: number; zoom: number }) => void; scrollBridge: React.MutableRefObject<PanelScrollBridge>; scrollBounds: CameraScrollBounds; frontEdit?: boolean; panMode?: boolean; viewLocked?: boolean; maxDistance?: number }) {
  const { camera, size, invalidate } = useThree()
  const controlsRef = useRef<any>(null)
  // Enquadramento usa os valores mais recentes sem reiniciar a câmara quando o conteúdo/tamanho muda.
  const fitRef = useRef({ railWidth, width: size.width, height: size.height })
  fitRef.current = { railWidth, width: size.width, height: size.height }
  const scrollState = useRef({ bounds: scrollBounds, size, viewLocked })
  scrollState.current = { bounds: scrollBounds, size, viewLocked }
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
    const metrics = cameraScrollMetrics(camera, controls.target, scrollState.current.size, scrollState.current.bounds)
    scrollBridge.current.metrics = metrics
    scrollBridge.current.report?.(metrics)
  }
  // Transição suave entre vistas (cubo, botões, atalhos): a câmara desliza em arco em ~0,4 s.
  const firstCommandRef = useRef(true)
  const animRef = useRef<{ start: number; duration: number; fromDir: THREE.Vector3; toDir: THREE.Vector3; fromDist: number; toDist: number; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; fromUp: THREE.Vector3; toUp: THREE.Vector3 } | null>(null)
  useEffect(() => {
    scrollBridge.current.pan = position => {
      const controls = controlsRef.current
      if (!controls || scrollState.current.viewLocked) return
      animRef.current = null
      const metrics = cameraScrollMetrics(camera, controls.target, scrollState.current.size, scrollState.current.bounds)
      panCameraToScroll(camera, controls.target, metrics.view, position)
      controls.update(); report(); invalidate()
    }
    return () => { scrollBridge.current.pan = undefined }
  }, [camera, invalidate, scrollBridge])
  useEffect(() => { report() }, [size.width, size.height, scrollBounds.minX, scrollBounds.minY, scrollBounds.minZ, scrollBounds.maxX, scrollBounds.maxY, scrollBounds.maxZ])
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
    invalidate()
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
    invalidate()
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
  return <OrbitControls ref={controlsRef} minDistance={0.6} maxDistance={maxDistance} minPolarAngle={0.08} maxPolarAngle={Math.PI - 0.08} enablePan={!viewLocked} enableRotate={!viewLocked} enableZoom={!viewLocked} rotateSpeed={0.82} panSpeed={0.72} makeDefault onChange={report} mouseButtons={buttons} touches={touches} screenSpacePanning autoRotate={false} />
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
      // Esconde overlays de edição, grelhas e componentes fora da chapa (ex.: motor
      // à direita, que ficava cortado a meio no cartão do dashboard).
      const hidden: THREE.Object3D[] = []
      // Enquadramento = tudo o que o projeto mostra (chapa, aparelhos fora dela como o motor e o
      // multímetro, e os cabos inteiros), para a capa ser fiel ao que se vê no editor.
      const box = new THREE.Box3(new THREE.Vector3(b.minX, b.minY, -0.5), new THREE.Vector3(b.maxX, b.maxY, 0.5))
      scene.traverse((o) => {
        if (!o.visible) return
        if (o.userData?.noSnapshot || o.userData?.excludeFromCover) {
          o.visible = false
          hidden.push(o)
          return
        }
        if (o.type === 'GridHelper' || o.type === 'AxesHelper') {
          o.visible = false
          hidden.push(o)
          return
        }
        if (o.userData?.isComponentRoot) box.union(new THREE.Box3().setFromObject(o))
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) {
          let node: THREE.Object3D | null = o
          let isWire = false
          while (node) {
            if (node.userData?.wireId) { isWire = true; break }
            node = node.parent
          }
          // Os tubos dos cabos têm a geometria em coordenadas do mundo: escalar a malha deslocava-os
          // para fora dos bornes (e os do multímetro para fora do quadro). Só entram no enquadramento.
          if (isWire) box.expandByObject(o)
        }
      })
      try {
        // Janela 16:10 centrada no conjunto, com margem para não cortar bornes, etiquetas nem cabos.
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const halfTan = Math.tan((fov * Math.PI) / 360)
        const windowHeight = Math.max(size.y, size.x / target) * 1.1
        const dist = windowHeight / fh / 2 / halfTan + box.max.z + 0.1
        const cam = new THREE.PerspectiveCamera(fov, aspect, 0.05, 400)
        cam.position.set(center.x, center.y, dist)
        cam.lookAt(center.x, center.y, 0)
        cam.updateMatrixWorld()
        gl.render(scene, cam)
        const sw = src.width * fw, sh = src.height * fh
        // ≤640 px e JPEG 0,72: capa legível no cartão sem inflar o JSON nem a memória.
        const scale = Math.min(1, 640 / sw)
        const out = document.createElement('canvas')
        out.width = Math.max(1, Math.round(sw * scale))
        out.height = Math.max(1, Math.round(sh * scale))
        const ctx = out.getContext('2d')
        if (!ctx) return null
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, out.width, out.height)
        ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, out.width, out.height)
        return out.toDataURL('image/jpeg', 0.72)
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
/** Dá ao Panel3D (fora do Canvas) a câmara e o canvas, para medir textos HTML no plano do painel. */
function CameraRelay({ target }: { target: MutableRefObject<{ camera: THREE.Camera; el: HTMLElement } | null> }) {
  const { camera, gl } = useThree()
  target.current = { camera, el: gl.domElement }
  return null
}

export default function Panel3D({ initialCamera = null, onInitialCameraUsed, frontEdit = false }: { initialCamera?: ViewCubeRequest | null; onInitialCameraUsed?: () => void; /** Edição frontal: mesma cena 3D, vista frontal por prioridade e grelha por pontos do Esquema. */ frontEdit?: boolean } = {}) {
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  /** Telemóvel: a explicação da ferramenta fica a um toque (o cartão ocupava um quarto do ecrã). */
  useShortcutsRequest('schematic', () => setShortcutHelpOpen(true))
  const [glLost, setGlLost] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [routingLoading, setRoutingLoading] = useState(true)
  const [softwareGl, setSoftwareGl] = useState(IS_SOFTWARE_WEBGL)
  const gridSettings = useSimStore((s) => s.grid)
  // LEDs/estados dos componentes em RUN: subscrição explícita do tick da simulação
  // (a identidade das listas já não muda a cada varredura).
  const simTick = useSimStore((s) => s.simTick)
  const placingType = useSimStore((s) => s.placingType)
  const setPlacingType = useSimStore((s) => s.setPlacingType)
  const storedComponents = useSimStore((s) => s.components)
  const addCanvasNote = useSimStore((s) => s.addCanvasNote)
  const updateCanvasNote = useSimStore((s) => s.updateCanvasNote)
  const canvasTexts = useSimStore((s) => s.canvasTexts)
  const updateCanvasText = useSimStore((s) => s.updateCanvasText)
  const removeCanvasText = useSimStore((s) => s.removeCanvasText)
  const pressButton = useSimStore((s) => s.pressButton)
  const operateComponent = useSimStore((s) => s.operateComponent)
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
  const allowOutsideFactory = useSimStore((s) => s.allowOutsideFactory)
  const gridDragEnabled = useSimStore((s) => s.gridDragEnabled)
  const editMode: Panel3DEditMode = demoMode ? 'navigate' : tool === 'wire' ? 'connect' : tool === 'select' ? 'navigate' : tool
  // Regra GLOBAL de manobra (store/manobra): nenhum aparelho se atua antes de ▶ —
  // botões, disjuntores, seletores, porta-fusível, TEST/RESET e teclas dos CAD.
  // Em STOP mantém-se apenas seleção/edição (e visualização estática na demonstração).
  const canActuate = isManobraAllowed({ sim: { runState } }) && (demoMode || tool === 'select') && !viewOrientationEditor
  const interactive = canActuate
  const mechanicalControls = canActuate
  // Montagem (porta do quadro): não é manobra de aparelho e abre também em STOP.
  const assemblyControls = (demoMode || tool === 'select') && !viewOrientationEditor
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
  const wireDraftSlot = useWireDraftSlot()
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
  const multiDragOrigins = useRef<Record<string, { x: number; y: number; z: number }>>({})
  const cameraProjectRef = useRef<THREE.Camera | null>(null)
  const [marquee3d, setMarquee3d] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const marqueeDrag = useRef<{ x0: number; y0: number; additive: boolean } | null>(null)

  const stageId = useId()
  const cameraScrollBridge = useRef<PanelScrollBridge>({})
  const [stageVisible, setStageVisible] = useState(true)
  const [burstActive, setBurstActive] = useState(true)
  // No simulador a câmara abre sempre em vista frontal; apenas o motor tem orientação isométrica.
  const [cameraCommand, setCameraCommand] = useState<PanelCameraCommand>({ id: 0, view: 'isometric', target: [0, 0, 0.3] })
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
  const [sceneEnvironment, setSceneEnvironment] = useState<'canvas' | 'factory'>(() => {
    try {
      return localStorage.getItem('dc-simu:panel3d:environment') === 'factory' ? 'factory' : 'canvas'
    } catch { return 'canvas' }
  })
  const [cameraStats, setCameraStats] = useState({ yaw: 0, pitch: 0, zoom: 100 })
  /* Anotações: comentário em nota (abre já para escrever, sem caixa do sistema) e texto livre (clicar para colocar). */
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  /** Textos livres na seleção múltipla (com os componentes): Ctrl/Shift+clique, retângulo, Ctrl+A e grupos. */
  const [groupTextIds, setGroupTextIds] = useState<string[]>([])
  const [groupTextOffset, setGroupTextOffset] = useState<{ dx: number; dy: number } | null>(null)
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
    if (!placingText && !selectedTextId && !groupTextIds.length) return
    const onKey = (event: KeyboardEvent) => {
      if (useSimStore.getState().selectedDecal) return
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"],[role="scrollbar"]')) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setPlacingText(false); setSelectedTextId(null); setGroupTextIds([]); useSimStore.getState().selectComponents([]); return }
      if (groupTextIds.length && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault(); event.stopImmediatePropagation()
        deleteMixedSelection()
        return
      }
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
  }, [placingText, selectedTextId, groupTextIds, removeCanvasText, updateCanvasText])
  const cycleBackground = () => setBackgroundMode((current) => {
    const next = current === 'technical' ? 'white' : current === 'white' ? 'dark' : 'technical'
    try { localStorage.setItem('dc-simu:panel3d:background', next) } catch {}
    return next
  })
  const selectEnvironment = (next: 'canvas' | 'factory') => {
    setSceneEnvironment(next)
    try { localStorage.setItem('dc-simu:panel3d:environment', next) } catch {}
    if (next === 'factory') {
      moveCamera('isometric')
    }
  }
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
    if (!initialCameraRef.current) moveCamera(frontEdit ? 'front' : 'isometric')
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
    const base = tool === 'wire' ? wireDefaults.medium === 'hydraulic' || wireDefaults.medium === 'pneumatic'
      ? 'Tubagem: clique nos conectores assinalados para ligar · Esc termina'
      : 'Cabo: clique nos bornes para ligar · Esc termina'
      : tool === 'erase' ? 'Apagar: clique num componente ou cabo · Ctrl+Z desfaz'
      : tool === 'probe' ? (probeA ? 'Sonda: escolha o segundo borne' : 'Sonda: escolha o primeiro borne')
      : tool === 'pan' ? 'Mover vista: arraste o desenho'
      : interactive ? 'Simulação: clique nos dispositivos para os acionar'
      : selectedIds.length ? `${selectedIds.length} selecionado${selectedIds.length > 1 ? 's' : ''} · F enquadra`
      : 'Selecionar: clique para escolher · arraste para mover'
    return probeResult ? `${base} · ${probeResult.note}${probeResult.b ? ` · ${probeResult.voltage}` : ''}` : base
  }, [tool, probeA, probeResult, interactive, selectedIds.length, placingText, wireDefaults.medium])
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
  }, [tool, wireDefaults.medium])
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
    for (const c of rail) pos[c.id] = new THREE.Vector3(0, RAIL_Y + (getComponentPhysicalSizeMm(c.type)?.height ?? 80) * PANEL_UNITS_PER_MM / 2, 0)
    return { positions: pos }
  }, [components])

  const railComponents = components.filter((c) => positions[c.id])
  const offRail = components.filter((c) => !positions[c.id] && !isMountingRail(c.type) && !isPanelAccessoryType(c.type))
  const accessories = components.filter((c) => isPanelAccessoryType(c.type))
  const hasEnclosure = accessories.some((c) => c.type === 'panelEnclosure')

  const frontPivot = (component: ElectricalComponent): [number, number, number] => {
    if (component.type === 'motor3ph' || component.type === 'motor1ph') return [0, MOTOR_CENTER_Y, 0.7]
    if (component.type === 'waterPump') return [0, MOTOR_CENTER_Y, 0.95]
    if (component.type === 'waterTank') return [0, MOTOR_CENTER_Y + 0.5, 4.2]
    if (component.type === 'floatSwitch') return [0, RAIL_Y + 0.9, 0.55]
    if (isJunctionBoxType(component.type)) return [2.4, RAIL_Y + 0.4, 0.35]
    if (isWagoConnectorType(component.type)) return [2.4, RAIL_Y + 0.4, 0.42]
    if (component.type === 'towerLight') return [0, RAIL_Y + 1.3, 0.12]
    if (component.type === 'pilotLightAd22') return [0, RAIL_Y + 1.05, 0.4]
    if (component.type === 'ledGreen' || component.type === 'ledRed' || component.type === 'ledYellow' || component.type === 'ledWhite' || component.type === 'buzzer') return [0, RAIL_Y + 1.15, 0.12]
    if (component.type === 'capacitorRun60uF') return [0, RAIL_Y + 0.7, 0.5]
    if (isLightingType(component.type)) return [0, RAIL_Y + 0.95, 0.12]
    if (['proximitySensor', 'photoSensor', 'pressureSwitch', 'thermostat', 'floatSwitch'].includes(component.type)) return [0, RAIL_Y + 0.9, 0.3]
    return [0, RAIL_Y + 1.05, 0.4]
  }
  const front = useMemo(() => Object.fromEntries(offRail.map((component) => [component.id, 0])) as Record<string, number>, [offRail])
  const baseOrientationFor = (component: ElectricalComponent) => viewOrientationEditor?.componentId === component.id
    ? viewOrientationEditor.draft
    : componentOrientationOf(component)
  const orientationFor = (component: ElectricalComponent) => componentOrientationOf(doorMountedComponent({ ...component, viewOrientation: baseOrientationFor(component) }, components))
  const basePivots: Record<string, THREE.Vector3> = Object.fromEntries(components.map((component) => {
    const railPosition = positions[component.id]
    return [component.id, railPosition
      ? new THREE.Vector3(railPosition.x, railPosition.y, 0)
      : isMountingRail(component.type)
        ? new THREE.Vector3(0, 0, railCenterZ(component))
        : isPanelAccessoryType(component.type)
          ? new THREE.Vector3(0, 0, 0)
          : new THREE.Vector3(...frontPivot(component))]
  }))

  // Posição 3D = posição no Esquema à escala real (1 mm = 0,01 unidades). O Esquema
  // continua a ser a fonte única de verdade: mover no 3D altera o Esquema e vice-versa.
  const panelPivots: Record<string, THREE.Vector3> = {}
  for (const component of components) {
    const { x, y } = componentPanelXY(component)
    if (component.panelMount?.enclosureId) {
      const enclosure = components.find((e) => e.id === component.panelMount!.enclosureId && e.type === 'panelEnclosure')
      if (enclosure) {
        const enc = componentPanelXY(enclosure)
        const dims = enclosureDimsOf(enclosure.state)
        const offX = (component.panelMount.offsetXmm ?? 0) * PANEL_UNITS_PER_MM
        const offY = (component.panelMount.offsetYmm ?? 0) * PANEL_UNITS_PER_MM
        const half = componentHalfExtents(component, baseOrientationFor(component))
        const baseZ = PLATE_FRONT_Z - ENCLOSURE_PLATE_FRONT_MM * PANEL_UNITS_PER_MM
        const face = component.panelMount.face
        if (face === 'door' || face === 'doorOuter') {
          const doorFrontZ = baseZ + dims.depthMm * PANEL_UNITS_PER_MM + 22 * PANEL_UNITS_PER_MM
          // Porta fecha a Z≈doorFront; componentes na porta acompanham X/Y do quadro + offsets
          panelPivots[component.id] = new THREE.Vector3(enc.x + offX, enc.y + offY, doorFrontZ + half.z)
          continue
        } else if (face === 'left') {
          const wallX = enc.x - (dims.widthMm * PANEL_UNITS_PER_MM) / 2 - ENCLOSURE.sheet * PANEL_UNITS_PER_MM
          panelPivots[component.id] = new THREE.Vector3(wallX - half.x, enc.y + offY, baseZ + (dims.depthMm * PANEL_UNITS_PER_MM) / 2)
          continue
        } else if (face === 'right') {
          const wallX = enc.x + (dims.widthMm * PANEL_UNITS_PER_MM) / 2 + ENCLOSURE.sheet * PANEL_UNITS_PER_MM
          panelPivots[component.id] = new THREE.Vector3(wallX + half.x, enc.y + offY, baseZ + (dims.depthMm * PANEL_UNITS_PER_MM) / 2)
          continue
        } else if (face === 'top') {
          const wallY = enc.y + (dims.heightMm * PANEL_UNITS_PER_MM) / 2 + ENCLOSURE.sheet * PANEL_UNITS_PER_MM
          panelPivots[component.id] = new THREE.Vector3(enc.x + offX, wallY + half.y, baseZ + (dims.depthMm * PANEL_UNITS_PER_MM) / 2)
          continue
        } else if (face === 'bottom') {
          const wallY = enc.y - (dims.heightMm * PANEL_UNITS_PER_MM) / 2 - ENCLOSURE.sheet * PANEL_UNITS_PER_MM
          panelPivots[component.id] = new THREE.Vector3(enc.x + offX, wallY - half.y, baseZ + (dims.depthMm * PANEL_UNITS_PER_MM) / 2)
          continue
        } else {
          // inside — na chapa, ligeiramente à frente da placa do quadro
          panelPivots[component.id] = new THREE.Vector3(enc.x + offX, enc.y + offY, PLATE_FRONT_Z + half.z)
          continue
        }
      }
    }
    // Helper: se o centro do elemento está dentro do interior útil de algum quadro, mantém-no livre das chapas laterais;
    // se estiver fora do quadro, deixa-o livre no exterior (nunca puxa de volta para dentro).
    const clampInsideAnyEnclosure = (px: number, py: number, half: { x: number; y: number }) => {
      for (const enc of accessories.filter((a) => a.type === 'panelEnclosure')) {
        const ed = enclosureDimsOf(enc.state)
        const ex = componentPanelXY(enc).x, ey = componentPanelXY(enc).y
        const outerHalfW = (ed.widthMm * PANEL_UNITS_PER_MM) / 2, outerHalfH = (ed.heightMm * PANEL_UNITS_PER_MM) / 2
        const interiorHalfW = outerHalfW - ENCLOSURE.sheet * PANEL_UNITS_PER_MM
        const interiorHalfH = outerHalfH - ENCLOSURE.sheet * PANEL_UNITS_PER_MM
        if (Math.abs(px - ex) < interiorHalfW && Math.abs(py - ey) < interiorHalfH) {
          const innerHalfW = interiorHalfW - 0.04 - half.x
          const innerHalfH = interiorHalfH - 0.04 - half.y
          const minX = ex - Math.max(0, innerHalfW), maxX = ex + Math.max(0, innerHalfW)
          const minY = ey - Math.max(0, innerHalfH), maxY = ey + Math.max(0, innerHalfH)
          px = Math.max(minX, Math.min(maxX, px))
          py = Math.max(minY, Math.min(maxY, py))
        }
      }
      return [px, py] as const
    }
    if (isMountingRail(component.type)) {
      const half = componentHalfExtents(component, baseOrientationFor(component))
      let px = x, py = y
      ;[px, py] = clampInsideAnyEnclosure(px, py, half)
      panelPivots[component.id] = new THREE.Vector3(px, py, railCenterZ(component))
    } else if (component.type === 'panelEnclosure') {
      // Pivô no centro do armário; a face da chapa de montagem do quadro coincide com a da chapa do painel.
      const half = componentHalfExtents(component, baseOrientationFor(component))
      panelPivots[component.id] = new THREE.Vector3(x, y, PLATE_FRONT_Z - ENCLOSURE_PLATE_FRONT_MM * PANEL_UNITS_PER_MM + half.z)
    } else if (component.type === 'cableDuct' || component.type === 'spiralWrap') {
      const half = componentHalfExtents(component, baseOrientationFor(component))
      let px = x, py = y
      ;[px, py] = clampInsideAnyEnclosure(px, py, half)
      panelPivots[component.id] = new THREE.Vector3(px, py, PLATE_FRONT_Z + half.z)
    } else if (!isPanelBound(component)) {
      if (component.panel3DPosition) {
        panelPivots[component.id] = new THREE.Vector3(
          component.panel3DPosition.x,
          component.panel3DPosition.y,
          component.panel3DPosition.z,
        )
      } else {
        panelPivots[component.id] = new THREE.Vector3(x, y, frontPivot(component)[2])
      }
    } else {
      // Assente na face da calha (mesma profundidade, esteja ou não fixo numa calha).
      const half = componentHalfExtents(component, baseOrientationFor(component))
      let px = x, py = y
      if (component.enclosureId) {
        const enc = components.find((e) => e.id === component.enclosureId && e.type === 'panelEnclosure')
        if (enc) {
          const ed = enclosureDimsOf(enc.state)
          const ex = componentPanelXY(enc).x, ey = componentPanelXY(enc).y
          const outerHalfW = (ed.widthMm * PANEL_UNITS_PER_MM) / 2
          const outerHalfH = (ed.heightMm * PANEL_UNITS_PER_MM) / 2
          if (Math.abs(px - ex) <= outerHalfW && Math.abs(py - ey) <= outerHalfH) {
            const innerHalfW = outerHalfW - ENCLOSURE.sheet * PANEL_UNITS_PER_MM - 0.06 - half.x
            const innerHalfH = outerHalfH - ENCLOSURE.sheet * PANEL_UNITS_PER_MM - 0.06 - half.y
            const minX = ex - Math.max(0, innerHalfW), maxX = ex + Math.max(0, innerHalfW)
            const minY = ey - Math.max(0, innerHalfH), maxY = ey + Math.max(0, innerHalfH)
            if (px < minX) px = minX
            if (px > maxX) px = maxX
            if (py < minY) py = minY
            if (py > maxY) py = maxY
          }
        }
      } else {
        ;[px, py] = clampInsideAnyEnclosure(px, py, half)
      }
      panelPivots[component.id] = new THREE.Vector3(px, py, PLATE_FRONT_Z + mountedRailHeightMm(component, components) * PANEL_UNITS_PER_MM + half.z + mountDepthOffset(component, components) + relaySocketMountDepthOffset(component, components) + ((isCombBusbar(component) || isCombConnector(component)) ? combMountDepthOffset(component, components) : 0))
    }
  }
  // Réguas de bornes (`state.stripId`): no 3D encostam pelo corpo real, qualquer que seja o passo do Esquema
  // (o símbolo 2D tem 76 px por borne, o corpo físico só 8,15 mm). O primeiro fica no sítio e os outros seguem-no.
  {
    const strips = new Map<string, ElectricalComponent[]>()
    for (const c of components) {
      const sid = c.state?.stripId
      if (typeof sid !== 'string' || !panelPivots[c.id] || c.panelMount) continue
      const list = strips.get(sid) ?? []
      list.push(c)
      strips.set(sid, list)
    }
    for (const members of strips.values()) {
      if (members.length < 2) continue
      members.sort((a, b) => {
        if (a.railId && a.railId === b.railId && typeof a.railOffsetMm === 'number' && typeof b.railOffsetMm === 'number') {
          return a.railOffsetMm - b.railOffsetMm
        }
        return a.schematicX - b.schematicX
      })
      const lead = members[0]
      let edge = panelPivots[lead.id].x + componentHalfExtents(lead, baseOrientationFor(lead)).x
      for (const m of members.slice(1)) {
        const hx = componentHalfExtents(m, baseOrientationFor(m)).x
        panelPivots[m.id].x = edge + hx
        edge += hx * 2
      }
    }
  }
  for (const component of components) {
    const motion = doorMountMotion(component, components, PLATE_FRONT_Z)
    if (motion) panelPivots[component.id].sub(motion.hinge).applyAxisAngle(new THREE.Vector3(0, 1, 0), motion.angle).add(motion.hinge)
  }

  // Réguas de bornes resolvidas (explícitas, hierárquicas `X1.0…X1.3` ou bornes soltos encostados):
  // substitui as TAGs individuais sobrepostas por um único cabeçalho limpo + barra de agrupamento + pontes FBS 3D.
  const { terminalStripMemberIds, terminalStripHeaders, terminalStripJumpers } = (() => {
    const resolved = resolveTerminalStrips(components)
    const claimed = new Set<string>()
    for (const st of resolved) if (st.members.length >= 2) for (const m of st.members) claimed.add(m.id)
    const loose = resolveAdjacentLooseTerminalClusters(components, claimed)
    const activeStrips = [...resolved.filter((s) => s.members.length >= 2), ...loose]
    const memberIds = new Set<string>()
    const headers: Array<{
      key: string
      text: string
      labelX: number
      labelY: number
      labelZ: number
      leftX: number
      rightX: number
      barY: number
      barZ: number
      selected: boolean
    }> = []
    const jumpers: Array<{ key: string; centerX: number; spanX: number; baseY: number; baseZ: number }> = []

    for (const st of activeStrips) {
      const valid = st.members.filter((m) => !!panelPivots[m.id])
      if (valid.length < 2) continue
      for (const m of valid) memberIds.add(m.id)

      // Ordena pela posição real X no painel 3D.
      const ordered = [...valid].sort((a, b) => panelPivots[a.id].x - panelPivots[b.id].x)
      let leftX = Infinity
      let rightX = -Infinity
      let topY = -Infinity
      let maxFrontZ = -Infinity
      for (const m of ordered) {
        const p = panelPivots[m.id]
        const h = componentHalfExtents(m, orientationFor(m))
        leftX = Math.min(leftX, p.x - h.x)
        rightX = Math.max(rightX, p.x + h.x)
        topY = Math.max(topY, p.y + h.y)
        maxFrontZ = Math.max(maxFrontZ, p.z + h.z)
      }
      const centerX = (leftX + rightX) / 2
      const barY = topY + 0.045
      const labelY = topY + 0.125
      const labelZ = maxFrontZ - 0.02
      const selected = ordered.some((m) => selectedIds.includes(m.id))
      headers.push({
        key: st.key,
        text: st.headerTag,
        labelX: centerX,
        labelY,
        labelZ,
        leftX: leftX + 0.008,
        rightX: rightX - 0.008,
        barY,
        barZ: labelZ,
        selected,
      })

      // Pontes FBS vermelhas entre bornes adjacentes (≤ 18 mm centro-a-centro, nunca em PE).
      for (let i = 0; i < ordered.length - 1; i++) {
        const a = ordered[i]
        const b = ordered[i + 1]
        if (!a.state?.jumperNext) continue
        if (!canTerminalHaveJumper(a.type) || !canTerminalHaveJumper(b.type)) continue
        const pA = panelPivots[a.id]
        const pB = panelPivots[b.id]
        const span = Math.abs(pB.x - pA.x)
        if (span > 0.24 || Math.abs(pB.y - pA.y) > 0.12) continue
        const hA = componentHalfExtents(a, orientationFor(a))
        jumpers.push({
          key: `fbs:${a.id}:${b.id}`,
          centerX: (pA.x + pB.x) / 2,
          spanX: span,
          baseY: pA.y - hA.y,
          baseZ: pA.z,
        })
      }
    }

    // Anti-colisão horizontal entre cabeçalhos de régua e etiquetas de aparelhos vizinhos na mesma linha (ex.: QG1 | X1 | X2).
    const estHalfW = (txt: string, fontSize = 0.078) => Math.max(0.06, txt.length * fontSize * 0.34 + 0.025)
    const fixedNeighborLabels: Array<{ x: number; y: number; hw: number }> = []
    for (const c of railComponents) {
      if (memberIds.has(c.id) || isMountingRail(c.type) || c.type === 'panelEnclosure' || c.type === 'cableDuct' || c.type === 'spiralWrap') continue
      const p = panelPivots[c.id]
      if (!p) continue
      const h = componentHalfExtents(c, orientationFor(c))
      fixedNeighborLabels.push({ x: p.x, y: p.y + h.y + 0.1, hw: estHalfW(c.ref, 0.085) })
    }
    headers.sort((a, b) => a.labelX - b.labelX)
    for (const hdr of headers) {
      const hw = estHalfW(hdr.text)
      for (const nb of fixedNeighborLabels) {
        if (Math.abs(nb.y - hdr.labelY) > 0.24) continue
        const minGap = nb.hw + hw + 0.025
        const dx = hdr.labelX - nb.x
        if (Math.abs(dx) < minGap) {
          hdr.labelX = dx >= 0 ? nb.x + minGap : nb.x - minGap
        }
      }
    }
    for (let i = 1; i < headers.length; i++) {
      const prev = headers[i - 1]
      const cur = headers[i]
      if (Math.abs(cur.labelY - prev.labelY) > 0.22) continue
      const minGap = estHalfW(prev.text) + estHalfW(cur.text) + 0.03
      if (cur.labelX - prev.labelX < minGap) {
        cur.labelX = prev.labelX + minGap
      }
    }
    return { terminalStripMemberIds: memberIds, terminalStripHeaders: headers, terminalStripJumpers: jumpers }
  })()
  /** Só geometria/posições contam para sombras: RUN mexe estados, não posições. */
  const shadowWatch = useMemo(() => {
    const pos = components.map((c) => { const p = panelPivots[c.id]; return p ? `${c.id}:${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}:${c.rotation ?? 0}` : c.id }).join('|')
    return `${pos}#${wires.length}#${runState}`
    // panelPivots é objecto novo em cada render; a chave deriva de valores, não da identidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, wires.length, runState])

  // Chão fabril e assentamento de máquinas de chão (motores, bombas, reservatórios, tapetes rolantes):
  // em Ambiente fabril ficam sempre assentes no chão de betão, nunca a flutuar nem dentro do quadro elétrico.
  const factoryMode = sceneEnvironment === 'factory'
  // Interruptores/lâmpadas de parede: não penetrar os perfis/colunas de aço da nave (passo 7.5 u).
  if (factoryMode) {
    const COL_STEP = 7.5
    const COL_HALF = 0.42
    const CLEAR = 0.55
    for (const component of components) {
      if (!isLightingType(component.type)) continue
      const pivot = panelPivots[component.id]
      if (!pivot) continue
      const half = componentHalfExtents(component, orientationFor(component))
      const nearestCol = Math.round(pivot.x / COL_STEP) * COL_STEP
      const dist = pivot.x - nearestCol
      const minDist = COL_HALF + half.x + CLEAR
      if (Math.abs(dist) < minDist && Math.abs(nearestCol) > 0.01) {
        pivot.x = nearestCol + Math.sign(dist || 1) * minDist
      }
    }
  }
  const factoryWallFrontZ = hasEnclosure
    ? PLATE_FRONT_Z - ENCLOSURE_PLATE_FRONT_MM * PANEL_UNITS_PER_MM - 0.02
    : PLATE_Z - PLATE_THICKNESS / 2 - 0.02
  const primaryEnclosure = accessories.find((item) => item.type === 'panelEnclosure')
  const panelOnlyBox = (() => {
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    for (const component of components) {
      // Iluminação de parede não define o tamanho da chapa / mountBounds do quadro
      if (!isPanelBound(component) || isLightingType(component.type)) continue
      const pivot = panelPivots[component.id]
      if (!pivot) continue
      const half = componentHalfExtents(component, orientationFor(component))
      b.minX = Math.min(b.minX, pivot.x - half.x); b.maxX = Math.max(b.maxX, pivot.x + half.x)
      b.minY = Math.min(b.minY, pivot.y - half.y); b.maxY = Math.max(b.maxY, pivot.y + half.y)
    }
    return b
  })()
  const factoryMountBounds: FactoryWallMountBounds | null = (() => {
    if (primaryEnclosure) {
      const { x, y } = componentPanelXY(primaryEnclosure)
      const dims = enclosureDimsOf(primaryEnclosure.state)
      const halfW = (dims.widthMm * PANEL_UNITS_PER_MM) / 2
      const halfH = (dims.heightMm * PANEL_UNITS_PER_MM) / 2
      return { minX: x - halfW, maxX: x + halfW, minY: y - halfH, maxY: y + halfH }
    }
    if (Number.isFinite(panelOnlyBox.minX)) {
      return {
        minX: panelOnlyBox.minX - PLATE_MARGIN, maxX: panelOnlyBox.maxX + PLATE_MARGIN,
        minY: panelOnlyBox.minY - PLATE_MARGIN, maxY: panelOnlyBox.maxY + PLATE_MARGIN,
      }
    }
    return null
  })()
  const factoryFloorY = factoryMountBounds
    ? factoryMountBounds.minY - Math.max(4.6, (factoryMountBounds.maxY - factoryMountBounds.minY) * 0.45)
    : -4.8

  // Assentar máquinas de chão (motores, bombas, reservatórios, tapetes rolantes) e estruturas de chão (paredes, pilares)
  const enclosures = accessories.filter((item) => item.type === 'panelEnclosure')
  for (const component of components) {
    if (!isFloorStandingComponent(component) || component.panelMount?.enclosureId) continue
    const pivot = panelPivots[component.id]
    if (!pivot) continue
    const half = componentHalfExtents(component, orientationFor(component))
    if (factoryMode) {
      // Pés encostados ao pavimento industrial (y = factoryFloorY) — nunca a flutuar nem dentro do quadro!
      pivot.y = factoryFloorY + half.y
      if (isFloorMountedMachineType(component.type)) {
        let minSafeZ = factoryWallFrontZ + half.z + 1.85
        for (const enc of enclosures) {
          const encXY = componentPanelXY(enc)
          const ed = enclosureDimsOf(enc.state)
          const encHalfW = (ed.widthMm * PANEL_UNITS_PER_MM) / 2
          const encFrontZ = PLATE_FRONT_Z - ENCLOSURE_PLATE_FRONT_MM * PANEL_UNITS_PER_MM + ed.depthMm * PANEL_UNITS_PER_MM
          if (Math.abs(pivot.x - encXY.x) < encHalfW + half.x + 0.5) {
            minSafeZ = Math.max(minSafeZ, encFrontZ + half.z + 1.55)
          }
        }
        pivot.z = Math.max(pivot.z, minSafeZ)
      }
    } else if (isFloorMountedMachineType(component.type)) {
      // Mesmo em modo Estúdio, nunca deixar um motor/tapete preso dentro do armário elétrico
      for (const enc of enclosures) {
        const encXY = componentPanelXY(enc)
        const ed = enclosureDimsOf(enc.state)
        const encHalfW = (ed.widthMm * PANEL_UNITS_PER_MM) / 2
        const encHalfH = (ed.heightMm * PANEL_UNITS_PER_MM) / 2
        if (Math.abs(pivot.x - encXY.x) < encHalfW + half.x * 0.4 && Math.abs(pivot.y - encXY.y) < encHalfH + half.y * 0.4) {
          pivot.y = encXY.y - encHalfH - half.y - 0.85
        }
      }
    }
  }

  // Limites interiores reais do pavilhão fabril 3D (espelhando FactoryEnvironment3D)
  const factoryPlateSpan =
    Number.isFinite(panelOnlyBox.minX) && Number.isFinite(panelOnlyBox.maxX)
      ? Math.max(12, panelOnlyBox.maxX - panelOnlyBox.minX)
      : 18
  const factoryRoomBounds = computeFactoryRoomBounds(factoryPlateSpan, factoryWallFrontZ, factoryFloorY)

  // Resolver sobreposições iniciais entre componentes sólidos (ex.: 2 reservatórios de água) em QUALQUER modo (Canvas normal ou Ambiente fabril)
  // e manter tudo dentro dos limites interiores do pavilhão fabril quando `factoryMode` está ativo!
  {
    const placedSolids: SolidObstacle3D[] = []
    for (const component of components) {
      if (isPanelBound(component) || component.panelMount?.enclosureId) continue
      const pivot = panelPivots[component.id]
      if (!pivot) continue
      const half = componentHalfExtents(component, orientationFor(component))
      const sizeU = { x: half.x * 2, y: half.y * 2, z: half.z * 2 }
      const floorLocked = factoryMode && isFloorStandingComponent(component)
      const resolved = resolveFactoryPlacement3D({
        movingId: component.id,
        movingType: component.type,
        candidate: { x: pivot.x, y: pivot.y, z: pivot.z },
        movingSize: sizeU,
        obstacles: placedSolids,
        bounds: factoryRoomBounds,
        allowOutside: !factoryMode || allowOutsideFactory,
        floorLocked,
      })
      pivot.set(resolved.x, floorLocked && !allowOutsideFactory ? factoryFloorY + half.y : resolved.y, resolved.z)
      if (isSolidCollisionComponentType(component.type)) {
        placedSolids.push({
          id: component.id,
          type: component.type,
          center: { x: pivot.x, y: pivot.y, z: pivot.z },
          size: sizeU,
        })
      }
    }
  }

  // Montagem física real de bóias (`floatSwitch`) DENTRO do reservatório (`waterTank`) associado!
  // Caixas de derivação montadas no suporte inox de um reservatório: assentam pelo fundo na placa.
  for (const box of components) {
    if (!isJunctionBoxType(box.type) || typeof box.state.tankBracketId !== 'string' || !box.state.tankBracketId) continue
    const tank = components.find((t) => t.id === box.state.tankBracketId && t.type === 'waterTank')
    const tp = tank ? panelPivots[tank.id] : null
    if (!tank || !tp || !tankHasJunctionBracket(tank.state)) continue
    const { plate } = tankJunctionBracketOf(tank.state, PANEL_UNITS_PER_MM)
    const boxDepth = JUNCTION_WAGO_SIZE_MM[box.type as JunctionBoxType].z * PANEL_UNITS_PER_MM
    panelPivots[box.id] = new THREE.Vector3(tp.x + plate.x, tp.y + plate.y, tp.z + plate.z + plate.t / 2 + boxDepth / 2)
  }
  const floatTankContexts: Record<string, FloatSwitchTankContext> = {}
  // Cabos de bóia que entram em cada caixa OBO: cada condutor fica num WAGO 221-2411 (1-1) lá dentro.
  const oboSpliceCables = new Map<string, OboSpliceCable[]>()
  const waterTanks3D = components.filter((c) => c.type === 'waterTank' && !!panelPivots[c.id])
  if (waterTanks3D.length > 0) {
    const mountedCountByTank = new Map<string, number>()
    for (const fs of components) {
      if (fs.type !== 'floatSwitch' || !panelPivots[fs.id]) continue
      const explicitId = typeof fs.state.linkedTankId === 'string' && fs.state.linkedTankId ? fs.state.linkedTankId : null
      let tank = explicitId ? waterTanks3D.find((t) => t.id === explicitId) : null
      // Se não estiver explicitamente desacoplada, instala automaticamente no reservatório mais próximo quando estiver por perto ou em modo auto
      if (!tank && fs.state.autoCoupleTank !== false && fs.state.detachedFromTank !== true) {
        const fp = panelPivots[fs.id]
        let bestDist = Infinity
        for (const tk of waterTanks3D) {
          const tp = panelPivots[tk.id]
          const td = waterTankDimensionsOf(tk.state)
          const tankR = (td.diameterMm / 2) * PANEL_UNITS_PER_MM
          const d = Math.hypot(fp.x - tp.x, fp.z - tp.z)
          if (d < Math.max(tankR + 2.8, 4.5) && d < bestDist) {
            bestDist = d
            tank = tk
          }
        }
      }
      if (!tank) continue
      const tp = panelPivots[tank.id]
      const td = waterTankDimensionsOf(tank.state)
      const tankR = (td.diameterMm / 2) * PANEL_UNITS_PER_MM
      const tankH = td.heightMm * PANEL_UNITS_PER_MM
      const standH = td.standHeightMm * PANEL_UNITS_PER_MM
      const domeH = td.domeHeightMm * PANEL_UNITS_PER_MM
      const totalH = td.totalHeightMm * PANEL_UNITS_PER_MM
      const tankTopY = tp.y - totalH / 2 + standH + tankH + domeH * 0.55

      const idxInTank = mountedCountByTank.get(tank.id) ?? 0
      mountedCountByTank.set(tank.id, idxInTank + 1)
      const sidePref = fs.state.mountSide
      const sideSign = sidePref === 'left' ? -1 : sidePref === 'right' ? 1 : sidePref === 'center' ? 0 : (idxInTank % 2 === 0 ? -1 : 1)
      const defaultDepth = idxInTank === 0 ? 74 : 28
      const mountDepthPct = typeof fs.state.mountDepthPct === 'number' ? fs.state.mountDepthPct : defaultDepth

      panelPivots[fs.id] = new THREE.Vector3(
        tp.x + sideSign * tankR * 0.44,
        tankTopY,
        tp.z + (idxInTank > 1 ? 0.25 : 0),
      )

      // Encaminhar o cabo exterior da bóia até à caixa de derivação OBO associada (ou mais próxima fora do reservatório)
      const oboBoxes = components.filter((b) => isJunctionBoxType(b.type) && !!panelPivots[b.id])
      const explicitBoxId = typeof fs.state.linkedJunctionBoxId === 'string' && fs.state.linkedJunctionBoxId ? fs.state.linkedJunctionBoxId : null
      let targetBox = explicitBoxId ? oboBoxes.find((b) => b.id === explicitBoxId) : null
      if (!targetBox && oboBoxes.length > 0) {
        let bestBoxDist = Infinity
        for (const b of oboBoxes) {
          const bp = panelPivots[b.id]
          const d = bp.distanceTo(panelPivots[fs.id])
          if (d < Math.max(tankR + 3.6, 5.2) && d < bestBoxDist) {
            bestBoxDist = d
            targetBox = b
          }
        }
      }
      let externalCableTarget: [number, number, number] | null = null
      if (targetBox) {
        const bp = panelPivots[targetBox.id]
        const bSz = JUNCTION_WAGO_SIZE_MM[targetBox.type as JunctionBoxType]
        // Alinhar exatamente com o bucim superior real (na OBO T60 o bucim esquerdo está em -W*0.24, nunca furar a parede entre bucins!)
        // Cada bóia entra pelo seu bucim superior (T60: alterna esquerdo/direito; A6/T25: bucim central).
        const boxCables = oboSpliceCables.get(targetBox.id) ?? []
        const glandOffsetX =
          targetBox.type === 'junctionBoxOboT60'
            ? (boxCables.length % 2 === 0 ? -1 : 1) * (bSz.x * PANEL_UNITS_PER_MM) * 0.24
            : 0
        boxCables.push({
          key: fs.id, glandX: glandOffsetX,
          conductors: [{ color: '#78350f', label: 'NA' }, { color: '#111827', label: 'C' }, { color: '#2563eb', label: 'NF' }],
        })
        oboSpliceCables.set(targetBox.id, boxCables)
        const boxTopY = bp.y + (bSz.y * PANEL_UNITS_PER_MM) * 0.62
        const fp = panelPivots[fs.id]
        externalCableTarget = [bp.x + glandOffsetX - fp.x, boxTopY - fp.y, bp.z - fp.z]
      }

      floatTankContexts[fs.id] = {
        tankRadius: tankR,
        tankHeight: tankH,
        waterLevelPct: Math.max(0, Math.min(100, Number(tank.state.levelPct ?? 0))),
        mountDepthPct,
        sideSign,
        externalCableTarget,
      }
    }
  }

  // Encaminhamento de cabos de campo editáveis (luminárias, sensores, torres de sinalização, contadores, bóias soltas)
  // diretamente para dentro da caixa de derivação OBO escolhida (`linkedJunctionBoxId`), com WAGO 221-2411 interiores!
  const fieldCableTargets = new Map<string, [number, number, number]>()
  const oboBoxesAll = components.filter((b) => isJunctionBoxType(b.type) && !!panelPivots[b.id])
  if (oboBoxesAll.length > 0) {
    for (const dev of components) {
      if (!isEditableCableDeviceType(dev.type) || dev.type === 'floatSwitch') continue
      const cableOn = dev.type === 'triProofLedBatten' ? dev.state.cableEnabled !== false : dev.state.cableEnabled === true
      if (!cableOn) continue
      const boxId = typeof dev.state.linkedJunctionBoxId === 'string' ? dev.state.linkedJunctionBoxId : ''
      if (!boxId || !panelPivots[dev.id]) continue
      const targetBox = oboBoxesAll.find((b) => b.id === boxId)
      if (!targetBox) continue
      const bp = panelPivots[targetBox.id]
      const dp = panelPivots[dev.id]
      const bSz = JUNCTION_WAGO_SIZE_MM[targetBox.type as JunctionBoxType]
      const boxCables = oboSpliceCables.get(targetBox.id) ?? []
      const glandOffsetX =
        targetBox.type === 'junctionBoxOboT60'
          ? (boxCables.length % 2 === 0 ? -1 : 1) * (bSz.x * PANEL_UNITS_PER_MM) * 0.24
          : 0
      boxCables.push({
        key: dev.id,
        glandX: glandOffsetX,
        conductors: editableCableConductorsOf(dev.type),
      })
      oboSpliceCables.set(targetBox.id, boxCables)
      const boxTopY = bp.y + (bSz.y * PANEL_UNITS_PER_MM) * 0.62
      // Converter o alvo mundial do bucim PG13.5 para o referencial local do equipamento (respeitando rotação 3D!)
      const worldDelta = new THREE.Vector3(bp.x + glandOffsetX - dp.x, boxTopY - dp.y, bp.z - dp.z)
      const [rx, ry, rz] = orientationRadians(componentOrientationOf(dev))
      const invQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')).invert()
      worldDelta.applyQuaternion(invQuat)
      fieldCableTargets.set(dev.id, [worldDelta.x, worldDelta.y, worldDelta.z])
    }
  }

  // Alojamento real de conectores WAGO 221 dentro da caixa de derivação OBO escolhida no Inspetor!
  const hostedWagosByBox = new Map<string, ElectricalComponent[]>()
  for (const w of components) {
    if (!isWagoConnectorType(w.type)) continue
    if (w.state.hostLocation === 'box' && typeof w.state.hostBoxId === 'string' && w.state.hostBoxId) {
      const box = components.find((b) => b.id === w.state.hostBoxId && isJunctionBoxType(b.type))
      if (box && panelPivots[box.id]) {
        const list = hostedWagosByBox.get(box.id) ?? []
        list.push(w)
        hostedWagosByBox.set(box.id, list)
      }
    }
  }
  for (const [boxId, list] of hostedWagosByBox.entries()) {
    const box = components.find((b) => b.id === boxId)
    const bp = panelPivots[boxId]
    if (!box || !bp) continue
    const bSz = JUNCTION_WAGO_SIZE_MM[box.type as JunctionBoxType]
    const bw = bSz.x * PANEL_UNITS_PER_MM
    const bh = bSz.y * PANEL_UNITS_PER_MM
    const bd = bSz.z * PANEL_UNITS_PER_MM
    list.forEach((w, idx) => {
      const total = list.length
      // Distribui automaticamente os conectores WAGO dentro da cavidade interior da caixa OBO
      const row = total <= 2 ? 0 : Math.floor(idx / 2)
      const col = total <= 2 ? idx : idx % 2
      const colsInRow = total <= 2 ? total : Math.min(2, total - row * 2)
      const rows = total <= 2 ? 1 : Math.ceil(total / 2)
      const ox = colsInRow === 1 ? 0 : (col - (colsInRow - 1) / 2) * Math.min(bw * 0.42, 0.56)
      const oy = rows === 1 ? 0 : ((rows - 1) / 2 - row) * Math.min(bh * 0.36, 0.44)
      const oz = -bd * 0.04
      // Com emendas de bóias na caixa, os WAGO do utilizador descem para o fundo e deixam livres as colunas das emendas.
      const spliceShift = oboSpliceCables.has(boxId) ? -bh * 0.3 - oy * 0.5 : 0
      panelPivots[w.id] = new THREE.Vector3(bp.x + ox, bp.y + oy + spliceShift, bp.z + oz)
    })
  }

  // Chapa e enquadramento derivados do conteúdo real.
  const sceneBounds = (() => {
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    const all = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
    for (const component of components) {
      const pivot = panelPivots[component.id]
      if (!pivot) continue
      const half = componentHalfExtents(component, orientationFor(component))
      all.minZ = Math.min(all.minZ, pivot.z - half.z); all.maxZ = Math.max(all.maxZ, pivot.z + half.z)
      // Interruptores/lâmpadas de parede (Odace, E27) NÃO expandem a chapa do quadro elétrico.
      // Caso contrário, um único interruptor colocado na parede lateral fazia o pavilhão inteiro
      // abrir de forma exagerada (contentMinX/maxX → leftWallX/rightWallX).
      const contributesToPlate = isPanelBound(component) && !isLightingType(component.type)
      const target = contributesToPlate ? [box, all] : [all]
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
  // Câmara de sombras à medida da cena (por omissão cobre só ±5 u): um quadro grande ficava meio sombreado.
  const shadowExtent = contentBounds
    ? Math.min(22, Math.max(6, Math.ceil(Math.max(Math.abs(contentBounds.minX), Math.abs(contentBounds.maxX), Math.abs(contentBounds.minY), Math.abs(contentBounds.maxY)) + 2.5)))
    : 6
  const sceneCenter: [number, number, number] = contentBounds
    ? [(contentBounds.minX + contentBounds.maxX) / 2, (contentBounds.minY + contentBounds.maxY) / 2, 0.3]
    : [0, 0, 0.3]
  const sceneWidth = contentBounds ? Math.max(3.5, contentBounds.maxX - contentBounds.minX + 1.2, (contentBounds.maxY - contentBounds.minY + 1.2) * 1.3) : 6
  const floorY = factoryMode ? factoryFloorY : (contentBounds?.minY ?? 0) - 0.35
  sceneCenterRef.current = sceneCenter

  // --- Edição direta no 3D: traduz X/Y do painel para o Esquema (com imã de calha) ---
  // —— Seleção mista (componentes + textos livres) e grupos de seleção (Ctrl+G), iguais no 2D frontal e no 3D.
  const selectionGroups = useSimStore((state) => state.selectionGroups)
  const viewTextIds = () => new Set(useSimStore.getState().canvasTexts.filter((t) => t.view === annotationView).map((t) => t.id))
  const mixedSelection = (): string[] => {
    const comps = useSimStore.getState().selectedComponentIds
    return [...comps, ...groupTextIds, ...(selectedTextId && !groupTextIds.includes(selectedTextId) ? [selectedTextId] : [])]
  }
  const applyMixedSelection = (ids: string[]) => {
    const store = useSimStore.getState()
    const compIds = new Set(store.components.map((c) => c.id))
    const texts = viewTextIds()
    store.selectComponents(ids.filter((id) => compIds.has(id) && !store.components.find((c) => c.id === id)?.locked))
    const textIds = ids.filter((id) => texts.has(id))
    setGroupTextIds(textIds.length + ids.filter((id) => compIds.has(id)).length >= 2 ? textIds : [])
    setSelectedTextId(textIds.length === 1 && ids.length === 1 ? textIds[0] : null)
  }
  const expandSel = (ids: string[]) => expandToGroups(selectionGroups, 'schematic', ids)
  const deleteMixedSelection = () => {
    const store = useSimStore.getState()
    const comps = store.selectedComponentIds.filter((id) => !store.components.find((item) => item.id === id)?.locked)
    const texts = [...groupTextIds, ...(selectedTextId ? [selectedTextId] : [])]
    if (comps.length) store.deleteComponents(comps)
    texts.forEach((id, i) => store.removeCanvasText(id, i === 0 && !comps.length))
    setGroupTextIds([]); setSelectedTextId(null)
  }
  /** Arrasto em conjunto (componentes + textos) com deslocamento X/Y e profundidade Z para equipamentos livres 3D. */
  const groupDragLast = useRef<{ dx: number; dy: number; dz: number } | null>(null)
  const groupDrag = useRef<{ comps: Record<string, { x: number; y: number; z: number }>; texts: Record<string, { x: number; y: number }> } | null>(null)
  const beginGroupDrag = (compIds: string[], textIds: string[]) => {
    const store = useSimStore.getState()
    const comps: Record<string, { x: number; y: number; z: number }> = {}
    for (const id of compIds) { beginPanelDrag(id); const pivot = panelPivots[id]; if (pivot) comps[id] = { x: pivot.x, y: pivot.y, z: pivot.z } }
    if (!compIds.length) store.commitHistory()
    const texts: Record<string, { x: number; y: number }> = {}
    for (const t of store.canvasTexts) if (textIds.includes(t.id)) texts[t.id] = { x: t.x, y: t.y }
    groupDrag.current = { comps, texts }
  }
  const moveGroupDrag = (dx: number, dy: number, dz = 0) => {
    const g = groupDrag.current
    if (!g) return
    for (const [id, o] of Object.entries(g.comps)) dragPanelTo(id, { x: o.x + dx, y: o.y + dy, z: dz !== 0 ? o.z + dz : undefined })
    setGroupTextOffset(Object.keys(g.texts).length ? { dx, dy } : null)
  }
  const endGroupDrag = (moved: boolean, dx: number, dy: number) => {
    const g = groupDrag.current
    groupDrag.current = null
    setGroupTextOffset(null)
    if (!g) return
    for (const id of Object.keys(g.comps)) endPanelDrag(id)
    if (moved) for (const [id, o] of Object.entries(g.texts)) useSimStore.getState().updateCanvasText(id, { x: o.x + dx, y: o.y + dy })
  }
  const textGroup: TextGroupHandlers = {
    ids: groupTextIds,
    offset: groupTextOffset,
    onDown: (item, event) => {
      if (demoMode || simLocked || tool !== 'select') return 'none'
      if (event.ctrlKey || event.metaKey || event.shiftKey) { applyMixedSelection(toggleInSelection(selectionGroups, 'schematic', mixedSelection(), item.id)); return 'handled' }
      const current = mixedSelection()
      const members = current.includes(item.id) && current.length > 1 ? current : expandSel([item.id])
      if (members.length < 2) return 'none'
      applyMixedSelection(members)
      const compIds = new Set(useSimStore.getState().components.map((c) => c.id))
      beginGroupDrag(members.filter((id) => compIds.has(id)), members.filter((id) => !compIds.has(id)))
      return 'drag'
    },
    onMove: moveGroupDrag,
    onEnd: endGroupDrag,
  }
  const beginPanelDrag = (id: string) => {
    const store = useSimStore.getState()
    store.commitHistory()
    // Durante o arrasto o equipamento larga a calha; o imã volta a fixá-lo ao largar.
    useSimStore.setState((state) => ({
      components: state.components.map((item) => (item.id === id && item.railId ? { ...item, railId: undefined, railOffsetMm: undefined } : item)),
    }))
  }
  const dragPanelTo = (id: string, point: { x: number; y: number; z?: number }) => {
    const store = useSimStore.getState()
    const component = store.components.find((item) => item.id === id)
    if (!component) return
    const free3D = !isPanelBound(component)
    let targetPt = { x: point.x, y: point.y }
    // Encaixe magnético fácil para paredes, pilares e esteiras porta-cabos (soltar e encaixar borda-a-borda!)
    if (isStructureComponentType(component.type)) {
      const snapped = snapStructureDragXY(component, point, store.components, panelPivots)
      targetPt = { x: snapped.x, y: snapped.y }
    }
    if (free3D) {
      const currentPivot = panelPivots[id]
      const half = componentHalfExtents(component, orientationFor(component))
      const rawZ = typeof point.z === 'number'
        ? point.z
        : (component.panel3DPosition?.z ?? currentPivot?.z ?? frontPivot(component)[2])
      // Nunca atravessar a parede traseira do pavilhão; mas pode afastar-se livremente para a frente (+Z)!
      const minZ = factoryMode && !store.allowOutsideFactory ? factoryWallFrontZ + half.z + 0.14 : -48
      const clampedZ = Math.max(minZ, rawZ)
      const floorLocked = factoryMode && isFloorStandingComponent(component)
      const rawY = floorLocked && !store.allowOutsideFactory
        ? factoryFloorY + half.y
        : targetPt.y
      // Prevenção de colisões entre equipamentos sólidos (ex.: reservatórios) em QUALQUER modo + limites do pavilhão fabril
      let finalPos = { x: targetPt.x, y: rawY, z: clampedZ }
      {
        const obstacles: SolidObstacle3D[] = []
        for (const other of store.components) {
          if (other.id === id || !isSolidCollisionComponentType(other.type)) continue
          const op = other.panel3DPosition ?? panelPivots[other.id]
          if (!op) continue
          const oh = componentHalfExtents(other, orientationFor(other))
          obstacles.push({
            id: other.id,
            type: other.type,
            center: { x: op.x, y: op.y, z: op.z },
            size: { x: oh.x * 2, y: oh.y * 2, z: oh.z * 2 },
          })
        }
        finalPos = resolveFactoryPlacement3D({
          movingId: id,
          movingType: component.type,
          candidate: finalPos,
          movingSize: { x: half.x * 2, y: half.y * 2, z: half.z * 2 },
          obstacles,
          bounds: factoryRoomBounds,
          allowOutside: !factoryMode || store.allowOutsideFactory,
          floorLocked,
        })
        if (floorLocked && !store.allowOutsideFactory) {
          finalPos.y = factoryFloorY + half.y
        }
      }
      targetPt = { x: finalPos.x, y: finalPos.y }
      // Caixa de derivação: encaixa no suporte de um reservatório quando chega perto da placa; solta ao afastar.
      if (isJunctionBoxType(component.type)) {
        const mountedOn = typeof component.state.tankBracketId === 'string' ? component.state.tankBracketId : ''
        let nearest: { id: string; d: number } | null = null
        for (const tank of store.components) {
          if (tank.type !== 'waterTank' || !tankHasJunctionBracket(tank.state)) continue
          const tp = panelPivots[tank.id]
          if (!tp) continue
          const { plate } = tankJunctionBracketOf(tank.state, PANEL_UNITS_PER_MM)
          const d = Math.hypot(finalPos.x - (tp.x + plate.x), finalPos.y - (tp.y + plate.y))
          const taken = store.components.some((b) => b.id !== id && b.state.tankBracketId === tank.id)
          if (!taken && d < 0.9 && (!nearest || d < nearest.d)) nearest = { id: tank.id, d }
        }
        if (mountedOn && (!nearest || nearest.id !== mountedOn)) store.setComponentState(id, { tankBracketId: '' })
        else if (!mountedOn && nearest) store.setComponentState(id, { tankBracketId: nearest.id })
      }
      // Se o utilizador arrastar uma bóia instalada para longe do reservatório, solta-a suavemente
      if (component.type === 'floatSwitch' && component.state.linkedTankId) {
        const linked = store.components.find((c) => c.id === component.state.linkedTankId)
        const tp = linked ? panelPivots[linked.id] : null
        if (linked && tp) {
          const td = waterTankDimensionsOf(linked.state)
          const tankR = (td.diameterMm / 2) * PANEL_UNITS_PER_MM
          if (Math.hypot(finalPos.x - tp.x, finalPos.z - tp.z) > tankR + 1.8) {
            store.setComponentState(id, { linkedTankId: '', detachedFromTank: true })
          }
        }
      }
      store.updateComponent(id, {
        panel3DPosition: { x: finalPos.x, y: finalPos.y, z: finalPos.z },
      })
    }
    // Durante o arrasto o equipamento acompanha o ponteiro livremente (passando por cima de calhas DIN/técnicas e para fora de quadros);
    // o imã da calha atua apenas ao largar em `endPanelDrag`.
    const drop = dropOnSchematic(component, targetPt, [])
    // Edição frontal: o componente alinha à grelha por pontos do projeto (a calha continua a ter prioridade no fim do arrasto).
    const g = store.grid
    const step = frontEdit && g.enabled && g.snap && g.size > 0 ? g.size : 0
    const snapTo = (value: number) => step ? Math.round(value / step) * step : value
    store.moveComponent(id, snapTo(drop.schematicX), snapTo(drop.schematicY))
  }
  const endPanelDrag = (id: string) => {
    const store = useSimStore.getState()
    const comp = store.components.find((c) => c.id === id)
    // Se largar uma bóia perto de um reservatório, encaixa-a automaticamente DENTRO dele!
    if (comp && comp.type === 'floatSwitch') {
      const fp = comp.panel3DPosition ?? panelPivots[id]
      if (fp) {
        let bestTank: ElectricalComponent | null = null
        let bestDist = Infinity
        for (const tk of store.components) {
          if (tk.type !== 'waterTank') continue
          const tp = tk.panel3DPosition ?? panelPivots[tk.id]
          if (!tp) continue
          const td = waterTankDimensionsOf(tk.state)
          const tankR = (td.diameterMm / 2) * PANEL_UNITS_PER_MM
          const d = Math.hypot(fp.x - tp.x, fp.z - tp.z)
          if (d <= tankR + 1.6 && d < bestDist) {
            bestDist = d
            bestTank = tk
          }
        }
        if (bestTank) {
          store.setComponentState(id, { linkedTankId: bestTank.id, autoCoupleTank: true, detachedFromTank: false })
        }
      }
    }
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
  // Alinhar/distribuir a seleção (componentes e textos) no plano do painel — Y cresce para cima.
  const cameraRelay = useRef<{ camera: THREE.Camera; el: HTMLElement } | null>(null)
  /** Caixa de um texto HTML no plano do painel: projeta a âncora e converte os píxeis do texto em unidades. */
  const textPanelBox = (id: string, x: number, y: number, z: number): AlignBox | null => {
    const relay = cameraRelay.current
    const el = relay?.el.parentElement?.parentElement?.querySelector(`[data-ctext="${CSS.escape(id)}"]`) ?? document.querySelector(`[data-ctext="${CSS.escape(id)}"]`)
    if (!relay || !el) return null
    const canvas = relay.el.getBoundingClientRect()
    const toScreen = (vx: number, vy: number) => {
      const p = new THREE.Vector3(vx, vy, z).project(relay.camera)
      return { x: canvas.left + (p.x + 1) / 2 * canvas.width, y: canvas.top + (1 - p.y) / 2 * canvas.height }
    }
    const anchor = toScreen(x, y)
    const ppuX = Math.abs(toScreen(x + 1, y).x - anchor.x)
    const ppuY = Math.abs(toScreen(x, y + 1).y - anchor.y)
    if (!ppuX || !ppuY) return null
    const r = el.getBoundingClientRect()
    return { id, x0: x + (r.left - anchor.x) / ppuX, x1: x + (r.right - anchor.x) / ppuX, y0: y + (anchor.y - r.bottom) / ppuY, y1: y + (anchor.y - r.top) / ppuY }
  }
  useAlignAction('schematic', (action) => {
    if (simLocked || demoMode) return
    const store = useSimStore.getState()
    const boxes: AlignBox[] = []
    for (const id of mixedSelection()) {
      const component = store.components.find((c) => c.id === id)
      if (component) {
        const pivot = panelPivots[id]
        if (!pivot || component.locked) continue
        const half = componentHalfExtents(component, orientationFor(component))
        boxes.push({ id, x0: pivot.x - half.x, x1: pivot.x + half.x, y0: pivot.y - half.y, y1: pivot.y + half.y })
        continue
      }
      const text = store.canvasTexts.find((t) => t.id === id && t.view === annotationView)
      const box = text ? textPanelBox(id, text.x, text.y, text.z ?? textPlaneZ) : null
      if (box) boxes.push(box)
    }
    const offsets = alignOffsets(boxes, action, true)
    store.pushEvent('info', alignMessage(action, boxes.length, offsets.size))
    if (!offsets.size) return
    store.commitHistory()
    const compIds = [...offsets.keys()].filter((id) => store.components.some((c) => c.id === id))
    if (compIds.length) {
      // Como no arrasto: larga a calha, move e deixa o imã voltar a fixar no fim.
      useSimStore.setState((state) => ({ components: state.components.map((item) => (compIds.includes(item.id) && item.railId ? { ...item, railId: undefined, railOffsetMm: undefined } : item)) }))
      for (const id of compIds) { const p = panelPivots[id]; const d = offsets.get(id)!; dragPanelTo(id, { x: p.x + d.dx, y: p.y + d.dy }) }
      if (store.grid.railMagnet !== false) store.snapToRails(compIds, false)
      store.step()
    }
    for (const t of store.canvasTexts) { const d = offsets.get(t.id); if (d) store.updateCanvasText(t.id, { x: t.x + d.dx, y: t.y + d.dy }) }
  })
  const activateComponent = (component: ElectricalComponent, action: () => void) => {
    const currentTool = useSimStore.getState().tool
    if (currentTool === 'erase') { if (!simLocked) removePanelComponent(component.id); return }
    if (currentTool !== 'select') return
    if (component.locked) return
    if (canActuate) {
      // Botões, cogumelo, START/STOP: só em RUN/PAUSA (regra global em store/manobra).
      action()
    }
    // Em STOP o aparelho clicado fica selecionado (Inspetor). Em RUN/PAUSA só atua: não se seleciona nem se move.
    if (!demoMode && !simLocked) selectComponents([component.id], useSimStore.getState().multiSelectMode)
  }
  // Projeção REAL (mm, centrada no quadro) dos aparelhos de chapa/calha dentro de um quadro:
  // alimenta os obturadores automáticos da sobretampa (não tapam aparelhos).
  const enclosureCoverOccupants = (enclosure: ElectricalComponent) => {
    const center = panelPivots[enclosure.id]
    if (!center) return []
    const dims = enclosureDimsOf(enclosure.state)
    const halfW = dims.widthMm / 2, halfH = dims.heightMm / 2
    const occupants: Array<{ xMm: number; yMm: number; widthMm: number; heightMm: number }> = []
    for (const component of components) {
      if (component.id === enclosure.id || isPanelAccessoryType(component.type) || isMountingRail(component.type) || !isPanelBound(component)) continue
      const face = component.panelMount?.face
      if (face && face !== 'inside') continue
      const pivot = panelPivots[component.id]
      if (!pivot) continue
      const half = componentHalfExtents(component, baseOrientationFor(component))
      const xMm = (pivot.x - center.x) / PANEL_UNITS_PER_MM, yMm = (pivot.y - center.y) / PANEL_UNITS_PER_MM
      if (Math.abs(xMm) > halfW || Math.abs(yMm) > halfH) continue
      occupants.push({ xMm, yMm, widthMm: (2 * half.x) / PANEL_UNITS_PER_MM, heightMm: (2 * half.y) / PANEL_UNITS_PER_MM })
    }
    return occupants
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
      free3D={!isPanelBound(component) && (factoryMode || !frontEdit)}
      preferFloorXZ={factoryMode || isFloorMountedMachineType(component.type) || isFloorGroundedStructureType(component.type)}
      connectionMode={editMode === 'connect' || tool === 'probe' || reconnect !== null}
      connectionMedium={connectionMedium}
      probing={tool === 'probe'}
      connectionStartId={tool === 'probe' ? probeA : draft && 'terminalId' in draft.from ? draft.from.terminalId : null}
      onSelect={(additive) => {
        // DC-ADR-071: em RUN/PAUSA nada se seleciona nem apaga; os botões atuam pelo próprio `onPress`.
        if (simLocked) return
        if (tool === 'erase') { removePanelComponent(component.id); return }
        if (tool !== 'select') return
        if (demoMode) return
        // Ctrl/Shift + clique: liga/desliga o componente (e o seu grupo) na seleção, que pode ter textos livres.
        if (additive) { applyMixedSelection(toggleInSelection(selectionGroups, 'schematic', mixedSelection(), component.id)); return }
        // Clique simples: seleciona o grupo (Ctrl+G) ou mantém a multi-seleção de que o componente faz parte.
        const current = mixedSelection()
        if (current.includes(component.id) && current.length > 1) return
        applyMixedSelection(expandSel([component.id]))
      }}
      onMove={(position) => movePanelComponent(component, position)}
      onDragStart={() => {
        // O grupo do componente (Ctrl+G) ou a multi-seleção de que faz parte move-se inteiro, com os textos.
        const current = mixedSelection()
        const members = current.includes(component.id) && current.length > 1 ? current : expandSel([component.id])
        if (members.length > 1 && !(current.includes(component.id) && current.length > 1)) applyMixedSelection(members)
        const compIds = new Set(useSimStore.getState().components.map((c) => c.id))
        const comps = members.filter((id) => compIds.has(id) && !useSimStore.getState().components.find((c) => c.id === id)?.locked)
        beginGroupDrag(comps.length ? comps : [component.id], members.filter((id) => !compIds.has(id)))
        const pivot = panelPivots[component.id]
        multiDragOrigins.current = pivot ? { [component.id]: { x: pivot.x, y: pivot.y, z: pivot.z } } : {}
      }}
      onDragTo={(point) => {
        const origin = multiDragOrigins.current[component.id]
        if (!origin) { dragPanelTo(component.id, point); return }
        const dz = typeof point.z === 'number' ? point.z - origin.z : 0
        moveGroupDrag(point.x - origin.x, point.y - origin.y, dz)
        groupDragLast.current = { dx: point.x - origin.x, dy: point.y - origin.y, dz }
      }}
      onDragEnd={() => {
        const last = groupDragLast.current
        groupDragLast.current = null
        endGroupDrag(!!last, last?.dx ?? 0, last?.dy ?? 0)
        multiDragOrigins.current = {}
      }}
      onTerminalPick={pickConnectionTerminal}
    >{content}</OrientedInstance>
  }
  const selectedWire = selectedWireId ? wires.find((wire) => wire.id === selectedWireId) : undefined
  const reconnectKind = reconnect ? wires.find((wire) => wire.id === reconnect.wireId)?.kind : undefined
  const connectionMedium: ConduitMedium = reconnect
    ? reconnectKind === 'hydraulic' ? 'hydraulic' : reconnectKind === 'pneumatic' ? 'pneumatic' : 'electrical'
    : wireDefaults.medium ?? 'electrical'
  useEffect(() => {
    wireEditBaselineRef.current = selectedWire ? { id: selectedWire.id, wire: structuredClone(selectedWire) } : null
    setWireEditDirty(false)
    if (selectedWire?.locked) { setMoveAllWire(false); setActiveWaypointIndex(null); setActiveEnd(null); setReconnect(null) }
  }, [selectedWire?.id, selectedWire?.locked])
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
    const isFree3D = selected.length > 0 && selected.every((c) => c.type === 'motor3ph' || !isPanelBound(c))
    const view: PanelCameraView = isFree3D ? 'isometric' : 'front'
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
    const mounted = components.map(c => doorMountedComponent(c, components))
    const from = wireEndpoint3D(wire, 'from', mounted, panelPivots, wires)
    const to = wireEndpoint3D(wire, 'to', mounted, panelPivots, wires)
    return from && to ? { from, to } : null
  }
  const selectedWirePath = (() => {
    if (!selectedWire) return null
    const ends = wireEnds(selectedWire)
    return ends ? buildWirePath3D(selectedWire, ends.from, ends.to, componentObstacles(components, panelPivots)) : null
  })()
  const selectedWireOuterMm = selectedWire
    ? cableOuterDiameterMm(selectedWire.gauge, { conductorCount: selectedWire.conductorCount, sheathed: selectedWire.sheathed })
    : 2.8
  const selectedWireMetrics = selectedWire && selectedWirePath
    ? wireCurveMetrics3D(selectedWirePath, selectedWireOuterMm, {
        multicoreOrRigid: (selectedWire.conductorCount ?? 1) > 1 || !!selectedWire.sheathed || selectedWire.flexibility === 'rigid',
      })
    : null
  const addWireWaypoint = () => {
    if (!selectedWire || selectedWire.locked) return
    const ends = wireEnds(selectedWire)
    if (!ends) return
    const current = selectedWire.waypoints3D ?? []
    const obstacles = componentObstacles(components, panelPivots)
    const path = selectedWirePath ?? buildWirePath3D(selectedWire, ends.from, ends.to, obstacles)
    if (current.length === 0 && path.points.length >= 2) {
      const point = sampleCurveInsertPoint3D(path, selectedWireOuterMm)
      insertWireWaypoint(selectedWire.id, 0, point)
      return
    }
    const chain = [ends.from.position, ...current.map(fromSpatial), ends.to.position]
    let longest = 0
    let longestLength = -1
    for (let i = 0; i < chain.length - 1; i += 1) {
      const length = Math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1], chain[i + 1][2] - chain[i][2])
      if (length > longestLength) { longestLength = length; longest = i }
    }
    const a = chain[longest]
    const b = chain[longest + 1]
    const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
    const onCurve = path.points.length >= 2 ? closestPointOnPolyline(path.points, mid) : mid
    insertWireWaypoint(selectedWire.id, longest, toSpatial(onCurve))
  }
  const insertWireWaypoint = (wireId: string, index: number, point: SpatialPoint3D) => {
    const wire = useSimStore.getState().wires.find((candidate) => candidate.id === wireId)
    if (!wire || wire.locked) return
    const next = [...(wire.waypoints3D ?? [])]
    const clamped = Math.max(0, Math.min(index, next.length))
    next.splice(clamped, 0, {
      x: Math.round(point.x * 1000) / 1000,
      y: Math.round(point.y * 1000) / 1000,
      z: Math.round(point.z * 1000) / 1000,
    })
    // Preserva o modo de traçado escolhido (ortogonal/manhattan/curvo/direto) sem distorcer o 2D.
    beginWireEdit(wire).updateWire(wireId, { waypoints3D: next })
    useSimStore.getState().selectWire(wireId)
    setMoveAllWire(false)
    setActiveEnd(null)
    setActiveWaypointIndex(Math.max(0, Math.min(clamped, next.length - 1)))
  }
  const orthogonalizeSelectedWire3D = () => {
    if (!selectedWire || selectedWire.locked || !selectedWire.waypoints3D?.length) return
    const ends = wireEnds(selectedWire)
    if (!ends) return
    const obstacles = componentObstacles(components, panelPivots)
    const aligned = orthogonalizeWaypoints3D(ends.from.position, selectedWire.waypoints3D, ends.to.position, selectedWireOuterMm, obstacles)
    beginWireEdit(selectedWire).updateWire(selectedWire.id, {
      waypoints3D: aligned.length ? aligned : undefined,
      route: selectedWire.route === 'arc' || selectedWire.route === 'direct' ? 'orthogonal' : selectedWire.route,
    })
    setActiveWaypointIndex(null)
    useSimStore.getState().pushEvent('info', `Curva 3D de ${selectedWire.number || 'cabo'} alinhada a 90°.`)
  }
  const simplifySelectedWire3D = () => {
    if (!selectedWire || selectedWire.locked || !selectedWire.waypoints3D?.length) return
    const ends = wireEnds(selectedWire)
    if (!ends) return
    const before = selectedWire.waypoints3D.length
    const clean = simplifyWaypoints3D(ends.from.position, selectedWire.waypoints3D, ends.to.position, 0.035)
    beginWireEdit(selectedWire).updateWire(selectedWire.id, { waypoints3D: clean.length ? clean : undefined })
    setActiveWaypointIndex(null)
    useSimStore.getState().pushEvent('info', `Curva 3D simplificada (${before} → ${clean.length} ponto${clean.length === 1 ? '' : 's'}).`)
  }
  const resetSelectedWireAuto3D = () => {
    if (!selectedWire || selectedWire.locked || !selectedWire.waypoints3D?.length) return
    beginWireEdit(selectedWire).updateWire(selectedWire.id, { waypoints3D: undefined })
    setActiveWaypointIndex(null)
    useSimStore.getState().pushEvent('info', `Percurso 3D automático reposto em ${selectedWire.number || 'cabo'}.`)
  }
  const updateWaypointAxisMm = (index: number, axis: 'x' | 'y' | 'z', valueMm: number) => {
    if (!selectedWire || selectedWire.locked || !Number.isFinite(valueMm)) return
    const current = selectedWire.waypoints3D ?? []
    if (!current[index]) return
    const next = current.map((p, i) => (i === index ? { ...p, [axis]: Math.round(valueMm * PANEL_UNITS_PER_MM * 1000) / 1000 } : p))
    beginWireEdit(selectedWire).updateWire(selectedWire.id, { waypoints3D: next })
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

  /** Bornes disponíveis para o desenho/ligação de cabos no 3D (posição física real + classe elétrica). */
  const drawTerminals: DrawTerminal[] = components.flatMap((component) => {
    const pivot = panelPivots[component.id]
    if (!pivot) return []
    const mounted = doorMountedComponent(component, components)
    return component.terminals.map((terminal) => {
      const world = terminalWorld3D(mounted, terminal, pivot)
      return {
        id: terminal.id,
        position: [world.x, world.y, world.z] as V3,
        label: terminal.label,
        ref: component.ref,
        color: terminal.color,
        kind: terminal.kind,
        electricalClass: terminalElectricalClassOf(component, terminal),
      }
    })
  })
  const draftStart = (from: WireDraft['from']) => setDraft({ from, points: [] })
  const draftAddPoint = (point: V3) => setDraft((current) => current ? { ...current, points: [...current.points, point] } : current)
  const draftFinish = (to: { terminalId: string } | { point: V3 }, opts?: { chain?: boolean }) => {
    const current = draftRef.current
    if (!current) return
    const lastIsEnd = 'point' in to && current.points.length && current.points[current.points.length - 1] === to.point
    const waypoints = (lastIsEnd ? current.points.slice(0, -1) : current.points).map(toSpatial)
    const from = 'terminalId' in current.from ? current.from : { point: toSpatial(current.from.point) }
    const end = 'terminalId' in to ? to : { point: toSpatial(to.point) }
    const store = useSimStore.getState()
    const id = store.addWire3D(from, end, waypoints)
    const continueChain = 'terminalId' in to && (!!opts?.chain || !!store.wireDefaults.chainMode)
    if (continueChain) {
      setDraft({ from: { terminalId: to.terminalId }, points: [] })
    } else {
      setDraft(null)
      if (id) store.selectWire(id)
    }
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
  const sceneBackground = factoryMode ? '#eef3f8' : backgroundMode === 'white' ? '#ffffff' : palette.background
  const stageStyle = factoryMode
    ? { background: 'linear-gradient(180deg, #e6edf6 0%, #f4f7fb 100%)' }
    : backgroundMode === 'white'
      ? { background: '#ffffff' }
      : editorGridBackground({ enabled: showGrid && gridSettings.enabled, style: gridSettings.style,
          spacing: gridSettings.size, dark: backgroundMode === 'dark' })

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
      const locked = store.selectedComponentIds.some((id) => store.components.find((item) => item.id === id)?.locked)
      deleteMixedSelection()
      if (locked) store.pushEvent('warning', 'Os componentes bloqueados foram mantidos.')
    },
    selectAll: () => {
      const store = useSimStore.getState()
      applyMixedSelection([...store.components.filter((c) => !c.locked).map((c) => c.id), ...store.canvasTexts.filter((t) => t.view === annotationView).map((t) => t.id)])
    },
    duplicate: () => { const ids = useSimStore.getState().selectedComponentIds; if (ids.length) useSimStore.getState().duplicateComponents(ids) },
    nudge: (dirX, dirY, big) => {
      const grid = useSimStore.getState().grid
      const step = big ? (grid?.size ?? 10) : 1
      // Mesmo modelo do Esquema 2D: schematicX/Y e o 3D acompanham.
      useSimStore.getState().nudgeSelection(dirX * step, dirY * step)
    },
    group: () => {
      const ids = mixedSelection()
      const store = useSimStore.getState()
      store.pushEvent('info', store.groupItems('schematic', ids) ? `Agrupados ${expandSel(ids).length} elementos · Ctrl+Shift+G desagrupa` : 'Selecione pelo menos dois elementos para agrupar')
    },
    ungroup: () => {
      const store = useSimStore.getState()
      store.pushEvent('info', store.ungroupItems('schematic', mixedSelection()) ? 'Grupo desfeito' : 'A seleção não tem grupos')
    },
    copy: () => useSimStore.getState().copySelection(),
    paste: () => useSimStore.getState().pasteClipboard(),
    help: () => setShortcutHelpOpen((open) => !open),
  }, { enabled: !shortcutHelpOpen && !demoMode })

   return (
     <div
       ref={stageRef}
       id={stageId}
       className={`panel3d-stage has-canvas-scrollbars relative w-full h-full ${stageBackground}`}
       style={stageStyle}
       data-embedded-in-schematic="true"
       data-front-edit={frontEdit ? 'true' : 'false'}
       data-edit-mode={editMode}
       data-grid-drag={gridDragEnabled ? 'true' : 'false'}
       data-placing={placingText ? 'text' : placingType ? 'component' : 'none'}
       data-sim-locked={simLocked ? 'true' : 'false'}
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
       onPointerDown={(e) => {
         // Shift + arrastar no fundo: seleção por retângulo (sem interferir com órbita normal).
         if (demoMode || simLocked || tool !== 'select' || e.button !== 0 || !e.shiftKey) return
         if ((e.target as HTMLElement).closest('canvas') === null) return
         marqueeDrag.current = { x0: e.clientX, y0: e.clientY, additive: e.ctrlKey || e.metaKey }
         setMarquee3d({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY })
         ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
       }}
       onPointerMove={(e) => {
         if (!marqueeDrag.current) return
         setMarquee3d({ x0: marqueeDrag.current.x0, y0: marqueeDrag.current.y0, x1: e.clientX, y1: e.clientY })
       }}
       onPointerUp={(e) => {
         const drag = marqueeDrag.current
         if (!drag) return
         marqueeDrag.current = null
         const x0 = Math.min(drag.x0, e.clientX), x1 = Math.max(drag.x0, e.clientX)
         const y0 = Math.min(drag.y0, e.clientY), y1 = Math.max(drag.y0, e.clientY)
         setMarquee3d(null)
         const cam = cameraProjectRef.current
         const stage = stageRef.current
         if (!cam || !stage || x1 - x0 < 6 || y1 - y0 < 6) return
         const rect = stage.getBoundingClientRect()
         const hits: string[] = []
         for (const component of components) {
           const pivot = panelPivots[component.id]
           if (!pivot) continue
           const v = pivot.clone().project(cam)
           if (v.z < -1 || v.z > 1) continue
           const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width
           const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height
           if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) hits.push(component.id)
         }
         for (const t of useSimStore.getState().canvasTexts) {
           if (t.view !== annotationView) continue
           const v = new THREE.Vector3(t.x, t.y, t.z ?? textPlaneZ).project(cam)
           if (v.z < -1 || v.z > 1) continue
           const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width
           const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height
           if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) hits.push(t.id)
         }
         const found = expandSel(hits)
         if (found.length) applyMixedSelection(drag.additive ? [...new Set([...mixedSelection(), ...found])] : found)
         else if (!drag.additive) applyMixedSelection([])
       }}
     >
      {marquee3d && (
        <div
          className="panel3d-marquee-rect"
          style={{
            position: 'fixed',
            left: Math.min(marquee3d.x0, marquee3d.x1),
            top: Math.min(marquee3d.y0, marquee3d.y1),
            width: Math.abs(marquee3d.x1 - marquee3d.x0),
            height: Math.abs(marquee3d.y1 - marquee3d.y0),
            border: '1.5px dashed #2563eb',
            background: 'rgba(37, 99, 235, 0.12)',
            pointerEvents: 'none',
            zIndex: 40,
          }}
        />
      )}
      {!demoMode && (
        <div className="panel3d-env-switch" role="radiogroup" aria-label="Ambiente da vista 3D">
          <button
            type="button"
            role="radio"
            aria-checked={!factoryMode}
            className={!factoryMode ? 'is-active' : ''}
            onClick={() => selectEnvironment('canvas')}
            title="Vista técnica limpa com grelha de edição"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <path d="M2 6h12M2 10h12M6 2v12M10 2v12" opacity="0.65" />
            </svg>
            <span>Canvas normal</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={factoryMode}
            className={factoryMode ? 'is-active' : ''}
            onClick={() => selectEnvironment('factory')}
            title="Nave industrial 3D com o quadro fixo na parede"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
              <path d="M1.5 14V7.2l4 2.2V7.2l4 2.2V3.5h5V14H1.5Z" />
              <path d="M11 6h1.6M11 8.5h1.6M5 11.5h2" />
            </svg>
            <span>Ambiente fabril</span>
          </button>
        </div>
      )}
      <ViewCube
          yaw={cameraStats.yaw}
          pitch={cameraStats.pitch}
          onPick={pickCubeView}
          onAngles={pickCubeAngles}
          onOrbit={orbitCamera}
          note={cubeNote}
          placement="top"
        />
      {!demoMode && !simLocked && (editMode === 'connect' || reconnect !== null) && wireDraftSlot && createPortal(
        <WireDraftSideCard
          draft={draft}
          originLabel={draft
            ? ('terminalId' in draft.from
                ? (() => {
                    const tid = (draft.from as { terminalId: string }).terminalId
                    const t = drawTerminals.find((item) => item.id === tid)
                    return t ? `${t.ref}.${t.label}` : 'Borne'
                  })()
                : 'Ponta livre')
            : ''}
          reconnectingLabel={reconnect ? `ponta ${reconnect.end === 'from' ? 'A' : 'B'}` : null}
          onUndoPoint={draftUndoPoint}
          onFinishFree={draftFinishFree}
          onCancel={() => { setDraft(null); setReconnect(null) }}
        />,
        wireDraftSlot,
      )}
      {selectedWire && !demoMode && wireActionSlot && createPortal(<div className="panel3d-wire-actions-panel" role="region" aria-label="Traçado do cabo no esquema 3D">
        <div className="panel3d-wire-actions-head">
          <strong>Curva 3D</strong>
          <span className={`panel3d-wire-badge ${selectedWireMetrics && !selectedWireMetrics.bendOk ? 'is-warn' : ''}`}
            title={selectedWireMetrics ? `Raio mínimo recomendado (IEC 60204-1): ${selectedWireMetrics.recommendedMinRadiusMm} mm` : undefined}>
            {selectedWireMetrics
              ? selectedWireMetrics.minBendRadiusMm !== null
                ? `Rmín ${selectedWireMetrics.minBendRadiusMm} mm${selectedWireMetrics.bendOk ? '' : ' !'}`
                : 'Reto'
              : '—'}
          </span>
          <i className={wireEditDirty ? 'is-dirty' : ''}>{wireEditDirty ? 'Alterado' : (selectedWire.waypoints3D?.length ? `${selectedWire.waypoints3D.length} pt` : 'Auto')}</i>
          <small>
            {selectedWirePath ? `≈ ${wireLengthMm(selectedWirePath)} mm` : '—'}
            {selectedWireMetrics ? ` · ${selectedWireMetrics.bendCount} ${selectedWireMetrics.bendCount === 1 ? 'dobra' : 'dobras'}` : ''}
            {` · Ø ${selectedWireOuterMm.toFixed(1)} mm`}
          </small>
        </div>
        <div className="panel3d-wire-actions">
          <button type="button" disabled={!!selectedWire.locked || simLocked} onClick={addWireWaypoint} title="Insere um ponto de curva no troço mais longo (também: duplo clique no cabo)"><IconPlus size={11} />Ponto</button>
          <button type="button" disabled={!!selectedWire.locked || simLocked || activeWaypointIndex === null} onClick={removeWireWaypoint} title="Remove o ponto ativo (Delete ou duplo clique na esfera)"><IconDelete size={11} />Remover</button>
          {(selectedWire.waypoints3D?.length ?? 0) > 0 && <>
            <button type="button" disabled={!!selectedWire.locked || simLocked} onClick={orthogonalizeSelectedWire3D} title="Alinha os troços da curva 3D a 90° nos eixos X/Y/Z">Alinhar 90°</button>
            {(selectedWire.waypoints3D?.length ?? 0) >= 2 && (
              <button type="button" disabled={!!selectedWire.locked || simLocked} onClick={simplifySelectedWire3D} title="Remove pontos de curva colineares ou redundantes">Simplificar</button>
            )}
            <button type="button" disabled={!!selectedWire.locked || simLocked} onClick={resetSelectedWireAuto3D} title="Remove pontos manuais e repõe o encaminhamento automático 3D">Auto 3D</button>
          </>}
          <button type="button" disabled={!!selectedWire.locked || simLocked} className={moveAllWire ? 'is-active' : ''} aria-pressed={moveAllWire} onClick={() => { setMoveAllWire((value) => !value); setActiveWaypointIndex(null); setActiveEnd(null) }} title="Desloca o cabo inteiro com o manipulador 3D"><IconMove size={11} />Mover cabo</button>
        </div>
        <div className="panel3d-wire-ends-row" role="group" aria-label="Religar ou soltar pontas no 3D">
          {(['from', 'to'] as const).map((side) => {
            const tag = side === 'from' ? 'A' : 'B'
            const hasTerm = !!(side === 'from' ? selectedWire.fromTerminalId : selectedWire.toTerminalId)
            const isPicking = reconnect?.wireId === selectedWire.id && reconnect.end === side
            return (
              <div key={side} className={`panel3d-wire-end-chip ${activeEnd === side || isPicking ? 'is-on' : ''}`}>
                <span>Ponta {tag}</span>
                <button type="button" disabled={!!selectedWire.locked || simLocked} onClick={() => startReconnect(side)} title={`Escolher outro borne para a ponta ${tag}`}><IconLink size={10} />{isPicking ? 'A escolher…' : 'Religar'}</button>
                {hasTerm && <button type="button" disabled={!!selectedWire.locked || simLocked} onClick={() => detachWireEnd(side)} title={`Soltar a ponta ${tag} do borne`}><IconUnlock size={10} />Soltar</button>}
              </div>
            )
          })}
        </div>
        {(selectedWire.waypoints3D?.length ?? 0) > 0 && (
          <details className="panel3d-wire-waypoints" open={activeWaypointIndex !== null}>
            <summary>Coordenadas dos pontos 3D ({selectedWire.waypoints3D!.length}) · mm</summary>
            <div className="panel3d-wire-wp-list">
              {selectedWire.waypoints3D!.map((wp, idx) => (
                <div
                  key={idx}
                  className={`panel3d-wire-wp-row ${activeWaypointIndex === idx ? 'is-active' : ''}`}
                  onClick={() => { setActiveWaypointIndex(idx); setActiveEnd(null); setMoveAllWire(false) }}
                >
                  <span className="panel3d-wire-wp-idx">#{idx + 1}</span>
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <label key={axis} className="panel3d-wire-wp-axis">
                      <i>{axis.toUpperCase()}</i>
                      <input
                        type="number"
                        step={1}
                        disabled={!!selectedWire.locked || simLocked}
                        value={Math.round(wp[axis] / PANEL_UNITS_PER_MM)}
                        aria-label={`Ponto ${idx + 1} eixo ${axis.toUpperCase()} (mm)`}
                        onChange={(e) => updateWaypointAxisMm(idx, axis, Number(e.target.value))}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="panel3d-wire-wp-del"
                    disabled={!!selectedWire.locked || simLocked}
                    aria-label={`Remover ponto ${idx + 1}`}
                    title={`Remover ponto #${idx + 1}`}
                    onClick={(e) => { e.stopPropagation(); removeWireWaypointAt(selectedWire.id, idx) }}
                  >
                    <IconClose size={10} />
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
        {wireEditDirty && (
          <div className="panel3d-wire-actions">
            <button type="button" onClick={cancelWireEdit}><IconClose size={11} />Repor traçado</button>
            <button type="button" className="is-primary" onClick={saveWireEdit}><IconSave size={11} />Fixar traçado</button>
          </div>
        )}
        <small className="panel3d-wire-actions-hint">
          {moveAllWire
            ? 'Arraste o cubo roxo para deslocar todo o cabo.'
            : reconnect
              ? `Clique no borne de destino para a ponta ${reconnect.end === 'from' ? 'A' : 'B'} (Esc cancela).`
              : 'Arraste as esferas (Shift trava eixo · Alt livre) · duplo clique no cabo cria ponto · clique nas contas azuis divide um troço.'}
        </small>
      </div>, wireActionSlot)}
      {!hasComponents && <div className="panel3d-empty"><strong>{frontEdit ? 'O esquema está vazio' : 'O esquema 3D está vazio'}</strong><span>Adicione equipamento na biblioteca ou arraste um componente para esta vista.</span></div>}
      <ContextLossNotice lost={glLost} />
      <Canvas
        frameloop={!stageVisible ? 'never' : 'demand'}
        shadows
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: !IS_SOFTWARE_WEBGL, powerPreference: 'high-performance' }}
        camera={{ position: [0.6, 2.4, 6.4], fov: 44 }}
        onPointerMissed={() => { if (!demoMode && editMode !== 'connect' && !marqueeDrag.current) selectComponents([]) }}
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
        }}
      >
        <ModelsProgressReporter onChange={setModelsLoading} />
        <CameraProjectCapture camRef={cameraProjectRef} />
        <StudioEnvironment />
        <SoftwareRunInvalidator active={softwareGl && stageVisible && (runState === 'running' || burstActive)} />
        <RunFrameBudget active={!softwareGl && stageVisible && runState === 'running'} burst={!softwareGl && stageVisible && burstActive} />
        <AdaptiveResolution enabled={!softwareGl && stageVisible} />
        <ShadowsOnDemand watch={shadowWatch} />
        <ContextLossGuard onChange={setGlLost} />
        <CoverSnapshotBridge bounds={plateBounds} background={sceneBackground} />
        <hemisphereLight args={[factoryMode ? '#ffffff' : '#f8fafc', factoryMode ? '#8a94a6' : '#3b4350', factoryMode ? 0.65 : 0.38]} />
        <directionalLight key={`sun-${factoryMode ? 'factory' : shadowExtent}`} position={factoryMode ? [-12, 24, 18] : [-3.2, 7.5, 6.2]} intensity={factoryMode ? 1.15 : 1.25} color="#fff7ee" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003}
          shadow-camera-left={-(factoryMode ? Math.max(shadowExtent, 34) : shadowExtent)} shadow-camera-right={factoryMode ? Math.max(shadowExtent, 34) : shadowExtent} shadow-camera-top={factoryMode ? Math.max(shadowExtent, 34) : shadowExtent} shadow-camera-bottom={-(factoryMode ? Math.max(shadowExtent, 34) : shadowExtent)} />
        <directionalLight position={[5.8, 3.2, 2.4]} intensity={0.45} color="#e8f0ff" />
        {/* Escolha exclusiva: ou Canvas normal (grelha técnica) ou Ambiente fabril (quadro fixo na parede da nave). */}
        {factoryMode ? (
          <FactoryEnvironment3D
            center={sceneCenter}
            wallFrontZ={factoryWallFrontZ}
            floorY={factoryFloorY}
            mountBounds={factoryMountBounds}
            sceneSpan={
              Number.isFinite(sceneBounds.all.minX) || plateBounds
                ? {
                    minX: Math.min(
                      Number.isFinite(sceneBounds.all.minX) ? sceneBounds.all.minX : -6,
                      plateBounds ? plateBounds.minX - (plateBounds.maxX - plateBounds.minX) - 2.5 : -10,
                    ),
                    maxX: Math.max(
                      Number.isFinite(sceneBounds.all.maxX) ? sceneBounds.all.maxX : 12,
                      plateBounds ? plateBounds.maxX + 4 : 12,
                    ),
                    maxZ: Number.isFinite(sceneBounds.all.maxZ) ? sceneBounds.all.maxZ : 10,
                  }
                : null
            }
          />
        ) : (
          <>
            {backgroundMode !== 'white' && <WorldBackdrop center={sceneCenter} floorY={floorY} dark={backgroundMode === 'dark'} showFloor={floorGridVisible(cameraStats.pitch)} />}
            {showGrid && gridSettings.enabled && <DotGrid size={gridSettings.size} style={gridSettings.style} dark={backgroundMode === 'dark'} bounds={frontEdit ? null : plateBounds} />}
          </>
        )}
        {frontEdit && placingType && canInsertComponent3D(placingType) && <PlacementPlane step={gridSettings.enabled && gridSettings.snap && gridSettings.size > 0 ? gridSettings.size : 0} onPlace={(x, y) => {
          const step = gridSettings.enabled && gridSettings.snap && gridSettings.size > 0 ? gridSettings.size : 0
          const snapTo = (value: number) => step ? Math.round(value / step) * step : Math.round(value)
          const id = addComponent(placingType, snapTo(panelToSchematicX(x) - 40), snapTo(panelToSchematicY(y) - 40))
          setPlacingType(null)
          selectComponents(id ? [id] : [])
        }} />}

        {/* Com quadro, a chapa é a do próprio armário (mesmo plano). */}
        {plateBounds && !hasEnclosure && <MountingPlate bounds={plateBounds} />}
        <CameraRelay target={cameraRelay} />
        <CanvasAnnotations3D view={annotationView} readOnly={demoMode || simLocked} placeZ={textPlaneZ}
          openNoteId={openNoteId} setOpenNoteId={setOpenNoteId}
          selectedTextId={selectedTextId} setSelectedTextId={setSelectedTextId}
          editingTextId={editingTextId} setEditingTextId={setEditingTextId}
          placingText={placingText} onPlaceText={placeText} group={textGroup} />
        {railComponents.map((c) => {
          const x = positions[c.id].x
          let content: ReactNode
          if (isCatalogType(c.type)) content = <Model3DErrorBoundary fallback={<Breaker3D c={c} x={x} />}><Suspense fallback={null}><CatalogComponent3D c={c} interactive={(industrialDeviceTypeOf(c) ? mechanicalControls : interactive) && !c.locked} position={[x, RAIL_Y, 0]} anchor="bottom">{(top) => <Label text={c.ref} position={[0, top + 0.1, 0.22]} />}</CatalogComponent3D></Suspense></Model3DErrorBoundary>
          else if (importedComponentInfo(c.type) && getComponentModelSpec(c.type)) content = <Model3DErrorBoundary fallback={<Breaker3D c={c} x={x} />}><Suspense fallback={null}><ImportedCadDevice c={c} x={x} interactive={interactive && !c.locked} mechanical={mechanicalControls && !c.locked} labelColor={backgroundMode === 'dark' ? '#e2e8f0' : '#334155'} /></Suspense></Model3DErrorBoundary>
          else if (c.type === 'plcSiemensLogo1224RC') content = <Model3DErrorBoundary fallback={<PLC3D c={c} x={x} interactive={interactive && !c.locked} />}><Suspense fallback={null}><LogoSiemens1224RCMesh c={c} x={x} interactive={interactive && !c.locked} /></Suspense></Model3DErrorBoundary>
          else if (c.type === 'powerSupplyProauto24A') content = <Model3DErrorBoundary fallback={<PowerSupply3D c={c} x={x} />}><Suspense fallback={null}><ProautoReal3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          else if (c.type === 'contactorWegCWC09') content = <Model3DErrorBoundary fallback={<Contactor3D c={c} x={x} />}><Suspense fallback={null}><WegContactorReal3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          else if (c.type === 'thermalRelay') content = <ThermalRelay3D c={c} x={x} />
          else if (isAcrylicBusbarType(c.type)) {
            const base = basePivots[c.id]
            const dims = component3DDimensions(c)
            content = (
              <AcrylicBusbar3D
                c={c}
                position={[base.x, base.y, base.z]}
                wireMode={editMode === 'connect' || tool === 'probe' || reconnect !== null}
                label={<Label text={c.ref} position={[0, dims.y / 2 + 0.085, 0.04]} size={0.072} color={backgroundMode === 'dark' ? '#e2e8f0' : '#334155'} />}
              />
            )
          } else if (isSteppedBusbarType(c.type)) {
            const base = basePivots[c.id]
            const dims = component3DDimensions(c)
            content = (
              <SteppedBusbar3D
                c={c}
                position={[base.x, base.y, base.z]}
                interactive={mechanicalControls && !c.locked}
                wireMode={editMode === 'connect' || tool === 'probe' || reconnect !== null}
                label={<Label text={c.ref} position={[0, dims.y / 2 + 0.095, 0.08]} size={0.075} color={backgroundMode === 'dark' ? '#e2e8f0' : '#334155'} />}
              />
            )
          } else if (isCombBusbarType(c.type)) {
            const base = basePivots[c.id]
            const dims = component3DDimensions(c)
            content = (
              <CombBusbar3D
                c={c}
                position={[base.x, base.y, base.z]}
                label={<Label text={c.ref} position={[0, dims.y / 2 + 0.08, 0.05]} size={0.072} color={backgroundMode === 'dark' ? '#e2e8f0' : '#334155'} />}
              />
            )
          } else if (isCombConnectorType(c.type)) {
            const base = basePivots[c.id]
            const dims = component3DDimensions(c)
            content = (
              <CombConnector3D
                c={c}
                position={[base.x, base.y, base.z]}
                label={<Label text={c.ref} position={[0, dims.y / 2 + 0.075, 0.04]} size={0.068} color={backgroundMode === 'dark' ? '#e2e8f0' : '#334155'} />}
              />
            )
          } else if (c.type === 'terminalPhoenixPti6' && Number(c.state?.poleCount ?? 1) > 1) {
            content = (
              <Model3DErrorBoundary fallback={<Breaker3D c={c} x={x} />}>
                <Suspense fallback={null}>
                  <Pti6Strip3D c={c} x={x} labelColor={backgroundMode === 'dark' ? '#e2e8f0' : '#1e293b'} />
                </Suspense>
              </Model3DErrorBoundary>
            )
          } else if (industrialDeviceTypeOf(c)) {
            content=<IndustrialDevice3D c={c} x={x} position={basePivots[c.id].toArray() as [number,number,number]} interactive={mechanicalControls&&!c.locked}/>
          } else if (hasDinRailModel(c.type) && getComponentModelSpec(c.type) && c.type !== 'residualBreakerSchneiderIid4p' && c.type !== 'residualBreakerSchneiderIdpnVigi' && !['breakerSchneiderIc60h1p', 'pilotLightSchneiderIil1p', 'pilotLightSchneiderIil3p'].includes(c.type)) {
            // Acti9 has dedicated CAD/state rendering below; do not route it
            // through this generic, envelope-based equipment renderer.
            const fallback = c.type === 'phoenixEcb3000760' ? <PhoenixEcb3D c={c} x={x} /> : <Breaker3D c={c} x={x} />
            const inStrip = terminalStripMemberIds.has(c.id)
            content = (
              <Model3DErrorBoundary fallback={fallback}>
                <Suspense fallback={null}>
                  <CadComponentReal3D
                    c={c}
                    x={x}
                    interactive={interactive && !c.locked}
                    hideLabel={inStrip}
                    inTerminalStrip={inStrip}
                  />
                </Suspense>
              </Model3DErrorBoundary>
            )
          } else if (c.type.startsWith('contactor')) content = <Contactor3D c={c} x={x} />
          else if (c.type === 'powerSupply') content = <PowerSupply3D c={c} x={x} />
          else if (c.type === 'powerSource1ph' || c.type === 'powerSource3ph' || c.type === 'powerSource24v') content = <PowerSupply3D c={c} x={x} />
          else if (c.type === 'terminalSet1ph' || c.type === 'terminalSet3ph' || c.type === 'terminalSet24v') content = <TerminalAssembly3D c={c} x={x} />
          else if (c.type === 'meterD522066') content = <MeterD522066_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={canActuate} />
          else if (c.type === 'meterKws306') content = <MeterKws306_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={canActuate} />
          else if (c.type === 'breakerSchneiderIc60h1p') content = <SchneiderBreaker1P_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={mechanicalControls && !c.locked} />
          else if (c.type === 'residualBreakerSchneiderIid4p') content = <SchneiderRcd4P_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={canActuate} />
          else if (c.type === 'residualBreakerSchneiderIdpnVigi') content = <SchneiderRcd1PN_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={canActuate} />
          else if (c.type === 'pilotLightSchneiderIil1p') content = <SchneiderPilotLight1P_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={mechanicalControls && !c.locked} />
          else if (c.type === 'pilotLightSchneiderIil3p') content = <SchneiderPilotLight3P_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={mechanicalControls && !c.locked} />
          else if (c.type.startsWith('plc')) content = <PLC3D c={c} x={x} interactive={interactive && !c.locked} />
          else if (c.type === 'vfd' || c.type === 'softStarter') content = <Drive3D c={c} x={x} />
          else content = <Breaker3D c={c} x={x} />
          const isBreaker = ['breaker1p', 'breaker2p', 'breaker3p', 'breaker4p', 'switchSchneiderEz9s1p', 'switchSchneiderEz9s2p', 'switchSchneiderEz9s4p', 'breakerSteckSdC25', 'motorBreakerPkzmC10', 'phoenixEcb3000760', 'motorBreaker', 'residualBreaker'].includes(c.type)
          if (isBreaker) content = <group onClick={(event) => {
            if (c.locked) return
            if (!canActuate) {
              if (!demoMode && useSimStore.getState().tool === 'select') {
                event.stopPropagation()
                useSimStore.getState().selectComponents([c.id])
              }
              return
            }
            event.stopPropagation()
            if (!demoMode && !simLocked) useSimStore.getState().selectComponents([c.id])
            const closed = !!c.state.closed && !c.state.tripped
            useSimStore.getState().operateComponent(c.id, { closed: !closed, tripped: false })
          }}>{content}</group>
          return wrapOriented(c, content)
        })}

        {mountingRails.map((c) => {
          const base = basePivots[c.id]
          return wrapOriented(c, <MountingRail3D c={c} position={[base.x, base.y, base.z]} />)
        })}

        {accessories.map((c) => {
          const plateFrontZ = PLATE_FRONT_Z - panelPivots[c.id].z
          const label = <Label text={c.ref} position={[0, 0, 0]} size={0.075} color="#475569" />
          return wrapOriented(c, c.type === 'panelEnclosure'
            ? <Enclosure3D c={c} interactive={assemblyControls} plateFrontZ={plateFrontZ} label={label} coverOccupants={enclosureCoverOccupants(c)} />
            : c.type === 'spiralWrap'
              ? <SpiralWrap3D c={c} plateFrontZ={plateFrontZ} label={label} />
              : <CableDuct3D c={c} plateFrontZ={plateFrontZ} label={label} openings={ductJunctionOpenings(c, components)} />)
        })}

        {offRail.map((c) => {
          const x = front[c.id]
          let content: ReactNode
          if (isCatalogType(c.type)) {
            const fallback = <PushButton3D c={c} x={x} onPress={(pressed) => activateComponent(c, () => pressButton(c.id, pressed))} />
            const [px, py, pz] = frontPivot(c)
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={null}><CatalogComponent3D c={c} interactive={(industrialDeviceTypeOf(c) ? mechanicalControls : interactive) && !c.locked} position={[x + px, py, pz]} anchor="center">{(top) => <Label text={c.ref} position={[0, top + 0.1, 0.1]} />}</CatalogComponent3D></Suspense></Model3DErrorBoundary>
          } else if (industrialDeviceTypeOf(c)) {
            const [px,py,pz]=frontPivot(c)
            content=<IndustrialDevice3D c={c} x={x} position={[x+px,py,pz]} interactive={mechanicalControls&&!c.locked}/>
          } else if (c.type==='currentTransformerSplitCore') {
            const [px,py,pz]=frontPivot(c)
            content=<CurrentTransformer3D c={c} x={x} position={[x+px,py,pz]} interactive={false}/>
          } else if (importedComponentInfo(c.type) && getComponentModelSpec(c.type)) {
            const [px,py,pz] = frontPivot(c)
            const fallback = <Sensor3D c={c} x={x} onToggle={() => {}} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={null}><ImportedCadDevice c={c} x={x} position={[x+px,py,pz]} interactive={interactive && !c.locked} mechanical={mechanicalControls && !c.locked} labelColor={backgroundMode === 'dark' ? '#e2e8f0' : '#334155'} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'multimeterDm20') {
            // O CAD e os bornes usam o mesmo pivô central também fora da calha.
            // A antiga montagem pela base deslocava o corpo 40 mm em profundidade.
            const [px, py, pz] = frontPivot(c)
            content = <Model3DErrorBoundary fallback={<Sensor3D c={c} x={x} onToggle={() => {}} />}><Suspense fallback={null}><CadComponentReal3D c={c} x={x} position={[x + px, py, pz]} interactive={interactive && !c.locked} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'pilotLightAd22') {
            const fallback = <Lamp3D c={c} x={x} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={null}><PilotLightAd22Real3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'ledGreen' || c.type === 'ledRed' || c.type === 'ledYellow' || c.type === 'ledWhite' || c.type === 'buzzer') content = <Lamp3D c={c} x={x} />
          else if (c.type === 'towerLight') content = <TowerLight3D c={c} x={x} />
          else if (c.type === 'meterD522066') content = <MeterD522066_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={canActuate} />
          else if (c.type === 'meterKws306') content = <MeterKws306_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={canActuate} />
          else if (c.type === 'breakerSchneiderIc60h1p') content = <SchneiderBreaker1P_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={mechanicalControls && !c.locked} />
          else if (c.type === 'residualBreakerSchneiderIid4p') content = <SchneiderRcd4P_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={canActuate} />
          else if (c.type === 'residualBreakerSchneiderIdpnVigi') content = <SchneiderRcd1PN_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={canActuate} />
          else if (c.type === 'pilotLightSchneiderIil1p') content = <SchneiderPilotLight1P_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={mechanicalControls && !c.locked} />
          else if (c.type === 'pilotLightSchneiderIil3p') content = <SchneiderPilotLight3P_3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={mechanicalControls && !c.locked} />
          else if (isLightingType(c.type)) content = <LightingDevice3D c={c} x={x} position={basePivots[c.id].toArray() as [number, number, number]} interactive={canActuate} />
          else if (c.type === 'capacitorRun60uF' && getComponentModelSpec(c.type)) {
            const [px, py, pz] = frontPivot(c)
            const fallback = <group position={[x + px, py, pz]}>
              <mesh castShadow><cylinderGeometry args={[0.22, 0.22, 0.55, 24]} /><meshStandardMaterial color="#c4cdd6" metalness={0.55} roughness={0.35} /></mesh>
              <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.12, 0.06, 0.08]} /><meshStandardMaterial color="#1e293b" /></mesh>
              <Label text={c.ref} position={[0, 0.42, 0]} />
            </group>
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={null}><CadComponentReal3D c={c} x={x} position={[x + px, py, pz]} interactive={interactive && !c.locked} /></Suspense></Model3DErrorBoundary>
          }
          else if (c.type === 'motor3ph') {
            const fallback = <Motor3D c={c} x={x} interactive={interactive && !c.locked} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={null}><MotorSewDrn80Mk4B3Real3D c={c} x={x} interactive={interactive && !c.locked} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'motor1ph') {
            const fallback = <Motor3D c={c} x={x} interactive={interactive && !c.locked} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={null}><MotorSewDrn80Mk4B3Real3D c={c} x={x} interactive={interactive && !c.locked} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'waterPump') {
            const fallback = <Motor3D c={c} x={x} interactive={interactive && !c.locked} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={null}><WaterPumpCalpeda3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'waterTank') {
            content = (
              <WaterTankTransparent3D
                c={c}
                position={basePivots[c.id].toArray() as [number, number, number]}
                onToggleValve={() => {
                  const st = useSimStore.getState()
                  const nextOpen = !c.state.outletValveOpen
                  if (st.sim.runState === 'running') {
                    st.operateComponent(c.id, { outletValveOpen: nextOpen })
                  } else {
                    st.setComponentState(c.id, { outletValveOpen: nextOpen })
                  }
                }}
              />
            )
          } else if (c.type === 'floatSwitch') {
            content = (
              <FloatSwitchFelix3D
                c={c}
                position={basePivots[c.id].toArray() as [number, number, number]}
                tankContext={floatTankContexts[c.id] ?? null}
                onToggle={() => activateComponent(c, () => operateComponent(c.id, { triggered: !c.state.triggered, level: !c.state.triggered ? 'alto' : 'baixo' }))}
              />
            )
          } else if (c.type === 'hydraulicValve') {
            content = (
              <HydraulicValve3D
                c={c}
                position={basePivots[c.id].toArray() as [number, number, number]}
                onToggle={() => {
                  const st = useSimStore.getState()
                  const nextOpen = c.state.open === false
                  if (st.sim.runState === 'running') st.operateComponent(c.id, { open: nextOpen })
                  else st.setComponentState(c.id, { open: nextOpen })
                }}
              />
            )
          } else if (c.type === 'hydraulicTee') {
            content = <HydraulicTee3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'airCompressor') {
            content = (
              <AirCompressor3D
                c={c}
                position={basePivots[c.id].toArray() as [number, number, number]}
                onToggleRun={() => activateComponent(c, () => operateComponent(c.id, { running: !c.state.running }))}
                onToggleCover={() => activateComponent(c, () => operateComponent(c.id, { coverOpen: !c.state.coverOpen }))}
              />
            )
          } else if (c.type === 'pneumaticFrl') {
            content = <PneumaticFrl3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'pneumaticValve52') {
            content = <PneumaticValve523D c={c} position={basePivots[c.id].toArray() as [number, number, number]} onManualToggle={() => activateComponent(c, () => operateComponent(c.id, { manualOverride: !c.state.manualOverride }))} />
          } else if (c.type === 'pneumaticCylinder') {
            content = <PneumaticCylinder3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'pneumaticTee') {
            content = <PneumaticTee3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'pneumaticUnion') {
            content = <PneumaticUnion3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'pneumaticElbow') {
            content = <PneumaticElbow3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'pneumaticY') {
            content = <PneumaticY3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'electricCylinderEpcs') {
            content = (
              <ElectricCylinderEpcs3D
                c={c}
                position={basePivots[c.id].toArray() as [number, number, number]}
                onJogStep={(dir) => {
                  const st = useSimStore.getState()
                  const curPct = Number(c.state.positionPct ?? 0)
                  const nextPct = dir === 'out' ? Math.min(100, curPct + 25) : Math.max(0, curPct - 25)
                  const patch = { positionPct: nextPct, extended: nextPct >= 92 }
                  if (st.sim.runState === 'running') st.operateComponent(c.id, patch)
                  else st.setComponentState(c.id, patch)
                }}
              />
            )
          } else if (c.type === 'pneumaticGuidedCylinder') {
            content = <PneumaticGuidedCylinder3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'pneumaticManifold') {
            content = (
              <PneumaticManifold3D
                c={c}
                position={basePivots[c.id].toArray() as [number, number, number]}
                onToggleStation={(idx) => {
                  const st = useSimStore.getState()
                  const key = `station${idx}Manual`
                  const patch = { [key]: !c.state[key] }
                  if (st.sim.runState === 'running') st.operateComponent(c.id, patch)
                  else st.setComponentState(c.id, patch)
                }}
              />
            )
          } else if (c.type === 'pneumaticVacuumCup') {
            content = (
              <PneumaticVacuumCup3D
                c={c}
                position={basePivots[c.id].toArray() as [number, number, number]}
                onToggleVacuum={() => {
                  const st = useSimStore.getState()
                  const next = !c.state.manualVacuum
                  const patch = { manualVacuum: next, vacuumActive: next }
                  if (st.sim.runState === 'running') st.operateComponent(c.id, patch)
                  else st.setComponentState(c.id, patch)
                }}
              />
            )
          } else if (c.type === 'industrialWall') {
            content = <IndustrialWall3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'industrialPillar') {
            content = <IndustrialPillar3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'cableTrayStraight') {
            content = <CableTrayStraight3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'cableTrayElbow90') {
            content = <CableTrayElbow903D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'cableTrayCross') {
            content = <CableTrayCross3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'cableTrayVerticalBend') {
            content = <CableTrayVerticalBend3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'cableTrayRiser90') {
            content = <CableTrayRiser903D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'wireTrayStraight') {
            content = <WireTrayStraight3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'wireTrayElbow90') {
            content = <WireTrayElbow903D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'wireTrayTee') {
            content = <WireTrayTee3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'wireTrayRiser90') {
            content = <WireTrayRiser903D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'conduitVdsStraight') {
            content = <ConduitVdsStraight3D component={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'conduitVdsElbow90') {
            content = <ConduitVdsElbow903D component={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'conduitCorrugated') {
            content = <ConduitCorrugated3D component={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'pipeClampPvc' || c.type === 'pipeClampMetalEpdm' || c.type === 'pipeClampMetalScrew') {
            content = <PipeClampStandalone3D component={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          } else if (c.type === 'triProofLedBatten') {
            content = (
              <TriProofLedBatten3D
                component={c}
                position={basePivots[c.id].toArray() as [number, number, number]}
                externalCableTarget={fieldCableTargets.get(c.id) ?? null}
              />
            )
          } else if (c.type === 'waterSupplyBox') {
            content = (
              <WaterSupplyBox3D
                c={c}
                position={basePivots[c.id].toArray() as [number, number, number]}
                floorOffsetY={floorY - (panelPivots[c.id]?.y ?? 0)}
                onToggleDoor={() => {
                  const st = useSimStore.getState()
                  const patch = { doorOpen: !(c.state.doorOpen !== false) }
                  if (st.sim.runState === 'running') st.operateComponent(c.id, patch)
                  else st.setComponentState(c.id, patch)
                }}
                onToggleValve={() => {
                  const st = useSimStore.getState()
                  const patch = { valveOpen: !(c.state.valveOpen !== false) }
                  if (st.sim.runState === 'running') st.operateComponent(c.id, patch)
                  else st.setComponentState(c.id, patch)
                }}
              />
            )
          } else if (c.type === 'hydraulicFlowMeter') {
            content = (
              <WaterFlowMeterZjLcd3D
                c={c}
                position={basePivots[c.id].toArray() as [number, number, number]}
                onPressSet={() => {
                  const st = useSimStore.getState()
                  const nextMode = c.state.displayMode === 'instant' ? 'total' : 'instant'
                  const patch = { displayMode: nextMode }
                  if (st.sim.runState === 'running') st.operateComponent(c.id, patch)
                  else st.setComponentState(c.id, patch)
                }}
                onPressClear={() => {
                  const st = useSimStore.getState()
                  const patch = { singleVolumeL: 0 }
                  if (st.sim.runState === 'running') st.operateComponent(c.id, patch)
                  else st.setComponentState(c.id, patch)
                }}
              />
            )
          } else if (isJunctionBoxType(c.type)) {
            content = (
              <group position={basePivots[c.id].toArray() as [number, number, number]}>
                <OboJunctionBox3D
                  component={c}
                  spliceCables={oboSpliceCables.get(c.id)}
                  onToggleCover={() => {
                    const st = useSimStore.getState()
                    const patch = { coverOpen: !c.state.coverOpen }
                    if (st.sim.runState === 'running') st.operateComponent(c.id, patch)
                    else st.setComponentState(c.id, patch)
                  }}
                />
              </group>
            )
          } else if (isWagoConnectorType(c.type)) {
            content = (
              <group position={basePivots[c.id].toArray() as [number, number, number]}>
                <Wago221Connector3D
                  component={c}
                  onToggleLever={(idx) => {
                    const st = useSimStore.getState()
                    const prev = Array.isArray(c.state.leversOpen) ? [...(c.state.leversOpen as boolean[])] : []
                    prev[idx] = !prev[idx]
                    const patch = { leversOpen: prev }
                    if (st.sim.runState === 'running') st.operateComponent(c.id, patch)
                    else st.setComponentState(c.id, patch)
                  }}
                />
              </group>
            )
          } else if (c.type === 'rollerConveyor') {
            content = <Model3DErrorBoundary fallback={<Motor3D c={c} x={x} interactive={false} />}><Suspense fallback={null}><RollerConveyor3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'opticalReflector') {
            content = <OpticalReflector3D c={c} position={basePivots[c.id].toArray() as [number, number, number]} />
          }
          else if (c.type === 'dualPushButtonNpb22D11' && getCommandModelSpec(c.type)) {
            const fallback = <PushButton3D c={c} x={x} onPress={(pressed) => activateComponent(c, () => operateComponent(c.id, { startPressed: pressed }))} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={null}><DualPushButtonReal3D c={c} x={x}
              onStart={(pressed) => activateComponent(c, () => operateComponent(c.id, { startPressed: pressed }))}
              onStop={(pressed) => activateComponent(c, () => operateComponent(c.id, { stopPressed: pressed }))} /></Suspense></Model3DErrorBoundary>
          } else if ((c.type === 'emergencyButton' || c.type === 'emergencyButtonKeyP20ACR') && getCommandModelSpec(c.type)) content = <Model3DErrorBoundary fallback={<PushButton3D c={c} x={x} onPress={(pressed) => activateComponent(c, () => pressButton(c.id, pressed))} />}><Suspense fallback={null}><EmergencyButtonReal3D c={c} x={x} onPress={(pressed) => activateComponent(c, () => pressButton(c.id, pressed))} /></Suspense></Model3DErrorBoundary>
          else if (['proximitySensor', 'photoSensor', 'pressureSwitch', 'thermostat'].includes(c.type)) content = <Sensor3D c={c} x={x} onToggle={() => activateComponent(c, () => operateComponent(c.id, { triggered: !c.state.triggered }))} />
          else content = <PushButton3D c={c} x={x} onPress={(pressed) => activateComponent(c, () => pressButton(c.id, pressed))} />
          // Cabo de campo editável 3D para torres de sinalização, sensores, luminárias e bombas/atuadores (quando ativo)
          if (
            isEditableCableDeviceType(c.type) &&
            c.type !== 'triProofLedBatten' &&
            c.type !== 'floatSwitch' &&
            c.state.cableEnabled === true &&
            basePivots[c.id]
          ) {
            const dimU = component3DDimensions(c)
            const bp = basePivots[c.id]
            const exitRaw = String(c.state.cableExitDir ?? 'bottom')
            const ox = exitRaw === 'left' ? -dimU.x * 0.5 : exitRaw === 'right' ? dimU.x * 0.5 : 0
            const oy = exitRaw === 'top' ? dimU.y * 0.5 : exitRaw === 'bottom' ? -dimU.y * 0.5 : 0
            const oz = exitRaw === 'back' ? -dimU.z * 0.5 : 0
            content = (
              <group>
                {content}
                <group position={[bp.x, bp.y, bp.z]}>
                  <EditableFieldCable3D
                    component={c}
                    anchor={[ox, oy, oz]}
                    externalTarget={fieldCableTargets.get(c.id) ?? null}
                    defaultConfig={{
                      enabled: true,
                      exitDir: 'bottom',
                      lengthMm: c.type === 'towerLight' ? 500 : 420,
                      diameterMm: c.type === 'proximitySensor' || c.type === 'photoSensor' ? 6 : 8,
                    }}
                  />
                </group>
              </group>
            )
          }
          return wrapOriented(c, content)
        })}
        {/* Cabeçalhos unificados e pontes FBS 3D das réguas de bornes — zero sobreposição de TAGs */}
        {terminalStripHeaders.map((hdr) => {
          const barW = Math.max(0.06, hdr.rightX - hdr.leftX)
          const barCx = (hdr.leftX + hdr.rightX) / 2
          const ink = hdr.selected ? '#2563eb' : (backgroundMode === 'dark' ? '#e2e8f0' : '#1e293b')
          const lineInk = hdr.selected ? '#2563eb' : (backgroundMode === 'dark' ? '#94a3b8' : '#64748b')
          return (
            <group key={`strip-hdr-${hdr.key}`}>
              <Label text={hdr.text} size={0.078} position={[hdr.labelX, hdr.labelY, hdr.labelZ]} color={ink} />
              {/* Barra discreta de agrupamento sobre a régua inteira (canto esquerdo + traço + canto direito) */}
              <mesh position={[barCx, hdr.barY, hdr.barZ]} raycast={() => null}>
                <boxGeometry args={[barW, 0.009, 0.006]} />
                <meshBasicMaterial color={lineInk} />
              </mesh>
              <mesh position={[hdr.leftX, hdr.barY - 0.014, hdr.barZ]} raycast={() => null}>
                <boxGeometry args={[0.009, 0.032, 0.006]} />
                <meshBasicMaterial color={lineInk} />
              </mesh>
              <mesh position={[hdr.rightX, hdr.barY - 0.014, hdr.barZ]} raycast={() => null}>
                <boxGeometry args={[0.009, 0.032, 0.006]} />
                <meshBasicMaterial color={lineInk} />
              </mesh>
            </group>
          )
        })}
        {terminalStripJumpers.map((j) => (
          <TerminalJumperBridge3D
            key={j.key}
            centerX={j.centerX}
            spanX={j.spanX}
            baseY={j.baseY}
            baseZ={j.baseZ}
          />
        ))}
        <Wires3D
          onRoutingLoadingChange={setRoutingLoading}
          pivots={panelPivots}
          editMode={editMode}
          simLocked={simLocked}
          selectedWireId={demoMode || simLocked ? null : selectedWireId}
          activeWaypointIndex={demoMode || simLocked ? null : activeWaypointIndex}
          activeEnd={demoMode || simLocked ? null : activeEnd}
          moveAll={demoMode || simLocked ? false : moveAllWire}
          onSelectWire={(wireId) => { if (demoMode || simLocked) return; if (tool === 'erase') { deleteWire(wireId); return }; if (tool !== 'select' && tool !== 'wire') return; if (draftRef.current || reconnect) return; selectWire(wireId, useSimStore.getState().multiSelectMode); setActiveWaypointIndex(null); setActiveEnd(null); setMoveAllWire(false) }}
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
          active={!demoMode && !simLocked && (editMode === 'connect' || reconnect !== null)}
          draft={draft}
          getDraft={() => draftRef.current}
          terminals={drawTerminals.filter((terminal) => terminalMatchesConnectionMedium(terminal.kind, connectionMedium))}
          wireRadius={(cableOuterDiameterMm(wireDefaults.gauge, { conductorCount: wireDefaults.conductorCount, sheathed: wireDefaults.sheathed }) * PANEL_UNITS_PER_MM) / 2}
          wireColor={WIRE_3D_COLORS[wireDefaults.autoColor ? 'red' : wireDefaults.color]}
          sheathed={!!wireDefaults.sheathed}
          sheathColor={wireDefaults.sheathColor}
          smooth={(wireDefaults.route ?? 'orthogonal') === 'arc'}
          route={wireDefaults.route ?? 'orthogonal'}
          orthoSnap={wireDefaults.orthoSnap !== false}
          reconnecting={reconnect !== null}
          fallbackCenter={sceneCenter}
          obstacles={componentObstacles(components, panelPivots)}
          onStart={draftStart}
          onAddPoint={draftAddPoint}
          onFinish={draftFinish}
          onReconnectPick={pickConnectionTerminal}
        />

        {/* Etiquetas realistas em aparelhos — movem-se com o hospedeiro (contator, disjuntor) */}
        <group>
          {components.filter((c) => (c.decals ?? []).length && c.type !== 'panelEnclosure').map((c) => {
            const pivot = panelPivots[c.id]
            if (!pivot) return null
            const half = componentHalfExtents(c, baseOrientationFor(c))
            return <group key={`decals-${c.id}`} position={pivot} rotation={orientationRadians(orientationFor(c))}>
              {(c.decals ?? []).map((d) => <group key={d.id}
                position={[(d.offsetXmm ?? 0) * PANEL_UNITS_PER_MM, (d.offsetYmm ?? 0) * PANEL_UNITS_PER_MM, half.z + 0.02]}
                rotation={[0, 0, THREE.MathUtils.degToRad(d.rotationDeg ?? 0)]}>
                <EquipmentDecal3D decal={d} componentId={c.id} />
              </group>)}
            </group>
          })}
        </group>
        <FaultEffectsLayer panelPivots={panelPivots} />
        <PanelCameraRig command={cameraCommand} railWidth={sceneWidth} maxDistance={factoryMode ? 220 : 60}
          onStats={stats => setCameraStats(previous => previous.zoom === stats.zoom && Math.abs(previous.yaw - stats.yaw) < 0.001 && Math.abs(previous.pitch - stats.pitch) < 0.001 ? previous : stats)}
          scrollBridge={cameraScrollBridge} scrollBounds={contentBounds ?? { minX: -2, maxX: 2, minY: -2, maxY: 2, minZ: -0.2, maxZ: 0.6 }}
          frontEdit={frontEdit} panMode={gridDragEnabled || tool === 'pan'} viewLocked={viewLocked} />
      </Canvas>
      {(modelsLoading || routingLoading) && (
        <div className="absolute inset-0 z-50" data-testid="panel3d-loading">
          <RouteLoading label="A carregar o editor…" />
        </div>
      )}

      <PanelCanvasScrollbars bridge={cameraScrollBridge} controlsId={stageId} disabled={viewLocked} label={frontEdit ? 'Esquema 3D frontal' : 'Visualização 3D'} />

      {!demoMode && !simLocked && selectedText && <div className="canvas-textbar-slot">
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
      <ShortcutHelp open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} editor={frontEdit ? '3D Realista · vista 2D' : '3D Realista'} extra={PANEL3D_SHORTCUTS} />
    </div>
  )
}
