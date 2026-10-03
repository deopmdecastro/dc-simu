import Select from '../ui/Select'
import { useCatalogStore } from '../catalog/registry'
import { useMemo, useState, type ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import { paletteGroups } from '../electrical/factory'
import { COMPONENT_TO_LADDER, type PaletteKind } from './ladderDnd'
import { ELEMENT_KEYS } from './ladderShortcuts'
import { useLadderPrefs } from './ladderPrefs'
import { Kbd, ShortcutList } from './ShortcutsDialog'
import { IconClose, IconSearch } from '../ui/icons'

export type LadderSection = 'Projeto' | 'Biblioteca' | 'Dispositivos' | 'Diagnóstico' | 'Configurações'

export interface LadderPaletteGroup {
  title: string
  items: Array<{ kind: PaletteKind; label: string; detail: string }>
}

interface Props {
  section: Exclude<LadderSection, 'Projeto'>
  onAdd: (kind: PaletteKind) => void
  onOpenSchematic?: (componentId: string) => void
  /** grupos de elementos Ladder (vêm do editor, para evitar dependência circular) */
  groups: LadderPaletteGroup[]
  renderGlyph: (kind: PaletteKind) => ReactNode
}

/* ------------------------------------------------------------------ blocos base */

const norm = (text: string) => text.toLocaleLowerCase('pt-PT').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function PageHeader({ title, subtitle, stats }: { title: string; subtitle: string; stats?: Array<{ label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'error' }> }) {
  return (
    <header className="ls-header">
      <div className="ls-header-text">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {stats && (
        <div className="ls-stats">
          {stats.map((s) => (
            <div key={s.label} className={`ls-stat ${s.tone ? `is-${s.tone}` : ''}`}><strong>{s.value}</strong><span>{s.label}</span></div>
          ))}
        </div>
      )}
    </header>
  )
}

function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="ls-search">
      <IconSearch size={14} />
      <input aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onChange('')} />
      {value && <button onClick={() => onChange('')} aria-label="Limpar pesquisa" title="Limpar"><IconClose size={11} /></button>}
    </div>
  )
}

function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ id: T; label: string; count?: number }>; label: string }) {
  return (
    <div className="ls-chips" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'is-active' : ''} onClick={() => onChange(o.id)}>
          {o.label}{o.count !== undefined && <em>{o.count}</em>}
        </button>
      ))}
    </div>
  )
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return <div className="ls-empty"><strong>{title}</strong>{hint && <span>{hint}</span>}</div>
}

function Toggle({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint?: string }) {
  return (
    <label className="ls-setting">
      <span className="ls-setting-text"><strong>{title}</strong>{hint && <small>{hint}</small>}</span>
      <span className="ladder-switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="ladder-switch-track"><i /></span>
      </span>
    </label>
  )
}

function Segmented<T extends number | string>({ value, onChange, options, title, hint, format }: { value: T; onChange: (v: T) => void; options: T[]; title: string; hint?: string; format: (v: T) => string }) {
  return (
    <div className="ls-setting">
      <span className="ls-setting-text"><strong>{title}</strong>{hint && <small>{hint}</small>}</span>
      <div className="ls-segmented" role="radiogroup" aria-label={title}>
        {options.map((o) => <button key={String(o)} role="radio" aria-checked={value === o} className={value === o ? 'is-active' : ''} onClick={() => onChange(o)}>{format(o)}</button>)}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Biblioteca */

function Library({ onAdd, groups, renderGlyph }: Pick<Props, 'onAdd' | 'groups' | 'renderGlyph'>) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<string>('all')
  const catalogRevision = useCatalogStore((s) => s.revision)
  const schematicGroups = useMemo(() => paletteGroups(), [catalogRevision])
  const q = norm(query)
  const ladderGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !q || norm(`${i.label} ${i.detail} ${g.title}`).includes(q)) }))
    .filter((g) => g.items.length)
  const shownSchematic = schematicGroups
    .filter((g) => tab === 'all' || g.group === tab)
    .map((g) => ({ ...g, items: g.items.filter((i) => !q || norm(`${i.name} ${i.type} ${g.group}`).includes(q)) }))
    .filter((g) => g.items.length)
  const ladderCount = groups.reduce((n, g) => n + g.items.length, 0)
  const compCount = schematicGroups.reduce((n, g) => n + g.items.length, 0)
  const keyFor = (kind: PaletteKind) => { const k = ELEMENT_KEYS.find((e) => e.kind === kind); return k ? (k.shift ? ['Shift', k.key.toUpperCase()] : [k.key.toUpperCase()]) : null }
  const nothing = !ladderGroups.length && !shownSchematic.length

  return <>
    <PageHeader title="Biblioteca" subtitle="Elementos Ladder e componentes do esquema. Clique num elemento para o inserir na network ativa do OB1." stats={[{ label: 'Elementos Ladder', value: ladderCount }, { label: 'Componentes', value: compCount }]} />
    <div className="ls-toolbar">
      <SearchBox value={query} onChange={setQuery} placeholder="Pesquisar elementos e componentes…" label="Pesquisar biblioteca" />
    </div>

    {ladderGroups.map((g) => (
      <section key={g.title} className="ls-block">
        <h3>{g.title} <em>{g.items.length}</em></h3>
        <div className="ls-grid">
          {g.items.map((item) => {
            const keys = keyFor(item.kind)
            return (
              <button key={item.kind} className="ls-element" onClick={() => onAdd(item.kind)} title={`Inserir ${item.label} na network ativa`}>
                <span className="ls-element-glyph">{renderGlyph(item.kind)}</span>
                <span className="ls-element-text"><strong>{item.label}</strong><small>{item.detail}</small></span>
                {keys && <Kbd keys={keys} />}
              </button>
            )
          })}
        </div>
      </section>
    ))}

    <section className="ls-block">
      <h3>Componentes do esquema <em>referência</em></h3>
      <Chips label="Filtrar por grupo" value={tab} onChange={setTab} options={[{ id: 'all', label: 'Todos', count: compCount }, ...schematicGroups.map((g) => ({ id: g.group, label: g.group, count: g.items.length }))]} />
      {shownSchematic.map((g) => (
        <div key={g.group} className="ls-subblock">
          {tab === 'all' && <h4>{g.group}</h4>}
          <div className="ls-grid ls-grid-wide">
            {g.items.map((item) => {
              const eq = COMPONENT_TO_LADDER[item.type]
              return (
                <div className="ls-card" key={item.type}>
                  <strong>{item.name}</strong>
                  <small className="ls-mono">{item.type}</small>
                  {eq
                    ? <button className="ls-btn" onClick={() => onAdd(eq)}>Inserir equivalente ({eq})</button>
                    : <span className="ls-muted">Sem equivalente Ladder direto</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
    {nothing && <Empty title="Nada encontrado" hint={`Nenhum elemento corresponde a «${query}».`} />}
  </>
}

/* ------------------------------------------------------------------ Dispositivos */

function Devices({ onOpenSchematic }: Pick<Props, 'onOpenSchematic'>) {
  const components = useSimStore((s) => s.components)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const select = useSimStore((s) => s.selectComponents)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'on' | 'off'>('all')
  const [category, setCategory] = useState('all')
  const isOn = (c: (typeof components)[number]) => !!(c.state as { energized?: boolean; on?: boolean; running?: boolean; closed?: boolean }).energized || !!(c.state as { on?: boolean }).on || !!(c.state as { running?: boolean }).running
  const categories = useMemo(() => [...new Set(components.map((c) => String(c.category)))].sort(), [components])
  const q = norm(query)
  const shown = components
    .filter((c) => (!q || norm(`${c.ref} ${c.label} ${c.type}`).includes(q))
      && (status === 'all' || (status === 'on') === isOn(c))
      && (category === 'all' || String(c.category) === category))
    .sort((a, b) => a.ref.localeCompare(b.ref, 'pt-PT', { numeric: true }))
  const onCount = components.filter(isOn).length

  return <>
    <PageHeader title="Dispositivos" subtitle="Componentes presentes no esquema atual. Marque um dispositivo aqui e localize-o no inspetor da vista Esquema." stats={[{ label: 'Total', value: components.length }, { label: 'Energizados', value: onCount, tone: onCount ? 'ok' : undefined }, { label: 'Selecionados', value: selectedIds.length }]} />
    <div className="ls-toolbar">
      <SearchBox value={query} onChange={setQuery} placeholder="Pesquisar referência, nome ou tipo…" label="Pesquisar dispositivos" />
      <Chips label="Estado" value={status} onChange={setStatus} options={[{ id: 'all', label: 'Todos' }, { id: 'on', label: 'Energizados' }, { id: 'off', label: 'Desligados' }]} />
      {categories.length > 1 && (
        <Select className="ls-select" aria-label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Todas as categorias</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      )}
    </div>
    {!components.length
      ? <Empty title="Sem dispositivos" hint="Adicione componentes na vista Esquema (Ctrl+1)." />
      : !shown.length
        ? <Empty title="Nenhum dispositivo corresponde aos filtros" hint="Limpe a pesquisa ou altere o estado/categoria." />
        : <div className="ls-grid ls-grid-wide">
          {shown.map((c) => {
            const on = isOn(c)
            const picked = selectedIds.includes(c.id)
            return (
              <div key={c.id} className={`ls-card ls-device ${picked ? 'is-picked' : ''}`}>
                <div className="ls-device-head">
                  <span className="ls-ref">{c.ref}</span>
                  <span className={`ls-pill ${on ? 'is-on' : ''}`}><i />{on ? 'energizado' : 'desligado'}</span>
                </div>
                <strong>{c.label || c.type}</strong>
                <small className="ls-mono">{c.type} · {c.terminals.length} terminais</small>
                <button
                  className={`ls-btn ${picked ? 'is-done' : ''}`}
                  onClick={() => {
                    select([c.id], false)
                    onOpenSchematic?.(c.id)
                  }}
                  title="Selecionar este dispositivo e abrir a vista Esquema"
                >
                  {picked ? '✓ Abrir seleção no esquema' : 'Abrir no esquema'}
                </button>
              </div>
            )
          })}
        </div>}
  </>
}

/* ------------------------------------------------------------------ Diagnóstico */

function Diagnostics() {
  const diagnostics = useSimStore((s) => s.sim.diagnostics)
  const events = useSimStore((s) => s.sim.events)
  const sim = useSimStore((s) => s.sim)
  const table = useSimStore((s) => s.runtime.table)
  const rungs = useSimStore((s) => s.ladder.rungs)
  const select = useSimStore((s) => s.selectComponents)
  const [level, setLevel] = useState<'all' | 'error' | 'warning' | 'info'>('all')
  const errors = diagnostics.filter((d) => d.level === 'error').length
  const warnings = diagnostics.filter((d) => d.level === 'warning').length
  const shown = diagnostics.filter((d) => level === 'all' || d.level === level)
  const io = Object.entries(table).filter(([key]) => /^[IQ]/.test(key))
  const label = (l: string) => (l === 'error' ? 'Erro' : l === 'warning' ? 'Aviso' : 'Info')

  return <>
    <PageHeader title="Diagnóstico" subtitle="Estado do último scan, problemas detetados e sinais de entrada/saída." stats={[
      { label: 'Estado', value: sim.runState }, { label: 'Scans', value: sim.scanCount }, { label: 'Networks', value: rungs.length },
      { label: 'Erros', value: errors, tone: errors ? 'error' : undefined }, { label: 'Avisos', value: warnings, tone: warnings ? 'warn' : undefined },
    ]} />
    <section className="ls-block">
      <h3>Problemas detetados <em>{diagnostics.length}</em></h3>
      <Chips label="Filtrar por gravidade" value={level} onChange={setLevel} options={[{ id: 'all', label: 'Todos' }, { id: 'error', label: 'Erros' }, { id: 'warning', label: 'Avisos' }, { id: 'info', label: 'Informação' }]} />
      {!shown.length
        ? <Empty title={diagnostics.length ? 'Sem resultados para este filtro' : 'Tudo em ordem'} hint={diagnostics.length ? undefined : 'Não foram detetados problemas no último scan.'} />
        : <div className="ls-list">
          {shown.map((d) => (
            <div className={`ls-issue is-${d.level}`} key={d.id}>
              <span className="ls-badge">{label(d.level)}</span>
              <span className="ls-issue-msg">{d.message}</span>
              {d.componentId && <button className="ls-btn" onClick={() => select([d.componentId!], false)}>Selecionar componente</button>}
            </div>
          ))}
        </div>}
    </section>
    <section className="ls-block">
      <h3>Entradas e saídas <em>{io.length}</em></h3>
      {io.length
        ? <div className="ls-io">{io.map(([key, value]) => <span key={key} className={`ls-led ${value ? 'is-on' : ''}`}><i />{key}<b>{value ? 'ON' : 'OFF'}</b></span>)}</div>
        : <Empty title="Sem sinais para mostrar" hint="Execute a simulação para ver o estado das entradas e saídas." />}
    </section>
    <section className="ls-block">
      <h3>Eventos recentes</h3>
      {events.length
        ? <div className="ls-list">{events.slice(0, 20).map((e) => <div className="ls-event" key={e.id}><span className={`ls-badge is-${e.level}`}>{label(e.level)}</span>{e.message}</div>)}</div>
        : <Empty title="Sem eventos registados" />}
    </section>
  </>
}

/* ------------------------------------------------------------------ Configurações */

function Settings() {
  const grid = useSimStore((s) => s.grid)
  const setGrid = useSimStore((s) => s.setGrid)
  const sim = useSimStore((s) => s.sim)
  const setSpeed = useSimStore((s) => s.setSpeed)
  const rungs = useSimStore((s) => s.ladder.rungs)
  const deviceCount = useSimStore((s) => s.components.length)
  const prefs = useLadderPrefs()
  const [shortcutQuery, setShortcutQuery] = useState('')

  return <>
    <PageHeader title="Configurações" subtitle="Definições do editor e da simulação. A malha e a velocidade acompanham o projeto; as preferências do editor ficam neste navegador." />
    <div className="ls-settings-layout">
      <div className="ls-settings-col">
        <section className="ls-panel">
          <h3>Malha</h3>
          <Toggle checked={grid.enabled} onChange={(v) => setGrid({ enabled: v })} title="Mostrar malha" hint="Grelha de fundo na área das networks" />
          <Toggle checked={grid.snap} onChange={(v) => setGrid({ snap: v })} title="Ajustar à malha" hint="Ativa o encaixe à grelha nas vistas de edição" />
          <Segmented value={grid.size} onChange={(v) => setGrid({ size: v })} options={[10, 20, 25, 40]} title="Espaçamento" format={(v) => `${v}px`} />
        </section>
        <section className="ls-panel">
          <h3>Simulação</h3>
          <Segmented value={sim.speed} onChange={setSpeed} options={[0.25, 0.5, 1, 2, 4]} title="Velocidade" hint="Multiplicador do tempo de scan" format={(v) => `${v}×`} />
        </section>
        <section className="ls-panel">
          <h3>Editor Ladder</h3>
          <Toggle checked={prefs.confirmDelete} onChange={(v) => prefs.set({ confirmDelete: v })} title="Confirmar antes de eliminar networks" hint="Desligado por omissão — Ctrl+Z repõe a network eliminada" />
          <Toggle checked={prefs.autoScroll} onChange={(v) => prefs.set({ autoScroll: v })} title="Deslocar para a network ativa" hint="Ao navegar com o teclado, mantém a network visível" />
          <Toggle checked={prefs.showToasts} onChange={(v) => prefs.set({ showToasts: v })} title="Avisos rápidos" hint={'Mostra “Desfeito”, “Network duplicada”, etc.'} />
          <div className="ls-actions"><button className="ls-btn" onClick={prefs.reset}>Repor preferências do editor</button></div>
        </section>
        <section className="ls-panel">
          <h3>Programa</h3>
          <div className="ls-tiles">
            <div><strong>{rungs.length}</strong><span>Networks</span></div>
            <div><strong>{deviceCount}</strong><span>Dispositivos</span></div>
          </div>
          <p className="ls-muted">A simulação Ladder executa de cima para baixo, em cada scan.</p>
        </section>
      </div>
      <section className="ls-panel ls-shortcuts-panel">
        <h3>Atalhos de teclado</h3>
        <SearchBox value={shortcutQuery} onChange={setShortcutQuery} placeholder="Filtrar atalhos…" label="Filtrar atalhos" />
        <ShortcutList query={shortcutQuery} />
      </section>
    </div>
  </>
}

/* ------------------------------------------------------------------ entrada */

export default function LadderSections({ section, onAdd, onOpenSchematic, groups, renderGlyph }: Props) {
  return (
    <section className="ladder-section-view ls-page" aria-label={section}>
      <div className="ls-inner">
        {section === 'Biblioteca' && <Library onAdd={onAdd} groups={groups} renderGlyph={renderGlyph} />}
        {section === 'Dispositivos' && <Devices onOpenSchematic={onOpenSchematic} />}
        {section === 'Diagnóstico' && <Diagnostics />}
        {section === 'Configurações' && <Settings />}
      </div>
    </section>
  )
}
