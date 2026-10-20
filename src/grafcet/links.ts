/**
 * Traçado e colocação de elementos GRAFCET.
 * Todas as ligações são segmentos retos (verticais/horizontais, como na norma IEC 60848):
 * sem curvas. Um único sítio decide o caminho — o editor só chama estas funções.
 */
import { GRID, MIN_X, MIN_Y } from './layout'

export interface Point { x: number; y: number }

/** Caminho SVG por segmentos retos entre pontos consecutivos. */
export const polylinePath = (points: Point[]): string =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

/**
 * Ligação vertical de (sx, sy) a (tx, ty): reta quando alinhados; caso contrário
 * desce, desloca na horizontal a meio e volta a descer (sempre ângulos retos).
 */
export function routeVertical(sx: number, sy: number, tx: number, ty: number, midY?: number): string {
  if (Math.round(sx) === Math.round(tx)) return `M ${sx} ${sy} V ${ty}`
  const my = Math.round(midY ?? (sy + ty) / 2)
  return `M ${sx} ${sy} V ${my} H ${tx} V ${ty}`
}

const BOX = { w: 130, h: 90 }

/**
 * Procura uma posição livre (encaixada na grelha) à volta de `want`, a espiral de
 * células à procura de um sítio sem sobreposição com `occupied` (centros dos elementos).
 */
export function findClearSpot(want: Point, occupied: Point[], box = BOX): Point {
  const snap = (v: number) => Math.round(v / GRID) * GRID
  const clash = (p: Point) => occupied.some((o) => Math.abs(o.x - p.x) < box.w && Math.abs(o.y - p.y) < box.h)
  const base = { x: Math.max(MIN_X, snap(want.x)), y: Math.max(MIN_Y, snap(want.y)) }
  if (!clash(base)) return base
  const stepX = Math.ceil(box.w / GRID) * GRID
  const stepY = Math.ceil(box.h / GRID) * GRID
  for (let ring = 1; ring < 12; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        const p = { x: Math.max(MIN_X, base.x + dx * stepX), y: Math.max(MIN_Y, base.y + dy * stepY) }
        if (!clash(p)) return p
      }
    }
  }
  return base
}
