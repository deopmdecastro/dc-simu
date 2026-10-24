import { type ProjectKind } from './project/kind'
import { normalizeProjectName, uniqueProjectName } from './project/name'
import { uiAlert, uiConfirm } from './ui/dialogs'
import { useCatalogStore } from './catalog/registry'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Logo from './ui/Brand'
import { IconSchematic, IconLadder, IconCube, IconProjects, IconLock, IconArrowRight } from './ui/icons'
import type { User, Project, Invite } from './dashboard/Dashboard'
import { canCaptureCover, captureCover, hasStoredCover, setStoredCover } from './three/coverCapture'
import { flowCoverDataUrl } from './dashboard/flowCover'
import { useSimStore } from './store/useSimStore'
import { accountApi } from './auth/accountApi'
import { useComponentSettings } from './admin/componentSettings'
import { useAppUpdates } from './utils/appUpdates'
import { askUpdateWithPendingChanges } from './components/UpdatePrompt'
import { saveAutosave } from './utils/persistence'
import AccountControls from './components/AccountControls'
import { AppTopbar, EditorTopbar } from './components/AppTopbar'
import { useLocation, useNavigate } from 'react-router-dom'
import { guardedDestination } from './routing/guards'
import { pageFromPath, projectIdFromPath, ROUTES, type AppPage } from './routing/routes'
import { IconArrowLeft, IconClose } from './ui/icons'
import { initSupabaseFromBackend } from './supabase/supabaseClient'

const App = lazy(() => import('./App'))
const Landing = lazy(() => import('./landing/Landing'))
const Dashboard = lazy(() => import('./dashboard/Dashboard'))
const AdminPanel = lazy(() => import('./admin/AdminPanel'))
const ContributorPanel = lazy(() => import('./contrib/ContributorPanel'))

type Open = { id: string; name: string; revision: number; role?: 'owner' | 'editor' }

/** Usa SQLite quando disponível e armazenamento local no deploy estático. */
async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  return accountApi<T>(url, method, body)
}

export default function Account() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const openRef = useRef<Open | null>(null)
  const page = pageFromPath(location.pathname)
  const loadingLabel = pageLoadingLabel(page)
  const setPage = useCallback((next: AppPage) => {
    const target = next === 'landing' ? ROUTES.home
      : next === 'login' ? ROUTES.login
        : next === 'dashboard' ? ROUTES.dashboard
          : next === 'admin' ? ROUTES.admin
            : next === 'contribute' ? ROUTES.contribute
              : openRef.current ? ROUTES.editor(openRef.current.id) : ROUTES.dashboard
    navigate(target)
  }, [navigate])
  const [projects, setProjects] = useState<Project[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState<Open | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })
  const editorDirty = useSimStore((state) => state.dirty)
  const diagnostics = useSimStore((state) => state.sim.diagnostics)
  const notificationErrors = diagnostics.filter((entry) => entry.level === 'error').length
  const notificationWarnings = diagnostics.filter((entry) => entry.level === 'warning').length

  const refresh = useCallback(async () => {
    try {
      const [projectList, invitationList] = await Promise.all([api<Project[]>('/projects'), api<Invite[]>('/invitations')])
      setProjects(projectList)
      setInvites(invitationList)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    initSupabaseFromBackend().finally(() => {
      api<{ user: User }>('/me')
        .then((response) => {
          setUser(response.user)
          if (page === 'landing' || page === 'login') setPage('dashboard')
          return refresh()
        })
        .catch(() => {})
        .finally(() => setReady(true))
    })
  }, [refresh])

  // Guardas de rota num único ponto: sessão e perfil de administrador.
  useEffect(() => {
    if (!ready) return
    const destination = guardedDestination(page, user)
    if (destination && destination !== location.pathname) navigate(destination, { replace: true })
  }, [ready, page, user, location.pathname, navigate])

  // Um URL de projeto pode ser aberto/atualizado diretamente sem perder compatibilidade.
  useEffect(() => {
    if (!ready || !user || page !== 'editor') return
    const projectId = projectIdFromPath(location.pathname)
    if (!projectId || openRef.current?.id === projectId) return
    void load(projectId)
  }, [ready, user?.id, page, location.pathname])

  // Componentes desativados pelo administrador: recarrega ao entrar e ao abrir o editor.
  useEffect(() => {
    if (user) void useComponentSettings.getState().load()
    else useComponentSettings.getState().reset()
  }, [user?.id, page === 'editor'])

  // Catálogo oficial de componentes 3D: regista os tipos antes de qualquer projeto abrir.
  useEffect(() => {
    if (user) void useCatalogStore.getState().load()
  }, [user?.id])

  // Limpa notificações automaticamente — feedback discreto, sem ruído permanente.
  useEffect(() => {
    if (!message || page === 'login') return
    const timer = window.setTimeout(() => setMessage(''), 5000)
    return () => window.clearTimeout(timer)
  }, [message, page])

  const error = (value: unknown) => {
    const message = value instanceof Error
      ? value.message
      : typeof value === 'string'
        ? value
        : 'Falha inesperada. Tente novamente.'
    setMessage(message === '[object Object]' ? 'Não foi possível concluir o pedido. Tente novamente.' : message)
  }

  /** Cover real: cena 3D no projeto completo; diagrama Ladder/GRAFCET nos outros tipos. */
  async function resolveCover(name?: string): Promise<string | undefined> {
    const s = useSimStore.getState()
    const flowKind = s.projectKind !== 'all'
    const scene = flowKind ? null : captureCover()
    if (scene) return scene
    try {
      const flow = await flowCoverDataUrl({ kind: s.projectKind, rungs: s.ladder.rungs, grafcet: s.grafcet, name })
      if (flow) { setStoredCover(flow); return flow }
    } catch { /* a miniatura é opcional */ }
    return captureCover() ?? undefined
  }

  async function persistOpenProject(showMessage: boolean) {
    const entry = openRef.current
    if (!entry) return
    const cover = await resolveCover(entry.name)
    const response = await api<{ revision: number }>('/projects/' + entry.id, 'PUT', {
      revision: entry.revision,
      content: { ...JSON.parse(useSimStore.getState().saveJSON()), cover },
    })
    const updated = { ...entry, revision: response.revision }
    openRef.current = updated
    setOpen(updated)
    useSimStore.setState({ dirty: false })
    if (showMessage) setMessage('Projeto guardado.')
  }

  const preserveBeforeUpdate = useCallback(async () => {
    const state = useSimStore.getState()
    if (!state.dirty) {
      ;(window as unknown as { __DCSIMU_ALLOW_UNLOAD__?: boolean }).__DCSIMU_ALLOW_UNLOAD__ = true
      return true
    }
    // Com trabalho por guardar, o utilizador decide: a atualização nunca o tira do editor sem perguntar.
    if ((await askUpdateWithPendingChanges()) === 'later') return false
    // Cópia adicional best-effort; a gravação principal continua a ser o
    // projeto aberto, preservando revisão, nome e acesso no dashboard.
    saveAutosave(state.saveJSON())
    try {
      if (openRef.current) {
        await persistOpenProject(false)
      }
      useSimStore.setState({ dirty: false })
      ;(window as unknown as { __DCSIMU_ALLOW_UNLOAD__?: boolean }).__DCSIMU_ALLOW_UNLOAD__ = true
      return true
    } catch (value) {
      error(value)
      await uiAlert('A nova versão está pronta, mas a atualização foi adiada porque não foi possível guardar o trabalho pendente.')
      return false
    }
  }, [])

  // Registo global: também atualiza quem ficou na landing ou no dashboard.
  useAppUpdates(preserveBeforeUpdate)

  async function authenticate(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const response = await api<{ user: User }>('/login', 'POST', form)
      setUser(response.user)
      setPage('dashboard')
      setForm({ email: '', password: '' })
      await refresh()
    } catch (value) {
      error(value)
    } finally {
      setBusy(false)
    }
  }

  async function create(name: string, kind: ProjectKind = 'all') {
    // Nomes não se repetem: se já existir, ganha o sufixo _coppy, _coppy2…
    const unique = uniqueProjectName(name, projects.map((project) => project.name)) || 'Projeto'
    useSimStore.getState().newProject(kind)
    const response = await api<Open>('/projects', 'POST', {
      name: unique,
      content: JSON.parse(useSimStore.getState().saveJSON()),
    })
    await load(response.id)
    if (unique !== normalizeProjectName(name)) setMessage(`Já existia um projeto com esse nome — criado como «${unique}».`)
  }

  /** Mudar o nome pelo contexto da barra do editor (clique no nome). */
  async function renameProject(rawName: string) {
    const entry = openRef.current
    if (!entry) return
    setMessage('')
    const existing = projects.filter((project) => project.id !== entry.id).map((project) => project.name)
    const name = uniqueProjectName(rawName, existing)
    if (!name || name === entry.name) return
    try {
      const response = await api<Open>('/projects/' + entry.id, 'PUT', { name })
      const updated = { ...entry, name: response.name, revision: response.revision }
      openRef.current = updated
      setOpen(updated)
      useSimStore.getState().setCurrentProjectName(response.name)
      setMessage(name === normalizeProjectName(rawName) ? 'Nome do projeto atualizado.' : `Já existia «${normalizeProjectName(rawName)}» — ficou «${response.name}».`)
      void refresh()
    } catch (value) {
      error(value)
    }
  }

  async function load(id: string) {
    setMessage('')
    try {
      const response = await api<Open & { content: unknown }>('/projects/' + id)
      useSimStore.getState().stop()
      await useCatalogStore.getState().ensureLoaded()
      useSimStore.getState().loadJSON(JSON.stringify(response.content))
      useSimStore.getState().setCurrentProjectName(response.name)
      const entry = { id: response.id, name: response.name, revision: response.revision, role: response.role }
      openRef.current = entry
      setOpen(entry)
      setPage('editor')
    } catch (value) {
      error(value)
    }
  }

  async function save() {
    try {
      await persistOpenProject(true)
    } catch (value) {
      error(value)
    }
  }

  async function leave() {
    if (useSimStore.getState().dirty && !(await uiConfirm('Existem alterações não guardadas. Voltar aos projetos?', {
      title: 'Voltar aos projetos',
      confirmLabel: 'Voltar',
      cancelLabel: 'Cancelar',
      danger: true,
    }))) return false
    // Projetos antigos sem miniatura: captura a cena 3D e guarda-a antes de sair.
    const snap = useSimStore.getState()
    const hasFlow = snap.projectKind !== 'all' ? snap.ladder.rungs.length > 0 || snap.grafcet.steps.length > 0 : false
    if (!snap.dirty && openRef.current && !hasStoredCover() && ((canCaptureCover() && snap.components.length) || hasFlow)) {
      try {
        await persistOpenProject(false)
      } catch { /* a miniatura é opcional */ }
    }
    useSimStore.getState().stop()
    openRef.current = null
    setOpen(null)
    setPage('dashboard')
    setMessage('')
    refresh().catch(error)
    return true
  }

  async function openInvitations() {
    if (page === 'editor' && !(await leave())) return
    else if (page !== 'dashboard') setPage('dashboard')
    window.setTimeout(() => document.getElementById('dashboard-invites')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }

  async function invite(id: string, email: string) {
    await api(`/projects/${id}/invitations`, 'POST', { email })
    setMessage('Convite enviado dentro da aplicação.')
  }

  async function reply(id: string, action: 'accept' | 'reject') {
    try {
      await api(`/invitations/${id}/${action}`, 'POST')
      await refresh()
    } catch (value) {
      error(value)
    }
  }

  async function remove(project: Project) {
    try {
      await api('/projects/' + project.id, 'DELETE')
      await refresh()
    } catch (value) {
      error(value)
    }
  }

  async function logout() {
    if (page === 'editor' && useSimStore.getState().dirty && !(await uiConfirm('Existem alterações não guardadas. Sair da conta?', {
      title: 'Sair da conta',
      confirmLabel: 'Sair',
      cancelLabel: 'Cancelar',
      danger: true,
    }))) return
    try {
      useSimStore.getState().stop()
      await api('/logout', 'POST')
      useSimStore.getState().newProject()
      setUser(null)
      setOpen(null)
      openRef.current = null
      setProjects([])
      setInvites([])
      setLoaded(false)
      setPage('landing')
      setMessage('')
    } catch (value) {
      error(value)
    }
  }

  const fetchMembers = useCallback(async (id: string) => (
    await api<{ members: { name: string; email: string }[] }>('/projects/' + id + '/members')
  ).members, [])

  useEffect(() => {
    if (page !== 'editor') return
    const handle = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [page])

  if (!ready) return <RouteLoading label={loadingLabel} />

  if (page === 'editor' && open) return <>
    <EditorTopbar projectName={open.name} dirty={editorDirty} message={message}
      onRename={open.role === 'editor' ? undefined : (name) => void renameProject(name)} actions={<>
      <button className="account-project-action" onClick={() => void leave()}><IconArrowLeft size={12} /> Projetos</button>
      <button className="account-project-action dx-bar-primary" onClick={() => void save()} title="Guardar (Ctrl+S)">Guardar</button>
      {user && <AccountControls user={user} invites={invites} context="editor" dirty={editorDirty}
        errors={notificationErrors} warnings={notificationWarnings} onProjects={() => void leave()}
        onOpenInvites={() => void openInvitations()} onLogout={() => void logout()} />}
    </>} />
    <div className="dx-editor-in" style={{ height: 'calc(100vh - 42px)' }}>
      <Suspense fallback={<RouteLoading label={loadingLabel} />}><App onBack={() => void leave()} /></Suspense>
    </div>
  </>

  if (page === 'landing') return <Suspense fallback={<RouteLoading label={loadingLabel} />}>
    <Landing onAccess={() => { setMessage(''); setPage('login') }} onLogin={() => { setMessage(''); setPage('login') }} />
  </Suspense>

  return <main className="account-shell dx">
    {page !== 'login' && user && <AppTopbar user={user} invites={invites}
      section={page === 'admin' ? 'admin' : page === 'contribute' ? 'contribute' : 'dashboard'}
      onProjects={() => setPage('dashboard')} onAdmin={() => setPage('admin')}
      onContribute={() => setPage('contribute')} onInvites={() => void openInvitations()}
      onLogout={() => void logout()} />}
    {page === 'login' && <AuthScreen form={form} setForm={setForm} busy={busy} message={message} clearMessage={() => setMessage('')} onSubmit={authenticate} onHome={() => { setMessage(''); setPage('landing') }} />}
    {page === 'admin' && user?.role === 'admin' && <Suspense fallback={<RouteLoading label={loadingLabel} />}><AdminPanel currentUser={user} invites={invites} onLogout={() => void logout()} onBack={() => setPage('dashboard')} /></Suspense>}
    {page === 'contribute' && user && <Suspense fallback={<RouteLoading label={loadingLabel} />}><ContributorPanel user={user} onBack={() => setPage('dashboard')} /></Suspense>}
    {page === 'dashboard' && <Suspense fallback={<RouteLoading label={loadingLabel} />}><Dashboard user={user} projects={projects} invites={invites} loading={!loaded} onCreate={create} onOpen={load} onInvite={invite} onReply={reply} onDelete={remove} fetchMembers={fetchMembers} /></Suspense>}
    {message && page !== 'login' && <div className="dx-toast" role="status">{message}<button onClick={() => setMessage('')} aria-label="Fechar"><IconClose size={11} /></button></div>}
  </main>
}

function pageLoadingLabel(page: AppPage): string {
  switch (page) {
    case 'landing': return 'A carregar a página inicial…'
    case 'login': return 'A preparar o acesso…'
    case 'editor': return 'A carregar o editor…'
    case 'admin': return 'A carregar a administração…'
    case 'contribute': return 'A carregar a área de contribuição…'
    case 'dashboard': return 'A preparar os seus projetos…'
  }
}

function RouteLoading({ label }: { label: string }) {
  return <div className="dx" style={{ minHeight: '100%', display: 'grid', placeItems: 'center', background: 'var(--dx-bg)' }}>
    <div style={{ textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
      <Logo size={34} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--dx-ink-3)' }}>
        <span className="dx-spin" aria-hidden />{label}
      </span>
    </div>
  </div>
}

function AuthScreen({ form, setForm, busy, message, clearMessage, onSubmit, onHome }: {
  form: { email: string; password: string }
  setForm: (form: { email: string; password: string }) => void
  busy: boolean
  message: string
  clearMessage: () => void
  onSubmit: (event: React.FormEvent) => void
  onHome: () => void
}) {
  const [show, setShow] = useState(false)
  const canFocus = typeof window !== 'undefined' && window.matchMedia('(hover:hover)').matches
  return <div className="dx dx-auth">
    <aside className="dx-auth-side">
      <button className="dx-auth-logo" onClick={onHome} aria-label="Voltar ao início"><Logo /></button>
      <div className="dx-auth-pitch">
        <h2>Retome o trabalho<br /><em>onde o deixou.</em></h2>
        <p>O esquema, a lógica Ladder e o painel 3D ficam guardados localmente neste navegador.</p>
        <ul>
          <li style={{ '--i': 0 } as React.CSSProperties}><i aria-hidden><IconSchematic size={16} /></i>Esquema elétrico com bornes e cabos reais</li>
          <li style={{ '--i': 1 } as React.CSSProperties}><i aria-hidden><IconLadder size={16} /></i>Ladder com simulação do scan do PLC</li>
          <li style={{ '--i': 2 } as React.CSSProperties}><i aria-hidden><IconCube size={16} /></i>Visualização 3D sincronizada com o projeto</li>
          <li style={{ '--i': 3 } as React.CSSProperties}><i aria-hidden><IconProjects size={16} /></i>Partilha local entre as duas contas autorizadas</li>
        </ul>
      </div>
      <div className="dx-auth-status"><span className="dx-auth-run"><IconLock size={14} />Funciona sem servidor. Os projetos ficam neste dispositivo.</span></div>
    </aside>
    <section className="dx-auth-main"><div className="dx-auth-panel">
      <div className="dx-auth-mobile">
        <button onClick={onHome} aria-label="Voltar ao início"><Logo /></button>
        <button onClick={onHome}><IconArrowLeft size={12} /> Início</button>
      </div>
      <button className="dx-auth-back" onClick={onHome}><IconArrowLeft size={12} /> Voltar ao início</button>
      <span className="dx-over"><i />A sua área de trabalho</span>
      <h1>Bem-vindo de volta</h1>
      <p className="dx-auth-sub">Entre com uma das duas contas autorizadas.</p>
      {message && <div className="dx-alert" role="alert"><span>{message}</span><button onClick={clearMessage} aria-label="Fechar aviso"><IconClose size={11} /></button></div>}
      <form onSubmit={onSubmit} noValidate={false}>
        <label className="dx-field"><span className="dx-label">Email</span><input className="dx-input" required type="email" autoFocus={canFocus} autoComplete="username" placeholder="conta autorizada" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label className="dx-field"><span className="dx-label">Palavra-passe</span>
          <div className="dx-auth-pw">
            <input className="dx-input" required type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="A sua palavra-passe" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            <button type="button" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Ocultar' : 'Mostrar'}</button>
          </div>
        </label>
        <button className="dx-btn dx-btn-primary dx-btn-lg" style={{ width: '100%' }} disabled={busy}>{busy ? <><span className="dx-spin" aria-hidden />Aguarde…</> : <>Entrar<IconArrowRight size={16} className="dx-arrow" /></>}</button>
      </form>
      <p className="dx-auth-switch">O registo está desativado. O acesso é limitado às contas Admin e User definidas para o DC-SIMU.</p>
    </div></section>
  </div>
}
