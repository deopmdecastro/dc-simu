import { ViewDiagnosticsTag, DiagnosticsTag } from '../diagnostics/DiagnosticsUi'
import { useCommandsDiagnostics, useGrafcetDiagnostics, useLadderDiagnostics, useSchematicDiagnostics } from '../diagnostics/viewDiagnostics'
import { uiAlert, uiConfirm, uiChoose } from '../ui/dialogs'
import { listSimModules, moduleOfView, scopeNeedsCommands, scopeNeedsPanel } from '../ui/simScope'
import { ADDABLE_MODULES, allowedViews, type WorkspaceView } from '../project/kind'
import { PHONE_TOUCH_QUERY, WIDE_DESKTOP_QUERY, isPhoneTouch, isTabletDevice } from '../ui/device'
import { Kbd, TbButton, HistoryGroup, ViewControls, ShortcutsButton, SimToggleButton, ToolMenu, ToolInlineItems, useNarrowMenu, useOverflowCompact, type ToolMenuSection, type ViewControlsProps } from '../ui/toolbarKit'
import { requestCanvasAction, requestShortcuts, useSimUi } from '../ui/simUi'
import { ALIGN_ACTIONS, requestAlign, type AlignAction } from '../ui/alignItems'
import ShortcutHelp from '../ui/ShortcutHelp'
import { VIEW_SHORTCUTS } from '../ui/shortcutLists'
import Select from '../ui/Select'
import type React from 'react'
import { Suspense, lazy, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useSimStore } from '../store/useSimStore'
import { isProgrammablePlc } from '../ladder/plcPrograms'
import type { EditorTool, WireColor, WireEndType } from '../types'
import { buildBOM, bomToCSV } from '../utils/bom'
import { GAUGES, WIRE_COLORS } from '../schematic/symbols'
import { WIRE_COLOR_LABEL } from '../admin/editor3d/wireStyle'
import { WIRE_END_OPTIONS, WireEndIcon, ConductorIcon } from '../schematic/wireEnds'
import type { LadderSection } from '../ladder/LadderSections'
import { useCleanMode } from '../ui/cleanMode'
import { useLadderZoom, LADDER_ZOOM_STEP, LADDER_ZOOM_MIN, LADDER_ZOOM_MAX } from '../ladder/ladderZoom'
import { useLadderUi } from '../ladder/ladderBus'
import LadderVariablesMenu from '../ladder/LadderVariablesMenu'
import { useGrafcetUi } from '../grafcet/grafcetBus'
import { useSplitView } from '../ui/splitViewStore'
import { useCommandsUi, type CmdTool } from '../commands/commandsUi'
import { validateGrafcet } from '../grafcet/engine'
import { ladderSyncStatus } from '../grafcet/ladderSync'
import ComponentTableDialog from './ComponentTableDialog'
import { requireFeature } from '../saas/usePlan'
import { IconCheck, IconWarning,
  IconFile, IconSave, IconOpen, IconCursor, IconWire, IconProbe, IconErase, IconPan,
  IconUndo, IconRedo, IconOrganize, IconTag, IconAlignLeft, IconAlignCenterH, IconAlignRight,
  IconAlignTop, IconAlignCenterV, IconAlignBottom, IconDistH, IconDistV, IconPlay, IconPause,
  IconStop, IconStep, IconReset, IconGrid, IconHand, IconMagnet, IconZoomIn, IconZoomOut,
  IconSchematic, IconLadder, IconCube, IconMonitor, IconDownload, IconLock, IconUnlock, IconChevronDown, IconProjects, IconShield, IconLayers, IconFocus, IconHelp, IconTools, IconPlus,
  IconTemplates, IconImport, IconLink, IconPdf, IconGrafcet, IconCommands, IconDelete, IconRotate, IconMore, IconImage, IconText, IconNote, IconCompare, IconSwap,
} from '../ui/icons'

/** jsPDF e html2canvas (centenas de KB) só são descarregados quando o utilizador abre «Exportar PDF». */
const ExportPdfDialog = lazy(() => import('../export/ExportPdfDialog'))

type AlignEdge = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'

const ALIGN_BUTTONS: Array<{ edge: AlignEdge; icon: typeof IconAlignLeft; hint: string }> = [
  { edge: 'left', icon: IconAlignLeft, hint: 'Alinhar à esquerda' },
  { edge: 'centerX', icon: IconAlignCenterH, hint: 'Centralizar horizontalmente' },
  { edge: 'right', icon: IconAlignRight, hint: 'Alinhar à direita' },
  { edge: 'top', icon: IconAlignTop, hint: 'Alinhar ao topo' },
  { edge: 'centerY', icon: IconAlignCenterV, hint: 'Centralizar verticalmente' },
  { edge: 'bottom', icon: IconAlignBottom, hint: 'Alinhar embaixo' },
]

export type ViewMode = 'schematic' | 'ladder' | 'grafcet' | 'commands' | 'monitor'

const TOOLS: Array<{ id: EditorTool; label: string; icon: typeof IconCursor; hint: string; key: string }> = [
  { id: 'select', label: 'Selecionar', icon: IconCursor, hint: 'Selecionar / arrastar componentes', key: '1' },
  { id: 'wire', label: 'Cabo', icon: IconWire, hint: 'Desenhar cabo entre bornes', key: '2' },
  { id: 'probe', label: 'Sonda', icon: IconProbe, hint: 'Medir continuidade entre dois pontos', key: '3' },
  { id: 'erase', label: 'Apagar', icon: IconErase, hint: 'Apagar componente, cabo ou borne sob o cursor', key: '4' },
  { id: 'pan', label: 'Mover vista', icon: IconPan, hint: 'Mover a vista (ou botão do meio / Alt+arrastar)', key: '5' },
]

const VIEWS: Array<{ id: ViewMode; label: string; icon: typeof IconSchematic; key: string }> = [
  { id: 'schematic', label: '3D Realista', icon: IconCube, key: 'F1' },
  { id: 'ladder', label: 'Ladder', icon: IconLadder, key: 'F2' },
  { id: 'grafcet', label: 'GRAFCET', icon: IconGrafcet, key: 'F5' },
  { id: 'commands', label: 'Esquema IEC', icon: IconCommands, key: 'F6' },
  { id: 'monitor', label: 'Monitor', icon: IconMonitor, key: 'F4' },
]

const COMMAND_TOOLS: Array<{ id: CmdTool; label: string; icon: typeof IconCursor; hint: string; key: string }> = [
  { id: 'select', label: 'Selecionar', icon: IconCursor, hint: 'Selecionar e arrastar símbolos; puxar um cabo a partir de um borne', key: '1' },
  { id: 'wire', label: 'Cabo', icon: IconWire, hint: 'Ligar bornes: arraste ou clique num borne e depois no destino (um cabo cria um nó)', key: '2' },
  { id: 'erase', label: 'Apagar', icon: IconErase, hint: 'Apagar o símbolo ou o cabo clicado', key: '4' },
  { id: 'pan', label: 'Mover vista', icon: IconHand, hint: 'Mover a vista (arrastar o fundo; botão do meio também serve)', key: '5' },
]

const GRAFCET_TOOLS: Array<{ id: 'select' | 'pan' | 'connect'; label: string; icon: typeof IconCursor; key: string; title: string }> = [
  { id: 'select', label: 'Selecionar', icon: IconCursor, key: 'V', title: 'Ferramenta Selecionar: selecione e arraste etapas [V ou S]' },
  { id: 'pan', label: 'Arrastar', icon: IconHand, key: 'H', title: 'Ferramenta Arrastar: mova a tela arrastando o diagrama [H ou Barra de Espaço]' },
  { id: 'connect', label: 'Ligar', icon: IconWire, key: 'L', title: 'Ferramenta Ligar: una etapas e transições por linha — arraste de uma saída para um destino [L]' },
]

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
      <button type="button" className={`dc-tool-btn !gap-1.5 ${open ? 'dc-tool-active' : ''}`} onClick={toggle} title={title} disabled={disabled} aria-expanded={open} aria-controls={open ? menuId : undefined}>
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

export default function Toolbar({ mode, setMode, views = ['schematic', 'ladder', 'grafcet', 'monitor'], ladderSection, setLadderSection, onBack, onOpenLibrary, onOpenGrafcet, onOpenObjects, schematicSimPanelOn = false, onToggleSchematicSim, demo = false, onEnterEditor: _onEnterEditor }: { mode: ViewMode; setMode: (m: ViewMode) => void; views?: ViewMode[]; ladderSection: LadderSection; setLadderSection: (section: LadderSection) => void; onBack: () => void; onOpenLibrary?: () => void; onOpenGrafcet?: () => void; onOpenObjects?: () => void; schematicSimPanelOn?: boolean; onToggleSchematicSim?: () => void; /** Modo demonstração (landing): só vistas + controlos de simulação; sem ações de ficheiro nem de edição. */ demo?: boolean; /** CTA da demonstração para abrir o editor completo (autenticação). */ onEnterEditor?: () => void }) {
  void _onEnterEditor
  const [clean, setClean] = useCleanMode()
  const [monitorHelp, setMonitorHelp] = useState(false)
  const splitEnabled = useSplitView((s) => s.enabled)
  const openSplitDialog = useSplitView((s) => s.openDialog)
  const disableSplit = useSplitView((s) => s.disable)
  const grafcetCharts = useSimStore((s) => s.grafcet.charts ?? [])
  const canSplit = !demo && (views.length > 1 || (grafcetCharts?.length ?? 0) > 1)
  const ladderSimPanelOn = useSimUi((s) => s.ladder)
  const simPanelOn = mode === 'schematic' || mode === 'commands' ? schematicSimPanelOn : mode === 'ladder' && ladderSimPanelOn
  const compileState = useLadderUi((s) => s.compileState)
  const compileLabel = useLadderUi((s) => s.compileLabel)
  const [componentTableOpen, setComponentTableOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  // Subscrições granulares: sem isto a barra toda re-renderizava a cada varredura
  // da simulação (10 Hz) porque o destructure subscrevia a store inteira.
  const plcRunState = useSimStore((s) => s.sim.runState)
  // Vista Comandos: o transporte (Run/Pausa/Stop) comanda a simulação do esquema de comandos.
  const isCmd = mode === 'commands'
  const schematicDiag = useSchematicDiagnostics()
  const commandsDiag = useCommandsDiagnostics()
  const ladderDiag = useLadderDiagnostics()
  const viewDiagSummary = mode === 'commands' ? commandsDiag : mode === 'ladder' ? ladderDiag : mode === 'schematic' ? schematicDiag : null
  const cmdRunning = useCommandsUi((s) => s.rt.running)
  const cmdPaused = useCommandsUi((s) => s.paused)
  const cmdTool = useCommandsUi((s) => s.tool)
  const cmdWireColor = useCommandsUi((s) => s.wireColor)
  const cmdGrid = useCommandsUi((s) => s.gridOn)
  const cmdZoom = useCommandsUi((s) => s.zoom)
  const cmdDockOpen = useCommandsUi((s) => s.dockOpen)
  const cmdSelection = useCommandsUi((s) => s.selection)
  const cmdHasParts = useSimStore((s) => (s.commands?.parts.length ?? 0) > 0)
  // Estado combinado dos dois motores (PLC/3D/Ladder/GRAFCET + IEC): a barra
  // reflecte RUN se qualquer simulador estiver a correr, para Stop/Pausa
  // funcionarem ao alternar de vista após «Simular todos».
  const cmdState = cmdRunning ? (cmdPaused ? 'paused' : 'running') : 'stopped'
  const simRunState: 'running' | 'paused' | 'stopped' =
    cmdState === 'running' || plcRunState === 'running' ? 'running'
      : cmdState === 'paused' || plcRunState === 'paused' ? 'paused'
        : 'stopped'
  const simMode = useSimStore((s) => s.sim.mode)
  const simSpeed = useSimStore((s) => s.sim.speed)
  const simBlackBox = useSimStore((s) => s.sim.blackBox)
  const tool = useSimStore((s) => s.tool)
  const grid = useSimStore((s) => s.grid)
  const zoom = useSimStore((s) => s.zoom)
  const components = useSimStore((s) => s.components)
  const wires = useSimStore((s) => s.wires)
  const selectedComponentIds = useSimStore((s) => s.selectedComponentIds)
  const history = useSimStore((s) => s.history)
  const future = useSimStore((s) => s.future)
  const currentProjectName = useSimStore((s) => s.currentProjectName)
  const dirty = useSimStore((s) => s.dirty)
  const wireDefaults = useSimStore((s) => s.wireDefaults)
  const gridDragEnabled = useSimStore((s) => s.gridDragEnabled)
  const {
    play: plcPlay, pause: plcPause, stop: plcStop, reset: plcReset, setSpeed, setSimMode,
    step: plcStep, saveJSON, loadJSON, setTool, setGrid, setZoom,
    undo, redo, organizeWires,
    alignSelection, distributeSelection, autoNumberWires, setCurrentProjectName,
    setWireDefaults, setGridDragEnabled,
  } = useSimStore(useShallow((s) => ({
    play: s.play, pause: s.pause, stop: s.stop, reset: s.reset, setSpeed: s.setSpeed, setSimMode: s.setMode,
    step: s.step, saveJSON: s.saveJSON, loadJSON: s.loadJSON, setTool: s.setTool, setGrid: s.setGrid, setZoom: s.setZoom,
    undo: s.undo, redo: s.redo, organizeWires: s.organizeWires,
    alignSelection: s.alignSelection, distributeSelection: s.distributeSelection, autoNumberWires: s.autoNumberWires, setCurrentProjectName: s.setCurrentProjectName,
    setWireDefaults: s.setWireDefaults, setGridDragEnabled: s.setGridDragEnabled,
  })))
  const cmdUi = useCommandsUi.getState()
  const play = isCmd ? cmdUi.start : plcPlay
  // Pausa os dois motores quando ambos estão a correr (simulação «para todos»).
  const pause = () => {
    if (useCommandsUi.getState().rt.running) useCommandsUi.getState().pause()
    if (useSimStore.getState().sim.runState === 'running') plcPause()
  }
  // Stop pára sempre PLC e IEC: ao alternar de vista o utilizador espera que
  // «Parar» encerre a simulação completa, não só o motor da vista atual.
  const stop = () => {
    useCommandsUi.getState().stop()
    useSimStore.getState().stop()
  }
  const componentsForSim = useSimStore((s) => s.components)
  const setSimPlcScope = useSimStore((s) => s.setSimPlcScope)
  /**
   * Play: se o projeto tem 2+ simuladores com conteúdo (3D, Ladder, GRAFCET, IEC),
   * pergunta se corre todos ou só o da vista atual. Depois, se houver 2+ PLCs e o
   * motor PLC for arrancar, pergunta o âmbito dos controladores.
   */
  const requestPlay = async () => {
    const st = useSimStore.getState()
    if (st.sim.runState === 'running' && !isCmd) return
    if (isCmd && useCommandsUi.getState().rt.running && !useCommandsUi.getState().paused) return

    const modules = listSimModules({
      components: st.components,
      ladderRungs: st.ladder.rungs,
      plcPrograms: st.plcPrograms,
      projectFiles: st.projectFiles,
      grafcet: st.grafcet,
      commands: st.commands,
    })
    // Projeto vazio: mantém o Play directo da vista.
    if (modules.length === 0) {
      if (isCmd) useCommandsUi.getState().start({ withPlc: false })
      else useSimStore.getState().play()
      return
    }
    const currentModule = moduleOfView(mode)
    let scope: 'all' | typeof currentModule = 'all'

    if (modules.length >= 2) {
      const current = modules.find((m) => m.id === currentModule) ?? modules[0]
      const choice = await uiChoose(
        'Este projeto tem vários simuladores. O que deseja colocar em RUN?',
        [
          {
            id: 'all',
            title: 'Simular todos',
            description: 'Arranca todos os simuladores com conteúdo neste projeto.',
            detail: modules.map((m) => m.title).join(' · '),
            badge: `${modules.length} simuladores`,
          },
          {
            id: current.id,
            title: `Só ${current.title}`,
            description: `Apenas o simulador da vista atual (${current.title}).`,
            detail: current.description,
            badge: 'Vista atual',
          },
        ],
        { title: 'Âmbito da simulação', confirmLabel: 'Iniciar', defaultId: 'all' },
      )
      if (!choice) return
      scope = choice === 'all' ? 'all' : current.id
    }

    // Âmbito multi-PLC (só quando o motor PLC vai arrancar).
    if (scopeNeedsPanel(scope)) {
      const plcs = componentsForSim.filter(isProgrammablePlc)
      if (plcs.length >= 2 && st.sim.runState === 'stopped') {
        const activeId = st.activePlcId && plcs.some((p) => p.id === st.activePlcId) ? st.activePlcId : plcs[0].id
        const active = plcs.find((p) => p.id === activeId) ?? plcs[0]
        const activeName = active.ref || active.label || active.type
        const plcChoice = await uiChoose(
          `Este esquema tem ${plcs.length} PLCs. Que programas devem entrar em RUN?`,
          [
            {
              id: 'all',
              title: 'Todos os PLCs',
              description: 'Todos os controladores do quadro executam em paralelo.',
              detail: plcs.map((p) => p.ref || p.label || p.type).join(' · '),
              badge: `${plcs.length} PLCs`,
            },
            {
              id: 'active',
              title: 'Só o PLC ativo',
              description: `Apenas o programa ativo (${activeName}).`,
              detail: 'Os outros controladores ficam parados nesta sessão.',
              badge: activeName,
            },
          ],
          { title: 'PLCs na simulação', confirmLabel: 'Continuar', defaultId: 'all' },
        )
        if (!plcChoice) return
        setSimPlcScope(plcChoice === 'active' ? 'active' : 'all')
      } else {
        setSimPlcScope('all')
      }
    }

    const runPanel = scopeNeedsPanel(scope) && modules.some((m) => m.id !== 'commands')
    const runCommands = scopeNeedsCommands(scope) && modules.some((m) => m.id === 'commands')

    queueMicrotask(() => {
      if (runPanel && useSimStore.getState().sim.runState !== 'running') {
        useSimStore.getState().play()
      }
      if (runCommands) {
        // Se o painel já arrancou, o IEC não precisa de voltar a chamar play().
        useCommandsUi.getState().start({ withPlc: !runPanel })
      }
    })
  }
  const step = isCmd ? () => { if (!cmdUi.rt.running) { cmdUi.start(); useCommandsUi.getState().pause() } else useCommandsUi.getState().tick(100, true) } : plcStep
  // Reinicia os dois motores: «Simular todos» não pode deixar o IEC a meio depois de um Reset no 3D.
  const reset = () => {
    useCommandsUi.getState().stop()
    plcReset()
  }
  const grafcet = useSimStore((state) => state.grafcet)
  const projectKind = useSimStore((state) => state.projectKind)
  const unlockedViews = useSimStore((state) => state.unlockedViews)
  const unlockProjectView = useSimStore((state) => state.unlockProjectView)
  const viewLocked = useSimStore((state) => state.viewLocked)
  const ladderRungs = useSimStore((state) => state.ladder.rungs)
  const ladderTags = useSimStore((state) => state.tags)
  const projectFiles = useSimStore((state) => state.projectFiles)
  const activePlcId = useSimStore((state) => state.activePlcId)
  const grafcetZoom = useGrafcetUi((state) => state.zoom)
  const grafcetTool = useGrafcetUi((state) => state.tool)
  const grafcetGrid = useGrafcetUi((state) => state.gridOn)
  const grafcetSnap = useGrafcetUi((state) => state.snapOn)
  const grafcetPalette = useGrafcetUi((state) => state.paletteOpen)
  const grafcetMinimap = useGrafcetUi((state) => state.minimapOn)
  const grafcetStats = useGrafcetUi((state) => state.stats)
  const grafcetSimVisible = useGrafcetUi((state) => state.simVisible)
  // No PC com ecrã grande o GRAFCET não tem painel inferior: o botão que o abre deixa de fazer sentido.
  const grafcetDockHidden = useNarrowMenu(WIDE_DESKTOP_QUERY)
  const ladderSync = useGrafcetUi((state) => state.ladderSync)
  const grafcetAutoSync = useGrafcetUi((state) => state.autoSync)
  const showSimControls = true // Run/Pausa/Stop/Passo/Reiniciar em todas as vistas (GRAFCET incluído)
  const ladderGrafcetStatus = useMemo(
    () => ladderSyncStatus(grafcet),
    [grafcet, ladderRungs, ladderTags, projectFiles, activePlcId],
  )
  const grafcetIssues = useMemo(() => validateGrafcet(grafcet), [grafcet])
  const grafcetErrorCount = grafcetIssues.filter((i) => i.level === 'error').length
  // «Gerar Ladder» aparece sempre na barra do GRAFCET: num projeto só GRAFCET
  // (sem PLC nem programa Ladder) a primeira geração cria o editor Ladder para o projeto.
  const canGenerateLadder = projectKind !== 'ladder'
  const fileRef = useRef<HTMLInputElement>(null)
  const mainBarRef = useRef<HTMLDivElement>(null)
  const row2BarRef = useRef<HTMLDivElement>(null)
  /* Ao trocar de vista (Esquema · Ladder · GRAFCET · Monitor) as barras voltam ao início, onde está o seletor de vistas:
     o scroll horizontal de uma vista não pode transitar para a seguinte. */
  useEffect(() => {
    const toStart = () => {
      const main = mainBarRef.current
      main?.scrollTo({ left: 0 })
      main?.querySelector<HTMLElement>('.dc-views-container')?.scrollTo({ left: 0 })
      row2BarRef.current?.scrollTo({ left: 0 })
    }
    toStart()
    const frame = requestAnimationFrame(toStart) // depois de a nova vista pintar os seus botões
    return () => cancelAnimationFrame(frame)
  }, [mode])
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

  const narrowBar = useNarrowMenu()
  // Barra completa em PC e tablet (o tablet recebe o layout de PC via meta viewport);
  // só o telemóvel usa menus «Mais». Se a janela for estreita, a barra completa desliza na horizontal.
  const compactQuery = useNarrowMenu(PHONE_TOUCH_QUERY)
  const shellRef = useRef<HTMLDivElement>(null)
  const compactBar = compactQuery && isPhoneTouch() && !isTabletDevice()
  // PC e tablet: quando a 2.ª linha não cabe, os botões com ícone ficam só com o ícone (o nome fica no título e
  // no nome acessível) — todas as ferramentas continuam à vista, sem deslizar nem menus «Mais».
  // Dois níveis, iguais em todas as vistas: «apertado» deixa só ícones nos grupos secundários (edição,
  // extras, navegação, atalhos, caixa-preta); «denso» também nos principais (painéis, ferramentas, anotações).
  const tightRow2 = useOverflowCompact(shellRef, '.dc-toolbar-row2', !compactBar && !demo, [mode])
  const denseRaw = useOverflowCompact(shellRef, '.dc-toolbar-row2', !compactBar && !demo && tightRow2, [mode, 'dense'])
  const denseRow2 = tightRow2 && denseRaw
  const addProjectModule = async () => {
    const hasLadder = (useSimStore.getState().ladder.rungs?.length ?? 0) > 0
    const current = allowedViews(projectKind, hasLadder, unlockedViews)
    const missing = ADDABLE_MODULES.filter((m) => !current.includes(m.id))
    if (!missing.length) {
      await uiAlert('Este projeto já tem todos os módulos (3D, Ladder, GRAFCET e IEC).', { title: 'Módulos do projeto' })
      return
    }
    const choice = await uiChoose(
      'Escolha um módulo para abrir neste projeto. Fica guardado e disponível nas vistas.',
      missing.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.detail,
        detail: 'Adiciona a vista ao projeto atual',
      })),
      { title: 'Adicionar módulo', confirmLabel: 'Adicionar', defaultId: missing[0].id },
    )
    if (!choice) return
    unlockProjectView(choice as WorkspaceView)
    if (choice === 'schematic' || choice === 'ladder' || choice === 'grafcet' || choice === 'commands') {
      setMode(choice)
    }
  }

  const fileSections: ToolMenuSection[] = [{
    id: 'file', title: 'Projeto',
    items: [
      { id: 'new', label: 'Novo projeto', hint: 'Volta aos projetos para criar um em branco', icon: <IconPlus size={15} />, onSelect: createNewProject },
      { id: 'open', label: 'Abrir ficheiro', hint: 'Escolhe um projeto .json do dispositivo', icon: <IconOpen size={15} />, onSelect: () => fileRef.current?.click() },
      { id: 'save', label: 'Guardar em ficheiro', hint: dirty ? 'Há alterações por guardar' : 'Descarrega o projeto em .json', icon: <IconSave size={15} />, onSelect: download, primary: dirty },
      { id: 'add-module', label: 'Adicionar módulo…', hint: 'Abrir 3D, Ladder, GRAFCET ou IEC neste projeto', icon: <IconPlus size={15} />, onSelect: () => void addProjectModule() },
    ],
  }, {
    id: 'export', title: 'Exportar',
    items: [
      { id: 'bom', label: 'Lista de materiais (CSV)', hint: 'Componentes e cabos do esquema', icon: <IconDownload size={15} />, onSelect: downloadBOM, disabled: !components.length, disabledReason: 'Adicione componentes ao esquema' },
      { id: 'pdf', label: 'Exportar PDF', hint: 'Capa, esquema 3D, GRAFCET e ladder à escolha', icon: <IconPdf size={15} />, onSelect: () => { if (requireFeature('pdfExport')) setPdfOpen(true) } },
    ],
  }]

  const segBtn = (active: boolean) => `dc-tool-btn ${active ? 'dc-tool-active' : ''}`
  /** Grupo de ferramentas da vista (3D, GRAFCET, IEC): ícone + texto + tecla, igual em todas. */
  const toolSeg = (label: string, tools: Array<{ id: string; label: string; icon: typeof IconCursor; key: string; title: string }>, active: string, pick: (id: string) => void, disabled?: (id: string) => boolean) => (
    <div className="dc-seg" role="toolbar" aria-label={label}>
      {tools.map(({ id, label: name, icon: Icon, key, title }) => (
        <TbButton key={id} className={`${segBtn(active === id)} !gap-1.5`} pressed={active === id} aria-label={name} title={title} kbd={key} kbdOnBrand={active === id}
          disabled={disabled?.(id)} onClick={() => pick(id)}>
          <Icon size={13} /><span>{name}</span>
        </TbButton>
      ))}
    </div>
  )

  const RUN_LABEL: Record<string, { text: string; cls: string }> = {
    running: { text: 'RUN', cls: 'bg-state-run' },
    paused: { text: 'PAUSE', cls: 'bg-state-pause' },
    stopped: { text: 'STOP', cls: 'bg-state-stop' },
  }
  const runBadge = RUN_LABEL[simRunState] ?? RUN_LABEL.stopped
  const ladderZoom = useLadderZoom((state) => state.zoom)
  const setLadderZoom = useLadderZoom((state) => state.setZoom)
  // Demonstração (landing): barra minimalista — apenas Play, Pause e troca de ambiente (3D / Ladder / GRAFCET).
  const viewControls: ViewControlsProps | null = demo ? null : mode === 'schematic' ? {
      grid: { on: grid.enabled, toggle: () => setGrid({ enabled: !grid.enabled }) },
      snap: { on: grid.snap, toggle: () => setGrid({ snap: !grid.snap }) },
      step: { value: grid.size, options: [5, 10, 20, 25, 50], onChange: (size) => setGrid({ size }) },
      zoom: {
        percent: Math.round(zoom * 100), onOut: () => setZoom(zoom * 0.9), onIn: () => setZoom(zoom * 1.1), onReset: () => { setZoom(1); useSimStore.getState().setPan(0, 0) },
        onFit: () => requestCanvasAction('fit'), fitTitle: 'Enquadrar tudo o que está no canvas (Home)',
      },
    } : mode === 'ladder' ? {
      grid: { on: grid.enabled, toggle: () => setGrid({ enabled: !grid.enabled }), title: 'Mostrar/ocultar malha (as networks usam sempre 20px)' },
      zoom: {
        percent: Math.round(ladderZoom * 100),
        onOut: () => setLadderZoom((z) => z - LADDER_ZOOM_STEP),
        onIn: () => setLadderZoom((z) => z + LADDER_ZOOM_STEP),
        onReset: () => setLadderZoom(1),
        // «Ajustar à largura»: no telemóvel a network (720 px) não cabe no ecrã.
        onFit: () => window.dispatchEvent(new CustomEvent('ladder-fit')),
        fitTitle: 'Ajustar à largura: reduz a escala para a network caber no ecrã',
        canOut: ladderZoom > LADDER_ZOOM_MIN,
        canIn: ladderZoom < LADDER_ZOOM_MAX,
      },
    } : mode === 'commands' ? {
      grid: { on: cmdGrid, toggle: () => useCommandsUi.getState().toggleGrid(), title: 'Mostrar/ocultar a malha (o encaixe é sempre de 20 px)' },
      zoom: {
        percent: Math.round(cmdZoom * 100), onOut: () => useCommandsUi.getState().emit('zoomOut'), onIn: () => useCommandsUi.getState().emit('zoomIn'), onReset: () => useCommandsUi.getState().emit('zoomReset'),
        onFit: () => useCommandsUi.getState().emit('fit'), fitTitle: 'Enquadrar o esquema (Ctrl+0 / duplo clique no fundo)',
      },
    } : mode === 'grafcet' ? {
      grid: { on: grafcetGrid, toggle: () => useGrafcetUi.getState().toggleGrid(), title: 'Mostrar/ocultar a grelha' },
      snap: { on: grafcetSnap, toggle: () => useGrafcetUi.getState().toggleSnap(), title: 'Encaixar à grelha ao arrastar (Alt = livre)' },
      zoom: { percent: Math.round(grafcetZoom * 100), onOut: () => useGrafcetUi.getState().emit('zoomOut'), onIn: () => useGrafcetUi.getState().emit('zoomIn'), onReset: () => useGrafcetUi.getState().emit('zoomReset') },
    } : null
  const isCanvas = mode === 'schematic'
  const sel = selectedComponentIds.length
  // Ações do componente selecionado: antes eram botões flutuantes sobre o canvas (DC-ADR-059).
  const singleSelection = useSimStore((state) => (state.selectedComponentIds.length === 1 ? state.components.find((c) => c.id === state.selectedComponentIds[0]) : undefined))
  const hintsOn = useSimUi((state) => state.hints)
  const canvasHint = useSimUi((state) => state.canvasHint)
  const textPlacement = useSimUi((state) => state.textPlacement)

  // As ações que não cabem passam para menus com nome e atalho. O transporte
  // e a abertura das E/S continuam sempre visíveis, sem deslocar a barra.
  const panelSections: ToolMenuSection[] = mode === 'schematic' || mode === 'commands' ? [{ title: 'Painéis do projeto', items: [
    { id: 'library', label: 'Biblioteca', icon: <IconCube size={15} />, onSelect: () => onOpenLibrary?.() },
    { id: 'grafcet', label: 'Visualizar GRAFCET', icon: <IconGrafcet size={15} />, onSelect: () => onOpenGrafcet?.() },
    { id: 'objects', label: 'Objetos do projeto', icon: <IconLayers size={15} />, onSelect: () => onOpenObjects?.() },
  ] }] : mode === 'ladder' ? [{ title: 'Secções do Ladder', items: (['Projeto', 'Biblioteca', 'Dispositivos', 'Diagnóstico', 'Configurações'] as const).map((name) => ({ id: name, label: name, icon: <IconProjects size={15} />, pressed: ladderSection === name, onSelect: () => setLadderSection(name) })) }] : [{ title: 'Painéis GRAFCET', items: [
    { id: 'palette', label: 'Componentes', icon: <IconLayers size={15} />, pressed: grafcetPalette, kbd: 'Ctrl+B', onSelect: () => useGrafcetUi.getState().emit('togglePalette') },
    { id: 'signals', label: 'Tabela de variáveis', icon: <IconTag size={15} />, onSelect: () => useGrafcetUi.getState().emit('openSignals') },
    { id: 'diagnostics', label: 'Diagnóstico', icon: <IconShield size={15} />, onSelect: () => useGrafcetUi.getState().emit('openDiagnostics') },
  ] }]
  const toolSections: ToolMenuSection[] = mode === 'commands' ? [{ title: 'Ferramentas do Esquema IEC', items: COMMAND_TOOLS.map(({ id, label, icon: Icon, hint, key }) => ({ id, label, hint, icon: <Icon size={15} />, kbd: key, pressed: cmdTool === id, onSelect: () => useCommandsUi.getState().setTool(id) })) }, { title: 'Esquema', items: [
    { id: 'cmd-rotate', label: 'Rodar 90°', icon: <IconRotate size={15} />, kbd: 'R', disabled: cmdSelection?.type !== 'part' || cmdRunning, disabledReason: 'Selecione um símbolo', onSelect: () => useCommandsUi.getState().emit('rotate') },
    { id: 'cmd-delete', label: 'Apagar seleção', icon: <IconDelete size={15} />, kbd: 'Del', disabled: !cmdSelection || cmdRunning, disabledReason: 'Selecione um símbolo ou cabo', onSelect: () => useCommandsUi.getState().emit('delete') },
    { id: 'cmd-examples', label: 'Exemplos', icon: <IconTemplates size={15} />, disabled: cmdRunning, onSelect: () => useCommandsUi.getState().emit('examples') },
    { id: 'cmd-import', label: 'Importar', icon: <IconImport size={15} />, disabled: cmdRunning, onSelect: () => useCommandsUi.getState().emit('import') },
    { id: 'cmd-clear', label: 'Limpar esquema', icon: <IconErase size={15} />, disabled: !cmdHasParts || cmdRunning, onSelect: () => useCommandsUi.getState().emit('clear') },
  ] }] : mode === 'schematic' ? [{ title: 'Ferramentas do esquema', items: TOOLS.map(({ id, label, icon: Icon, hint, key }) => ({ id, label, hint, icon: <Icon size={15} />, kbd: key, pressed: tool === id, onSelect: () => setTool(id) })) }, {
    title: 'Disposição', items: [
      ...ALIGN_BUTTONS.map(({ edge, icon: Icon, hint }) => ({ id: edge, label: hint, icon: <Icon size={15} />, disabled: sel < 2, disabledReason: 'Selecione pelo menos dois componentes', onSelect: () => alignSelection(edge) })),
      { id: 'distribute-h', label: 'Distribuir na horizontal', disabled: sel < 3, disabledReason: 'Selecione pelo menos três componentes', onSelect: () => distributeSelection('horizontal') },
      { id: 'distribute-v', label: 'Distribuir na vertical', disabled: sel < 3, disabledReason: 'Selecione pelo menos três componentes', onSelect: () => distributeSelection('vertical') },
      { id: 'organize-wires', label: 'Organizar cabos', icon: <IconOrganize size={15} />, disabled: !wires.length, disabledReason: 'Ligue os componentes com cabos', onSelect: () => organizeWires() },
      { id: 'number-wires', label: 'Numerar cabos sem número', icon: <IconTag size={15} />, disabled: !wires.length, disabledReason: 'Ligue os componentes com cabos', onSelect: () => autoNumberWires('missing') },
      { id: 'renumber-wires', label: 'Renumerar todos os cabos', icon: <IconTag size={15} />, disabled: !wires.length, disabledReason: 'Ligue os componentes com cabos', onSelect: () => autoNumberWires('all') },
      { id: 'grid-drag', label: 'Arrastar malha', icon: <IconHand size={15} />, pressed: gridDragEnabled, onSelect: () => setGridDragEnabled(!gridDragEnabled) },
      { id: 'component-table', label: 'Tabela de componentes', icon: <IconGrid size={15} />, onSelect: () => setComponentTableOpen(true) },
      ...(singleSelection ? [
        { id: 'edit-model', label: `Editar modelo de ${singleSelection.ref}`, icon: <IconCube size={15} />, onSelect: () => useSimStore.getState().openViewOrientationEditor(singleSelection.id) },
        { id: 'edit-terminals', label: `Editar bornes de ${singleSelection.ref}`, icon: <IconProbe size={15} />, onSelect: () => useSimStore.getState().openViewOrientationEditor(singleSelection.id, 'terminals') },
      ] : []),
    ],
  }] : mode === 'ladder' ? [{ title: 'Programa Ladder', items: [
    { id: 'compile', label: 'Compilar', hint: compileLabel || 'Verifica Main, blocos e referências', kbd: 'Ctrl+Shift+B', icon: <IconTools size={15} />, onSelect: () => useLadderUi.getState().emit('compile') },
    { id: 'add-block', label: 'Adicionar bloco', icon: <IconPlus size={15} />, onSelect: () => useLadderUi.getState().emit('addBlock') },
    { id: 'add-network', label: 'Nova network', kbd: 'Insert', icon: <IconLadder size={15} />, onSelect: () => useLadderUi.getState().emit('addNetwork') },
    { id: 'variables', label: 'Tabela de variáveis', icon: <IconTag size={15} />, onSelect: () => { setLadderSection('Projeto'); useLadderUi.getState().emit('openVariables') } },
    ...(ladderGrafcetStatus !== 'none' ? [{ id: 'open-grafcet', label: 'Abrir GRAFCET', icon: <IconGrafcet size={15} />, onSelect: () => setMode('grafcet') }] : []),
  ] }] : mode === 'grafcet' ? [{ title: 'Ferramentas GRAFCET', items: GRAFCET_TOOLS.map(({ id, label, icon: Icon, key, title }) => ({ id, label, hint: title, icon: <Icon size={15} />, kbd: key, pressed: grafcetTool === id, onSelect: () => useGrafcetUi.getState().setTool(id) })) }, { title: 'Sequência', items: [
    { id: 'templates', label: 'Modelos GRAFCET', shortLabel: 'Modelos', icon: <IconTemplates size={15} />, onSelect: () => useGrafcetUi.getState().emit('openTemplates') },
    { id: 'auto-layout', label: 'Organizar diagrama', shortLabel: 'Organizar', icon: <IconOrganize size={15} />, onSelect: () => useGrafcetUi.getState().emit('autoLayout') },
    { id: 'restart-sequence', label: 'Reiniciar sequência', shortLabel: 'Reiniciar', hint: 'Volta às etapas iniciais', icon: <IconRotate size={15} />, onSelect: () => useGrafcetUi.getState().emit('restart') },
    ...(canGenerateLadder ? [{ id: 'generate-ladder', label: ladderSync === 'none' ? 'Gerar Ladder' : 'Atualizar Ladder', shortLabel: 'Ladder', icon: <IconLadder size={15} />, onSelect: () => useGrafcetUi.getState().emit('generateLadder') }] : []),
    ...(ladderSync !== 'none' ? [{ id: 'auto-sync', label: 'Sincronização automática', shortLabel: 'Sincronizar', icon: <IconLink size={15} />, pressed: grafcetAutoSync, onSelect: () => useGrafcetUi.getState().toggleAutoSync() }] : []),
    { id: 'export-svg', label: 'Exportar SVG', shortLabel: 'SVG', hint: 'Desenho vetorial do GRAFCET', icon: <IconImage size={15} />, onSelect: () => useGrafcetUi.getState().emit('exportSvg') },
    { id: 'export-grafcet', label: 'Exportar GRAFCET JSON', shortLabel: 'JSON', hint: 'Ficheiro para reabrir ou partilhar', icon: <IconFile size={15} />, onSelect: () => useGrafcetUi.getState().emit('exportJson') },
    { id: 'text-guards', label: 'Textos → condições', shortLabel: 'Textos → cond.', hint: 'Converte «G4 <> X159» em condição da transição', icon: <IconSwap size={15} />, onSelect: () => useGrafcetUi.getState().emit('convertTextGuards') },
    { id: 'import-grafcet', label: 'Importar GRAFCET', shortLabel: 'Importar', hint: 'FluidSIM 4 (.ct), JSON ou .grafcet', icon: <IconImport size={15} />, onSelect: () => useGrafcetUi.getState().emit('importJson') },
  ] }] : []
  const annotationItems = [
    { id: 'add-note', label: 'Comentário', hint: 'Criar uma nota com conversa no desenho', icon: <IconNote size={13} />, onSelect: () => mode === 'grafcet' ? useGrafcetUi.getState().emit('addNote') : requestCanvasAction('addNote') },
    { id: 'add-text', label: 'Texto livre', hint: 'Clique no desenho para colocar texto · Esc cancela', icon: <IconText size={13} />, pressed: textPlacement, onSelect: () => mode === 'grafcet' ? useGrafcetUi.getState().emit('addText') : requestCanvasAction('addText') },
  ]
  if (mode === 'schematic' || mode === 'grafcet' || mode === 'commands') toolSections.push({ id: 'annotations', title: 'Anotações', items: annotationItems })
  // Alinhar/distribuir a seleção múltipla (textos e elementos): igual no 3D, GRAFCET e IEC.
  const alignView = mode === 'schematic' || mode === 'grafcet' || mode === 'commands' ? mode : null
  const ALIGN_ICONS: Record<AlignAction, ReactNode> = {
    left: <IconAlignLeft size={13} />, hcenter: <IconAlignCenterH size={13} />, right: <IconAlignRight size={13} />,
    top: <IconAlignTop size={13} />, vcenter: <IconAlignCenterV size={13} />, bottom: <IconAlignBottom size={13} />,
    distH: <IconDistH size={13} />, distV: <IconDistV size={13} />,
  }
  const alignItemsFor = (ids: AlignAction[]) => ALIGN_ACTIONS.filter((a) => ids.includes(a.id)).map((a) => ({
    id: `align-${a.id}`, label: a.label, hint: a.hint, icon: ALIGN_ICONS[a.id], onSelect: () => { if (alignView) requestAlign(alignView, a.id) },
  }))
  const alignSections: ToolMenuSection[] = [
    { id: 'align', title: 'Alinhar (seleção com 2 ou mais)', items: alignItemsFor(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']) },
    { id: 'distribute', title: 'Distribuir (3 ou mais)', items: alignItemsFor(['distH', 'distV']) },
  ]
  if (alignView) toolSections.push({ id: 'align-tools', title: 'Alinhar e distribuir', items: alignSections.flatMap((section) => section.items) })
  const annotationTools = <div className="dc-seg" role="group" aria-label="Anotações">
    {annotationItems.map(item => <TbButton key={item.id} aria-label={item.label} title={item.hint} onClick={item.onSelect} pressed={item.pressed} className={`dc-tool-btn !gap-1.5${item.pressed ? ' dc-tool-active' : ''}`}>
      {item.icon}<span>{item.id === 'add-text' ? 'Texto' : item.label}</span>
    </TbButton>)}
  </div>

  /** Ações secundárias da vista — em is-tight passam a ToolMenu «Mais» para reduzir ruído. */
  const viewExtraItems: ToolMenuSection['items'] = []
  if (isCmd) {
    viewExtraItems.push(
      { id: 'examples', label: 'Exemplos IEC', hint: 'Abrir um esquema de exemplo (arranque, inversão, emergência…)', icon: <IconTemplates size={15} />, onSelect: () => useCommandsUi.getState().emit('examples'), disabled: cmdRunning },
      { id: 'import', label: 'Importar', hint: 'FluidSIM (.ct) ou CADe SIMU (.cad)', icon: <IconImport size={15} />, onSelect: () => useCommandsUi.getState().emit('import'), disabled: cmdRunning },
      { id: 'clear-cmd', label: 'Limpar esquema', hint: 'Apagar todo o esquema (pode desfazer)', icon: <IconErase size={15} />, onSelect: () => useCommandsUi.getState().emit('clear'), disabled: !cmdHasParts || cmdRunning },
    )
  }
  if (mode === 'schematic') {
    viewExtraItems.push(
      { id: 'table', label: 'Tabela de componentes', hint: 'Criar e posicionar componentes por tabela ou Excel', icon: <IconGrid size={15} />, onSelect: () => setComponentTableOpen(true) },
    )
  }
  if (mode === 'grafcet') {
    viewExtraItems.push(
      { id: 'variables', label: 'Variáveis / Sinais', hint: 'Declarar e organizar entradas, saídas e memórias', icon: <IconTag size={15} />, onSelect: () => useGrafcetUi.getState().emit('openSignals') },
    )
  }

  const compactMoreSections: ToolMenuSection[] = [
    ...fileSections,
    // O Esquema IEC não tem modo nem velocidade de execução (estão escondidos também na barra completa).
    ...(isCmd ? [] : [{ title: 'Execução', items: [
      ...(['realtime', 'turbo', 'step'] as const).map((value, index) => ({ id: `mode-${value}`, label: ['Tempo real', 'Turbo', 'Passo a passo'][index], icon: <IconPlay size={15} />, pressed: simMode === value, onSelect: () => setSimMode(value) })),
      ...[0.25, 0.5, 1, 2, 4, 10].map((value) => ({ id: `speed-${value}`, label: `Velocidade ${value}×`, pressed: simSpeed === value, onSelect: () => setSpeed(value) })),
    ] }]),
    { title: 'Vista', items: [
      ...(viewControls?.grid ? [{ id: 'grid', label: 'Mostrar malha', icon: <IconGrid size={15} />, pressed: viewControls.grid.on, onSelect: viewControls.grid.toggle }] : []),
      ...(viewControls?.snap ? [{ id: 'snap', label: 'Encaixar na malha', icon: <IconMagnet size={15} />, pressed: viewControls.snap.on, onSelect: viewControls.snap.toggle }] : []),
      ...(viewControls?.step ? viewControls.step.options.map((value) => ({ id: `grid-${value}`, label: `Passo da malha: ${value} px`, pressed: viewControls.step!.value === value, onSelect: () => viewControls.step!.onChange(value) })) : []),
      ...(viewControls?.zoom ? [
        { id: 'zoom-out', label: 'Reduzir zoom', icon: <IconZoomOut size={15} />, onSelect: viewControls.zoom.onOut },
        { id: 'zoom-reset', label: `Zoom ${viewControls.zoom.percent}% · repor`, icon: <IconFocus size={15} />, onSelect: viewControls.zoom.onReset },
        { id: 'zoom-in', label: 'Ampliar zoom', icon: <IconZoomIn size={15} />, onSelect: viewControls.zoom.onIn },
        ...(viewControls.zoom.onFit ? [{ id: 'fit', label: 'Enquadrar conteúdo', icon: <IconFocus size={15} />, onSelect: viewControls.zoom.onFit }] : []),
      ] : []),
      ...(mode === 'grafcet' ? [
        { id: 'fit-grafcet', label: 'Enquadrar GRAFCET', icon: <IconFocus size={15} />, onSelect: () => useGrafcetUi.getState().emit('fitView') },
        { id: 'minimap', label: 'Minimapa', icon: <IconGrid size={15} />, pressed: grafcetMinimap, onSelect: () => useGrafcetUi.getState().emit('toggleMinimap') },
      ] : []),
      { id: 'clean', label: 'Modo clean', icon: <IconFocus size={15} />, pressed: clean, onSelect: () => setClean(!clean) },
      { id: 'black-box', label: 'Modo caixa-preta', icon: <IconLock size={15} />, pressed: simBlackBox, onSelect: () => useSimStore.getState().toggleBlackBox() },
      { id: 'shortcuts', label: 'Atalhos de teclado', kbd: '?', icon: <IconHelp size={15} />, onSelect: () => mode === 'grafcet' ? useGrafcetUi.getState().emit('openShortcuts') : mode === 'monitor' ? setMonitorHelp(true) : requestShortcuts(mode) },
    ] },
  ]

  /*
   * Reorganização 2026-11-02 (BrainNet Decision 2026-11-02-Reorganizacao-Barras-Ferramentas)
   * ------------------------------------------------------------------
   * Princípio: melhor organização, não mais botões. Reutilizar toolbarKit,
   * ToolMenu e os estados is-tight / is-dense. Tablet continua com parity
   * de layout de desktop (TABLET_LAYOUT_WIDTH); o excesso de informação
   * é tratado por overflow content-based + labels que desaparecem em
   * larguras intermédias e estados apertados. Ações principais (vistas,
   * ferramentas de edição, transporte de simulação, histórico) permanecem
   * visíveis; secundárias vão para menus ou perdem o texto.
   * Consistência visual entre 3D / Ladder / GRAFCET / IEC via dc-seg,
   * dc-tool-btn e tokens de toolbar-spacing.css.
   */
  return (
    <div ref={shellRef} className={`dc-toolbar-shell shrink-0 bg-surface-rail border-b border-line shadow-xs relative z-20${compactBar && !demo ? ' is-compact' : ''}`}>
      {/* ============================ linha 1 — projeto · vistas · simulação */}
      <div ref={mainBarRef} className={`flex items-center gap-2 px-3 min-h-[46px] ${demo ? 'justify-between' : 'border-b border-line-soft'} dc-toolbar-main`}>
        {/* Projeto: Novo / Abrir / Guardar / BOM / PDF — agrupados; em ecrã estreito viram ToolMenu */}
        {!demo && (
        <div className="dc-project-file-tools flex items-center gap-1.5 shrink-0">
          {narrowBar
            ? <ToolMenu label="Ficheiro" title="Ficheiro e exportação" icon={<IconOpen size={14} />} sections={fileSections} className="dc-file-menu" badge={dirty ? 1 : undefined} />
            : (
          <div className="flex items-center gap-1.5 bg-surface-sunken border border-line rounded-lg p-1" role="group" aria-label="Projeto">
            <button onClick={createNewProject} className="dc-file-extra flex items-center gap-1.5 px-2 py-1 hover:bg-white hover:shadow-sm rounded transition-all text-ink-600 hover:text-ink-900" title="Novo projeto em branco" aria-label="Novo projeto">
              <IconPlus size={14} /> <span className="hidden xl:inline text-[11px] font-medium">Novo</span>
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
            <button onClick={() => { if (requireFeature('pdfExport')) setPdfOpen(true) }} className="dc-file-extra flex items-center gap-1.5 px-2 py-1 hover:bg-white hover:shadow-sm rounded transition-all text-ink-600 hover:text-ink-900" title="Exportar o projeto em PDF (capa, esquema 3D, GRAFCET e ladder à escolha)" aria-label="Exportar PDF">
              <IconPdf size={14} /> <span className="hidden xl:inline text-[11px] font-medium">PDF</span>
            </button>
          </div>
            )}
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={upload} />
        </div>
        )}

        {/* vistas — ambientes (3D · Ladder · GRAFCET na demonstração) */}
        <div className={`${demo ? 'min-w-0 flex items-center' : 'flex-1 flex justify-center min-w-0'} dc-views-container`}>
          <div className="flex items-center rounded-lg p-1 gap-1 bg-surface-sunken border border-line shadow-inner" role="tablist" aria-label="Vistas">
            {visibleViews.map(({ id, label, icon: DefaultIcon, key }) => {
              const displayLabel = demo && id === 'schematic' ? '3D' : label
              const Icon = demo && id === 'schematic' ? IconCube : DefaultIcon
              return (
                <button
                  key={id}
                  role="tab"
                  aria-label={displayLabel}
                  aria-selected={mode === id}
                  onClick={() => setMode(id)}
                  className={`relative inline-flex items-center gap-1.5 h-[30px] ${demo ? 'px-2.5 sm:px-3.5' : 'px-3 2xl:px-4'} whitespace-nowrap rounded-[6px] text-xs font-semibold transition-all ${
                    mode === id ? 'bg-brand-600 text-white shadow-md' : 'text-ink-500 hover:text-ink-900 hover:bg-white'
                  }`}
                  title={`${displayLabel} [${key} · Ctrl+${visibleViews.findIndex((v) => v.id === id) + 1}]`}
                >
                  <Icon size={14} />
                  <span className={`dc-view-label ${demo ? 'inline' : 'hidden md:inline'}`}>{displayLabel}</span>
                  {/* Estado do diagnóstico desta vista (✓ OK · ! avisos · ✖ erros), como o separador do GRAFCET */}
                  {!demo && id !== 'monitor' && <ViewDiagnosticsTag view={id} badge label={displayLabel} />}
                </button>
              )
            })}
          </div>
          {/* Dois canvas lado a lado não cabem num telemóvel: o botão só existe a partir do tablet. */}
          {!demo && canSplit && !compactBar && (
            <button
              type="button"
              onClick={() => (splitEnabled ? disableSplit() : openSplitDialog())}
              className={`ml-1.5 inline-flex items-center gap-1.5 h-[34px] px-2.5 rounded-lg border text-xs font-semibold transition-all ${
                splitEnabled
                  ? 'border-brand-600 bg-brand-600 text-white shadow-md'
                  : 'border-line bg-surface-sunken text-ink-600 hover:text-ink-900 hover:bg-white'
              }`}
              title={splitEnabled ? 'Fechar vista dividida (dois canvas)' : 'Ver dois canvas ao mesmo tempo (ambientes ou páginas GRAFCET)'}
              aria-label={splitEnabled ? 'Fechar vista dividida' : 'Ver dois canvas'}
              aria-pressed={splitEnabled}
            >
              <IconCompare size={14} />
              <span className="hidden lg:inline">{splitEnabled ? 'Uma vista' : 'Dois canvas'}</span>
            </button>
          )}
        </div>

        {/* simulação + estado — canto direito */}
        <div className="dc-transport-tools flex items-center gap-1.5 shrink-0">
          {showSimControls && (
            <>
          <div className="dc-seg" role="toolbar" aria-label="Controle de simulação">
            <button
              onClick={() => void requestPlay()}
              disabled={simRunState === 'running'}
              className={`dc-tool-btn !font-semibold ${simRunState === 'running' ? '' : '!text-state-run'}`}
              title="Iniciar simulação (RUN)"
              aria-label="Play"
            >
              <IconPlay size={13} /> <span className={demo ? 'hidden sm:inline' : 'hidden lg:inline'}>{demo ? 'Play' : 'Run'}</span>
            </button>
            <button
              onClick={pause}
              disabled={simRunState !== 'running'}
              className={`${segBtn(false)} ${demo ? '!font-semibold !px-2.5' : '!px-2'} !text-state-pause`}
              title="Pausar"
              aria-label="Pause"
            >
              <IconPause size={13} /> {demo && <span className="hidden sm:inline">Pause</span>}
            </button>
            {!demo && <button onClick={stop} disabled={simRunState === 'stopped'} className={`${segBtn(false)} !px-2 !text-ink-700`} title="Parar (STOP)">
              <IconStop size={13} />
            </button>}
            {!demo && <button onClick={step} className={`${segBtn(false)} !px-2 !text-brand-600`} title="Avançar um ciclo de varredura">
              <IconStep size={13} />
            </button>}
            {!demo && <button onClick={reset} className={`${segBtn(false)} !px-2`} title="Reiniciar a simulação sem alterar o projeto">
              <IconReset size={13} />
            </button>}
          </div>
          {!demo && (
            <>
          <Select
            value={simMode}
            onChange={(e) => setSimMode(e.target.value as any)}
            className={`dc-runtime-setting dc-select !w-auto hidden lg:block ${isCmd ? "!hidden" : ""}`}
            title="Modo de execução: tempo real = 100 ms por ciclo; turbo = ciclos acelerados; passo a passo = um ciclo por clique"
          >
            <option value="realtime">Tempo real</option>
            <option value="turbo">Turbo</option>
            <option value="step">Passo a passo</option>
          </Select>
          <Select value={simSpeed} onChange={(e) => setSpeed(Number(e.target.value))} className={`dc-runtime-setting dc-select !w-[62px] ${isCmd ? "!hidden" : ""}`} title="Velocidade da simulação">
            {[0.25, 0.5, 1, 2, 4, 10].map((v) => (
              <option key={v} value={v}>{v}×</option>
            ))}
          </Select>
          {!isCmd && <span className="tb-sep dc-runtime-sep" />}
          <span
            className={`dc-run-badge inline-flex items-center gap-1.5 h-[24px] px-2.5 rounded-[5px] font-mono text-[11px] font-bold tracking-[0.08em] text-white whitespace-nowrap ${runBadge.cls}`}
            onPointerEnter={(e) => { e.currentTarget.title = `Estado do simulador: ${runBadge.text} · scan #${useSimStore.getState().sim.scanCount}` }}
            title={`Estado do simulador: ${runBadge.text}`}
          >
            {simRunState === 'running' ? (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
            ) : (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/80" />
            )}
            {runBadge.text}
          </span>
            </>
          )}
            </>
          )}
          {!demo && <button type="button" className={`dc-tool-btn dc-clean-toggle ${clean ? 'is-on' : ''}`} aria-pressed={clean} onClick={() => setClean(!clean)} title={clean ? 'Sair do modo clean (mostrar todas as barras)' : 'Modo clean: esconde barras e painéis secundários'}><IconFocus size={13} /><span className="hidden lg:inline">Clean</span></button>}
        </div>
      </div>

      {/* ============================ linha 2 — contextual à vista ativa (oculta na demonstração) */}
      {!demo && compactBar && <div ref={row2BarRef} className="dc-toolbar-row2 dc-toolbar-compact" aria-label="Ferramentas do projeto">
        {mode !== 'monitor' && <SimToggleButton on={mode === 'grafcet' ? grafcetSimVisible : isCmd ? cmdDockOpen : simPanelOn} scope={mode === 'commands' ? 'schematic' : mode}
          onClick={() => mode === 'grafcet' ? useGrafcetUi.getState().toggleSim() : isCmd ? useCommandsUi.getState().toggleDock() : mode === 'schematic' ? onToggleSchematicSim?.() : useSimUi.getState().toggleSimPanel('ladder')}
          title="Abrir controlos de simulação e entradas/saídas" />}
        <HistoryGroup onUndo={undo} onRedo={redo} canUndo={history.length > 0} canRedo={future.length > 0} />
        {toolSections.length > 0 && <ToolMenu label="Ferramentas" icon={<IconTools size={15} />} sections={toolSections} className="dc-compact-menu" />}
        {mode !== 'monitor' && <ToolMenu label="Painéis" icon={<IconLayers size={15} />} sections={panelSections} className="dc-compact-menu" />}
        <ToolMenu label="Mais" title="Opções do projeto e da vista" icon={<IconMore size={15} />} sections={compactMoreSections} className="dc-compact-menu dc-compact-more" align="end" />
      </div>}
      {/* 2.ª linha — mesma organização em todas as vistas (só aparecem os grupos que a vista tem):
          Agrupamento (2026-11-02): Histórico │ Painéis/Simulação │ Ferramentas de edição │
          Anotações/Extras ··· Estado │ Navegação │ Atalhos │ Vista │ Caixa-preta.
          is-tight → só ícones nos grupos secundários; is-dense → também nos principais (.tb-primary).
          Em ≤1100 px + tight/dense os labels de texto desaparecem (tooltip e aria-label mantêm-se).
          Tablet mantém layout de desktop; telemóvel usa compactBar + ToolMenus. */}
      {!demo && !compactBar && <div ref={row2BarRef} className={`dc-toolbar-row2 ${tightRow2 ? 'is-tight' : ''} ${denseRow2 ? 'is-dense' : ''} flex items-center gap-1.5 px-3 h-[40px] overflow-x-auto flex-nowrap toolbar-scroll ${mode === 'grafcet' ? 'dc-grafcet-toolbar' : ''}`}>
        <HistoryGroup onUndo={undo} onRedo={redo} canUndo={history.length > 0} canRedo={future.length > 0} />

        {/* Telemóvel: os painéis de ecrã inteiro vêm a seguir ao histórico. */}
        {(mode === 'schematic' || mode === 'commands') && <div className="dc-mobile-panel-tools" role="group" aria-label="Painéis">
          <button className="dc-tool-btn" onClick={onOpenLibrary} title="Abrir biblioteca em ecrã inteiro"><IconCube size={14} /><span>Biblioteca</span></button>
          <button className="dc-tool-btn" onClick={onOpenGrafcet} title="Abrir GRAFCET em ecrã inteiro"><IconGrafcet size={14} /><span>GRAFCET</span></button>
          <button className="dc-tool-btn" onClick={onOpenObjects} title="Ver os objetos do projeto"><IconLayers size={14} /><span>Objetos</span></button>
        </div>}

        {/* ── Painéis: Simulação (+ Componentes no GRAFCET) */}
        {mode !== 'monitor' && <>
          <span className="tb-sep" />
          <div className="tb-primary contents">
          {mode === 'grafcet'
            ? !grafcetDockHidden && <SimToggleButton on={grafcetSimVisible} scope="grafcet" onClick={() => useGrafcetUi.getState().toggleSim()} title={grafcetSimVisible ? 'Esconder a simulação' : 'Mostrar a simulação'} />
            : <SimToggleButton on={simPanelOn} scope={mode === 'commands' ? 'schematic' : mode} onClick={() => mode === 'ladder' ? useSimUi.getState().toggleSimPanel('ladder') : onToggleSchematicSim?.()}
                title={mode === 'ladder'
                  ? (simPanelOn ? 'Fechar a simulação (E/S, sinais do PLC, memórias, compilação)' : 'Abrir a simulação: pode acionar entradas e dispositivos; Run inicia a execução contínua')
                  : mode === 'commands'
                    ? (simPanelOn ? 'Recolher as entradas e saídas' : 'Abrir as entradas e saídas dos comandos no painel do projeto; Run inicia a simulação')
                    : (simPanelOn ? 'Recolher as entradas e saídas' : 'Abrir entradas e saídas no painel do projeto; Run inicia a execução contínua')} />}
          {mode === 'grafcet' && <button type="button" className={`dc-tool-btn grafcet-palette-tool !gap-1.5 ${grafcetPalette ? 'is-on' : ''}`} aria-pressed={grafcetPalette} aria-label="Componentes" onClick={() => useGrafcetUi.getState().emit('togglePalette')} title="Mostrar/ocultar os componentes (Ctrl+B)"><IconLayers size={13} /><span>Componentes</span></button>}
          </div>
        </>}

        {/* ── Ferramentas: o mesmo grupo (ícone + texto + tecla) no 3D, no GRAFCET e no IEC */}
        {isCanvas && <><span className="tb-sep" /><div className="tb-primary contents">{toolSeg('Ferramentas de edição', TOOLS.map((t) => ({ ...t, title: `${t.hint} [${t.key}]` })), tool, (id) => setTool(id as EditorTool))}</div></>}
        {isCmd && <><span className="tb-sep" /><div className="tb-primary contents">{toolSeg('Ferramentas de comandos', COMMAND_TOOLS.map((t) => ({ ...t, title: `${t.hint} [${t.key}]` })), cmdTool, (id) => useCommandsUi.getState().setTool(id as CmdTool), (id) => cmdRunning && id !== 'pan' && id !== 'select')}</div></>}
        {mode === 'grafcet' && <><span className="tb-sep" /><div className="tb-primary contents">{toolSeg('Ferramentas de seleção e navegação', GRAFCET_TOOLS, grafcetTool, (id) => useGrafcetUi.getState().setTool(id as typeof grafcetTool))}</div></>}

        {/* opções da ferramenta Cabo: aplicadas aos próximos cabos */}
        {isCmd && (<>
            {cmdTool === 'wire' && (
              <>
                <span className="tb-label">Novo cabo</span>
                <div className="flex items-center gap-1 rounded-[6px] border border-line bg-white px-1.5 h-[28px] shadow-xs">
                  <button
                    type="button"
                    onClick={() => useCommandsUi.getState().setWireColor(null)}
                    className={`h-[18px] px-1.5 rounded-full text-[9.5px] font-bold border ${!cmdWireColor ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-line text-ink-400'}`}
                    title="Cor automática pela função do cabo (IEC 60204-1)"
                  >
                    AUTO
                  </button>
                  {QUICK_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`tb-swatch ${cmdWireColor === c ? 'is-active' : ''}`}
                      style={{ background: c === 'green-yellow' ? 'repeating-linear-gradient(45deg,#84cc16 0 4px,#eab308 4px 8px)' : WIRE_COLORS[c] }}
                      title={`Cor dos novos cabos: ${WIRE_COLOR_LABEL[c]}`}
                      aria-label={`Cor dos novos cabos: ${WIRE_COLOR_LABEL[c]}`}
                      aria-pressed={cmdWireColor === c}
                      onClick={() => useCommandsUi.getState().setWireColor(c)}
                    />
                  ))}
                </div>
                <span className="tb-sep" />
              </>
            )}
        </>)}
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

        {/* ── Edição: ações sobre o desenho / programa */}
        {isCmd && <>
          <span className="tb-sep" />
          <button type="button" className="dc-tool-btn !gap-1.5" disabled={cmdSelection?.type !== 'part' || cmdRunning} onClick={() => useCommandsUi.getState().emit('rotate')} title="Rodar o símbolo selecionado 90° [R]"><IconRotate size={13} /><span>Rodar</span></button>
          <button type="button" className="dc-tool-btn !gap-1.5" disabled={!cmdSelection || cmdRunning} onClick={() => useCommandsUi.getState().emit('delete')} title="Apagar o símbolo ou cabo selecionado [Del]"><IconDelete size={13} /><span>Apagar</span></button>
        </>}
        {mode === 'ladder' && <>
          <span className="tb-sep" />
          <button type="button" className="dc-tool-btn !gap-1.5" data-ladder-add-block
            onClick={() => useLadderUi.getState().emit('addBlock')}
            title="Adicionar bloco ao projeto (OB/FB/FC/DB)" aria-label="Adicionar bloco">
            <IconPlus size={12} /><span>Bloco</span>
          </button>
          <button type="button" className="dc-tool-btn ladder-add-network-tb !gap-1.5" data-ladder-add-network
            onClick={() => useLadderUi.getState().emit('addNetwork')}
            title="Criar network no programa aberto (Insert)" aria-label="Nova network">
            <IconPlus size={12} /><span>Nova network</span>
          </button>
              <button type="button" className={`dc-tool-btn ladder-compile-tb !gap-1.5 ${compileState === 'none' ? '' : `is-${compileState === 'warning' ? 'ok' : compileState}`}`} data-compile data-compile-state={compileState}
                onClick={() => useLadderUi.getState().emit('compile')}
                title={`Compilar o programa do PLC ativo (Ctrl+Shift+B): Main, FC, blocos, CALL e referências cruzadas${compileLabel ? `\n${compileLabel}` : ''}`}>
                <IconTools size={13} /><span>Compilar</span>
                {compileState !== 'none' && <span className="ladder-compile-dot" aria-label={compileState === 'ok' ? 'Compilado' : compileState === 'warning' ? 'Compilado com avisos' : compileState === 'stale' ? 'Alterado desde a última compilação' : 'Com erros'} />}
              </button>
        </>}
        {mode === 'schematic' && <>
          <span className="tb-sep" />
              <Dropdown label={<span>Organizar</span>} icon={<IconOrganize size={13} />} title="Alinhar, distribuir e organizar cabos">
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
        </>}
        {/* componente selecionado: editar modelo e bornes */}
        {isCanvas && singleSelection && <>
          <span className="tb-sep" />
          <div className="dc-seg" role="group" aria-label={`Editar ${singleSelection.ref}`}>
            <button type="button" className="dc-tool-btn !gap-1.5" onClick={() => useSimStore.getState().openViewOrientationEditor(singleSelection.id)}
              title={`Editar o modelo 3D de ${singleSelection.ref}`} aria-label={`Editar componente 3D ${singleSelection.ref}`}>
              <IconCube size={13} /><span>Componente</span>
            </button>
            <button type="button" className="dc-tool-btn !gap-1.5" onClick={() => useSimStore.getState().openViewOrientationEditor(singleSelection.id, 'terminals')}
              title={`${singleSelection.terminals.length > 0 ? 'Editar bornes' : 'Adicionar borne'} de ${singleSelection.ref}`} aria-label={`${singleSelection.terminals.length > 0 ? 'Editar bornes' : 'Adicionar borne'} de ${singleSelection.ref}`}>
              <IconProbe size={13} /><span>Bornes</span>
            </button>
          </div>
        </>}

        {/* ── Anotações: Comentário e Texto (iguais no 3D, GRAFCET e IEC) — grupo primário */}
        {(isCanvas || isCmd || mode === 'grafcet') && <><span className="tb-sep" /><div className="tb-primary contents">{annotationTools}</div>
          <ToolMenu label="Alinhar" title="Alinhar e distribuir a seleção" icon={<IconAlignLeft size={13} />} sections={alignSections} className="dc-align-menu" /></>}

        {/* ── Extras da vista: sempre botões no PC e no tablet; em barra apertada ficam só os ícones */}
        {viewExtraItems.length > 0 && (
          (
              <>
                {isCmd && <>
                  <span className="tb-sep" />
                  <button type="button" className="dc-tool-btn !gap-1.5" disabled={cmdRunning} onClick={() => useCommandsUi.getState().emit('examples')} title="Abrir um esquema de exemplo IEC (arranque, inversão, emergência, pneumática…)"><IconTemplates size={13} /><span>Exemplos</span></button>
                  <button type="button" className="dc-tool-btn !gap-1.5" disabled={cmdRunning} onClick={() => useCommandsUi.getState().emit('import')} title="Importar FluidSIM (.ct) ou CADe SIMU (.cad)"><IconImport size={13} /><span>Importar</span></button>
                  <button type="button" className="dc-tool-btn !gap-1.5" disabled={!cmdHasParts || cmdRunning} onClick={() => useCommandsUi.getState().emit('clear')} title="Apagar todo o esquema (pode desfazer)"><IconErase size={13} /><span>Limpar</span></button>
                </>}
                {mode === 'schematic' && <>
                  <span className="tb-sep" />
                  <button type="button" className="dc-tool-btn !gap-1.5" onClick={() => setComponentTableOpen(true)} title="Criar e posicionar componentes por tabela ou Excel">
                    <IconGrid size={13} /><span>Tabela</span>
                  </button>
                </>}
                {mode === 'grafcet' && <>
                  <span className="tb-sep" />
                  <button type="button" className="dc-tool-btn grafcet-signals-tool !gap-1.5" aria-label="Tabela de entradas, saídas e memórias" onClick={() => useGrafcetUi.getState().emit('openSignals')} title="Declarar e organizar os sinais usados nas sugestões"><IconTag size={13} /><span>Variáveis</span></button>
                </>}
              </>
            )
        )}
        {/* ── Sequência, modelos e ficheiros GRAFCET: à vista no PC e no tablet (sem menu «Mais») */}
        {mode === 'grafcet' && (
          <><span className="tb-sep" /><ToolInlineItems label="Sequência, modelos e ficheiros GRAFCET" sections={toolSections.slice(1).filter(section => section.id !== 'annotations' && section.id !== 'align-tools')} className="dc-grafcet-tools-inline" /></>
        )}
        {mode === 'ladder' && <>
          <span className="tb-sep" />
          <LadderVariablesMenu onOpenTable={() => {
            setLadderSection('Projeto')
            useLadderUi.getState().emit('openVariables')
          }} />
          <nav className="dc-seg" aria-label="Secções do editor Ladder">
            {([
              ['Projeto', IconProjects], ['Biblioteca', IconTag], ['Dispositivos', IconCube],
              ['Diagnóstico', IconShield], ['Configurações', IconGrid],
            ] as const).map(([name, Icon]) => (
              <button key={name} type="button" onClick={() => setLadderSection(name)}
                className={`dc-tool-btn !gap-1.5 ${ladderSection === name ? 'dc-tool-active' : ''}`}
                aria-current={ladderSection === name ? 'page' : undefined}
                title={name} aria-label={`Ladder: ${name}`}>
                <Icon size={14} /><span>{name}</span>
              </button>
            ))}
          </nav>
        </>}

        <div className="flex-1 min-w-[8px]" />

        {/* ── Estado: diagnóstico da vista (e, no Ladder, a sincronização com o GRAFCET) */}
            {mode === 'ladder' && ladderGrafcetStatus !== 'none' && (() => {
              const synced = ladderGrafcetStatus === 'synced'
              const blocked = ladderGrafcetStatus === 'blocked'
              const label = synced ? 'GRAFCET sincronizado' : blocked ? 'GRAFCET com erros' : 'GRAFCET desatualizado'
              const title = synced
                ? 'Abrir o GRAFCET — a parte gerada do Ladder está sincronizada.'
                : blocked
                  ? 'Abrir o GRAFCET — corrige os erros para atualizar o Ladder gerado.'
                  : 'Abrir o GRAFCET — a sequência mudou; atualiza o Ladder na barra do GRAFCET.'
              const Icon = synced ? IconCheck : IconWarning
              const tone = synced ? 'is-ok' : blocked ? 'is-error' : 'is-warn'
              return (
                <button
                  type="button"
                  className={`dc-status-chip ${tone}`}
                  onClick={() => setMode('grafcet')}
                  title={title}
                  aria-label={label + '. ' + title}
                >
                  <Icon size={12} />
                  <span>{label}</span>
                </button>
              )
            })()}
          {!demo && viewDiagSummary && (mode === 'schematic' || mode === 'commands' || mode === 'ladder') && (
            <button
              type="button"
              className={`dc-status-chip grafcet-validation ${viewDiagSummary.status === 'error' ? 'is-error' : viewDiagSummary.status === 'warning' ? 'is-warn' : 'is-ok'}`}
              title={viewDiagSummary.status === 'ok' ? 'Sem problemas nesta vista' : 'Abrir diagnóstico'}
              onClick={() => {
                if (mode === 'ladder') window.dispatchEvent(new CustomEvent('dcsimu:open-diagnostics', { detail: 'ladder' }))
                else if (mode === 'commands' || mode === 'schematic') window.dispatchEvent(new CustomEvent('dcsimu:open-diagnostics', { detail: mode }))
              }}
            >
              {viewDiagSummary.status === 'error'
                ? <><IconWarning size={12} /><span>{viewDiagSummary.errors} erro{viewDiagSummary.errors === 1 ? '' : 's'}</span></>
                : viewDiagSummary.status === 'warning'
                ? <><IconWarning size={12} /><span>{viewDiagSummary.warnings} aviso{viewDiagSummary.warnings === 1 ? '' : 's'}</span></>
                : <><IconCheck size={12} /><span>Tudo OK</span></>}
            </button>
          )}
        {mode === 'grafcet' && (
              <button
                type="button"
                className={`dc-status-chip grafcet-validation ${grafcetErrorCount ? 'is-error' : grafcetIssues.length ? 'is-warn' : 'is-ok'}`}
                title={grafcetIssues.length ? 'Abrir diagnóstico do programa' : 'Estrutura GRAFCET válida'}
                onClick={() => useGrafcetUi.getState().emit('openDiagnostics')}
              >
                {grafcetErrorCount
                  ? <><IconWarning size={12} /><span>{grafcetErrorCount} erro{grafcetErrorCount === 1 ? '' : 's'}</span></>
                  : grafcetIssues.length
                  ? <><IconWarning size={12} /><span>{grafcetIssues.length} aviso{grafcetIssues.length === 1 ? '' : 's'}</span></>
                  : <><IconCheck size={12} /><span>GRAFCET validado</span></>}
              </button>
        )}

        {/* ── Navegação da vista */}
        {mode === 'grafcet' && <>
          <span className="tb-sep" />
          <div className="dc-seg" role="group" aria-label="Navegação do diagrama">
            <button type="button" className="dc-tool-btn !gap-1.5" onClick={() => useGrafcetUi.getState().emit('fitView')}
              title="Ajustar o diagrama à janela (Ctrl+0 / duplo clique no fundo)" aria-label="Ajustar o diagrama à janela">
              <IconFocus size={13} /><span>Ajustar</span>
            </button>
            <button type="button" className={`dc-tool-btn !gap-1.5 ${grafcetMinimap ? 'dc-tool-active' : ''}`} aria-pressed={grafcetMinimap}
              onClick={() => useGrafcetUi.getState().emit('toggleMinimap')}
              title="Mostrar/ocultar o minimapa (canto inferior esquerdo)" aria-label="Minimapa">
              <IconGrid size={13} /><span>Mapa</span>
            </button>
          </div>
        </>}
        {isCanvas && <>
          <span className="tb-sep" />
          <div className="dc-seg" role="group" aria-label="Navegação da vista">
            {mode === 'schematic' && <button
              type="button"
              className={`dc-tool-btn !gap-1.5 ${gridDragEnabled ? 'dc-tool-active' : ''}`}
              aria-pressed={gridDragEnabled}
              onClick={() => setGridDragEnabled(!gridDragEnabled)}
              title="Arrastar a malha e os componentes como uma vista, sem alterar a ferramenta selecionada. Clique outra vez para sair."
            ><IconHand size={13} /><span>Arrastar malha</span></button>}
            {sel > 0 && <button type="button" className="dc-tool-btn !gap-1.5" onClick={() => requestCanvasAction('focusSelection')} title="Enquadrar a vista na seleção (F)" aria-label="Enquadrar a vista na seleção">
              <IconFocus size={13} /><span>Enquadrar</span>
            </button>}
            <button
              type="button"
              className={`dc-tool-btn !gap-1.5 ${viewLocked ? 'is-on' : ''}`}
              aria-pressed={viewLocked}
              onClick={() => useSimStore.getState().toggleViewLocked()}
              title={viewLocked ? 'Desbloquear vista (orbit/pan/zoom)' : 'Bloquear vista (impede orbit/pan/zoom)'}
              aria-label={viewLocked ? 'Desbloquear vista' : 'Bloquear vista'}
            >
              {viewLocked ? <IconLock size={13} /> : <IconUnlock size={13} />}
              <span>{viewLocked ? 'Vista bloqueada' : 'Bloquear vista'}</span>
            </button>
          </div>
        </>}

        {/* ── Atalhos de teclado do simulador ativo (todas as vistas) */}
        <span className="tb-sep" />
        <ShortcutsButton scope={mode} onClick={() => (mode === 'grafcet' ? useGrafcetUi.getState().emit('openShortcuts') : mode === 'monitor' ? setMonitorHelp(true) : requestShortcuts(mode))}
          title={`Atalhos de teclado — ${mode === 'schematic' ? 'Esquema 2D/3D' : mode === 'ladder' ? 'Ladder' : mode === 'grafcet' ? 'GRAFCET' : mode === 'commands' ? 'Esquema IEC' : 'Monitor'} (?)`} />

        {/* ── Vista: malha e zoom — grupo comum a todos os módulos */}
        {viewControls && <ViewControls {...viewControls} />}

        {/* ── Caixa-preta (diagnóstico por medição) */}
        <button
          onClick={() => useSimStore.getState().toggleBlackBox()}
          className={`dc-blackbox-toggle dc-tool-btn !gap-1.5 ${simBlackBox ? '!border-amber-300 !bg-amber-50 !text-amber-700' : ''}`}
          title="Modo caixa-preta: esconde o ladder e força diagnóstico por medição"
        >
          <IconLock size={13} /><span>{simBlackBox ? 'Caixa-preta ON' : 'Caixa-preta'}</span>
        </button>
      </div>}
      {componentTableOpen && <ComponentTableDialog onClose={() => setComponentTableOpen(false)} />}
      {monitorHelp && <ShortcutHelp open editor="Monitor" onClose={() => setMonitorHelp(false)} extra={[VIEW_SHORTCUTS]} />}
      {pdfOpen && (
        <Suspense fallback={null}>
          <ExportPdfDialog open={pdfOpen} onClose={() => setPdfOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
