import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { newId } from '../catalog/definition'
import { allProfiles, useProfileStore } from '../catalog/profileStore'
import { checkConnection, COMPAT_LABEL, type CompatTerminal } from '../catalog/terminalCompat'
import { BUILTIN_PROFILES, defaultParams, FACES, inferFromFunction, profileCategories, SUGGESTED_PROFILES, TERMINAL_CHIPS, type Face, type ProfileParams, type StoredProfile, type TerminalProfile, type TerminalSpec } from '../catalog/terminalProfiles'
import type { ComponentCategory } from '../types'
import { Check, Confirm, Field, Num, Select, Text } from '../admin/editor3d/ui'
import { IconCheck, IconClose, IconStar, IconSwap, IconWarning } from '../ui/icons'

export const DND_PROFILE = 'application/x-dcsimu-profile'
export const DND_TERMINAL = 'application/x-dcsimu-terminal'

const DIRECTION_LABEL = { in: 'Entrada', out: 'Saída', io: 'E/S' } as const
const FACE_LABEL = Object.fromEntries(FACES) as Record<Face, string>
const KIND_LABEL: Record<string, string> = { 'power-in': 'Alimentação', 'power-out': 'Saída potência', 'coil-plus': 'Bobina +', 'coil-minus': 'Bobina −', 'aux-no': 'NA', 'aux-nc': 'NF', neutral: 'Neutro', earth: 'Terra', analog: 'Analógico', bus: 'Comunicação', io: 'E/S' }

/** Pré-visualização por face: mostra onde cada borne do perfil fica. */
export function FacePreview({ specs }: { specs: TerminalSpec[] }) {
  const faces = FACES.filter(([face]) => specs.some((item) => item.face === face))
  return <div className="tl-faces">
    {faces.map(([face, label]) => <div key={face} className="tl-face-row">
      <span className="tl-face-name">{label}</span>
      <span className="tl-face-pills">{specs.filter((item) => item.face === face).map((item, index) => <i key={`${item.label}${index}`} className="tl-pill" style={{ borderColor: item.color }} title={`${item.name} · ${item.fn}`}><b style={{ background: item.color }} />{item.label}</i>)}</span>
    </div>)}
  </div>
}

function ParamForm({ profile, params, onChange }: { profile: TerminalProfile; params: ProfileParams; onChange: (params: ProfileParams) => void }) {
  if (!profile.params?.length) return null
  return <div className="tl-params">
    {profile.params.map((param) => param.type === 'bool'
      ? <Check key={param.key} label={param.label} checked={params[param.key] === true} onChange={(value) => onChange({ ...params, [param.key]: value })} />
      : param.type === 'number'
        ? <Field key={param.key} label={param.label}><Num value={Number(params[param.key] ?? param.default)} min={param.min} max={param.max} onChange={(value) => onChange({ ...params, [param.key]: value })} /></Field>
        : <Field key={param.key} label={param.label}><Select value={String(params[param.key] ?? param.default)} options={param.options ?? []} onChange={(value) => onChange({ ...params, [param.key]: value })} /></Field>)}
  </div>
}

function SpecTable({ specs }: { specs: TerminalSpec[] }) {
  return <div className="tl-table-wrap"><table className="tl-table">
    <thead><tr><th>Rótulo</th><th>Nome</th><th>Função</th><th>Face</th><th>Sentido</th></tr></thead>
    <tbody>{specs.map((item, index) => <tr key={`${item.label}${index}`}>
      <td><i className="tl-dot" style={{ background: item.color }} />{item.label}</td><td>{item.name}</td><td>{item.fn}{item.contact ? ` · ${item.contact}` : ''}</td><td>{FACE_LABEL[item.face]}</td><td>{DIRECTION_LABEL[item.direction]}</td>
    </tr>)}</tbody>
  </table></div>
}

/* ----------------------------------------------------- editor de perfis (admin) */
export function ProfileEditorDialog({ initial, onClose, onSaved }: { initial?: Partial<StoredProfile>; onClose: () => void; onSaved?: (profile: StoredProfile) => void }) {
  const save = useProfileStore((s) => s.save)
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [specs, setSpecs] = useState<TerminalSpec[]>(initial?.specs?.length ? initial.specs : [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const patch = (index: number, value: Partial<TerminalSpec>) => setSpecs((list) => list.map((item, i) => (i === index ? { ...item, ...value } : item)))
  const add = () => setSpecs((list) => [...list, { label: String(list.length + 1), name: `Borne ${list.length + 1}`, fn: '', kind: 'io', polarity: 'none', electricalClass: 'other', direction: 'io', terminalType: 'screw', color: '#cbd5e1', face: 'front' }])
  const labels = specs.map((item) => item.label)
  const duplicated = labels.filter((label, index) => labels.indexOf(label) !== index)

  async function submit() {
    if (!name.trim()) { setError('Dê um nome ao perfil.'); return }
    if (!specs.length) { setError('Adicione pelo menos um borne.'); return }
    if (duplicated.length) { setError(`Rótulos repetidos: ${[...new Set(duplicated)].join(', ')}.`); return }
    setBusy(true); setError('')
    try {
      const profile = { id: initial?.id ?? newId('p_'), name: name.trim(), category: category.trim(), description: description.trim(), specs }
      await save(profile)
      onSaved?.(profile)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível guardar o perfil.') } finally { setBusy(false) }
  }

  return createPortal(<div className="ce-modal ce-modal-fixed" role="dialog" aria-modal="true" aria-label="Perfil de bornes" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <form className="ce-modal-card tl-editor" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <h2>{initial?.id ? 'Editar perfil de bornes' : 'Novo perfil de bornes'}</h2>
      <p className="ce-hint">Um perfil é uma sugestão reutilizável: ao aplicá-lo, cada borne continua editável. Fica visível na biblioteca de todos os utilizadores.</p>
      <Field label="Nome"><Text value={name} onChange={setName} placeholder="Ex.: Disjuntor diferencial 2P" /></Field>
      <Field label="Categoria" hint="Ex.: Proteção, Sensores… (opcional)"><Text value={category} onChange={setCategory} /></Field>
      <Field label="Descrição"><Text value={description} onChange={setDescription} /></Field>
      <div className="tl-editor-rows">
        <div className="tl-editor-head"><span>Rótulo</span><span>Nome</span><span>Função</span><span>Face</span><span>Sentido</span><span /></div>
        {specs.map((item, index) => <div key={index} className="tl-editor-row">
          <input className="dx-input" value={item.label} aria-label="Rótulo" onChange={(event) => patch(index, { label: event.target.value })} />
          <input className="dx-input" value={item.name} aria-label="Nome" onChange={(event) => patch(index, { name: event.target.value })} />
          <input className="dx-input" value={item.fn} aria-label="Função" title="Ao sair do campo, sugerimos tipo, polaridade e cor" onChange={(event) => patch(index, { fn: event.target.value })}
            onBlur={() => { const inferred = inferFromFunction(item.fn); patch(index, { kind: inferred.kind, polarity: inferred.polarity, electricalClass: inferred.electricalClass, contact: inferred.contact, color: inferred.color ?? item.color, direction: inferred.direction ?? item.direction }) }} />
          <select className="dx-input" value={item.face} aria-label="Face" onChange={(event) => patch(index, { face: event.target.value as Face })}>{FACES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          <select className="dx-input" value={item.direction} aria-label="Sentido" onChange={(event) => patch(index, { direction: event.target.value as TerminalSpec['direction'] })}><option value="io">E/S</option><option value="in">Entrada</option><option value="out">Saída</option></select>
          <button type="button" className="ce-icon" title="Remover borne" aria-label="Remover borne" onClick={() => setSpecs((list) => list.filter((_, i) => i !== index))}><IconClose size={12} /></button>
        </div>)}
        <button type="button" className="dx-btn dx-btn-secondary dx-btn-sm" onClick={add}>+ Borne</button>
      </div>
      {error && <p className="ce-error" role="alert">{error}</p>}
      <div className="ce-modal-actions">
        <button type="button" className="dx-btn dx-btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="submit" className="dx-btn dx-btn-primary" disabled={busy}>{busy ? 'A guardar…' : 'Guardar perfil'}</button>
      </div>
    </form>
  </div>, document.body)
}

/* -------------------------------------------------------------- compatibilidade */
function toCompat(item: TerminalSpec): CompatTerminal { return { fn: item.fn, label: item.label, kind: item.kind, polarity: item.polarity, electricalClass: item.electricalClass, direction: item.direction, contact: item.contact, group: item.group } }

function CompatTester({ profiles }: { profiles: TerminalProfile[] }) {
  const options = useMemo(() => profiles.map((profile) => ({ profile, specs: profile.build(defaultParams(profile)) })).filter((entry) => entry.specs.length), [profiles])
  const [pa, setPa] = useState('breaker-3p'), [ia, setIa] = useState(1)
  const [pb, setPb] = useState('motor-3ph'), [ib, setIb] = useState(0)
  const specsOf = (id: string) => options.find((entry) => entry.profile.id === id)?.specs ?? []
  const a = specsOf(pa)[ia], b = specsOf(pb)[ib]
  const result = a && b ? checkConnection(toCompat(a), toCompat(b)) : null
  const side = (value: string, setValue: (v: string) => void, index: number, setIndex: (v: number) => void) => <div className="tl-compat-side">
    <select className="dx-input" value={value} onChange={(event) => { setValue(event.target.value); setIndex(0) }} aria-label="Perfil">{options.map(({ profile }) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>
    <select className="dx-input" value={index} onChange={(event) => setIndex(Number(event.target.value))} aria-label="Borne">{specsOf(value).map((item, i) => <option key={i} value={i}>{item.label} · {item.name}</option>)}</select>
  </div>
  return <div className="tl-compat">
    <p className="ce-hint">Escolha dois bornes e veja se a ligação é aceitável. As regras são conservadoras e servem de aviso — nunca bloqueiam o editor.</p>
    {side(pa, setPa, ia, setIa)}
    <div className="tl-compat-link"><IconSwap size={13} /> ligar a</div>
    {side(pb, setPb, ib, setIb)}
    {result && <div className={`tl-verdict is-${result.level}`} role="status">
      <strong className="tl-verdict-title">{result.level === 'ok' ? <IconCheck size={13} /> : <IconWarning size={13} />}{COMPAT_LABEL[result.level]}</strong>
      {result.messages.length > 0 ? <ul>{result.messages.map((message) => <li key={message}>{message}</li>)}</ul> : <span>Sem avisos para esta combinação.</span>}
    </div>}
  </div>
}

/* ----------------------------------------------------------------- biblioteca */
export interface TerminalLibraryProps {
  mode: 'browse' | 'insert'
  suggestFor?: ComponentCategory
  canEdit?: boolean
  onInsert?: (profile: TerminalProfile, params: ProfileParams, replace: boolean) => void
  onArmChip?: (spec: TerminalSpec) => void
  armedLabel?: string | null
  /** Bornes do componente aberto (para «Guardar como perfil»). */
  currentSpecs?: () => TerminalSpec[]
}

export default function TerminalLibrary({ mode, suggestFor, canEdit, onInsert, onArmChip, armedLabel, currentSpecs }: TerminalLibraryProps) {
  const custom = useProfileStore((s) => s.custom)
  const load = useProfileStore((s) => s.load)
  const remove = useProfileStore((s) => s.remove)
  useEffect(() => { void load() }, [load])
  const profiles = useMemo(() => allProfiles(custom), [custom])
  const categories = useMemo(() => profileCategories(profiles), [profiles])
  const [tab, setTab] = useState<'profiles' | 'terminals' | 'compat'>('profiles')
  const [query, setQuery] = useState('')
  const [top, setTop] = useState<string | null>(null)
  const [sub, setSub] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paramsById, setParamsById] = useState<Record<string, ProfileParams>>({})
  const [replace, setReplace] = useState(false)
  const [editing, setEditing] = useState<Partial<StoredProfile> | null>(null)
  const [suggestedOnly, setSuggestedOnly] = useState(!!suggestFor)
  const suggestedIds = suggestFor ? SUGGESTED_PROFILES[suggestFor] ?? [] : []
  const insert = mode === 'insert'

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return profiles.filter((profile) => {
      if (suggestedOnly && suggestedIds.length && !q && !top && !suggestedIds.includes(profile.id)) return false
      if (top && profile.category[0] !== top) return false
      if (sub && profile.category[1] !== sub) return false
      if (!q) return true
      const labels = profile.build(defaultParams(profile)).map((item) => `${item.label} ${item.fn}`).join(' ')
      return `${profile.name} ${profile.description} ${profile.category.join(' ')} ${labels}`.toLowerCase().includes(q)
    })
  }, [profiles, query, top, sub, suggestedOnly, suggestedIds])

  const selected = profiles.find((profile) => profile.id === selectedId) ?? null
  const params = selected ? paramsById[selected.id] ?? defaultParams(selected) : {}
  const selectedSpecs = useMemo(() => (selected ? selected.build(params) : []), [selected, params])
  const stored = selected?.custom ? custom.find((entry) => entry.id === selected.id) : undefined
  const onDragProfile = (event: DragEvent, profile: TerminalProfile) => {
    event.dataTransfer.setData(DND_PROFILE, JSON.stringify({ id: profile.id, params: paramsById[profile.id] ?? defaultParams(profile) }))
    event.dataTransfer.effectAllowed = 'copy'
  }

  return <div className={`tl-root is-${mode}`}>
    <div className="tl-tabs" role="tablist">
      {([['profiles', 'Perfis'], ['terminals', 'Bornes soltos'], ['compat', 'Compatibilidade']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </div>

    {tab === 'profiles' && <>
      <div className="tl-search"><input className="dx-input" type="search" placeholder="Pesquisar perfis, funções (L1, A1, 13…)" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Pesquisar perfis" /></div>
      <div className="tl-cats" aria-label="Categorias">
        {suggestFor && <button className={`tl-cat${suggestedOnly && !top ? ' is-on' : ''}`} onClick={() => { setSuggestedOnly(true); setTop(null); setSub(null) }}><IconStar size={12} /> Sugeridos</button>}
        <button className={`tl-cat${!suggestedOnly && !top ? ' is-on' : ''}`} onClick={() => { setSuggestedOnly(false); setTop(null); setSub(null) }}>Todos</button>
        {categories.map((category) => <button key={category.name} className={`tl-cat${top === category.name ? ' is-on' : ''}`} onClick={() => { setTop(category.name); setSub(null); setSuggestedOnly(false) }}>{category.name}</button>)}
      </div>
      {top && (categories.find((category) => category.name === top)?.children.length ?? 0) > 1 && <div className="tl-cats is-sub">
        <button className={`tl-cat${!sub ? ' is-on' : ''}`} onClick={() => setSub(null)}>Todas</button>
        {categories.find((category) => category.name === top)!.children.map((child) => <button key={child} className={`tl-cat${sub === child ? ' is-on' : ''}`} onClick={() => setSub(child)}>{child}</button>)}
      </div>}
      <div className="tl-list">
        {visible.length === 0 && <p className="ce-empty">Nenhum perfil encontrado. {canEdit ? 'Crie um perfil novo em «+ Novo perfil».' : ''}</p>}
        {visible.map((profile) => {
          const open = selectedId === profile.id
          const count = profile.build(paramsById[profile.id] ?? defaultParams(profile)).length
          return <div key={profile.id} className={`tl-card${open ? ' is-open' : ''}`}>
            <button className="tl-card-head" draggable={insert} onDragStart={(event) => onDragProfile(event, profile)} onClick={() => setSelectedId(open ? null : profile.id)} aria-expanded={open}
              title={insert ? 'Clique para ver · arraste para o viewport para aplicar' : 'Clique para ver os bornes'}>
              <span className="tl-card-title">{profile.name}{profile.custom && <em>personalizado</em>}{suggestedIds.includes(profile.id) && <em className="is-sug">sugerido</em>}</span>
              <span className="tl-card-sub">{profile.category.join(' › ')} · {count} {count === 1 ? 'borne' : 'bornes'}</span>
            </button>
            {open && selected && <div className="tl-card-body">
              <p className="tl-desc">{selected.description}</p>
              <ParamForm profile={selected} params={params} onChange={(next) => setParamsById((all) => ({ ...all, [selected.id]: next }))} />
              <FacePreview specs={selectedSpecs} />
              <SpecTable specs={selectedSpecs} />
              {insert && <div className="tl-actions">
                <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={() => onInsert?.(selected, params, replace)}>+ Adicionar {selected.name}</button>
                <Check checked={replace} onChange={setReplace} label="Substituir os bornes atuais" />
              </div>}
              {!insert && <p className="ce-hint">Pode usar este perfil ao criar ou editar um componente 3D. É apenas uma sugestão — todos os bornes ficam editáveis.</p>}
              {canEdit && selected.custom && stored && <div className="tl-actions">
                <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setEditing(stored)}>Editar perfil</button>
                <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setEditing({ name: `${stored.name} (cópia)`, category: stored.category, description: stored.description, specs: stored.specs })}>Duplicar</button>
                <Confirm label="Eliminar" className="dx-btn dx-btn-danger dx-btn-sm" onConfirm={() => { void remove(stored.id); setSelectedId(null) }} />
              </div>}
              {canEdit && !selected.custom && <div className="tl-actions"><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setEditing({ name: `${selected.name} (personalizado)`, category: selected.category[0], description: selected.description, specs: selectedSpecs })}>Duplicar como perfil personalizado</button></div>}
            </div>}
          </div>
        })}
      </div>
      {canEdit && <div className="tl-foot">
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setEditing({ specs: [] })}>+ Novo perfil</button>
        {currentSpecs && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const specs = currentSpecs(); if (specs.length) setEditing({ name: '', specs }) }} title="Guarda os bornes deste componente como perfil reutilizável">Guardar bornes atuais como perfil</button>}
      </div>}
    </>}

    {tab === 'terminals' && <div className="tl-chips">
      <p className="ce-hint">{insert ? 'Clique num borne e depois na superfície do modelo — ou arraste-o para o viewport.' : 'Bornes simples que pode colocar em qualquer componente.'}</p>
      {armedLabel && <p className="tl-armed">A colocar «{armedLabel}» · Esc cancela</p>}
      {TERMINAL_CHIPS.map((group) => <div key={group.group} className="tl-chip-group">
        <h4>{group.group}</h4>
        <div className="tl-chip-row">{group.items.map((item) => <button key={item.label} className={`tl-chip${armedLabel === item.label ? ' is-on' : ''}`} disabled={!insert} draggable={insert}
          onDragStart={(event) => { event.dataTransfer.setData(DND_TERMINAL, JSON.stringify(item)); event.dataTransfer.effectAllowed = 'copy' }} onClick={() => onArmChip?.(item)} title={`${item.name} · ${item.fn}`}>
          <b style={{ background: item.color }} />{item.label}
        </button>)}</div>
      </div>)}
      <h4>Legenda dos tipos</h4>
      <div className="tl-legend">{Object.entries(KIND_LABEL).map(([id, label]) => <span key={id}>{label}</span>)}</div>
    </div>}

    {tab === 'compat' && <CompatTester profiles={profiles.length ? profiles : BUILTIN_PROFILES} />}
    {editing && <ProfileEditorDialog initial={editing} onClose={() => setEditing(null)} onSaved={(profile) => setSelectedId(profile.id)} />}
  </div>
}
