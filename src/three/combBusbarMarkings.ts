/**
 * Serigrafias industriais de alta resolução e micro-texturas PBR procedurais para:
 *  - `busbarComb`          → Barramento tipo pente (1P, 1P+N, 3P, 3P+N) — Lexman, Sibratec, Schneider, Legrand
 *  - `combBusbarConnector` → Conector genérico de alimentação tipo pino (4–16 / 6–25 / 10–35 mm²)
 *
 * Complementa os mapas PBR fotografados de `/textures/lib/` (`cobre`, `aco-inox`, `latao`, `plastico-claro`)
 * com serigrafia nítida em `CanvasTexture` atualizada em tempo real consoante as opções do Inspetor.
 */
import * as THREE from 'three'
import {
  combBrandOf,
  combBusbarDimsOf,
  combCatalogCodeOf,
  COMB_CONNECTOR_GAUGES,
  combConnectorColorOf,
  combConnectorGaugeOf,
  combModeOf,
  combNeutralSideOf,
  combRatedAOf,
  combSectionMm2Of,
  combTeethDirectionOf,
  type CombBrandStyle,
  type CombBusbarMode,
  type CombConductor,
  type CombRatedA,
} from './combBusbarParts'

const silkCache = new Map<string, THREE.CanvasTexture>()
const stampCache = new Map<string, THREE.CanvasTexture>()
const procCache = new Map<string, THREE.CanvasTexture>()

function prng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Desenha um código de barras EAN-13 nítido e autêntico com algarismos legíveis. */
function drawBarcode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  digits: string,
  ink = '#1b1f24',
): void {
  const clean = digits.replace(/\D/g, '').padEnd(13, '5').slice(0, 13)
  const totalModules = 95
  const modW = w / totalModules
  const guardH = h * 0.84
  const barH = h * 0.74
  ctx.fillStyle = ink

  let cursor = 0
  const bar = (mods: number, tall = false) => {
    ctx.fillRect(x + cursor * modW, y, Math.max(0.85, mods * modW), tall ? guardH : barH)
    cursor += mods
  }
  const gap = (mods: number) => {
    cursor += mods
  }

  // Guarda esquerda 101
  bar(1, true)
  gap(1)
  bar(1, true)

  // Padrões determinísticos de 7 módulos por algarismo
  const patterns: readonly [number, number, number, number][] = [
    [3, 2, 1, 1],
    [2, 2, 2, 1],
    [2, 1, 2, 2],
    [1, 4, 1, 1],
    [1, 1, 3, 2],
    [1, 2, 3, 1],
    [1, 1, 1, 4],
    [1, 3, 1, 2],
    [1, 2, 1, 3],
    [3, 1, 1, 2],
  ]

  for (let i = 1; i <= 6; i++) {
    const p = patterns[Number(clean[i]) % 10]
    gap(p[0])
    bar(p[1])
    gap(p[2])
    bar(p[3])
  }
  // Guarda central 01010
  gap(1)
  bar(1, true)
  gap(1)
  bar(1, true)
  gap(1)

  for (let i = 7; i <= 12; i++) {
    const p = patterns[Number(clean[i]) % 10]
    bar(p[0])
    gap(p[1])
    bar(p[2])
    gap(p[3])
  }
  // Guarda direita 101
  bar(1, true)
  gap(1)
  bar(1, true)

  // Algarismos EAN-13 por baixo das barras
  const fontPx = Math.max(11, Math.round(h * 0.2))
  ctx.font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'right'
  ctx.fillText(clean[0], x - 2, y + h + 1)
  ctx.textAlign = 'center'
  ctx.fillText(clean.slice(1, 7), x + w * 0.27, y + h + 1)
  ctx.fillText(clean.slice(7, 13), x + w * 0.73, y + h + 1)
}

/** Símbolo normativo CE em traço geométrico europeu. */
function drawCeMark(ctx: CanvasRenderingContext2D, x: number, cy: number, r: number, color = '#1e2228'): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.28
  ctx.lineCap = 'butt'
  // C
  ctx.beginPath()
  ctx.arc(x + r, cy, r * 0.82, Math.PI * 0.34, Math.PI * 1.66, false)
  ctx.stroke()
  // E
  const ex = x + r * 2.55
  ctx.beginPath()
  ctx.arc(ex, cy, r * 0.82, Math.PI * 0.34, Math.PI * 1.66, false)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(ex - r * 0.78, cy)
  ctx.lineTo(ex + r * 0.16, cy)
  ctx.stroke()
  ctx.restore()
}

/** Pictograma europeu REEE (contentor barrado — Diretiva 2012/19/UE). */
function drawWeeeIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, color = '#242930'): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(1.8, h * 0.055)
  const bw = h * 0.42
  const bh = h * 0.56
  const top = cy - bh * 0.52
  // Corpo do contentor
  ctx.strokeRect(cx - bw / 2, top, bw, bh)
  // Tampa
  ctx.beginPath()
  ctx.moveTo(cx - bw * 0.66, top)
  ctx.lineTo(cx + bw * 0.66, top)
  ctx.stroke()
  // Roda
  ctx.beginPath()
  ctx.arc(cx + bw * 0.36, top + bh + h * 0.07, h * 0.075, 0, Math.PI * 2)
  ctx.stroke()
  // Cruz diagonal X
  const xr = h * 0.46
  ctx.beginPath()
  ctx.moveTo(cx - xr * 0.78, cy - xr * 0.85)
  ctx.lineTo(cx + xr * 0.78, cy + xr * 0.8)
  ctx.moveTo(cx + xr * 0.78, cy - xr * 0.85)
  ctx.lineTo(cx - xr * 0.78, cy + xr * 0.8)
  ctx.stroke()
  // Barra inferior preta normativa
  ctx.fillRect(cx - bw * 0.72, cy + h * 0.44, bw * 1.44, Math.max(2.5, h * 0.08))
  ctx.restore()
}

/** Pictogramas Triman + Info-Tri (fiel à etiqueta Lexman da foto de referência). */
function drawTrimanBox(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  ctx.save()
  ctx.strokeStyle = '#23272e'
  ctx.fillStyle = '#23272e'
  ctx.lineWidth = 2
  const r = h * 0.36
  const cy = y + h * 0.55
  // Círculo Triman
  ctx.beginPath()
  ctx.arc(x + r, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x + r - r * 0.22, cy - r * 0.36, r * 0.14, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + r - r * 0.25, cy - r * 0.12)
  ctx.lineTo(x + r - r * 0.22, cy + r * 0.46)
  ctx.moveTo(x + r - r * 0.05, cy)
  ctx.lineTo(x + r + r * 0.42, cy - r * 0.28)
  ctx.moveTo(x + r - r * 0.05, cy + r * 0.14)
  ctx.lineTo(x + r + r * 0.46, cy + r * 0.12)
  ctx.stroke()

  // Caixa FR | IT + contentor reciclagem
  const bx = x + r * 2 + 8
  const bw = h * 1.32
  const bh = h * 0.7
  const by = y + h * 0.22
  ctx.fillRect(bx, y, 22, 13)
  ctx.fillRect(bx + 25, y, 20, 13)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 9px Inter, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('FR', bx + 11, y + 6.8)
  ctx.fillText('IT', bx + 35, y + 6.8)

  ctx.strokeStyle = '#23272e'
  ctx.strokeRect(bx, by, bw, bh)
  ctx.fillStyle = '#23272e'
  ctx.fillRect(bx + bw * 0.56, by, bw * 0.44, bh)
  // Folheto estilizado à esquerda
  ctx.strokeRect(bx + 6, by + bh * 0.24, bw * 0.36, bh * 0.5)
  // Símbolo de contentor branco à direita
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.8
  ctx.strokeRect(bx + bw * 0.67, by + bh * 0.24, bw * 0.22, bh * 0.52)
  ctx.restore()
}

/** Triângulo amarelo/preto de aviso de tensão elétrica (IEC 60417-6042). */
function drawBoltTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, filled = true): void {
  ctx.save()
  const h = size * 0.88
  ctx.beginPath()
  ctx.moveTo(cx, cy - h * 0.55)
  ctx.lineTo(cx + size * 0.54, cy + h * 0.45)
  ctx.lineTo(cx - size * 0.54, cy + h * 0.45)
  ctx.closePath()
  if (filled) {
    ctx.fillStyle = '#facc15'
    ctx.fill()
  }
  ctx.strokeStyle = '#1e2228'
  ctx.lineWidth = Math.max(2, size * 0.08)
  ctx.lineJoin = 'round'
  ctx.stroke()
  // Raio central
  ctx.fillStyle = '#1e2228'
  ctx.beginPath()
  ctx.moveTo(cx + size * 0.04, cy - h * 0.28)
  ctx.lineTo(cx - size * 0.14, cy + h * 0.06)
  ctx.lineTo(cx + size * 0.02, cy + h * 0.06)
  ctx.lineTo(cx - size * 0.06, cy + h * 0.34)
  ctx.lineTo(cx + size * 0.16, cy - h * 0.02)
  ctx.lineTo(cx, cy - h * 0.02)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function modeTitlePt(mode: CombBusbarMode, ratedA: CombRatedA): string {
  switch (mode) {
    case '1P':
      return `1 PÓLO - ${ratedA}A`
    case '1P+N':
      return `2 PÓLOS (F+N) - ${ratedA}A`
    case '1P+N-3P':
      return `Acti9 1P+N (3P BAL) - ${ratedA}A`
    case '3P':
      return `3 PÓLOS - ${ratedA}A`
    case '3P+N':
      return `3F+N (4P) - ${ratedA}A`
    default:
      return `PENTE - ${ratedA}A`
  }
}

function modeShortSpec(mode: CombBusbarMode, ratedA: CombRatedA, sectionMm2: number): string {
  const volt = mode === '1P' ? '230/400V~' : '400V~'
  return `${mode} · ${ratedA}A · ${sectionMm2}mm² · ${volt}`
}

/**
 * Gera a textura 2048×256 da serigrafia frontal real do barramento tipo pente (`busbarComb`),
 * sincronizada ao milímetro com a marca, configuração (`1P`, `1P+N`, `3P`, `3P+N`), n.º de dentes,
 * corrente nominal (`63/80/100 A`) e posição exata de cada pino de cobre (`L`, `L1`, `L2`, `L3`, `N`).
 */
export function getCombBusbarSilkscreenTexture(state?: Record<string, unknown>): THREE.CanvasTexture {
  const dims = combBusbarDimsOf(state)
  const brand = combBrandOf(state)
  const mode = combModeOf(state)
  const neutralSide = combNeutralSideOf(state)
  const teethDir = combTeethDirectionOf(state)
  const ratedA = combRatedAOf(state)
  const sectionMm2 = combSectionMm2Of(ratedA)
  const key = `${brand}|${mode}|${neutralSide}|${teethDir}|${dims.poles}|${ratedA}`
  const hit = silkCache.get(key)
  if (hit) return hit

  const W = dims.poles >= 10 ? 2048 : 1536
  const H = 240
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const rand = prng(48271 + dims.poles * 31 + ratedA)

  // 1) Base realista de PVC rígido extrudido (cinzento-pérola RAL 7035 com micro-estrias longitudinais)
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  if (teethDir === 'down') {
    bg.addColorStop(0, '#eef0f1')
    bg.addColorStop(0.08, '#c7cbd0')
    bg.addColorStop(0.14, '#d9dce0')
    bg.addColorStop(0.88, '#cfd3d8')
    bg.addColorStop(1, '#bcc1c7')
  } else {
    bg.addColorStop(0, '#bcc1c7')
    bg.addColorStop(0.12, '#cfd3d8')
    bg.addColorStop(0.86, '#d9dce0')
    bg.addColorStop(0.92, '#c7cbd0')
    bg.addColorStop(1, '#eef0f1')
  }
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Estrias finíssimas de extrusão horizontal do perfil isolante PVC
  for (let i = 0; i < 420; i++) {
    const y = rand() * H
    const a = 0.015 + rand() * 0.032
    ctx.strokeStyle = rand() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(60,68,78,${a})`
    ctx.lineWidth = 0.7 + rand() * 1.1
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }

  // Vinco técnico subtil da calha superior (característico do pente Lexman / Schneider)
  const grooveY = teethDir === 'down' ? Math.round(H * 0.105) : Math.round(H * 0.895)
  ctx.fillStyle = 'rgba(52, 58, 68, 0.42)'
  ctx.fillRect(0, grooveY - 3, W, 6)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.fillRect(0, grooveY + (teethDir === 'down' ? 3 : -5), W, 2)

  // Faixa de serigrafia principal vs faixa dos identificadores de fase junto aos pinos
  const pinBandH = mode === '1P' ? 40 : 54
  const pinBandY = teethDir === 'down' ? H - pinBandH : 0
  const mainTop = teethDir === 'down' ? 24 : pinBandH + 2
  const mainBot = teethDir === 'down' ? H - pinBandH - 2 : H - 24
  const mainH = mainBot - mainTop
  const mainCy = (mainTop + mainBot) / 2
  const code = combCatalogCodeOf(brand, mode, dims.poles, ratedA)

  // 2) Serigrafia específica da marca selecionada
  drawBrandArt(ctx, brand, mode, ratedA, sectionMm2, code, dims.poles, W, mainTop, mainH, mainCy)

  // 3) Faixa inferior/superior de marcação normativa dos condutores (alinhada ao milímetro com cada dente!)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillRect(0, pinBandY, W, pinBandH)
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.22)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const sepY = teethDir === 'down' ? pinBandY : pinBandY + pinBandH
  ctx.moveTo(0, sepY)
  ctx.lineTo(W, sepY)
  ctx.stroke()

  const silkSpanMm = dims.bodyLengthMm - 0.6
  for (const t of dims.teeth) {
    const u = t.xMm / silkSpanMm + 0.5
    if (u < 0.01 || u > 0.99) continue
    const px = u * W
    const py = pinBandY + pinBandH * 0.54
    drawToothPhaseBadge(ctx, px, py, t.conductor, mode, pinBandH, dims.poles, brand)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  silkCache.set(key, tex)
  return tex
}

function drawBrandArt(
  ctx: CanvasRenderingContext2D,
  brand: CombBrandStyle,
  mode: CombBusbarMode,
  ratedA: CombRatedA,
  sectionMm2: number,
  code: string,
  poles: number,
  W: number,
  mainTop: number,
  mainH: number,
  mainCy: number,
): void {
  const compact = poles <= 5

  if (brand === 'lexman') {
    // Fiel à foto IMG_5788: CE à esquerda + etiqueta autocolante branca Lexman com faixa vermelha,
    // Triman, código de barras EAN-13, bandeira FR e patilha rosa "open" + serigrafia Lexman à direita!
    if (compact) {
      drawCeMark(ctx, W * 0.04, mainCy, mainH * 0.28, '#1f2329')
      drawLexmanWordmark(ctx, W * 0.2, mainCy - 4, mainH * 0.36, true)
      ctx.fillStyle = '#e11d48'
      roundRect(ctx, W * 0.54, mainCy - mainH * 0.26, W * 0.24, mainH * 0.52, 7)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 ${Math.round(mainH * 0.24)}px Inter, Arial, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${mode}·${ratedA}A`, W * 0.66, mainCy + 1)
      drawWeeeIcon(ctx, W * 0.9, mainCy, mainH * 0.68)
      return
    }

    drawCeMark(ctx, W * 0.022, mainCy + 2, mainH * 0.33, '#22262c')

    // Etiqueta autocolante branca recortada (x = 9% .. 52%)
    const lx = Math.round(W * 0.092)
    const lw = Math.round(W * 0.425)
    const ly = mainTop + 4
    const lh = mainH - 6
    ctx.save()
    ctx.shadowColor = 'rgba(15, 23, 42, 0.18)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 2
    ctx.fillStyle = '#fcfcfd'
    roundRect(ctx, lx, ly, lw, lh, 8)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = 'rgba(148,163,184,0.45)'
    ctx.lineWidth = 1.4
    roundRect(ctx, lx, ly, lw, lh, 8)
    ctx.stroke()

    // Logótipo Lexman com círculo magenta característico + faixa vermelha do código
    drawLexmanWordmark(ctx, lx + 16, ly + lh * 0.34, lh * 0.3, true)
    const redW = Math.min(lw * 0.28, 235)
    const redH = lh * 0.34
    const redY = ly + lh - redH - 6
    ctx.fillStyle = '#e31e3c'
    roundRect(ctx, lx + 8, redY, redW, redH, 5)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${Math.round(redH * 0.58)}px Inter, Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(code, lx + 8 + redW / 2, redY + redH * 0.53)

    // Pictogramas Triman + morada ADEO
    const triX = lx + redW + 24
    drawTrimanBox(ctx, triX, ly + 10, lh * 0.48)
    ctx.fillStyle = '#334155'
    ctx.font = `600 ${Math.max(11, Math.round(lh * 0.115))}px Inter, Arial, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('ADEO SERVICES · 135 RUE SADI CARNOT', triX, ly + lh - 22)
    ctx.fillText(`CS00001 · 59790 RONCHIN · ${mode} ${ratedA}A ${sectionMm2}mm²`, triX, ly + lh - 7)

    // Código de barras EAN-13 no canto superior direito da etiqueta
    const bcW = lw * 0.33
    const bcX = lx + lw - bcW - 18
    drawBarcode(ctx, bcX, ly + 8, bcW, lh * 0.54, `32760077${code.slice(-5)}`)

    // Mini bandeira tricolor FR + patilha magenta "open" no canto inferior direito
    const fx = bcX + bcW * 0.44
    const fy = ly + lh - 26
    ctx.fillStyle = '#334155'
    ctx.font = '700 9px Inter, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('FRANCE', fx + 21, fy - 3)
    ctx.fillStyle = '#0055a4'
    ctx.fillRect(fx, fy, 14, 16)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(fx + 14, fy, 14, 16)
    ctx.fillStyle = '#ef4135'
    ctx.fillRect(fx + 28, fy, 14, 16)
    ctx.strokeStyle = '#cbd5e1'
    ctx.strokeRect(fx, fy, 42, 16)

    // Patilha rosa "open" de destacar etiqueta
    ctx.fillStyle = '#db2777'
    ctx.beginPath()
    ctx.moveTo(lx + lw - 28, ly + lh)
    ctx.lineTo(lx + lw, ly + lh - 28)
    ctx.lineTo(lx + lw, ly + lh)
    ctx.closePath()
    ctx.fill()

    // Serigrafia preta direta no PVC cinzento à direita da etiqueta
    const rx = lx + lw + 34
    drawLexmanWordmark(ctx, rx, mainCy + 2, mainH * 0.31, false)
    ctx.fillStyle = '#262b33'
    ctx.font = `500 ${Math.round(mainH * 0.19)}px Inter, Arial, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('Made in France', rx + W * 0.135, mainCy - mainH * 0.11)
    ctx.font = `700 ${Math.round(mainH * 0.2)}px Inter, Arial, sans-serif`
    ctx.fillText(modeShortSpec(mode, ratedA, sectionMm2), rx + W * 0.135, mainCy + mainH * 0.19)

    // Código de lote gravado a laser + ícone REEE na ponta direita
    ctx.fillStyle = '#374151'
    ctx.font = `500 ${Math.round(mainH * 0.17)}px ui-monospace, monospace`
    ctx.fillText(`IEC 60947`, W * 0.855, mainCy - mainH * 0.1)
    ctx.fillText(`${poles}M · Cu`, W * 0.855, mainCy + mainH * 0.18)
    drawWeeeIcon(ctx, W * 0.962, mainCy, mainH * 0.68)
    return
  }

  if (brand === 'sibratec') {
    // Fiel à foto IMG_5790: serigrafia cinzento-grafite industrial SIBRATEC + "2 PÓLOS - 63A" + código de barras!
    drawCeMark(ctx, W * 0.03, mainCy, mainH * 0.28, '#3a414a')
    drawBoltTriangle(ctx, W * 0.12, mainCy, mainH * 0.56, true)

    const sx = compact ? W * 0.2 : W * 0.19
    ctx.fillStyle = '#384049'
    ctx.font = `800 ${Math.round(mainH * 0.38)}px Inter, Arial, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('SIBRATEC', sx, mainCy - 2)
    ctx.font = `700 ${Math.round(mainH * 0.24)}px Inter, Arial, sans-serif`
    ctx.fillStyle = '#47515c'
    ctx.fillText(modeTitlePt(mode, ratedA), sx, mainCy + mainH * 0.32)

    if (!compact) {
      drawBarcode(ctx, W * 0.44, mainTop + mainH * 0.12, W * 0.2, mainH * 0.76, `789864044${ratedA}${String(poles).padStart(2, '0')}`, '#3b434d')
      ctx.fillStyle = '#3a414a'
      ctx.font = `700 ${Math.round(mainH * 0.22)}px Inter, Arial, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${code} · ${sectionMm2}mm² Cu`, W * 0.68, mainCy - mainH * 0.14)
      ctx.font = `600 ${Math.round(mainH * 0.19)}px Inter, Arial, sans-serif`
      ctx.fillStyle = '#4b5563'
      ctx.fillText(`230/400V~ · 50/60Hz · IEC 60947-7-1`, W * 0.68, mainCy + mainH * 0.18)
      drawWeeeIcon(ctx, W * 0.96, mainCy, mainH * 0.64, '#3a414a')
    }
    return
  }

  if (brand === 'schneider') {
    // Acti9 industrial (imagem 42): verde Schneider #009530 + A9XPC712 / A9XPH… + Ui 400V~ / 500V~ + barcode + CE
    ctx.fillStyle = '#009530'
    ctx.font = `800 ${Math.round(mainH * 0.36)}px Inter, Arial, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('Schneider', W * 0.03, mainCy - mainH * 0.1)
    ctx.font = `600 ${Math.round(mainH * 0.2)}px Inter, Arial, sans-serif`
    ctx.fillText('Electric · Acti9', W * 0.03, mainCy + mainH * 0.22)

    if (!compact) {
      ctx.fillStyle = '#1e293b'
      ctx.font = `800 ${Math.round(mainH * 0.3)}px Inter, Arial, sans-serif`
      ctx.fillText(code, W * 0.22, mainCy - mainH * 0.1)
      ctx.font = `700 ${Math.round(mainH * 0.2)}px Inter, Arial, sans-serif`
      ctx.fillStyle = '#334155'
      ctx.fillText(mode === '1P+N-3P' ? '80A · 16mm² Cu' : modeShortSpec(mode, ratedA, sectionMm2), W * 0.22, mainCy + mainH * 0.22)

      drawBarcode(ctx, W * 0.38, mainTop + mainH * 0.12, W * 0.16, mainH * 0.74, `360648079${ratedA}${String(poles).padStart(2, '0')}`, '#1e293b')

      ctx.fillStyle = '#334155'
      ctx.font = `600 ${Math.round(mainH * 0.2)}px Inter, Arial, sans-serif`
      ctx.fillText(`Ui 400V~ · Isc 25kA · IEC 60439-1`, W * 0.58, mainCy - mainH * 0.1)
      ctx.fillText(`NÃO CORTAR SOB TENSÃO · ${poles} P`, W * 0.58, mainCy + mainH * 0.2)
      drawCeMark(ctx, W * 0.88, mainCy, mainH * 0.25, '#1e293b')
      drawWeeeIcon(ctx, W * 0.965, mainCy, mainH * 0.62, '#1e293b')
    } else {
      ctx.fillStyle = '#1e293b'
      ctx.font = `700 ${Math.round(mainH * 0.26)}px Inter, Arial, sans-serif`
      ctx.fillText(`${code} · ${mode} ${ratedA}A`, W * 0.5, mainCy)
    }
    return
  }

  // Legrand HX³ (vermelho #d9272e + código 4049/4050/4051/4052 + especificações IEC)
  ctx.fillStyle = '#d9272e'
  roundRect(ctx, W * 0.028, mainCy - mainH * 0.24, mainH * 0.44, mainH * 0.48, 4)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 ${Math.round(mainH * 0.32)}px Inter, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('L', W * 0.028 + mainH * 0.22, mainCy + 1)

  ctx.fillStyle = '#1f242b'
  ctx.font = `800 ${Math.round(mainH * 0.36)}px Inter, Arial, sans-serif`
  ctx.textAlign = 'left'
  ctx.fillText('legrand', W * 0.068, mainCy + 1)

  if (!compact) {
    ctx.fillStyle = '#1e293b'
    ctx.font = `800 ${Math.round(mainH * 0.28)}px ui-monospace, monospace`
    ctx.fillText(`HX³ ${code}`, W * 0.25, mainCy - mainH * 0.11)
    ctx.font = `700 ${Math.round(mainH * 0.21)}px Inter, Arial, sans-serif`
    ctx.fillStyle = '#334155'
    ctx.fillText(modeShortSpec(mode, ratedA, sectionMm2), W * 0.25, mainCy + mainH * 0.21)

    drawBoltTriangle(ctx, W * 0.55, mainCy, mainH * 0.58, true)
    drawBarcode(ctx, W * 0.61, mainTop + mainH * 0.12, W * 0.21, mainH * 0.76, `324506405${ratedA}${String(poles).padStart(2, '0')}`)
    drawCeMark(ctx, W * 0.86, mainCy, mainH * 0.26, '#1f242b')
    drawWeeeIcon(ctx, W * 0.96, mainCy, mainH * 0.64, '#1f242b')
  } else {
    ctx.font = `700 ${Math.round(mainH * 0.25)}px Inter, Arial, sans-serif`
    ctx.fillText(`${mode} · ${ratedA}A`, W * 0.52, mainCy)
  }
}

function drawLexmanWordmark(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  fontPx: number,
  withMagentaDot: boolean,
): void {
  ctx.save()
  ctx.font = `800 ${Math.round(fontPx)}px Inter, Arial, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  if (withMagentaDot) {
    const w = ctx.measureText('LEXman').width
    ctx.fillStyle = '#e11d48'
    ctx.beginPath()
    ctx.arc(x + w * 0.89, cy + 1, fontPx * 0.56, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#242930'
  ctx.fillText('LEXma', x, cy)
  const prefixW = ctx.measureText('LEXma').width
  ctx.fillStyle = withMagentaDot ? '#ffffff' : '#242930'
  ctx.fillText('n', x + prefixW, cy)
  ctx.restore()
}

function drawToothPhaseBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  conductor: CombConductor,
  mode: CombBusbarMode,
  bandH: number,
  poles: number,
  brand: CombBrandStyle = 'lexman',
): void {
  const isNeutral = conductor === 'N'
  const pillW = Math.min(poles > 16 ? 48 : 62, bandH * 1.38)
  const pillH = bandH * 0.72
  ctx.save()

  // Schneider Acti9 (imagem 42): círculo preto com "N" branco + "L1", "L2", "L3" a preto grafite
  if (brand === 'schneider' || mode === '1P+N-3P') {
    if (isNeutral) {
      const radius = Math.min(pillH * 0.46, pillW * 0.46)
      ctx.fillStyle = '#1e293b'
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = `900 ${Math.round(radius * 1.25)}px Inter, Arial, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('N', cx, cy + 1)
      ctx.restore()
      return
    }
    ctx.fillStyle = '#1e293b'
    ctx.font = `900 ${Math.round(bandH * 0.44)}px Inter, Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(conductor, cx, cy + 1)
    ctx.restore()
    return
  }

  if (isNeutral) {
    // Marcação azul normalizada IEC 60446 sobre cada dente de Neutro (N)
    ctx.fillStyle = '#1d63c2'
    roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, 6)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
  } else if (mode !== '1P') {
    const bg = conductor === 'L1' ? '#6d3713' : conductor === 'L2' ? '#1f242c' : '#4b5563'
    ctx.fillStyle = bg
    roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, 6)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
  } else {
    ctx.fillStyle = '#334155'
  }
  const text = mode === '1P' ? 'L' : mode === '1P+N' && conductor === 'L1' ? 'L' : conductor
  ctx.font = `800 ${Math.round(bandH * 0.48)}px Inter, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy + 1)
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * Gravação/serigrafia frontal do capuz do conector de alimentação (`6-25□ · 80A`, foto IMG_5789!),
 * com contraste adaptativo automático sobre corpos claros (branco/amarelo) ou escuros (preto/azul/castanho).
 */
export function getCombConnectorStampTexture(state?: Record<string, unknown>): THREE.CanvasTexture {
  const gaugeId = combConnectorGaugeOf(state)
  const color = combConnectorColorOf(state)
  const spec = COMB_CONNECTOR_GAUGES.find((g) => g.id === gaugeId) ?? COMB_CONNECTOR_GAUGES[1]
  const key = `${gaugeId}|${color}`
  const hit = stampCache.get(key)
  if (hit) return hit

  const c = new THREE.Color(color)
  const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
  const lightBody = lum > 0.45

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 256, 64)

  // Efeito de baixo-relevo moldado no PA66 + serigrafia subtil legível
  ctx.font = '800 30px Inter, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = lightBody ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)'
  ctx.fillText(`${spec.stamp} ${spec.ratedA}A`, 129, 35)
  ctx.fillStyle = lightBody ? 'rgba(55,65,81,0.72)' : 'rgba(241,245,249,0.82)'
  ctx.fillText(`${spec.stamp} ${spec.ratedA}A`, 128, 33)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  stampCache.set(key, tex)
  return tex
}

/** Textura PBR procedural de cobre eletrolítico escovado Cu-ETP (complemento de `/textures/lib/cobre`). */
export function brushedElectrolyticCopperMaps(): {
  color: THREE.CanvasTexture
  bump: THREE.CanvasTexture
  rough: THREE.CanvasTexture
} {
  const cc = procCache.get('cu-c')
  const cb = procCache.get('cu-b')
  const cr = procCache.get('cu-r')
  if (cc && cb && cr) return { color: cc, bump: cb, rough: cr }

  const S = 256
  const elC = document.createElement('canvas')
  const elB = document.createElement('canvas')
  const elR = document.createElement('canvas')
  elC.width = elC.height = elB.width = elB.height = elR.width = elR.height = S
  const gc = elC.getContext('2d')!
  const gb = elB.getContext('2d')!
  const gr = elR.getContext('2d')!
  const rand = prng(7331)

  gc.fillStyle = '#cf7742'
  gc.fillRect(0, 0, S, S)
  gb.fillStyle = '#808080'
  gb.fillRect(0, 0, S, S)
  gr.fillStyle = '#4e4e4e'
  gr.fillRect(0, 0, S, S)

  // Estrias finas de laminagem/escovagem do cobre eletrolítico
  for (let i = 0; i < 1200; i++) {
    const x = rand() * S
    const y = rand() * S
    const len = 32 + rand() * 160
    const hi = rand() > 0.45
    const a = 0.05 + rand() * 0.14
    gc.strokeStyle = hi ? `rgba(255,204,166,${a})` : `rgba(128,54,22,${a})`
    gc.lineWidth = 0.55 + rand() * 0.9
    gc.beginPath()
    gc.moveTo(x, y)
    gc.lineTo(x, y + len)
    gc.stroke()

    const bv = hi ? 178 : 82
    gb.strokeStyle = `rgba(${bv},${bv},${bv},${a * 1.3})`
    gb.lineWidth = 0.7
    gb.beginPath()
    gb.moveTo(x, y)
    gb.lineTo(x, y + len)
    gb.stroke()

    const rv = hi ? 52 : 116
    gr.strokeStyle = `rgba(${rv},${rv},${rv},${a})`
    gr.lineWidth = 0.85
    gb.stroke()
  }

  const mk = (el: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(el)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    return t
  }
  const color = mk(elC, true)
  const bump = mk(elB, false)
  const rough = mk(elR, false)
  procCache.set('cu-c', color)
  procCache.set('cu-b', bump)
  procCache.set('cu-r', rough)
  return { color, bump, rough }
}

/** Mapa de relevo estriado horizontal do pino de cobre estanhado (foto IMG_5789!). */
export function serratedTinnedBladeBump(): THREE.CanvasTexture {
  const hit = procCache.get('tin-serrated-b')
  if (hit) return hit
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  const rand = prng(2089)
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, S, S)

  // Estrias horizontais estampadas periódicas + micro-grão de estanhagem eletrolítica
  const bands = 18
  const bandH = S / bands
  for (let b = 0; b < bands; b++) {
    const y = b * bandH
    const g = ctx.createLinearGradient(0, y, 0, y + bandH)
    g.addColorStop(0, '#4a4a4a')
    g.addColorStop(0.32, '#d8d8d8')
    g.addColorStop(0.62, '#c8c8c8')
    g.addColorStop(1, '#424242')
    ctx.fillStyle = g
    ctx.fillRect(0, y, S, bandH)
  }
  for (let i = 0; i < 600; i++) {
    const v = rand() > 0.5 ? 225 : 55
    ctx.fillStyle = `rgba(${v},${v},${v},0.09)`
    ctx.fillRect(rand() * S, rand() * S, 2 + rand() * 8, 1.2)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.needsUpdate = true
  procCache.set('tin-serrated-b', tex)
  return tex
}

/**
 * Aplica a serigrafia real e o acabamento metálico de cobre/estanho sobre um clone GLB
 * de `busbarComb` ou `combBusbarConnector` (usado na mesa rotativa 360°, capas de catálogo e 2D).
 */
export function applyCombBusbarFinish(
  type: string,
  root: THREE.Object3D,
  state?: Record<string, unknown>,
): void {
  if (type === 'busbarComb') {
    const silkTex = getCombBusbarSilkscreenTexture(state)
    const cu = brushedElectrolyticCopperMaps()
    const tinBump = serratedTinnedBladeBump()
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      if (mesh.name === 'comb-silkscreen-front') {
        mesh.material = new THREE.MeshStandardMaterial({
          map: silkTex,
          roughness: 0.36,
          metalness: 0.02,
        })
      } else if (mesh.name === 'comb-copper-bars-pins') {
        mesh.material = new THREE.MeshStandardMaterial({
          color: '#ea9966',
          map: cu.color,
          bumpMap: cu.bump,
          bumpScale: 0.0005,
          roughnessMap: cu.rough,
          roughness: 0.25,
          metalness: 0.83,
        })
      } else if (mesh.name === 'comb-feed-tinned-pins') {
        mesh.material = new THREE.MeshStandardMaterial({
          color: '#e2e6ec',
          bumpMap: tinBump,
          bumpScale: 0.0007,
          roughness: 0.2,
          metalness: 0.94,
        })
      }
    })
  } else if (type === 'combBusbarConnector') {
    const color = combConnectorColorOf(state)
    const stampTex = getCombConnectorStampTexture(state)
    const tinBump = serratedTinnedBladeBump()
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      if (mesh.name === 'comb-connector-pa66') {
        mesh.material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.4,
          metalness: 0.02,
        })
      } else if (mesh.name === 'comb-connector-tinned-pin') {
        mesh.material = new THREE.MeshStandardMaterial({
          color: '#eef2f6',
          bumpMap: tinBump,
          bumpScale: 0.0007,
          roughness: 0.24,
          metalness: 0.82,
        })
      } else if (mesh.name === 'comb-connector-cage') {
        mesh.material = new THREE.MeshStandardMaterial({
          color: '#e6d089',
          roughness: 0.28,
          metalness: 0.82,
        })
      } else if (mesh.name === 'comb-connector-stamp') {
        mesh.material = new THREE.MeshStandardMaterial({
          map: stampTex,
          transparent: true,
          roughness: 0.45,
          metalness: 0.0,
          depthWrite: false,
        })
      }
    })
  }
}
