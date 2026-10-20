import { uiConfirm } from '../ui/dialogs'
import Select from '../ui/Select'
import type React from 'react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSimStore } from '../store/useSimStore'
import type { EditorTool, WireColor, WireEndType } from '../types'
import { buildBOM, bomToCSV } from '../utils/bom'
import { GAUGES, WIRE_COLORS } from '../schematic/symbols'
import { WIRE_END_OPTIONS, WireEndIcon, ConductorIcon } from '../schematic/wireEnds'
import type { LadderSection } from '../ladder/LadderSections'
import { useCleanMode } from '../ui/cleanMode'
import { useLadderZoom, LADDER_ZOOM_STEP, LADDER_ZOOM_MIN, LADDER_ZOOM_MAX } from '../ladder/ladderZoom'
import { useGrafcetUi } from '../grafcet/grafcetBus'
import { validateGrafcet } from '../grafcet/engine'
import { N8nLogo } from '../ui/BrandLogos'
import ComponentTableDialog from './ComponentTableDialog'
import { allowedViews } from '../project/kind'
import {
  IconFile, IconSave, IconOpen, IconCursor, IconWire, IconProbe, IconErase, IconPan,
  IconUndo, IconRedo, IconOrganize, IconTag, IconAlignLeft, IconAlignCenterH, IconAlignRight,
  IconAlignTop, IconAlignCenterV, IconAlignBottom, IconDistH, IconDistV, IconPlay, IconPause,
  IconStop, IconStep, IconReset, IconGrid, IconHand, IconMagnet, IconZoomIn, IconZoomOut,
  IconSchematic, IconLadder, IconCube, IconMonitor, IconDownload, IconLock, IconChevronDown, IconProjects, IconShield, IconLayers, IconFocus, IconHelp,
} from '../ui/icons'

type AlignEdge = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'

const ALIGN_BUTTONS: Array<{ edge: AlignEdge; icon: typeof IconAlignLeft; hint: string }> = [
  { edge: 'left', icon: IconAlignLeft, hint: 'Alinhar à esquerda' },
  { edge: 'centerX', icon: IconAlignCenterH, hint: 'Centralizar horizontalmente' },
  { edge: 'right', icon: IconAlignRight, hint: 'Alinhar à direita' },
  { edge: 'top', icon: IconAlignTop, hint: 'Alinhar ao topo' },
  { edge: 'centerY', icon: IconAlignCenterV, hint: 'Centralizar verticalmente' },
  { edge: 'bottom', icon: IconAlignBottom, hint: 'Alinhar embaixo' },
]

export type ViewMode = 'schematic' | 'ladder' | 'grafcet' | 'monitor'

const TOOLS: Array<{ id: EditorTool; label: string; icon: typeof IconCursor; hint: string; key: string }> = [
  { id: 'select', label: 'Selecionar', icon: IconCursor, hint: 'Selecionar / arrastar componentes', key: '1' },
  { id: 'wire', label: 'Cabo', icon: IconWire, hint: 'Desenhar cabo entre bornes', key: '2' },
  { id: 'probe', label: 'Sonda', icon: IconProbe, hint: 'Medir continuidade entre dois pontos', key: '3' },
  { id: 'erase', label: 'Apagar', icon: IconErase, hint: 'Apagar cabo/borne sob o cursor', key: '4' },
  { id: 'pan', label: 'Mover vista', icon: IconPan, hint: 'Mover a vista (ou botão do meio / Alt+arrastar)', key: '5' },
]

const VIEWS: Array<{ id: ViewMode; label: string; icon: typeof IconSchematic; key: string }> = [
  { id: 'schematic', label: 'Esquema', icon: IconSchematic, key: 'F1' },
  { id: 'ladder', label: 'Ladder', icon: IconLadder, key: 'F2' },
  { id: 'grafcet', label: 'GRAFCET', icon: IconStep, key: 'F5' },
  { id: 'monitor', label: 'Monitor', icon: IconMonitor, key: 'F4' },
]

/** Tecla de atalho discreta (só em ecrãs largos). */
function Kbd({ children, onBrand = false }: { children: ReactNode; onBrand?: boolean }) {
  return <kbd className={`hidden 2xl:inline text-[9px] font-mono px-1 rounded ${onBrand ? 'bg-white/20 text-white' : 'bg-surface-sunken text-ink-400'}`}>{children}</kbd>
}

/** Botão de barra de ferramentas com atalho opcional — evita repetir o mesmo markup por botão. */
function TbButton({ children, kbd, kbdOnBrand = false, pressed, className = 'dc-tool-btn', ...rest }: {
  kbd?: string; kbdOnBrand?: boolean; pressed?: boolean
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'>) {
  return (
    <button type="button" className={className} aria-pressed={pressed} {...rest}>
      {children}
      {kbd && <Kbd onBrand={kbdOnBrand}>{kbd}</Kbd>}
    </button>
  )
}

const GRAFCET_TOOLS: Array<{ id: 'select' | 'pan' | 'connect'; label: string; icon: typeof IconCursor; key: string; title: string }> = [
  { id: 'select', label: 'Selecionar', icon: IconCursor, key: 'V', title: 'Ferramenta Selecionar: selecione e arraste etapas [V ou S]' },
  { id: 'pan', label: 'Arrastar', icon: IconHand, key: 'H', title: 'Ferramenta Arrastar: mova a tela arrastando o diagrama [H ou Barra de Espaço]' },
  { id: 'connect', label: 'Ligar', icon: IconWire, key: 'L', title: 'Ferramenta Ligar: una etapas e transições por linha — arraste de uma saída para um destino [L]' },
]

const GRAFCET_ADD_BUTTONS: Array<{ action: 'addConnectedStep' | 'addStep' | 'addTransition' | 'addAction' | 'addFork' | 'addJoin'; label: string; kbd: string; title: string; primary?: boolean; secondary?: boolean; needs?: number }> = [
  { action: 'addConnectedStep', label: '+ Etapa', kbd: '1', primary: true, title: 'Nova etapa (nasce sem transição — ligue-a com T ou L) [Insert ou 1]' },
  { action: 'addStep', label: '+ Etapa livre', kbd: '2', title: 'Nova etapa em posição livre [Shift+Insert ou 2]' },
  { action: 'addTransition', label: '+ Transição', kbd: '3', needs: 1, title: 'Nova transição solta (arraste-a sobre etapas ou ligue por linha) [T ou 3]' },
  { action: 'addAction', label: '+ Ação', kbd: '4', title: 'Adicionar ação à etapa selecionada ou criar solta [A ou 4]' },
  { action: 'addFork', label: '⑂ Divergência AND', kbd: 'F', secondary: true, title: 'Divergência AND solta (ramos simultâneos) — ligue por aproximação ou linha [F]' },
  { action: 'addJoin', label: '⑃ Convergência AND', kbd: 'J', secondary: true, title: 'Convergência AND solta (sincronização) — ligue por aproximação ou linha [J]' },
]

interface ViewControlsProps {
  grid: { on: boolean; toggle: () => void; title?: string }
  snap?: { on: boolean; toggle: () => void; title?: string }
  step?: { value: number; options: number[]; onChange: (n: number) => void }
  zoom: { percent: number; onOut: () => void; onReset: () => void; onIn: () => void; canOut?: boolean; canIn?: boolean }
}

/** Grupo «vista» único (malha · ímã · passo · zoom): igual em Esquema/3D, Ladder e GRAFCET. */
function ViewControls({ grid, snap, step, zoom }: ViewControlsProps) {
  const seg = (active: boolean) => `dc-tool-btn ${active ? 'dc-tool-active' : ''}`
  const on = (v: boolean) => (v ? '!border-brand-300 !bg-brand-50 !text-brand-700' : '')
  return (
    <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Vista">
      <div className="dc-seg" role="group" aria-label="Malha">
        <button type="button" onClick={grid.toggle} aria-pressed={grid.on} className={`${seg(false)} !px-2 ${on(grid.on)}`} title={grid.title ?? 'Mostrar/ocultar malha'}>
          <IconGrid size={13} />
        </button>
        {snap && (
          <button type="button" onClick={snap.toggle} aria-pressed={snap.on} className={`${seg(false)} !px-2 ${on(snap.on)}`} title={snap.title ?? 'Encaixar na malha (ímã)'}>
            <IconMagnet size={13} />
          </button>
        )}
      </div>
      {step && (
        <Select value={step.value} onChange={(e) => step.onChange(Number(e.target.value))} className="dc-select !w-[66px]" title="Passo da malha">
          {step.options.map((n) => <option key={n} value={n}>{n}px</option>)}
        </Select>
      )}
      <div className="dc-seg" role="toolbar" aria-label="Zoom">
        <button type="button" onClick={zoom.onOut} disabled={zoom.canOut === false} className={`${seg(false)} !px-1.5`} title="Reduzir zoom">
          <IconZoomOut size={13} />
        </button>
        <button type="button" onClick={zoom.onReset} className={`${seg(false)} !px-2 font-mono tabular-nums min-w-[48px] justify-center`} title="Restaurar zoom (100%)">
          {zoom.percent}%
        </button>
        <button type="button" onClick={zoom.onIn} disabled={zoom.canIn === false} className={`${seg(false)} !px-1.5`} title="Ampliar zoom">
          <IconZoomIn size={13} />
        </button>
      </div>
      <span className="tb-sep" />
    </div>
  )
}

const QUICK_COLORS: WireColor[] = ['black', 'red', 'blue', 'lightblue', 'brown', 'grey', 'orange', 'green-yellow', 'white', 'violet']

/** Menu suspenso simples, fecha ao clicar fora ou com Esc. */
function Dropdown({ label, icon, children, title, disabled = false, align = 'left' }: { label: ReactNode; icon?: ReactNode; children: (close: () => void) => ReactNode; title?: string; disabled?: boolean; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const updatePosition = () => {
    const anchor = ref.current
    if (!anchor) return
    const bounds = anchor.getBoundingClientRect()
    // Largura: em ecrãs estreitos o menu ocupa quase toda a largura disponível.
    const width = Math.min(260, window.innerWidth - 16)
    const left = align === 'right' ? bounds.right - width : bounds.left
    // Espaço disponível abaixo e acima do botão; se em baixo não cabe, abre para cima.
    const below = window.innerHeight - bounds.bottom - 12
    const above = bounds.top - 12
    const openUp = below < 200 && above > below
    const maxHeight = Math.max(160, Math.floor(openUp ? above : below))
    const top = openUp ? Math.max(8, bounds.top - 4 - maxHeight) : bounds.bottom + 4
    setPos({ top, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)), width, maxHeight })
  }
  const toggle = () => {
    if (!open) updatePosition()
    setOpen((v) => !v)
  }
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (document.getElementById(menuId)?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('touchstart', onDown as unknown as EventListener)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('touchstart', onDown as unknown as EventListener)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, menuId])
  return (
    <div className="relative shrink-0" ref={ref}>
      <button className={`dc-btn ${open ? '!border-brand-400 !bg-brand-50 !text-brand-700' : ''}`} onClick={toggle} title={title} disabled={disabled} aria-expanded={open} aria-controls={open ? menuId : undefined}>
        {icon}
        {label}
        <IconChevronDown size={11} className={`text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && createPortal((
        <div id={menuId} className="tb-menu !fixed !mt-0" style={{ top: pos.top, left: pos.left, width: pos.width, maxWidth: 'calc(100vw - 16px)', maxHeight: pos.maxHeight, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {children(() => setOpen(false))}
        </div>
      ), document.body)}
    </div>
  )
}

export default function Toolbar({ mode, setMode, views = ['schematic', 'ladder', 'grafcet', 'monitor'], ladderSection, setLadderSection, onBack, onOpenLibrary, onOpenGrafcet, onOpenObjects }: { mode: ViewMode; setMode: (m: ViewMode) => void; views?: ViewMode[]; ladderSection: LadderSection; setLadderSection: (section: LadderSection) => void; onBack: () => void; onOpenLibrary?: () => void; onOpenGrafcet?: () => void; onOpenObjects?: () => void }) {
  const [clean, setClean] = useCleanMode()
  const [grafcetMoreOpen, setGrafcetMoreOpen] = useState(false)
  const [componentTableOpen, setComponentTableOpen] = useState(false)
  const {
    sim, play, pause, stop, reset, setSpeed, setMode: setSimMode,
    step, saveJSON, loadJSON, tool, setTool, grid, setGrid, zoom, setZoom,
    components, undo, redo, history, future, organizeWires, wires, selectedComponentIds,
    alignSelection, distributeSelection, autoNumberWires, setCurrentProjectName, currentProjectName,
    dirty, wireDefaults, setWireDefaults, gridDragEnabled, setGridDragEnabled,
  } = useSimStore()
  const grafcet = useSimStore((state) => state.grafcet)
  const projectKind = useSimStore((state) => state.projectKind)
  const grafcetZoom = useGrafcetUi((state) => state.zoom)
  const grafcetTool = useGrafcetUi((state) => state.tool)
  const grafcetGrid = useGrafcetUi((state) => state.gridOn)
  const grafcetSnap = useGrafcetUi((state) => state.snapOn)
  const grafcetIssues = useMemo(() => validateGrafcet(grafcet), [grafcet])
  const grafcetErrorCount = grafcetIssues.filter((i) => i.level === 'error').length
  const canGenerateLadder = allowedViews(projectKind).includes('ladder')
  const fileRef = useRef<HTMLInputElement>(null)
  const visibleViews = VIEWS.filter((view) => views.includes(view.id))

  // atalhos F1/F2/F4/F5 (ou Ctrl+1…4) para as vistas
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return
      if (e.ctrlKey && !e.altKey && !e.shiftKey && /^[1-4]$/.test(e.key)) {
        const target = visibleViews[Number(e.key) - 1]
        if (!target) return
        e.preventDefault()
        setMode(target.id)
        return
      }
      const target = VIEWS.find((view) => view.key === e.key && views.includes(view.id))
      if (target) {
        e.preventDefault()
        setMode(target.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setMode, views])

  const createNewProject = onBack

  const saveBlob = (content: string, type: string, name: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }
  const fileSlug = (currentProjectName ?? 'projeto').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projeto'
  const downloadBOM = () => saveBlob('\uFEFF' + bomToCSV(buildBOM(components), wires), 'text/csv;charset=utf-8', `dc-simu-${fileSlug}-bom.csv`)
  const download = () => saveBlob(saveJSON(), 'application/json', `dc-simu-${fileSlug}.json`)

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (dirty && !await uiConfirm('Abrir este arquivo e descartar alterações não guardadas?')) {
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      loadJSON(String(reader.result))
      setCurrentProjectName(null)
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  const segBtn = (active: boolean) => `dc-tool-btn ${active ? 'dc-tool-active' : ''}`

  const RUN_LABEL: Record<string, { text: string; cls: string }> = {
    running: { text: 'RUN', cls: 'bg-state-run' },
    paused: { text: 'PAUSE', cls: 'bg-state-pause' },
    stopped: { text: 'STOP', cls: 'bg-state-stop' },
  }
  const runBadge = RUN_LABEL[sim.runState] ?? RUN_LABEL.stopped
  const ladderZoom = useLadderZoom((state) => state.zoom)
  const setLadderZoom = useLadderZoom((state) => state.setZoom)
  const viewControls: ViewControlsProps | null =
    mode === 'schematic' ? {
      grid: { on: grid.enabled, toggle: () => setGrid({ enabled: !grid.enabled }) },
      snap: { on: grid.snap, toggle: () => setGrid({ snap: !grid.snap }) },
      step: { value: grid.size, options: [5, 10, 20, 25, 50], onChange: (size) => setGrid({ size }) },
      zoom: { percent: Math.round(zoom * 100), onOut: () => setZoom(zoom * 0.9), onIn: () => setZoom(zoom * 1.1), onReset: () => { setZoom(1); useSimStore.getState().setPan(0, 0) } },
    } : mode === 'ladder' ? {
      grid: { on: grid.enabled, toggle: () => setGrid({ enabled: !grid.enabled }), title: 'Mostrar/ocultar malha (as networks usam sempre 20px)' },
      zoom: { percent: Math.round(ladderZoom * 100), onOut: () => setLadderZoom((z) => z - LADDER_ZOOM_STEP), onIn: () => setLadderZoom((z) => z + LADDER_ZOOM_STEP), onReset: () => setLadderZoom(1), canOut: ladderZoom > LADDER_ZOOM_MIN, canIn: ladderZoom < LADDER_ZOOM_MAX },
    } : mode === 'grafcet' ? {
      grid: { on: grafcetGrid, toggle: () => useGrafcetUi.getState().toggleGrid(), title: 'Mostrar/ocultar a grelha' },
      snap: { on: grafcetSnap, toggle: () => useGrafcetUi.getState().toggleSnap(), title: 'Encaixar à grelha ao arrastar (Alt = livre)' },
      zoom: { percent: Math.round(grafcetZoom * 100), onOut: () => useGrafcetUi.getState().emit('zoomOut'), onIn: () => useGrafcetUi.getState().emit('zoomIn'), onReset: () => useGrafcetUi.getState().emit('zoomReset') },
    } : null
  const isCanvas = mode === 'schematic'
  const sel = selectedComponentIds.length

  return (
    <div className="shrink-0 bg-surface-rail border-b border-line shadow-xs relative z-20">
      {/* ============================ linha 1 — projeto · vistas · simulação */}
      <div className="flex items-center gap-2 px-3 min-h-[46px] border-b border-line-soft dc-toolbar-main">
        {/* arquivo — ações frequentes; conta/projeto permanecem na barra superior única */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-0.5 bg-surface-sunken border border-line rounded-lg p-1">
            <button onClick={createNewProject} className="dc-file-extra flex items-center gap-1.5 px-2 py-1 hover:bg-white hover:shadow-sm rounded transition-all text-ink-600 hover:text-ink-900" title="Novo projeto em branco">
              <IconFile size={14} /> <span className="hidden xl:inline text-[11px] font-medium">Novo</span>
            </button>
            <button onClick={() => fileRef.current?.click()} className="dc-file-extra flex items-center gap-1.5 px-2 py-1 hover:bg-white hover:shadow-sm rounded transition-all text-ink-600 hover:text-ink-900" title="Abrir projeto (.json)">
              <IconOpen size={14} /> <span className="hidden xl:inline text-[11px] font-medium">Abrir</span>
            </button>
            <button onClick={download} className="flex items-center gap-1.5 px-2 py-1 hover:bg-white hover:shadow-sm rounded transition-all text-ink-600 hover:text-ink-900 relative" title="Salvar projeto em arquivo JSON">
              <IconSave size={14} /> <span className="hidden xl:inline text-[11px] font-medium">Salvar</span>
              {dirty && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-state-pause" title="Alterações por guardar" />}
            </button>
            <button onClick={downloadBOM} disabled={!components.length} className="dc-file-extra flex items-center gap-1.5 px-2 py-1 hover:bg-white hover:shadow-sm rounded transition-all text-ink-600 hover:text-ink-900 disabled:opacity-50 disabled:hover:bg-transparent" title="Exportar lista de materiais (CSV)">
              <IconDownload size={14} /> <span className="hidden xl:inline text-[11px] font-medium">BOM</span>
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={upload} />
        </div>

        {/* vistas — centralizadas */}
        <div className="flex-1 flex justify-center min-w-0 dc-views-container">
          <div className="flex items-center rounded-lg p-1 gap-1 bg-surface-sunken border border-line shadow-inner" role="tablist" aria-label="Vistas">
            {visibleViews.map(({ id, label, icon: Icon, key }) => (
              <button
                key={id}
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id)}
                className={`inline-flex items-center gap-1.5 h-[30px] px-4 rounded-[6px] text-xs font-semibold transition-all ${
                  mode === id ? 'bg-brand-600 text-white shadow-md' : 'text-ink-500 hover:text-ink-900 hover:bg-white'
                }`}
                title={`${label} [${key} · Ctrl+${visibleViews.findIndex((v) => v.id === id) + 1}]`}
              >
                <Icon size={14} />
                <span className="hidden md:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* simulação + estado — canto direito */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="dc-seg" role="toolbar" aria-label="Controle de simulação">
            <button
              onClick={play}
              disabled={sim.runState === 'running'}
              className={`dc-tool-btn !font-semibold ${sim.runState === 'running' ? '' : '!text-state-run'}`}
              title="Iniciar simulação (RUN)"
            >
              <IconPlay size={13} /> <span className="hidden lg:inline">Run</span>
            </button>
            <button onClick={pause} disabled={sim.runState !== 'running'} className={`${segBtn(false)} !px-2 !text-state-pause`} title="Pausar">
              <IconPause size={13} />
            </button>
            <button onClick={stop} disabled={sim.runState === 'stopped'} className={`${segBtn(false)} !px-2 !text-ink-700`} title="Parar (STOP)">
              <IconStop size={13} />
            </button>
            <button onClick={step} className={`${segBtn(false)} !px-2 !text-brand-600`} title="Avançar um ciclo de varredura">
              <IconStep size={13} />
            </button>
            <button onClick={reset} className={`${segBtn(false)} !px-2`} title="Reiniciar a simulação sem alterar o projeto">
              <IconReset size={13} />
            </button>
          </div>
          <Select
            value={sim.mode}
            onChange={(e) => setSimMode(e.target.value as any)}
            className="dc-select !w-auto hidden lg:block"
            title="Modo de execução: tempo real = 100 ms por ciclo; turbo = ciclos acelerados; passo a passo = um ciclo por clique"
          >
            <option value="realtime">Tempo real</option>
            <option value="turbo">Turbo</option>
            <option value="step">Passo a passo</option>
          </Select>
          <Select value={sim.speed} onChange={(e) => setSpeed(Number(e.target.value))} className="dc-select !w-[62px]" title="Velocidade da simulação">
            {[0.25, 0.5, 1, 2, 4, 10].map((v) => (
              <option key={v} value={v}>{v}×</option>
            ))}
          </Select>
          <span className="tb-sep" />
          <span
            className={`inline-flex items-center gap-1.5 h-[24px] px-2.5 rounded-[5px] font-mono text-[11px] font-bold tracking-[0.08em] text-white whitespace-nowrap ${runBadge.cls}`}
            title={`Estado do simulador: ${runBadge.text} · scan #${sim.scanCount}`}
          >
            {sim.runState === 'running' ? (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
            ) : (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/80" />
            )}
            {runBadge.text}
          </span>
          <button type="button" className={`dc-tool-btn dc-clean-toggle ${clean ? 'is-on' : ''}`} aria-pressed={clean} onClick={() => setClean(!clean)} title={clean ? 'Sair do modo clean (mostrar todas as barras)' : 'Modo clean: esconde barras e painéis secundários'}><IconFocus size={13} /><span className="hidden lg:inline">Clean</span></button>
        </div>
      </div>

      {/* ============================ linha 2 — contextual à vista ativa */}
      <div className={`dc-toolbar-row2 flex items-center gap-1.5 px-3 h-[40px] overflow-x-auto flex-nowrap toolbar-scroll ${mode === 'grafcet' ? `dc-grafcet-toolbar ${grafcetMoreOpen ? 'is-expanded' : ''}` : ''}`}>
        {/* desfazer / refazer — comum a todas as vistas */}
        <div className="dc-seg" role="toolbar" aria-label="Histórico">
          <button onClick={undo} disabled={!history.length} className={`${segBtn(false)} !px-2`} title="Desfazer [Ctrl+Z]">
            <IconUndo size={13} />
          </button>
          <button onClick={redo} disabled={!future.length} className={`${segBtn(false)} !px-2`} title="Refazer [Ctrl+Y]">
            <IconRedo size={13} />
          </button>
        </div>

        {mode === 'grafcet' && (
          <>
            <span className="tb-sep" />
            <div className="dc-seg" role="toolbar" aria-label="Ferramentas de seleção e navegação">
              {GRAFCET_TOOLS.map(({ id, label, icon: Icon, key, title }) => (
                <TbButton key={id} className={segBtn(grafcetTool === id)} pressed={grafcetTool === id} aria-label={label} title={title} kbd={key}
                  onClick={() => useGrafcetUi.getState().setTool(id)}>
                  <Icon size={13} />
                  <span className="hidden lg:inline">{label}</span>
                </TbButton>
              ))}
            </div>

            <span className="tb-sep" />
            <button type="button" className="dc-tool-btn grafcet-signals-tool" aria-label="Tabela de entradas, saídas e memórias" onClick={() => useGrafcetUi.getState().emit('openSignals')} title="Declarar e organizar os sinais usados nas sugestões">Variáveis</button>
            <button type="button" className="grafcet-toolbar-more dc-tool-btn" aria-expanded={grafcetMoreOpen} onClick={() => setGrafcetMoreOpen((value) => !value)} title="Ficheiros, disposição, modelos e mais ferramentas">
              {grafcetMoreOpen ? 'Menos' : 'Mais'} <IconChevronDown size={12} className={grafcetMoreOpen ? 'rotate-180' : ''} />
            </button>
            <div className="dc-seg" role="toolbar" aria-label="Ferramentas GRAFCET">
              {GRAFCET_ADD_BUTTONS.map(({ action, label, kbd, title, primary, secondary, needs }) => (
                <TbButton key={action} disabled={needs !== undefined && grafcet.steps.length < needs} kbd={kbd} title={title}
                  className={`dc-tool-btn ${primary ? 'font-semibold !bg-brand-600 !text-white hover:!bg-brand-700 shadow-xs' : ''} ${secondary ? 'grafcet-toolbar-secondary-inline' : ''}`}
                  kbdOnBrand={primary} onClick={() => useGrafcetUi.getState().emit(action)}>
                  <span>{label}</span>
                </TbButton>
              ))}
            </div>

            <span className="tb-sep" />

            <div className="dc-seg grafcet-toolbar-secondary" role="toolbar" aria-label="Modelos e Ladder">
              <button
                type="button"
                onClick={() => useGrafcetUi.getState().emit('openTemplates')}
                className="dc-tool-btn !gap-1.5"
                title="Modelos de GRAFCET industriais prontos para carregar"
              >
                <span>★ Modelos</span>
              </button>
              {canGenerateLadder && (
                <>
                  <button
                    type="button"
                    onClick={() => useGrafcetUi.getState().emit('generateLadder')}
                    className="dc-tool-btn !gap-1.5"
                    title="Gera o programa Ladder equivalente no PLC"
                  >
                    <span>⇢ Gerar Ladder</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => useGrafcetUi.getState().emit('sendToN8n')}
                    className="dc-tool-btn !gap-1.5"
                    style={{ color: '#c9355f', borderColor: '#f8cdd8', backgroundColor: '#fdf0f3' }}
                    title="Dispara o workflow n8n (MipSJCjJ6fya9UGt) com o diagrama GRAFCET atual"
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                      <N8nLogo size={13} title="" /> n8n
                    </span>
                  </button>
                </>
              )}
            </div>

            <span className="tb-sep" />

            <div className="dc-seg grafcet-toolbar-secondary" role="toolbar" aria-label="Disposição">
              <button
                type="button"
                onClick={() => useGrafcetUi.getState().emit('autoLayout')}
                className="dc-tool-btn !px-2"
                title="Organizar automaticamente o diagrama (Ctrl+Z desfaz)"
              >
                Organizar
              </button>
            </div>

            <span className="tb-sep" />

            <div className="dc-seg grafcet-toolbar-secondary" role="toolbar" aria-label="Ficheiro">
              <button type="button" onClick={() => useGrafcetUi.getState().emit('exportSvg')} className="dc-tool-btn !px-2" title="Exportar diagrama em formato SVG vetorial">
                SVG
              </button>
              <button type="button" onClick={() => useGrafcetUi.getState().emit('exportJson')} className="dc-tool-btn !px-2" title="Salvar projeto GRAFCET em JSON">
                Salvar
              </button>
              <button type="button" onClick={() => useGrafcetUi.getState().emit('importJson')} className="dc-tool-btn !px-2" title="Abrir projeto GRAFCET em JSON">
                Abrir
              </button>
              <button
                type="button"
                onClick={() => useGrafcetUi.getState().emit('restart')}
                className="dc-tool-btn !px-2"
                title="Reiniciar a sequência nas etapas iniciais"
              >
                ⟲
              </button>
            </div>
          </>
        )}

          {mode === 'schematic' && <div className="dc-mobile-panel-tools" role="group" aria-label="Painéis">
            <button className="dc-tool-btn" onClick={onOpenLibrary} title="Abrir biblioteca em ecrã inteiro"><IconCube size={14} /><span>Biblioteca</span></button>
            <button className="dc-tool-btn" onClick={onOpenGrafcet} title="Abrir GRAFCET em ecrã inteiro"><IconStep size={14} /><span>GRAFCET</span></button>
            <button className="dc-tool-btn" onClick={onOpenObjects} title="Ver os objetos do projeto"><IconLayers size={14} /><span>Objetos</span></button>
          </div>}

          {mode === 'ladder' && <>
            <span className="tb-sep" />
            <nav className="dc-seg" aria-label="Secções do editor Ladder">
              {([
                ['Projeto', IconProjects], ['Biblioteca', IconTag], ['Dispositivos', IconCube],
                ['Diagnóstico', IconShield], ['Configurações', IconGrid],
              ] as const).map(([name, Icon]) => (
                <button key={name} type="button" onClick={() => setLadderSection(name)}
                  className={`dc-tool-btn !gap-1.5 ${ladderSection === name ? 'dc-tool-active' : ''}`}
                  aria-current={ladderSection === name ? 'page' : undefined}
                  title={name} aria-label={`Ladder: ${name}`}>
                  <Icon size={14} /><span className="hidden lg:inline">{name}</span>
                </button>
              ))}
            </nav>
          </>}

          {isCanvas && (
            <>
              <span className="tb-sep" />
              <div className="dc-seg" role="toolbar" aria-label="Ferramentas de edição">
                {TOOLS.map((t) => {
                  const Icon = t.icon
                  return (
                    <button key={t.id} onClick={() => setTool(t.id)} className={segBtn(tool === t.id)} title={`${t.hint} [${t.key}]`}>
                      <Icon size={13} />
                      <span className="hidden lg:inline">{t.label}</span>
                      <kbd className={`hidden 2xl:inline text-[9px] font-mono px-1 rounded ${tool === t.id ? 'bg-white/20' : 'bg-surface-sunken text-ink-400'}`}>{t.key}</kbd>
                    </button>
                  )
                })}
              </div>
              {mode === 'schematic' && <button
                type="button"
                className={`dc-tool-btn !gap-1.5 ${gridDragEnabled ? 'dc-tool-active' : ''}`}
                aria-pressed={gridDragEnabled}
                onClick={() => setGridDragEnabled(!gridDragEnabled)}
                title="Arrastar a malha e os componentes como uma vista, sem alterar a ferramenta selecionada. Clique outra vez para sair."
              ><IconHand size={15} /><span>Arrastar malha</span></button>}
            </>
          )}

          {/* opções da ferramenta Cabo: aplicadas aos próximos cabos */}
          {isCanvas && tool === 'wire' && (
            <>
              <span className="tb-sep" />
              <span className="tb-label">Novo cabo</span>
              <div className="flex items-center gap-1 rounded-[6px] border border-line bg-white px-1.5 h-[28px] shadow-xs">
                <button
                  onClick={() => setWireDefaults({ autoColor: !wireDefaults.autoColor })}
                  className={`h-[18px] px-1.5 rounded-full text-[9.5px] font-bold border ${wireDefaults.autoColor ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-line text-ink-400'}`}
                  title="Cor automática pela função do cabo (força preto, comando vermelho, neutro azul, PE verde-amarelo…)"
                >
                  AUTO
                </button>
                {QUICK_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`tb-swatch ${!wireDefaults.autoColor && wireDefaults.color === c ? 'is-active' : ''}`}
                    style={{ background: c === 'green-yellow' ? 'repeating-linear-gradient(45deg,#84cc16 0 4px,#eab308 4px 8px)' : WIRE_COLORS[c] }}
                    title={`Cor: ${c}`}
                    onClick={() => setWireDefaults({ color: c, autoColor: false })}
                  />
                ))}
              </div>
              <div className="dc-seg" role="group" aria-label="Condutor">
                <button className={`${segBtn(wireDefaults.flexibility === 'flexible')} !px-1.5`} onClick={() => setWireDefaults({ flexibility: 'flexible' })} title="Condutor flexível (multifilar) — mesma representação ortogonal">
                  <ConductorIcon flexible size={30} color={wireDefaults.flexibility === 'flexible' ? '#fff' : '#475569'} />
                  <span className="hidden xl:inline">Flexível</span>
                </button>
                <button className={`${segBtn(wireDefaults.flexibility === 'rigid')} !px-1.5`} onClick={() => setWireDefaults({ flexibility: 'rigid' })} title="Condutor rígido (fio sólido) — mesma representação ortogonal">
                  <ConductorIcon flexible={false} size={30} color={wireDefaults.flexibility === 'rigid' ? '#fff' : '#475569'} />
                  <span className="hidden xl:inline">Rígido</span>
                </button>
              </div>
              <Select className="dc-select !w-auto" value={wireDefaults.gauge} onChange={(e) => setWireDefaults({ gauge: e.target.value })} title="Seção dos novos cabos">
                {GAUGES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </Select>
              <Dropdown
                label={<span className="hidden xl:inline">{WIRE_END_OPTIONS.find((o) => o.id === wireDefaults.endType)?.label}</span>}
                icon={<WireEndIcon type={wireDefaults.endType} size={26} color={wireDefaults.autoColor ? '#ef4444' : WIRE_COLORS[wireDefaults.color]} />}
                title="Terminal aplicado às pontas dos novos cabos"
              >
                {(close) =>
                  WIRE_END_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      className={`tb-menu-item ${wireDefaults.endType === o.id ? '!bg-brand-50 !text-brand-700 font-semibold' : ''}`}
                      onClick={() => {
                        setWireDefaults({ endType: o.id as WireEndType })
                        close()
                      }}
                      title={o.hint}
                    >
                      <WireEndIcon type={o.id} size={30} />
                      {o.label}
                    </button>
                  ))
                }
              </Dropdown>
            </>
          )}

          {mode === 'schematic' && (
            <>
              <span className="tb-sep" />
              <Dropdown label={<span className="hidden lg:inline">Organizar</span>} icon={<IconOrganize size={13} />} title="Alinhar, distribuir e organizar cabos">
                {(close) => (
                  <>
                    <div className="px-2 pt-1 pb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-300">Alinhar ({sel} sel.)</div>
                    <div className="grid grid-cols-6 gap-0.5 px-1 pb-1">
                      {ALIGN_BUTTONS.map((a) => {
                        const Icon = a.icon
                        return (
                          <button key={a.edge} className="dc-icon-btn" disabled={sel < 2} title={`${a.hint} (2+ componentes)`} onClick={() => alignSelection(a.edge)}>
                            <Icon size={13} />
                          </button>
                        )
                      })}
                    </div>
                    <button className="tb-menu-item" disabled={sel < 3} onClick={() => { distributeSelection('horizontal'); close() }}>
                      <IconDistH size={13} /> Distribuir na horizontal <kbd>3+</kbd>
                    </button>
                    <button className="tb-menu-item" disabled={sel < 3} onClick={() => { distributeSelection('vertical'); close() }}>
                      <IconDistV size={13} /> Distribuir na vertical <kbd>3+</kbd>
                    </button>
                    <div className="my-1 h-px bg-line-soft" />
                    <button className="tb-menu-item" disabled={!wires.length} onClick={() => { organizeWires(); close() }}>
                      <IconOrganize size={13} /> Reorganizar roteamento dos cabos
                    </button>
                    <button className="tb-menu-item" disabled={!wires.length} onClick={() => { autoNumberWires('missing'); close() }}>
                      <IconTag size={13} /> Numerar cabos sem número
                    </button>
                    <button className="tb-menu-item" disabled={!wires.length} onClick={() => { autoNumberWires('all'); close() }}>
                      <IconTag size={13} /> Renumerar todos (W1…)
                    </button>
                  </>
                )}
              </Dropdown>
              <button className="dc-btn" onClick={() => setComponentTableOpen(true)} title="Criar e posicionar componentes por tabela ou Excel">
                <IconGrid size={13} /> <span className="hidden lg:inline">Tabela</span>
              </button>
            </>
          )}

          <div className="flex-1 min-w-[8px]" />

          {/* vista GRAFCET: validação, zoom e atalhos */}
          {mode === 'grafcet' && (
            <div className="flex items-center gap-1.5 shrink-0 grafcet-toolbar-secondary">
              <button
                type="button"
                className={`grafcet-validation ${grafcetIssues.length ? 'has-issues' : 'is-valid'}`}
                title={grafcetIssues.length ? 'Abrir diagnóstico do programa' : 'Estrutura GRAFCET válida'}
                onClick={() => useGrafcetUi.getState().emit('openDiagnostics')}
              >
                {grafcetErrorCount
                  ? `✖ ${grafcetErrorCount} erro${grafcetErrorCount === 1 ? '' : 's'}`
                  : grafcetIssues.length
                  ? `⚠ ${grafcetIssues.length} aviso${grafcetIssues.length === 1 ? '' : 's'}`
                  : '✓ Validado'}
              </button>

              <span className="tb-sep" />

              <button
                type="button"
                className="dc-tool-btn !px-2"
                onClick={() => useGrafcetUi.getState().emit('openShortcuts')}
                title="Atalhos de teclado do GRAFCET (?)"
              >
                <IconHelp size={13} />
                <span className="hidden xl:inline">Atalhos</span>
              </button>

              <span className="tb-sep" />
            </div>
          )}

          {/* vista: malha e zoom — grupo comum a todos os módulos */}
          {viewControls && <ViewControls {...viewControls} />}

          {/* ferramentas de diagnóstico do projeto atual */}
          <button
            onClick={() => useSimStore.getState().toggleBlackBox()}
            className={`dc-btn ${sim.blackBox ? '!border-amber-300 !bg-amber-50 !text-amber-700' : ''}`}
            title="Modo caixa-preta: esconde o ladder e força diagnóstico por medição"
          >
            <IconLock size={13} /> <span className="hidden xl:inline">{sim.blackBox ? 'Caixa-preta ON' : 'Caixa-preta'}</span>
          </button>
        </div>
      {componentTableOpen && <ComponentTableDialog onClose={() => setComponentTableOpen(false)} />}
    </div>
  )
}
