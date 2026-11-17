/**
 * Roteamento determinístico 2D dos cabos (usado nas sementes nativas e em «Organizar cabos»).
 *
 * Regras:
 *  1. Nenhum cabo atravessa um equipamento (caixas com margem de segurança, exceto os dois extremos).
 *  2. Cabos do mesmo chicote (`bundleId`) correm encostados em faixas paralelas regulares (passo fino),
 *     formando feixes limpos prontos a receber abraçadeiras (`filaças`).
 *  3. Quando existem calhas técnicas (`cableDuct`) e/ou quadro (`panelEnclosure`), privilegia os eixos
 *     reais das calhas horizontais e verticais e mantém os cabos interiores dentro do armário.
 *  4. Respeita o lado de saída dos bornes (topo sobe, base desce) para evitar cotovelos invertidos.
 */

import type { ElectricalComponent, Terminal, Wire } from '../types'
import { terminalPos } from '../schematic/symbols'
import { isCableDuctType, isEnclosureType, isPanelAccessoryType } from '../three/enclosureParts'
import { isDinRail } from '../three/railMount'

type Pt = { x: number; y: number }
type Rect = { x0: number; y0: number; x1: number; y1: number }

/** Margem de segurança em volta de cada dispositivo (px do esquema 2D). */
const MARGIN = 26
/** Passo entre chicotes distintos no mesmo corredor (px). */
const LANE_SPREAD = 16
/** Passo compacto entre condutores do MESMO chicote (`bundleId`) no mesmo corredor (px). */
const BUNDLE_PITCH = 6.5
/** Número de faixas candidatas em volta de cada corredor base. */
const LANE_TRIES = 9

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
  const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x)
  const y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y)
  return x1 > r.x0 && x0 < r.x1 && y1 > r.y0 && y0 < r.y1
}

function pathHits(pts: Pt[], obstacles: Rect[]): number {
  let hits = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1]
    if (Math.hypot(q.x - p.x, q.y - p.y) < 0.5) continue
    for (const r of obstacles) if (segHitsRect(p, q, r)) { hits++; break }
  }
  return hits
}

function pathHitsUpTo(pts: Pt[], obstacles: Rect[], limit: number): number {
  let hits = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1]
    if (Math.hypot(q.x - p.x, q.y - p.y) < 0.5) continue
    for (const r of obstacles) if (segHitsRect(p, q, r)) { hits++; break }
    if (hits > limit) return hits
  }
  return hits
}

function pathLen(pts: Pt[]): number {
  let len = 0
  for (let i = 0; i < pts.length - 1; i++) len += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y)
  return len
}

const hvh = (a: Pt, b: Pt, laneX: number): Pt[] => [a, { x: laneX, y: a.y }, { x: laneX, y: b.y }, b]
const vhv = (a: Pt, b: Pt, laneY: number): Pt[] => [a, { x: a.x, y: laneY }, { x: b.x, y: laneY }, b]
const hvhvh = (a: Pt, b: Pt, laneX: number, laneY: number): Pt[] => [a, { x: laneX, y: a.y }, { x: laneX, y: laneY }, { x: b.x, y: laneY }, b]
const vhvhv = (a: Pt, b: Pt, laneY1: number, laneX: number, laneY2: number): Pt[] => [
  a, { x: a.x, y: laneY1 }, { x: laneX, y: laneY1 }, { x: laneX, y: laneY2 }, { x: b.x, y: laneY2 }, b,
]

function edgeChannels(obs: Rect[], lo: number, hi: number, axis: 'x' | 'y'): number[] {
  const out: number[] = []
  for (const r of obs) {
    const a = axis === 'x' ? r.x0 - 8 : r.y0 - 8
    const b = axis === 'x' ? r.x1 + 8 : r.y1 + 8
    if (a >= lo && a <= hi) out.push(a)
    if (b >= lo && b <= hi) out.push(b)
  }
  return out
}

function lanes(candidates: number[], spreadIndex: number): number[] {
  const out: number[] = []
  for (const base of candidates) {
    out.push(base + spreadIndex * 5)
    for (let k = 1; k <= LANE_TRIES; k++) {
      const d = (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * LANE_SPREAD
      out.push(base + d + spreadIndex * 4)
    }
  }
  return out
}

/** Eixo de saída preferido do borne no esquema: -1 = cima, +1 = baixo, 0 = lateral/neutro. */
function terminalVertDir(c: ElectricalComponent, p: Pt): -1 | 0 | 1 {
  const relY = (p.y - c.schematicY) / Math.max(1, c.h)
  if (relY <= 0.24) return -1
  if (relY >= 0.76) return 1
  return 0
}

function ductGeometry(c: ElectricalComponent): { axis: 'x' | 'y'; x0: number; y0: number; x1: number; y1: number; center: number } {
  const rot = Math.abs(Math.round((c.rotation ?? 0) / 90)) % 2 === 1
  const cx = c.schematicX + c.w * 0.5, cy = c.schematicY + c.h * 0.5
  const w = rot ? c.h : c.w, h = rot ? c.w : c.h
  const axis: 'x' | 'y' = w >= h ? 'x' : 'y'
  return { axis, x0: cx - w * 0.5, y0: cy - h * 0.5, x1: cx + w * 0.5, y1: cy + h * 0.5, center: axis === 'x' ? cy : cx }
}

function enclosureOf(c: ElectricalComponent, enclosures: ElectricalComponent[]): ElectricalComponent | null {
  if (c.enclosureId) return enclosures.find((e) => e.id === c.enclosureId) ?? null
  if (c.panelMount?.enclosureId) return enclosures.find((e) => e.id === c.panelMount!.enclosureId) ?? null
  const cx = c.schematicX + c.w * 0.5, cy = c.schematicY + c.h * 0.5
  return enclosures.find((e) => cx >= e.schematicX && cx <= e.schematicX + e.w && cy >= e.schematicY && cy <= e.schematicY + e.h) ?? null
}

export type WirePlan = { waypoints?: Pt[]; route: 'orthogonal' | 'manhattan'; bend: number }

export function planNativeWirePaths(components: ElectricalComponent[], wires: Wire[]): Map<string, WirePlan> {
  const pos = new Map<string, Pt>()
  const compOf = new Map<string, ElectricalComponent>()
  for (const c of components) {
    for (const t of c.terminals) {
      pos.set(t.id, terminalPos(c, t))
      compOf.set(t.id, c)
    }
  }

  const enclosures = components.filter((c) => isEnclosureType(c.type))
  const ducts = components.filter((c) => isCableDuctType(c.type)).map(ductGeometry)
  const hDucts = ducts.filter((d) => d.axis === 'x').map((d) => d.center).sort((a, b) => a - b)
  const vDucts = ducts.filter((d) => d.axis === 'y').map((d) => d.center).sort((a, b) => a - b)

  const laneUse = new Map<string, number>()
  /** Para cada chicote (`bundleId`), memoriza o corredor escolhido para agrupar os restantes cabos ao lado. */
  const bundlePreferredH = new Map<string, { baseY: number; count: number }>()
  const bundlePreferredV = new Map<string, { baseX: number; count: number }>()
  const plans = new Map<string, WirePlan>()

  const kindRank = (w: Wire) => (w.kind === 'power' ? 0 : w.kind === 'earth' ? 1 : w.kind === 'neutral' ? 2 : w.kind === 'control' ? 3 : 4)
  // Ordena por chicote primeiro para que os membros do mesmo feixe fiquem lado a lado na mesma faixa.
  const orderedWires = [...wires].sort((w1, w2) => {
    const k = kindRank(w1) - kindRank(w2)
    if (k) return k
    const b1 = w1.bundleId ?? '\uffff', b2 = w2.bundleId ?? '\uffff'
    if (b1 !== b2) return b1.localeCompare(b2)
    const a1 = pos.get(w1.fromTerminalId), p1 = pos.get(w1.toTerminalId)
    const a2 = pos.get(w2.fromTerminalId), p2 = pos.get(w2.toTerminalId)
    if (!a1 || !p1 || !a2 || !p2) return w1.id.localeCompare(w2.id)
    const minX = Math.min(a1.x, p1.x) - Math.min(a2.x, p2.x)
    if (Math.abs(minX) > 2) return minX
    return (a1.y - a2.y) || w1.id.localeCompare(w2.id)
  })

  const deviceComponents = components.filter((c) => !isDinRail(c) && !isPanelAccessoryType(c.type))

  for (const w of orderedWires) {
    const a = pos.get(w.fromTerminalId)
    const b = pos.get(w.toTerminalId)
    const ca = compOf.get(w.fromTerminalId)
    const cb = compOf.get(w.toTerminalId)
    if (!a || !b || !ca || !cb) continue

    const obstacles = rects(deviceComponents, new Set([ca.id, cb.id]))
    const dirA = terminalVertDir(ca, a)
    const dirB = terminalVertDir(cb, b)
    const encA = enclosureOf(ca, enclosures)
    const encB = enclosureOf(cb, enclosures)
    const sharedEnc = encA && encB && encA.id === encB.id ? encA : null

    // Limites do armário quando ambos os aparelhos pertencem ao mesmo quadro.
    const encRect: Rect | null = sharedEnc
      ? { x0: sharedEnc.schematicX + 18, y0: sharedEnc.schematicY + 18, x1: sharedEnc.schematicX + sharedEnc.w - 18, y1: sharedEnc.schematicY + sharedEnc.h - 18 }
      : null

    const pad = 75
    const xLo = encRect ? Math.min(encRect.x0, a.x, b.x) : Math.min(a.x, b.x) - pad
    const xHi = encRect ? Math.max(encRect.x1, a.x, b.x) : Math.max(a.x, b.x) + pad
    const yLo = encRect ? Math.min(encRect.y0, a.y, b.y) : Math.min(a.y, b.y) - pad
    const yHi = encRect ? Math.max(encRect.y1, a.y, b.y) : Math.max(a.y, b.y) + pad

    const edgeX = edgeChannels(obstacles, xLo, xHi, 'x')
    const edgeY = edgeChannels(obstacles, yLo, yHi, 'y')
    const midXBase = (a.x + b.x) * 0.5
    const midYBase = (a.y + b.y) * 0.5
    const selfExitY: number[] = []
    if (dirA === -1) selfExitY.push(ca.schematicY - 30)
    if (dirA === 1) selfExitY.push(ca.schematicY + ca.h + 30)
    if (dirB === -1) selfExitY.push(cb.schematicY - 30)
    if (dirB === 1) selfExitY.push(cb.schematicY + cb.h + 30)

    // Penaliza sair contra o borne (cortar o corpo do próprio aparelho) ou sair do armário.
    const qualityPenalty = (pts: Pt[], bonus = 0) => {
      let p = bonus
      if (pts.length >= 2) {
        const s0 = pts[1]
        if (Math.abs(a.y - s0.y) < 1 && Math.abs(a.x - s0.x) > 8 && dirA !== 0) p += 65
        if (dirA === -1 && s0.y > a.y + 4) p += 140
        if (dirA === 1 && s0.y < a.y - 4) p += 140
        const sN = pts[pts.length - 2]
        if (Math.abs(b.y - sN.y) < 1 && Math.abs(b.x - sN.x) > 8 && dirB !== 0) p += 65
        if (dirB === -1 && sN.y > b.y + 4) p += 140
        if (dirB === 1 && sN.y < b.y - 4) p += 140
      }
      if (encRect) {
        for (let i = 1; i < pts.length - 1; i++) {
          const q = pts[i]
          if (q.x < encRect.x0 || q.x > encRect.x1 || q.y < encRect.y0 || q.y > encRect.y1) p += 900
        }
      }
      return p
    }

    let chosen: { pts: Pt[]; laneKey: string; hits: number; score: number; mainY?: number; mainX?: number } | null = null
    const consider = (pts: Pt[], laneKey: string, extraCost: number, mainY?: number, mainX?: number) => {
      const limit = chosen ? chosen.hits : Infinity
      const hits = pathHitsUpTo(pts, obstacles, limit)
      if (hits > limit) return
      const use = laneUse.get(laneKey) ?? 0
      const score = pathLen(pts) + extraCost + use * 28 + qualityPenalty(pts)
      if (!chosen || hits < chosen.hits || (hits === chosen.hits && score < chosen.score)) {
        chosen = { pts, laneKey, hits, score, mainY, mainX }
      }
    }

    // 1. Calhas técnicas reais (CT1..CT5): caminho preferencial industrial V-H-V (mesma calha) ou V-H-V-H-V (via calha vertical).
    const localHDucts = hDucts.filter((y) => y >= yLo - 40 && y <= yHi + 40)
    const localVDucts = vDucts.filter((x) => x >= xLo - 40 && x <= xHi + 40)
    const bundleOffset = (map: Map<string, { count: number }>, maxSpan = 14) => {
      if (!w.bundleId) return 0
      const idx = map.get(w.bundleId)?.count ?? 0
      const signed = (idx % 2 === 0 ? 1 : -1) * Math.ceil(idx / 2) * (BUNDLE_PITCH * 0.72)
      return Math.max(-maxSpan, Math.min(maxSpan, signed))
    }
    if (localHDucts.length > 0 && sharedEnc) {
      const offH = bundleOffset(bundlePreferredH, 12)
      const offV = bundleOffset(bundlePreferredV, 12)
      for (const dy of localHDucts) {
        const y = dy + offH
        consider(vhv(a, b, y), `ductH:${Math.round(y / 5)}`, -120, dy)
      }
      if (localVDucts.length > 0) {
        // Escolhe as 2 calhas horizontais mais próximas de A e B na direção de saída.
        const nearA = [...localHDucts].sort((u, v) =>
          (Math.abs(u - a.y) + (dirA && Math.sign(u - a.y) !== dirA ? 180 : 0))
          - (Math.abs(v - a.y) + (dirA && Math.sign(v - a.y) !== dirA ? 180 : 0)),
        ).slice(0, 2)
        const nearB = [...localHDucts].sort((u, v) =>
          (Math.abs(u - b.y) + (dirB && Math.sign(u - b.y) !== dirB ? 180 : 0))
          - (Math.abs(v - b.y) + (dirB && Math.sign(v - b.y) !== dirB ? 180 : 0)),
        ).slice(0, 2)
        for (const y1 of nearA) {
          for (const y2 of nearB) {
            if (Math.abs(y1 - y2) < 8) continue
            for (const dx of localVDucts) {
              const ly1 = y1 + offH, ly2 = y2 + offH, lx = dx + offV
              consider(vhvhv(a, b, ly1, lx, ly2), `ductVH:${Math.round(lx / 5)}:${Math.round(ly1 / 5)}`, -95, y1, dx)
            }
          }
        }
      }
    }

    // 2. Faixa preferencial do chicote (`bundleId`): junta os cabos do mesmo grupo lado a lado!
    if (w.bundleId) {
      const prefH = bundlePreferredH.get(w.bundleId)
      if (prefH) {
        const slot = prefH.count
        for (const sign of [1, -1]) {
          const ly = prefH.baseY + sign * slot * BUNDLE_PITCH
          consider(vhv(a, b, ly), `bh:${w.bundleId}:${Math.round(ly)}`, -110, prefH.baseY)
          const prefV = bundlePreferredV.get(w.bundleId)
          if (prefV) {
            const lx = prefV.baseX + sign * slot * BUNDLE_PITCH
            consider(hvhvh(a, b, lx, ly), `bvh:${w.bundleId}:${Math.round(lx)}:${Math.round(ly)}`, -75, prefH.baseY, prefV.baseX)
            for (const ey of selfExitY.slice(0, 2)) {
              consider(vhvhv(a, b, ey + sign * slot * (BUNDLE_PITCH * 0.7), lx, ly), `bvhv:${w.bundleId}:${Math.round(lx)}`, -70, prefH.baseY, prefV.baseX)
            }
          }
        }
      }
      const prefV = bundlePreferredV.get(w.bundleId)
      if (prefV) {
        const slot = prefV.count
        for (const sign of [1, -1]) {
          const lx = prefV.baseX + sign * slot * BUNDLE_PITCH
          consider(hvh(a, b, lx), `bv:${w.bundleId}:${Math.round(lx)}`, -95, undefined, prefV.baseX)
        }
      }
    }

    // 3. Candidatos gerais nos corredores livres entre aparelhos.
    const spreadIdx = laneUse.size % 2
    const ySeeds = [...selfExitY, ...localHDucts, midYBase, ...edgeY]
    const xSeeds = [...localVDucts, midXBase, ...edgeX]
    for (const laneY of lanes(ySeeds, spreadIdx)) consider(vhv(a, b, laneY), `v:${Math.round(laneY / 6)}`, 0, laneY)
    for (const laneX of lanes(xSeeds, spreadIdx)) consider(hvh(a, b, laneX), `h:${Math.round(laneX / 6)}`, 10, undefined, laneX)

    const cornerX = [...new Set(lanes([midXBase, ...localVDucts, ...edgeX.slice(0, 8)], 0))].slice(0, 26)
    const cornerY = [...new Set(lanes([...selfExitY, ...localHDucts, midYBase, ...edgeY.slice(0, 8)], 0))].slice(0, 26)
    for (const laneX of cornerX) {
      for (const laneY of cornerY) {
        consider(hvhvh(a, b, laneX, laneY), `x:${Math.round(laneX / 6)}:${Math.round(laneY / 6)}`, 36, laneY, laneX)
      }
    }
    // Pontes entre lados opostos (base → topo da mesma calha DIN, ex.: QG.2 → QM1.1, QM1.2 → KM1.1L1): V-H-V-H-V limpo!
    const chosenHits = (chosen as { hits: number } | null)?.hits ?? 0
    if ((dirA !== 0 && dirB !== 0 && dirA !== dirB) || chosenHits > 0) {
      const y1List = dirA === 1 ? [ca.schematicY + ca.h + 30, ca.schematicY + ca.h + 44] : [ca.schematicY - 30, ca.schematicY - 44]
      const y2List = dirB === -1 ? [cb.schematicY - 30, cb.schematicY - 44] : [cb.schematicY + cb.h + 30, cb.schematicY + cb.h + 44]
      const gapMidX = (a.x + b.x) * 0.5
      const xBridgeList = [gapMidX, ...cornerX.slice(0, 14)]
      const bIdx = w.bundleId ? (bundlePreferredV.get(w.bundleId)?.count ?? 0) : 0
      for (const y1 of y1List) {
        for (const y2 of y2List) {
          for (const lx of xBridgeList) {
            const bx = lx + bIdx * BUNDLE_PITCH
            const by1 = y1 + bIdx * BUNDLE_PITCH
            const by2 = y2 - bIdx * BUNDLE_PITCH
            consider(vhvhv(a, b, by1, bx, by2), `bridge:${Math.round(bx / 5)}`, 18, y1, lx)
          }
        }
      }
    }

    if (!chosen) continue
    const best = chosen as { pts: Pt[]; laneKey: string; mainY?: number; mainX?: number }
    laneUse.set(best.laneKey, (laneUse.get(best.laneKey) ?? 0) + 1)
    if (w.bundleId) {
      if (best.mainY !== undefined) {
        const cur = bundlePreferredH.get(w.bundleId)
        bundlePreferredH.set(w.bundleId, cur ? { baseY: cur.baseY, count: cur.count + 1 } : { baseY: best.mainY, count: 1 })
      }
      if (best.mainX !== undefined) {
        const cur = bundlePreferredV.get(w.bundleId)
        bundlePreferredV.set(w.bundleId, cur ? { baseY: 0, baseX: cur.baseX, count: cur.count + 1 } as { baseX: number; count: number } : { baseX: best.mainX, count: 1 })
      }
    }

    plans.set(w.id, {
      waypoints: best.pts.slice(1, -1),
      route: best.pts.length === 4 && Math.abs(best.pts[1].y - a.y) < 0.5 ? 'orthogonal' : 'manhattan',
      bend: 0.5,
    })
  }
  return plans
}

/** Aplica os waypoints planeados aos cabos. */
export function bakeNativeRouting(components: ElectricalComponent[], wires: Wire[]): Wire[] {
  const plans = planNativeWirePaths(components, wires)
  return wires.map((w) => (plans.has(w.id) ? { ...w, ...plans.get(w.id) } : w))
}

/** Verificação usada nos testes: devolve os cabos que atravessam algum equipamento. */
export function nativeWireCrossesFree(components: ElectricalComponent[], wires: Wire[]): string[] {
  const bad: string[] = []
  const boxes = components.filter((c) => !isDinRail(c) && !isPanelAccessoryType(c.type))
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
