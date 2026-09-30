import type { ElectricalComponent } from '../types'
import { hasDinRailModel, SCHEMATIC_PX_PER_MM } from './modelPaths'
import { clampRailLengthMm, DIN_RAIL_15X55 } from './dinRailGeometry'

/**
 * Fixação de equipamentos às calhas DIN (componente real `dinRail15x55`).
 *
 * Partilhado pelo Esquema 2D (imã/centragem), pela store (comprimento, arrasto
 * da calha com os equipamentos) e pelo Painel 3D (posição sobre a calha).
 */

/** Tipos que se montam em calha DIN mesmo sem GLB de calha dedicado. */
export const RAIL_MOUNT_TYPE_PREFIXES = [
  'breaker', 'motorBreaker', 'residualBreaker', 'fuse', 'surgeProtector', 'thermalRelay', 'contactor', 'auxRelay',
  'timerRelay', 'timerRelayStarDelta', 'counterRelay', 'safetyRelay', 'plcLogo', 'plcCompact', 'plcSiemensLogo1224RC',
  'vfd', 'softStarter', 'transformer', 'powerSupply', 'powerSupplyProauto24A', 'terminalBlock', 'terminalPE',
  'busbarPhase', 'busbarNeutral', 'earthBar', 'fuseHolder', 'auxContactBlock',
] as const

export const isDinRail = (component: Pick<ElectricalComponent, 'type'>): boolean => component.type === 'dinRail15x55'

export const isRailMountable = (component: Pick<ElectricalComponent, 'type'>): boolean =>
  !isDinRail(component) && (hasDinRailModel(component.type) || RAIL_MOUNT_TYPE_PREFIXES.some((prefix) => component.type.startsWith(prefix)))

/** Comprimento da calha em mm (estado → footprint → padrão), sempre dentro dos limites. */
export const railLengthOf = (rail: ElectricalComponent): number => clampRailLengthMm(rail.state.lengthMm)

/** Footprint do Esquema (px) para um comprimento em mm. */
export const railWidthPx = (lengthMm: number): number => Math.max(4, Math.round(clampRailLengthMm(lengthMm) * SCHEMATIC_PX_PER_MM))

/** Largura em mm ocupada pelo equipamento ao longo da calha (respeita rotação de 90°/270°). */
export function railSpanMm(component: ElectricalComponent): number {
  const quarter = Math.round(((component.rotation ?? 0) % 180) / 90) % 2 === 1
  return (quarter ? component.h : component.w) / SCHEMATIC_PX_PER_MM
}

function extents(component: ElectricalComponent) {
  const quarter = Math.round(((component.rotation ?? 0) % 180) / 90) % 2 === 1
  return { ex: (quarter ? component.h : component.w) / 2, ey: (quarter ? component.w : component.h) / 2 }
}

export interface RailSnapResult {
  schematicX: number
  schematicY: number
  railId: string
  railOffsetMm: number
}

export interface RailSnapOptions {
  /** Distância horizontal (px) além das pontas da calha em que ainda há atração. */
  reachX?: number
  /** Distância vertical (px) entre bordos em que a calha ainda atrai. */
  reachY?: number
  /** Distância (px) de atração aos bordos dos vizinhos e às pontas da calha. */
  magnet?: number
}

/**
 * Centra o equipamento na calha mais próxima (eixo vertical), mantém-no dentro
 * do comprimento e cola-o aos vizinhos/pontas. Devolve `null` se não houver
 * nenhuma calha ao alcance (o equipamento fica solto).
 */
export function snapToRail(
  component: ElectricalComponent,
  rails: ElectricalComponent[],
  all: ElectricalComponent[],
  options: RailSnapOptions = {},
): RailSnapResult | null {
  if (!isRailMountable(component)) return null
  const reachX = options.reachX ?? 48
  const reachY = options.reachY ?? 96
  const magnet = options.magnet ?? 12
  const { ex, ey } = extents(component)
  const cx = component.schematicX + component.w / 2
  const cy = component.schematicY + component.h / 2

  let best: { rail: ElectricalComponent; score: number } | null = null
  for (const rail of rails) {
    const left = rail.schematicX
    const right = rail.schematicX + rail.w
    const railCy = rail.schematicY + rail.h / 2
    // A calha atual tem histerese: só larga se o equipamento se afastar bastante.
    const sticky = component.railId === rail.id ? 1.6 : 1
    if (cx < left - reachX * sticky || cx > right + reachX * sticky) continue
    const gapY = Math.max(0, Math.abs(cy - railCy) - ey - rail.h / 2)
    if (gapY > reachY * sticky) continue
    const score = gapY + Math.abs(cy - railCy) * 0.25 + Math.max(0, left - cx, cx - right) * 0.5
    if (!best || score < best.score) best = { rail, score }
  }
  if (!best) return null

  const rail = best.rail
  const railLeft = rail.schematicX
  const railRight = rail.schematicX + rail.w
  const railCy = rail.schematicY + rail.h / 2
  const span = ex * 2

  // 1) dentro da calha
  let left = cx - ex
  const maxLeft = railRight - span
  left = maxLeft < railLeft ? railLeft : Math.max(railLeft, Math.min(maxLeft, left))

  // 2) imã às pontas e aos vizinhos já fixos nesta calha
  const candidates: number[] = [railLeft, maxLeft]
  for (const other of all) {
    if (other.id === component.id || other.railId !== rail.id) continue
    const o = extents(other)
    const oLeft = other.schematicX + other.w / 2 - o.ex
    candidates.push(oLeft - span, oLeft + o.ex * 2)
  }
  let nearest: number | null = null
  for (const candidate of candidates) {
    if (candidate < railLeft - 0.01 || candidate > Math.max(railLeft, maxLeft) + 0.01) continue
    if (Math.abs(candidate - left) <= magnet && (nearest === null || Math.abs(candidate - left) < Math.abs(nearest - left))) nearest = candidate
  }
  if (nearest !== null) left = nearest

  return {
    schematicX: Math.round(left + ex - component.w / 2),
    schematicY: Math.round(railCy - component.h / 2),
    railId: rail.id,
    railOffsetMm: Math.round(((left - railLeft) / SCHEMATIC_PX_PER_MM) * 10) / 10,
  }
}

/** Nova geometria da calha ao mudar o comprimento, mantendo a ponta `anchor` fixa. */
export function resizeRailGeometry(rail: ElectricalComponent, lengthMm: number, anchor: 'left' | 'right' = 'left') {
  const length = clampRailLengthMm(lengthMm)
  const w = railWidthPx(length)
  const schematicX = anchor === 'left' ? rail.schematicX : rail.schematicX + rail.w - w
  return { length, w, schematicX }
}

/**
 * Depois de mexer no comprimento/posição da calha: recalcula o deslocamento dos
 * equipamentos fixos e empurra para dentro da calha os que ficariam de fora.
 */
export function reflowRailChildren(rail: ElectricalComponent, components: ElectricalComponent[]): Map<string, Pick<ElectricalComponent, 'schematicX' | 'railOffsetMm'>> {
  const patches = new Map<string, Pick<ElectricalComponent, 'schematicX' | 'railOffsetMm'>>()
  const railLeft = rail.schematicX
  const railRight = rail.schematicX + rail.w
  for (const child of components) {
    if (child.railId !== rail.id) continue
    const { ex } = extents(child)
    const span = ex * 2
    const maxLeft = railRight - span
    let left = child.schematicX + child.w / 2 - ex
    left = maxLeft < railLeft ? railLeft : Math.max(railLeft, Math.min(maxLeft, left))
    patches.set(child.id, {
      schematicX: Math.round(left + ex - child.w / 2),
      railOffsetMm: Math.round(((left - railLeft) / SCHEMATIC_PX_PER_MM) * 10) / 10,
    })
  }
  return patches
}

export const RAIL_PROFILE_HEIGHT_PX = Math.round(DIN_RAIL_15X55.width * SCHEMATIC_PX_PER_MM)
