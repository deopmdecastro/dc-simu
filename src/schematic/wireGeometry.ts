import type { Wire } from '../types'

export type Pt = { x: number; y: number }

export interface WireSegmentHandle {
  /** Índice do segmento na polilinha ortogonal (entre `pts[segIndex]` e `pts[segIndex + 1]`). */
  segIndex: number
  /** Ponto médio visual da pega. */
  x: number
  y: number
  /** Orientação do segmento: horizontal move em Y (`ns-resize`), vertical move em X (`ew-resize`). */
  axis: 'h' | 'v'
  /** Comprimento do segmento (px). */
  length: number
}

export interface DraftSnap2D {
  point: Pt
  /** Coordenada X alinhada magneticamente (desenha linha-guia vertical). */
  guideX: number | null
  /** Coordenada Y alinhada magneticamente (desenha linha-guia horizontal). */
  guideY: number | null
  /** Etiqueta curta do alinhamento ativo («90° X», «90° Y», «45°», «Borne»). */
  lockLabel: string | null
}

/** Segmentos retos para a ligação direta (sem cotovelos). */
function sharpPath(pts: Pt[]) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ')
}

/** Remove pontos duplicados e funde colineares consecutivos sem recuo. */
function cleanCollinear(pts: Pt[]): Pt[] {
  const unique = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.05)
  if (unique.length <= 2) return unique
  const clean: Pt[] = [unique[0]]
  for (let i = 1; i < unique.length - 1; i++) {
    const prev = clean[clean.length - 1], p = unique[i], next = unique[i + 1]
    const d1 = Math.hypot(p.x - prev.x, p.y - prev.y)
    const d2 = Math.hypot(next.x - p.x, next.y - p.y)
    const cross = (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x)
    const dot = (p.x - prev.x) * (next.x - p.x) + (p.y - prev.y) * (next.y - p.y)
    if (Math.abs(cross) < 0.002 * d1 * d2 && dot >= 0) continue
    clean.push(p)
  }
  clean.push(unique[unique.length - 1])
  return clean
}

/**
 * Raio visual dos cotovelos ortogonais. Limita-se a 46% de cada segmento
 * adjacente para curvas suaves e contínuas sem ultrapassar bornes nem pontos vizinhos.
 */
export const WIRE_CORNER_RADIUS = 18

export function roundedPath(pts: Pt[], radius = WIRE_CORNER_RADIUS) {
  const clean = cleanCollinear(pts)
  if (clean.length <= 2) return sharpPath(clean)
  let d = `M ${clean[0].x},${clean[0].y}`
  for (let i = 1; i < clean.length - 1; i++) {
    const prev = clean[i - 1], p = clean[i], next = clean[i + 1]
    const d1 = Math.hypot(p.x - prev.x, p.y - prev.y)
    const d2 = Math.hypot(next.x - p.x, next.y - p.y)
    const cross = (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x)
    if (Math.abs(cross) < 0.001 * d1 * d2) { d += ` L ${p.x},${p.y}`; continue }
    const r = Math.min(radius, d1 * 0.46, d2 * 0.46)
    const enter = { x: p.x - (p.x - prev.x) * r / d1, y: p.y - (p.y - prev.y) * r / d1 }
    const leave = { x: p.x + (next.x - p.x) * r / d2, y: p.y + (next.y - p.y) * r / d2 }
    d += ` L ${enter.x},${enter.y} Q ${p.x},${p.y} ${leave.x},${leave.y}`
  }
  const last = clean[clean.length - 1]
  return d + ` L ${last.x},${last.y}`
}

/** Avalia um ponto numa curva cúbica de Bézier. */
function evalCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t
  const uu = u * u, uuu = uu * u
  const tt = t * t, ttt = tt * t
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  }
}

/**
 * Curva suave C¹ (Catmull-Rom centrípeta convertida em Bézier cúbicas) que passa
 * exatamente por todos os pontos de passagem sem sobressaltos (sem auto-laços).
 */
export function smoothSplinePath(raw: Pt[]): { d: string; sampled: Pt[] } {
  const pts = raw.filter((p, i) => i === 0 || Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y) > 0.25)
  if (pts.length === 0) return { d: '', sampled: [] }
  if (pts.length === 1) return { d: `M ${pts[0].x},${pts[0].y}`, sampled: [pts[0]] }
  if (pts.length === 2) return { d: sharpPath(pts), sampled: pts }

  const alpha = 0.5
  const knot = (ti: number, a: Pt, b: Pt) => ti + Math.pow(Math.max(1e-3, Math.hypot(b.x - a.x, b.y - a.y)), alpha)
  let d = `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`
  const sampled: Pt[] = [pts[0]]

  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p0 = i === 0 ? { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y } : pts[i - 1]
    const p3 = i + 2 >= pts.length ? { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y } : pts[i + 2]

    const t0 = 0
    const t1 = knot(t0, p0, p1)
    const t2 = knot(t1, p1, p2)
    const t3 = knot(t2, p2, p3)
    const dt12 = Math.max(1e-4, t2 - t1)
    const dt02 = Math.max(1e-4, t2 - t0)
    const dt13 = Math.max(1e-4, t3 - t1)
    const dt01 = Math.max(1e-4, t1 - t0)
    const dt23 = Math.max(1e-4, t3 - t2)

    // Tangentes centrípetas de Barry–Goldman convertidas para pontos de controlo Bézier
    const m1x = dt12 * ((p1.x - p0.x) / dt01 - (p2.x - p0.x) / dt02 + (p2.x - p1.x) / dt12)
    const m1y = dt12 * ((p1.y - p0.y) / dt01 - (p2.y - p0.y) / dt02 + (p2.y - p1.y) / dt12)
    const m2x = dt12 * ((p2.x - p1.x) / dt12 - (p3.x - p1.x) / dt13 + (p3.x - p2.x) / dt23)
    const m2y = dt12 * ((p2.y - p1.y) / dt12 - (p3.y - p1.y) / dt13 + (p3.y - p2.y) / dt23)

    const c1: Pt = { x: p1.x + m1x / 3, y: p1.y + m1y / 3 }
    const c2: Pt = { x: p2.x - m2x / 3, y: p2.y - m2y / 3 }
    d += ` C ${c1.x.toFixed(2)},${c1.y.toFixed(2)} ${c2.x.toFixed(2)},${c2.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`

    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const steps = Math.max(6, Math.min(18, Math.ceil(segLen / 12)))
    for (let s = 1; s <= steps; s++) sampled.push(evalCubic(p1, c1, c2, p2, s / steps))
  }
  return { d, sampled }
}

/** Amostra os cantos arredondados reais para que marcadores, espirais e isolamento sigam o arco exato. */
export function sampleRoundedPolyline(pts: Pt[], radius = WIRE_CORNER_RADIUS): Pt[] {
  const clean = cleanCollinear(pts)
  if (clean.length <= 2) return clean
  const out: Pt[] = [clean[0]]
  for (let i = 1; i < clean.length - 1; i++) {
    const prev = clean[i - 1], p = clean[i], next = clean[i + 1]
    const d1 = Math.hypot(p.x - prev.x, p.y - prev.y)
    const d2 = Math.hypot(next.x - p.x, next.y - p.y)
    const cross = (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x)
    if (Math.abs(cross) < 0.001 * d1 * d2) { out.push(p); continue }
    const r = Math.min(radius, d1 * 0.46, d2 * 0.46)
    const enter = { x: p.x - (p.x - prev.x) * r / d1, y: p.y - (p.y - prev.y) * r / d1 }
    const leave = { x: p.x + (next.x - p.x) * r / d2, y: p.y + (next.y - p.y) * r / d2 }
    out.push(enter)
    for (let s = 1; s <= 5; s++) {
      const t = s / 5, u = 1 - t
      out.push({
        x: u * u * enter.x + 2 * u * t * p.x + t * t * leave.x,
        y: u * u * enter.y + 2 * u * t * p.y + t * t * leave.y,
      })
    }
  }
  out.push(clean[clean.length - 1])
  return out
}

/** Amostra uma curva quadrática `M a Q c b` para que isolamento/espiral/marcadores sigam a barriga real. */
function sampleQuadratic(a: Pt, c: Pt, b: Pt, steps = 16): Pt[] {
  const out: Pt[] = [a]
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    out.push({
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    })
  }
  return out
}

/** Condutor ortogonal: entre pontos não alinhados prolonga a direção do segmento anterior antes de virar a 90°. */
export function orthoPts(pts: Pt[]): Pt[] {
  const out: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1]
    const q = pts[i]
    const dx = Math.abs(p.x - q.x), dy = Math.abs(p.y - q.y)
    if (dx > 0.5 && dy > 0.5) {
      const prev = out.length >= 2 ? out[out.length - 2] : null
      const next = i + 1 < pts.length ? pts[i + 1] : null
      if (prev && Math.abs(p.x - prev.x) < 0.5 && Math.abs(p.y - prev.y) > 0.5) {
        // Vinha na vertical (ex.: saída axial de borne superior/inferior): mantém X e depois vira em Y.
        out.push({ x: p.x, y: q.y })
      } else if (prev && Math.abs(p.y - prev.y) < 0.5 && Math.abs(p.x - prev.x) > 0.5) {
        out.push({ x: q.x, y: p.y })
      } else if (next && Math.abs(next.x - q.x) < 0.5 && Math.abs(next.y - q.y) > 0.5) {
        out.push({ x: p.x, y: q.y })
      } else if (next && Math.abs(next.y - q.y) < 0.5 && Math.abs(next.x - q.x) > 0.5) {
        out.push({ x: q.x, y: p.y })
      } else {
        out.push(i % 2 === 1 ? { x: q.x, y: p.y } : { x: p.x, y: q.y })
      }
    }
    out.push(q)
  }
  return out
}

/**
 * Calcula o caminho SVG de um cabo conforme o seu roteamento e devolve:
 * - `d`: atributo SVG `d`
 * - `handle`: pega central de dobra/curva (quando não há waypoints manuais)
 * - `pts`: polilinha de controlo (orienta terminais e pegas de segmento)
 * - `curvePts`: polilinha amostrada sobre a curva real (marcadores, espirais, isolamento e clique preciso)
 */
export function wireGeometry(a: Pt, b: Pt, route: string, bend: number, curveOffset: number, waypoints?: Pt[]) {
  const noHandle = null as (Pt & { mode: 'bend' | 'curve' }) | null
  if (waypoints && waypoints.length > 0) {
    const raw = [a, ...waypoints, b]
    if (route === 'arc') {
      const spline = smoothSplinePath(raw)
      return { d: spline.d, handle: noHandle, pts: spline.sampled, curvePts: spline.sampled }
    }
    if (route === 'direct') {
      const clean = cleanCollinear(raw)
      return { d: roundedPath(clean, 10), handle: noHandle, pts: clean, curvePts: sampleRoundedPolyline(clean, 10) }
    }
    const pts = orthoPts(raw)
    return { d: roundedPath(pts), handle: noHandle, pts, curvePts: sampleRoundedPolyline(pts) }
  }
  if (route === 'direct') {
    return { d: `M ${a.x},${a.y} L ${b.x},${b.y}`, handle: noHandle, pts: [a, b], curvePts: [a, b] }
  }
  if (route === 'arc') {
    const mx = a.x + (b.x - a.x) * bend
    const my = a.y + (b.y - a.y) * bend
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const cx = mx + nx * curveOffset
    const cy = my + ny * curveOffset
    const ctrl = { x: cx, y: cy }
    const curvePts = Math.abs(curveOffset) > 0.5 ? sampleQuadratic(a, ctrl, b) : [a, b]
    return { d: `M ${a.x},${a.y} Q ${cx},${cy} ${b.x},${b.y}`, handle: { x: cx, y: cy, mode: 'curve' as const }, pts: [a, ctrl, b], curvePts }
  }
  const mx = a.x + (b.x - a.x) * bend
  const my = a.y + (b.y - a.y) * bend
  const pts: Pt[] =
    route === 'orthogonal'
      ? [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b]
      : [a, { x: a.x, y: my }, { x: b.x, y: my }, b]
  const handle =
    route === 'orthogonal'
      ? { x: mx, y: (a.y + b.y) / 2, mode: 'bend' as const }
      : { x: (a.x + b.x) / 2, y: my, mode: 'bend' as const }
  return { d: roundedPath(pts), handle, pts, curvePts: sampleRoundedPolyline(pts) }
}

/** A construção do traçado não usa `flexibility`: ambos os tipos são vistos
 * como o mesmo cabo instalado; a designação mantém-se nos dados e na BOM. */
export function wireGeometryForWire(w: Pick<Wire, 'route' | 'bend' | 'curveOffset' | 'waypoints' | 'flexibility'>, a: Pt, b: Pt, points = w.waypoints) {
  return wireGeometry(a, b, w.route, w.bend, w.curveOffset ?? 0, points)
}

/**
 * Pegas arrastáveis nos troços ortogonais intermédios de um cabo com waypoints:
 * permite deslizar corredores horizontais (Y) e verticais (X) sem desalinhar os 90°.
 */
export function wireSegmentHandles(a: Pt, b: Pt, waypoints: Pt[], minSegmentPx = 30): WireSegmentHandle[] {
  if (!waypoints.length) return []
  const pts = cleanCollinear(orthoPts([a, ...waypoints, b]))
  if (pts.length < 4) return []
  const handles: WireSegmentHandle[] = []
  // Apenas segmentos interiores (1 .. pts.length - 3): os extremos estão presos aos bornes A e B.
  for (let i = 1; i <= pts.length - 3; i++) {
    const p = pts[i], q = pts[i + 1]
    const dx = Math.abs(q.x - p.x), dy = Math.abs(q.y - p.y)
    const length = Math.hypot(dx, dy)
    if (length < minSegmentPx) continue
    if (dy <= 1 && dx >= minSegmentPx) {
      handles.push({ segIndex: i, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, axis: 'h', length })
    } else if (dx <= 1 && dy >= minSegmentPx) {
      handles.push({ segIndex: i, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, axis: 'v', length })
    }
  }
  return handles
}

/** Desliza o troço interior `segIndex` para a nova coordenada (`y` se horizontal, `x` se vertical). */
export function slideOrthoSegment(baseChain: Pt[], segIndex: number, axis: 'h' | 'v', coord: number, simplify = false): Pt[] {
  if (baseChain.length < 4 || segIndex < 1 || segIndex > baseChain.length - 3) {
    return baseChain.slice(1, -1)
  }
  const next = baseChain.map((p) => ({ ...p }))
  const value = Math.round(coord)
  if (axis === 'h') {
    next[segIndex].y = value
    next[segIndex + 1].y = value
  } else {
    next[segIndex].x = value
    next[segIndex + 1].x = value
  }
  const interior = next.slice(1, -1)
  return simplify ? simplifyWaypoints2D(next[0], next[next.length - 1], interior) : interior
}

/** Converte uma lista de waypoints livres numa polilinha estritamente ortogonal limpa (90°). */
export function orthogonalizeWaypoints2D(a: Pt, b: Pt, waypoints: Pt[]): Pt[] {
  if (!waypoints.length) return []
  const full = cleanCollinear(orthoPts([a, ...waypoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })), b]))
  return full.slice(1, -1)
}

/** Remove waypoints redundantes, quase sobrepostos ou colineares (preservando a forma do cabo). */
export function simplifyWaypoints2D(a: Pt, b: Pt, waypoints: Pt[], tolerancePx = 3): Pt[] {
  if (!waypoints.length) return []
  const raw: Pt[] = [a]
  for (const p of waypoints) {
    const prev = raw[raw.length - 1]
    if (Math.hypot(p.x - prev.x, p.y - prev.y) >= tolerancePx) raw.push({ x: Math.round(p.x), y: Math.round(p.y) })
  }
  if (raw.length > 1 && Math.hypot(raw[raw.length - 1].x - b.x, raw[raw.length - 1].y - b.y) < tolerancePx) {
    raw.pop()
  }
  raw.push(b)
  if (raw.length <= 2) return []
  const out: Pt[] = [raw[0]]
  for (let i = 1; i < raw.length - 1; i++) {
    const prev = out[out.length - 1], curr = raw[i], next = raw[i + 1]
    const vx = next.x - prev.x, vy = next.y - prev.y
    const len = Math.hypot(vx, vy)
    if (len < 1e-3) continue
    // Distância perpendicular do ponto curr à reta prev→next
    const dist = Math.abs((curr.x - prev.x) * vy - (curr.y - prev.y) * vx) / len
    const dot = (curr.x - prev.x) * (next.x - curr.x) + (curr.y - prev.y) * (next.y - curr.y)
    if (dist <= tolerancePx && dot >= 0) continue
    out.push(curr)
  }
  return out.slice(1)
}

/**
 * Encaixe magnético ao desenhar ou arrastar pontos de curva no Esquema 2D:
 * - `axisLock` (Shift): bloqueia estritamente no eixo horizontal/vertical (ou 45° em traçado direto)
 * - `magnetic`: encaixa em coordenadas X/Y de pontos de referência (ponto anterior, origem, bornes próximos)
 */
export function snapDraftPoint2D(
  prev: Pt,
  raw: Pt,
  references: Pt[] = [],
  opts: { axisLock?: boolean; allow45?: boolean; thresholdPx?: number } = {},
): DraftSnap2D {
  const threshold = opts.thresholdPx ?? 7
  let x = raw.x
  let y = raw.y
  let guideX: number | null = null
  let guideY: number | null = null
  let lockLabel: string | null = null

  if (opts.axisLock) {
    const dx = raw.x - prev.x
    const dy = raw.y - prev.y
    const adx = Math.abs(dx), ady = Math.abs(dy)
    if (opts.allow45 && adx > 4 && ady > 4 && Math.abs(adx - ady) < Math.max(adx, ady) * 0.38) {
      const d = Math.round((adx + ady) / 2)
      x = prev.x + Math.sign(dx) * d
      y = prev.y + Math.sign(dy) * d
      lockLabel = '45°'
    } else if (adx >= ady) {
      y = prev.y
      guideY = prev.y
      lockLabel = '90° H'
    } else {
      x = prev.x
      guideX = prev.x
      lockLabel = '90° V'
    }
    return { point: { x, y }, guideX, guideY, lockLabel }
  }

  const allRefs = [prev, ...references]
  let bestDx = threshold + 0.01
  let bestDy = threshold + 0.01
  for (const ref of allRefs) {
    const dx = Math.abs(raw.x - ref.x)
    if (dx < bestDx) { bestDx = dx; x = ref.x; guideX = ref.x }
    const dy = Math.abs(raw.y - ref.y)
    if (dy < bestDy) { bestDy = dy; y = ref.y; guideY = ref.y }
  }
  if (guideX !== null && guideY !== null) lockLabel = 'Alinhado XY'
  else if (guideX !== null) lockLabel = guideX === prev.x ? '90° V' : 'Guia X'
  else if (guideY !== null) lockLabel = guideY === prev.y ? '90° H' : 'Guia Y'
  return { point: { x, y }, guideX, guideY, lockLabel }
}

/** Comprimento acumulado de uma polilinha. */
export function polylineLength(pts: Pt[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return len
}

/** Ponto a uma fração t ∈ [0,1] ao longo da polilinha. */
export function pointAtFraction(pts: Pt[], t: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 }
  if (pts.length === 1) return pts[0]
  const total = polylineLength(pts)
  if (total < 1e-6) return pts[0]
  let target = Math.max(0, Math.min(1, t)) * total
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (target <= seg || i === pts.length - 1) {
      const u = seg > 1e-6 ? target / seg : 0
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u,
      }
    }
    target -= seg
  }
  return pts[pts.length - 1]
}

/** Direção (unitária) no ponto t ao longo da polilinha. */
export function tangentAtFraction(pts: Pt[], t: number): Pt {
  if (pts.length < 2) return { x: 1, y: 0 }
  const total = polylineLength(pts)
  if (total < 1e-6) return { x: 1, y: 0 }
  let target = Math.max(0, Math.min(1, t)) * total
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x
    const dy = pts[i].y - pts[i - 1].y
    const seg = Math.hypot(dx, dy)
    if (target <= seg || i === pts.length - 1) {
      if (seg < 1e-6) continue
      return { x: dx / seg, y: dy / seg }
    }
    target -= seg
  }
  const last = pts[pts.length - 1], prev = pts[pts.length - 2]
  const dx = last.x - prev.x, dy = last.y - prev.y
  const len = Math.hypot(dx, dy) || 1
  return { x: dx / len, y: dy / len }
}

/**
 * Subcaminho SVG entre duas frações [start, end] ao longo da curva amostrada
 * (acompanha fielmente cotovelos arredondados, splines e arcos).
 */
export function subpathBetween(pts: Pt[], start: number, end: number, samples = 32): string {
  const a = Math.max(0, Math.min(1, Math.min(start, end)))
  const b = Math.max(0, Math.min(1, Math.max(start, end)))
  if (b - a < 1e-4 || pts.length < 2) return ''
  const n = Math.max(2, Math.ceil(samples * (b - a)))
  const parts: string[] = []
  for (let i = 0; i <= n; i++) {
    const p = pointAtFraction(pts, a + (b - a) * (i / n))
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)},${p.y.toFixed(2)}`)
  }
  return parts.join(' ')
}

/** Projeta um ponto arbitrário na polilinha e devolve a fração `t ∈ [0,1]` mais próxima. */
export function fractionAtClosestPoint(pts: Pt[], target: Pt): { t: number; point: Pt; distance: number; segIndex: number } {
  if (pts.length === 0) return { t: 0, point: target, distance: Infinity, segIndex: 0 }
  if (pts.length === 1) return { t: 0, point: pts[0], distance: Math.hypot(target.x - pts[0].x, target.y - pts[0].y), segIndex: 0 }
  const total = polylineLength(pts)
  if (total < 1e-6) return { t: 0, point: pts[0], distance: Math.hypot(target.x - pts[0].x, target.y - pts[0].y), segIndex: 0 }
  let accum = 0
  let bestDist = Infinity
  let bestT = 0
  let bestPt = pts[0]
  let bestSeg = 0
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i]
    const dx = q.x - p.x, dy = q.y - p.y
    const segSq = dx * dx + dy * dy
    const seg = Math.sqrt(segSq)
    const u = segSq > 1e-8 ? Math.max(0, Math.min(1, ((target.x - p.x) * dx + (target.y - p.y) * dy) / segSq)) : 0
    const proj = { x: p.x + dx * u, y: p.y + dy * u }
    const dist = Math.hypot(target.x - proj.x, target.y - proj.y)
    if (dist < bestDist) {
      bestDist = dist
      bestPt = proj
      bestT = (accum + seg * u) / total
      bestSeg = i - 1
    }
    accum += seg
  }
  return { t: Math.max(0, Math.min(1, bestT)), point: bestPt, distance: bestDist, segIndex: bestSeg }
}
