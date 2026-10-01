import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Invite, User } from '../dashboard/Dashboard'
import AccountControls from '../components/AccountControls'
import { activeAccountBackend } from '../auth/accountApi'
import { useComponentSettings } from './componentSettings'
import { adminApi } from './adminApi'
import { actionLabel, type AdminProject, type AdminUser, type AuditEntry, type ComponentSetting } from './adminTypes'
import ComponentsTab from './ComponentsTab'
import CatalogTab from './editor3d/CatalogTab'
import NewComponentDialog from './editor3d/NewComponentDialog'
import LogsTab from './LogsTab'
import SystemTab from './SystemTab'
import UsersTab from './UsersTab'
import { contribApi } from '../contrib/contribApi'
import { COMPONENT_OPTIONS, ContributionRow, formatBytes, formatDate } from '../contrib/ContribParts'
import { KIND_LABEL, STATUS_LABEL, type Contribution, type ContributionKind, type ContributionStatus, type ContribStats } from '../contrib/types'

type Tab = 'overview' | 'contributions' | 'components' | 'library3d' | 'projects' | 'users' | 'logs' | 'system'

/** Painel de gestão do administrador: resumo, revisão de contribuições, projetos e contas. */
export default function AdminPanel({ onBack, currentUser, initialTab = 'overview', invites = [], onLogout }: { onBack: () => void; currentUser: User; initialTab?: Tab; invites?: Invite[]; onLogout?: () => void }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [stats, setStats] = useState<ContribStats | null>(null)
  const [settings, setSettings] = useState<ComponentSetting[]>([])
  const [recentLogs, setRecentLogs] = useState<AuditEntry[]>([])
  const [logActor, setLogActor] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ContributionStatus>('pending')
  const [kindFilter, setKindFilter] = useState<'all' | ContributionKind>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating3D, setCreating3D] = useState(false)
  const [editorOpenId, setEditorOpenId] = useState<string | null>(null)
  const clearEditorOpen = useCallback(() => setEditorOpenId(null), [])
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const reload = useCallback(async () => {
    try {
      const [userList, projectList, contributionList, statistics, componentList, logs] = await Promise.all([
        adminApi.users(), adminApi.projects(), contribApi.list(), contribApi.stats(), adminApi.components(), adminApi.logs({ limit: 6 }),
      ])
      setUsers(userList); setProjects(projectList); setContributions(contributionList); setStats(statistics); setSettings(componentList); setRecentLogs(logs.items)
      // O simulador aberto neste navegador reflete logo as alterações.
      void useComponentSettings.getState().load()
      setError('')
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Falha na administração')
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 5000); return () => window.clearTimeout(timer) }, [notice])

  const onError = useCallback((message: string) => setError(message), [])
  const afterChange = useCallback(async (message: string) => { setNotice(message); setError(''); await reload() }, [reload])

  async function act(run: () => Promise<unknown>, done: string) {
    try { await run(); setNotice(done); setRejecting(null); setNote(''); await reload() }
    catch (value) { setError(value instanceof Error ? value.message : 'Falha na operação') }
  }
  const review = (item: Contribution, status: ContributionStatus, text = '') => act(() => contribApi.review(item.id, status, text), status === 'approved' ? `«${item.title}» aprovada.` : status === 'rejected' ? `«${item.title}» rejeitada.` : `«${item.title}» voltou à fila de revisão.`)
  const removeContribution = (item: Contribution) => { if (confirm(`Eliminar definitivamente a contribuição «${item.title}»?`)) void act(() => contribApi.remove(item.id), 'Contribuição eliminada.') }
  const removeProject = (project: AdminProject) => { if (confirm(`Eliminar permanentemente o projeto ${project.name}? Esta ação não pode ser anulada.`)) void act(() => adminApi.deleteProject(project.id), 'Projeto eliminado.') }

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
  const disabledCount = settings.filter((entry) => !entry.enabled).length
  const tabs: Array<[Tab, string, number | undefined]> = [['overview', 'Resumo', undefined], ['contributions', 'Contribuições', pendingCount || undefined], ['components', 'Componentes', disabledCount || undefined], ['library3d', 'Biblioteca 3D', undefined], ['projects', 'Projetos', projects.length], ['users', 'Utilizadores', users.length], ['logs', 'Registos', undefined], ['system', 'Sistema', undefined]]
  const shownProjects = projects.filter((project) => `${project.name} ${project.owner}`.toLowerCase().includes(projectQuery.trim().toLowerCase()))

  return <section className="dx dx-admin cb-panel">
    <div className="dx-admin-head">
      <div>
        <span className="dx-over"><i />Acesso restrito</span>
        <h1>Administração.</h1>
        <p>Reveja as contribuições da comunidade, gira contas, componentes e projetos, e acompanhe a atividade do sistema. {activeAccountBackend() === 'server' ? 'Dados no servidor (SQLite).' : 'Dados guardados neste navegador.'}</p>
      </div>
      <div className="dx-admin-head-actions">
        <button className="dx-btn dx-btn-primary" onClick={() => setCreating3D(true)} title="Criar um componente no editor 3D">+ Novo componente 3D</button>
        <button className="dx-btn dx-btn-secondary" onClick={onBack}>← Projetos</button>
      </div>
    </div>
    {creating3D && <NewComponentDialog onCancel={() => setCreating3D(false)} onError={onError} onCreated={(id, name) => { setCreating3D(false); setNotice(`«${name}» criado como rascunho. Modele-o e publique quando estiver pronto.`); setEditorOpenId(id); setTab('library3d') }} />}

    <div className="cb-tabs" role="tablist" aria-label="Gestão do administrador">
      {tabs.map(([id, label, count]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
        {label}{count !== undefined && (id === 'contributions' ? <em title="Em revisão">{count}</em> : <span>{count}</span>)}
      </button>)}
    </div>
    {error && <div className="dx-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Fechar">×</button></div>}
    {notice && <div className="cb-toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Fechar">×</button></div>}

    {tab === 'overview' && <>
      <div className="ce-cta">
        <div><strong>Editor 3D de componentes</strong><span>Crie componentes oficiais com modelo 3D, bornes, estados e animações. O assistente pergunta o que é, a categoria, o nome e se já tem datasheet.</span></div>
        <div className="ce-cta-actions">
          <button className="dx-btn dx-btn-primary" onClick={() => setCreating3D(true)}>+ Novo componente 3D</button>
          <button className="dx-btn dx-btn-secondary" onClick={() => setTab('library3d')}>Abrir biblioteca 3D</button>
        </div>
      </div>
      <div className="cb-stats">
        <div className={pendingCount ? 'is-attention' : ''}><strong>{stats?.pending ?? '—'}</strong><span>Em revisão</span><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { setStatusFilter('pending'); setTab('contributions') }}>Rever agora</button></div>
        <div><strong>{stats?.approved ?? '—'}</strong><span>Aprovadas</span></div>
        <div><strong>{stats?.rejected ?? '—'}</strong><span>Rejeitadas</span></div>
        <div><strong>{stats ? formatBytes(stats.bytes) : '—'}</strong><span>{stats ? `${stats.datasheets} PDF · ${stats.models} GLB` : 'Armazenamento'}</span></div>
        <div><strong>{projects.length}</strong><span>Projetos</span></div>
        <div><strong>{users.length}</strong><span>Contas</span></div>
      </div>
      {disabledCount > 0 && <p className="cb-note cb-banner">{disabledCount} componente(s) desativado(s) na biblioteca. <button className="cb-link" onClick={() => setTab('components')}>Gerir componentes</button></p>}
      <div className="dx-admin-section"><h2>Atividade recente</h2><button className="cb-link" onClick={() => { setLogActor(''); setTab('logs') }}>Ver todos os registos →</button></div>
      <div className="dx-admin-table">
        {recentLogs.length === 0 && <div className="dx-admin-empty">Ainda não há atividade registada.</div>}
        {recentLogs.map((entry) => <div key={entry.id}><span><strong>{actionLabel(entry.action)}</strong> · {entry.actorEmail || entry.actorName || 'sistema'}{entry.targetLabel ? ` · ${entry.targetLabel}` : ''}</span><span className="dx-chip">{formatDate(entry.at)}</span></div>)}
      </div>
      <div className="dx-admin-section"><h2>Cobertura da biblioteca</h2><span>componentes com ficheiros aprovados</span></div>
      <div className="dx-admin-table">
        {coverage.length === 0 && <div className="dx-admin-empty">Ainda não há contribuições aprovadas.</div>}
        {coverage.map((entry) => <div key={entry.type}><span><strong>{entry.label}</strong> · {entry.group}</span><span className="dx-chip">{entry.datasheets} datasheet(s) · {entry.models} modelo(s) 3D</span></div>)}
      </div>
      <div className="dx-admin-section"><h2>Últimas contribuições</h2><span>{contributions.length}</span></div>
      <div className="dx-admin-table">
        {contributions.length === 0 && <div className="dx-admin-empty">Nenhuma contribuição enviada.</div>}
        {contributions.slice(0, 5).map((item) => <div key={item.id}><span><strong>{item.title}</strong> · {KIND_LABEL[item.kind]} · {item.authorName} · {formatDate(item.updatedAt)}</span><span className={`cb-status is-${item.status}`}>{STATUS_LABEL[item.status]}</span></div>)}
      </div>
    </>}

    {tab === 'contributions' && <div className="cb-list">
      <div className="cb-filters">
        <input className="dx-input" type="search" placeholder="Pesquisar título, componente ou autor…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Pesquisar contribuições" />
        <select className="dx-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filtrar por estado">
          <option value="all">Todos os estados</option>{(Object.keys(STATUS_LABEL) as ContributionStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
        </select>
        <select className="dx-input" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)} aria-label="Filtrar por tipo">
          <option value="all">Todos os tipos</option><option value="datasheet">Datasheets</option><option value="model3d">Modelos 3D</option>
        </select>
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
      <div className="dx-admin-table">
        {shownProjects.length === 0 && <div className="dx-admin-empty">{projects.length ? 'Nenhum projeto com esta pesquisa.' : 'Ainda não há projetos criados.'}</div>}
        {shownProjects.map((project) => <div key={project.id}>
          <span><strong>{project.name}</strong> · {project.owner} · {project.members ?? 0} membro(s) · {project.size !== undefined ? formatBytes(project.size) : '—'} · rev. {project.revision ?? 0} · {formatDate(project.updated_at)}</span>
          <button className="dx-btn dx-btn-danger dx-btn-sm" onClick={() => removeProject(project)}>Eliminar projeto</button>
        </div>)}
      </div>
    </>}

    {tab === 'users' && <UsersTab users={users} currentUserId={currentUser.id} onChanged={afterChange} onError={onError} onOpenLogs={(actor) => { setLogActor(actor); setTab('logs') }} />}

    {tab === 'logs' && <LogsTab initialActor={logActor} onChanged={afterChange} onError={onError} />}

    {tab === 'system' && <SystemTab onError={onError} />}
  </section>
}
