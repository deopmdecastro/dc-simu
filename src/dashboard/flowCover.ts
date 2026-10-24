/** Covers reais dos projetos Ladder e GRAFCET: o próprio diagrama (networks, etapas,
 *  transições, ações) desenhado em SVG e convertido em JPEG para guardar no projeto,
 *  tal como o cover 3D. Funciona com os dois backends porque o `cover` é guardado
 *  no conteúdo do projeto. */
import type { LadderRung, LadderContact } from '../types'
import { actionsOfStep, type GrafcetProgram, type GrafcetStep } from '../grafcet/engine'
import { SPINE_X, START_Y, stepPitch } from '../grafcet/layout'
import { COVER_MAX_CHARS } from '../three/coverCapture'
import type { ProjectKind } from '../project/kind'

export const COVER_W = 960
export const COVER_H = 600

const INK = '#1e2b44'
const MUTED = '#6b7a90'
const BRAND = '#2655e5'
const BRAND_SOFT = '#eaf0ff'
const LINE = '#8a98ad'
const FONT = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
const SANS = "Inter, 'Segoe UI', system-ui, sans-serif"

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cut = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v)

type Box = { w: number; h: number; body: string }

/** Fundo do editor (pontos da grelha) + conteúdo centrado e ajustado ao quadro. */
function frame(box: Box, label = '', badge = ''): string {
  const pad = 56
  const scale = Math.min((COVER_W - pad * 2) / box.w, (COVER_H - pad * 2 - 18) / box.h, 1.7)
  const tx = (COVER_W - box.w * scale) / 2
  const ty = (COVER_H - box.h * scale) / 2 + 6
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_W}" height="${COVER_H}" viewBox="0 0 ${COVER_W} ${COVER_H}">
<defs>
<pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#c9d3e3"/></pattern>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9fbff"/><stop offset="1" stop-color="#eaf0f9"/></linearGradient>
</defs>
<rect width="${COVER_W}" height="${COVER_H}" fill="url(#bg)"/>
<rect width="${COVER_W}" height="${COVER_H}" fill="url(#dots)"/>
<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale.toFixed(3)})">${box.body}</g>
${badge || label ? `<g font-family="${SANS}">
${badge ? `<rect x="20" y="20" width="${badge.length * 9 + 32}" height="26" rx="13" fill="${BRAND}"/><text x="34" y="37" font-size="12" font-weight="700" fill="#fff" letter-spacing=".6">${esc(badge)}</text>` : ''}
${label ? `<text x="${COVER_W - 22}" y="${COVER_H - 20}" font-size="12" font-weight="600" fill="${MUTED}" text-anchor="end">${esc(label)}</text>` : ''}
</g>` : ''}
</svg>`
}

// ───────────────────────────── Ladder ─────────────────────────────

function contactSymbol(c: LadderContact, x: number, y: number): string {
  const label = `<text x="${x + 17}" y="${y - 16}" font-size="11" font-weight="700" fill="${INK}" text-anchor="middle" font-family="${FONT}">${esc(cut(c.address || '?', 9))}</text>`
  if (c.contactType === 'CMP') {
    return `<rect x="${x}" y="${y - 12}" width="34" height="24" rx="3" fill="#e6f6f6" stroke="#0f8b8d" stroke-width="2"/><text x="${x + 17}" y="${y + 4}" font-size="11" font-weight="700" fill="#0f8b8d" text-anchor="middle" font-family="${FONT}">${esc(c.compareOp ?? '==')}</text>${label}`
  }
  const bars = `<line x1="${x + 6}" y1="${y - 13}" x2="${x + 6}" y2="${y + 13}" stroke="${INK}" stroke-width="2.4"/><line x1="${x + 28}" y1="${y - 13}" x2="${x + 28}" y2="${y + 13}" stroke="${INK}" stroke-width="2.4"/>`
  const mark =
    c.contactType === 'NC' ? `<line x1="${x + 9}" y1="${y + 11}" x2="${x + 25}" y2="${y - 11}" stroke="${INK}" stroke-width="2"/>`
    : c.contactType === 'RISING' ? `<text x="${x + 17}" y="${y + 4}" font-size="12" font-weight="800" fill="${INK}" text-anchor="middle" font-family="${FONT}">P</text>`
    : c.contactType === 'FALLING' ? `<text x="${x + 17}" y="${y + 4}" font-size="12" font-weight="800" fill="${INK}" text-anchor="middle" font-family="${FONT}">N</text>` : ''
  return `<line x1="${x}" y1="${y}" x2="${x + 6}" y2="${y}" stroke="${INK}" stroke-width="2"/><line x1="${x + 28}" y1="${y}" x2="${x + 34}" y2="${y}" stroke="${INK}" stroke-width="2"/>${bars}${mark}${label}`
}

function coilSymbol(address: string, type: string, x: number, y: number): string {
  const tag = type === 'SET' ? 'S' : type === 'RESET' ? 'R' : ''
  return `<line x1="${x}" y1="${y}" x2="${x + 8}" y2="${y}" stroke="${INK}" stroke-width="2"/>
<path d="M${x + 14} ${y - 13}Q${x + 6} ${y} ${x + 14} ${y + 13}" fill="none" stroke="${INK}" stroke-width="2.4"/>
<path d="M${x + 28} ${y - 13}Q${x + 36} ${y} ${x + 28} ${y + 13}" fill="none" stroke="${INK}" stroke-width="2.4"/>
<line x1="${x + 34}" y1="${y}" x2="${x + 42}" y2="${y}" stroke="${INK}" stroke-width="2"/>
${tag ? `<text x="${x + 21}" y="${y + 4}" font-size="11" font-weight="800" fill="${INK}" text-anchor="middle" font-family="${FONT}">${tag}</text>` : ''}
<text x="${x + 21}" y="${y - 19}" font-size="11" font-weight="700" fill="${INK}" text-anchor="middle" font-family="${FONT}">${esc(cut(address || '?', 9))}</text>`
}

function blockSymbol(title: string, sub: string, x: number, y: number, h: number): string {
  return `<line x1="${x - 8}" y1="${y}" x2="${x}" y2="${y}" stroke="${INK}" stroke-width="2"/>
<rect x="${x}" y="${y - h / 2}" width="92" height="${h}" rx="4" fill="${BRAND_SOFT}" stroke="${BRAND}" stroke-width="2"/>
<text x="${x + 46}" y="${y - 2}" font-size="13" font-weight="800" fill="${BRAND}" text-anchor="middle" font-family="${SANS}">${esc(title)}</text>
<text x="${x + 46}" y="${y + 14}" font-size="10.5" font-weight="600" fill="${INK}" text-anchor="middle" font-family="${FONT}">${esc(cut(sub, 14))}</text>
<line x1="${x + 92}" y1="${y}" x2="${x + 100}" y2="${y}" stroke="${INK}" stroke-width="2"/>`
}

const MAX_RUNGS = 7
const RAIL_W = 760
const SLOT = 52

export function ladderCoverSvg(rungs: LadderRung[], title = 'Ladder'): string | null {
  const list = rungs.filter((r) => r.enabled !== false || rungs.length <= 2).slice(0, MAX_RUNGS)
  if (!list.length) return null
  let y = 14
  const rows: string[] = []
  list.forEach((rung, index) => {
    const branches = (rung.branches.length ? rung.branches : [{ id: 'b', elements: [] }]).slice(0, 3)
    const rowH = 44
    const outCount = Math.max(1, rung.coils.length + (rung.timer || rung.counter || rung.move || rung.math || rung.call ? 1 : 0))
    const height = Math.max(branches.length * rowH, Math.min(outCount, 3) * rowH) + 30
    const bodyTop = y + 28
    const colorHead = rung.enabled === false ? MUTED : BRAND
    rows.push(`<text x="60" y="${y + 12}" font-size="11.5" font-weight="700" fill="${colorHead}" font-family="${SANS}" letter-spacing=".4">NETWORK ${index + 1}${rung.name ? ` · ${esc(cut(rung.name, 34))}` : ''}</text>`)

    const nodeL = 40
    const outX = RAIL_W - 210
    const nodeR = outX - 24
    const centreY = bodyTop + (branches.length * rowH) / 2
    branches.forEach((branch, bi) => {
      const by = bodyTop + bi * rowH + rowH / 2
      const els = branch.elements.slice(0, 6)
      rows.push(`<line x1="${nodeL}" y1="${by}" x2="${nodeR}" y2="${by}" stroke="${LINE}" stroke-width="1.8"/>`)
      const gap = (nodeR - nodeL) / (els.length + 1)
      els.forEach((el, ei) => rows.push(contactSymbol(el, nodeL + gap * (ei + 1) - 17, by)))
    })
    if (branches.length > 1) {
      const top = bodyTop + rowH / 2
      const bottom = bodyTop + (branches.length - 1) * rowH + rowH / 2
      rows.push(`<line x1="${nodeL}" y1="${top}" x2="${nodeL}" y2="${bottom}" stroke="${LINE}" stroke-width="1.8"/><line x1="${nodeR}" y1="${top}" x2="${nodeR}" y2="${bottom}" stroke="${LINE}" stroke-width="1.8"/>`)
    }
    // saídas
    const blocks: Array<{ draw: (yy: number) => string; end: number }> = []
    if (rung.timer) blocks.push({ end: 100, draw: (yy) => blockSymbol(rung.timer!.timerType, rung.timer!.address, outX, yy, 38) })
    if (rung.counter) blocks.push({ end: 100, draw: (yy) => blockSymbol(rung.counter!.counterType, rung.counter!.address, outX, yy, 38) })
    if (rung.move) blocks.push({ end: 100, draw: (yy) => blockSymbol('MOVE', rung.move!.target, outX, yy, 38) })
    if (rung.math) blocks.push({ end: 100, draw: (yy) => blockSymbol(rung.math!.op, rung.math!.out, outX, yy, 38) })
    if (rung.call) blocks.push({ end: 100, draw: (yy) => blockSymbol('CALL', 'FC', outX, yy, 38) })
    rung.coils.slice(0, 3).forEach((coil) => blocks.push({ end: 66, draw: (yy) => coilSymbol(coil.address, coil.coilType, outX + 24, yy) }))
    const shown = blocks.slice(0, 3)
    const stackH = Math.max(shown.length, 1) * rowH
    const outTop = bodyTop + (Math.max(branches.length * rowH, stackH) - stackH) / 2
    rows.push(`<line x1="${nodeR}" y1="${centreY}" x2="${outX - 8}" y2="${centreY}" stroke="${LINE}" stroke-width="1.8"/>`)
    shown.forEach((blk, bi) => {
      const yy = outTop + bi * rowH + rowH / 2
      rows.push(`<line x1="${outX - 8}" y1="${yy}" x2="${outX}" y2="${yy}" stroke="${LINE}" stroke-width="1.8"/>`)
      rows.push(blk.draw(yy))
      rows.push(`<line x1="${outX + blk.end}" y1="${yy}" x2="${RAIL_W - 40}" y2="${yy}" stroke="${LINE}" stroke-width="1.8"/>`)
    })
    if (shown.length > 1) {
      const t = outTop + rowH / 2
      const b = outTop + (shown.length - 1) * rowH + rowH / 2
      rows.push(`<line x1="${outX - 8}" y1="${t}" x2="${outX - 8}" y2="${b}" stroke="${LINE}" stroke-width="1.8"/>`)
    }
    y += height + 8
    // separador entre networks
    rows.push(`<line x1="26" y1="${y - 6}" x2="${RAIL_W - 26}" y2="${y - 6}" stroke="#d5deea" stroke-width="1" stroke-dasharray="3 5"/>`)
  })
  const total = y + 6
  const rails = `<rect x="0" y="0" width="${RAIL_W}" height="${total}" rx="14" fill="#fff" stroke="#d3dcea" stroke-width="1.5"/>
<line x1="40" y1="10" x2="40" y2="${total - 10}" stroke="${BRAND}" stroke-width="4" stroke-linecap="round"/>
<line x1="${RAIL_W - 40}" y1="10" x2="${RAIL_W - 40}" y2="${total - 10}" stroke="${BRAND}" stroke-width="4" stroke-linecap="round"/>`
  const more = rungs.length > list.length ? `<text x="${RAIL_W / 2}" y="${total - 8}" font-size="11" fill="${MUTED}" text-anchor="middle" font-family="${SANS}">+ ${rungs.length - list.length} networks</text>` : ''
  return frame({ w: RAIL_W, h: total, body: rails + rows.join('') + more }, title, 'LADDER')
}

// ───────────────────────────── GRAFCET ─────────────────────────────

const STEP = 54
const MAX_STEPS = 16

export function grafcetCoverSvg(program: GrafcetProgram, title = 'GRAFCET'): string | null {
  const allSteps = program.steps ?? []
  if (!allSteps.length) return null
  // posição: manual (fixada) ou coluna sequencial, igual ao editor
  const pos = new Map<string, { x: number; y: number }>()
  let cursor = START_Y
  allSteps.forEach((s) => {
    const pinned = s.pinned === true && Number.isFinite(s.x) && Number.isFinite(s.y)
    pos.set(s.id, pinned ? { x: s.x!, y: s.y! } : { x: SPINE_X, y: cursor })
    cursor += stepPitch(actionsOfStep(s).length)
  })
  const steps = [...allSteps].sort((a, b) => pos.get(a.id)!.y - pos.get(b.id)!.y).slice(0, MAX_STEPS)
  const keep = new Set(steps.map((s) => s.id))
  const index = new Map(allSteps.map((s, i) => [s.id, i]))
  const transitions = (program.transitions ?? []).filter((t) => t.from.some((f) => keep.has(f)) && t.to.some((x) => keep.has(x)))

  // linear legado: sem transições → usa a condição da etapa
  const parts: string[] = []
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const grow = (x: number, y: number) => {
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x)
    bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y)
  }
  const line = (x1: number, y1: number, x2: number, y2: number, w = 2) => {
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="${w}" stroke-linecap="square"/>`)
    grow(x1, y1); grow(x2, y2)
  }
  const arrow = (x: number, y: number) => parts.push(`<path d="M${x - 5} ${y - 9}L${x} ${y}L${x + 5} ${y - 9}" fill="none" stroke="${INK}" stroke-width="1.8"/>`)

  const pt = (id: string) => pos.get(id)!
  const loopLane = Math.min(...steps.map((s) => pt(s.id).x)) - STEP / 2 - 46

  let tn = 0
  const transitionList = transitions.length
    ? transitions
    : steps.slice(0, -1).map((s, i) => ({ id: `lin${i}`, from: [s.id], to: [steps[i + 1].id], condition: s.condition || '' }))
  transitionList.forEach((t) => {
    tn += 1
    const froms = t.from.filter((f) => keep.has(f))
    const tos = t.to.filter((x) => keep.has(x))
    if (!froms.length || !tos.length) return
    const fromBottom = Math.max(...froms.map((f) => pt(f).y + STEP))
    const toTop = Math.min(...tos.map((x) => pt(x).y))
    const back = toTop <= fromBottom - 4
    const midY = back ? fromBottom + 30 : (fromBottom + toTop) / 2
    const cx = pt(froms[0]).x
    const barX = cx
    if (!back) {
      if (froms.length > 1) {
        const xs = froms.map((f) => pt(f).x)
        froms.forEach((f) => line(pt(f).x, pt(f).y + STEP, pt(f).x, midY - 10))
        line(Math.min(...xs), midY - 10, Math.max(...xs), midY - 10, 2)
        line(Math.min(...xs), midY - 14, Math.max(...xs), midY - 14, 2)
        line(barX, midY - 14, barX, midY)
      } else line(cx, fromBottom, cx, midY)
      if (tos.length > 1) {
        const xs = tos.map((x) => pt(x).x)
        line(barX, midY, barX, midY + 10)
        line(Math.min(...xs), midY + 10, Math.max(...xs), midY + 10, 2)
        line(Math.min(...xs), midY + 14, Math.max(...xs), midY + 14, 2)
        tos.forEach((x) => { line(pt(x).x, midY + 14, pt(x).x, pt(x).y); arrow(pt(x).x, pt(x).y) })
      } else {
        const tx = pt(tos[0]).x
        if (tx !== barX) { line(barX, midY, barX, midY + 22); line(barX, midY + 22, tx, midY + 22); line(tx, midY + 22, tx, toTop) } else line(barX, midY, tx, toTop)
        arrow(tx, toTop)
      }
    } else {
      // retorno: desce, passa pela faixa lateral esquerda e entra por cima
      const tx = pt(tos[0]).x
      line(cx, fromBottom, cx, midY)
        line(cx, midY, cx, midY + 22)
      line(cx, midY + 22, loopLane, midY + 22)
      line(loopLane, midY + 22, loopLane, toTop - 22)
      line(loopLane, toTop - 22, tx, toTop - 22)
      line(tx, toTop - 22, tx, toTop)
      arrow(tx, toTop)
    }
    // barra da transição + texto
    parts.push(`<line x1="${barX - 11}" y1="${midY}" x2="${barX + 11}" y2="${midY}" stroke="${BRAND}" stroke-width="3.4"/>`)
    grow(barX - 11, midY)
    parts.push(`<text x="${barX - 17}" y="${midY + 4}" font-size="11" font-weight="700" fill="${MUTED}" text-anchor="end" font-family="${FONT}">T${tn}</text>`)
    const cond = cut((t.condition || '').trim(), 26)
    if (cond) {
      parts.push(`<text x="${barX + 17}" y="${midY + 4}" font-size="12" font-weight="700" fill="${INK}" font-family="${FONT}">${esc(cond)}</text>`)
      grow(barX + 17 + cond.length * 7.2, midY)
    }
  })

  const stepNode = (s: GrafcetStep) => {
    const { x, y } = pt(s.id)
    const initial = s.initial || s.stepType === 'initial' || s.stepType === 'initial-enclosing'
    const left = x - STEP / 2
    const num = String(index.get(s.id) ?? 0)
    const outer = `<rect x="${left}" y="${y}" width="${STEP}" height="${STEP}" fill="#fff" stroke="${INK}" stroke-width="2.2"/>`
    const inner = initial ? `<rect x="${left + 5}" y="${y + 5}" width="${STEP - 10}" height="${STEP - 10}" fill="none" stroke="${INK}" stroke-width="1.6"/>` : ''
    parts.push(`${outer}${inner}<text x="${x}" y="${y + STEP / 2 + 6}" font-size="19" font-weight="800" fill="${INK}" text-anchor="middle" font-family="${FONT}">${esc(num)}</text>`)
    grow(left, y); grow(left + STEP, y + STEP)
    const acts = actionsOfStep(s).slice(0, 3)
    const total = acts.length
    acts.forEach((a, ai) => {
      const ay = y + STEP / 2 - (total * 34 - 8) / 2 + ai * 34 + 13
      const label = cut((a.variable || a.address || '').trim() || '?', 14)
      const tag = a.kind && a.kind !== 'N' ? `${a.kind} ` : ''
      const boxX = x + STEP / 2 + 22
      const width = Math.max(78, (tag + label).length * 8.4 + 22)
      parts.push(`<line x1="${x + STEP / 2}" y1="${y + STEP / 2}" x2="${boxX}" y2="${y + STEP / 2}" stroke="${INK}" stroke-width="1.6"/>`)
      if (ai > 0 || total > 1) parts.push(`<line x1="${boxX}" y1="${y + STEP / 2}" x2="${boxX}" y2="${ay}" stroke="${INK}" stroke-width="1.6"/>`)
      parts.push(`<rect x="${boxX}" y="${ay - 13}" width="${width}" height="26" fill="#fff" stroke="${INK}" stroke-width="1.8"/><text x="${boxX + width / 2}" y="${ay + 4.5}" font-size="12.5" font-weight="700" fill="${INK}" text-anchor="middle" font-family="${FONT}">${esc(tag + label)}</text>`)
      grow(boxX + width, ay + 13)
    })
  }
  steps.forEach(stepNode)
  if (!Number.isFinite(bounds.minX)) return null
  const pad = 26
  const w = bounds.maxX - bounds.minX + pad * 2
  const h = bounds.maxY - bounds.minY + pad * 2
  const body = `<g transform="translate(${pad - bounds.minX} ${pad - bounds.minY})">${parts.join('')}</g>`
  const note = allSteps.length > steps.length ? `${title} · +${allSteps.length - steps.length} etapas` : title
  return frame({ w, h, body }, note, 'GRAFCET')
}


// ───────────────────── Captura do SVG real do editor ─────────────────────

const STYLE_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'text-decoration',
  'dominant-baseline',
]
const DROP = /(^|\s|-)(handle|handles|guide|guides|marquee|hit|ghost|drop|hover|cursor|rubber)(\s|-|$)/i
const SELECTION = /(^|\s|-)(sel|selection)(\s|-|$)/i

/** Copia o SVG do editor com os estilos já resolvidos (as classes CSS não existem fora da página). */
function cloneWithStyles(source: SVGElement): SVGElement {
  const clone = source.cloneNode(true) as SVGElement
  const walk = (src: Element, dst: Element) => {
    const srcKids = Array.from(src.children)
    const dstKids = Array.from(dst.children)
    srcKids.forEach((child, i) => {
      const twin = dstKids[i]
      if (!twin) return
      const cls = (child.getAttribute('class') ?? '')
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

/** Caixa do conteúdo desenhado (ignora o fundo/grelha que ocupa o SVG todo). */
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
    } catch { /* elemento sem geometria */ }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null
}

function grafcetFromEditor(): string | null {
  const svg = document.querySelector<SVGSVGElement>('.grafcet-pan-layer svg[role="img"]')
  if (!svg) return null
  const box = contentBox(svg)
  if (!box || box.w < 10 || box.h < 10) return null
  const pad = 28
  const clone = cloneWithStyles(svg)
  const x = box.x - pad, y = box.y - pad, w = box.w + pad * 2, h = box.h + pad * 2
  clone.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
  clone.setAttribute('x', '0'); clone.setAttribute('y', '0')
  clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
  clone.removeAttribute('style'); clone.removeAttribute('role'); clone.removeAttribute('aria-label')
  const inner = new XMLSerializer().serializeToString(clone)
  return frame({ w, h, body: inner })
}

function ladderFromEditor(): string | null {
  const seen = new Set<SVGSVGElement>()
  const nets = Array.from(document.querySelectorAll<SVGSVGElement>('.ladder-networks .lnet > svg'))
    .filter((svg) => (seen.has(svg) ? false : (seen.add(svg), true)))
  if (!nets.length) return null
  const gap = 14
  let y = 0
  let width = 0
  const parts: string[] = []
  for (const net of nets) {
    const w = net.width.baseVal.value, h = net.height.baseVal.value
    if (!w || !h) continue
    if (y > 0 && y + h > 1100) break
    const clone = cloneWithStyles(net)
    clone.setAttribute('x', '0'); clone.setAttribute('y', String(y))
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
    clone.removeAttribute('aria-hidden')
    // ids de padrões/marcadores repetidos entre networks: prefixa para não colidirem
    let markup = new XMLSerializer().serializeToString(clone)
    const prefix = `n${parts.length}-`
    markup = markup.replace(/id="([^"]+)"/g, `id="${prefix}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
    parts.push(`<rect x="0" y="${y}" width="${w}" height="${h}" rx="10" fill="#fff" stroke="#d3dcea"/>${markup}`)
    y += h + gap
    width = Math.max(width, w)
  }
  if (!parts.length) return null
  return frame({ w: width, h: y - gap, body: parts.join('') })
}

/** SVG do editor aberto (Grafcet ou Ladder), tal como está no ecrã. Null se não estiver montado. */
export function editorFlowSvg(kind: ProjectKind): string | null {
  if (typeof document === 'undefined') return null
  try {
    if (kind === 'ladder') return ladderFromEditor()
    if (kind === 'grafcet') return grafcetFromEditor()
    return grafcetFromEditor() ?? ladderFromEditor()
  } catch {
    return null
  }
}

// ───────────────────────────── Rasterização ─────────────────────────────

/** SVG → JPEG data URL (dentro do limite de tamanho guardado nos projetos). */
export async function svgToJpegDataUrl(svg: string): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('svg'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = COVER_W
    canvas.height = COVER_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#f7f9fc'
    ctx.fillRect(0, 0, COVER_W, COVER_H)
    ctx.drawImage(img, 0, 0, COVER_W, COVER_H)
    for (const q of [0.86, 0.76, 0.64, 0.5]) {
      const out = canvas.toDataURL('image/jpeg', q)
      if (out.length <= COVER_MAX_CHARS) return out
    }
    return null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export type FlowCoverInput = { kind: ProjectKind; rungs: LadderRung[]; grafcet: GrafcetProgram; name?: string }

/** Tipo de diagrama a usar como cover, por ordem de prioridade do tipo de projeto. */
export function flowCoverSvg({ kind, rungs, grafcet, name }: FlowCoverInput): string | null {
  const grafcetFirst = kind === 'grafcet' || (kind === 'all' && !rungs.length)
  const order = grafcetFirst ? ['g', 'l'] : ['l', 'g']
  for (const which of order) {
    if (kind === 'ladder' && which === 'g') continue
    if (kind === 'grafcet' && which === 'l' && grafcet.steps?.length) continue
    const svg = which === 'g' ? grafcetCoverSvg(grafcet, name || grafcet.name || 'GRAFCET') : ladderCoverSvg(rungs, name || 'Ladder')
    if (svg) return svg
  }
  return null
}

export async function flowCoverDataUrl(input: FlowCoverInput): Promise<string | null> {
  // 1.º o conteúdo real do editor; só se não estiver visível usa o desenho de reserva.
  for (const svg of [editorFlowSvg(input.kind), flowCoverSvg(input)]) {
    if (!svg) continue
    const url = await svgToJpegDataUrl(svg)
    if (url) return url
  }
  return null
}
