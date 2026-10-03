import { uiConfirm, uiPrompt } from '../ui/dialogs'
import Select from '../ui/Select'
import LadderSections, { type LadderSection } from './LadderSections'
import { isSmallScreen } from '../ui/cleanMode'
import { isProgrammablePlc } from './plcPrograms'
import { PROJECT_FOLDERS, type ProjectFile, type ProjectFolder } from './projectFiles'
import { plcIoRows } from './plcIo'
import { parseDataBlocks } from './dataBlocks'
import { collectUsedAddresses } from './ladderEngine'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import TagTable from './TagTable'
import type { LadderContact, LadderRung, LadderContactType, LadderCoilType, LadderCoilEl, ComponentType, ElectricalComponent } from '../types'
import NetworkDiagram, { type RungSelection } from './NetworkDiagram'
import LadderElementDialog from './LadderElementDialog'
import { COMPONENT_TO_LADDER, LADDER_MIME, applyKind, isContactKind, setLadderDrag, type DropTarget, type PaletteKind } from './ladderDnd'
import {
  IconPlus, IconBranch, IconContact, IconCoil, IconTimer, IconCounter, IconDelete, IconCopy,
  IconZoomIn, IconZoomOut, IconSchematic, IconLadder, IconCompare, IconMath, IconMove,
  IconFunction, IconUndo, IconRedo, IconChevronDown, IconChevronRight, IconShield,
  IconGrid, IconTag, IconMonitor, IconSave, IconFile, IconOpen, IconProjects, IconCube, IconHelp,
} from '../ui/icons'
import { useLadderPrefs } from './ladderPrefs'
import { ELEMENT_KEYS } from './ladderShortcuts'
import ShortcutsDialog from './ShortcutsDialog'
import { useEditorShortcuts } from '../ui/shortcuts'

/* ------------------------------------------------------------------ helpers */

/** id do <datalist> com os endereços já nomeados na Tabela de Tags, usado
 *  para sugerir endereços (com autocompletar) em todos os campos de endereço
 *  do editor — tal como o TIA Portal sugere tags existentes ao digitar. */
const TAG_DATALIST_ID = 'ladder-tag-addresses'

const CONTACT_LABEL: Record<LadderContactType, string> = { NO: 'NA', NC: 'NF', RISING: '↑B', FALLING: '↓B' }

function TagAddressDatalist() {
  const tags = useSimStore((s) => s.tags)
  return (
    <datalist id={TAG_DATALIST_ID}>
      {tags.map((t) => (
        <option key={t.id} value={t.address}>
          {t.name !== t.address ? t.name : ''}
        </option>
      ))}
    </datalist>
  )
}

/** Nome simbólico da tag associada a um endereço, se existir e for diferente
 *  do próprio endereço (senão não haveria nada de útil a mostrar). */
function useTagName(address: string): string | null {
  const tag = useSimStore((s) => s.tags.find((t) => t.address === address.toUpperCase()))
  return tag && tag.name && tag.name !== tag.address ? tag.name : null
}

/**
 * Contato Ladder desenhado graficamente (barras verticais estilo IEC 61131),
 * com estados nítidos: energizado (verde) / inativo (cinza).
 */
function ContactSymbol({ el, table, selected = false }: { el: LadderContact; table: Record<string, boolean>; selected?: boolean }) {
  const db = useSimStore((s) => s.runtime.db)
  const raw = db[el.address.toUpperCase()]?.type === 'BOOL' ? db[el.address.toUpperCase()].value === true : !!table[el.address]
  const powered = el.contactType === 'NC' ? !raw : raw
  const tagName = useTagName(el.address)
  const slash = el.contactType === 'NC'
  const edge = el.contactType === 'RISING' || el.contactType === 'FALLING'
  return (
    <div className={`ladder-contact-symbol ${powered ? 'is-powered' : ''} ${selected ? 'is-selected' : ''}`} title={tagName ?? undefined}>
      <div className="ladder-symbol-address">{el.address}</div>
      <svg width="54" height="30" viewBox="0 0 54 30" aria-hidden>
        <line x1="0" y1="15" x2="15" y2="15" />
        <line x1="39" y1="15" x2="54" y2="15" />
        <line x1="18" y1="5" x2="18" y2="25" />
        <line x1="36" y1="5" x2="36" y2="25" />
        {slash && <line x1="14" y1="25" x2="40" y2="5" />}
        {edge && (
          <text x="27" y="18.5" fontSize="10" fontWeight="700" textAnchor="middle" fontFamily="ui-monospace, monospace">
            {el.contactType === 'RISING' ? 'P' : 'N'}
          </text>
        )}
      </svg>
      <div className="ladder-symbol-kind">{CONTACT_LABEL[el.contactType]}</div>
      {tagName && <div className="ladder-symbol-tag">{tagName}</div>}
    </div>
  )
}

/** Bobina desenhada como ( endereço ) com o tipo (SET/RESET) indicado. */
function CoilButton({ coil, powered, selected = false, onCycle, onRemove, onSelect }: { coil: LadderCoilEl; powered: boolean; selected?: boolean; onCycle: () => void; onRemove: () => void; onSelect?: () => void }) {
  const tagName = useTagName(coil.address)
  return (
    <button
      onClick={onSelect ?? onCycle}
      onContextMenu={(e) => {
        e.preventDefault()
        onRemove()
      }}
      title={`Clique alterna COIL → SET → RESET · botão direito remove${tagName ? ` · ${tagName}` : ''}`}
      className={`ladder-coil-symbol ${selected ? 'is-selected' : ''} flex items-center gap-1.5 px-2 py-1 rounded-[5px] font-mono text-[11px] font-semibold border-2 transition-colors ${
        powered ? 'border-state-run text-emerald-800 bg-state-runbg' : 'border-line-strong text-ink-400 bg-white'
      }`}
    >
      <span className="text-[13px] leading-none">(</span>
      <span>{coil.address}</span>
      {coil.coilType !== 'COIL' && <span className="text-[8px] font-bold px-1 rounded bg-ink-900/5">{coil.coilType}</span>}
      <span className="text-[13px] leading-none">)</span>
      {tagName && <span className="text-[8px] font-normal text-ink-400 max-w-[70px] truncate">{tagName}</span>}
    </button>
  )
}

function BlockButton({
  label,
  address,
  detail,
  powered,
  selected = false,
  onSelect,
  onRemove,
}: {
  label: string
  address: string
  detail: string
  powered: boolean
  selected?: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  return (
    <button
      className={`ladder-block-symbol ${powered ? 'is-powered' : ''} ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault()
        onRemove()
      }}
      title="Clique para configurar · botão direito remove"
    >
      <span className="ladder-symbol-address">{address}</span>
      <strong>{label}</strong>
      <small>{detail}</small>
    </button>
  )
}

/* --------------------------------------------------------------- editor row */

/** Barra única de elementos por network: clique insere · arraste para posicionar. */

function RungRow({ rung, index, total = 1, minWidth = 640, active = false, collapsed: collapsedProp, onToggleCollapse }: {
  rung: LadderRung; index: number; total?: number; minWidth?: number; active?: boolean
  /** controlado pelo pai (Ctrl+E, recolher tudo); sem valor, a network gere o seu estado */
  collapsed?: boolean; onToggleCollapse?: () => void
}) {
  const rungPowered = useSimStore((s) => s.runtime.rungPowered)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const { deleteRung, duplicateRung, moveRung, renameRung, updateRung } = useSimStore()
  const [selection, setSelection] = useState<RungSelection>(null)
  const [dialogSelection, setDialogSelection] = useState<Exclude<NonNullable<RungSelection>, { type: 'insert' }> | null>(null)
  /** network recolhida (só o cabeçalho visível) — como no TIA Portal */
  const [localCollapsed, setLocalCollapsed] = useState(false)
  const collapsed = collapsedProp ?? localCollapsed
  const toggleCollapsed = () => (onToggleCollapse ? onToggleCollapse() : setLocalCollapsed((v) => !v))
  const confirmDelete = useLadderPrefs((p) => p.confirmDelete)
  const requestDelete = async () => {
    if (confirmDelete && !await uiConfirm(`Eliminar a network ${index + 1}${rung.name ? ` («${rung.name}»)` : ''}? Pode repô-la com Ctrl+Z.`)) return
    deleteRung(rung.id)
  }
  const contactCount = rung.branches.reduce((n, b) => n + b.elements.length, 0)
  const outputCount = rung.coils.length + (rung.timer ? 1 : 0) + (rung.counter ? 1 : 0) + (rung.call ? 1 : 0) + (rung.move ? 1 : 0)
  const blockKinds = [rung.timer?.timerType, rung.counter?.counterType, rung.move ? 'MOVE' : '', rung.call ? 'CALL' : ''].filter(Boolean)

  const powered = !!rungPowered[rung.id]
  const plcId = useSimStore((st) => st.activePlcId)
  const fcFiles = useSimStore((st) => st.projectFiles[plcId ?? '_general'] ?? [])

  return (
    <div className={`ladder-rung-card ${powered && running ? 'is-powered' : ''} ${collapsed ? 'is-collapsed' : ''} ${active ? 'is-active' : ''} ${rung.enabled ? '' : 'is-disabled'}`}>
      {/* cabeçalho da network — estilo TIA Portal: "Network n: título" */}
      <div className="ladder-rung-header" onDoubleClick={() => toggleCollapsed()}>
        <button
          className="ladder-collapse-btn"
          title={collapsed ? 'Expandir network' : 'Recolher network'}
          onClick={() => toggleCollapsed()}
        >
          {collapsed ? <IconChevronRight size={11} /> : <IconChevronDown size={11} />}
        </button>
        <span className={`ladder-network-no ${powered && running ? 'is-on' : ''}`} title="Número da network">
          Network {index + 1}:
        </span>
        <input
          className="ladder-network-title"
          value={rung.name}
          placeholder="Título da network…"
          onChange={(e) => renameRung(rung.id, e.target.value)}
          onDoubleClick={(e) => e.stopPropagation()}
        />
        <span className={`ladder-rung-live ${powered && running ? 'is-on' : ''}`}>
          <i />
          {powered && running ? 'RLO = 1' : 'RLO = 0'}
        </span>
        <span className="ladder-rung-chips" title={`${contactCount} contacto(s) · ${outputCount} saída(s)/bloco(s) · ${rung.branches.length} ramo(s)`}>
          <span className="ladder-chip">{contactCount} <small>contactos</small></span>
          <span className={`ladder-chip ${outputCount ? '' : 'is-warn'}`}>{outputCount} <small>saídas</small></span>
          {rung.branches.length > 1 && <span className="ladder-chip is-info">{rung.branches.length} <small>ramos</small></span>}
          {!!blockKinds.length && <span className="ladder-chip is-info">{blockKinds.join(' · ')}</span>}
          {!rung.enabled && <span className="ladder-chip is-off">desativada</span>}
        </span>
        <label className="ladder-switch" title="Network habilitada para execução (Ctrl+Shift+A)" onDoubleClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={rung.enabled} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, enabled: e.target.checked }), 'force')} />
          <span className="ladder-switch-track"><i /></span>
          <span className="ladder-switch-text">ativa</span>
        </label>
        <div className="ladder-rung-actions" onDoubleClick={(e) => e.stopPropagation()}>
          <button className="ladder-rung-action" title="Mover para cima (Alt+Shift+↑)" aria-label="Mover network para cima" disabled={index === 0} onClick={() => moveRung(rung.id, -1)}>↑</button>
          <button className="ladder-rung-action" title="Mover para baixo (Alt+Shift+↓)" aria-label="Mover network para baixo" disabled={index >= total - 1} onClick={() => moveRung(rung.id, 1)}>↓</button>
          <button className="ladder-rung-action" title="Duplicar network (Ctrl+D)" aria-label="Duplicar network" onClick={() => duplicateRung(rung.id)}><IconCopy size={11} /></button>
          <button className="ladder-rung-action is-danger" title="Eliminar network (Ctrl+Del)" aria-label="Eliminar network" onClick={requestDelete}><IconDelete size={11} /></button>
        </div>
      </div>

      {/* comentário da network — linha cinza itálica, como no TIA Portal */}
      {!collapsed && (
        <input
          className="ladder-network-comment"
          value={rung.comment ?? ''}
          placeholder="Comentário…"
          onChange={(e) => updateRung(rung.id, (r) => ({ ...r, comment: e.target.value }))}
        />
      )}

      {collapsed ? null : (
      <>
      {/* diagrama — grelha padrão de 20px */}
      <div className="ladder-rung-body">
        <div className="lnet-scroll">
          <NetworkDiagram
            rung={rung}
            selection={selection}
            onSelect={setSelection}
            onEdit={(next) => { setSelection(next); setDialogSelection(next) }}
            minWidth={minWidth}
          />
        </div>
      </div>


      </>
      )}
      <LadderElementDialog
        rung={rung}
        selection={dialogSelection}
        functionFiles={fcFiles}
        onClose={() => setDialogSelection(null)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------- editor */

type LadderTab = 'program' | 'tags'
type ProjectNodeId =
  | 'plc'
  | 'programBlocks'
  | 'main'
  | 'fc1'
  | 'fc2'
  | 'dataBlocks'
  | 'technologyObjects'
  | 'externalSources'
  | 'plcVariables'
  | 'watchTables'
  | 'backups'
  | 'documentation'
  | `file:${string}`

interface ProjectTreeItem {
  id: ProjectNodeId
  label: string
  detail?: string
  icon: 'plc' | 'folder' | 'block' | 'data' | 'source' | 'tags' | 'watch' | 'backup' | 'doc'
  children?: ProjectTreeItem[]
}

const PROJECT_TREE: ProjectTreeItem = {
  id: 'plc',
  label: 'Programa geral',
  detail: 'Sem PLC no esquema',
  icon: 'plc',
  children: [
    {
      id: 'programBlocks',
      label: 'Blocos de programa',
      icon: 'folder',
      children: [
        { id: 'main', label: 'Main [OB1]', icon: 'block' },
        { id: 'fc1', label: 'FC1 [FC1]', icon: 'block' },
        { id: 'fc2', label: 'FC2 [FC2]', icon: 'block' },
      ],
    },
    { id: 'dataBlocks', label: 'Blocos de dados', icon: 'data' },
    { id: 'technologyObjects', label: 'Objetos tecnológicos', icon: 'folder' },
    { id: 'externalSources', label: 'Fontes externas', icon: 'source' },
    { id: 'plcVariables', label: 'Variáveis PLC', icon: 'tags' },
    { id: 'watchTables', label: 'Tabelas de observação', icon: 'watch' },
    { id: 'backups', label: 'Backups', icon: 'backup' },
    { id: 'documentation', label: 'Documentação', icon: 'doc' },
  ],
}

const NODE_TITLES: Record<Exclude<ProjectNodeId, `file:${string}`>, string> = {
  plc: 'Programa geral',
  programBlocks: 'Blocos de programa',
  main: 'Main [OB1]',
  fc1: 'FC1 [FC1]',
  fc2: 'FC2 [FC2]',
  dataBlocks: 'Blocos de dados',
  technologyObjects: 'Objetos tecnológicos',
  externalSources: 'Fontes externas',
  plcVariables: 'Variáveis PLC',
  watchTables: 'Tabelas de observação',
  backups: 'Backups',
  documentation: 'Documentação',
}

const BLOCK_NODE_IDS = new Set<ProjectNodeId>(['main', 'fc1', 'fc2'])

function TreeGlyph({ icon }: { icon: ProjectTreeItem['icon'] }) {
  const cls = `tree-glyph tree-glyph-${icon}`
  if (icon === 'block') return <IconLadder size={12} className={cls} />
  if (icon === 'data') return <IconGrid size={12} className={cls} />
  if (icon === 'tags') return <IconTag size={12} className={cls} />
  if (icon === 'watch') return <IconMonitor size={12} className={cls} />
  if (icon === 'backup') return <IconSave size={12} className={cls} />
  if (icon === 'doc') return <IconFile size={12} className={cls} />
  if (icon === 'source') return <IconOpen size={12} className={cls} />
  if (icon === 'plc') return <IconCube size={12} className={cls} />
  return <IconProjects size={12} className={cls} />
}

function programCounts(rungs: LadderRung[]) {
  return rungs.reduce(
    (acc, rung) => ({
      contacts: acc.contacts + rung.branches.reduce((sum, branch) => sum + branch.elements.length, 0),
      coils: acc.coils + rung.coils.length,
      timers: acc.timers + (rung.timer ? 1 : 0),
      counters: acc.counters + (rung.counter ? 1 : 0),
    }),
    { contacts: 0, coils: 0, timers: 0, counters: 0 },
  )
}

function onCount(table: Record<string, boolean>, prefix: string) {
  return Object.keys(table).filter((key) => key.startsWith(prefix) && table[key]).length
}

function LadderMetric({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: 'neutral' | 'run' | 'warn' }) {
  return (
    <div className={`ladder-metric is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function LadderEmptyState({ compact = false, onCreate }: { compact?: boolean; onCreate: () => void }) {
  return (
    <div className={`ladder-empty-state ${compact ? 'is-compact' : ''}`}>
      <div className="ladder-empty-icon"><IconLadder size={compact ? 24 : 30} /></div>
      <strong>Nenhuma network no programa</strong>
      <span>Crie a lógica deste projeto. O Ladder usa os mesmos PLCs, TAGs, entradas, saídas e estado de simulação do Esquema e da Visualização 3D.</span>
      <div className="ladder-empty-actions">
        <button onClick={onCreate} className="ladder-primary-button"><IconPlus size={12} /> Criar primeira network</button>
      </div>
    </div>
  )
}

function BlackBoxState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`ladder-blackbox-state ${compact ? 'is-compact' : ''}`}>
      <div className="ladder-empty-icon"><IconShield size={compact ? 22 : 28} /></div>
      <strong>Programa oculto</strong>
      <span>Modo caixa-preta ativo. Observe entradas, saídas e sondas para deduzir a lógica do circuito.</span>
    </div>
  )
}

function CompactLadderEditor() {
  const rungs = useSimStore((s) => s.ladder.rungs)
  const addRung = useSimStore((s) => s.addRung)
  const updateRung = useSimStore((s) => s.updateRung)
  const table = useSimStore((s) => s.runtime.table)
  const rungPowered = useSimStore((s) => s.runtime.rungPowered)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const blackBox = useSimStore((s) => s.sim.blackBox)
  const grid = useSimStore((s) => s.grid)
  const setGrid = useSimStore((s) => s.setGrid)
  const [tab, setTab] = useState<LadderTab>('program')
  const [ladderZoom, setLadderZoom] = useState(() => {
    try { return Math.max(0.75, Math.min(1.35, Number(localStorage.getItem('dcsimu:ladder:zoom')) || 1)) } catch { return 1 }
  })
  useEffect(() => {
    try { localStorage.setItem('dcsimu:ladder:zoom', String(ladderZoom)) } catch {}
  }, [ladderZoom])
  const [dragOver, setDragOver] = useState(false)
  const counts = programCounts(rungs)
  const poweredCount = rungs.filter((r) => rungPowered[r.id]).length

  const quickAdd = (kind: PaletteKind) => {
    const existingRung = rungs[rungs.length - 1]
    const rungId = existingRung?.id ?? addRung()
    updateRung(rungId, (r) => applyKind(r, kind).rung, existingRung ? 'force' : 'skip')
    setTab('program')
  }

  const bits = (p: string) =>
    Object.keys(table)
      .filter((k) => k.startsWith(p))
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
      .map((k) => `${k}=${table[k] ? 1 : 0}`)
      .join('  ')

  const tabBtn = (t: LadderTab, text: string) => (
    <button onClick={() => setTab(t)} className={`dc-tab ${tab === t ? 'dc-tab-active' : ''}`}>
      {text}
    </button>
  )

  return (
    <div className="compact-ladder-editor">
      <TagAddressDatalist />
      <div className="flex items-center justify-between pr-2 border-b border-line bg-surface-rail">
        <div className="flex items-center">
          {tabBtn('program', 'Programa')}
          {tabBtn('tags', 'Tabela de Tags')}
        </div>
        <div className="flex items-center gap-1">
          {tab === 'program' && (
            <button
              onClick={() => setGrid({ enabled: !grid.enabled })}
              className={`dc-icon-btn !h-6 !w-6 ${grid.enabled ? '!text-brand-600' : ''}`}
              title={`Malha ${grid.enabled ? 'ligada' : 'desligada'} (${grid.size}px) · clique para ${grid.enabled ? 'esconder' : 'mostrar'}`}
            >
              <IconGrid size={11} />
            </button>
          )}
          {tab === 'program' && <button type="button" onClick={() => setLadderZoom(1)} className="text-[9px] font-mono text-ink-400 mr-1 hover:text-brand-600" title="Repor escala a 100%">{Math.round(ladderZoom * 100)}%</button>}
          {tab === 'program' && <button disabled={ladderZoom <= 0.75} onClick={() => setLadderZoom((z) => Math.max(0.75, Number((z - 0.1).toFixed(2))))} className="dc-icon-btn !h-6 !w-6" title="Reduzir escala do Ladder"><IconZoomOut size={11} /></button>}
          {tab === 'program' && <button disabled={ladderZoom >= 1.35} onClick={() => setLadderZoom((z) => Math.min(1.35, Number((z + 0.1).toFixed(2))))} className="dc-icon-btn !h-6 !w-6" title="Aumentar escala do Ladder"><IconZoomIn size={11} /></button>}
          {tab === 'program' && <button onClick={addRung} className="dc-btn-primary dc-btn !h-6 !text-[11px] ml-1"><IconPlus size={11} /> Rung</button>}
        </div>
      </div>

      {tab === 'tags' ? (
        <TagTable />
      ) : blackBox ? (
        <BlackBoxState compact />
      ) : (
        <div
          className={`compact-ladder-canvas ${grid.enabled ? (grid.style === 'lines' ? 'grid-lines' : '') : 'grid-off'} drop-zone ${dragOver ? 'drag-over' : ''}`}
          style={grid.enabled ? { backgroundSize: `${grid.size}px ${grid.size}px` } : undefined}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onDragEnter={() => setDragOver(true)}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            setLadderDrag(null)
            const k = e.dataTransfer.getData(LADDER_MIME) as PaletteKind
            const kind = k || COMPONENT_TO_LADDER[e.dataTransfer.getData('text/plain') as ComponentType]
            if (kind) quickAdd(kind)
          }}
        >
          <div className="compact-ladder-summary">
            <LadderMetric label="Networks" value={rungs.length} />
            <LadderMetric label="Energ." value={running ? poweredCount : 0} tone={running && poweredCount ? 'run' : 'neutral'} />
            <LadderMetric label="I/Q ON" value={`${onCount(table, 'I')}/${onCount(table, 'Q')}`} tone={running ? 'run' : 'neutral'} />
            <LadderMetric label="Blocos" value={counts.timers + counts.counters} tone={counts.timers + counts.counters ? 'warn' : 'neutral'} />
          </div>
          <div className="compact-ladder-scale" style={{ zoom: ladderZoom }}>
            {rungs.map((r, i) => (
              <RungRow key={r.id} rung={r} index={i} minWidth={380} />
            ))}
            {rungs.length === 0 && <LadderEmptyState compact onCreate={addRung} />}
          </div>
        </div>
      )}

      {tab === 'program' && (
        <div className="border-t border-line px-2.5 py-1.5 bg-surface-sunken/60 font-mono text-[10px] leading-relaxed text-ink-500 space-y-0.5">
          {[
            ['I', 'Entradas'],
            ['Q', 'Saídas'],
            ['M', 'Memórias'],
          ].map(([p, nome]) => (
            <div key={p} className="flex gap-2">
              <span className="w-14 shrink-0 text-ink-400 font-sans font-semibold">{nome}</span>
              <span className="truncate" title={bits(p)}>{bits(p) || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const PALETTE_GROUPS: Array<{
  title: string
  items: Array<{ kind: PaletteKind; label: string; detail: string; icon: 'contact' | 'coil' | 'timer' | 'counter' | 'move' | 'compare' | 'math' | 'function' }>
}> = [
  {
    title: 'Contatos',
    items: [
      { kind: 'NO', label: 'NA', detail: 'Normal Aberto', icon: 'contact' },
      { kind: 'NC', label: 'NF', detail: 'Normal Fechado', icon: 'contact' },
      { kind: 'RISING', label: 'Borda de Subida', detail: 'Pulso positivo', icon: 'contact' },
      { kind: 'FALLING', label: 'Borda de Descida', detail: 'Pulso negativo', icon: 'contact' },
    ],
  },
  {
    title: 'Bobinas',
    items: [
      { kind: 'COIL', label: 'Bobina', detail: 'Saída normal', icon: 'coil' },
      { kind: 'SET', label: 'Bobina Set', detail: 'Retentiva', icon: 'coil' },
      { kind: 'RESET', label: 'Bobina Reset', detail: 'Retentiva', icon: 'coil' },
    ],
  },
  {
    title: 'Temporizadores',
    items: [
      { kind: 'TON', label: 'TON', detail: 'Atraso na ligação', icon: 'timer' },
      { kind: 'TOF', label: 'TOF', detail: 'Atraso na desligação', icon: 'timer' },
      { kind: 'TP', label: 'TP', detail: 'Pulso', icon: 'timer' },
    ],
  },
  {
    title: 'Operações',
    items: [{ kind: 'MOVE', label: 'MOVE', detail: 'BOOL/INT/REAL via DB', icon: 'move' }, { kind: 'CALL', label: 'CALL FC', detail: 'Invocar bloco', icon: 'function' }],
  },
  {
    title: 'Contadores',
    items: [
      { kind: 'CTU', label: 'CTU', detail: 'Contador UP', icon: 'counter' },
      { kind: 'CTD', label: 'CTD', detail: 'Contador DOWN', icon: 'counter' },
    ],
  },

]

/** Mini-símbolo IEC de cada elemento (paleta e barra da network). */
export function LadderGlyph({ kind, size = 26 }: { kind: PaletteKind; size?: number }) {
  const h = Math.round(size * 0.62)
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'square' as const }
  const text = (t: string) => (
    <text x="20" y="16" fontSize="9" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="ui-monospace, monospace">{t}</text>
  )
  let body: JSX.Element
  if (isContactKind(kind)) {
    body = (
      <g {...common}>
        <path d="M0 12H14M26 12H40M14 4V20M26 4V20" />
        {kind === 'NC' && <path d="M11 20L29 4" />}
        {kind === 'RISING' && text('P')}
        {kind === 'FALLING' && text('N')}
      </g>
    )
  } else if (kind === 'COIL' || kind === 'SET' || kind === 'RESET') {
    body = (
      <g {...common}>
        <path d="M0 12H12M28 12H40M15 4Q9 12 15 20M25 4Q31 12 25 20" />
        {kind !== 'COIL' && text(kind === 'SET' ? 'S' : 'R')}
      </g>
    )
  } else if (kind === 'BRANCH') {
    body = (
      <g {...common}>
        <path d="M0 6H40M4 6V19H36V6" />
        <circle cx="4" cy="6" r="1.6" fill="currentColor" />
        <circle cx="36" cy="6" r="1.6" fill="currentColor" />
      </g>
    )
  } else {
    body = (
      <g>
        <rect x="6" y="2" width="28" height="20" rx="1.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
        <path d="M0 12H6M34 12H40" stroke="currentColor" strokeWidth={1.5} />
        <text x="20" y="15.5" fontSize="8" fontWeight="800" textAnchor="middle" fill="currentColor" fontFamily="ui-monospace, monospace">{kind === 'COMPARE' ? 'CMP' : kind}</text>
      </g>
    )
  }
  return (
    <svg width={size} height={h} viewBox="0 0 40 24" aria-hidden className="shrink-0">
      {body}
    </svg>
  )
}

function PaletteIcon({ type }: { type: PaletteKind }) {
  return <LadderGlyph kind={type} size={30} />
}

function ProjectTreePane({
  activeNode,
  expanded,
  onToggle,
  onSelect,
  onClose,
  onQuickAdd,
  activePlc,
  files,
  hiddenFolders,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  onDeleteFolder,
  onRestoreFolder,
}: {
  files: ProjectFile[]
  hiddenFolders: ProjectFolder[]
  onCreateFile: (folder: ProjectFolder) => void
  onDeleteFile: (file: ProjectFile) => void
  onRenameFile: (file: ProjectFile) => void
  onDeleteFolder: (folder: ProjectFolder) => void
  onRestoreFolder: (folder: ProjectFolder) => void
  activePlc?: ElectricalComponent
  activeNode: ProjectNodeId
  expanded: Set<ProjectNodeId>
  onToggle: (id: ProjectNodeId) => void
  onSelect: (id: ProjectNodeId) => void
  onClose: () => void
  onQuickAdd: (kind: PaletteKind) => void
}) {
  const toolTiles: Array<{ label: string; kind: PaletteKind }> = [
    { label: 'Contato', kind: 'NO' },
    { label: 'Bobina', kind: 'COIL' },
    { label: 'Temporizador', kind: 'TON' },
    { label: 'Contador', kind: 'CTU' },
    { label: 'Ramo OR', kind: 'BRANCH' },
    { label: 'MOVE', kind: 'MOVE' },
    { label: 'CALL FC', kind: 'CALL' },
  ]

  const projectTree: ProjectTreeItem = { ...PROJECT_TREE, children: PROJECT_TREE.children
    ?.filter((folder) => !hiddenFolders.includes(folder.id as ProjectFolder))
    .map((folder) => ({ ...folder,
      children: PROJECT_FOLDERS.includes(folder.id as ProjectFolder) ? [ ...(folder.children ?? []), ...files.filter((f) => f.folder === folder.id).map((f) => ({ id: `file:${f.id}` as ProjectNodeId, label: f.name, icon: (f.folder === 'programBlocks' ? 'block' : f.folder === 'backups' ? 'backup' : 'doc') as ProjectTreeItem['icon'] })) ] : folder.children,
    })) }
  const renderNode = (node: ProjectTreeItem, depth = 0) => {
    const hasChildren = !!node.children?.length
    const isFile = node.id.startsWith('file:')
    const file = isFile ? files.find((item) => `file:${item.id}` === node.id) : undefined
    const folder = PROJECT_FOLDERS.includes(node.id as ProjectFolder) ? node.id as ProjectFolder : null
    const canDeleteFolder = !!folder && folder !== 'programBlocks' && folder !== 'plcVariables'
    const isExpandableFolder = !isFile && (hasChildren || !BLOCK_NODE_IDS.has(node.id))
    const isOpen = expanded.has(node.id)
    const isActive = activeNode === node.id
    return (
      <div key={node.id}>
        <div className="tree-row-wrap">
        <button
          type="button"
          className={`tree-row tree-depth-${Math.min(depth, 2)} ${isActive ? 'tree-selected' : ''}`}
          onClick={() => {
            if (isExpandableFolder) onToggle(node.id)
            onSelect(node.id)
          }}
          onDoubleClick={(event) => { if (file) { event.stopPropagation(); onRenameFile(file) } }}
          onContextMenu={(event) => { if (file) { event.preventDefault(); onDeleteFile(file) } }}
          title={file ? `${node.label} · duplo clique para mudar o nome · botão direito para eliminar` : node.detail ? `${node.label} (${node.detail})` : node.label}
        >
          <span className="tree-chevron">
            {isExpandableFolder ? (isOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />) : <span />}
          </span>
          <TreeGlyph icon={node.icon} />
          <span className="tree-label">{node.label}</span>
          {node.detail && <small>({node.detail})</small>}
        </button>
        {folder && <span className="tree-row-actions">
          <button type="button" className="tree-create-file" title={`Criar em ${node.label}`} aria-label={`Criar em ${node.label}`} onClick={() => onCreateFile(folder)}>＋</button>
          {canDeleteFolder && <button type="button" className="tree-delete-item" title={`Eliminar pasta ${node.label}`} aria-label={`Eliminar pasta ${node.label}`} onClick={() => onDeleteFolder(folder)}><IconDelete size={10} /></button>}
        </span>}
        {file && <button type="button" className="tree-delete-item" title={`Eliminar ${file.name}`} aria-label={`Eliminar ${file.name}`} onClick={() => onDeleteFile(file)}><IconDelete size={10} /></button>}
        </div>
        {hasChildren && isOpen && node.children!.map((child) => renderNode(child, depth + 1))}
        {!hasChildren && isExpandableFolder && isOpen && <div className="tree-hint tree-depth-2">Pasta vazia · use ＋ para criar</div>}
      </div>
    )
  }

  return (
    <aside className="ladder-project-pane">
      <div className="ladder-pane-heading">
        <span>Projeto</span>
        <span className="ladder-pane-heading-actions">
          {hiddenFolders.length > 0 && <Select
            aria-label="Restaurar pasta eliminada"
            title="Restaurar pasta eliminada"
            value=""
            onChange={(event) => { if (event.target.value) onRestoreFolder(event.target.value as ProjectFolder) }}
          >
            <option value="">＋ Pasta</option>
            {hiddenFolders.map((folder) => <option key={folder} value={folder}>{NODE_TITLES[folder]}</option>)}
          </Select>}
          <button className="ladder-ghost-button" title="Recolher projeto" onClick={onClose}>×</button>
        </span>
      </div>
      <div className="ladder-project-tree">
        {renderNode({ ...projectTree, label: activePlc?.ref ?? 'Programa geral', detail: activePlc?.label ?? 'Sem PLC no esquema' })}
      </div>
      <div className="ladder-tools-heading">Ferramentas</div>
      <div className="ladder-tools-grid">
        {toolTiles.map(({ label, kind }) => (
          <button
            type="button"
            className="ladder-tool-tile"
            key={label}
            onClick={() => onQuickAdd(kind)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(LADDER_MIME, kind)
              e.dataTransfer.setData('text/plain', `ladder:${kind}`)
              e.dataTransfer.effectAllowed = 'copy'
              setLadderDrag({ kind })
            }}
            onDragEnd={() => setLadderDrag(null)}
            title={`${label} — clique insere · arraste para uma network`}
          >
            <LadderGlyph kind={kind} size={30} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}

function NetworkStatus({ table, prefix, label, plc, wires, components, tags, rungs }: {
  table: Record<string, boolean>; prefix: 'I' | 'Q' | 'M'; label: string; plc?: ElectricalComponent;
  wires: import('../types').Wire[]; components: ElectricalComponent[]; tags: import('../types').LadderTag[]; rungs: LadderRung[]
}) {
  const physical = prefix !== 'M' ? plcIoRows(plc, prefix, table, wires, components, tags) : []
  const memory = prefix === 'M' ? [...new Set([
    ...collectUsedAddresses({ rungs }).filter((a) => /^M\d+$/.test(a)),
    ...tags.map((t) => t.address).filter((a) => /^M\d+$/i.test(a)),
    ...Object.keys(table).filter((a) => /^M\d+$/.test(a) && table[a]),
  ])].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))) : []
  return <div className="ladder-status-group">
    <div className="ladder-status-title">{label}{plc && prefix !== 'M' ? ` · ${plc.ref} (${physical.length})` : ''}</div>
    {prefix !== 'M' ? physical.map((row) => <div className="ladder-status-row" key={row.address} title={row.destinations.join(' · ') || 'Sem cabo ligado'}>
      <span className="font-mono text-brand-700">{row.address}</span>
      <span className="truncate text-slate-500">{row.name || (row.destinations.length ? row.destinations.join(', ') : 'Sem ligação')}</span>
      <span className={`ladder-status-dot ${row.on ? 'is-on' : ''}`} title={row.on ? 'Ativo' : 'Inativo'} />
    </div>) : memory.map((address) => <div className="ladder-status-row" key={address}>
      <span className="font-mono text-brand-700">{address}</span><span className="truncate text-slate-500">{tags.find((t) => t.address === address)?.name || 'Memória'}</span>
      <span className={`ladder-status-dot ${table[address] ? 'is-on' : ''}`} />
    </div>)}
    {!(prefix === 'M' ? memory.length : physical.length) && <span className="text-[10px] text-slate-400">{prefix === 'M' ? 'Nenhuma memória usada neste programa.' : 'Este PLC não tem bornes desta categoria.'}</span>}
  </div>
}

function ProjectDataView({ activeNode, files, onCreate, onOpen }: {
  activeNode: ProjectNodeId; files: ProjectFile[]; onCreate: (folder: ProjectFolder) => void; onOpen: (id: string) => void
}) {
  const folder = PROJECT_FOLDERS.includes(activeNode as ProjectFolder) ? activeNode as ProjectFolder : null
  if (!folder) return <div className="ladder-folder-view"><FolderViewHeader icon={<IconCube size={16} />} title="Projeto" subtitle="Escolha uma pasta para criar ficheiros." /></div>
  const description: Record<ProjectFolder, string> = {
    programBlocks: 'Blocos Ladder editáveis. Só OB1 é executado automaticamente.',
    dataBlocks: 'Variáveis BOOL/INT/REAL em JSON, acessíveis por MOVE e contactos BOOL.',
    technologyObjects: 'Configuração e documentação de objetos tecnológicos.',
    externalSources: 'Fontes de texto editáveis; não são compiladas nem executadas.',
    plcVariables: 'Tags do PLC selecionado e ficheiros de documentação.',
    watchTables: 'Endereços I/Q/M/T/C observados ao vivo: um endereço por linha.',
    backups: 'Cópias JSON do projeto guardadas neste dispositivo.',
    documentation: 'Notas e documentação do PLC selecionado.',
  }
  const matching = files.filter((f) => f.folder === folder)
  return <div className="ladder-folder-view">
    <FolderViewHeader icon={<IconProjects size={16} />} title={NODE_TITLES[folder]} subtitle={description[folder]} />
    <button type="button" className="dc-btn-primary dc-btn self-start" onClick={() => onCreate(folder)}><IconPlus size={12} /> Criar {folder === 'backups' ? 'backup' : folder === 'programBlocks' ? 'bloco' : 'ficheiro'}</button>
    <div className="ladder-data-grid">
      {matching.map((file) => <button type="button" key={file.id} className="ladder-data-row text-left hover:bg-brand-50" onClick={() => onOpen(file.id)}><strong>{file.name}</strong><span>{new Date(file.createdAt).toLocaleString('pt-PT')}</span></button>)}
      {!matching.length && <EmptyFolderMessage text="Pasta vazia. Crie o primeiro ficheiro." />}
    </div>
    {folder === 'plcVariables' && <div className="min-h-[260px] flex flex-col"><TagTable /></div>}
  </div>
}

function ProjectFileView({ file, table, onDelete }: { file: ProjectFile; table: Record<string, boolean>; onDelete: () => void }) {
  const update = useSimStore((s) => s.updateProjectFile)
  const restore = useSimStore((s) => s.restoreProjectBackup)
  const db = useSimStore((s) => s.runtime.db)
  const addresses = file.folder === 'watchTables' ? file.content.split(/[\s,;]+/).map((v) => v.trim().toUpperCase()).filter(Boolean) : []
  return <div className="ladder-folder-view gap-3">
    <FolderViewHeader icon={<IconFile size={16} />} title={file.name} subtitle={`${NODE_TITLES[file.folder]} · criado em ${new Date(file.createdAt).toLocaleString('pt-PT')}`} />
    <div className="flex gap-2 items-center"><label htmlFor="ladder-file-name" className="text-xs font-semibold">Nome</label>
      <input id="ladder-file-name" className="dc-input max-w-xs" value={file.name} onChange={(e) => update(file.id, { name: e.target.value })} />
      <button type="button" className="dc-btn-danger dc-btn ml-auto" onClick={onDelete}><IconDelete size={12} /> Eliminar</button>
    </div>
    {file.folder === 'backups' ? <>
      <p className="text-xs text-ink-500">Cópia do projeto no momento da criação. A restauração substitui o projeto atual; exporte o atual antes, se necessário.</p>
      <button type="button" className="dc-btn-primary dc-btn self-start" onClick={async () => { if (await uiConfirm(`Restaurar o backup «${file.name}»? O projeto atual será substituído.`)) restore(file.id) }}>Restaurar backup</button>
    </> : <>
      <label htmlFor="ladder-file-content" className="text-xs font-semibold">{file.folder === 'watchTables' ? 'Endereços a observar (um por linha)' : 'Conteúdo do ficheiro'}</label>
      <textarea id="ladder-file-content" className="dc-input !h-44 !p-2 font-mono text-xs resize-y" value={file.content} onChange={(e) => update(file.id, { content: e.target.value })} placeholder={file.folder === 'watchTables' ? 'I1\nQ1\nM1' : 'Escreva aqui…'} />
      {file.folder === 'watchTables' && <div className="ladder-data-grid">{addresses.map((address, i) => <div key={`${address}-${i}`} className="ladder-data-row"><strong>{address}</strong><span>{address in table ? table[address] ? '1 / TRUE' : '0 / FALSE' : db[address] ? `${db[address].type}: ${String(db[address].value)}` : 'Sem endereço no PLC selecionado'}</span><i className={table[address] ? 'is-on' : ''} /></div>)}</div>}
      {file.folder === 'externalSources' && <p className="text-xs text-amber-700">Texto guardado no projeto; compilação SCL/STL ainda não disponível.</p>}
      {file.folder === 'dataBlocks' && <>
        <p className="text-xs text-ink-500">JSON tipado: {`{"Enable":{"type":"BOOL","value":true},"Count":{"type":"INT","value":0},"Speed":{"type":"REAL","value":1.5}}`}. Use MOVE com <strong>{file.name}.Enable</strong> ou <strong>{file.name}.Count</strong>. INT/REAL ainda não têm interface FC.</p>
        {parseDataBlocks([file]).errors.map((error) => <p key={error} className="text-xs text-red-700" role="alert">{error}</p>)}
        <div className="ladder-data-grid">{Object.entries(db).filter(([key]) => key.startsWith(`${file.name}.`.toUpperCase())).map(([key, entry]) => <div className="ladder-data-row" key={key}><strong>{key}</strong><span>{entry.type}: {String(entry.value)}</span></div>)}</div>
      </>}
    </>}
  </div>
}

function FolderViewHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <header className="ladder-folder-header">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
    </header>
  )
}

function EmptyFolderMessage({ text }: { text: string }) {
  return <div className="ladder-folder-empty">{text}</div>
}

function FunctionBlockView({ id }: { id: 'fc1' | 'fc2' | `file:${string}` }) {
  const activePlcId = useSimStore((s) => s.activePlcId)
  const file = useSimStore((s) => s.projectFiles[activePlcId ?? '_general']?.find((f) => `file:${f.id}` === id))
  const fcBlocks = useSimStore((s) => s.fcBlocks)
  const rungs = id.startsWith('file:') ? file?.rungs ?? [] : fcBlocks[id as 'fc1' | 'fc2']
  const updateFc = (key: typeof id, next: LadderRung[]) => {
    if (key.startsWith('file:')) useSimStore.getState().updateProjectFile(key.slice(5), { rungs: next })
    else useSimStore.getState().updateFc(key as 'fc1' | 'fc2', next)
  }
  const modify = (index: number, fn: (r: LadderRung) => LadderRung) => updateFc(id, rungs.map((r, i) => i === index ? fn(r) : r))
  const add = () => updateFc(id, [...rungs, { id: crypto.randomUUID(), name: `Network ${rungs.length + 1}`, enabled: true, branches: [{ id: crypto.randomUUID(), elements: [] }], coils: [] }])
  return (
    <div className="ladder-folder-view">
      <FolderViewHeader icon={<IconFunction size={16} />} title={id.startsWith('file:') ? file?.name ?? 'Bloco eliminado' : NODE_TITLES[id as 'fc1' | 'fc2']} subtitle="Bloco editável, guardado com o projeto. Não é executado automaticamente: integre a lógica no OB1 para a simular." />
      <button className="dc-btn-primary dc-btn self-start my-2" onClick={add}><IconPlus size={12} /> Nova network</button>
      {!rungs.length && <p className="text-xs text-ink-400">Bloco vazio. Crie uma network para começar.</p>}
      {rungs.map((r, i) => <div className="ladder-rung-card" key={r.id}>
        <div className="ladder-rung-header"><strong>Network {i + 1}</strong>
          <input className="dc-input flex-1" aria-label="Nome da network" value={r.name} onChange={(e) => modify(i, (v) => ({ ...v, name: e.target.value }))} />
          <button className="dc-btn" onClick={() => updateFc(id, rungs.filter((x) => x.id !== r.id))} title="Eliminar network"><IconDelete size={12} /></button>
        </div>
        <div className="ladder-rung-body"><div className="lnet-scroll"><NetworkDiagram rung={r} readonly minWidth={640} /></div></div>
        <div className="p-2 flex flex-wrap gap-2 items-center text-xs">
          <button className="dc-btn" onClick={() => modify(i, (v) => applyKind(v, 'NO', { kind: 'branch', branchIndex: 0, index: v.branches[0]?.elements.length ?? 0 }).rung)}>+ Contato NA</button>
          <button className="dc-btn" onClick={() => modify(i, (v) => applyKind(v, 'NC', { kind: 'branch', branchIndex: 0, index: v.branches[0]?.elements.length ?? 0 }).rung)}>+ Contato NF</button>
          <button className="dc-btn" onClick={() => modify(i, (v) => applyKind(v, 'BRANCH').rung)}>+ Ramo OR</button>
          <button className="dc-btn" onClick={() => modify(i, (v) => applyKind(v, 'COIL').rung)}>+ Bobina</button>
          <button className="dc-btn" onClick={() => modify(i, (v) => applyKind(v, 'MOVE').rung)}>+ MOVE</button>
          <button className="dc-btn" onClick={() => modify(i, (v) => applyKind(v, 'CALL').rung)}>+ CALL FC</button>
          {r.move && <div className="flex gap-1 items-center"><strong>MOVE</strong><input className="dc-input !w-24" aria-label="MOVE origem" value={r.move.source} onChange={(e) => modify(i, (v) => ({ ...v, move: { ...v.move!, source: e.target.value.toUpperCase() } }))} />→<input className="dc-input !w-24" aria-label="MOVE destino" value={r.move.target} onChange={(e) => modify(i, (v) => ({ ...v, move: { ...v.move!, target: e.target.value.toUpperCase() } }))} /><button type="button" onClick={() => modify(i, (v) => ({ ...v, move: undefined }))}>×</button></div>}
          {r.call && <div className="flex gap-1 items-center"><strong>CALL</strong><Select className="dc-select !w-auto" value={r.call.targetId} onChange={(e) => modify(i, (v) => ({ ...v, call: { targetId: e.target.value } }))}>
            <option value="fc1">FC1</option><option value="fc2">FC2</option>
            {useSimStore.getState().projectFiles[activePlcId ?? '_general']?.filter((item) => item.folder === 'programBlocks').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select><button type="button" onClick={() => modify(i, (v) => ({ ...v, call: undefined }))}>×</button></div>}

          {r.branches.map((branch, bi) => <div key={branch.id} className="flex flex-wrap items-center gap-1 border rounded p-1">
            <span>Ramo {bi + 1}</span>
            {branch.elements.map((el) => <span key={el.id} className="inline-flex gap-1 items-center">
              <Select aria-label="Tipo de contacto" value={el.contactType} onChange={(e) => modify(i, (v) => ({ ...v, branches: v.branches.map((b) => b.id === branch.id ? { ...b, elements: b.elements.map((x) => x.id === el.id ? { ...x, contactType: e.target.value as LadderContactType } : x) } : b) }))}><option>NO</option><option>NC</option><option>RISING</option><option>FALLING</option></Select>
              <input className="dc-input !w-14" aria-label="Endereço do contacto" value={el.address} onChange={(e) => modify(i, (v) => ({ ...v, branches: v.branches.map((b) => b.id === branch.id ? { ...b, elements: b.elements.map((x) => x.id === el.id ? { ...x, address: e.target.value.toUpperCase() } : x) } : b) }))} />
              <button title="Remover contacto" onClick={() => modify(i, (v) => ({ ...v, branches: v.branches.map((b) => b.id === branch.id ? { ...b, elements: b.elements.filter((x) => x.id !== el.id) } : b) }))}>×</button>
            </span>)}
            {bi > 0 && <button title="Eliminar ramo" onClick={() => modify(i, (v) => ({ ...v, branches: v.branches.filter((b) => b.id !== branch.id) }))}>×</button>}
          </div>)}
          {r.coils.map((coil) => <span key={coil.id} className="inline-flex gap-1 items-center border rounded p-1">Bobina
            <input className="dc-input !w-14" aria-label="Endereço da bobina" value={coil.address} onChange={(e) => modify(i, (v) => ({ ...v, coils: v.coils.map((c) => c.id === coil.id ? { ...c, address: e.target.value.toUpperCase() } : c) }))} />
            <button title="Remover bobina" onClick={() => modify(i, (v) => ({ ...v, coils: v.coils.filter((c) => c.id !== coil.id) }))}>×</button>
          </span>)}
        </div>
      </div>)}
    </div>
  )
}

/** Escala base do editor completo: o "100%" mostrado ao utilizador equivale a 115% do desenho original. */
const ZOOM_BASE = 1.15
const ZOOM_MIN = 0.7
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1
/** chave nova: a antiga guardava a escala em bruto (1.15 = 115%) e ficaria a 132% */
const ZOOM_KEY = 'dcsimu:ladder:zoom:v2'

function FullLadderEditor({ section, setSection, onOpenSchematic }: { section: LadderSection; setSection: (value: LadderSection) => void; onOpenSchematic?: (componentId: string) => void }) {
  const components = useSimStore((s) => s.components)
  const plcs = components.filter(isProgrammablePlc)
  const activePlcId = useSimStore((s) => s.activePlcId)
  const setActivePlc = useSimStore((s) => s.setActivePlc)
  const plcIds = plcs.map((c) => c.id).join('|')
  useEffect(() => {
    if (plcs.length && !plcs.some((c) => c.id === activePlcId)) setActivePlc(plcs[0].id)
  }, [plcIds, activePlcId, setActivePlc])
  const rungs = useSimStore((s) => s.ladder.rungs)
  const wires = useSimStore((s) => s.wires)
  const tags = useSimStore((s) => s.tags)
  const table = useSimStore((s) => s.runtime.table)
  const timers = useSimStore((s) => s.runtime.timers)
  const counters = useSimStore((s) => s.runtime.counters)
  const rungPowered = useSimStore((s) => s.runtime.rungPowered)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const blackBox = useSimStore((s) => s.sim.blackBox)
  const grid = useSimStore((s) => s.grid)
  const setGrid = useSimStore((s) => s.setGrid)
  const addRung = useSimStore((s) => s.addRung)
  const updateRung = useSimStore((s) => s.updateRung)
  const undo = useSimStore((s) => s.undo)
  const redo = useSimStore((s) => s.redo)
  const history = useSimStore((s) => s.history)
  const future = useSimStore((s) => s.future)
  const [activeRungId, setActiveRungId] = useState<string | null>(null)
  const [statusTab, setStatusTab] = useState<'io' | 'memory' | 'timers' | 'counters'>('io')
  const [programTab, setProgramTab] = useState<'program' | 'tags'>('program')
  const [filter, setFilter] = useState('')
  const [ladderZoom, setLadderZoom] = useState(() => {
    try { return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(localStorage.getItem(ZOOM_KEY)) || 1)) } catch { return 1 }
  })
  useEffect(() => {
    try { localStorage.setItem(ZOOM_KEY, String(ladderZoom)) } catch {}
  }, [ladderZoom])
  const [showProjectPane, setShowProjectPane] = useState(() => !isSmallScreen())
  const [showPalette, setShowPalette] = useState(() => !isSmallScreen())
  const [activeProjectNode, setActiveProjectNode] = useState<ProjectNodeId>('main')
  useEffect(() => { setActiveProjectNode('main'); setProgramTab('program') }, [activePlcId])
  const [expandedNodes, setExpandedNodes] = useState<Set<ProjectNodeId>>(() => new Set(['plc', 'programBlocks']))
  const [dragOver, setDragOver] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // o onDrop das networks faz stopPropagation: sem isto a moldura de largada ficava presa
  useEffect(() => {
    const reset = () => setDragOver(false)
    window.addEventListener('drop', reset, true)
    window.addEventListener('dragend', reset, true)
    return () => { window.removeEventListener('drop', reset, true); window.removeEventListener('dragend', reset, true) }
  }, [])
  const [showStatus, setShowStatus] = useState(() => {
    try { return localStorage.getItem('dcsimu:ladder:status-open') !== '0' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('dcsimu:ladder:status-open', showStatus ? '1' : '0') } catch { /* navegação privada */ }
  }, [showStatus])
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const searchRef = useRef<HTMLInputElement>(null)
  const mainPaneRef = useRef<HTMLElement>(null)
  const showToasts = useLadderPrefs((p) => p.showToasts)
  const autoScroll = useLadderPrefs((p) => p.autoScroll)
  const confirmDelete = useLadderPrefs((p) => p.confirmDelete)
  const deleteRung = useSimStore((s) => s.deleteRung)
  const duplicateRung = useSimStore((s) => s.duplicateRung)
  const moveRung = useSimStore((s) => s.moveRung)

  const notify = useCallback((text: string) => {
    if (!useLadderPrefs.getState().showToasts) return
    window.clearTimeout(toastTimer.current)
    setToast({ text, id: Date.now() })
    toastTimer.current = window.setTimeout(() => setToast(null), 1400)
  }, [])
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const activeId = activeRungId && rungs.some((r) => r.id === activeRungId) ? activeRungId : rungs[0]?.id
  const counts = programCounts(rungs)
  const poweredCount = rungs.filter((r) => rungPowered[r.id]).length
  const files = useSimStore((s) => s.projectFiles[activePlcId ?? '_general'] ?? [])
  const hiddenFolders = useSimStore((s) => s.hiddenProjectFolders[activePlcId ?? '_general'] ?? [])
  const isMainOpen = activeProjectNode === 'main'
  const isFcOpen = activeProjectNode === 'fc1' || activeProjectNode === 'fc2' || (activeProjectNode.startsWith('file:') && files.some((f) => `file:${f.id}` === activeProjectNode && f.folder === 'programBlocks'))
  const isProgramView = isMainOpen || isFcOpen
  const activePlc = plcs.find((c) => c.id === activePlcId)
  const selectedFile = activeProjectNode.startsWith('file:') ? files.find((f) => f.id === activeProjectNode.slice(5)) : undefined
  const activeTitle = selectedFile?.name ?? (activeProjectNode === 'plc' ? activePlc?.ref ?? 'Programa geral' : NODE_TITLES[activeProjectNode as Exclude<ProjectNodeId, `file:${string}`>])

  const focusRung = useCallback((id: string | undefined) => {
    if (!id) return
    setActiveRungId(id)
    if (!useLadderPrefs.getState().autoScroll) return
    requestAnimationFrame(() => document.getElementById(`ladder-net-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }, [])

  const doUndo = useCallback(() => {
    const st = useSimStore.getState()
    if (!st.history.length) return notify('Nada para desfazer')
    st.undo(); notify('Desfeito')
  }, [notify])
  const doRedo = useCallback(() => {
    const st = useSimStore.getState()
    if (!st.future.length) return notify('Nada para refazer')
    st.redo(); notify('Refeito')
  }, [notify])

  const removeActiveRung = useCallback(async () => {
    const st = useSimStore.getState()
    const list = st.ladder.rungs
    const idx = list.findIndex((r) => r.id === activeId)
    if (idx < 0) return
    if (useLadderPrefs.getState().confirmDelete && !await uiConfirm(`Eliminar a network ${idx + 1}? Pode repô-la com Ctrl+Z.`)) return
    const neighbour = list[idx + 1] ?? list[idx - 1]
    st.deleteRung(list[idx].id)
    setActiveRungId(neighbour?.id ?? null)
    notify(`Network ${idx + 1} eliminada · Ctrl+Z repõe`)
  }, [activeId, notify])

  const quickAddRef = useRef<(kind: PaletteKind) => void>(() => {})

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = !!target?.closest('input,textarea,select,[contenteditable="true"]')
      const mod = event.ctrlKey || event.metaKey
      const key = event.key
      const lower = key.toLowerCase()

      // Ctrl+/ e ? abrem a ajuda — também a partir de campos, no caso do Ctrl+/
      if (mod && key === '/') { event.preventDefault(); setHelpOpen((v) => !v); return }
      if (typing || helpOpen) return

      // ---- vista/zoom (já existiam)
      if (mod && (key === '+' || key === '=')) { event.preventDefault(); setLadderZoom((v) => Math.min(ZOOM_MAX, Number((v + ZOOM_STEP).toFixed(2)))); return }
      if (mod && key === '-') { event.preventDefault(); setLadderZoom((v) => Math.max(ZOOM_MIN, Number((v - ZOOM_STEP).toFixed(2)))); return }
      if (mod && key === '0') { event.preventDefault(); setLadderZoom(1); return }

      // Alt+1…5 navega entre as áreas Ladder sem colidir com Ctrl+1…5 das vistas globais.
      if (!mod && event.altKey && !event.shiftKey && /^[1-5]$/.test(key)) {
        event.preventDefault()
        setSection((['Projeto', 'Biblioteca', 'Dispositivos', 'Diagnóstico', 'Configurações'] as LadderSection[])[Number(key) - 1])
        return
      }

      // Desfazer/refazer cobre todo o projeto Ladder (networks, tags e árvore).
      if (mod && !event.altKey && lower === 'z') { event.preventDefault(); if (event.shiftKey) doRedo(); else doUndo(); return }
      if (mod && !event.altKey && lower === 'y') { event.preventDefault(); doRedo(); return }

      // ---- os restantes só fazem sentido no programa Ladder principal
      if (section !== 'Projeto') return
      if (mod && lower === 'b') { event.preventDefault(); setShowPalette((v) => !v); return }
      if (mod && lower === 'j') { event.preventDefault(); setShowStatus((v) => !v); return }
      if (mod && lower === 'f') { event.preventDefault(); setShowPalette(true); requestAnimationFrame(() => searchRef.current?.focus()); return }
      if (!mod && !event.altKey && key === '/') { event.preventDefault(); setShowPalette(true); requestAnimationFrame(() => searchRef.current?.focus()); return }
      if (!mod && !event.altKey && key === '?') { event.preventDefault(); setHelpOpen(true); return }

      if (!isMainOpen || programTab !== 'program') return

      const list = useSimStore.getState().ladder.rungs
      const idx = list.findIndex((r) => r.id === activeId)

      // ---- criar / duplicar / eliminar / mover
      if (key === 'Insert' || (mod && event.shiftKey && lower === 'n')) {
        event.preventDefault()
        const created = addRung(); focusRung(created); notify('Nova network criada'); return
      }
      if (mod && !event.shiftKey && lower === 'd') {
        event.preventDefault()
        if (idx >= 0) { duplicateRung(list[idx].id); notify(`Network ${idx + 1} duplicada`); requestAnimationFrame(() => focusRung(useSimStore.getState().ladder.rungs[idx + 1]?.id)) }
        return
      }
      if (mod && key === 'Delete') { event.preventDefault(); removeActiveRung(); return }
      if (event.altKey && event.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
        event.preventDefault()
        if (idx >= 0) { moveRung(list[idx].id, key === 'ArrowUp' ? -1 : 1); requestAnimationFrame(() => focusRung(list[idx].id)) }
        return
      }

      // ---- navegar
      const go = (to: number) => { if (list.length) focusRung(list[Math.max(0, Math.min(list.length - 1, to))].id) }
      if (event.altKey && !event.shiftKey && key === 'ArrowUp') { event.preventDefault(); go((idx < 0 ? 0 : idx) - 1); return }
      if (event.altKey && !event.shiftKey && key === 'ArrowDown') { event.preventDefault(); go((idx < 0 ? 0 : idx) + 1); return }
      if (!mod && key === 'PageUp') { event.preventDefault(); go((idx < 0 ? 0 : idx) - 1); return }
      if (!mod && key === 'PageDown') { event.preventDefault(); go((idx < 0 ? 0 : idx) + 1); return }
      if (!mod && !event.altKey && key === 'Home') { event.preventDefault(); go(0); return }
      if (!mod && !event.altKey && key === 'End') { event.preventDefault(); go(list.length - 1); return }

      // ---- recolher / ativar
      if (mod && lower === 'e') {
        event.preventDefault()
        if (event.shiftKey) {
          setCollapsedIds((cur) => (cur.size >= list.length ? new Set() : new Set(list.map((r) => r.id))))
        } else if (activeId) {
          setCollapsedIds((cur) => { const next = new Set(cur); if (next.has(activeId)) next.delete(activeId); else next.add(activeId); return next })
        }
        return
      }
      if (mod && event.shiftKey && lower === 'a') {
        event.preventDefault()
        if (idx >= 0) { const enabled = !list[idx].enabled; updateRung(list[idx].id, (r) => ({ ...r, enabled }), 'force'); notify(`Network ${idx + 1} ${enabled ? 'ativada' : 'desativada'}`) }
        return
      }

      // ---- inserir elementos com uma tecla
      if (!mod && !event.altKey) {
        const hit = ELEMENT_KEYS.find((e) => e.key === lower && !!e.shift === event.shiftKey)
        if (hit) { event.preventDefault(); quickAddRef.current(hit.kind); notify(`${hit.label} inserido`) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [section, setSection, isMainOpen, programTab, activeId, helpOpen, addRung, updateRung, duplicateRung, moveRung, focusRung, doUndo, doRedo, removeActiveRung, notify])

  // Atalhos universais partilhados com o esquema 2D, o GRAFCET e os editores 3D.
  useEditorShortcuts({
    undo: doUndo,
    redo: doRedo,
    zoomView: (factor) => setLadderZoom((value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((value * factor).toFixed(2))))),
    fitView: () => setLadderZoom(1),
    panView: (dx, dy) => mainPaneRef.current?.scrollBy({ left: dx, top: dy, behavior: 'auto' }),
  }, { enabled: !helpOpen })

  const createFile = async (folder: ProjectFolder) => {
    const suggested = folder === 'programBlocks' ? 'FC' : folder === 'dataBlocks' ? 'DB' : folder === 'watchTables' ? 'Observação' : folder === 'backups' ? 'Backup' : 'Novo ficheiro'
    const name = (await uiPrompt('Nome do novo item:', `${suggested} ${(files.filter((f) => f.folder === folder).length + 1)}`))?.trim()
    if (!name) return
    const id = useSimStore.getState().addProjectFile(folder, name)
    if (id) { setProgramTab('program'); setActiveProjectNode(`file:${id}`); setExpandedNodes((prev) => new Set([...prev, folder])) }
  }
  const renameFile = async (file: ProjectFile) => {
    const name = (await uiPrompt('Novo nome do item:', file.name))?.trim()
    if (!name || name === file.name) return
    useSimStore.getState().updateProjectFile(file.id, { name })
  }
  const deleteFile = async (file: ProjectFile) => {
    if (!await uiConfirm(`Eliminar «${file.name}»? Esta ação remove o item do projeto.`)) return
    useSimStore.getState().deleteProjectFile(file.id)
    if (activeProjectNode === `file:${file.id}`) setActiveProjectNode(file.folder)
  }
  const deleteFolder = async (folder: ProjectFolder) => {
    const count = files.filter((file) => file.folder === folder).length
    const suffix = count ? ` e ${count} ${count === 1 ? 'item' : 'itens'} no seu interior` : ''
    if (!await uiConfirm(`Eliminar a pasta «${NODE_TITLES[folder]}»${suffix}? Poderá restaurar a pasta vazia no menu “＋ Pasta”.`)) return
    useSimStore.getState().deleteProjectFolder(folder)
    if (activeProjectNode === folder || selectedFile?.folder === folder) setActiveProjectNode('main')
  }

  const toggleNode = (id: ProjectNodeId) => {
    setExpandedNodes((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectProjectNode = (id: ProjectNodeId) => {
    setActiveProjectNode(id)
    setProgramTab('program')
  }

  const quickAdd = (kind: PaletteKind) => {
    setActiveProjectNode('main')
    setProgramTab('program')
    const hadActiveRung = !!activeId
    const rungId = activeId ?? addRung()
    setActiveRungId(rungId)
    updateRung(rungId, (r) => applyKind(r, kind).rung, hadActiveRung ? 'force' : 'skip')
  }
  quickAddRef.current = quickAdd

  /** Fallback: largar fora de qualquer network (área vazia) → network ativa. */
  const dropKindFromEvent = (e: React.DragEvent): PaletteKind | null => {
    const k = e.dataTransfer.getData(LADDER_MIME) as PaletteKind
    if (k) return k
    const compType = e.dataTransfer.getData('text/plain') as ComponentType
    return COMPONENT_TO_LADDER[compType] ?? null
  }

  const visibleGroups = PALETTE_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !filter.trim() || `${item.label} ${item.detail}`.toLowerCase().includes(filter.toLowerCase())),
  })).filter((group) => group.items.length)

  return (
    <div className="ladder-workspace">
      {section === 'Projeto' && (showProjectPane ? (
        <ProjectTreePane
          activeNode={activeProjectNode}
          expanded={expandedNodes}
          onToggle={toggleNode}
          onSelect={selectProjectNode}
          onClose={() => setShowProjectPane(false)}
          onQuickAdd={quickAdd}
          activePlc={activePlc}
          files={files}
          hiddenFolders={hiddenFolders}
          onCreateFile={createFile}
          onDeleteFile={deleteFile}
          onRenameFile={renameFile}
          onDeleteFolder={deleteFolder}
          onRestoreFolder={(folder) => useSimStore.getState().restoreProjectFolder(folder)}
        />
      ) : (
        <button className="ladder-collapsed-pane-button" onClick={() => setShowProjectPane(true)} title="Mostrar projeto">
          Projeto
        </button>
      ))}
      <main className="ladder-main-pane" ref={mainPaneRef}>
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line bg-white text-[11px] shrink-0">
          <label htmlFor="ladder-target-plc" className="font-semibold text-ink-600 whitespace-nowrap">PLC a programar</label>
          <Select id="ladder-target-plc" className="dc-select !w-auto max-w-[280px]" value={plcs.some((c) => c.id === activePlcId) ? activePlcId! : ''}
            disabled={!plcs.length} onChange={(e) => setActivePlc(e.target.value)}>
            {!plcs.length && <option value="">Sem PLC no esquema · programa geral</option>}
            {plcs.map((c) => <option key={c.id} value={c.id}>{c.ref} · {c.label || c.type}</option>)}
          </Select>
          <span className="truncate text-ink-400">{plcs.length > 1 ? `${plcs.length} PLCs · programa independente por dispositivo` : plcs.length ? 'Programa deste PLC' : 'Adicione um PLC no Esquema'}</span>
        </div>
        {section !== 'Projeto' ? <LadderSections section={section} groups={PALETTE_GROUPS} renderGlyph={(kind) => <LadderGlyph kind={kind} size={30} />} onAdd={(kind) => { quickAdd(kind); setSection('Projeto') }} onOpenSchematic={onOpenSchematic} /> : <>
        <div className="ladder-project-tabs">
          <button className={`ladder-project-tab ${programTab === 'program' ? 'is-active' : ''}`} onClick={() => setProgramTab('program')}>
            {isFcOpen ? <IconFunction size={13} /> : <IconSchematic size={13} />} {activeTitle} <span>×</span>
          </button>
          <button className={`ladder-project-tab ${programTab === 'tags' ? 'is-active' : ''}`} onClick={() => { setProgramTab('tags'); setActiveProjectNode('plcVariables') }}>Tabela de Tags</button>
          <span className="ml-auto flex items-center gap-2 text-[10px] text-slate-400">
            <span className={`ladder-connection-dot ${running ? 'is-live' : ''}`} /> {running ? 'Simulação ativa' : 'Parado'}
          </span>
        </div>
        <div className="ladder-editor-toolbar">
          <button className="ladder-toolbar-button" onClick={doUndo} disabled={!history.length} title="Desfazer (Ctrl+Z)" aria-label="Desfazer"><IconUndo size={14} /></button>
          <button className="ladder-toolbar-button" onClick={doRedo} disabled={!future.length} title="Refazer (Ctrl+Y)" aria-label="Refazer"><IconRedo size={14} /></button>
          <span className="ladder-toolbar-separator" />
          <span className="ladder-zoom-label">⌕ {Math.round(ladderZoom * 100)}%</span>
          <button className="ladder-toolbar-button" disabled={ladderZoom <= ZOOM_MIN} onClick={() => setLadderZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))))} title="Reduzir zoom (Ctrl−)"><IconZoomOut size={14} /></button>
          <button className="ladder-toolbar-button" onClick={() => setLadderZoom(1)} title="Zoom 100% (Ctrl+0)">100</button>
          <button className="ladder-toolbar-button" disabled={ladderZoom >= ZOOM_MAX} onClick={() => setLadderZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))))} title="Aumentar zoom (Ctrl+)"><IconZoomIn size={14} /></button>
          <span className="ladder-toolbar-separator" />
          <button
            className={`ladder-toolbar-button ${grid.enabled ? 'is-active' : ''}`}
            onClick={() => setGrid({ enabled: !grid.enabled })}
            title={`Malha ${grid.enabled ? 'ligada' : 'desligada'} · clique para ${grid.enabled ? 'esconder' : 'mostrar'}`}
          >
            <IconGrid size={14} />
          </button>
          <span className="ladder-zoom-label">Malha {grid.enabled ? `${grid.size}px` : 'off'}</span>
          <span className="ladder-toolbar-separator" />
          <span className="text-[10px] text-slate-400">{isProgramView ? 'Programa Ladder' : activeTitle}</span>
          {isMainOpen && programTab === 'program' && rungs.length > 1 && (
            <>
              <span className="ladder-toolbar-separator" />
              <button className="ladder-toolbar-button" onClick={() => setCollapsedIds((cur) => (cur.size >= rungs.length ? new Set() : new Set(rungs.map((r) => r.id))))} title="Recolher / expandir todas (Ctrl+Shift+E)">
                {collapsedIds.size >= rungs.length ? 'Expandir tudo' : 'Recolher tudo'}
              </button>
            </>
          )}
          <button className="ladder-toolbar-button ml-auto" onClick={() => setHelpOpen(true)} title="Atalhos de teclado (?)" aria-label="Atalhos de teclado"><IconHelp size={14} /> <span className="ml-1 text-[10px]">Atalhos</span></button>
          {isMainOpen && <button onClick={() => { const id = addRung(); focusRung(id) }} className="ladder-primary-button" title="Criar network (Insert)"><IconPlus size={12} /> Nova network</button>}
        </div>
        {programTab === 'program' && isMainOpen && (
          <div className="ladder-program-summary">
            <LadderMetric label="Networks" value={rungs.length} />
            <LadderMetric label="Energizadas" value={running ? poweredCount : 0} tone={running && poweredCount ? 'run' : 'neutral'} />
            <LadderMetric label="Contatos" value={counts.contacts} />
            <LadderMetric label="Bobinas" value={counts.coils} />
            <LadderMetric label="Timers/Counters" value={`${counts.timers}/${counts.counters}`} tone={counts.timers + counts.counters ? 'warn' : 'neutral'} />
            <div className="ladder-live-bus">
              <span>Bus I/Q/M</span>
              <strong>{onCount(table, 'I')} / {onCount(table, 'Q')} / {onCount(table, 'M')}</strong>
            </div>
          </div>
        )}
        {programTab === 'tags' ? (
          <div className="ladder-tags-view"><TagTable /></div>
        ) : blackBox && isMainOpen ? (
          <BlackBoxState />
        ) : isFcOpen ? (
          <FunctionBlockView id={activeProjectNode as 'fc1' | 'fc2' | `file:${string}`} />
        ) : selectedFile ? (
          <ProjectFileView file={selectedFile} table={table} onDelete={() => deleteFile(selectedFile)} />
        ) : !isMainOpen ? (
          <ProjectDataView activeNode={activeProjectNode} files={files} onCreate={createFile} onOpen={(id) => setActiveProjectNode(`file:${id}`)} />
          ) : (
          <div
            className={`ladder-networks ${grid.enabled ? (grid.style === 'lines' ? 'grid-lines' : '') : 'grid-off'} drop-zone ${dragOver ? 'drag-over' : ''}`}
            style={grid.enabled ? { backgroundSize: `${grid.size}px ${grid.size}px` } : undefined}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
            onDragEnter={() => setDragOver(true)}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false) }}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              setLadderDrag(null)
              const kind = dropKindFromEvent(e)
              if (kind) quickAdd(kind)
            }}
          >
            <div className="ladder-networks-scale" style={{ zoom: ladderZoom * ZOOM_BASE }}>
              {rungs.map((r, i) => (
                <div
                  key={r.id}
                  id={`ladder-net-${r.id}`}
                  className={`ladder-network-wrap ${activeId === r.id ? 'is-selected' : ''}`}
                  tabIndex={0}
                  role="region"
                  aria-label={`Network ${i + 1}: ${r.name || 'sem título'}`}
                  onFocusCapture={() => setActiveRungId(r.id)}
                  onMouseDownCapture={() => setActiveRungId(r.id)}
                >
                  <RungRow
                    rung={r} index={i} total={rungs.length} active={activeId === r.id} minWidth={720}
                    collapsed={collapsedIds.has(r.id)}
                    onToggleCollapse={() => setCollapsedIds((cur) => { const next = new Set(cur); if (next.has(r.id)) next.delete(r.id); else next.add(r.id); return next })}
                  />
                </div>
              ))}
              {!rungs.length && <LadderEmptyState onCreate={addRung} />}
            </div>
          </div>
        )}
        <div className={`ladder-bottom-panel ${showStatus ? '' : 'is-collapsed'}`}>
          <div className="ladder-bottom-tabs" role="tablist" aria-label="Estado do PLC">
            {([['io', 'Entradas/Saídas'], ['memory', 'Memórias'], ['timers', 'Temporizadores'], ['counters', 'Contadores']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={statusTab === id} className={statusTab === id ? 'is-active' : ''} onClick={() => { setStatusTab(id); setShowStatus(true) }}>{label}</button>
            ))}
            <button
              className="ladder-bottom-toggle"
              onClick={() => setShowStatus((v) => !v)}
              aria-expanded={showStatus}
              title={`${showStatus ? 'Esconder' : 'Mostrar'} painel de estado (Ctrl+J)`}
            >
              <IconChevronDown size={12} className={showStatus ? '' : 'is-flipped'} /> {showStatus ? 'Esconder' : 'Mostrar'}
            </button>
          </div>
          {showStatus && <div className="ladder-status-grid" role="tabpanel">
            {statusTab === 'io' && <><NetworkStatus table={table} prefix="I" label="Entradas" plc={activePlc} wires={wires} components={components} tags={tags} rungs={rungs} /><NetworkStatus table={table} prefix="Q" label="Saídas" plc={activePlc} wires={wires} components={components} tags={tags} rungs={rungs} /></>}
            {statusTab === 'memory' && <NetworkStatus table={table} prefix="M" label="Memórias" plc={activePlc} wires={wires} components={components} tags={tags} rungs={rungs} />}
            {statusTab === 'timers' && <div className="ladder-project-status"><span>Temporizadores</span>{Object.entries(timers).length ? Object.entries(timers).map(([address, t]) => <small key={address}>{address}: {t.elapsedMs} / {t.presetMs} ms · {t.done ? 'ativo' : 'inativo'}</small>) : <small>Nenhum temporizador executado.</small>}</div>}
            {statusTab === 'counters' && <div className="ladder-project-status"><span>Contadores</span>{Object.entries(counters).length ? Object.entries(counters).map(([address, c]) => <small key={address}>{address}: {c.count} / {c.preset} · {c.done ? 'atingido' : 'em contagem'}</small>) : <small>Nenhum contador executado.</small>}</div>}
            <div className="ladder-project-status"><span>Estado do Projeto</span><strong><i /> {running ? 'Simulação ativa' : 'Pronto'}</strong></div>
          </div>}
        </div>
        </>}
      </main>
      {section === 'Projeto' && (showPalette ? (
      <aside className="ladder-palette">
        <div className="ladder-palette-header">
          <div>
            <strong>Elementos Ladder</strong>
            <small>Network ativa: {activeId ? rungs.findIndex((r) => r.id === activeId) + 1 : '—'}</small>
          </div>
          <button className="ladder-ghost-button" onClick={() => setShowPalette(false)} title="Recolher elementos">›</button>
        </div>
        <div className="relative mb-2">
          <input ref={searchRef} className="ladder-palette-search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar elemento…  ( / )" onKeyDown={(e) => { if (e.key === 'Escape') { setFilter(''); (e.target as HTMLInputElement).blur() } }} />
          <span className="ladder-search-icon">⌕</span>
        </div>
        <div className="ladder-palette-scroll">
          {visibleGroups.map((group) => (
            <section className="ladder-palette-group" key={group.title}>
              <div className="ladder-palette-group-title"><IconChevronDown size={12} /> {group.title} <span>⌃</span></div>
              {group.items.map((item) => (
                <button
                  className="ladder-palette-item"
                  key={item.kind}
                  onClick={() => quickAdd(item.kind)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(LADDER_MIME, item.kind)
                    e.dataTransfer.setData('text/plain', `ladder:${item.kind}`)
                    e.dataTransfer.effectAllowed = 'copy'
                    setLadderDrag({ kind: item.kind })
                  }}
                  onDragEnd={() => setLadderDrag(null)}
                  title={`${item.label} — clique insere na network ativa · arraste para a posição exata`}
                >
                  <span className="ladder-palette-icon"><PaletteIcon type={item.kind} /></span>
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                </button>
              ))}
            </section>
          ))}
          {!visibleGroups.length && (
            <div className="ladder-palette-empty">
              <IconFunction size={18} />
              <strong>Nenhum elemento encontrado</strong>
              <span>Revise o termo de busca ou limpe o filtro.</span>
            </div>
          )}
        </div>
      </aside>
      ) : (
        <button className="ladder-collapsed-pane-button is-right" onClick={() => setShowPalette(true)} title="Mostrar elementos">
          Elementos
        </button>
      ))}
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      {toast && <div key={toast.id} className="ladder-toast" role="status" aria-live="polite">{toast.text}</div>}
    </div>
  )
}

export default function LadderEditor({ compact = false, section = 'Projeto', setSection = () => {}, onOpenSchematic }: { compact?: boolean; section?: LadderSection; setSection?: (value: LadderSection) => void; onOpenSchematic?: (componentId: string) => void }) {
  return compact ? <CompactLadderEditor /> : <FullLadderEditor section={section} setSection={setSection} onOpenSchematic={onOpenSchematic} />
}
