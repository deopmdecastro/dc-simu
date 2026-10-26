import { useEffect, useState } from 'react'
import { accountApi } from '../auth/accountApi'
import { DEFAULT_PRICING, FEATURES, LIMIT_KEYS, LIMIT_LABEL, readPricing, type PlanConfig, type PricingConfig } from '../saas/platformCore.mjs'

/** Chave onde fica o plano escolhido na página inicial, para o painel o pré-selecionar. */
export const PLAN_INTENT_KEY = 'dcsimu:saas:intent'

export type Period = 'monthly' | 'yearly'

export function formatPrice(value: number | null, currency: string): string {
  if (value === null) return 'Sob consulta'
  if (value === 0) return 'Grátis'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency, maximumFractionDigits: value % 1 ? 2 : 0 }).format(value)
}

/** Lê a configuração pública de preços; sem rede usa os valores de fábrica. */
export function usePublicPricing(): { pricing: PricingConfig; loaded: boolean } {
  const [state, setState] = useState<{ pricing: PricingConfig; loaded: boolean }>({ pricing: DEFAULT_PRICING, loaded: false })
  useEffect(() => {
    let alive = true
    accountApi<PricingConfig>('/pricing')
      .then((pricing) => { if (alive) setState({ pricing: readPricing(pricing), loaded: true }) })
      .catch(() => { if (alive) setState({ pricing: DEFAULT_PRICING, loaded: true }) })
    return () => { alive = false }
  }, [])
  return state
}

export function landingPlans(pricing: PricingConfig): PlanConfig[] {
  if (!pricing.showPricing) return []
  return pricing.plans.filter((plan) => plan.showOnLanding).sort((a, b) => a.order - b.order)
}

function featureLines(plan: PlanConfig): string[] {
  const lines = LIMIT_KEYS.map((key) => plan.limits[key] === null ? `${LIMIT_LABEL[key]}: ilimitado`
    : key === 'collaborators' && plan.limits[key] === 0 ? 'Sem colaboradores (projetos individuais)' : `${LIMIT_LABEL[key]}: ${plan.limits[key]}`)
  return [...lines, ...FEATURES.filter((feature) => plan.features[feature.key]).map((feature) => feature.label), ...plan.extras]
}

/** SAAS-PLANS-01: cartões de preço geridos pelo administrador (visibilidade, destaque, valores). */
export default function LandingPricing({ pricing, onChoose }: { pricing: PricingConfig; onChoose: (plan: PlanConfig, period: Period) => void }) {
  const [period, setPeriod] = useState<Period>('monthly')
  const plans = landingPlans(pricing)
  if (!plans.length) return null
  const hasYearly = plans.some((plan) => plan.priceYearly !== null && plan.priceYearly > 0)
  return <section className="dx-section dx-pricing" id="precos" aria-label="Planos e preços">
    <div className="dx-wrap">
      <div className="dx-head">
        <span className="dx-over">Planos</span>
        <h2>Comece grátis. Cresça quando precisar.</h2>
        <p>Escolha o plano para o seu trabalho: o administrador ativa o plano depois de confirmar o pedido.</p>
      </div>
      {hasYearly && <div className="dx-period" role="radiogroup" aria-label="Período de faturação">
        <button type="button" role="radio" aria-checked={period === 'monthly'} className={period === 'monthly' ? 'is-active' : ''} onClick={() => setPeriod('monthly')}>Mensal</button>
        <button type="button" role="radio" aria-checked={period === 'yearly'} className={period === 'yearly' ? 'is-active' : ''} onClick={() => setPeriod('yearly')}>Anual{pricing.yearlyNote ? <small> · {pricing.yearlyNote}</small> : null}</button>
      </div>}
      <div className={`dx-price-grid is-${Math.min(plans.length, 4)}`}>
        {plans.map((plan) => {
          const price = period === 'yearly' ? plan.priceYearly : plan.priceMonthly
          return <article key={plan.id} className={`dx-price-card ${plan.highlighted ? 'is-highlighted' : ''}`} data-plan={plan.id}>
            {plan.highlighted && <span className="dx-price-flag">Recomendado</span>}
            <h3>{plan.name}</h3>
            {plan.tagline && <p className="dx-price-tag">{plan.tagline}</p>}
            <div className="dx-price-value"><strong>{formatPrice(price, pricing.currency)}</strong>{price !== null && price > 0 && <span>/{period === 'yearly' ? 'ano' : 'mês'}</span>}</div>
            <ul>{featureLines(plan).map((line) => <li key={line}>{line}</li>)}</ul>
            <button type="button" className={`dx-btn ${plan.highlighted ? 'dx-btn-primary' : 'dx-btn-secondary'}`} onClick={() => onChoose(plan, period)}>{plan.ctaLabel || 'Escolher'}</button>
          </article>
        })}
      </div>
      <p className="dx-price-note">Sem pagamento automático: depois de pedir o plano, recebe a confirmação do administrador.</p>
    </div>
  </section>
}
