/**
 * Filaçamento (chicote): cabos com o mesmo `bundleId` e que correm juntos recebem abraçadeiras
 * regulares. Cálculo puro (sem three.js) para o 3D e para os testes. Unidades do painel (0,01 = 1 mm).
 */
import type { ElectricalComponent, Wire } from '../types'

type V3 = [number, number, number]
export type BundleTie = { bundleId: string; position: V3; axis: V3; radius: number; wireIds: string[] }
export type BundlePath = { points: V3[]; radius: number }

/** Distância entre abraçadeiras (60 mm). */
export const TIE_SPACING = 0.6
/** Dois cabos «correm juntos» se os eixos estiverem a menos de 22 mm (centro a centro). */
export const TIE_REACH = 0.22
/** Distância mínima à ponta do cabo, para não apertar a ponteira. */
export const TIE_END_MARGIN = 0.35

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

type Sample = { p: V3; dir: V3; s: number; total: number }

/** Pontos a intervalos regulares ao longo do cabo, com a direção local. */
function sampleAlong(points: V3[], step: number): Sample[] {
  const lengths: number[] = []
  let total = 0
  for (let i = 1; i < points.length; i++) { const l = len(sub(points[i], points[i - 1])); lengths.push(l); total += l }
  const out: Sample[] = []
  if (total < 1e-6) return out
  let acc = 0
  let next = TIE_END_MARGIN
  for (let i = 0; i < lengths.length; i++) {
    while (next <= acc + lengths[i] && next <= total - TIE_END_MARGIN) {
      const k = lengths[i] ? (next - acc) / lengths[i] : 0
      const a = points[i], b = points[i + 1]
      out.push({ p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], dir: norm(sub(b, a)), s: next, total })
      next += step
    }
    acc += lengths[i]
  }
  return out
}

function nearest(points: V3[], q: V3): { p: V3; dir: V3; d: number } | null {
  let best: { p: V3; dir: V3; d: number } | null = null
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const ab = sub(b, a); const l2 = dot(ab, ab)
    if (l2 < 1e-12) continue
    const t = Math.max(0, Math.min(1, dot(sub(q, a), ab) / l2))
    const p: V3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]
    const d = len(sub(q, p))
    if (!best || d < best.d) best = { p, dir: norm(ab), d }
  }
  return best
}

/** Abraçadeiras de todos os chicotes: cada uma envolve os cabos do chicote que passam ali juntos. */
export function bundleLacingTies(wires: Wire[], paths: Map<string, BundlePath>): BundleTie[] {
  const groups = new Map<string, Wire[]>()
  for (const w of wires) if (w.bundleId && paths.has(w.id)) groups.set(w.bundleId, [...(groups.get(w.bundleId) ?? []), w])
  const ties: BundleTie[] = []
  for (const [bundleId, members] of groups) {
    if (members.length < 2) continue
    const placed: V3[] = []
    // Ordem estável: o cabo mais longo conduz as amostras (a abraçadeira fica no seu eixo).
    const ordered = [...members].sort((a, b) => (paths.get(b.id)!.points.length - paths.get(a.id)!.points.length) || a.id.localeCompare(b.id))
    for (const lead of ordered) {
      const leadPath = paths.get(lead.id)!
      for (const sample of sampleAlong(leadPath.points, TIE_SPACING)) {
        const near: Array<{ id: string; p: V3; r: number; dir: V3 }> = [{ id: lead.id, p: sample.p, r: leadPath.radius, dir: sample.dir }]
        for (const other of ordered) {
          if (other.id === lead.id) continue
          const path = paths.get(other.id)!
          const hit = nearest(path.points, sample.p)
          if (hit && hit.d <= TIE_REACH && Math.abs(dot(hit.dir, sample.dir)) > 0.85) near.push({ id: other.id, p: hit.p, r: path.radius, dir: hit.dir })
        }
        if (near.length < 2) continue
        const c: V3 = [0, 0, 0]
        for (const n of near) { c[0] += n.p[0]; c[1] += n.p[1]; c[2] += n.p[2] }
        const centre: V3 = [c[0] / near.length, c[1] / near.length, c[2] / near.length]
        // Uma abraçadeira por local: ignora se já há outra do mesmo chicote a menos de metade do passo.
        if (placed.some((q) => len(sub(q, centre)) < TIE_SPACING * 0.5)) continue
        placed.push(centre)
        let axis: V3 = [0, 0, 0]
        for (const n of near) { const s = dot(n.dir, sample.dir) >= 0 ? 1 : -1; axis = [axis[0] + n.dir[0] * s, axis[1] + n.dir[1] * s, axis[2] + n.dir[2] * s] }
        const radius = Math.max(...near.map((n) => len(sub(n.p, centre)) + n.r)) + 0.004
        ties.push({ bundleId, position: centre, axis: norm(axis), radius, wireIds: near.map((n) => n.id) })
      }
    }
  }
  return ties
}

/**
 * Filaça os cabos que ligam o mesmo par de aparelhos (2 ou mais): cada par é um chicote.
 * Não toca em cabos já filaçados, bloqueados nem nos que o `skip` recusa (por exemplo, sondas).
 */
export function lacePairBundles(components: ElectricalComponent[], wires: Wire[], options: { minWires?: number; prefix?: string; skip?: (wire: Wire) => boolean } = {}): Wire[] {
  const { minWires = 2, prefix = 'bundle', skip } = options
  const owner = new Map<string, string>()
  for (const c of components) for (const t of c.terminals) owner.set(t.id, c.id)
  const keyOf = (w: Wire): string | null => {
    const a = owner.get(w.fromTerminalId), b = owner.get(w.toTerminalId)
    if (!a || !b || a === b) return null
    return [a, b].sort().join('~')
  }
  const groups = new Map<string, Wire[]>()
  for (const w of wires) {
    if (w.bundleId || w.locked || skip?.(w)) continue
    const key = keyOf(w)
    if (key) groups.set(key, [...(groups.get(key) ?? []), w])
  }
  const assign = new Map<string, string>()
  for (const [key, list] of groups) if (list.length >= minWires) for (const w of list) assign.set(w.id, `${prefix}-${key.split('native-').join('')}`)
  return wires.map((w) => (assign.has(w.id) ? { ...w, bundleId: assign.get(w.id) } : w))
}
