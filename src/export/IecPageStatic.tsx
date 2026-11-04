/** Folha do Esquema IEC desenhada de forma estática (sem interação) para o PDF.
 *  Reutiliza o mesmo `CmdSymbol`, `wirePoints` e cores de cabo do editor IEC, por isso o
 *  desenho exportado é o do ecrã (em repouso: sem simulação). */
import type { CanvasText } from '../types'
import { partBox, terminalAt, wirePoints, type CmdPart, type CmdWire, type CommandsDiagram, type Pt } from '../commands/model'
import { partsOnPage, textsOnPage, wiresOnPage } from '../commands/pages'
import { emptyCmdRuntime, isClosed } from '../commands/engine'
import { CmdSymbol, cmdTagBounds } from '../commands/symbols'
import { WIRE_COLOR_HEX } from '../admin/editor3d/wireStyle'
import { WIRE_COLORS } from '../schematic/symbols'

const PAD = 28
const labelBox = (t: { x: number; y: number; text: string }) => ({ x: t.x, y: t.y - 13, w: Math.max(13, t.text.length * 7.6), h: 17 })

export const iecPageTexts = (texts: CanvasText[], pageId: string, firstPageId: string) =>
  texts.filter((t) => t.view === 'commands' && (t.page ? t.page === pageId : pageId === firstPageId))

function wireHex(w: CmdWire) {
  if (w.color) return (WIRE_COLOR_HEX as Record<string, string>)[w.color] ?? (WIRE_COLORS as Record<string, string>)[w.color] ?? w.color
  return '#475569'
}

/** Caixa que envolve símbolos, etiquetas, bornes e textos livres da folha. */
export function iecPageBounds(diagram: CommandsDiagram, pageId: string, free: CanvasText[]) {
  const parts = partsOnPage(diagram, pageId)
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = []
  for (const p of parts) {
    boxes.push(partBox(p))
    try { const t = cmdTagBounds(p); if (t) boxes.push(t as { x: number; y: number; w: number; h: number }) } catch { /* sem etiqueta */ }
  }
  for (const t of textsOnPage(diagram, pageId)) boxes.push(labelBox(t))
  for (const t of free) {
    const lines = t.text.split('\n')
    boxes.push({ x: t.x, y: t.y, w: t.width ?? Math.max(...lines.map((l) => l.length)) * t.size * 0.6, h: lines.length * t.size * 1.3 })
  }
  const valid = boxes.filter((b) => Number.isFinite(b.x + b.y + b.w + b.h))
  if (!valid.length) return null
  const x0 = Math.min(...valid.map((b) => b.x)), y0 = Math.min(...valid.map((b) => b.y))
  const x1 = Math.max(...valid.map((b) => b.x + b.w)), y1 = Math.max(...valid.map((b) => b.y + b.h))
  return { x: x0 - PAD, y: y0 - PAD, w: x1 - x0 + PAD * 2, h: y1 - y0 + PAD * 2 }
}

export default function IecPageStatic({ diagram, pageId, free }: { diagram: CommandsDiagram; pageId: string; free: CanvasText[] }) {
  const box = iecPageBounds(diagram, pageId, free)
  if (!box) return null
  const parts = partsOnPage(diagram, pageId)
  const byId = new Map<string, CmdPart>(parts.map((p) => [p.id, p]))
  const rt = emptyCmdRuntime()
  const pointsOf = (w: CmdWire): Pt[] => {
    const a = byId.get(w.a.part), b = byId.get(w.b.part)
    return a && b ? wirePoints(terminalAt(a, w.a.term), terminalAt(b, w.b.term), w.mid) : []
  }
  return (
    <svg className="dc-cmd-svg iec-pdf-svg" xmlns="http://www.w3.org/2000/svg" width={box.w} height={box.h} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} style={{ position: 'static' }}>
      {textsOnPage(diagram, pageId).map((t) => <text key={t.id} className="dc-cmd-text" x={t.x} y={t.y}>{t.text}</text>)}
      {wiresOnPage(diagram, pageId).map((w) => {
        const pts = pointsOf(w)
        if (pts.length < 2) return null
        return <path key={w.id} className="dc-cmd-wire" d={pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')} stroke={wireHex(w)} strokeWidth={1.6} fill="none" />
      })}
      {parts.map((part) => <g key={part.id}><CmdSymbol part={part} state={{ closed: isClosed(part, rt), idle: true }} /></g>)}
      {free.map((t) => (
        <text key={t.id} x={t.x} y={t.y + t.size} fill={t.color} fontSize={t.size} fontWeight={t.bold ? 700 : 400} fontStyle={t.italic ? 'italic' : 'normal'}
          textAnchor={t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start'}
          transform={t.rotation ? `rotate(${t.rotation} ${t.x} ${t.y})` : undefined}>
          {t.text.split('\n').map((line, i) => <tspan key={i} x={t.x} dy={i ? t.size * 1.25 : 0}>{line}</tspan>)}
        </text>
      ))}
    </svg>
  )
}
