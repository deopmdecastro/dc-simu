import type { GrafcetTransition } from './engine'

/** Altura da pilha de referências de uma origem; evita rótulos lado a lado sobre outros ramos. */
export function referenceSlot(t: GrafcetTransition, transitions: GrafcetTransition[], source: { x: number; bottom: number; right: number }, manual?: { x: number; y: number }) {
  const siblings = transitions.filter(other => other.from.includes(t.from[0]) && other.id !== t.id)
  const branched = t.from.length === 1 && siblings.length > 0
  const rank = Math.max(0, transitions.filter(other => other.wireless && other.from[0] === t.from[0]).findIndex(other => other.id === t.id))
  return {
    branched: branched || !!manual && Math.abs(manual.x - source.x) > 0.01, junctionY: source.bottom + 28,
    x: manual?.x ?? (branched ? (Number.isFinite(t.x) && Math.abs(t.x! - source.x) >= 80 ? t.x! : Math.max(source.x + 180, source.right + 56)) : source.x),
    y: manual?.y ?? (branched ? source.bottom + 78 + rank * 56 : source.bottom + 34),
  }
}

export function referenceLabelWidth(t: GrafcetTransition) {
  const text = t.displayCondition === false ? '' : `${t.condition} ${t.guard ?? ''}`
  return Math.max(130, Math.min(600, text.length * 7 + 65))
}
