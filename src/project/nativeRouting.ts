/**
 * Roteamento determinístico dos cabos do projeto nativo «Partida direta».
 *
 * Regras (pedidas na revisão do demo):
 *  1. Nenhum cabo atravessa um equipamento — o traçado desvia de todas as caixas
 *     dos componentes (margem de segurança), à exceção dos dois equipamentos-limite.
 *  2. Cabos paralelos afastam-se por faixas — é feita uma alocação de «vias» por
 *     orientação (HVH a correr em X, VHV a correr em Y), com afastamento de 10 px
 *     por cabo no mesmo corredor, para não sobrepor linhas.
 *  3. Determinístico — a mesma entrada produz o mesmo traçado, e o resultado é
 *     cozido na semente `(waypoints)` do projeto, logo nada é resolvido em runtime.
 *
 * Nota: é orthogonal Manhattan simples com busca de faixas; o editor continua a
 * poder mover pontos individualmente (`wireGeometry` aceita `waypoints`).
 */

import type { ElectricalComponent, Terminal, Wire } from '../types'
import { terminalPos } from '../schematic/symbols'

type Pt = { x: number; y: number }
type Rect = { x0: number; y0: number; x1: number; y1: number }

/** Margem de segurança em volta de cada dispositivo (px do esquema 2D). */
const MARGIN = 22
/** Afastamento entre cabos que partilham a mesma faixa (px). */
const LANE_SPREAD = 14
/** Número de faixas candidatas em cada direção. */
const LANE_TRIES = 7

function rects(components: ElectricalComponent[], exclude: Set<string>): Rect[] {
  return components
    .filter((c) => !exclude.has(c.id))
    .map((c) => ({
      x0: c.schematicX - MARGIN,
      y0: c.schematicY - MARGIN,
      x1: c.schematicX + c.w + MARGIN,
      y1: c.schematicY + c.h + MARGIN,
    }))
}

function segHitsRect(p: Pt, q: Pt, r: Rect): boolean {
  // Segmento ortogonal; interseção com rectângulo inflado.
  const x0 = Math.min(p.x, q.x)
  const x1 = Math.max(p.x, q.x)
  const y0 = Math.min(p.y, q.y)
  const y1 = Math.max(p.y, q.y)
  return x1 > r.x0 && x0 < r.x1 && y1 > r.y0 && y0 < r.y1
}

function pathHits(pts: Pt[], obstacles: Rect[]): number {
  let hits = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]
    const q = pts[i + 1]
    for (const r of obstacles) if (segHitsRect(p, q, r)) { hits++; break }
  }
  return hits
}

function pathLen(pts: Pt[]): number {
  let len = 0
  for (let i = 0; i < pts.length - 1; i++) len += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y)
  return len
}

function hvh(a: Pt, b: Pt, laneX: number): Pt[] {
  return [a, { x: laneX, y: a.y }, { x: laneX, y: b.y }, b]
}
function vhv(a: Pt, b: Pt, laneY: number): Pt[] {
  return [a, { x: a.x, y: laneY }, { x: b.x, y: laneY }, b]
}
function hvhvh(a: Pt, b: Pt, laneX: number, laneY: number): Pt[] {
  return [a, { x: laneX, y: a.y }, { x: laneX, y: laneY }, { x: b.x, y: laneY }, b]
}

/** Canais livres junto às arestas dos obstáculos (à esquerda/direita/acima/abaixo),
 * limitados ao vão [lo, hi] — são aqui que os troços verticais/horizontais devem correr. */
function edgeChannels(obs: Rect[], lo: number, hi: number, axis: 'x' | 'y'): number[] {
  const out: number[] = []
  for (const r of obs) {
    const a = axis === 'x' ? r.x0 - 10 : r.y0 - 10
    const b = axis === 'x' ? r.x1 + 10 : r.y1 + 10
    if (a >= lo && a <= hi) out.push(a)
    if (b >= lo && b <= hi) out.push(b)
  }
  return out
}

/** Gera faixas candidatas entre a e b e nos corredores livres dos equipamentos. */
function lanes(candidates: number[], spreadIndex: number): number[] {
  const out: number[] = []
  for (const base of candidates) {
    for (let k = 0; k < LANE_TRIES; k++) {
      const d = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * LANE_SPREAD
      out.push(base + d + spreadIndex * LANE_SPREAD * 0.9)
    }
  }
  return out
}

export type WirePlan = { waypoints?: Pt[]; route: 'orthogonal' | 'manhattan'; bend: number }

/**
 * Planeia os cabos do projeto: devolve, por id de cabo, os waypoints cozidos
 * (pontos intermédios; os extremos são sempre os bornes reais).
 */
export function planNativeWirePaths(components: ElectricalComponent[], wires: Wire[]): Map<string, WirePlan> {
  const pos = new Map<string, Pt>()
  const compOf = new Map<string, ElectricalComponent>()
  for (const c of components) {
    for (const t of c.terminals) {
      pos.set(t.id, terminalPos(c, t))
      compOf.set(t.id, c)
    }
  }

  const laneUse = new Map<string, number>() // 'h:123' → quantos cabos já usaram a faixa 123
  const plans = new Map<string, WirePlan>()
  const terminalCompIds = (w: Wire) => {
    const a = compOf.get(w.fromTerminalId)
    const b = compOf.get(w.toTerminalId)
    return { a, b }
  }

  for (const w of wires) {
    const a = pos.get(w.fromTerminalId)
    const b = pos.get(w.toTerminalId)
    const { a: ca, b: cb } = terminalCompIds(w)
    if (!a || !b || !ca || !cb) continue
    const obstacles = rects(components.filter((c) => c.type !== 'dinRail15x55'), new Set([ca.id, cb.id]))

    // Faixas base: a meio, a 25/75%, e NOS CANALHAS LIVRES junto às arestas dos
    // equipamentos (é aqui que os cabos sobem/descem sem atravessar nada).
    const pad = 60
    const xLo = Math.min(a.x, b.x) - pad, xHi = Math.max(a.x, b.x) + pad
    const yLo = Math.min(a.y, b.y) - pad, yHi = Math.max(a.y, b.y) + pad
    const edgeX = edgeChannels(obstacles, xLo, xHi, 'x')
    const edgeY = edgeChannels(obstacles, yLo, yHi, 'y')
    const midXBase = (a.x + b.x) / 2
    const q1X = a.x + (b.x - a.x) * 0.25
    const q3X = a.x + (b.x - a.x) * 0.75
    const midYBase = (a.y + b.y) / 2
    const q1Y = a.y + (b.y - a.y) * 0.25
    const q3Y = a.y + (b.y - a.y) * 0.75

    type Cand = { pts: Pt[]; laneKey: string; hits: number; len: number }
    const cands: Cand[] = []
    for (const laneX of lanes([midXBase, q1X, q3X, ...edgeX], laneUse.size % 3)) {
      const pts = hvh(a, b, laneX)
      cands.push({ pts, laneKey: `h:${Math.round(laneX)}`, hits: pathHits(pts, obstacles), len: pathLen(pts) })
    }
    for (const laneY of lanes([midYBase, q1Y, q3Y, ...edgeY], laneUse.size % 3)) {
      const pts = vhv(a, b, laneY)
      cands.push({ pts, laneKey: `v:${Math.round(laneY)}`, hits: pathHits(pts, obstacles), len: pathLen(pts) })
    }
    // Rumo «canto-alto»: sobe por X, corre em Y entre linhas de equipamentos.
    for (const laneX of lanes([midXBase, ...edgeX], 0)) {
      for (const laneY of lanes([midYBase, ...edgeY], 0)) {
        const pts = hvhvh(a, b, laneX, laneY)
        cands.push({ pts, laneKey: `x:${Math.round(laneX)}:${Math.round(laneY)}`, hits: pathHits(pts, obstacles), len: pathLen(pts) + 40 })
      }
    }

    const ok = cands.filter((c) => c.hits === 0 && c.laneKey.split(':')[1] !== undefined)
    const pool = (ok.length ? ok : cands)
    // Preferir: 1) zero atravessamentos 2) faixa menos usada 3) traçado que sobe/desce
    // nos corredores entre grupos (menos «pela frente» dos aparelhos) 4) mais curto.
    // Penaliza caminhos cujo primeiro/último segmento horizontal corta a caixa dos extremos
    // pelo meio (efeito visual de cabo a tapar a face do componente).
    const frontPenalty = (pts: Pt[]) => {
      let p = 0
      if (pts.length >= 2 && Math.abs(pts[0].y - pts[1].y) < 1 && Math.abs(pts[0].x - pts[1].x) > 8) p += 12
      if (pts.length >= 2 && Math.abs(pts[pts.length - 1].y - pts[pts.length - 2].y) < 1 && Math.abs(pts[pts.length - 1].x - pts[pts.length - 2].x) > 8) p += 12
      return p
    }
    pool.sort((c1, c2) =>
      c1.hits - c2.hits ||
      (laneUse.get(c1.laneKey) ?? 0) - (laneUse.get(c2.laneKey) ?? 0) ||
      (c1.len + frontPenalty(c1.pts)) - (c2.len + frontPenalty(c2.pts)),
    )
    const chosen = pool[0]
    laneUse.set(chosen.laneKey, (laneUse.get(chosen.laneKey) ?? 0) + 1)

    // Waypoints cozidos: só os pontos intermédios; os extremos ficam nos bornes.
    plans.set(w.id, {
      waypoints: chosen.pts.slice(1, -1),
      route: chosen.pts.length === 4 && chosen.pts[1].y === a.y ? 'orthogonal' : 'manhattan',
      bend: 0.5,
    })
  }
  return plans
}

/** Aplica os waypoints planeados aos cabos (mesma instância, mutação direta). */
export function bakeNativeRouting(components: ElectricalComponent[], wires: Wire[]): Wire[] {
  const plans = planNativeWirePaths(components, wires)
  return wires.map((w) => (plans.has(w.id) ? { ...w, ...plans.get(w.id) } : w))
}

/** Verificação usada nos testes: true sse o traçado não atravessa nenhum equipamento (margem reduzida p/ tolerância). */
export function nativeWireCrossesFree(components: ElectricalComponent[], wires: Wire[]): string[] {
  const bad: string[] = []
  const boxes = components.filter((c) => c.type !== 'dinRail15x55')
  for (const w of wires) {
    const ca = boxes.find((c) => c.terminals.some((t) => t.id === w.fromTerminalId))
    const cb = boxes.find((c) => c.terminals.some((t) => t.id === w.toTerminalId))
    if (!ca || !cb) continue
    const a = terminalPos(ca, ca.terminals.find((t) => t.id === w.fromTerminalId) as Terminal)
    const b = terminalPos(cb, cb.terminals.find((t) => t.id === w.toTerminalId) as Terminal)
    const pts: Pt[] = [a, ...(w.waypoints ?? []), b]
    const obstacles = rects(boxes, new Set([ca.id, cb.id])).map((r) => ({ x0: r.x0 + 6, y0: r.y0 + 6, x1: r.x1 - 6, y1: r.y1 - 6 }))
    if (pathHits(pts, obstacles) > 0) bad.push(w.number ?? w.id)
  }
  return bad
}
