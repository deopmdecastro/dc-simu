import type { LadderRung } from '../types'
import { applyKind, type PaletteKind } from './ladderDnd'

/** Network vazia com id único (mesma forma com que a store cria uma network nova). */
export function newEmptyRung(): LadderRung {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    branches: [{ id: crypto.randomUUID(), elements: [] }],
    coils: [],
  }
}

/**
 * Inserção rápida de um elemento na network ativa (ou numa network nova quando
 * nada está ativa) — partilhado pela Main e pelos editores de bloco (FC/FB/OB)
 * para haver um ÚNICO comportamento a manter.
 */
export function insertIntoRungs(
  rungs: LadderRung[],
  activeId: string | null,
  kind: PaletteKind,
): { rungs: LadderRung[]; rungId: string } {
  const current = activeId && rungs.some((r) => r.id === activeId) ? activeId : null
  if (current) {
    return { rungs: rungs.map((r) => (r.id === current ? applyKind(r, kind).rung : r)), rungId: current }
  }
  const r = applyKind(newEmptyRung(), kind).rung
  return { rungs: [...rungs, r], rungId: r.id }
}
