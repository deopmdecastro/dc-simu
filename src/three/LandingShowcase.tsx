import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { finishCadMaterial } from './catalogMaterials'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { createComponent } from '../electrical/factory'
import type { ComponentType, ElectricalComponent, Terminal } from '../types'
import { getComponentModelSpec } from './modelPaths'
import { terminalWorld3D } from './terminal3D'
import { fitComponentModel } from './modelFit'
import { brushedMetal, galvanizedSteel, matteWall, polishedConcrete } from './proceduralTextures'
import MotorShaftFan3D from './MotorShaftFan3D'
import { GlowHalo } from './GlowHalo'

const UNIT = 0.0055

type Props = {
  compact?: boolean
  plcRunning?: boolean
  motorOn?: boolean
  onRunPlc?: () => void
  onStopPlc?: () => void
  onStartMotor?: () => void
  onStopMotor?: () => void
}

type ModelProps = {
  type: ComponentType
  position: [number, number, number]
  active?: boolean
  lightColor?: string
  onClick?: () => void
}

type DeviceKey = 'psu' | 'push' | 'green' | 'red' | 'plc' | 'breaker' | 'motorBreaker' | 'contactor' | 'motor'
type Point3 = [number, number, number]

type CableDefinition = {
  id: string
  from: { device: DeviceKey; terminal: string }
  to: { device: DeviceKey; terminal: string }
  color: string
  busY: number
  depth: number
  energized: 'plc' | 'motor' | 'stopped' | 'never'
}

const PLACEMENTS: Record<DeviceKey, { type: ComponentType; position: Point3 }> = {
  psu: { type: 'powerSupplyProauto24A', position: [-2.55, 0.56, 0.34] },
  push: { type: 'dualPushButtonNpb22D11', position: [-2.05, 1.44, 0.38] },
  green: { type: 'pilotLightAd22', position: [-1.48, 1.47, 0.40] },
  red: { type: 'pilotLightAd22', position: [-1.08, 1.47, 0.40] },
  plc: { type: 'plcSiemensLogo1224RC', position: [-0.55, 0.56, 0.34] },
  breaker: { type: 'breaker2p', position: [0.22, 0.58, 0.34] },
  motorBreaker: { type: 'motorBreakerPkzmC10', position: [0.72, 0.58, 0.34] },
  contactor: { type: 'contactorWegCWC09', position: [1.22, 0.58, 0.34] },
  motor: { type: 'motor3ph', position: [2.15, 0.50, 0.32] },
}

function demoComponent(type: ComponentType, ref: string, panelTerminal = false) {
  const component = createComponent(type, ref)
  if (panelTerminal) {
    component.terminals = component.terminals.map((terminal) => ({
      ...terminal,
      // Botoeiras e sinaleiros ligam no bloco de contacto traseiro do painel.
      position3D: { x: terminal.x, y: 1 - terminal.y, z: 0.08 },
    }))
  }
  return component
}

const DEMO_COMPONENTS: Record<DeviceKey, ElectricalComponent> = {
  psu: demoComponent('powerSupplyProauto24A', 'PS1'),
  push: demoComponent('dualPushButtonNpb22D11', 'S1', true),
  green: demoComponent('pilotLightAd22', 'H1', true),
  red: demoComponent('pilotLightAd22', 'H2', true),
  plc: demoComponent('plcSiemensLogo1224RC', 'PLC1'),
  breaker: demoComponent('breaker2p', 'Q0'),
  motorBreaker: demoComponent('motorBreakerPkzmC10', 'QM1'),
  contactor: demoComponent('contactorWegCWC09', 'KM1'),
  motor: demoComponent('motor3ph', 'M1'),
}

/** Circuito coerente com as três networks da demonstração. Cada extremidade
 * referencia o nome serigrafado de um borne real do respetivo componente. */
const CABLES: CableDefinition[] = [
  { id: 'psu-plc-plus', from: { device: 'psu', terminal: '+V1' }, to: { device: 'plc', terminal: 'L+' }, color: '#ef4444', busY: 1.54, depth: 0.96, energized: 'plc' },
  { id: 'psu-plc-minus', from: { device: 'psu', terminal: '-V1' }, to: { device: 'plc', terminal: 'M' }, color: '#2563eb', busY: 1.43, depth: 1.01, energized: 'plc' },
  { id: 'stop-feed', from: { device: 'psu', terminal: '+V2' }, to: { device: 'push', terminal: '21' }, color: '#dc2626', busY: 1.91, depth: 0.88, energized: 'plc' },
  { id: 'stop-input', from: { device: 'push', terminal: '22' }, to: { device: 'plc', terminal: 'I0.0' }, color: '#8b5cf6', busY: 1.82, depth: 1.08, energized: 'plc' },
  { id: 'start-feed', from: { device: 'psu', terminal: '+V2' }, to: { device: 'push', terminal: '13' }, color: '#dc2626', busY: 2.03, depth: 0.93, energized: 'plc' },
  { id: 'start-input', from: { device: 'push', terminal: '14' }, to: { device: 'plc', terminal: 'I0.1' }, color: '#a855f7', busY: 1.73, depth: 1.14, energized: 'never' },
  { id: 'q1-common', from: { device: 'psu', terminal: '+V1' }, to: { device: 'plc', terminal: 'Q0.0' }, color: '#ef4444', busY: 0.37, depth: 1.05, energized: 'plc' },
  { id: 'q1-km1', from: { device: 'plc', terminal: 'Q0.0·2' }, to: { device: 'contactor', terminal: 'A1' }, color: '#f97316', busY: 0.62, depth: 1.18, energized: 'motor' },
  { id: 'km1-return', from: { device: 'contactor', terminal: 'A2' }, to: { device: 'psu', terminal: '-V2' }, color: '#2563eb', busY: 0.25, depth: 1.11, energized: 'motor' },
  { id: 'phase-u', from: { device: 'contactor', terminal: '2T1' }, to: { device: 'motor', terminal: 'U1' }, color: '#ef4444', busY: 0.30, depth: 1.30, energized: 'motor' },
  { id: 'phase-v', from: { device: 'contactor', terminal: '4T2' }, to: { device: 'motor', terminal: 'V1' }, color: '#f8fafc', busY: 0.19, depth: 1.36, energized: 'motor' },
  { id: 'phase-w', from: { device: 'contactor', terminal: '6T3' }, to: { device: 'motor', terminal: 'W1' }, color: '#2563eb', busY: 0.08, depth: 1.42, energized: 'motor' },
  { id: 'q2-common', from: { device: 'psu', terminal: '+V1' }, to: { device: 'plc', terminal: 'Q0.1' }, color: '#ef4444', busY: 0.44, depth: 1.24, energized: 'plc' },
  { id: 'q2-h1', from: { device: 'plc', terminal: 'Q0.1·2' }, to: { device: 'green', terminal: 'X1' }, color: '#22c55e', busY: 1.24, depth: 1.22, energized: 'motor' },
  { id: 'h1-return', from: { device: 'green', terminal: 'X2' }, to: { device: 'psu', terminal: '-V1' }, color: '#2563eb', busY: 1.12, depth: 1.28, energized: 'motor' },
  { id: 'q3-common', from: { device: 'psu', terminal: '+V1' }, to: { device: 'plc', terminal: 'Q0.2' }, color: '#ef4444', busY: 0.51, depth: 1.34, energized: 'plc' },
  { id: 'q3-h2', from: { device: 'plc', terminal: 'Q0.2·2' }, to: { device: 'red', terminal: 'X1' }, color: '#ef4444', busY: 1.38, depth: 1.36, energized: 'stopped' },
  { id: 'h2-return', from: { device: 'red', terminal: 'X2' }, to: { device: 'psu', terminal: '-V2' }, color: '#2563eb', busY: 1.00, depth: 1.40, energized: 'stopped' },
  { id: 'motor-earth', from: { device: 'motor', terminal: 'PE' }, to: { device: 'psu', terminal: 'PE' }, color: '#84cc16', busY: 0.02, depth: 1.49, energized: 'never' },
]

function terminal(device: DeviceKey, label: string): { point: THREE.Vector3; terminal: Terminal } {
  const component = DEMO_COMPONENTS[device]
  const target = component.terminals.find((candidate) => candidate.label === label)
  if (!target) throw new Error(`Borne ${component.ref}.${label} em falta`)
  const placement = PLACEMENTS[device]
  const spec = getComponentModelSpec(placement.type)
  if (!spec) throw new Error(`Modelo 3D em falta para ${placement.type}`)
  const [x, y, z] = placement.position
  const pivot = new THREE.Vector3(
    x,
    y + spec.physicalSizeMm.height * UNIT / 2,
    z + spec.physicalSizeMm.depth * UNIT / 2,
  )
  return { point: terminalWorld3D(component, target, pivot), terminal: target }
}

export function preparedModel(type: ComponentType, source: THREE.Object3D) {
  const spec = getComponentModelSpec(type)
  if (!spec) throw new Error(`Modelo 3D em falta para ${type}`)
  const scene = fitComponentModel(skeletonClone(source), spec)
  const finalBox = new THREE.Box3().setFromObject(scene)
  return { scene, targetHeight: spec.targetHeight, depth: finalBox.getSize(new THREE.Vector3()).z }
}

export function cloneMaterials(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const materials = list.map((material) => {
      const finished = finishCadMaterial(material, { envMapIntensity: 1.45 })
      if (finished instanceof THREE.MeshStandardMaterial) {
        finished.envMapIntensity = Math.max(finished.envMapIntensity ?? 1, 1.25)
        // Plásticos técnicos ligeiramente mais suaves; metais mais respondentes
        if (finished.metalness > 0.55) {
          finished.roughness = Math.min(finished.roughness, 0.42)
          finished.metalness = Math.min(1, finished.metalness + 0.05)
        } else if (finished.metalness < 0.2) {
          finished.roughness = THREE.MathUtils.clamp(finished.roughness * 0.95, 0.28, 0.85)
        }
      }
      return finished
    })
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0]
  })
}

/** Atualiza apenas uniforms dos materiais. O CAD pesado não é clonado sempre
 * que START/STOP muda, o que mantém a interação fluida também em iPhone. */
export function applyModelState(root: THREE.Object3D, active: boolean, type: ComponentType, lightColor?: string) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      if (type === 'pilotLightAd22') {
        const name = material.name.toUpperCase()
        const lens = name === 'FF0000C0' || name === 'FF0000FF'
        if (lens) {
          const color = new THREE.Color(lightColor ?? '#ef4444')
          material.color.copy(color).multiplyScalar(active ? 1 : 0.14)
          material.emissive.copy(color)
          material.emissiveIntensity = active ? 5.5 : 0
          material.roughness = active ? 0.22 : 0.38
        }
      } else {
        const color = type === 'contactorWegCWC09'
          ? '#16a34a'
          : type === 'motor3ph'
            ? '#0ea5e9'
            : '#65a30d'
        material.emissive.set(active ? color : '#000000')
        material.emissiveIntensity = active
          ? type === 'contactorWegCWC09' ? 0.12 : type === 'motor3ph' ? 0.06 : 0.035
          : 0
      }
    }
  })
}

function ComponentModel({ type, position, active = false, lightColor, onClick }: ModelProps) {
  const spec = getComponentModelSpec(type)!
  const gltf = useGLTF(spec.path)
  const prepared = useMemo(() => {
    const result = preparedModel(type, gltf.scene)
    cloneMaterials(result.scene)
    applyModelState(result.scene, active, type, lightColor)
    return result
  // `active` updates the existing material uniforms below; it must not clone the CAD.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf.scene, lightColor, type])

  useEffect(() => {
    applyModelState(prepared.scene, active, type, lightColor)
  }, [active, lightColor, prepared.scene, type])

  return (
    <group
      position={[position[0], position[1] + prepared.targetHeight / 2, position[2] + prepared.depth / 2]}
      onClick={(event) => { if (onClick) { event.stopPropagation(); onClick() } }}
    >
      <primitive object={prepared.scene} />
    </group>
  )
}

/** Motor 3D com pá no veio — mesma geometria do editor (MotorShaftFan3D). */
function MotorWithFan({ position, active }: { position: Point3; active: boolean }) {
  const type = 'motor3ph' as ComponentType
  const spec = getComponentModelSpec(type)!
  const gltf = useGLTF(spec.path)
  const prepared = useMemo(() => {
    const result = preparedModel(type, gltf.scene)
    cloneMaterials(result.scene)
    applyModelState(result.scene, active, type)
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf.scene, type])

  useEffect(() => {
    applyModelState(prepared.scene, active, type)
  }, [active, prepared.scene, type])

  const fanComponent = useMemo(() => {
    const component = createComponent('motor3ph', 'M1')
    component.state = { ...component.state, rpmVisual: active ? 0.85 : 0, direction: 'cw' }
    return component
  }, [active])

  // Atualiza rpm em tempo real sem recriar o objeto
  useEffect(() => {
    fanComponent.state.rpmVisual = active ? 0.85 : 0
  }, [active, fanComponent])

  const cx = position[0]
  const cy = position[1] + prepared.targetHeight / 2
  const cz = position[2] + prepared.depth / 2
  // Pá no veio (lado direito do motor, eixo X)
  const fanOffset: Point3 = [prepared.targetHeight * 0.42, 0, 0]

  return (
    <group position={[cx, cy, cz]}>
      <primitive object={prepared.scene} />
      <group position={fanOffset} scale={0.55}>
        <MotorShaftFan3D component={fanComponent} diameterMm={110} />
      </group>
    </group>
  )
}

function Ferrule({ point, toward, color }: { point: THREE.Vector3; toward: THREE.Vector3; color: string }) {
  const { position, quaternion } = useMemo(() => {
    const direction = toward.clone().sub(point).normalize()
    return {
      position: point.clone(),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction),
    }
  }, [point, toward])
  return (
    <group position={position} quaternion={quaternion} renderOrder={17}>
      <mesh position={[0, 0.034, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.068, 12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.82} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.083, 0]}>
        <cylinderGeometry args={[0.024, 0.020, 0.030, 12]} />
        <meshStandardMaterial color={color} metalness={0.12} roughness={0.38} />
      </mesh>
    </group>
  )
}

function DemoCable({ definition, energized }: { definition: CableDefinition; energized: boolean }) {
  const geometry = useMemo(() => {
    const from = terminal(definition.from.device, definition.from.terminal)
    const to = terminal(definition.to.device, definition.to.terminal)
    // As vias horizontais correm junto à contraplaca, em pistas ligeiramente
    // separadas. Só os chicotes finais avançam até ao borne ou ao motor.
    const laneDepth = 0.52 + Math.max(0, definition.depth - 0.88) * 0.11
    const points = [
      from.point,
      new THREE.Vector3(from.point.x, definition.busY, laneDepth),
      new THREE.Vector3(to.point.x, definition.busY, laneDepth),
      to.point,
    ]
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.18)
    return { from, to, curve }
  }, [definition])

  const glowMat = useRef<THREE.MeshBasicMaterial>(null)
  const pulse = useRef<THREE.Mesh>(null)
  const pulseMat = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(({ clock }) => {
    if (!energized) {
      if (glowMat.current) glowMat.current.opacity = 0
      if (pulse.current) pulse.current.visible = false
      return
    }
    const t = clock.elapsedTime
    if (glowMat.current) glowMat.current.opacity = 0.18 + Math.sin(t * 3.2) * 0.08
    if (pulse.current && pulseMat.current) {
      pulse.current.visible = true
      const u = (t * 0.55 + (definition.depth % 1)) % 1
      const point = geometry.curve.getPoint(u)
      pulse.current.position.copy(point)
      pulseMat.current.opacity = 0.55 + Math.sin(t * 8) * 0.2
    }
  })

  return (
    <group>
      {/* Bainha exterior escura + isolamento colorido com resposta PBR */}
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[geometry.curve, 40, 0.02, 7, false]} />
        <meshStandardMaterial color="#0b1220" metalness={0.08} roughness={0.55} envMapIntensity={0.6} />
      </mesh>
      <mesh castShadow>
        <tubeGeometry args={[geometry.curve, 40, 0.0145, 7, false]} />
        <meshStandardMaterial color={definition.color} metalness={0.06} roughness={0.32} envMapIntensity={1.05} />
      </mesh>
      <mesh renderOrder={15}>
        <tubeGeometry args={[geometry.curve, 40, 0.022, 7, false]} />
        <meshBasicMaterial ref={glowMat} color="#fbbf24" transparent opacity={0} depthTest depthWrite={false} />
      </mesh>
      {/* Partícula de corrente ao longo do cabo quando energizado */}
      <mesh ref={pulse} renderOrder={16} visible={false}>
        <sphereGeometry args={[0.028, 12, 12]} />
        <meshBasicMaterial ref={pulseMat} color="#fde68a" transparent opacity={0.6} depthWrite={false} toneMapped={false} />
      </mesh>
      <Ferrule point={geometry.from.point} toward={geometry.curve.getPoint(0.04)} color={geometry.from.terminal.color} />
      <Ferrule point={geometry.to.point} toward={geometry.curve.getPoint(0.96)} color={geometry.to.terminal.color} />
    </group>
  )
}

function DinRail() {
  const metal = useMemo(() => brushedMetal([7, 1]), [])
  return (
    <group position={[0, 1.02, 0.29]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[4.45, 0.16, 0.12]} />
        <meshStandardMaterial color="#d3d9dd" metalness={0.9} roughness={0.36} map={metal.map} bumpMap={metal.bump} bumpScale={0.65} roughnessMap={metal.rough} envMapIntensity={1.45} />
      </mesh>
      <mesh position={[0, 0, 0.066]}>
        <boxGeometry args={[4.22, 0.04, 0.035]} />
        <meshStandardMaterial color="#8d979f" metalness={0.82} roughness={0.32} map={metal.map} roughnessMap={metal.rough} envMapIntensity={1.25} />
      </mesh>
      {Array.from({ length: 16 }, (_, index) => (
        <mesh key={index} position={[-2.02 + index * 0.27, 0, 0.094]}>
          <boxGeometry args={[0.12, 0.04, 0.016]} />
          <meshStandardMaterial color="#1d252b" metalness={0.36} roughness={0.56} />
        </mesh>
      ))}
    </group>
  )
}

function FixedPanel() {
  const steel = useMemo(() => galvanizedSteel([4, 3]), [])
  const plate = useMemo(() => galvanizedSteel([5, 3.5]), [])
  const concrete = useMemo(() => polishedConcrete([5, 5]), [])
  const wall = useMemo(() => matteWall([4, 2]), [])
  return (
    <group>
      {/* pavimento de betão polido com reflexo suave */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.43, 1.2]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#c4cacc" map={concrete.map} bumpMap={concrete.bump} bumpScale={0.7} roughnessMap={concrete.rough} roughness={0.48} metalness={0.09} envMapIntensity={0.78} />
      </mesh>
      {/* parede técnica atrás do quadro */}
      <mesh position={[0, 3, -0.6]} receiveShadow>
        <planeGeometry args={[14, 7]} />
        <meshStandardMaterial color="#d7dfdc" map={wall.map} bumpMap={wall.bump} bumpScale={0.35} roughnessMap={wall.rough} roughness={0.7} envMapIntensity={0.5} />
      </mesh>
      {/* caixa metálica */}
      <mesh position={[0, 1.27, 0]} receiveShadow castShadow>
        <boxGeometry args={[4.9, 3.35, 0.22]} />
        <meshStandardMaterial color="#c7d0d5" map={steel.map} bumpMap={steel.bump} bumpScale={0.65} roughnessMap={steel.rough} roughness={0.4} metalness={0.62} envMapIntensity={1.25} />
      </mesh>
      {/* contraplaca perfurada */}
      <mesh position={[0, 1.27, 0.13]} receiveShadow>
        <boxGeometry args={[4.72, 3.17, 0.05]} />
        <meshStandardMaterial color="#dfe6e4" map={plate.map} bumpMap={plate.bump} bumpScale={1.05} roughnessMap={plate.rough} roughness={0.44} metalness={0.38} envMapIntensity={1.12} />
      </mesh>
      <DinRail />
      {[[2.28, 2.72], [-2.28, 2.72], [2.28, -0.18], [-2.28, -0.18]].map(([x, y], index) => (
        <group key={index} position={[x, y, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.055, 0.055, 0.04, 6]} />
            <meshStandardMaterial color="#6b757d" metalness={0.92} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.022, 0]}>
            <cylinderGeometry args={[0.026, 0.026, 0.006, 6]} />
            <meshStandardMaterial color="#20262b" metalness={0.5} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Alvo e direção de câmara do showcase: o enquadramento ajusta-se ao formato do ecrã para o motor e a fonte nunca ficarem cortados. */
const SHOWCASE_TARGET = new THREE.Vector3(0.35, 1.2, 0.38)
const SHOWCASE_DIR = new THREE.Vector3(1.1, 1.9, 9.8).normalize()
const SHOWCASE_WIDTH = 7.6
const SHOWCASE_HEIGHT = 4.7

function useShowcaseFit(touched: MutableRefObject<boolean>) {
  const size = useThree((state) => state.size)
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const aspect = Math.max(0.5, size.width / Math.max(1, size.height))
  const halfTan = Math.tan((camera.fov * Math.PI) / 360)
  const fit = Math.max(SHOWCASE_WIDTH / 2 / (halfTan * aspect), SHOWCASE_HEIGHT / 2 / halfTan) * 1.04
  useLayoutEffect(() => {
    if (touched.current) return
    camera.position.copy(SHOWCASE_TARGET).addScaledVector(SHOWCASE_DIR, fit)
    camera.lookAt(SHOWCASE_TARGET)
    camera.updateProjectionMatrix()
  }, [camera, fit, touched])
  return fit
}


/** Sinaleiro com lente emissiva + halo aditivo realista (mesmo GlowHalo do editor). */
function PilotLightWithGlow({ position, active, color }: { position: Point3; active: boolean; color: string; label?: string }) {
  const group = useRef<THREE.Group>(null)
  return (
    <group ref={group} position={[0, 0, 0]}>
      <ComponentModel type="pilotLightAd22" position={position} active={active} lightColor={color} />
      {/* Halo encostado diretamente ao vidro exterior da lente (ancoragem bottom: y +0,1465, z +0,258) */}
      <group position={[position[0], position[1] + 0.1465, position[2] + 0.258]}>
        <GlowHalo color={color} on={active} radius={0.095} kind="lamp" castLight />
      </group>
    </group>
  )
}

/** LCD monocromático do LOGO! — texto RUN/STOP e saídas, como no painel real. */
function PlcLcdOverlay({ position, plcActive, motorActive }: { position: Point3; plcActive: boolean; motorActive: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    const draw = (running: boolean, motor: boolean) => {
      ctx.fillStyle = running ? '#1a3d18' : '#0a120a'
      ctx.fillRect(0, 0, 256, 128)
      // scanlines
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      for (let y = 0; y < 128; y += 3) ctx.fillRect(0, y, 256, 1)
      ctx.font = 'bold 28px ui-monospace, monospace'
      ctx.fillStyle = running ? '#b6f5a8' : '#3d5c3a'
      ctx.fillText(running ? 'RUN' : 'STOP', 16, 40)
      ctx.font = '18px ui-monospace, monospace'
      ctx.fillStyle = running ? '#8fdc82' : '#2f4a2d'
      ctx.fillText(running ? (motor ? 'Q1 Q2  ON' : 'Q3 ON') : 'Q1..Q3 OFF', 16, 72)
      ctx.fillText(running ? (motor ? 'M1 MARCHA' : 'M1 PARADO') : 'CPU STOP', 16, 100)
    }
    draw(plcActive, motorActive)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.needsUpdate = true
    ;(map as THREE.CanvasTexture & { __draw?: typeof draw }).__draw = draw
    return map
  }, [])

  useEffect(() => {
    const draw = (texture as THREE.CanvasTexture & { __draw?: (r: boolean, m: boolean) => void }).__draw
    if (!draw) return
    const canvas = texture.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    draw(plcActive, motorActive)
    texture.needsUpdate = true
  }, [plcActive, motorActive, texture])

  // Posição aproximada do visor no LOGO! 12/24RC (frente +Z)
  const spec = getComponentModelSpec('plcSiemensLogo1224RC')!
  const cx = position[0]
  const cy = position[1] + spec.targetHeight * 0.62
  const cz = position[2] + 0.22
  return (
    <mesh position={[cx, cy, cz]} renderOrder={20}>
      <planeGeometry args={[0.28, 0.14]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

/** Contactor: micro-vibração e pulso de emissivo quando engatado. */
function ContactorLive({ position, active }: { position: Point3; active: boolean }) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!group.current) return
    if (active) {
      const buzz = Math.sin(clock.elapsedTime * 48) * 0.0018
      group.current.position.y = position[1] + buzz
    } else {
      group.current.position.y = position[1]
    }
  })
  return (
    <group ref={group} position={[position[0], position[1], position[2]]}>
      <ComponentModel type="contactorWegCWC09" position={[0, 0, 0]} active={active} />
    </group>
  )
}

function ShowcaseScene({ plcRunning, motorOn, onRunPlc, onStopPlc, onStartMotor, onStopMotor }: Omit<Props, 'compact'>) {

  const plcActive = plcRunning ?? true
  const motorActive = plcActive && (motorOn ?? true)
  const stoppedActive = plcActive && !motorActive
  const touched = useRef(false)
  const fit = useShowcaseFit(touched)

  return (
    <>
      <color attach="background" args={['#dce4e2']} />
      <fog attach="fog" args={['#dce4e2', 18, 34]} />
      <ambientLight intensity={0.68} />
      <directionalLight position={[4, 6, 6]} intensity={2.05} />
      <directionalLight position={[-4, 2, 3]} intensity={0.38} color="#b9d8ff" />
      <FixedPanel />

      <ComponentModel type="powerSupplyProauto24A" position={PLACEMENTS.psu.position} active={plcActive} />
      <ComponentModel
        type="dualPushButtonNpb22D11"
        position={PLACEMENTS.push.position}
        active={motorActive}
        onClick={() => {
          if (!plcActive) onRunPlc?.()
          else if (motorActive) onStopMotor?.()
          else onStartMotor?.()
        }}
      />
      <PilotLightWithGlow position={PLACEMENTS.green.position} active={motorActive} color="#22c55e" label="H1" />
      <PilotLightWithGlow position={PLACEMENTS.red.position} active={stoppedActive} color="#ef4444" label="H2" />
      <ComponentModel type="plcSiemensLogo1224RC" position={PLACEMENTS.plc.position} active={plcActive} onClick={plcActive ? onStopPlc : onRunPlc} />
      <PlcLcdOverlay position={PLACEMENTS.plc.position} plcActive={plcActive} motorActive={motorActive} />
      <ComponentModel type="breaker2p" position={PLACEMENTS.breaker.position} active={plcActive} />
      <ComponentModel type="motorBreakerPkzmC10" position={PLACEMENTS.motorBreaker.position} active={plcActive || motorActive} />
      <ContactorLive position={PLACEMENTS.contactor.position} active={motorActive} />
      <MotorWithFan position={PLACEMENTS.motor.position} active={motorActive} />

      {CABLES.map((definition) => {
        const energized = definition.energized === 'plc'
          ? plcActive
          : definition.energized === 'motor'
            ? motorActive
            : definition.energized === 'stopped'
              ? stoppedActive
              : false
        return <DemoCable key={definition.id} definition={definition} energized={energized} />
      })}

      <Environment preset="warehouse" environmentIntensity={1.15} />
      <ContactShadows
        position={[0, 0.01, 0.6]}
        opacity={0.45}
        scale={12}
        blur={2.4}
        far={8}
        resolution={512}
        color="#1e293b"
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        enableRotate
        enableDamping={false}
        onStart={() => { touched.current = true }}
        minDistance={fit * 0.62}
        maxDistance={fit * 1.2}
        // Limites: nunca por trás da parede nem por baixo do pavimento (vistas escuras/cortadas).
        minPolarAngle={0.55}
        maxPolarAngle={Math.PI / 2 + 0.04}
        minAzimuthAngle={-0.85}
        maxAzimuthAngle={0.85}
        target={SHOWCASE_TARGET}
      />
    </>
  )
}

/** Painel funcional da landing: modelos reais, bornes físicos, cabos com
 * ponteiras e o mesmo brilho/fluxo de corrente utilizado no editor 3D. */
export default function LandingShowcase(props: Props) {
  const plcActive = props.plcRunning ?? true
  const motorActive = plcActive && (props.motorOn ?? true)
  const stoppedActive = plcActive && !motorActive
  const hasControls = !!(props.onRunPlc || props.onStopPlc || props.onStartMotor || props.onStopMotor)

  return (
    <div className="dx-showcase-wrap">
      <Canvas
        frameloop={(props.plcRunning !== false) ? "always" : "demand"}
        dpr={[1, props.compact ? 1.25 : 1.5]}
        camera={{ position: props.compact ? [1.45, 3.15, 10.15] : [1.45, 3.00, 7.75], fov: props.compact ? 41 : 35, near: 0.1, far: 100 }}
        gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.02
        }}
      >
        <Suspense fallback={null}>
          <ShowcaseScene {...props} />
        </Suspense>
      </Canvas>
      <div className="dx-showcase-state" data-running={motorActive ? 'true' : 'false'} aria-live="polite">
        <b>LOGO! {plcActive ? 'RUN' : 'STOP'}</b>
        <span>{motorActive ? 'Q0 · QM1 · KM1 · M1 ativos' : stoppedActive ? 'Q3 · H2 motor parado' : 'saídas desenergizadas'}</span>
        <small>{motorActive ? 'H1 verde · disjuntor-motor ligado' : stoppedActive ? 'H2 vermelho · proteções prontas' : 'H1/H2 desligados'}</small>
      </div>
      <div className="dx-showcase-legend" aria-label="Estado dos sinaleiros">
        <span className="is-green" data-on={motorActive ? 'true' : 'false'}><i />H1 · MARCHA</span>
        <span className="is-red" data-on={stoppedActive ? 'true' : 'false'}><i />H2 · PARADO</span>
      </div>
      {hasControls && (
        <div className="dx-showcase-controls">
          <button type="button" className="is-run" disabled={plcActive} onClick={props.onRunPlc}>RUN</button>
          <button type="button" className="is-stop" disabled={!plcActive} onClick={props.onStopPlc}>PLC STOP</button>
          <button type="button" className="is-start" disabled={!plcActive || motorActive} onClick={props.onStartMotor}>START</button>
          <button type="button" className="is-stop" disabled={!motorActive} onClick={props.onStopMotor}>STOP</button>
        </div>
      )}
    </div>
  )
}
