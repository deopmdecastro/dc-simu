import { useSimStore } from '../store/useSimStore'
import Select from '../ui/Select'
import { SimTransportControls } from '../ui/toolbarKit'

/** Controlos da simulação dentro do painel do GRAFCET (sempre à mão no telemóvel). */
export default function GrafcetSimBar() {
  const { sim, play, pause, stop, step, reset, setSpeed, setMode } = useSimStore()
  const running = sim.runState === 'running'
  const stopped = sim.runState === 'stopped'
  const label = running ? 'Em execução' : stopped ? 'Parado' : 'Em pausa'
  return (
    <div className="grafcet-simbar" role="group" aria-label="Controlo da simulação">
      <div className="grafcet-simbar-state">
        <span className={`grafcet-simbar-dot ${running ? 'is-running' : stopped ? '' : 'is-paused'}`} aria-hidden="true" />
        <strong className={running ? 'is-running' : stopped ? '' : 'is-paused'}>{label}</strong>
        <small className="grafcet-simbar-cycle">ciclo #{sim.scanCount}</small>
      </div>
      <SimTransportControls
        running={running}
        stopped={stopped}
        onPlay={play}
        onPause={pause}
        onStep={step}
        onStop={stop}
        onReset={reset}
        variant="bar"
        className="grafcet-simbar-buttons"
      />
      <div className="grafcet-simbar-opts">
        <Select value={sim.mode} onChange={(e) => setMode(e.target.value as any)} className="dc-select" title="Modo de execução" aria-label="Modo de execução">
          <option value="realtime">Tempo real</option>
          <option value="turbo">Turbo</option>
          <option value="step">Passo a passo</option>
        </Select>
        <Select value={sim.speed} onChange={(e) => setSpeed(Number(e.target.value))} className="dc-select" title="Velocidade" aria-label="Velocidade da simulação">
          {[0.25, 0.5, 1, 2, 4, 10].map((v) => (
            <option key={v} value={v}>{v}×</option>
          ))}
        </Select>
      </div>
    </div>
  )
}
