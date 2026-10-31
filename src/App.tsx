import { useCommandsDiagnostics, useGrafcetDiagnostics, useLadderDiagnostics, useSchematicDiagnostics } from './diagnostics/viewDiagnostics'
import { CommandsDiagnosticsPanel, SchematicDiagnosticsPanel, ViewDiagnosticsTag } from './diagnostics/DiagnosticsUi'
import GrafcetStatusCard from './components/GrafcetStatusCard'
import { isTabletDesktop } from './ui/device'
import { IconGrafcet, IconLayers, IconSchematic, IconWarning, IconXCircle } from './ui/icons'
import CollapsedPanelRail from './components/CollapsedPanelRail'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { uiConfirm } from './ui/dialogs'
import InstallApp from './components/InstallApp'
import Toolbar, { type ViewMode } from './components/Toolbar'
import SplitViewDialog from './components/SplitViewDialog'
import { useSplitView } from './ui/splitViewStore'
import Sidebar from './components/Sidebar'
import SidePanelHeader from './components/SidePanelHeader'
import ProjectObjects from './components/ProjectObjects'
import SimulationDock from './components/SimulationDock'
import type { LadderSection } from './ladder/LadderSections'
import { ComponentEditorDock } from './components/ComponentViewEditor'
import RouteLoading from './ui/RouteLoading'

const SchematicView = lazy(() => import('./schematic/SchematicView'))
const LadderEditor = lazy(() => import('./ladder/LadderEditor'))
const GrafcetEditor = lazy(() => import('./grafcet/GrafcetEditor'))
const CommandsEditor = lazy(() => import('./commands/CommandsEditor'))
const CommandsSidebar = lazy(() => import('./commands/CommandsSidebar'))
const CommandsIoPanel = lazy(() => import('./commands/CommandsPanels').then((m) => ({ default: m.CommandsIoPanel })))
const CommandsObjects = lazy(() => import('./commands/CommandsPanels').then((m) => ({ default: m.CommandsObjects })))
const MonitorPanel = lazy(() => import('./components/MonitorPanel'))
import PlanLocked from './saas/PlanLocked'
import { useCan } from './saas/usePlan'
import { useSimStore } from './store/useSimStore'
import { allowedViews, coerceView, defaultView } from './project/kind'
import { hasGeneratedLadder } from './grafcet/ladderSync'
import { useSimUi } from './ui/simUi'
import { useCommandsUi } from './commands/commandsUi'

/** Cabeçalho das folhas em ecrã inteiro (só aparece em telemóveis): título + botão «Fechar» bem visível. */
function SheetHeader({ title, onClose, side = 'right' }: { title: string; onClose: () => void; side?: 'left' | 'right' }) {
  return <SidePanelHeader eyebrow={side === 'left' ? 'BIBLIOTECA' : 'PROJETO'} title={title} side={side} onToggle={onClose} toggleLabel={`Recolher ${title}`} />
}

export default function App({ onBack, demo = false, onEnterEditor }: { onBack: () => void; /** Modo demonstração (landing): vistas do editor com controlos de simulação apenas. */ demo?: boolean; /** CTA para abrir o editor completo (autenticação). */ onEnterEditor?: () => void }) {
  const projectKind = useSimStore((s) => s.projectKind)
  const canLadder = useCan('ladder')
  const canGrafcet = useCan('grafcet')
  const ladderRungs = useSimStore((s) => s.ladder.rungs)
  const projectFiles = useSimStore((s) => s.projectFiles)
  // Um projeto só GRAFCET ganha o editor Ladder quando tem Ladder gerado
  // (gravado no projeto, logo mantém-se ao guardar e reabrir).
  const hasLadderProgram = useMemo(() => hasGeneratedLadder(), [ladderRungs, projectFiles])
  const viewsAll = allowedViews(projectKind, hasLadderProgram)
  // Demonstração: apenas as vistas de projeto (o Monitor de diagnóstico fica para o editor completo).
  const views = demo ? viewsAll.filter((v) => v !== 'monitor') : viewsAll
  const splitEnabled = useSplitView((s) => s.enabled)
  const splitLeft = useSplitView((s) => s.left)
  const splitRight = useSplitView((s) => s.right)
  const splitOrientation = useSplitView((s) => s.orientation)
  const [mode, setModeRaw] = useState<ViewMode>(() => {
    const kind = useSimStore.getState().projectKind
    const hasLadder = hasGeneratedLadder()
    if (demo) return coerceView('schematic', kind, hasLadder)
    try {
      const saved = localStorage.getItem('dcsimu:workspace:view') as ViewMode | 'panel3d' | null
      // O antigo "Painel 3D" passou a ser a Visualização 3D do Esquema.
      if (saved === 'panel3d') { localStorage.setItem('dc-simu:schematic-canvas-mode:v1', '3d'); return coerceView('schematic', kind, hasLadder) }
      return saved && ['schematic', 'ladder', 'grafcet', 'commands', 'monitor'].includes(saved) ? coerceView(saved, kind, hasLadder) : defaultView(kind)
    } catch { return defaultView(kind) }
  })
  // Só vistas permitidas pelo tipo de projeto (Tudo / Ladder / GRAFCET) — mais o
  // Ladder gerado a partir do GRAFCET. Lê o estado fresco: a geração pode acabar de correr.
  const setMode = (next: ViewMode) => setModeRaw(coerceView(next, useSimStore.getState().projectKind, hasGeneratedLadder()))
  useEffect(() => { setModeRaw((current) => coerceView(current, projectKind, hasLadderProgram)) }, [projectKind, hasLadderProgram])
  const [ladderSection, setLadderSection] = useState<LadderSection>(() => {
    try {
      const saved = localStorage.getItem('dcsimu:workspace:ladder-section') as LadderSection | null
      return saved && ['Projeto', 'Biblioteca', 'Dispositivos', 'Diagnóstico', 'Configurações'].includes(saved) ? saved : 'Projeto'
    } catch { return 'Projeto' }
  })
  // Paridade tablet↔desktop: tablets (≥900 px ou landscape ≥768) usam painéis
  // laterais fixos como no desktop. Só telemóveis / ecrãs estreitos usam gavetas.
  const compactWorkspace = () => !isTabletDesktop() && (window.innerWidth < 768 || window.matchMedia('(pointer: coarse) and (max-height: 520px) and (max-width: 1100px)').matches)
  const [showLadder, setShowLadder] = useState(() => useSimUi.getState().schematic || !compactWorkspace())
  const [rightTab, setRightTab] = useState<'grafcet' | 'signals' | 'objects' | 'diagnostics'>(() => useSimUi.getState().schematic ? 'signals' : 'grafcet')
  const [showLibrary, setShowLibrary] = useState(() => !compactWorkspace())
  const compact = compactWorkspace()

  // Reaplica o layout ao atravessar o breakpoint (ex.: redimensionar a janela
  // ou rodar o tablet), sem interferir nos painéis enquanto o modo não muda.
  useEffect(() => {
    let compact = compactWorkspace()
    const onResize = () => {
      const nextCompact = compactWorkspace()
      if (nextCompact === compact) return
      compact = nextCompact
      setShowLibrary(!nextCompact)
      setShowLadder(!nextCompact)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [panelSizes, setPanelSizes] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dcsimu:workspace:panels') ?? '{}')
      return { sidebar: Math.min(460, Math.max(220, Number(saved.sidebar) || 300)), ladder: Math.min(720, Math.max(320, Number(saved.ladder) || 380)) }
    } catch { return { sidebar: 300, ladder: 380 } }
  })
  useEffect(() => {
    try { localStorage.setItem('dcsimu:workspace:panels', JSON.stringify(panelSizes)) } catch { /* navegação privada */ }
  }, [panelSizes])
  const [resizing, setResizing] = useState<{ target: 'sidebar' | 'ladder'; startX: number; startSize: number } | null>(null)
  const editingComponent = useSimStore((s) => !!s.viewOrientationEditor)
  const schematicSimPanelOn = showLadder && rightTab === 'signals' && !editingComponent
  // O botão representa a folha de E/S visível; RUN/STOP não depende da folha aberta.
  useEffect(() => { useSimUi.getState().setSimPanel('schematic', schematicSimPanelOn) }, [schematicSimPanelOn])
  const diagnostics = useSimStore((s) => s.sim.diagnostics)
  const scanCount = useSimStore((s) => s.sim.scanCount)
  const plcRunState = useSimStore((s) => s.sim.runState)
  // Na vista Comandos a barra de estado mostra a simulação do esquema de comandos.
  const cmdRunning = useCommandsUi((s) => s.rt.running)
  const cmdPaused = useCommandsUi((s) => s.paused)
  const cmdFault = useCommandsUi((s) => !!s.rt.fault)
  const runState = mode === 'commands' ? (cmdRunning ? (cmdPaused ? 'paused' : 'running') : 'stopped') : plcRunState
  const faults = useSimStore((s) => s.sim.faults)
  const currentProjectName = useSimStore((s) => s.currentProjectName)
  const dirty = useSimStore((s) => s.dirty)

  // Mantém o utilizador no editor onde estava, sem alterar o projeto.
  useEffect(() => {
    try {
      localStorage.setItem('dcsimu:workspace:view', mode)
      localStorage.setItem('dcsimu:workspace:ladder-section', ladderSection)
    } catch { /* localStorage indisponível */ }
  }, [mode, ladderSection])

  useEffect(() => {
    if (!showLibrary && !showLadder) return
    const closeDrawers = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && compactWorkspace()) {
        setShowLibrary(false)
        setShowLadder(false)
      }
    }
    window.addEventListener('keydown', closeDrawers)
    return () => window.removeEventListener('keydown', closeDrawers)
  }, [showLibrary, showLadder])

  // Evita perder trabalho ao atualizar/fechar a aba com alterações pendentes.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || (window as unknown as { __DCSIMU_ALLOW_UNLOAD__?: boolean }).__DCSIMU_ALLOW_UNLOAD__) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  // Interceta atalhos de recarga do navegador (F5, Ctrl+R, Cmd+R) quando há alterações pendentes,
  // exibindo a caixa de diálogo com o visual oficial da plataforma DC-SIMU (na cara do site).
  useEffect(() => {
    const handleReloadKey = async (e: KeyboardEvent) => {
      const isReload = e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))
      if (isReload && dirty) {
        e.preventDefault()
        e.stopPropagation()
        const reloadConfirmed = await uiConfirm('É possível que as alterações não tenham sido efetuadas.', {
          title: 'Quer atualizar o site?',
          confirmLabel: 'Recarregar',
          cancelLabel: 'Cancelar',
          danger: true,
        })
        if (reloadConfirmed) {
          ;(window as unknown as { __DCSIMU_ALLOW_UNLOAD__?: boolean }).__DCSIMU_ALLOW_UNLOAD__ = true
          useSimStore.setState({ dirty: false })
          window.location.reload()
        }
      }
    }
    window.addEventListener('keydown', handleReloadKey, true)
    return () => window.removeEventListener('keydown', handleReloadKey, true)
  }, [dirty])

  useEffect(() => {
    if (!resizing) return
    const onMove = (e: PointerEvent) => {
      const delta = e.clientX - resizing.startX
      if (resizing.target === 'sidebar') {
        setPanelSizes((current) => ({ ...current, sidebar: Math.min(460, Math.max(220, resizing.startSize + delta)) }))
      } else {
        setPanelSizes((current) => ({ ...current, ladder: Math.min(720, Math.max(320, resizing.startSize - delta)) }))
      }
    }
    const onUp = () => setResizing(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    document.body.classList.add('is-resizing')
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('is-resizing')
    }
  }, [resizing])

  // A barra de estado mostra o diagnóstico da vista aberta (o mesmo da etiqueta e do painel «Diagnóstico»).
  const schematicDiag = useSchematicDiagnostics()
  const commandsDiag = useCommandsDiagnostics()
  const ladderDiag = useLadderDiagnostics()
  const grafcetDiag = useGrafcetDiagnostics()
  const viewDiag = mode === 'commands' ? commandsDiag : mode === 'ladder' ? ladderDiag : mode === 'grafcet' ? grafcetDiag : mode === 'schematic' ? schematicDiag : null
  const errors = viewDiag ? viewDiag.errors : diagnostics.filter((d) => d.level === 'error').length
  const warnings = viewDiag ? viewDiag.warnings : diagnostics.filter((d) => d.level === 'warning').length
  const simErrors = diagnostics.filter((d) => d.level === 'error').length
  /** Onde abrir o detalhe: painel lateral no 3D Realista/Esquema IEC, separador próprio no Ladder/GRAFCET, Monitor no resto. */
  const openDiagnostics = () => {
    if (mode === 'schematic' || mode === 'commands') { if (compact) setShowLibrary(false); setRightTab('diagnostics'); setShowLadder(true) }
    else if (mode === 'ladder' || mode === 'grafcet') window.dispatchEvent(new CustomEvent('dcsimu:open-diagnostics', { detail: mode }))
    else setMode('monitor')
  }
  const hasErrorState = mode === 'commands' ? cmdFault : simErrors > 0 || Object.values(faults ?? {}).some(Boolean)

  // estados do PLC — STOP → READY → RUN → PAUSE → ERROR
  const state = hasErrorState
    ? { label: 'ERROR', cls: 'bg-state-error text-white', dot: 'bg-white' }
    : runState === 'running'
      ? { label: 'RUN', cls: 'bg-state-run text-white', dot: 'bg-white' }
      : runState === 'paused'
        ? { label: 'PAUSE', cls: 'bg-state-pause text-white', dot: 'bg-white' }
        : { label: 'STOP', cls: 'bg-state-stop text-white', dot: 'bg-white' }

  return (
    <div className={`h-full ${demo ? 'w-full dc-demo-root' : 'w-screen'} flex flex-col bg-surface-app text-ink-900 overflow-hidden`}>
      <Toolbar onBack={onBack} mode={mode} setMode={setMode} views={views} ladderSection={ladderSection} setLadderSection={setLadderSection} demo={demo} onEnterEditor={onEnterEditor}
        schematicSimPanelOn={schematicSimPanelOn}
        onToggleSchematicSim={() => {
          if (schematicSimPanelOn) setShowLadder(false)
          else { if (compact) setShowLibrary(false); setRightTab('signals'); setShowLadder(true) }
        }}
        onOpenLibrary={() => { if (compact) setShowLadder(false); setShowLibrary(true) }}
        onOpenGrafcet={() => { if (compact) setShowLibrary(false); setRightTab('grafcet'); setShowLadder(true) }}
        onOpenObjects={() => { if (compact) setShowLibrary(false); setRightTab('objects'); setShowLadder(true) }} />
      <div className="flex-1 flex min-h-0 dc-workspace relative" data-component-editing={mode === 'schematic' && editingComponent ? 'true' : 'false'}>
        {(mode === 'schematic' || mode === 'commands') && !demo && (showLibrary || showLadder) && (
          <button
            type="button"
            className="dc-mobile-backdrop"
            aria-label="Fechar painéis laterais"
            onClick={() => { setShowLibrary(false); setShowLadder(false) }}
          />
        )}
        {(mode === 'schematic' || mode === 'commands') && showLibrary && !demo && (
          <>
            <div className="mobile-library-panel relative shrink-0 flex flex-col" style={compact ? undefined : { width: panelSizes.sidebar }}>
              {mode === 'commands'
                ? <Suspense fallback={<RouteLoading label="A carregar a biblioteca…" />}><CommandsSidebar width={compact ? '100%' : panelSizes.sidebar} onCollapse={() => setShowLibrary(false)} /></Suspense>
                : <Sidebar width={compact ? '100%' : panelSizes.sidebar} quickAddOnPick={compact} onComponentAdded={() => compact && setShowLibrary(false)} onCollapse={() => setShowLibrary(false)} />}
            </div>
            <div
              className="dc-resize-handle"
              onPointerDown={(e) => {
                e.preventDefault()
                setResizing({ target: 'sidebar', startX: e.clientX, startSize: panelSizes.sidebar })
              }}
              title="Arraste para redimensionar a biblioteca"
              aria-label="Redimensionar biblioteca"
            />
          </>
        )}
        {(mode === 'schematic' || mode === 'commands') && !showLibrary && !demo && <CollapsedPanelRail className="pn-shell-rail" label="Biblioteca" side="left" icon={<IconLayers size={15} />} onExpand={() => { if (compact) setShowLadder(false); setShowLibrary(true) }} />}
        <div className="flex-1 min-w-0 flex flex-col relative">
          {splitEnabled ? (
            <SplitWorkspace
              left={splitLeft}
              right={splitRight}
              orientation={splitOrientation}
              demo={demo}
              canLadder={canLadder}
              canGrafcet={canGrafcet}
              ladderSection={ladderSection}
              setLadderSection={setLadderSection}
              setMode={setMode}
              views={views}
              showLibrary={showLibrary}
              setShowLibrary={setShowLibrary}
            />
          ) : (
          <Suspense fallback={<RouteLoading label="A carregar a vista…" />}>
            {mode === 'schematic' && <SchematicView libraryCollapsed={demo || !showLibrary} />}
            {mode === 'ladder' && !canLadder && !demo && <PlanLocked feature="ladder" />}
            {mode === 'grafcet' && !canGrafcet && !demo && <PlanLocked feature="grafcet" />}
            {mode === 'ladder' && (canLadder || demo) && <LadderEditor section={ladderSection} setSection={setLadderSection} onOpenSchematic={views.includes('schematic') ? () => { setShowLibrary(true); setMode('schematic') } : undefined} />}
            {mode === 'grafcet' && (canGrafcet || demo) && <GrafcetEditor full={!demo} onOpenLadder={() => setMode('ladder')} />}
            {mode === 'commands' && <CommandsEditor demo={demo} />}
            {mode === 'monitor' && <MonitorPanel />}
          </Suspense>
          )}
        </div>
        {mode === 'schematic' && !demo && <ComponentEditorDock />}
        {!demo && mode !== 'monitor' && mode !== 'ladder' && mode !== 'grafcet' && !(mode === 'schematic' && editingComponent) && (
          <div
            className={`${showLadder ? 'min-w-[320px]' : 'w-12'} mobile-grafcet-panel ${showLadder ? 'mobile-grafcet-open' : 'mobile-grafcet-closed'} shrink-0 border-l border-line bg-surface-panel flex flex-col transition-all`}
            style={showLadder && !compact ? { width: panelSizes.ladder } : undefined}
          >
            {showLadder ? (
              <>
                <SheetHeader title="GRAFCET, sinais, objetos e diagnóstico" side="right" onClose={() => setShowLadder(false)} />
                <div className="dc-dock-tabs" role="tablist" aria-label="Painel direito">
                  <button role="tab" aria-selected={rightTab === 'grafcet'} className={rightTab === 'grafcet' ? 'is-on' : ''} onClick={() => setRightTab('grafcet')} aria-label="GRAFCET" title="GRAFCET"><IconGrafcet size={13} /><span>GRAFCET</span></button>
                  <button role="tab" aria-selected={rightTab === 'signals'} className={rightTab === 'signals' ? 'is-on' : ''} onClick={() => setRightTab('signals')} aria-label="Entradas/Saídas" title="Entradas/Saídas"><IconSchematic size={13} /><span>E/S</span></button>
                  <button role="tab" aria-selected={rightTab === 'objects'} className={rightTab === 'objects' ? 'is-on' : ''} onClick={() => setRightTab('objects')} aria-label="Objetos" title="Objetos"><IconLayers size={13} /><span>Objetos</span></button>
                  <button role="tab" aria-selected={rightTab === 'diagnostics'} aria-label="Diagnóstico" className={rightTab === 'diagnostics' ? 'is-on' : ''} onClick={() => setRightTab('diagnostics')} data-dock-tab="diagnostics" title="Diagnóstico: erros e avisos desta vista"><span>Diagnóstico</span><ViewDiagnosticsTag view={mode === 'commands' ? 'commands' : 'schematic'} compact /></button>
                </div>
                <Suspense fallback={<RouteLoading label="A carregar o GRAFCET…" />}>
                  {rightTab === 'diagnostics'
                    ? (mode === 'commands' ? <CommandsDiagnosticsPanel /> : <SchematicDiagnosticsPanel />)
                    : rightTab === 'grafcet'
                    ? <GrafcetEditor onOpenEditor={views.includes('grafcet') ? () => setMode('grafcet') : undefined} />
                    : mode === 'commands'
                      ? rightTab === 'signals' ? <CommandsIoPanel /> : <CommandsObjects />
                      : rightTab === 'signals' ? <SimulationDock embedded /> : <ProjectObjects />}
                </Suspense>
              </>
            ) : (
              <CollapsedPanelRail className="pn-shell-rail" label="GRAFCET, sinais e objetos" side="right" icon={<IconLayers size={15} />} onExpand={() => { if (compact) setShowLibrary(false); setShowLadder(true) }} />
            )}
          </div>
        )}
        {!demo && mode !== 'monitor' && mode !== 'ladder' && mode !== 'grafcet' && !(mode === 'schematic' && editingComponent) && showLadder && (
          <div
            className="dc-resize-handle dc-resize-handle-left"
            onPointerDown={(e) => {
              e.preventDefault()
              setResizing({ target: 'ladder', startX: e.clientX, startSize: panelSizes.ladder })
            }}
            title="Arraste para redimensionar o editor GRAFCET"
            aria-label="Redimensionar editor GRAFCET"
          />
        )}
      </div>

      {/* ============================================== barra de estado */}
      {!demo && <SplitViewDialog availableViews={views} />}
      {!demo && <footer className="dc-statusbar shrink-0 flex items-center gap-2 px-3 h-[26px] border-t border-line bg-surface-rail text-[11px] text-ink-500 select-none">
        <span className="dc-sb-brand text-ink-400 font-semibold tracking-wide">DC·SIMU <span className="font-normal">v4.6</span></span>
        <span className="dc-sb-sep h-3.5 w-px bg-line" />
        <span className="dc-sb-project truncate max-w-[280px]" title="Ctrl+S guarda · Ctrl+Shift+O reabre a lista de projetos guardados neste navegador">
          {currentProjectName ? (
            <>
              <span className="text-ink-400">Projeto:</span> <span className="text-ink-900 font-medium">{currentProjectName}</span>
              {dirty && <span className="ml-1 text-state-pause" title="Alterações ainda não guardadas">•</span>}
            </>
          ) : (
            <span className="text-ink-400">Projeto sem nome</span>
          )}
        </span>
        <span className="dc-sb-sep h-3.5 w-px bg-line" />
        <button
          className={`inline-flex items-center gap-1.5 h-[18px] px-2 rounded-[4px] font-mono text-[10px] font-bold tracking-[0.08em] ${state.cls}`}
          title={`Estado do PLC: ${state.label}${hasErrorState ? ' — existem erros/falhas ativos' : ''}`}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${state.dot}`} />
          {state.label}
        </button>
        <span className="dc-sb-diag ml-1 inline-flex items-center gap-1">
          <button
            type="button"
            onClick={openDiagnostics}
            className={`${errors ? 'text-state-error font-semibold' : 'text-ink-400'} hover:underline focus-visible:underline`}
            title="Abrir o diagnóstico desta vista"
            aria-label={`${errors} erros; abrir o diagnóstico`}
          ><IconXCircle size={11} /><span>{errors}<span className="dc-sb-diag-label"> erro(s)</span></span></button>
          <span className="text-ink-300" aria-hidden="true">·</span>
          <button
            type="button"
            onClick={openDiagnostics}
            className={`${warnings ? 'text-state-pause font-semibold' : 'text-ink-400'} hover:underline focus-visible:underline`}
            title="Abrir o diagnóstico desta vista"
            aria-label={`${warnings} avisos; abrir o diagnóstico`}
          ><IconWarning size={11} /><span>{warnings}<span className="dc-sb-diag-label"> aviso(s)</span></span></button>
        </span>
        <span className="ml-auto inline-flex items-center gap-2 min-w-0">
          <GrafcetStatusCard onOpen={() => setMode('grafcet')} />
          <span className="dc-sb-scan font-mono tabular-nums text-ink-500 shrink-0">scan #{scanCount}</span>
        </span>
        <InstallApp />
      </footer>}
    </div>
  )
}


const VIEW_LABELS: Record<ViewMode, string> = {
  schematic: '3D Realista',
  ladder: 'Ladder',
  grafcet: 'GRAFCET',
  commands: 'Esquema IEC',
  monitor: 'Monitor',
}

function SplitWorkspace({
  left,
  right,
  orientation,
  demo,
  canLadder,
  canGrafcet,
  ladderSection,
  setLadderSection,
  setMode,
  views,
  showLibrary,
  setShowLibrary,
}: {
  left: { mode: ViewMode; chartId?: string }
  right: { mode: ViewMode; chartId?: string }
  orientation: 'horizontal' | 'vertical'
  demo: boolean
  canLadder: boolean
  canGrafcet: boolean
  ladderSection: LadderSection
  setLadderSection: (s: LadderSection) => void
  setMode: (m: ViewMode) => void
  views: ViewMode[]
  showLibrary: boolean
  setShowLibrary: (v: boolean) => void
}) {
  const charts = useSimStore((s) => s.grafcet.charts ?? [])
  const chartLabel = (id?: string) => {
    if (!id) return ''
    const c = charts.find((x) => x.id === id)
    return c ? (c.title || c.name || id) : id
  }
  const renderPane = (pane: { mode: ViewMode; chartId?: string }, side: 'left' | 'right') => {
    const title =
      pane.mode === 'grafcet' && pane.chartId
        ? `${VIEW_LABELS.grafcet} · ${chartLabel(pane.chartId)}`
        : VIEW_LABELS[pane.mode]
    return (
      <div className="split-view-pane-wrap" data-split-side={side}>
        <div className="split-view-pane-bar">
          <strong>{title}</strong>
        </div>
        <div className="split-view-pane-body">
          <Suspense fallback={<RouteLoading label="A carregar…" />}>
            {pane.mode === 'schematic' && <SchematicView libraryCollapsed />}
            {pane.mode === 'ladder' && !canLadder && !demo && <PlanLocked feature="ladder" />}
            {pane.mode === 'grafcet' && !canGrafcet && !demo && <PlanLocked feature="grafcet" />}
            {pane.mode === 'ladder' && (canLadder || demo) && (
              <LadderEditor
                section={ladderSection}
                setSection={setLadderSection}
                onOpenSchematic={views.includes('schematic') ? () => { setShowLibrary(true); setMode('schematic') } : undefined}
              />
            )}
            {pane.mode === 'grafcet' && (canGrafcet || demo) && (
              <GrafcetEditor full={!demo} onOpenLadder={() => setMode('ladder')} lockedChartId={pane.chartId} />
            )}
            {pane.mode === 'commands' && <CommandsEditor demo={demo} />}
            {pane.mode === 'monitor' && <MonitorPanel />}
          </Suspense>
        </div>
      </div>
    )
  }
  return (
    <div className={`split-view-root is-${orientation}`}>
      {renderPane(left, 'left')}
      {renderPane(right, 'right')}
    </div>
  )
}

