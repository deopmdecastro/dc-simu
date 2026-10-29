import { useMemo } from 'react'
import { useSimStore } from '../store/useSimStore'
import { isProgrammablePlc } from '../ladder/plcPrograms'
import { stepNumberOf } from '../grafcet/engine'
import PlcSignalPanel from './PlcSignalPanel'
import VirtualIoPanel from './VirtualIoPanel'
import Select from '../ui/Select'
import { IconClose, IconPlay } from '../ui/icons'
import SidePanelHeader from './SidePanelHeader'
import { SimTransportControls } from '../ui/toolbarKit'

/**
 * Painel «Simulação» do Esquema 2D/3D — o mesmo conceito do botão «Simulação» do GRAFCET:
 * controlos RUN/STOP, sinais do PLC (INT/NO/NC) ou E/S virtuais e o GRAFCET ativo,
 * sem sair do esquema.
 */
export default function SimulationDock({ onClose, embedded = false }: { onClose?: () => void; embedded?: boolean }) {
  const components = useSimStore((s) => s.components)
  const selectedId = useSimStore((s) => (s.selectedComponentIds.length === 1 ? s.selectedComponentIds[0] : null))
  const activePlcId = useSimStore((s) => s.activePlcId)
  const setActivePlc = useSimStore((s) => s.setActivePlc)
  const sim = useSimStore((s) => s.sim)
  const { play, pause, stop, step, reset } = useSimStore.getState()
  const grafcet = useSimStore((s) => s.grafcet)
  const active = useSimStore((s) => s.grafcetRuntime.active)
  const plcs = useMemo(() => components.filter(isProgrammablePlc), [components])
  const selectedPlc = plcs.find((plc) => plc.id === selectedId)
  const plc = selectedPlc ?? plcs.find((item) => item.id === activePlcId) ?? plcs[0]
  const running = sim.runState === 'running', stopped = sim.runState === 'stopped'
  const activeSteps = useMemo(() => active.map((id) => {
    const index = grafcet.steps.findIndex((item) => item.id === id)
    const item = grafcet.steps[index]
    return item ? { id, number: stepNumberOf(item, index), comment: (item.description || item.comment || '').trim() } : null
  }).filter(Boolean) as Array<{ id: string; number: string; comment: string }>, [active, grafcet.steps])

  return (
    <section className={`schematic-sim-dock${embedded ? ' is-embedded' : ''}`} aria-label="Entradas e saídas" data-sim-signals-panel>
      {embedded ? (
        <div className="sim-embed-bar">
          <span className={`gdock-state ${running ? 'is-running' : stopped ? '' : 'is-paused'}`} role="status" title={`Ciclo #${sim.scanCount}`}>
            <i aria-hidden="true" /><span className="gdock-state-label">{running ? 'RUN' : stopped ? 'STOP' : 'PAUSA'}</span>
            <small className="sim-embed-cycle">ciclo #{sim.scanCount}</small>
          </span>
          <SimTransportControls running={running} stopped={stopped} onPlay={play} onPause={pause} onStep={step} onStop={stop} onReset={reset} variant="dock" className="gdock-transport" />
        </div>
      ) : (<>
      <SidePanelHeader
        className="schematic-sim-dock-head"
        eyebrow="ESQUEMA"
        title="Simulação"
        icon={<IconPlay size={16} />}
        side="right"
        detail={<span className={`schematic-sim-dock-state ${running ? 'is-running' : stopped ? '' : 'is-paused'}`}>{running ? 'RUN' : stopped ? 'STOP' : 'PAUSA'} · ciclo #{sim.scanCount}</span>}
        actions={onClose && <button type="button" className="schematic-sim-dock-close" onClick={onClose} title="Fechar a simulação" aria-label="Fechar a simulação"><IconClose size={13} /></button>}
      />
      <SimTransportControls
        running={running}
        stopped={stopped}
        onPlay={play}
        onPause={pause}
        onStep={step}
        onStop={stop}
        onReset={reset}
        variant="dock"
        className="schematic-sim-dock-controls"
      />
      </>)}
      <div className="schematic-sim-dock-body">
        {plc ? <>
          {plcs.length > 1 && (
            <label className="schematic-sim-dock-plc">
              <span>PLC</span>
              <Select value={plc.id} onChange={(event) => setActivePlc(event.target.value)} className="dc-select" aria-label="PLC a simular">
                {plcs.map((item) => <option key={item.id} value={item.id}>{item.ref} · {item.label || item.type}</option>)}
              </Select>
            </label>
          )}
          <PlcSignalPanel plcId={plc.id} compact />
        </> : <VirtualIoPanel compact />}
        {grafcet.steps.length > 0 && (
          <section className="schematic-sim-dock-grafcet" aria-label="GRAFCET ativo">
            <h4>GRAFCET · {(grafcet.name || '').trim() || 'sem nome'}</h4>
            {activeSteps.length
              ? <ul>{activeSteps.map((item) => <li key={item.id}><b>X{item.number}</b>{item.comment && <span>{item.comment}</span>}</li>)}</ul>
              : <p>Nenhuma etapa ativa{stopped ? ' — prima Run.' : '.'}</p>}
          </section>
        )}
      </div>
    </section>
  )
}
