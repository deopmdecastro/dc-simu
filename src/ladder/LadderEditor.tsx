import { useLadderZoom, LADDER_ZOOM_STEP } from './ladderZoom'
import { useLadderUi } from './ladderBus'
import VirtualIoPanel from '../components/VirtualIoPanel'
import { lintLadder } from './ladderLint'
import { uiConfirm, uiPrompt } from '../ui/dialogs'
import Select from '../ui/Select'
import LadderSections, { type LadderSection } from './LadderSections'
import { isSmallScreen } from '../ui/cleanMode'
import { isProgrammablePlc } from './plcPrograms'
import { PROJECT_FOLDERS, defaultProjectFileContent, type ProjectFile, type ProjectFolder } from './projectFiles'
import { plcIoRows } from './plcIo'
import { parseDataBlocks } from './dataBlocks'
import { collectUsedAddresses } from './ladderEngine'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import TagTable from './TagTable'
import type { LadderRung, LadderContactType, ComponentType, ElectricalComponent } from '../types'
import NetworkDiagram, { type RungSelection } from './NetworkDiagram'
import LadderElementDialog from './LadderElementDialog'
import AddBlockDialog from './AddBlockDialog'
import type { BlockKind } from './blockCatalog'
import { CALL_BLOCK_MIME, COMPONENT_TO_LADDER, LADDER_MIME, COMPARE_KIND_OP, applyKind, getLadderDrag, isCompareKind, isContactKind, onOpenLadderBlock, setLadderDrag, type CallBlockPayload, type PaletteKind } from './ladderDnd'
import { insertIntoRungs, newEmptyRung } from './ladderInsert'

/** Lê o payload de um bloco do projeto em arraste (dataTransfer + fallback do drag ativo). */
const blockPayloadFrom = (data: DataTransfer): CallBlockPayload | null => {
  try {
    const raw = data.getData(CALL_BLOCK_MIME)
    if (raw) return JSON.parse(raw) as CallBlockPayload
  } catch { /* ignora payload inválido */ }
  const d = getLadderDrag()
  return d && 'block' in d ? d.block : null
}
import {
  IconPlus, IconDelete, IconCopy, IconClose,
  IconZoomIn, IconZoomOut, IconSchematic, IconLadder,
  IconFunction, IconChevronDown, IconChevronRight, IconShield, IconSearch,
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





/* --------------------------------------------------------------- editor row */

/** Barra única de elementos por network: clique insere · arraste para posicionar. */

/** Operações sobre networks — override para editores fora do Main (blocos FC/FB/ficheiros). */
interface RungOps {
  /** Networks do mesmo programa (para mover contactos entre elas). */
  rungs?: LadderRung[]
  updateRung: (id: string, fn: (r: LadderRung) => LadderRung, mode?: 'auto' | 'force' | 'skip') => void
  renameRung: (id: string, name: string) => void
  deleteRung: (id: string) => void
  duplicateRung: (id: string) => void
  moveRung: (id: string, dir: number) => void
}

function RungRow({ rung, index, total = 1, minWidth = 640, active = false, collapsed: collapsedProp, onToggleCollapse, ops }: {
  rung: LadderRung; index: number; total?: number; minWidth?: number; active?: boolean
  /** controlado pelo pai (Ctrl+E, recolher tudo); sem valor, a network gere o seu estado */
  collapsed?: boolean; onToggleCollapse?: () => void
  /** Override de escrita/leitura das networks (blocos do projeto); omisso → store (Main). */
  ops?: RungOps
}) {
  // Seletor booleano: re-render só quando ESTA network muda de estado
  // (subscrever o mapa inteiro forçava repintar todas as networks a cada scan).
  const powered = useSimStore((s) => !!s.runtime.rungPowered[rung.id])
  const running = useSimStore((s) => s.sim.runState === 'running')
  // Actions da store (referências estáveis) como fallback das ops do bloco —
  // evita `useSimStore()` (subscrição ao estado completo → re-render a cada tick).
  const deleteRungStore = useSimStore((s) => s.deleteRung)
  const duplicateRungStore = useSimStore((s) => s.duplicateRung)
  const moveRungStore = useSimStore((s) => s.moveRung)
  const renameRungStore = useSimStore((s) => s.renameRung)
  const updateRungStore = useSimStore((s) => s.updateRung)
  const deleteRung = ops?.deleteRung ?? deleteRungStore
  const duplicateRung = ops?.duplicateRung ?? duplicateRungStore
  const moveRung = ops?.moveRung ?? moveRungStore
  const renameRung = ops?.renameRung ?? renameRungStore
  const updateRung = ops?.updateRung ?? updateRungStore
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
  const outputCount = rung.coils.length + (rung.timer ? 1 : 0) + (rung.counter ? 1 : 0) + (rung.call ? 1 : 0) + (rung.move ? 1 : 0) + (rung.math ? 1 : 0)
  const blockKinds = [rung.timer?.timerType, rung.counter?.counterType, rung.move ? 'MOVE' : '', rung.math?.op ?? '', rung.call ? 'CALL' : ''].filter(Boolean)

  const plcId = useSimStore((st) => st.activePlcId)
  const fcFiles = useSimStore((st) => st.projectFiles[plcId ?? '_general'] ?? [])

  return (
    <div id={`rung-${rung.id}`} className={`ladder-rung-card ${powered && running ? 'is-powered' : ''} ${collapsed ? 'is-collapsed' : ''} ${active ? 'is-active' : ''} ${rung.enabled ? '' : 'is-disabled'}`}>
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
            updateRung={ops?.updateRung}
            siblingRungs={ops?.rungs}
          />
        </div>
      </div>


      </>
      )}
      <LadderElementDialog
        updateRung={ops?.updateRung}
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
  const ladderZoom = useLadderZoom((state) => state.zoom)
  const setLadderZoom = useLadderZoom((state) => state.setZoom)
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
            // Bloco arrastado da árvore → CALL na última network (mesmo do editor completo).
            const block = blockPayloadFrom(e.dataTransfer)
            setLadderDrag(null)
            if (block) {
              setTab('program')
              const existingRung = rungs[rungs.length - 1]
              const rungId = existingRung?.id ?? addRung()
              updateRung(rungId, (r) => ({ ...r, call: { targetId: block.fileId } }), existingRung ? 'force' : 'skip')
              return
            }
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
      { kind: 'TONR', label: 'TONR', detail: 'Atraso retentivo', icon: 'timer' },
    ],
  },
  {
    title: 'Operações',
    items: [{ kind: 'MOVE', label: 'MOVE', detail: 'BOOL/INT/REAL via DB', icon: 'move' }, { kind: 'CALL', label: 'CALL FC', detail: 'Invocar bloco', icon: 'function' }],
  },
  {
    title: 'Matemática',
    items: [
      { kind: 'ADD', label: 'ADD', detail: 'Somar', icon: 'math' },
      { kind: 'SUB', label: 'SUB', detail: 'Subtrair', icon: 'math' },
      { kind: 'MUL', label: 'MUL', detail: 'Multiplicar', icon: 'math' },
      { kind: 'DIV', label: 'DIV', detail: 'Dividir', icon: 'math' },
      { kind: 'MOD', label: 'MOD', detail: 'Resto da divisão', icon: 'math' },
    ],
  },
  {
    title: 'Comparação',
    items: [
      { kind: 'CMP_EQ', label: '==', detail: 'Igual', icon: 'compare' },
      { kind: 'CMP_NE', label: '<>', detail: 'Diferente', icon: 'compare' },
      { kind: 'CMP_GE', label: '>=', detail: 'Maior ou igual', icon: 'compare' },
      { kind: 'CMP_LE', label: '<=', detail: 'Menor ou igual', icon: 'compare' },
      { kind: 'CMP_GT', label: '>', detail: 'Maior', icon: 'compare' },
      { kind: 'CMP_LT', label: '<', detail: 'Menor', icon: 'compare' },
    ],
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
  } else if (isCompareKind(kind)) {
    body = (
      <g {...common}>
        <path d="M0 12H9M31 12H40M9 3V21M31 3V21" />
        <text x="20" y="11" fontSize="8.5" fontWeight="800" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="ui-monospace, monospace">{COMPARE_KIND_OP[kind]}</text>
        <text x="20" y="19" fontSize="5.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="ui-monospace, monospace">Int</text>
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

const FOLDER_FILE_ICON: Record<ProjectFolder, ProjectTreeItem['icon']> = {
  programBlocks: 'block',
  dataBlocks: 'data',
  technologyObjects: 'folder',
  externalSources: 'source',
  plcVariables: 'tags',
  watchTables: 'watch',
  backups: 'backup',
  documentation: 'doc',
}

function ProjectTreePane({
  tagCount,
  activeNode,
  expanded,
  onToggle,
  onSelect,
  onClose,
  onQuickAdd,
  onInsertCall,
  activePlc,
  files,
  hiddenFolders,
  folderLabels,
  fcNames,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  onRenameFolder,
  onRenameFc,
  onDeleteFolder,
  onRestoreFolder,
}: {
  /** Contador da tabela de tags real, que não vive como ficheiro genérico. */
  tagCount: number
  files: ProjectFile[]
  hiddenFolders: ProjectFolder[]
  /** Rótulos personalizados das pastas (sem entrada = predefinido). */
  folderLabels: Partial<Record<ProjectFolder, string>>
  /** Nome personalizado das funções fixas FC1/FC2. */
  fcNames: Partial<Record<'fc1' | 'fc2', string>>
  onCreateFile: (folder: ProjectFolder) => void
  onDeleteFile: (file: ProjectFile) => void
  onRenameFile: (file: ProjectFile) => void
  onRenameFolder: (folder: ProjectFolder) => void
  onRenameFc: (id: 'fc1' | 'fc2') => void
  onDeleteFolder: (folder: ProjectFolder) => void
  onRestoreFolder: (folder: ProjectFolder) => void
  activePlc?: ElectricalComponent
  activeNode: ProjectNodeId
  expanded: Set<ProjectNodeId>
  onToggle: (id: ProjectNodeId) => void
  onSelect: (id: ProjectNodeId) => void
  onClose: () => void
  onQuickAdd: (kind: PaletteKind) => void
  /** Inserir CALL do bloco numa network (toque/atalho — o drag&drop usa o CALL_BLOCK_MIME). */
  onInsertCall: (fileId: string, name: string) => void
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
      label: folderLabels[folder.id as ProjectFolder]?.trim() || folder.label,
      children: PROJECT_FOLDERS.includes(folder.id as ProjectFolder) ? [ ...(folder.children ?? []), ...files.filter((f) => f.folder === folder.id).map((f) => ({ id: `file:${f.id}` as ProjectNodeId, label: f.name, icon: FOLDER_FILE_ICON[f.folder] })) ] : folder.children,
    })) }
  /** Rótulo final do nó estático (FC1/FC2 com nome personalizado mantêm o id técnico à direita, como no TIA). */
  const blockLabel = (node: ProjectTreeItem) => (node.id === 'fc1' || node.id === 'fc2')
    ? `${fcNames[node.id]?.trim() || node.label.split('[')[0].trim()} [${node.id === 'fc1' ? 'FC1' : 'FC2'}]`
    : node.label
  const renderNode = (node: ProjectTreeItem, depth = 0) => {
    const hasChildren = !!node.children?.length
    const isFile = node.id.startsWith('file:')
    const file = isFile ? files.find((item) => `file:${item.id}` === node.id) : undefined
    const folder = PROJECT_FOLDERS.includes(node.id as ProjectFolder) ? node.id as ProjectFolder : null
    const itemCount = folder ? (folder === 'plcVariables' ? tagCount : files.filter((item) => item.folder === folder).length) : null
    const canDeleteFolder = !!folder && folder !== 'programBlocks' && folder !== 'plcVariables'
    const isExpandableFolder = !isFile && (hasChildren || !BLOCK_NODE_IDS.has(node.id))
    const isOpen = expanded.has(node.id)
    const isActive = activeNode === node.id
    // Só blocos de programa podem ser chamados por CALL (ficheiros SCL/DB não são executáveis em ladder).
    // FC1 e FC2 (nós estáticos) também são arrastáveis/inseríveis, como os blocos da pasta.
    const isCallableBlock = (!!file && file.folder === 'programBlocks') || node.id === 'fc1' || node.id === 'fc2'
    const renameableBlock = node.id === 'fc1' || node.id === 'fc2'
    const shownLabel = blockLabel(node)
    const callPayload: CallBlockPayload | null = isCallableBlock
      ? (file ? { fileId: file.id, name: file.name } : { fileId: node.id as 'fc1' | 'fc2', name: shownLabel })
      : null
    return (
      <div key={node.id}>
        <div className="tree-row-wrap">
        <button
          type="button"
          className={`tree-row tree-depth-${Math.min(depth, 2)} ${isActive ? 'tree-selected' : ''} ${isCallableBlock ? 'tree-row-grab' : ''}`}
          draggable={isCallableBlock}
          onDragStart={(event) => {
            if (!callPayload) return
            event.dataTransfer.setData(CALL_BLOCK_MIME, JSON.stringify(callPayload))
            event.dataTransfer.setData('text/plain', `call-block:${callPayload.name}`)
            event.dataTransfer.effectAllowed = 'copy'
            setLadderDrag({ block: callPayload })
          }}
          onDragEnd={() => setLadderDrag(null)}
          onClick={() => {
            if (isExpandableFolder) onToggle(node.id)
            onSelect(node.id)
          }}
          onDoubleClick={(event) => {
            if (file) { event.stopPropagation(); onRenameFile(file) }
            else if (renameableBlock) { event.stopPropagation(); onRenameFc(node.id as 'fc1' | 'fc2') }
            else if (folder) { event.stopPropagation(); onRenameFolder(folder) }
          }}
          onContextMenu={(event) => { if (file) { event.preventDefault(); onDeleteFile(file) } }}
          title={isCallableBlock
            ? `${shownLabel} · arraste para uma network da Main (insere CALL) · botão CALL insere na network ativa · duplo clique muda o nome`
            : file
              ? `${shownLabel} · duplo clique para mudar o nome · botão direito para eliminar`
              : renameableBlock || folder
                ? `${shownLabel} · duplo clique para mudar o nome`
                : node.detail ? `${shownLabel} (${node.detail})` : shownLabel}
        >
          <span className="tree-chevron">
            {isExpandableFolder ? (isOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />) : <span />}
          </span>
          <TreeGlyph icon={node.icon} />
          <span className="tree-label">{shownLabel}</span>
          {itemCount !== null && <span className="tree-item-count" title={`${itemCount} ${folder === 'plcVariables' ? 'variáveis' : 'itens'}`}>{itemCount}</span>}
          {node.detail && <small>({node.detail})</small>}
        </button>
        {folder && <span className="tree-row-actions">
          <button type="button" className="tree-create-file" title={`Criar em ${node.label}`} aria-label={`Criar em ${node.label}`} onClick={() => onCreateFile(folder)}>＋</button>
          {canDeleteFolder && <button type="button" className="tree-delete-item" title={`Eliminar pasta ${node.label}`} aria-label={`Eliminar pasta ${node.label}`} onClick={() => onDeleteFolder(folder)}><IconDelete size={10} /></button>}
        </span>}
        {isCallableBlock && callPayload && (
          <button type="button" className="tree-call-insert" title={`Inserir CALL ${callPayload.name} na network ativa da Main`} aria-label={`Inserir CALL ${callPayload.name}`} onClick={(event) => { event.stopPropagation(); onInsertCall(callPayload.fileId, callPayload.name) }}>CALL</button>
        )}
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
            {hiddenFolders.map((folder) => <option key={folder} value={folder}>{folderLabels[folder]?.trim() || NODE_TITLES[folder]}</option>)}
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

const PROJECT_FOLDER_DESCRIPTION: Record<ProjectFolder, string> = {
  programBlocks: 'Blocos Ladder editáveis. Só OB1 é executado automaticamente.',
  dataBlocks: 'Variáveis BOOL/INT/REAL em JSON, acessíveis por MOVE e contactos BOOL.',
  technologyObjects: 'Objetos com configuração persistida de tipo, endereço, setpoint e estado.',
  externalSources: 'Fontes SCL/ST/STL guardadas no projeto como referência editável.',
  plcVariables: 'Tabela de tags real do PLC selecionado, disponível de imediato nas networks.',
  watchTables: 'Endereços I/Q/M/T/C e variáveis DB observados em tempo real.',
  backups: 'Instantâneos JSON do projeto, restauráveis neste dispositivo.',
  documentation: 'Notas operacionais e de manutenção guardadas com o PLC selecionado.',
}

const PROJECT_FOLDER_CREATE_LABEL: Record<ProjectFolder, string> = {
  programBlocks: 'Criar bloco',
  dataBlocks: 'Criar bloco de dados',
  technologyObjects: 'Criar objeto',
  externalSources: 'Criar fonte',
  plcVariables: 'Gerir variáveis',
  watchTables: 'Criar tabela',
  backups: 'Criar backup',
  documentation: 'Criar documento',
}

function formatProjectDate(value: string | undefined) {
  if (!value) return 'sem data'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'sem data' : date.toLocaleString('pt-PT')
}

function projectFileSummary(file: ProjectFile) {
  if (file.folder === 'watchTables') return `${file.content.split(/[\s,;]+/).filter(Boolean).length} endereço(s) em observação`
  if (file.folder === 'backups') return `${Math.max(1, Math.ceil(new Blob([file.content]).size / 1024))} KB · instantâneo restaurável`
  if (file.folder === 'technologyObjects') return 'Configuração tecnológica editável'
  if (file.folder === 'externalSources') return `${file.content.split('\n').length} linha(s) de fonte`
  if (file.folder === 'documentation') return `${file.content.trim().length} caracteres de documentação`
  return `Atualizado ${formatProjectDate(file.updatedAt ?? file.createdAt)}`
}

function ProjectDataView({ activeNode, files, onCreate, onOpen }: {
  activeNode: ProjectNodeId; files: ProjectFile[]; onCreate: (folder: ProjectFolder) => void; onOpen: (id: string) => void
}) {
  const tags = useSimStore((s) => s.tags)
  const folder = PROJECT_FOLDERS.includes(activeNode as ProjectFolder) ? activeNode as ProjectFolder : null
  if (!folder) return <div className="ladder-folder-view"><FolderViewHeader icon={<IconCube size={16} />} title="Projeto" subtitle="Escolha uma pasta para criar itens reais do PLC." /></div>
  if (folder === 'plcVariables') return <div className="ladder-project-tags-view">
    <FolderViewHeader icon={<IconTag size={16} />} title="Variáveis PLC" subtitle={`${tags.length} variável(is) no PLC selecionado. Edite, importe ou exporte a tabela abaixo.`} />
    <TagTable />
  </div>

  const matching = files.filter((f) => f.folder === folder)
  return <div className={`ladder-folder-view ladder-asset-folder ${folder === 'dataBlocks' ? 'ladder-data-folder' : ''}`}>
    <FolderViewHeader icon={<TreeGlyph icon={FOLDER_FILE_ICON[folder]} />} title={NODE_TITLES[folder]} subtitle={PROJECT_FOLDER_DESCRIPTION[folder]} />
    <div className="ladder-folder-actions">
      <button type="button" className="dc-btn-primary dc-btn" onClick={() => onCreate(folder)}><IconPlus size={12} /> {PROJECT_FOLDER_CREATE_LABEL[folder]}</button>
      <span>{matching.length} {matching.length === 1 ? 'item' : 'itens'} neste PLC</span>
    </div>
    <div className="ladder-asset-grid">
      {matching.map((file) => <button type="button" key={file.id} className="ladder-asset-card" onClick={() => onOpen(file.id)}>
        <span className="ladder-asset-icon"><TreeGlyph icon={FOLDER_FILE_ICON[file.folder]} /></span>
        <span className="ladder-asset-main"><strong>{file.name}</strong><small>{projectFileSummary(file)}</small></span>
        <span className="ladder-asset-date">{formatProjectDate(file.updatedAt ?? file.createdAt)}</span>
      </button>)}
      {!matching.length && <EmptyFolderMessage text={`Ainda não há itens em ${NODE_TITLES[folder]}. Use “${PROJECT_FOLDER_CREATE_LABEL[folder]}” para começar.`} />}
    </div>
  </div>
}

function parseWatchAddresses(content: string) {
  const supported = /^(?:[IQMTC]\d+|[A-Z_]\w*(?:\.[A-Z_]\w*)?)$/
  return [...new Set(content.split(/[\s,;]+/).map((value) => value.trim().toUpperCase()).filter((value) => supported.test(value)))]
}

function WatchTableEditor({ file, table }: { file: ProjectFile; table: Record<string, boolean> }) {
  const update = useSimStore((s) => s.updateProjectFile)
  const tags = useSimStore((s) => s.tags)
  const timers = useSimStore((s) => s.runtime.timers)
  const counters = useSimStore((s) => s.runtime.counters)
  const db = useSimStore((s) => s.runtime.db)
  const [newAddress, setNewAddress] = useState('')
  const addresses = useMemo(() => parseWatchAddresses(file.content), [file.content])
  const save = (next: string[]) => update(file.id, { content: next.join('\n') })
  const addAddress = () => {
    const address = newAddress.trim().toUpperCase()
    if (!/^(?:[IQMTC]\d+|[A-Z_]\w*(?:\.[A-Z_]\w*)?)$/.test(address) || addresses.includes(address)) return
    save([...addresses, address])
    setNewAddress('')
  }
  const stateFor = (address: string) => {
    if (timers[address]) return { value: timers[address].done ? '1 / concluído' : '0 / em curso', detail: `${timers[address].elapsedMs} / ${timers[address].presetMs} ms`, on: timers[address].done }
    if (counters[address]) return { value: counters[address].done ? '1 / concluído' : '0 / em curso', detail: `${counters[address].count} / ${counters[address].preset}`, on: counters[address].done }
    if (address in table) return { value: table[address] ? '1 / TRUE' : '0 / FALSE', detail: tags.find((tag) => tag.address.toUpperCase() === address)?.name || 'Endereço PLC', on: table[address] }
    if (db[address]) return { value: `${db[address].type}: ${String(db[address].value)}`, detail: 'Variável de bloco de dados', on: db[address].type === 'BOOL' && db[address].value === true }
    return { value: 'Sem valor disponível', detail: 'Verifique o endereço ou adicione-o ao programa', on: false }
  }
  return <section className="ladder-watch-editor" aria-label={`Tabela de observação ${file.name}`}>
    <div className="ladder-watch-intro"><strong>Observação ao vivo</strong><span>Adicione endereços da tabela de tags, I/Q/M/T/C ou variáveis de DB. Os valores atualizam a cada scan.</span></div>
    <form className="ladder-watch-add" onSubmit={(event) => { event.preventDefault(); addAddress() }}>
      <input className="dc-input" value={newAddress} onChange={(event) => setNewAddress(event.target.value)} list={TAG_DATALIST_ID} placeholder="Ex.: I1, Q2, T1 ou DB_Motor.Speed" aria-label="Adicionar endereço à tabela de observação" />
      <button type="submit" className="dc-btn-primary dc-btn" disabled={!newAddress.trim()}>Adicionar</button>
    </form>
    <div className="ladder-watch-grid" role="table" aria-label="Valores observados">
      {addresses.map((address) => {
        const state = stateFor(address)
        return <div className="ladder-watch-row" role="row" key={address}>
          <span role="cell" className="ladder-watch-address">{address}</span>
          <span role="cell" className="ladder-watch-value">{state.value}<small>{state.detail}</small></span>
          <i className={state.on ? 'is-on' : ''} aria-label={state.on ? 'Ativo' : 'Inativo'} />
          <button type="button" className="ladder-watch-remove" onClick={() => save(addresses.filter((item) => item !== address))} aria-label={`Remover ${address} da observação`} title={`Remover ${address}`}><IconClose size={12} /></button>
        </div>
      })}
      {!addresses.length && <EmptyFolderMessage text="A tabela está vazia. Adicione um endereço para acompanhar o valor em tempo real." />}
    </div>
  </section>
}

type TechnologyObjectConfig = { type: string; address: string; setpoint: number; unit: string; enabled: boolean; description: string }

function readTechnologyObject(content: string, name: string): { config: TechnologyObjectConfig; valid: boolean } {
  const fallback = JSON.parse(defaultProjectFileContent('technologyObjects', name)) as TechnologyObjectConfig
  try {
    const source = JSON.parse(content) as Partial<TechnologyObjectConfig>
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw Error('invalid')
    return { valid: true, config: {
      type: typeof source.type === 'string' ? source.type : fallback.type,
      address: typeof source.address === 'string' ? source.address : fallback.address,
      setpoint: typeof source.setpoint === 'number' && Number.isFinite(source.setpoint) ? source.setpoint : fallback.setpoint,
      unit: typeof source.unit === 'string' ? source.unit : fallback.unit,
      enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
      description: typeof source.description === 'string' ? source.description : fallback.description,
    } }
  } catch { return { config: fallback, valid: false } }
}

function TechnologyObjectEditor({ file }: { file: ProjectFile }) {
  const update = useSimStore((s) => s.updateProjectFile)
  const parsed = useMemo(() => readTechnologyObject(file.content, file.name), [file.content, file.name])
  const save = (patch: Partial<TechnologyObjectConfig>) => update(file.id, { content: JSON.stringify({ ...parsed.config, ...patch }, null, 2) })
  return <section className="ladder-technology-editor" aria-label={`Configuração do objeto tecnológico ${file.name}`}>
    <div className="ladder-technology-intro"><strong>Configuração do objeto</strong><span>Os campos ficam guardados no projeto e podem ser reutilizados na documentação e em fontes externas.</span>{!parsed.valid && <button type="button" className="dc-btn" onClick={() => update(file.id, { content: defaultProjectFileContent('technologyObjects', file.name) })}>Repor configuração válida</button>}</div>
    <div className="ladder-technology-fields">
      <label>Tipo<Select className="dc-input" value={parsed.config.type} onChange={(event) => save({ type: event.target.value })}><option>Motor</option><option>PID</option><option>Eixo</option><option>Contador rápido</option><option>Outro</option></Select></label>
      <label>Endereço<input className="dc-input" value={parsed.config.address} onChange={(event) => save({ address: event.target.value.toUpperCase() })} list={TAG_DATALIST_ID} placeholder="Ex.: Q1 ou DB_Motor.Speed" /></label>
      <label>Setpoint<input className="dc-input" type="number" value={parsed.config.setpoint} onChange={(event) => save({ setpoint: Number(event.target.value) || 0 })} /></label>
      <label>Unidade<input className="dc-input" value={parsed.config.unit} onChange={(event) => save({ unit: event.target.value })} placeholder="rpm, °C, bar…" /></label>
      <label className="ladder-technology-enabled"><input type="checkbox" checked={parsed.config.enabled} onChange={(event) => save({ enabled: event.target.checked })} /> Ativo no projeto</label>
      <label className="ladder-technology-description">Descrição<textarea className="dc-input" value={parsed.config.description} onChange={(event) => save({ description: event.target.value })} /></label>
    </div>
  </section>
}

function ProjectFileView({ file, table, onDelete }: { file: ProjectFile; table: Record<string, boolean>; onDelete: () => void }) {
  const update = useSimStore((s) => s.updateProjectFile)
  const restore = useSimStore((s) => s.restoreProjectBackup)
  const db = useSimStore((s) => s.runtime.db)
  const fileContentLabel: Partial<Record<ProjectFolder, string>> = { externalSources: 'Código-fonte / texto', documentation: 'Documento', dataBlocks: 'Definição JSON do bloco de dados' }
  return <div className="ladder-folder-view ladder-file-view gap-3">
    <FolderViewHeader icon={<TreeGlyph icon={FOLDER_FILE_ICON[file.folder]} />} title={file.name} subtitle={`${NODE_TITLES[file.folder]} · criado em ${formatProjectDate(file.createdAt)} · atualizado ${formatProjectDate(file.updatedAt ?? file.createdAt)}`} />
    <div className="ladder-file-name-row"><label htmlFor="ladder-file-name" className="text-xs font-semibold">Nome</label>
      <input id="ladder-file-name" className="dc-input max-w-xs" value={file.name} onChange={(e) => update(file.id, { name: e.target.value })} />
      <button type="button" className="dc-btn-danger dc-btn ml-auto" onClick={onDelete}><IconDelete size={12} /> Eliminar</button>
    </div>
    {file.folder === 'backups' ? <section className="ladder-backup-view">
      <strong>Instantâneo do projeto</strong><span>Criado em {formatProjectDate(file.createdAt)} · {projectFileSummary(file)}</span>
      <p>Cópia integral do projeto no momento da criação. Restaurar substitui o projeto aberto; exporte o atual antes se precisar de o conservar.</p>
      <button type="button" className="dc-btn-primary dc-btn self-start" onClick={async () => { if (await uiConfirm(`Restaurar o backup «${file.name}»? O projeto atual será substituído.`)) restore(file.id) }}>Restaurar backup</button>
    </section> : file.folder === 'watchTables' ? <WatchTableEditor file={file} table={table} /> : file.folder === 'technologyObjects' ? <TechnologyObjectEditor file={file} /> : <>
      <label htmlFor="ladder-file-content" className="text-xs font-semibold">{fileContentLabel[file.folder] ?? 'Conteúdo do ficheiro'}</label>
      <textarea id="ladder-file-content" className="dc-input !h-44 !p-2 font-mono text-xs resize-y" value={file.content} onChange={(e) => update(file.id, { content: e.target.value })} placeholder="Escreva aqui…" />
      {file.folder === 'externalSources' && <div className="ladder-file-note is-source"><strong>Fonte externa guardada</strong><span>{file.content.split('\n').length} linha(s). O texto é persistido no projeto; compilação SCL/ST/STL ainda não está disponível.</span></div>}
      {file.folder === 'documentation' && <div className="ladder-file-note"><strong>Documento guardado</strong><span>{file.content.trim().length} caracteres. Use esta área para instruções de operação, manutenção e validação.</span></div>}
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

/**
 * Editor de programa de um bloco (FC1/FC2/ficheiro do projeto) — paridade TOTAL com a Main:
 * mesmo RungRow/NetworkDiagram (drag&drop, seleção, edição rápida, diálogo de propriedades),
 * paleta e atalhos encaminham para este bloco enquanto estiver aberto.
 */
function BlockProgramView({ id, notify, registerInsert }: {
  id: 'fc1' | 'fc2' | `file:${string}`
  notify?: (text: string) => void
  /** Regista quem insere elementos neste bloco (paleta/atalhos/drops do editor completo). */
  registerInsert?: (fn: ((kind: PaletteKind) => void) | null) => void
}) {
  const activePlcId = useSimStore((s) => s.activePlcId)
  const file = useSimStore((s) => s.projectFiles[activePlcId ?? '_general']?.find((f) => `file:${f.id}` === id))
  const fcBlocks = useSimStore((s) => s.fcBlocks)
  const fcNamesMap = useSimStore((s) => s.fcNames)
  const rungs = id.startsWith('file:') ? file?.rungs ?? [] : fcBlocks[id as 'fc1' | 'fc2']
  const table = useSimStore((s) => s.runtime.table)
  const rungPowered = useSimStore((s) => s.runtime.rungPowered)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const grid = useSimStore((s) => s.grid)
  const ladderZoom = useLadderZoom((state) => state.zoom)
  const [activeRungId, setActiveRungId] = useState<string | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [dragOver, setDragOver] = useState(false)
  const [dragBlockHint, setDragBlockHint] = useState<string | null>(null)
  const canvasDepth = useRef(0)
  const counts = programCounts(rungs)
  const poweredCount = rungs.filter((rung) => rungPowered[rung.id]).length
  const allCollapsed = rungs.length > 0 && rungs.every((rung) => collapsedIds.has(rung.id))
  useEffect(() => {
    setActiveRungId(null)
    setCollapsedIds(new Set())
  }, [id])

  const getRungs = (): LadderRung[] => {
    const st = useSimStore.getState()
    return id.startsWith('file:') ? st.projectFiles[st.activePlcId ?? '_general']?.find((f) => `file:${f.id}` === id)?.rungs ?? [] : st.fcBlocks[id as 'fc1' | 'fc2']
  }
  const setRungs = (next: LadderRung[]) => {
    if (id.startsWith('file:')) useSimStore.getState().updateProjectFile(id.slice(5), { rungs: next })
    else useSimStore.getState().updateFc(id as 'fc1' | 'fc2', next)
  }
  const focusRungId = (rid: string) => {
    setActiveRungId(rid)
    requestAnimationFrame(() => document.getElementById(`ladder-net-${rid}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }
  const newRung = newEmptyRung

  /** Operações deste bloco — override para o RungRow/NetworkDiagram (remover, reordenar, duplicar…). */
  const ops: RungOps = {
    rungs,
    updateRung: (rid, fn) => setRungs(getRungs().map((r) => (r.id === rid ? fn(r) : r))),
    renameRung: (rid, name) => setRungs(getRungs().map((r) => (r.id === rid ? { ...r, name } : r))),
    deleteRung: (rid) => {
      const list = getRungs()
      setRungs(list.filter((r) => r.id !== rid))
      if (activeRungId === rid) setActiveRungId(null)
    },
    duplicateRung: (rid) => {
      const list = getRungs()
      const idx = list.findIndex((r) => r.id === rid)
      const src = list[idx]
      if (!src) return
      const copy: LadderRung = {
        ...src,
        id: crypto.randomUUID(),
        branches: src.branches.map((b) => ({ id: crypto.randomUUID(), elements: b.elements.map((e) => ({ ...e, id: crypto.randomUUID() })) })),
        coils: src.coils.map((c) => ({ ...c, id: crypto.randomUUID() })),
        timer: src.timer ? { ...src.timer, id: crypto.randomUUID() } : undefined,
        counter: src.counter ? { ...src.counter, id: crypto.randomUUID() } : undefined,
        move: src.move ? { ...src.move } : undefined,
        math: src.math ? { ...src.math } : undefined,
        call: src.call ? { ...src.call } : undefined,
      }
      const next = [...list]
      next.splice(idx + 1, 0, copy)
      setRungs(next)
      notify?.(`Network ${idx + 1} duplicada`)
    },
    moveRung: (rid, dir) => {
      const list = [...getRungs()]
      const idx = list.findIndex((r) => r.id === rid)
      const to = idx + dir
      if (idx < 0 || to < 0 || to >= list.length) return
      const [r] = list.splice(idx, 1)
      list.splice(to, 0, r)
      setRungs(list)
    },
  }

  const addRungLocal = () => {
    const r = newRung()
    setRungs([...getRungs(), r])
    focusRungId(r.id)
    return r.id
  }

  /** Inserir elemento (paleta lateral, telhas, atalhos) na network ativa deste bloco — ou em network nova. */
  const quickAdd = (kind: PaletteKind) => {
    const res = insertIntoRungs(getRungs(), activeRungId, kind)
    setRungs(res.rungs)
    focusRungId(res.rungId)
  }
  const quickAddRef = useRef(quickAdd)
  quickAddRef.current = quickAdd
  useEffect(() => {
    registerInsert?.((kind) => quickAddRef.current(kind))
    return () => registerInsert?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, registerInsert])

  /** Bloco da árvore largado no canvas deste bloco → network nova com CALL (como na Main). */
  const dropBlockOnCanvas = (payload: CallBlockPayload) => {
    const r = newRung()
    setRungs([...getRungs(), { ...r, call: { targetId: payload.fileId } }])
    focusRungId(r.id)
    notify?.(`Network criada com CALL «${payload.name}»`)
  }

  const fcLabel = (fid: 'fc1' | 'fc2') => `${fcNamesMap[fid]?.trim() || (fid === 'fc1' ? 'FC1' : 'FC2')} [${fid === 'fc1' ? 'FC1' : 'FC2'}]`
  const title = id.startsWith('file:') ? file?.name ?? 'Bloco eliminado' : fcLabel(id as 'fc1' | 'fc2')
  const subtitle = file?.exec === 'obCyclic'
    ? 'Executa automaticamente em todos os ciclos, após o Main [OB1].'
    : file?.exec === 'obStartup'
      ? 'Executa uma vez ao entrar em RUN; pressione STOP e RUN para repetir.'
      : 'Não executa sozinho: use CALL a partir do Main ou de outro bloco.'
  return (
    <div className="ladder-folder-view ladder-block-program">
      <div className="ladder-editor-toolbar ladder-block-toolbar">
        <div className="ladder-block-heading" title={subtitle}>
          <IconFunction size={14} />
          <strong>{title}</strong>
        </div>
        <span className="ladder-block-subtitle">{subtitle}</span>
        <span className="ladder-toolbar-separator" />
        {rungs.length > 1 && (
          <button type="button" className="ladder-toolbar-button" onClick={() => setCollapsedIds(allCollapsed ? new Set() : new Set(rungs.map((rung) => rung.id)))} title="Recolher ou expandir todas as networks">
            {allCollapsed ? 'Expandir tudo' : 'Recolher tudo'}
          </button>
        )}
        <button type="button" className="ladder-primary-button" onClick={() => addRungLocal()} title="Criar network (Insert)"><IconPlus size={12} /> Nova network</button>
      </div>
      <div className="ladder-program-summary" aria-label="Resumo do bloco">
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
      <div
        className={`ladder-networks ladder-block-network-canvas ${grid.enabled ? (grid.style === 'lines' ? 'grid-lines' : '') : 'grid-off'} drop-zone ${dragOver ? 'drag-over' : ''}`}
        style={grid.enabled ? { backgroundSize: `${grid.size}px ${grid.size}px` } : undefined}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          if (e.dataTransfer.types.includes(CALL_BLOCK_MIME)) {
            const d = getLadderDrag()
            const name = d && 'block' in d ? d.block.name : 'bloco'
            if (dragBlockHint !== name) setDragBlockHint(name)
          } else if (dragBlockHint) setDragBlockHint(null)
        }}
        onDragEnter={() => { canvasDepth.current++; setDragOver(true) }}
        onDragLeave={() => {
          canvasDepth.current--
          if (canvasDepth.current <= 0) { canvasDepth.current = 0; setDragOver(false); setDragBlockHint(null) }
        }}
        onDrop={(e) => {
          e.preventDefault()
          canvasDepth.current = 0
          setDragOver(false)
          setDragBlockHint(null)
          const block = blockPayloadFrom(e.dataTransfer)
          if (block) { setLadderDrag(null); dropBlockOnCanvas(block); return }
          setLadderDrag(null)
          const kind = (e.dataTransfer.getData(LADDER_MIME) as PaletteKind) || COMPONENT_TO_LADDER[e.dataTransfer.getData('text/plain') as ComponentType]
          if (kind) quickAdd(kind)
        }}
      >
        {dragBlockHint && (
          <div className="ladder-call-hint">
            <span className="lnet-call-drop-badge">CALL</span>
            <span className="lnet-call-drop-name">«{dragBlockHint}»</span>
            <em>→ nova network</em>
          </div>
        )}
        <div className={`ladder-networks-scale ${rungs.length ? '' : 'is-empty'}`} style={{ zoom: ladderZoom * ZOOM_BASE }}>
          {rungs.map((r, i) => (
            <div
              key={r.id}
              id={`ladder-net-${r.id}`}
              className={`ladder-network-wrap ${activeRungId === r.id ? 'is-selected' : ''}`}
              tabIndex={0}
              role="region"
              aria-label={`Network ${i + 1}: ${r.name || 'sem título'}`}
              onFocusCapture={() => setActiveRungId(r.id)}
              onMouseDownCapture={() => setActiveRungId(r.id)}
              onDragEnterCapture={() => { if (dragBlockHint) setDragBlockHint(null) }}
            >
              <RungRow
                rung={r}
                index={i}
                total={rungs.length}
                active={activeRungId === r.id}
                minWidth={720}
                collapsed={collapsedIds.has(r.id)}
                onToggleCollapse={() => setCollapsedIds((current) => {
                  const next = new Set(current)
                  if (next.has(r.id)) next.delete(r.id)
                  else next.add(r.id)
                  return next
                })}
                ops={ops}
              />
            </div>
          ))}
          {!rungs.length && <LadderEmptyState onCreate={addRungLocal} />}
        </div>
      </div>
    </div>
  )
}

/** Escala base do editor completo: o "100%" mostrado ao utilizador equivale a 115% do desenho original. */
const ZOOM_BASE = 1.15
/** chave nova: a antiga guardava a escala em bruto (1.15 = 115%) e ficaria a 132% */

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
  const addRung = useSimStore((s) => s.addRung)
  const updateRung = useSimStore((s) => s.updateRung)
  const [activeRungId, setActiveRungId] = useState<string | null>(null)
  const lintIssues = useMemo(() => lintLadder({ rungs }, { physicalInputs: plcs.length > 0 }), [rungs, plcs.length])
  const lintCount = lintIssues.filter((issue) => issue.level !== 'info').length
  const [statusTab, setStatusTab] = useState<'io' | 'memory' | 'timers' | 'counters' | 'lint'>('io')
  const [programTab, setProgramTab] = useState<'program' | 'tags'>('program')
  const [filter, setFilter] = useState('')
  const ladderZoom = useLadderZoom((state) => state.zoom)
  const setLadderZoom = useLadderZoom((state) => state.setZoom)
  const [showProjectPane, setShowProjectPane] = useState(() => !isSmallScreen())
  const [showPalette, setShowPalette] = useState(() => !isSmallScreen())
  const [activeProjectNode, setActiveProjectNode] = useState<ProjectNodeId>('main')
  const openVariablesTable = useCallback(() => {
    setSection('Projeto')
    setProgramTab('tags')
    setActiveProjectNode('plcVariables')
  }, [setSection])
  useEffect(() => {
    useLadderUi.getState().setActionHandler((action) => {
      if (action === 'openVariables') openVariablesTable()
    })
    return () => useLadderUi.getState().setActionHandler(undefined)
  }, [openVariablesTable])
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
  const [blockDialog, setBlockDialog] = useState<BlockKind | null>(null)
  /** abre o ficheiro recém-criado na modal «Adicionar bloco» e avisa o utilizador */
  const openCreatedBlock = (id: string, folder: ProjectFolder, name: string) => {
    setProgramTab('program')
    setActiveProjectNode(`file:${id}`)
    setExpandedNodes((prev) => new Set([...prev, folder]))
    notify(`Bloco «${name}» criado em ${NODE_TITLES[folder]}`)
  }
  const [showStatus, setShowStatus] = useState(() => {
    try { const saved = localStorage.getItem('dcsimu:ladder:status-open'); return saved === null ? !isSmallScreen() : saved !== '0' } catch { return !isSmallScreen() }
  })
  useEffect(() => {
    try { localStorage.setItem('dcsimu:ladder:status-open', showStatus ? '1' : '0') } catch { /* navegação privada */ }
  }, [showStatus])
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const searchRef = useRef<HTMLInputElement>(null)
  const mainPaneRef = useRef<HTMLElement>(null)
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
  const folderLabels = useSimStore((s) => s.projectFolderLabels[activePlcId ?? '_general'] ?? {})
  const fcNames = useSimStore((s) => s.fcNames)
  const isMainOpen = activeProjectNode === 'main'
  const isFcOpen = activeProjectNode === 'fc1' || activeProjectNode === 'fc2' || (activeProjectNode.startsWith('file:') && files.some((f) => `file:${f.id}` === activeProjectNode && f.folder === 'programBlocks'))
  const isProgramView = isMainOpen || isFcOpen
  const activePlc = plcs.find((c) => c.id === activePlcId)
  const selectedFile = activeProjectNode.startsWith('file:') ? files.find((f) => f.id === activeProjectNode.slice(5)) : undefined
  const fcTitleOf = (fid: 'fc1' | 'fc2') => `${fcNames[fid]?.trim() || (fid === 'fc1' ? 'FC1' : 'FC2')} [${fid === 'fc1' ? 'FC1' : 'FC2'}]`
  const activeTitle = selectedFile?.name ?? (activeProjectNode === 'plc' ? activePlc?.ref ?? 'Programa geral' : (activeProjectNode === 'fc1' || activeProjectNode === 'fc2') ? fcTitleOf(activeProjectNode) : folderLabels[activeProjectNode as ProjectFolder]?.trim() || NODE_TITLES[activeProjectNode as Exclude<ProjectNodeId, `file:${string}`>])

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
      if (mod && (key === '+' || key === '=')) { event.preventDefault(); setLadderZoom((v) => v + LADDER_ZOOM_STEP); return }
      if (mod && key === '-') { event.preventDefault(); setLadderZoom((v) => v - LADDER_ZOOM_STEP); return }
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

  // Navegação TIA-like: «Abrir bloco» no diálogo do CALL abre o alvo na árvore.
  useEffect(() => onOpenLadderBlock((targetId) => {
    const isFc = targetId === 'fc1' || targetId === 'fc2'
    const file = (useSimStore.getState().projectFiles[useSimStore.getState().activePlcId ?? '_general'] ?? []).find((f) => f.id === targetId)
    if (!isFc && !file) { notify('O bloco chamado já não existe no projeto'); return }
    setActiveProjectNode(isFc ? targetId : `file:${targetId}`)
    setProgramTab('program')
    setExpandedNodes((prev) => new Set([...prev, file?.folder ?? 'programBlocks']))
    setShowProjectPane(true)
  }), [])

  // Atalhos universais partilhados com o esquema 2D, o GRAFCET e os editores 3D.
  useEditorShortcuts({
    undo: doUndo,
    redo: doRedo,
    zoomView: (factor) => setLadderZoom((value) => value * factor),
    fitView: () => setLadderZoom(1),
    panView: (dx, dy) => mainPaneRef.current?.scrollBy({ left: dx, top: dy, behavior: 'auto' }),
  }, { enabled: !helpOpen })

  const createFile = async (folder: ProjectFolder) => {
    // Blocos de código/dados abrem a modal «Adicionar novo bloco» (tipo, modelo, número…);
    // as restantes pastas continuam com criação rápida por nome.
    if (folder === 'programBlocks' || folder === 'dataBlocks') { setBlockDialog(folder === 'dataBlocks' ? 'DB' : 'OB'); return }
    const suggested = folder === 'watchTables' ? 'Observação' : folder === 'backups' ? 'Backup' : 'Novo ficheiro'
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
  /** Duplo clique na pasta: nome personalizado (vazio repõe o predefinido «Blocos de dados» etc.). */
  const renameFolder = async (folder: ProjectFolder) => {
    const current = folderLabels[folder]?.trim() || NODE_TITLES[folder]
    const typed = await uiPrompt(`Novo nome da pasta («${current}» atual; vazio repõe o predefinido ${NODE_TITLES[folder]}):`, current)
    if (typed == null) return
    useSimStore.getState().renameProjectFolder(folder, typed)
    const clean = typed.trim()
    notify(clean && clean !== NODE_TITLES[folder] ? `Pasta passou a chamar-se «${clean}»` : 'Pasta com o nome predefinido')
  }
  /** Duplo clique em FC1/FC2: nome simbólico do bloco (o id técnico FCn mantém-se). */
  const renameFc = async (id: 'fc1' | 'fc2') => {
    const current = fcNames[id]?.trim() || (id === 'fc1' ? 'FC1' : 'FC2')
    const typed = await uiPrompt(`Novo nome do bloco ${id.toUpperCase()} (vazio repõe ${id === 'fc1' ? 'FC1' : 'FC2'}):`, current)
    if (typed == null) return
    useSimStore.getState().renameFc(id, typed)
    const clean = typed.trim()
    notify(clean ? `${id.toUpperCase()} passou a ser «${clean}»` : `${id.toUpperCase()} com o nome técnico`)
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
    // Com um bloco (FC/FB/ficheiro) aberto, o elemento vai para ELE (paleta/telhas/atalhos) — como no TIA Portal.
    if (isFcOpen && blockInsertRef.current) { blockInsertRef.current(kind); return }
    setActiveProjectNode('main')
    setProgramTab('program')
    if (activeId) { updateRung(activeId, (r) => applyKind(r, kind).rung, 'force'); return }
    // Sem network ativa: cria uma (a store já a foca) e insere o elemento.
    const rungId = addRung()
    setActiveRungId(rungId)
    updateRung(rungId, (r) => applyKind(r, kind).rung, 'skip')
  }
  quickAddRef.current = quickAdd

  /** Quando um bloco (FC/FB/ficheiro) está aberto, paleta/atalhos inserem NESSE bloco (como no TIA Portal). */
  const blockInsertRef = useRef<((kind: PaletteKind) => void) | null>(null)
  /** Nome do bloco de programa em arraste sobre o canvas (para o hint «nova network»). */
  const [dragBlockHint, setDragBlockHint] = useState<string | null>(null)
  /** Profundidade de enter/leave no canvas — `relatedTarget` é null durante o drag nativo do browser. */
  const canvasDragDepth = useRef(0)

  /** Inserir CALL de um bloco do projeto (estilo TIA Portal: botão CALL/atalho touch). */
  const insertCallBlock = (fileId: string, name: string) => {
    setActiveProjectNode('main')
    setProgramTab('program')
    const hadActiveRung = !!activeId
    const rungId = activeId ?? addRung()
    setActiveRungId(rungId)
    updateRung(rungId, (r) => ({ ...r, call: { targetId: fileId } }), hadActiveRung ? 'force' : 'skip')
    notify(`CALL «${name}» inserido`)
  }

  /** Largar um bloco da árvore fora das networks → cria network nova com o CALL (como no TIA Portal). */
  const dropBlockOnCanvas = (payload: CallBlockPayload) => {
    setActiveProjectNode('main')
    setProgramTab('program')
    const rungId = addRung()
    updateRung(rungId, (r) => ({ ...r, call: { targetId: payload.fileId } }), 'skip')
    focusRung(rungId)
    notify(`Network criada com CALL «${payload.name}»`)
  }

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
      {/* Uma única fonte de sugestões para Main e blocos FC/FB: a tabela importada
          fica disponível imediatamente nos diálogos de qualquer network aberta. */}
      <TagAddressDatalist />
      {section === 'Projeto' && (showProjectPane ? (
        <>
        {/* gaveta em ecrã pequeno: toque fora fecha (visível só até 1199px) */}
        <button type="button" className="ladder-pane-scrim" aria-label="Fechar painel de projeto" onClick={() => setShowProjectPane(false)} />
        <ProjectTreePane
          tagCount={tags.length}
          activeNode={activeProjectNode}
          expanded={expandedNodes}
          onToggle={toggleNode}
          onSelect={selectProjectNode}
          onClose={() => setShowProjectPane(false)}
          onQuickAdd={quickAdd}
          onInsertCall={insertCallBlock}
          activePlc={activePlc}
          files={files}
          hiddenFolders={hiddenFolders}
          folderLabels={folderLabels}
          fcNames={fcNames}
          onCreateFile={createFile}
          onDeleteFile={deleteFile}
          onRenameFile={renameFile}
          onRenameFolder={(folder) => void renameFolder(folder)}
          onRenameFc={(id) => void renameFc(id)}
          onDeleteFolder={deleteFolder}
          onRestoreFolder={(folder) => useSimStore.getState().restoreProjectFolder(folder)}
        />
        </>
      ) : (
        <button className="ladder-collapsed-pane-button" onClick={() => { setShowProjectPane(true); if (isSmallScreen()) setShowPalette(false) }} title="Mostrar projeto">
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
          <span className="text-[10px] text-slate-400">{isProgramView ? 'Programa Ladder' : activeTitle}</span>
          {isMainOpen && programTab === 'program' && rungs.length > 1 && (
            <>
              <span className="ladder-toolbar-separator" />
              <button className="ladder-toolbar-button" onClick={() => setCollapsedIds((cur) => (cur.size >= rungs.length ? new Set() : new Set(rungs.map((r) => r.id))))} title="Recolher / expandir todas (Ctrl+Shift+E)">
                {collapsedIds.size >= rungs.length ? 'Expandir tudo' : 'Recolher tudo'}
              </button>
            </>
          )}
          <button className="ladder-toolbar-button" onClick={() => setBlockDialog('OB')} title="Adicionar bloco ao projeto (OB/FB/FC/DB)" aria-label="Adicionar bloco"><IconPlus size={13} /> <span className="ml-1 text-[10px]">Bloco</span></button>
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
          <BlockProgramView id={activeProjectNode as 'fc1' | 'fc2' | `file:${string}`} notify={notify} registerInsert={(fn) => { blockInsertRef.current = fn }} />
        ) : selectedFile ? (
          <ProjectFileView file={selectedFile} table={table} onDelete={() => deleteFile(selectedFile)} />
        ) : !isMainOpen ? (
          <ProjectDataView activeNode={activeProjectNode} files={files} onCreate={createFile} onOpen={(id) => setActiveProjectNode(`file:${id}`)} />
          ) : (
          <div
            className={`ladder-networks ${grid.enabled ? (grid.style === 'lines' ? 'grid-lines' : '') : 'grid-off'} drop-zone ${dragOver ? 'drag-over' : ''}`}
            style={grid.enabled ? { backgroundSize: `${grid.size}px ${grid.size}px` } : undefined}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              // Só chega aqui fora das networks (NetworkDiagram faz stopPropagation) → hint «nova network».
              if (e.dataTransfer.types.includes(CALL_BLOCK_MIME)) {
                const d = getLadderDrag()
                const name = d && 'block' in d ? d.block.name : 'bloco'
                if (dragBlockHint !== name) setDragBlockHint(name)
              } else if (dragBlockHint) setDragBlockHint(null)
            }}
            onDragEnter={() => { canvasDragDepth.current++; setDragOver(true) }}
            onDragLeave={() => {
              // `relatedTarget` é null durante o drag nativo — usa-se contagem de profundidade.
              canvasDragDepth.current--
              if (canvasDragDepth.current <= 0) { canvasDragDepth.current = 0; setDragOver(false); setDragBlockHint(null) }
            }}
            onDrop={(e) => {
              e.preventDefault()
              canvasDragDepth.current = 0
              setDragOver(false)
              setDragBlockHint(null)
              // Bloco da árvore largado na área vazia → network nova com CALL (estilo TIA Portal).
              const block = blockPayloadFrom(e.dataTransfer)
              if (block) { setLadderDrag(null); dropBlockOnCanvas(block); return }
              setLadderDrag(null)
              const kind = dropKindFromEvent(e)
              if (kind) quickAdd(kind)
            }}
          >
            {dragBlockHint && (
              <div className="ladder-call-hint">
                <span className="lnet-call-drop-badge">CALL</span>
                <span className="lnet-call-drop-name">«{dragBlockHint}»</span>
                <em>→ nova network</em>
              </div>
            )}
            <div className={`ladder-networks-scale ${rungs.length ? '' : 'is-empty'}`} style={{ zoom: ladderZoom * ZOOM_BASE }}>
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
                  onDragEnterCapture={() => { if (dragBlockHint) setDragBlockHint(null) }}
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
            {([['io', 'Entradas/Saídas'], ['memory', 'Memórias'], ['timers', 'Temporizadores'], ['counters', 'Contadores'], ['lint', lintCount ? `Verificação (${lintCount})` : 'Verificação ✓']] as const).map(([id, label]) => (
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
            {statusTab === 'io' && !activePlc && <VirtualIoPanel compact />}
            {statusTab === 'io' && !!activePlc && <><NetworkStatus table={table} prefix="I" label="Entradas" plc={activePlc} wires={wires} components={components} tags={tags} rungs={rungs} /><NetworkStatus table={table} prefix="Q" label="Saídas" plc={activePlc} wires={wires} components={components} tags={tags} rungs={rungs} /></>}
            {statusTab === 'lint' && <div className="ladder-lint" role="list">
              {lintIssues.length ? lintIssues.map((issue) => <button type="button" role="listitem" key={issue.id} className={`ladder-lint-row is-${issue.level}`} disabled={!issue.rungId} onClick={() => issue.rungId && document.getElementById(`rung-${issue.rungId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><b>{issue.level === 'error' ? '✖' : issue.level === 'warning' ? '!' : 'i'}</b><span>{issue.message}</span></button>) : <small>Nenhum problema encontrado no programa.</small>}
            </div>}
            {statusTab === 'memory' && <NetworkStatus table={table} prefix="M" label="Memórias" plc={activePlc} wires={wires} components={components} tags={tags} rungs={rungs} />}
            {statusTab === 'timers' && <div className="ladder-project-status"><span>Temporizadores</span>{Object.entries(timers).length ? Object.entries(timers).map(([address, t]) => <small key={address}>{address}: {t.elapsedMs} / {t.presetMs} ms · {t.done ? 'ativo' : 'inativo'}</small>) : <small>Nenhum temporizador executado.</small>}</div>}
            {statusTab === 'counters' && <div className="ladder-project-status"><span>Contadores</span>{Object.entries(counters).length ? Object.entries(counters).map(([address, c]) => <small key={address}>{address}: {c.count} / {c.preset} · {c.done ? 'atingido' : 'em contagem'}</small>) : <small>Nenhum contador executado.</small>}</div>}
            <div className="ladder-project-status"><span>Estado do Projeto</span><strong><i /> {running ? 'Simulação ativa' : 'Pronto'}</strong></div>
          </div>}
        </div>
        </>}
      </main>
      {section === 'Projeto' && (showPalette ? (
      <>
      {/* gaveta em ecrã pequeno: toque fora fecha os painéis laterais (visível só até 1199px) */}
      <button type="button" className="ladder-pane-scrim" aria-label="Fechar painel de elementos" onClick={() => setShowPalette(false)} />
      <aside className="ladder-palette">
        <div className="ladder-palette-header">
          <div>
            <strong>Elementos Ladder</strong>
            <small>Network ativa: {activeId ? rungs.findIndex((r) => r.id === activeId) + 1 : '—'}</small>
          </div>
          <button className="ladder-ghost-button" onClick={() => setShowPalette(false)} title="Recolher elementos">›</button>
        </div>
        <div className="ladder-palette-search-wrap">
          <input ref={searchRef} type="search" className="ladder-palette-search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Pesquisar elemento…  ( / )" aria-label="Pesquisar elementos Ladder" onKeyDown={(e) => { if (e.key === 'Escape') { setFilter(''); (e.target as HTMLInputElement).blur() } }} />
          <span className="ladder-search-icon" aria-hidden="true"><IconSearch size={13} /></span>
          {filter && <button type="button" className="ladder-palette-clear" onClick={() => { setFilter(''); searchRef.current?.focus() }} aria-label="Limpar pesquisa" title="Limpar pesquisa"><IconClose size={11} /></button>}
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
      </>
      ) : (
        <button className="ladder-collapsed-pane-button is-right" onClick={() => { setShowPalette(true); if (isSmallScreen()) setShowProjectPane(false) }} title="Mostrar elementos">
          Elementos
        </button>
      ))}
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      {blockDialog && (
        <AddBlockDialog
          open
          initialKind={blockDialog}
          files={files}
          onClose={() => setBlockDialog(null)}
          onCreated={openCreatedBlock}
        />
      )}
      {toast && <div key={toast.id} className="ladder-toast" role="status" aria-live="polite">{toast.text}</div>}
    </div>
  )
}

export default function LadderEditor({ compact = false, section = 'Projeto', setSection = () => {}, onOpenSchematic }: { compact?: boolean; section?: LadderSection; setSection?: (value: LadderSection) => void; onOpenSchematic?: (componentId: string) => void }) {
  return compact ? <CompactLadderEditor /> : <FullLadderEditor section={section} setSection={setSection} onOpenSchematic={onOpenSchematic} />
}
