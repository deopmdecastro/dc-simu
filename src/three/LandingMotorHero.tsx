import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ComponentType } from '../types'
import { createComponent } from '../electrical/factory'
import { getComponentModelSpec } from './modelPaths'
import { preparedModel, cloneMaterials, applyModelState } from './LandingShowcase'
import { MOTOR_FAN, MOTOR_SIZE, MOTOR_CAD } from './motorTerminalLayout'
import MotorShaftFan3D from './MotorShaftFan3D'
import { applyEditorMotorTextures } from './motorEditorTextures'

/**
 * Motor trifásico SEW (DRN80MK4-B3) isolado, sem cartão nem HUD: a peça e a pá
 * do veio, montada exatamente onde o editor a coloca (MOTOR_FAN.hubX no CAD —
 * veio em +X, Ø19 de x=241…264 mm). As pás giram sempre, em sentido horário;
 * a câmara só se mexe quando o utilizador arrasta (sem auto-rotação).
 *
 * Leve por desenho: iluminação de estúdio local (sem HDR externo), câmara
 * isométrica enquadrada pela projeção real do modelo e render suspenso quando o
 * hero sai do ecrã ou o separador fica oculto.
 */

/** Direção isométrica (do alvo para a câmara): 45° em azimute, ~35,3° de elevação. */
const ISO_DIR = new THREE.Vector3(1, 0.82, 1).normalize()
/** Fração da área útil que o motor ocupa na projeção isométrica; sem cartão à volta. */
const FILL = 0.90

function FitIsoCamera({ box }: { box: THREE.Box3 }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const size = useThree((state) => state.size)
  const controls = useThree((state) => state.controls) as { target: THREE.Vector3; update: () => void } | null

  useLayoutEffect(() => {
    const worldUp = new THREE.Vector3(0, 1, 0)
    const forward = ISO_DIR.clone().negate().normalize()
    const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize()
    const camUp = new THREE.Vector3().crossVectors(right, forward).normalize()

    // Projeta os 8 vértices da caixa real no plano da câmara para aproveitar ~90% do palco
    // (evita o desperdício de ~38% da esfera envolvente que deixava o motor pequeno).
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    const corner = new THREE.Vector3()
    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          corner.set(
            ix ? box.max.x : box.min.x,
            iy ? box.max.y : box.min.y,
            iz ? box.max.z : box.min.z,
          )
          const u = corner.dot(right)
          const v = corner.dot(camUp)
          if (u < minU) minU = u
          if (u > maxU) maxU = u
          if (v < minV) minV = v
          if (v > maxV) maxV = v
        }
      }
    }
    const center = box.getCenter(new THREE.Vector3())
    const centerU = center.dot(right)
    const centerV = center.dot(camUp)
    const visualTarget = center
      .clone()
      .addScaledVector(right, (minU + maxU) / 2 - centerU)
      .addScaledVector(camUp, (minV + maxV) / 2 - centerV)

    const halfW = Math.max(0.05, (maxU - minU) / 2)
    const halfH = Math.max(0.05, (maxV - minV) / 2)
    const depthPad = box.getSize(new THREE.Vector3()).length() * 0.28
    const vFov = THREE.MathUtils.degToRad(camera.fov)
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.1)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const distV = halfH / Math.tan(vFov / 2) / FILL
    const distH = halfW / Math.tan(hFov / 2) / FILL
    const distance = Math.max(distV, distH) + depthPad

    camera.position.copy(visualTarget).addScaledVector(ISO_DIR, distance)
    camera.near = Math.max(distance / 100, 0.01)
    camera.far = distance * 12
    camera.lookAt(visualTarget)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.copy(visualTarget)
      controls.update()
    }
  }, [box, camera, controls, size.width, size.height])

  return null
}

function MotorRunning() {
  const type = 'motor3ph' as ComponentType
  const spec = getComponentModelSpec(type)!
  const gltf = useGLTF(spec.path)
  const prepared = useMemo(() => {
    const result = preparedModel(type, gltf.scene)
    cloneMaterials(result.scene)
    applyModelState(result.scene, false, type)
    applyEditorMotorTextures(result.scene)
    return result
  }, [gltf.scene, type])

  const fanComponent = useMemo(() => {
    const component = createComponent('motor3ph', 'M1')
    component.state = { ...component.state, rpmVisual: 0.9, direction: 'cw' }
    return component
  }, [])

  // Posição e escala da pá medidas sobre a caixa REAL do modelo já ajustado
  // (mm do CAD → unidades da cena), tal como o Panel3D faz com
  // motorCadToCentered([MOTOR_FAN.hubX, 0, 0]).
  const fan = useMemo(() => {
    const box = new THREE.Box3().setFromObject(prepared.scene)
    const size = box.getSize(new THREE.Vector3())
    const unitScale = size.y / (MOTOR_SIZE.height * 0.01)
    const x = box.min.x + ((MOTOR_FAN.hubX - MOTOR_CAD.minX) / MOTOR_SIZE.width) * size.x
    const y = box.min.y + ((0 - MOTOR_CAD.minY) / MOTOR_SIZE.height) * size.y
    const z = box.min.z + ((0 - MOTOR_CAD.minZ) / MOTOR_SIZE.depth) * size.z
    const fullBox = box.clone()
    // Inclui a saliência frontal do veio + pá para enquadrar sem cortes.
    fullBox.expandByPoint(new THREE.Vector3(x + 0.09 * unitScale, y + 0.16 * unitScale, z + 0.16 * unitScale))
    fullBox.expandByPoint(new THREE.Vector3(x - 0.03 * unitScale, y - 0.16 * unitScale, z - 0.16 * unitScale))
    return { position: [x, y, z] as [number, number, number], scale: unitScale, box: fullBox, baseBox: box }
  }, [prepared])

  const center = useMemo(() => fan.baseBox.getCenter(new THREE.Vector3()), [fan])
  const size = useMemo(() => fan.baseBox.getSize(new THREE.Vector3()), [fan])

  return (
    <>
      <group>
        <primitive object={prepared.scene} />
        <group position={fan.position} scale={fan.scale}>
          <MotorShaftFan3D component={fanComponent} />
        </group>
      </group>
      <FitIsoCamera box={fan.box} />
      <ContactShadows
        position={[center.x, fan.baseBox.min.y - 0.004, center.z]}
        opacity={0.42}
        scale={Math.max(size.x, size.z) * 2.8}
        blur={2.4}
        far={Math.max(size.y, 0.2) * 1.6}
        resolution={256}
        frames={1}
      />
    </>
  )
}

/** Mapa de reflexos metálicos de alto contraste (estúdio industrial local, sem HDR externo). */
function StudioEnvironment() {
  return (
    <Environment resolution={128} frames={1}>
      <color attach="background" args={['#1b2432']} />
      <Lightformer form="rect" intensity={4.2} color="#ffffff" position={[4, 6, 4]} rotation={[-Math.PI / 3, Math.PI / 5, 0]} scale={[10, 4, 1]} />
      <Lightformer form="rect" intensity={2.8} color="#f8fafc" position={[-5, 3.2, 3.5]} rotation-y={Math.PI / 2.3} scale={[8, 3.2, 1]} />
      <Lightformer form="rect" intensity={2.4} color="#dbeafe" position={[-2, 5, -5]} rotation={[Math.PI / 4, 0, 0]} scale={[10, 3, 1]} />
      <Lightformer form="rect" intensity={1.8} color="#fff7ed" position={[5.5, 1.4, -2]} rotation-y={-Math.PI / 2.2} scale={[6, 2.5, 1]} />
      <Lightformer form="ring" intensity={1.4} color="#e2e8f0" position={[2, 2, 6]} scale={5} />
    </Environment>
  )
}

export default function LandingMotorHero() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(true)
  const [docVisible, setDocVisible] = useState(() => (typeof document === 'undefined' ? true : !document.hidden))
  const [dpr, setDpr] = useState(() => (typeof window === 'undefined' ? 1.25 : Math.min(1.6, Math.max(1, window.devicePixelRatio || 1))))

  // Pausa o loop WebGL quando o hero sai do ecrã ou o separador fica em segundo plano.
  useEffect(() => {
    const node = hostRef.current
    if (!node || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.01 })
    io.observe(node)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const onVis = () => setDocVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const active = inView && docVisible

  return (
    <div ref={hostRef} className="dx-motor-hero" role="img" aria-label="Motor SEW DRN80MK4 em 3D com a ventoinha do veio a rodar; arraste para girar a vista">
      <Canvas
        frameloop={active ? 'always' : 'never'}
        dpr={dpr}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'default',
          stencil: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.12,
        }}
        camera={{ position: [2, 1.6, 2], fov: 28, near: 0.05, far: 40 }}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.6)} flipflops={2} onFallback={() => setDpr(1)} />
        <ambientLight intensity={0.32} />
        <directionalLight position={[4.2, 6.2, 4.5]} intensity={1.95} color="#fffaf5" />
        <directionalLight position={[-4.0, 2.8, -2.5]} intensity={0.85} color="#dbeafe" />
        <directionalLight position={[1.5, -2.5, 3.5]} intensity={0.35} color="#f1f5f9" />
        <Suspense fallback={null}>
          <MotorRunning />
          <StudioEnvironment />
        </Suspense>
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={Math.PI * 0.12}
          maxPolarAngle={Math.PI * 0.62}
        />
      </Canvas>
      <span className="dx-motor-hero-hint" aria-hidden>Arraste para girar</span>
    </div>
  )
}
