import { create } from 'zustand'
import { accountApi } from '../auth/accountApi'

interface ComponentSettingsState {
  /** Componentes desativados pelo administrador → motivo. */
  disabled: Record<string, string>
  loaded: boolean
  load: () => Promise<void>
  set: (disabled: Array<{ type: string; note?: string }>) => void
  reset: () => void
}

/**
 * Componentes que o administrador retirou da biblioteca. Os projetos existentes
 * continuam a abrir; apenas deixa de ser possível inserir novas instâncias.
 */
export const useComponentSettings = create<ComponentSettingsState>((set) => ({
  disabled: {},
  loaded: false,
  async load() {
    try {
      const response = await accountApi<{ disabledComponents: Array<{ type: string; note?: string }> }>('/settings')
      set({ disabled: Object.fromEntries(response.disabledComponents.map((entry) => [entry.type, entry.note || ''])), loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  set(list) { set({ disabled: Object.fromEntries(list.map((entry) => [entry.type, entry.note || ''])), loaded: true }) },
  reset() { set({ disabled: {}, loaded: false }) },
}))

export const DISABLED_COMPONENT_MESSAGE = 'Desativado pelo administrador'

export function disabledReason(disabled: Record<string, string>, type: string) {
  if (!(type in disabled)) return null
  return disabled[type] ? `${DISABLED_COMPONENT_MESSAGE}: ${disabled[type]}` : DISABLED_COMPONENT_MESSAGE
}
