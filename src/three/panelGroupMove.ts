import type { ElectricalComponent, SpatialPoint3D, Wire } from '../types'
import { PANEL_UNITS_PER_MM, SCHEMATIC_PX_PER_MM } from './modelPaths'
import { isPanelBound } from './panelBounds'

export interface PanelGroupOrigin { component: ElectricalComponent; pivot: SpatialPoint3D }

/** Translação rígida a partir da fotografia inicial do arrasto, sem encaixes individuais. */
export function translatePanelGroup(
  current: ElectricalComponent[],
  initialWires: Wire[],
  origins: PanelGroupOrigin[],
  delta: SpatialPoint3D,
): { components: ElectricalComponent[]; wires: Wire[] } {
  const byId = new Map(origins.map((o) => [o.component.id, o]))
  const dx = delta.x * SCHEMATIC_PX_PER_MM / PANEL_UNITS_PER_MM
  const dy = -delta.y * SCHEMATIC_PX_PER_MM / PANEL_UNITS_PER_MM
  const components = current.map((c) => {
    const o = byId.get(c.id)
    if (!o) return c
    const movesWithRail = !!c.railId && byId.has(c.railId)
    return {
      ...c,
      schematicX: o.component.schematicX + dx,
      schematicY: o.component.schematicY + dy,
      ...(!isPanelBound(c) ? { panel3DPosition: { x: o.pivot.x + delta.x, y: o.pivot.y + delta.y, z: o.pivot.z + delta.z } } : {}),
      ...(c.railId && !movesWithRail ? { railId: undefined, railOffsetMm: undefined } : {}),
    }
  })
  const owner = new Map(current.flatMap((c) => c.terminals.map((t) => [t.id, c.id] as const)))
  const p2 = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: p.x + dx, y: p.y + dy })
  const p3 = <T extends SpatialPoint3D>(p: T): T => ({ ...p, x: p.x + delta.x, y: p.y + delta.y, z: p.z + delta.z })
  const wires = initialWires.map((w) => {
    const from = w.fromTerminalId ? byId.has(owner.get(w.fromTerminalId) ?? '') : !!(w.fromPoint || w.fromPoint3D)
    const to = w.toTerminalId ? byId.has(owner.get(w.toTerminalId) ?? '') : !!(w.toPoint || w.toPoint3D)
    if (!from || !to || (!w.fromTerminalId && !w.toTerminalId)) return w
    return {
      ...w,
      ...(w.waypoints ? { waypoints: w.waypoints.map(p2) } : {}),
      ...(w.waypoints3D ? { waypoints3D: w.waypoints3D.map(p3) } : {}),
      ...(w.fromPoint ? { fromPoint: p2(w.fromPoint) } : {}),
      ...(w.toPoint ? { toPoint: p2(w.toPoint) } : {}),
      ...(w.fromPoint3D ? { fromPoint3D: p3(w.fromPoint3D) } : {}),
      ...(w.toPoint3D ? { toPoint3D: p3(w.toPoint3D) } : {}),
    }
  })
  return { components, wires }
}
