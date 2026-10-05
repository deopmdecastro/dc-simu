import type { ComponentDefinition, PartDef } from '../../catalog/types'
import { removeParts, type Selection } from './editorStore'

/**
 * Operações puras sobre a seleção (sem DOM nem store), para o editor e para os
 * testes partilharem a mesma regra.
 */

const partById = (def: ComponentDefinition, id: string): PartDef | undefined => def.parts.find((part) => part.id === id)

/** Uma peça está efetivamente bloqueada se ela, ou qualquer antepassado, estiver bloqueada. */
export function isPartLocked(def: ComponentDefinition, id: string): boolean {
  const seen = new Set<string>()
  let current = partById(def, id)
  while (current && !seen.has(current.id)) {
    if (current.locked) return true
    seen.add(current.id)
    current = current.parentId ? partById(def, current.parentId) : undefined
  }
  return false
}

/** Só as peças «de cima»: tira as que já seguem um antepassado também selecionado. */
export function topmostIds(def: ComponentDefinition, ids: string[]): string[] {
  const chosen = new Set(ids)
  return ids.filter((id) => {
    const seen = new Set<string>([id])
    let parent = partById(def, id)?.parentId ?? null
    while (parent && !seen.has(parent)) {
      if (chosen.has(parent)) return false
      seen.add(parent)
      parent = partById(def, parent)?.parentId ?? null
    }
    return true
  })
}

/** Separa as peças que se podem alterar das bloqueadas (e das que já não existem). */
export function splitLocked(def: ComponentDefinition, ids: string[]): { editable: string[]; locked: string[] } {
  const editable: string[] = [], locked: string[] = []
  for (const id of ids) {
    if (!partById(def, id)) continue
    ;(isPartLocked(def, id) ? locked : editable).push(id)
  }
  return { editable, locked }
}

export interface RemovalResult {
  def: ComponentDefinition
  /** Quantos elementos foram realmente eliminados. */
  removed: number
  /** Peças bloqueadas que ficaram (não se apagam sem desbloquear). */
  skippedLocked: number
}

/**
 * Elimina o que está selecionado. Peças bloqueadas são poupadas; botões e ecrãs
 * saem como no separador respetivo (antes, ficavam por apagar em silêncio).
 */
export function removeSelectionFrom(def: ComponentDefinition, selection: Selection, partIds: string[]): RemovalResult {
  if (!selection) return { def, removed: 0, skippedLocked: 0 }
  switch (selection.kind) {
    case 'part': {
      const { editable, locked } = splitLocked(def, partIds)
      if (!editable.length) return { def, removed: 0, skippedLocked: locked.length }
      return { def: removeParts(def, editable), removed: editable.length, skippedLocked: locked.length }
    }
    case 'terminal': {
      const terminals = def.terminals.filter((item) => item.id !== selection.id)
      return terminals.length === def.terminals.length ? { def, removed: 0, skippedLocked: 0 } : { def: { ...def, terminals }, removed: 1, skippedLocked: 0 }
    }
    case 'light': {
      const lights = def.lights.filter((item) => item.id !== selection.id)
      return lights.length === def.lights.length ? { def, removed: 0, skippedLocked: 0 } : { def: { ...def, lights }, removed: 1, skippedLocked: 0 }
    }
    case 'control': {
      const controls = (def.controls ?? []).filter((item) => item.id !== selection.id)
      return controls.length === (def.controls ?? []).length ? { def, removed: 0, skippedLocked: 0 } : { def: { ...def, controls }, removed: 1, skippedLocked: 0 }
    }
    case 'display': {
      const displays = (def.displays ?? []).filter((item) => item.id !== selection.id)
      return displays.length === (def.displays ?? []).length ? { def, removed: 0, skippedLocked: 0 } : { def: { ...def, displays }, removed: 1, skippedLocked: 0 }
    }
  }
}

/** Ids das peças visíveis na lista, de `from` a `to` (inclusive), pela ordem apresentada. */
export function rangeBetween(order: string[], from: string, to: string): string[] {
  const a = order.indexOf(from), b = order.indexOf(to)
  if (a < 0 || b < 0) return [to]
  return order.slice(Math.min(a, b), Math.max(a, b) + 1)
}

/** Ids dos antepassados de uma peça (do pai para cima). */
export function ancestorsOf(def: ComponentDefinition, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>([id])
  let parent = partById(def, id)?.parentId ?? null
  while (parent && !seen.has(parent)) { out.push(parent); seen.add(parent); parent = partById(def, parent)?.parentId ?? null }
  return out
}

/** Sem acentos e em minúsculas: «Manípulo» encontra-se a escrever «manipulo». */
export const normalizeText = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export interface TreeRow { part: PartDef; depth: number; hasChildren: boolean }

/**
 * Linhas visíveis da lista de objetos.
 * - `needle` (já normalizado): mostra as peças que coincidem e os seus antepassados; ignora o «recolhido».
 * - `collapsed` + `allowCollapse`: esconde os descendentes de um grupo recolhido (nos cartões não há indentação, por isso lá não se recolhe).
 */
export function visibleRows(def: ComponentDefinition, opts: { collapsed: ReadonlySet<string>; needle: string; allowCollapse: boolean }): TreeRow[] {
  const { collapsed, needle, allowCollapse } = opts
  const children = new Map<string | null, PartDef[]>()
  for (const part of def.parts) children.set(part.parentId, [...(children.get(part.parentId) ?? []), part])
  let keep: Set<string> | null = null
  if (needle) {
    keep = new Set<string>()
    for (const part of def.parts) if (normalizeText(part.name).includes(needle)) { keep.add(part.id); ancestorsOf(def, part.id).forEach((id) => keep!.add(id)) }
  }
  const rows: TreeRow[] = []
  const seen = new Set<string>()
  const walk = (parent: string | null, depth: number) => (children.get(parent) ?? []).forEach((part) => {
    if (seen.has(part.id)) return
    seen.add(part.id)
    if (keep && !keep.has(part.id)) return
    rows.push({ part, depth, hasChildren: (children.get(part.id) ?? []).length > 0 })
    if (!(collapsed.has(part.id) && allowCollapse && !needle)) walk(part.id, depth + 1)
  })
  walk(null, 0)
  return rows
}
