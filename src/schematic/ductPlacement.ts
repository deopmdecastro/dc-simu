import type { ElectricalComponent } from '../types'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import { CABLE_DUCT, cableDuctDimsOf } from '../three/enclosureParts'
import { boundsOverlap, componentBounds2D, componentPositionIsFree } from './componentCollision'

export type DuctSlot = 'left' | 'right' | 'top' | 'bottom'

/** Encosto (px) com que a nova calha entra na parede da outra, para a junção abrir a passagem de cabos. */
const OVERLAP_PX = 2

export interface DuctPlacement {
  w: number; h: number; schematicX: number; schematicY: number; rotation: number
  lengthMm: number; widthMm: number; heightMm: number; coverOn: boolean; bodyColor?: string
}

/**
 * Calha nova encostada a `c`: `left`/`right` prolongam-na pela ponta (mesma direção), `top`/`bottom`
 * saem em T pela parede (perpendicular, a partir do centro). Herda largura, altura, tampa e cor.
 */
export function adjacentDuctPlacement(c: ElectricalComponent, slot: DuctSlot, lengthMm?: number): DuctPlacement {
  const d = cableDuctDimsOf(c.state)
  const requested = Number.isFinite(lengthMm) ? lengthMm! : (slot === 'left' || slot === 'right' ? d.lengthMm : Math.min(d.lengthMm, 400))
  const len = Math.max(CABLE_DUCT.minLengthMm, Math.min(CABLE_DUCT.maxLengthMm, Math.round(requested)))
  const w = Math.round(len * SCHEMATIC_PX_PER_MM), h = c.h
  const a = ((c.rotation ?? 0) * Math.PI) / 180
  const ux = Math.cos(a), uy = Math.sin(a), vx = -Math.sin(a), vy = Math.cos(a)
  const cx = c.schematicX + c.w / 2, cy = c.schematicY + c.h / 2
  let ncx: number, ncy: number, rotation = c.rotation ?? 0
  if (slot === 'left' || slot === 'right') {
    const s = slot === 'right' ? 1 : -1
    ncx = cx + s * ux * (c.w / 2 + w / 2); ncy = cy + s * uy * (c.w / 2 + w / 2)
  } else {
    const s = slot === 'bottom' ? 1 : -1
    const off = c.h / 2 + w / 2 - OVERLAP_PX
    ncx = cx + s * vx * off; ncy = cy + s * vy * off
    rotation = (rotation + 90) % 360
  }
  return {
    w, h, schematicX: Math.round(ncx - w / 2), schematicY: Math.round(ncy - h / 2), rotation,
    lengthMm: len, widthMm: d.widthMm, heightMm: d.heightMm, coverOn: c.state.coverOn !== false,
    bodyColor: c.bodyColor,
  }
}

/** Mantém o encosto e procura o maior comprimento que cabe, em passos de 1 mm. */
export function fitAdjacentDuct(c: ElectricalComponent, slot: DuctSlot, all: ElectricalComponent[], draft: ElectricalComponent, lengthMm?: number): DuctPlacement | null {
  const requested = adjacentDuctPlacement(c, slot, lengthMm).lengthMm
  for (let mm = requested; mm >= CABLE_DUCT.minLengthMm; mm--) {
    const placement = adjacentDuctPlacement(c, slot, mm)
    // A associação ao quadro não dispensa verificar as paredes durante a inserção.
    const probe = { ...draft, ...placement, enclosureId: undefined }
    // Cruzamentos em T são permitidos; duplicados sobrepostos do mesmo troço não.
    const duplicate = all.some(other => other.id !== c.id && other.id !== draft.id && other.type === 'cableDuct'
      && Math.abs(Math.cos(((other.rotation ?? 0) - placement.rotation) * Math.PI / 180)) > 0.99
      && boundsOverlap(componentBounds2D(probe), componentBounds2D(other), 0))
    if (duplicate) continue
    if (componentPositionIsFree(probe, probe.schematicX, probe.schematicY, all, new Set([draft.id]))) return placement
  }
  return null
}

/** Escolhe o encosto pela posição do cursor no referencial da calha: além de uma ponta prolonga, ao lado da parede ramifica. */
export function slotForPoint(c: ElectricalComponent, x: number, y: number): DuctSlot {
  const a = ((c.rotation ?? 0) * Math.PI) / 180
  const dx = x - (c.schematicX + c.w / 2), dy = y - (c.schematicY + c.h / 2)
  const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a)
  if (lx > c.w / 2) return 'right'
  if (lx < -c.w / 2) return 'left'
  return ly < 0 ? 'top' : 'bottom'
}

/** Calha existente mais próxima do ponto, dentro do alcance de encosto (mm). */
export function nearestDuct(x: number, y: number, all: ElectricalComponent[], reachMm = 80): ElectricalComponent | null {
  let best: ElectricalComponent | null = null, bestD = Infinity
  const reach = reachMm * SCHEMATIC_PX_PER_MM
  for (const c of all) {
    if (c.type !== 'cableDuct') continue
    const a = ((c.rotation ?? 0) * Math.PI) / 180
    const dx = x - (c.schematicX + c.w / 2), dy = y - (c.schematicY + c.h / 2)
    const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a)
    const ox = Math.max(0, Math.abs(lx) - c.w / 2), oy = Math.max(0, Math.abs(ly) - c.h / 2)
    const dist = Math.hypot(ox, oy)
    if (dist <= reach && dist < bestD) { best = c; bestD = dist }
  }
  return best
}

/** Tenta encaixar a calha nova numa existente; devolve `null` se não há nenhuma perto ou o encosto não cabe (aparelhos/quadro). */
export function snapNewDuct(cursor: { x: number; y: number }, all: ElectricalComponent[], draft: ElectricalComponent): { placement: DuctPlacement; slot: DuctSlot; hostRef: string } | null {
  const host = nearestDuct(cursor.x, cursor.y, all)
  if (!host) return null
  const slot = slotForPoint(host, cursor.x, cursor.y)
  const placement = fitAdjacentDuct(host, slot, all, draft)
  if (!placement) return null
  return { placement, slot, hostRef: host.ref }
}
