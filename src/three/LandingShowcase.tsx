import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, OrbitControls, Text, useGLTF } from '@react-three/drei'
import { Suspense, Component, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { MODEL_PATHS } from './modelPaths'

/**
 * Vitrine 3D real da landing page.
 *
 * A página inicial mostra os equipamentos verdadeiros (os mesmos ficheiros GLB
 * usados no Painel 3D do editor) e não desenhos SVG: a fonte Proauto/Chinfa
 * DRAN120, o contator WEG CWC e o LOGO! da Siemens aparecem sobre a calha DIN,
 * com o ecrã/led a acender consoante a alimentação, rotação automática e
 * seletor de equipamento. Cada ficha (dados reais do datashEEt) acompanha o
 * modelo escolhido.
 */

type DeviceKey = 'logo' | 'weg' | 'proauto'

export interface DeviceSpec {
  key: DeviceKey
  brand: string
  model: string
  title: string
  subtitle: string
  /** URL do GLB real de cada equipamento. */
  modelUrl: string
  rotation: [number, number, number]
  targetHeight: number
  /** Linhas de ficha técnica (valores reais dos manuais/datasheets). */
  specs: Array<{ label: string; value: string }>
  datasheet?: string
}

export const SHOWCASE_DEVICES: DeviceSpec[] = [
  {
    key: 'logo',
    brand: 'SIEMENS',
    model: 'LOGO! 12/24RC',
    title: 'Controlador lógico',
    subtitle: '8 entradas digitais · 4 saídas a relé',
    modelUrl: MODEL_PATHS.plcSiemensLogo1224RC,
    rotation: [Math.PI / 2, 0, 0],
    targetHeight: 1.35,
    specs: [
      { label: 'Alimentação', value: '12/24 V DC' },
      { label: 'Entradas', value: '8 × 24 V DC (I1…I8)' },
      { label: 'Saídas', value: '4 × relé (Q1…Q4)' },
      { label: 'Ecrã', value: 'LCD retroiluminado' },
    ],
    datasheet: '/datasheets/logo-manual-0ba4-en.pdf',
  },
  {
    key: 'weg',
    brand: 'WEG',
    model: 'CWC09 · 12679840',
    title: 'Contator tripolar',
    subtitle: '3 NA de potência · 1 NA auxiliar · bobina 42 V / 50 Hz',
    modelUrl: MODEL_PATHS.wegContactorCWC09,
    rotation: [Math.PI / 2, 0, 0],
    targetHeight: 1.25,
    specs: [
      { label: 'Ie AC-3 (≤440 V)', value: '9 A' },
      { label: 'Ie AC-1 (≤690 V)', value: '20 A' },
      { label: 'Ue · Ui / Uimp', value: '690 V · 4 kV' },
      { label: 'Vida útil', value: '10 M manobras · 1,3 M AC-3' },
    ],
    datasheet: '/datasheets/weg-cwc09-12679840.pdf',
  },
  {
    key: 'proauto',
    brand: 'PROAUTO · CHINFA',
    model: 'DRAN120-24A',
    title: 'Fonte de alimentação',
    subtitle: '24 V DC · 5 A · montagem em calha DIN 35 mm',
    modelUrl: MODEL_PATHS.powerSupplyProauto24A,
    rotation: [0, 0, 0],
    targetHeight: 1.25,
    specs: [
      { label: 'Saída', value: '24 V DC · 5 A (120 W)' },
      { label: 'Entrada', value: '100…240 V AC' },
      { label: 'Bornes', value: 'V+, V−, RDY, L, N, PE' },
      { label: 'Montagem', value: 'Calha DIN 35 mm' },
    ],
    datasheet: '/datasheets/chinfa-dran120-series.pdf',
  },
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

/** Coloca o produto em cima da calha, centrado e escalado, independentemente do CAD de origem. */
function useFittedModel(url: string, rotation: [number, number, number], targetHeight: number) {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const obj = scene.clone(true)
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone()
    })
    obj.rotation.set(...rotation)
    obj.updateMatrixWorld(true)
    const raw = new THREE.Box3().setFromObject(obj)
    const rawHeight = raw.max.y - raw.min.y
    obj.scale.setScalar(rawHeight > 0 ? targetHeight / rawHeight : 1)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    obj.position.set(-center.x, -box.min.y, -center.z)
    return obj
  }, [scene, rotation, targetHeight])
}

/** Peças que acendem: ecrã verde do LOGO!, led da fonte e indicador do contator. */
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
      lit.forEach((material) => material.emissiveIntensity = 0)
    }
  }, [model, powered])
}

function ShowcaseDevice({ spec, powered, autoRotate }: { spec: DeviceSpec; powered: boolean; autoRotate: boolean }) {
  const model = useFittedModel(spec.modelUrl, spec.rotation, spec.targetHeight)
  usePoweredMaterials(model, powered)
  const pivot = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!autoRotate || !pivot.current) return
    pivot.current.rotation.y += delta * 0.32
  })
  return (
    <group ref={pivot}>
      <primitive object={model} />
    </group>
  )
}

function DinRailStage({ width = 5 }: { width?: number }) {
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

function Loader({ label }: { label: string }) {
  return (
    <Text position={[0, 0.8, 0]} fontSize={0.16} color="#64748b" anchorX="center">
      {label}
    </Text>
  )
}

/**
 * Cena pública da landing page. Um único `<Canvas>` mostra o equipamento
 * escolhido; o utilizador pode rodar, aproximar e ligar/desligar a alimentação
 * para ver o ecrã e os indicadores reagirem — tudo com os modelos reais.
 */
export default function LandingShowcase({
  deviceKey = 'logo',
  className = '',
  compact = false,
  caption = true,
}: {
  deviceKey?: DeviceKey
  className?: string
  compact?: boolean
  caption?: boolean
}) {
  const [key, setKey] = useState<DeviceKey>(deviceKey)
  const [powered, setPowered] = useState(true)
  const [autoRotate, setAutoRotate] = useState(true)
  const device = SHOWCASE_DEVICES.find((d) => d.key === key) ?? SHOWCASE_DEVICES[0]
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useEffect(() => { setKey(deviceKey) }, [deviceKey])
  const rotating = autoRotate && !reduceMotion
  return (
    <div className={'dc-showcase' + (compact ? ' is-compact' : '') + ' ' + className}>
      <div className="dc-showcase-stage">
        <ShowcaseErrorBoundary fallback={<div className="dc-showcase-fallback">Modelo 3D indisponível neste navegador.</div>}>
          <Canvas shadows dpr={[1, 2]} camera={{ position: [1.5, 1.35, 2.9], fov: 38 }} gl={{ antialias: true }}>
            <ambientLight intensity={0.72} />
            <directionalLight position={[4, 6, 5]} intensity={1.25} castShadow shadow-mapSize={[1024, 1024]} />
            <directionalLight position={[-4, 2.5, -3]} intensity={0.34} />
            <Suspense fallback={<Loader label="A carregar modelo 3D…" />}>
              <ShowcaseDevice key={device.key} spec={device} powered={powered} autoRotate={rotating} />
            </Suspense>
            <DinRailStage />
            <ContactShadows position={[0, -0.02, 0]} opacity={0.32} scale={7} blur={2.4} far={3} />
            <OrbitControls
              makeDefault
              enablePan={false}
              minDistance={1.6}
              maxDistance={7}
              minPolarAngle={0.35}
              maxPolarAngle={Math.PI / 2.05}
              autoRotate={false}
            />
          </Canvas>
        </ShowcaseErrorBoundary>

        <div className="dc-showcase-badge">
          <span className="dc-showcase-brand">{device.brand}</span>
          <strong>{device.model}</strong>
          <small>{device.subtitle}</small>
        </div>

        <div className="dc-showcase-tools">
          <button
            type="button"
            onClick={() => setPowered((v) => !v)}
            aria-pressed={powered}
            title="Ligar/desligar a alimentação e ver o equipamento reagir"
          >
            <i className={powered ? 'on' : ''} />
            {powered ? 'Alimentado' : 'Sem tensão'}
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            aria-pressed={rotating}
            title="Rodar a peça automaticamente"
          >
            <i className={rotating ? 'on' : ''} />
            Rotação
          </button>
        </div>
      </div>

      {caption && (
        <div className="dc-showcase-side">
          <div className="dc-showcase-tabs" role="tablist" aria-label="Equipamentos disponíveis">
            {SHOWCASE_DEVICES.map((item) => (
              <button
                key={item.key}
                role="tab"
                type="button"
                aria-selected={item.key === device.key}
                className={item.key === device.key ? 'is-active' : ''}
                onClick={() => setKey(item.key)}
              >
                <b>{item.brand}</b>
                <span>{item.model}</span>
              </button>
            ))}
          </div>
          <dl className="dc-showcase-specs">
            {device.specs.map((spec) => (
              <div key={spec.label}>
                <dt>{spec.label}</dt>
                <dd>{spec.value}</dd>
              </div>
            ))}
          </dl>
          {device.datasheet && (
            <a className="dc-showcase-link" href={device.datasheet} target="_blank" rel="noreferrer">
              Abrir ficha técnica (PDF) <span aria-hidden>↗</span>
            </a>
          )}
        </div>
      )}
    </div>
  )
}

useGLTF.preload(MODEL_PATHS.plcSiemensLogo1224RC)
useGLTF.preload(MODEL_PATHS.wegContactorCWC09)
useGLTF.preload(MODEL_PATHS.powerSupplyProauto24A)
