import { IconCheck, IconLock, IconCommands, IconGraduation, IconStar } from '../ui/icons'
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

  const pct = limit ? Math.min(100, Math.round((ownedProjects / limit) * 100)) : 0
  const isNearLimit = limit !== null && ownedProjects >= limit * 0.8
  const isAtLimit = limit !== null && ownedProjects >= limit

  return <section className="dx-plan-card" aria-label="O seu plano" data-plan={info.plan}>
    <div className="dx-plan-main">
      <div className="flex items-center gap-2">
        <span className="dx-over text-slate-500 font-medium">O seu plano</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${info.plan === 'empresa' ? 'bg-amber-100 text-amber-800 border border-amber-300' : info.plan === 'escola' ? 'bg-purple-100 text-purple-800 border border-purple-300' : info.plan === 'pro' ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-slate-100 text-slate-700 border border-slate-300'}`}>
          {info.plan === 'empresa' ? <><IconStar size={10} />Empresa</> : info.plan === 'escola' ? <><IconGraduation size={11} />Escola</> : info.plan === 'pro' ? <><IconCommands size={10} />Profissional</> : 'Gratuito'}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        <strong className="text-xl text-slate-900 font-extrabold">{plan.name}</strong>
        {info.planExpiresAt && !expired && (
          <span className="text-xs text-slate-500">
            · Válido até {new Date(info.planExpiresAt).toLocaleDateString('pt-PT')}
          </span>
        )}
      </div>

      {/* Barra de progresso do limite de projetos */}
      <div className="py-1">
        <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
          <span className="font-medium">
            {limit === null ? (
              <span>Projetos da sua autoria: <b>{ownedProjects}</b> (ilimitados)</span>
            ) : (
              <span>Projetos: <b>{ownedProjects}</b> de <b>{limit}</b> utilizados ({pct}%)</span>
            )}
          </span>
          <span className="text-slate-500">
            {plan.limits.collaborators === null ? 'Colaboradores ilimitados' : `${LIMIT_LABEL.collaborators}: ${plan.limits.collaborators}`}
          </span>
        </div>
        {limit !== null && (
          <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isAtLimit ? 'bg-rose-500' : isNearLimit ? 'bg-amber-500' : 'bg-brand-600'}`}
              style={{ width: `${Math.max(4, pct)}%` }}
            />
          </div>
        )}
      </div>

      {expired && <span className="dx-plan-warn">O período do plano {planById(pricing, info.assigned).name} terminou: está no plano {plan.name}.</span>}
      {limit !== null && ownedProjects >= limit && <span className="dx-plan-warn text-rose-600 font-semibold text-xs">Atingiu o limite de projetos do plano.</span>}

      {/* Lista de funcionalidades como chips modernos */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {FEATURES.map((feature) => {
          const on = !!plan.features[feature.key]
          return (
            <span
              key={feature.key}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${on ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
              title={`${feature.description} — ${on ? 'Incluído no plano' : 'Não incluído no plano'}`}
              data-feature={feature.key}
              data-enabled={on}
            >
              <span className="inline-flex" aria-hidden="true">{on ? <IconCheck size={10} /> : <IconLock size={9} />}</span>
              <span className="sr-only">{on ? 'Incluído: ' : 'Não incluído: '}</span>
              <span>{feature.label}</span>
            </span>
          )
        })}
      </div>
    </div>
    <div className="dx-plan-side">
      {info.pending
        ? <>
          <span className="dx-plan-pending">Pedido pendente: {planById(pricing, info.pending.plan).name} ({info.pending.period === 'yearly' ? 'anual' : 'mensal'})</span>
          <button className="dx-btn dx-btn-ghost dx-btn-sm" disabled={busy} onClick={() => void cancel()}>Cancelar pedido</button>
        </>
        : options.length > 0 && <button className="dx-btn dx-btn-primary dx-btn-sm shadow-sm" onClick={() => { setChoice((current) => ({ ...current, plan: options.find((option) => option.highlighted)?.id ?? options[0].id })); setOpen(!open) }} aria-expanded={open}><IconCommands size={12} />Mudar de plano</button>}
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
