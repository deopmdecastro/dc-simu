import { useCallback, useEffect, useState } from 'react'
import Select from '../ui/Select'
import { accountApi } from '../auth/accountApi'
import type { PlanRequest } from '../admin/adminTypes'
import { PLAN_INTENT_KEY, formatPrice } from '../landing/LandingPricing'
import { FEATURES, LIMIT_LABEL, planById, type PlanId } from './platformCore.mjs'
import { usePlanStore } from './usePlan'

type AccountPlan = { plan: PlanId; assigned: PlanId; planExpiresAt: string | null; pending: PlanRequest | null; projects?: number }

function readIntent(): { plan: PlanId; period: 'monthly' | 'yearly' } | null {
  try {
    const raw = sessionStorage.getItem(PLAN_INTENT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

/**
 * SAAS-PLANS-01: cartão do plano no painel do utilizador. Mostra o plano em vigor,
 * o uso face aos limites e permite pedir outro plano (sem pagamento integrado).
 */
export default function AccountPlanCard({ ownedProjects }: { ownedProjects: number }) {
  const role = usePlanStore((s) => s.role)
  const pricing = usePlanStore((s) => s.pricing)
  const [info, setInfo] = useState<AccountPlan | null>(null)
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<{ plan: PlanId; period: 'monthly' | 'yearly'; message: string }>({ plan: 'pro', period: 'monthly', message: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await accountApi<AccountPlan>('/account/plan')
      setInfo(data)
      // Reflete aprovações feitas entretanto pelo administrador.
      usePlanStore.setState({ plan: data.plan })
    } catch { setInfo(null) }
  }, [])

  useEffect(() => { if (role === 'user') void refresh() }, [role, refresh])

  // Plano escolhido na página inicial: abre o pedido já preenchido.
  useEffect(() => {
    if (!info) return
    const intent = readIntent()
    if (!intent) return
    try { sessionStorage.removeItem(PLAN_INTENT_KEY) } catch { /* ignorar */ }
    if (intent.plan !== info.plan && !info.pending) { setChoice({ plan: intent.plan, period: intent.period, message: '' }); setOpen(true) }
  }, [info])

  if (role !== 'user' || !info) return null
  const plan = planById(pricing, info.plan)
  const limit = plan.limits.projects
  const expired = info.assigned !== info.plan
  const options = pricing.plans.filter((option) => option.id !== info.plan).sort((a, b) => a.order - b.order)
  const chosen = planById(pricing, choice.plan)

  async function send() {
    setBusy(true); setMessage(null)
    try {
      await accountApi('/account/plan-request', 'POST', choice)
      setOpen(false)
      setMessage({ kind: 'ok', text: `Pedido do plano ${chosen.name} enviado. O administrador confirma o pagamento e ativa o plano.` })
      await refresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível enviar o pedido.' })
    } finally { setBusy(false) }
  }

  async function cancel() {
    setBusy(true); setMessage(null)
    try {
      await accountApi('/account/plan-request', 'DELETE')
      setMessage({ kind: 'ok', text: 'Pedido cancelado.' })
      await refresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível cancelar.' })
    } finally { setBusy(false) }
  }

  return <section className="dx-plan-card" aria-label="O seu plano" data-plan={info.plan}>
    <div className="dx-plan-main">
      <span className="dx-over">O seu plano</span>
      <strong>{plan.name}</strong>
      <span className="dx-plan-meta">
        {limit === null ? `${ownedProjects} projeto(s) · ilimitado` : `${ownedProjects}/${limit} projeto(s)`}
        {' · '}{plan.limits.collaborators === null ? 'colaboradores ilimitados' : `${LIMIT_LABEL.collaborators}: ${plan.limits.collaborators}`}
        {info.planExpiresAt && !expired && ` · válido até ${new Date(info.planExpiresAt).toLocaleDateString('pt-PT')}`}
      </span>
      {expired && <span className="dx-plan-warn">O período do plano {planById(pricing, info.assigned).name} terminou: está no plano {plan.name}.</span>}
      {limit !== null && ownedProjects >= limit && <span className="dx-plan-warn">Atingiu o limite de projetos do plano.</span>}
      <span className="dx-plan-features">{FEATURES.map((feature) => <span key={feature.key} className={plan.features[feature.key] ? 'is-on' : 'is-off'} title={feature.description}>{plan.features[feature.key] ? '✓' : '—'} {feature.label}</span>)}</span>
    </div>
    <div className="dx-plan-side">
      {info.pending
        ? <>
          <span className="dx-plan-pending">Pedido pendente: {planById(pricing, info.pending.plan).name} ({info.pending.period === 'yearly' ? 'anual' : 'mensal'})</span>
          <button className="dx-btn dx-btn-ghost dx-btn-sm" disabled={busy} onClick={() => void cancel()}>Cancelar pedido</button>
        </>
        : options.length > 0 && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { setChoice((current) => ({ ...current, plan: options.find((option) => option.highlighted)?.id ?? options[0].id })); setOpen(!open) }} aria-expanded={open}>Mudar de plano</button>}
    </div>
    {open && !info.pending && <div className="dx-plan-request">
      <label><span>Plano</span>
        <Select className="dx-input" value={choice.plan} onChange={(event) => setChoice({ ...choice, plan: event.target.value as PlanId })} aria-label="Plano pretendido">
          {options.map((option) => <option key={option.id} value={option.id}>{option.name} · {formatPrice(option.priceMonthly, pricing.currency)}{option.priceMonthly ? '/mês' : ''}</option>)}
        </Select>
      </label>
      <label><span>Período</span>
        <Select className="dx-input" value={choice.period} onChange={(event) => setChoice({ ...choice, period: event.target.value as 'monthly' | 'yearly' })} aria-label="Período">
          <option value="monthly">Mensal · {formatPrice(chosen.priceMonthly, pricing.currency)}</option>
          <option value="yearly">Anual · {formatPrice(chosen.priceYearly, pricing.currency)}</option>
        </Select>
      </label>
      <label className="dx-plan-grow"><span>Mensagem (opcional)</span>
        <input className="dx-input" maxLength={500} value={choice.message} placeholder="Ex.: NIF para a fatura, turma, n.º de licenças…" onChange={(event) => setChoice({ ...choice, message: event.target.value })} aria-label="Mensagem para o administrador" />
      </label>
      <button className="dx-btn dx-btn-primary" disabled={busy} onClick={() => void send()}>Pedir plano {chosen.name}</button>
      <small>Sem pagamento online: o administrador contacta-o, confirma o pagamento e ativa o plano.</small>
    </div>}
    {message && <p className={`dx-plan-msg ${message.kind === 'error' ? 'is-error' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
  </section>
}
