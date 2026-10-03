import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'

/**
 * Pá (ventoinha de ensaio) montada no veio do motor.
 *
 * É geometria do próprio componente — faz parte da definição do motor, não de
 * nenhuma edição guardada no navegador. Roda com a velocidade simulada
 * (`state.rpmVisual`, 0→1) e no sentido real (`state.direction`), para se ver de
 * imediato se o motor arranca, inverte ou está parado.
 *
 * Medidas em unidades da cena: 1 unidade = 100 mm.
 */

export interface MotorShaftFanProps {
  component: ElectricalComponent
  /** Diâmetro da pá em mm (ponta a ponta). */
  diameterMm?: number
  /** Diâmetro do cubo de aperto, em mm. */
  hubDiameterMm?: number
  /** Número de pás. */
  blades?: number
  /** Ângulo de ataque das pás, em graus. */
  pitchDeg?: number
  /** Cor das pás. */
  color?: string
}

const MM = 0.01

export default function MotorShaftFan3D({
  component,
  diameterMm = 110,
  hubDiameterMm = 34,
  blades = 5,
  pitchDeg = 28,
  color = '#1d4ed8',
}: MotorShaftFanProps) {
  const spinner = useRef<THREE.Group>(null)
  const blur = useRef<THREE.Mesh>(null)

  const radius = (diameterMm / 2) * MM
  const hubRadius = (hubDiameterMm / 2) * MM
  const bladeLength = Math.max(0.02, radius - hubRadius * 0.85)
  const bladeWidth = Math.max(0.03, radius * 0.42)
  const bladeThickness = Math.max(0.008, radius * 0.055)

  const bladeAngles = useMemo(
    () => Array.from({ length: Math.max(2, blades) }, (_, index) => (index / Math.max(2, blades)) * Math.PI * 2),
    [blades],
  )

  // O veio do motor é paralelo a X: todo o conjunto roda em torno de X.
  useFrame((_, delta) => {
    const rpm = Number(component.state.rpmVisual ?? 0)
    const direction = component.state.direction === 'ccw' ? -1 : 1
    if (spinner.current && rpm > 0) spinner.current.rotation.x += direction * rpm * 9 * delta
    if (blur.current) {
      const material = blur.current.material as THREE.MeshStandardMaterial
      material.opacity = THREE.MathUtils.clamp((rpm - 0.55) * 0.5, 0, 0.22)
      blur.current.visible = material.opacity > 0.01
    }
  })

  return (
    <group>
      {/* cubo de aperto ao veio */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[hubRadius, hubRadius, 26 * MM, 24]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[14 * MM, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[hubRadius * 0.45, hubRadius * 0.45, 6 * MM, 18]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.25} />
      </mesh>

      <group ref={spinner}>
        {bladeAngles.map((angle, index) => (
          <group key={index} rotation={[angle, 0, 0]}>
            <group position={[0, hubRadius * 0.85 + bladeLength / 2, 0]}>
              {/* a pá é radial em Y; o ângulo de ataque é uma torção em torno desse eixo */}
              <mesh rotation={[0, (pitchDeg * Math.PI) / 180, 0]} castShadow>
                <boxGeometry args={[bladeWidth, bladeLength, bladeThickness]} />
                <meshStandardMaterial color={color} metalness={0.35} roughness={0.42} side={THREE.DoubleSide} />
              </mesh>
            </group>
          </group>
        ))}
        {/* marca numa das pás: permite ler o sentido de rotação a baixa velocidade */}
        <mesh position={[bladeWidth * 0.3, hubRadius * 0.85 + bladeLength * 0.82, 0]} castShadow>
          <boxGeometry args={[bladeWidth * 0.28, bladeLength * 0.2, bladeThickness * 1.4]} />
          <meshStandardMaterial color="#f59e0b" emissive="#b45309" emissiveIntensity={0.35} />
        </mesh>
      </group>

      {/* disco de rasto a alta velocidade (as pás sozinhas estroboscopam) */}
      <mesh ref={blur} rotation={[0, 0, Math.PI / 2]} visible={false} raycast={() => null}>
        <cylinderGeometry args={[radius * 0.98, radius * 0.98, 2 * MM, 36]} />
        <meshStandardMaterial color={color} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
