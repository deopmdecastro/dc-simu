import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
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
 */
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

  return (
    <>
      <group>
        <primitive object={prepared.scene} />
        <group position={fan.position} scale={fan.scale}>
          <MotorShaftFan3D component={fanComponent} />
        </group>
      </group>
      <ContactShadows position={[center.x, fan.box.min.y - 0.015, center.z]} opacity={0.4} scale={4.5} blur={2.8} far={1.2} resolution={512} />
    </>
  )
}

export default function LandingMotorHero() {
  return (
    <div className="dx-motor-hero" role="img" aria-label="Motor SEW DRN80MK4 em 3D com a ventoinha do veio a rodar; arraste para girar a vista">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [1.4, 1.05, 1.4], fov: 32, near: 0.05, far: 40 }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3.5, 5, 3.5]} intensity={1.0} castShadow shadow-mapSize={[1024, 1024]} />
        <Suspense fallback={null}>
          <MotorRunning />
          <Environment preset="city" />
        </Suspense>
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.08}
          target={[0.12, -0.02, 0]}
          minPolarAngle={Math.PI * 0.12}
          maxPolarAngle={Math.PI * 0.62}
        />
      </Canvas>
      <span className="dx-motor-hero-hint" aria-hidden>Arraste para girar</span>
    </div>
  )
}
