import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import {
  PNEUMATIC_CYLINDER_SIZE_MM,
  PNEUMATIC_FRL_SIZE_MM,
  PNEUMATIC_TEE_SIZE_MM,
  PNEUMATIC_VALVE52_SIZE_MM,
} from './pneumaticsModel'

const U = PANEL_UNITS_PER_MM

/** Textura realista do manómetro analógico 0–10 bar para a unidade FRL. */
function createPressureGaugeTexture(pressureBar: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 6
  ctx.stroke()

  // Escala 0..10 bar
  const startA = Math.PI * 0.78
  const sweepA = Math.PI * 1.44
  for (let b = 0; b <= 10; b += 1) {
    const a = startA + (b / 10) * sweepA
    const r1 = S * 0.34
    const r2 = S * 0.42
    ctx.strokeStyle = b >= 8 ? '#dc2626' : '#0f172a'
    ctx.lineWidth = b % 2 === 0 ? 4 : 2
    ctx.beginPath()
    ctx.moveTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1)
    ctx.lineTo(S / 2 + Math.cos(a) * r2, S / 2 + Math.sin(a) * r2)
    ctx.stroke()
    if (b % 2 === 0) {
      ctx.fillStyle = b >= 8 ? '#dc2626' : '#0f172a'
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(b), S / 2 + Math.cos(a) * (S * 0.25), S / 2 + Math.sin(a) * (S * 0.25))
    }
  }
  ctx.fillStyle = '#475569'
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('bar', S / 2, S * 0.72)

  // Ponteiro da pressão atual
  const clamped = Math.max(0, Math.min(10, pressureBar))
  const needleA = startA + (clamped / 10) * sweepA
  ctx.strokeStyle = '#dc2626'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(S / 2, S / 2)
  ctx.lineTo(S / 2 + Math.cos(needleA) * (S * 0.34), S / 2 + Math.sin(needleA) * (S * 0.34))
  ctx.stroke()

  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, 10, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

/** Racor rápido pneumático Push-In azul + corpo metálico niquelado reutilizável */
function PushInPort({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation ?? [0, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[9 * U, 9 * U, 12 * U, 6]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.26} metalness={0.86} />
      </mesh>
      <mesh position={[0, 8 * U, 0]} castShadow>
        <cylinderGeometry args={[7.5 * U, 7.5 * U, 7 * U, 16]} />
        <meshStandardMaterial color="#0284c7" roughness={0.34} metalness={0.14} />
      </mesh>
      <mesh position={[0, 12 * U, 0]}>
        <cylinderGeometry args={[4.5 * U, 4.5 * U, 3 * U, 14]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} />
      </mesh>
    </group>
  )
}

/** 1. Unidade FRL Pneumática (Filtro + Regulador + Manómetro 0–10 bar) */
export function PneumaticFrl3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const pressureBar = c.state.airSupplyOn === false ? 0 : Number(c.state.pressureBar ?? 6)
  const gaugeTex = useMemo(() => createPressureGaugeTexture(pressureBar), [pressureBar])
  useEffect(() => () => { gaugeTex?.dispose() }, [gaugeTex])

  const W = PNEUMATIC_FRL_SIZE_MM.width * U
  const H = PNEUMATIC_FRL_SIZE_MM.height * U

  return (
    <group position={position} name={`pneumatic-frl-3d-${c.id}`}>
      {/* Bloco central em alumínio fundido cinza-escuro */}
      <mesh position={[0, 18 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[78 * U, 64 * U, 62 * U]} />
        <meshStandardMaterial color="#334155" roughness={0.38} metalness={0.64} />
      </mesh>
      {/* Manípulo regulador de pressão superior (preto + anel azul) */}
      <mesh position={[0, 68 * U, 0]} castShadow>
        <cylinderGeometry args={[24 * U, 26 * U, 42 * U, 20]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 50 * U, 0]}>
        <cylinderGeometry args={[27 * U, 27 * U, 8 * U, 20]} />
        <meshStandardMaterial color="#0284c7" roughness={0.35} metalness={0.2} />
      </mesh>
      {/* Copo transparente do filtro de condensados + elemento filtrante de bronze */}
      <mesh position={[0, -52 * U, 0]} castShadow>
        <cylinderGeometry args={[28 * U, 24 * U, 86 * U, 22]} />
        <meshPhysicalMaterial
          color="#e0f2fe"
          transparent
          opacity={0.42}
          roughness={0.12}
          metalness={0.05}
          userData={{ keepTransparent: true }}
        />
      </mesh>
      <mesh position={[0, -34 * U, 0]}>
        <cylinderGeometry args={[14 * U, 14 * U, 42 * U, 16]} />
        <meshStandardMaterial color="#b45309" roughness={0.62} metalness={0.45} />
      </mesh>
      {/* Gaiola metálica protetora inferior + purga azul */}
      <mesh position={[0, -98 * U, 0]} castShadow>
        <cylinderGeometry args={[11 * U, 8 * U, 16 * U, 14]} />
        <meshStandardMaterial color="#0284c7" roughness={0.35} metalness={0.2} />
      </mesh>
      {/* Manómetro frontal 0–10 bar */}
      <group position={[0, 18 * U, 40 * U]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[25 * U, 25 * U, 18 * U, 24]} />
          <meshStandardMaterial color="#1e293b" roughness={0.32} metalness={0.6} />
        </mesh>
        {gaugeTex && (
          <mesh position={[0, 0, 9.5 * U]}>
            <circleGeometry args={[22 * U, 24]} />
            <meshStandardMaterial map={gaugeTex} roughness={0.22} metalness={0.05} />
          </mesh>
        )}
      </group>
      {/* Saída pneumática Push-In (+X) e entrada de linha (-X) */}
      <PushInPort position={[W * 0.38, 18 * U, 0]} rotation={[0, 0, -Math.PI / 2]} />
      <PushInPort position={[-W * 0.38, 18 * U, 0]} rotation={[0, 0, Math.PI / 2]} />
      {/* Suporte traseiro de fixação */}
      <mesh position={[0, H * 0.08, -34 * U]} castShadow>
        <boxGeometry args={[86 * U, 52 * U, 8 * U]} />
        <meshStandardMaterial color="#64748b" roughness={0.4} metalness={0.75} />
      </mesh>
    </group>
  )
}

/** 2. Eletroválvula Pneumática 5/2 Vias · 24V DC */
export function PneumaticValve523D({
  c,
  position,
  onManualToggle,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  onManualToggle?: () => void
}) {
  const active = Boolean(c.state.energized || c.state.manualOverride)
  const W = PNEUMATIC_VALVE52_SIZE_MM.width * U
  const H = PNEUMATIC_VALVE52_SIZE_MM.height * U

  return (
    <group position={position} name={`pneumatic-valve52-3d-${c.id}`}>
      {/* Corpo distribuidor em alumínio maquinado */}
      <mesh position={[12 * U, -8 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[102 * U, 44 * U, 36 * U]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.28} metalness={0.82} />
      </mesh>
      {/* Bobina solenoide 24V DC à esquerda (-X) + ficha DIN */}
      <mesh position={[-48 * U, 2 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[36 * U, 48 * U, 34 * U]} />
        <meshStandardMaterial color="#1e293b" roughness={0.44} metalness={0.24} />
      </mesh>
      {/* LED de estado na bobina */}
      <mesh position={[-48 * U, 28 * U, 6 * U]}>
        <sphereGeometry args={[5.5 * U, 12, 12]} />
        <meshStandardMaterial
          color={active ? '#f59e0b' : '#475569'}
          emissive={active ? '#f59e0b' : '#000000'}
          emissiveIntensity={active ? 1.4 : 0}
        />
      </mesh>
      {/* Botão amarelo de acionamento manual auxiliar */}
      <mesh
        position={[-22 * U, 18 * U, 0]}
        castShadow
        onClick={(e) => { e.stopPropagation(); onManualToggle?.() }}
      >
        <cylinderGeometry args={[6.5 * U, 6.5 * U, 12 * U, 12]} />
        <meshStandardMaterial color="#eab308" roughness={0.38} metalness={0.18} />
      </mesh>
      {/* 2 pórticos superiores A (4) e B (2) Push-In */}
      <PushInPort position={[-2 * U, 20 * U, 0]} />
      <PushInPort position={[34 * U, 20 * U, 0]} />
      {/* Pórtico inferior central P (1) + 2 silenciadores em latão sinterizado (R/S) */}
      <PushInPort position={[16 * U, -36 * U, 0]} rotation={[0, 0, Math.PI]} />
      {[-14 * U, 46 * U].map((xPos, i) => (
        <mesh key={i} position={[xPos, -36 * U, 0]} castShadow>
          <cylinderGeometry args={[7 * U, 5 * U, 16 * U, 12]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.45} metalness={0.75} />
        </mesh>
      ))}
      {/* Placa base */}
      <mesh position={[0, -H / 2 + 4 * U, 0]} receiveShadow>
        <boxGeometry args={[W * 0.88, 6 * U, 44 * U]} />
        <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.65} />
      </mesh>
    </group>
  )
}

/** 3. Cilindro Pneumático ISO 15552 (Dupla Ação com haste cromada animada) */
export function PneumaticCylinder3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const rodRef = useRef<THREE.Group>(null)
  const posRef = useRef(Number(c.state.positionPct ?? 0))
  const W = PNEUMATIC_CYLINDER_SIZE_MM.width * U
  const barrelL = 175 * U
  const strokeMax = 115 * U

  useFrame((_, delta) => {
    const target = Math.max(0, Math.min(100, Number(c.state.positionPct ?? 0)))
    posRef.current += (target - posRef.current) * Math.min(1, delta * 9)
    if (rodRef.current) {
      rodRef.current.position.x = (posRef.current / 100) * strokeMax
    }
  })

  return (
    <group position={position} name={`pneumatic-cylinder-3d-${c.id}`}>
      {/* Camisa principal em alumínio anodizado */}
      <mesh position={[-W * 0.16, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[barrelL, 54 * U, 54 * U]} />
        <meshStandardMaterial color="#d4dce4" roughness={0.28} metalness={0.82} />
      </mesh>
      {/* Cabeças traseira (-X) e frontal (+X) em alumínio fundido escuro */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[-W * 0.16 + side * (barrelL / 2 + 12 * U), 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[26 * U, 62 * U, 62 * U]} />
          <meshStandardMaterial color="#475569" roughness={0.38} metalness={0.72} />
        </mesh>
      ))}
      {/* 4 tirantes de aço inox nos cantos */}
      {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sy, sz], i) => (
        <mesh key={i} position={[-W * 0.16, sy * 24 * U, sz * 24 * U]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[3.5 * U, 3.5 * U, barrelL + 44 * U, 10]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.22} metalness={0.9} />
        </mesh>
      ))}
      {/* Bucim / vedante frontal de saída da haste */}
      <mesh position={[-W * 0.16 + barrelL / 2 + 28 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[17 * U, 17 * U, 12 * U, 18]} />
        <meshStandardMaterial color="#64748b" roughness={0.3} metalness={0.82} />
      </mesh>
      {/* Pórticos pneumáticos Push-In A (recuo/avanço) no topo das cabeças */}
      <PushInPort position={[-W * 0.16 - barrelL / 2 - 12 * U, 36 * U, 0]} />
      <PushInPort position={[-W * 0.16 + barrelL / 2 + 12 * U, 36 * U, 0]} />

      {/* Haste cromada móvel contínua (nunca se separa do cabeçote frontal!) + ponteira roscada */}
      <group ref={rodRef}>
        <mesh position={[-W * 0.16 + barrelL / 2 - 22 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[10 * U, 10 * U, 168 * U, 18]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.12} metalness={0.96} />
        </mesh>
        <mesh position={[-W * 0.16 + barrelL / 2 + 68 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[14 * U, 14 * U, 16 * U, 6]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.28} metalness={0.86} />
        </mesh>
      </group>
    </group>
  )
}

/** 4. União em T Pneumática Push-In 3 vias (P1 / P2 / P3) */
export function PneumaticTee3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const W = PNEUMATIC_TEE_SIZE_MM.width * U
  return (
    <group position={position} name={`pneumatic-tee-3d-${c.id}`}>
      {/* Corpo polimérico preto em T */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[10 * U, 10 * U, W * 0.72, 16]} />
        <meshStandardMaterial color="#1e293b" roughness={0.44} metalness={0.18} />
      </mesh>
      <mesh position={[0, 14 * U, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[10 * U, 10 * U, 30 * U, 16]} />
        <meshStandardMaterial color="#1e293b" roughness={0.44} metalness={0.18} />
      </mesh>
      {/* 3 colares azuis Push-In */}
      <PushInPort position={[-W * 0.34, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
      <PushInPort position={[W * 0.34, 0, 0]} rotation={[0, 0, -Math.PI / 2]} />
      <PushInPort position={[0, 26 * U, 0]} />
    </group>
  )
}
