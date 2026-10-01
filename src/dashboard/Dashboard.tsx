import { useEffect, useState, type CSSProperties } from 'react'
import { useRef } from 'react'
import { LogoMark } from '../ui/Brand'
import { IconSearch, IconLayers, IconFile, IconProjects, IconTag, IconPlus } from '../ui/icons'

import ProjectCover from './ProjectCover'
import type { ProjectPreviewData } from './projectPreview'

export type { ProjectPreviewData }
export type User = { id: string; name: string; email: string; role: 'admin' | 'user' }
export type Project = { id: string; name: string; revision: number; owner: string; role: 'owner' | 'editor'; updated_at: string; preview?: ProjectPreviewData }
export type Invite = { id: string; project: string; sender: string }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "há 3 dias", "ontem", "agora mesmo"… */
function relTime(iso: string) {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = (t - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'agora mesmo'
  const rtf = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'auto' })
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), 'month')
  return rtf.format(Math.round(diff / (86400 * 365)), 'year')
}

function statsOf(p: Project) {
  const s = p.preview?.stats
  return {
    components: s?.components ?? p.preview?.components.length ?? 0,
    wires: s?.wires ?? p.preview?.wires.length ?? 0,
    rungs: s?.rungs ?? 0,
  }
}

type SortKey = 'recent' | 'name' | 'size'
type ViewKey = 'grid' | 'list'

/** Número que sobe até ao valor final (respeita movimento reduzido). */
function useCountUp(target: number, ms = 700) {
  const [value, setValue] = useState(target)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) {
      setValue(target)
      return
    }
    let raf = 0
    let start = 0
    const from = 0
    const tick = (t: number) => {
      if (!start) start = t
      const k = Math.min(1, (t - start) / ms)
      const eased = 1 - Math.pow(1 - k, 3)
      setValue(Math.round(from + (target - from) * eased))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

function Metric({ icon: Ic, value, label }: { icon: typeof IconLayers; value: number; label: string }) {
  const n = useCountUp(value)
  return (
    <div className="dx-metric">
      <i aria-hidden>
        <Ic size={16} />
      </i>
      <span>
        <b>{n}</b>
        <small>{label}</small>
      </span>
    </div>
  )
}

const stagger = (i: number) => ({ ['--i' as string]: i }) as CSSProperties

function Members({ id, fetchMembers }: { id: string; fetchMembers: (id: string) => Promise<{ name: string; email: string }[]> }) {
  const [members, setMembers] = useState<{ name: string; email: string }[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchMembers(id)
      .then(setMembers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
  }, [id, fetchMembers])
  if (error) return <div className="dx-members">{error}</div>
  if (!members) return <div className="dx-members">A carregar membros…</div>
  if (!members.length) return <div className="dx-members">Ainda não há editores neste projeto.</div>
  return (
    <div className="dx-members">
      {members.map((m) => (
        <div key={m.email}>
          <span className="dx-avatar">{m.name.charAt(0).toUpperCase()}</span>
          <span>
            <b>{m.name}</b>
            <small>{m.email}</small>
          </span>
        </div>
      ))}
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 13) return 'Bom dia'
  if (h < 20) return 'Boa tarde'
  return 'Boa noite'
}

export default function Dashboard({
  user,
  projects,
  invites,
  loading = false,
  onCreate,
  onOpen,
  onInvite,
  onReply,
  onDelete,
  fetchMembers,
}: {
  user: User | null
  projects: Project[]
  invites: Invite[]
  /** Enquanto a primeira lista de projetos ainda não chegou. */
  loading?: boolean
  onCreate: (name: string) => Promise<void>
  onOpen: (id: string) => Promise<void>
  onInvite: (id: string, email: string) => Promise<void>
  onReply: (id: string, action: 'accept' | 'reject') => Promise<void>
  onDelete: (p: Project) => Promise<void>
  fetchMembers: (id: string) => Promise<{ name: string; email: string }[]>
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'owner' | 'editor'>('all')
  const [modal, setModal] = useState<{ type: 'create' | 'invite' | 'delete'; project?: Project } | null>(null)
  const [value, setValue] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [sort, setSort] = useState<SortKey>('recent')
  const [view, setViewState] = useState<ViewKey>(() => (typeof localStorage !== 'undefined' && localStorage.getItem('dc.dash.view') === 'list' ? 'list' : 'grid'))
  const setView = (v: ViewKey) => {
    setViewState(v)
    try { localStorage.setItem('dc.dash.view', v) } catch { /* ignorar */ }
  }

  const matching = projects.filter(
    (p) => (filter === 'all' || p.role === filter) && p.name.toLocaleLowerCase('pt-PT').includes(query.trim().toLocaleLowerCase('pt-PT')),
  )
  const byRecent = [...matching].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const hero = filter === 'all' && !query.trim() && byRecent.length > 0 ? byRecent[0] : null
  const sorted =
    sort === 'name'
      ? [...matching].sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'))
      : sort === 'size'
        ? [...matching].sort((a, b) => statsOf(b).components - statsOf(a).components)
        : byRecent
  const visible = hero ? sorted.filter((p) => p.id !== hero.id) : sorted
  const totalComponents = projects.reduce((sum, p) => sum + statsOf(p).components, 0)
  const owned = projects.filter((p) => p.role === 'owner').length

  const closeModal = () => {
    if (!modal || closing) return
    setClosing(true)
    window.setTimeout(() => {
      setModal(null)
      setClosing(false)
    }, 170)
  }

  const openModal = (type: 'create' | 'invite' | 'delete', project?: Project) => {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    returnFocusRef.current = activeElement?.closest('.dx-menu-wrap')?.querySelector<HTMLElement>('button') ?? activeElement
    setClosing(false)
    setModal({ type, project })
    setValue('')
    setNotice('')
    setMenu(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = value.trim()
    if (!text || saving) return
    setSaving(true)
    setNotice('')
    try {
      if (modal?.type === 'create') await onCreate(text)
      else if (modal?.project) await onInvite(modal.project.id, text)
      closeModal()
      setValue('')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível concluir a operação.')
    } finally {
      setSaving(false)
    }
  }

  async function open(id: string) {
    setOpening(id)
    try {
      await onOpen(id)
    } finally {
      setOpening(null)
    }
  }

  async function confirmDelete() {
    if (modal?.type !== 'delete' || !modal.project || saving) return
    setSaving(true)
    setNotice('')
    try {
      await onDelete(modal.project)
      closeModal()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível eliminar o projeto.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!modal) {
      returnFocusRef.current?.focus()
      return
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        closeModal()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialogRef.current?.contains(document.activeElement)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, saving, closing])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', esc)
    }
  }, [menu])

  const renderMenu = (p: Project) =>
    p.role === 'owner' ? (
      <div className="dx-menu-wrap" onClick={(e) => e.stopPropagation()}>
        <button className="dx-icon-btn" aria-label={`Opções de ${p.name}`} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>
          ⋯
        </button>
        {menu === p.id && (
          <div className="dx-menu" role="menu">
            <button onClick={() => openModal('invite', p)}>Convidar editor</button>
            <button
              onClick={() => {
                setExpanded(expanded === p.id ? null : p.id)
                setMenu(null)
              }}
            >
              Ver membros
            </button>
            <button
              className="danger"
              onClick={() => {
                setMenu(null)
                openModal('delete', p)
              }}
            >
              Eliminar projeto
            </button>
          </div>
        )}
      </div>
    ) : null

  const today = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="dx dx-dash">
      <div className="dx-dash-head">
        <div>
          <span className="dx-over">
            <i />
            Espaço de trabalho
          </span>
          <h1>
            {greeting()}
            {user ? `, ${user.name.split(' ')[0]}` : ''}.
          </h1>
          <p>
            {projects.length > 0
              ? `${plural(projects.length, 'projeto', 'projetos')} · ${plural(totalComponents, 'componente', 'componentes')} no total. Continue de onde parou ou comece um novo quadro.`
              : 'Continue um quadro existente ou comece um novo projeto.'}
          </p>
        </div>
        <div className="dx-dash-side">
          <span className="dx-dash-date">{today}</span>
          <button className="dx-btn dx-btn-primary" onClick={() => openModal('create')}>
            <IconPlus size={14} /> Novo projeto
          </button>
        </div>
      </div>

      <div className="dx-metrics">
        <Metric icon={IconLayers} value={projects.length} label="Projetos acessíveis" />
        <Metric icon={IconFile} value={owned} label="Da sua autoria" />
        <Metric icon={IconProjects} value={projects.length - owned} label="Partilhados consigo" />
        <Metric icon={IconTag} value={invites.length} label="Convites pendentes" />
      </div>

      {invites.length > 0 && (
        <div className="dx-invites" id="dashboard-invites">
          <strong>Convites para colaborar</strong>
          {invites.map((i) => (
            <div className="dx-invite-row" key={i.id}>
              <div>
                <b>{i.project}</b>
                <div className="dx-proj-meta">Convite de {i.sender}</div>
              </div>
              <div>
                <button className="dx-btn dx-btn-ghost dx-btn-sm" onClick={() => void onReply(i.id, 'reject')}>
                  Recusar
                </button>
                <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={() => void onReply(i.id, 'accept')}>
                  Aceitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dx-toolbar">
        <div className="dx-tabs-group" role="group" aria-label="Filtrar projetos">
          {(
            [
              ['all', 'Todos'],
              ['owner', 'Os meus'],
              ['editor', 'Partilhados'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
        <label className="dx-search">
          <span aria-hidden>
            <IconSearch size={13} />
          </span>
          <span className="dx-sr">Pesquisar projetos</span>
          <input className="dx-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar projeto…" />
        </label>
        <div className="dx-toolbar-end">
          <label className="dx-sort">
            <span>Ordenar</span>
            <select className="dx-input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="recent">Mais recentes</option>
              <option value="name">Nome (A–Z)</option>
              <option value="size">Mais componentes</option>
            </select>
          </label>
          <div className="dx-view-toggle" role="group" aria-label="Modo de visualização">
            <button aria-pressed={view === 'grid'} onClick={() => setView('grid')} title="Cartões" aria-label="Ver em cartões">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" /><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" /><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" /><rect x="9" y="9" width="5.5" height="5.5" rx="1.2" /></svg>
            </button>
            <button aria-pressed={view === 'list'} onClick={() => setView('list')} title="Lista" aria-label="Ver em lista">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden><rect x="1.5" y="2" width="13" height="3" rx="1" /><rect x="1.5" y="6.5" width="13" height="3" rx="1" /><rect x="1.5" y="11" width="13" height="3" rx="1" /></svg>
            </button>
          </div>
        </div>
      </div>

      {!loading && hero && (
        <section className="dx-hero dx-card" aria-label="Continuar de onde parou">
          <div
            className="dx-hero-art dx-proj-art"
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('button')) void open(hero.id)
            }}
          >
            <ProjectCover preview={hero.preview} large />
            <span className="dx-proj-badge">{hero.role === 'owner' ? 'Meu projeto' : 'Partilhado'}</span>
            {renderMenu(hero)}
          </div>
          <div className="dx-hero-body">
            <span className="dx-over">
              <i />
              Continuar de onde parou
            </span>
            <h2 title={hero.name}>{hero.name}</h2>
            <div className="dx-proj-meta">
              <span className="dx-avatar dx-avatar-sm">{hero.owner.charAt(0).toUpperCase()}</span>
              <span>por {hero.owner}</span>
              <span>·</span>
              <span>editado {relTime(hero.updated_at)}</span>
              <span>·</span>
              <span>rev. {hero.revision}</span>
            </div>
            <dl className="dx-hero-stats">
              <div><dt>Componentes</dt><dd>{statsOf(hero).components}</dd></div>
              <div><dt>Cabos</dt><dd>{statsOf(hero).wires}</dd></div>
              <div><dt>Degraus ladder</dt><dd>{statsOf(hero).rungs}</dd></div>
            </dl>
            <div className="dx-proj-actions">
              <button className="dx-btn dx-btn-primary" disabled={opening === hero.id} onClick={() => void open(hero.id)}>
                {opening === hero.id ? (
                  <>
                    <span className="dx-spin" aria-hidden /> A abrir…
                  </>
                ) : (
                  'Continuar a editar'
                )}
              </button>
              {hero.role === 'owner' && (
                <button className="dx-btn dx-btn-secondary" onClick={() => openModal('invite', hero)}>
                  Convidar editor
                </button>
              )}
            </div>
            {expanded === hero.id && <Members id={hero.id} fetchMembers={fetchMembers} />}
          </div>
        </section>
      )}

      {!loading && projects.length > 0 && matching.length > 0 && (
        <div className="dx-section-title">
          <h2>{hero ? 'Outros projetos' : 'Projetos'}</h2>
          <span>{plural(visible.length, 'projeto', 'projetos')}</span>
        </div>
      )}

      <div className={'dx-projects' + (view === 'list' ? ' is-list' : '')}>
        {loading &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <div className="dx-skel" key={i} style={stagger(i)} aria-hidden>
              <div className="dx-skel-art" />
              <div className="dx-skel-body">
                <i style={{ width: '62%' }} />
                <i style={{ width: '38%' }} />
                <i className="btn" />
              </div>
            </div>
          ))}
        {loading && (
          <span className="dx-sr" role="status">
            A carregar projetos…
          </span>
        )}
        {!loading && projects.length > 0 && matching.length > 0 && (
          <button className="dx-proj-new" onClick={() => openModal('create')}>
            <span className="plus" aria-hidden>
              +
            </span>
            <span>
              <b>Novo projeto</b>
              <small>Quadro em branco, pronto a receber componentes.</small>
            </span>
          </button>
        )}

        {!loading &&
          visible.map((p, index) => {
            const st = statsOf(p)
            return (
              <article className="dx-card dx-card-hover dx-proj" key={p.id} style={stagger(index + 1)}>
                <div
                  className="dx-proj-art"
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button')) void open(p.id)
                  }}
                >
                  <ProjectCover preview={p.preview} />
                  <span className="dx-proj-badge">{p.role === 'owner' ? 'Meu projeto' : 'Partilhado'}</span>
                  {renderMenu(p)}
                  {st.components > 0 && (
                    <div className="dx-proj-chips">
                      <span>{plural(st.components, 'componente', 'componentes')}</span>
                      <span>{plural(st.wires, 'cabo', 'cabos')}</span>
                    </div>
                  )}
                </div>
                <div className="dx-proj-body">
                  <h3 title={p.name} onClick={() => void open(p.id)}>
                    {p.name}
                  </h3>
                  <div className="dx-proj-meta">
                    <span className="dx-avatar dx-avatar-sm">{p.owner.charAt(0).toUpperCase()}</span>
                    <span>{p.owner}</span>
                    <span>·</span>
                    <span title={new Date(p.updated_at).toLocaleString('pt-PT')}>{relTime(p.updated_at)}</span>
                    <span>·</span>
                    <span>rev. {p.revision}</span>
                  </div>
                  <div className="dx-proj-actions">
                    <button className="dx-btn dx-btn-secondary dx-proj-open" disabled={opening === p.id} onClick={() => void open(p.id)}>
                      {opening === p.id ? (
                        <>
                          <span className="dx-spin" aria-hidden /> A abrir…
                        </>
                      ) : (
                        'Abrir no editor 3D'
                      )}
                    </button>
                    {p.role === 'owner' && (
                      <button className="dx-btn dx-btn-secondary" title="Convidar editor" aria-label={`Convidar editor para ${p.name}`} onClick={() => openModal('invite', p)}>
                        ↗
                      </button>
                    )}
                  </div>
                  {expanded === p.id && <Members id={p.id} fetchMembers={fetchMembers} />}
                </div>
              </article>
            )
          })}

        {!loading && projects.length > 0 && matching.length === 0 && (
          <div className="dx-empty">
            <div className="dx-empty-ic">
              <IconSearch size={24} />
            </div>
            <h3>Nenhum projeto encontrado</h3>
            <p>Experimente outro termo de pesquisa ou escolha um filtro diferente.</p>
            <button
              className="dx-btn dx-btn-secondary"
              onClick={() => {
                setQuery('')
                setFilter('all')
              }}
            >
              Limpar filtros
            </button>
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div className="dx-empty">
            <div className="dx-empty-ic" style={{ background: 'transparent' }}>
              <LogoMark size={44} />
            </div>
            <h3>Ainda não tem projetos</h3>
            <p>Comece o seu primeiro quadro elétrico em 3D. Escolha os componentes, posicione-os na calha e simule o comando.</p>
            <button className="dx-btn dx-btn-primary" onClick={() => openModal('create')}>
              <IconPlus size={14} /> Criar projeto
            </button>
          </div>
        )}
      </div>

      {modal && (
        <div
          className={'dx-overlay' + (closing ? ' is-closing' : '')}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) closeModal()
          }}
        >
          <div ref={dialogRef} className="dx-dialog" role="dialog" aria-modal="true" aria-labelledby="dx-dialog-title" aria-describedby="dx-dialog-description">
            <button className="dx-btn dx-btn-ghost dx-btn-sm dx-dialog-close" aria-label="Fechar" disabled={saving} onClick={closeModal}>
              ×
            </button>
            <div className="dx-empty-ic" style={{ margin: 0, width: 44, height: 44 }}>
              {modal.type === 'create' ? <IconPlus size={20} /> : <IconProjects size={20} />}
            </div>
            <h2 id="dx-dialog-title">{modal.type === 'create' ? 'Criar novo projeto' : modal.type === 'invite' ? 'Convidar editor' : 'Eliminar projeto?'}</h2>
            <p id="dx-dialog-description">
              {modal.type === 'create'
                ? 'Dê um nome ao quadro. Poderá adicionar componentes assim que o projeto abrir.'
                : modal.type === 'invite'
                  ? `Convide a outra conta autorizada para editar «${modal.project?.name}».`
                  : `O projeto «${modal.project?.name}» será eliminado definitivamente. Esta ação não pode ser anulada.`}
            </p>
            {modal.type !== 'delete' ? <form onSubmit={(e) => void submit(e)}>
              <label className="dx-field">
                <span className="dx-label">{modal.type === 'create' ? 'Nome do projeto' : 'Email do utilizador'}</span>
                <input
                  className="dx-input"
                  autoFocus
                  required
                  maxLength={modal.type === 'create' ? 120 : 254}
                  type={modal.type === 'invite' ? 'email' : 'text'}
                  value={value}
                  placeholder={modal.type === 'create' ? 'Ex.: Quadro de comando — Linha A' : 'nome@empresa.com'}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              {modal.type === 'invite' && <small style={{ color: 'var(--dx-ink-4)', fontSize: 12 }}>O convite aparece no painel da pessoa convidada. Não enviamos email.</small>}
              {notice && (
                <div className="dx-alert" role="alert">
                  {notice}
                </div>
              )}
              <div className="dx-dialog-actions">
                <button type="button" className="dx-btn dx-btn-ghost" disabled={saving} onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="dx-btn dx-btn-primary" disabled={saving || !value.trim()}>
                  {saving ? (
                    <>
                      <span className="dx-spin" aria-hidden /> A guardar…
                    </>
                  ) : modal.type === 'create' ? (
                    'Criar projeto'
                  ) : (
                    'Enviar convite'
                  )}
                </button>
              </div>
            </form> : <div>
              {notice && <div className="dx-alert" role="alert">{notice}</div>}
              <div className="dx-dialog-actions">
                <button type="button" autoFocus className="dx-btn dx-btn-ghost" disabled={saving} onClick={closeModal}>Cancelar</button>
                <button type="button" className="dx-btn dx-btn-danger" disabled={saving} onClick={() => void confirmDelete()}>
                  {saving ? <><span className="dx-spin" aria-hidden /> A eliminar…</> : 'Eliminar projeto'}
                </button>
              </div>
            </div>}
          </div>
        </div>
      )}
    </div>
  )
}
