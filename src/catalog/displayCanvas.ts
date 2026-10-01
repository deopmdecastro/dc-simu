import { evalWhen, type MeterReading, type Vars } from './behavior'
import type { DisplayDef, DisplayLine } from './types'

/** Desenho dos ecrãs (LCD de 7 segmentos e ecrãs de texto) num canvas 2D. */

const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  '-': 'g', O: 'abcdef', L: 'def', E: 'adefg', F: 'aefg', r: 'eg', ' ': '',
}

const hexH = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, t: number) => {
  ctx.beginPath(); ctx.moveTo(x, y + t / 2); ctx.lineTo(x + t / 2, y); ctx.lineTo(x + w - t / 2, y); ctx.lineTo(x + w, y + t / 2); ctx.lineTo(x + w - t / 2, y + t); ctx.lineTo(x + t / 2, y + t); ctx.closePath(); ctx.fill()
}
const hexV = (ctx: CanvasRenderingContext2D, x: number, y: number, h: number, t: number) => {
  ctx.beginPath(); ctx.moveTo(x + t / 2, y); ctx.lineTo(x + t, y + t / 2); ctx.lineTo(x + t, y + h - t / 2); ctx.lineTo(x + t / 2, y + h); ctx.lineTo(x, y + h - t / 2); ctx.lineTo(x, y + t / 2); ctx.closePath(); ctx.fill()
}

function digit(ctx: CanvasRenderingContext2D, char: string, x: number, y: number, w: number, h: number, color: string, ghost: string) {
  const t = Math.max(2, w * 0.17)
  const lit = SEGMENTS[char] ?? ''
  const gap = t * 0.12
  const half = (h - t) / 2
  const draw = (id: string, fn: () => void) => { ctx.fillStyle = lit.includes(id) ? color : ghost; fn() }
  draw('a', () => hexH(ctx, x + t * 0.5 + gap, y, w - t - gap * 2, t))
  draw('g', () => hexH(ctx, x + t * 0.5 + gap, y + half, w - t - gap * 2, t))
  draw('d', () => hexH(ctx, x + t * 0.5 + gap, y + h - t, w - t - gap * 2, t))
  draw('f', () => hexV(ctx, x, y + t * 0.5 + gap, half - gap * 2, t))
  draw('b', () => hexV(ctx, x + w - t, y + t * 0.5 + gap, half - gap * 2, t))
  draw('e', () => hexV(ctx, x, y + half + t * 0.5 + gap, half - gap * 2, t))
  draw('c', () => hexV(ctx, x + w - t, y + half + t * 0.5 + gap, half - gap * 2, t))
}

/** Separa «12.34» em dígitos + posição do ponto decimal (o ponto vive à direita do dígito). */
export function splitDigits(text: string): { chars: string[]; dots: boolean[] } {
  const chars: string[] = []
  const dots: boolean[] = []
  for (const char of text) {
    if (char === '.') { if (dots.length) dots[dots.length - 1] = true; continue }
    chars.push(char === 'o' ? 'O' : char); dots.push(false)
  }
  return { chars, dots }
}

export function expandTemplate(text: string, vars: Vars, extra: Record<string, string> = {}): string {
  return text.replace(/\{([A-Za-z0-9_.]+)\}/g, (_, name: string) => {
    if (name in extra) return extra[name]
    const value = vars[name]
    return value === undefined ? '' : typeof value === 'boolean' ? (value ? '1' : '0') : String(value)
  })
}

const mix = (a: string, b: string, k: number) => {
  const pa = /^#([0-9a-f]{6})$/i.exec(a), pb = /^#([0-9a-f]{6})$/i.exec(b)
  if (!pa || !pb) return a
  const ca = parseInt(pa[1], 16), cb = parseInt(pb[1], 16)
  const ch = (shift: number) => Math.round(((ca >> shift) & 255) * (1 - k) + ((cb >> shift) & 255) * k)
  return `#${[16, 8, 0].map((shift) => ch(shift).toString(16).padStart(2, '0')).join('')}`
}

export function displayPixelSize(display: DisplayDef) {
  const density = Math.max(2, Math.min(60, display.density || 16))
  const w = Math.max(32, Math.round(display.widthMm * density))
  const h = Math.max(16, Math.round(display.heightMm * density))
  const scale = Math.min(1, 1024 / Math.max(w, h))
  return { w: Math.max(16, Math.round(w * scale)), h: Math.max(8, Math.round(h * scale)) }
}

/** LCD de multímetro: indicadores, 4 dígitos de 7 segmentos, unidade, HOLD, AUTO, bateria e continuidade. */
function drawLcd(ctx: CanvasRenderingContext2D, display: DisplayDef, reading: MeterReading | null, bg: string, fg: string) {
  const { width: W, height: H } = ctx.canvas
  const ghost = mix(bg, fg, 0.08)
  const on = reading?.on ?? false
  const label = (text: string, x: number, y: number, size: number, active: boolean, align: CanvasTextAlign = 'left') => {
    ctx.font = `700 ${size}px "Segoe UI", Arial, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'
    ctx.fillStyle = active ? fg : ghost
    ctx.fillText(text, x, y)
  }
  const small = H * 0.14
  label('DC', W * 0.05, H * 0.15, small * 1.3, !!reading?.dc)
  label('AC', W * 0.05, H * 0.32, small * 1.3, !!reading?.ac)
  const unit = reading?.unit ?? ''
  label(unit || 'V', W * 0.95, H * 0.17, H * 0.22, on && !!unit, 'right')
  // dígitos
  const areaX = W * 0.17, areaW = W * 0.72, areaY = H * 0.22, areaH = H * 0.5
  const slots = 4
  const slotW = areaW / slots
  const digitW = slotW * 0.68
  ctx.save()
  ctx.translate(areaX, 0); ctx.transform(1, 0, -0.1, 1, areaH * 0.1 + areaY * 0.1, 0)
  const text = reading?.on ? reading.text : ''
  const { chars, dots } = splitDigits(text)
  const padded = [...Array(Math.max(0, slots - chars.length)).fill(' '), ...chars].slice(-slots)
  const paddedDots = [...Array(Math.max(0, slots - dots.length)).fill(false), ...dots].slice(-slots)
  for (let index = 0; index < slots; index += 1) {
    const x = index * slotW
    digit(ctx, '8', x, areaY, digitW, areaH, ghost, ghost)
    if (on) digit(ctx, padded[index], x, areaY, digitW, areaH, fg, 'rgba(0,0,0,0)')
    ctx.fillStyle = on && paddedDots[index] ? fg : ghost
    ctx.beginPath(); ctx.arc(x + digitW + slotW * 0.1, areaY + areaH - areaH * 0.04, Math.max(1.6, H * 0.028), 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  // sinal de menos
  ctx.fillStyle = on && reading?.negative ? fg : ghost
  ctx.fillRect(W * 0.1, areaY + areaH / 2 - H * 0.02, W * 0.055, H * 0.045)
  // linha inferior
  label('AUTO', W * 0.05, H * 0.86, small, !!reading?.auto)
  label('HOLD', W * 0.34, H * 0.86, small, !!reading?.hold)
  label(reading?.continuity ? '•))' : '', W * 0.62, H * 0.86, small * 1.1, !!reading?.continuity)
  label('BAT', W * 0.95, H * 0.86, small, !!reading?.battery, 'right')
}

function drawLine(ctx: CanvasRenderingContext2D, line: DisplayLine, text: string, color: string) {
  const { width: W, height: H } = ctx.canvas
  ctx.font = `600 ${Math.max(6, line.size * H)}px "Courier New", monospace`
  ctx.textAlign = line.align; ctx.textBaseline = 'middle'; ctx.fillStyle = line.color || color
  ctx.fillText(text, line.x * W, line.y * H, W * 0.98)
}

/** Desenha o ecrã com as variáveis (e a leitura do multímetro, se existir). */
export function drawDisplay(canvas: HTMLCanvasElement, display: DisplayDef, vars: Vars, reading: MeterReading | null, stateName = '') {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const powered = !display.powerVar || Boolean(vars[display.powerVar]) || (display.kind === 'lcd' && display.powerVar === undefined)
  const backlit = display.backlightVar ? Boolean(vars[display.backlightVar]) : Boolean(reading?.backlight)
  const bg = backlit ? mix(display.background, '#9cf0b4', 0.5) : display.background
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = powered || display.kind === 'lcd' ? bg : mix(bg, '#000000', 0.7)
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (display.kind === 'lcd') { drawLcd(ctx, display, reading, bg, display.foreground); return }
  if (!powered) return
  for (const line of display.lines) {
    if (line.when && !evalWhen(line.when, vars)) continue
    drawLine(ctx, line, expandTemplate(line.text, vars, { state: stateName }), display.foreground)
  }
}
