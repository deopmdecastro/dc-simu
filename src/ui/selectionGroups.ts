/**
 * Grupos de seleção dos editores (3D/Esquema, GRAFCET e Esquema IEC) — Ctrl+G agrupa, Ctrl+Shift+G desagrupa.
 *
 * Um grupo é um conjunto de ids de elementos da mesma vista (componentes, etapas, transições, comentários,
 * símbolos IEC, textos livres…). Os ids são únicos no projeto, por isso o grupo não precisa de saber o tipo
 * de cada membro: cada editor só pede «expande esta seleção aos grupos» e «agrupa/desagrupa estes ids».
 * Os grupos vão com o projeto e com o Desfazer.
 */
import type { CanvasNoteView } from '../types'

export type SelectionGroupView = Exclude<CanvasNoteView, '3d'>
export interface SelectionGroup { id: string; view: SelectionGroupView; members: string[] }

const uniq = (ids: string[]) => [...new Set(ids)]

/** A seleção alargada aos grupos de que algum id faz parte (clicar num membro seleciona o grupo todo). */
export function expandToGroups(groups: SelectionGroup[], view: SelectionGroupView, ids: string[]): string[] {
  const wanted = new Set(ids)
  const out = [...ids]
  for (const g of groups) {
    if (g.view !== view || !g.members.some((m) => wanted.has(m))) continue
    for (const m of g.members) if (!wanted.has(m)) { wanted.add(m); out.push(m) }
  }
  return out
}

/** Grupo de um id (ou null). */
export const groupOf = (groups: SelectionGroup[], view: SelectionGroupView, id: string) =>
  groups.find((g) => g.view === view && g.members.includes(id)) ?? null

/**
 * Ctrl/Shift+clique: liga ou desliga o elemento — e o seu grupo inteiro — na seleção atual.
 * Devolve a nova seleção.
 */
export function toggleInSelection(groups: SelectionGroup[], view: SelectionGroupView, selection: string[], id: string): string[] {
  const block = expandToGroups(groups, view, [id])
  return selection.includes(id) ? selection.filter((s) => !block.includes(s)) : uniq([...selection, ...block])
}

/** Agrupa os ids (≥ 2): grupos já tocados fundem-se no novo. Devolve os grupos novos ou null se não houver o que agrupar. */
export function groupIds(groups: SelectionGroup[], view: SelectionGroupView, ids: string[], newId: string): SelectionGroup[] | null {
  const members = uniq(expandToGroups(groups, view, ids))
  if (members.length < 2) return null
  const touched = (g: SelectionGroup) => g.view === view && g.members.some((m) => members.includes(m))
  if (groups.some((g) => touched(g) && g.members.length === members.length && members.every((m) => g.members.includes(m)))) return null
  return [...groups.filter((g) => !touched(g)), { id: newId, view, members }]
}

/** Desagrupa os grupos de que algum id faz parte. Devolve os grupos novos ou null se nenhum foi tocado. */
export function ungroupIds(groups: SelectionGroup[], view: SelectionGroupView, ids: string[]): SelectionGroup[] | null {
  const set = new Set(ids)
  const next = groups.filter((g) => !(g.view === view && g.members.some((m) => set.has(m))))
  return next.length === groups.length ? null : next
}

/** Retira membros que já não existem (apagados) e grupos com menos de 2 membros. */
export function pruneGroups(groups: SelectionGroup[], exists: (id: string) => boolean): SelectionGroup[] {
  let changed = false
  const next: SelectionGroup[] = []
  for (const g of groups) {
    const members = g.members.filter(exists)
    if (members.length !== g.members.length) changed = true
    if (members.length >= 2) next.push(members.length === g.members.length ? g : { ...g, members })
    else changed = true
  }
  return changed ? next : groups
}

/** Lê os grupos de um projeto gravado (ignora entradas inválidas). */
export function parseSelectionGroups(raw: unknown): SelectionGroup[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((g): g is SelectionGroup => !!g && typeof g.id === 'string' && ['schematic', 'grafcet', 'commands'].includes(g.view)
    && Array.isArray(g.members) && g.members.length >= 2 && g.members.every((m: unknown) => typeof m === 'string'))
}
