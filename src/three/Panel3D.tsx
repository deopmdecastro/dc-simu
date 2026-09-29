import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Line, TransformControls, useGLTF } from '@react-three/drei'
import { useRef, useMemo, useState, useEffect, Suspense, Component } from 'react'
import type { ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import { SCENARIOS } from '../simulation/scenarios'
import { IconHelp } from '../ui/icons'
import type { ElectricalComponent, ComponentType } from '../types'
import * as THREE from 'three'
import { getCommandModelSpec, getComponentModelSpec, hasComponent3DModel, hasDinRailModel } from './modelPaths'
import { componentOrientationOf, orientationRadians } from './componentOrientation'
import { component3DScaleOf, terminalLocal3D, terminalPositionFromLocal3D, terminalWorld3D } from './terminal3D'
import ComponentViewEditor from '../components/ComponentViewEditor'

const SLOT_WIDTH = 0.72
const RAIL_Y = 0.4
const PANEL_FLOOR_Y = -2.6
const MOTOR_TARGET_HEIGHT = getComponentModelSpec('motor3ph')!.targetHeight
const MOTOR_SCALE_RATIO = MOTOR_TARGET_HEIGHT / 1.04
/** Centro físico do DRN80, com os pés apoiados no piso. */
const MOTOR_CENTER_Y = PANEL_FLOOR_Y + MOTOR_TARGET_HEIGHT / 2

/* ------------------------------------------------------------------ helpers */

function Label({ text, position, color = '#0f172a', size = 0.085 }: { text: string; position: [number, number, number]; color?: string; size?: number }) {
  return (
    <Text position={position} fontSize={size} color={color} anchorX="center" anchorY="middle">
      {text}
    </Text>
  )
}

function DinRail({ width }: { width: number }) {
  return (
    <group position={[0, RAIL_Y, 0]}>
      <mesh>
        <boxGeometry args={[width, 0.08, 0.16]} />
        <meshStandardMaterial color="#b8bcc4" metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.1, -0.16]}>
        <boxGeometry args={[width, 0.06, 0.12]} />
        <meshStandardMaterial color="#8d939c" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, -1.2, -0.28]} receiveShadow>
        <boxGeometry args={[width + 0.8, 5.0, 0.06]} />
        <meshStandardMaterial color="#eef1f4" metalness={0.15} roughness={0.75} />
      </mesh>
    </group>
  )
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

function EditableTerminal3D({ component, terminal, active }: { component: ElectricalComponent; terminal: ElectricalComponent['terminals'][number]; active: boolean }) {
  const handle = useRef<THREE.Group>(null)
  const setActive = useSimStore((state) => state.setViewActiveTerminal)
  const setDefinition = useSimStore((state) => state.setViewTerminalDefinition)
  const position = terminalLocal3D(component, terminal)
  const marker = <group
    ref={handle}
    position={position}
    onClick={(event) => { event.stopPropagation(); setActive(terminal.id) }}
  >
    <mesh>
      <sphereGeometry args={[active ? 0.055 : 0.042, 18, 18]} />
      <meshStandardMaterial color={active ? '#22d3ee' : terminal.color} emissive={active ? '#0891b2' : '#000000'} emissiveIntensity={active ? 0.7 : 0} metalness={0.2} roughness={0.35} depthTest={false} />
    </mesh>
    <Text position={[0, 0.085, 0]} fontSize={0.06} color={active ? '#0e7490' : '#1e293b'} anchorX="center" anchorY="bottom" depthOffset={-2}>{terminal.label}</Text>
  </group>
  if (!active) return marker
  return <TransformControls
    mode="translate"
    size={0.62}
    translationSnap={0.01}
    onObjectChange={() => {
      if (!handle.current) return
      setDefinition(terminal.id, { position3D: terminalPositionFromLocal3D(component, handle.current.position) })
    }}
  >{marker}</TransformControls>
}

function OrientedInstance({ c, pivot, orientation, selected, editingTerminals, onSelect, children }: {
  c: ElectricalComponent
  pivot: [number, number, number]
  orientation: ElectricalComponent['viewOrientation']
  selected: boolean
  editingTerminals: boolean
  onSelect: () => void
  children: ReactNode
}) {
  const modelRef = useRef<THREE.Group>(null)
  const activeTerminalId = useSimStore((state) => state.viewOrientationEditor?.activeTerminalId)
  const rotation = orientationRadians(orientation)
  const scale = component3DScaleOf(c)
  const renderMode = c.view3DRenderMode ?? 'solid'
  useEffect(() => applyRenderMode(modelRef.current, renderMode, c.bodyColor), [renderMode, c.bodyColor, children])
  useFrame(() => { if (renderMode !== 'solid' || c.bodyColor) applyRenderMode(modelRef.current, renderMode, c.bodyColor) })
  return <group position={pivot} rotation={rotation} onClick={(event) => { event.stopPropagation(); onSelect() }}>
    <group scale={[scale.x, scale.y, scale.z]}>
      <group ref={modelRef} position={[-pivot[0], -pivot[1], -pivot[2]]}>{children}</group>
      {editingTerminals && c.terminals.map((terminal) => <EditableTerminal3D key={terminal.id} component={c} terminal={terminal} active={terminal.id === activeTerminalId} />)}
    </group>
    {selected && <mesh position={[0, -0.43, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.42, 0.48, 32]} />
      <meshBasicMaterial color="#2f6fe4" transparent opacity={0.8} side={THREE.DoubleSide} />
    </mesh>}
  </group>
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
    const obj = scene.clone(true)
    // scene.clone(true) conserva referências aos materiais do cache GLTF;
    // isolá-los evita que o ecrã de um PLC modifique os demais modelos.
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((mat) => mat.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...LOGO_1224RC_ROTATION)
    obj.updateMatrixWorld(true)

    const rawBox = new THREE.Box3().setFromObject(obj)
    const rawHeight = rawBox.max.y - rawBox.min.y
    const scale = rawHeight > 0 ? LOGO_1224RC_TARGET_HEIGHT / rawHeight : 1
    obj.scale.setScalar(scale)
    obj.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(obj)
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
    const obj = scene.clone(true)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(obj)
    const height = bounds.max.y - bounds.min.y
    const scale = height > 0 ? spec.targetHeight / height : 1
    obj.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj)
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
    const obj = scene.clone(true)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((mat) => mat.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(obj)
    const height = bounds.max.y - bounds.min.y
    const scale = height > 0 ? spec.targetHeight / height : 1
    obj.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj)
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
    const obj = scene.clone(true)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const raw = new THREE.Box3().setFromObject(obj)
    const height = raw.max.y - raw.min.y
    const scale = height > 0 ? spec.targetHeight / height : 1
    obj.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj)
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
    const obj = scene.clone(true)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(obj)
    const size = bounds.getSize(new THREE.Vector3())
    const scale = size.y > 0 ? spec.targetHeight / size.y : 1
    obj.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    obj.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(obj)
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
    const obj = scene.clone(true)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const raw = new THREE.Box3().setFromObject(obj)
    const size = raw.getSize(new THREE.Vector3())
    const scale = spec.targetHeight / (size.y || 1)
    obj.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    obj.updateMatrixWorld(true)
    obj.position.sub(new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()))
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
    const object = scene.clone(true)
    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    object.rotation.set(...spec.rotation)
    object.updateMatrixWorld(true)
    const rawSize = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
    const faceDiameter = Math.max(rawSize.x, rawSize.y)
    const scale = faceDiameter > 0 ? spec.targetHeight / faceDiameter : 1
    object.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    object.updateMatrixWorld(true)
    object.position.sub(new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()))
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
    const object = scene.clone(true)
    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    object.rotation.set(...spec.rotation)
    object.updateMatrixWorld(true)
    const raw = new THREE.Box3().setFromObject(object)
    const height = raw.max.y - raw.min.y
    const scale = height > 0 ? spec.targetHeight / height : 1
    object.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    object.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(object)
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

function Wires3D({ pivots }: { pivots: Record<string, THREE.Vector3> }) {
  const wires = useSimStore((s) => s.wires)
  const storedComponents = useSimStore((s) => s.components)
  const editor = useSimStore((s) => s.viewOrientationEditor)
  const components = useMemo(() => storedComponents.map((component) => editor?.componentId === component.id ? {
    ...component,
    viewOrientation: editor.draft,
    terminals: editor.terminals,
    view3DScale: editor.scale3D,
  } : component), [storedComponents, editor])

  const colorOf = (c: string) => {
    const map: Record<string, string> = {
      red: '#ef4444',
      blue: '#3b82f6',
      'green-yellow': '#84cc16',
      black: '#1f2937',
      orange: '#f59e0b',
      grey: '#94a3b8',
      brown: '#92400e',
      white: '#f8fafc',
      pink: '#ec4899',
      violet: '#8b5cf6',
      green: '#22c55e',
      yellow: '#eab308',
      lightblue: '#67e8f9',
    }
    return map[c] ?? '#94a3b8'
  }

  const posOf = (terminalId: string): [number, number, number] | null => {
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

  return (
    <group>
      {wires.map((w) => {
        const a = posOf(w.fromTerminalId)
        const b = posOf(w.toTerminalId)
        if (!a || !b) return null
        // a cor real do cabo é sempre mantida; energia = brilho âmbar por trás
        const col = colorOf(w.color)
        const width = w.gauge.startsWith('0.') ? 1.4 : w.gauge.startsWith('1') ? 1.8 : w.gauge.startsWith('2.5') ? 2.4 : 3
        const drop = -0.55
        let pts: Array<[number, number, number]>
        if (w.route === 'direct') pts = [a, b]
        else if (w.flexibility === 'flexible') {
          // flexível: catenária suave (curva)
          const mid: [number, number, number] = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) + drop * 1.3, (a[2] + b[2]) / 2]
          const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(...a), new THREE.Vector3(...mid), new THREE.Vector3(...b)])
          pts = curve.getPoints(24).map((v) => [v.x, v.y, v.z] as [number, number, number])
        } else {
          // rígido: dobras a 90°
          pts = [a, [a[0], a[1] + drop, a[2]], [b[0], a[1] + drop, b[2]], b]
        }
        return (
          <group key={w.id}>
            {w.energized && <Line points={pts} color="#fbbf24" lineWidth={width + 4} transparent opacity={0.45} />}
            <Line points={pts} color={col} lineWidth={width} />
          </group>
        )
      })}
    </group>
  )
}

/* -------------------------------------------------------------------- cena */

type PanelCameraView = 'fit' | 'front' | 'top' | 'isometric' | 'focus'
type PanelCameraCommand = { id: number; view: PanelCameraView; target: [number, number, number] }

/** Câmara previsível: presets e foco não alteram qualquer posição do projeto. */
function PanelCameraRig({ command, railWidth, onStats }: { command: PanelCameraCommand; railWidth: number; onStats: (stats: { yaw: number; pitch: number; zoom: number }) => void }) {
  const { camera, size } = useThree()
  const controlsRef = useRef<any>(null)
  const report = () => {
    const controls = controlsRef.current
    if (!controls) return
    const offset = camera.position.clone().sub(controls.target)
    const distance = Math.max(0.001, offset.length())
    onStats({
      yaw: THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z)),
      pitch: THREE.MathUtils.radToDeg(Math.asin(offset.y / distance)),
      zoom: Math.round(Math.max(25, Math.min(400, 620 / distance))),
    })
  }
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const target = new THREE.Vector3(...command.target)
    const verticalFov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov || 44)
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.55, size.width / Math.max(1, size.height)))
    const fitDistance = Math.max(4.2, Math.min(16, (Math.max(4.5, railWidth) * 0.62) / Math.max(0.2, Math.tan(horizontalFov / 2))))
    let position: THREE.Vector3
    camera.up.set(0, 1, 0)
    if (command.view === 'focus') {
      const direction = camera.position.clone().sub(controls.target).normalize()
      if (!Number.isFinite(direction.x) || direction.lengthSq() < 0.1) direction.set(0.25, 0.35, 1)
      position = target.clone().add(direction.multiplyScalar(3.1))
    } else if (command.view === 'front') {
      position = target.clone().add(new THREE.Vector3(0, 0.45, fitDistance))
    } else if (command.view === 'top') {
      camera.up.set(0, 0, -1)
      position = target.clone().add(new THREE.Vector3(0, fitDistance, 0.01))
    } else {
      position = target.clone().add(new THREE.Vector3(fitDistance * 0.68, fitDistance * 0.48, fitDistance * 0.78))
    }
    camera.position.copy(position)
    controls.target.copy(target)
    camera.lookAt(target)
    camera.updateProjectionMatrix()
    controls.update()
    report()
  }, [camera, command, railWidth, size.height, size.width])
  return <OrbitControls ref={controlsRef} minDistance={1.2} maxDistance={24} enableDamping dampingFactor={0.08} makeDefault onChange={report} />
}

export default function Panel3D({ embedded = false }: { embedded?: boolean }) {
  const storedComponents = useSimStore((s) => s.components)
  const pressButton = useSimStore((s) => s.pressButton)
  const setComponentState = useSimStore((s) => s.setComponentState)
  const addComponent = useSimStore((s) => s.addComponent)
  const selectComponents = useSimStore((s) => s.selectComponents)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const viewOrientationEditor = useSimStore((s) => s.viewOrientationEditor)
  const components = useMemo(() => storedComponents.map((component) => viewOrientationEditor?.componentId === component.id ? {
    ...component,
    viewOrientation: viewOrientationEditor.draft,
    terminalViewPositions: viewOrientationEditor.terminalViewPositions,
    terminals: viewOrientationEditor.terminals,
    view3DScale: viewOrientationEditor.scale3D,
    view3DRenderMode: viewOrientationEditor.renderMode3D,
    bodyColor: viewOrientationEditor.bodyColor3D,
  } : component), [storedComponents, viewOrientationEditor])
  const [cameraCommand, setCameraCommand] = useState<PanelCameraCommand>({ id: 0, view: 'isometric', target: [0, 0.35, 0] })
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
  const moveCamera = (view: PanelCameraView, target: [number, number, number] = [0, 0.35, 0]) =>
    setCameraCommand((current) => ({ id: current.id + 1, view, target }))
  const toggleGrid = () => setShowGrid((current) => {
    const next = !current
    try { localStorage.setItem('dc-simu:panel3d:grid', next ? '1' : '0') } catch {}
    return next
  })

  const [showHints, setShowHints] = useState(() => {
    try {
      const saved = localStorage.getItem('dc-simu:showHints')
      return saved === null ? true : saved === '1'
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

  const railTypes = ['breaker', 'motorBreaker', 'residualBreaker', 'fuse', 'surgeProtector', 'thermalRelay', 'contactor', 'auxRelay', 'timerRelay', 'timerRelayStarDelta', 'counterRelay', 'safetyRelay', 'plcLogo', 'plcCompact', 'plcSiemensLogo1224RC', 'vfd', 'softStarter', 'transformer', 'powerSupply', 'powerSupplyProauto24A', 'terminalBlock', 'terminalPE', 'busbarPhase', 'busbarNeutral', 'earthBar', 'fuseHolder', 'auxContactBlock']

  const { positions, railWidth } = useMemo(() => {
    const rail = components.filter((c) => hasDinRailModel(c.type) || railTypes.some((t) => c.type.startsWith(t)))
    const pos: Record<string, THREE.Vector3> = {}
    let cursor = 0
    const widths = rail.map((c) => {
      const cad = getComponentModelSpec(c.type)
      if (cad?.placement === 'din-rail') return Math.max(0.12, cad.physicalSizeMm.width * 0.01)
      if (c.type.startsWith('plc')) return 1.6
      if (c.type === 'busbarPhase') return 1.8
      if (c.type.startsWith('busbar') || c.type === 'earthBar') return 1.4
      return 0.72 + c.terminals.filter((t) => t.kind === 'power-in').length * 0.06
    })
    const total = widths.reduce((a, b) => a + b + 0.14, 0)
    cursor = -total / 2
    rail.forEach((c, i) => {
      const targetHeight = getComponentModelSpec(c.type)?.targetHeight ?? 0.8
      pos[c.id] = new THREE.Vector3(cursor + widths[i] / 2, RAIL_Y + targetHeight / 2, 0)
      cursor += widths[i] + 0.14
    })
    return { positions: pos, railWidth: Math.max(6, total + 1.2) }
  }, [components])

  const railComponents = components.filter((c) => positions[c.id])
  const offRail = components.filter((c) => !positions[c.id])

  // Posiciona comandos numa régua frontal e motores com espaçamento próprio à direita.
  const front = useMemo(() => {
    const pos: Record<string, number> = {}
    let controlCursor = -Math.max(2.8, railWidth / 2 - 0.35)
    let motorEdge = railWidth / 2 + 0.4
    for (const component of offRail) {
      const spec = getComponentModelSpec(component.type)
      const physicalWidth = spec ? spec.physicalSizeMm.width * 0.01 : 0.38
      if (component.type === 'motor3ph' || component.type === 'motor1ph') {
        pos[component.id] = motorEdge + physicalWidth / 2
        motorEdge += physicalWidth + 0.4
      } else {
        pos[component.id] = controlCursor
        controlCursor += Math.max(0.46, physicalWidth + 0.12)
      }
    }
    return pos
  }, [offRail, railWidth])
  const sceneWidth = Math.max(railWidth, ...Object.values(front).map((x) => Math.abs(x) * 2 + 1.6))

  const orientationFor = (component: ElectricalComponent) => viewOrientationEditor?.componentId === component.id
    ? viewOrientationEditor.draft
    : componentOrientationOf(component)
  const wrapOriented = (component: ElectricalComponent, pivot: [number, number, number], content: ReactNode) => (
    <OrientedInstance
      key={component.id}
      c={component}
      pivot={pivot}
      orientation={orientationFor(component)}
      selected={selectedIds.includes(component.id)}
      editingTerminals={viewOrientationEditor?.componentId === component.id}
      onSelect={() => selectComponents([component.id])}
    >{content}</OrientedInstance>
  )
  const frontPivot = (component: ElectricalComponent, x: number): [number, number, number] => {
    if (component.type === 'motor3ph' || component.type === 'motor1ph') return [x, MOTOR_CENTER_Y, 0.7]
    if (component.type === 'towerLight') return [x, RAIL_Y + 1.3, 0.12]
    if (component.type === 'pilotLightAd22') return [x, RAIL_Y + 1.05, 0.4]
    if (component.type === 'ledGreen' || component.type === 'ledRed' || component.type === 'ledYellow' || component.type === 'ledWhite' || component.type === 'buzzer') return [x, RAIL_Y + 1.15, 0.12]
    if (['proximitySensor', 'photoSensor', 'pressureSwitch', 'thermostat', 'floatSwitch'].includes(component.type)) return [x, RAIL_Y + 0.9, 0.3]
    return [x, RAIL_Y + 1.05, 0.4]
  }
  const panelPivots: Record<string, THREE.Vector3> = Object.fromEntries(components.map((component) => {
    const railPosition = positions[component.id]
    const pivot = railPosition
      ? new THREE.Vector3(railPosition.x, railPosition.y, 0)
      : new THREE.Vector3(...frontPivot(component, front[component.id] ?? 0))
    return [component.id, pivot]
  }))
  const selectedComponent = selectedIds.length === 1 ? components.find((component) => component.id === selectedIds[0]) : undefined
  const selectedTarget: [number, number, number] | null = selectedComponent
    ? positions[selectedComponent.id]
      ? [positions[selectedComponent.id].x, positions[selectedComponent.id].y, 0]
      : frontPivot(selectedComponent, front[selectedComponent.id] ?? 0)
    : null
  const focusSelection = () => {
    if (selectedTarget) moveCamera('focus', selectedTarget)
  }
  const selectedDimensions = selectedComponent ? getComponentModelSpec(selectedComponent.type)?.physicalSizeMm : undefined
  const stageBackground = backgroundMode === 'white'
    ? 'bg-white'
    : backgroundMode === 'dark'
      ? 'bg-gradient-to-b from-[#111827] via-[#1f2937] to-[#0f172a]'
      : 'bg-gradient-to-b from-[#e6ebf3] via-[#f3f5f9] to-[#ccd5e2]'
  const sceneBackground = backgroundMode === 'white' ? '#ffffff' : backgroundMode === 'dark' ? '#111827' : '#e9eef5'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return
      if (event.key === 'Home' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); moveCamera('fit') }
      else if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey && selectedTarget) { event.preventDefault(); focusSelection() }
      else if (event.key.toLowerCase() === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); toggleGrid() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // O alvo é recalculado apenas quando a seleção/posição visual muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComponent?.id, selectedTarget?.[0], selectedTarget?.[1], selectedTarget?.[2]])

   return (
     <div
       className={`panel3d-stage relative w-full h-full ${stageBackground}`}
       data-embedded-in-schematic={embedded ? 'true' : undefined}
       aria-label={embedded ? 'Visualização 3D do Canvas do Esquema' : 'Painel 3D'}
       onDragOver={(e) => {
         e.preventDefault()
         e.dataTransfer.dropEffect = 'copy'
       }}
       onDrop={(e) => {
         e.preventDefault()
         const compType = e.dataTransfer.getData('text/plain') as ComponentType
         if (!compType || !hasComponent3DModel(compType)) return
         selectComponents([])
         addComponent(compType, 0, 0)
       }}
     >
      <ComponentViewEditor />
      <div className="panel3d-viewbar" role="toolbar" aria-label="Vistas e navegação do painel 3D">
        <button type="button" onClick={() => moveCamera('fit')} title="Enquadrar todo o painel (Home)">Ajustar</button>
        <button type="button" onClick={() => moveCamera('front')} title="Vista frontal">Frente</button>
        <button type="button" onClick={() => moveCamera('top')} title="Vista superior">Superior</button>
        <button type="button" onClick={() => moveCamera('isometric')} title="Vista isométrica">ISO</button>
        <button type="button" onClick={focusSelection} disabled={!selectedTarget} title="Focar o componente selecionado (F)">Focar</button>
        <button type="button" className={showGrid ? 'is-active' : ''} aria-pressed={showGrid} onClick={toggleGrid} title="Mostrar ou ocultar a grelha (G)">Grelha</button>
        <button type="button" onClick={cycleBackground} title="Alternar fundo técnico, branco e escuro">Fundo: {backgroundMode === 'technical' ? 'Técnico' : backgroundMode === 'white' ? 'Branco' : 'Escuro'}</button>
      </div>
      {selectedComponent && <div className="panel3d-model-badge">
        <span><i />MODELO 3D</span><strong>{selectedComponent.ref} · {selectedComponent.label}</strong>
        {selectedDimensions && <small>{selectedDimensions.width} × {selectedDimensions.height} × {selectedDimensions.depth} mm</small>}
        <small>Escala {Math.round(component3DScaleOf(selectedComponent).x * 100)}·{Math.round(component3DScaleOf(selectedComponent).y * 100)}·{Math.round(component3DScaleOf(selectedComponent).z * 100)}% · {selectedComponent.view3DRenderMode === 'wireframe' ? 'Arame' : selectedComponent.view3DRenderMode === 'xray' ? 'Raio-X' : 'Sólido'}</small>
      </div>}
      <Canvas shadows camera={{ position: [0.6, 2.4, 6.4], fov: 44 }} onPointerMissed={() => selectComponents([])}>
        <color attach="background" args={[sceneBackground]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 7, 5]} intensity={1.15} castShadow />
        <directionalLight position={[-5, 3, -4]} intensity={0.35} />
        {showGrid && <gridHelper args={[16, 32, '#c3cdda', '#dfe5ee']} position={[0, PANEL_FLOOR_Y, 0]} />}

        <DinRail width={railWidth} />

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
          return wrapOriented(c, [x, positions[c.id].y, 0], content)
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
          return wrapOriented(c, frontPivot(c, x), content)
        })}
        <Wires3D pivots={panelPivots} />

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

      {!components.length && <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="dc-editor-empty pointer-events-auto">
          <span className="dc-empty-kicker">{embedded ? 'ESQUEMA · VISUALIZAÇÃO 3D' : 'PAINEL 3D'}</span>
          <h2>{embedded ? 'Visualize o esquema em 3D' : 'Prepare o seu painel'}</h2>
          <p>{embedded ? 'Adicione componentes no modo 2D ou carregue um cenário; bornes e cabos aparecerão aqui nas suas posições físicas.' : 'Carregue um cenário para explorar os componentes em 3D ou adicione-os através da biblioteca.'}</p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">{SCENARIOS.slice(0, 3).map((scenario) => <button className="dc-btn" key={scenario.id} onClick={() => useSimStore.getState().loadScenario(scenario.id)}>{scenario.name}</button>)}</div>
        </div>
      </div>}

      {/* overlay HTML normal (fora do Canvas) — evita que o drei <Html> projete o botão para o centro do ecrã */}
      <div className="absolute left-2 bottom-2 flex flex-col items-start gap-1.5 z-10">
        {showHints && (
          <div className="text-[10px] text-ink-400 text-left leading-relaxed rounded-md bg-white/95 border border-line shadow-xs px-2 py-1.5 max-w-[260px]">
            <div>arraste = orbitar · scroll = aproximar/afastar</div>
            <div>Home ajusta · F foca a seleção · G alterna a grelha</div>
            <div>clique em botoeiras e sensores para acionar</div>
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
