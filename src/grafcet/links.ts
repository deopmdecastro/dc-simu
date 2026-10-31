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

// ---------------------------------------------------------------------------
// Arrasto ortogonal de troços
// ---------------------------------------------------------------------------
const same = (a: number, b: number) => Math.round(a) === Math.round(b)

/** Remove pontos repetidos e colineares; os extremos (ancoragens) nunca se perdem. */
export function simplifyOrthogonal(points: readonly Point[]): Point[] {
  const deduped: Point[] = []
  for (const p of points) {
    const last = deduped[deduped.length - 1]
    if (!last || !same(last.x, p.x) || !same(last.y, p.y)) deduped.push({ x: p.x, y: p.y })
  }
  const out: Point[] = []
  for (let i = 0; i < deduped.length; i++) {
    const prev = out[out.length - 1]
    const next = deduped[i + 1]
    const cur = deduped[i]
    if (prev && next && ((same(prev.x, cur.x) && same(cur.x, next.x)) || (same(prev.y, cur.y) && same(cur.y, next.y)))) continue
    out.push(cur)
  }
  return out
}

/** Troço (índice i = pontos[i]→pontos[i+1]) mais próximo de `clicked`, num percurso já ortogonal. */
export function nearestLeg(points: readonly Point[], clicked: Point): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const dist = distSeg(clicked, points[i], points[i + 1])
    if (dist < bestDist) { bestDist = dist; best = i }
  }
  return best
}

export interface SegmentDrag {
  /** Percurso ortogonal completo (com ancoragens) no início do gesto, já com os troços de saída/entrada separados. */
  base: Point[]
  /** Índice do troço arrastado em `base` (base[leg] → base[leg + 1]). */
  leg: number
  /** Eixo em que o troço se move: 'x' para troços verticais, 'y' para horizontais. */
  axis: 'x' | 'y'
}

/**
 * Prepara o arrasto do troço `leg` de um percurso ortogonal. Se o troço toca numa ancoragem
 * (saída da etapa de origem ou entrada na de destino), separa um pequeno troço fixo junto à
 * ancoragem para que ela nunca se mova e o percurso continue ligado às etapas.
 */
export function beginSegmentDrag(path: readonly Point[], leg: number, stub = 12): SegmentDrag | null {
  const pts = simplifyOrthogonal(path)
  if (pts.length < 2 || leg < 0 || leg >= pts.length - 1) return null
  const a = pts[leg]
  const b = pts[leg + 1]
  const vertical = same(a.x, b.x)
  if (!vertical && !same(a.y, b.y)) return null
  const axis: 'x' | 'y' = vertical ? 'x' : 'y'
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const cut = Math.min(stub, length / 2)
  const along = (from: Point, to: Point, d: number): Point => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1
    return { x: from.x + ((to.x - from.x) / len) * d, y: from.y + ((to.y - from.y) / len) * d }
  }
  const base = pts.map((p) => ({ ...p }))
  let index = leg
  // Duplica o ponto de corte: um fica fixo junto à ancoragem e o outro desliza com o troço,
  // o que dá um degrau ortogonal em vez de uma diagonal. Separa primeiro o fim (não desloca o início).
  if (leg + 1 === pts.length - 1) {
    const c = along(b, a, cut)
    base.splice(leg + 1, 0, { ...c }, { ...c })
  }
  if (leg === 0) {
    const c = along(a, b, cut)
    base.splice(1, 0, { ...c }, { ...c })
    index = 2
  }
  return { base, leg: index, axis }
}

/** Percurso resultante de deslocar o troço `delta` unidades (no seu eixo livre); vizinhos esticam, mantendo ângulos retos. */
export function applySegmentDrag(drag: SegmentDrag, delta: number): Point[] {
  const out = drag.base.map((p) => ({ ...p }))
  for (const i of [drag.leg, drag.leg + 1]) out[i][drag.axis] += delta
  return out
}

/** Pontos interiores (os que se guardam como «quebras») de um percurso com ancoragens nos extremos. */
export function interiorBends(path: readonly Point[]): Point[] {
  return simplifyOrthogonal(path).slice(1, -1).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
}

/**
 * Move a quebra `index` para `p` e arrasta os vizinhos interiores que partilhavam o seu eixo,
 * para os troços continuarem retos. Os extremos (ancoragens) não fazem parte da lista.
 */
export function moveBendOrthogonal(bends: readonly Point[], index: number, p: Point): Point[] {
  const old = bends[index]
  if (!old) return bends.map((b) => ({ ...b }))
  return bends.map((b, i) => {
    if (i === index) return { x: p.x, y: p.y }
    if (Math.abs(i - index) !== 1) return { ...b }
    if (same(b.x, old.x)) return { x: p.x, y: b.y }
    if (same(b.y, old.y)) return { x: b.x, y: p.y }
    return { ...b }
  })
}

/**
 * Percurso ortogonal da origem ao destino a passar pela barra da transição em `bar`
 * (a barra fica sempre num troço vertical descendente, como na IEC 60848). Usado para mover a
 * transição livremente sem soltar as linhas:
 *  - destino abaixo: desce da origem, vai à coluna da barra, atravessa-a e segue para o destino;
 *  - destino acima ou demasiado perto (retorno): depois da barra contorna por uma calha lateral e
 *    entra no destino por cima.
 * `clampBar` devolve a barra limitada a ficar abaixo da etapa de origem.
 */
export function clampBar(source: Point, bar: Point, clearance = 20): Point {
  return { x: Math.round(bar.x), y: Math.round(Math.max(bar.y, source.y + clearance * 2)) }
}

export function routeViaBar(source: Point, rawBar: Point, target: Point, clearance = 20): Point[] {
  const bar = clampBar(source, rawBar, clearance)
  const above = Math.round((source.y + bar.y) / 2)
  const head: Point[] = [{ x: source.x, y: source.y }, { x: source.x, y: above }, { x: bar.x, y: above }, { x: bar.x, y: bar.y }]
  if (target.y - bar.y >= clearance * 2) {
    const below = Math.round((bar.y + target.y) / 2)
    return simplifyOrthogonal([...head, { x: bar.x, y: below }, { x: target.x, y: below }, { x: target.x, y: target.y }])
  }
  // Retorno: desce um pouco, vai à calha lateral, sobe e entra no destino por cima.
  const down = bar.y + clearance
  const track = Math.min(source.x, target.x, bar.x) - clearance * 3
  const top = target.y - clearance
  return simplifyOrthogonal([...head, { x: bar.x, y: down }, { x: track, y: down }, { x: track, y: top }, { x: target.x, y: top }, { x: target.x, y: target.y }])
}

/** O ponto `p` está sobre o percurso ortogonal (com tolerância em px)? */
export function pointOnPolyline(points: readonly Point[], p: Point, tolerance = 1.5): boolean {
  const pts = expandPolyline(points)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const minX = Math.min(a.x, b.x) - tolerance
    const maxX = Math.max(a.x, b.x) + tolerance
    const minY = Math.min(a.y, b.y) - tolerance
    const maxY = Math.max(a.y, b.y) + tolerance
    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue
    // Troços ortogonais: basta estar na faixa do segmento.
    if (Math.abs(a.x - b.x) <= tolerance || Math.abs(a.y - b.y) <= tolerance) return true
  }
  return false
}
