import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, OrbitControls, Text, useGLTF } from '@react-three/drei'
import { Suspense, Component, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { MODEL_PATHS } from './modelPaths'

/**
 * Vitrine 3D do circuito completo (landing page).
 *
 * Uma única cena WebGL com os equipamentos reais (GLB dos fabricantes, os mesmos
 * do Painel 3D do editor) montados na calha DIN e ligados por cabos 3D:
 * fonte DRAN120 → controlador LOGO! → contator WEG. Ao alimentar o circuito, o
 * ecrã e os indicadores acendem e a corrente percorre os cabos.
 */

interface DeviceSpec {
  id: 'psu' | 'logo' | 'km'
  label: string
  modelUrl: string
  rotation: [number, number, number]
  targetHeight: number
}

const DEVICES: DeviceSpec[] = [
  { id: 'psu', label: 'Fonte 24 V', modelUrl: MODEL_PATHS.powerSupplyProauto24A, rotation: [0, 0, 0], targetHeight: 1.25 },
  { id: 'logo', label: 'PLC LOGO!', modelUrl: MODEL_PATHS.plcSiemensLogo1224RC, rotation: [Math.PI / 2, 0, 0], targetHeight: 1.3 },
  { id: 'km', label: 'KM1', modelUrl: MODEL_PATHS.wegContactorCWC09, rotation: [Math.PI / 2, 0, 0], targetHeight: 1.2 },
]

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

/** Escala e assenta o modelo (base em y=0, centrado em x/z) independentemente do CAD de origem. */
function useFittedModel(spec: DeviceSpec) {
  const { scene } = useGLTF(spec.modelUrl)
  return useMemo(() => {
    const obj = scene.clone(true)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...spec.rotation)
    obj.updateMatrixWorld(true)
    const raw = new THREE.Box3().setFromObject(obj)
    const rawHeight = raw.max.y - raw.min.y
    obj.scale.setScalar(rawHeight > 0 ? spec.targetHeight / rawHeight : 1)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    obj.position.set(-center.x, -box.min.y, -center.z)
    const size = box.getSize(new THREE.Vector3())
    return { obj, width: size.x, height: size.y, depth: size.z }
  }, [scene, spec])
}

/** Peças que acendem: ecrã do LOGO!, led da fonte e indicador do contator. */
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
    return () => {
      lit.forEach((material) => (material.emissiveIntensity = 0))
    }
  }, [model, powered])
}

function Device({ model, x, powered }: { model: THREE.Object3D; x: number; powered: boolean }) {
  usePoweredMaterials(model, powered)
  return (
    <group position={[x, 0, 0]}>
      <primitive object={model} />
    </group>
  )
}

function DinRail({ width }: { width: number }) {
  return (
    <group position={[0, 0, -0.12]}>
      <mesh position={[0, -0.045, 0]} receiveShadow>
        <boxGeometry args={[width, 0.09, 0.2]} />
        <meshStandardMaterial color="#b9bec7" metalness={0.72} roughness={0.32} />
      </mesh>
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[width + 0.5, 0.05, 0.1]} />
        <meshStandardMaterial color="#8f959e" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.9, -0.05]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width + 3, 3.4]} />
        <meshStandardMaterial color="#eef2f8" metalness={0.05} roughness={0.9} />
      </mesh>
    </group>
  )
}

/** Cabo 3D: tubo ao longo de uma curva, com pulsos de corrente quando alimentado. */
function Wire({ points, color, powered, offset = 0 }: { points: THREE.Vector3[]; color: string; powered: boolean; offset?: number }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2), [points])
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 48, 0.028, 10, false), [curve])
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
  return (
    <group>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial color={powered ? color : '#8b95a7'} roughness={0.45} emissive={powered ? color : '#000'} emissiveIntensity={powered ? 0.18 : 0} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => { pulses.current[i] = el }}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color="#fde68a" />
        </mesh>
      ))}
      {[points[0], points[points.length - 1]].map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshStandardMaterial color="#d4d9e2" metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
    </group>
  )
}

function CircuitScene({ powered }: { powered: boolean }) {
  const psu = useFittedModel(DEVICES[0])
  const logo = useFittedModel(DEVICES[1])
  const km = useFittedModel(DEVICES[2])
  const gap = 0.55
  const layout = useMemo(() => {
    const total = psu.width + logo.width + km.width + gap * 2
    const x0 = -total / 2
    const xPsu = x0 + psu.width / 2
    const xLogo = x0 + psu.width + gap + logo.width / 2
    const xKm = x0 + psu.width + gap + logo.width + gap + km.width / 2
    return { total, xPsu, xLogo, xKm }
  }, [psu.width, logo.width, km.width])

  const wires = useMemo(() => {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
    const zf = 0.32
    const { xPsu, xLogo, xKm } = layout
    const topPsu = psu.height * 0.92
    const topLogo = logo.height * 0.92
    const topKm = km.height * 0.92
    return [
      // +24 V: fonte → LOGO!
      { color: '#ef4444', offset: 0, points: [v(xPsu + psu.width * 0.22, topPsu, zf), v(xPsu + psu.width * 0.3, topPsu + 0.42, zf), v(xLogo - logo.width * 0.3, topLogo + 0.42, zf), v(xLogo - logo.width * 0.22, topLogo, zf)] },
      // 0 V: fonte → LOGO!
      { color: '#2563eb', offset: 0.3, points: [v(xPsu + psu.width * 0.08, topPsu, zf + 0.06), v(xPsu + psu.width * 0.14, topPsu + 0.28, zf + 0.06), v(xLogo - logo.width * 0.16, topLogo + 0.28, zf + 0.06), v(xLogo - logo.width * 0.08, topLogo, zf + 0.06)] },
      // Q1 → A1 (bobina do contator)
      { color: '#16a34a', offset: 0.6, points: [v(xLogo + logo.width * 0.22, 0.08, zf), v(xLogo + logo.width * 0.3, -0.22, zf + 0.05), v(xKm - km.width * 0.3, -0.22, zf + 0.05), v(xKm - km.width * 0.2, 0.08, zf)] },
      // A2 → 0 V
      { color: '#2563eb', offset: 0.85, points: [v(xKm + km.width * 0.2, topKm, zf), v(xKm + km.width * 0.2, topKm + 0.6, zf + 0.1), v(xPsu - psu.width * 0.05, topPsu + 0.6, zf + 0.1), v(xPsu - psu.width * 0.1, topPsu, zf)] },
    ]
  }, [layout, psu.height, psu.width, logo.height, logo.width, km.height, km.width])

  return (
    <>
      <Device model={psu.obj} x={layout.xPsu} powered={powered} />
      <Device model={logo.obj} x={layout.xLogo} powered={powered} />
      <Device model={km.obj} x={layout.xKm} powered={powered} />
      {wires.map((w, i) => (
        <Wire key={i} points={w.points} color={w.color} powered={powered} offset={w.offset} />
      ))}
      <Text position={[layout.xPsu, -0.42, 0.2]} fontSize={0.1} color="#64748b" anchorX="center">{DEVICES[0].label}</Text>
      <Text position={[layout.xLogo, -0.42, 0.2]} fontSize={0.1} color="#64748b" anchorX="center">{DEVICES[1].label}</Text>
      <Text position={[layout.xKm, -0.42, 0.2]} fontSize={0.1} color="#64748b" anchorX="center">{DEVICES[2].label}</Text>
      <DinRail width={layout.total + 0.9} />
    </>
  )
}

function Loader() {
  return (
    <Text position={[0, 0.8, 0]} fontSize={0.16} color="#64748b" anchorX="center">
      A carregar o circuito 3D…
    </Text>
  )
}

/**
 * Circuito completo em 3D real. O utilizador pode rodar, aproximar,
 * ligar/desligar a alimentação e ver o circuito reagir.
 */
export default function LandingShowcase({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const [powered, setPowered] = useState(true)
  const [autoRotate, setAutoRotate] = useState(true)
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const rotating = autoRotate && !reduceMotion
  return (
    <div className={'dc-showcase' + (compact ? ' is-compact' : '') + ' ' + className}>
      <div className="dc-showcase-stage">
        <ShowcaseErrorBoundary fallback={<div className="dc-showcase-fallback">Modelo 3D indisponível neste navegador.</div>}>
          <Canvas shadows dpr={[1, 2]} camera={{ position: [0.4, 1.7, compact ? 6.2 : 5.4], fov: 38 }} gl={{ antialias: true }}>
            <ambientLight intensity={0.72} />
            <directionalLight position={[4, 6, 5]} intensity={1.25} castShadow shadow-mapSize={[1024, 1024]} />
            <directionalLight position={[-4, 2.5, -3]} intensity={0.34} />
            <Suspense fallback={<Loader />}>
              <CircuitScene powered={powered} />
            </Suspense>
            <ContactShadows position={[0, -0.02, 0]} opacity={0.32} scale={12} blur={2.4} far={3} />
            <OrbitControls
              makeDefault
              target={[0, 0.55, 0]}
              enablePan={false}
              minDistance={2.5}
              maxDistance={10}
              minPolarAngle={0.35}
              maxPolarAngle={Math.PI / 2.05}
              minAzimuthAngle={-1.1}
              maxAzimuthAngle={1.1}
              autoRotate={rotating}
              autoRotateSpeed={0.7}
              onChange={(e) => {
                // faz o vai-e-vem da rotação automática dentro do arco permitido
                const c = e?.target as { getAzimuthalAngle: () => number; autoRotateSpeed: number } | undefined
                if (!c) return
                const a = c.getAzimuthalAngle()
                if (a > 1.05 && c.autoRotateSpeed > 0) c.autoRotateSpeed = -Math.abs(c.autoRotateSpeed)
                if (a < -1.05 && c.autoRotateSpeed < 0) c.autoRotateSpeed = Math.abs(c.autoRotateSpeed)
              }}
            />
          </Canvas>
        </ShowcaseErrorBoundary>

        <div className="dc-showcase-badge">
          <span className="dc-showcase-brand">CIRCUITO COMPLETO</span>
          <strong>Fonte 24 V → PLC LOGO! → Contator KM1</strong>
          <small>Modelos 3D reais ligados por cabos. Arraste para rodar.</small>
        </div>

        <div className="dc-showcase-tools">
          <button type="button" onClick={() => setPowered((v) => !v)} aria-pressed={powered} title="Ligar/desligar a alimentação do circuito">
            <i className={powered ? 'on' : ''} />
            {powered ? 'Alimentado' : 'Sem tensão'}
          </button>
          <button type="button" onClick={() => setAutoRotate((v) => !v)} aria-pressed={rotating} title="Rodar o circuito automaticamente">
            <i className={rotating ? 'on' : ''} />
            Rotação
          </button>
        </div>
      </div>
    </div>
  )
}

useGLTF.preload(MODEL_PATHS.plcSiemensLogo1224RC)
useGLTF.preload(MODEL_PATHS.wegContactorCWC09)
useGLTF.preload(MODEL_PATHS.powerSupplyProauto24A)
