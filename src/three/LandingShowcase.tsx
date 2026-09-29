import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls, Text, useGLTF } from '@react-three/drei'
import { Suspense, Component, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { getComponentGlbSpec } from './modelPaths'
import type { ComponentType } from '../types'

/**
 * Vitrine 3D da partida direta usada pela demonstração Ladder da landing.
 * Todos os equipamentos vêm da mesma associação tipo → GLB usada no editor:
 * fonte DRAN120, LOGO! Siemens, botoeira START/STOP, contator WEG e motor SEW.
 */

interface DeviceSpec {
  id: 'psu' | 'logo' | 'pushbutton' | 'km' | 'motor'
  label: string
  modelUrl: string
  rotation: [number, number, number]
  placement: 'din-rail' | 'panel-front' | 'machine'
  targetHeight: number
  flipDepth?: boolean
}

function deviceSpec(id: DeviceSpec['id'], type: ComponentType, label: string): DeviceSpec {
  const spec = getComponentGlbSpec(type)
  if (!spec) throw new Error(`O componente ${type} não possui GLB para a demonstração.`)
  return { id, label, modelUrl: spec.path, rotation: spec.rotation, placement: spec.placement, targetHeight: spec.targetHeight, flipDepth: spec.flipDepth }
}

const DEVICES = {
  psu: deviceSpec('psu', 'powerSupplyProauto24A', 'Fonte 24 V'),
  logo: deviceSpec('logo', 'plcSiemensLogo1224RC', 'PLC LOGO!'),
  pushbutton: deviceSpec('pushbutton', 'dualPushButtonNpb22D11', 'S1 · STOP / START'),
  km: deviceSpec('km', 'contactorWegCWC09', 'KM1'),
  motor: deviceSpec('motor', 'motor3ph', 'M1 · SEW DRN80MK4'),
} as const

class ShowcaseErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Normaliza sem alterar o GLB: base no piso/calha ou centro da face para comandos de porta. */
function useFittedModel(spec: DeviceSpec) {
  const { scene } = useGLTF(spec.modelUrl)
  return useMemo(() => {
    const obj = scene.clone(true)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const raw = new THREE.Box3().setFromObject(obj)
    const rawSize = raw.getSize(new THREE.Vector3())
    const basis = spec.placement === 'panel-front' ? Math.max(rawSize.x, rawSize.y) : rawSize.y
    const scale = basis > 0 ? spec.targetHeight / basis : 1
    obj.scale.set(scale, scale, spec.flipDepth ? -scale : scale)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    if (spec.placement === 'panel-front') obj.position.sub(center)
    else obj.position.set(-center.x, -box.min.y, -center.z)
    const size = box.getSize(new THREE.Vector3())
    return { obj, width: size.x, height: size.y, depth: size.z }
  }, [scene, spec])
}

/** Peças que acendem: ecrã do LOGO!, LED da fonte e indicador do contator. */
function usePoweredMaterials(model: THREE.Object3D, powered: boolean) {
  useEffect(() => {
    const lit: THREE.MeshStandardMaterial[] = []
    model.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const name = mesh.name.toLowerCase()
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        const std = material as THREE.MeshStandardMaterial
        if (!std || !('emissive' in std) || !std.color) continue
        const green = std.color.g > 0.85 && std.color.r < 0.15 && std.color.b < 0.15
        const named = name.includes('screen') || name.includes('display') || name.includes('ecra') || /led|rdy|lamp/.test(name)
        if (!green && !named) continue
        lit.push(std)
        std.color.set(powered ? '#22c55e' : '#1f3d2b')
        std.emissive.set(powered ? '#22c55e' : '#04140a')
        std.emissiveIntensity = powered ? 1.15 : 0.12
      }
    })
    return () => { lit.forEach((material) => (material.emissiveIntensity = 0)) }
  }, [model, powered])
}

function Device({ model, position, powered }: { model: THREE.Object3D; position: [number, number, number]; powered: boolean }) {
  usePoweredMaterials(model, powered)
  return <group position={position}><primitive object={model} /></group>
}

/** Botoeira real NHD; as duas zonas transparentes continuam utilizáveis no Canvas. */
function PushButtonDevice({ model, position, onStart, onStop }: {
  model: THREE.Object3D
  position: [number, number, number]
  onStart: () => void
  onStop: () => void
}) {
  return <group position={position}>
    <mesh position={[0, 0, -0.08]} receiveShadow>
      <boxGeometry args={[0.9, 0.78, 0.08]} />
      <meshStandardMaterial color="#e9eef5" roughness={0.82} />
    </mesh>
    <primitive object={model} />
    <mesh position={[-0.13, 0, 0.22]} onPointerDown={(event) => { event.stopPropagation(); onStop() }}>
      <boxGeometry args={[0.24, 0.42, 0.2]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    <mesh position={[0.13, 0, 0.22]} onPointerDown={(event) => { event.stopPropagation(); onStart() }}>
      <boxGeometry args={[0.24, 0.42, 0.2]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    <Text position={[0, 0.53, 0.08]} fontSize={0.095} color="#475569" anchorX="center">{DEVICES.pushbutton.label}</Text>
  </group>
}

/** O CAD é estático; o marcador no eixo comunica rotação e sentido sem alterar o ficheiro. */
function MotorDevice({ model, position, running }: { model: THREE.Object3D; position: [number, number, number]; running: boolean }) {
  const shaft = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (shaft.current && running) shaft.current.rotation.x += delta * 11
  })
  const color = running ? '#22c55e' : '#64748b'
  return <group position={position}>
    <primitive object={model} />
    <group ref={shaft} position={[0.67, 0.4, 0]}>
      <mesh><boxGeometry args={[0.022, 0.22, 0.026]} /><meshStandardMaterial color={color} emissive={running ? color : '#000'} emissiveIntensity={running ? 0.65 : 0} /></mesh>
      <mesh><boxGeometry args={[0.022, 0.026, 0.22]} /><meshStandardMaterial color={color} emissive={running ? color : '#000'} emissiveIntensity={running ? 0.65 : 0} /></mesh>
    </group>
    {running && <pointLight color="#22c55e" intensity={0.22} distance={1.2} position={[0.58, 0.4, 0.2]} />}
  </group>
}

function DinRail({ width, x }: { width: number; x: number }) {
  return <group position={[x, 0, -0.12]}>
    <mesh position={[0, -0.045, 0]} receiveShadow>
      <boxGeometry args={[width, 0.09, 0.2]} />
      <meshStandardMaterial color="#b9bec7" metalness={0.72} roughness={0.32} />
    </mesh>
    <mesh position={[0, -0.16, 0]}>
      <boxGeometry args={[width + 0.5, 0.05, 0.1]} />
      <meshStandardMaterial color="#8f959e" metalness={0.6} roughness={0.4} />
    </mesh>
  </group>
}

/** Cabo 3D com pulsos de corrente quando o trecho está ativo. */
function Wire({ points, color, powered, offset = 0 }: { points: THREE.Vector3[]; color: string; powered: boolean; offset?: number }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2), [points])
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 48, 0.025, 9, false), [curve])
  const pulses = useRef<Array<THREE.Mesh | null>>([])
  useFrame(({ clock }) => {
    pulses.current.forEach((mesh, i) => {
      if (!mesh) return
      mesh.visible = powered
      if (!powered) return
      const t = (clock.elapsedTime * 0.22 + offset + i / 3) % 1
      mesh.position.copy(curve.getPoint(t))
    })
  })
  return <group>
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color={powered ? color : '#8b95a7'} roughness={0.45} emissive={powered ? color : '#000'} emissiveIntensity={powered ? 0.18 : 0} />
    </mesh>
    {[0, 1, 2].map((i) => <mesh key={i} ref={(el) => { pulses.current[i] = el }}>
      <sphereGeometry args={[0.045, 10, 10]} /><meshBasicMaterial color="#fde68a" />
    </mesh>)}
    {[points[0], points[points.length - 1]].map((point, i) => <mesh key={i} position={point}>
      <sphereGeometry args={[0.042, 10, 10]} /><meshStandardMaterial color="#d4d9e2" metalness={0.8} roughness={0.25} />
    </mesh>)}
  </group>
}

type ShowcaseWire = { color: string; offset: number; powered: boolean; points: THREE.Vector3[] }

/** Enquadra os cinco equipamentos tanto no hero largo como no cartão móvel mais alto. */
function FitShowcaseCamera({ width }: { width: number }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera
    const verticalFov = THREE.MathUtils.degToRad(perspective.fov || 38)
    const aspect = Math.max(0.55, size.width / Math.max(1, size.height))
    const horizontalTangent = Math.tan(verticalFov / 2) * aspect
    const distance = Math.max(3.4, (3.1 / 2) / Math.tan(verticalFov / 2), (width / 2) / horizontalTangent) * 1.12
    camera.position.set(0.3, 1.55, distance)
    camera.lookAt(0, 0.22, 0)
    perspective.updateProjectionMatrix()
  }, [camera, size.height, size.width, width])
  return null
}

function CircuitScene({ plcRunning, motorOn, onStart, onStop }: {
  plcRunning: boolean
  motorOn: boolean
  onStart: () => void
  onStop: () => void
}) {
  const psu = useFittedModel(DEVICES.psu)
  const logo = useFittedModel(DEVICES.logo)
  const pushbutton = useFittedModel(DEVICES.pushbutton)
  const km = useFittedModel(DEVICES.km)
  const motor = useFittedModel(DEVICES.motor)
  const gap = 0.42
  const layout = useMemo(() => {
    const buttonSpace = Math.max(1.05, pushbutton.width + 0.4)
    const railWidth = psu.width + logo.width + km.width + gap * 2
    const total = buttonSpace + 0.24 + railWidth + 0.65 + motor.width
    const left = -total / 2
    const xButton = left + buttonSpace / 2
    const railStart = left + buttonSpace + 0.24
    const xPsu = railStart + psu.width / 2
    const xLogo = railStart + psu.width + gap + logo.width / 2
    const xKm = railStart + psu.width + gap + logo.width + gap + km.width / 2
    const xMotor = railStart + railWidth + 0.65 + motor.width / 2
    return { total, railWidth, railX: railStart + railWidth / 2, xButton, xPsu, xLogo, xKm, xMotor }
  }, [psu.width, logo.width, pushbutton.width, km.width, motor.width])

  const wires = useMemo<ShowcaseWire[]>(() => {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
    const zf = 0.34
    const { xButton, xPsu, xLogo, xKm, xMotor } = layout
    const topPsu = psu.height * 0.92
    const topLogo = logo.height * 0.92
    const topKm = km.height * 0.9
    const result: ShowcaseWire[] = [
      // Alimentação 24 V do LOGO!.
      { color: '#ef4444', offset: 0, powered: true, points: [v(xPsu + psu.width * 0.22, topPsu, zf), v(xPsu + psu.width * 0.3, topPsu + 0.36, zf), v(xLogo - logo.width * 0.3, topLogo + 0.36, zf), v(xLogo - logo.width * 0.22, topLogo, zf)] },
      { color: '#2563eb', offset: 0.24, powered: true, points: [v(xPsu + psu.width * 0.08, topPsu, zf + 0.05), v(xPsu + psu.width * 0.14, topPsu + 0.23, zf + 0.05), v(xLogo - logo.width * 0.16, topLogo + 0.23, zf + 0.05), v(xLogo - logo.width * 0.08, topLogo, zf + 0.05)] },
      // STOP NF (I1) permanece fechado; START NA (I2) acompanha o selo nesta síntese visual.
      { color: '#dc2626', offset: 0.38, powered: true, points: [v(xButton - 0.13, 0.45, 0.72), v(xButton - 0.13, 1.05, 0.62), v(xLogo - logo.width * 0.02, topLogo + 0.55, 0.5), v(xLogo - logo.width * 0.02, topLogo, zf)] },
      { color: '#16a34a', offset: 0.5, powered: motorOn, points: [v(xButton + 0.13, 0.45, 0.72), v(xButton + 0.13, 1.18, 0.68), v(xLogo + logo.width * 0.08, topLogo + 0.68, 0.56), v(xLogo + logo.width * 0.08, topLogo, zf)] },
      // Q1 do LOGO! comanda A1/A2 de KM1.
      { color: '#f59e0b', offset: 0.62, powered: motorOn, points: [v(xLogo + logo.width * 0.22, 0.08, zf), v(xLogo + logo.width * 0.3, -0.28, zf + 0.05), v(xKm - km.width * 0.28, -0.28, zf + 0.05), v(xKm - km.width * 0.2, 0.08, zf)] },
      { color: '#2563eb', offset: 0.74, powered: motorOn, points: [v(xKm + km.width * 0.2, topKm, zf), v(xKm + km.width * 0.2, topKm + 0.5, zf + 0.09), v(xPsu - psu.width * 0.05, topPsu + 0.5, zf + 0.09), v(xPsu - psu.width * 0.1, topPsu, zf)] },
    ]
    // Saídas trifásicas de KM1 para U1/V1/W1 do motor.
    const phaseColors = ['#92400e', '#1f2937', '#94a3b8']
    for (let index = 0; index < 3; index += 1) {
      const shift = (index - 1) * 0.12
      result.push({
        color: phaseColors[index], offset: 0.82 + index * 0.08, powered: motorOn,
        points: [v(xKm + shift, 0.08, 0.4 + index * 0.04), v(xKm + 0.25 + index * 0.08, -0.48 - index * 0.06, 0.48 + index * 0.05), v(xMotor - 0.22 + index * 0.13, -0.08, 0.44 + index * 0.05)],
      })
    }
    return result
  }, [layout, psu.height, psu.width, logo.height, logo.width, km.height, km.width, motorOn])

  return <>
    <FitShowcaseCamera width={layout.total + 0.4} />
    <mesh position={[0, -0.91, -0.05]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[layout.total + 1.3, 4.2]} /><meshStandardMaterial color="#eef2f8" metalness={0.04} roughness={0.92} />
    </mesh>
    <DinRail width={layout.railWidth + 0.45} x={layout.railX} />
    <Device model={psu.obj} position={[layout.xPsu, 0, 0]} powered />
    <Device model={logo.obj} position={[layout.xLogo, 0, 0]} powered />
    <mesh position={[layout.xLogo, logo.height + 0.13, 0.2]}>
      <sphereGeometry args={[0.045, 12, 12]} />
      <meshStandardMaterial color={plcRunning ? '#22c55e' : '#dc2626'} emissive={plcRunning ? '#22c55e' : '#7f1d1d'} emissiveIntensity={0.8} />
    </mesh>
    <Text position={[layout.xLogo, logo.height + 0.24, 0.2]} fontSize={0.085} color={plcRunning ? '#15803d' : '#b91c1c'} anchorX="center">{plcRunning ? 'CPU RUN' : 'CPU STOP'}</Text>
    <PushButtonDevice model={pushbutton.obj} position={[layout.xButton, 0.45, 0.44]} onStart={onStart} onStop={onStop} />
    <Device model={km.obj} position={[layout.xKm, 0, 0]} powered={motorOn} />
    <MotorDevice model={motor.obj} position={[layout.xMotor, -0.9, 0.08]} running={motorOn} />
    {wires.map((wire, index) => <Wire key={index} points={wire.points} color={wire.color} powered={wire.powered} offset={wire.offset} />)}
    <Text position={[layout.xPsu, -0.38, 0.2]} fontSize={0.09} color="#64748b" anchorX="center">{DEVICES.psu.label}</Text>
    <Text position={[layout.xLogo, -0.38, 0.2]} fontSize={0.09} color="#64748b" anchorX="center">{DEVICES.logo.label}</Text>
    <Text position={[layout.xKm, -0.38, 0.2]} fontSize={0.09} color="#64748b" anchorX="center">{DEVICES.km.label}</Text>
    <Text position={[layout.xMotor, 0.27, 0.18]} fontSize={0.09} color="#64748b" anchorX="center">{DEVICES.motor.label}</Text>
  </>
}

function Loader() {
  return <Text position={[0, 0.8, 0]} fontSize={0.16} color="#64748b" anchorX="center">A carregar a partida direta 3D…</Text>
}

export interface LandingShowcaseProps {
  className?: string
  compact?: boolean
  plcRunning?: boolean
  motorOn?: boolean
  onRunPlc?: () => void
  onStopPlc?: () => void
  onStartMotor?: () => void
  onStopMotor?: () => void
}

/** Circuito 3D controlável de forma autónoma ou pelo estado da demonstração Ladder. */
export default function LandingShowcase({
  className = '', compact = false,
  plcRunning: controlledPlcRunning, motorOn: controlledMotorOn,
  onRunPlc, onStopPlc, onStartMotor, onStopMotor,
}: LandingShowcaseProps) {
  const [localPlcRunning, setLocalPlcRunning] = useState(true)
  const [localMotorOn, setLocalMotorOn] = useState(true)
  const [autoRotate, setAutoRotate] = useState(false)
  const plcRunning = controlledPlcRunning ?? localPlcRunning
  const motorOn = controlledMotorOn ?? localMotorOn
  const reduceMotion = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const rotating = autoRotate && !reduceMotion

  const runPlc = () => { setLocalPlcRunning(true); onRunPlc?.() }
  const stopPlc = () => { setLocalPlcRunning(false); setLocalMotorOn(false); onStopPlc?.() }
  const startMotor = () => {
    if (!plcRunning) return
    setLocalMotorOn(true)
    onStartMotor?.()
  }
  const stopMotor = () => { setLocalMotorOn(false); onStopMotor?.() }

  return <div className={'dc-showcase' + (compact ? ' is-compact' : '') + ' ' + className}>
    <div className="dc-showcase-stage">
      <ShowcaseErrorBoundary fallback={<div className="dc-showcase-fallback">Modelo 3D indisponível neste navegador.</div>}>
        <Canvas shadows dpr={[1, 2]} camera={{ position: [0.3, 1.55, 8], fov: 38 }} gl={{ antialias: true }}>
          <ambientLight intensity={0.72} />
          <directionalLight position={[4, 7, 5]} intensity={1.25} castShadow shadow-mapSize={[1024, 1024]} />
          <directionalLight position={[-4, 2.5, -3]} intensity={0.34} />
          <Suspense fallback={<Loader />}>
            <CircuitScene plcRunning={plcRunning} motorOn={motorOn} onStart={startMotor} onStop={stopMotor} />
          </Suspense>
          <ContactShadows position={[0, -0.89, 0]} opacity={0.3} scale={13} blur={2.5} far={4} />
          <OrbitControls
            makeDefault target={[0, 0.22, 0]} enablePan={false} minDistance={3.2} maxDistance={12}
            minPolarAngle={0.35} maxPolarAngle={Math.PI / 2.05} minAzimuthAngle={-1.05} maxAzimuthAngle={1.05}
            autoRotate={rotating} autoRotateSpeed={0.65}
            onChange={(event) => {
              const controls = event?.target as { getAzimuthalAngle: () => number; autoRotateSpeed: number } | undefined
              if (!controls) return
              const angle = controls.getAzimuthalAngle()
              if (angle > 1 && controls.autoRotateSpeed > 0) controls.autoRotateSpeed = -Math.abs(controls.autoRotateSpeed)
              if (angle < -1 && controls.autoRotateSpeed < 0) controls.autoRotateSpeed = Math.abs(controls.autoRotateSpeed)
            }}
          />
        </Canvas>
      </ShowcaseErrorBoundary>

      <div className="dc-showcase-badge" aria-live="polite">
        <span className="dc-showcase-brand">PARTIDA DIRETA EM 3D</span>
        <strong>Botoeira → PLC LOGO! → KM1 → Motor M1</strong>
        <small>{plcRunning ? (motorOn ? 'Q1 ativo · motor em rotação.' : 'PLC em RUN · pronto para START.') : 'PLC em STOP · execute RUN para iniciar.'}</small>
      </div>

      <div className="dc-showcase-tools" aria-label="Comandos da partida direta 3D">
        <button type="button" onClick={plcRunning ? stopPlc : runPlc} aria-pressed={plcRunning} title="Executar ou parar o PLC">
          <i className={plcRunning ? 'on' : ''} />{plcRunning ? 'PLC RUN' : 'PLC STOP'}
        </button>
        <button type="button" className="is-start" onClick={startMotor} disabled={!plcRunning || motorOn} title="Acionar START (I2)">START <small>I2</small></button>
        <button type="button" className="is-stop" onClick={stopMotor} disabled={!motorOn} title="Acionar STOP (I1)">STOP <small>I1</small></button>
        <button type="button" onClick={() => setAutoRotate((value) => !value)} aria-pressed={rotating} title="Ativar ou parar a rotação automática da vista">
          <i className={rotating ? 'on' : ''} />Vista 3D
        </button>
      </div>
    </div>
  </div>
}

Object.values(DEVICES).forEach((device) => useGLTF.preload(device.modelUrl))
