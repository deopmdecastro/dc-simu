import type { Wire } from '../types'

export type Pt = { x: number; y: number }

/** Segmentos retos para a ligação direta (sem cotovelos). */
function sharpPath(pts: Pt[]) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ')
}

/**
 * Raio visual dos cotovelos ortogonais. Limita-se a metade de cada segmento
 * adjacente para nunca ultrapassar um borne ou um ponto de controlo próximo.
 */
const WIRE_CORNER_RADIUS = 12

function roundedPath(pts: Pt[], radius = WIRE_CORNER_RADIUS) {
  // Segmentos de comprimento zero podem aparecer quando os bornes estão alinhados.
  const unique = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.01)
  if (unique.length <= 2) return sharpPath(unique)
  let d = `M ${unique[0].x},${unique[0].y}`
  for (let i = 1; i < unique.length - 1; i++) {
    const prev = unique[i - 1], p = unique[i], next = unique[i + 1]
    const d1 = Math.hypot(p.x - prev.x, p.y - prev.y)
    const d2 = Math.hypot(next.x - p.x, next.y - p.y)
    const cross = (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x)
    // Pontos colineares não são curvas: evita um desvio desnecessário.
    if (Math.abs(cross) < 0.001 * d1 * d2) { d += ` L ${p.x},${p.y}`; continue }
    const r = Math.min(radius, d1 / 2, d2 / 2)
    const enter = { x: p.x - (p.x - prev.x) * r / d1, y: p.y - (p.y - prev.y) * r / d1 }
    const leave = { x: p.x + (next.x - p.x) * r / d2, y: p.y + (next.y - p.y) * r / d2 }
    d += ` L ${enter.x},${enter.y} Q ${p.x},${p.y} ${leave.x},${leave.y}`
  }
  const last = unique[unique.length - 1]
  return d + ` L ${last.x},${last.y}`
}

/** Condutor rígido: entre pontos não alinhados insere um cotovelo a 90°. */
function orthoPts(pts: Pt[]): Pt[] {
  const out: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1]
    const q = pts[i]
    if (Math.abs(p.x - q.x) > 0.5 && Math.abs(p.y - q.y) > 0.5) {
      // alterna horizontal-primeiro / vertical-primeiro para seguir o traçado natural
      out.push(i % 2 === 1 ? { x: q.x, y: p.y } : { x: p.x, y: q.y })
    }
    out.push(q)
  }
  return out
}

/**
 * Calcula o caminho SVG de um cabo conforme seu roteamento e devolve também a
 * posição do "manípulo" arrastável e os pontos de controle (para orientar os
 * terminais das pontas).
 *
 * Os pontos de passagem têm prioridade e recebem cotovelos ortogonais
 * arredondados, independentemente do tipo elétrico do condutor.
 */
export function wireGeometry(a: Pt, b: Pt, route: string, bend: number, curveOffset: number, waypoints?: Pt[]) {
  const noHandle = null as (Pt & { mode: 'bend' | 'curve' }) | null
  if (waypoints && waypoints.length > 0) {
    const raw = [a, ...waypoints, b]
    const pts = orthoPts(raw)
    return { d: roundedPath(pts), handle: noHandle, pts }
  }
  if (route === 'direct') {
    return { d: `M ${a.x},${a.y} L ${b.x},${b.y}`, handle: noHandle, pts: [a, b] }
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
    return { d: `M ${a.x},${a.y} Q ${cx},${cy} ${b.x},${b.y}`, handle: { x: cx, y: cy, mode: 'curve' as const }, pts: [a, { x: cx, y: cy }, b] }
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
  return { d: roundedPath(pts), handle, pts }
}


/** A construção do traçado não usa `flexibility`: ambos os tipos são vistos
 * como o mesmo cabo instalado; a designação mantém-se nos dados e na BOM. */
export function wireGeometryForWire(w: Pick<Wire, 'route' | 'bend' | 'curveOffset' | 'waypoints' | 'flexibility'>, a: Pt, b: Pt, points = w.waypoints) {
  return wireGeometry(a, b, w.route, w.bend, w.curveOffset ?? 0, points)
}

