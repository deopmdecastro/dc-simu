import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import type { ComponentType } from '../types'
import { buildDinRailGroup, createGalvanizedMaterial } from './dinRailGeometry'
import { cloneModelScene } from './modelFit'
import { getComponentGlbSpec } from './modelPaths'

interface LandingShowcaseProps {
  compact?: boolean
  className?: string
  plcRunning?: boolean
  motorOn?: boolean
  onRunPlc?: () => void
  onStopPlc?: () => void
  onStartMotor?: () => void
  onStopMotor?: () => void
}

interface ShowcaseState {
  failed: boolean
}

class ShowcaseErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, ShowcaseState> {
  state: ShowcaseState = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.warn('Showcase 3D indisponível:', error) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

const MODEL_TYPES: ComponentType[] = [
  'powerSupplyProauto24A',
  'plcSiemensLogo1224RC',
  'contactorWegCWC09',
  'dualPushButtonNpb22D11',
  'pilotLightAd22',
  'motor3ph',
]

for (const type of MODEL_TYPES) {
  const path = getComponentGlbSpec(type)?.path
  if (path) useGLTF.preload(path)
}

type Layout = Record<'psu' | 'plc' | 'contactor' | 'push' | 'pilot' | 'motor', [number, number, number]>

const LAYOUT: Layout = {
  psu: [-1.86, 0.22, 0.08],
  plc: [-0.55, 0.25, 0.08],
  contactor: [0.65, 0.27, 0.08],
  push: [-1.95, 1.43, 0.38],
  pilot: [-1.18, 1.44, 0.4],
  motor: [1.15, -2.07, 0.08],
}

function cloneMaterials(root: THREE.Object3D, running: boolean, type: ComponentType) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    const original = mesh.material
    const wasArray = Array.isArray(original)
    const materials: THREE.Material[] = Array.isArray(original) ? original : [original]
    const clones = materials.map((material) => {
      const clone = material.clone()
      if (running && clone instanceof THREE.MeshStandardMaterial) {
        const name = child.name.toLowerCase()
        const greenMaterial = clone.color.g > 0.7 && clone.color.r < 0.35 && clone.color.b < 0.45
        const stateSurface = /screen|display|ecra|led|rdy|lamp/.test(name)
        if (type === 'pilotLightAd22' || greenMaterial || stateSurface) {
          clone.emissive.set('#16a34a')
          clone.emissiveIntensity = type === 'pilotLightAd22' ? 1.55 : 0.72
        }
      }
      return clone
    })
    mesh.material = wasArray ? clones : clones[0]
  })
}

function ComponentModel({ type, position, running = false }: {
  type: ComponentType
  position: [number, number, number]
  running?: boolean
}) {
  const spec = getComponentGlbSpec(type)!
  const { scene } = useGLTF(spec.path)
  const prepared = useMemo(() => {
    const root = cloneModelScene(scene)
    cloneMaterials(root, running, type)
    root.rotation.set(...spec.rotation)
    if (spec.flipDepth) root.rotateY(Math.PI)
    root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(root)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const scale = spec.targetHeight / Math.max(size.y, 0.001)
    root.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
    return {
      root,
      scale,
      yOffset: spec.targetHeight / 2,
      zOffset: Math.max(0.06, (size.z * scale) / 2),
    }
  }, [running, scene, spec, type])

  return <group position={[position[0], position[1] + prepared.yOffset, position[2] + prepared.zOffset]}>
    <primitive object={prepared.root} scale={prepared.scale} />
  </group>
}

function WirePath({ points, color, active, speed = 0.22 }: {
  points: [number, number, number][]
  color: string
  active: boolean
  speed?: number
}) {
  const pulse = useRef<THREE.Mesh>(null)
  const phase = useRef(Math.random())
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, 'centripetal', 0.08),
    [points],
  )
  useFrame((_, delta) => {
    if (!active || !pulse.current) return
    phase.current = (phase.current + delta * speed) % 1
    pulse.current.position.copy(curve.getPointAt(phase.current))
  })
  return <group>
    <mesh castShadow>
      <tubeGeometry args={[curve, 72, 0.018, 9, false]} />
      <meshStandardMaterial color={color} roughness={0.38} metalness={0.04} />
    </mesh>
    {active && <mesh ref={pulse}>
      <sphereGeometry args={[0.044, 12, 12]} />
      <meshBasicMaterial color="#f8fafc" toneMapped={false} />
    </mesh>}
  </group>
}

function CableDuct({ position, width, vertical = false }: { position: [number, number, number]; width: number; vertical?: boolean }) {
  const length = width
  const slots = Math.max(4, Math.floor(length / 0.24))
  return <group position={position} rotation={[0, 0, vertical ? Math.PI / 2 : 0]}>
    <mesh receiveShadow>
      <boxGeometry args={[length, 0.16, 0.08]} />
      <meshStandardMaterial color="#d7dde4" roughness={0.72} metalness={0.12} />
    </mesh>
    {Array.from({ length: slots }, (_, index) => {
      const x = -length / 2 + ((index + 0.5) * length) / slots
      return <mesh key={index} position={[x, 0.005, 0.046]}>
        <boxGeometry args={[0.035, 0.1, 0.008]} />
        <meshStandardMaterial color="#8793a1" roughness={0.9} />
      </mesh>
    })}
  </group>
}

function CameraRig() {
  const { camera, size } = useThree()
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera
    const verticalFov = THREE.MathUtils.degToRad(perspective.fov)
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.45, size.width / size.height))
    const distanceForWidth = 3.25 / Math.tan(horizontalFov / 2)
    const distanceForHeight = 2.35 / Math.tan(verticalFov / 2)
    const distance = Math.max(7.3, distanceForWidth, distanceForHeight)
    perspective.position.set(0.18, 0.28, distance)
    perspective.lookAt(0, 0.08, 0)
    perspective.updateProjectionMatrix()
  }, [camera, size.height, size.width])
  return null
}

function ShowcaseDinRail() {
  const rail = useMemo(() => {
    const material = createGalvanizedMaterial()
    // Conserva o perfil e os furos do editor, com resposta mais clara sem HDRI.
    material.metalness = 0.58
    material.roughness = 0.34
    const group = buildDinRailGroup(535, 0.01, material)
    group.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    return group
  }, [])
  useEffect(() => () => {
    const materials = new Set<THREE.Material>()
    rail.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material)
    })
    materials.forEach((material) => material.dispose())
  }, [rail])
  return <group position={[-0.12, 0.23, -0.055]}><primitive object={rail} /></group>
}

function FixedPanel() {
  const screws: [number, number][] = [[-2.88, 1.88], [2.88, 1.88], [-2.88, -1.88], [2.88, -1.88]]
  return <group>
    <mesh receiveShadow position={[0, 0.01, -0.11]}>
      <boxGeometry args={[6.15, 4.3, 0.075]} />
      <meshStandardMaterial color="#e8edf2" metalness={0.3} roughness={0.62} />
    </mesh>
    <mesh position={[0, 0.01, -0.071]}>
      <planeGeometry args={[6.01, 4.16]} />
      <meshStandardMaterial color="#f7f8fa" transparent opacity={0.3} roughness={0.84} />
    </mesh>
    {screws.map(([x, y], index) => <mesh key={index} position={[x, y, -0.052]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.045, 0.045, 0.018, 18]} />
      <meshStandardMaterial color="#778493" metalness={0.72} roughness={0.3} />
    </mesh>)}
    <ShowcaseDinRail />
    <CableDuct position={[-0.1, -0.84, 0.05]} width={5.45} />
    <CableDuct position={[2.62, 0.44, 0.03]} width={2.45} vertical />
    <mesh receiveShadow position={[0, -2.19, 0.18]}>
      <boxGeometry args={[6.2, 0.11, 1.25]} />
      <meshStandardMaterial color="#bdc6cf" metalness={0.46} roughness={0.5} />
    </mesh>
  </group>
}

function ShowcaseScene({ plcRunning, motorOn }: { plcRunning: boolean; motorOn: boolean }) {
  const active = plcRunning && motorOn
  return <>
    <CameraRig />
    <ambientLight intensity={1.05} />
    <hemisphereLight args={['#ffffff', '#536173', 1.15]} />
    <directionalLight position={[4.5, 7, 7]} intensity={2.35} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
    <directionalLight position={[-5, 2, 4]} intensity={1.1} />

    <FixedPanel />

    <ComponentModel type="powerSupplyProauto24A" position={LAYOUT.psu} running={plcRunning} />
    <ComponentModel type="plcSiemensLogo1224RC" position={LAYOUT.plc} running={plcRunning} />
    <ComponentModel type="contactorWegCWC09" position={LAYOUT.contactor} running={active} />
    <ComponentModel type="dualPushButtonNpb22D11" position={LAYOUT.push} running={active} />
    <ComponentModel type="pilotLightAd22" position={LAYOUT.pilot} running={active} />
    <ComponentModel type="motor3ph" position={LAYOUT.motor} running={active} />

    {/* Alimentação 24 V: dois condutores paralelos, canalizados por baixo da calha. */}
    <WirePath color="#dc2626" active={active} speed={0.18} points={[
      [-2.05, 0.33, 0.56], [-2.05, -0.7, 0.61], [-0.78, -0.7, 0.61], [-0.78, 0.31, 0.58],
    ]} />
    <WirePath color="#2563eb" active={active} speed={0.2} points={[
      [-1.9, 0.31, 0.54], [-1.9, -0.58, 0.58], [-0.61, -0.58, 0.58], [-0.61, 0.31, 0.55],
    ]} />

    {/* START/STOP e sinalização: rotas superiores separadas, sem cruzar equipamentos. */}
    <WirePath color="#f59e0b" active={active} speed={0.23} points={[
      [-1.83, 1.5, 0.61], [-1.83, 1.91, 0.64], [-0.78, 1.91, 0.64], [-0.78, 1.28, 0.61],
    ]} />
    <WirePath color="#475569" active={active} speed={0.24} points={[
      [-2.06, 1.5, 0.57], [-2.06, 2.02, 0.59], [-0.98, 2.02, 0.59], [-0.98, 1.27, 0.58],
    ]} />
    <WirePath color="#22c55e" active={active} speed={0.26} points={[
      [-0.37, 1.28, 0.58], [-0.37, 1.76, 0.62], [-1.17, 1.76, 0.62], [-1.17, 1.49, 0.58],
    ]} />

    {/* Saída Q1 para bobina KM1, isolada no canal inferior. */}
    <WirePath color="#7c3aed" active={active} speed={0.25} points={[
      [-0.28, 0.31, 0.61], [-0.28, -0.45, 0.68], [0.57, -0.45, 0.68], [0.57, 0.34, 0.61],
    ]} />
    <WirePath color="#38bdf8" active={active} speed={0.19} points={[
      [-0.08, 0.3, 0.55], [-0.08, -0.6, 0.59], [0.77, -0.6, 0.59], [0.77, 0.34, 0.56],
    ]} />

    {/* Três fases de potência em paralelo até aos bornes do motor. */}
    <WirePath color="#713f12" active={active} speed={0.23} points={[
      [0.48, 0.35, 0.7], [0.48, -1.02, 0.74], [1.42, -1.02, 0.74], [1.42, -0.96, 0.74],
    ]} />
    <WirePath color="#111827" active={active} speed={0.25} points={[
      [0.67, 0.35, 0.72], [0.67, -1.14, 0.78], [1.61, -1.14, 0.78], [1.61, -0.98, 0.78],
    ]} />
    <WirePath color="#6b7280" active={active} speed={0.27} points={[
      [0.86, 0.35, 0.74], [0.86, -1.26, 0.82], [1.8, -1.26, 0.82], [1.8, -1.0, 0.82],
    ]} />
    <WirePath color="#16a34a" active={active} speed={0.17} points={[
      [2.15, -1.04, 0.68], [2.34, -1.45, 0.66], [2.34, -1.95, 0.51], [1.92, -2.02, 0.48],
    ]} />

    <Html position={[-0.53, -2.03, 0.74]} center transform distanceFactor={8.5}>
      <div style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 5, color: '#334155', background: 'rgba(255,255,255,.92)', font: '700 9px ui-monospace,monospace', whiteSpace: 'nowrap' }}>
        24 VDC · Q1 → KM1 → M1
      </div>
    </Html>

    <OrbitControls
      makeDefault
      target={[0, 0.08, 0]}
      enablePan={false}
      enableDamping
      dampingFactor={0.075}
      minDistance={4.8}
      maxDistance={19}
      minPolarAngle={0.06}
      maxPolarAngle={Math.PI - 0.06}
    />
  </>
}

export default function LandingShowcase({
  compact = false,
  className = '',
  plcRunning: controlledPlc,
  motorOn: controlledMotor,
  onRunPlc,
  onStopPlc,
  onStartMotor,
  onStopMotor,
}: LandingShowcaseProps) {
  const [localPlc, setLocalPlc] = useState(true)
  const [localMotor, setLocalMotor] = useState(true)
  const controlled = controlledPlc !== undefined || controlledMotor !== undefined
  const plcRunning = controlledPlc ?? localPlc
  const motorOn = controlledMotor ?? localMotor
  const active = plcRunning && motorOn

  const runPlc = () => controlled ? onRunPlc?.() : setLocalPlc(true)
  const stopPlc = () => {
    if (controlled) onStopPlc?.()
    else {
      setLocalPlc(false)
      setLocalMotor(false)
    }
  }
  const startMotor = () => {
    if (!plcRunning) return
    if (controlled) onStartMotor?.()
    else setLocalMotor(true)
  }
  const stopMotor = () => controlled ? onStopMotor?.() : setLocalMotor(false)

  return <div className={'dc-showcase' + (compact ? ' is-compact' : '') + ' ' + className}>
    <div className="dc-showcase-stage">
      <ShowcaseErrorBoundary fallback={<div className="dc-showcase-fallback">Modelo 3D indisponível neste navegador.</div>}>
        <Canvas
          shadows
          dpr={[1, 1.55]}
          camera={{ position: [0, 0.25, 9], fov: 42, near: 0.1, far: 60 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={['#edf2f7']} />
          <Suspense fallback={null}>
            <ShowcaseScene plcRunning={plcRunning} motorOn={motorOn} />
          </Suspense>
        </Canvas>
      </ShowcaseErrorBoundary>
      <div className="dc-showcase-badge" aria-live="polite">
        <span className="dc-showcase-brand">PARTIDA DIRETA EM 3D</span>
        <strong>{active ? 'KM1 ligado · M1 em marcha' : plcRunning ? 'PLC em RUN · motor parado' : 'PLC em STOP'}</strong>
        <small>LOGO! · START/STOP · CWC09 · DRN80</small>
        <span className="dc-showcase-sync"><i className={active ? 'on' : ''} /> Ladder ↔ Painel 3D</span>
      </div>
      <div className="dc-showcase-tools" aria-label="Comandos da partida direta 3D">
        <button type="button" onClick={plcRunning ? stopPlc : runPlc} aria-pressed={plcRunning} title="Alternar estado do PLC"><i className={plcRunning ? 'on' : ''} />PLC {plcRunning ? 'RUN' : 'STOP'}</button>
        <button type="button" className="is-start" onClick={startMotor} disabled={!plcRunning || motorOn}>START <small>I2</small></button>
        <button type="button" className="is-stop" onClick={stopMotor} disabled={!motorOn}>STOP <small>I1</small></button>
      </div>
    </div>
  </div>
}
