import type { ElectricalComponent, SpatialPoint3D, Wire } from '../types'
import { PANEL_UNITS_PER_MM, SCHEMATIC_PX_PER_MM } from './modelPaths'
import { isPanelBound } from './panelBounds'

export interface PanelGroupOrigin { component: ElectricalComponent; pivot: SpatialPoint3D }

/** Volume (unidades de cena) que um quadro leva consigo ao ser arrastado. */
export interface CarryBox { min: SpatialPoint3D; max: SpatialPoint3D }

const inBox = (p: SpatialPoint3D, b: CarryBox) =>
  p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z

/** Volume interior de um quadro (`panelEnclosure`) à volta do seu pivô, com folga de 20 mm. */
export function enclosureCarryBox(pivot: SpatialPoint3D, dims: { widthMm: number; heightMm: number; depthMm: number }, yawDeg = 0): CarryBox {
  const pad = 20 * PANEL_UNITS_PER_MM
  // Quadro rodado 90°/270° em Y (ex.: QE1 encostado às pernas da mesa): largura e profundidade trocam.
  const sideways = Math.abs(Math.round(yawDeg / 90)) % 2 === 1
  const w = sideways ? dims.depthMm : dims.widthMm, d = sideways ? dims.widthMm : dims.depthMm
  const hx = w * PANEL_UNITS_PER_MM / 2 + pad
  const hy = dims.heightMm * PANEL_UNITS_PER_MM / 2 + pad
  const hz = d * PANEL_UNITS_PER_MM / 2 + pad
  return { min: { x: pivot.x - hx, y: pivot.y - hy, z: pivot.z - hz }, max: { x: pivot.x + hx, y: pivot.y + hy, z: pivot.z + hz } }
}

/**
 * Peças com pivô espacial livre (ex.: aparelhos, calhas e bornes do QE1 da maquete) cujo centro está
 * dentro do volume do quadro: acompanham o quadro no arrasto, como se estivessem aparafusadas à chapa.
 */
export function enclosureFreeContents(
  enclosureId: string,
  box: CarryBox,
  components: ElectricalComponent[],
  pivots: Record<string, SpatialPoint3D | undefined>,
): string[] {
  return components.filter((c) => {
    if (c.id === enclosureId || c.locked || isPanelBound(c)) return false
    const p = c.panel3DPosition ?? pivots[c.id]
    return !!p && inBox(p, box)
  }).map((c) => c.id)
}

/** Translação rígida a partir da fotografia inicial do arrasto, sem encaixes individuais. */
export function translatePanelGroup(
  current: ElectricalComponent[],
  initialWires: Wire[],
  origins: PanelGroupOrigin[],
  delta: SpatialPoint3D,
  /** Volumes de quadros arrastados: pontos de passagem 3D de cabos que lá estão acompanham o quadro. */
  carryBoxes: CarryBox[] = [],
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
    if (!from || !to || (!w.fromTerminalId && !w.toTerminalId)) {
      // Cabo que sai do quadro (ex.: QE1 → campo/QGD): só os troços dentro do quadro acompanham,
      // para o cabo não ficar «fora» da calha do quadro depois de o arrastar.
      if (!carryBoxes.length) return w
      const carried = (p: SpatialPoint3D) => carryBoxes.some((b) => inBox(p, b))
      const shift3 = <T extends SpatialPoint3D>(p: T): T => (carried(p) ? p3(p) : p)
      const anyInside = (w.waypoints3D ?? []).some(carried)
        || (!!w.fromPoint3D && carried(w.fromPoint3D)) || (!!w.toPoint3D && carried(w.toPoint3D))
      if (!anyInside) return w
      return {
        ...w,
        ...(w.waypoints3D ? { waypoints3D: w.waypoints3D.map(shift3) } : {}),
        ...(w.fromPoint3D ? { fromPoint3D: shift3(w.fromPoint3D) } : {}),
        ...(w.toPoint3D ? { toPoint3D: shift3(w.toPoint3D) } : {}),
      }
    }
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
