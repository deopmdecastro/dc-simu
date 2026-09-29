import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Line, useGLTF } from '@react-three/drei'
import { useRef, useMemo, useState, useEffect, Suspense, Component } from 'react'
import type { ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import { terminalPos } from '../schematic/symbols'
import { SCENARIOS } from '../simulation/scenarios'
import { IconHelp } from '../ui/icons'
import type { ElectricalComponent, ComponentType } from '../types'
import * as THREE from 'three'
import { getCommandModelSpec, getComponentModelSpec, hasComponent3DModel, hasDinRailModel, MODEL_PATHS } from './modelPaths'
import { componentOrientationOf, orientationRadians } from './componentOrientation'
import ComponentViewEditor from '../components/ComponentViewEditor'

const SLOT_WIDTH = 0.72
const RAIL_Y = 0.4

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
const LOGO_1224RC_MODEL_URL = MODEL_PATHS.plcSiemensLogo1224RC
// O export do SolidWorks vem com Z para cima; o three.js usa Y para cima.
// Confirmado por análise da geometria (posição dos parafusos dos bornes de
// entrada/saída e do ecrã): rodar +90° em torno de X coloca o topo real do
// aparelho para cima, a base para baixo, e a frente (ecrã à esquerda,
// ESC/OK/setas à direita) virada para a câmara — sem inverter nada.
const LOGO_1224RC_ROTATION: [number, number, number] = [Math.PI / 2, 0, 0]
// Altura alvo (unidades da cena), semelhante à dos outros aparelhos de calha (disjuntores ~0.7-0.9).
const LOGO_1224RC_TARGET_HEIGHT = 0.9

function OrientedInstance({ c, pivot, orientation, selected, onSelect, children }: {
  c: ElectricalComponent
  pivot: [number, number, number]
  orientation: ElectricalComponent['viewOrientation']
  selected: boolean
  onSelect: () => void
  children: ReactNode
}) {
  const rotation = orientationRadians(orientation)
  return <group position={pivot} rotation={rotation} onClick={(event) => { event.stopPropagation(); onSelect() }}>
    <group position={[-pivot[0], -pivot[1], -pivot[2]]}>{children}</group>
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

/** Modelo Proauto: eixos Y-up/+Z-frente confirmados no GLB; sem rotação. */
function ProautoReal3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const { scene } = useGLTF(MODEL_PATHS.powerSupplyProauto24A)
  const model = useMemo(() => {
    const obj = scene.clone(true)
    obj.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(obj)
    const height = bounds.max.y - bounds.min.y
    obj.scale.setScalar(height > 0 ? 1.1 / height : 1)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    obj.position.set(-center.x, -box.min.y, -center.z)
    return obj
  }, [scene])
  return <group position={[x, RAIL_Y, 0]}>
    <primitive object={model} castShadow receiveShadow />
    <Label text={c.ref} position={[0, 1.2, 0.25]} color="#e2e8f0" />
  </group>
}

/**
 * Contator WEG CWC07/CWC09 10E — modelo CAD real do fabricante. O GLB está
 * em Y-up, mas a face frontal está voltada para -Z. Refletimos só a profundidade
 * para apresentar a frente à câmara (+Z), mantendo os bornes na mesma ordem.
 */
function WegContactorReal3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const { scene } = useGLTF(MODEL_PATHS.wegContactorCWC09)
  const model = useMemo(() => {
    const obj = scene.clone(true)
    // Materiais clonados: o estado de um contator nunca deve alterar os outros modelos.
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((mat) => mat.clone()) : mesh.material.clone()
    })
    obj.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(obj)
    const height = bounds.max.y - bounds.min.y
    const scale = height > 0 ? 0.92 / height : 1
    obj.scale.set(scale, scale, -scale)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    obj.position.set(-center.x, -box.min.y, -center.z)
    return obj
  }, [scene])
  const en = !!c.state.energized
  return <group position={[x, RAIL_Y, 0]}>
    <primitive object={model} castShadow receiveShadow />
    {/* Sem partes móveis separadas no CAD: a bobina energizada acende o
        contorno e a etiqueta muda de cor, como no restante painel. */}
    {en && <pointLight color="#22c55e" intensity={0.22} distance={1.3} position={[0, 0.5, 0.35]} />}
    <Label text={c.ref} position={[0, 1.08, 0.24]} color={en ? '#4ade80' : '#e2e8f0'} />
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
    // O diâmetro de montagem do botão é ~22 mm; enquadra-o à mesma escala
    // visual dos restantes botões do painel, sem distorcer o CAD.
    const diameter = Math.max(size.x, size.y)
    obj.scale.setScalar(diameter > 0 ? 0.38 / diameter : 1)
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
    <Label text={c.ref} position={[0, 0.28, 0.08]} />
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
    const scale = spec.targetHeight / (Math.max(size.x, size.y) || 1)
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

function Motor3D({ c }: { c: ElectricalComponent }) {
  const running = !!c.state.running
  const dir = c.state.direction
  const fanRef = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (fanRef.current && c.state.rpmVisual > 0) {
      const speed = (dir === 'ccw' ? -1 : 1) * c.state.rpmVisual * 9
      fanRef.current.rotation.x += speed * delta
    }
  })
  return (
    <group position={[2.4, -0.75, 0.7]}>
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
      <mesh ref={fanRef} position={[0.57, 0, 0]}>
        <boxGeometry args={[0.05, 0.42, 0.42]} />
        <meshStandardMaterial color={running ? '#60a5fa' : '#334155'} />
      </mesh>
      <mesh position={[-0.68, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.32, 14]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.65} />
      </mesh>
      <mesh position={[0, -0.62, 0]} receiveShadow>
        <boxGeometry args={[1.3, 0.08, 0.9]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      <Text position={[0, 0.72, 0]} fontSize={0.12} color="#e5e7eb" anchorX="center">
        {`${c.ref} ${running ? (dir === 'cw' ? '(horário ↻)' : '(anti-horário ↺)') : '(parado)'}`}
      </Text>
    </group>
  )
}

/* ------------------------------------------------------------------ cabos 3D */

function Wires3D({ positions }: { positions: Record<string, THREE.Vector3> }) {
  const wires = useSimStore((s) => s.wires)
  const components = useSimStore((s) => s.components)

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
    for (const c of components) {
      const t = c.terminals.find((x) => x.id === terminalId)
      if (!t) continue
      const base = positions[c.id]
      if (!base) {
        // componentes fora do trilho (botões, sinaleiros): usa a posição do esquema
        return [c.schematicX / 300 - 2.6, RAIL_Y + 0.6, 0.4]
      }
      const p = terminalPos(c, t)
      return [base.x, base.y + (t.kind === 'power-in' || t.kind === 'coil-plus' ? 0.32 : -0.32), t.y < 0.5 ? 0.28 : -0.05]
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
function PanelCameraRig({ command, railWidth }: { command: PanelCameraCommand; railWidth: number }) {
  const { camera, size } = useThree()
  const controlsRef = useRef<any>(null)
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
  }, [camera, command, railWidth, size.height, size.width])
  return <OrbitControls ref={controlsRef} minDistance={1.2} maxDistance={24} enableDamping dampingFactor={0.08} makeDefault />
}

export default function Panel3D() {
  const components = useSimStore((s) => s.components)
  const pressButton = useSimStore((s) => s.pressButton)
  const setComponentState = useSimStore((s) => s.setComponentState)
  const addComponent = useSimStore((s) => s.addComponent)
  const selectComponents = useSimStore((s) => s.selectComponents)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const viewOrientationEditor = useSimStore((s) => s.viewOrientationEditor)
  const [cameraCommand, setCameraCommand] = useState<PanelCameraCommand>({ id: 0, view: 'isometric', target: [0, 0.35, 0] })
  const [showGrid, setShowGrid] = useState(() => {
    try { return localStorage.getItem('dc-simu:panel3d:grid') !== '0' } catch { return true }
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
      if (c.type === 'terminalPhoenixPti6' || c.type === 'terminalPE') return 0.34
      if (c.type === 'safetyRelay' || c.type === 'breakerWegMdwC10') return 0.48
      if (c.type === 'siemensTsAdapterIeBasic') return 0.62
      if (c.type.startsWith('plc')) return c.type === 'plcLsXbmDn32s' ? 1.42 : 1.6
      if (c.type === 'contactorWegCWC09') return 1.15
      if (c.type === 'busbarPhase') return 1.8
      if (c.type.startsWith('busbar') || c.type === 'earthBar') return 1.4
      return 0.72 + c.terminals.filter((t) => t.kind === 'power-in').length * 0.06
    })
    const total = widths.reduce((a, b) => a + b + 0.14, 0)
    cursor = -total / 2
    rail.forEach((c, i) => {
      pos[c.id] = new THREE.Vector3(cursor + widths[i] / 2, RAIL_Y + 0.4, 0)
      cursor += widths[i] + 0.14
    })
    return { positions: pos, railWidth: Math.max(6, total + 1.2) }
  }, [components])

  const railComponents = components.filter((c) => positions[c.id])
  const offRail = components.filter((c) => !positions[c.id])

  // posiciona botões, sinaleiros e sensores numa régua frontal
  const front = useMemo(() => {
    const pos: Record<string, number> = {}
    let cursor = -3.4
    for (const c of offRail) pos[c.id] = (cursor += 0.5)
    return pos
  }, [offRail])

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
      onSelect={() => selectComponents([component.id])}
    >{content}</OrientedInstance>
  )
  const frontPivot = (component: ElectricalComponent, x: number): [number, number, number] => {
    if (component.type === 'motor3ph' || component.type === 'motor1ph') return [2.4, -0.75, 0.7]
    if (component.type === 'towerLight') return [x, RAIL_Y + 1.3, 0.12]
    if (component.type === 'ledGreen' || component.type === 'ledRed' || component.type === 'ledYellow' || component.type === 'ledWhite' || component.type === 'buzzer') return [x, RAIL_Y + 1.15, 0.12]
    if (['proximitySensor', 'photoSensor', 'pressureSwitch', 'thermostat', 'floatSwitch'].includes(component.type)) return [x, RAIL_Y + 0.9, 0.3]
    return [x, RAIL_Y + 1.05, 0.4]
  }
  const selectedComponent = selectedIds.length === 1 ? components.find((component) => component.id === selectedIds[0]) : undefined
  const selectedTarget: [number, number, number] | null = selectedComponent
    ? positions[selectedComponent.id]
      ? [positions[selectedComponent.id].x, RAIL_Y + 0.4, 0]
      : frontPivot(selectedComponent, front[selectedComponent.id] ?? 0)
    : null
  const focusSelection = () => {
    if (selectedTarget) moveCamera('focus', selectedTarget)
  }

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
       className="panel3d-stage relative w-full h-full bg-gradient-to-b from-[#e6ebf3] via-[#f3f5f9] to-[#ccd5e2]"
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
      </div>
      <Canvas shadows camera={{ position: [0.6, 2.4, 6.4], fov: 44 }} onPointerMissed={() => selectComponents([])}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 7, 5]} intensity={1.15} castShadow />
        <directionalLight position={[-5, 3, -4]} intensity={0.35} />
        {showGrid && <gridHelper args={[16, 32, '#c3cdda', '#dfe5ee']} position={[0, -2.6, 0]} />}

        <DinRail width={railWidth} />

        {railComponents.map((c) => {
          const x = positions[c.id].x
          let content: ReactNode
          if (c.type === 'thermalRelay') content = <ThermalRelay3D c={c} x={x} />
          else if (hasDinRailModel(c.type)) {
            const fallback = c.type === 'phoenixEcb3000760' ? <PhoenixEcb3D c={c} x={x} /> : <Breaker3D c={c} x={x} />
            content = <Model3DErrorBoundary fallback={fallback}><Suspense fallback={fallback}><CadComponentReal3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          } else if (c.type === 'contactorWegCWC09') content = <Model3DErrorBoundary fallback={<Contactor3D c={c} x={x} />}><Suspense fallback={<Contactor3D c={c} x={x} />}><WegContactorReal3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          else if (c.type.startsWith('contactor')) content = <Contactor3D c={c} x={x} />
          else if (c.type === 'powerSupplyProauto24A') content = <Model3DErrorBoundary fallback={<PowerSupply3D c={c} x={x} />}><Suspense fallback={<PowerSupply3D c={c} x={x} />}><ProautoReal3D c={c} x={x} /></Suspense></Model3DErrorBoundary>
          else if (c.type === 'powerSupply') content = <PowerSupply3D c={c} x={x} />
          else if (c.type.startsWith('plc')) content = <PLC3D c={c} x={x} />
          else if (c.type === 'vfd' || c.type === 'softStarter') content = <Drive3D c={c} x={x} />
          else content = <Breaker3D c={c} x={x} />
          return wrapOriented(c, [x, RAIL_Y + 0.4, 0], content)
        })}

        {offRail.map((c) => {
          const x = front[c.id]
          let content: ReactNode
          if (c.type === 'ledGreen' || c.type === 'ledRed' || c.type === 'ledYellow' || c.type === 'ledWhite' || c.type === 'buzzer') content = <Lamp3D c={c} x={x} />
          else if (c.type === 'towerLight') content = <TowerLight3D c={c} x={x} />
          else if (c.type === 'motor3ph' || c.type === 'motor1ph') content = <Motor3D c={c} />
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
        <Wires3D positions={positions} />

        <PanelCameraRig command={cameraCommand} railWidth={railWidth} />
      </Canvas>

      {!components.length && <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="dc-editor-empty pointer-events-auto">
          <span className="dc-empty-kicker">PAINEL 3D</span>
          <h2>Prepare o seu painel</h2>
          <p>Carregue um cenário para explorar os componentes em 3D ou adicione-os através da biblioteca.</p>
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
