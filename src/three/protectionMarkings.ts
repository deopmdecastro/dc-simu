import * as THREE from 'three'
import type { ComponentType } from '../types'
import {
  GV2ME_RANGES,
  PKZM_RANGES,
  easy9CatalogCode,
  formatAmpPt,
  formatIcnBox,
  hagerRcdCatalogCode,
  hasCustomRatingOverride,
  readProtectionRatings,
} from '../electrical/protectionSpecs'

const MARKING_TAG = '__dcProtectionMarking'
const MAX_TEXTURE_CACHE = 96
const textureCache = new Map<string, THREE.CanvasTexture>()

export function cachedCanvasTexture(
  key: string,
  widthPx: number,
  heightPx: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const hit = textureCache.get(key)
  if (hit) return hit
  if (textureCache.size >= MAX_TEXTURE_CACHE) {
    const oldest = textureCache.keys().next().value
    if (oldest) {
      textureCache.get(oldest)?.dispose()
      textureCache.delete(oldest)
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, widthPx, heightPx)
  draw(ctx, widthPx, heightPx)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  textureCache.set(key, tex)
  return tex
}

function makePlateMesh(
  tex: THREE.CanvasTexture,
  wMm: number,
  hMm: number,
  posMm: [number, number, number],
  unitsPerMm: number,
  rotX = 0,
  transparent = true,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(wMm * unitsPerMm, hMm * unitsPerMm)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent,
    alphaTest: transparent ? 0.04 : 0,
    roughness: 0.48,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  mat.userData.keepTransparent = transparent
  mat.userData.protectionMarking = true
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = MARKING_TAG
  mesh.userData.protectionMarking = true
  mesh.position.set(posMm[0] * unitsPerMm, posMm[1] * unitsPerMm, posMm[2] * unitsPerMm)
  if (rotX) mesh.rotation.x = rotX
  mesh.raycast = () => null
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
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

function drawStatusPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  closed: boolean,
  tripped: boolean,
) {
  const fill = tripped ? '#d97706' : closed ? '#dc2626' : '#15803d'
  const text = tripped ? 'TRIP' : closed ? 'I · ON' : 'O · OFF'
  roundRect(ctx, x, y, w, h, Math.min(8, h * 0.25))
  ctx.fillStyle = fill
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${Math.round(h * 0.64)}px "Inter", "Arial", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + h / 2 + 1)
}

function drawBreakerSchematic(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, poles: number) {
  ctx.save()
  ctx.strokeStyle = '#334155'
  ctx.fillStyle = '#334155'
  ctx.lineWidth = 3.2
  ctx.font = '700 22px "Inter", "Arial", sans-serif'
  ctx.textAlign = 'center'
  for (let i = 0; i < poles; i += 1) {
    const px = x + ((i + 0.5) * w) / poles
    const topNum = String(i * 2 + 1)
    const botNum = String(i * 2 + 2)
    ctx.fillText(topNum, px, y + 18)
    // haste superior + cruz de corte
    ctx.beginPath()
    ctx.moveTo(px, y + 26)
    ctx.lineTo(px, y + h * 0.36)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(px - 6, y + h * 0.36 - 6)
    ctx.lineTo(px + 6, y + h * 0.36 + 6)
    ctx.moveTo(px + 6, y + h * 0.36 - 6)
    ctx.lineTo(px - 6, y + h * 0.36 + 6)
    ctx.stroke()
    // lâmina de contacto
    ctx.beginPath()
    ctx.moveTo(px - 11, y + h * 0.54)
    ctx.lineTo(px, y + h * 0.36)
    ctx.moveTo(px, y + h * 0.56)
    ctx.lineTo(px, y + h - 26)
    ctx.stroke()
    // disparador térmico/magnético estilizado
    ctx.strokeRect(px - 8, y + h * 0.61, 16, h * 0.14)
    ctx.fillText(botNum, px, y + h - 6)
  }
  if (poles > 1) {
    ctx.save()
    ctx.setLineDash([6, 5])
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(x + (0.5 * w) / poles - 6, y + h * 0.45)
    ctx.lineTo(x + ((poles - 0.5) * w) / poles - 6, y + h * 0.45)
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

function drawTerminalStrip(
  key: string,
  items: ReadonlyArray<{ xNorm: number; label: string; color?: string }>,
  wMm: number,
  hMm: number,
): THREE.CanvasTexture | null {
  const wPx = Math.max(192, Math.round(wMm * 14))
  const hPx = Math.max(64, Math.round(hMm * 16))
  return cachedCanvasTexture(`terms:${key}`, wPx, hPx, (ctx, w, h) => {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const item of items) {
      const cx = item.xNorm * w
      const cy = h * 0.52
      if (item.color === '#0067b8' || item.color === '#0072ce') {
        const bw = Math.max(h * 0.9, item.label.length * h * 0.56)
        roundRect(ctx, cx - bw / 2, h * 0.1, bw, h * 0.8, 8)
        ctx.fillStyle = item.color
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = `800 ${Math.round(h * 0.62)}px "Inter", "Arial", sans-serif`
        ctx.fillText(item.label, cx, cy + 1)
      } else {
        ctx.fillStyle = item.color ?? '#1e293b'
        ctx.font = `800 ${Math.round(h * 0.66)}px "Inter", "Arial", sans-serif`
        ctx.fillText(item.label, cx, cy)
      }
    }
  })
}

function drawRcdTypeSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rcdType: string) {
  ctx.save()
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 3
  ctx.strokeRect(x, y, w, h)
  // onda sinusoidal superior
  const sy = rcdType === 'AC' ? y + h * 0.5 : y + h * 0.34
  ctx.beginPath()
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24
    const px = x + w * 0.14 + t * w * 0.72
    const py = sy - Math.sin(t * Math.PI * 2) * (h * 0.18)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  if (rcdType === 'A' || rcdType === 'F') {
    // meia-onda pulsante
    const py0 = y + h * 0.76
    ctx.beginPath()
    ctx.moveTo(x + w * 0.14, py0)
    ctx.quadraticCurveTo(x + w * 0.32, py0 - h * 0.28, x + w * 0.5, py0)
    ctx.lineTo(x + w * 0.86, py0)
    ctx.stroke()
  } else if (rcdType === 'B') {
    // linha contínua + tracejada (CC alisada)
    ctx.beginPath()
    ctx.moveTo(x + w * 0.14, y + h * 0.64)
    ctx.lineTo(x + w * 0.86, y + h * 0.64)
    ctx.stroke()
    ctx.setLineDash([6, 5])
    ctx.beginPath()
    ctx.moveTo(x + w * 0.14, y + h * 0.8)
    ctx.lineTo(x + w * 0.86, y + h * 0.8)
    ctx.stroke()
  }
  ctx.restore()
}

function buildEasy9Markings(type: 'breaker1p' | 'breaker2p' | 'breaker3p', state: Record<string, unknown> | undefined, u: number): THREE.Object3D[] {
  const poles = type === 'breaker1p' ? 1 : type === 'breaker2p' ? 2 : 3
  const r = readProtectionRatings(type, state)
  const ampTxt = formatAmpPt(r.inA)
  const rating = `${r.curve}${ampTxt}`
  const icnBox = formatIcnBox(r.icn)
  const code = easy9CatalogCode(poles, r.curve, r.inA)
  const ue = poles === 1 ? '230/400V~' : '400V~'
  const frontZ = poles === 1 ? 29.36 : 28.94
  const lowerZ = poles === 1 ? 30.22 : 29.80
  const termTopZ = poles === 1 ? 12.18 : 11.76
  const termBotZ = poles === 1 ? 12.96 : 12.54
  const out: THREE.Object3D[] = []

  const wMm = poles === 1 ? 16.4 : poles === 2 ? 34.4 : 52.2
  const hMm = 20.0
  const wPx = poles * 256
  const hPx = 320
  const mainKey = `ez9:${poles}:${rating}:${icnBox}:${r.closed ? 1 : 0}:${r.tripped ? 1 : 0}`
  const mainTex = cachedCanvasTexture(mainKey, wPx, hPx, (ctx, w, h) => {
    // Fundo marfim Schneider ligeiramente acetinado para leitura impecável.
    ctx.fillStyle = '#eeede8'
    ctx.fillRect(0, 0, w, h)
    // Linhas subtis de junção entre módulos 18 mm.
    if (poles > 1) {
      ctx.strokeStyle = 'rgba(100,116,139,0.22)'
      ctx.lineWidth = 2
      for (let i = 1; i < poles; i += 1) {
        ctx.beginPath()
        ctx.moveTo((i * w) / poles, 0)
        ctx.lineTo((i * w) / poles, h)
        ctx.stroke()
      }
    }
    // Faixa superior verde Schneider Electric.
    const bandH = 54
    ctx.fillStyle = '#009530'
    ctx.fillRect(0, 0, poles === 1 ? w : w / poles, bandH)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = '800 26px "Inter", "Arial", sans-serif'
    ctx.fillText('Schneider', 12, bandH * 0.44)
    ctx.font = '600 15px "Inter", "Arial", sans-serif'
    ctx.fillText('Electric', 112, bandH * 0.78)

    if (poles === 1) {
      ctx.fillStyle = '#009530'
      ctx.font = '800 28px "Inter", "Arial", sans-serif'
      ctx.fillText('Easy9', 14, 84)
      ctx.fillStyle = '#0f172a'
      ctx.font = '900 58px "Inter", "Arial", sans-serif'
      ctx.fillText(rating, 12, 138)
      ctx.fillStyle = '#334155'
      ctx.font = '700 22px "Inter", "Arial", sans-serif'
      ctx.fillText(ue, 14, 178)
      // Caixa poder de corte [4500] [3]
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 3
      ctx.strokeRect(14, 198, 92, 34)
      ctx.font = '800 23px "Inter", "Arial", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#0f172a'
      ctx.fillText(icnBox, 60, 216)
      ctx.strokeRect(114, 198, 32, 34)
      ctx.fillText('3', 130, 216)
      ctx.textAlign = 'left'
      ctx.font = '600 18px "Inter", "Arial", sans-serif'
      ctx.fillStyle = '#475569'
      ctx.fillText('IEC 60898-1', 14, 250)
      drawStatusPill(ctx, 22, h - 50, w - 44, 38, r.closed, r.tripped)
    } else {
      // Polo 1: Easy9 + calibre C16/C25 + tensão + [4500][3] + IEC 60898-1
      const pw = w / poles
      ctx.fillStyle = '#009530'
      ctx.font = '800 32px "Inter", "Arial", sans-serif'
      ctx.fillText('Easy9', 16, 88)
      ctx.fillStyle = '#0f172a'
      ctx.font = '900 62px "Inter", "Arial", sans-serif'
      ctx.fillText(rating, 14, 146)
      ctx.fillStyle = '#334155'
      ctx.font = '700 24px "Inter", "Arial", sans-serif'
      ctx.fillText(`${ue} 50/60Hz`, 16, 186)
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 3
      ctx.strokeRect(16, 204, 96, 34)
      ctx.textAlign = 'center'
      ctx.font = '800 23px "Inter", "Arial", sans-serif'
      ctx.fillStyle = '#0f172a'
      ctx.fillText(icnBox, 64, 222)
      ctx.strokeRect(120, 204, 34, 34)
      ctx.fillText('3', 137, 222)
      ctx.textAlign = 'left'
      ctx.font = '700 18px "Inter", "Arial", sans-serif'
      ctx.fillStyle = '#475569'
      ctx.fillText('IEC 60898-1', 16, 254)

      // Faixa superior cinza clara nos restantes polos com referência e I·ON.
      ctx.fillStyle = '#334155'
      ctx.font = '700 22px "Inter", "Arial", sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(code, w - 16, 30)
      if (poles >= 3) {
        ctx.textAlign = 'left'
        ctx.fillStyle = '#64748b'
        ctx.font = '700 20px "Inter", "Arial", sans-serif'
        ctx.fillText(`MCB ${poles}P · In ${ampTxt}A`, pw + 16, 30)
      }

      // Esquema unifilar/multifilar IEC gravado nos polos da direita.
      const diagX = poles === 2 ? pw + 24 : pw * 1.45
      const diagW = poles === 2 ? pw - 48 : pw * 1.42
      drawBreakerSchematic(ctx, diagX, 58, diagW, 194, poles)
      if (poles === 3) {
        ctx.fillStyle = '#334155'
        ctx.font = '700 21px "Inter", "Arial", sans-serif'
        ctx.fillText(`Curva ${r.curve}`, pw + 16, 92)
        ctx.font = '600 19px "Inter", "Arial", sans-serif'
        ctx.fillStyle = '#475569'
        ctx.fillText(`Ui 500V`, pw + 16, 122)
        ctx.fillText(`Uimp 4kV`, pw + 16, 150)
        ctx.fillText(`Icn ${r.icn}`, pw + 16, 178)
      }

      // Janelas mecânicas de estado sobre cada alavanca.
      for (let i = 0; i < poles; i += 1) {
        drawStatusPill(ctx, i * pw + 28, h - 50, pw - 56, 38, r.closed, r.tripped)
      }
    }
  })
  if (mainTex) out.push(makePlateMesh(mainTex, wMm, hMm, [0, 53.7, frontZ], u, 0, false))

  // Faixa inferior discreta com código comercial.
  const codeTex = cachedCanvasTexture(`ez9code:${poles}:${code}:${rating}`, poles * 200, 56, (ctx, w, h) => {
    ctx.fillStyle = '#475569'
    ctx.font = '700 24px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(poles === 1 ? code : `${code}  ·  ${rating}  ·  ${r.icn}`, w / 2, h / 2)
  })
  if (codeTex) out.push(makePlateMesh(codeTex, wMm - 1.2, 3.8, [0, 27.6, lowerZ], u))

  // Numeração dos bornes superior (1, 3, 5) e inferior (2, 4, 6).
  const topTerms = Array.from({ length: poles }, (_, i) => ({ xNorm: (i + 0.5) / poles, label: String(i * 2 + 1) }))
  const botTerms = Array.from({ length: poles }, (_, i) => ({ xNorm: (i + 0.5) / poles, label: String(i * 2 + 2) }))
  const topTex = drawTerminalStrip(`ez9t:${poles}`, topTerms, wMm, 3.8)
  const botTex = drawTerminalStrip(`ez9b:${poles}`, botTerms, wMm, 3.8)
  if (topTex) out.push(makePlateMesh(topTex, wMm, 3.8, [0, 69.8, termTopZ], u))
  if (botTex) out.push(makePlateMesh(botTex, wMm, 3.8, [0, 16.0, termBotZ], u))
  return out
}

function buildHagerRcdMarkings(state: Record<string, unknown> | undefined, u: number): THREE.Object3D[] {
  const r = readProtectionRatings('residualBreakerHagerCfc225p', state)
  const code = hagerRcdCatalogCode(r.inA, r.sensmA, r.rcdType)
  const idnA = (r.sensmA / 1000).toFixed(r.sensmA < 100 ? 2 : 2).replace('.', ',')
  const ampTxt = formatAmpPt(r.inA)
  const out: THREE.Object3D[] = []

  // Placa superior inclinada (:hager + bornes 1 e 3/N + indicação do botão azul T).
  const upTex = cachedCanvasTexture('hager:top:v2', 512, 112, (ctx, w, h) => {
    ctx.fillStyle = '#dadad0'
    ctx.fillRect(0, 0, w, h)
    // Marca :hager em azul-marinho
    ctx.fillStyle = '#005596'
    ctx.beginPath()
    ctx.arc(24, h * 0.42, 6, 0, Math.PI * 2)
    ctx.arc(24, h * 0.66, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0f2942'
    ctx.font = '900 44px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('hager', 38, h * 0.54)
    // Indicação de polo 1 e TEST T sobre o botão azul à direita
    ctx.fillStyle = '#0067b8'
    roundRect(ctx, w - 168, 18, 148, 44, 8)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 24px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('T · TEST ▾', w - 94, 41)
    ctx.fillStyle = '#334155'
    ctx.font = '700 20px "Inter", "Arial", sans-serif'
    ctx.fillText('testar regularm.', w - 94, 84)
  })
  if (upTex) out.push(makePlateMesh(upTex, 33.4, 6.8, [0, 63.7, 28.10], u, 0.065, false))

  // Etiqueta lateral direita da alavanca (estado I·ON / O·OFF / DISPARO).
  const midKey = `hager:mid:${r.closed ? 1 : 0}:${r.tripped ? 1 : 0}`
  const midTex = cachedCanvasTexture(midKey, 240, 140, (ctx, w, h) => {
    drawStatusPill(ctx, 14, 14, w - 28, 52, r.closed, r.tripped)
    ctx.fillStyle = '#1e293b'
    ctx.font = '800 24px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(r.tripped ? 'REARMAR' : 'ID · 2P', w / 2, 102)
  })
  if (midTex) out.push(makePlateMesh(midTex, 12.2, 6.8, [8.6, 46.2, 31.74], u))

  // Placa inferior principal (CFC225P · In 25 A · IΔn 0,30 A · tipo AC/A/F/B · esquema diferencial).
  const lowKey = `hager:low:${code}:${ampTxt}:${r.sensmA}:${r.rcdType}`
  const lowTex = cachedCanvasTexture(lowKey, 540, 210, (ctx, w, h) => {
    ctx.fillStyle = '#dadad0'
    ctx.fillRect(0, 0, w, h)
    // Linha de topo com referência comercial e calibre destacado
    ctx.fillStyle = '#0f172a'
    ctx.font = '800 28px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(code, 16, 28)

    ctx.font = '900 42px "Inter", "Arial", sans-serif'
    ctx.fillStyle = '#0f172a'
    ctx.fillText(`${ampTxt} A`, 16, 74)

    // Badge azul Hager para sensibilidade IΔn (espaçado para qualquer calibre 10..500 mA)
    roundRect(ctx, 136, 48, 224, 48, 8)
    ctx.fillStyle = '#0067b8'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 22px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`IΔn ${idnA}A · ${r.sensmA}mA`, 248, 73)

    // Tensão, norma e poder de corte condicional [6000]
    ctx.textAlign = 'left'
    ctx.fillStyle = '#1e293b'
    ctx.font = '700 22px "Inter", "Arial", sans-serif'
    ctx.fillText('230 V~  50/60Hz', 16, 118)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.8
    ctx.strokeRect(16, 140, 86, 34)
    ctx.textAlign = 'center'
    ctx.font = '800 22px "Inter", "Arial", sans-serif'
    ctx.fillText('6000', 59, 158)
    // Símbolo IEC do tipo diferencial (AC / A / F / B)
    drawRcdTypeSymbol(ctx, 114, 136, 76, 42, r.rcdType)
    ctx.fillStyle = '#0f172a'
    ctx.font = '800 21px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`Tipo ${r.rcdType}`, 200, 158)
    ctx.fillStyle = '#475569'
    ctx.font = '600 18px "Inter", "Arial", sans-serif'
    ctx.fillText('IEC/EN 61008-1 · Im 500A', 16, 192)

    // Esquema elétrico do diferencial 2P com toro e circuito de teste T (lado direito)
    const sx = 376
    ctx.strokeStyle = '#1e293b'
    ctx.fillStyle = '#1e293b'
    ctx.lineWidth = 3
    ctx.font = '700 19px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('1', sx + 28, 22)
    ctx.fillStyle = '#0067b8'
    ctx.fillText('N', sx + 96, 22)
    // Polos 1-2 e N1-N2
    for (const px of [sx + 28, sx + 96]) {
      ctx.beginPath()
      ctx.moveTo(px, 30)
      ctx.lineTo(px, 64)
      ctx.moveTo(px - 11, 96)
      ctx.lineTo(px, 64)
      ctx.moveTo(px, 98)
      ctx.lineTo(px, 174)
      ctx.stroke()
    }
    // Toro diferencial a abraçar os dois condutores
    ctx.beginPath()
    ctx.ellipse(sx + 62, 138, 52, 14, 0, 0, Math.PI * 2)
    ctx.stroke()
    // Circuito do botão T + resistência
    ctx.strokeStyle = '#0067b8'
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.moveTo(sx + 28, 46)
    ctx.lineTo(sx + 138, 46)
    ctx.lineTo(sx + 138, 162)
    ctx.lineTo(sx + 96, 162)
    ctx.stroke()
    ctx.fillStyle = '#0067b8'
    ctx.fillRect(sx + 130, 82, 16, 34)
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 18px "Inter", "Arial", sans-serif'
    ctx.fillText('T', sx + 138, 100)
    ctx.fillStyle = '#1e293b'
    ctx.font = '700 19px "Inter", "Arial", sans-serif'
    ctx.fillText('2', sx + 28, 192)
    ctx.fillStyle = '#0067b8'
    ctx.fillText('N', sx + 96, 192)
  })
  if (lowTex) out.push(makePlateMesh(lowTex, 33.4, 12.6, [0, 31.8, 28.22], u, -0.065, false))

  // Identificação clara dos bornes superiores (1 | N) e inferiores (2 | N).
  const topTex = drawTerminalStrip('hager:t', [
    { xNorm: 0.264, label: '1' },
    { xNorm: 0.736, label: 'N', color: '#0067b8' },
  ], 33, 4.4)
  const botTex = drawTerminalStrip('hager:b', [
    { xNorm: 0.264, label: '2' },
    { xNorm: 0.736, label: 'N', color: '#0067b8' },
  ], 33, 4.4)
  if (topTex) out.push(makePlateMesh(topTex, 33, 4.4, [0, 70.6, 13.95], u))
  if (botTex) out.push(makePlateMesh(botTex, 33, 4.4, [0, 17.5, 13.95], u))
  return out
}

function buildFuseHolderBodyMarkings(
  type: 'fuseHolderSchneiderDf101v' | 'fuseHolderSchneiderDf81n' | 'fuseHolderSchneiderDf103nv',
  u: number,
): THREE.Object3D[] {
  const wMm = type === 'fuseHolderSchneiderDf101v' ? 16.4 : type === 'fuseHolderSchneiderDf81n' ? 33.6 : 68.4
  const topItems =
    type === 'fuseHolderSchneiderDf101v'
      ? [{ xNorm: 0.5, label: '1' }]
      : type === 'fuseHolderSchneiderDf81n'
        ? [{ xNorm: 0.24, label: 'N', color: '#0072ce' }, { xNorm: 0.75, label: '1' }]
        : [
            { xNorm: 0.12, label: 'N', color: '#0072ce' },
            { xNorm: 0.37, label: '1' },
            { xNorm: 0.62, label: '3' },
            { xNorm: 0.87, label: '5' },
          ]
  const botItems =
    type === 'fuseHolderSchneiderDf101v'
      ? [{ xNorm: 0.5, label: '2' }]
      : type === 'fuseHolderSchneiderDf81n'
        ? [{ xNorm: 0.24, label: 'N', color: '#0072ce' }, { xNorm: 0.75, label: '2' }]
        : [
            { xNorm: 0.12, label: 'N', color: '#0072ce' },
            { xNorm: 0.37, label: '2' },
            { xNorm: 0.62, label: '4' },
            { xNorm: 0.87, label: '6' },
          ]
  const out: THREE.Object3D[] = []
  const topTex = drawTerminalStrip(`df:t:${type}`, topItems, wMm, 4.0)
  const botTex = drawTerminalStrip(`df:b:${type}`, botItems, wMm, 4.0)
  if (topTex) out.push(makePlateMesh(topTex, wMm, 4.0, [0, 75.0, 17.20], u))
  if (botTex) out.push(makePlateMesh(botTex, wMm, 4.0, [0, 5.8, 17.20], u))
  return out
}

/**
 * Atualiza a serigrafia viva na própria gaveta basculante do porta-fusível Schneider TeSys DF
 * (acompanha o movimento de abrir/fechar) e a cor do cartucho fusível interior.
 */
function updateFuseHolderCarriers(
  root: THREE.Object3D,
  type: 'fuseHolderSchneiderDf101v' | 'fuseHolderSchneiderDf81n' | 'fuseHolderSchneiderDf103nv',
  state: Record<string, unknown> | undefined,
): void {
  const r = readProtectionRatings(type, state)
  const ref = type === 'fuseHolderSchneiderDf101v' ? 'DF101V' : type === 'fuseHolderSchneiderDf81n' ? 'DF81N' : 'DF103NV'
  const size = type === 'fuseHolderSchneiderDf81n' ? '8,5×31,5' : '10×38'
  const ue = type === 'fuseHolderSchneiderDf81n' ? '500V~' : '690V~'
  const ampTxt = formatAmpPt(r.inA)

  const carriers: THREE.Object3D[] = []
  root.traverse((node) => {
    if (node.userData?.fuseCarrierRole) carriers.push(node)
  })
  // Ordenar da esquerda para a direita.
  carriers.sort((a, b) => a.position.x - b.position.x)

  carriers.forEach((pivot, index) => {
    const isNeutral = pivot.userData.fuseCarrierRole === 'neutral'
    const toRemove = pivot.children.filter((ch) => ch.userData?.protectionMarking)
    for (const old of toRemove) {
      pivot.remove(old)
      const mesh = old as THREE.Mesh
      mesh.geometry?.dispose()
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose())
      else mesh.material?.dispose()
    }
    // Pivot está no espaço métrico do GLB (1 unidade = 1 m = 1000 mm, origem na charneira y≈24.7, z≈59.0).
    const dyGrip = 57.6 - Number(pivot.userData.hingeY ?? 24.7)
    const dzGrip = 61.18 - Number(pivot.userData.hingeZ ?? 59.0)
    const gripKey = isNeutral
      ? `dfgrip:N:${ref}`
      : `dfgrip:F:${ref}:${index}:${ampTxt}:${r.fuseClass}`
    const gripTex = cachedCanvasTexture(gripKey, 256, 180, (ctx, w, h) => {
      if (isNeutral) {
        ctx.fillStyle = '#0072ce'
        ctx.fillRect(0, 0, w, 62)
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 38px "Inter", "Arial", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('N', w / 2, 33)
        ctx.fillStyle = '#e8ebe9'
        ctx.fillRect(0, 62, w, h - 62)
        ctx.fillStyle = '#005596'
        ctx.font = '800 24px "Inter", "Arial", sans-serif'
        ctx.fillText('NEUTRO', w / 2, 98)
        ctx.fillStyle = '#334155'
        ctx.font = '700 22px "Inter", "Arial", sans-serif'
        ctx.fillText(ref, w / 2, 134)
        ctx.font = '600 18px "Inter", "Arial", sans-serif'
        ctx.fillStyle = '#64748b'
        ctx.fillText('Tubo seccionável', w / 2, 162)
      } else {
        ctx.fillStyle = '#009530'
        ctx.fillRect(0, 0, w, 48)
        ctx.fillStyle = '#ffffff'
        ctx.font = '800 24px "Inter", "Arial", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(index <= 1 ? 'Schneider' : 'TeSys', w / 2, 25)
        ctx.fillStyle = '#e8ebe9'
        ctx.fillRect(0, 48, w, h - 48)
        ctx.fillStyle = '#0f172a'
        ctx.font = '900 28px "Inter", "Arial", sans-serif'
        ctx.fillText(ref, w / 2, 78)
        ctx.fillStyle = '#009530'
        ctx.font = '800 22px "Inter", "Arial", sans-serif'
        ctx.fillText(`${size}`, w / 2, 112)
        ctx.fillStyle = '#1e293b'
        ctx.font = '700 22px "Inter", "Arial", sans-serif'
        ctx.fillText(`${ampTxt}A ${r.fuseClass}`, w / 2, 142)
        ctx.fillStyle = '#475569'
        ctx.font = '600 18px "Inter", "Arial", sans-serif'
        ctx.fillText(ue, w / 2, 167)
      }
    })
    if (gripTex) pivot.add(makePlateMesh(gripTex, 15.6, 10.6, [0, dyGrip, dzGrip], 0.001, 0, false))

    // Porta-etiqueta frontal com calibre bem visível (e alerta vermelho quando fundido).
    const dyTag = 41.5 - Number(pivot.userData.hingeY ?? 24.7)
    const dzTag = 54.96 - Number(pivot.userData.hingeZ ?? 59.0)
    const tagKey = isNeutral
      ? 'dftag:N:v2'
      : `dftag:F:${ampTxt}:${r.fuseClass}:${r.blown ? 1 : 0}`
    const tagTex = cachedCanvasTexture(tagKey, 224, 96, (ctx, w, h) => {
      roundRect(ctx, 4, 4, w - 8, h - 8, 10)
      ctx.fillStyle = isNeutral ? '#0072ce' : r.blown ? '#dc2626' : '#ffffff'
      ctx.fill()
      ctx.strokeStyle = isNeutral ? '#005596' : r.blown ? '#991b1b' : '#94a3b8'
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (isNeutral) {
        // O próprio GLB Schneider já traz a letra «N» moldada em alto-relevo branco na frente:
        // o fundo azul realça o relevo 3D original sem duplicar o carácter.
      } else if (r.blown) {
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 28px "Inter", "Arial", sans-serif'
        ctx.fillText('FUNDIDO', w / 2, 34)
        ctx.font = '700 22px "Inter", "Arial", sans-serif'
        ctx.fillText(`${ampTxt}A ${r.fuseClass}`, w / 2, 68)
      } else {
        ctx.fillStyle = '#0f172a'
        ctx.font = '900 36px "Inter", "Arial", sans-serif'
        ctx.fillText(`${ampTxt} A`, w / 2, 38)
        ctx.fillStyle = r.fuseClass === 'aM' ? '#15803d' : r.fuseClass === 'gR' ? '#b91c1c' : '#1d4ed8'
        ctx.font = '800 24px "Inter", "Arial", sans-serif'
        ctx.fillText(r.fuseClass, w / 2, 72)
      }
    })
    if (tagTex) pivot.add(makePlateMesh(tagTex, 13.8, 5.8, [0, dyTag, dzTag], 0.001))

    // Atualizar o cartucho cerâmico 10×38 interior (calibre impresso + estado fundido).
    const body = pivot.getObjectByName('__dcFuseCartridgeBody') as THREE.Mesh | undefined
    if (body && !isNeutral) {
      const cartKey = `dfcart:${ampTxt}:${r.fuseClass}:${r.blown ? 1 : 0}`
      const cartTex = cachedCanvasTexture(cartKey, 256, 256, (ctx, w, h) => {
        ctx.fillStyle = r.blown ? '#d6cfc4' : '#f7f5ef'
        ctx.fillRect(0, 0, w, h)
        // Faixa vermelha/verde de classe IEC
        const band = r.blown ? '#b91c1c' : r.fuseClass === 'aM' ? '#15803d' : '#dc2626'
        ctx.fillStyle = band
        ctx.fillRect(0, 38, w, 24)
        ctx.fillRect(0, h - 54, w, 14)
        if (r.blown) {
          // Marca térmica de fusão no corpo cerâmico
          const grad = ctx.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, 66)
          grad.addColorStop(0, 'rgba(30,20,16,0.72)')
          grad.addColorStop(0.55, 'rgba(120,53,15,0.34)')
          grad.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, w, h)
        }
        ctx.fillStyle = band
        ctx.font = '900 44px "Inter", "Arial", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${ampTxt}A ${r.fuseClass}`, w / 2, h * 0.48)
        ctx.fillStyle = '#334155'
        ctx.font = '700 26px "Inter", "Arial", sans-serif'
        ctx.fillText(`${size} ${ue}`, w / 2, h * 0.68)
      })
      if (cartTex) {
        const mat = body.material as THREE.MeshStandardMaterial
        if (mat.map !== cartTex) {
          mat.map = cartTex
          mat.needsUpdate = true
        }
      }
    }
  })
}

function buildGv2meMarkings(state: Record<string, unknown> | undefined, u: number): THREE.Object3D[] {
  const r = readProtectionRatings('motorBreakerSchneiderGv2me', state)
  const preset = GV2ME_RANGES.find((item) => item.rangeA === r.rangeA) ?? GV2ME_RANGES[5]
  const ampTxt = formatAmpPt(r.inA)
  const out: THREE.Object3D[] = []

  // Placa frontal principal TeSys GV2ME (y = 24..37, z = 28.8 mm — perfeitamente plana).
  const key = `gv2:main:${preset.code}:${preset.rangeA}:${ampTxt}:${r.closed ? 1 : 0}:${r.tripped ? 1 : 0}`
  const mainTex = cachedCanvasTexture(key, 640, 200, (ctx, w, h) => {
    ctx.fillStyle = '#e7e5dc'
    ctx.fillRect(0, 0, w, h)
    // Faixa verde Schneider Electric
    ctx.fillStyle = '#009530'
    ctx.fillRect(0, 0, 260, 56)
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 28px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('Schneider', 16, 30)
    // Modelo TeSys GV2ME
    ctx.fillStyle = '#0f172a'
    ctx.font = '900 32px "Inter", "Arial", sans-serif'
    ctx.fillText(`TeSys ${preset.code}`, 278, 30)

    // Calibre térmico e disparo magnético
    ctx.fillStyle = '#0f172a'
    ctx.font = '900 42px "Inter", "Arial", sans-serif'
    ctx.fillText(`Ir ${preset.rangeA}`, 16, 108)
    ctx.fillStyle = '#009530'
    ctx.font = '800 28px "Inter", "Arial", sans-serif'
    ctx.fillText(`Reg.: ${ampTxt} A`, 16, 152)
    ctx.fillStyle = '#475569'
    ctx.font = '600 21px "Inter", "Arial", sans-serif'
    ctx.fillText(`Ue 690V~ · Irm ${formatAmpPt(preset.magneticA)}A · IEC 60947-2`, 16, 184)

    drawStatusPill(ctx, w - 188, 78, 170, 54, r.closed, r.tripped)
  })
  if (mainTex) out.push(makePlateMesh(mainTex, 41.8, 12.6, [0, 30.8, 28.96], u, 0, false))

  // Dial circular de ajuste térmico Ir à esquerda dos botões O/I.
  const frac = Math.max(0, Math.min(1, (r.inA - preset.minA) / Math.max(0.01, preset.maxA - preset.minA)))
  const dialTex = cachedCanvasTexture(`gv2:dial:${preset.code}:${ampTxt}`, 220, 220, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2 + 8
    ctx.fillStyle = '#1e293b'
    ctx.font = '800 24px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Ir (A)', cx, 22)
    // Disco preto do regulador térmico
    ctx.beginPath()
    ctx.arc(cx, cy, 62, 0, Math.PI * 2)
    ctx.fillStyle = '#1f2937'
    ctx.fill()
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 4
    ctx.stroke()
    // Seta amarela de regulação
    const angle = (-135 + frac * 240) * (Math.PI / 180)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(0, 22)
    ctx.lineTo(0, -48)
    ctx.stroke()
    // ranhura de chave Philips
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-16, 0)
    ctx.lineTo(16, 0)
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = '#0f172a'
    ctx.font = '800 21px "Inter", "Arial", sans-serif'
    ctx.fillText(formatAmpPt(preset.minA), 34, h - 14)
    ctx.fillText(formatAmpPt(preset.maxA), w - 34, h - 14)
  })
  if (dialTex) out.push(makePlateMesh(dialTex, 11.4, 11.4, [-14.2, 53.0, 28.52], u))

  // Símbolos O (STOP) e I (START) nas teclas (gerados para encaixe nos botões móveis)
  const stopTex = cachedCanvasTexture('gv2:btnO', 96, 96, (ctx, w, h) => {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, 24, 0, Math.PI * 2)
    ctx.stroke()
  })
  const startTex = cachedCanvasTexture('gv2:btnI', 96, 96, (ctx, w, h) => {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(w / 2, 20)
    ctx.lineTo(w / 2, h - 20)
    ctx.stroke()
  })
  void stopTex
  void startTex

  // Identificação dos bornes 1/L1 · 3/L2 · 5/L3 (topo) e 2/T1 · 4/T2 · 6/T3 (bloco inferior preto).
  const topTex = drawTerminalStrip('gv2:t:v3', [
    { xNorm: 0.18, label: '1/L1', color: '#f1f5f9' },
    { xNorm: 0.50, label: '3/L2', color: '#f1f5f9' },
    { xNorm: 0.82, label: '5/L3', color: '#f1f5f9' },
  ], 41.5, 3.6)
  const botTex = drawTerminalStrip('gv2:b:v2', [
    { xNorm: 0.18, label: '2/T1', color: '#f1f5f9' },
    { xNorm: 0.50, label: '4/T2', color: '#f1f5f9' },
    { xNorm: 0.82, label: '6/T3', color: '#f1f5f9' },
  ], 41.5, 4.2)
  if (topTex) out.push(makePlateMesh(topTex, 41.5, 3.6, [0, 86.8, 17.5], u))
  if (botTex) out.push(makePlateMesh(botTex, 41.5, 4.2, [0, 17.2, 13.55], u))
  return out
}

function buildPhoenixEcbMarkings(state: Record<string, unknown> | undefined, u: number): THREE.Object3D[] {
  const r = readProtectionRatings('phoenixEcb3000760', state)
  const ampTxt = formatAmpPt(r.inA)
  const key = `ecb:${ampTxt}:${r.ueDc}:${r.closed ? 1 : 0}:${r.tripped ? 1 : 0}`
  const tex = cachedCanvasTexture(key, 192, 280, (ctx, w, h) => {
    ctx.fillStyle = '#0098a1'
    ctx.fillRect(0, 0, w, 46)
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 22px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('PHOENIX', w / 2, 24)

    ctx.fillStyle = '#3b3e42'
    ctx.fillRect(0, 46, w, h - 46)
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '700 24px "Inter", "Arial", sans-serif'
    ctx.fillText('EC-E1', w / 2, 76)

    // Calibre grande em destaque
    roundRect(ctx, 18, 98, w - 36, 70, 10)
    ctx.fillStyle = '#f8fafc'
    ctx.fill()
    ctx.fillStyle = '#0f172a'
    ctx.font = '900 44px "Inter", "Arial", sans-serif'
    ctx.fillText(`${ampTxt} A`, w / 2, 135)

    ctx.fillStyle = '#cbd5e1'
    ctx.font = '700 22px "Inter", "Arial", sans-serif'
    ctx.fillText(r.ueDc, w / 2, 196)
    drawStatusPill(ctx, 16, 222, w - 32, 44, r.closed, r.tripped)
  })
  return tex ? [makePlateMesh(tex, 10.2, 14.4, [0, 56.8, 38.80], u, 0.068, false)] : []
}

function buildWegSpdMarkings(
  type: 'surgeProtectorWegSpw02' | 'surgeProtectorWegSpw12',
  state: Record<string, unknown> | undefined,
  u: number,
): THREE.Object3D[] {
  const r = readProtectionRatings(type, state)
  const out: THREE.Object3D[] = []
  if (type === 'surgeProtectorWegSpw02') {
    const upTex = cachedCanvasTexture(`spw02:up:${r.ucV}`, 240, 160, (ctx, w, h) => {
      ctx.fillStyle = '#00579d'
      ctx.fillRect(0, 0, w, 58)
      ctx.fillStyle = '#ffffff'
      ctx.font = '900 36px "Inter", "Arial", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('WEG', w / 2, 31)
      ctx.fillStyle = '#e2e5e9'
      ctx.fillRect(0, 58, w, h - 58)
      ctx.fillStyle = '#0f172a'
      ctx.font = '900 28px "Inter", "Arial", sans-serif'
      ctx.fillText('SPW02', w / 2, 92)
      ctx.fillStyle = '#00579d'
      ctx.font = '800 22px "Inter", "Arial", sans-serif'
      ctx.fillText('DPS · T2 · L', w / 2, 132)
    })
    const lowTex = cachedCanvasTexture(`spw02:low:${r.ucV}:${r.imaxKa}:${r.failed ? 1 : 0}`, 240, 160, (ctx, w, h) => {
      ctx.fillStyle = '#e2e5e9'
      ctx.fillRect(0, 0, w, h)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#0f172a'
      ctx.font = '800 26px "Inter", "Arial", sans-serif'
      ctx.fillText(`Uc ${r.ucV} V~`, w / 2, 30)
      ctx.fillStyle = '#1e293b'
      ctx.font = '800 24px "Inter", "Arial", sans-serif'
      ctx.fillText(`Imax ${r.imaxKa} kA`, w / 2, 66)
      roundRect(ctx, 28, 92, w - 56, 36, 8)
      ctx.fillStyle = r.failed ? '#dc2626' : '#16a34a'
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = '800 21px "Inter", "Arial", sans-serif'
      ctx.fillText(r.failed ? 'SUBSTITUIR' : 'OK · ⏚ PE', w / 2, 111)
      ctx.fillStyle = '#475569'
      ctx.font = '600 16px "Inter", "Arial", sans-serif'
      ctx.fillText('IEC 61643-11', w / 2, 145)
    })
    if (upTex) out.push(makePlateMesh(upTex, 15.6, 9.6, [0, 49.5, 34.50], u, -0.06, false))
    if (lowTex) out.push(makePlateMesh(lowTex, 15.6, 9.6, [0, 32.2, 34.72], u, -0.06, false))
  } else {
    const upTex = cachedCanvasTexture(`spw12:up:${r.ucV}`, 720, 160, (ctx, w, h) => {
      const pw = w / 3
      const labels = ['+ (DC+)', '⏚ PE', '− (DC−)']
      for (let i = 0; i < 3; i += 1) {
        const x0 = i * pw
        ctx.fillStyle = '#00579d'
        ctx.fillRect(x0 + 3, 0, pw - 6, 58)
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 34px "Inter", "Arial", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('WEG', x0 + pw / 2, 31)
        ctx.fillStyle = '#e2e5e9'
        ctx.fillRect(x0 + 3, 58, pw - 6, h - 58)
        ctx.fillStyle = '#0f172a'
        ctx.font = '900 26px "Inter", "Arial", sans-serif'
        ctx.fillText('SPW12 PV', x0 + pw / 2, 92)
        ctx.fillStyle = i === 1 ? '#15803d' : i === 0 ? '#b91c1c' : '#1d4ed8'
        ctx.font = '800 24px "Inter", "Arial", sans-serif'
        ctx.fillText(labels[i], x0 + pw / 2, 132)
      }
    })
    const lowTex = cachedCanvasTexture(`spw12:low:${r.ucV}:${r.imaxKa}:${r.failed ? 1 : 0}`, 720, 160, (ctx, w, h) => {
      const pw = w / 3
      for (let i = 0; i < 3; i += 1) {
        const x0 = i * pw
        ctx.fillStyle = '#e2e5e9'
        ctx.fillRect(x0 + 3, 0, pw - 6, h)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#0f172a'
        ctx.font = '800 24px "Inter", "Arial", sans-serif'
        ctx.fillText(`Ucpv ${r.ucV}Vdc`, x0 + pw / 2, 30)
        ctx.fillStyle = '#1e293b'
        ctx.font = '800 23px "Inter", "Arial", sans-serif'
        ctx.fillText(`Imax ${r.imaxKa} kA`, x0 + pw / 2, 66)
        roundRect(ctx, x0 + 28, 92, pw - 56, 36, 8)
        ctx.fillStyle = r.failed ? '#dc2626' : '#16a34a'
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = '800 20px "Inter", "Arial", sans-serif'
        ctx.fillText(r.failed ? 'FALHA' : 'OK · T2 PV', x0 + pw / 2, 111)
        ctx.fillStyle = '#475569'
        ctx.font = '600 16px "Inter", "Arial", sans-serif'
        ctx.fillText('EN 50539-11', x0 + pw / 2, 145)
      }
    })
    if (upTex) out.push(makePlateMesh(upTex, 51.4, 9.6, [0, 49.5, 34.50], u, -0.06, false))
    if (lowTex) out.push(makePlateMesh(lowTex, 51.4, 9.6, [0, 31.8, 34.78], u, -0.06, false))
  }
  return out
}

function buildSteckOverrideMarkings(state: Record<string, unknown> | undefined, u: number): THREE.Object3D[] {
  if (!hasCustomRatingOverride('breakerSteckSdC25', state)) return []
  const r = readProtectionRatings('breakerSteckSdC25', state)
  const rating = `${r.curve}${formatAmpPt(r.inA)}`
  const icnBox = formatIcnBox(r.icn)
  const tex = cachedCanvasTexture(`steck:${rating}:${icnBox}`, 256, 200, (ctx, w, h) => {
    ctx.fillStyle = '#eeede8'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#c8102e'
    ctx.font = '900 34px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('STECK', 14, 30)
    ctx.fillStyle = '#0f172a'
    ctx.font = '900 54px "Inter", "Arial", sans-serif'
    ctx.fillText(rating, 14, 88)
    ctx.fillStyle = '#334155'
    ctx.font = '700 22px "Inter", "Arial", sans-serif'
    ctx.fillText('230/400V~', 14, 132)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 3
    ctx.strokeRect(14, 152, 92, 34)
    ctx.textAlign = 'center'
    ctx.font = '800 22px "Inter", "Arial", sans-serif'
    ctx.fillText(icnBox, 60, 170)
    ctx.textAlign = 'left'
    ctx.font = '600 18px "Inter", "Arial", sans-serif'
    ctx.fillText('IEC 60898', 118, 170)
  })
  return tex ? [makePlateMesh(tex, 16.0, 12.6, [0, 49.2, 29.52], u, 0, false)] : []
}

function buildPkzmOverrideMarkings(state: Record<string, unknown> | undefined, u: number): THREE.Object3D[] {
  if (!hasCustomRatingOverride('motorBreakerPkzmC10', state)) return []
  const r = readProtectionRatings('motorBreakerPkzmC10', state)
  const preset = PKZM_RANGES.find((item) => item.rangeA === r.rangeA) ?? PKZM_RANGES[5]
  const ampTxt = formatAmpPt(r.inA)
  const tex = cachedCanvasTexture(`pkzm:${preset.code}:${preset.rangeA}:${ampTxt}`, 560, 148, (ctx, w, h) => {
    ctx.fillStyle = '#e7e6e1'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#005eb8'
    ctx.fillRect(0, 0, 180, 44)
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 26px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('EATON', 90, 23)
    ctx.fillStyle = '#0f172a'
    ctx.font = '900 30px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(preset.code, 198, 24)
    ctx.font = '900 40px "Inter", "Arial", sans-serif'
    ctx.fillText(`Ir ${preset.rangeA}`, 16, 86)
    ctx.fillStyle = '#005eb8'
    ctx.font = '800 30px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`${ampTxt} A`, w - 16, 86)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#475569'
    ctx.font = '600 20px "Inter", "Arial", sans-serif'
    ctx.fillText('Ue 690V~ · IEC/EN 60947-4-1', 16, 128)
  })
  return tex ? [makePlateMesh(tex, 41.4, 10.6, [0, 57.6, 30.22], u, 0, false)] : []
}

/** Assinatura compacta para atualizar a serigrafia 3D só quando muda algum parâmetro visível. */
export function protectionMarkingSignature(type: ComponentType, state?: Record<string, unknown>): string {
  const r = readProtectionRatings(type, state)
  return `${type}|${r.inA}|${r.curve}|${r.icn}|${r.sensmA}|${r.rcdType}|${r.fuseClass}|${r.rangeA}|${r.ueDc}|${r.ucV}|${r.imaxKa}|${r.closed ? 1 : 0}|${r.tripped ? 1 : 0}|${r.blown ? 1 : 0}|${r.failed ? 1 : 0}`
}

/** Remove serigrafias anteriormente aplicadas num modelo `fitted`. */
export function clearProtectionMarkings(fitted: THREE.Object3D): void {
  const old = fitted.children.filter((ch) => ch.name === MARKING_TAG || ch.userData?.protectionMarking)
  for (const node of old) {
    fitted.remove(node)
    node.traverse((sub) => {
      const m = sub as THREE.Mesh
      if (!m.isMesh) return
      m.geometry?.dispose()
      if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose())
      else m.material?.dispose()
    })
  }
}

/**
 * Gera ou obtém em cache o autocolante padrão de perigo elétrico (ISO 7010-W012):
 * triângulo amarelo com orla preta grossa e raio/relâmpago preto.
 */
export function cachedDangerStickerTexture(): THREE.CanvasTexture | null {
  return cachedCanvasTexture('decal:iso-danger-w012:v1', 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const margin = 16
    const x0 = w / 2
    const y0 = margin + 8
    const xL = margin
    const yL = h - margin - 8
    const xR = w - margin
    const yR = h - margin - 8

    // Triângulo equilátero amarelo de alta visibilidade (RAL 1023)
    ctx.fillStyle = '#facc15'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 14
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(xR, yR)
    ctx.lineTo(xL, yL)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Borda interna preta fina ISO 7010-W012
    ctx.lineWidth = 4
    ctx.strokeStyle = '#000000'
    ctx.beginPath()
    const inset = 14
    ctx.moveTo(x0, y0 + inset * 1.5)
    ctx.lineTo(xR - inset, yR - inset * 0.7)
    ctx.lineTo(xL + inset, yL - inset * 0.7)
    ctx.closePath()
    ctx.stroke()

    // Raio preto de alta tensão clássico (proporções reais de sinalética)
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.moveTo(w / 2 + 8, y0 + 38)
    ctx.lineTo(w / 2 - 22, y0 + 104)
    ctx.lineTo(w / 2 - 3, y0 + 104)
    ctx.lineTo(w / 2 - 20, y0 + 172)
    ctx.lineTo(w / 2 + 24, y0 + 92)
    ctx.lineTo(w / 2 + 6, y0 + 92)
    ctx.lineTo(w / 2 + 20, y0 + 38)
    ctx.closePath()
    ctx.fill()
  })
}

/**
 * Aplica (ou atualiza) a serigrafia de fábrica e calibre nominal num modelo `fitComponentModel`.
 * Funciona tanto no Painel 3D (`unitsPerMm = PANEL_UNITS_PER_MM`) como nas miniaturas/capas (`unitsPerMm = 1`).
 */
export function applyProtectionMarkings(
  fitted: THREE.Object3D,
  type: ComponentType,
  options: {
    state?: Record<string, unknown>
    unitsPerMm: number
    anchor: 'center' | 'bottom'
    heightMm: number
  },
): void {
  if (typeof document === 'undefined') return
  clearProtectionMarkings(fitted)

  const u = options.unitsPerMm
  let plates: THREE.Object3D[] = []

  if (type === 'breaker1p' || type === 'breaker2p' || type === 'breaker3p') {
    plates = buildEasy9Markings(type, options.state, u)
  } else if (type === 'residualBreakerHagerCfc225p') {
    plates = buildHagerRcdMarkings(options.state, u)
    // Atualizar letra branca «T» na face frontal do botão azul (acompanha o curso do botão).
    const testBtn = fitted.getObjectByName('__dcHagerTestPivot')
    if (testBtn && !testBtn.getObjectByName('__dcHagerTestLetter')) {
      const tTex = cachedCanvasTexture('hager:Tbtn:v2', 160, 96, (ctx, w, h) => {
        ctx.save()
        // O GLB do CFC225P roda 180° em Z; rodamos o «T» 180° para ficar direito no aparelho de pé.
        ctx.translate(w / 2, h / 2)
        ctx.rotate(Math.PI)
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 72px "Inter", "Arial", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('T', 0, 4)
        ctx.restore()
      })
      if (tTex) {
        const dz = Number(testBtn.userData.frontOffsetZ ?? 4.62)
        const m = makePlateMesh(tTex, 6.4, 3.3, [0, 0, dz], 0.001)
        m.name = '__dcHagerTestLetter'
        testBtn.add(m)
      }
    }
  } else if (type === 'fuseHolderSchneiderDf101v' || type === 'fuseHolderSchneiderDf81n' || type === 'fuseHolderSchneiderDf103nv') {
    plates = buildFuseHolderBodyMarkings(type, u)
    updateFuseHolderCarriers(fitted, type, options.state)
  } else if (type === 'motorBreakerSchneiderGv2me') {
    plates = buildGv2meMarkings(options.state, u)
    const btnOff = fitted.getObjectByName('imported_button-off')
    if (btnOff) {
      btnOff.children = btnOff.children.filter((ch) => ch.name !== '__dcGv2meBtnO')
      const stopTex = cachedCanvasTexture('gv2:btnO', 96, 96, (ctx, w, h) => {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 9
        ctx.beginPath()
        ctx.arc(w / 2, h / 2, 24, 0, Math.PI * 2)
        ctx.stroke()
      })
      if (stopTex) {
        const m = makePlateMesh(stopTex, 5.2, 5.2, [0, 0, 1.8], 0.001)
        m.name = '__dcGv2meBtnO'
        btnOff.add(m)
      }
    }
    const btnOn = fitted.getObjectByName('imported_button-on')
    if (btnOn) {
      btnOn.children = btnOn.children.filter((ch) => ch.name !== '__dcGv2meBtnI')
      const startTex = cachedCanvasTexture('gv2:btnI', 96, 96, (ctx, w, h) => {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 10
        ctx.beginPath()
        ctx.moveTo(w / 2, 20)
        ctx.lineTo(w / 2, h - 20)
        ctx.stroke()
      })
      if (startTex) {
        const m = makePlateMesh(startTex, 5.2, 5.2, [0, 0, 5.1], 0.001)
        m.name = '__dcGv2meBtnI'
        btnOn.add(m)
      }
    }
  } else if (type === 'phoenixEcb3000760') {
    plates = buildPhoenixEcbMarkings(options.state, u)
  } else if (type === 'surgeProtectorWegSpw02' || type === 'surgeProtectorWegSpw12') {
    plates = buildWegSpdMarkings(type, options.state, u)
  } else if (type === 'breakerSteckSdC25') {
    plates = buildSteckOverrideMarkings(options.state, u)
  } else if (type === 'motorBreakerPkzmC10') {
    plates = buildPkzmOverrideMarkings(options.state, u)
  }

  if (!plates.length) return
  const group = new THREE.Group()
  group.name = MARKING_TAG
  group.userData.protectionMarking = true
  if (options.anchor === 'center') {
    group.position.y = -(options.heightMm * u) / 2
  }
  for (const plate of plates) group.add(plate)
  fitted.add(group)
}
