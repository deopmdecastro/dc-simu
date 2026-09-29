import { useEffect, useState, type CSSProperties } from 'react'
import { LogoMark } from '../ui/Brand'
import { IconSearch, IconLayers, IconFile, IconProjects, IconTag, IconPlus } from '../ui/icons'

export type User = { id: string; name: string; email: string; role: 'admin' | 'user' }
export type Project = { id: string; name: string; revision: number; owner: string; role: 'owner' | 'editor'; updated_at: string }
export type Invite = { id: string; project: string; sender: string }

/** Hash estável do id → cada projeto tem sempre a mesma miniatura, mas diferente das outras. */
function hashId(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0
  return h
}

/** Pré-visualização simplificada do quadro, usada nos cartões de projeto. */
function PanelPreview({ seed }: { seed: string }) {
  const v = hashId(seed)
  const modules = 4 + (v % 4)
  const leds = 1 + ((v >> 3) % 3)
  const twoContactors = ((v >> 5) & 1) === 1
  return (
    <svg viewBox="0 0 320 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="140" fill="#f6f8fb" />
      {/* caixa do quadro */}
      <rect x="24" y="16" width="272" height="108" rx="6" fill="#ffffff" stroke="#c2ccda" />
      {/* calhas DIN */}
      <path d="M32 46h256M32 92h256" stroke="#d3dbe5" strokeWidth="6" />
      {/* módulos de proteção (alguns ligados, outros desligados) */}
      {Array.from({ length: modules }).map((_, i) => {
        const on = i === 0 || ((v >> (i + 6)) & 1) === 1
        return (
          <g key={i}>
            <rect x={36 + i * 26} y={24} width="21" height="30" rx="2.5" fill="#eef4ff" stroke="#94b6fa" />
            <rect x={43.5 + i * 26} y={on ? 29 : 39} width="6" height="12" rx="1.5" fill={on ? '#2655e5' : '#aab4c2'} opacity={on ? 0.85 : 0.9} />
          </g>
        )
      })}
      {/* PLC */}
      <rect x={36} y={72} width="66" height="38" rx="3" fill="#dce7fd" stroke="#94b6fa" />
      <rect x={42} y={78} width="30" height="14" rx="2" fill="#ffffff" stroke="#94b6fa" />
      <circle cx={86} cy={82} r="2.4" fill="#16a34a" />
      <circle cx={94} cy={82} r="2.4" fill="#2655e5" opacity=".6" />
      <path d="M42 100h54" stroke="#94b6fa" strokeWidth="1.6" />
      {/* contactor(es) + fonte */}
      <rect x={112} y={72} width="46" height="38" rx="3" fill="#f6f8fb" stroke="#aab4c2" />
      <rect x={117} y={77} width="36" height="7" rx="1.5" fill="#ffffff" stroke="#d3dbe5" />
      {twoContactors ? (
        <>
          <rect x={164} y={72} width="30" height="38" rx="3" fill="#f6f8fb" stroke="#aab4c2" />
          <rect x={168} y={77} width="22" height="7" rx="1.5" fill="#ffffff" stroke="#d3dbe5" />
        </>
      ) : (
        <>
          <rect x={168} y={72} width="34" height="38" rx="3" fill="#f6f8fb" stroke="#aab4c2" />
          <path d="M174 80h22M174 86h22" stroke="#c2ccda" strokeWidth="1.6" />
        </>
      )}
      {/* bornes */}
      <g fill="#2655e5">
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={234 + i * 16} cy="84" r="4" opacity={i < leds ? 1 - i * 0.28 : 0.18} />
        ))}
      </g>
    </svg>
  )
}

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
  const [modal, setModal] = useState<{ type: 'create' | 'invite'; project?: Project } | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  const visible = projects.filter(
    (p) => (filter === 'all' || p.role === filter) && p.name.toLocaleLowerCase('pt-PT').includes(query.trim().toLocaleLowerCase('pt-PT')),
  )
  const owned = projects.filter((p) => p.role === 'owner').length

  const closeModal = () => {
    if (!modal || closing) return
    setClosing(true)
    window.setTimeout(() => {
      setModal(null)
      setClosing(false)
    }, 170)
  }

  const openModal = (type: 'create' | 'invite', project?: Project) => {
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

  useEffect(() => {
    if (!modal) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) closeModal()
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
          <p>Continue um quadro existente ou comece um novo projeto.</p>
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
      </div>

      <div className="dx-projects">
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
        {!loading && projects.length > 0 && (filter !== 'editor' || visible.length > 0) && (
          <button className="dx-proj-new" onClick={() => openModal('create')} style={visible.length === 0 && projects.length > 0 ? { display: 'none' } : undefined}>
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
          visible.map((p, index) => (
          <article className="dx-card dx-card-hover dx-proj" key={p.id} style={stagger(index + 1)}>
            <div
              className="dx-proj-art"
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('button')) void open(p.id)
              }}
            >
              <PanelPreview seed={p.id} />
              <span className="dx-proj-badge">{p.role === 'owner' ? 'Meu projeto' : 'Partilhado'}</span>
              {p.role === 'owner' && (
                <div className="dx-menu-wrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="dx-icon-btn"
                    aria-label={`Opções de ${p.name}`}
                    aria-expanded={menu === p.id}
                    onClick={() => setMenu(menu === p.id ? null : p.id)}
                  >
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
                          void onDelete(p)
                        }}
                      >
                        Eliminar projeto
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="dx-proj-body">
              <h3 title={p.name} onClick={() => void open(p.id)}>
                {p.name}
              </h3>
              <div className="dx-proj-meta">
                <span>por {p.owner}</span>
                <span>·</span>
                <span>rev. {p.revision}</span>
                <span>·</span>
                <span>{new Date(p.updated_at).toLocaleDateString('pt-PT')}</span>
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
        ))}

        {!loading && projects.length > 0 && visible.length === 0 && (
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
          <div className="dx-dialog" role="dialog" aria-modal="true" aria-labelledby="dx-dialog-title">
            <button className="dx-btn dx-btn-ghost dx-btn-sm dx-dialog-close" aria-label="Fechar" disabled={saving} onClick={closeModal}>
              ×
            </button>
            <div className="dx-empty-ic" style={{ margin: 0, width: 44, height: 44 }}>
              {modal.type === 'create' ? <IconPlus size={20} /> : <IconProjects size={20} />}
            </div>
            <h2 id="dx-dialog-title">{modal.type === 'create' ? 'Criar novo projeto' : 'Convidar editor'}</h2>
            <p>
              {modal.type === 'create'
                ? 'Dê um nome ao quadro. Poderá adicionar componentes assim que o projeto abrir.'
                : `Convide a outra conta autorizada para editar «${modal.project?.name}».`}
            </p>
            <form onSubmit={(e) => void submit(e)}>
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
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
