import { useSimStore } from '../store/useSimStore'
import { tagsToDeclare } from './signals'

/** Declara na tabela de variáveis (Bool, sem nome) os endereços que ainda não existem. Devolve quantos criou. */
export function declareSignals(addresses: readonly string[]): number {
  const state = useSimStore.getState()
  const created = tagsToDeclare(state.tags, addresses, () => crypto.randomUUID())
  if (!created.length) return 0
  state.setTags([...state.tags, ...created])
  return created.length
}
