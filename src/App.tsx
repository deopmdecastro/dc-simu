import { useEffect, useState } from 'react'
import Toolbar, { type ViewMode } from './components/Toolbar'
import Sidebar from './components/Sidebar'
import LadderEditor from './ladder/LadderEditor'
import SchematicView from './schematic/SchematicView'
import MonitorPanel from './components/MonitorPanel'
import Panel3D from './three/Panel3D'
import { useSimStore } from './store/useSimStore'

export default function App() {
  const [mode, setMode] = useState<ViewMode>('schematic')
  const [showLadder, setShowLadder] = useState(true)
  const loadScenario = useSimStore((s) => s.loadScenario)
  const stop = useSimStore((s) => s.stop)
  const diagnostics = useSimStore((s) => s.sim.diagnostics)
  const scanCount = useSimStore((s) => s.sim.scanCount)

  useEffect(() => {
    loadScenario('direct-start')
    // roda a simulação automaticamente: as botoeiras já respondem na hora
    setTimeout(() => useSimStore.getState().play(), 60)
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const errors = diagnostics.filter((d) => d.level === 'error').length
  const warnings = diagnostics.filter((d) => d.level === 'warning').length

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100">
      <Toolbar mode={mode} setMode={setMode} />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          {mode === 'schematic' && <SchematicView />}
          {mode === 'panel3d' && <Panel3D />}
          {mode === 'monitor' && <MonitorPanel />}
        </div>
        {mode !== 'monitor' && (
          <div className={`${showLadder ? 'w-[460px]' : 'w-9'} shrink-0 border-l border-neutral-800 bg-neutral-950 transition-all`}>
            {showLadder ? (
              <div className="h-full flex flex-col">
                <button onClick={() => setShowLadder(false)} className="text-[10px] text-neutral-500 hover:text-white py-1 border-b border-neutral-800">
                  recolher ladder ▸
                </button>
                <LadderEditor />
              </div>
            ) : (
              <button onClick={() => setShowLadder(true)} className="w-full h-full text-[10px] text-neutral-500 hover:text-white" title="Mostrar ladder">
                ◂
              </button>
            )}
          </div>
        )}
      </div>
      <footer className="flex items-center gap-3 px-3 py-1 border-t border-neutral-800 bg-neutral-900 text-[11px] text-neutral-500">
        <span>DC-Simu v2 — simulador de comandos elétricos industriais</span>
        <span className="text-neutral-700">|</span>
        <span className={errors ? 'text-red-400' : 'text-neutral-500'}>{errors} erro(s)</span>
        <span className={warnings ? 'text-amber-400' : 'text-neutral-500'}>{warnings} aviso(s)</span>
        <span className="ml-auto font-mono">scan #{scanCount}</span>
      </footer>
    </div>
  )
}
