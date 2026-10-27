import Select from '../ui/Select'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { uiConfirm } from '../ui/dialogs'
import { useLocation, useNavigate } from 'react-router-dom'
import { adminComponentIdFromPath, isAdminEditorPath, ROUTES } from '../routing/routes'
import type { Invite, User } from '../dashboard/Dashboard'
import AccountControls from '../components/AccountControls'
import { activeAccountBackend } from '../auth/accountApi'
import { useComponentSettings } from './componentSettings'
import { adminApi } from './adminApi'
import { actionLabel, type AdminProject, type AdminUser, type AuditEntry, type ComponentSetting, type PlanRequest } from './adminTypes'
import PlansTab from './PlansTab'
import { usePlanStore } from '../saas/usePlan'
import ComponentsTab from './ComponentsTab'
import CatalogTab from './editor3d/CatalogTab'
import NewComponentDialog from './editor3d/NewComponentDialog'
import LogsTab from './LogsTab'
import SystemTab from './SystemTab'
import UsersTab from './UsersTab'
import { contribApi } from '../contrib/contribApi'
import { COMPONENT_OPTIONS, ContributionRow, formatBytes, formatDate } from '../contrib/ContribParts'
import { KIND_LABEL, STATUS_LABEL, type Contribution, type ContributionKind, type ContributionStatus, type ContribStats } from '../contrib/types'
import { IconArrowLeft, IconArrowRight, IconCheck, IconChevronDown, IconClose, IconCube, IconFileUpload, IconGrid, IconLayers, IconMonitor, IconOrganize, IconProjects, IconTag, IconTools, IconUser } from '../ui/icons'
import { ToolMenu, useNarrowMenu, type ToolMenuSection } from '../ui/toolbarKit'

type Tab = 'overview' | 'contributions' | 'components' | 'library3d' | 'projects' | 'users' | 'plans' | 'logs' | 'system'

/** Painel de gestão do administrador: resumo, revisão de contribuições, projetos e contas. */
export default function AdminPanel({ onBack, currentUser, initialTab = 'overview', invites = [], onLogout }: { onBack: () => void; currentUser: User; initialTab?: Tab; invites?: Invite[]; onLogout?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const routeEditor = isAdminEditorPath(location.pathname)
  const routeComponentId = adminComponentIdFromPath(location.pathname)
  const [tab, setTab] = useState<Tab>(routeEditor ? 'library3d' : initialTab)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [stats, setStats] = useState<ContribStats | null>(null)
  const [settings, setSettings] = useState<ComponentSetting[]>([])
  const [recentLogs, setRecentLogs] = useState<AuditEntry[]>([])
  const [planRequests, setPlanRequests] = useState<PlanRequest[]>([])
  const [logActor, setLogActor] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | ContributionStatus>('pending')
  const [kindFilter, setKindFilter] = useState<'all' | ContributionKind>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating3D, setCreating3D] = useState(false)
  const [editorOpenId, setEditorOpenId] = useState<string | null>(routeComponentId)
  // Importante: limpar apenas o pedido de abertura. Navegar aqui criava um
  // ping-pong com o editor (que repõe /admin/editor/<id>/<nome>): dezenas de
  // pushState por segundo, que o Safari iOS bloqueia com SecurityError e
  // fecha o editor. Ver bug «o editor abre e fecha logo a seguir».
  const clearEditorOpen = useCallback(() => { setEditorOpenId(null) }, [])
  useEffect(() => {
    if (!routeEditor) return
    setTab('library3d')
    setEditorOpenId(routeComponentId)
  }, [routeEditor, routeComponentId])
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const reload = useCallback(async () => {
    setOverviewLoading(true)
    try {
      const [userList, projectList, contributionList, statistics, componentList, logs] = await Promise.all([
        adminApi.users(), adminApi.projects(), contribApi.list(), contribApi.stats(), adminApi.components(), adminApi.logs({ limit: 6 }),
      ])
      setUsers(userList); setProjects(projectList); setContributions(contributionList); setStats(statistics); setSettings(componentList); setRecentLogs(logs.items)
      // Planos e pedidos: falham de forma isolada (ex.: Supabase sem a migração SaaS).
      const [pricing, requests] = await Promise.all([adminApi.pricing().catch(() => null), adminApi.planRequests().catch(() => [] as PlanRequest[])])
      if (pricing) usePlanStore.setState({ pricing })
      setPlanRequests(requests)
      // O simulador aberto neste navegador reflete logo as alterações.
      void useComponentSettings.getState().load(currentUser)
      setError('')
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Falha na administração')
    } finally {
      setOverviewLoading(false)
    }
  }, [currentUser])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 5000); return () => window.clearTimeout(timer) }, [notice])

  const onError = useCallback((message: string) => setError(message), [])
  const afterChange = useCallback(async (message: string) => { setNotice(message); setError(''); await reload() }, [reload])

  async function act(run: () => Promise<unknown>, done: string) {
    try { await run(); setNotice(done); setRejecting(null); setNote(''); await reload() }
    catch (value) { setError(value instanceof Error ? value.message : 'Falha na operação') }
  }
  const review = (item: Contribution, status: ContributionStatus, text = '') => act(() => contribApi.review(item.id, status, text), status === 'approved' ? `«${item.title}» aprovada.` : status === 'rejected' ? `«${item.title}» rejeitada.` : `«${item.title}» voltou à fila de revisão.`)
  const removeContribution = async (item: Contribution) => {
    if (await uiConfirm(`Eliminar definitivamente a contribuição «${item.title}»?`, { title: 'Eliminar contribuição', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true })) {
      void act(() => contribApi.remove(item.id), 'Contribuição eliminada.')
    }
  }
  const removeProject = async (project: AdminProject) => {
    if (await uiConfirm(`Eliminar permanentemente o projeto ${project.name}? Esta ação não pode ser anulada.`, { title: 'Eliminar projeto', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true })) {
      void act(() => adminApi.deleteProject(project.id), 'Projeto eliminado.')
    }
  }

  const visible = useMemo(() => contributions.filter((item) => (statusFilter === 'all' || item.status === statusFilter)
    && (kindFilter === 'all' || item.kind === kindFilter)
    && `${item.title} ${item.fileName} ${item.authorName} ${item.authorEmail} ${item.customName ?? ''} ${item.componentType ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())), [contributions, statusFilter, kindFilter, query])

  const coverage = useMemo(() => {
    const approved = contributions.filter((item) => item.status === 'approved')
    return COMPONENT_OPTIONS.map((option) => ({
      ...option,
      datasheets: approved.filter((item) => item.kind === 'datasheet' && item.componentType === option.type).length,
      models: approved.filter((item) => item.kind === 'model3d' && item.componentType === option.type).length,
    })).filter((entry) => entry.datasheets || entry.models)
  }, [contributions])

  const pendingCount = stats?.pending ?? 0
  const disabledCount = settings.filter((entry) => (entry.status ?? (entry.enabled ? 'active' : 'blocked')) === 'blocked').length
  const pendingPlans = planRequests.filter((request) => request.status === 'pending').length
  const backendMode = activeAccountBackend()
  const serverMode = backendMode === 'server'
  const databaseMode = serverMode || backendMode === 'supabase'
  type NavTab = { id: Tab; label: string; count?: number; attention?: boolean }
  const navGroups: Array<{ label: string; tabs: NavTab[] }> = [
    { label: 'Geral', tabs: [{ id: 'overview', label: 'Resumo' }] },
    { label: 'Conteúdo', tabs: [
      { id: 'contributions', label: 'Contribuições', count: pendingCount || undefined, attention: true },
      { id: 'components', label: 'Componentes', count: disabledCount || undefined },
      { id: 'library3d', label: 'Biblioteca 3D' },
    ] },
    { label: 'Gestão', tabs: [
      { id: 'projects', label: 'Projetos', count: projects.length },
      { id: 'users', label: 'Utilizadores', count: users.length },
      { id: 'plans', label: 'Planos e preços', count: pendingPlans || undefined, attention: true },
    ] },
    { label: 'Sistema', tabs: [{ id: 'logs', label: 'Registos' }, { id: 'system', label: 'Sistema' }] },
  ]
  const attention = [
    pendingCount > 0 && { key: 'contributions', text: `${pendingCount} ${pendingCount === 1 ? 'contribuição à espera de revisão' : 'contribuições à espera de revisão'}`, cta: 'Rever agora', run: () => { setStatusFilter('pending'); setTab('contributions') } },
    pendingPlans > 0 && { key: 'plans', text: `${pendingPlans} ${pendingPlans === 1 ? 'pedido de plano por decidir' : 'pedidos de plano por decidir'}`, cta: 'Ver pedidos', run: () => setTab('plans') },
    disabledCount > 0 && { key: 'components', text: `${disabledCount} ${disabledCount === 1 ? 'componente bloqueado' : 'componentes bloqueados'} na biblioteca`, cta: 'Gerir componentes', run: () => setTab('components') },
  ].filter((item): item is { key: string; text: string; cta: string; run: () => void } => !!item)
  const shownProjects = projects.filter((project) => `${project.name} ${project.owner}`.toLowerCase().includes(projectQuery.trim().toLowerCase()))
  /* Telemóvel: nove secções não cabem numa faixa que desliza sem ninguém dar por
     isso. Em vez disso, um botão com a secção atual abre a lista completa (folha
     inferior, ver ToolMenu) — o mesmo padrão dos editores. A partir de 721 px
     mantém-se a faixa horizontal e, na secretária, a navegação lateral. */
  const narrow = useNarrowMenu()
  const flatNav = navGroups.flatMap((group) => group.tabs.map((item) => ({ ...item, group: group.label })))
  const currentNav = flatNav.find((item) => item.id === tab) ?? flatNav[0]
  const NAV_ICON: Record<Tab, typeof IconGrid> = {
    overview: IconGrid, contributions: IconFileUpload, components: IconLayers, library3d: IconCube,
    projects: IconProjects, users: IconUser, plans: IconTag, logs: IconMonitor, system: IconTools,
  }
  const navMenu: ToolMenuSection[] = navGroups.map((group) => ({
    id: group.label,
    title: group.label,
    items: group.tabs.map((item) => {
      const Icon = NAV_ICON[item.id]
      return {
        id: item.id,
        label: item.label,
        icon: <Icon size={15} />,
        hint: item.count
          ? item.id === 'contributions' ? `${item.count} por revisão`
            : item.id === 'users' ? `${item.count} conta${item.count === 1 ? '' : 's'}`
              : item.id === 'plans' ? `${item.count} pedido${item.count === 1 ? '' : 's'} por decidir`
                : `${item.count} registado${item.count === 1 ? '' : 's'}`
          : undefined,
        pressed: tab === item.id,
        onSelect: () => setTab(item.id),
      }
    }),
  }))


  return <section className="dx dx-admin cb-panel adm">
    <header className="adm-head">
      <div className="adm-head-text">
        <h1>Administração.</h1>
        <p>Contribuições, contas, componentes, projetos e atividade do sistema.</p>
      </div>
      <div className="adm-head-side">
        <span className={`adm-env ${databaseMode ? 'is-server' : 'is-local'}`} title={serverMode ? 'Os dados estão guardados no servidor (SQLite).' : backendMode === 'supabase' ? 'Os dados estão guardados no Supabase (PostgreSQL).' : 'Os dados estão guardados apenas neste navegador.'}><i aria-hidden />{serverMode ? 'Servidor · SQLite' : backendMode === 'supabase' ? 'Supabase · PostgreSQL' : 'Modo local · só neste navegador'}</span>
        <div className="dx-admin-head-actions">
          <button className="dx-btn dx-btn-primary" onClick={() => setCreating3D(true)} title="Criar um componente no editor 3D">+ Novo componente 3D</button>
          <button className="dx-btn dx-btn-secondary" onClick={onBack}><IconArrowLeft size={12} /> Projetos</button>
        </div>
      </div>
    </header>
    {creating3D && <NewComponentDialog onCancel={() => setCreating3D(false)} onError={onError} onCreated={(id, name) => { setCreating3D(false); setNotice(`«${name}» criado como rascunho. Modele-o e publique quando estiver pronto.`); setEditorOpenId(id); setTab('library3d'); navigate(ROUTES.adminEditor(id, name)) }} />}

    <div className={`adm-shell ${tab === 'library3d' ? 'is-wide' : ''}`}>
    <nav className="adm-nav" aria-label="Secções da administração">
      {narrow
        ? <div className="adm-picker">
            <span className="adm-picker-label">{currentNav.group}</span>
            <ToolMenu
              label={`Secção: ${currentNav.label}`}
              title="Secções da administração"
              icon={<IconOrganize size={14} />}
              sections={navMenu}
              className="adm-picker-button"
              trigger={() => <>
                <span className="adm-picker-name">{currentNav.label}</span>
                {currentNav.count !== undefined && <b className={currentNav.attention ? 'is-attention' : ''}>{currentNav.count}</b>}
                <IconChevronDown size={12} />
              </>}
            />
          </div>
        : <div className="adm-tablist" role="tablist" aria-orientation="vertical" aria-label="Gestão do administrador">
        {navGroups.map((group) => <div key={group.label} className="adm-nav-group" role="presentation">
          <span className="adm-nav-label" role="presentation">{group.label}</span>
          {group.tabs.map((item) => { const Icon = NAV_ICON[item.id]; return <button key={item.id} role="tab" aria-selected={tab === item.id} className={`adm-tab ${tab === item.id ? 'is-active' : ''}`} onClick={() => setTab(item.id)}>
            <span className="adm-tab-label"><span className="adm-tab-icon" aria-hidden="true"><Icon size={14} /></span><span>{item.label}</span></span>
            {item.count !== undefined && <b className={item.attention ? 'is-attention' : ''} title={item.attention ? 'Por tratar' : undefined}>{item.count}</b>}
          </button>})}
        </div>)}
        </div>}
    </nav>
    <div className="adm-main">
    {error && <div className="dx-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Fechar"><IconClose size={11} /></button></div>}
    {notice && <div className="cb-toast adm-toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Fechar"><IconClose size={11} /></button></div>}

    {tab === 'overview' && <>
      <section className="adm-attn" aria-label="Pendências">
        {attention.length === 0
          ? <p className="adm-clear"><i aria-hidden />Sem pendências: não há nada à espera de revisão ou decisão.</p>
          : attention.map((item) => <div key={item.key} className="adm-attn-row">
            <i aria-hidden />
            <span>{item.text}</span>
            <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={item.run}>{item.cta}</button>
          </div>)}
      </section>
      <div className="adm-overview-label"><h2>Indicadores</h2><span>Resumo atual da administração</span></div>
      <div className="adm-tiles">
        <button type="button" className="adm-tile is-review" onClick={() => { setStatusFilter('pending'); setTab('contributions') }}><span className="adm-tile-icon"><IconFileUpload size={16} /></span><span>Em revisão</span><strong>{stats?.pending ?? '—'}</strong><small>contribuições</small><IconArrowRight className="adm-tile-arrow" size={13} aria-hidden="true" /></button>
        <button type="button" className="adm-tile is-approved" onClick={() => { setStatusFilter('approved'); setTab('contributions') }}><span className="adm-tile-icon"><IconCheck size={16} /></span><span>Aprovadas</span><strong>{stats?.approved ?? '—'}</strong><small>contribuições</small><IconArrowRight className="adm-tile-arrow" size={13} aria-hidden="true" /></button>
        <button type="button" className="adm-tile is-rejected" onClick={() => { setStatusFilter('rejected'); setTab('contributions') }}><span className="adm-tile-icon"><IconClose size={16} /></span><span>Rejeitadas</span><strong>{stats?.rejected ?? '—'}</strong><small>contribuições</small><IconArrowRight className="adm-tile-arrow" size={13} aria-hidden="true" /></button>
        <button type="button" className="adm-tile is-projects" onClick={() => setTab('projects')}><span className="adm-tile-icon"><IconProjects size={16} /></span><span>Projetos</span><strong>{overviewLoading ? '—' : projects.length}</strong><small>em todas as contas</small><IconArrowRight className="adm-tile-arrow" size={13} aria-hidden="true" /></button>
        <button type="button" className="adm-tile is-accounts" onClick={() => setTab('users')}><span className="adm-tile-icon"><IconUser size={16} /></span><span>Contas</span><strong>{overviewLoading ? '—' : users.length}</strong><small>{overviewLoading ? 'a carregar' : `${users.filter((entry) => entry.active).length} ativas`}</small><IconArrowRight className="adm-tile-arrow" size={13} aria-hidden="true" /></button>
        <button type="button" className="adm-tile is-storage" onClick={() => setTab('system')}><span className="adm-tile-icon"><IconLayers size={16} /></span><span>Armazenamento</span><strong>{stats ? formatBytes(stats.bytes) : '—'}</strong><small>{stats ? `${stats.datasheets} PDF · ${stats.models} GLB` : 'ficheiros'}</small><IconArrowRight className="adm-tile-arrow" size={13} aria-hidden="true" /></button>
      </div>
      <section className="adm-overview-shortcuts" aria-labelledby="adm-shortcuts-title">
        <div className="adm-overview-label"><h2 id="adm-shortcuts-title">Acesso rápido</h2><span>Abra as áreas de trabalho mais usadas</span></div>
        <div className="adm-shortcut-grid">
          <button type="button" className="adm-shortcut" onClick={() => { setStatusFilter('pending'); setTab('contributions') }}>
            <span className="adm-shortcut-icon"><IconFileUpload size={17} /></span>
            <span className="adm-shortcut-copy"><strong>Contribuições</strong><small>{pendingCount ? `${pendingCount} por rever` : 'Fila de contribuições'}</small></span>
            {pendingCount > 0 && <b className="adm-shortcut-count">{pendingCount}</b>}<IconArrowRight className="adm-shortcut-arrow" size={15} />
          </button>
          <button type="button" className="adm-shortcut" onClick={() => setTab('projects')}>
            <span className="adm-shortcut-icon"><IconProjects size={17} /></span>
            <span className="adm-shortcut-copy"><strong>Projetos</strong><small>Acompanhar quadros guardados</small></span>
            <IconArrowRight className="adm-shortcut-arrow" size={15} />
          </button>
          <button type="button" className="adm-shortcut" onClick={() => { setLogActor(''); setTab('logs') }}>
            <span className="adm-shortcut-icon"><IconMonitor size={17} /></span>
            <span className="adm-shortcut-copy"><strong>Registos do sistema</strong><small>Consultar atividade e alterações</small></span>
            <IconArrowRight className="adm-shortcut-arrow" size={15} />
          </button>
          <button type="button" className="adm-shortcut" onClick={() => setTab('library3d')}>
            <span className="adm-shortcut-icon"><IconCube size={17} /></span>
            <span className="adm-shortcut-copy"><strong>Biblioteca 3D</strong><small>Gerir modelos e componentes</small></span>
            <IconArrowRight className="adm-shortcut-arrow" size={15} />
          </button>
        </div>
      </section>
      <div className="adm-overview-content">
        <section className="adm-overview-panel adm-overview-activity">
          <div className="adm-overview-panel-head">
            <div><h2>Atividade recente</h2><p>Últimas alterações registadas no sistema</p></div>
            <button className="cb-link" onClick={() => { setLogActor(''); setTab('logs') }}>Ver todos <IconArrowRight size={13} /></button>
          </div>
          <div className="adm-activity-list">
            {overviewLoading && recentLogs.length === 0 && <div className="adm-overview-empty" role="status">A carregar atividade…</div>}
            {!overviewLoading && recentLogs.length === 0 && <div className="adm-overview-empty"><span>{error ? 'Não foi possível carregar a atividade.' : 'Ainda não há atividade registada.'}</span><button className="cb-link" onClick={error ? () => void reload() : () => { setLogActor(''); setTab('logs') }}>{error ? 'Tentar novamente' : 'Abrir registos'} <IconArrowRight size={13} /></button></div>}
            {recentLogs.map((entry) => <article key={entry.id} className="adm-activity-row">
              <span className="adm-activity-mark" aria-hidden="true" />
              <div className="adm-activity-copy"><strong>{actionLabel(entry.action)}</strong><span>{entry.actorName || entry.actorEmail || 'Sistema'}{entry.actorName && entry.actorEmail ? ` · ${entry.actorEmail}` : ''}</span>
                {entry.targetLabel && <small>{entry.targetLabel}</small>}
              </div>
              <time className="adm-activity-time" dateTime={entry.at}>{formatDate(entry.at)}</time>
            </article>)}
          </div>
        </section>
        <div className="adm-overview-side">
          <section className="adm-overview-panel">
            <div className="adm-overview-panel-head">
              <div><h2>Últimas contribuições</h2><p>{contributions.length} no total</p></div>
              <button className="cb-link" onClick={() => { setStatusFilter('all'); setTab('contributions') }}>Ver fila <IconArrowRight size={13} /></button>
            </div>
            <div className="adm-overview-list">
              {overviewLoading && contributions.length === 0 && <div className="adm-overview-empty" role="status">A carregar contribuições…</div>}
              {!overviewLoading && contributions.length === 0 && <div className="adm-overview-empty"><span>{error ? 'Não foi possível carregar as contribuições.' : 'Ainda não foram enviadas contribuições.'}</span><button className="cb-link" onClick={error ? () => void reload() : () => setTab('contributions')}>{error ? 'Tentar novamente' : 'Abrir contribuições'} <IconArrowRight size={13} /></button></div>}
              {contributions.slice(0, 4).map((item) => <div className="adm-overview-list-row" key={item.id}>
                <span><strong>{item.title}</strong><small>{KIND_LABEL[item.kind]} · {item.authorName} · {formatDate(item.updatedAt)}</small></span>
                <span className={`cb-status is-${item.status}`}>{STATUS_LABEL[item.status]}</span>
              </div>)}
            </div>
          </section>
          <section className="adm-overview-panel">
            <div className="adm-overview-panel-head">
              <div><h2>Cobertura da biblioteca</h2><p>Ficheiros aprovados por componente</p></div>
              <button className="cb-link" onClick={() => setTab('components')}>Componentes <IconArrowRight size={13} /></button>
            </div>
            <div className="adm-overview-list">
              {overviewLoading && coverage.length === 0 && <div className="adm-overview-empty" role="status">A carregar cobertura…</div>}
              {!overviewLoading && coverage.length === 0 && <div className="adm-overview-empty"><span>{error ? 'Não foi possível carregar a cobertura.' : 'A cobertura aparece quando houver ficheiros aprovados.'}</span><button className="cb-link" onClick={error ? () => void reload() : () => { setStatusFilter('approved'); setTab('contributions') }}>{error ? 'Tentar novamente' : 'Ver aprovadas'} <IconArrowRight size={13} /></button></div>}
              {coverage.slice(0, 4).map((entry) => <div className="adm-overview-list-row" key={entry.type}>
                <span><strong>{entry.label}</strong><small>{entry.group}</small></span>
                <span className="adm-coverage-count">{entry.datasheets} PDF <i aria-hidden="true">·</i> {entry.models} GLB</span>
              </div>)}
            </div>
          </section>
        </div>
      </div>
    </>}

    {tab === 'contributions' && <div className="cb-list">
      <div className="cb-filters">
        <input className="dx-input" type="search" placeholder="Pesquisar título, componente ou autor…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Pesquisar contribuições" />
        <Select className="dx-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filtrar por estado">
          <option value="all">Todos os estados</option>{(Object.keys(STATUS_LABEL) as ContributionStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
        </Select>
        <Select className="dx-input" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)} aria-label="Filtrar por tipo">
          <option value="all">Todos os tipos</option><option value="datasheet">Datasheets</option><option value="model3d">Modelos 3D</option>
        </Select>
      </div>
      {visible.length === 0 && <div className="dx-admin-empty">{contributions.length ? 'Nenhuma contribuição com este filtro.' : 'Ainda ninguém enviou contribuições.'}</div>}
      {visible.map((item) => <ContributionRow key={item.id} item={item} showAuthor expanded={openId === item.id} onToggle={() => setOpenId(openId === item.id ? null : item.id)} actions={<>
        {item.status !== 'approved' && <button type="button" className="dx-btn dx-btn-primary dx-btn-sm" onClick={() => void review(item, 'approved', rejecting === item.id ? note : '')}>Aprovar</button>}
        {item.status !== 'rejected' && <button type="button" className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { setRejecting(rejecting === item.id ? null : item.id); setNote('') }}>{rejecting === item.id ? 'Cancelar' : 'Rejeitar…'}</button>}
        {item.status !== 'pending' && <button type="button" className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => void review(item, 'pending')}>Repor em revisão</button>}
        <button type="button" className="dx-btn dx-btn-danger dx-btn-sm" onClick={() => removeContribution(item)}>Eliminar</button>
        {rejecting === item.id && <div className="cb-reject">
          <textarea className="dx-input" rows={2} maxLength={1000} value={note} autoFocus placeholder="Motivo da rejeição (visível para o contribuidor)…" onChange={(event) => setNote(event.target.value)} />
          <button type="button" className="dx-btn dx-btn-danger dx-btn-sm" disabled={!note.trim()} onClick={() => void review(item, 'rejected', note)}>Confirmar rejeição</button>
        </div>}
      </>} />)}
    </div>}

    {tab === 'components' && <ComponentsTab settings={settings} contributions={contributions} onChanged={afterChange} onError={onError} onOpenContributions={(type) => { setQuery(type); setStatusFilter('all'); setKindFilter('all'); setTab('contributions') }} />}

    {tab === 'library3d' && <CatalogTab account={<AccountControls user={currentUser} invites={invites} context="editor" onProjects={onBack} onLogout={onLogout ?? (() => undefined)} />} onNotice={setNotice} onError={onError} onCreate={() => setCreating3D(true)} openId={editorOpenId} onOpened={clearEditorOpen} />}

    {tab === 'projects' && <>
      <div className="dx-admin-section"><h2>Projetos</h2><span>{shownProjects.length}/{projects.length}</span></div>
      <input className="dx-input cb-search" type="search" placeholder="Pesquisar projeto ou proprietário…" value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} aria-label="Pesquisar projetos" />
      {shownProjects.length === 0
        ? <div className="dx-admin-table"><div className="dx-admin-empty">{projects.length ? 'Nenhum projeto com esta pesquisa.' : 'Ainda não há projetos criados.'}</div></div>
        : <div className="adm-tablewrap"><table className="adm-table">
          <thead><tr><th scope="col">Projeto</th><th scope="col">Proprietário</th><th scope="col" className="is-num">Membros</th><th scope="col" className="is-num">Tamanho</th><th scope="col" className="is-num">Rev.</th><th scope="col">Atualizado</th><th scope="col"><span className="adm-vh">Ações</span></th></tr></thead>
          <tbody>{shownProjects.map((project) => <tr key={project.id}>
            <th scope="row" data-label="Projeto">{project.name}</th>
            <td data-label="Proprietário">{project.owner}</td>
            <td data-label="Membros" className="is-num">{project.members ?? 0}</td>
            <td data-label="Tamanho" className="is-num">{project.size !== undefined ? formatBytes(project.size) : '—'}</td>
            <td data-label="Rev." className="is-num">{project.revision ?? 0}</td>
            <td data-label="Atualizado">{formatDate(project.updated_at)}</td>
            <td className="is-actions"><button className="dx-btn dx-btn-danger dx-btn-sm" onClick={() => removeProject(project)} aria-label={`Eliminar projeto ${project.name}`}>Eliminar</button></td>
          </tr>)}</tbody>
        </table></div>}
    </>}

    {tab === 'users' && <UsersTab users={users} planRequests={planRequests} currentUserId={currentUser.id} onChanged={afterChange} onError={onError} onOpenLogs={(actor) => { setLogActor(actor); setTab('logs') }} />}

    {tab === 'plans' && <PlansTab users={users} planRequests={planRequests} onChanged={afterChange} onError={onError} />}

    {tab === 'logs' && <LogsTab initialActor={logActor} onChanged={afterChange} onError={onError} />}

    {tab === 'system' && <SystemTab onError={onError} />}
    </div>
    </div>
  </section>
}
