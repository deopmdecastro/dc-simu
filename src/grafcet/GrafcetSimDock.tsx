import { useState, type ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import { isProgrammablePlc } from '../ladder/plcPrograms'
import { SimulationSignals } from '../components/SimulationDock'
import VirtualIoPanel from '../components/VirtualIoPanel'
import { SimTransportControls } from '../ui/toolbarKit'
import { IconChevronDown, IconGrafcet, IconHistory, IconSchematic } from '../ui/icons'
import { useGrafcetUi } from './grafcetBus'

type DockTab = 'io' | 'sequence'
const TAB_KEY = 'dcsimu:grafcet:dock-tab'
const readTab = (): DockTab => { try { return localStorage.getItem(TAB_KEY) === 'sequence' ? 'sequence' : 'io' } catch { return 'io' } }

/**
 * Painel de simulação no fundo do GRAFCET — o mesmo modelo do painel de estado do Ladder:
 * separadores à esquerda (Entradas/Saídas, Sequência), estado e transporte à direita,
 * e o botão «Simulação» da barra abre/fecha o corpo. A barra fica sempre visível para
 * que Run/Stop e o estado estejam à mão no telemóvel.
 */
export default function GrafcetSimDock({ extraBits, activeLabels, sequence }: {
  extraBits: string[]
  /** Números das etapas ativas (ex.: ["0", "3"]). */
  activeLabels: string[]
  /** Painel da sequência (etapas ativas, transições, histórico). */
  sequence: ReactNode
}) {
  const open = useGrafcetUi((s) => s.simVisible)
  const toggle = useGrafcetUi((s) => s.toggleSim)
  const sim = useSimStore((s) => s.sim)
  const table = useSimStore((s) => s.runtime.table)
  const { play, pause, stop, step, reset } = useSimStore.getState()
  const [tab, setTabRaw] = useState<DockTab>(readTab)
  const setTab = (next: DockTab) => { setTabRaw(next); try { localStorage.setItem(TAB_KEY, next) } catch { /* navegação privada */ } }

  const running = sim.runState === 'running'
  const paused = sim.runState === 'paused'
  const stopped = sim.runState === 'stopped'
  const activeBits = Object.entries(table).filter(([key, value]) => value && /^[IQM]\d+\.\d$/.test(key)).length

  const tabs: Array<{ id: DockTab; label: string; short: string; icon: ReactNode; badge: number; live?: boolean }> = [
    { id: 'io', label: 'Entradas/Saídas', short: 'E/S', icon: <IconSchematic size={12} />, badge: activeBits, live: true },
    { id: 'sequence', label: 'Sequência', short: 'Sequência', icon: <IconHistory size={12} />, badge: activeLabels.length },
  ]

  return (
    <section className={`gdock ${open ? 'is-open' : 'is-collapsed'}`} aria-label="Simulação do GRAFCET" data-grafcet-sim-dock>
      <div className="gdock-bar">
        <div className="gdock-tabs" role="tablist" aria-label="Simulação do GRAFCET">
          {tabs.map((item) => (
            <button key={item.id} type="button" role="tab" aria-label={item.label} aria-selected={open && tab === item.id} className={open && tab === item.id ? 'is-active' : ''}
              onClick={() => { setTab(item.id); if (!open) toggle() }}>
              {item.icon}<span className="gdock-tab-label">{item.label}</span><span className="gdock-tab-short" aria-hidden="true">{item.short}</span>
              {item.badge > 0 && <em className={item.live ? 'is-live' : ''}>{item.badge}</em>}
            </button>
          ))}
        </div>
        <div className="gdock-actions">
          <span className={`gdock-state ${running ? 'is-running' : paused ? 'is-paused' : ''}`} role="status"
            title={running ? `Simulação a correr · ciclo #${sim.scanCount}` : paused ? 'Simulação em pausa' : 'Simulação parada — prima Run'}>
            <i aria-hidden="true" />
            <span className="gdock-state-label">{running ? 'RUN' : paused ? 'PAUSA' : 'STOP'}</span>
            {activeLabels.length > 0 && <b className="gdock-state-steps"><IconGrafcet size={11} />X{activeLabels.slice(0, 3).join(' · X')}{activeLabels.length > 3 ? ` +${activeLabels.length - 3}` : ''}</b>}
          </span>
          <SimTransportControls running={running} stopped={stopped} onPlay={play} onPause={pause} onStep={step} onStop={stop} onReset={reset} variant="dock" className="gdock-transport" />
          <button type="button" className="gdock-toggle" onClick={toggle} aria-expanded={open}
            aria-label={open ? 'Recolher a simulação' : 'Abrir a simulação'} title={open ? 'Recolher a simulação' : 'Abrir entradas, saídas e sequência'}>
            <IconChevronDown size={14} className={open ? '' : 'is-flipped'} />
          </button>
        </div>
      </div>
      {open && (
        <div className="gdock-body" role="tabpanel" aria-label={tab === 'io' ? 'Entradas e saídas' : 'Sequência'}>
          {tab === 'io' && <SimulationSignals extraBits={extraBits} />}
          {tab === 'sequence' && sequence}
        </div>
      )}
    </section>
  )
}
