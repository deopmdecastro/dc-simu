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

/** Quarto de volta do SVG: `rotate(θ)` em graus no sentido horário do ecrã (y para baixo). */
const axisOf = (c: ElectricalComponent): { ux: number; uy: number } => {
  const a = ((c.rotation ?? 0) * Math.PI) / 180
  return { ux: Math.cos(a), uy: Math.sin(a) }
}

/**
 * Posição (px do canvas) das duas pontas da calha ao longo do seu eixo, já com a rotação.
 * `left` é a ponta do lado -x local; `right` a do lado +x local.
 */
export function ductEnds(c: ElectricalComponent): { left: { x: number; y: number }; right: { x: number; y: number } } {
  const { ux, uy } = axisOf(c)
  const cx = c.schematicX + c.w / 2, cy = c.schematicY + c.h / 2
  return { left: { x: cx - (ux * c.w) / 2, y: cy - (uy * c.w) / 2 }, right: { x: cx + (ux * c.w) / 2, y: cy + (uy * c.w) / 2 } }
}

/** Comprimento (mm) que a ponta arrastada daria com o rato em `pointer`, medido ao longo do eixo da calha a partir da ponta fixa. */
export function ductLengthFromPointer(c: ElectricalComponent, side: 'left' | 'right', pointer: { x: number; y: number }, snap = true): number {
  const { ux, uy } = axisOf(c)
  const ends = ductEnds(c)
  const fixed = side === 'right' ? ends.left : ends.right
  const along = (pointer.x - fixed.x) * ux + (pointer.y - fixed.y) * uy
  const mm = Math.abs(along) / SCHEMATIC_PX_PER_MM
  return snap ? Math.round(mm / STEP_MM) * STEP_MM : mm
}

/**
 * Aumenta ou reduz a calha por UMA ponta (`side`): a ponta oposta fica exatamente onde está, qualquer que
 * seja a rotação. Se o comprimento pedido não cabe (aparelho ou parede do quadro), fica o maior que cabe.
 * Devolve `null` quando nada muda ou nem o comprimento atual é válido.
 */
export function fitDuctSideResize(c: ElectricalComponent, all: ElectricalComponent[], side: 'left' | 'right', lengthMm: number, minMm = 50, maxMm = 3000): DuctFit | null {
  const { ux, uy } = axisOf(c)
  const ends = ductEnds(c)
  const fixed = side === 'right' ? ends.left : ends.right
  const dir = side === 'right' ? 1 : -1 // sentido, a partir da ponta fixa, para onde a calha cresce
  const currentMm = Math.round(c.w / SCHEMATIC_PX_PER_MM)
  const ignore = new Set([c.id])
  const place = (mm: number): DuctFit => {
    const w = Math.max(4, Math.round(mm * SCHEMATIC_PX_PER_MM))
    const cx = fixed.x + dir * ux * (w / 2), cy = fixed.y + dir * uy * (w / 2)
    return { lengthMm: mm, widthMm: Math.round(c.h / SCHEMATIC_PX_PER_MM), w, h: c.h, schematicX: Math.round(cx - w / 2), schematicY: Math.round(cy - c.h / 2), limited: false }
  }
  const want = Math.max(minMm, Math.min(maxMm, Math.round(lengthMm)))
  const free = (f: DuctFit) => componentPositionIsFree({ ...c, w: f.w, h: f.h, schematicX: f.schematicX, schematicY: f.schematicY }, f.schematicX, f.schematicY, all, ignore)
  const exact = place(want)
  if (free(exact)) return want === currentMm ? null : exact
  // Para reduzir nunca há colisão nova; só ao crescer procuramos o maior que cabe.
  if (want <= currentMm) return null
  for (let mm = want - STEP_MM; mm > currentMm; mm -= STEP_MM) {
    const f = place(mm)
    if (free(f)) return { ...f, limited: true }
  }
  return null
}
