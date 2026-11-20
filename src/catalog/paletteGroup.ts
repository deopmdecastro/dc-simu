import type { ComponentCategory } from '../types'

export const CATALOG_PALETTE_GROUP = 'Catálogo oficial'

/** Nome da pasta de cada categoria, para quando os integrados ainda não a definem. */
const FALLBACK_GROUP: Record<ComponentCategory, string> = {
  protection: 'Proteção', command: 'Comando', sensor: 'Sensores', measurement: 'Aparelhos de medir',
  contactor: 'Contatores', relay: 'Relés', signaling: 'Sinalização', motor: 'Motores', drive: 'Acionamentos',
  controller: 'Controladores', terminal: 'Bornes e barras', power: 'Fontes',
} as Record<ComponentCategory, string>

/** Compara nomes de pasta sem maiúsculas, acentos nem plural («Relés» = «relé» = «Reles»). */
const stem = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, ' ').split(' ').map((word) => word.replace(/(es|s)$/, '')).join(' ')

/**
 * Pasta da biblioteca de um componente do catálogo oficial. O texto livre do
 * grupo é respeitado, exceto quando nomeia a pasta de OUTRA categoria (ex.: uma
 * botoneira «command» com grupo «Relés») — aí prevalece a categoria do componente.
 * `builtinGroups` lista o par categoria/pasta dos integrados (fonte das pastas).
 */
export function catalogPaletteGroup(category: ComponentCategory, freeGroup: string | undefined, builtinGroups: ReadonlyArray<readonly [ComponentCategory, string]>): string {
  const byCategory = new Map<ComponentCategory, Map<string, number>>()
  for (const [cat, group] of builtinGroups) {
    const counts = byCategory.get(cat) ?? new Map<string, number>()
    counts.set(group, (counts.get(group) ?? 0) + 1)
    byCategory.set(cat, counts)
  }
  const groupOf = (cat: ComponentCategory) => {
    const counts = byCategory.get(cat)
    return counts ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : FALLBACK_GROUP[cat]
  }
  const own = groupOf(category) ?? FALLBACK_GROUP[category]
  const text = freeGroup?.trim()
  if (!text) return CATALOG_PALETTE_GROUP
  const key = stem(text)
  const categories = new Set<ComponentCategory>([...byCategory.keys(), ...(Object.keys(FALLBACK_GROUP) as ComponentCategory[])])
  const conflicts = [...categories].some((cat) => cat !== category && [groupOf(cat), FALLBACK_GROUP[cat]].some((g) => g && stem(g) === key))
  return `${CATALOG_PALETTE_GROUP} · ${conflicts && own ? own : text}`
}
