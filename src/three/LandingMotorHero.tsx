import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo } from 'react'
import type { ComponentType } from '../types'
import { createComponent } from '../electrical/factory'
import { getComponentModelSpec } from './modelPaths'
import { preparedModel, cloneMaterials, applyModelState } from './LandingShowcase'
import MotorShaftFan3D from './MotorShaftFan3D'

/**
 * Motor trifásico SEW (DRN80MK4-B3) sozinho, em vista isométrica, com a pá do
 * veio sempre em rotação. É o mesmo GLB e a mesma geometria de ventoinha do
 * editor — sem painel, sem simulação: só o equipamento em marcha, a rodar com
 * ponteiro (arraste para girar) e auto-rotação suave em repouso.
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

  const fanOffset: [number, number, number] = [prepared.targetHeight * 0.42, 0, 0]

  return (
    <group position-y={prepared.targetHeight / 2 + 0.02}>
      <primitive object={prepared.scene} />
      <group position={fanOffset} scale={0.55}>
        <MotorShaftFan3D component={fanComponent} diameterMm={110} />
      </group>
    </group>
  )
}

export default function LandingMotorHero() {
  return (
    <div className="dx-motor-hero">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [2.5, 2.1, 2.5], fov: 30, near: 0.1, far: 40 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.55, 0)}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[4, 6, 4]} intensity={1.05} castShadow shadow-mapSize={[1024, 1024]} />
        <Suspense fallback={null}>
          <MotorRunning />
          {/* plinta discreta sob o motor — apenas para assentar o modelo no cenário */}
          <mesh position={[0, -0.06, 0]} receiveShadow>
            <boxGeometry args={[2.4, 0.12, 1.6]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.9} metalness={0.05} />
          </mesh>
          <ContactShadows position={[0, 0.012, 0]} opacity={0.42} scale={5} blur={2.6} far={1.4} resolution={512} />
          <Environment preset="city" />
        </Suspense>
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.08}
          autoRotate
          autoRotateSpeed={0.7}
          target={[0, 0.55, 0]}
          minPolarAngle={Math.PI * 0.24}
          maxPolarAngle={Math.PI * 0.55}
        />
      </Canvas>
      <span className="dx-motor-hero-hint" aria-hidden>Arraste para girar</span>
    </div>
  )
}
