import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import {
  JUNCTION_WAGO_SIZE_MM,
  type JunctionLidSticker,
  type WagoConnectorType,
} from './junctionWagoModel'

const U = PANEL_UNITS_PER_MM

/* ═══════════════════════════════════════════════════════════════════════════
   TEXTURAS DE SERIGRAFIA & ADESIVOS (OBO BETTERMANN + WAGO 221)
   ═══════════════════════════════════════════════════════════════════════════ */

function drawStickerOnCanvas(
  ctx: CanvasRenderingContext2D,
  sticker: JunctionLidSticker,
  cx: number,
  cy: number,
  size: number,
) {
  if (sticker === 'none') return
  ctx.save()
  ctx.translate(cx, cy)

  if (sticker === 'warning-bolt') {
    const h = size * 0.92
    const w = size * 1.04
    ctx.beginPath()
    ctx.moveTo(0, -h * 0.52)
    ctx.lineTo(w * 0.5, h * 0.44)
    ctx.lineTo(-w * 0.5, h * 0.44)
    ctx.closePath()
    ctx.fillStyle = '#facc15'
    ctx.fill()
    ctx.lineWidth = Math.max(4, size * 0.075)
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(size * 0.04, -h * 0.24)
    ctx.lineTo(-size * 0.14, h * 0.06)
    ctx.lineTo(size * 0.03, h * 0.06)
    ctx.lineTo(-size * 0.08, h * 0.32)
    ctx.lineTo(size * 0.16, -h * 0.02)
    ctx.lineTo(-size * 0.01, -h * 0.02)
    ctx.closePath()
    ctx.fillStyle = '#111827'
    ctx.fill()
  } else {
    const cfg: Record<Exclude<JunctionLidSticker, 'none' | 'warning-bolt'>, { bg: string; fg: string; border: string; top: string; sub: string }> = {
      '230v': { bg: '#facc15', fg: '#111827', border: '#111827', top: '230V ~', sub: 'PERIGO ELÉTRICO' },
      '400v': { bg: '#dc2626', fg: '#ffffff', border: '#7f1d1d', top: '400V 3~', sub: 'ALTA TENSÃO' },
      '24v': { bg: '#1d4ed8', fg: '#ffffff', border: '#1e3a8a', top: '24V DC', sub: 'COMANDO / PLC' },
      command: { bg: '#0f172a', fg: '#f8fafc', border: '#38bdf8', top: 'COMANDO', sub: 'DERIVAÇÃO AUX' },
      hydraulics: { bg: '#0284c7', fg: '#ffffff', border: '#0c4a6e', top: 'HIDRÁULICA', sub: 'BÓIA / BOMBA' },
    }
    const c = cfg[sticker]
    const rw = size * 1.48
    const rh = size * 0.66
    ctx.fillStyle = c.bg
    ctx.strokeStyle = c.border
    ctx.lineWidth = Math.max(3, size * 0.045)
    ctx.beginPath()
    ctx.roundRect(-rw / 2, -rh / 2, rw, rh, size * 0.1)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = c.fg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `900 ${Math.round(size * 0.28)}px Arial, sans-serif`
    ctx.fillText(c.top, 0, -rh * 0.12)
    ctx.font = `700 ${Math.round(size * 0.12)}px Arial, sans-serif`
    ctx.fillText(c.sub, 0, rh * 0.24)
  }

  ctx.restore()
}

function makeOboLidTexture(
  variant: 't60' | 'a6' | 't25',
  sticker: JunctionLidSticker,
  customLabel: string,
  refTag: string,
): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = variant === 'a6' ? 640 : 512
  c.height = variant === 'a6' ? 360 : 512
  const ctx = c.getContext('2d')!

  // Fundo RAL 7035 ligeiramente texturizado (polipropileno OBO real)
  const g = ctx.createLinearGradient(0, 0, c.width, c.height)
  g.addColorStop(0, '#dcdfe2')
  g.addColorStop(0.5, '#d1d5d9')
  g.addColorStop(1, '#c4c9ce')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, c.width, c.height)

  // Moldagem em baixo-relevo (embossed light grey)
  const embossText = (text: string, x: number, y: number, font: string, align: CanvasTextAlign = 'center') => {
    ctx.font = font
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255,255,255,0.62)'
    ctx.fillText(text, x - 1.5, y - 1.5)
    ctx.fillStyle = 'rgba(100,110,120,0.68)'
    ctx.fillText(text, x + 1.2, y + 1.2)
    ctx.fillStyle = '#aeb5bc'
    ctx.fillText(text, x, y)
  }

  if (variant === 't60') {
    // Rebaixo da borda + cantos 0/I dos parafusos 1/4 volta (fiel a image-36.png)
    ctx.strokeStyle = 'rgba(120,128,136,0.35)'
    ctx.lineWidth = 4
    ctx.strokeRect(24, 24, c.width - 48, c.height - 48)
    const corners: Array<[number, number]> = [[68, 68], [c.width - 68, 68], [68, c.height - 68], [c.width - 68, c.height - 68]]
    for (const [cx, cy] of corners) {
      embossText('0', cx + 32, cy - 18, '700 18px Arial')
      embossText('I', cx - 32, cy + 18, '700 18px Arial')
    }
    embossText('OBO', c.width / 2, 118, '900 44px Arial')
    embossText('T60', c.width / 2, 166, '800 32px Arial')
    embossText('VDE   IP66   500V   2,5□', c.width / 2, 412, '700 20px Arial')

    if (sticker !== 'none') {
      drawStickerOnCanvas(ctx, sticker, c.width / 2, 276, 132)
    }
  } else if (variant === 'a6') {
    // Fiel a image-37.png: 400V / A6 / 2.5□ / OBO / IP55 / VDE
    ctx.strokeStyle = 'rgba(120,128,136,0.38)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.roundRect(18, 18, c.width - 36, c.height - 36, 26)
    ctx.stroke()

    embossText('400V', 142, 128, '800 38px Arial')
    embossText('A6', 142, 180, '900 46px Arial')
    embossText('2.5□', 142, 232, '700 30px Arial')

    embossText('OBO', c.width - 148, 128, '900 46px Arial')
    embossText('IP55', c.width - 148, 180, '800 32px Arial')
    embossText('VDE', c.width - 148, 228, '800 28px Arial')

    if (sticker !== 'none') {
      drawStickerOnCanvas(ctx, sticker, c.width / 2, 178, 110)
    }
  } else {
    // T25 redonda (fiel a image-38.png)
    ctx.strokeStyle = 'rgba(120,128,136,0.34)'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(c.width / 2, c.height / 2, 222, 0, Math.PI * 2)
    ctx.stroke()

    embossText('OBO', c.width / 2, 142, '900 48px Arial')
    embossText('T25', c.width / 2, 196, '800 34px Arial')
    embossText('IP55 · VDE · 500V', c.width / 2, 376, '700 20px Arial')

    if (sticker !== 'none') {
      drawStickerOnCanvas(ctx, sticker, c.width / 2, 272, 124)
    }
  }

  // Etiqueta adesiva personalizada (Dymo / fita gravada) se o utilizador escreveu texto
  const label = customLabel.trim()
  if (label) {
    const lw = Math.min(c.width * 0.72, Math.max(180, label.length * 18 + 44))
    const lh = 46
    const lx = (c.width - lw) / 2
    const ly = variant === 'a6' ? c.height - 76 : c.height - 102
    ctx.fillStyle = '#f8fafc'
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(lx, ly, lw, lh, 6)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#0f172a'
    ctx.font = '800 22px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label.slice(0, 22), c.width / 2, ly + lh / 2 + 1)
  } else if (refTag) {
    // Discreta referência gravada no canto inferior
    ctx.fillStyle = 'rgba(71,85,105,0.52)'
    ctx.font = '700 16px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(refTag, c.width / 2, variant === 'a6' ? c.height - 34 : c.height - 46)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function makeWagoSidePrintTexture(modelCode: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, c.width, c.height)

  // Serigrafia técnica gravada no policarbonato transparente (fiel a image-39..42.png)
  ctx.fillStyle = 'rgba(226, 232, 240, 0.90)'
  ctx.font = '800 26px Arial, sans-serif'
  ctx.fillText('WAGO  ' + modelCode, 22, 46)
  ctx.font = '700 21px Arial, sans-serif'
  ctx.fillText('450V · 32A · 0,2-4□ · JET · ENEC 05', 22, 86)
  ctx.fillText('UL 600V · AWG 24-12 · Cu 1,6/2,0', 22, 120)

  // Seta de decape 11 mm característica da lateral da WAGO 221
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.92)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(26, 178)
  ctx.lineTo(156, 178)
  ctx.moveTo(26, 166)
  ctx.lineTo(26, 190)
  ctx.moveTo(156, 166)
  ctx.lineTo(156, 190)
  ctx.stroke()
  ctx.font = '800 24px Arial, sans-serif'
  ctx.fillText('11 mm', 174, 186)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function makeWagoLeverTopTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const ctx = c.getContext('2d')!

  ctx.fillStyle = '#f25610'
  ctx.fillRect(0, 0, c.width, c.height)

  // Frisos antiderrapantes na ponta da alavanca
  ctx.fillStyle = 'rgba(130, 32, 0, 0.34)'
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(14, 18 + i * 14, c.width - 28, 6)
  }

  // Serigrafia WAGO 221 na alavanca laranja (fiel a image-39..42.png)
  ctx.fillStyle = 'rgba(72, 18, 0, 0.78)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '900 28px Arial, sans-serif'
  ctx.fillText('WAGO', c.width / 2, 146)
  ctx.font = '900 32px Arial, sans-serif'
  ctx.fillText('221', c.width / 2, 192)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUBCOMPONENTES REUTILIZÁVEIS: BUCIM PG/M20 + MEMBRANA OBO ESCALONADA
   ═══════════════════════════════════════════════════════════════════════════ */

export function CableGlandPG({
  position,
  rotation,
  scale = 1,
}: {
  position: [number, number, number]
  rotation: [number, number, number]
  scale?: number
}) {
  // Escala sempre uniforme para evitar deformidade (ovais) quando o parent tem scale não-uniforme.
  const s = typeof scale === 'number' ? scale : 1
  return (
    <group position={position} rotation={rotation} scale={[s, s, s]}>
      {/* Anel de vedação / junta preta (EPDM) */}
      <mesh position={[0, 0.022, 0]}>
        <cylinderGeometry args={[0.128, 0.128, 0.036, 20]} />
        <meshStandardMaterial color="#1a1f26" roughness={0.88} metalness={0.02} />
      </mesh>
      {/* Corpo sextavado de latão (base PG) */}
      <mesh position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.138, 0.138, 0.095, 6]} />
        <meshStandardMaterial color="#b8860b" roughness={0.32} metalness={0.72} />
      </mesh>
      {/* Rosca / corpo cilíndrico intermédio */}
      <mesh position={[0, 0.175, 0]}>
        <cylinderGeometry args={[0.108, 0.108, 0.085, 20]} />
        <meshStandardMaterial color="#c9a227" roughness={0.36} metalness={0.68} />
      </mesh>
      {/* Porca de aperto sextavada (latão) */}
      <mesh position={[0, 0.26, 0]} castShadow>
        <cylinderGeometry args={[0.128, 0.136, 0.1, 6]} />
        <meshStandardMaterial color="#d4af37" roughness={0.28} metalness={0.75} />
      </mesh>
      {/* Cúpula / domo de aperto com inserção de borracha */}
      <mesh position={[0, 0.335, 0]}>
        <cylinderGeometry args={[0.09, 0.118, 0.055, 18]} />
        <meshStandardMaterial color="#c9a227" roughness={0.34} metalness={0.7} />
      </mesh>
      {/* Entrada do cabo (borracha preta) */}
      <mesh position={[0, 0.372, 0]}>
        <cylinderGeometry args={[0.058, 0.068, 0.038, 16]} />
        <meshStandardMaterial color="#111827" roughness={0.85} metalness={0.05} />
      </mesh>
    </group>
  )
}

export function OboSteppedMembrane({
  position,
  rotation,
  scale = 1,
}: {
  position: [number, number, number]
  rotation: [number, number, number]
  scale?: number
}) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh position={[0, 0.035, 0]} castShadow>
        <cylinderGeometry args={[0.132, 0.148, 0.07, 16]} />
        <meshStandardMaterial color="#bcc2c8" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.088, 0]}>
        <cylinderGeometry args={[0.095, 0.112, 0.05, 16]} />
        <meshStandardMaterial color="#b2b9c0" roughness={0.66} />
      </mesh>
      <mesh position={[0, 0.125, 0]}>
        <cylinderGeometry args={[0.058, 0.074, 0.035, 16]} />
        <meshStandardMaterial color="#a6aeb6" roughness={0.7} />
      </mesh>
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. CAIXA DE DERIVAÇÃO OBO BETTERMANN (T60 / A6 / T25)
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cabo que entra por um bucim superior da caixa e fica emendado em WAGO 221-2411 (um por condutor). */
export interface OboSpliceCable { key: string; glandX: number; conductors: Array<{ color: string; label?: string }> }

export function OboJunctionBox3D({
  component,
  onToggleCover,
  spliceCables = [],
}: {
  component: ElectricalComponent
  onToggleCover?: () => void
  spliceCables?: OboSpliceCable[]
}) {
  const { invalidate } = useThree()
  const lidRef = useRef<THREE.Group>(null)
  const lidProgressRef = useRef<number>(component.state.coverOpen === true ? 1 : 0)

  const variant: 't60' | 'a6' | 't25' =
    component.type === 'junctionBoxOboA6'
      ? 'a6'
      : component.type === 'junctionBoxOboT25'
        ? 't25'
        : 't60'

  const sz = JUNCTION_WAGO_SIZE_MM[component.type as keyof typeof JUNCTION_WAGO_SIZE_MM] ?? JUNCTION_WAGO_SIZE_MM.junctionBoxOboT60
  const W = sz.x * U
  const H = sz.y * U
  const D = sz.z * U
  const wallT = 0.11

  const coverOpen = component.state.coverOpen === true
  const glandTop = component.state.glandTop !== false
  const glandBottom = component.state.glandBottom !== false
  const glandLeft = component.state.glandLeft === true
  const glandRight = component.state.glandRight === true
  const sticker = (typeof component.state.lidSticker === 'string'
    ? component.state.lidSticker
    : 'none') as JunctionLidSticker
  const customLabel = typeof component.state.lidLabelText === 'string' ? component.state.lidLabelText : ''

  const lidTexture = useMemo(
    () => makeOboLidTexture(variant, sticker, customLabel, component.ref),
    [variant, sticker, customLabel, component.ref],
  )
  useEffect(() => () => lidTexture.dispose(), [lidTexture])

  useFrame((_, delta) => {
    const target = coverOpen ? 1 : 0
    if (Math.abs(lidProgressRef.current - target) > 0.004) {
      lidProgressRef.current += (target - lidProgressRef.current) * Math.min(1, delta * 9)
      if (Math.abs(lidProgressRef.current - target) <= 0.004) lidProgressRef.current = target
      invalidate()
    }
    if (lidRef.current) {
      const p = lidProgressRef.current
      // Quando aberta, a tampa recua ligeiramente e desaparece (removida para trabalhar nos WAGOs!)
      lidRef.current.position.z = D * 0.45 + p * 0.55
      lidRef.current.position.y = p * 0.25
      lidRef.current.visible = p < 0.85
    }
  })

  // Emendas: colunas sob os bucins, WAGO deitados com as alavancas para a frente, saída pelo bucim inferior.
  const splices = useMemo<WagoSpliceCable[]>(() => {
    if (!spliceCables.length) return []
    const z0 = -D * 0.06
    const innerHalfW = W / 2 - wallT - 0.03
    // Abaixo das torres de parafuso dos cantos (T60) e da entrada dos bucins.
    const originY = H / 2 - wallT - (variant === 't60' ? 0.26 : 0.14), bottomY = -H / 2 + wallT + 0.12
    const n = spliceCables.length
    return spliceCables.map((cable, k) => {
      const colX = n === 1 ? cable.glandX * 0.85 : (k - (n - 1) / 2) * W * 0.44
      const exitX = variant === 't60' ? (colX < 0 ? -W * 0.24 : W * 0.24) : 0
      return {
        key: cable.key,
        sheathEntry: [cable.glandX, H / 2 + 0.06, z0] as [number, number, number],
        sheathEnd: [cable.glandX, H / 2 - wallT - 0.06, z0] as [number, number, number],
        origin: [Math.max(-innerHalfW, Math.min(innerHalfW, colX)), originY, z0] as [number, number, number],
        conductors: cable.conductors,
        exitSheathStart: [exitX, Math.min(bottomY, -H / 2 + wallT + 0.08), z0] as [number, number, number],
        exitSheathEnd: [exitX, -H / 2 - 0.62, z0] as [number, number, number],
      }
    })
  }, [spliceCables, W, H, D, variant])
  // Escala e passo dos WAGO ajustados ao interior (a T60 cabe à escala 0,6; a A6, mais baixa, encolhe).
  const spliceRows = Math.max(1, ...spliceCables.map((cable) => cable.conductors.length))
  const spliceSpanY = H - 2 * wallT - 0.26
  const spliceColHalf = W / 2 - wallT - 0.03 - Math.max(0, ...splices.map((item) => Math.abs(item.origin[0])))
  const spliceScale = Math.max(0.3, Math.min(0.6, spliceColHalf / 0.33, spliceRows > 1 ? spliceSpanY / ((spliceRows - 1) * 0.223) : 0.6))
  const splicePitch = Math.min(0.15, spliceScale * 0.223)

  const bodyColor = '#c5cdd6'
  const wallOuterRimColor = '#b4bec9'
  const cavityColor = '#8f99a6'
  const gasketColor = '#334155'

  return (
    <group>
      {/* ─── CORPO DA CAIXA COM CAVIDADE INTERIOR REAL ─── */}
      {variant === 't25' ? (
        <group>
          {/* Base octogonal/redonda T25 (fiel a image-38.png) */}
          <mesh position={[0, 0, -D * 0.42]} rotation={[Math.PI / 2, 0, Math.PI / 8]} castShadow receiveShadow>
            <cylinderGeometry args={[W * 0.50, W * 0.48, D * 0.16, 8]} />
            <meshStandardMaterial color={bodyColor} roughness={0.44} metalness={0.04} />
          </mesh>
          {/* Aro externo oco (8 segmentos para cavidade visível) */}
          {Array.from({ length: 8 }).map((_, i) => {
            const ang = (i * Math.PI) / 4
            const r = W * 0.455
            const segW = W * 0.38
            return (
              <mesh
                key={i}
                position={[Math.cos(ang) * r, Math.sin(ang) * r, -D * 0.02]}
                rotation={[0, 0, ang + Math.PI / 2]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[segW, wallT, D * 0.78]} />
                <meshStandardMaterial color={bodyColor} roughness={0.44} metalness={0.04} />
              </mesh>
            )
          })}
          {/* Fundo interno da cavidade */}
          <mesh position={[0, 0, -D * 0.32]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
            <cylinderGeometry args={[W * 0.42, W * 0.42, 0.04, 16]} />
            <meshStandardMaterial color={cavityColor} roughness={0.62} />
          </mesh>
          {/* 4 entradas radiais (bucins ou membranas OBO) */}
          {glandTop ? (
            <CableGlandPG position={[0, H * 0.48, -D * 0.04]} rotation={[0, 0, 0]} scale={0.92} />
          ) : (
            <OboSteppedMembrane position={[0, H * 0.47, -D * 0.04]} rotation={[0, 0, 0]} scale={0.92} />
          )}
          {glandBottom ? (
            <CableGlandPG position={[0, -H * 0.48, -D * 0.04]} rotation={[0, 0, Math.PI]} scale={0.92} />
          ) : (
            <OboSteppedMembrane position={[0, -H * 0.47, -D * 0.04]} rotation={[0, 0, Math.PI]} scale={0.92} />
          )}
          {glandLeft ? (
            <CableGlandPG position={[-W * 0.48, 0, -D * 0.04]} rotation={[0, 0, Math.PI / 2]} scale={0.92} />
          ) : (
            <OboSteppedMembrane position={[-W * 0.47, 0, -D * 0.04]} rotation={[0, 0, Math.PI / 2]} scale={0.92} />
          )}
          {glandRight ? (
            <CableGlandPG position={[W * 0.48, 0, -D * 0.04]} rotation={[0, 0, -Math.PI / 2]} scale={0.92} />
          ) : (
            <OboSteppedMembrane position={[W * 0.47, 0, -D * 0.04]} rotation={[0, 0, -Math.PI / 2]} scale={0.92} />
          )}
        </group>
      ) : (
        <group>
          {/* Placa traseira (fundo da caixa) com nervuras e orifícios de fixação */}
          <mesh position={[0, 0, -D * 0.43]} castShadow receiveShadow>
            <boxGeometry args={[W, H, D * 0.14]} />
            <meshStandardMaterial color={bodyColor} roughness={0.52} metalness={0.04} />
          </mesh>
          {/* Fundo interno da cavidade em cinza-ardósia mate (contraste real com WAGOs transparentes) */}
          <mesh position={[0, 0, -D * 0.355]} receiveShadow>
            <boxGeometry args={[W - wallT * 2, H - wallT * 2, 0.035]} />
            <meshStandardMaterial color={cavityColor} roughness={0.68} metalness={0.04} />
          </mesh>
          {/* Nervuras interiores de rigidez e 2 orifícios de fixação à parede */}
          {[-H * 0.24, H * 0.24].map((ry, i) => (
            <mesh key={i} position={[0, ry, -D * 0.32]} receiveShadow>
              <boxGeometry args={[W - wallT * 2.5, 0.035, 0.04]} />
              <meshStandardMaterial color="#9aa5b2" roughness={0.62} />
            </mesh>
          ))}
          {[-W * 0.28, W * 0.28].map((hx, i) => (
            <mesh key={i} position={[hx, 0, -D * 0.332]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.055, 0.055, 0.025, 14]} />
              <meshStandardMaterial color="#475569" roughness={0.65} metalness={0.25} />
            </mesh>
          ))}
          {/* 4 paredes laterais com acabamento ABS industrial RAL 7035 */}
          <mesh position={[0, H / 2 - wallT / 2, -D * 0.02]} castShadow receiveShadow>
            <boxGeometry args={[W, wallT, D * 0.78]} />
            <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.04} />
          </mesh>
          <mesh position={[0, -H / 2 + wallT / 2, -D * 0.02]} castShadow receiveShadow>
            <boxGeometry args={[W, wallT, D * 0.78]} />
            <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.04} />
          </mesh>
          <mesh position={[-W / 2 + wallT / 2, 0, -D * 0.02]} castShadow receiveShadow>
            <boxGeometry args={[wallT, H - wallT * 2, D * 0.78]} />
            <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.04} />
          </mesh>
          <mesh position={[W / 2 - wallT / 2, 0, -D * 0.02]} castShadow receiveShadow>
            <boxGeometry args={[wallT, H - wallT * 2, D * 0.78]} />
            <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.04} />
          </mesh>
          {/* Junta perimetral EPDM de vedação IP66 na borda frontal da caixa */}
          <mesh position={[0, H / 2 - wallT * 0.5, D * 0.375]}>
            <boxGeometry args={[W * 0.96, 0.028, 0.022]} />
            <meshStandardMaterial color={gasketColor} roughness={0.82} />
          </mesh>
          <mesh position={[0, -H / 2 + wallT * 0.5, D * 0.375]}>
            <boxGeometry args={[W * 0.96, 0.028, 0.022]} />
            <meshStandardMaterial color={gasketColor} roughness={0.82} />
          </mesh>
          <mesh position={[-W / 2 + wallT * 0.5, 0, D * 0.375]}>
            <boxGeometry args={[0.028, H * 0.92, 0.022]} />
            <meshStandardMaterial color={gasketColor} roughness={0.82} />
          </mesh>
          <mesh position={[W / 2 - wallT * 0.5, 0, D * 0.375]}>
            <boxGeometry args={[0.028, H * 0.92, 0.022]} />
            <meshStandardMaterial color={gasketColor} roughness={0.82} />
          </mesh>

          {/* 4 torres de parafuso internas nos cantos com casquilho metálico (T60) ou patilha lateral (A6) */}
          {variant === 't60' ? (
            [
              [-W * 0.405, H * 0.405],
              [W * 0.405, H * 0.405],
              [-W * 0.405, -H * 0.405],
              [W * 0.405, -H * 0.405],
            ].map(([cx, cy], idx) => (
              <group key={idx} position={[cx, cy, -D * 0.03]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.105, 0.115, D * 0.74, 16]} />
                  <meshStandardMaterial color={wallOuterRimColor} roughness={0.5} />
                </mesh>
                <mesh position={[0, 0, D * 0.365]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.048, 0.048, 0.04, 14]} />
                  <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.35} />
                </mesh>
              </group>
            ))
          ) : (
            /* Patilha lateral característica da OBO A6 (image-37.png) */
            <group position={[W / 2 + 0.12, 0, -D * 0.36]}>
              <mesh castShadow>
                <boxGeometry args={[0.26, 0.34, 0.12]} />
                <meshStandardMaterial color={bodyColor} roughness={0.46} />
              </mesh>
              <mesh position={[0.04, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.065, 0.065, 0.14, 14]} />
                <meshStandardMaterial color="#334155" roughness={0.7} />
              </mesh>
            </group>
          )}

          {/* Entradas superiores (membranas OBO + bucins PG/M20) */}
          {variant === 't60' ? (
            <>
              {glandTop ? (
                <>
                  <CableGlandPG position={[-W * 0.24, H / 2, -D * 0.05]} rotation={[0, 0, 0]} />
                  <CableGlandPG position={[W * 0.24, H / 2, -D * 0.05]} rotation={[0, 0, 0]} />
                </>
              ) : (
                <>
                  <OboSteppedMembrane position={[-W * 0.24, H / 2, -D * 0.05]} rotation={[0, 0, 0]} />
                  <OboSteppedMembrane position={[W * 0.24, H / 2, -D * 0.05]} rotation={[0, 0, 0]} />
                </>
              )}
              {glandBottom ? (
                <>
                  <CableGlandPG position={[-W * 0.24, -H / 2, -D * 0.05]} rotation={[0, 0, Math.PI]} />
                  <CableGlandPG position={[W * 0.24, -H / 2, -D * 0.05]} rotation={[0, 0, Math.PI]} />
                </>
              ) : (
                <>
                  <OboSteppedMembrane position={[-W * 0.24, -H / 2, -D * 0.05]} rotation={[0, 0, Math.PI]} />
                  <OboSteppedMembrane position={[W * 0.24, -H / 2, -D * 0.05]} rotation={[0, 0, Math.PI]} />
                </>
              )}
              {glandLeft ? (
                <CableGlandPG position={[-W / 2, 0, -D * 0.05]} rotation={[0, 0, Math.PI / 2]} />
              ) : (
                <>
                  <OboSteppedMembrane position={[-W / 2, H * 0.22, -D * 0.05]} rotation={[0, 0, Math.PI / 2]} />
                  <OboSteppedMembrane position={[-W / 2, -H * 0.22, -D * 0.05]} rotation={[0, 0, Math.PI / 2]} />
                </>
              )}
              {glandRight ? (
                <CableGlandPG position={[W / 2, 0, -D * 0.05]} rotation={[0, 0, -Math.PI / 2]} />
              ) : (
                <OboSteppedMembrane position={[W / 2, 0, -D * 0.05]} rotation={[0, 0, -Math.PI / 2]} />
              )}
            </>
          ) : (
            /* A6: 3 entradas topo + base + laterais */
            <>
              {glandTop ? (
                <CableGlandPG position={[0, H / 2, -D * 0.04]} rotation={[0, 0, 0]} scale={0.86} />
              ) : (
                <>
                  <OboSteppedMembrane position={[-W * 0.28, H / 2, -D * 0.04]} rotation={[0, 0, 0]} scale={0.82} />
                  <OboSteppedMembrane position={[0, H / 2, -D * 0.04]} rotation={[0, 0, 0]} scale={0.82} />
                  <OboSteppedMembrane position={[W * 0.28, H / 2, -D * 0.04]} rotation={[0, 0, 0]} scale={0.82} />
                </>
              )}
              {glandBottom ? (
                <CableGlandPG position={[0, -H / 2, -D * 0.04]} rotation={[0, 0, Math.PI]} scale={0.86} />
              ) : (
                <>
                  <OboSteppedMembrane position={[-W * 0.25, -H / 2, -D * 0.04]} rotation={[0, 0, Math.PI]} scale={0.82} />
                  <OboSteppedMembrane position={[W * 0.25, -H / 2, -D * 0.04]} rotation={[0, 0, Math.PI]} scale={0.82} />
                </>
              )}
              {glandLeft ? (
                <CableGlandPG position={[-W / 2, 0, -D * 0.04]} rotation={[0, 0, Math.PI / 2]} scale={0.86} />
              ) : (
                <OboSteppedMembrane position={[-W / 2, 0, -D * 0.04]} rotation={[0, 0, Math.PI / 2]} scale={0.82} />
              )}
              {glandRight && (
                <CableGlandPG position={[W / 2, 0, -D * 0.04]} rotation={[0, 0, -Math.PI / 2]} scale={0.86} />
              )}
            </>
          )}

          {/* Pequeno barramento auxiliar interno (calha de suporte para WAGOs) */}
          <mesh position={[0, 0, -D * 0.30]}>
            <boxGeometry args={[W * 0.72, 0.14, 0.05]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.55} roughness={0.38} />
          </mesh>
        </group>
      )}

      {splices.length > 0 && <InlineWagoSplices3D cables={splices} scale={spliceScale} rowPitch={splicePitch} />}

      {/* ─── TAMPA REMOVÍVEL OBO (duplo-clique abre/fecha!) ─── */}
      <group
        ref={lidRef}
        position={[0, 0, D * 0.45]}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onToggleCover?.()
        }}
      >
        {variant === 't25' ? (
          <group>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[W * 0.515, W * 0.525, 0.15, 28]} />
              <meshStandardMaterial color="#d8dce0" roughness={0.36} metalness={0.04} />
            </mesh>
            <mesh position={[0, 0, 0.086]}>
              <circleGeometry args={[W * 0.49, 28]} />
              <meshStandardMaterial map={lidTexture} roughness={0.42} metalness={0.03} polygonOffset polygonOffsetFactor={-1} />
            </mesh>
          </group>
        ) : (
          <group>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[W * 1.03, H * 1.03, 0.15]} />
              <meshStandardMaterial color="#d8dce0" roughness={0.36} metalness={0.04} />
            </mesh>
            <mesh position={[0, 0, 0.084]}>
              <planeGeometry args={[W * 0.99, H * 0.99]} />
              <meshStandardMaterial map={lidTexture} roughness={0.4} metalness={0.03} polygonOffset polygonOffsetFactor={-1} />
            </mesh>

            {/* 4 parafusos de 1/4 de volta fenda cruzada característicos da OBO T60 (image-36.png) */}
            {variant === 't60' &&
              [
                [-W * 0.40, H * 0.40],
                [W * 0.40, H * 0.40],
                [-W * 0.40, -H * 0.40],
                [W * 0.40, -H * 0.40],
              ].map(([sx, sy], i) => (
                <group key={i} position={[sx, sy, 0.095]}>
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.105, 0.115, 0.05, 16]} />
                    <meshStandardMaterial color="#cbd0d6" roughness={0.35} />
                  </mesh>
                  <mesh position={[0, 0, 0.028]}>
                    <boxGeometry args={[0.14, 0.024, 0.015]} />
                    <meshStandardMaterial color="#64748b" roughness={0.6} />
                  </mesh>
                </group>
              ))}
          </group>
        )}
      </group>
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. CONECTORES DE ALAVANCA WAGO 221 (221-412 / 221-415 / 221-2411 / DUPLO 2×5)
   ═══════════════════════════════════════════════════════════════════════════ */

const inlineBodyGeometries = new Map<string, THREE.BufferGeometry>()
/** Corpo boleado do 221-2411 (cacheado por dimensões: há um por condutor emendado). */
function wagoInlineBodyGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = [w, h, d].map((v) => v.toFixed(4)).join(':')
  let geometry = inlineBodyGeometries.get(key)
  if (!geometry) { geometry = new RoundedBoxGeometry(w, h, d, 3, Math.min(h, d) * 0.22); inlineBodyGeometries.set(key, geometry) }
  return geometry
}

function WagoOrangeLever({
  position,
  pivotSign = 1,
  width,
  length,
  isOpen,
  leverTex,
  onToggle,
}: {
  position: [number, number, number]
  pivotSign?: 1 | -1
  width: number
  length: number
  isOpen: boolean
  leverTex: THREE.CanvasTexture
  onToggle?: () => void
}) {
  const { invalidate } = useThree()
  const grpRef = useRef<THREE.Group>(null)
  const angleRef = useRef(isOpen ? 1 : 0)
  const bodyGeom = useMemo(
    () => new RoundedBoxGeometry(width * 0.96, 0.055, length * 0.98, 3, 0.012),
    [width, length],
  )
  useEffect(() => () => bodyGeom.dispose(), [bodyGeom])

  useFrame((_, delta) => {
    const target = isOpen ? 1 : 0
    if (Math.abs(angleRef.current - target) > 0.004) {
      angleRef.current += (target - angleRef.current) * Math.min(1, delta * 14)
      if (Math.abs(angleRef.current - target) <= 0.004) angleRef.current = target
      invalidate()
    }
    if (grpRef.current) {
      // Alavanca WAGO 221 levanta ~88°
      grpRef.current.rotation.x = -pivotSign * angleRef.current * (Math.PI * 0.49)
    }
  })

  const halfL = length * 0.5
  const tipZ = pivotSign * (length * 0.82)
  return (
    <group
      ref={grpRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation()
        onToggle?.()
      }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}
    >
      {/* Corpo principal laranja com arestas boleadas (policarbonato WAGO) */}
      <mesh position={[0, 0.032, pivotSign * halfL]} geometry={bodyGeom} castShadow>
        <meshPhysicalMaterial
          color="#ff5a12"
          roughness={0.18}
          metalness={0.03}
          clearcoat={0.95}
          clearcoatRoughness={0.1}
        />
      </mesh>
      {/* Serigrafia WAGO 221 no topo da alavanca */}
      <mesh position={[0, 0.062, pivotSign * halfL]} rotation={[-Math.PI / 2, 0, pivotSign > 0 ? 0 : Math.PI]}>
        <planeGeometry args={[width * 0.88, length * 0.86]} />
        <meshStandardMaterial map={leverTex} roughness={0.25} transparent opacity={0.95} />
      </mesh>
      {/* Frisos antiderrapantes na ponta (geometria real) */}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[0, 0.058, tipZ - pivotSign * (0.02 + i * 0.018)]}
          castShadow
        >
          <boxGeometry args={[width * 0.78, 0.012, 0.008]} />
          <meshStandardMaterial color="#d44508" roughness={0.35} />
        </mesh>
      ))}
      {/* Aba de pega na extremidade */}
      <mesh position={[0, 0.04, pivotSign * (length - 0.02)]} castShadow>
        <boxGeometry args={[width * 0.92, 0.04, 0.04]} />
        <meshPhysicalMaterial color="#e84a0a" roughness={0.2} clearcoat={0.85} clearcoatRoughness={0.12} />
      </mesh>
      {/* Pino de articulação metálico */}
      <mesh position={[0, 0.012, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.014, 0.014, width * 1.02, 12]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.22} />
      </mesh>
    </group>
  )
}

export function Wago221Connector3D({
  component,
  onToggleLever,
}: {
  component: ElectricalComponent
  onToggleLever?: (index: number) => void
}) {
  const type = component.type as WagoConnectorType
  const sz = JUNCTION_WAGO_SIZE_MM[type]
  const W = sz.x * U
  const H = sz.y * U
  const D = sz.z * U

  const modelCode =
    type === 'wago221_2'
      ? '221-412'
      : type === 'wago221_5'
        ? '221-415'
        : type === 'wago221_inline'
          ? '221-2411'
          : '221-415 2×5'

  const sideTex = useMemo(() => makeWagoSidePrintTexture(modelCode), [modelCode])
  const leverTex = useMemo(() => makeWagoLeverTopTexture(), [])
  useEffect(() => {
    return () => {
      sideTex.dispose()
      leverTex.dispose()
    }
  }, [sideTex, leverTex])

  const leverStates = Array.isArray(component.state.leversOpen)
    ? (component.state.leversOpen as boolean[])
    : []

  const isLeverOpen = (idx: number) => leverStates[idx] === true

  const mainBodyGeom = useMemo(() => {
    if (type === 'wago221_inline') return null
    const bw = W
    const bh = H * 0.72
    const bd = D * 0.94
    return new RoundedBoxGeometry(bw, bh, bd, 4, Math.min(0.018, bw * 0.06))
  }, [type, W, H, D])
  useEffect(() => () => { mainBodyGeom?.dispose() }, [mainBodyGeom])

  /* ── Variante Inline 221-2411 (image-41.png) ──
     Corpo em policarbonato transparente de arestas boleadas, duas bocas de entrada nos topos,
     barramento estanhado com duas molas CAGE CLAMP e alavancas laranja articuladas no meio
     (abrem pela ponta exterior), com abas de pega estriadas. */
  if (type === 'wago221_inline') {
    const bodyW = W * 0.97, bodyH = H * 0.8, bodyD = D * 0.9
    return (
      <group>
        {/* Base interior cinzenta onde assenta o barramento (vista através do corpo) */}
        <mesh position={[0, -bodyH * 0.36, 0]}>
          <boxGeometry args={[bodyW * 0.9, bodyH * 0.1, bodyD * 0.78]} />
          <meshStandardMaterial color="#5b6573" roughness={0.6} />
        </mesh>
        {/* Barramento de cobre estanhado de ponta a ponta */}
        <mesh position={[0, -bodyH * 0.2, 0]}>
          <boxGeometry args={[bodyW * 0.84, bodyH * 0.1, bodyD * 0.36]} />
          <meshStandardMaterial color="#c9a46a" metalness={0.9} roughness={0.22} />
        </mesh>
        {/* Molas CAGE CLAMP em aço inox, uma junto a cada boca */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * bodyW * 0.27, 0, 0]}>
            <mesh position={[0, bodyH * 0.02, 0]}>
              <boxGeometry args={[bodyW * 0.16, bodyH * 0.42, bodyD * 0.44]} />
              <meshStandardMaterial color="#d6dde4" metalness={0.95} roughness={0.14} />
            </mesh>
            <mesh position={[side * bodyW * 0.05, bodyH * 0.2, 0]} rotation={[0, 0, side * 0.5]}>
              <boxGeometry args={[bodyW * 0.12, bodyH * 0.06, bodyD * 0.44]} />
              <meshStandardMaterial color="#c5ced8" metalness={0.95} roughness={0.16} />
            </mesh>
          </group>
        ))}
        {/* Bocas de entrada dos condutores (topos) e canal interior até à mola */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * bodyW * 0.5, -bodyH * 0.08, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]} name="wago-entry-hole">
              <cylinderGeometry args={[bodyH * 0.17, bodyH * 0.2, bodyW * 0.03, 16]} />
              <meshStandardMaterial color="#0f172a" roughness={0.8} />
            </mesh>
            <mesh position={[-side * bodyW * 0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[bodyH * 0.14, bodyH * 0.14, bodyW * 0.18, 14, 1, true]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.4} transparent opacity={0.45} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
        {/* Corpo transparente cristal com arestas boleadas e reflexo de policarbonato */}
        <mesh renderOrder={3}>
          <primitive object={wagoInlineBodyGeometry(bodyW, bodyH, bodyD)} attach="geometry" />
          <meshPhysicalMaterial
            userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
            color="#dbeafe"
            transparent
            opacity={0.4}
            roughness={0.07}
            metalness={0.02}
            ior={1.58}
            clearcoat={1.0}
            clearcoatRoughness={0.05}
            depthWrite={false}
          />
        </mesh>
        {/* Serigrafia lateral (WAGO 221-2411 · 4 mm² · 450 V) */}
        <mesh position={[0, -bodyH * 0.04, bodyD * 0.5 + 0.002]}>
          <planeGeometry args={[bodyW * 0.7, bodyH * 0.5]} />
          <meshBasicMaterial userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }} map={sideTex} transparent opacity={0.9} depthWrite={false} />
        </mesh>
        {/* Alavancas laranja: articuladas junto ao meio, pega na ponta exterior */}
        {[-1, 1].map((side, idx) => (
          <group key={side} position={[side * bodyW * 0.04, bodyH * 0.5, 0]} rotation={[0, side < 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
            <WagoOrangeLever
              position={[0, 0, 0]}
              pivotSign={1}
              width={bodyD * 0.78}
              length={bodyW * 0.44}
              isOpen={isLeverOpen(idx)}
              leverTex={leverTex}
              onToggle={() => onToggleLever?.(idx)}
            />
          </group>
        ))}
      </group>
    )
  }

  /* ── Variantes 221-412 / 221-415 / Duplo 2×5 — policarbonato cristal ultra-realista ── */
  const cols = type === 'wago221_2' ? 2 : 5
  const isDouble = type === 'wago221_double'
  const pitch = (W * 0.86) / cols
  const leverW = pitch * 0.78
  const leverLen = D * 0.58
  const bodyH = H * 0.72
  const bodyD = D * 0.94

  const renderTier = (tierY: number, offsetIdx: number, leverDir: 1 | -1) => (
    <group position={[0, tierY, 0]}>
      {/* Barramento de cobre estanhado (visível através do PC) */}
      <mesh position={[0, -0.035, -D * 0.12]} castShadow>
        <boxGeometry args={[W * 0.88, 0.05, D * 0.42]} />
        <meshStandardMaterial color="#c9893a" metalness={0.92} roughness={0.16} />
      </mesh>
      {/* Base isolante cinza */}
      <mesh position={[0, -0.078, -D * 0.06]}>
        <boxGeometry args={[W * 0.9, 0.022, D * 0.7]} />
        <meshStandardMaterial color="#3b4554" roughness={0.5} />
      </mesh>
      {Array.from({ length: cols }).map((_, idx) => {
        const lx = -((cols - 1) / 2) * pitch + idx * pitch
        const open = isLeverOpen(offsetIdx + idx)
        return (
          <group key={idx} position={[lx, 0, 0]}>
            {/* Bloco CAGE CLAMP — aço inox com forma em C */}
            <mesh position={[0, 0.008, -D * 0.1]} castShadow>
              <boxGeometry args={[leverW * 0.68, 0.1, D * 0.32]} />
              <meshStandardMaterial color="#c5ced8" metalness={0.9} roughness={0.18} />
            </mesh>
            <mesh position={[0, 0.05, -D * 0.02]} rotation={[0.35, 0, 0]}>
              <boxGeometry args={[leverW * 0.55, 0.018, D * 0.2]} />
              <meshStandardMaterial color="#aeb8c4" metalness={0.92} roughness={0.15} />
            </mesh>
            {/* Canal de entrada (cor cobre quando fechado) */}
            <mesh position={[0, -0.02, D * 0.2]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[leverW * 0.18, leverW * 0.2, D * 0.32, 14]} />
              <meshStandardMaterial color={open ? '#64748b' : '#b87333'} metalness={0.8} roughness={0.25} />
            </mesh>
            {/* Boca de inserção frontal (oval escura) */}
            <mesh position={[0, -0.018, bodyD * 0.48]}>
              <boxGeometry args={[leverW * 0.5, 0.078, 0.02]} />
              <meshStandardMaterial color="#0f172a" roughness={0.75} />
            </mesh>
            {/* Anel da boca */}
            <mesh position={[0, -0.018, bodyD * 0.465]}>
              <boxGeometry args={[leverW * 0.58, 0.09, 0.01]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.4} roughness={0.35} />
            </mesh>
            {/* Orifício de teste traseiro */}
            <mesh position={[0, -0.018, -bodyD * 0.48]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.022, 0.022, 0.02, 12]} />
              <meshStandardMaterial color="#0f172a" roughness={0.7} />
            </mesh>
            {idx < cols - 1 && (
              <mesh position={[pitch * 0.5, 0.01, 0]} renderOrder={2}>
                <boxGeometry args={[0.014, bodyH * 0.85, bodyD * 0.88]} />
                <meshPhysicalMaterial
                  userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
                  color="#bfdbfe"
                  transparent
                  opacity={0.35}
                  roughness={0.08}
                  clearcoat={0.9}
                  depthWrite={false}
                />
              </mesh>
            )}
            <WagoOrangeLever
              position={[0, leverDir > 0 ? 0.11 : -0.11, -D * 0.22]}
              pivotSign={1}
              width={leverW}
              length={leverLen}
              isOpen={open}
              leverTex={leverTex}
              onToggle={() => onToggleLever?.(offsetIdx + idx)}
            />
          </group>
        )
      })}
    </group>
  )

  return (
    <group>
      {/* Invólucro PC transparente com arestas boleadas — mais visível e cristalino */}
      <mesh geometry={mainBodyGeom ?? undefined} renderOrder={3} castShadow>
        <meshPhysicalMaterial
          userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
          color="#dbeafe"
          transparent
          opacity={0.42}
          roughness={0.06}
          metalness={0.02}
          ior={1.58}
          clearcoat={1.0}
          clearcoatRoughness={0.05}
          depthWrite={false}
        />
      </mesh>
      {/* Base opaca ligeira (sombra do interior) */}
      <mesh position={[0, -bodyH * 0.48, 0]}>
        <boxGeometry args={[W * 0.98, 0.012, bodyD * 0.96]} />
        <meshStandardMaterial color="#64748b" roughness={0.45} transparent opacity={0.55} />
      </mesh>
      {/* Face frontal semi-opaca (janela de entradas) */}
      <mesh position={[0, -0.01, bodyD * 0.5]} renderOrder={2}>
        <boxGeometry args={[W * 0.98, bodyH * 0.9, 0.012]} />
        <meshPhysicalMaterial
          userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
          color="#e0f2fe"
          transparent
          opacity={0.28}
          roughness={0.08}
          clearcoat={0.9}
          depthWrite={false}
        />
      </mesh>
      {/* Serigrafia lateral */}
      <mesh position={[W / 2 + 0.004, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[bodyD * 0.9, bodyH * 0.7]} />
        <meshBasicMaterial userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }} map={sideTex} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <mesh position={[-W / 2 - 0.004, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[bodyD * 0.9, bodyH * 0.7]} />
        <meshBasicMaterial userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }} map={sideTex} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      {isDouble ? (
        <>
          {renderTier(H * 0.18, 0, 1)}
          <group rotation={[Math.PI, 0, 0]}>
            {renderTier(H * 0.18, 5, 1)}
          </group>
        </>
      ) : (
        renderTier(0, 0, 1)
      )}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. EMENDAS COM WAGO 221-2411 (1-1): UM CONDUTOR POR CONECTOR
   Cada condutor do cabo que entra fica no seu próprio WAGO inline (um
   condutor de cada lado). Nunca vários condutores de sinais diferentes no
   mesmo 221-415, que os poria em curto-circuito.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface WagoSpliceCable {
  key: string
  /** Ponto onde a bainha do cabo entra (bucim), no referencial do pai. */
  sheathEntry: [number, number, number]
  /** Fim da bainha dentro da caixa: daqui saem os condutores. */
  sheathEnd: [number, number, number]
  /** Centro do primeiro WAGO (os seguintes descem `rowPitch`). */
  origin: [number, number, number]
  /** Cores dos condutores, pela ordem dos WAGO.
   *  `connectedRight`: se definido como `false` (sem fio ligado do lado direito), a alavanca direita
   *  fica aberta à espera da ligação vinda do quadro; quando `true`, fecha e mostra o cobre descarnado. */
  conductors: Array<{ color: string; label?: string; connectedRight?: boolean }>
  /** Início da bainha do cabo de saída (onde convergem os condutores que saem). */
  exitSheathStart?: [number, number, number]
  /** Fim da bainha de saída (fora do bucim). */
  exitSheathEnd?: [number, number, number]
  sheathColor?: string
}

const SPLICE_WAGO: ElectricalComponent = {
  id: 'splice-wago-221-2411', type: 'wago221_inline' as ElectricalComponent['type'], ref: '', label: '',
  x: 0, y: 0, w: 0, h: 0, terminals: [], state: { leversOpen: [false, false] },
} as unknown as ElectricalComponent

const SPLICE_WAGO_RIGHT_OPEN: ElectricalComponent = {
  id: 'splice-wago-221-2411-open', type: 'wago221_inline' as ElectricalComponent['type'], ref: '', label: '',
  x: 0, y: 0, w: 0, h: 0, terminals: [], state: { leversOpen: [false, true] },
} as unknown as ElectricalComponent

function tube(points: THREE.Vector3[], radius: number): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(8, points.length * 10), radius, 8, false)
}

/** Bainhas, condutores e WAGO 221-2411 de cada cabo emendado (um WAGO por condutor). */
export function InlineWagoSplices3D({ cables, scale = 0.6, rowPitch = 0.15 }: { cables: WagoSpliceCable[]; scale?: number; rowPitch?: number }) {
  const halfLen = (JUNCTION_WAGO_SIZE_MM.wago221_inline.x * U * scale) / 2
  const geometry = useMemo(() => cables.map((cable) => {
    const v = (p: [number, number, number]) => new THREE.Vector3(...p)
    const entry = v(cable.sheathEntry), end = v(cable.sheathEnd), origin = v(cable.origin)
    const sheath = tube([entry, entry.clone().lerp(end, 0.5), end], 4.2 * U)
    const exitStart = cable.exitSheathStart ? v(cable.exitSheathStart) : null
    const exitEnd = cable.exitSheathEnd ? v(cable.exitSheathEnd) : null
    const exitSheath = exitStart && exitEnd ? tube([exitStart, exitStart.clone().lerp(exitEnd, 0.5), exitEnd], 4.2 * U) : null
    const n = cable.conductors.length
    const wires = cable.conductors.map((_, i) => {
      const center = origin.clone().add(new THREE.Vector3(0, -i * rowPitch, 0))
      const spread = (i - (n - 1) / 2) * 3.2 * U
      const inPort = center.clone().add(new THREE.Vector3(-halfLen, 0, 0))
      const fromSheath = end.clone().add(new THREE.Vector3(spread, 0, 0))
      const inWire = tube([fromSheath, new THREE.Vector3(fromSheath.x, (fromSheath.y + inPort.y) / 2, fromSheath.z), new THREE.Vector3(inPort.x - 0.06, inPort.y, inPort.z), inPort], 1.9 * U)
      const outPort = center.clone().add(new THREE.Vector3(halfLen, 0, 0))
      const outWire = exitStart
        ? tube([outPort, new THREE.Vector3(outPort.x + 0.06, outPort.y, outPort.z), new THREE.Vector3(exitStart.x + spread, (outPort.y + exitStart.y) / 2, exitStart.z), exitStart.clone().add(new THREE.Vector3(spread, 0, 0))], 1.9 * U)
        : null
      return { center, inWire, outWire }
    })
    return { sheath, exitSheath, wires }
  }), [cables, halfLen, rowPitch])
  useEffect(() => () => geometry.forEach((g) => {
    g.sheath.dispose(); g.exitSheath?.dispose()
    g.wires.forEach((w) => { w.inWire.dispose(); w.outWire?.dispose() })
  }), [geometry])
  return <group name="inline-wago-splices">
    {cables.map((cable, c) => {
      const g = geometry[c]
      const sheathMat = <meshStandardMaterial color={cable.sheathColor ?? '#18181b'} roughness={0.56} metalness={0.08} />
      return <group key={cable.key} name={`wago-splice-${cable.key}`}>
        <mesh geometry={g.sheath} castShadow>{sheathMat}</mesh>
        {g.exitSheath && <mesh geometry={g.exitSheath} castShadow>{sheathMat}</mesh>}
        {g.wires.map((w, i) => {
          const cond = cable.conductors[i]
          const hasRightCopper = Boolean(w.outWire) || cond.connectedRight === true
          const wagoComp = !w.outWire && cond.connectedRight === false ? SPLICE_WAGO_RIGHT_OPEN : SPLICE_WAGO
          return <group key={i}>
            <mesh geometry={w.inWire} castShadow><meshStandardMaterial color={cond.color} roughness={0.45} /></mesh>
            {w.outWire && <mesh geometry={w.outWire} castShadow><meshStandardMaterial color={cond.color} roughness={0.45} /></mesh>}
            {/* Ponta descarnada (≈11 mm de cobre) dentro do WAGO, até à mola: o isolamento pára à boca */}
            {(hasRightCopper ? [-1, 1] : [-1]).map((side) => (
              <mesh key={side} name="wago-stripped-copper" position={[w.center.x + side * halfLen * 0.74, w.center.y - 0.02 * scale, w.center.z]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[1.25 * U, 1.25 * U, halfLen * 0.5, 8]} />
                <meshStandardMaterial color="#d4904a" metalness={0.85} roughness={0.25} />
              </mesh>
            ))}
            {/* WAGO 221-2411 com as alavancas viradas para quem abre a caixa (alavanca direita abre quando livre) */}
            <group position={w.center.toArray() as [number, number, number]} rotation={[Math.PI / 2, 0, 0]} scale={scale} name={`wago-221-2411-${cable.key}-${i}`} userData={{ conductor: cond.label ?? '' }}>
              <Wago221Connector3D component={wagoComp} />
            </group>
          </group>
        })}
      </group>
    })}
  </group>
}
