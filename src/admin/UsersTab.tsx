import Select from '../ui/Select'
import { useMemo, useState } from 'react'
import { uiConfirm } from '../ui/dialogs'
import { activeAccountBackend } from '../auth/accountApi'
import { formatDate } from '../contrib/ContribParts'
import { adminApi } from './adminApi'
import { EMAIL_PATTERN, generatePassword, passwordProblem, type AdminUser, type PlanRequest, type Role } from './adminTypes'
import RowMenu, { MenuItem } from './RowMenu'
import { usePlanStore } from '../saas/usePlan'
import { effectivePlanId, planById, type PlanId } from '../saas/platformCore.mjs'

type Props = {
  users: AdminUser[]
  planRequests?: PlanRequest[]
  currentUserId: string
  onChanged: (message: string) => Promise<void> | void
  onError: (message: string) => void
  onOpenLogs: (actor: string) => void
}

const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', user: 'Utilizador' }
const fail = (value: unknown) => value instanceof Error ? value.message : 'Falha na operação'

const PERIOD_LABEL = { monthly: 'mensal', yearly: 'anual' } as const
const dateInput = (iso?: string | null) => iso ? iso.slice(0, 10) : ''

/**
 * Gestão de contas (ADMIN-USERS-01): criar, editar, bloquear/desbloquear, plano e fim do
 * período, nota interna, repor palavra-passe, terminar sessões, eliminar, pedidos de plano
 * e ações em lote.
 */
export default function UsersTab({ users, planRequests = [], currentUserId, onChanged, onError, onOpenLogs }: Props) {
  const backend = activeAccountBackend()
  const serverMode = backend === 'server'
  /** Supabase: plano, nome e bloqueio vivem em `profiles`. */
  const profileMode = serverMode || backend === 'supabase'
  const pricing = usePlanStore((s) => s.pricing)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')
  const [stateFilter, setStateFilter] = useState<'all' | 'active' | 'disabled'>('all')
  const [planFilter, setPlanFilter] = useState<'all' | PlanId | 'expired'>('all')
  const [sort, setSort] = useState<'name' | 'recent' | 'lastLogin' | 'projects'>('name')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [bulkPlan, setBulkPlan] = useState<PlanId | ''>('')
  const [planEdit, setPlanEdit] = useState<{ id: string; plan: PlanId; until: string; note: string } | null>(null)
  const [details, setDetails] = useState<string | null>(null)
  const [decision, setDecision] = useState<{ id: string; note: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'user' as Role, password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null)
  const [editing, setEditing] = useState<{ id: string; name: string; role: Role } | null>(null)
  const [resetting, setResetting] = useState<{ id: string; password: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const planOfUser = (user: AdminUser) => user.role === 'admin' ? null : effectivePlanId(user, pricing)
  const expired = (user: AdminUser) => user.role !== 'admin' && !!user.planExpiresAt && Date.parse(user.planExpiresAt) < Date.now()
  const visible = useMemo(() => users.filter((user) => (roleFilter === 'all' || user.role === roleFilter)
    && (stateFilter === 'all' || (stateFilter === 'active') === user.active)
    && (planFilter === 'all' || (planFilter === 'expired' ? expired(user) : user.role !== 'admin' && planOfUser(user) === planFilter))
    && `${user.name} ${user.email} ${user.adminNote ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'recent' ? (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      : sort === 'lastLogin' ? (b.lastLogin ?? '').localeCompare(a.lastLogin ?? '')
        : sort === 'projects' ? b.projects - a.projects || a.name.localeCompare(b.name, 'pt-PT')
          : a.name.localeCompare(b.name, 'pt-PT')), [users, query, roleFilter, stateFilter, planFilter, sort, pricing])
  const planCounts = useMemo(() => Object.fromEntries(pricing.plans.map((plan) => [plan.id, users.filter((user) => planOfUser(user) === plan.id).length])), [users, pricing])
  const pendingRequests = planRequests.filter((request) => request.status === 'pending')
  const selectable = (user: AdminUser) => user.id !== currentUserId && user.role !== 'admin'
  const selectedUsers = visible.filter((user) => selected.has(user.id) && selectable(user))
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })

  async function bulk(label: string, patch: Parameters<typeof adminApi.updateUser>[1]) {
    setBusy(true)
    let done = 0
    try {
      for (const user of selectedUsers) { await adminApi.updateUser(user.id, patch); done++ }
      setSelected(new Set()); setBulkPlan('')
      await onChanged(`${done} conta(s): ${label}.`)
    } catch (value) {
      onError(`${fail(value)}${done ? ` (${done} já aplicadas)` : ''}`)
      if (done) await onChanged(`${done} conta(s) alteradas antes do erro.`)
    } finally { setBusy(false) }
  }

  async function savePlan() {
    if (!planEdit) return
    const ok = await run(() => adminApi.updateUser(planEdit.id, { plan: planEdit.plan, planExpiresAt: planEdit.until ? new Date(`${planEdit.until}T23:59:59Z`).toISOString() : null, adminNote: planEdit.note }),
      `Plano atualizado para ${planById(pricing, planEdit.plan).name}.`)
    if (ok) setPlanEdit(null)
  }

  async function decide(request: PlanRequest, action: 'approve' | 'reject') {
    const note = decision?.id === request.id ? decision.note : ''
    const ok = await run(() => adminApi.decidePlanRequest(request.id, action, note), action === 'approve'
      ? `Pedido aprovado: ${request.userEmail ?? 'conta'} passa ao plano ${planById(pricing, request.plan).name}.`
      : `Pedido de ${request.userEmail ?? 'conta'} recusado.`)
    if (ok) setDecision(null)
  }

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    try { await action(); await onChanged(done); return true }
    catch (value) { onError(fail(value)); return false }
    finally { setBusy(false) }
  }

  const formProblem = useMemo(() => {
    if (form.name.trim().length < 2) return 'Indique o nome (mínimo 2 caracteres).'
    if (!EMAIL_PATTERN.test(form.email.trim())) return 'Indique um e-mail válido.'
    return passwordProblem(form.password)
  }, [form])

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (formProblem) return
    const ok = await run(() => adminApi.createUser({ ...form, name: form.name.trim(), email: form.email.trim().toLowerCase() }), `Conta ${form.email.trim().toLowerCase()} criada.`)
    if (ok) {
      setCredentials({ email: form.email.trim().toLowerCase(), password: form.password })
      setForm({ name: '', email: '', role: 'user', password: '' })
      setCreating(false)
      setShowPassword(false)
    }
  }

  async function remove(user: AdminUser) {
    if (!(await uiConfirm(`Eliminar a conta ${user.email}?`, {
      title: 'Eliminar utilizador',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      danger: true,
    }))) return
    setBusy(true)
    try {
      try { await adminApi.deleteUser(user.id) }
      catch (value) {
        // O servidor pede confirmação quando a conta ainda tem dados.
        if (/projeto\(s\)/.test(fail(value))) {
          if (!(await uiConfirm(`${fail(value)}\n\nEliminar também todos os dados desta conta? Esta ação não pode ser anulada.`, {
            title: 'Eliminar dados da conta',
            confirmLabel: 'Eliminar tudo',
            cancelLabel: 'Cancelar',
            danger: true,
          }))) return
          await adminApi.deleteUser(user.id, true)
        } else throw value
      }
      await onChanged(`Conta ${user.email} eliminada.`)
    } catch (value) { onError(fail(value)) }
    finally { setBusy(false) }
  }

  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text) } catch { onError('Não foi possível copiar. Selecione e copie manualmente.') } }
  const adminCount = users.filter((user) => user.role === 'admin' && user.active).length

  return <>
    <div className="dx-admin-section"><h2>Utilizadores</h2><span>{users.length} conta(s) · {adminCount} administrador(es) ativo(s) · {users.filter((user) => !user.active).length} bloqueada(s)</span></div>
    {backend === 'local' && <p className="cb-note cb-banner">Sem servidor, a aplicação só conhece as duas contas fixas: aqui pode mudar o plano, o fim do período e a nota interna da conta «User». Criar, bloquear e eliminar contas exige o servidor (Docker/SQLite) ou o Supabase.</p>}
    {backend === 'supabase' && <p className="cb-note cb-banner">Supabase: plano, nome, nota e bloqueio são guardados em <code>profiles</code> (requer a migração SaaS). Criar contas, repor palavras-passe e eliminar contas faz-se no painel do Supabase (Authentication).</p>}

    <div className="cb-plan-summary" aria-label="Contas por plano">
      {pricing.plans.map((plan) => <button key={plan.id} type="button" className={`cb-plan-pill ${planFilter === plan.id ? 'is-active' : ''}`} onClick={() => setPlanFilter(planFilter === plan.id ? 'all' : plan.id)}>
        <strong>{planCounts[plan.id] ?? 0}</strong><span>{plan.name}</span>
      </button>)}
      <button type="button" className={`cb-plan-pill ${planFilter === 'expired' ? 'is-active' : ''}`} onClick={() => setPlanFilter(planFilter === 'expired' ? 'all' : 'expired')}><strong>{users.filter(expired).length}</strong><span>Período expirado</span></button>
    </div>

    {pendingRequests.length > 0 && <section className="cb-plan-requests" aria-label="Pedidos de plano pendentes">
      <h3>Pedidos de plano pendentes <span className="cb-badge is-warn">{pendingRequests.length}</span></h3>
      <p className="cb-note">Não há pagamento integrado: aprove depois de confirmar o pagamento. A aprovação aplica o plano e o fim do período (1 mês ou 1 ano).</p>
      {pendingRequests.map((request) => <article key={request.id} className="cb-plan-request">
        <div><strong>{request.userName ?? request.userEmail ?? request.userId}</strong> <small>{request.userEmail}</small></div>
        <div>Pede <strong>{planById(pricing, request.plan).name}</strong> ({PERIOD_LABEL[request.period]}) · {formatDate(request.createdAt)}</div>
        {request.message && <blockquote>{request.message}</blockquote>}
        <div className="cb-actions">
          <input className="dx-input dx-input-sm" placeholder="Nota (opcional)…" maxLength={300} value={decision?.id === request.id ? decision.note : ''} onChange={(event) => setDecision({ id: request.id, note: event.target.value })} aria-label="Nota da decisão" />
          <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy} onClick={() => void decide(request, 'approve')}>Aprovar</button>
          <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={busy} onClick={() => void decide(request, 'reject')}>Recusar</button>
        </div>
      </article>)}
    </section>}

    {credentials && <div className="cb-credentials" role="status">
      <div><strong>Conta criada.</strong> Entregue estas credenciais ao utilizador — a palavra-passe não volta a ser mostrada.</div>
      <code>{credentials.email} · {credentials.password}</code>
      <div className="cb-actions">
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => void copy(`${credentials.email}\n${credentials.password}`)}>Copiar</button>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setCredentials(null)}>Fechar</button>
      </div>
    </div>}

    <div className="cb-filters cb-filters-users">
      <input className="dx-input" type="search" placeholder="Pesquisar nome, e-mail ou nota…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Pesquisar utilizadores" />
      <Select className="dx-input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)} aria-label="Filtrar por papel">
        <option value="all">Todos os papéis</option><option value="admin">Administradores</option><option value="user">Utilizadores</option>
      </Select>
      <Select className="dx-input" value={stateFilter} onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)} aria-label="Filtrar por estado">
        <option value="all">Todos os estados</option><option value="active">Ativas</option><option value="disabled">Bloqueadas</option>
      </Select>
      <Select className="dx-input" value={planFilter} onChange={(event) => setPlanFilter(event.target.value as typeof planFilter)} aria-label="Filtrar por plano">
        <option value="all">Todos os planos</option>
        {pricing.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        <option value="expired">Período expirado</option>
      </Select>
      <Select className="dx-input" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Ordenar utilizadores">
        <option value="name">Ordenar: nome</option><option value="recent">Ordenar: mais recentes</option><option value="lastLogin">Ordenar: último acesso</option><option value="projects">Ordenar: n.º de projetos</option>
      </Select>
      <button className="dx-btn dx-btn-primary" disabled={!serverMode} onClick={() => setCreating(!creating)}>{creating ? 'Cancelar' : '+ Nova conta'}</button>
    </div>

    {creating && <form className="cb-form cb-form-wide" onSubmit={(event) => void create(event)}>
      <div className="cb-grid-2">
        <label className="dx-field"><span className="dx-label">Nome</span><input className="dx-input" value={form.name} maxLength={60} autoFocus onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="dx-field"><span className="dx-label">E-mail</span><input className="dx-input" type="email" value={form.email} maxLength={254} autoComplete="off" onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label className="dx-field"><span className="dx-label">Papel</span>
          <Select className="dx-input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
            <option value="user">Utilizador (pode contribuir)</option><option value="admin">Administrador (gere tudo)</option>
          </Select>
        </label>
        <label className="dx-field"><span className="dx-label">Palavra-passe inicial</span>
          <span className="cb-inline">
            <input className="dx-input" type={showPassword ? 'text' : 'password'} value={form.password} autoComplete="new-password" onChange={(event) => setForm({ ...form, password: event.target.value })} />
            <button type="button" className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { setForm({ ...form, password: generatePassword() }); setShowPassword(true) }}>Gerar</button>
            <button type="button" className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button>
          </span>
        </label>
      </div>
      <p className={`cb-note ${formProblem && (form.name || form.email || form.password) ? 'is-error' : ''}`}>{formProblem && (form.name || form.email || form.password) ? formProblem : 'Mínimo 10 caracteres, com maiúsculas, minúsculas e números.'}</p>
      <div className="cb-actions"><button className="dx-btn dx-btn-primary" type="submit" disabled={busy || !!formProblem}>Criar conta</button></div>
    </form>}

    {selectedUsers.length > 0 && <div className="cb-bulk" role="group" aria-label="Ações em lote">
      <span>{selectedUsers.length} selecionada(s)</span>
      <Select className="dx-input dx-input-sm" value={bulkPlan} onChange={(event) => setBulkPlan(event.target.value as PlanId | '')} aria-label="Plano para as contas selecionadas">
        <option value="">Mudar plano para…</option>
        {pricing.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
      </Select>
      <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy || !bulkPlan} onClick={() => bulkPlan && void bulk(`plano ${planById(pricing, bulkPlan).name}`, { plan: bulkPlan })}>Aplicar plano</button>
      {profileMode && <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={busy || selectedUsers.some((user) => user.fixed)} title={selectedUsers.some((user) => user.fixed) ? 'Inclui uma conta fixa' : ''} onClick={() => void bulk('bloqueadas', { active: false })}>Bloquear</button>}
      {profileMode && <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={busy || selectedUsers.some((user) => user.fixed)} onClick={() => void bulk('desbloqueadas', { active: true })}>Desbloquear</button>}
      <button className="dx-btn dx-btn-ghost dx-btn-sm" onClick={() => setSelected(new Set())}>Limpar seleção</button>
    </div>}

    <div className="cb-users">
      {visible.length === 0 && <div className="dx-admin-empty">Nenhuma conta com este filtro.</div>}
      {visible.map((user) => {
        const self = user.id === currentUserId
        const locked = user.fixed || self
        const why = user.fixed ? 'Conta fixa: protegida' : self ? 'A sua própria conta' : ''
        const plan = planOfUser(user)
        return <article key={user.id} className={`cb-user ${user.active ? '' : 'is-disabled'}`} data-user={user.email}>
          <div className="cb-user-head">
            {selectable(user) && <label className="cb-select"><input type="checkbox" checked={selected.has(user.id)} onChange={() => toggle(user.id)} aria-label={`Selecionar ${user.email}`} /></label>}
            <span className="cb-avatar" aria-hidden>{user.name.slice(0, 1).toUpperCase()}</span>
            <div className="cb-user-id">
              <strong>{user.name}{self && <em> (você)</em>}</strong>
              <small>{user.email}</small>
            </div>
            <span className="cb-badges">
              <span className={`cb-badge ${user.role === 'admin' ? 'is-admin' : ''}`}>{ROLE_LABEL[user.role]}</span>
              {user.fixed && <span className="cb-badge">Conta fixa</span>}
              {!user.active && <span className="cb-badge is-off">Bloqueada</span>}
              {plan && <span className={`cb-badge is-plan is-plan-${plan}`}>Plano {planById(pricing, plan).name}</span>}
              {expired(user) && <span className="cb-badge is-warn">Período expirado ({planById(pricing, user.plan ?? 'free').name})</span>}
            </span>
          </div>
          <dl className="cb-user-meta">
            <div><dt>Projetos</dt><dd>{user.projects}</dd></div>
            <div><dt>Contribuições</dt><dd>{user.contributions}</dd></div>
            <div><dt>Sessões ativas</dt><dd>{user.sessions}</dd></div>
            <div><dt>Último acesso</dt><dd>{user.lastLogin ? formatDate(user.lastLogin) : '—'}</dd></div>
            <div><dt>Criada</dt><dd>{user.createdAt ? formatDate(user.createdAt) : '—'}</dd></div>
            {plan && <div><dt>Fim do período</dt><dd>{user.planExpiresAt ? formatDate(user.planExpiresAt) : 'Sem fim'}</dd></div>}
          </dl>
          {details === user.id && <div className="cb-user-details">
            <p><strong>Nota interna:</strong> {user.adminNote || '—'}</p>
            {plan && <p><strong>Limites do plano:</strong> {planById(pricing, plan).limits.projects ?? '∞'} projeto(s) · {planById(pricing, plan).limits.collaborators ?? '∞'} colaborador(es) por projeto</p>}
            {plan && user.projects > (planById(pricing, plan).limits.projects ?? Infinity) && <p className="cb-note is-error">Tem mais projetos do que o plano permite: os existentes continuam acessíveis, mas não pode criar novos.</p>}
            {planRequests.filter((request) => request.userId === user.id).slice(0, 5).map((request) => <p key={request.id} className="cb-note">Pedido {planById(pricing, request.plan).name} ({PERIOD_LABEL[request.period]}) · {formatDate(request.createdAt)} · {({ pending: 'pendente', approved: 'aprovado', rejected: 'recusado', cancelled: 'cancelado' } as const)[request.status]}</p>)}
          </div>}

          {planEdit?.id === user.id && <div className="cb-user-edit cb-plan-edit">
            <label className="dx-field"><span className="dx-label">Plano</span>
              <Select className="dx-input" value={planEdit.plan} onChange={(event) => setPlanEdit({ ...planEdit, plan: event.target.value as PlanId })} aria-label="Plano">
                {pricing.plans.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </Select>
            </label>
            <label className="dx-field"><span className="dx-label">Fim do período (vazio = sem fim)</span><input className="dx-input" type="date" value={planEdit.until} onChange={(event) => setPlanEdit({ ...planEdit, until: event.target.value })} aria-label="Fim do período" /></label>
            <label className="dx-field cb-grow"><span className="dx-label">Nota interna</span><input className="dx-input" value={planEdit.note} maxLength={500} placeholder="Ex.: fatura 2026/123, turma 12.º B…" onChange={(event) => setPlanEdit({ ...planEdit, note: event.target.value })} aria-label="Nota interna" /></label>
            <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy} onClick={() => void savePlan()}>Guardar plano</button>
            <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setPlanEdit(null)}>Cancelar</button>
          </div>}

          {editing?.id === user.id && <div className="cb-user-edit">
            <input className="dx-input" value={editing.name} maxLength={60} onChange={(event) => setEditing({ ...editing, name: event.target.value })} aria-label="Nome" />
            <Select className="dx-input" value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value as Role })} aria-label="Papel">
              <option value="user">Utilizador</option><option value="admin">Administrador</option>
            </Select>
            <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy || editing.name.trim().length < 2} onClick={() => void run(() => adminApi.updateUser(user.id, { name: editing.name.trim(), role: editing.role }), 'Conta atualizada.').then((ok) => ok && setEditing(null))}>Guardar</button>
            <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setEditing(null)}>Cancelar</button>
          </div>}

          {resetting?.id === user.id && <div className="cb-user-edit">
            <input className="dx-input" type="text" value={resetting.password} placeholder="Nova palavra-passe" autoComplete="off" onChange={(event) => setResetting({ ...resetting, password: event.target.value })} aria-label="Nova palavra-passe" />
            <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setResetting({ ...resetting, password: generatePassword() })}>Gerar</button>
            <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy || !!passwordProblem(resetting.password)} onClick={() => void run(() => adminApi.setPassword(user.id, resetting.password), 'Palavra-passe reposta; as sessões da conta foram terminadas.').then((ok) => { if (ok) { setCredentials({ email: user.email, password: resetting.password }); setResetting(null) } })}>Repor</button>
            <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setResetting(null)}>Cancelar</button>
            {resetting.password && passwordProblem(resetting.password) && <small className="cb-note is-error">{passwordProblem(resetting.password)}</small>}
          </div>}

          <div className="cb-actions cb-user-actions">
            {user.role !== 'admin' && <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={self || busy} title={self ? why : 'Plano, fim do período e nota interna'} onClick={() => setPlanEdit({ id: user.id, plan: (user.plan ?? 'free') as PlanId, until: dateInput(user.planExpiresAt), note: user.adminNote ?? '' })}>Plano…</button>}
            <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setDetails(details === user.id ? null : user.id)} aria-expanded={details === user.id}>{details === user.id ? 'Ocultar detalhes' : 'Detalhes'}</button>
            <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => onOpenLogs(user.email)}>Ver atividade</button>
            <RowMenu>{(close) => <>
              <MenuItem disabled={locked || !serverMode || busy} hint={why || (!serverMode ? 'Requer o servidor' : '')} onClick={() => { close(); setEditing({ id: user.id, name: user.name, role: user.role }) }}>Editar nome e papel</MenuItem>
              <MenuItem disabled={locked || !serverMode || busy} hint={why || (!serverMode ? 'Requer o servidor' : '')} onClick={() => { close(); setResetting({ id: user.id, password: '' }) }}>Repor palavra-passe</MenuItem>
              <MenuItem disabled={locked || !profileMode || busy} hint={why || (!profileMode ? 'Requer o servidor ou o Supabase' : 'Impede o login e termina as sessões')} onClick={() => {
                close()
                void (async () => {
                  if (user.active && !(await uiConfirm(`Bloquear a conta ${user.email}? A pessoa deixa de conseguir entrar e as sessões abertas terminam.`, { title: 'Bloquear utilizador', confirmLabel: 'Bloquear', cancelLabel: 'Cancelar', danger: true }))) return
                  await run(() => adminApi.updateUser(user.id, { active: !user.active }), user.active ? `Conta ${user.email} bloqueada.` : `Conta ${user.email} desbloqueada.`)
                })()
              }}>{user.active ? 'Bloquear conta' : 'Desbloquear conta'}</MenuItem>
              <MenuItem disabled={self || !serverMode || busy || user.sessions === 0} hint={self ? why : !serverMode ? 'Requer o servidor' : user.sessions === 0 ? 'Sem sessões ativas' : ''} onClick={() => { close(); void run(() => adminApi.revokeSessions(user.id), 'Sessões terminadas.') }}>Terminar sessões</MenuItem>
              <hr />
              <MenuItem danger disabled={locked || !serverMode || busy} hint={why || (!serverMode ? 'Requer o servidor' : '')} onClick={() => { close(); void remove(user) }}>Eliminar conta…</MenuItem>
            </>}</RowMenu>
          </div>
        </article>
      })}
    </div>
    <p className="cb-note">As duas contas fixas (administrador e utilizador de demonstração) são repostas no arranque do servidor: só o plano e a nota interna da conta «User» podem ser alterados. O administrador tem sempre acesso total, sem plano. O registo público continua desativado: só o administrador cria contas.</p>
  </>
}
