import { create } from 'zustand'
import { accountApi } from '../auth/accountApi'
import { usePlanStore } from '../saas/usePlan'
import { componentAccess, readPricing, type ComponentStatus, type PlanId, type PricingConfig } from '../saas/platformCore.mjs'

type SettingsResponse = {
  disabledComponents: Array<{ type: string; note?: string }>
  components?: Array<{ type: string; status: ComponentStatus; note?: string; minPlan?: PlanId | null }>
  pricing?: PricingConfig
  plan?: PlanId | null
}

interface ComponentSettingsState {
  /** Componentes que não podem ser inseridos → motivo completo (bloqueado ou acima do plano). */
  disabled: Record<string, string>
  /** Componentes arquivados/eliminados: desaparecem da biblioteca (ADMIN-COMP-01). */
  hidden: Record<string, true>
  loaded: boolean
  load: (user?: { role: 'admin' | 'user' } | null) => Promise<void>
  set: (disabled: Array<{ type: string; note?: string }>) => void
  apply: (response: SettingsResponse, role: 'admin' | 'user' | null) => void
  reset: () => void
}

export const DISABLED_COMPONENT_MESSAGE = 'Bloqueado pelo administrador'

/**
 * Componentes que o administrador bloqueou, arquivou, eliminou ou reservou a um
 * plano. Os projetos existentes continuam a abrir; apenas deixa de ser possível
 * inserir novas instâncias.
 */
export const useComponentSettings = create<ComponentSettingsState>((set, get) => ({
  disabled: {},
  hidden: {},
  loaded: false,
  async load(user) {
    try {
      const response = await accountApi<SettingsResponse>('/settings')
      get().apply(response, user?.role ?? usePlanStore.getState().role)
    } catch {
      set({ loaded: true })
    }
  },
  apply(response, role) {
    const pricing = readPricing(response.pricing ?? null)
    const subject = { role: role ?? 'user', plan: response.plan ?? null } as const
    const disabled: Record<string, string> = {}
    const hidden: Record<string, true> = {}
    const list = response.components ?? response.disabledComponents.map((entry) => ({ type: entry.type, status: 'blocked' as const, note: entry.note, minPlan: null }))
    for (const entry of list) {
      const access = componentAccess(entry, subject, pricing)
      if (!access.visible) hidden[entry.type] = true
      else if (!access.insertable) disabled[entry.type] = access.reason ?? DISABLED_COMPONENT_MESSAGE
    }
    set({ disabled, hidden, loaded: true })
    usePlanStore.getState().set({ pricing, plan: role === 'admin' ? null : response.plan ?? pricing.defaultPlan, role: role ?? 'user' })
  },
  set(list) { set({ disabled: Object.fromEntries(list.map((entry) => [entry.type, entry.note ? `${DISABLED_COMPONENT_MESSAGE}: ${entry.note}` : DISABLED_COMPONENT_MESSAGE])), loaded: true }) },
  reset() { set({ disabled: {}, hidden: {}, loaded: false }); usePlanStore.getState().reset() },
}))

export function disabledReason(disabled: Record<string, string>, type: string) {
  return type in disabled ? disabled[type] || DISABLED_COMPONENT_MESSAGE : null
}
