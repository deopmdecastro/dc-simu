import { useSimStore } from '../store/useSimStore'
import Select from '../ui/Select'
import { IconPlay, IconPause, IconStop, IconStep, IconReset } from '../ui/icons'

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
      <div className="grafcet-simbar-buttons">
        <button type="button" onClick={play} disabled={running} className="is-run" title="Iniciar simulação (RUN)"><IconPlay size={15} /><span>Run</span></button>
        <button type="button" onClick={pause} disabled={!running} className="is-pause" title="Pausar"><IconPause size={15} /><span>Pausa</span></button>
        <button type="button" onClick={step} className="is-step" title="Avançar um ciclo"><IconStep size={15} /><span>Passo</span></button>
        <button type="button" onClick={stop} disabled={stopped} className="is-stop" title="Parar (STOP)"><IconStop size={15} /><span>Stop</span></button>
        <button type="button" onClick={reset} className="is-reset" title="Reiniciar a simulação"><IconReset size={15} /><span>Reiniciar</span></button>
      </div>
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
