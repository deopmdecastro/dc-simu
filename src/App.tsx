import { useEffect, useState } from 'react'
import Toolbar, { type ViewMode } from './components/Toolbar'
import Sidebar from './components/Sidebar'
import LadderEditor from './ladder/LadderEditor'
import GrafcetEditor from './grafcet/GrafcetEditor'
import SchematicView from './schematic/SchematicView'
import MonitorPanel from './components/MonitorPanel'
import Panel3D from './three/Panel3D'
import { useSimStore } from './store/useSimStore'
import { getLastOpenedProjectName, loadAutosave, saveAutosave } from './utils/persistence'

const AUTOSAVE_INTERVAL_MS = 15_000

export default function App() {
  const [mode, setMode] = useState<ViewMode>('schematic')
  const [showLadder, setShowLadder] = useState(true)
  const [panelSizes, setPanelSizes] = useState({ sidebar: 300, ladder: 440 })
  const [resizing, setResizing] = useState<{ target: 'sidebar' | 'ladder'; startX: number; startSize: number } | null>(null)
  const stop = useSimStore((s) => s.stop)
  const diagnostics = useSimStore((s) => s.sim.diagnostics)
  const scanCount = useSimStore((s) => s.sim.scanCount)
  const runState = useSimStore((s) => s.sim.runState)
  const faults = useSimStore((s) => s.sim.faults)
  const currentProjectName = useSimStore((s) => s.currentProjectName)
  const dirty = useSimStore((s) => s.dirty)

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

  // ------------------------------------------------------------- arranque
  useEffect(() => {
    const st = useSimStore.getState()
    const lastOpened = getLastOpenedProjectName()
    if (lastOpened && st.loadProjectByName(lastOpened)) {
      return () => stop()
    }

    const autosave = loadAutosave()
    if (autosave?.json) {
      st.loadJSON(autosave.json)
      st.pushEvent('info', `Autosave de ${new Date(autosave.savedAt).toLocaleString('pt-PT')} restaurado.`)
      return () => stop()
    }

    st.newProject()
    return () => stop()
  }, [])

  // ------------------------------------------------------------- autosave
  useEffect(() => {
    const id = window.setInterval(() => {
      const st = useSimStore.getState()
      if (st.dirty) saveAutosave(st.saveJSON())
    }, AUTOSAVE_INTERVAL_MS)
    const onUnload = () => {
      const st = useSimStore.getState()
      if (st.dirty) saveAutosave(st.saveJSON())
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])

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
    <div className="h-screen w-screen flex flex-col bg-surface-app text-ink-900 overflow-hidden">
      <Toolbar mode={mode} setMode={setMode} />
      <div className="flex-1 flex min-h-0">
        {mode !== 'ladder' && (
          <>
            <Sidebar width={panelSizes.sidebar} />
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
        <div className="flex-1 min-w-0 flex flex-col">
          {mode === 'schematic' && <SchematicView />}
          {mode === 'ladder' && <LadderEditor />}
          {mode === 'panel3d' && <Panel3D />}
          {mode === 'monitor' && <MonitorPanel />}
        </div>
        {mode !== 'monitor' && mode !== 'ladder' && (
          <div
            className={`${showLadder ? 'min-w-[320px]' : 'w-9'} shrink-0 border-l border-line bg-surface-panel flex flex-col transition-all`}
            style={showLadder ? { width: panelSizes.ladder } : undefined}
          >
            {showLadder ? (
              <>
                <button
                  onClick={() => setShowLadder(false)}
                  className="dc-tab self-end !h-7 !px-2 text-ink-400"
                  title="Recolher o editor GRAFCET"
                >
                  ▸
                </button>
                <GrafcetEditor />
              </>
            ) : (
              <button
                onClick={() => setShowLadder(true)}
                className="w-full h-full dc-tab text-ink-400"
                title="Mostrar o editor GRAFCET"
              >
                ◂ GRAFCET
              </button>
            )}
          </div>
        )}
        {mode !== 'monitor' && showLadder && (
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
        <span className="text-ink-400 font-semibold tracking-wide">DC-SIMU <span className="font-normal">v2.2</span></span>
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
        <span className="ml-1">
          <span className={errors ? 'text-state-error font-semibold' : 'text-ink-400'}>{errors} erro(s)</span>
          <span className="text-ink-300"> · </span>
          <span className={warnings ? 'text-state-pause font-semibold' : 'text-ink-400'}>{warnings} aviso(s)</span>
        </span>
        <span className="ml-auto font-mono tabular-nums text-ink-500">scan #{scanCount}</span>
      </footer>
    </div>
  )
}
