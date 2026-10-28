import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ComponentType } from '../types'
import { createComponent } from '../electrical/factory'
import { getComponentModelSpec } from './modelPaths'
import { preparedModel, cloneMaterials, applyModelState } from './LandingShowcase'
import { MOTOR_FAN, MOTOR_SIZE, MOTOR_CAD } from './motorTerminalLayout'
import MotorShaftFan3D from './MotorShaftFan3D'

/**
 * Motor trifásico SEW (DRN80MK4-B3) isolado, sem cartão nem HUD: a peça e a pá
 * do veio, montada exatamente onde o editor a coloca (MOTOR_FAN.hubX no CAD —
 * veio em +X, Ø19 de x=241…264 mm). As pás giram sempre, em sentido horário;
 * a câmara só se mexe quando o utilizador arrasta (sem auto-rotação).
 *
 * Leve por desenho: iluminação de estúdio local (sem HDR externo), câmara
 * isométrica enquadrada pela caixa real do modelo e render suspenso quando o
 * hero sai do ecrã.
 */

/** Direção isométrica (do alvo para a câmara): 45° em azimute, ~35,3° de elevação. */
const ISO_DIR = new THREE.Vector3(1, 0.82, 1).normalize()
/** Fração da altura útil que o motor ocupa (bounding sphere); o resto é respiro. */
const FILL = 0.6

function FitIsoCamera({ box }: { box: THREE.Box3 }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const size = useThree((state) => state.size)
  const controls = useThree((state) => state.controls) as { target: THREE.Vector3; update: () => void } | null

  useLayoutEffect(() => {
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const vFov = THREE.MathUtils.degToRad(camera.fov)
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.1)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const fitFov = Math.min(vFov, hFov)
    const distance = sphere.radius / Math.sin(fitFov / 2) / FILL
    camera.position.copy(sphere.center).addScaledVector(ISO_DIR, distance)
    camera.near = Math.max(distance / 100, 0.01)
    camera.far = distance * 12
    camera.lookAt(sphere.center)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.copy(sphere.center)
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
    applyModelState(result.scene, true, type)
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return { position: [x, y, z] as [number, number, number], scale: unitScale, box }
  }, [prepared])

  const center = useMemo(() => fan.box.getCenter(new THREE.Vector3()), [fan])
  const size = useMemo(() => fan.box.getSize(new THREE.Vector3()), [fan])

  return (
    <>
      <group>
        <primitive object={prepared.scene} />
        <group position={fan.position} scale={fan.scale}>
          <MotorShaftFan3D component={fanComponent} />
        </group>
      </group>
      <FitIsoCamera box={fan.box} />
      <ContactShadows position={[center.x, fan.box.min.y - 0.005, center.z]} opacity={0.38} scale={Math.max(size.x, size.z) * 3} blur={2.6} far={Math.max(size.y, 0.2) * 1.6} resolution={128} />
    </>
  )
}

/** Luz de estúdio gerada localmente: evita descarregar um HDR de um CDN externo. */
function StudioEnvironment() {
  return (
    <Environment resolution={64} frames={1}>
      <color attach="background" args={['#e8edf5']} />
      <Lightformer form="rect" intensity={2.2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[-5, 2, 3]} rotation-y={Math.PI / 2.4} scale={[8, 4, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[5, 1.5, -3]} rotation-y={-Math.PI / 2.4} scale={[8, 4, 1]} />
      <Lightformer form="ring" intensity={0.8} position={[0, 1, -6]} scale={6} />
    </Environment>
  )
}

export default function LandingMotorHero() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(true)

  // Sem render fora do ecrã: poupa GPU/bateria enquanto o utilizador lê o resto da página.
  useEffect(() => {
    const node = hostRef.current
    if (!node || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0.01 })
    io.observe(node)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={hostRef} className="dx-motor-hero" role="img" aria-label="Motor SEW DRN80MK4 em 3D com a ventoinha do veio a rodar; arraste para girar a vista">
      <Canvas
        frameloop={active ? 'always' : 'never'}
        dpr={[1, 1.25]}
        gl={{ antialias: true, powerPreference: 'low-power' }}
        camera={{ position: [2, 1.6, 2], fov: 30, near: 0.05, far: 40 }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3.5, 5, 3.5]} intensity={0.9} />
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
