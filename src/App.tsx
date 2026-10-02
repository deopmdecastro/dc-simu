import { IconLayers } from './ui/icons'
import { useEffect, useState } from 'react'
import InstallApp from './components/InstallApp'
import Toolbar, { type ViewMode } from './components/Toolbar'
import Sidebar from './components/Sidebar'
import ProjectObjects from './components/ProjectObjects'
import LadderEditor from './ladder/LadderEditor'
import type { LadderSection } from './ladder/LadderSections'
import GrafcetEditor from './grafcet/GrafcetEditor'
import SchematicView from './schematic/SchematicView'
import { ComponentEditorDock } from './components/ComponentViewEditor'
import MonitorPanel from './components/MonitorPanel'
import { useSimStore } from './store/useSimStore'

export default function App({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('dcsimu:workspace:view') as ViewMode | 'panel3d' | null
      // O antigo "Painel 3D" passou a ser a Visualização 3D do Esquema.
      if (saved === 'panel3d') { localStorage.setItem('dc-simu:schematic-canvas-mode:v1', '3d'); return 'schematic' }
      return saved && ['schematic', 'ladder', 'grafcet', 'monitor'].includes(saved) ? saved : 'schematic'
    } catch { return 'schematic' }
  })
  const [ladderSection, setLadderSection] = useState<LadderSection>(() => {
    try {
      const saved = localStorage.getItem('dcsimu:workspace:ladder-section') as LadderSection | null
      return saved && ['Projeto', 'Biblioteca', 'Dispositivos', 'Diagnóstico', 'Configurações'].includes(saved) ? saved : 'Projeto'
    } catch { return 'Projeto' }
  })
  // Os dois painéis laterais precisam de pelo menos ~1080 px para deixar
  // espaço útil ao canvas; abaixo de 1200 px (tablets, portáteis pequenos) passam a gavetas sobrepostas.
  const compactWorkspace = () => window.innerWidth < 1200 || window.matchMedia('(pointer: coarse) and (max-height: 700px)').matches
  const [showLadder, setShowLadder] = useState(() => !compactWorkspace())
  const [rightTab, setRightTab] = useState<'grafcet' | 'objects'>('grafcet')
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
  const diagnostics = useSimStore((s) => s.sim.diagnostics)
  const scanCount = useSimStore((s) => s.sim.scanCount)
  const runState = useSimStore((s) => s.sim.runState)
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
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
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

  const errors = diagnostics.filter((d) => d.level === 'error').length
  const warnings = diagnostics.filter((d) => d.level === 'warning').length
  const hasErrorState = errors > 0 || Object.values(faults ?? {}).some(Boolean)

  // estados do PLC — STOP → READY → RUN → PAUSE → ERROR
  const state = hasErrorState
    ? { label: 'ERROR', cls: 'bg-state-error text-white', dot: 'bg-white' }
    : runState === 'running'
      ? { label: 'RUN', cls: 'bg-state-run text-white', dot: 'bg-white' }
      : runState === 'paused'
        ? { label: 'PAUSE', cls: 'bg-state-pause text-white', dot: 'bg-white' }
        : { label: 'STOP', cls: 'bg-state-stop text-white', dot: 'bg-white' }

  return (
    <div className="h-full w-screen flex flex-col bg-surface-app text-ink-900 overflow-hidden">
      <Toolbar onBack={onBack} mode={mode} setMode={setMode} ladderSection={ladderSection} setLadderSection={setLadderSection}
        onOpenLibrary={() => { setShowLadder(false); setShowLibrary(true) }}
        onOpenGrafcet={() => { setShowLibrary(false); setShowLadder(true) }} />
      <div className="flex-1 flex min-h-0 dc-workspace relative" data-component-editing={mode === 'schematic' && editingComponent ? 'true' : 'false'}>
        {mode === 'schematic' && (showLibrary || showLadder) && (
          <button
            type="button"
            className="dc-mobile-backdrop"
            aria-label="Fechar painéis laterais"
            onClick={() => { setShowLibrary(false); setShowLadder(false) }}
          />
        )}
        {mode === 'schematic' && showLibrary && (
          <>
            <div className={`mobile-library-panel relative shrink-0 flex flex-col ${compact ? 'dc-mobile-fullscreen-panel' : ''}`} style={compact ? undefined : { width: panelSizes.sidebar }}>
              <Sidebar width={compact ? window.innerWidth : panelSizes.sidebar} quickAddOnPick={compact} onComponentAdded={() => compact && setShowLibrary(false)} />
              <button className="dc-dock-close" onClick={() => setShowLibrary(false)} title="Recolher biblioteca e inspetor" aria-label="Recolher biblioteca e inspetor">◂</button>
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
        <div className="flex-1 min-w-0 flex flex-col relative">
          {mode === 'schematic' && !showLibrary && <button className="dc-dock-open is-left" onClick={() => { setShowLadder(false); setShowLibrary(true) }} title="Mostrar biblioteca e inspetor"><IconLayers size={12} /> Biblioteca</button>}
          {mode === 'schematic' && <SchematicView libraryCollapsed={!showLibrary} />}
          {mode === 'ladder' && <LadderEditor section={ladderSection} setSection={setLadderSection} onOpenSchematic={() => { setShowLibrary(true); setMode('schematic') }} />}
          {mode === 'grafcet' && <GrafcetEditor full />}
          {mode === 'monitor' && <MonitorPanel />}
        </div>
        {mode === 'schematic' && <ComponentEditorDock />}
        {mode !== 'monitor' && mode !== 'ladder' && mode !== 'grafcet' && !(mode === 'schematic' && editingComponent) && (
          <div
            className={`${showLadder ? 'min-w-[320px]' : 'w-9'} mobile-grafcet-panel ${showLadder ? 'mobile-grafcet-open' : 'mobile-grafcet-closed'} ${compact && showLadder ? 'dc-mobile-fullscreen-panel' : ''} shrink-0 border-l border-line bg-surface-panel flex flex-col transition-all`}
            style={showLadder && !compact ? { width: panelSizes.ladder } : undefined}
          >
            {showLadder ? (
              <>
                <button
                  onClick={() => setShowLadder(false)}
                  className="dc-dock-collapse"
                  title="Recolher o painel direito"
                >
                  ▸
                </button>
                <div className="dc-dock-tabs" role="tablist" aria-label="Painel direito">
                  <button role="tab" aria-selected={rightTab === 'grafcet'} className={rightTab === 'grafcet' ? 'is-on' : ''} onClick={() => setRightTab('grafcet')}>GRAFCET</button>
                  <button role="tab" aria-selected={rightTab === 'objects'} className={rightTab === 'objects' ? 'is-on' : ''} onClick={() => setRightTab('objects')}>Objetos</button>
                </div>
                {rightTab === 'grafcet' ? <GrafcetEditor onOpenEditor={() => setMode('grafcet')} /> : <ProjectObjects />}
              </>
            ) : (
              <button
                onClick={() => { setShowLibrary(false); setShowLadder(true) }}
                className="dc-dock-open is-right"
                title="Mostrar GRAFCET e objetos do projeto"
              >
                ◂ GRAFCET · Objetos
              </button>
            )}
          </div>
        )}
        {mode !== 'monitor' && mode !== 'ladder' && mode !== 'grafcet' && !(mode === 'schematic' && editingComponent) && showLadder && (
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
      <footer className="shrink-0 flex items-center gap-2 px-3 h-[26px] border-t border-line bg-surface-rail text-[11px] text-ink-500 select-none">
        <span className="text-ink-400 font-semibold tracking-wide">DC·SIMU <span className="font-normal">v4.6</span></span>
        <span className="h-3.5 w-px bg-line" />
        <span className="truncate max-w-[280px]" title="Ctrl+S guarda · Ctrl+Shift+O reabre a lista de projetos guardados neste navegador">
          {currentProjectName ? (
            <>
              <span className="text-ink-400">Projeto:</span> <span className="text-ink-900 font-medium">{currentProjectName}</span>
              {dirty && <span className="ml-1 text-state-pause" title="Alterações ainda não guardadas">•</span>}
            </>
          ) : (
            <span className="text-ink-400">Projeto sem nome</span>
          )}
        </span>
        <span className="h-3.5 w-px bg-line" />
        <button
          className={`inline-flex items-center gap-1.5 h-[18px] px-2 rounded-[4px] font-mono text-[10px] font-bold tracking-[0.08em] ${state.cls}`}
          title={`Estado do PLC: ${state.label}${hasErrorState ? ' — existem erros/falhas ativos' : ''}`}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${state.dot}`} />
          {state.label}
        </button>
        <span className="ml-1 inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode('monitor')}
            className={`${errors ? 'text-state-error font-semibold' : 'text-ink-400'} hover:underline focus-visible:underline`}
            title="Abrir os diagnósticos no Monitor"
            aria-label={`${errors} erros; abrir diagnósticos no Monitor`}
          >{errors} erro(s)</button>
          <span className="text-ink-300" aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setMode('monitor')}
            className={`${warnings ? 'text-state-pause font-semibold' : 'text-ink-400'} hover:underline focus-visible:underline`}
            title="Abrir os diagnósticos no Monitor"
            aria-label={`${warnings} avisos; abrir diagnósticos no Monitor`}
          >{warnings} aviso(s)</button>
        </span>
        <span className="ml-auto font-mono tabular-nums text-ink-500">scan #{scanCount}</span>
        <InstallApp />
      </footer>
    </div>
  )
}
