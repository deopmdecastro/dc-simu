import { useMemo, useState } from 'react'
import { activeAccountBackend } from '../auth/accountApi'
import { formatDate } from '../contrib/ContribParts'
import { adminApi } from './adminApi'
import { EMAIL_PATTERN, generatePassword, passwordProblem, type AdminUser, type Role } from './adminTypes'

type Props = {
  users: AdminUser[]
  currentUserId: string
  onChanged: (message: string) => Promise<void> | void
  onError: (message: string) => void
  onOpenLogs: (actor: string) => void
}

const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', user: 'Utilizador' }
const fail = (value: unknown) => value instanceof Error ? value.message : 'Falha na operação'

/** Gestão de contas: criar, editar, ativar/desativar, repor palavra-passe, terminar sessões e eliminar. */
export default function UsersTab({ users, currentUserId, onChanged, onError, onOpenLogs }: Props) {
  const serverMode = activeAccountBackend() === 'server'
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')
  const [stateFilter, setStateFilter] = useState<'all' | 'active' | 'disabled'>('all')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'user' as Role, password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null)
  const [editing, setEditing] = useState<{ id: string; name: string; role: Role } | null>(null)
  const [resetting, setResetting] = useState<{ id: string; password: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const visible = useMemo(() => users.filter((user) => (roleFilter === 'all' || user.role === roleFilter)
    && (stateFilter === 'all' || (stateFilter === 'active') === user.active)
    && `${user.name} ${user.email}`.toLowerCase().includes(query.trim().toLowerCase())), [users, query, roleFilter, stateFilter])

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
    if (!confirm(`Eliminar a conta ${user.email}?`)) return
    setBusy(true)
    try {
      try { await adminApi.deleteUser(user.id) }
      catch (value) {
        // O servidor pede confirmação quando a conta ainda tem dados.
        if (/projeto\(s\)/.test(fail(value))) {
          if (!confirm(`${fail(value)}\n\nEliminar também todos os dados desta conta? Esta ação não pode ser anulada.`)) return
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
    <div className="dx-admin-section"><h2>Utilizadores</h2><span>{users.length} conta(s) · {adminCount} administrador(es) ativo(s)</span></div>
    {!serverMode && <p className="cb-note cb-banner">Sem servidor, a aplicação só conhece as duas contas fixas. Criar, editar e eliminar contas exige o servidor (Docker/SQLite).</p>}

    {credentials && <div className="cb-credentials" role="status">
      <div><strong>Conta criada.</strong> Entregue estas credenciais ao utilizador — a palavra-passe não volta a ser mostrada.</div>
      <code>{credentials.email} · {credentials.password}</code>
      <div className="cb-actions">
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => void copy(`${credentials.email}\n${credentials.password}`)}>Copiar</button>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setCredentials(null)}>Fechar</button>
      </div>
    </div>}

    <div className="cb-filters cb-filters-users">
      <input className="dx-input" type="search" placeholder="Pesquisar nome ou e-mail…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Pesquisar utilizadores" />
      <select className="dx-input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)} aria-label="Filtrar por papel">
        <option value="all">Todos os papéis</option><option value="admin">Administradores</option><option value="user">Utilizadores</option>
      </select>
      <select className="dx-input" value={stateFilter} onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)} aria-label="Filtrar por estado">
        <option value="all">Todos os estados</option><option value="active">Ativas</option><option value="disabled">Desativadas</option>
      </select>
      <button className="dx-btn dx-btn-primary" disabled={!serverMode} onClick={() => setCreating(!creating)}>{creating ? 'Cancelar' : '+ Nova conta'}</button>
    </div>

    {creating && <form className="cb-form cb-form-wide" onSubmit={(event) => void create(event)}>
      <div className="cb-grid-2">
        <label className="dx-field"><span className="dx-label">Nome</span><input className="dx-input" value={form.name} maxLength={60} autoFocus onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="dx-field"><span className="dx-label">E-mail</span><input className="dx-input" type="email" value={form.email} maxLength={254} autoComplete="off" onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label className="dx-field"><span className="dx-label">Papel</span>
          <select className="dx-input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
            <option value="user">Utilizador (pode contribuir)</option><option value="admin">Administrador (gere tudo)</option>
          </select>
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

    <div className="cb-users">
      {visible.length === 0 && <div className="dx-admin-empty">Nenhuma conta com este filtro.</div>}
      {visible.map((user) => {
        const self = user.id === currentUserId
        const locked = user.fixed || self
        const why = user.fixed ? 'Conta fixa: protegida' : self ? 'A sua própria conta' : ''
        return <article key={user.id} className={`cb-user ${user.active ? '' : 'is-disabled'}`}>
          <div className="cb-user-head">
            <span className="cb-avatar" aria-hidden>{user.name.slice(0, 1).toUpperCase()}</span>
            <div className="cb-user-id">
              <strong>{user.name}{self && <em> (você)</em>}</strong>
              <small>{user.email}</small>
            </div>
            <span className="cb-badges">
              <span className={`cb-badge ${user.role === 'admin' ? 'is-admin' : ''}`}>{ROLE_LABEL[user.role]}</span>
              {user.fixed && <span className="cb-badge">Conta fixa</span>}
              {!user.active && <span className="cb-badge is-off">Desativada</span>}
            </span>
          </div>
          <dl className="cb-user-meta">
            <div><dt>Projetos</dt><dd>{user.projects}</dd></div>
            <div><dt>Contribuições</dt><dd>{user.contributions}</dd></div>
            <div><dt>Sessões ativas</dt><dd>{user.sessions}</dd></div>
            <div><dt>Último acesso</dt><dd>{user.lastLogin ? formatDate(user.lastLogin) : '—'}</dd></div>
            <div><dt>Criada</dt><dd>{user.createdAt ? formatDate(user.createdAt) : '—'}</dd></div>
          </dl>

          {editing?.id === user.id && <div className="cb-user-edit">
            <input className="dx-input" value={editing.name} maxLength={60} onChange={(event) => setEditing({ ...editing, name: event.target.value })} aria-label="Nome" />
            <select className="dx-input" value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value as Role })} aria-label="Papel">
              <option value="user">Utilizador</option><option value="admin">Administrador</option>
            </select>
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
            <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={locked || !serverMode || busy} title={why} onClick={() => setEditing({ id: user.id, name: user.name, role: user.role })}>Editar</button>
            <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={locked || !serverMode || busy} title={why} onClick={() => setResetting({ id: user.id, password: '' })}>Repor palavra-passe</button>
            <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={locked || !serverMode || busy} title={why} onClick={() => void run(() => adminApi.updateUser(user.id, { active: !user.active }), user.active ? `Conta ${user.email} desativada.` : `Conta ${user.email} ativada.`)}>{user.active ? 'Desativar' : 'Ativar'}</button>
            <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={self || !serverMode || busy || user.sessions === 0} title={self ? why : user.sessions ? '' : 'Sem sessões ativas'} onClick={() => void run(() => adminApi.revokeSessions(user.id), 'Sessões terminadas.')}>Terminar sessões</button>
            <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => onOpenLogs(user.email)}>Ver atividade</button>
            <button className="dx-btn dx-btn-danger dx-btn-sm" disabled={locked || !serverMode || busy} title={why} onClick={() => void remove(user)}>Eliminar</button>
          </div>
        </article>
      })}
    </div>
    <p className="cb-note">As duas contas fixas (administrador e utilizador de demonstração) são repostas no arranque do servidor e não podem ser alteradas. O registo público continua desativado: só o administrador cria contas.</p>
  </>
}
