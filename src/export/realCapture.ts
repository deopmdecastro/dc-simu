/** Captura REAL do editor para o PDF: monta os componentes verdadeiros
 *  (NetworkDiagram do ladder, GrafcetEditor do GRAFCET) num recipiente
 *  oculto, lê o SVG com os estilos resolvidos (mesmo pipeline das covers do
 *  dashboard) e rasteriza em PNG 2×. Só corre no browser. */
import { createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { LadderRung } from '../types'
import NetworkDiagram from '../ladder/NetworkDiagram'
import GrafcetEditor from '../grafcet/GrafcetEditor'
import { useSimStore } from '../store/useSimStore'
import { useGrafcetUi } from '../grafcet/grafcetBus'

const STYLE_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'text-decoration',
  'dominant-baseline',
]
const DROP = /(^|\s|-)(handle|handles|guide|guides|marquee|hit|ghost|drop|hover|cursor|rubber)(\s|-|$)/i
const SELECTION = /(^|\s|-)(sel|selection)(\s|-|$)/i

/** Copia um SVG com os estilos computados inline (as classes não existem fora da página). */
function cloneWithStyles(source: SVGElement): SVGElement {
  const clone = source.cloneNode(true) as SVGElement
  const walk = (src: Element, dst: Element) => {
    const srcKids = Array.from(src.children)
    const dstKids = Array.from(dst.children)
    srcKids.forEach((child, i) => {
      const twin = dstKids[i]
      if (!twin) return
      const cls = child.getAttribute('class') ?? ''
      const cs = getComputedStyle(child)
      if (cs.display === 'none' || DROP.test(cls) || (SELECTION.test(cls) && !child.children.length)) { twin.remove(); return }
      if (child instanceof SVGElement && child.tagName.toLowerCase() !== 'defs') {
        const declared = twin.getAttribute('style') ?? ''
        const inline = STYLE_PROPS.map((prop) => `${prop}:${cs.getPropertyValue(prop)}`).join(';')
        twin.setAttribute('style', `${inline};${declared}`)
      }
      twin.removeAttribute('class')
      walk(child, twin)
    })
  }
  walk(source, clone)
  clone.removeAttribute('class')
  return clone
}

/** Caixa do conteúdo desenhado (ignora fundos de grelha que cobrem o SVG todo). */
function contentBox(svg: SVGSVGElement): { x: number; y: number; w: number; h: number } | null {
  const full = { w: svg.width.baseVal.value, h: svg.height.baseVal.value }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const child of Array.from(svg.children)) {
    if (!(child instanceof SVGGraphicsElement) || child.tagName.toLowerCase() === 'defs') continue
    try {
      const b = child.getBBox()
      if (!b.width && !b.height) continue
      if (b.width >= full.w * 0.92 && b.height >= full.h * 0.92 && child.tagName.toLowerCase() === 'rect') continue
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
    } catch { /* sem geometria */ }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

/** SVG → PNG data URL em 2× (fundo branco, apto para jsPDF). */
export async function svgToPngDataUrl(svg: string, w: number, h: number, scale = 2): Promise<string | null> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('svg'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(2, Math.round(w * scale))
    canvas.height = Math.max(2, Math.round(h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Monta `node` fora do ecrã e executa `grab` com o recipiente montado. */
async function withHiddenMount<T>(node: ReactElement, grab: (host: HTMLElement) => T | Promise<T>): Promise<T> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1240px;pointer-events:none;visibility:hidden;z-index:-1'
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(node)
  await nextFrame()
  try {
    return await grab(host)
  } finally {
    root.unmount()
    host.remove()
  }
}

export interface CapturedRung {
  rungIndex: number
  /** PNG data URL 2× do SVG real da network e dimensões CSS. */
  png: string
  w: number
  h: number
}

/** Desenha as networks escolhidas com o NetworkDiagram REAL (usa o estado vivo da simulação). */
export async function captureLadderRungs(picks: Array<{ rung: LadderRung; rungIndex: number }>): Promise<CapturedRung[]> {
  const tree = createElement(
    'div',
    { className: 'ladder-networks-scale pdf-capture' },
    ...picks.map((p) => createElement('div', { key: p.rung.id, className: 'ladder-network-wrap' }, createElement(NetworkDiagram, { rung: p.rung, readonly: true, minWidth: 960 }))),
  )
  return withHiddenMount(tree, async (host) => {
    const svgs = Array.from(host.querySelectorAll<SVGSVGElement>('.lnet > svg'))
    const out: CapturedRung[] = []
    for (let i = 0; i < picks.length; i++) {
      const svg = svgs[i]
      if (!svg) continue
      const w = svg.width.baseVal.value || 960
      const h = svg.height.baseVal.value || 120
      const clone = cloneWithStyles(svg)
      clone.setAttribute('x', '0'); clone.setAttribute('y', '0')
      clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
      clone.removeAttribute('style')
      const png = await svgToPngDataUrl(new XMLSerializer().serializeToString(clone), w, h)
      if (png) out.push({ rungIndex: picks[i].rungIndex, png, w, h })
    }
    return out
  })
}

export interface CapturedChart { chartId: string | null; png: string; w: number; h: number }

/** Página de GRAFCET desenhada pelo editor verdadeiro. `chartId=null` → programa completo (sem páginas). */
export async function captureGrafcetChart(chartId: string | null): Promise<CapturedChart | null> {
  const simState = useSimStore.getState()
  const uiState = useGrafcetUi.getState()
  const prevChart = simState.grafcet.activeChart
  const prevZoom = uiState.zoom
  try {
    if (chartId) simState.setGrafcet({ ...simState.grafcet, activeChart: chartId }, 'skip', 'grafcet:export-pdf')
    if (prevZoom !== 1) uiState.setZoom(1)
    return await withHiddenMount(createElement(GrafcetEditor, { full: false }), async (host) => {
      const svg = host.querySelector<SVGSVGElement>('.grafcet-pan-layer svg[role="img"]')
      if (!svg) return null
      const box = contentBox(svg)
      if (!box || box.w < 10 || box.h < 10) return null
      const pad = 30
      const x = box.x - pad, y = box.y - pad, w = box.w + pad * 2, h = box.h + pad * 2
      const clone = cloneWithStyles(svg)
      clone.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
      clone.setAttribute('x', '0'); clone.setAttribute('y', '0')
      clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
      clone.removeAttribute('style'); clone.removeAttribute('role'); clone.removeAttribute('aria-label')
      const png = await svgToPngDataUrl(new XMLSerializer().serializeToString(clone), w, h)
      return png ? { chartId, png, w, h } : null
    })
  } catch {
    return null
  } finally {
    if (chartId && prevChart !== chartId) simState.setGrafcet({ ...useSimStore.getState().grafcet, activeChart: prevChart }, 'skip', 'grafcet:export-pdf')
    if (prevZoom !== 1) useGrafcetUi.getState().setZoom(prevZoom)
  }
}

export const canRealCapture = () => typeof document !== 'undefined' && typeof requestAnimationFrame !== 'undefined'
