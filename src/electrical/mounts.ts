/**
 * Encaixe direto relé térmico ↔ contactor (sem dependências de 3D).
 *
 * Um relé com `mountedOn` tem os pinos 1L1/3L2/5L3 nos bornes 2T1/4T2/6T3 do contactor e a
 * passagem A2 ligada ao A2 dele. Os ids dos bornes seguem a convenção `${componente}-${borne}`.
 */
import type { ElectricalComponent } from '../types'

/** Pinos do relé → bornes de saída do contactor onde encaixam. */
export const MOUNT_PAIRS: Array<[relayIn: string, contactorOut: string]> = [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3']]
/** Passagem da bobina: o A2 do relé dá acesso ao A2 do contactor, que o encaixe tapa. */
export const MOUNT_PASS_THROUGH: Array<[relay: string, contactor: string]> = [['A2', 'A2']]

/** Ligações internas (pares de ids de bornes) de um relé encaixado; vazio se não estiver encaixado. */
export function mountTerminalPairs(relay: Pick<ElectricalComponent, 'mountedOn' | 'terminals'>): Array<[string, string]> {
  if (!relay.mountedOn) return []
  const pairs: Array<[string, string]> = []
  for (const [pin, socket] of [...MOUNT_PAIRS, ...MOUNT_PASS_THROUGH]) {
    const own = relay.terminals.find((t) => t.label === pin)
    if (own) pairs.push([own.id, `${relay.mountedOn}-${socket}`])
  }
  return pairs
}
