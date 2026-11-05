import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { MOTOR_FAN } from './motorTerminalLayout'

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
  diameterMm = MOTOR_FAN.diameter,
  hubDiameterMm = MOTOR_FAN.hubDiameter,
  blades = MOTOR_FAN.blades,
  pitchDeg = MOTOR_FAN.pitchDeg,
  color = '#1d4ed8',
}: MotorShaftFanProps) {
  const spinner = useRef<THREE.Group>(null)
  const blur = useRef<THREE.Mesh>(null)

  const radius = (diameterMm / 2) * MM
  const hubRadius = (hubDiameterMm / 2) * MM
  const bladeLength = Math.max(0.02, radius - hubRadius * 0.85)
  const bladeWidth = Math.max(0.03, (MOTOR_FAN.bladeWidth * MM) * diameterMm / MOTOR_FAN.diameter)
  const bladeThickness = Math.max(0.008, radius * 0.055)

  const bladeAngles = useMemo(
    () => Array.from({ length: Math.max(2, blades) }, (_, index) => (index / Math.max(2, blades)) * Math.PI * 2),
    [blades],
  )

  // O veio do motor é paralelo a X: todo o conjunto roda em torno de X.
  // Física melhorada: inércia visual + vibração + blur progressivo sincronizado com som
  const timeRef = useRef(0)
  useFrame((_, delta) => {
    timeRef.current += delta
    const rpm = Number(component.state.rpmVisual ?? 0)
    const direction = component.state.direction === 'ccw' ? -1 : 1
    const running = !!component.state.running
    if (spinner.current) {
      if (rpm > 0.001) {
        // Velocidade realista: 1435rpm = 150 rad/s; escala visual /16 ≈9.4 rad/s a rpm=1
        // Adiciona ripple de binário no arranque (0.15-0.4) e vibração de alta freq
        let speed = rpm * 9.4
        if (rpm > 0.02 && rpm < 0.45) {
          // Cintilação de escorregamento no arranque - motor ainda não sincronizou
          speed *= 1 + 0.18 * Math.sin(timeRef.current * 18) * (0.45 - rpm)
        }
        if (running && rpm > 0.7) {
          // Micro-vibração de desequilíbrio a alta rotação
          speed *= 1 + 0.02 * Math.sin(timeRef.current * 32)
        }
        spinner.current.rotation.x += direction * speed * delta
        // Vibração axial do veio (wobble) quando em carga
        const wobble = running ? Math.min(0.004, rpm * 0.003) * Math.sin(timeRef.current * 55) : 0
        spinner.current.position.y = wobble
        spinner.current.position.z = wobble * 0.6
      }
      // Esconder/mostrar com fade: pás visíveis a baixa rpm, blur domina a alta
      const bladesOpacity = THREE.MathUtils.clamp(1 - (rpm - 0.35) * 1.8, 0.08, 1)
      spinner.current.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh && mesh.material && (mesh.material as THREE.MeshStandardMaterial).color) {
          const mat = mesh.material as THREE.MeshStandardMaterial
          // só mexe nas pás (cor #1d4ed8 ou laranja), não no cubo cinzento
          if (mat.color.getHexString() === '1d4ed8' || mat.color.getHexString() === 'f59e0b') {
            mat.transparent = true
            mat.opacity = bladesOpacity
          }
        }
      })
    }
    if (blur.current) {
      const material = blur.current.material as THREE.MeshStandardMaterial
      // Blur progressivo: começa a 0.28, satura a 0.38, com pulsar sincronizado ao som
      const base = THREE.MathUtils.clamp((rpm - 0.28) * 0.9, 0, 0.38)
      const pulse = running && rpm > 0.5 ? 0.03 * Math.sin(timeRef.current * 14) : 0
      material.opacity = THREE.MathUtils.clamp(base + pulse, 0, 0.42)
      blur.current.visible = material.opacity > 0.008
      // Rotação do disco de blur para evitar estroboscopia (metade da velocidade das pás)
      if (rpm > 0.3) blur.current.rotation.x += direction * rpm * 4.5 * delta
    }
  })

  return (
    <group>
      {/* cubo de aperto ao veio */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[hubRadius, hubRadius, MOTOR_FAN.hubLength * MM, 24]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[(MOTOR_FAN.hubLength / 2 + 2) * MM, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[hubRadius * 0.45, hubRadius * 0.45, 6 * MM, 18]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.25} />
      </mesh>

      <group ref={spinner}>
        {bladeAngles.map((angle, index) => (
          <group key={index} rotation={[angle, 0, 0]}>
            <group position={[0, hubRadius * 0.85 + bladeLength / 2, 0]}>
              {/* a pá é radial em Y; o ângulo de ataque é uma torção em torno desse eixo */}
              {/* pá elíptica (perfil de ventoinha) — esfera achatada */}
              <mesh rotation={[0, (pitchDeg * Math.PI) / 180, 0]} scale={[bladeWidth / 2, bladeLength / 2, bladeThickness / 2]} castShadow>
                <sphereGeometry args={[1, 28, 14]} />
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
