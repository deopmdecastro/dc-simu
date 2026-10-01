import type { ActionDef, ComponentDefinition, InteractionDef, TriggerName } from './types'

/** Estado seguinte depois de uma ação (ações com atraso tratam-se à parte). */
export function nextCatalogState(action: ActionDef, current: string): string | null {
  switch (action.type) {
    case 'setState': return action.state
    case 'toggleState': return current === action.a ? action.b : action.a
    case 'cycleStates': { if (!action.states.length) return null; const index = action.states.indexOf(current); return action.states[(index + 1) % action.states.length] }
    default: return null
  }
}

export function interactionsFor(def: ComponentDefinition, trigger: TriggerName, partId: string): InteractionDef[] {
  return def.interactions.filter((item) => item.trigger === trigger && (!item.partId || item.partId === partId))
}

/** Aplica as interações em sequência: devolve o estado final e as ações com atraso. */
export function runInteractions(interactions: InteractionDef[], current: string) {
  const delayed: Array<{ state: string; afterMs: number }> = []
  let state = current
  for (const interaction of interactions) {
    for (const action of interaction.actions) {
      if (action.type === 'delayedState') { delayed.push({ state: action.state, afterMs: action.afterMs }); continue }
      const next = nextCatalogState(action, state)
      if (next) state = next
    }
  }
  return { state, delayed, changed: state !== current }
}
