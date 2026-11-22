import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createCompressorTankGeometry, createCompressorShroudGeometry, createCompressorTube, createCompressorSpecsGeometry, compressorShroudBulge } from './compressorGeometry'
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
  return makeCanvasTex(320, 320, (ctx, w, h) => {
    const cx = w / 2
    const cy = h / 2
    // Fundo branco fosco com leve sombra periférica
    const grad = ctx.createRadialGradient(cx, cy, w * 0.1, cx, cy, w * 0.47)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.86, '#f1f5f9')
    grad.addColorStop(1, '#cbd5e1')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2)
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
      const r1 = w * (major ? 0.34 : 0.37)
      const r2 = w * 0.42
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
        ctx.fillText(String(b), cx + Math.cos(a) * (w * 0.275), cy + Math.sin(a) * (w * 0.275))
      }
    }

    // Arco interior azul psi
    ctx.strokeStyle = FESTO_BLUE
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, w * 0.21, startA, startA + sweepA)
    ctx.stroke()

    // Marca FESTO azul + bar
    ctx.fillStyle = FESTO_BLUE
    ctx.font = '900 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('FESTO', cx, w * 0.72)
    ctx.fillStyle = '#334155'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText('bar / 16 max', cx, w * 0.81)

    // Ponteiro azul Festo
    const clamped = Math.max(0, Math.min(16, pressureBar))
    const needleA = startA + (clamped / 16) * sweepA
    ctx.strokeStyle = FESTO_BLUE
    ctx.lineWidth = 5.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - Math.cos(needleA) * 18, cy - Math.sin(needleA) * 18)
    ctx.lineTo(cx + Math.cos(needleA) * (w * 0.35), cy + Math.sin(needleA) * (w * 0.35))
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
      {/* Anel de libertação azul Festo (bisel + face plana com rebaixo) */}
      <mesh position={[0, 17.8 * U, 0]} castShadow>
        <cylinderGeometry args={[9.4 * U, 8.6 * U, 4.2 * U, 24]} />
        <meshStandardMaterial color={FESTO_BLUE} roughness={0.28} metalness={0.1} />
      </mesh>
      <mesh position={[0, 20.2 * U, 0]} castShadow>
        <cylinderGeometry args={[8.8 * U, 7.4 * U, 2.2 * U, 24]} />
        <meshStandardMaterial color="#2f9fe0" roughness={0.32} metalness={0.08} />
      </mesh>
      {/* Furo do tubo PU */}
      <mesh position={[0, 21.6 * U, 0]}>
        <cylinderGeometry args={[4.5 * U, 4.5 * U, 2.4 * U, 16]} />
        <meshStandardMaterial color="#0b111b" roughness={0.75} />
      </mesh>
      {/* Anel interior prateado (colar de retenção) */}
      <mesh position={[0, 15.2 * U, 0]}>
        <cylinderGeometry args={[7.2 * U, 7.2 * U, 1.6 * U, 20]} />
        <meshStandardMaterial color="#c5ced6" metalness={0.85} roughness={0.22} />
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

/** União em Y Festo QSY Push-In — 1 entrada + 2 saídas paralelas (fiel ao catálogo). */
export function PneumaticY3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  // Geometria QSY: porta única em baixo; duas portas paralelas lado a lado em cima
  const stem = 16 * U
  const branch = 18 * U
  const split = 11 * U // distância entre eixos das duas saídas
  return (
    <group position={position} name={`pneumatic-y-3d-${c.id}`}>
      {/* Corpo central preto (bloco Y arredondado) */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[11 * U, 20, 16]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.38} metalness={0.12} />
      </mesh>
      {/* Ombros laterais do Y (ligam o tronco às duas saídas) */}
      <mesh position={[-split * 0.35, branch * 0.15, 0]} rotation={[0, 0, -0.35]} castShadow receiveShadow>
        <cylinderGeometry args={[8.5 * U, 9.2 * U, 16 * U, 18]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.38} metalness={0.12} />
      </mesh>
      <mesh position={[split * 0.35, branch * 0.15, 0]} rotation={[0, 0, 0.35]} castShadow receiveShadow>
        <cylinderGeometry args={[8.5 * U, 9.2 * U, 16 * U, 18]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.38} metalness={0.12} />
      </mesh>
      {/* Tronco vertical da entrada */}
      <mesh position={[0, -stem * 0.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[9.2 * U, 9.2 * U, stem * 0.7, 20]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.38} metalness={0.12} />
      </mesh>
      {/* Colo das duas saídas (paralelas, lado a lado — como no QSY real) */}
      <mesh position={[-split, branch * 0.55, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[8.8 * U, 8.8 * U, 12 * U, 20]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.38} metalness={0.12} />
      </mesh>
      <mesh position={[split, branch * 0.55, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[8.8 * U, 8.8 * U, 12 * U, 20]} />
        <meshStandardMaterial color={PBT_BLACK} roughness={0.38} metalness={0.12} />
      </mesh>
      {/* Furo de fixação no corpo (característico do QSY) */}
      <mesh position={[0, 2 * U, 9 * U]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[3.2 * U, 3.2 * U, 6 * U, 14]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 2 * U, 10.5 * U]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[5 * U, 5 * U, 1.2 * U, 14]} />
        <meshStandardMaterial color={PBT_CHARCOAL} roughness={0.4} metalness={0.15} />
      </mesh>

      {/* Porta de entrada (P1) — baixo */}
      <FestoQsPushInPort position={[0, -stem * 1.05, 0]} rotation={[0, 0, Math.PI]} scale={0.9} variant="black" />
      {/* Duas saídas paralelas (P2 / P3) — cima, mesmo sentido */}
      <FestoQsPushInPort position={[-split, branch * 1.05, 0]} scale={0.9} variant="black" />
      <FestoQsPushInPort position={[split, branch * 1.05, 0]} scale={0.9} variant="black" />
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

/** Parafuso sextavado prateado das placas das estações (VTUG). */
function VtugHexScrew({
  position,
  rotation,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
}) {
  return (
    <group position={position} rotation={rotation ?? [Math.PI / 2, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[2.6 * U, 2.6 * U, 2 * U, 6]} />
        <meshStandardMaterial color="#c9d2db" roughness={0.24} metalness={0.92} />
      </mesh>
      <mesh position={[0, 1.2 * U, 0]}>
        <cylinderGeometry args={[1.25 * U, 1.25 * U, 1.2 * U, 10]} />
        <meshStandardMaterial color="#87929e" roughness={0.34} metalness={0.86} />
      </mesh>
    </group>
  )
}

/** Tubo PU branco com colar azul de fixação (saídas laterais do VTUG). */
function PuTubeStub({
  position,
  rotation,
  length = 38 * U,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  length?: number
}) {
  return (
    <group position={position} rotation={rotation ?? [0, 0, 0]}>
      <mesh position={[0, length * 0.5, 0]} castShadow>
        <cylinderGeometry args={[5.2 * U, 5.2 * U, length, 18]} />
        <meshStandardMaterial color="#eef2f6" roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh position={[0, 5 * U, 0]} castShadow>
        <cylinderGeometry args={[6.6 * U, 6.6 * U, 9 * U, 18]} />
        <meshStandardMaterial color={FESTO_BLUE} roughness={0.3} metalness={0.1} />
      </mesh>
    </group>
  )
}

/** Faixa FESTO gravada no topo do módulo elétrico (azul sobre alumínio). */
function createVtugTopLabelTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(256, 160, (ctx, W, H) => {
    ctx.fillStyle = ALU_ANODIZED
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    for (let y = 0; y < H; y += 4) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
    ctx.fillStyle = FESTO_BLUE
    ctx.font = '900 52px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('FESTO', W / 2, H * 0.38)
    ctx.fillStyle = '#1e293b'
    ctx.font = 'bold 22px monospace'
    ctx.fillText('VTUG-14-VRLK', W / 2, H * 0.72)
  })
}

/** 7. Ilha de Válvulas Festo VTUG 4 Estações em Calha DIN — reconstrução fiel à fotografia do produto:
 *  base de alumínio maquinado com degrau frontal, módulo elétrico à esquerda com conector M12,
 *  fatias prateadas entre placas pretas com parafusos, tampas brancas + anel azul, duas filas de
 *  racores QS niquelados na frente, pilha de racores no topo e tubos PU brancos com colar azul. */
export function PneumaticManifold3D({
  c,
  position,
  onToggleStation,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  onToggleStation?: (idx: number) => void
}) {
  const stations = [1, 2, 3, 4]
  const pitch = 40 * U
  const baseW = 250 * U
  const baseH = 47 * U
  const baseD = 86 * U
  const stationXs = [-50, -10, 30, 70].map((v) => v * U)
  const plateXs = [-70, -30, 10, 50, 90].map((v) => v * U)
  const topLabel = useMemo(() => createVtugTopLabelTexture(), [])
  useEffect(() => () => { topLabel?.dispose() }, [topLabel])

  return (
    <group position={position} name={`pneumatic-manifold-3d-${c.id}`}>
      {/* ——— Calha DIN 35 mm (traseira) ——— */}
      <mesh position={[0, -58 * U, -baseD * 0.56]} castShadow receiveShadow>
        <boxGeometry args={[baseW + 24 * U, 30 * U, 7 * U]} />
        <meshStandardMaterial color="#aeb8c2" roughness={0.32} metalness={0.88} />
      </mesh>
      <mesh position={[0, -45 * U, -baseD * 0.53]} castShadow>
        <boxGeometry args={[baseW + 22 * U, 4 * U, 12 * U]} />
        <meshStandardMaterial color="#9aa6b2" roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh position={[0, -70 * U, -baseD * 0.53]} castShadow>
        <boxGeometry args={[baseW + 22 * U, 4 * U, 12 * U]} />
        <meshStandardMaterial color="#9aa6b2" roughness={0.3} metalness={0.9} />
      </mesh>

      {/* ——— Base de alumínio maquinado (perfil com degrau frontal) ——— */}
      <mesh position={[0, -21.5 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[baseW, baseH, baseD]} />
        <meshStandardMaterial color={ALU_ANODIZED} roughness={0.26} metalness={0.86} />
      </mesh>
      {/* Degrau frontal inferior (banco dos racores A/B) */}
      <mesh position={[0, -32 * U, baseD * 0.52]} castShadow receiveShadow>
        <boxGeometry args={[baseW - 10 * U, 26 * U, 20 * U]} />
        <meshStandardMaterial color={ALU_BRUSHED} roughness={0.3} metalness={0.84} />
      </mesh>
      {/* Ranhura de maquinagem ao comprimento */}
      <mesh position={[0, -10 * U, baseD * 0.505]}>
        <boxGeometry args={[baseW - 26 * U, 3 * U, 2 * U]} />
        <meshStandardMaterial color="#b9c3cd" roughness={0.35} metalness={0.8} />
      </mesh>
      {/* Chanfro superior */}
      <mesh position={[0, 1.2 * U, 0]} castShadow>
        <boxGeometry args={[baseW, 2.4 * U, baseD * 0.985]} />
        <meshStandardMaterial color={ALU_BRUSHED} roughness={0.3} metalness={0.84} />
      </mesh>

      {/* ——— Módulo elétrico à esquerda (alumínio + M12 + FESTO + botão + LED) ——— */}
      <group position={[-101 * U, 26 * U, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[48 * U, 50 * U, 64 * U]} />
          <meshStandardMaterial color={ALU_ANODIZED} roughness={0.25} metalness={0.85} />
        </mesh>
        {/* Chanfro do topo do módulo */}
        <mesh position={[0, 24 * U, 0]} castShadow>
          <boxGeometry args={[44 * U, 4 * U, 60 * U]} />
          <meshStandardMaterial color={ALU_BRUSHED} roughness={0.28} metalness={0.84} />
        </mesh>
        {/* Etiqueta FESTO no topo */}
        {topLabel && (
          <mesh position={[0, 26.3 * U, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[34 * U, 22 * U]} />
            <meshStandardMaterial map={topLabel} roughness={0.32} metalness={0.5} />
          </mesh>
        )}
        {/* Conector circular M12 (preto, com rosca) no topo */}
        <group position={[6 * U, 30 * U, -6 * U]}>
          <mesh castShadow>
            <cylinderGeometry args={[8 * U, 8 * U, 11 * U, 22]} />
            <meshStandardMaterial color="#171c23" roughness={0.34} metalness={0.42} />
          </mesh>
          <mesh position={[0, 6 * U, 0]}>
            <cylinderGeometry args={[6.2 * U, 6.2 * U, 2.4 * U, 22]} />
            <meshStandardMaterial color="#2c333d" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0, 7.4 * U, 0]}>
            <cylinderGeometry args={[3.4 * U, 3.4 * U, 1.2 * U, 16]} />
            <meshStandardMaterial color="#0b0e12" roughness={0.7} />
          </mesh>
          {/* pinos */}
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2 + 0.3
            return (
              <mesh key={i} position={[Math.cos(a) * 2.1 * U, 8.2 * U, Math.sin(a) * 2.1 * U]}>
                <cylinderGeometry args={[0.6 * U, 0.6 * U, 1.6 * U, 8]} />
                <meshStandardMaterial color="#d9c37e" roughness={0.3} metalness={0.85} />
              </mesh>
            )
          })}
        </group>
        {/* Botão de teste prateado + LED verde na face frontal */}
        <mesh position={[8 * U, 8 * U, 33.5 * U]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[5 * U, 5 * U, 5 * U, 18]} />
          <meshStandardMaterial color="#c3ccd6" roughness={0.28} metalness={0.88} />
        </mesh>
        <mesh position={[8 * U, -8 * U, 33.5 * U]}>
          <boxGeometry args={[7 * U, 4.6 * U, 2.6 * U]} />
          <meshStandardMaterial color="#22c55e" emissive="#16a34a" emissiveIntensity={0.85} />
        </mesh>
        {/* Símbolo gravado (pequeno quadrado técnico) */}
        <mesh position={[-12 * U, 6 * U, 32.6 * U]}>
          <planeGeometry args={[12 * U, 9 * U]} />
          <meshStandardMaterial color="#c6ced7" roughness={0.42} metalness={0.6} />
        </mesh>
        {/* Racor em cotovelo latão + tubos PU brancos (entrada P / exaustão R) */}
        <group position={[-14 * U, -12 * U, 24 * U]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[6 * U, 6 * U, 12 * U, 6]} />
            <meshStandardMaterial color={METAL_BRASS} roughness={0.3} metalness={0.85} />
          </mesh>
          <FestoQsPushInPort position={[0, 0, 10 * U]} rotation={[Math.PI / 2, 0, 0]} scale={0.8} variant="black" />
        </group>
        <PuTubeStub position={[-24 * U, -20 * U, 10 * U]} rotation={[0, 0, Math.PI / 2]} length={36 * U} />
        <PuTubeStub position={[-24 * U, -20 * U, -12 * U]} rotation={[0, 0, Math.PI / 2]} length={36 * U} />
      </group>

      {/* ——— Pilha de racores QS no topo do deck esquerdo (2 × 5, corpo branco + anel azul) ——— */}
      {[0, 1].map((row) =>
        [0, 1, 2, 3, 4].map((col) => (
          <FestoQsPushInPort
            key={`top-${row}-${col}`}
            position={[-66 * U + col * 15 * U, 2 * U, (-14 + row * 22) * U]}
            scale={0.52}
            variant="nickel"
          />
        )),
      )}

      {/* ——— 4 estações: placas pretas + fatias prateadas + tampa branca + comando manual ——— */}
      {plateXs.map((px, plateIdx) => {
        return (
          <group key={`plate-${plateIdx}`} position={[px, 32 * U, 0]}>
            {/* Placa preta vertical */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[6 * U, 60 * U, 62 * U]} />
              <meshStandardMaterial color={PBT_BLACK} roughness={0.36} metalness={0.2} />
            </mesh>
            {/* Rebaixo frontal da placa */}
            <mesh position={[0, 0, 31.6 * U]}>
              <boxGeometry args={[4.4 * U, 52 * U, 2 * U]} />
              <meshStandardMaterial color={PBT_CHARCOAL} roughness={0.34} metalness={0.22} />
            </mesh>
            {/* Parafusos sextavados (2 por placa, na face frontal) */}
            <VtugHexScrew position={[0, 20 * U, 33 * U]} />
            <VtugHexScrew position={[0, -20 * U, 33 * U]} />
          </group>
        )
      })}
      {stations.map((stNum, idx) => {
        const sx = stationXs[idx]
        const isOn = Boolean(c.state[`station${stNum}On`] || c.state[`station${stNum}Manual`])
        return (
          <group key={stNum} position={[sx, 30 * U, 0]}>
            {/* Fatia de válvula em alumínio */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[34 * U, 52 * U, 56 * U]} />
              <meshStandardMaterial color={ALU_BRUSHED} roughness={0.27} metalness={0.85} />
            </mesh>
            {/* Nervura superior da fatia */}
            <mesh position={[0, 27 * U, 0]} castShadow>
              <boxGeometry args={[30 * U, 4 * U, 52 * U]} />
              <meshStandardMaterial color={ALU_ANODIZED} roughness={0.24} metalness={0.88} />
            </mesh>
            {/* Tampa / piloto branco com anel azul no topo */}
            <mesh position={[0, 38 * U, -6 * U]} castShadow>
              <cylinderGeometry args={[8.4 * U, 8.4 * U, 16 * U, 20]} />
              <meshStandardMaterial color="#f4f7fa" roughness={0.34} metalness={0.08} />
            </mesh>
            <mesh position={[0, 31 * U, -6 * U]}>
              <cylinderGeometry args={[9.4 * U, 9.4 * U, 3.4 * U, 20]} />
              <meshStandardMaterial color={FESTO_BLUE} roughness={0.28} />
            </mesh>
            <mesh position={[0, 46.6 * U, -6 * U]}>
              <cylinderGeometry args={[7.4 * U, 7.4 * U, 1.8 * U, 20]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.3} />
            </mesh>
            {/* Comando manual azul (clique = alternar estação) */}
            <mesh
              position={[0, -6 * U, 29.5 * U]}
              castShadow
              onClick={(e) => {
                e.stopPropagation()
                onToggleStation?.(stNum)
              }}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
              onPointerOut={() => { document.body.style.cursor = '' }}
            >
              <boxGeometry args={[16 * U, 9 * U, 5 * U]} />
              <meshStandardMaterial
                color={isOn ? '#f59e0b' : FESTO_BLUE}
                emissive={isOn ? '#d97706' : '#000000'}
                emissiveIntensity={isOn ? 0.55 : 0}
                roughness={0.28}
              />
            </mesh>
            {/* LED de estado da estação */}
            <mesh position={[0, 12 * U, 29.5 * U]}>
              <boxGeometry args={[10 * U, 4.4 * U, 2 * U]} />
              <meshStandardMaterial
                color={isOn ? '#facc15' : '#475569'}
                emissive={isOn ? '#eab308' : '#000000'}
                emissiveIntensity={isOn ? 1.6 : 0}
              />
            </mesh>
            {/* Gravação do número da estação */}
            <mesh position={[0, -18 * U, 29.5 * U]}>
              <boxGeometry args={[9 * U, 7 * U, 1.6 * U]} />
              <meshStandardMaterial color="#9aa5b0" roughness={0.36} metalness={0.7} />
            </mesh>
          </group>
        )
      })}

      {/* ——— Filas de racores QS niquelados no degrau frontal (A/B por estação) ——— */}
      {stationXs.map((sx, idx) => (
        <group key={`front-ports-${idx}`}>
          <FestoQsPushInPort position={[sx, -25 * U, baseD * 0.52 + 10 * U]} rotation={[Math.PI / 2, 0, 0]} scale={0.78} variant="nickel" />
          <FestoQsPushInPort position={[sx, -40 * U, baseD * 0.52 + 10 * U]} rotation={[Math.PI / 2, 0, 0]} scale={0.78} variant="nickel" />
        </group>
      ))}

      {/* ——— Tampa / placa final direita + silenciadores PE ——— */}
      <group position={[110 * U, 32 * U, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[26 * U, 62 * U, 62 * U]} />
          <meshStandardMaterial color={PBT_BLACK} roughness={0.36} metalness={0.2} />
        </mesh>
        <VtugHexScrew position={[0, 20 * U, 33 * U]} />
        <VtugHexScrew position={[0, -20 * U, 33 * U]} />
        {/* Tubos de exaustão brancos apontados para a direita */}
        <PuTubeStub position={[16 * U, -8 * U, -14 * U]} rotation={[0, 0, -Math.PI / 2]} length={34 * U} />
        <PuTubeStub position={[16 * U, -8 * U, 14 * U]} rotation={[0, 0, -Math.PI / 2]} length={34 * U} />
      </group>
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
// COMPRESSOR DE AR MAXXIM 24 L · MCA2420 — modelo procedural de referência
// (carcaça preta esculpida, motor prata, mangueira trançada inox, manómetros,
//  regulador vermelho, rodas com suportes soldados e puxador tubular)
// ============================================================================

const TANK_BLUE = '#00758b'
const COVER_BLACK = '#1a1d22'
const METAL_CAST = '#b8c0c8'
const METAL_BRASS = '#c9a24b'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function createMaxximLogoTexture(image: HTMLImageElement): THREE.CanvasTexture | null {
  return makeCanvasTex(768, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    // Placa preta com o logótipo MAXXIM a branco (como no tanque do produto)
    ctx.fillStyle = '#231f20'
    roundRect(ctx, 0, 0, w, h, 10)
    ctx.fill()
    ctx.drawImage(image, 10, 14, w - 20, h - 28)
  })
}

/** Faixa de especificações no flanco da carcaça preta: 1.8 | 116 | 24 · HP | PSI | LT */
function createShroudSpecsTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const cells = ['1.8', '116', '24']
    const units = ['HP', 'PSI', 'LT']
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.18 + i * 0.32)
      ctx.fillStyle = '#eef2f6'
      ctx.font = '900 56px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(cells[i], cx, h * 0.38)
      ctx.font = 'bold 28px Arial, sans-serif'
      ctx.fillText(units[i], cx, h * 0.72)
      if (i < 2) {
        ctx.strokeStyle = 'rgba(238,242,246,0.85)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(w * (0.34 + i * 0.32), h * 0.18)
        ctx.lineTo(w * (0.34 + i * 0.32), h * 0.82)
        ctx.stroke()
      }
    }
  })
}

/** Selo circular "8 Bar" com seta curva (lado direito do tanque, como no produto). */
function createBarBadgeTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const cx = w / 2
    const cy = h / 2
    ctx.fillStyle = '#0b0e12'
    ctx.beginPath()
    ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2)
    ctx.fill()
    // Arco da seta (sentido horário)
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.arc(cx, cy, w * 0.335, -Math.PI * 0.78, Math.PI * 0.28)
    ctx.stroke()
    const tipA = Math.PI * 0.28
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(cx + w * 0.335 * Math.cos(tipA), cy + w * 0.335 * Math.sin(tipA))
    ctx.lineTo(cx + w * 0.42 * Math.cos(tipA + 0.28), cy + w * 0.42 * Math.sin(tipA + 0.28))
    ctx.lineTo(cx + w * 0.25 * Math.cos(tipA + 0.3), cy + w * 0.25 * Math.sin(tipA + 0.3))
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.font = '900 84px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('8', cx, cy - 18)
    ctx.font = 'bold 42px Arial, sans-serif'
    ctx.fillText('Bar', cx, cy + 44)
  })
}

/** Malha trançada da mangueira flexível em aço inox. */
function createBraidedHoseTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b9c2cb'
    ctx.fillRect(0, 0, w, h)
    ctx.lineCap = 'square'
    const weave = (color: string, dx: number, dir: number) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 9
      for (let i = -h; i < w + h; i += 15) {
        ctx.beginPath()
        ctx.moveTo(i + dx, 0)
        ctx.lineTo(i + dx + dir * h, h)
        ctx.stroke()
      }
    }
    weave('rgba(248,250,252,0.6)', 0, 1)
    weave('rgba(96,110,124,0.55)', 7, 1)
    weave('rgba(248,250,252,0.52)', 0, -1)
    weave('rgba(96,110,124,0.5)', 7, -1)
  })
}

/** Etiqueta "AVISO" do pressostato (caixa preta com botão vermelho). */
function createPressostatoTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(128, 224, (ctx, w, h) => {
    ctx.fillStyle = '#191b1d'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f4f5f4'
    ctx.font = 'bold 18px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('AVISO!', w / 2 + 10, 24)
    ctx.strokeStyle = '#f4f5f4'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(14, 10); ctx.lineTo(23, 26); ctx.lineTo(5, 26); ctx.closePath(); ctx.stroke()
    ctx.font = 'bold 12px Arial, sans-serif'
    ctx.fillText('!', 14, 23)
    ctx.fillStyle = '#087291'
    ctx.fillRect(5, 33, w - 10, h - 38)
    // Linhas gráficas para o texto que não é legível na fotografia.
    ctx.fillStyle = '#c6e1e5'
    for (let y = 44; y < 141; y += 8) {
      for (let x = 12; x < 110; x += 19) ctx.fillRect(x, y, 14, 2)
    }
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 15px Arial, sans-serif'
    ctx.fillText('ON', w / 2, 168)
    ctx.fillText('OFF', w / 2, 202)
  })
}

/** Manómetro analógico 0–12 bar com ponteiro vermelho e zona vermelha (produto Maxxim). */
function createBarGaugeTexture(pressureBar: number, maxBar = 12): THREE.CanvasTexture | null {
  return makeCanvasTex(280, 280, (ctx, w, h) => {
    const cx = w / 2
    const cy = h / 2
    const grad = ctx.createRadialGradient(cx, cy, w * 0.08, cx, cy, w * 0.48)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.85, '#eef2f6')
    grad.addColorStop(1, '#94a3b8')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 3
    ctx.stroke()
    const startA = Math.PI * 0.75
    const sweepA = Math.PI * 1.5
    for (let b = 0; b <= maxBar; b += 1) {
      const a = startA + (b / maxBar) * sweepA
      const major = b % 2 === 0
      const r1 = w * (major ? 0.33 : 0.36)
      const r2 = w * 0.42
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
        ctx.fillText(String(b), cx + Math.cos(a) * (w * 0.26), cy + Math.sin(a) * (w * 0.26))
      }
    }
    ctx.fillStyle = '#334155'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('bar', cx, w * 0.72)
    const clamped = Math.max(0, Math.min(maxBar, pressureBar))
    const needleA = startA + (clamped / maxBar) * sweepA
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = 4.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - Math.cos(needleA) * 12, cy - Math.sin(needleA) * 12)
    ctx.lineTo(cx + Math.cos(needleA) * (w * 0.34), cy + Math.sin(needleA) * (w * 0.34))
    ctx.stroke()
    ctx.fillStyle = '#1e293b'
    ctx.beginPath()
    ctx.arc(cx, cy, 9, 0, Math.PI * 2)
    ctx.fill()
  })
}

/**
 * Decal curvo que abraça o tanque cilíndrico (eixo em X, centro em +Z).
 * O plano é deformado sobre a superfície do cilindro — o texto segue a curvatura.
 * Entradas em mm; a geometria sai em unidades de cena (U).
 */
function createTankDecalGeometry(radiusMm: number, widthMm: number, arcMm: number): THREE.BufferGeometry {
  const radius = radiusMm * U
  const geo = new THREE.PlaneGeometry(widthMm * U, arcMm * U, 24, 8)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const ang = y / radius
    pos.setXYZ(i, x, Math.sin(ang) * radius, Math.cos(ang) * radius)
  }
  geo.computeVertexNormals()
  return geo
}

function TankDecal({
  texture,
  widthMm,
  arcMm,
  position,
  radiusMm = 95.8,
}: {
  texture: THREE.CanvasTexture | null
  widthMm: number
  arcMm: number
  position: [number, number, number]
  radiusMm?: number
}) {
  const geo = useMemo(() => createTankDecalGeometry(radiusMm, widthMm, arcMm), [radiusMm, widthMm, arcMm])
  useEffect(() => () => { geo.dispose() }, [geo])
  if (!texture) return null
  return (
    <mesh geometry={geo} position={position}>
      <meshStandardMaterial map={texture} transparent userData={{ keepTransparent: true }} side={THREE.DoubleSide} roughness={0.42} metalness={0.08} />
    </mesh>
  )
}

/** Rosto do manómetro: aro cromado + vidro + mostrador. */
function GaugeFace({
  texture,
  radius = 23 * U,
}: {
  texture: THREE.CanvasTexture | null
  radius?: number
}) {
  return (
    <group>
      {/* Aro cromado */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[radius * 1.12, radius * 1.12, 10 * U, 28]} />
        <meshStandardMaterial color="#cdd6df" roughness={0.18} metalness={0.92} />
      </mesh>
      {/* Mostrador */}
      {texture && (
        <mesh position={[0, 0, 5.2 * U]}>
          <circleGeometry args={[radius, 36]} />
          <meshStandardMaterial map={texture} roughness={0.24} metalness={0.05} />
        </mesh>
      )}
      {/* Vidro */}
      <mesh position={[0, 0, 6.2 * U]}>
        <circleGeometry args={[radius * 1.04, 36]} />
        <meshPhysicalMaterial
          color="#eef4fa"
          transparent
          opacity={0.16}
          roughness={0.06}
          metalness={0}
          userData={{ keepTransparent: true }}
        />
      </mesh>
    </group>
  )
}

/** Roda preta com 8 raios, cubo e parafuso de eixo em latão (fiel ao produto). */
function CompressorWheel({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pneu (plano XY, eixo em Z — a roda encara o observador, como no produto) */}
      <mesh castShadow>
        <torusGeometry args={[47 * U, 8 * U, 16, 48]} />
        <meshStandardMaterial color="#15181d" roughness={0.62} metalness={0.12} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[47 * U, 47 * U, 18 * U, 48]} />
        <meshStandardMaterial color="#15181d" roughness={0.62} metalness={0.12} />
      </mesh>
      {/* Disco + raios */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 10 * U]}>
        <cylinderGeometry args={[42 * U, 42 * U, 3 * U, 48]} />
        <meshStandardMaterial color="#1c2128" roughness={0.5} metalness={0.2} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <mesh key={i} rotation={[0, 0, (i * Math.PI) / 4]} position={[-Math.sin(i * Math.PI / 4) * 26 * U, Math.cos(i * Math.PI / 4) * 26 * U, 14 * U]}>
          <boxGeometry args={[4 * U, 31 * U, 5 * U]} />
          <meshStandardMaterial color="#111418" roughness={0.52} metalness={0.18} />
        </mesh>
      ))}
      {/* Cubo + parafuso de eixo em latão */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 15 * U]}>
        <cylinderGeometry args={[13 * U, 13 * U, 10 * U, 20]} />
        <meshStandardMaterial color="#23282f" roughness={0.42} metalness={0.35} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 23 * U]}>
        <cylinderGeometry args={[7 * U, 7 * U, 7 * U, 6]} />
        <meshStandardMaterial color={METAL_BRASS} roughness={0.28} metalness={0.88} />
      </mesh>
    </group>
  )
}

/** Compressor Maxxim: proporções da fotografia, vistas e identificação do manual. */
export function AirCompressor3D({ c, position, onToggleRun, onToggleCover }: {
  c: ElectricalComponent
  position: [number, number, number]
  onToggleRun?: () => void
  onToggleCover?: () => void
}) {
  const running = Boolean(c.state.running)
  const coverOpen = Boolean(c.state.coverOpen)
  const tankBar = Math.max(0, Math.min(8, Number(c.state.tankPressureBar ?? 0)))
  const outBar = Math.max(0, Math.min(8, Number(c.state.outletPressureBar ?? tankBar * 0.92)))
  const logoImage = useLoader(THREE.TextureLoader, '/component-textures/maxxim-logo.png')
  const labels = useMemo(() => ({ logo: createMaxximLogoTexture(logoImage.image), specs: createShroudSpecsTexture(), badge: createBarBadgeTexture(), press: createPressostatoTexture() }), [logoImage])
  const hoseTex = useMemo(() => {
    const t = createBraidedHoseTexture()
    if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(36, 2) }
    return t
  }, [])
  const tankGauge = useMemo(() => createBarGaugeTexture(tankBar, 12), [tankBar])
  const outGauge = useMemo(() => createBarGaugeTexture(outBar, 12), [outBar])
  // Cada recurso pertence ao seu ciclo de vida: mudar a pressão não elimina
  // os decalques e mapas partilhados que continuam montados.
  useEffect(() => () => { Object.values(labels).forEach(t => t?.dispose()); hoseTex?.dispose() }, [labels, hoseTex])
  useEffect(() => () => { tankGauge?.dispose() }, [tankGauge])
  useEffect(() => () => { outGauge?.dispose() }, [outGauge])
  const geometry = useMemo(() => ({
    tank: createCompressorTankGeometry(U),
    shroud: createCompressorShroudGeometry(U),
    specs: createCompressorSpecsGeometry(U),
    hose: createCompressorTube([[-163, 234, 92], [-166, 185, 100], [-172, 78, 104], [-162, 8, 106], [-130, -1, 106], [25, -3, 106], [137, -3, 103]], 5.1, U),
    handle: createCompressorTube([[164, 30, -42], [179, 111, -42], [196, 210, -42], [208, 258, -42]], 8, U),
    copper: createCompressorTube([[133, 100, 72], [134, 67, 78], [140, 25, 88], [140, 6, 96]], 2.2, U),
    rib: createCompressorTube([[-125, 185], [-60, 185], [10, 185], [63, 184]].map(([x,y]) => [x,y,74+compressorShroudBulge(x,y)]), 2.2, U),
    inset: createCompressorTube([[-122, 145], [-40, 146], [31, 146], [47, 128], [44, 103], [22, 87], [-122, 87]].map(([x,y]) => [x,y,74+compressorShroudBulge(x,y)]), 1.8, U),
    elbow: createCompressorTube([[-163, 234, 92], [-163, 253, 92], [-156, 257, 86], [-149, 249, 78]], 4, U),
  }), [])
  useEffect(() => () => { Object.values(geometry).forEach(g => g.dispose()) }, [geometry])
  const fanRef = useRef<THREE.Group>(null)
  useFrame((_, dt) => { if (fanRef.current && running) fanRef.current.rotation.x += dt * 18 })
  const blue = <meshStandardMaterial color={TANK_BLUE} roughness={0.36} metalness={0.35} />
  const black = <meshStandardMaterial color={COVER_BLACK} roughness={0.43} metalness={0.12} />
  const brass = <meshStandardMaterial color={METAL_BRASS} roughness={0.27} metalness={0.85} />
  const chrome = <meshStandardMaterial color="#b9c2c6" roughness={0.24} metalness={0.86} />
  return (
    <group position={position} name={'air-compressor-3d-' + c.id}>
      <group position={[0, -26 * U, 0]}>
      <mesh name="compressor-tank" geometry={geometry.tank} position={[0, -50 * U, 0]} castShadow receiveShadow>{blue}</mesh>
      {[-194, 194].map(x => <mesh key={x} position={[x * U, -50 * U, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[99 * U, 1.1 * U, 8, 80]} />{blue}
      </mesh>)}
      {[-1, 1].map(side => <mesh key={side} position={[side * 226 * U, -50 * U, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[7 * U, 7 * U, 4 * U, 20]} />{blue}
      </mesh>)}
      <TankDecal texture={labels.logo} widthMm={242} arcMm={51} radiusMm={99.5} position={[-17 * U, -50 * U, 0]} />
      <TankDecal texture={labels.badge} widthMm={53} arcMm={54} radiusMm={99.5} position={[145 * U, -50 * U, 0]} />

      {/* Motor e cárter fundido: parte prateada visível à esquerda da carenagem. */}
      <group position={[-126 * U, 104 * U, 5 * U]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[48 * U, 48 * U, 150 * U, 48]} /><meshStandardMaterial color={METAL_CAST} roughness={0.4} metalness={0.72} /></mesh>
        {[-69, -61, -53].map(x => <mesh key={x} position={[x * U, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[49 * U, 49 * U, 2.5 * U, 48]} />{chrome}
        </mesh>)}
        <group ref={fanRef} position={[-77 * U, 0, 0]}>
          {[0, 1, 2, 3, 4, 5].map(i => <mesh key={i} rotation={[i * Math.PI / 3, 0, 0]}><boxGeometry args={[2 * U, 70 * U, 9 * U]} />{black}</mesh>)}
        </group>
        <mesh position={[-15 * U, 0, 40 * U]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[38 * U, 38 * U, 21 * U, 48]} />{chrome}</mesh>
        {[-28, 28].flatMap(x => [-22, 22].map(y => <mesh key={x + ':' + y} position={[(x - 15) * U, y * U, 52 * U]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[3.3 * U, 3.3 * U, 3 * U, 6]} />{chrome}</mesh>))}
      </group>
      <group position={[-151 * U, 195 * U, 9 * U]}>
        <mesh><boxGeometry args={[45 * U, 52 * U, 45 * U]} />{black}</mesh>
        {[0, 1, 2, 3, 4, 5].map(i => <mesh key={i} position={[0, (i * 8 - 20) * U, 0]}><boxGeometry args={[57 * U, 3 * U, 54 * U]} />{black}</mesh>)}
        <mesh position={[-43 * U, -18 * U, 0]}><cylinderGeometry args={[7 * U, 7 * U, 38 * U, 24]} />{black}</mesh>
      </group>
      <mesh geometry={geometry.elbow}>{brass}</mesh>
      <mesh geometry={geometry.hose} name="compressor-braided-hose" castShadow><meshStandardMaterial map={hoseTex} roughness={0.46} metalness={0.72} /></mesh>
      {[[-163, 234, 92], [132, -3, 103]].map(([x,y,z],i) => <mesh key={i} position={[x*U,y*U,z*U]} rotation={i ? [0,0,Math.PI/2] : [0,0,0]}><cylinderGeometry args={[7*U,7*U,12*U,6]} />{chrome}</mesh>)}
      <group position={[143 * U, -3 * U, 103 * U]}>
        <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[8*U,8*U,15*U,20]} />{brass}</mesh>
        <mesh position={[3*U, 8*U, -3*U]}><cylinderGeometry args={[5*U,5*U,15*U,6]} />{brass}</mesh>
        <mesh position={[0, -6*U, -7*U]} rotation={[0.65,0,0]}><cylinderGeometry args={[5*U,5*U,18*U,6]} />{brass}</mesh>
      </group>
      <mesh geometry={geometry.copper}><meshStandardMaterial color="#b56f3c" roughness={0.3} metalness={0.82} /></mesh>

      <group name="compressor-cover" rotation={[0, 0, coverOpen ? 0.55 : 0]}
        onDoubleClick={e => { e.stopPropagation(); onToggleCover?.() }}>
        <mesh geometry={geometry.shroud} castShadow receiveShadow>{black}</mesh>
        <mesh geometry={geometry.rib}><meshStandardMaterial color="#262a2d" roughness={0.45} /></mesh>
        <mesh geometry={geometry.inset}><meshStandardMaterial color="#111417" roughness={0.5} /></mesh>
        {labels.specs && <mesh geometry={geometry.specs}><meshStandardMaterial map={labels.specs} transparent userData={{ keepTransparent: true }} roughness={0.5} /></mesh>}
        <mesh position={[-116*U,160*U,83*U]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[6*U,6*U,2*U,32]} />{chrome}</mesh>
        <mesh position={[-116*U,160*U,85*U]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[3.2*U,3.2*U,2*U,6]} />{chrome}</mesh>
        {[-178,-158,-138].map((x,i) => <group key={x} position={[x*U,(282-i*0.5)*U,0]} rotation={[0,0,-0.01*i]}>
          {Array.from({length:7},(_,j) => <mesh key={j} position={[0,0,(j*7-24)*U]} rotation={[0,0,-0.03]}><boxGeometry args={[16*U,1.8*U,2.2*U]} /><meshStandardMaterial color="#0b0d0f" roughness={0.8} /></mesh>)}
        </group>)}
      </group>
      {/* Chapa de montagem azul à frente, não uma barra sobre o motor. */}
      <group position={[-57*U,44*U,78*U]}>
        <mesh castShadow><boxGeometry args={[139*U,53*U,4*U]} />{blue}</mesh>
        <mesh position={[35*U,17*U,2.5*U]}><boxGeometry args={[31*U,3*U,1*U]} />{black}</mesh>
        {[-60,55].map(x => <mesh key={x} position={[x*U,18*U,4*U]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[4*U,4*U,2.5*U,20]} />{chrome}</mesh>)}
      </group>

      <mesh geometry={geometry.handle} castShadow>{blue}</mesh>
      <mesh position={[219*U,258*U,-42*U]} rotation={[0,0,Math.PI/2]} castShadow><cylinderGeometry args={[12*U,12*U,30*U,32]} />{black}</mesh>
      <group position={[148*U,140*U,27*U]} name="compressor-pressure-switch" onDoubleClick={e => { e.stopPropagation(); onToggleRun?.() }}>
        <mesh castShadow><boxGeometry args={[58*U,76*U,46*U]} />{black}</mesh>
        <mesh position={[0,36*U,0]}><boxGeometry args={[61*U,4*U,49*U]} />{black}</mesh>
        {labels.press && <mesh position={[0,-1*U,23.4*U]}><planeGeometry args={[25*U,44*U]} /><meshStandardMaterial map={labels.press} roughness={0.5} /></mesh>}
        <mesh position={[-9*U,43*U,0]}><cylinderGeometry args={[7*U,6*U,10*U,32]} /><meshStandardMaterial color="#b32025" roughness={0.4} /></mesh>
        <mesh position={[-9*U,49*U,0]}><cylinderGeometry args={[8*U,8*U,2*U,32]} /><meshStandardMaterial color="#cf3b3c" roughness={0.4} /></mesh>
      </group>
      {/* Regulador e pressostato independentes, com tubos e racores expostos. */}
      <group position={[166*U,88*U,37*U]}>
        <mesh><cylinderGeometry args={[8*U,8*U,52*U,6]} />{brass}</mesh>
        <mesh position={[-6*U,-28*U,0]}><cylinderGeometry args={[10*U,10*U,31*U,20]} />{blue}</mesh>
        <group position={[-4*U,0,23*U]}><GaugeFace texture={tankGauge} radius={20*U} /></group>
        <group position={[45*U,-4*U,20*U]}><GaugeFace texture={outGauge} radius={17*U} /></group>
        <mesh position={[45*U,10*U,0]}><cylinderGeometry args={[13*U,11*U,24*U,24]} />{black}</mesh>
        <mesh position={[45*U,24*U,0]}><cylinderGeometry args={[11*U,11*U,5*U,6]} />{chrome}</mesh>
        <group position={[45*U,41*U,0]}>
          <mesh castShadow><cylinderGeometry args={[12*U,13*U,24*U,32]} /><meshStandardMaterial color="#ad2024" roughness={0.38} /></mesh>
          {Array.from({length:16},(_,i) => { const a=i/16*Math.PI*2; return <mesh key={i} position={[Math.cos(a)*12*U,0,Math.sin(a)*12*U]} rotation={[0,-a,0]}><boxGeometry args={[2*U,22*U,2*U]} /><meshStandardMaterial color="#931a20" roughness={0.48} /></mesh> })}
        </group>
        <group position={[64*U,0,0]} rotation={[0,0,-Math.PI/2]}>
          {[{y:0,r:8,h:16},{y:12,r:9,h:10},{y:21,r:8,h:8}].map(({y,r,h},i) => <mesh key={i} position={[0,y*U,0]}><cylinderGeometry args={[r*U,r*U,h*U,i?32:6]} />{i?chrome:brass}</mesh>)}
          <mesh position={[0,26*U,0]}><cylinderGeometry args={[5*U,5*U,1*U,24]} />{black}</mesh>
        </group>
      </group>

      {[-1,1].map(side => <group key={side}>
        <group position={[-136*U,-182*U,side*101*U]} rotation={[0,side<0?Math.PI:0,0]}><CompressorWheel position={[0,0,0]} /></group>
        <mesh position={[-136*U,-127*U,side*80*U]} rotation={[0,0,0.12]}><boxGeometry args={[35*U,12*U,33*U]} />{blue}</mesh>
        <mesh position={[-136*U,-175*U,side*83*U]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[7*U,7*U,40*U,24]} />{chrome}</mesh>
      </group>)}
      <group position={[143*U,-187*U,0]}>
        <mesh rotation={[0,0,0.2]} castShadow><boxGeometry args={[30*U,90*U,8*U]} />{blue}</mesh>
        <mesh position={[9*U,-39*U,-9*U]}><boxGeometry args={[31*U,8*U,28*U]} />{blue}</mesh>
        <mesh position={[9*U,-44*U,-9*U]} castShadow><cylinderGeometry args={[16*U,17*U,12*U,40]} /><meshStandardMaterial color="#171a1c" roughness={0.8} /></mesh>
      </group>
      <group position={[54*U,-153*U,0]}>
        <mesh><cylinderGeometry args={[7*U,7*U,8*U,24]} />{blue}</mesh>
        <mesh position={[0,-7*U,0]}><cylinderGeometry args={[5*U,5*U,9*U,6]} />{brass}</mesh>
      </group>
      </group>
    </group>
  )
}
