import type { ElectricalComponent } from '../types'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import { componentPositionIsFree } from './componentCollision'

export interface DuctFit {
  lengthMm: number
  widthMm: number
  w: number
  h: number
  schematicX: number
  schematicY: number
  /** O comprimento pedido não coube: ficou o maior que cabe. */
  limited: boolean
}

const STEP_MM = 5

/**
 * Redimensiona a calha técnica sem a deixar atravessar aparelhos nem a parede do quadro.
 * Tenta ancorar à esquerda, à direita e ao centro; se o comprimento pedido não cabe, reduz
 * em passos de 5 mm até ao maior que cabe (nunca abaixo do atual). Devolve `null` quando nem a nova largura cabe.
 */
export function fitDuctResize(c: ElectricalComponent, all: ElectricalComponent[], lengthMm: number, widthMm: number): DuctFit | null {
  const h = Math.max(4, Math.round(widthMm * SCHEMATIC_PX_PER_MM))
  const currentMm = Math.round(c.w / SCHEMATIC_PX_PER_MM)
  const ignore = new Set([c.id])
  const y = Math.round(c.schematicY + (c.h - h) / 2)
  const tryLength = (mm: number): DuctFit | null => {
    const w = Math.max(4, Math.round(mm * SCHEMATIC_PX_PER_MM))
    const anchors = [c.schematicX, Math.round(c.schematicX + c.w - w), Math.round(c.schematicX + (c.w - w) / 2)]
    for (const x of anchors) {
      if (componentPositionIsFree({ ...c, w, h, schematicX: x, schematicY: y }, x, y, all, ignore)) return { lengthMm: mm, widthMm, w, h, schematicX: x, schematicY: y, limited: false }
    }
    return null
  }
  const exact = tryLength(lengthMm)
  if (exact) return exact
  if (lengthMm <= currentMm) return null
  for (let mm = lengthMm - STEP_MM; mm >= currentMm; mm -= STEP_MM) {
    const fit = tryLength(mm)
    if (fit) return { ...fit, limited: true }
  }
  const keep = tryLength(currentMm)
  return keep ? { ...keep, limited: true } : null
}
