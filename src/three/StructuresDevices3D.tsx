import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { closedFloorSpans, closedSpans, type DuctOpening } from '../schematic/ductJunctions'
import {
  cableTrayDimsOf,
  industrialPillarDimsOf,
  industrialWallDimsOf,
  type WallFinish,
} from './structuresModel'

const U = PANEL_UNITS_PER_MM

function seededNoise(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

interface GalvPbrPair {
  map: THREE.CanvasTexture
  bumpMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
}

/** Textura PBR de aço galvanizado com cristais de zinco (spangle) + perfurações oblongas IEC 61537. */
function createGalvanizedTrayPbr(perforated: boolean): GalvPbrPair | null {
  if (typeof document === 'undefined') return null
  const W = 512
  const H = 512
  const rand = seededNoise(perforated ? 90421 : 40819)

  const colCanvas = document.createElement('canvas')
  colCanvas.width = W; colCanvas.height = H
  const ctx = colCanvas.getContext('2d')!

  const bumpCanvas = document.createElement('canvas')
  bumpCanvas.width = W; bumpCanvas.height = H
  const bctx = bumpCanvas.getContext('2d')!

  const roughCanvas = document.createElement('canvas')
  roughCanvas.width = W; roughCanvas.height = H
  const rctx = roughCanvas.getContext('2d')!

  // Base aço galvanizado acetinado
  ctx.fillStyle = '#c4cbd3'
  ctx.fillRect(0, 0, W, H)
  bctx.fillStyle = '#808080'
  bctx.fillRect(0, 0, W, H)
  rctx.fillStyle = '#6e6e6e'
  rctx.fillRect(0, 0, W, H)

  // Cristais poligonais de zinco galvanizado (spangle realista)
  for (let i = 0; i < 420; i += 1) {
    const cx = rand() * W
    const cy = rand() * H
    const rad = 10 + rand() * 24
    const sides = 5 + Math.floor(rand() * 3)
    const lum = Math.round(176 + rand() * 44)
    const rLum = Math.round(80 + rand() * 58)
    const drawPoly = (c: CanvasRenderingContext2D) => {
      c.beginPath()
      for (let k = 0; k < sides; k += 1) {
        const a = (k / sides) * Math.PI * 2 + rand() * 0.45
        const rr = rad * (0.72 + rand() * 0.32)
        const px = cx + Math.cos(a) * rr
        const py = cy + Math.sin(a) * rr
        if (k === 0) c.moveTo(px, py)
        else c.lineTo(px, py)
      }
      c.closePath()
      c.fill()
    }
    ctx.fillStyle = `rgba(${lum},${lum + 3},${lum + 7},0.48)`
    drawPoly(ctx)
    rctx.fillStyle = `rgba(${rLum},${rLum},${rLum},0.44)`
    drawPoly(rctx)
  }

  // Riscos longitudinais subtis de laminagem
  for (let i = 0; i < 160; i += 1) {
    const y = rand() * H
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(60,72,88,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }

  // Perfurações oblongas estampadas (como image-16.png!)
  if (perforated) {
    const drawSlot = (x: number, y: number, sw: number, sh: number) => {
      const r = Math.min(sw, sh) / 2
      const path = (c: CanvasRenderingContext2D, pad = 0) => {
        const xx = x - pad, yy = y - pad, ww = sw + pad * 2, hh = sh + pad * 2
        const rr = Math.min(ww, hh) / 2
        c.beginPath()
        c.moveTo(xx + rr, yy)
        c.lineTo(xx + ww - rr, yy)
        c.arcTo(xx + ww, yy, xx + ww, yy + rr, rr)
        c.lineTo(xx + ww, yy + hh - rr)
        c.arcTo(xx + ww, yy + hh, xx + ww - rr, yy + hh, rr)
        c.lineTo(xx + rr, yy + hh)
        c.arcTo(xx, yy + hh, xx, yy + hh - rr, rr)
        c.lineTo(xx, yy + rr)
        c.arcTo(xx, yy, xx + rr, yy, rr)
        c.closePath()
      }
      // Borda estampada brilhante
      ctx.fillStyle = '#dde3ea'
      path(ctx, 2.5)
      ctx.fill()
      // Furo escuro profundo
      ctx.fillStyle = '#2d3748'
      path(ctx, 0)
      ctx.fill()
      // Relevo no bump map
      bctx.fillStyle = '#c8c8c8'
      path(bctx, 3)
      bctx.fill()
      bctx.fillStyle = '#181818'
      path(bctx, 0)
      bctx.fill()
      rctx.fillStyle = '#e5e5e5'
      path(rctx, 0)
      rctx.fill()
    }

    // 4 linhas transversais de oblongos + fendas compridas intercaladas
    for (let row = 0; row < 4; row += 1) {
      const y = 34 + row * 124
      for (let col = 0; col < 4; col += 1) {
        drawSlot(34 + col * 116, y, 64, 22)
      }
      // Fenda transversal estreita de drenagem/fixação
      drawSlot(72, y + 58, 368, 12)
    }
  }

  const wrap = (canvas: HTMLCanvasElement, isSrgb: boolean) => {
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 4
    if (isSrgb) tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }
  return {
    map: wrap(colCanvas, true),
    bumpMap: wrap(bumpCanvas, false),
    roughnessMap: wrap(roughCanvas, false),
  }
}

/** Textura PBR de parede modular (betão pré-fabricado, painel metálico canelado ou tijolo industrial). */
function createWallFinishPbr(finish: WallFinish): GalvPbrPair | null {
  if (typeof document === 'undefined') return null
  const W = 512
  const H = 512
  const rand = seededNoise(finish === 'brick' ? 7711 : finish === 'panel' ? 5522 : 3311)

  const colCanvas = document.createElement('canvas')
  colCanvas.width = W; colCanvas.height = H
  const ctx = colCanvas.getContext('2d')!
  const bumpCanvas = document.createElement('canvas')
  bumpCanvas.width = W; bumpCanvas.height = H
  const bctx = bumpCanvas.getContext('2d')!
  const roughCanvas = document.createElement('canvas')
  roughCanvas.width = W; roughCanvas.height = H
  const rctx = roughCanvas.getContext('2d')!

  if (finish === 'brick') {
    ctx.fillStyle = '#9ca3af'
    ctx.fillRect(0, 0, W, H)
    bctx.fillStyle = '#404040'
    bctx.fillRect(0, 0, W, H)
    rctx.fillStyle = '#dcdcdc'
    rctx.fillRect(0, 0, W, H)
    const rows = 12
    const cols = 6
    const bh = H / rows
    const bw = W / cols
    for (let r = 0; r < rows; r += 1) {
      const off = (r % 2) * (bw * 0.5)
      for (let c = -1; c <= cols; c += 1) {
        const bx = c * bw + off + 3
        const by = r * bh + 3
        const tint = Math.round(rand() * 26 - 13)
        ctx.fillStyle = `rgb(${156 + tint},${82 + Math.round(tint * 0.6)},${62 + Math.round(tint * 0.5)})`
        ctx.fillRect(bx, by, bw - 6, bh - 6)
        bctx.fillStyle = `rgb(${170 + Math.round(rand() * 30)},${170},${170})`
        bctx.fillRect(bx, by, bw - 6, bh - 6)
      }
    }
  } else if (finish === 'panel') {
    ctx.fillStyle = '#d8dee6'
    ctx.fillRect(0, 0, W, H)
    bctx.fillStyle = '#808080'
    bctx.fillRect(0, 0, W, H)
    rctx.fillStyle = '#8e8e8e'
    rctx.fillRect(0, 0, W, H)
    // Caneluras horizontais de painel sandwich industrial
    for (let y = 0; y < H; y += 32) {
      ctx.fillStyle = '#c5ced8'
      ctx.fillRect(0, y, W, 6)
      ctx.fillStyle = '#eef2f6'
      ctx.fillRect(0, y + 6, W, 3)
      bctx.fillStyle = '#454545'
      bctx.fillRect(0, y, W, 6)
      bctx.fillStyle = '#b5b5b5'
      bctx.fillRect(0, y + 6, W, 4)
    }
  } else {
    // Betão arquitetónico pré-fabricado com juntas e furos de cofragem
    ctx.fillStyle = '#d3d0c8'
    ctx.fillRect(0, 0, W, H)
    bctx.fillStyle = '#808080'
    bctx.fillRect(0, 0, W, H)
    rctx.fillStyle = '#cccccc'
    rctx.fillRect(0, 0, W, H)
    for (let i = 0; i < 1200; i += 1) {
      const x = rand() * W
      const y = rand() * H
      const sz = 2 + rand() * 14
      const v = Math.round(188 + rand() * 34)
      ctx.fillStyle = `rgba(${v},${v - 2},${v - 7},0.18)`
      ctx.fillRect(x, y, sz, sz)
      bctx.fillStyle = `rgba(${105 + Math.round(rand() * 45)},128,128,0.22)`
      bctx.fillRect(x, y, sz, sz)
    }
    // Juntas de painel e furos de cofragem
    ctx.strokeStyle = 'rgba(84,82,76,0.45)'
    ctx.lineWidth = 3
    ctx.strokeRect(2, 2, W - 4, H - 4)
    for (const px of [96, W - 96]) {
      for (const py of [128, H - 128]) {
        ctx.fillStyle = '#7c7a72'
        ctx.beginPath()
        ctx.arc(px, py, 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  const wrap = (canvas: HTMLCanvasElement, isSrgb: boolean) => {
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 4
    if (isSrgb) tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }
  return {
    map: wrap(colCanvas, true),
    bumpMap: wrap(bumpCanvas, false),
    roughnessMap: wrap(roughCanvas, false),
  }
}

function useGalvTextures(perforated: boolean, repX = 1, repY = 1) {
  const pair = useMemo(() => createGalvanizedTrayPbr(perforated), [perforated])
  useEffect(() => {
    if (!pair) return
    pair.map.repeat.set(repX, repY)
    pair.bumpMap.repeat.set(repX, repY)
    pair.roughnessMap.repeat.set(repX, repY)
  }, [pair, repX, repY])
  useEffect(() => () => {
    pair?.map.dispose()
    pair?.bumpMap.dispose()
    pair?.roughnessMap.dispose()
  }, [pair])
  return pair
}

/** 1. Parede industrial modular PBR */
export function IndustrialWall3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const d = industrialWallDimsOf(c.state)
  const L = d.lengthMm * U
  const H = d.heightMm * U
  const T = d.thicknessMm * U
  const tex = useMemo(() => createWallFinishPbr(d.finish), [d.finish])
  useEffect(() => {
    if (!tex) return
    const rx = Math.max(1, d.lengthMm / 1500)
    const ry = Math.max(1, d.heightMm / 1600)
    tex.map.repeat.set(rx, ry)
    tex.bumpMap.repeat.set(rx, ry)
    tex.roughnessMap.repeat.set(rx, ry)
  }, [tex, d.lengthMm, d.heightMm])
  useEffect(() => () => {
    tex?.map.dispose()
    tex?.bumpMap.dispose()
    tex?.roughnessMap.dispose()
  }, [tex])

  const bodyTint = typeof c.bodyColor === 'string' && /^#[0-9a-f]{6}$/i.test(c.bodyColor) ? c.bodyColor : '#ffffff'

  return (
    <group position={position} name={`industrial-wall-3d-${c.id}`}>
      {/* Corpo principal da parede */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[L, H, T]} />
        <meshStandardMaterial
          color={bodyTint}
          map={tex?.map ?? null}
          bumpMap={tex?.bumpMap ?? null}
          bumpScale={0.025}
          roughnessMap={tex?.roughnessMap ?? null}
          roughness={d.finish === 'panel' ? 0.55 : 0.88}
          metalness={d.finish === 'panel' ? 0.35 : 0.04}
        />
      </mesh>
      {/* Rodapé protetor em betão escuro na base */}
      {d.skirting && (
        <mesh position={[0, -H / 2 + 90 * U, 0]} castShadow receiveShadow>
          <boxGeometry args={[L + 8 * U, 180 * U, T + 18 * U]} />
          <meshStandardMaterial color="#475569" roughness={0.82} metalness={0.08} />
        </mesh>
      )}
      {/* Viga de coroamento metálica superior */}
      <mesh position={[0, H / 2 - 35 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[L + 10 * U, 70 * U, T + 22 * U]} />
        <meshStandardMaterial color="#334155" roughness={0.55} metalness={0.55} />
      </mesh>
    </group>
  )
}

/** 2. Pilar metálico estrutural em perfil I / H com placa de base aparafusada */
export function IndustrialPillar3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const d = industrialPillarDimsOf(c.state)
  const H = d.heightMm * U
  const S = d.sectionMm * U
  const B = d.basePlateMm * U
  const flangeT = Math.max(12, d.sectionMm * 0.08) * U
  const webT = Math.max(10, d.sectionMm * 0.06) * U
  const galv = useGalvTextures(false, 1, Math.max(2, d.heightMm / 800))

  const baseColor = typeof c.bodyColor === 'string' && /^#[0-9a-f]{6}$/i.test(c.bodyColor)
    ? c.bodyColor
    : d.finish === 'safetyYellow'
      ? '#eab308'
      : d.finish === 'galvanized'
        ? '#cbd5e1'
        : '#3b4859'
  const metalness = d.finish === 'galvanized' ? 0.78 : 0.62
  const roughness = d.finish === 'galvanized' ? 0.34 : 0.44
  const baseY = -H / 2

  return (
    <group position={position} name={`industrial-pillar-3d-${c.id}`}>
      {/* Alma central do perfil I/H */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[webT, H - 36 * U, S - flangeT * 2]} />
        <meshStandardMaterial
          color={baseColor}
          map={d.finish === 'galvanized' ? (galv?.map ?? null) : null}
          roughness={roughness}
          metalness={metalness}
        />
      </mesh>
      {/* Banzo frontal (+Z) e posterior (-Z) */}
      {[-1, 1].map((sign) => (
        <mesh key={sign} position={[0, 0, sign * (S / 2 - flangeT / 2)]} castShadow receiveShadow>
          <boxGeometry args={[S, H - 36 * U, flangeT]} />
          <meshStandardMaterial
            color={baseColor}
            map={d.finish === 'galvanized' ? (galv?.map ?? null) : null}
            roughness={roughness}
            metalness={metalness}
          />
        </mesh>
      ))}
      {/* Placa de base pesada aparafusada ao chão */}
      <mesh position={[0, baseY + 12 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[B, 24 * U, B]} />
        <meshStandardMaterial color="#2c3748" roughness={0.48} metalness={0.72} />
      </mesh>
      {/* 4 pernos de ancoragem M20 + anilhas */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <group key={i} position={[sx * (B * 0.36), baseY + 34 * U, sz * (B * 0.36)]}>
          <mesh castShadow>
            <cylinderGeometry args={[12 * U, 12 * U, 24 * U, 6]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.25} metalness={0.88} />
          </mesh>
        </group>
      ))}
      {/* Chapa de topo para encaixe de vigas/esteiras */}
      <mesh position={[0, H / 2 - 10 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[S + 44 * U, 20 * U, S + 44 * U]} />
        <meshStandardMaterial color="#2c3748" roughness={0.48} metalness={0.72} />
      </mesh>
    </group>
  )
}

/** 3. Esteira porta-cabos reta perfurada galvanizada (ref. image-16.png) */
export function CableTrayStraight3D({
  c,
  position,
  openings = [],
}: {
  c: ElectricalComponent
  position: [number, number, number]
  openings?: DuctOpening[]
}) {
  const d = cableTrayDimsOf('cableTrayStraight', c.state)
  const L = d.lengthMm * U
  const W = d.widthMm * U
  const H = d.sideHeightMm * U
  const t = 2.5 * U
  const lip = 11 * U
  const perfTex = useGalvTextures(true, Math.max(1, d.lengthMm / 420), Math.max(1, d.widthMm / 260))
  const solidTex = useGalvTextures(false, Math.max(1, d.lengthMm / 500), 1)
  const baseY = -H / 2

  // Pontas aparadas (endTrim) → não desenhar patilhas de encaixe nesse extremo
  const trimNeg = openings.some((o) => o.endTrim && Math.min(o.from, o.to) <= -d.lengthMm / 2 + 12)
  const trimPos = openings.some((o) => o.endTrim && Math.max(o.from, o.to) >= d.lengthMm / 2 - 12)
  const floorSpans = closedFloorSpans(d.lengthMm, openings)

  return (
    <group position={position} name={`cable-tray-straight-3d-${c.id}`}>
      {/* Fundo perfurado — segmentado nas pontas que entram noutra esteira (T/L) */}
      {floorSpans.map(([fromMm, toMm], idx) => {
        const spanL = (toMm - fromMm) * U
        const centerX = ((fromMm + toMm) / 2) * U
        if (spanL <= 0) return null
        return (
          <mesh key={`floor-${idx}`} position={[centerX, baseY + t / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[spanL, t, W]} />
            <meshStandardMaterial
              color="#d2d8df"
              map={perfTex?.map ?? null}
              bumpMap={perfTex?.bumpMap ?? null}
              bumpScale={0.015}
              roughnessMap={perfTex?.roughnessMap ?? null}
              roughness={0.34}
              metalness={0.78}
            />
          </mesh>
        )
      })}
      {/* Abas laterais perfuradas + rebordo superior enrolado (aberturas automáticas T/L/+) */}
      {([-1, 1] as const).map((side) => {
        const spans = closedSpans(d.lengthMm, openings, side === -1 ? 'top' : 'bottom')
        return (
          <group key={side}>
            {spans.map(([fromMm, toMm], idx) => {
              const spanL = (toMm - fromMm) * U
              const centerX = ((fromMm + toMm) / 2) * U
              if (spanL <= 0) return null
              return (
                <group key={idx} position={[centerX, 0, 0]}>
                  <mesh position={[0, 0, side * (W / 2 - t / 2)]} castShadow receiveShadow>
                    <boxGeometry args={[spanL, H, t]} />
                    <meshStandardMaterial
                      color="#cfd6de"
                      map={perfTex?.map ?? null}
                      bumpMap={perfTex?.bumpMap ?? null}
                      bumpScale={0.012}
                      roughness={0.32}
                      metalness={0.8}
                    />
                  </mesh>
                  <mesh position={[0, H / 2, side * (W / 2 - lip * 0.38)]} rotation={[0, 0, Math.PI / 2]} castShadow>
                    <cylinderGeometry args={[lip * 0.42, lip * 0.42, spanL, 12]} />
                    <meshStandardMaterial
                      color="#dce2e9"
                      map={solidTex?.map ?? null}
                      roughness={0.26}
                      metalness={0.86}
                    />
                  </mesh>
                </group>
              )
            })}
          </group>
        )
      })}
      {/* Patilhas só nas pontas livres (não aparadas por união) */}
      {([-1, 1] as const).map((endSign) => {
        if ((endSign < 0 && trimNeg) || (endSign > 0 && trimPos)) return null
        return (
          <group key={`end-${endSign}`} position={[endSign * (L / 2 - 22 * U), 0, 0]}>
            {([-1, 1] as const).map((side) => (
              <mesh key={side} position={[0, -H * 0.08, side * (W / 2 + 1.8 * U)]} castShadow>
                <boxGeometry args={[46 * U, H * 0.68, 2.2 * U]} />
                <meshStandardMaterial color="#b7c0ca" roughness={0.34} metalness={0.82} />
              </mesh>
            ))}
          </group>
        )
      })}
      {/* Cabos/tubos a quase todo o comprimento para não interromper nas junções */}
      <TrayCableBundle state={c.state} lengthMm={d.lengthMm} floorY={baseY + t} fullRun />
      {d.withCover && (
        <mesh position={[0, H / 2 + 4 * U, 0]} castShadow receiveShadow>
          <boxGeometry args={[L, 3 * U, W + 6 * U]} />
          <meshStandardMaterial
            color="#d8dee5"
            map={solidTex?.map ?? null}
            roughness={0.3}
            metalness={0.82}
          />
        </mesh>
      )}
    </group>
  )
}

/**
 * Cabos e tubos assentes no fundo da esteira (`state.cables`: cor, Ø e tipo), lado a lado e
 * filaçados por abraçadeiras de nylon preto a cada `state.tieEveryMm` (por omissão 250 mm).
 */
function TrayCableBundle({
  state,
  lengthMm,
  floorY,
  fullRun = false,
}: {
  state: Record<string, any>
  lengthMm: number
  floorY: number
  /** Quando true, o cabo/tubo corre quase de ponta a ponta (junções 3D sem interrupção visual). */
  fullRun?: boolean
}) {
  const cables = Array.isArray(state?.cables)
    ? (state.cables as Array<{ color?: string; diameterMm?: number; kind?: string }>).filter((x) => x && Number(x.diameterMm) > 0).slice(0, 12)
    : []
  if (!cables.length) return null
  const gap = 1.5
  const widths = cables.map((x) => Number(x.diameterMm))
  const total = widths.reduce((a, b) => a + b, 0) + gap * (cables.length - 1)
  const tallest = Math.max(...widths)
  // fullRun: só 4 mm de rebaixo em cada ponta para não atravessar a união metálica
  const run = Math.max(0, lengthMm - (fullRun ? 8 : 30))
  let z = -total / 2
  const lanes = cables.map((cable, i) => {
    const dMm = widths[i]
    const lane = { z: z + dMm / 2, dMm, color: cable.color || '#4b5563', tube: cable.kind === 'tube' }
    z += dMm + gap
    return lane
  })
  const every = Math.max(120, Number(state?.tieEveryMm) || 250)
  const ties = Math.max(1, Math.floor(run / every))
  const tieXs = Array.from({ length: ties }, (_, i) => (-run / 2 + (i + 0.5) * (run / ties)) * U)
  const midY = floorY + (tallest / 2) * U
  return (
    <group name="esteira-cabos-filacados">
      {lanes.map((lane, i) => (
        <mesh key={i} position={[0, floorY + (lane.dMm / 2) * U, lane.z * U]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[(lane.dMm / 2) * U, (lane.dMm / 2) * U, run * U, 14]} />
          <meshStandardMaterial
            name={lane.tube ? 'Tubo de ar PU' : 'Cabo H07RN-F'}
            color={lane.color}
            roughness={lane.tube ? 0.3 : 0.7}
            metalness={0}
            transparent={lane.tube}
            opacity={lane.tube ? 0.9 : 1}
          />
        </mesh>
      ))}
      {tieXs.map((x, i) => (
        <mesh key={`tie-${i}`} name="Abraçadeira de nylon" position={[x, midY, 0]} rotation={[0, Math.PI / 2, 0]} scale={[1, (tallest / 2 + 1.2) / (total / 2 + 1.2), 1]}>
          <torusGeometry args={[(total / 2 + 1.2) * U, 0.9 * U, 6, 28]} />
          <meshStandardMaterial color="#111827" roughness={0.6} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}

/** 4. Curva horizontal 90° de esteira porta-cabos (ref. image-18.png) */
export function CableTrayElbow903D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const d = cableTrayDimsOf('cableTrayElbow90', c.state)
  const W = d.widthMm * U
  const H = d.sideHeightMm * U
  const R = d.radiusMm * U
  const t = 2.6 * U
  const galv = useGalvTextures(false, 2, 2)
  const span = R + W + 40 * U
  const cx = -span / 2 + 20 * U
  const cz = -span / 2 + 20 * U

  const { floorGeo, innerWallGeo, outerWallGeo } = useMemo(() => {
    const segs = 22
    const rIn = Math.max(40 * U, R)
    const rOut = rIn + W

    // Fundo plano em setor circular 90°
    const shape = new THREE.Shape()
    shape.absarc(0, 0, rOut, 0, Math.PI / 2, false)
    shape.lineTo(0, rIn)
    shape.absarc(0, 0, rIn, Math.PI / 2, 0, true)
    shape.closePath()
    const floor = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: segs })
    floor.rotateX(Math.PI / 2)

    const makeArcWall = (rad: number) => {
      const s = new THREE.Shape()
      s.absarc(0, 0, rad + t / 2, 0, Math.PI / 2, false)
      s.absarc(0, 0, Math.max(0.01, rad - t / 2), Math.PI / 2, 0, true)
      s.closePath()
      const g = new THREE.ExtrudeGeometry(s, { depth: H, bevelEnabled: false, curveSegments: segs })
      g.rotateX(Math.PI / 2)
      return g
    }
    return {
      floorGeo: floor,
      innerWallGeo: makeArcWall(rIn),
      outerWallGeo: makeArcWall(rOut),
    }
  }, [R, W, H, t])

  useEffect(() => () => {
    floorGeo.dispose()
    innerWallGeo.dispose()
    outerWallGeo.dispose()
  }, [floorGeo, innerWallGeo, outerWallGeo])

  return (
    <group position={position} name={`cable-tray-elbow90-3d-${c.id}`}>
      <group position={[cx, 0, cz]}>
        <mesh geometry={floorGeo} position={[0, -H / 2 + t, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#ccd3db" map={galv?.map ?? null} roughness={0.34} metalness={0.8} />
        </mesh>
        <mesh geometry={innerWallGeo} position={[0, H / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#d4dbe3" map={galv?.map ?? null} roughness={0.3} metalness={0.82} />
        </mesh>
        <mesh geometry={outerWallGeo} position={[0, H / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#d4dbe3" map={galv?.map ?? null} roughness={0.3} metalness={0.82} />
        </mesh>
        {/* Prolongamentos retos de acoplamento nas 2 extremidades */}
        <mesh position={[R + W / 2, -H / 2 + t / 2, -22 * U]} castShadow receiveShadow>
          <boxGeometry args={[W, t, 46 * U]} />
          <meshStandardMaterial color="#c4ccd6" map={galv?.map ?? null} roughness={0.34} metalness={0.8} />
        </mesh>
        <mesh position={[-22 * U, -H / 2 + t / 2, R + W / 2]} castShadow receiveShadow>
          <boxGeometry args={[46 * U, t, W]} />
          <meshStandardMaterial color="#c4ccd6" map={galv?.map ?? null} roughness={0.34} metalness={0.8} />
        </mesh>
      </group>
    </group>
  )
}

/** 5. Cruzamento em X ou Derivação em T de esteira (ref. image-19.png) */
export function CableTrayCross3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const d = cableTrayDimsOf('cableTrayCross', c.state)
  const W = d.widthMm * U
  const H = d.sideHeightMm * U
  const arm = 140 * U
  const span = W + arm * 2
  const t = 2.6 * U
  const isTee = d.variant === 'tee'
  const galv = useGalvTextures(false, 2, 2)

  // 4 cantos interiores arredondados (ou 2 cantos + parede traseira reta se T)
  const corners: Array<[number, number, number]> = isTee
    ? [
        [W / 2 + arm * 0.45, W / 2 + arm * 0.45, Math.PI],
        [-W / 2 - arm * 0.45, W / 2 + arm * 0.45, Math.PI / 2],
      ]
    : [
        [W / 2 + arm * 0.45, W / 2 + arm * 0.45, Math.PI],
        [-W / 2 - arm * 0.45, W / 2 + arm * 0.45, Math.PI / 2],
        [-W / 2 - arm * 0.45, -W / 2 - arm * 0.45, 0],
        [W / 2 + arm * 0.45, -W / 2 - arm * 0.45, -Math.PI / 2],
      ]

  const cornerGeo = useMemo(() => {
    const r = arm * 0.45
    const s = new THREE.Shape()
    s.absarc(0, 0, r + t / 2, 0, Math.PI / 2, false)
    s.absarc(0, 0, Math.max(0.01, r - t / 2), Math.PI / 2, 0, true)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: H, bevelEnabled: false, curveSegments: 14 })
    g.rotateX(Math.PI / 2)
    return g
  }, [arm, H, t])

  useEffect(() => () => cornerGeo.dispose(), [cornerGeo])

  return (
    <group position={position} name={`cable-tray-cross-3d-${c.id}`}>
      {/* Fundo principal em cruz / T */}
      <mesh position={[0, -H / 2 + t / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[span, t, W]} />
        <meshStandardMaterial color="#cfd6de" map={galv?.map ?? null} roughness={0.34} metalness={0.8} />
      </mesh>
      <mesh position={[0, -H / 2 + t / 2, isTee ? arm / 2 : 0]} castShadow receiveShadow>
        <boxGeometry args={[W, t, isTee ? W + arm : span]} />
        <meshStandardMaterial color="#cfd6de" map={galv?.map ?? null} roughness={0.34} metalness={0.8} />
      </mesh>
      {/* Enchimentos triangulares de canto + abas curvas suaves (image-19.png) */}
      {corners.map(([cx, cz, rotY], idx) => (
        <group key={idx} position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
          <mesh geometry={cornerGeo} position={[0, H / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#d8dfe7" map={galv?.map ?? null} roughness={0.3} metalness={0.84} />
          </mesh>
        </group>
      ))}
      {/* Se modo T: parede traseira contínua em -Z */}
      {isTee && (
        <mesh position={[0, 0, -W / 2 + t / 2]} castShadow receiveShadow>
          <boxGeometry args={[span, H, t]} />
          <meshStandardMaterial color="#d4dbe3" map={galv?.map ?? null} roughness={0.3} metalness={0.82} />
        </mesh>
      )}
      {/* Abas retas das pontas de encaixe */}
      {[-1, 1].map((sx) => (
        <group key={`x-${sx}`}>
          {[-1, 1].map((sz) => (
            !(isTee && sz < 0) && (
              <mesh key={sz} position={[sx * (span / 2 - arm * 0.28), 0, sz * (W / 2 - t / 2)]} castShadow>
                <boxGeometry args={[arm * 0.56, H, t]} />
                <meshStandardMaterial color="#c8d0d9" map={galv?.map ?? null} roughness={0.32} metalness={0.82} />
              </mesh>
            )
          ))}
        </group>
      ))}
      {(isTee ? [1] : [-1, 1]).map((sz) => (
        <group key={`z-${sz}`}>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * (W / 2 - t / 2), 0, sz * (span / 2 - arm * 0.28)]} castShadow>
              <boxGeometry args={[t, H, arm * 0.56]} />
              <meshStandardMaterial color="#c8d0d9" map={galv?.map ?? null} roughness={0.32} metalness={0.82} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** 6. Pescoço / Curva vertical articulada de esteira (ref. image-17.png) */
export function CableTrayVerticalBend3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const d = cableTrayDimsOf('cableTrayVerticalBend', c.state)
  const W = d.widthMm * U
  const H = d.sideHeightMm * U
  const t = 2.6 * U
  const rad = (d.angleDeg * Math.PI) / 180
  const dirSign = d.direction === 'down' ? -1 : 1
  const segLen = 200 * U
  const galv = useGalvTextures(false, 1.5, 1)

  const renderSection = (len: number) => (
    <group>
      <mesh position={[len / 2, -H / 2 + t / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[len, t, W]} />
        <meshStandardMaterial color="#cfd6de" map={galv?.map ?? null} roughness={0.32} metalness={0.8} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[len / 2, 0, side * (W / 2 - t / 2)]} castShadow receiveShadow>
          <boxGeometry args={[len, H, t]} />
          <meshStandardMaterial color="#d8dfe7" map={galv?.map ?? null} roughness={0.3} metalness={0.84} />
        </mesh>
      ))}
    </group>
  )

  const renderHingeBolts = (x: number, y: number) => (
    <group position={[x, y, 0]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0, side * (W / 2 + 3 * U)]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[6 * U, 6 * U, 10 * U, 6]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.22} metalness={0.9} />
        </mesh>
      ))}
    </group>
  )

  const midX = -segLen * 0.85
  const midY = -dirSign * segLen * Math.sin(rad) * 0.45

  return (
    <group position={position} name={`cable-tray-vertical-bend-3d-${c.id}`}>
      {/* Secção 1 inclinada a 50% do ângulo */}
      <group position={[midX, midY, 0]} rotation={[0, 0, dirSign * (rad * 0.5)]}>
        {renderSection(segLen)}
        {renderHingeBolts(0, 0)}
        {/* Secção 2 articulada na dobradiça */}
        <group position={[segLen, 0, 0]} rotation={[0, 0, dirSign * (rad * 0.5)]}>
          {renderSection(segLen)}
          {renderHingeBolts(0, 0)}
          {renderHingeBolts(segLen, 0)}
        </group>
      </group>
    </group>
  )
}

/** 7. Curva vertical 90° exterior/interior rígida (ref. image-20.png) */
export function CableTrayRiser903D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const d = cableTrayDimsOf('cableTrayRiser90', c.state)
  const W = d.widthMm * U
  const H = d.sideHeightMm * U
  const R = d.radiusMm * U
  const t = 2.6 * U
  const galv = useGalvTextures(false, 2, 1.5)
  const flipZ = d.riserKind === 'interior' ? Math.PI : 0

  const { backCurveGeo, sideCurveGeo } = useMemo(() => {
    const segs = 22
    const rIn = Math.max(50 * U, R)
    const rOut = rIn + H

    // Chapa curva do fundo (no plano XY, extrudida em Z pela largura W)
    const backShape = new THREE.Shape()
    backShape.absarc(0, 0, rIn + t, 0, Math.PI / 2, false)
    backShape.absarc(0, 0, rIn, Math.PI / 2, 0, true)
    backShape.closePath()
    const back = new THREE.ExtrudeGeometry(backShape, { depth: W, bevelEnabled: false, curveSegments: segs })
    back.translate(0, 0, -W / 2)

    // Abas laterais curvas 90° (plano XY)
    const sideShape = new THREE.Shape()
    sideShape.absarc(0, 0, rOut, 0, Math.PI / 2, false)
    sideShape.absarc(0, 0, rIn, Math.PI / 2, 0, true)
    sideShape.closePath()
    const side = new THREE.ExtrudeGeometry(sideShape, { depth: t, bevelEnabled: false, curveSegments: segs })
    side.translate(0, 0, -t / 2)

    return { backCurveGeo: back, sideCurveGeo: side }
  }, [R, H, W, t])

  useEffect(() => () => {
    backCurveGeo.dispose()
    sideCurveGeo.dispose()
  }, [backCurveGeo, sideCurveGeo])

  const off = -(R + H) * 0.48
  return (
    <group position={position} rotation={[0, 0, flipZ]} name={`cable-tray-riser90-3d-${c.id}`}>
      <group position={[off, off, 0]}>
        <mesh geometry={backCurveGeo} castShadow receiveShadow>
          <meshStandardMaterial color="#cfd6de" map={galv?.map ?? null} roughness={0.32} metalness={0.82} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={sideCurveGeo} position={[0, 0, side * (W / 2 - t / 2)]} castShadow receiveShadow>
            <meshStandardMaterial color="#d8dfe7" map={galv?.map ?? null} roughness={0.28} metalness={0.85} />
          </mesh>
        ))}
        {/* Patilhas de acoplamento nas extremidades vertical e horizontal */}
        {[-1, 1].map((side) => (
          <group key={`tab-${side}`}>
            <mesh position={[R + H / 2, -45 * U, side * (W / 2 - t / 2)]} castShadow>
              <boxGeometry args={[H, 92 * U, t]} />
              <meshStandardMaterial color="#c4ccd6" map={galv?.map ?? null} roughness={0.32} metalness={0.82} />
            </mesh>
            <mesh position={[-45 * U, R + H / 2, side * (W / 2 - t / 2)]} castShadow>
              <boxGeometry args={[92 * U, H, t]} />
              <meshStandardMaterial color="#c4ccd6" map={galv?.map ?? null} roughness={0.32} metalness={0.82} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}
