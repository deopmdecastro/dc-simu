import { create } from 'zustand'
import { uiAlert } from '../ui/dialogs'
import {
  canUse, DEFAULT_PRICING, effectivePlanId, limitFor, limitMessage, planById, readPricing, upgradeMessage,
  type FeatureKey, type LimitKey, type PlanConfig, type PlanId, type PricingConfig,
} from './platformCore.mjs'

/**
 * Plano em vigor da sessão atual (SAAS-PLANS-01). Preenchido a partir de
 * `/settings` (ver componentSettings.load). O administrador tem acesso total.
 * Estas verificações servem a interface; o servidor volta a validar os limites
 * de projetos, partilha e comentários.
 */
interface PlanState {
  pricing: PricingConfig
  /** null = administrador (sem plano). */
  plan: PlanId | null
  role: 'admin' | 'user' | null
  loaded: boolean
  set: (patch: Partial<Pick<PlanState, 'pricing' | 'plan' | 'role'>>) => void
  reset: () => void
}

export const usePlanStore = create<PlanState>((set) => ({
  pricing: readPricing(DEFAULT_PRICING),
  plan: null,
  role: null,
  loaded: false,
  set(patch) { set({ ...patch, loaded: true }) },
  reset() { set({ pricing: readPricing(DEFAULT_PRICING), plan: null, role: null, loaded: false }) },
}))

const subjectOf = (s: PlanState) => ({ role: s.role ?? 'user', plan: s.plan })

export function canUseFeature(feature: FeatureKey, state = usePlanStore.getState()): boolean {
  // Sem sessão carregada (ex.: testes antigos, editor offline) não bloqueia.
  if (!state.loaded || state.role === 'admin' || state.role === null) return true
  return canUse(subjectOf(state), state.pricing, feature)
}

export function useCan(feature: FeatureKey) {
  return usePlanStore((s) => canUseFeature(feature, s))
}

export function featureBlockedMessage(feature: FeatureKey, state = usePlanStore.getState()) {
  return upgradeMessage(state.pricing, feature)
}

export function currentLimit(key: LimitKey, state = usePlanStore.getState()): number | null {
  if (!state.loaded || state.role !== 'user') return null
  return limitFor(subjectOf(state), state.pricing, key)
}

export function currentLimitMessage(key: LimitKey, state = usePlanStore.getState()) {
  return limitMessage(state.pricing, subjectOf(state), key)
}

export function currentPlan(state = usePlanStore.getState()): PlanConfig | null {
  if (state.role !== 'user') return null
  return planById(state.pricing, effectivePlanId(subjectOf(state), state.pricing))
}

/**
 * Aviso uniforme quando uma funcionalidade está fora do plano. Devolve true se
 * pode continuar. Mostra o aviso no registo de eventos do simulador (se existir).
 */
export function requireFeature(feature: FeatureKey, notify?: (message: string) => void): boolean {
  if (canUseFeature(feature)) return true
  const message = featureBlockedMessage(feature)
  if (notify) notify(message)
  else void uiAlert(message, { title: 'Funcionalidade do plano' })
  return false
}
