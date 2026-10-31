// Lateral esquerda do simulador de comandos: Biblioteca de símbolos IEC e Inspetor
// (mesma estrutura da biblioteca/inspetor do Esquema 3D).
import { useEffect, useMemo, useState } from 'react'
import SidePanelHeader from '../components/SidePanelHeader'
import { IconChevronDown, IconProjects, IconSearch } from '../ui/icons'
import { useSimStore } from '../store/useSimStore'
import { CMD_PALETTE, CMD_PARTS, emptyCommands, partBox, partTerminals, type CmdKind, type CmdPart } from './model'
import { symbolBody } from './symbols'
import { useCommandsUi } from './commandsUi'
import { patchPart, removeSelected, rotateSelected } from './editing'
import { devicesOf } from './engine'

const SUPPLY_PRESETS = [['L1', 'L2', 'L3'], ['L1', 'L2', 'L3', 'N'], ['L1', 'L2', 'L3', 'N', 'PE'], ['L1', 'N'], ['L1'], ['L2'], ['L3'], ['N'], ['PE'], ['L+'], ['M']]
const NC_AT_REST: CmdKind[] = ['contactNC', 'timedNC', 'thermalNC', 'pushNC', 'emergency']

const FAVORITES_KEY = 'dcsimu:commands:library:favorites'
const COLLAPSED_KEY = 'dcsimu:commands:library:collapsed'
/** Pastas abertas na primeira utilização: as que se usam para montar o primeiro circuito. */
const DEFAULT_OPEN = ['Alimentação', 'Botões e sensores', 'Contactores e relés']
const readKinds = (key: string): CmdKind[] => {
  try { return (JSON.parse(localStorage.getItem(key) ?? '[]') as string[]).filter((k): k is CmdKind => k in CMD_PARTS) } catch { return [] }
}

/** Miniatura do símbolo IEC (a mesma geometria do esquema, em repouso). */
function SymbolThumb({ kind }: { kind: CmdKind }) {
  const lines = kind === 'supply' ? ['L1', 'L2', 'L3'] : undefined
  const box = partBox({ id: 'pv', kind, x: 0, y: 0, rot: 0, tag: '', lines })
  const side = Math.max(box.w, box.h) + 24
  const cx = box.x + box.w / 2
  // A alimentação tem as legendas L1 L2 L3 por cima do borne: sobe um pouco o centro.
  const cy = box.y + box.h / 2 - (kind === 'supply' ? 4 : 0)
  return <svg width={58} height={58} viewBox={`${cx - side / 2} ${cy - side / 2} ${side} ${side}`} aria-hidden="true">
    <g fill="none" stroke="#1e293b" strokeWidth={Math.max(1.6, side / 52)} strokeLinecap="round" strokeLinejoin="round">{symbolBody({ kind, lines, color: 'green' }, { idle: true, closed: NC_AT_REST.includes(kind) })}</g>
  </svg>
}

/** Cartão da biblioteca: igual ao do Esquema 3D (clique posiciona, duplo clique insere, arrastar, ★ favorito). */
function SymbolTile({ kind, favorite, placing, disabled, onPick, onQuickAdd, onFavorite }: {
  kind: CmdKind; favorite: boolean; placing: boolean; disabled: boolean
  onPick: () => void; onQuickAdd: () => void; onFavorite: () => void
}) {
  const def = CMD_PARTS[kind]
  const title = disabled ? `${def.label} — pare a simulação para editar o esquema` : `${def.label} — ${def.hint}. Clique para posicionar · duplo clique insere · arraste para o esquema`
  return <div className={`dc-library-tile ${placing ? 'is-placing' : ''} ${disabled ? 'is-locked' : ''}`} title={title} data-cmd-tile={kind}>
    <button type="button" className="dc-library-tile-main" aria-label={`Colocar ${def.label}`} aria-pressed={placing} disabled={disabled}
      onClick={onPick} onDoubleClick={onQuickAdd}
      draggable={!disabled}
      onDragStart={(e) => {
        useCommandsUi.getState().setPlacing(null)
        e.dataTransfer.setData('text/dc-cmd-kind', kind)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      >
      <span className="dc-library-tile-image"><SymbolThumb kind={kind} /></span>
      <span className="dc-library-tile-name">{def.label}</span>
    </button>
    <button type="button" className={`dc-library-tile-favorite ${favorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-pressed={favorite} aria-label={`${favorite ? 'Remover' : 'Adicionar'} ${def.label} ${favorite ? 'dos' : 'aos'} favoritos`} title={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}>{favorite ? '★' : '☆'}</button>
  </div>
}
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function CommandsSidebar({ width, onCollapse }: { width: number | string; onCollapse: () => void }) {
  const [tab, setTab] = useState<'library' | 'inspector'>('library')
  const [filter, setFilter] = useState('')
  const placing = useCommandsUi((s) => s.placing)
  const setPlacing = useCommandsUi((s) => s.setPlacing)
  const selection = useCommandsUi((s) => s.selection)
  const selectedFrom = useCommandsUi((s) => s.selectedFrom)
  const running = useCommandsUi((s) => s.rt.running)
  const diagram = useSimStore((s) => s.commands) ?? emptyCommands()
  const selectedPart = selection?.type === 'part' ? diagram.parts.find((p) => p.id === selection.id) : undefined

  // Selecionar um símbolo no esquema mostra logo as suas propriedades (como no Esquema 3D).
  useEffect(() => { if (selection && selectedFrom === 'canvas') setTab('inspector') }, [selection?.id, selectedFrom])

  const groups = useMemo(() => {
    const q = fold(filter.trim())
    return CMD_PALETTE.map((g) => ({ ...g, kinds: g.kinds.filter((k) => !q || fold(`${CMD_PARTS[k].label} ${CMD_PARTS[k].hint} ${g.title}`).includes(q)) })).filter((g) => g.kinds.length)
  }, [filter])
  const total = CMD_PALETTE.reduce((n, g) => n + g.kinds.length, 0)

  // Recentes, favoritos e pastas recolhidas: como na biblioteca do Esquema 3D (guardados neste navegador).
  const recent = useCommandsUi((s) => s.recent)
  const [favorites, setFavorites] = useState<CmdKind[]>(() => readKinds(FAVORITES_KEY))
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_KEY)
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch { /* armazenamento indisponível */ }
    return new Set(CMD_PALETTE.map((g) => g.title).filter((t) => !DEFAULT_OPEN.includes(t)))
  })
  const saveCollapsed = (next: Set<string>) => { setCollapsed(next); try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])) } catch { /* armazenamento indisponível */ } }
  const toggleGroup = (title: string) => { const next = new Set(collapsed); if (next.has(title)) next.delete(title); else next.add(title); saveCollapsed(next) }
  const toggleFavorite = (kind: CmdKind) => setFavorites((current) => {
    const next = current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)) } catch { /* armazenamento indisponível */ }
    return next
  })
  const tile = (kind: CmdKind) => <SymbolTile key={kind} kind={kind} favorite={favorites.includes(kind)} placing={placing === kind} disabled={running}
    onPick={() => setPlacing(placing === kind ? null : kind)}
    onQuickAdd={() => useCommandsUi.getState().requestQuickAdd(kind)}
    onFavorite={() => toggleFavorite(kind)} />

  return (
    <div className="pn-panel dc-cmd-sidebar shrink-0 flex flex-col h-full min-h-0" style={{ width }}>
      <SidePanelHeader eyebrow={tab === 'library' ? 'COMANDOS' : 'SÍMBOLO'} title={tab === 'library' ? 'Símbolos IEC' : selectedPart ? `${CMD_PARTS[selectedPart.kind].label}${selectedPart.tag ? ` ${selectedPart.tag}` : ''}` : 'Propriedades'} side="left" onToggle={onCollapse} toggleLabel="Recolher biblioteca e inspetor" />
      <div className="pn-tabs flex items-end">
        <button type="button" onClick={() => setTab('library')} className={`dc-tab ${tab === 'library' ? 'dc-tab-active' : ''}`}>
          Biblioteca <span className="text-ink-300 font-normal">({total})</span>
        </button>
        <button type="button" onClick={() => setTab('inspector')} className={`dc-tab ${tab === 'inspector' ? 'dc-tab-active' : ''}`}>Inspetor</button>
      </div>

      {tab === 'library' ? (
        <>
          <div className="pn-section">
            <div className="relative">
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Pesquisar símbolo (contactor, botão, motor…)" aria-label="Pesquisar símbolos" className="dc-input !pl-7 !pr-7" />
              {filter && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500" title="Limpar pesquisa" onClick={() => setFilter('')}>×</button>}
              <IconSearch size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
            </div>
          </div>
          <div className="pn-section is-compact flex items-center justify-between text-[10px] text-ink-500">
            <span>{groups.reduce((n, g) => n + g.kinds.length, 0)} símbolos{filter ? ' na pesquisa' : ''} · {CMD_PALETTE.length} pastas</span>
            <span className="flex gap-2"><button type="button" onClick={() => saveCollapsed(new Set())}>Expandir</button><button type="button" onClick={() => saveCollapsed(new Set(CMD_PALETTE.map((g) => g.title)))}>Recolher</button></span>
          </div>
          {placing && <div className="dc-cmd-placing p-2 bg-brand-50 text-brand-700 text-[11px] flex gap-2 items-center" role="status"><span className="flex-1">A posicionar: {CMD_PARTS[placing].label} · Shift mantém · Esc cancela</span><button type="button" className="dc-btn !h-6" onClick={() => setPlacing(null)}>Cancelar</button></div>}
          <div className="pn-body flex-1 overflow-y-auto min-h-0 dc-library-scroll">
            {recent.length > 0 && !filter && <section className="dc-library-section" aria-label="Símbolos recentes"><div className="dc-library-section-title">◴ Recentes <span>{recent.length}</span></div><div className="dc-library-recent">{recent.map(tile)}</div></section>}
            {favorites.length > 0 && !filter && <section className="dc-library-section" aria-label="Símbolos favoritos"><div className="dc-library-section-title">★ Favoritos <span>{favorites.length}</span></div><div className="dc-library-grid">{favorites.map(tile)}</div></section>}
            {!groups.length && (
              <div className="dc-empty-state">
                <span className="dc-empty-state-icon"><IconSearch size={18} /></span>
                <strong>Nenhum símbolo encontrado</strong>
                <p>Não há resultados para «{filter.trim()}». Experimente «contactor», «botão», «temporizado» ou «motor».</p>
                <button type="button" className="dc-btn dc-btn-primary" onClick={() => setFilter('')}>Limpar pesquisa</button>
              </div>
            )}
            {groups.map((group) => {
              const isCollapsed = !filter.trim() && collapsed.has(group.title)
              return <section className="dc-library-folder" key={group.title} aria-label={group.title}>
                <button type="button" aria-expanded={!isCollapsed} className="dc-library-folder-head" onClick={() => toggleGroup(group.title)} title={`${isCollapsed ? 'Expandir' : 'Recolher'} ${group.title}`}>
                  <span className="dc-library-folder-icon"><IconProjects size={16} /></span><strong>{group.title}</strong><span className="dc-library-folder-count">{group.kinds.length}</span><IconChevronDown size={13} className={`dc-library-folder-chevron ${isCollapsed ? '' : 'is-open'}`} />
                </button>
                {!isCollapsed && <div className="dc-library-grid">{group.kinds.map(tile)}</div>}
              </section>
            })}
            <p className="text-ink-400 text-[10px] leading-relaxed mt-2 p-2 bg-surface-sunken/60 rounded-md border border-line-soft">
              Clique num símbolo e depois no esquema (encaixa na malha), ou <b className="text-ink-500">arraste-o</b>. Duplo clique insere já no centro da vista · Shift+clique posiciona vários · Esc cancela. Ligue os bornes com a ferramenta Cabo — largar sobre um cabo cria um nó.
            </p>
          </div>
        </>
      ) : (
        <div className="dc-cmd-palette-body">
          {selectedPart ? <PartProperties part={selectedPart} disabled={running} />
            : selection?.type === 'wire' ? <div className="dc-cmd-props"><p>Cabo selecionado. Arraste o troço do meio para o deslocar.</p><button type="button" className="dc-btn is-danger" disabled={running} onClick={removeSelected}>Apagar cabo</button></div>
            : <DiagramSummary />}
        </div>
      )}
    </div>
  )
}

function DiagramSummary() {
  const diagram = useSimStore((s) => s.commands) ?? emptyCommands()
  return (
    <div className="dc-cmd-props">
      <p><b>{diagram.parts.filter((p) => p.kind !== 'node').length}</b> símbolos · <b>{diagram.wires.length}</b> cabos · <b>{devicesOf(diagram).length}</b> aparelhos</p>
      <p className="dc-cmd-muted">Selecione um símbolo no esquema para editar a referência, a marcação dos bornes e as opções.</p>
      <p className="dc-cmd-muted">Os contactos com a mesma referência da bobina (K1, K2…) mudam quando ela recebe tensão. Botões S, térmicos F e disjuntores Q operam-se durante a simulação.</p>
    </div>
  )
}

function PartProperties({ part, disabled }: { part: CmdPart; disabled: boolean }) {
  const def = CMD_PARTS[part.kind]
  const terms = partTerminals(part)
  const onChange = (patch: Partial<CmdPart>) => patchPart(part.id, patch)
  return (
    <fieldset className="dc-cmd-props" disabled={disabled}>
      <p className="dc-cmd-muted">{def.hint}</p>
      {def.prefix && <label className="dc-cmd-field"><span>Referência</span>
        <input className="dc-input" value={part.tag} onChange={(e) => onChange({ tag: e.target.value.toUpperCase().replace(/\s+/g, '') })} aria-label="Referência do aparelho" />
      </label>}
      {def.family === 'contact' && <p className="dc-cmd-muted">Comandado pelo aparelho <b>{part.tag || '—'}</b> (bobina, temporizador ou relé térmico com a mesma referência).</p>}
      {part.kind === 'supply' && <label className="dc-cmd-field"><span>Fases</span>
        <select className="dc-input" value={(part.lines ?? ['L1']).join(' ')} onChange={(e) => onChange({ lines: e.target.value.split(' ') })} aria-label="Fases da alimentação">
          {SUPPLY_PRESETS.map((p) => <option key={p.join(' ')} value={p.join(' ')}>{p.join(' · ')}</option>)}
        </select>
      </label>}
      {part.kind === 'timerCoil' && <label className="dc-cmd-field"><span>Atraso à operação (s)</span>
        <input className="dc-input" type="number" min={0.1} step={0.5} value={(part.delayMs ?? 3000) / 1000} onChange={(e) => onChange({ delayMs: Math.max(100, Math.round(Number(e.target.value) * 1000) || 100) })} aria-label="Atraso do temporizador em segundos" />
      </label>}
      {part.kind === 'lamp' && <label className="dc-cmd-field"><span>Cor</span>
        <select className="dc-input" value={part.color ?? 'green'} onChange={(e) => onChange({ color: e.target.value as CmdPart['color'] })} aria-label="Cor do sinalizador">
          <option value="green">Verde (marcha)</option><option value="red">Vermelho (paragem/defeito)</option><option value="yellow">Amarelo (alerta)</option><option value="white">Branco</option><option value="blue">Azul</option>
        </select>
      </label>}
      {part.kind !== 'supply' && part.kind !== 'node' && <div className="dc-cmd-field"><span>Marcação dos bornes</span>
        <div className="dc-cmd-terms">{terms.map((t, i) => <input key={i} className="dc-input" value={part.labels?.[i] ?? t.label} onChange={(e) => { const labels = terms.map((x, j) => part.labels?.[j] ?? x.label); labels[i] = e.target.value; onChange({ labels }) }} aria-label={`Borne ${i + 1}`} />)}</div>
      </div>}
      <div className="dc-cmd-actions">
        <button type="button" className="dc-btn" onClick={rotateSelected}>Rodar 90°</button>
        <button type="button" className="dc-btn is-danger" onClick={removeSelected}>Apagar</button>
      </div>
    </fieldset>
  )
}
