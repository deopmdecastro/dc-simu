import type { ComponentDecal } from '../types'
import { drawStickerIcon, PANEL_STICKER_PRESETS } from './panelStickers'
import { brandSlugOf, loadBrandLogo } from './brandLogos'

/** Símbolo efetivo da etiqueta: o escolhido ou, nas etiquetas antigas sem símbolo, o do modelo. */
export function decalIconOf(d: Partial<ComponentDecal>): string | undefined {
  if (d.icon !== undefined) return d.icon || undefined
  return PANEL_STICKER_PRESETS.find((item) => item.id === d.stickerId)?.icon || undefined
}

/** Posição, rotação e seleção não alteram o conteúdo da textura. */
const imageKeys = new Map<string, number>()
let imageKey = 0
export function decalContentKey(d: ComponentDecal) {
  let image = d.imageUrl ? imageKeys.get(d.imageUrl) : undefined
  if (d.imageUrl && !image) { image = ++imageKey; imageKeys.set(d.imageUrl, image); if (imageKeys.size > 16) imageKeys.delete(imageKeys.keys().next().value!) }
  return JSON.stringify([d.kind, d.text, d.icon, d.stickerId, d.background, d.color, d.widthMm, d.heightMm, d.fontSizeMm, d.border, image])
}
export const isRasterDataUrl = (url: string) => /^data:image\/(?:png|jpe?g|webp|gif|bmp);base64,/i.test(url)
export function safeDecalImageUrl(url: string) {
  return isRasterDataUrl(url) || /^(?:https?:\/\/|\/)[^<>]*\.(?:png|jpe?g|webp|gif|bmp)(?:[?#].*)?$/i.test(url)
}

export function defaultDecalFontSizeMm(d: Partial<ComponentDecal>) {
  const icon = decalIconOf(d)
  const illustrated = d.stickerId === 'safety_danger_hv' || (!!icon && !['ce', 'wago', 'siemens', 'num'].includes(icon))
  return Math.max(1, d.heightMm ?? 15) * (illustrated ? .2 : .42)
}

function textLines(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number, size: number, color: string, weight = 700) {
  const lines = text.split(/\r?\n/)
  let font = Math.min(size, height / Math.max(1, lines.length) / 1.2)
  ctx.font = `${weight} ${font}px system-ui, sans-serif`
  const longest = Math.max(1, ...lines.map((line) => ctx.measureText(line).width))
  font *= Math.min(1, width / longest)
  ctx.font = `${weight} ${font}px system-ui, sans-serif`
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  lines.forEach((line, index) => ctx.fillText(line, x, y + (index - (lines.length - 1) / 2) * font * 1.2))
}

export function createDecalCanvas(d: ComponentDecal) {
  const canvas = document.createElement('canvas')
  const width = Math.max(1, d.widthMm ?? 30), height = Math.max(1, d.heightMm ?? 15)
  const density = Math.min(12, 1024 / Math.max(width, height))
  canvas.width = Math.max(1, Math.round(width * density))
  canvas.height = Math.max(1, Math.round(height * density))
  const ctx = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height
  const fg = d.color ?? '#0f172a'
  ctx.fillStyle = d.background ?? '#ffffff'; ctx.fillRect(0, 0, w, h)
  if (d.kind !== 'image') {
    const preset = PANEL_STICKER_PRESETS.find((item) => item.id === d.stickerId) ?? PANEL_STICKER_PRESETS.find((item) => item.icon === d.icon && item.label === d.text) ?? PANEL_STICKER_PRESETS.find((item) => !!d.icon && item.icon === d.icon)
    // '' = «sem símbolo» escolhido explicitamente; undefined = herda o símbolo do modelo.
    const icon = d.icon !== undefined ? d.icon || undefined : preset?.icon
    const text = d.text ?? ''
    const font = (d.fontSizeMm ?? defaultDecalFontSizeMm(d)) * w / width
    if (brandSlugOf(icon)) {
      // Logótipo real: desenhado de forma assíncrona em paintDecalImage (SVG original do fabricante).
    } else if (d.stickerId === 'safety_danger_hv' && icon === 'bolt') {
      const [header = 'PERIGO', ...body] = text.split(/\r?\n/)
      ctx.fillStyle = '#dc2626'; ctx.fillRect(0, 0, w, h * .3)
      textLines(ctx, header, w / 2, h * .15, w * .92, h * .25, h * .22, '#ffffff')
      ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(w * .23, h * .37); ctx.lineTo(w * .42, h * .88); ctx.lineTo(w * .04, h * .88); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#111827'; ctx.lineWidth = h * .025; ctx.stroke()
      drawStickerIcon(ctx, 'bolt', w * .23, h * .69, h * .28, '#111827')
      textLines(ctx, body.join('\n'), w * .7, h * .64, w * .5, h * .55, font, fg)
    } else if (icon && !['ce', 'wago', 'siemens', 'num'].includes(icon)) {
      if (text.trim()) {
        drawStickerIcon(ctx, icon, w / 2, h * .3, Math.min(h * .46, w * .75), fg, preset?.accent)
        textLines(ctx, text, w / 2, h * .77, w * .9, h * .35, font, fg)
      } else drawStickerIcon(ctx, icon, w / 2, h / 2, Math.min(h, w) * .72, fg, preset?.accent) // só o símbolo, centrado
    } else {
      const names: Record<string, string> = { ce: 'CE', wago: 'WAGO', siemens: 'Siemens' }
      const content = icon && names[icon] && !text ? names[icon] : text
      textLines(ctx, content, w / 2, h / 2, w * .9, h * .88, font, fg, d.kind === 'logo' ? 800 : 700)
    }
  }
  if (d.border !== false) { ctx.strokeStyle = fg; ctx.lineWidth = Math.max(1, Math.min(w, h) * .02); ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth) }
  return canvas
}

/** O mesmo ajuste contain no inspetor, no SVG e na textura física. SVG nunca é carregado. */
export async function paintDecalImage(canvas: HTMLCanvasElement, d: ComponentDecal) {
  const brand = d.kind !== 'image' ? brandSlugOf(decalIconOf(d)) : null
  if (brand) {
    // Logótipo do fabricante (SVG estático da aplicação) ajustado com margem sobre o fundo escolhido.
    const logo = await loadBrandLogo(brand)
    const ctx = canvas.getContext('2d')!, w = canvas.width, h = canvas.height
    const lw = logo.naturalWidth || 300, lh = logo.naturalHeight || 150
    const scale = Math.min(w * .84 / lw, h * .7 / lh)
    ctx.drawImage(logo, (w - lw * scale) / 2, (h - lh * scale) / 2, lw * scale, lh * scale)
    if (d.border !== false) {
      ctx.strokeStyle = d.color ?? '#0f172a'
      ctx.lineWidth = Math.max(1, Math.min(w, h) * .02)
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth)
    }
    return
  }
  if (d.kind !== 'image' || !d.imageUrl || !safeDecalImageUrl(d.imageUrl)) return
  const image = new Image()
  image.src = d.imageUrl
  await image.decode()
  const ctx = canvas.getContext('2d')!, w = canvas.width, h = canvas.height
  const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight)
  const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale
  ctx.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih)
  if (d.border !== false) {
    ctx.strokeStyle = d.color ?? '#0f172a'
    ctx.lineWidth = Math.max(1, Math.min(w, h) * .02)
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth)
  }
}
