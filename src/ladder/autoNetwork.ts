import type { LadderRung } from '../types'

/**
 * LADDER-AUTO-NET-01 — ao colocar o primeiro elemento numa network vazia,
 * aparece automaticamente uma network vazia logo abaixo (pronta para o próximo elemento),
 * como nos editores TIA/Codesys. Só reage à passagem «vazia → com conteúdo»; não mexe
 * em networks novas que já nascem preenchidas (duplicar, colar, GRAFCET gerado…).
 */
export function rungHasContent(rung: LadderRung | undefined): boolean {
  if (!rung) return false
  return rung.branches.some((branch) => branch.elements.length > 0)
    || rung.coils.length > 0
    || !!(rung.timer || rung.counter || rung.move || rung.math || rung.call || rung.limit || rung.scale || rung.jump)
}

export function withEmptyNetworkBelow(prev: LadderRung[], next: LadderRung[], makeRung: (index: number) => LadderRung): LadderRung[] {
  const before = new Map(prev.map((rung) => [rung.id, rung]))
  let out: LadderRung[] | null = null
  for (let i = 0; i < next.length; i++) {
    const rung = next[i]
    const was = before.get(rung.id)
    if (!was || rungHasContent(was) || !rungHasContent(rung)) continue
    const list: LadderRung[] = out ?? next
    const at = list.indexOf(rung)
    const below = list[at + 1]
    if (below && !rungHasContent(below)) continue
    out = [...list.slice(0, at + 1), makeRung(at + 1), ...list.slice(at + 1)]
  }
  return out ?? next
}
