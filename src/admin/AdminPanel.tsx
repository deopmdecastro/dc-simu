import Select from '../ui/Select'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { uiConfirm } from '../ui/dialogs'
import { useLocation, useNavigate } from 'react-router-dom'
import { adminComponentIdFromPath, isAdminEditorPath, ROUTES } from '../routing/routes'
import type { Invite, User } from '../dashboard/Dashboard'
import AccountControls from '../components/AccountControls'
import { activeAccountBackend } from '../auth/accountApi'
import { useComponentSettings } from './componentSettings'
import { adminApi } from './adminApi'
import { actionLabel, categoryOf, severityOf, type AdminProject, type AdminUser, type AuditEntry, type ComponentSetting, type PlanRequest } from './adminTypes'
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
import { IconArrowLeft, IconArrowRight, IconCheckCircle, IconChevronDown, IconClose, IconCube, IconDelete, IconFileUpload, IconGrid, IconHistory, IconInbox, IconLayers, IconMonitor, IconOrganize, IconPdf, IconPending, IconPlus, IconProjects, IconShield, IconStorage, IconTag, IconTools, IconUser, IconUsers, IconWarning, IconXCircle } from '../ui/icons'
import { ToolMenu, useNarrowMenu, type ToolMenuSection } from '../ui/toolbarKit'
import Avatar from '../ui/Avatar'
import { ProjectThumb } from './AdminCovers'

type Tab = 'overview' | 'contributions' | 'components' | 'library3d' | 'projects' | 'users' | 'plans' | 'logs' | 'system'

type AdmIcon = typeof IconGrid

/**
 * Linha de contexto de um registo de atividade, sem repetir a mesma
 * identificação: nas capturas de 2026-10-27 o e-mail aparecia duas vezes
 * («Admin · admin@…» e outra vez «admin@…») porque o alvo da sessão é o
 * próprio ator. Cada valor entra uma só vez, pela ordem ator → alvo → detalhe.
 */
function activityMeta(entry: AuditEntry): string {
  const seen = new Set([entry.actorName ?? '', entry.actorEmail ?? ''])
  const extras: string[] = []
  for (const extra of [entry.targetLabel, entry.detail]) {
    const value = extra?.trim()
    if (value && !seen.has(value)) { extras.push(value); seen.add(value) }
  }
  // Com alvo (ex.: o projeto criado), ele tem prioridade sobre repetir o
  // e-mail do ator: «Admin · Teste» cabe e diz mais do que o e-mail cortado.
  const actor = extras.length === 0 && entry.actorName && entry.actorEmail && entry.actorName !== entry.actorEmail
    ? `${entry.actorName} · ${entry.actorEmail}`
    : (entry.actorName || entry.actorEmail || 'Sistema')
  return [actor, ...extras].join(' · ')
}

const ACTIVITY_ICON: Record<ReturnType<typeof categoryOf>, AdmIcon> = {
  auth: IconShield, user: IconUser, project: IconProjects,
  contribution: IconFileUpload, component: IconLayers, system: IconTools,
}

/** Métrica do resumo: ícone + rótulo, valor e detalhe; o cartão inteiro é a ação. */
function OverviewTile({ tone, icon: Icon, label, value, detail, action, onClick }: {
  tone: string; icon: AdmIcon; label: string; value: ReactNode; detail: string; action: string; onClick: () => void
}) {
  return <button type="button" className={`adm-tile adm-tile-${tone}`} onClick={onClick} aria-label={`${label}: ${typeof value === 'string' || typeof value === 'number' ? value : ''} ${detail}. ${action}`}>
    <span className="adm-tile-top"><span className="adm-tile-icon"><Icon size={15} /></span><span className="adm-tile-label">{label}</span></span>
    <strong>{value}</strong>
    <span className="adm-tile-foot"><small>{detail}</small><span className="adm-tile-go" aria-hidden><IconArrowRight size={10} /></span></span>
  </button>
}

/**
 * Cartão de secção do resumo (cabeçalho + corpo + uma única ação).
 * Uma só ação por cartão: a captura anterior tinha «Ver fila» no topo e
 * «Abrir contribuições» no corpo, para o mesmo destino.
 */
function OverviewCard({ title, subtitle, actionLabel: cta, onAction, children }: {
  title: string; subtitle: string; actionLabel?: string; onAction?: () => void; children: ReactNode
}) {
  return <section className="adm-card">
    <header className="adm-card-head">
      <div className="adm-card-titles"><h2>{title}</h2><span>{subtitle}</span></div>
      {cta && onAction && <button type="button" className="adm-card-action" onClick={onAction}>{cta}<IconArrowRight size={11} /></button>}
    </header>
    <div className="adm-card-body">{children}</div>
  </section>
}

/** Estado vazio de um cartão do resumo: ícone, frase e (opcional) explicação curta. */
function OverviewEmpty({ icon: Icon, text, hint }: { icon: AdmIcon; text: string; hint?: string }) {
  return <div className="adm-empty">
    <span className="adm-empty-icon"><Icon size={16} /></span>
    <span className="adm-empty-text"><strong>{text}</strong>{hint && <small>{hint}</small>}</span>
  </div>
}

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
  const serverMode = activeAccountBackend() === 'server'
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
        <span className={`adm-env ${serverMode ? 'is-server' : 'is-local'}`} title={serverMode ? 'Os dados estão guardados no servidor (SQLite).' : 'Os dados estão guardados apenas neste navegador.'}><i aria-hidden />{serverMode ? 'Servidor · SQLite' : 'Modo local · só neste navegador'}</span>
        <div className="dx-admin-head-actions adm-head-actions">
          <button className="dx-btn dx-btn-primary adm-cta" onClick={() => setCreating3D(true)} title="Criar um componente no editor 3D">
            <span className="adm-cta-icon" aria-hidden><IconPlus size={13} /></span>
            <span className="adm-cta-text"><strong>Novo componente 3D</strong><small>Abrir o assistente</small></span>
          </button>
          <button className="dx-btn dx-btn-secondary adm-back" onClick={onBack} title="Voltar à lista de projetos" aria-label="Voltar aos projetos"><IconArrowLeft size={13} /><span>Projetos</span></button>
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
              trigger={() => { const CurrentIcon = NAV_ICON[currentNav.id]; return <>
                <span className="adm-picker-icon"><CurrentIcon size={14} /></span>
                <span className="adm-picker-name">{currentNav.label}</span>
                {currentNav.count !== undefined && <b className={currentNav.attention ? 'is-attention' : ''}>{currentNav.count}</b>}
                <IconChevronDown size={12} />
              </> }}
            />
          </div>
        : <div className="adm-tablist" role="tablist" aria-orientation="vertical" aria-label="Gestão do administrador">
        {navGroups.map((group) => <div key={group.label} className="adm-nav-group" role="presentation">
          <span className="adm-nav-label" role="presentation">{group.label}</span>
          {group.tabs.map((item) => { const ItemIcon = NAV_ICON[item.id]; return <button key={item.id} role="tab" aria-selected={tab === item.id} className={`adm-tab ${tab === item.id ? 'is-active' : ''}`} onClick={() => setTab(item.id)}>
            <span className="adm-tab-main"><ItemIcon size={13} /><span>{item.label}</span></span>
            {item.count !== undefined && <b className={item.attention ? 'is-attention' : ''} title={item.attention ? 'Por tratar' : undefined}>{item.count}</b>}
          </button> })}
        </div>)}
        </div>}
    </nav>
    <div className="adm-main">
    {error && <div className="dx-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Fechar"><IconClose size={11} /></button></div>}
    {notice && <div className="cb-toast adm-toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Fechar"><IconClose size={11} /></button></div>}

    {tab === 'overview' && <>
      <section className="adm-attn" aria-label="Pendências">
        {attention.length === 0
          ? <p className="adm-clear"><span className="adm-attn-icon" aria-hidden><IconCheckCircle size={16} /></span><span className="adm-attn-text"><strong>Sem pendências</strong><small>Não há nada à espera de revisão ou decisão.</small></span></p>
          : attention.map((item) => <div key={item.key} className="adm-attn-row">
            <span className="adm-attn-icon" aria-hidden><IconWarning size={15} /></span>
            <span className="adm-attn-text"><strong>{item.text}</strong></span>
            <button className="dx-btn dx-btn-secondary dx-btn-sm adm-attn-cta" onClick={item.run}>{item.cta}<IconArrowRight size={11} /></button>
          </div>)}
      </section>

      <section aria-labelledby="admin-indicators-title">
        <div className="dx-admin-section adm-section-head"><h2 id="admin-indicators-title">Indicadores</h2><span>Resumo atual da administração</span></div>
        <div className="adm-tiles">
          <OverviewTile tone="pending" icon={IconPending} label="Em revisão" value={stats?.pending ?? '—'} detail="contribuições" action="Abrir a fila de revisão" onClick={() => { setStatusFilter('pending'); setTab('contributions') }} />
          <OverviewTile tone="approved" icon={IconCheckCircle} label="Aprovadas" value={stats?.approved ?? '—'} detail="contribuições" action="Ver as aprovadas" onClick={() => { setStatusFilter('approved'); setTab('contributions') }} />
          <OverviewTile tone="rejected" icon={IconXCircle} label="Rejeitadas" value={stats?.rejected ?? '—'} detail="contribuições" action="Ver as rejeitadas" onClick={() => { setStatusFilter('rejected'); setTab('contributions') }} />
          <OverviewTile tone="projects" icon={IconProjects} label="Projetos" value={projects.length} detail="em todas as contas" action="Abrir os projetos" onClick={() => setTab('projects')} />
          <OverviewTile tone="accounts" icon={IconUsers} label="Contas" value={users.length} detail={`${users.filter((entry) => entry.active).length} ativas`} action="Abrir as contas" onClick={() => setTab('users')} />
          <OverviewTile tone="storage" icon={IconStorage} label="Armazenamento" value={stats ? formatBytes(stats.bytes) : '—'} detail={stats ? `${stats.datasheets} PDF · ${stats.models} GLB` : 'ficheiros'} action="Abrir o sistema" onClick={() => setTab('system')} />
        </div>
      </section>
      <OverviewCard title="Acesso rápido" subtitle="Abra as áreas de trabalho mais usadas">
        <div className="adm-quick-grid">
          <button type="button" onClick={() => { setStatusFilter('pending'); setTab('contributions') }}><span className="adm-quick-icon"><IconFileUpload size={16} /></span><span className="adm-quick-text"><strong>Contribuições</strong><small>Fila por rever</small></span><IconArrowRight className="adm-quick-arrow" size={13} /></button>
          <button type="button" onClick={() => setTab('projects')}><span className="adm-quick-icon"><IconProjects size={16} /></span><span className="adm-quick-text"><strong>Projetos</strong><small>Quadros e atividade</small></span><IconArrowRight className="adm-quick-arrow" size={13} /></button>
          <button type="button" onClick={() => setTab('logs')}><span className="adm-quick-icon"><IconMonitor size={16} /></span><span className="adm-quick-text"><strong>Registos</strong><small>Atividade e alterações</small></span><IconArrowRight className="adm-quick-arrow" size={13} /></button>
          <button type="button" onClick={() => setTab('library3d')}><span className="adm-quick-icon"><IconCube size={16} /></span><span className="adm-quick-text"><strong>Biblioteca 3D</strong><small>Modelos e componentes</small></span><IconArrowRight className="adm-quick-arrow" size={13} /></button>
        </div>
      </OverviewCard>
      <div className="adm-cols">
        <OverviewCard title="Atividade recente" subtitle="Últimos eventos registados" actionLabel="Ver registos" onAction={() => { setLogActor(''); setTab('logs') }}>
          {recentLogs.length === 0
            ? <OverviewEmpty icon={IconHistory} text="Ainda não há atividade registada." hint="Os eventos de contas, projetos e componentes aparecem aqui." />
            : <ul className="adm-activity">
              {recentLogs.map((entry) => { const ActivityIcon = ACTIVITY_ICON[categoryOf(entry.action)]; const meta = activityMeta(entry); return <li key={entry.id} className={`adm-activity-row is-${severityOf(entry.action)}`}>
                <span className="adm-activity-icon" aria-hidden><ActivityIcon size={13} /></span>
                <span className="adm-activity-text"><strong>{actionLabel(entry.action)}</strong><small title={meta}>{meta}</small></span>
                <time className="adm-activity-time" dateTime={entry.at}>{formatDate(entry.at)}</time>
              </li> })}
            </ul>}
        </OverviewCard>
        <div className="adm-col-stack">
          <OverviewCard title="Últimas contribuições" subtitle={`${contributions.length} no total`} actionLabel="Ver fila" onAction={() => setTab('contributions')}>
            {contributions.length === 0
              ? <OverviewEmpty icon={IconInbox} text="Ainda não foram enviadas contribuições." hint="Datasheets e modelos 3D enviados ficam aqui à espera de revisão." />
              : <ul className="adm-list">
                {contributions.slice(0, 5).map((item) => <li key={item.id} className="adm-list-row has-avatar">
                  <Avatar name={item.authorName} email={item.authorEmail} size="sm" />
                  <span className="adm-list-text"><strong>{item.title}</strong><small>{KIND_LABEL[item.kind]} · {item.authorName} · {formatDate(item.updatedAt)}</small></span>
                  <span className={`cb-status is-${item.status}`}>{STATUS_LABEL[item.status]}</span>
                </li>)}
              </ul>}
          </OverviewCard>
          <OverviewCard title="Cobertura da biblioteca" subtitle="Ficheiros aprovados por componente" actionLabel="Componentes" onAction={() => setTab('components')}>
            {coverage.length === 0
              ? <OverviewEmpty icon={IconLayers} text="Ainda não há ficheiros aprovados." hint="A cobertura aparece quando houver datasheets ou modelos aprovados." />
              : <ul className="adm-list">
                {coverage.map((entry) => <li key={entry.type} className="adm-list-row">
                  <span className="adm-list-text"><strong>{entry.label}</strong><small>{entry.group}</small></span>
                  <span className="adm-cover-chips"><span className="dx-chip"><IconPdf size={11} /> {entry.datasheets}</span><span className="dx-chip"><IconCube size={11} /> {entry.models}</span></span>
                </li>)}
              </ul>}
          </OverviewCard>
        </div>
      </div>
      <div className="ce-cta adm-editor-cta">
        <span className="adm-editor-cta-icon" aria-hidden><IconCube size={18} /></span>
        <div className="adm-editor-cta-text"><strong>Editor 3D de componentes</strong><span>Crie componentes oficiais com modelo 3D, bornes, estados e animações. O assistente pergunta o que é, a categoria, o nome e se já tem datasheet.</span></div>
        <div className="ce-cta-actions">
          <button className="dx-btn dx-btn-secondary" onClick={() => setTab('library3d')}>Abrir biblioteca 3D<IconArrowRight size={11} /></button>
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
        : <div className="adm-tablewrap"><table className="adm-table adm-table-projects">
          <thead><tr><th scope="col">Projeto</th><th scope="col">Proprietário</th><th scope="col" className="is-num">Membros</th><th scope="col" className="is-num">Tamanho</th><th scope="col" className="is-num">Rev.</th><th scope="col">Atualizado</th><th scope="col"><span className="adm-vh">Ações</span></th></tr></thead>
          <tbody>{shownProjects.map((project) => <tr key={project.id}>
            <th scope="row" data-label="Projeto"><span className="adm-project-cell"><ProjectThumb name={project.name} preview={project.preview} /><span className="adm-project-name"><strong>{project.name}</strong><small>{project.revision ? `Revisão ${project.revision}` : 'Sem revisões'}</small></span></span></th>
            <td data-label="Proprietário" className="is-owner"><span className="adm-person"><Avatar email={project.owner} name={project.owner} size="sm" /><span>{project.owner}</span></span></td>
            <td data-label="Membros" className="is-num">{project.members ?? 0}</td>
            <td data-label="Tamanho" className="is-num">{project.size !== undefined ? formatBytes(project.size) : '—'}</td>
            <td data-label="Rev." className="is-num">{project.revision ?? 0}</td>
            <td data-label="Atualizado">{formatDate(project.updated_at)}</td>
            <td className="is-actions"><button className="dx-btn dx-btn-danger dx-btn-sm" onClick={() => removeProject(project)} aria-label={`Eliminar projeto ${project.name}`}><IconDelete size={12} /> Eliminar</button></td>
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
