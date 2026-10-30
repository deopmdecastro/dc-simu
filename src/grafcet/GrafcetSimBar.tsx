import { useSimStore } from '../store/useSimStore'
import Select from '../ui/Select'
import { SimTransportControls } from '../ui/toolbarKit'

/** Controlos da simulação dentro do painel do GRAFCET (sempre à mão no telemóvel). */
export default function GrafcetSimBar() {
  // Subscrições granulares (antes: store inteira → re-render a cada tick mesmo
  // quando o painel estava noutra vista). As ações são estáveis na store.
  const runState = useSimStore((s) => s.sim.runState)
  const scanCount = useSimStore((s) => s.sim.scanCount)
  const mode = useSimStore((s) => s.sim.mode)
  const speed = useSimStore((s) => s.sim.speed)
  const play = useSimStore((s) => s.play)
  const pause = useSimStore((s) => s.pause)
  const stop = useSimStore((s) => s.stop)
  const step = useSimStore((s) => s.step)
  const reset = useSimStore((s) => s.reset)
  const setSpeed = useSimStore((s) => s.setSpeed)
  const setMode = useSimStore((s) => s.setMode)
  const sim = { runState, scanCount, mode, speed }
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
        variant="dock"
        className="grafcet-simbar-buttons"
      />
      <details className="grafcet-simbar-settings"><summary>Opções</summary><div className="grafcet-simbar-opts">
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
      </div></details>
    </div>
  )
}
