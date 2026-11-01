import { useCommandsUi } from './commandsUi'
import { useCommandsTransport } from './CommandsPanels'
import RightDockPanel, { RIGHT_DOCK_TITLE } from '../components/RightDockPanel'
import { SimTransportControls } from '../ui/toolbarKit'
import { IconChevronDown, IconLayers } from '../ui/icons'

/**
 * Painel inferior do Esquema IEC (telemóvel): o painel lateral completo (GRAFCET, E/S, Objetos e Diagnóstico),
 * o mesmo da coluna da direita no tablet/PC. A barra com o estado e o transporte fica sempre visível
 * (modelo do `GrafcetSimDock`) e o botão abre/fecha o corpo.
 */
export default function CommandsSimDock({ onOpenGrafcet }: { onOpenGrafcet?: () => void }) {
  const open = useCommandsUi((s) => s.dockOpen)
  const toggle = useCommandsUi((s) => s.toggleDock)
  const tab = useCommandsUi((s) => s.dockTab)
  const setTab = useCommandsUi((s) => s.setDockTab)
  const { rt, paused, running, stopped, onPlay, onPause, onStop, onReset, onStep } = useCommandsTransport()
  const label = running ? 'RUN' : stopped ? 'STOP' : 'PAUSA'

  return (
    <section className={`gdock cmd-dock ${open ? 'is-open' : 'is-collapsed'}`} aria-label={RIGHT_DOCK_TITLE} data-cmd-sim-dock>
      <div className="gdock-bar">
        <div className="gdock-tabs" role="tablist" aria-label="Painel do esquema IEC">
          <button type="button" role="tab" aria-selected={open} aria-label="Painel lateral" className={open ? 'is-active' : ''} onClick={() => { if (!open) toggle() }}>
            <IconLayers size={12} /><span className="gdock-tab-label">Painel</span><span className="gdock-tab-short" aria-hidden="true">Painel</span>
          </button>
        </div>
        <div className="gdock-actions">
          <span className={`gdock-state ${running ? 'is-running' : paused && rt.running ? 'is-paused' : ''}`} role="status"
            title={rt.running ? `${(rt.time / 1000).toFixed(1)} s` : 'Parado — prima Run'}>
            <i aria-hidden="true" />
            <span className="gdock-state-label">{label}</span>
          </span>
          <SimTransportControls running={running} stopped={stopped} onPlay={onPlay} onPause={onPause} onStep={onStep} onStop={onStop} onReset={onReset} variant="dock" className="gdock-transport" />
          <button type="button" className="gdock-toggle" onClick={toggle} aria-expanded={open}
            aria-label={open ? 'Recolher o painel' : 'Abrir o painel'} title={open ? 'Recolher o painel' : `Abrir: ${RIGHT_DOCK_TITLE}`}>
            <IconChevronDown size={14} className={open ? '' : 'is-flipped'} />
          </button>
        </div>
      </div>
      {open && (
        <div className="gdock-body cmd-dock-body" role="tabpanel" aria-label={RIGHT_DOCK_TITLE}>
          <RightDockPanel mode="commands" tab={tab} onTab={setTab} onOpenGrafcet={onOpenGrafcet} />
        </div>
      )}
    </section>
  )
}
