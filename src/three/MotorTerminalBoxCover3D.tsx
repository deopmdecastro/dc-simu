import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { MOTOR_BOX, motorCadToCentered } from './motorTerminalLayout'
import { PANEL_UNITS_PER_MM } from './modelPaths'

function createCoverWarningTexture(lidColor: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = lidColor
  ctx.fillRect(0, 0, 256, 256)

  // Moldura biselada subtil da tampa fundida
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 6
  ctx.strokeRect(14, 14, 228, 228)
  ctx.strokeStyle = 'rgba(0,0,0,0.26)'
  ctx.lineWidth = 4
  ctx.strokeRect(24, 24, 208, 208)

  // Símbolo de aviso elétrico amarelo central (ISO 7010 W012)
  ctx.beginPath()
  ctx.moveTo(128, 72)
  ctx.lineTo(174, 152)
  ctx.lineTo(82, 152)
  ctx.closePath()
  ctx.fillStyle = '#facc15'
  ctx.fill()
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#0f172a'
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(132, 95)
  ctx.lineTo(116, 124)
  ctx.lineTo(129, 124)
  ctx.lineTo(121, 145)
  ctx.lineTo(143, 117)
  ctx.lineTo(129, 117)
  ctx.closePath()
  ctx.fillStyle = '#0f172a'
  ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('400V ~ IP55', 128, 188)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * Tampa metálica aparafusada da caixa de bornes do motor SEW DRN80MK4/B3.
 * Monta exatamente sobre `MOTOR_BOX` (110 × 113 mm, cota topo 128 mm) com junta EPDM preta
 * e 4 parafusos sextavados M5 em inox nos cantos.
 */
export default function MotorTerminalBoxCover3D({
  covered,
  color = '#b91c1c',
  unitsPerMm = PANEL_UNITS_PER_MM,
}: {
  covered: boolean
  color?: string
  unitsPerMm?: number
}) {
  const topTex = useMemo(() => createCoverWarningTexture(color), [color])
  useEffect(() => () => { topTex?.dispose() }, [topTex])

  if (!covered) return null

  const boxW = MOTOR_BOX.x1 - MOTOR_BOX.x0 + 3 // 113 mm
  const boxD = MOTOR_BOX.z1 - MOTOR_BOX.z0 + 3 // 116 mm
  const cx = (MOTOR_BOX.x0 + MOTOR_BOX.x1) / 2
  const cz = (MOTOR_BOX.z0 + MOTOR_BOX.z1) / 2
  const [x, y, z] = motorCadToCentered([cx, MOTOR_BOX.top, cz]).map((v) => v * unitsPerMm)

  const w = boxW * unitsPerMm
  const d = boxD * unitsPerMm
  const gasketH = 2.6 * unitsPerMm
  const lidH = 9.5 * unitsPerMm
  const boltOffX = (boxW / 2 - 9.5) * unitsPerMm
  const boltOffZ = (boxD / 2 - 9.5) * unitsPerMm

  return (
    <group position={[x, y, z]} name="motor-terminal-box-cover">
      {/* Junta estanque EPDM preta */}
      <mesh position={[0, gasketH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.99, gasketH, d * 0.99]} />
        <meshStandardMaterial color="#181c22" roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Corpo fundido da tampa */}
      <mesh position={[0, gasketH + lidH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, lidH, d]} />
        <meshStandardMaterial color={color} roughness={0.34} metalness={0.48} />
      </mesh>
      {/* Ressalto superior com sinalética de tensão */}
      <mesh position={[0, gasketH + lidH + 1.4 * unitsPerMm, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.86, 2.8 * unitsPerMm, d * 0.86]} />
        <meshStandardMaterial
          map={topTex ?? undefined}
          color={topTex ? '#ffffff' : color}
          roughness={0.36}
          metalness={0.35}
        />
      </mesh>
      {/* 4 parafusos M5 em aço inox nos cantos */}
      {[
        [-boltOffX, -boltOffZ],
        [boltOffX, -boltOffZ],
        [-boltOffX, boltOffZ],
        [boltOffX, boltOffZ],
      ].map(([bx, bz], i) => (
        <group key={i} position={[bx, gasketH + lidH + 1.8 * unitsPerMm, bz]}>
          <mesh castShadow>
            <cylinderGeometry args={[3.4 * unitsPerMm, 3.4 * unitsPerMm, 3.6 * unitsPerMm, 6]} />
            <meshStandardMaterial color="#d6dde6" roughness={0.22} metalness={0.88} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
