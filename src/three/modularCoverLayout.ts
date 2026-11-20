import type { EnclosureDims } from './enclosureParts'

export type InnerCoverMode = 'hidden' | 'outline' | 'solid'
export interface ModularOpening { xMm: number; yMm: number; widthMm: number; heightMm: number }
export interface ModularCoverLayout {
  widthMm: number; heightMm: number; zMm: number; rows: number; rowHeightMm: number
  openings: ModularOpening[]
}
export interface CoverOccupant { xMm: number; yMm: number; widthMm: number; heightMm: number }
export interface CoverBlank { xMm: number; yMm: number; widthMm: number; heightMm: number; modules: number }

/** Flags anteriores continuam legíveis; um modo inválido nunca cria uma chapa nova. */
export function innerCoverModeOf(state: Record<string, unknown> | undefined): InnerCoverMode {
  if (state?.innerCover !== true && state?.modularCover !== true) return 'hidden'
  return state.innerCoverMode === 'outline' ? 'outline' : 'solid'
}

/** Recuo por omissão do plano da sobretampa em relação à frente do armário (mm). */
export const INNER_COVER_DEFAULT_INSET_MM = 42
/** Aba frontal do armário (igual a ENCLOSURE.flange; aqui sem import para evitar ciclo). */
const FLANGE_MM = 18

/** Recuo válido (mm) para umas medidas de armário; valores inválidos voltam ao padrão. */
export function innerCoverInsetOf(dims: EnclosureDims, insetMm?: unknown): number {
  const raw = typeof insetMm === 'number' && Number.isFinite(insetMm) ? insetMm : INNER_COVER_DEFAULT_INSET_MM
  return Math.max(20, Math.min(Math.max(20, dims.depthMm - 45), raw))
}

/**
 * Medidas em mm, referencial centrado no quadro e Z a partir da parede traseira.
 * Fonte única da geometria: a chapa 3D (buildInnerModularCover) e os obturadores
 * automáticos usam exatamente estas janelas.
 */
export function modularCoverLayout(dims: EnclosureDims, rowsOverride?: number, insetMm: number = INNER_COVER_DEFAULT_INSET_MM): ModularCoverLayout {
  const widthMm = Math.max(40, dims.widthMm - 2 * FLANGE_MM - 4), heightMm = Math.max(40, dims.heightMm - 2 * FLANGE_MM - 4)
  const requested = Number.isFinite(rowsOverride) && rowsOverride! >= 1 ? Math.round(rowsOverride!) : Math.round(heightMm / 145)
  const rows = Math.max(1, Math.min(6, requested)), rowHeightMm = heightMm / rows
  const inset = innerCoverInsetOf(dims, insetMm)
  const windowWidth = Math.max(20, Math.min(widthMm - 20, Math.max(60, widthMm - 74))), windowHeight = Math.min(46, rowHeightMm * .42)
  return {
    widthMm, heightMm, zMm: dims.depthMm - inset, rows, rowHeightMm,
    openings: Array.from({ length: rows }, (_, r) => ({
      xMm: 0, yMm: -heightMm / 2 + (r + .5) * rowHeightMm,
      widthMm: windowWidth, heightMm: windowHeight,
    })),
  }
}

/**
 * Subtrai a projeção REAL dos aparelhos; não arredonda aparelhos para módulos.
 * Só as vagas resultantes recebem tiras fracionáveis (máximo 12 módulos/peça).
 */
export function vacantCoverBlanks(layout: ModularCoverLayout, occupants: readonly CoverOccupant[], clearanceMm = .6): CoverBlank[] {
  const clearance = Number.isFinite(clearanceMm) ? Math.max(0, clearanceMm) : .6
  const blanks: CoverBlank[] = []
  for (const opening of layout.openings) {
    const left = opening.xMm - opening.widthMm / 2, right = opening.xMm + opening.widthMm / 2
    const top = opening.yMm + opening.heightMm / 2, bottom = opening.yMm - opening.heightMm / 2
    const blocked = occupants.filter(o => [o.xMm, o.yMm, o.widthMm, o.heightMm].every(Number.isFinite)
      && o.widthMm > 0 && o.heightMm > 0
      && o.yMm + o.heightMm / 2 + clearance > bottom && o.yMm - o.heightMm / 2 - clearance < top)
      .map(o => [Math.max(left, o.xMm - o.widthMm / 2 - clearance), Math.min(right, o.xMm + o.widthMm / 2 + clearance)] as const)
      .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])
    const free: Array<[number, number]> = []
    let cursor = left
    for (const [a, b] of blocked) {
      if (a > cursor) free.push([cursor, a])
      cursor = Math.max(cursor, b)
    }
    if (cursor < right) free.push([cursor, right])
    for (const [start, end] of free) {
      for (let x = start; x < end - .1; x += 216) {
        const widthMm = Math.min(216, end - x)
        blanks.push({ xMm: x + widthMm / 2, yMm: opening.yMm, widthMm, heightMm: opening.heightMm, modules: widthMm / 18 })
      }
    }
  }
  return blanks
}
