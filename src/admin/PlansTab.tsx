import { useEffect, useMemo, useState } from 'react'
import Select from '../ui/Select'
import { adminApi } from './adminApi'
import type { AdminUser, PlanRequest } from './adminTypes'
import { usePlanStore } from '../saas/usePlan'
import {
  DEFAULT_PRICING, FEATURES, LIMIT_KEYS, LIMIT_LABEL, effectivePlanId, planById, sanitizePricing,
  type FeatureKey, type LimitKey, type PlanConfig, type PlanId, type PricingConfig,
} from '../saas/platformCore.mjs'

type Props = {
  users: AdminUser[]
  planRequests: PlanRequest[]
  onChanged: (message: string) => Promise<void> | void
  onError: (message: string) => void
}

const clone = (config: PricingConfig): PricingConfig => JSON.parse(JSON.stringify(config)) as PricingConfig
const money = (value: number | null, currency: string) => value === null ? 'Sob consulta'
  : new Intl.NumberFormat('pt-PT', { style: 'currency', currency, maximumFractionDigits: value % 1 ? 2 : 0 }).format(value)
const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value.replace(',', '.'))
const STATUS = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Recusado', cancelled: 'Cancelado' } as const

/**
 * SAAS-PLANS-01: o administrador define preços, funcionalidades e limites de cada plano,
 * escolhe que cartões aparecem na página inicial e decide os pedidos de mudança de plano.
 * Não existe gateway de pagamento: o fluxo é «pedido → confirmação manual → aprovação».
 */
export default function PlansTab({ users, planRequests, onChanged, onError }: Props) {
  const stored = usePlanStore((s) => s.pricing)
  const [draft, setDraft] = useState<PricingConfig>(() => clone(stored))
  const [busy, setBusy] = useState(false)
  const [requestFilter, setRequestFilter] = useState<'pending' | 'all'>('pending')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [extrasText, setExtrasText] = useState<Record<string, string>>({})

  useEffect(() => { setDraft(clone(stored)); setExtrasText({}) }, [stored])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(stored), [draft, stored])
  const problem = useMemo(() => { try { sanitizePricing(draft); return '' } catch (error) { return error instanceof Error ? error.message : 'Configuração inválida' } }, [draft])
  const plans = [...draft.plans].sort((a, b) => a.order - b.order)
  const landingCount = plans.filter((plan) => plan.showOnLanding).length
  const counts = useMemo(() => Object.fromEntries(stored.plans.map((plan) => [plan.id, users.filter((user) => user.role !== 'admin' && effectivePlanId(user, stored) === plan.id).length])), [users, stored])
  const shownRequests = planRequests.filter((request) => requestFilter === 'all' || request.status === 'pending')

  const patchPlan = (id: PlanId, patch: Partial<PlanConfig>) => setDraft((current) => ({
    ...current,
    plans: current.plans.map((plan) => plan.id === id ? { ...plan, ...patch } : patch.highlighted ? { ...plan, highlighted: false } : plan),
  }))
  const setFeature = (id: PlanId, key: FeatureKey, value: boolean) => setDraft((current) => ({
    ...current, plans: current.plans.map((plan) => plan.id === id ? { ...plan, features: { ...plan.features, [key]: value } } : plan),
  }))
  const setLimit = (id: PlanId, key: LimitKey, value: number | null) => setDraft((current) => ({
    ...current, plans: current.plans.map((plan) => plan.id === id ? { ...plan, limits: { ...plan.limits, [key]: value } } : plan),
  }))
  const move = (id: PlanId, delta: number) => {
    const order = plans.map((plan) => plan.id)
    const index = order.indexOf(id)
    const target = index + delta
    if (target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target], order[index]]
    setDraft((current) => ({ ...current, plans: current.plans.map((plan) => ({ ...plan, order: order.indexOf(plan.id) + 1 })) }))
  }

  async function save() {
    setBusy(true)
    try {
      const saved = await adminApi.savePricing(sanitizePricing(draft))
      usePlanStore.setState({ pricing: saved })
      await onChanged('Planos e preços guardados. A página inicial já mostra a nova configuração.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Não foi possível guardar os planos.')
    } finally { setBusy(false) }
  }

  async function decide(request: PlanRequest, action: 'approve' | 'reject') {
    setBusy(true)
    try {
      await adminApi.decidePlanRequest(request.id, action, notes[request.id] ?? '')
      await onChanged(action === 'approve' ? `Pedido aprovado: ${request.userEmail ?? 'conta'} passa ao plano ${planById(stored, request.plan).name}.` : `Pedido de ${request.userEmail ?? 'conta'} recusado.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Falha ao decidir o pedido.')
    } finally { setBusy(false) }
  }

  return <>
    <div className="dx-admin-section"><h2>Planos e preços</h2><span>{landingCount} cartão(ões) na página inicial · {planRequests.filter((request) => request.status === 'pending').length} pedido(s) pendente(s)</span></div>
    <p className="cb-note cb-banner">Checkout preparado, sem pagamento real: os utilizadores pedem um plano, o administrador confirma o pagamento fora da aplicação (transferência, fatura) e aprova o pedido. Os acessos são aplicados no servidor (SQLite) e no Supabase; no modo local (sem servidor) a separação é apenas na interface.</p>

    <section className="cb-pricing-global" aria-label="Opções gerais de preços">
      <label className="cb-switch"><input type="checkbox" checked={draft.showPricing} onChange={(event) => setDraft({ ...draft, showPricing: event.target.checked })} /> Mostrar a secção «Preços» na página inicial</label>
      <label className="dx-field"><span className="dx-label">Plano por omissão (contas novas e períodos expirados)</span>
        <Select className="dx-input" value={draft.defaultPlan} onChange={(event) => setDraft({ ...draft, defaultPlan: event.target.value as PlanId })} aria-label="Plano por omissão">
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </Select>
      </label>
      <label className="dx-field"><span className="dx-label">Moeda</span>
        <Select className="dx-input" value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} aria-label="Moeda">
          {['EUR', 'USD', 'BRL', 'AOA', 'GBP'].map((code) => <option key={code} value={code}>{code}</option>)}
        </Select>
      </label>
      <label className="dx-field cb-grow"><span className="dx-label">Nota do preço anual</span><input className="dx-input" value={draft.yearlyNote} maxLength={80} onChange={(event) => setDraft({ ...draft, yearlyNote: event.target.value })} aria-label="Nota do preço anual" /></label>
    </section>

    <div className="cb-plan-grid">
      {plans.map((plan, index) => <article key={plan.id} className={`cb-plan-card ${plan.highlighted ? 'is-highlighted' : ''} ${plan.showOnLanding ? '' : 'is-hidden-landing'}`} data-plan={plan.id}>
        <header>
          <input className="dx-input cb-plan-name" value={plan.name} maxLength={30} onChange={(event) => patchPlan(plan.id, { name: event.target.value })} aria-label={`Nome do plano ${plan.id}`} />
          <span className="cb-badge">{counts[plan.id] ?? 0} conta(s)</span>
        </header>
        <input className="dx-input dx-input-sm" value={plan.tagline} maxLength={120} placeholder="Frase curta" onChange={(event) => patchPlan(plan.id, { tagline: event.target.value })} aria-label={`Descrição do plano ${plan.name}`} />
        <div className="cb-plan-prices">
          <label className="dx-field"><span className="dx-label">Mensal ({draft.currency})</span><input className="dx-input dx-input-sm" inputMode="decimal" value={plan.priceMonthly ?? ''} placeholder="Sob consulta" onChange={(event) => patchPlan(plan.id, { priceMonthly: numberOrNull(event.target.value) })} aria-label={`Preço mensal ${plan.name}`} /></label>
          <label className="dx-field"><span className="dx-label">Anual ({draft.currency})</span><input className="dx-input dx-input-sm" inputMode="decimal" value={plan.priceYearly ?? ''} placeholder="Sob consulta" onChange={(event) => patchPlan(plan.id, { priceYearly: numberOrNull(event.target.value) })} aria-label={`Preço anual ${plan.name}`} /></label>
        </div>
        <small className="cb-note">Pré-visualização: {plan.priceMonthly === null ? 'Sob consulta' : `${money(plan.priceMonthly, draft.currency)}/mês`} · {plan.priceYearly === null ? 'Sob consulta' : `${money(plan.priceYearly, draft.currency)}/ano`}. Vazio = «Sob consulta».</small>
        <div className="cb-plan-toggles">
          <label className="cb-switch"><input type="checkbox" checked={plan.showOnLanding} onChange={(event) => patchPlan(plan.id, { showOnLanding: event.target.checked })} aria-label={`Mostrar ${plan.name} na página inicial`} /> Cartão visível na página inicial</label>
          <label className="cb-switch"><input type="radio" name="highlighted-plan" checked={plan.highlighted} onChange={() => patchPlan(plan.id, { highlighted: true })} aria-label={`Destacar ${plan.name}`} /> Destacado («Recomendado»)</label>
          {plan.highlighted && <button type="button" className="cb-link" onClick={() => patchPlan(plan.id, { highlighted: false })}>Remover destaque</button>}
        </div>
        <label className="dx-field"><span className="dx-label">Texto do botão</span><input className="dx-input dx-input-sm" value={plan.ctaLabel} maxLength={40} onChange={(event) => patchPlan(plan.id, { ctaLabel: event.target.value })} aria-label={`Texto do botão ${plan.name}`} /></label>
        <fieldset className="cb-plan-features"><legend>Funcionalidades</legend>
          {FEATURES.map((feature) => <label key={feature.key} title={feature.description}><input type="checkbox" checked={plan.features[feature.key]} onChange={(event) => setFeature(plan.id, feature.key, event.target.checked)} aria-label={`${feature.label} no plano ${plan.name}`} /> {feature.label}</label>)}
        </fieldset>
        <fieldset className="cb-plan-limits"><legend>Limites (vazio = ilimitado)</legend>
          {LIMIT_KEYS.map((key) => <label key={key} className="dx-field"><span className="dx-label">{LIMIT_LABEL[key]}</span>
            <input className="dx-input dx-input-sm" inputMode="numeric" value={plan.limits[key] ?? ''} placeholder="∞" onChange={(event) => setLimit(plan.id, key, event.target.value.trim() === '' ? null : Math.max(0, Math.floor(Number(event.target.value) || 0)))} aria-label={`${LIMIT_LABEL[key]} no plano ${plan.name}`} />
          </label>)}
        </fieldset>
        <label className="dx-field"><span className="dx-label">Linhas extra do cartão (uma por linha)</span>
          <textarea className="dx-input" rows={3} value={extrasText[plan.id] ?? plan.extras.join('\n')} onChange={(event) => { setExtrasText({ ...extrasText, [plan.id]: event.target.value }); patchPlan(plan.id, { extras: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 8) }) }} aria-label={`Linhas extra do plano ${plan.name}`} />
        </label>
        <footer className="cb-actions">
          <button className="dx-btn dx-btn-ghost dx-btn-sm" disabled={index === 0} onClick={() => move(plan.id, -1)} aria-label={`Mover ${plan.name} para a esquerda`}>←</button>
          <button className="dx-btn dx-btn-ghost dx-btn-sm" disabled={index === plans.length - 1} onClick={() => move(plan.id, 1)} aria-label={`Mover ${plan.name} para a direita`}>→</button>
        </footer>
      </article>)}
    </div>

    <div className="cb-save-bar">
      {problem && <span className="cb-note is-error" role="alert">{problem}</span>}
      {!problem && dirty && <span className="cb-note">Alterações por guardar.</span>}
      <button className="dx-btn dx-btn-secondary" disabled={busy || !dirty} onClick={() => { setDraft(clone(stored)); setExtrasText({}) }}>Descartar</button>
      <button className="dx-btn dx-btn-secondary" disabled={busy} onClick={() => { setDraft(clone(DEFAULT_PRICING)); setExtrasText({}) }} title="Carrega os valores de fábrica no rascunho (é preciso guardar)">Repor valores de fábrica</button>
      <button className="dx-btn dx-btn-primary" disabled={busy || !dirty || !!problem} onClick={() => void save()}>Guardar planos</button>
    </div>

    <div className="dx-admin-section"><h2>Pedidos de plano</h2>
      <Select className="dx-input dx-input-sm" value={requestFilter} onChange={(event) => setRequestFilter(event.target.value as 'pending' | 'all')} aria-label="Filtrar pedidos">
        <option value="pending">Pendentes</option><option value="all">Todos</option>
      </Select>
    </div>
    <div className="cb-plan-requests">
      {shownRequests.length === 0 && <div className="dx-admin-empty">{requestFilter === 'pending' ? 'Sem pedidos pendentes.' : 'Ainda não houve pedidos de plano.'}</div>}
      {shownRequests.map((request) => <article key={request.id} className="cb-plan-request" data-request={request.id}>
        <div><strong>{request.userName ?? request.userEmail ?? request.userId}</strong> <small>{request.userEmail}</small> <span className={`cb-badge ${request.status === 'pending' ? 'is-warn' : ''}`}>{STATUS[request.status]}</span></div>
        <div>Pede <strong>{planById(stored, request.plan).name}</strong> ({request.period === 'yearly' ? 'anual' : 'mensal'}) · {money(request.period === 'yearly' ? planById(stored, request.plan).priceYearly : planById(stored, request.plan).priceMonthly, stored.currency)} · {new Date(request.createdAt).toLocaleString('pt-PT')}</div>
        {request.message && <blockquote>{request.message}</blockquote>}
        {request.decisionNote && <small className="cb-note">Nota: {request.decisionNote}</small>}
        {request.status === 'pending' && <div className="cb-actions">
          <input className="dx-input dx-input-sm" placeholder="Nota (opcional)…" maxLength={300} value={notes[request.id] ?? ''} onChange={(event) => setNotes({ ...notes, [request.id]: event.target.value })} aria-label="Nota da decisão" />
          <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy} onClick={() => void decide(request, 'approve')}>Aprovar</button>
          <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={busy} onClick={() => void decide(request, 'reject')}>Recusar</button>
        </div>}
      </article>)}
    </div>
  </>
}
