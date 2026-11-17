/**
 * Filaçamento (chicote): cabos com o mesmo `bundleId` e que correm paralelos e encostados
 * recebem abraçadeiras ajustadas à secção real do feixe (perfil estádio/cápsula, sem aros soltos).
 * Cálculo puro (sem three.js) para o Painel 3D, Esquema 2D e testes. Unidades 3D: 0,01 = 1 mm.
 */
import type { ElectricalComponent, Wire } from '../types'

type V3 = [number, number, number]
type V2 = { x: number; y: number }

export type BundleTie = {
  bundleId: string
  position: V3
  /** Tangente unitária ao longo do feixe. */
  axis: V3
  /** Eixo maior unitário da secção transversal (perpendicular a `axis`). */
  right: V3
  /** Eixo menor unitário da secção transversal (`axis × right`). */
  up: V3
  /** Meia-largura exata do feixe ao longo de `right` (inclui raios dos cabos). */
  halfWidth: number
  /** Meia-altura exata do feixe ao longo de `up` (inclui raios dos cabos). */
  halfHeight: number
  /** Raio envolvente (`max(halfWidth, halfHeight)`), mantido para compatibilidade. */
  radius: number
  wireIds: string[]
  /** Verdadeiro se todos os cabos abraçados forem escuros (ajusta contraste visual). */
  darkBundle?: boolean
}

export type BundlePath = { points: V3[]; radius: number }

export type BundleTie2D = {
  bundleId: string
  x: number
  y: number
  /** Ângulo em graus da tangente do feixe. */
  angleDeg: number
  /** Meia-largura transversal ao feixe (px do esquema). */
  halfSpan: number
  wireIds: string[]
}

export type BundlePath2D = { points: V2[]; halfWidth: number }

/** Passo regular entre abraçadeiras no 3D (56 mm). */
export const TIE_SPACING = 0.56
/** Alcance máximo para procurar condutores vizinhos no mesmo chicote (22 mm). */
export const TIE_REACH = 0.22
/** Folga máxima superfície-a-superfície entre condutores adjacentes na mesma abraçadeira (12 mm). */
export const TIE_MAX_GAP = 0.12
/** Margem mínima à ponta do cabo (26 mm), fora de ponteiras/terminais. */
export const TIE_END_MARGIN = 0.26
/** Largura máxima de uma abraçadeira (diâmetro envolvente < 68 mm → raio < 0.34). */
const MAX_TIE_HALF_WIDTH = 0.32

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const norm = (a: V3): V3 => {
  const l = len(a)
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1]
}

type PolyMeasure = { points: V3[]; segLen: number[]; cum: number[]; total: number }

function measure(points: V3[]): PolyMeasure {
  const segLen: number[] = []
  const cum: number[] = [0]
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const l = len(sub(points[i], points[i - 1]))
    segLen.push(l)
    total += l
    cum.push(total)
  }
  return { points, segLen, cum, total }
}

function pointDirAt(m: PolyMeasure, sRaw: number): { p: V3; dir: V3 } {
  const s = Math.max(0, Math.min(m.total, sRaw))
  let lo = 0
  let hi = m.segLen.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (m.cum[mid + 1] < s) lo = mid + 1
    else hi = mid
  }
  while (lo > 0 && m.segLen[lo] < 1e-9) lo--
  const l = m.segLen[lo] || 1
  const t = Math.max(0, Math.min(1, (s - m.cum[lo]) / l))
  const a = m.points[lo], b = m.points[lo + 1] ?? a
  return {
    p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    dir: norm(sub(b, a)),
  }
}

/** Verdadeiro se o troço em torno de `s` for reto (evita abraçadeiras em cima de curvas). */
function isStraightAt(m: PolyMeasure, s: number, window = 0.085): boolean {
  if (s < window * 0.6 || s > m.total - window * 0.6) return false
  const before = pointDirAt(m, Math.max(0, s - window)).dir
  const here = pointDirAt(m, s).dir
  const after = pointDirAt(m, Math.min(m.total, s + window)).dir
  return dot(before, here) >= 0.94 && dot(here, after) >= 0.94 && dot(before, after) >= 0.9
}

type Sample = { p: V3; dir: V3; s: number }

/** Amostra troços retos do condutor para colocar abraçadeiras bem centradas e regulares. */
function sampleAlong(m: PolyMeasure, step: number): Sample[] {
  const out: Sample[] = []
  const margin = Math.min(TIE_END_MARGIN, m.total * 0.24)
  if (m.total < Math.max(0.24, margin * 2 + 0.05)) return out
  // Identifica troços retos contínuos [a, b] para centrar abraçadeiras em cada segmento reto.
  const probeStep = 0.04
  const runs: Array<[number, number]> = []
  let runStart: number | null = null
  for (let s = margin; s <= m.total - margin + 1e-6; s += probeStep) {
    const clamped = Math.min(s, m.total - margin)
    const ok = isStraightAt(m, clamped)
    if (ok && runStart === null) runStart = clamped
    else if (!ok && runStart !== null) {
      if (clamped - probeStep - runStart >= 0.08) runs.push([runStart, clamped - probeStep])
      runStart = null
    }
  }
  if (runStart !== null && m.total - margin - runStart >= 0.04) runs.push([runStart, m.total - margin])

  for (const [a, b] of runs) {
    const span = b - a
    if (span < 0.06) continue
    const count = Math.max(1, Math.floor(span / step) + 1)
    if (count === 1) {
      const mid = (a + b) * 0.5
      const at = pointDirAt(m, mid)
      out.push({ p: at.p, dir: at.dir, s: mid })
    } else {
      const usable = Math.min(span, (count - 1) * step)
      const start = (a + b - usable) * 0.5
      const ds = count > 1 ? usable / (count - 1) : 0
      for (let i = 0; i < count; i++) {
        const s = start + i * ds
        const at = pointDirAt(m, s)
        out.push({ p: at.p, dir: at.dir, s })
      }
    }
  }
  return out
}

/** Interseção/ponto mais próximo do cabo com o plano normal a `planeDir` que passa em `planePt`. */
function sliceNearPlane(m: PolyMeasure, planePt: V3, planeDir: V3, maxReach: number): { p: V3; dir: V3; d: number; s: number } | null {
  let best: { p: V3; dir: V3; d: number; s: number } | null = null
  const pts = m.points
  for (let i = 1; i < pts.length; i++) {
    const l = m.segLen[i - 1]
    if (l < 1e-9) continue
    const a = pts[i - 1], b = pts[i]
    const da = dot(sub(a, planePt), planeDir)
    const db = dot(sub(b, planePt), planeDir)
    let t: number
    if ((da <= 0 && db >= 0) || (da >= 0 && db <= 0)) {
      const denom = da - db
      t = Math.abs(denom) > 1e-9 ? da / denom : 0.5
    } else {
      // Só aceita segmento muito próximo do plano transversal.
      if (Math.min(Math.abs(da), Math.abs(db)) > 0.035) continue
      t = Math.abs(da) < Math.abs(db) ? 0 : 1
    }
    const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    const off = sub(p, planePt)
    const axial = dot(off, planeDir)
    if (Math.abs(axial) > 0.035) continue
    const perp = len(sub(off, scale(planeDir, axial)))
    if (perp > maxReach) continue
    const s = m.cum[i - 1] + l * t
    if (!best || perp < best.d) best = { p, dir: norm(sub(b, a)), d: perp, s }
  }
  return best
}

function orthonormalBasis(axis: V3): [V3, V3] {
  const ref: V3 = Math.abs(axis[2]) < 0.85 ? [0, 0, 1] : [1, 0, 0]
  const u = norm(cross(axis, ref))
  const v = norm(cross(axis, u))
  return [u, v]
}

const DARK_WIRE_COLORS = new Set(['black', 'brown', 'gray'])

/** Abraçadeiras de todos os chicotes: cada uma envolve de forma justa os cabos contíguos do chicote. */
export function bundleLacingTies(wires: Wire[], paths: Map<string, BundlePath>): BundleTie[] {
  const groups = new Map<string, Wire[]>()
  const colorById = new Map<string, string>()
  for (const w of wires) {
    colorById.set(w.id, w.color)
    if (w.bundleId && paths.has(w.id)) {
      const list = groups.get(w.bundleId)
      if (list) list.push(w)
      else groups.set(w.bundleId, [w])
    }
  }
  const measured = new Map<string, PolyMeasure>()
  for (const [id, bp] of paths) measured.set(id, measure(bp.points))

  const ties: BundleTie[] = []
  for (const [bundleId, members] of groups) {
    if (members.length < 2) continue
    const placed: Array<{ pos: V3; axis: V3 }> = []
    const ordered = [...members].sort((a, b) => (measured.get(b.id)!.total - measured.get(a.id)!.total) || a.id.localeCompare(b.id))
    for (const lead of ordered) {
      const leadPath = paths.get(lead.id)!
      const leadM = measured.get(lead.id)!
      for (const sample of sampleAlong(leadM, TIE_SPACING)) {
        const candidates: Array<{ id: string; p: V3; r: number; dir: V3 }> = [
          { id: lead.id, p: sample.p, r: leadPath.radius, dir: sample.dir },
        ]
        for (const other of ordered) {
          if (other.id === lead.id) continue
          const path = paths.get(other.id)!
          const om = measured.get(other.id)!
          const hit = sliceNearPlane(om, sample.p, sample.dir, TIE_REACH * 1.45)
          if (!hit) continue
          const endM = Math.min(TIE_END_MARGIN * 0.75, om.total * 0.16)
          if (hit.s < endM || hit.s > om.total - endM) continue
          if (Math.abs(dot(hit.dir, sample.dir)) < 0.92) continue
          if (!isStraightAt(om, hit.s, 0.055)) continue
          candidates.push({ id: other.id, p: hit.p, r: path.radius, dir: hit.dir })
        }
        if (candidates.length < 2) continue

        // Agrupa apenas os condutores genuinamente encostados ao condutor-guia (sem abraçar ar vazio).
        const cluster = [candidates[0]]
        const used = new Set<number>([0])
        let grew = true
        while (grew) {
          grew = false
          for (let i = 1; i < candidates.length; i++) {
            if (used.has(i)) continue
            const cand = candidates[i]
            const closeEnough = cluster.some((member) => {
              const off = sub(cand.p, member.p)
              const perp = len(sub(off, scale(sample.dir, dot(off, sample.dir))))
              return perp - cand.r - member.r <= TIE_MAX_GAP
            })
            if (closeEnough) {
              cluster.push(cand)
              used.add(i)
              grew = true
            }
          }
        }
        if (cluster.length < 2) continue

        // Direção média do feixe e base transversal alinhada com o espalhamento principal (PCA 2D).
        let axisSum: V3 = [0, 0, 0]
        let mean: V3 = [0, 0, 0]
        for (const n of cluster) {
          const s = dot(n.dir, sample.dir) >= 0 ? 1 : -1
          axisSum = add(axisSum, scale(n.dir, s))
          mean = add(mean, n.p)
        }
        const axis = norm(axisSum)
        mean = scale(mean, 1 / cluster.length)
        const [bU, bV] = orthonormalBasis(axis)

        let cxx = 0, cxy = 0, cyy = 0
        const coords = cluster.map((n) => {
          const d = sub(n.p, mean)
          const x = dot(d, bU), y = dot(d, bV)
          cxx += x * x; cxy += x * y; cyy += y * y
          return { x, y, r: n.r }
        })
        const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy)
        const ct = Math.cos(theta), st = Math.sin(theta)
        let right: V3 = norm(add(scale(bU, ct), scale(bV, st)))
        let up: V3 = norm(cross(axis, right))
        // Estabiliza o sentido de `up` para a frente (+Z) para o fecho da abraçadeira ficar coerente.
        if (up[2] < -0.05) {
          right = scale(right, -1)
          up = scale(up, -1)
        }

        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
        for (let i = 0; i < coords.length; i++) {
          const d = sub(cluster[i].p, mean)
          const u = dot(d, right), v = dot(d, up), r = cluster[i].r
          if (u - r < minU) minU = u - r
          if (u + r > maxU) maxU = u + r
          if (v - r < minV) minV = v - r
          if (v + r > maxV) maxV = v + r
        }
        let halfWidth = (maxU - minU) * 0.5 + 0.0025
        let halfHeight = (maxV - minV) * 0.5 + 0.0025
        let midU = (minU + maxU) * 0.5
        let midV = (minV + maxV) * 0.5
        if (halfHeight > halfWidth) {
          const prevRight = right
          right = up
          up = scale(prevRight, -1)
          ;[halfWidth, halfHeight] = [halfHeight, halfWidth]
          ;[midU, midV] = [midV, -midU]
        }
        if (halfWidth > MAX_TIE_HALF_WIDTH) continue

        const centre: V3 = add(mean, add(scale(right, midU), scale(up, midV)))
        const minSpacing = TIE_SPACING * 0.58
        if (placed.some((prev) => {
          const d = sub(centre, prev.pos)
          const dist = len(d)
          if (dist >= minSpacing) return false
          // Permite duas abraçadeiras em sub-feixes paralelos bem separados transversalmente.
          const axial = Math.abs(dot(d, axis))
          const perp = Math.sqrt(Math.max(0, dist * dist - axial * axial))
          return perp < Math.max(0.14, halfWidth * 2.2)
        })) continue

        placed.push({ pos: centre, axis })
        const radius = Math.max(halfWidth, halfHeight)
        const wireIds = cluster.map((n) => n.id)
        const darkBundle = wireIds.every((id) => DARK_WIRE_COLORS.has(colorById.get(id) ?? ''))
        ties.push({ bundleId, position: centre, axis, right, up, halfWidth, halfHeight, radius, wireIds, darkBundle })
      }
    }
  }
  return ties
}

/**
 * Abraçadeiras 2D (Esquema Elétrico): envolve troços paralelos e próximos do mesmo `bundleId`.
 * Coordenadas em px do canvas SVG.
 */
export function bundleLacingTies2D(wires: Wire[], paths: Map<string, BundlePath2D>): BundleTie2D[] {
  const STEP_PX = 145
  const END_PX = 38
  const MAX_GAP_PX = 28
  const MAX_HALF_SPAN_PX = 46

  const groups = new Map<string, Wire[]>()
  for (const w of wires) {
    if (!w.bundleId) continue
    const bp = paths.get(w.id)
    if (!bp || bp.points.length < 2) continue
    const list = groups.get(w.bundleId)
    if (list) list.push(w)
    else groups.set(w.bundleId, [w])
  }
  if (!groups.size) return []

  type Seg2 = { ax: number; ay: number; bx: number; by: number; dx: number; dy: number; len: number; s0: number }
  const segsOf = new Map<string, { segs: Seg2[]; total: number; hw: number }>()
  for (const [id, bp] of paths) {
    const segs: Seg2[] = []
    let total = 0
    for (let i = 1; i < bp.points.length; i++) {
      const a = bp.points[i - 1], b = bp.points[i]
      const l = Math.hypot(b.x - a.x, b.y - a.y)
      if (l < 0.5) continue
      segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, dx: (b.x - a.x) / l, dy: (b.y - a.y) / l, len: l, s0: total })
      total += l
    }
    segsOf.set(id, { segs, total, hw: bp.halfWidth })
  }

  const ties: BundleTie2D[] = []
  for (const [bundleId, members] of groups) {
    if (members.length < 2) continue
    const placed: Array<{ x: number; y: number }> = []
    const ordered = [...members].sort((a, b) => (segsOf.get(b.id)!.total - segsOf.get(a.id)!.total) || a.id.localeCompare(b.id))
    for (const lead of ordered) {
      const lm = segsOf.get(lead.id)!
      for (const seg of lm.segs) {
        const sStart = Math.max(seg.s0 + 18, END_PX)
        const sEnd = Math.min(seg.s0 + seg.len - 18, lm.total - END_PX)
        const span = sEnd - sStart
        if (span < 16) continue
        const count = Math.max(1, Math.floor(span / STEP_PX) + 1)
        const usable = count > 1 ? Math.min(span, (count - 1) * STEP_PX) : 0
        const first = (sStart + sEnd - usable) * 0.5
        const ds = count > 1 ? usable / (count - 1) : 0
        const nx = -seg.dy, ny = seg.dx

        for (let k = 0; k < count; k++) {
          const s = first + k * ds
          const u = (s - seg.s0) / seg.len
          const px = seg.ax + (seg.bx - seg.ax) * u
          const py = seg.ay + (seg.by - seg.ay) * u
          const hits: Array<{ id: string; off: number; hw: number }> = [{ id: lead.id, off: 0, hw: lm.hw }]

          for (const other of ordered) {
            if (other.id === lead.id) continue
            const om = segsOf.get(other.id)!
            let best: { off: number; hw: number } | null = null
            for (const oseg of om.segs) {
              if (Math.abs(oseg.dx * seg.dx + oseg.dy * seg.dy) < 0.96) continue
              const proj = (px - oseg.ax) * oseg.dx + (py - oseg.ay) * oseg.dy
              if (proj < 12 || proj > oseg.len - 12) continue
              const os = oseg.s0 + proj
              if (os < END_PX * 0.7 || os > om.total - END_PX * 0.7) continue
              const qx = oseg.ax + oseg.dx * proj
              const qy = oseg.ay + oseg.dy * proj
              const off = (qx - px) * nx + (qy - py) * ny
              if (Math.abs(off) > MAX_HALF_SPAN_PX * 1.6) continue
              if (!best || Math.abs(off) < Math.abs(best.off)) best = { off, hw: om.hw }
            }
            if (best) hits.push({ id: other.id, ...best })
          }
          if (hits.length < 2) continue

          // Mantém apenas o grupo contíguo que contém o condutor-guia.
          hits.sort((a, b) => a.off - b.off)
          const idx0 = hits.findIndex((h) => h.id === lead.id)
          let lo = idx0, hi = idx0
          while (lo > 0 && (hits[lo].off - hits[lo].hw) - (hits[lo - 1].off + hits[lo - 1].hw) <= MAX_GAP_PX) lo--
          while (hi < hits.length - 1 && (hits[hi + 1].off - hits[hi + 1].hw) - (hits[hi].off + hits[hi].hw) <= MAX_GAP_PX) hi++
          const cluster = hits.slice(lo, hi + 1)
          if (cluster.length < 2) continue
          const minOff = cluster[0].off - cluster[0].hw
          const maxOff = cluster[cluster.length - 1].off + cluster[cluster.length - 1].hw
          const halfSpan = (maxOff - minOff) * 0.5 + 2.2
          if (halfSpan > MAX_HALF_SPAN_PX) continue
          const midOff = (minOff + maxOff) * 0.5
          const cx = px + nx * midOff
          const cy = py + ny * midOff
          if (placed.some((q) => Math.hypot(q.x - cx, q.y - cy) < STEP_PX * 0.56)) continue
          placed.push({ x: cx, y: cy })
          ties.push({
            bundleId,
            x: cx,
            y: cy,
            angleDeg: (Math.atan2(seg.dy, seg.dx) * 180) / Math.PI,
            halfSpan,
            wireIds: cluster.map((c) => c.id),
          })
        }
      }
    }
  }
  return ties
}

/**
 * Filaça os cabos que ligam o mesmo par de aparelhos (2 ou mais): cada par é um chicote.
 * Não toca em cabos já filaçados, bloqueados nem nos que o `skip` recusa (por exemplo, sondas).
 */
export function lacePairBundles(
  components: ElectricalComponent[],
  wires: Wire[],
  options: { minWires?: number; prefix?: string; skip?: (wire: Wire) => boolean } = {},
): Wire[] {
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
  for (const [key, list] of groups) {
    if (list.length >= minWires) {
      const id = `${prefix}-${key.split('native-').join('')}`
      for (const w of list) assign.set(w.id, id)
    }
  }
  return wires.map((w) => (assign.has(w.id) ? { ...w, bundleId: assign.get(w.id) } : w))
}

const isDoorComponent = (c: ElectricalComponent | undefined): boolean =>
  !!c?.panelMount && (c.panelMount.face === 'door' || c.panelMount.face === 'doorOuter')

const isMotorComponent = (c: ElectricalComponent | undefined): boolean =>
  c?.type === 'motor3ph' || c?.type === 'motor1ph'

const isPanelOperator = (c: ElectricalComponent | undefined): boolean =>
  !!c && (
    c.type === 'emergencyButton'
    || c.type === 'dualPushButtonNpb22D11'
    || c.type === 'pilotLightAd22'
    || c.type.startsWith('pushButton')
    || c.type.startsWith('selector')
    || c.type.startsWith('pilotLight')
  )

const isProbeWire = (w: Wire): boolean =>
  w.fromEndType === 'probe' || w.toEndType === 'probe' || w.endType === 'probe'

/**
 * Filaçamento completo de quadro elétrico industrial:
 *  1. Chicote da porta (todos os cabos dos aparelhos montados na porta do armário);
 *  2. Chicote do motor (fases U/V/W + estrela-triângulo U2/V2/W2 + PE até ao bucim do motor);
 *  3. Pontes trifásicas e pares diretos entre os mesmos dois aparelhos (`lacePairBundles`);
 *  4. Chicotes de comando/sinalização/alimentação que partilham o mesmo corredor do quadro
 *     (comando de frente/sinalização, 24 V DC e comando AC), sem tocar em pontas de prova nem bloqueados.
 */
export function lacePanelHarnesses(
  components: ElectricalComponent[],
  wires: Wire[],
  options: { prefix?: string; skip?: (wire: Wire) => boolean } = {},
): Wire[] {
  const prefix = options.prefix ?? 'bundle'
  const skip = (w: Wire) => isProbeWire(w) || !!options.skip?.(w)
  const compById = new Map(components.map((c) => [c.id, c]))
  const owner = new Map<string, ElectricalComponent>()
  for (const c of components) for (const t of c.terminals) owner.set(t.id, c)

  const preAssigned = wires.map((w) => {
    if (w.bundleId || w.locked || skip(w)) return w
    const ca = owner.get(w.fromTerminalId), cb = owner.get(w.toTerminalId)
    if (!ca || !cb) return w
    // 1. Chicote do motor (fases + PE; exclui pontas de prova).
    if (isMotorComponent(ca) || isMotorComponent(cb)) {
      const m = isMotorComponent(ca) ? ca : cb
      const clean = m.id.replace(/^(native-|et-)/, '')
      return { ...w, bundleId: `${prefix}-motor-${clean}` }
    }
    // 2. Chicote da porta do quadro (aparelhos em door/doorOuter).
    if (isDoorComponent(ca) || isDoorComponent(cb)) {
      const dc = isDoorComponent(ca) ? ca : cb
      const enc = compById.get(dc.panelMount!.enclosureId)
      const clean = (enc?.id ?? dc.panelMount!.enclosureId).replace(/^(native-|et-)/, '')
      return { ...w, bundleId: `${prefix}-door-${clean}` }
    }
    // 3. Alimentação de entrada (fonte trifásica → disjuntor/quadro: L1, L2, L3 e N juntos).
    if (ca.type === 'powerSource3ph' || cb.type === 'powerSource3ph') {
      const src = ca.type === 'powerSource3ph' ? ca : cb
      const clean = src.id.replace(/^(native-|et-)/, '')
      return { ...w, bundleId: `${prefix}-infeed-${clean}` }
    }
    return w
  })

  // 4. Pontes trifásicas e pares diretos de força entre aparelhos (QG→QM1, QM1→KM1, KM1→KM3, RT1→KM2…).
  const pairPaired = lacePairBundles(components, preAssigned, {
    prefix,
    skip: (w) => skip(w) || (w.kind !== 'power' && w.kind !== 'earth'),
  })

  // 5. Agrupa condutores de comando, sinalização e neutro nos chicotes funcionais dos corredores.
  const bucketOf = (w: Wire): string | null => {
    const ca = owner.get(w.fromTerminalId), cb = owner.get(w.toTerminalId)
    if (!ca || !cb || ca.id === cb.id) return null
    if (w.kind === 'power') return `${prefix}-power-aux`
    if (isPanelOperator(ca) || isPanelOperator(cb)) return `${prefix}-operators`
    if (w.color === 'red' || w.color === 'blue' || w.color === 'violet' || w.color === 'orange' || w.color === 'white') {
      return `${prefix}-cmd-dc`
    }
    return `${prefix}-cmd-ac`
  }

  const counts = new Map<string, number>()
  for (const w of pairPaired) {
    if (w.bundleId || w.locked || skip(w)) continue
    const b = bucketOf(w)
    if (b) counts.set(b, (counts.get(b) ?? 0) + 1)
  }

  return pairPaired.map((w) => {
    if (w.bundleId || w.locked || skip(w)) return w
    const b = bucketOf(w)
    if (b && (counts.get(b) ?? 0) >= 2) return { ...w, bundleId: b }
    return w
  })
}
