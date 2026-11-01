import { useCommandsUi } from './commandsUi'
import { CommandsIoPanel, useCommandsTransport } from './CommandsPanels'
import { SimTransportControls } from '../ui/toolbarKit'
import { IconChevronDown, IconSchematic } from '../ui/icons'

/**
 * Painel de Entradas/Saídas no fundo do Esquema IEC (telemóvel) — o mesmo modelo do GRAFCET (`GrafcetSimDock`):
 * a barra com o estado e o transporte fica sempre visível e o botão abre/fecha o corpo com as entradas e saídas.
 */
export default function CommandsSimDock() {
  const open = useCommandsUi((s) => s.dockOpen)
  const toggle = useCommandsUi((s) => s.toggleDock)
  const { rt, paused, running, stopped, onPlay, onPause, onStop, onReset, onStep } = useCommandsTransport()
  const label = running ? 'RUN' : stopped ? 'STOP' : 'PAUSA'

  return (
    <section className={`gdock cmd-dock ${open ? 'is-open' : 'is-collapsed'}`} aria-label="Entradas e saídas do esquema IEC" data-cmd-sim-dock>
      <div className="gdock-bar">
        <div className="gdock-tabs" role="tablist" aria-label="Simulação do esquema IEC">
          <button type="button" role="tab" aria-selected={open} aria-label="Entradas/Saídas" className={open ? 'is-active' : ''} onClick={() => { if (!open) toggle() }}>
            <IconSchematic size={12} /><span className="gdock-tab-label">Entradas/Saídas</span><span className="gdock-tab-short" aria-hidden="true">E/S</span>
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
            aria-label={open ? 'Recolher as entradas e saídas' : 'Abrir as entradas e saídas'} title={open ? 'Recolher as entradas e saídas' : 'Abrir entradas e saídas'}>
            <IconChevronDown size={14} className={open ? '' : 'is-flipped'} />
          </button>
        </div>
      </div>
      {open && <div className="gdock-body cmd-dock-body" role="tabpanel" aria-label="Entradas e saídas"><CommandsIoPanel /></div>}
    </section>
  )
}
