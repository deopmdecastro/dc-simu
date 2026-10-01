import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { createComponent } from '../electrical/factory'
import type { ComponentType, ElectricalComponent, Terminal } from '../types'
import { getComponentModelSpec } from './modelPaths'
import { terminalWorld3D } from './terminal3D'
import { brushedMetal, galvanizedSteel, matteWall, polishedConcrete } from './proceduralTextures'

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

type DeviceKey = 'psu' | 'push' | 'green' | 'red' | 'plc' | 'contactor' | 'motor'
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

const MODEL_TYPES: ComponentType[] = [
  'plcSiemensLogo1224RC',
  'powerSupplyProauto24A',
  'dualPushButtonNpb22D11',
  'contactorWegCWC09',
  'motor3ph',
  'pilotLightAd22',
]

const PLACEMENTS: Record<DeviceKey, { type: ComponentType; position: Point3 }> = {
  psu: { type: 'powerSupplyProauto24A', position: [-2.34, 0.56, 0.34] },
  push: { type: 'dualPushButtonNpb22D11', position: [-1.92, 1.44, 0.38] },
  green: { type: 'pilotLightAd22', position: [-1.38, 1.47, 0.40] },
  red: { type: 'pilotLightAd22', position: [-0.98, 1.47, 0.40] },
  plc: { type: 'plcSiemensLogo1224RC', position: [-0.48, 0.56, 0.34] },
  contactor: { type: 'contactorWegCWC09', position: [0.68, 0.58, 0.34] },
  motor: { type: 'motor3ph', position: [1.72, 0.50, 0.32] },
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
  contactor: demoComponent('contactorWegCWC09', 'KM1'),
  motor: demoComponent('motor3ph', 'M1'),
}

/** Circuito coerente com as três networks da demonstração. Cada extremidade
 * referencia o nome serigrafado de um borne real do respetivo componente. */
const CABLES: CableDefinition[] = [
  { id: 'psu-plc-plus', from: { device: 'psu', terminal: '+V1' }, to: { device: 'plc', terminal: 'L+' }, color: '#ef4444', busY: 1.54, depth: 0.96, energized: 'plc' },
  { id: 'psu-plc-minus', from: { device: 'psu', terminal: '-V1' }, to: { device: 'plc', terminal: 'M' }, color: '#2563eb', busY: 1.43, depth: 1.01, energized: 'plc' },
  { id: 'stop-feed', from: { device: 'psu', terminal: '+V2' }, to: { device: 'push', terminal: '21' }, color: '#dc2626', busY: 1.91, depth: 0.88, energized: 'plc' },
  { id: 'stop-input', from: { device: 'push', terminal: '22' }, to: { device: 'plc', terminal: 'I1' }, color: '#8b5cf6', busY: 1.82, depth: 1.08, energized: 'plc' },
  { id: 'start-feed', from: { device: 'psu', terminal: '+V2' }, to: { device: 'push', terminal: '13' }, color: '#dc2626', busY: 2.03, depth: 0.93, energized: 'plc' },
  { id: 'start-input', from: { device: 'push', terminal: '14' }, to: { device: 'plc', terminal: 'I2' }, color: '#a855f7', busY: 1.73, depth: 1.14, energized: 'never' },
  { id: 'q1-common', from: { device: 'psu', terminal: '+V1' }, to: { device: 'plc', terminal: 'Q1' }, color: '#ef4444', busY: 0.37, depth: 1.05, energized: 'plc' },
  { id: 'q1-km1', from: { device: 'plc', terminal: 'Q1.2' }, to: { device: 'contactor', terminal: 'A1' }, color: '#f97316', busY: 0.62, depth: 1.18, energized: 'motor' },
  { id: 'km1-return', from: { device: 'contactor', terminal: 'A2' }, to: { device: 'psu', terminal: '-V2' }, color: '#2563eb', busY: 0.25, depth: 1.11, energized: 'motor' },
  { id: 'phase-u', from: { device: 'contactor', terminal: '2T1' }, to: { device: 'motor', terminal: 'U1' }, color: '#ef4444', busY: 0.30, depth: 1.30, energized: 'motor' },
  { id: 'phase-v', from: { device: 'contactor', terminal: '4T2' }, to: { device: 'motor', terminal: 'V1' }, color: '#f8fafc', busY: 0.19, depth: 1.36, energized: 'motor' },
  { id: 'phase-w', from: { device: 'contactor', terminal: '6T3' }, to: { device: 'motor', terminal: 'W1' }, color: '#2563eb', busY: 0.08, depth: 1.42, energized: 'motor' },
  { id: 'q2-common', from: { device: 'psu', terminal: '+V1' }, to: { device: 'plc', terminal: 'Q2' }, color: '#ef4444', busY: 0.44, depth: 1.24, energized: 'plc' },
  { id: 'q2-h1', from: { device: 'plc', terminal: 'Q2.2' }, to: { device: 'green', terminal: 'X1' }, color: '#22c55e', busY: 1.24, depth: 1.22, energized: 'motor' },
  { id: 'h1-return', from: { device: 'green', terminal: 'X2' }, to: { device: 'psu', terminal: '-V1' }, color: '#2563eb', busY: 1.12, depth: 1.28, energized: 'motor' },
  { id: 'q3-common', from: { device: 'psu', terminal: '+V1' }, to: { device: 'plc', terminal: 'Q3' }, color: '#ef4444', busY: 0.51, depth: 1.34, energized: 'plc' },
  { id: 'q3-h2', from: { device: 'plc', terminal: 'Q3.2' }, to: { device: 'red', terminal: 'X1' }, color: '#ef4444', busY: 1.38, depth: 1.36, energized: 'stopped' },
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

function preparedModel(type: ComponentType, source: THREE.Object3D) {
  const spec = getComponentModelSpec(type)
  if (!spec) throw new Error(`Modelo 3D em falta para ${type}`)
  const scene = skeletonClone(source)
  scene.position.set(0, 0, 0)
  scene.rotation.set(...spec.rotation)
  scene.scale.set(1, 1, spec.flipDepth ? -1 : 1)
  scene.updateMatrixWorld(true)
  const initial = new THREE.Box3().setFromObject(scene)
  const size = initial.getSize(new THREE.Vector3())
  const scale = size.y > 0 ? spec.targetHeight / size.y : 1
  scene.scale.multiplyScalar(scale)
  scene.updateMatrixWorld(true)
  const normalized = new THREE.Box3().setFromObject(scene)
  const center = normalized.getCenter(new THREE.Vector3())
  scene.position.set(-center.x, -center.y, -center.z)
  scene.updateMatrixWorld(true)
  const finalBox = new THREE.Box3().setFromObject(scene)
  return { scene, targetHeight: spec.targetHeight, depth: finalBox.getSize(new THREE.Vector3()).z }
}

function cloneMaterials(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const materials = list.map((material) => {
      const cloned = material.clone()
      if (cloned instanceof THREE.MeshStandardMaterial) {
        cloned.roughness = THREE.MathUtils.clamp(cloned.roughness * 0.76, 0.18, 0.7)
        cloned.envMapIntensity = Math.max(cloned.envMapIntensity, 1.12)
        if (!cloned.map && cloned.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.82) cloned.color.lerp(new THREE.Color('#c8d2dc'), 0.28)
        cloned.needsUpdate = true
      }
      return cloned
    })
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0]
  })
}

/** Atualiza apenas uniforms dos materiais. O CAD pesado não é clonado sempre
 * que START/STOP muda, o que mantém a interação fluida também em iPhone. */
function applyModelState(root: THREE.Object3D, active: boolean, type: ComponentType, lightColor?: string) {
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

function EnergyFlow({ curve, color = '#fde047' }: { curve: THREE.Curve<THREE.Vector3>; color?: string }) {
  const particles = useRef<Array<THREE.Mesh | null>>([])
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const count = 6

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime()
    if (material.current) material.current.opacity = 0.64 + Math.sin(elapsed * 5) * 0.18
    for (let index = 0; index < count; index++) {
      const particle = particles.current[index]
      if (!particle) continue
      particle.position.copy(curve.getPoint((elapsed * 0.30 + index / count) % 1))
      const pulse = 0.86 + Math.sin(elapsed * 7 + index) * 0.18
      particle.scale.setScalar(pulse)
    }
  })

  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <mesh key={index} ref={(node) => { particles.current[index] = node }} renderOrder={18}>
          <sphereGeometry args={[0.013, 10, 10]} />
          <meshBasicMaterial ref={index === 0 ? material : undefined} color={color} transparent opacity={0.76} depthTest depthWrite={false} />
        </mesh>
      ))}
    </>
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
    return { from, to, curve, line: curve.getPoints(56) }
  }, [definition])

  return (
    <group>
      {/* Cabos físicos: tubos finos com profundidade real. Ao contrário das linhas
          sempre visíveis, ficam corretamente ocultos atrás de equipamentos. */}
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[geometry.curve, 48, 0.019, 7, false]} />
        <meshStandardMaterial color="#101722" metalness={0.04} roughness={0.42} />
      </mesh>
      <mesh castShadow>
        <tubeGeometry args={[geometry.curve, 48, 0.014, 7, false]} />
        <meshStandardMaterial color={definition.color} metalness={0.03} roughness={0.34} envMapIntensity={0.8} />
      </mesh>
      {energized && (
        <>
          <mesh renderOrder={15}>
            <tubeGeometry args={[geometry.curve, 48, 0.021, 7, false]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.12} depthTest depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <EnergyFlow curve={geometry.curve} />
        </>
      )}
      <Ferrule point={geometry.from.point} toward={geometry.line[1]} color={geometry.from.terminal.color} />
      <Ferrule point={geometry.to.point} toward={geometry.line[geometry.line.length - 2]} color={geometry.to.terminal.color} />
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
      <ambientLight intensity={0.48} />
      <hemisphereLight args={['#f8fbff', '#43524f', 0.86]} />
      <directionalLight position={[4, 6, 6]} intensity={2.05} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 2, 3]} intensity={0.48} color="#b9d8ff" />
      <pointLight position={[0, 3.8, 3.2]} intensity={0.7} color="#fff4dd" distance={12} />
      <FixedPanel />

      <ComponentModel type="powerSupplyProauto24A" position={PLACEMENTS.psu.position} active={plcActive} />
      <ComponentModel type="dualPushButtonNpb22D11" position={PLACEMENTS.push.position} active={motorActive} onClick={motorActive ? onStopMotor : onStartMotor} />
      <ComponentModel type="pilotLightAd22" position={PLACEMENTS.green.position} active={motorActive} lightColor="#22c55e" />
      <ComponentModel type="pilotLightAd22" position={PLACEMENTS.red.position} active={stoppedActive} lightColor="#ef4444" />
      <ComponentModel type="plcSiemensLogo1224RC" position={PLACEMENTS.plc.position} active={plcActive} />
      <ComponentModel type="contactorWegCWC09" position={PLACEMENTS.contactor.position} active={motorActive} />
      <ComponentModel type="motor3ph" position={PLACEMENTS.motor.position} active={motorActive} />

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

      <ContactShadows position={[0, -0.425, 0.6]} opacity={0.45} scale={9} blur={2.4} far={4} resolution={512} />
      <Environment preset="warehouse" environmentIntensity={1.08} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        enableRotate
        enableDamping
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
        dpr={[1, props.compact ? 1.25 : 1.65]}
        camera={{ position: props.compact ? [1.45, 3.15, 10.15] : [1.45, 3.00, 7.75], fov: props.compact ? 41 : 35, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        shadows
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 0.94
        }}
      >
        <Suspense fallback={null}>
          <ShowcaseScene {...props} />
        </Suspense>
      </Canvas>
      <div className="dx-showcase-state" data-running={motorActive ? 'true' : 'false'} aria-live="polite">
        <b>LOGO! {plcActive ? 'RUN' : 'STOP'}</b>
        <span>{motorActive ? 'Q1 · KM1 · M1 ativos' : stoppedActive ? 'Q3 · H2 motor parado' : 'saídas desenergizadas'}</span>
        <small>{motorActive ? 'H1 verde ligado' : stoppedActive ? 'H2 vermelho ligado' : 'H1/H2 desligados'}</small>
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

for (const type of MODEL_TYPES) {
  const spec = getComponentModelSpec(type)
  if (spec) useGLTF.preload(spec.path)
}
