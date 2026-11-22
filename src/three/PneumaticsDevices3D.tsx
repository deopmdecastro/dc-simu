import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import {
  ELECTRIC_CYLINDER_EPCS_SIZE_MM,
  PNEUMATIC_CYLINDER_SIZE_MM,
  PNEUMATIC_FRL_SIZE_MM,
  PNEUMATIC_GUIDED_CYLINDER_SIZE_MM,
  PNEUMATIC_MANIFOLD_SIZE_MM,
  PNEUMATIC_TEE_SIZE_MM,
  PNEUMATIC_VACUUM_CUP_SIZE_MM,
  PNEUMATIC_VALVE52_SIZE_MM,
} from './pneumaticsModel'

const U = PANEL_UNITS_PER_MM

// Paleta industrial autêntica Festo / DIYI
const FESTO_BLUE = '#0091dc'
const FESTO_BLUE_DARK = '#006eb3'
const ALU_ANODIZED = '#dce2e8'
const ALU_BRUSHED = '#cfd7df'
const ALU_CAST = '#b4bec8'
const CHROME_ROD = '#f5f8fc'
const BRONZE_BUSHING = '#b97347'
const PBT_BLACK = '#1c2128'
const PBT_CHARCOAL = '#2c333d'
const SILENCER_PE = '#e4e7ec'

function makeCanvasTex(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

/** Manómetro analógico Festo MS4-LFR (0–16 bar, ponteiro azul Festo, escala dupla bar/psi) */
function createFestoGaugeTexture(pressureBar: number): THREE.CanvasTexture | null {
  return makeCanvasTex(320, 320, (ctx, S) => {
    const cx = S / 2
    const cy = S / 2
    // Fundo branco fosco com leve sombra periférica
    const grad = ctx.createRadialGradient(cx, cy, S * 0.1, cx, cy, S * 0.47)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.86, '#f1f5f9')
    grad.addColorStop(1, '#cbd5e1')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, S * 0.46, 0, Math.PI * 2)
    ctx.fill()

    // Anel fino interno
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 3
    ctx.stroke()

    // Escala exterior bar (0..16 bar — fiel a image-30.png)
    const startA = Math.PI * 0.76
    const sweepA = Math.PI * 1.48
    for (let b = 0; b <= 16; b += 1) {
      const a = startA + (b / 16) * sweepA
      const major = b % 2 === 0
      const r1 = S * (major ? 0.34 : 0.37)
      const r2 = S * 0.42
      ctx.strokeStyle = b >= 12 ? '#dc2626' : '#0f172a'
      ctx.lineWidth = major ? 3.2 : 1.6
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
      ctx.stroke()
      if (major) {
        ctx.fillStyle = b >= 12 ? '#dc2626' : '#0f172a'
        ctx.font = 'bold 17px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(b), cx + Math.cos(a) * (S * 0.275), cy + Math.sin(a) * (S * 0.275))
      }
    }

    // Arco interior azul psi
    ctx.strokeStyle = FESTO_BLUE
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, S * 0.21, startA, startA + sweepA)
    ctx.stroke()

    // Marca FESTO azul + bar
    ctx.fillStyle = FESTO_BLUE
    ctx.font = '900 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('FESTO', cx, S * 0.72)
    ctx.fillStyle = '#334155'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText('bar / 16 max', cx, S * 0.81)

    // Ponteiro azul Festo
    const clamped = Math.max(0, Math.min(16, pressureBar))
    const needleA = startA + (clamped / 16) * sweepA
    ctx.strokeStyle = FESTO_BLUE
    ctx.lineWidth = 5.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - Math.cos(needleA) * 18, cy - Math.sin(needleA) * 18)
    ctx.lineTo(cx + Math.cos(needleA) * (S * 0.35), cy + Math.sin(needleA) * (S * 0.35))
    ctx.stroke()

    ctx.fillStyle = FESTO_BLUE_DARK
    ctx.beginPath()
    ctx.arc(cx, cy, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e2e8f0'
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fill()
  })
}

/** Gravação laser Festo CPE14-M1B-H-5L-QS-8 com diagrama ISO 5/2 + DataMatrix (fiel a image-28/29.png) */
function createCpe14BodyTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(512, 256, (ctx, W, H) => {
    ctx.fillStyle = '#d3dae2'
    ctx.fillRect(0, 0, W, H)
    // Textura fina escovada metálica
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    for (let y = 0; y < H; y += 3) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
    // Logo FESTO azul
    ctx.fillStyle = FESTO_BLUE
    ctx.font = '900 44px sans-serif'
    ctx.fillText('FESTO', 28, 66)

    // Texto técnico gravado a laser
    ctx.fillStyle = '#1e293b'
    ctx.font = 'bold 20px monospace'
    ctx.fillText('CPE14-M1B-H-5L-QS-8', 28, 102)
    ctx.font = '16px monospace'
    ctx.fillText('196912  N102  1: 3-8bar', 28, 128)
    ctx.fillText('24V DC · Class 2', 28, 152)

    // Símbolo ISO 5/2 simplificado
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.strokeRect(218, 166, 48, 42)
    ctx.strokeRect(266, 166, 48, 42)
    // Setas interiores
    ctx.beginPath()
    ctx.moveTo(230, 206); ctx.lineTo(254, 168)
    ctx.moveTo(278, 168); ctx.lineTo(302, 206)
    ctx.stroke()

    // Código DataMatrix QR (canto superior direito)
    const qx = 376
    const qy = 32
    const cell = 7
    ctx.fillStyle = '#1e293b'
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 12; c++) {
        const border = r === 0 || c === 0 || (r === 11 && c % 2 === 0) || (c === 11 && r % 2 === 0)
        const bits = ((r * 13 + c * 7 + r * c) % 3) === 0
        if (border || bits) ctx.fillRect(qx + c * cell, qy + r * cell, cell - 1, cell - 1)
      }
    }

    // Números gravados nos pórticos (4, 2 em cima; 5, 1, 3 em baixo)
    ctx.fillStyle = '#334155'
    ctx.font = 'bold 22px monospace'
    ctx.fillText('4', 112, 26)
    ctx.fillText('2', 278, 26)
    ctx.fillText('5', 74, 240)
    ctx.fillText('1', 194, 240)
    ctx.fillText('3', 312, 240)
    ctx.fillText('14', 28, 205)
    ctx.fillText('12', 452, 205)
  })
}

/** Gravação branca na bobina Festo MSZE-B-3-24DC (fiel a image-28.png) */
function createMszeCoilTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(256, 160, (ctx, W, H) => {
    ctx.fillStyle = PBT_BLACK
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#f8fafc'
    ctx.font = '900 32px sans-serif'
    ctx.fillText('FESTO', 22, 46)
    ctx.font = 'bold 17px monospace'
    ctx.fillText('MSZE-B-3-24DC', 22, 78)
    ctx.fillStyle = '#cbd5e1'
    ctx.font = '15px monospace'
    ctx.fillText('(2971063)', 22, 102)
    ctx.fillText('1.28W  24V DC', 22, 126)
    ctx.fillText('IP00/65', 22, 146)
  })
}

/** Gravação Festo DFM-20-40-P-A-GF (fiel a image-27.png) */
function createDfmLabelTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(384, 220, (ctx, W, H) => {
    ctx.fillStyle = ALU_ANODIZED
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    for (let x = 0; x < W; x += 4) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    ctx.fillStyle = FESTO_BLUE
    ctx.font = '900 44px sans-serif'
    ctx.fillText('FESTO', 175, 58)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 21px monospace'
    ctx.fillText('DFM-20-40-P-A-GF', 152, 92)
    ctx.font = 'bold 19px monospace'
    ctx.fillText('163346  A157', 172, 120)
    ctx.font = '17px monospace'
    ctx.fillText('Pmax.10bar 145psi', 156, 146)
  })
}

/** Painel superior do controlador SMS Festo EPCS-BS-45-200-10P-A-ST-M-H1-PLK-AA (fiel a image-26.png) */
function createEpcsControllerTexture(positionPct: number, powered: boolean): THREE.CanvasTexture | null {
  return makeCanvasTex(320, 220, (ctx, W, H) => {
    const grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, '#e5eaef')
    grad.addColorStop(1, '#c8d1dc')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 4
    ctx.strokeRect(4, 4, W - 8, H - 8)

    // Cabeçalho Festo SMS
    ctx.fillStyle = FESTO_BLUE
    ctx.font = '900 22px sans-serif'
    ctx.fillText('FESTO', 18, 32)
    ctx.fillStyle = '#334155'
    ctx.font = 'bold 13px monospace'
    ctx.fillText('EPCS-BS-45-200 · SMS', 110, 30)

    // Lista de indicadores LED (fiel a image-26.png)
    const items = ['Speed Out', 'Speed In', 'Force', 'Reference', 'Start Press', 'Demo']
    items.forEach((lbl, idx) => {
      const y = 60 + idx * 24
      const lit = powered && ((idx === 0 && positionPct > 5) || (idx === 3) || (idx === 4 && positionPct >= 95))
      ctx.fillStyle = lit ? '#22c55e' : '#94a3b8'
      ctx.beginPath()
      ctx.arc(26, y - 4, 5.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(lbl, 40, y)
    })

    // Barra LED horizontal de curso/nível (10 segmentos)
    const bx = 178
    const by = 56
    const segs = 10
    const litCount = powered ? Math.max(1, Math.round((positionPct / 100) * segs)) : 0
    for (let s = 0; s < segs; s++) {
      ctx.fillStyle = s < litCount ? '#0ea5e9' : '#94a3b8'
      ctx.fillRect(bx, by + (segs - 1 - s) * 14, 24, 9)
    }
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 18px monospace'
    ctx.fillText(`${Math.round(positionPct)}%`, 220, 128)
    ctx.fillStyle = '#475569'
    ctx.font = '12px monospace'
    ctx.fillText('IO-Link · 24V', 214, 152)
  })
}

/** Etiqueta lateral da ventosa pneumática DIYI VFG30-20 (fiel a image-32.png) */
function createVacuumCupLabelTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(256, 160, (ctx, W, H) => {
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, W - 4, H - 4)
    // Logo DIYI azul + quadrado vermelho
    ctx.fillStyle = '#1d4ed8'
    ctx.font = '900 24px sans-serif'
    ctx.fillText('DIYI', 148, 38)
    ctx.fillStyle = '#dc2626'
    ctx.fillRect(216, 18, 14, 14)
    // Modelo e gama de pressão
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 30px monospace'
    ctx.fillText('VFG30-20', 22, 84)
    ctx.fillStyle = '#334155'
    ctx.font = 'bold 17px monospace'
    ctx.fillText('PRESS: 0.4~0.7MPa', 22, 122)
    ctx.fillStyle = '#64748b'
    ctx.font = '13px sans-serif'
    ctx.fillText('VACUUM ACTUATOR · Ø30', 22, 144)
  })
}

/** Faixa simples azul FESTO para lateral de cilindros */
function createFestoLogoBadge(): THREE.CanvasTexture | null {
  return makeCanvasTex(256, 72, (ctx, W, H) => {
    ctx.fillStyle = ALU_ANODIZED
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = FESTO_BLUE
    ctx.font = '900 44px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('FESTO', W / 2, H / 2)
  })
}

/** Racor rápido Festo QS metálico niquelado de 2 estágios + anel azul biselado */
/** Porta Push-In estilo Festo QS / DIYI — anel azul de libertação + corpo preto (referência comercial). */
function FestoQsPushInPort({
  position,
  rotation,
  scale = 1,
  variant = 'nickel',
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
  /** 'nickel' = QS clássico niquelado; 'black' = corpo preto + anel azul (catálogo união) */
  variant?: 'nickel' | 'black'
}) {
  const body = variant === 'black' ? PBT_BLACK : '#d2dbe4'
  const body2 = variant === 'black' ? PBT_CHARCOAL : '#e2e8f0'
  const metalness = variant === 'black' ? 0.12 : 0.9
  const roughness = variant === 'black' ? 0.42 : 0.2
  return (
    <group position={position} rotation={rotation ?? [0, 0, 0]} scale={[scale, scale, scale]}>
      {/* Base / colar do corpo */}
      <mesh position={[0, 3 * U, 0]} castShadow>
        <cylinderGeometry args={[9.5 * U, 9.5 * U, 7 * U, variant === 'black' ? 20 : 6]} />
        <meshStandardMaterial color={body} roughness={roughness} metalness={metalness} />
      </mesh>
      {/* Corpo cilíndrico com rebaixo */}
      <mesh position={[0, 11 * U, 0]} castShadow>
        <cylinderGeometry args={[8.4 * U, 8.8 * U, 10 * U, 20]} />
        <meshStandardMaterial color={body2} roughness={roughness} metalness={metalness} />
      </mesh>
      {/* Anel de libertação azul biselado */}
      <mesh position={[0, 18.5 * U, 0]} castShadow>
        <cylinderGeometry args={[9.2 * U, 7.6 * U, 5.5 * U, 20]} />
        <meshStandardMaterial color={FESTO_BLUE} roughness={0.3} metalness={0.12} />
      </mesh>
      {/* Furo escuro do tubo PU */}
      <mesh position={[0, 21.5 * U, 0]}>
        <cylinderGeometry args={[4.6 * U, 4.6 * U, 2.2 * U, 16]} />
        <meshStandardMaterial color="#0b111b" roughness={0.75} />
      </mesh>
    </group>
  )
}

/** Núcleo preto arredondado partilhado pelas uniões Push-In (reta / cotovelo / T / Y). */
function PushInFittingCore({ radius = 11 * U }: { radius?: number }) {
  return (
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[radius, 22, 18]} />
      <meshStandardMaterial color={PBT_BLACK} roughness={0.4} metalness={0.14} />
    </mesh>
  )
}

/** Silenciador pneumático poroso PE branco/cinza com base azul Festo (fiel a image-29.png) */
function FestoPeSilencer({
  position,
  rotation,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
}) {
  return (
    <group position={position} rotation={rotation ?? [0, 0, 0]}>
      {/* Base de engate azul Festo */}
      <mesh position={[0, 5 * U, 0]} castShadow>
        <cylinderGeometry args={[7.4 * U, 7.4 * U, 10 * U, 16]} />
        <meshStandardMaterial color={FESTO_BLUE} roughness={0.34} metalness={0.12} />
      </mesh>
      {/* Elemento silenciador cilíndrico poroso em PE sinterizado branco-acinzentado */}
      <mesh position={[0, 20 * U, 0]} castShadow>
        <cylinderGeometry args={[6.8 * U, 7.2 * U, 22 * U, 18]} />
        <meshStandardMaterial color={SILENCER_PE} roughness={0.88} metalness={0.04} />
      </mesh>
      <mesh position={[0, 31 * U, 0]}>
        <sphereGeometry args={[6.8 * U, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={SILENCER_PE} roughness={0.88} metalness={0.04} />
      </mesh>
    </group>
  )
}

/** 1. Unidade FRL Festo MS4-LFR (Filtro + Regulador azul nervurado + Manómetro 0–16 bar + Visor) */
export function PneumaticFrl3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const pressureBar = c.state.airSupplyOn === false ? 0 : Number(c.state.pressureBar ?? 6)
  const gaugeTex = useMemo(() => createFestoGaugeTexture(pressureBar), [pressureBar])
  useEffect(() => () => { gaugeTex?.dispose() }, [gaugeTex])

  const W = PNEUMATIC_FRL_SIZE_MM.width * U
  const H = PNEUMATIC_FRL_SIZE_MM.height * U

  return (
    <group position={position} name={`pneumatic-frl-3d-${c.id}`}>
      {/* Cabeçote central MS4 em alumínio fundido acetinado */}
      <mesh position={[0, 22 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[68 * U, 60 * U, 64 * U]} />
        <meshStandardMaterial color={ALU_ANODIZED} roughness={0.28} metalness={0.78} />
      </mesh>
      {/* Flanges laterais pretos MS4 de aperto modular (fiel a image-30.png) */}
      {[-37 * U, 37 * U].map((xPos, idx) => (
        <mesh key={idx} position={[xPos, 22 * U, 0]} castShadow>
          <boxGeometry args={[10 * U, 52 * U, 62 * U]} />
          <meshStandardMaterial color={PBT_BLACK} roughness={0.44} metalness={0.18} />
        </mesh>
      ))}

      {/* Colarinho preto de travamento + Manípulo regulador azul nervurado Festo MS4 */}
      <mesh position={[0, 56 * U, 0]} castShadow>
        <cylinderGeometry args={[28 * U, 29 * U, 10 * U, 24]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.42} metalness={0.2} />
      </mesh>
      <mesh position={[0, 82 * U, 0]} castShadow>
        <cylinderGeometry args={[23 * U, 25 * U, 44 * U, 24]} />
        <meshStandardMaterial color={FESTO_BLUE} roughness={0.34} metalness={0.12} />
      </mesh>
      {/* 10 nervuras longitudinais de aderência no manípulo azul */}
      {Array.from({ length: 10 }).map((_, i) => {
        const ang = (i / 10) * Math.PI * 2
        return (
          <mesh
            key={`rib-${i}`}
            position={[Math.cos(ang) * 24 * U, 82 * U, Math.sin(ang) * 24 * U]}
            rotation={[0, -ang, 0]}
          >
            <boxGeometry args={[3.5 * U, 40 * U, 4 * U]} />
            <meshStandardMaterial color={FESTO_BLUE_DARK} roughness={0.38} metalness={0.1} />
          </mesh>
        )
      })}
      {/* Tampa superior arredondada do regulador */}
      <mesh position={[0, 105 * U, 0]}>
        <cylinderGeometry args={[20 * U, 23 * U, 5 * U, 24]} />
        <meshStandardMaterial color={FESTO_BLUE} roughness={0.32} metalness={0.12} />
      </mesh>

      {/* Copo interno translúcido de policarbonato + elemento filtrante de bronze sinterizado */}
      <mesh position={[0, -54 * U, 0]}>
        <cylinderGeometry args={[24 * U, 22 * U, 92 * U, 22]} />
        <meshPhysicalMaterial
          color="#1e293b"
          transparent
          opacity={0.55}
          roughness={0.15}
          metalness={0.08}
          userData={{ keepTransparent: true }}
        />
      </mesh>
      <mesh position={[0, -32 * U, 0]}>
        <cylinderGeometry args={[12 * U, 12 * U, 38 * U, 16]} />
        <meshStandardMaterial color={BRONZE_BUSHING} roughness={0.68} metalness={0.45} />
      </mesh>

      {/* Protetor cinzento claro envolvente com janelas verticais de inspeção (fiel a image-30.png) */}
      <mesh position={[0, -56 * U, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[28 * U, 26 * U, 94 * U, 24, 1, true]} />
        <meshStandardMaterial color="#d4d9df" roughness={0.42} metalness={0.18} side={THREE.DoubleSide} />
      </mesh>
      {/* Fundo do protetor */}
      <mesh position={[0, -104 * U, 0]} castShadow>
        <cylinderGeometry args={[26 * U, 18 * U, 8 * U, 24]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.4} metalness={0.22} />
      </mesh>
      {/* Duas janelas verticais escuras de nível frontal */}
      {[-34 * U, -74 * U].map((yPos, idx) => (
        <mesh key={`win-${idx}`} position={[0, yPos, 27.6 * U]}>
          <boxGeometry args={[10 * U, 28 * U, 2 * U]} />
          <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.1} />
        </mesh>
      ))}
      {/* Purgador de condensados azul inferior */}
      <mesh position={[0, -114 * U, 0]} castShadow>
        <cylinderGeometry args={[6 * U, 4.5 * U, 16 * U, 14]} />
        <meshStandardMaterial color={FESTO_BLUE} roughness={0.34} metalness={0.12} />
      </mesh>

      {/* Manómetro frontal Festo 0–16 bar com aro cromado e vidro */}
      <group position={[0, 22 * U, 36 * U]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[26 * U, 27 * U, 16 * U, 28]} />
          <meshStandardMaterial color="#cfd7df" roughness={0.24} metalness={0.85} />
        </mesh>
        {gaugeTex && (
          <mesh position={[0, 0, 8.2 * U]}>
            <circleGeometry args={[23.5 * U, 28]} />
            <meshStandardMaterial map={gaugeTex} roughness={0.18} metalness={0.05} />
          </mesh>
        )}
        {/* Vidro protetor transparente */}
        <mesh position={[0, 0, 8.8 * U]}>
          <circleGeometry args={[24 * U, 28]} />
          <meshPhysicalMaterial
            color="#ffffff"
            transparent
            opacity={0.16}
            roughness={0.05}
            metalness={0.1}
            userData={{ keepTransparent: true }}
          />
        </mesh>
      </group>

      {/* Cotovelo de entrada preto L-Push-In (-X) e saída niquelada QS (+X) */}
      <group position={[-W * 0.37, 22 * U, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[9 * U, 9 * U, 22 * U, 14]} />
          <meshStandardMaterial color={PBT_BLACK} roughness={0.44} metalness={0.16} />
        </mesh>
        <mesh position={[-10 * U, -10 * U, 0]} castShadow>
          <cylinderGeometry args={[9 * U, 9 * U, 22 * U, 14]} />
          <meshStandardMaterial color={PBT_BLACK} roughness={0.44} metalness={0.16} />
        </mesh>
        <mesh position={[-10 * U, -22 * U, 0]}>
          <cylinderGeometry args={[8.5 * U, 7.5 * U, 5 * U, 16]} />
          <meshStandardMaterial color={FESTO_BLUE} roughness={0.32} metalness={0.12} />
        </mesh>
      </group>
      <FestoQsPushInPort position={[W * 0.29, 22 * U, 0]} rotation={[0, 0, -Math.PI / 2]} />

      {/* Suporte traseiro para calha DIN 35 mm */}
      <mesh position={[0, H * 0.08, -36 * U]} castShadow>
        <boxGeometry args={[92 * U, 36 * U, 7 * U]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.36} metalness={0.82} />
      </mesh>
    </group>
  )
}

/** 2. Eletroválvula Festo CPE14-M1B-H-5L-QS-8 · 5/2 Vias · 24V DC (fiel a image-28.png & image-29.png) */
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
  const bodyTex = useMemo(() => createCpe14BodyTexture(), [])
  const coilTex = useMemo(() => createMszeCoilTexture(), [])
  useEffect(() => () => {
    bodyTex?.dispose()
    coilTex?.dispose()
  }, [bodyTex, coilTex])

  const W = PNEUMATIC_VALVE52_SIZE_MM.width * U
  const H = PNEUMATIC_VALVE52_SIZE_MM.height * U

  return (
    <group position={position} name={`pneumatic-valve52-3d-${c.id}`}>
      {/* Corpo distribuidor em alumínio fundido CPE14 */}
      <mesh position={[12 * U, -2 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[92 * U, 44 * U, 24 * U]} />
        <meshStandardMaterial color={ALU_BRUSHED} roughness={0.28} metalness={0.84} />
      </mesh>
      {/* Face frontal com gravação laser FESTO CPE14-M1B-H-5L-QS-8 + diagrama + QR */}
      {bodyTex && (
        <mesh position={[12 * U, -2 * U, 12.3 * U]}>
          <planeGeometry args={[90 * U, 42 * U]} />
          <meshStandardMaterial map={bodyTex} roughness={0.34} metalness={0.45} />
        </mesh>
      )}
      {/* 4 furos passantes de fixação M3 no corpo */}
      {[[-14, 14], [38, 14], [-14, -18], [38, -18]].map(([dx, dy], i) => (
        <mesh key={`hole-${i}`} position={[dx * U, dy * U, 12.4 * U]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[3.4 * U, 3.4 * U, 1 * U, 12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.75} />
        </mesh>
      ))}

      {/* Cabeça piloto esquerda preta MSZE-B-3-24DC (fiel a image-28.png) */}
      <mesh position={[-52 * U, -2 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[38 * U, 44 * U, 26 * U]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.44} metalness={0.2} />
      </mesh>
      {/* Bobina saliente frontal com gravação branca MSZE-B-3-24DC */}
      <mesh position={[-56 * U, -4 * U, 16 * U]} castShadow>
        <boxGeometry args={[28 * U, 26 * U, 14 * U]} />
        <meshStandardMaterial color={PBT_CHARCOAL} roughness={0.42} metalness={0.22} />
      </mesh>
      {coilTex && (
        <mesh position={[-56 * U, -4 * U, 23.2 * U]}>
          <planeGeometry args={[26 * U, 24 * U]} />
          <meshStandardMaterial map={coilTex} roughness={0.45} metalness={0.12} />
        </mesh>
      )}
      {/* Ficha elétrica translúcida com LED âmbar indicador de energização */}
      <mesh position={[-76 * U, -4 * U, 12 * U]} castShadow>
        <boxGeometry args={[14 * U, 16 * U, 12 * U]} />
        <meshPhysicalMaterial
          color={active ? '#fde047' : '#e2e8f0'}
          emissive={active ? '#f59e0b' : '#000000'}
          emissiveIntensity={active ? 1.3 : 0}
          transparent
          opacity={0.72}
          roughness={0.18}
          userData={{ keepTransparent: true }}
        />
      </mesh>

      {/* Botão azul Festo de acionamento manual auxiliar (clicável em 3D!) */}
      <mesh
        position={[-38 * U, 22 * U, 2 * U]}
        castShadow
        onClick={(e) => { e.stopPropagation(); onManualToggle?.() }}
      >
        <boxGeometry args={[10 * U, 8 * U, 10 * U]} />
        <meshStandardMaterial
          color={c.state.manualOverride ? '#f59e0b' : FESTO_BLUE}
          emissive={c.state.manualOverride ? '#f59e0b' : '#000000'}
          emissiveIntensity={c.state.manualOverride ? 0.6 : 0}
          roughness={0.34}
        />
      </mesh>

      {/* Tampa direita preta de retorno por mola (lado 12) */}
      <mesh position={[68 * U, -2 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[22 * U, 44 * U, 24 * U]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.44} metalness={0.2} />
      </mesh>

      {/* 2 racores QS-8 superiores: A (4) e B (2) */}
      <FestoQsPushInPort position={[-4 * U, 20 * U, 0]} />
      <FestoQsPushInPort position={[32 * U, 20 * U, 0]} />

      {/* Pórtico inferior central P (1) QS-8 + 2 silenciadores PE brancos com anel azul (5 e 3 — fiel a image-29.png!) */}
      <FestoQsPushInPort position={[14 * U, -24 * U, 0]} rotation={[0, 0, Math.PI]} />
      <FestoPeSilencer position={[-12 * U, -24 * U, 0]} rotation={[0, 0, Math.PI]} />
      <FestoPeSilencer position={[40 * U, -24 * U, 0]} rotation={[0, 0, Math.PI]} />

      {/* Base de apoio subtil */}
      <mesh position={[0, -H / 2 + 2 * U, -10 * U]}>
        <boxGeometry args={[W * 0.72, 3 * U, 12 * U]} />
        <meshStandardMaterial color="#64748b" roughness={0.45} metalness={0.7} />
      </mesh>
    </group>
  )
}

/** 3. Cilindro Pneumático Festo DSBC (ISO 15552) · variantes ADN Compacto & DSNU Redondo Inox (fiel a image-31.png) */
export function PneumaticCylinder3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const rodRef = useRef<THREE.Group>(null)
  const posRef = useRef(Number(c.state.positionPct ?? 0))
  const { invalidate } = useThree()
  const variant = (c.state.cylinderVariant === 'adn' || c.state.cylinderVariant === 'dsnu')
    ? c.state.cylinderVariant
    : 'dsbc'
  const logoTex = useMemo(() => createFestoLogoBadge(), [])
  useEffect(() => () => { logoTex?.dispose() }, [logoTex])

  const W = PNEUMATIC_CYLINDER_SIZE_MM.width * U
  const barrelL = (variant === 'adn' ? 96 : 180) * U
  const strokeMax = (variant === 'adn' ? 68 : 118) * U
  const bodyH = (variant === 'dsnu' ? 38 : variant === 'adn' ? 62 : 52) * U
  const baseX = -W * 0.16

  useFrame((_, delta) => {
    const target = Math.max(0, Math.min(100, Number(c.state.positionPct ?? 0)))
    const diff = target - posRef.current
    if (Math.abs(diff) > 0.15) {
      posRef.current += diff * Math.min(1, delta * 9)
      invalidate()
    } else {
      posRef.current = target
    }
    if (rodRef.current) {
      rodRef.current.position.x = (posRef.current / 100) * strokeMax
    }
  })

  const atHome = Number(c.state.positionPct ?? 0) <= 6
  const atEnd = Number(c.state.positionPct ?? 0) >= 92

  return (
    <group position={position} name={`pneumatic-cylinder-3d-${c.id}`}>
      {variant === 'dsnu' ? (
        /* Variante DSNU: Cilindro redondo inox com nariz roscado e porca sextavada grande */
        <>
          <mesh position={[baseX, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[bodyH * 0.5, bodyH * 0.5, barrelL, 28]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.18} metalness={0.94} />
          </mesh>
          {/* Cabeças maquinadas alumínio */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[baseX + side * (barrelL / 2 + 12 * U), 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[bodyH * 0.54, bodyH * 0.54, 24 * U, 24]} />
              <meshStandardMaterial color={ALU_ANODIZED} roughness={0.28} metalness={0.85} />
            </mesh>
          ))}
          {/* Porca frontal grande de montagem DSNU */}
          <mesh position={[baseX + barrelL / 2 + 30 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[24 * U, 24 * U, 12 * U, 6]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.24} metalness={0.9} />
          </mesh>
        </>
      ) : (
        /* Variante DSBC (ISO 15552 perfil estriado) & ADN (Compacto) */
        <>
          {/* Camisa em perfil de alumínio anodizado escovado */}
          <mesh position={[baseX, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[barrelL, bodyH, bodyH]} />
            <meshStandardMaterial color={ALU_ANODIZED} roughness={0.26} metalness={0.86} />
          </mesh>
          {/* Ranhuras T longitudinais fresadas para sensores magnéticos (fiel a image-31.png) */}
          {[-bodyH * 0.22, bodyH * 0.22].map((dy, idx) => (
            <mesh key={`tslot-f-${idx}`} position={[baseX, dy, bodyH * 0.5 + 0.4 * U]}>
              <boxGeometry args={[barrelL - 4 * U, 5.5 * U, 1.5 * U]} />
              <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.65} />
            </mesh>
          ))}
          {/* Logo FESTO azul na camisa */}
          {logoTex && (
            <mesh position={[baseX - barrelL * 0.22, 0, bodyH * 0.5 + 0.6 * U]}>
              <planeGeometry args={[38 * U, 11 * U]} />
              <meshStandardMaterial map={logoTex} roughness={0.32} metalness={0.45} />
            </mesh>
          )}
          {/* Cabeças traseira e frontal maquinadas com 4 parafusos Allen inox */}
          {[-1, 1].map((side) => (
            <group key={side} position={[baseX + side * (barrelL / 2 + 12 * U), 0, 0]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[24 * U, bodyH + 6 * U, bodyH + 6 * U]} />
                <meshStandardMaterial color={ALU_CAST} roughness={0.32} metalness={0.84} />
              </mesh>
              {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sy, sz], bi) => (
                <mesh
                  key={`bolt-${bi}`}
                  position={[side * 12.5 * U, sy * (bodyH * 0.4), sz * (bodyH * 0.4)]}
                  rotation={[0, 0, Math.PI / 2]}
                >
                  <cylinderGeometry args={[4.2 * U, 4.2 * U, 4 * U, 6]} />
                  <meshStandardMaterial color="#64748b" roughness={0.28} metalness={0.9} />
                </mesh>
              ))}
            </group>
          ))}
          {/* 2 sensores magnéticos Festo SMT-8M encaixados na ranhura T (S0 recuado / S1 avançado) */}
          {[
            { x: baseX - barrelL * 0.34, lit: atHome },
            { x: baseX + barrelL * 0.34, lit: atEnd },
          ].map((s, si) => (
            <group key={`reed-${si}`} position={[s.x, bodyH * 0.22, bodyH * 0.5 + 3 * U]}>
              <mesh castShadow>
                <boxGeometry args={[24 * U, 7 * U, 6 * U]} />
                <meshStandardMaterial color={PBT_BLACK} roughness={0.42} metalness={0.2} />
              </mesh>
              <mesh position={[0, 0, 3.2 * U]}>
                <boxGeometry args={[6 * U, 3.5 * U, 1 * U]} />
                <meshStandardMaterial
                  color={s.lit ? '#facc15' : '#475569'}
                  emissive={s.lit ? '#eab308' : '#000000'}
                  emissiveIntensity={s.lit ? 1.8 : 0}
                />
              </mesh>
            </group>
          ))}
          {/* Bucim / retentor frontal de saída da haste */}
          <mesh position={[baseX + barrelL / 2 + 28 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[16 * U, 17 * U, 10 * U, 22]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.25} metalness={0.88} />
          </mesh>
        </>
      )}

      {/* Pórticos pneumáticos Festo QS-8 A (traseiro) e B (frontal) */}
      <FestoQsPushInPort position={[baseX - barrelL / 2 - 12 * U, bodyH * 0.5 + 3 * U, 0]} scale={0.92} />
      <FestoQsPushInPort position={[baseX + barrelL / 2 + 12 * U, bodyH * 0.5 + 3 * U, 0]} scale={0.92} />

      {/* Haste cromada espelhada + ponta roscada + porca sextavada inox */}
      <group ref={rodRef}>
        <mesh position={[baseX + barrelL / 2 - 22 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[9.5 * U, 9.5 * U, 168 * U, 22]} />
          <meshStandardMaterial color={CHROME_ROD} roughness={0.08} metalness={0.98} />
        </mesh>
        {/* Espiga roscada frontal */}
        <mesh position={[baseX + barrelL / 2 + 72 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[6.8 * U, 6.8 * U, 24 * U, 18]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.34} metalness={0.86} />
        </mesh>
        {/* Porca sextavada de fixação */}
        <mesh position={[baseX + barrelL / 2 + 70 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[12.5 * U, 12.5 * U, 10 * U, 6]} />
          <meshStandardMaterial color="#dce2e8" roughness={0.22} metalness={0.92} />
        </mesh>
      </group>
    </group>
  )
}

/** 4. União em T Pneumática Festo QST-8 (3 vias Push-In) */
/** União em T Push-In (3 vias) — corpo preto + anéis azuis, fiel ao catálogo comercial. */
export function PneumaticTee3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  // Braços dimensionados para as bocas coincidirem com os bornes (faces do volume 82×60 mm)
  const armX = 28 * U
  const armY = 22 * U
  return (
    <group position={position} name={`pneumatic-tee-3d-${c.id}`}>
      <PushInFittingCore radius={12 * U} />
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[9.2 * U, 9.2 * U, armX * 1.55, 18]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.4} metalness={0.14} />
      </mesh>
      <mesh position={[0, armY * 0.55, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[9.2 * U, 9.2 * U, armY * 0.95, 18]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.4} metalness={0.14} />
      </mesh>
      <FestoQsPushInPort position={[-armX, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={0.9} variant="black" />
      <FestoQsPushInPort position={[armX, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={0.9} variant="black" />
      <FestoQsPushInPort position={[0, armY * 1.15, 0]} scale={0.9} variant="black" />
    </group>
  )
}

/** União reta Push-In (2 vias) — macho-macho preto + anéis azuis. */
export function PneumaticUnion3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const arm = 18 * U
  return (
    <group position={position} name={`pneumatic-union-3d-${c.id}`}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[9.5 * U, 9.5 * U, arm * 1.6, 18]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.4} metalness={0.14} />
      </mesh>
      {/* Nervura central de união */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[11.2 * U, 11.2 * U, 8 * U, 18]} />
        <meshStandardMaterial color={PBT_CHARCOAL} roughness={0.38} metalness={0.16} />
      </mesh>
      <FestoQsPushInPort position={[-arm * 0.85, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={0.9} variant="black" />
      <FestoQsPushInPort position={[arm * 0.85, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={0.9} variant="black" />
    </group>
  )
}

/** Cotovelo 90° Push-In — corpo preto + 2 anéis azuis. */
export function PneumaticElbow3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const arm = 18 * U
  return (
    <group position={position} name={`pneumatic-elbow-3d-${c.id}`}>
      <PushInFittingCore radius={11 * U} />
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-arm * 0.35, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[9 * U, 9 * U, arm * 0.85, 18]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.4} metalness={0.14} />
      </mesh>
      <mesh position={[0, arm * 0.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[9 * U, 9 * U, arm * 0.85, 18]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.4} metalness={0.14} />
      </mesh>
      <FestoQsPushInPort position={[-arm * 0.9, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={0.88} variant="black" />
      <FestoQsPushInPort position={[0, arm * 0.9, 0]} scale={0.88} variant="black" />
    </group>
  )
}

/** União em Y Push-In (3 vias divergentes) — corpo preto + anéis azuis. */
export function PneumaticY3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const arm = 20 * U
  const ang = Math.PI / 5 // ~36° cada lado
  return (
    <group position={position} name={`pneumatic-y-3d-${c.id}`}>
      <PushInFittingCore radius={12 * U} />
      {/* Entrada inferior */}
      <mesh position={[0, -arm * 0.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[9 * U, 9 * U, arm * 0.75, 18]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.4} metalness={0.14} />
      </mesh>
      {/* Braço esquerdo */}
      <mesh position={[-Math.sin(ang) * arm * 0.4, Math.cos(ang) * arm * 0.35, 0]} rotation={[0, 0, -ang]} castShadow receiveShadow>
        <cylinderGeometry args={[9 * U, 9 * U, arm * 0.75, 18]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.4} metalness={0.14} />
      </mesh>
      {/* Braço direito */}
      <mesh position={[Math.sin(ang) * arm * 0.4, Math.cos(ang) * arm * 0.35, 0]} rotation={[0, 0, ang]} castShadow receiveShadow>
        <cylinderGeometry args={[9 * U, 9 * U, arm * 0.75, 18]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.4} metalness={0.14} />
      </mesh>
      <FestoQsPushInPort position={[0, -arm * 0.95, 0]} rotation={[0, 0, Math.PI]} scale={0.86} variant="black" />
      <FestoQsPushInPort
        position={[-Math.sin(ang) * arm * 0.95, Math.cos(ang) * arm * 0.9, 0]}
        rotation={[0, 0, -ang]}
        scale={0.86}
        variant="black"
      />
      <FestoQsPushInPort
        position={[Math.sin(ang) * arm * 0.95, Math.cos(ang) * arm * 0.9, 0]}
        rotation={[0, 0, ang]}
        scale={0.86}
        variant="black"
      />
    </group>
  )
}

/** 5. NOVO — Cilindro Elétrico Festo EPCS-BS-45-200-10P-A-ST-M-H1-PLK-AA (Simplified Motion Series · image-26.png!) */
export function ElectricCylinderEpcs3D({
  c,
  position,
  onJogStep,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  onJogStep?: (dir: 'in' | 'out') => void
}) {
  const rodRef = useRef<THREE.Group>(null)
  const posRef = useRef(Number(c.state.positionPct ?? 0))
  const { invalidate } = useThree()
  const powered = Boolean(c.state.powered)
  const pct = Math.max(0, Math.min(100, Number(c.state.positionPct ?? 0)))

  const ctrlTex = useMemo(() => createEpcsControllerTexture(Math.round(pct / 5) * 5, powered), [Math.round(pct / 5), powered])
  const logoTex = useMemo(() => createFestoLogoBadge(), [])
  useEffect(() => () => {
    ctrlTex?.dispose()
    logoTex?.dispose()
  }, [ctrlTex, logoTex])

  const W = ELECTRIC_CYLINDER_EPCS_SIZE_MM.width * U
  const barrelL = 225 * U
  const strokeMax = 128 * U
  const barrelX = -W * 0.14

  useFrame((_, delta) => {
    const diff = pct - posRef.current
    if (Math.abs(diff) > 0.15) {
      posRef.current += diff * Math.min(1, delta * 8)
      invalidate()
    } else {
      posRef.current = pct
    }
    if (rodRef.current) {
      // Haste estende para -X (esquerda frontal, igual à perspetiva de image-26.png) ou +X — vamos estender para +X para coerência com cilindros!
      rodRef.current.position.x = (posRef.current / 100) * strokeMax
    }
  })

  return (
    <group position={position} name={`electric-cylinder-epcs-3d-${c.id}`}>
      {/* Corpo extrudido quadrado alumínio anodizado com ranhuras T (fiel a image-26.png) */}
      <mesh position={[barrelX, -8 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[barrelL, 52 * U, 52 * U]} />
        <meshStandardMaterial color={ALU_ANODIZED} roughness={0.24} metalness={0.88} />
      </mesh>
      {/* Ranhuras T fresadas no topo e nas laterais */}
      {[-12 * U, 12 * U].map((dz, i) => (
        <mesh key={`top-slot-${i}`} position={[barrelX, 18.5 * U, dz]}>
          <boxGeometry args={[barrelL - 8 * U, 2 * U, 5 * U]} />
          <meshStandardMaterial color="#64748b" roughness={0.48} metalness={0.68} />
        </mesh>
      ))}
      {[-12 * U, 12 * U].map((dy, i) => (
        <mesh key={`side-slot-${i}`} position={[barrelX, -8 * U + dy, 26.4 * U]}>
          <boxGeometry args={[barrelL - 8 * U, 5 * U, 1.8 * U]} />
          <meshStandardMaterial color="#64748b" roughness={0.48} metalness={0.68} />
        </mesh>
      ))}
      {/* Tampão superior sextavado inox de respiro/lubrificação (fiel a image-26.png) */}
      <mesh position={[barrelX - barrelL * 0.24, 21 * U, 0]} castShadow>
        <cylinderGeometry args={[7 * U, 7 * U, 8 * U, 6]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.2} metalness={0.94} />
      </mesh>
      {/* Logo FESTO azul gravado perto da transição para o motor */}
      {logoTex && (
        <mesh position={[barrelX - barrelL * 0.38, -8 * U, 26.6 * U]}>
          <planeGeometry args={[36 * U, 10 * U]} />
          <meshStandardMaterial map={logoTex} roughness={0.3} metalness={0.5} />
        </mesh>
      )}
      {/* Cabeça frontal maquinada com anel vedante */}
      <mesh position={[barrelX + barrelL / 2 + 5 * U, -8 * U, 0]} castShadow>
        <boxGeometry args={[12 * U, 52 * U, 52 * U]} />
        <meshStandardMaterial color={ALU_CAST} roughness={0.28} metalness={0.86} />
      </mesh>
      <mesh position={[barrelX + barrelL / 2 + 15 * U, -8 * U, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[16 * U, 19 * U, 12 * U, 24]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.22} metalness={0.9} />
      </mesh>

      {/* Bloco motor passo-a-passo inline traseiro (-X): acoplamento + estator laminado preto + tampa alumínio */}
      <mesh position={[barrelX - barrelL / 2 - 22 * U, -8 * U, 0]} castShadow>
        <boxGeometry args={[44 * U, 44 * U, 44 * U]} />
        <meshStandardMaterial color={ALU_BRUSHED} roughness={0.28} metalness={0.85} />
      </mesh>
      <mesh position={[barrelX - barrelL / 2 - 60 * U, -8 * U, 0]} castShadow>
        <boxGeometry args={[32 * U, 45 * U, 45 * U]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[barrelX - barrelL / 2 - 86 * U, -8 * U, 0]} castShadow>
        <boxGeometry args={[22 * U, 44 * U, 44 * U]} />
        <meshStandardMaterial color={ALU_BRUSHED} roughness={0.26} metalness={0.86} />
      </mesh>

      {/* === CONTROLADOR INTEGRADO FESTO SMS (PLK-AA) NO TOPO DO MOTOR (fiel a image-26.png!) === */}
      <group position={[barrelX - barrelL / 2 - 58 * U, 28 * U, 0]}>
        {/* Caixa escura charcoal com bisel */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[76 * U, 28 * U, 54 * U]} />
          <meshStandardMaterial color={PBT_CHARCOAL} roughness={0.44} metalness={0.24} />
        </mesh>
        {/* Placa superior em alumínio die-cast + interface LED impressa */}
        <mesh position={[0, 15 * U, 0]} castShadow>
          <boxGeometry args={[74 * U, 5 * U, 52 * U]} />
          <meshStandardMaterial color={ALU_ANODIZED} roughness={0.24} metalness={0.85} />
        </mesh>
        {ctrlTex && (
          <mesh position={[0, 17.8 * U, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[70 * U, 48 * U]} />
            <meshStandardMaterial map={ctrlTex} roughness={0.28} metalness={0.2} />
          </mesh>
        )}
        {/* 3 botões capacitivos azul-ciano icónicos da Festo SMS na face frontal (← · Edit · →) */}
        {[
          { dx: -16 * U, dir: 'in' as const },
          { dx: 0, dir: null },
          { dx: 16 * U, dir: 'out' as const },
        ].map((btn, idx) => (
          <mesh
            key={`sms-btn-${idx}`}
            position={[btn.dx, 0, 27.6 * U]}
            onClick={(e) => {
              e.stopPropagation()
              if (btn.dir) onJogStep?.(btn.dir)
            }}
          >
            <boxGeometry args={[12 * U, 11 * U, 2.4 * U]} />
            <meshStandardMaterial
              color={FESTO_BLUE}
              emissive={powered ? FESTO_BLUE : '#000000'}
              emissiveIntensity={powered ? 0.35 : 0}
              roughness={0.28}
            />
          </mesh>
        ))}
        {/* 2 conectores circulares metálicos M12 verticais na traseira do controlador (fiel a image-26.png!) */}
        {[-12 * U, 12 * U].map((dz, idx) => (
          <group key={`m12-${idx}`} position={[-24 * U, 24 * U, dz]}>
            <mesh castShadow>
              <cylinderGeometry args={[7.8 * U, 8.2 * U, 15 * U, 18]} />
              <meshStandardMaterial color="#dce2e8" roughness={0.2} metalness={0.94} />
            </mesh>
            {/* Colar serrilhado M12 */}
            <mesh position={[0, 4 * U, 0]}>
              <cylinderGeometry args={[8.6 * U, 8.6 * U, 5 * U, 16]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.26} metalness={0.92} />
            </mesh>
            <mesh position={[0, 7.8 * U, 0]}>
              <cylinderGeometry args={[5.5 * U, 5.5 * U, 1.5 * U, 14]} />
              <meshStandardMaterial color="#1e293b" roughness={0.65} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Haste cromada acionada por fuso de esferas + ponteira roscada + porca sextavada */}
      <group ref={rodRef}>
        <mesh position={[barrelX + barrelL / 2 - 22 * U, -8 * U, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[10.5 * U, 10.5 * U, 158 * U, 22]} />
          <meshStandardMaterial color={CHROME_ROD} roughness={0.08} metalness={0.98} />
        </mesh>
        <mesh position={[barrelX + barrelL / 2 + 68 * U, -8 * U, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[7.2 * U, 7.2 * U, 24 * U, 18]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.34} metalness={0.86} />
        </mesh>
        <mesh position={[barrelX + barrelL / 2 + 66 * U, -8 * U, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[13 * U, 13 * U, 10 * U, 6]} />
          <meshStandardMaterial color="#dce2e8" roughness={0.22} metalness={0.92} />
        </mesh>
      </group>
    </group>
  )
}

/** 6. NOVO — Cilindro Guiado Festo DFM-20-40-P-A-GF com 2 Hastes Guia + Casquilhos de Bronze GF (fiel a image-27.png!) */
export function PneumaticGuidedCylinder3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const yokeRef = useRef<THREE.Group>(null)
  const posRef = useRef(Number(c.state.positionPct ?? 0))
  const { invalidate } = useThree()
  const labelTex = useMemo(() => createDfmLabelTexture(), [])
  useEffect(() => () => { labelTex?.dispose() }, [labelTex])

  const W = PNEUMATIC_GUIDED_CYLINDER_SIZE_MM.width * U
  const bodyL = 112 * U
  const bodyH = 98 * U
  const bodyD = 48 * U
  const strokeMax = 68 * U
  const bodyX = -W * 0.16

  useFrame((_, delta) => {
    const target = Math.max(0, Math.min(100, Number(c.state.positionPct ?? 0)))
    const diff = target - posRef.current
    if (Math.abs(diff) > 0.15) {
      posRef.current += diff * Math.min(1, delta * 9)
      invalidate()
    } else {
      posRef.current = target
    }
    if (yokeRef.current) {
      yokeRef.current.position.x = (posRef.current / 100) * strokeMax
    }
  })

  return (
    <group position={position} name={`pneumatic-guided-cylinder-3d-${c.id}`}>
      {/* Bloco compacto em alumínio anodizado CNC */}
      <mesh position={[bodyX, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[bodyL, bodyH, bodyD]} />
        <meshStandardMaterial color={ALU_ANODIZED} roughness={0.26} metalness={0.86} />
      </mesh>
      {/* Canal horizontal central maquinado */}
      <mesh position={[bodyX, 0, bodyD * 0.5 + 0.3 * U]}>
        <boxGeometry args={[bodyL, 18 * U, 1.2 * U]} />
        <meshStandardMaterial color="#b8c2cc" roughness={0.35} metalness={0.8} />
      </mesh>
      {/* Etiqueta laser FESTO DFM-20-40-P-A-GF / 163346 A157 / Pmax.10bar (face frontal) */}
      {labelTex && (
        <mesh position={[bodyX, 0, bodyD * 0.5 + 0.8 * U]}>
          <planeGeometry args={[bodyL * 0.94, bodyH * 0.86]} />
          <meshStandardMaterial map={labelTex} roughness={0.3} metalness={0.42} />
        </mesh>
      )}
      {/* 2 casquilhos deslizantes em BRONZE/COBRE GF visíveis na saída das hastes guia (fiel a image-27.png!) */}
      {[-34 * U, 34 * U].map((dy, i) => (
        <mesh key={`bronze-${i}`} position={[bodyX + bodyL / 2 + 1.5 * U, dy, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[12.5 * U, 12.5 * U, 5 * U, 22]} />
          <meshStandardMaterial color={BRONZE_BUSHING} roughness={0.32} metalness={0.82} />
        </mesh>
      ))}
      {/* Vedante central da haste do pistão */}
      <mesh position={[bodyX + bodyL / 2 + 1.5 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[11 * U, 11 * U, 4 * U, 20]} />
        <meshStandardMaterial color="#334155" roughness={0.45} metalness={0.4} />
      </mesh>

      {/* Pórticos pneumáticos G1/8 QS-6 no topo do bloco (A e B) */}
      <FestoQsPushInPort position={[bodyX - 24 * U, bodyH / 2, 0]} scale={0.82} />
      <FestoQsPushInPort position={[bodyX + 24 * U, bodyH / 2, 0]} scale={0.82} />

      {/* Conjunto móvel: 2 hastes guia cromadas grossas + 1 haste central + placa frontal maquinada (yoke) */}
      <group ref={yokeRef}>
        {/* Haste guia superior e inferior (Ø12 mm cromadas) */}
        {[-34 * U, 34 * U].map((dy, i) => (
          <mesh key={`guide-${i}`} position={[bodyX + bodyL / 2 + 12 * U, dy, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[8.5 * U, 8.5 * U, 108 * U, 20]} />
            <meshStandardMaterial color={CHROME_ROD} roughness={0.08} metalness={0.98} />
          </mesh>
        ))}
        {/* Haste central do pistão */}
        <mesh position={[bodyX + bodyL / 2 + 12 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[6.8 * U, 6.8 * U, 108 * U, 18]} />
          <meshStandardMaterial color={CHROME_ROD} roughness={0.08} metalness={0.98} />
        </mesh>
        {/* Placa frontal de acoplamento em alumínio maquinado com furos escareados */}
        <mesh position={[bodyX + bodyL / 2 + 72 * U, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[16 * U, bodyH + 8 * U, bodyD + 2 * U]} />
          <meshStandardMaterial color={ALU_ANODIZED} roughness={0.24} metalness={0.88} />
        </mesh>
        {[-34 * U, 0, 34 * U].map((dy, i) => (
          <mesh key={`cbore-${i}`} position={[bodyX + bodyL / 2 + 80.4 * U, dy, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[i === 1 ? 11 * U : 6.5 * U, i === 1 ? 11 * U : 6.5 * U, 1.5 * U, 16]} />
            <meshStandardMaterial color="#475569" roughness={0.55} metalness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** 7. NOVO — Ilha de Válvulas Festo VTUG 4 Estações em Calha DIN (fiel a image-30.png!) */
export function PneumaticManifold3D({
  c,
  position,
  onToggleStation,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  onToggleStation?: (idx: number) => void
}) {
  const W = PNEUMATIC_MANIFOLD_SIZE_MM.width * U
  const stations = [1, 2, 3, 4]

  return (
    <group position={position} name={`pneumatic-manifold-3d-${c.id}`}>
      {/* Calha DIN 35 mm galvanizada traseira (fiel a image-30.png) */}
      <mesh position={[0, 6 * U, -42 * U]} castShadow receiveShadow>
        <boxGeometry args={[W + 22 * U, 36 * U, 8 * U]} />
        <meshStandardMaterial color="#b8c4cf" roughness={0.34} metalness={0.86} />
      </mesh>
      {/* Bloco distribuidor base em alumínio anodizado */}
      <mesh position={[-4 * U, -24 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[178 * U, 26 * U, 58 * U]} />
        <meshStandardMaterial color={ALU_ANODIZED} roughness={0.28} metalness={0.84} />
      </mesh>
      {/* Tampa lateral esquerda (alimentação P + silenciador) */}
      <mesh position={[-98 * U, 8 * U, 0]} castShadow>
        <boxGeometry args={[20 * U, 92 * U, 62 * U]} />
        <meshStandardMaterial color={ALU_BRUSHED} roughness={0.3} metalness={0.82} />
      </mesh>
      <FestoQsPushInPort position={[-106 * U, -18 * U, 0]} rotation={[0, 0, Math.PI / 2]} scale={0.95} />
      {/* Cabeçote elétrico direito multi-pinos 24V DC (fiel a image-30.png) */}
      <mesh position={[96 * U, 8 * U, 0]} castShadow>
        <boxGeometry args={[32 * U, 92 * U, 62 * U]} />
        <meshStandardMaterial color={ALU_ANODIZED} roughness={0.28} metalness={0.82} />
      </mesh>
      {/* Tampa superior translúcida de etiquetas de circuito */}
      <mesh position={[-4 * U, 58 * U, 2 * U]}>
        <boxGeometry args={[170 * U, 12 * U, 34 * U]} />
        <meshPhysicalMaterial
          color="#e2e8f0"
          transparent
          opacity={0.5}
          roughness={0.14}
          userData={{ keepTransparent: true }}
        />
      </mesh>

      {/* 4 estações de eletroválvulas Festo lado-a-lado com patilhas azuis + LEDs + pórticos QS inferiores */}
      {stations.map((stNum, idx) => {
        const sx = -60 * U + idx * 38 * U
        const isOn = Boolean(c.state[`station${stNum}On`] || c.state[`station${stNum}Manual`])
        return (
          <group key={stNum} position={[sx, 14 * U, 0]}>
            {/* Corpo da fatia de válvula */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[33 * U, 68 * U, 56 * U]} />
              <meshStandardMaterial color={PBT_CHARCOAL} roughness={0.42} metalness={0.25} />
            </mesh>
            {/* 2 teclas azuis Festo de acionamento manual (clicável em 3D!) */}
            {[-12 * U, 12 * U].map((dy, bi) => (
              <mesh
                key={bi}
                position={[0, dy, 29 * U]}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleStation?.(stNum)
                }}
              >
                <boxGeometry args={[28 * U, 12 * U, 4 * U]} />
                <meshStandardMaterial
                  color={isOn && bi === 1 ? '#f59e0b' : FESTO_BLUE}
                  emissive={isOn && bi === 1 ? '#f59e0b' : '#000000'}
                  emissiveIntensity={isOn && bi === 1 ? 0.55 : 0}
                  roughness={0.32}
                />
              </mesh>
            ))}
            {/* LED indicador de estado na face frontal superior */}
            <mesh position={[0, 27 * U, 28.6 * U]}>
              <boxGeometry args={[10 * U, 5 * U, 1.5 * U]} />
              <meshStandardMaterial
                color={isOn ? '#facc15' : '#475569'}
                emissive={isOn ? '#eab308' : '#000000'}
                emissiveIntensity={isOn ? 1.8 : 0}
              />
            </mesh>
            {/* Par de saídas inferiores QS (A_i e B_i) */}
            <FestoQsPushInPort position={[-8 * U, -50 * U, 8 * U]} rotation={[0, 0, Math.PI]} scale={0.74} />
            <FestoQsPushInPort position={[8 * U, -50 * U, -8 * U]} rotation={[0, 0, Math.PI]} scale={0.74} />
          </group>
        )
      })}
    </group>
  )
}

/** 8. NOVO — Atuador Pneumático com Ventosa de Fole DIYI VFG30-20 (fiel a image-32.png!) */
export function PneumaticVacuumCup3D({
  c,
  position,
  onToggleVacuum,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  onToggleVacuum?: () => void
}) {
  const cupGroupRef = useRef<THREE.Group>(null)
  const strokeRef = useRef(0)
  const { invalidate } = useThree()
  const active = Boolean(c.state.vacuumActive || c.state.manualVacuum)
  const withFlange = c.state.mountingFlange !== false
  const labelTex = useMemo(() => createVacuumCupLabelTexture(), [])
  useEffect(() => () => { labelTex?.dispose() }, [labelTex])

  // Geometria de revolução realista da ventosa de fole dupla em silicone azul (fiel a image-32.png!)
  const bellowsGeom = useMemo(() => {
    const pts = [
      new THREE.Vector2(11 * U, 0),
      new THREE.Vector2(13 * U, 10 * U),
      new THREE.Vector2(15 * U, 16 * U),
      new THREE.Vector2(30 * U, 23 * U),
      new THREE.Vector2(31 * U, 27 * U),
      new THREE.Vector2(17 * U, 33 * U),
      new THREE.Vector2(28 * U, 41 * U),
      new THREE.Vector2(33 * U, 45 * U),
      new THREE.Vector2(28 * U, 45.5 * U),
      new THREE.Vector2(16 * U, 38 * U),
      new THREE.Vector2(12 * U, 26 * U),
    ]
    return new THREE.LatheGeometry(pts, 32)
  }, [])
  useEffect(() => () => { bellowsGeom.dispose() }, [bellowsGeom])

  useFrame((_, delta) => {
    const target = active ? 1 : 0
    const diff = target - strokeRef.current
    if (Math.abs(diff) > 0.01) {
      strokeRef.current += diff * Math.min(1, delta * 10)
      invalidate()
    } else {
      strokeRef.current = target
    }
    if (cupGroupRef.current) {
      // Ao ativar vácuo/avanço, a haste sobe ligeiramente e o fole comprime-se em sucção
      cupGroupRef.current.position.y = 32 * U + strokeRef.current * 14 * U
      cupGroupRef.current.scale.y = 1 - strokeRef.current * 0.14
    }
  })

  const H = PNEUMATIC_VACUUM_CUP_SIZE_MM.height * U
  return (
    <group
      position={position}
      name={`pneumatic-vacuum-cup-3d-${c.id}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggleVacuum?.()
      }}
    >
      {/* Tampa inferior hexagonal/chanfrada alumínio */}
      <mesh position={[0, -H * 0.36, 0]} castShadow>
        <cylinderGeometry args={[21 * U, 20 * U, 20 * U, 12]} />
        <meshStandardMaterial color={ALU_CAST} roughness={0.3} metalness={0.86} />
      </mesh>
      {/* Corpo cilíndrico em alumínio anodizado escovado */}
      <mesh position={[0, -H * 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[22 * U, 22 * U, 78 * U, 28]} />
        <meshStandardMaterial color={ALU_ANODIZED} roughness={0.24} metalness={0.88} />
      </mesh>
      {/* Bloco quadrado lateral opcional de montagem CNC (VFG30-20 com flange — esquerda de image-32.png!) */}
      {withFlange && (
        <mesh position={[0, -H * 0.08, 0]} castShadow receiveShadow>
          <boxGeometry args={[52 * U, 66 * U, 36 * U]} />
          <meshStandardMaterial color={ALU_BRUSHED} roughness={0.28} metalness={0.85} />
        </mesh>
      )}
      {/* Etiqueta DIYI VFG30-20 na frente */}
      {labelTex && (
        <mesh position={[0, -H * 0.08, (withFlange ? 18.4 : 22.3) * U]}>
          <planeGeometry args={[36 * U, 24 * U]} />
          <meshStandardMaterial map={labelTex} roughness={0.32} metalness={0.1} />
        </mesh>
      )}
      {/* Colarinho superior em alumínio ANODIZADO AZUL ROYAL (assinatura visual de image-32.png!) */}
      <mesh position={[0, 28 * U, 0]} castShadow>
        <cylinderGeometry args={[22.4 * U, 22.4 * U, 16 * U, 28]} />
        <meshStandardMaterial color="#1557c0" roughness={0.26} metalness={0.78} />
      </mesh>
      {/* Pórtico pneumático lateral de vácuo/alimentação */}
      <FestoQsPushInPort position={[-22 * U, -H * 0.34, 0]} rotation={[0, 0, Math.PI / 2]} scale={0.78} />

      {/* Haste sextavada inox + Ventosa de fole dupla em silicone azul royal */}
      <group ref={cupGroupRef} position={[0, 32 * U, 0]}>
        <mesh position={[0, 8 * U, 0]} castShadow>
          <cylinderGeometry args={[12 * U, 12 * U, 14 * U, 6]} />
          <meshStandardMaterial color="#dce2e8" roughness={0.22} metalness={0.92} />
        </mesh>
        <mesh position={[0, 14 * U, 0]} geometry={bellowsGeom} castShadow receiveShadow>
          <meshPhysicalMaterial
            color="#1554c6"
            roughness={0.34}
            metalness={0.06}
            clearcoat={0.28}
            clearcoatRoughness={0.3}
          />
        </mesh>
        {/* Anel de sucção ciano luminoso quando o vácuo está ativo */}
        {active && (
          <mesh position={[0, 61 * U, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[18 * U, 31 * U, 28]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.72} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    </group>
  )
}

// ============================================================================
// COMPRESSOR DE AR MAXXIM 24 L · 2,0 HP — modelo procedural ultra-realista
// ============================================================================

const MAXXIM_BLUE = '#0077c8'
const MAXXIM_BLUE_DARK = '#005a96'
const TANK_BLUE = '#0a7abf'
const COVER_BLACK = '#1a1d22'
const METAL_CAST = '#b8c0c8'
const METAL_BRASS = '#c9a24b'

function createMaxximLogoTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(512, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    // Fundo preto do logo
    ctx.fillStyle = '#0b0e12'
    roundRect(ctx, 8, 18, w - 16, h - 36, 18)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 78px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('MAXXIM', w / 2, h / 2 + 4)
  })
}

function createTankSpecsTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(420, 120, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(10,20,30,0.55)'
    roundRect(ctx, 0, 0, w, h, 10)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.font = 'bold 36px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('1.8 HP   ·   116 PSI   ·   24 LT', w / 2, h * 0.42)
    ctx.font = 'bold 28px Arial, sans-serif'
    ctx.fillStyle = '#e2e8f0'
    ctx.fillText('MAX 8 bar', w / 2, h * 0.78)
  })
}

function createBarGaugeTexture(pressureBar: number, maxBar = 12): THREE.CanvasTexture | null {
  return makeCanvasTex(280, 280, (ctx, S) => {
    const cx = S / 2
    const cy = S / 2
    const grad = ctx.createRadialGradient(cx, cy, S * 0.08, cx, cy, S * 0.48)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.85, '#eef2f6')
    grad.addColorStop(1, '#94a3b8')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, S * 0.46, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 3
    ctx.stroke()
    const startA = Math.PI * 0.75
    const sweepA = Math.PI * 1.5
    for (let b = 0; b <= maxBar; b += 1) {
      const a = startA + (b / maxBar) * sweepA
      const major = b % 2 === 0
      const r1 = S * (major ? 0.33 : 0.36)
      const r2 = S * 0.42
      ctx.strokeStyle = b >= maxBar * 0.75 ? '#dc2626' : '#0f172a'
      ctx.lineWidth = major ? 2.8 : 1.4
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
      ctx.stroke()
      if (major) {
        ctx.fillStyle = b >= maxBar * 0.75 ? '#dc2626' : '#0f172a'
        ctx.font = 'bold 15px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(b), cx + Math.cos(a) * (S * 0.26), cy + Math.sin(a) * (S * 0.26))
      }
    }
    ctx.fillStyle = '#334155'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('bar', cx, S * 0.72)
    const clamped = Math.max(0, Math.min(maxBar, pressureBar))
    const needleA = startA + (clamped / maxBar) * sweepA
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = 4.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - Math.cos(needleA) * 12, cy - Math.sin(needleA) * 12)
    ctx.lineTo(cx + Math.cos(needleA) * (S * 0.34), cy + Math.sin(needleA) * (S * 0.34))
    ctx.stroke()
    ctx.fillStyle = '#1e293b'
    ctx.beginPath()
    ctx.arc(cx, cy, 9, 0, Math.PI * 2)
    ctx.fill()
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Compressor de ar Maxxim 24 L · 2,0 HP — tanque, motor, tampas, manómetros e bornes. */
export function AirCompressor3D({
  c,
  position,
  onToggleRun,
  onToggleCover,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  onToggleRun?: () => void
  onToggleCover?: () => void
}) {
  const running = Boolean(c.state.running)
  const coverOpen = Boolean(c.state.coverOpen)
  const tankBar = Math.max(0, Math.min(8, Number(c.state.tankPressureBar ?? 0)))
  const outBar = Math.max(0, Math.min(8, Number(c.state.outletPressureBar ?? tankBar * 0.92)))
  const logoTex = useMemo(() => createMaxximLogoTexture(), [])
  const specsTex = useMemo(() => createTankSpecsTexture(), [])
  const tankGauge = useMemo(() => createBarGaugeTexture(tankBar, 12), [tankBar])
  const outGauge = useMemo(() => createBarGaugeTexture(outBar, 12), [outBar])
  useEffect(() => () => {
    logoTex?.dispose()
    specsTex?.dispose()
    tankGauge?.dispose()
    outGauge?.dispose()
  }, [logoTex, specsTex, tankGauge, outGauge])

  const fanRef = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (fanRef.current && running) fanRef.current.rotation.z += dt * 18
  })

  // Dimensões aproximadas fiéis ao Maxxim 24 L (unidades de cena: 1 u = 100 mm)
  const tankR = 95 * U
  const tankL = 420 * U
  const motorY = tankR + 55 * U

  return (
    <group position={position} name={`air-compressor-3d-${c.id}`}>
      {/* ——— Tanque horizontal azul ——— */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[tankR, tankR, tankL, 40]} />
        <meshStandardMaterial color={TANK_BLUE} roughness={0.28} metalness={0.55} />
      </mesh>
      {/* Tops hemisfericos */}
      <mesh position={[-tankL / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <sphereGeometry args={[tankR, 28, 18, 0, Math.PI]} />
        <meshStandardMaterial color={TANK_BLUE} roughness={0.28} metalness={0.55} />
      </mesh>
      <mesh position={[tankL / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <sphereGeometry args={[tankR, 28, 18, 0, Math.PI]} />
        <meshStandardMaterial color={TANK_BLUE} roughness={0.28} metalness={0.55} />
      </mesh>
      {/* Costuras / anéis do tanque */}
      {[-0.28, 0, 0.28].map((t, i) => (
        <mesh key={i} position={[t * tankL, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[tankR + 1.2 * U, 2.2 * U, 10, 40]} />
          <meshStandardMaterial color={MAXXIM_BLUE_DARK} roughness={0.4} metalness={0.4} />
        </mesh>
      ))}
      {/* Logo MAXXIM */}
      {logoTex && (
        <mesh position={[0, 0, tankR + 0.5 * U]} castShadow>
          <planeGeometry args={[180 * U, 55 * U]} />
          <meshStandardMaterial map={logoTex} transparent roughness={0.45} metalness={0.1} />
        </mesh>
      )}
      {/* Specs 1.8 HP / 116 PSI / 24 LT */}
      {specsTex && (
        <mesh position={[0, tankR * 0.35, tankR + 0.4 * U]}>
          <planeGeometry args={[140 * U, 40 * U]} />
          <meshStandardMaterial map={specsTex} transparent roughness={0.5} metalness={0.05} />
        </mesh>
      )}
      {/* Selo 8 Bar */}
      <mesh position={[tankL * 0.32, 0, tankR + 0.4 * U]}>
        <circleGeometry args={[22 * U, 24]} />
        <meshStandardMaterial color="#0b0e12" roughness={0.5} />
      </mesh>
      <mesh position={[tankL * 0.32, 0, tankR + 0.6 * U]}>
        <ringGeometry args={[14 * U, 20 * U, 24]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>

      {/* ——— Rodas ——— */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[tankL * 0.32, -tankR * 0.55, side * (tankR * 0.95)]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[48 * U, 48 * U, 28 * U, 24]} />
            <meshStandardMaterial color="#1c1f24" roughness={0.7} metalness={0.15} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[18 * U, 18 * U, 30 * U, 16]} />
            <meshStandardMaterial color="#64748b" roughness={0.35} metalness={0.7} />
          </mesh>
        </group>
      ))}
      {/* Rodízio frontal */}
      <mesh position={[-tankL * 0.38, -tankR * 0.85, 0]} castShadow>
        <sphereGeometry args={[18 * U, 16, 12]} />
        <meshStandardMaterial color="#1c1f24" roughness={0.65} metalness={0.2} />
      </mesh>
      <mesh position={[-tankL * 0.38, -tankR * 0.55, 0]}>
        <cylinderGeometry args={[6 * U, 6 * U, 40 * U, 12]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.75} />
      </mesh>

      {/* ——— Motor / cabeça de compressão ——— */}
      <group position={[-tankL * 0.12, motorY, 0]}>
        {/* Bloco motor alumínio */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[140 * U, 90 * U, 110 * U]} />
          <meshStandardMaterial color={METAL_CAST} roughness={0.35} metalness={0.7} />
        </mesh>
        {/* Cilindro / cabeça */}
        <mesh position={[-55 * U, 35 * U, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[42 * U, 48 * U, 55 * U, 24]} />
          <meshStandardMaterial color="#9aa5b0" roughness={0.32} metalness={0.75} />
        </mesh>
        {/* Tampas do motor (articuladas) */}
        <group
          position={[20 * U, 55 * U, 0]}
          rotation={[0, 0, coverOpen ? -Math.PI * 0.55 : 0]}
          onDoubleClick={(e) => {
            e.stopPropagation()
            onToggleCover?.()
          }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { document.body.style.cursor = '' }}
        >
          <mesh position={[0, 25 * U, 0]} castShadow>
            <boxGeometry args={[130 * U, 50 * U, 100 * U]} />
            <meshStandardMaterial color={COVER_BLACK} roughness={0.45} metalness={0.25} />
          </mesh>
          {/* Grelha de ventilação na tampa */}
          {[-1, 0, 1].map((i) => (
            <mesh key={i} position={[i * 28 * U, 25 * U, 51 * U]}>
              <boxGeometry args={[18 * U, 32 * U, 2 * U]} />
              <meshStandardMaterial color="#0f1216" roughness={0.6} />
            </mesh>
          ))}
        </group>
        {/* Ventoinha (roda quando running) */}
        <group ref={fanRef} position={[75 * U, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]} position={[0, 22 * U, 0]} castShadow>
              <boxGeometry args={[10 * U, 44 * U, 3 * U]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.4} metalness={0.5} />
            </mesh>
          ))}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[12 * U, 12 * U, 8 * U, 16]} />
            <meshStandardMaterial color="#64748b" roughness={0.3} metalness={0.7} />
          </mesh>
        </group>
        {/* Indicador running */}
        {running && (
          <mesh position={[0, 50 * U, 56 * U]}>
            <sphereGeometry args={[6 * U, 12, 12]} />
            <meshStandardMaterial color="#22c55e" emissive="#16a34a" emissiveIntensity={0.9} />
          </mesh>
        )}
      </group>

      {/* ——— Mangueira flexível prateada motor → tanque ——— */}
      <mesh position={[-tankL * 0.05, tankR * 0.55, tankR * 0.55]} rotation={[0.4, 0.2, 0.6]} castShadow>
        <cylinderGeometry args={[6 * U, 6 * U, 120 * U, 12]} />
        <meshStandardMaterial color="#c0c8d0" roughness={0.35} metalness={0.85} />
      </mesh>

      {/* ——— Painel de controlo (pressostato + manómetros + regulador) ——— */}
      <group position={[tankL * 0.22, tankR + 70 * U, 0]}>
        {/* Caixa preta pressostato */}
        <mesh
          castShadow
          onDoubleClick={(e) => {
            e.stopPropagation()
            onToggleRun?.()
          }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { document.body.style.cursor = '' }}
        >
          <boxGeometry args={[70 * U, 55 * U, 45 * U]} />
          <meshStandardMaterial color={COVER_BLACK} roughness={0.4} metalness={0.2} />
        </mesh>
        {/* Botão ON/OFF */}
        <mesh position={[0, 5 * U, 24 * U]} castShadow>
          <cylinderGeometry args={[10 * U, 10 * U, 8 * U, 20]} />
          <meshStandardMaterial
            color={running ? '#16a34a' : '#dc2626'}
            emissive={running ? '#15803d' : '#991b1b'}
            emissiveIntensity={0.45}
            roughness={0.35}
          />
        </mesh>
        {/* Manómetro tanque */}
        <group position={[-40 * U, -5 * U, 30 * U]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[22 * U, 22 * U, 12 * U, 24]} />
            <meshStandardMaterial color="#d4dbe3" roughness={0.25} metalness={0.8} />
          </mesh>
          {tankGauge && (
            <mesh position={[0, 0, 7 * U]}>
              <circleGeometry args={[20 * U, 32]} />
              <meshStandardMaterial map={tankGauge} roughness={0.2} metalness={0.05} />
            </mesh>
          )}
        </group>
        {/* Manómetro saída / regulador */}
        <group position={[40 * U, -5 * U, 30 * U]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[22 * U, 22 * U, 12 * U, 24]} />
            <meshStandardMaterial color="#d4dbe3" roughness={0.25} metalness={0.8} />
          </mesh>
          {outGauge && (
            <mesh position={[0, 0, 7 * U]}>
              <circleGeometry args={[20 * U, 32]} />
              <meshStandardMaterial map={outGauge} roughness={0.2} metalness={0.05} />
            </mesh>
          )}
        </group>
        {/* Regulador vermelho */}
        <mesh position={[55 * U, 25 * U, 10 * U]} castShadow>
          <cylinderGeometry args={[12 * U, 14 * U, 28 * U, 16]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.4} metalness={0.2} />
        </mesh>
        {/* Saída de ar (porta OUT) — engate rápido */}
        <group position={[70 * U, -15 * U, 5 * U]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[9 * U, 9 * U, 28 * U, 16]} />
            <meshStandardMaterial color={METAL_BRASS} roughness={0.28} metalness={0.88} />
          </mesh>
          <FestoQsPushInPort position={[22 * U, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={0.85} variant="black" />
        </group>
        {/* Entrada de ar / filtro aspiração (lado motor) */}
        <mesh position={[-90 * U, 10 * U, -40 * U]} castShadow>
          <cylinderGeometry args={[18 * U, 22 * U, 30 * U, 16]} />
          <meshStandardMaterial color="#334155" roughness={0.55} metalness={0.3} />
        </mesh>
      </group>

      {/* ——— Pega / guiador ——— */}
      <mesh position={[-tankL * 0.05, tankR + 130 * U, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[55 * U, 7 * U, 12, 32, Math.PI]} />
        <meshStandardMaterial color={MAXXIM_BLUE} roughness={0.35} metalness={0.45} />
      </mesh>
      {/* Pés de apoio do motor no tanque */}
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[-tankL * 0.12, tankR * 0.15, s * 35 * U]} castShadow>
          <boxGeometry args={[40 * U, 20 * U, 12 * U]} />
          <meshStandardMaterial color="#475569" roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
    </group>
  )
}
