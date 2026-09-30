import type { ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM, SCHEMATIC_PX_PER_MM } from './modelPaths'
import { isDinRail, isRailMountable, snapToRail } from './railMount'

/**
 * Escala real partilhada entre o Esquema 2D e a Visualização 3D:
 * 1 mm = 1,5 px no Esquema = 0,01 unidades de cena no 3D.
 *
 * A origem do painel é o centro da área de desenho (2000 × 1400 px); a posição 3D de
 * cada peça é, portanto, uma função direta (e reversível) da sua posição no Esquema.
 */
export const SCHEMATIC_ORIGIN = { x: 1000, y: 700 } as const
export const PANEL_UNITS_PER_PX = PANEL_UNITS_PER_MM / SCHEMATIC_PX_PER_MM

export const schematicToPanelX = (px: number): number => (px - SCHEMATIC_ORIGIN.x) * PANEL_UNITS_PER_PX
export const schematicToPanelY = (py: number): number => (SCHEMATIC_ORIGIN.y - py) * PANEL_UNITS_PER_PX
export const panelToSchematicX = (x: number): number => SCHEMATIC_ORIGIN.x + x / PANEL_UNITS_PER_PX
export const panelToSchematicY = (y: number): number => SCHEMATIC_ORIGIN.y - y / PANEL_UNITS_PER_PX

/** Centro do footprint no Esquema → ponto do painel (plano X/Y). */
export function componentPanelXY(component: Pick<ElectricalComponent, 'schematicX' | 'schematicY' | 'w' | 'h'>): { x: number; y: number } {
  return { x: schematicToPanelX(component.schematicX + component.w / 2), y: schematicToPanelY(component.schematicY + component.h / 2) }
}

/**
 * Ponto largado no 3D (centro do equipamento, unidades de cena) → canto do footprint no Esquema.
 * Equipamentos de calha passam pelo mesmo imã do Esquema: centram na calha, colam-se aos
 * vizinhos e às pontas. Devolve também a calha atingida (se houver).
 */
export function dropOnSchematic(
  component: ElectricalComponent,
  point: { x: number; y: number },
  all: ElectricalComponent[],
): { schematicX: number; schematicY: number; railId?: string } {
  let schematicX = Math.round(panelToSchematicX(point.x) - component.w / 2)
  let schematicY = Math.round(panelToSchematicY(point.y) - component.h / 2)
  const rails = all.filter(isDinRail)
  if (rails.length && isRailMountable(component)) {
    const hit = snapToRail({ ...component, schematicX, schematicY, railId: undefined }, rails, all)
    if (hit) return { schematicX: hit.schematicX, schematicY: hit.schematicY, railId: hit.railId }
  }
  return { schematicX, schematicY }
}
