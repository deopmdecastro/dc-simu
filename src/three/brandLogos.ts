/**
 * Logótipos reais das marcas (SVG originais em public/brands, proveniência em brands/sources.json).
 * Usados nas etiquetas «Marcas» da biblioteca: o desenho é o vetor do fabricante, nunca texto
 * aproximado numa fonte. As marcas pertencem aos respetivos titulares; uso só para identificação.
 */
export interface BrandLogo {
  /** Nome legível (rótulo acessível e lista de símbolos). */
  name: string
  /** Ficheiro estático servido pela aplicação. */
  file: string
  /** Fundo recomendado para o logótipo (o utilizador pode trocar). */
  background: string
}

export const BRAND_LOGOS: Record<string, BrandLogo> = {
  'schneider-electric': { name: 'Schneider Electric', file: '/brands/schneider-electric.svg', background: '#ffffff' },
  siemens: { name: 'Siemens', file: '/brands/siemens.svg', background: '#ffffff' },
  abb: { name: 'ABB', file: '/brands/abb.svg', background: '#ffffff' },
  weg: { name: 'WEG', file: '/brands/weg.svg', background: '#ffffff' },
  'phoenix-contact': { name: 'Phoenix Contact', file: '/brands/phoenix-contact.svg', background: '#ffffff' },
  hager: { name: 'Hager', file: '/brands/hager.svg', background: '#ffffff' },
  wago: { name: 'WAGO', file: '/brands/wago.svg', background: '#ffffff' },
  geya: { name: 'GEYA', file: '/brands/geya.svg', background: '#ffffff' },
  eaton: { name: 'Eaton', file: '/brands/eaton.svg', background: '#ffffff' },
  philips: { name: 'Philips', file: '/brands/philips.svg', background: '#ffffff' },
  ce: { name: 'Marcação CE', file: '/brands/ce.svg', background: '#ffffff' },
}

export const BRAND_ICON_PREFIX = 'brand:'
export const brandSlugOf = (icon: string | undefined): string | null =>
  icon?.startsWith(BRAND_ICON_PREFIX) && BRAND_LOGOS[icon.slice(BRAND_ICON_PREFIX.length)] ? icon.slice(BRAND_ICON_PREFIX.length) : null

const images = new Map<string, Promise<HTMLImageElement>>()
/** Carrega (uma vez) o SVG original do logótipo como imagem para desenhar no canvas da etiqueta. */
export function loadBrandLogo(slug: string): Promise<HTMLImageElement> {
  let pending = images.get(slug)
  if (!pending) {
    pending = (async () => {
      // Alguns originais só têm viewBox (sem tamanho intrínseco): o tamanho é acrescentado em memória,
      // sem alterar o ficheiro verificado por SHA-256. Blob local = canvas continua exportável.
      let svg = await (await fetch(BRAND_LOGOS[slug].file)).text()
      const viewBox = /<svg\b[^>]*\bviewBox="\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)\s*"/i.exec(svg)
      if (viewBox && !/<svg\b[^>]*\swidth="/i.test(svg)) svg = svg.replace(/<svg\b/i, `<svg width="${viewBox[1]}" height="${viewBox[2]}"`)
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
      try {
        const image = new Image()
        image.src = url
        await image.decode()
        return image
      } finally { URL.revokeObjectURL(url) }
    })()
    pending.catch(() => images.delete(slug))
    images.set(slug, pending)
  }
  return pending
}

/** Desenha o logótipo dentro do retângulo (contain), opcionalmente monocromático (ex.: branco sobre faixa de cor). */
export function drawBrandLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, x: number, y: number, w: number, h: number, color?: string): void {
  const lw = logo.naturalWidth || 300, lh = logo.naturalHeight || 150
  const scale = Math.min(w / lw, h / lh), dw = lw * scale, dh = lh * scale
  const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2
  if (!color) { ctx.drawImage(logo, dx, dy, dw, dh); return }
  const tint = document.createElement('canvas')
  tint.width = Math.max(1, Math.ceil(dw)); tint.height = Math.max(1, Math.ceil(dh))
  const t = tint.getContext('2d')!
  t.drawImage(logo, 0, 0, tint.width, tint.height)
  t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, tint.width, tint.height)
  ctx.drawImage(tint, dx, dy, dw, dh)
}

/**
 * Serigrafias CAD (texturas em cache, desenhadas de forma síncrona): o texto provisório é substituído
 * pelo logótipo real assim que o SVG carrega. `background` repinta o retângulo antes (apaga o texto).
 * Idempotente por textura/retângulo; `onPainted` pede o novo frame.
 */
export function paintBrandLogoOnTexture(
  texture: { image: unknown; needsUpdate: boolean; userData: Record<string, unknown> } | null | undefined,
  slug: string,
  rect: { x: number; y: number; w: number; h: number },
  options: { background?: string; color?: string; onPainted?: () => void } = {},
): void {
  if (!texture || typeof document === 'undefined' || !BRAND_LOGOS[slug]) return
  const key = `brandLogo:${slug}:${rect.x},${rect.y},${rect.w},${rect.h}`
  if (texture.userData[key]) return
  texture.userData[key] = 'pending'
  loadBrandLogo(slug).then((logo) => {
    const canvas = texture.image as HTMLCanvasElement | undefined
    const ctx = canvas?.getContext?.('2d')
    if (!ctx) return
    if (options.background === 'transparent') ctx.clearRect(rect.x, rect.y, rect.w, rect.h)
    else if (options.background) { ctx.fillStyle = options.background; ctx.fillRect(rect.x, rect.y, rect.w, rect.h) }
    drawBrandLogo(ctx, logo, rect.x, rect.y, rect.w, rect.h, options.color)
    texture.userData[key] = 'painted'
    texture.needsUpdate = true
    options.onPainted?.()
  }).catch(() => { delete texture.userData[key] })
}
