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

/** Desdobra os cotovelos V→H: entre pontos desalinhados aparece o canto intermédio. */
export function expandPolyline(points: readonly Point[]): Point[] {
  const out: Point[] = []
  let prev: Point | null = null
  for (const point of points) {
    if (prev && Math.round(prev.x) !== Math.round(point.x) && Math.round(prev.y) !== Math.round(point.y)) out.push({ x: prev.x, y: point.y })
    out.push({ x: point.x, y: point.y })
    prev = point
  }
  return out
}

/** Caminho ortogonal (vertical depois horizontal) através de todos os pontos — usado com pontos de quebra. */
export const routeThrough = (points: readonly Point[]): string => polylinePath(expandPolyline(points))

/** Ponto a meio (em comprimento) do percurso ortogonal — posição da barra quando há pontos de quebra. */
export function polylineMidpoint(points: readonly Point[]): Point {
  const pts = expandPolyline(points)
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 }
  const lengths = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))
  const half = lengths.reduce((sum, length) => sum + length, 0) / 2
  let walked = 0
  for (let i = 0; i < lengths.length; i++) {
    if (walked + lengths[i] >= half) {
      const ratio = lengths[i] === 0 ? 0 : (half - walked) / lengths[i]
      return { x: Math.round(pts[i].x + (pts[i + 1].x - pts[i].x) * ratio), y: Math.round(pts[i].y + (pts[i + 1].y - pts[i].y) * ratio) }
    }
    walked += lengths[i]
  }
  return pts[pts.length - 1]
}

const distSeg = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (!len2) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Distância de um ponto ao troço (com o cotovelo V→H) entre dois pontos consecutivos. */
const distToLeg = (p: Point, a: Point, b: Point): number => {
  if (Math.round(a.x) !== Math.round(b.x) && Math.round(a.y) !== Math.round(b.y)) {
    const corner = { x: a.x, y: b.y }
    return Math.min(distSeg(p, a, corner), distSeg(p, corner, b))
  }
  return distSeg(p, a, b)
}

/**
 * Onde inserir um novo ponto de quebra na lista `points` = [início, …quebras, fim]:
 * devolve o índice (0…nº de quebras) mais próximo do ponto clicado.
 */
export function bendInsertIndex(points: readonly Point[], clicked: Point): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const dist = distToLeg(clicked, points[i], points[i + 1])
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
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
