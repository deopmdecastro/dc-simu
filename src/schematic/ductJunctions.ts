import type { ElectricalComponent } from '../types'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'

/**
 * Passagem de cabos numa junção de calhas: troço da parede lateral (dedos/pinos e fita) que se abre
 * porque outra calha desemboca ou atravessa ali. Coordenadas locais da calha, em mm:
 * `from`/`to` medidos a partir do centro ao longo do comprimento; `side` é o lado no Esquema
 * (`top` = y local negativo, `bottom` = y local positivo).
 */
export interface DuctOpening { side: 'top' | 'bottom'; from: number; to: number }

/** Folga (px) com que uma calha encostada conta como junção. */
const TOUCH_PX = 10
/** Abertura mínima (mm) para valer a pena partir pinos. */
const MIN_OPENING_MM = 8
/** Extra em cada lado da interseção (mm) para limpar bem os dedos/pinos à volta da passagem. */
const OPENING_MARGIN_MM = 6

/**
 * Onde as calhas perpendiculares se encontram com a parede de `c` (T, L e cruz). Calhas paralelas
 * lado a lado não abrem passagem: só quem cruza ou desemboca na parede.
 */
export function ductJunctionOpenings(c: ElectricalComponent, all: ElectricalComponent[]): DuctOpening[] {
  if (c.type !== 'cableDuct') return []
  const a = ((c.rotation ?? 0) * Math.PI) / 180
  const ux = Math.cos(a), uy = Math.sin(a), vx = -Math.sin(a), vy = Math.cos(a)
  const cx = c.schematicX + c.w / 2, cy = c.schematicY + c.h / 2
  const half = c.w / 2
  const out: DuctOpening[] = []
  for (const o of all) {
    if (o.id === c.id || o.type !== 'cableDuct') continue
    const b = ((o.rotation ?? 0) * Math.PI) / 180
    // eixo do outro no referencial de c: só perpendiculares (|cos| pequeno)
    if (Math.abs(Math.cos(b) * ux + Math.sin(b) * uy) > 0.5) continue
    const dx = o.schematicX + o.w / 2 - cx, dy = o.schematicY + o.h / 2 - cy
    const lx = dx * ux + dy * uy, ly = dx * vx + dy * vy
    // extensão do outro em x (largura dele) e em y (comprimento dele) no referencial de c
    const x0 = lx - o.h / 2, x1 = lx + o.h / 2
    const y0 = ly - o.w / 2, y1 = ly + o.w / 2
    const from = Math.max(-half, x0), to = Math.min(half, x1)
    if (to - from < MIN_OPENING_MM * SCHEMATIC_PX_PER_MM) continue
    for (const side of ['top', 'bottom'] as const) {
      const wall = side === 'top' ? -c.h / 2 : c.h / 2
      if (y0 - TOUCH_PX <= wall && wall <= y1 + TOUCH_PX) {
        // espelhar inverte o sentido do eixo local
        // alarga um pouco para limpar os pinos (dedos) junto à interseção
        let f = (c.mirrored ? -to : from) / SCHEMATIC_PX_PER_MM
        let t = (c.mirrored ? -from : to) / SCHEMATIC_PX_PER_MM
        if (f > t) { const tmp = f; f = t; t = tmp }
        f -= OPENING_MARGIN_MM
        t += OPENING_MARGIN_MM
        const halfMm = half / SCHEMATIC_PX_PER_MM
        f = Math.max(-halfMm, f)
        t = Math.min(halfMm, t)
        if (t - f >= MIN_OPENING_MM) out.push({ side, from: f, to: t })
      }
    }
  }
  return out
}

/** Chave estável para dependências de memo. */
export const ductOpeningsKey = (o: DuctOpening[]): string => o.map((x) => `${x.side[0]}${x.from.toFixed(1)}:${x.to.toFixed(1)}`).join('|')

/** Intervalos [a,b] de `[-L/2, L/2]` que ficam fechados depois de tirar as aberturas do lado `side`. */
export function closedSpans(L: number, openings: DuctOpening[], side: 'top' | 'bottom'): Array<[number, number]> {
  const cuts = openings.filter((o) => o.side === side).map((o) => [Math.min(o.from, o.to), Math.max(o.from, o.to)] as [number, number]).sort((p, q) => p[0] - q[0])
  const spans: Array<[number, number]> = []
  let cur = -L / 2
  for (const [f, t] of cuts) {
    if (f > cur) spans.push([cur, Math.min(f, L / 2)])
    cur = Math.max(cur, t)
  }
  if (cur < L / 2) spans.push([cur, L / 2])
  return spans.filter(([s, e]) => e - s > 0.01)
}

export const inOpening = (openings: DuctOpening[], side: 'top' | 'bottom', x0: number, x1: number): boolean =>
  openings.some((o) => o.side === side && x1 > Math.min(o.from, o.to) && x0 < Math.max(o.from, o.to))
