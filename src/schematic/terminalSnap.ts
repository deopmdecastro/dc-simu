import type { ElectricalComponent, Wire } from '../types'
import { terminalPos } from './symbols'

type Point = { x: number; y: number }

/** Encaixa na posição REAL do borne, sem arredondá-la à malha. */
export function nearestTerminal(components: ElectricalComponent[], point: Point, radius: number, excludeId?: string) {
  let best: { id: string; point: Point; distance: number } | null = null
  for (const c of components) for (const t of c.terminals) {
    if (t.id === excludeId) continue
    const p = terminalPos(c, t)
    const distance = Math.hypot(p.x - point.x, p.y - point.y)
    if (distance <= radius && (!best || distance < best.distance)) best = { id: t.id, point: p, distance }
  }
  return best
}

/** Recupera cabos antigos com ponta livre largada junto a um conector. */
export function connectNearWireEnds(components: ElectricalComponent[], wires: Wire[], radius = 12): Wire[] {
  return wires.map((wire) => {
    let next = wire
    if (wire.fromPoint) {
      const target = nearestTerminal(components, wire.fromPoint, radius, wire.toTerminalId)
      if (target) next = { ...next, fromTerminalId: target.id, fromPoint: undefined }
    }
    if (wire.toPoint) {
      const target = nearestTerminal(components, wire.toPoint, radius, next.fromTerminalId)
      if (target) next = { ...next, toTerminalId: target.id, toPoint: undefined }
    }
    return next
  })
}
