import { useEffect, useState } from 'react'
import { LogoMark } from '../ui/Brand'
import { IconSearch, IconLayers, IconFile, IconProjects, IconTag, IconPlus } from '../ui/icons'

export type User = { id: string; name: string; email: string; role: 'admin' | 'user' }
export type Project = { id: string; name: string; revision: number; owner: string; role: 'owner' | 'editor'; updated_at: string }
export type Invite = { id: string; project: string; sender: string }

/** Pré-visualização técnica do quadro (blueprint) usada nos cartões de projeto. */
function PanelPreview({ variant = 0 }: { variant?: number }) {
  const modules = 5 + (variant % 3)
  return (
    <svg viewBox="0 0 320 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id={`dxg-${variant}`} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0v16" fill="none" stroke="#d4dbe3" strokeWidth=".7" />
        </pattern>
      </defs>
      <rect width="320" height="140" fill="#f2f4f7" />
      <rect width="320" height="140" fill={`url(#dxg-${variant})`} />
      {/* caixa do quadro */}
      <rect x="24" y="16" width="272" height="104" rx="6" fill="#ffffff" stroke="#bcc7d3" />
      {/* calha DIN com furação */}
      <g stroke="#9aa8b8" strokeWidth="1.4">
        <path d="M32 46h256M32 90h256" />
      </g>
      <g fill="#b8c2ce">
        {Array.from({ length: 9 }).map((_, i) => (
          <circle key={i} cx={44 + i * 29} cy="46" r="1.3" />
        ))}
      </g>
      {/* módulos de proteção */}
      {Array.from({ length: modules }).map((_, i) => (
        <g key={i}>
          <rect x={36 + i * 26} y={24} width="21" height="30" rx="2.5" fill="#dde3ea" stroke="#93a3b4" />
          <rect x={40 + i * 26} y={28} width="13" height="7" rx="1.5" fill="#fff" stroke="#aeb9c6" />
          <rect x={43.5 + i * 26} y={39} width="6" height="9" rx="1" fill="#39434f" opacity=".75" />
        </g>
      ))}
      {/* PLC — ecrã com RUN */}
      <rect x={36} y={72} width="66" height="36" rx="3" fill="#10161d" />
      <text x={45} y={93} fontFamily="'JetBrains Mono', monospace" fontSize="10" fill="#3ddc84">
        RUN
      </text>
      <circle cx={93} cy={87} r="2.2" fill="#f5a524" />
      <circle cx={93} cy={96} r="2.2" fill="#3ddc84" opacity=".8" />
      {/* contactor + fonte */}
      <rect x={112} y={72} width="46" height="36" rx="3" fill="#dde3ea" stroke="#93a3b4" />
      <rect x={117} y={77} width="36" height="6" rx="1" fill="#fff" />
      <rect x={168} y={72} width="34" height="36" rx="3" fill="#dde3ea" stroke="#93a3b4" />
      <path d="M173 79h24M173 84h24" stroke="#aeb9c6" strokeWidth="1.6" />
      {/* bornes de fase */}
      <g fill="#f5a524" stroke="#b9720a" strokeWidth=".8">
        <circle cx="234" cy="84" r="4" />
        <circle cx="250" cy="84" r="4" opacity=".6" />
        <circle cx="266" cy="84" r="4" opacity=".35" />
      </g>
      {/* etiqueta do projeto */}
      <rect x={24} y={124} width="76" height="10" rx="2" fill="#e2e7ec" />
    </svg>
  )
}

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

  const visible = projects.filter(
    (p) => (filter === 'all' || p.role === filter) && p.name.toLocaleLowerCase('pt-PT').includes(query.trim().toLocaleLowerCase('pt-PT')),
  )
  const owned = projects.filter((p) => p.role === 'owner').length

  const openModal = (type: 'create' | 'invite', project?: Project) => {
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
      setModal(null)
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
      if (e.key === 'Escape' && !saving) setModal(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [modal, saving])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
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
          <p>Continue um quadro existente ou comece um novo projeto em 3D.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, marginLeft: 'auto' }}>
          <span className="dx-dash-date">{today}</span>
          <button className="dx-btn dx-btn-primary" onClick={() => openModal('create')}>
            <IconPlus size={14} /> Novo projeto
          </button>
        </div>
      </div>

      <div className="dx-metrics">
        {[
          [IconLayers, projects.length, 'Projetos acessíveis'],
          [IconFile, owned, 'Da sua autoria'],
          [IconProjects, projects.length - owned, 'Partilhados consigo'],
          [IconTag, invites.length, 'Convites pendentes'],
        ].map(([Ic, n, label]) => (
          <div className="dx-metric" key={String(label)}>
            <i aria-hidden>
              {(Ic as typeof IconLayers)({ size: 16 })}
            </i>
            <span>
              <b>{n as number}</b>
              <small>{label as string}</small>
            </span>
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <div className="dx-invites">
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
                  Aceitar →
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
        {projects.length > 0 && (filter !== 'editor' || visible.length > 0) && (
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

        {visible.map((p, index) => (
          <article className="dx-card dx-card-hover dx-proj" key={p.id}>
            <div className="dx-proj-art">
              <PanelPreview variant={index} />
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
              <h3 title={p.name}>{p.name}</h3>
              <div className="dx-proj-meta">
                <span>por {p.owner}</span>
                <span>·</span>
                <span>rev. {p.revision}</span>
                <span>·</span>
                <span>{new Date(p.updated_at).toLocaleDateString('pt-PT')}</span>
              </div>
              <div className="dx-proj-actions">
                <button className="dx-btn dx-btn-primary" disabled={opening === p.id} onClick={() => void open(p.id)}>
                  {opening === p.id ? 'A abrir…' : 'Abrir no editor 3D'}
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

        {projects.length > 0 && visible.length === 0 && (
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

        {projects.length === 0 && (
          <div className="dx-empty">
            <div className="dx-empty-ic" style={{ background: 'transparent', border: '1px dashed var(--dx-accent-line)' }}>
              <LogoMark size={34} />
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
          className="dx-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setModal(null)
          }}
        >
          <div className="dx-dialog" role="dialog" aria-modal="true" aria-labelledby="dx-dialog-title">
            <button className="dx-btn dx-btn-ghost dx-btn-sm dx-dialog-close" aria-label="Fechar" disabled={saving} onClick={() => setModal(null)}>
              ×
            </button>
            <div className="dx-empty-ic" style={{ margin: 0, width: 44, height: 44 }}>
              {modal.type === 'create' ? <IconPlus size={20} /> : <IconProjects size={20} />}
            </div>
            <h2 id="dx-dialog-title">{modal.type === 'create' ? 'Criar novo projeto' : 'Convidar editor'}</h2>
            <p>
              {modal.type === 'create'
                ? 'Dê um nome ao quadro. Poderá adicionar componentes assim que o projeto abrir.'
                : `Convide um utilizador registado para editar «${modal.project?.name}».`}
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
                <button type="button" className="dx-btn dx-btn-ghost" disabled={saving} onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="dx-btn dx-btn-primary" disabled={saving || !value.trim()}>
                  {saving ? 'A guardar…' : modal.type === 'create' ? 'Criar projeto' : 'Enviar convite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
