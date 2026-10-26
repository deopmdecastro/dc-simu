import { useSimStore } from '../store/useSimStore'
import { BREAK_MODE_LABEL, formatTraceValue, type LadderBreakMode } from './ladderDebug'
import type { LadderRung } from '../types'

/**
 * Separador «Depuração» do Ladder (LADDER-SIM-02): passo a passo por ciclo de scan,
 * pontos de paragem por network e rasto do último ciclo, percorrível network a network.
 */
export default function LadderDebugPanel({ rungs }: { rungs: LadderRung[] }) {
  const breakpoints = useSimStore((s) => s.ladderBreakpoints)
  const setBreakpoint = useSimStore((s) => s.setLadderBreakpoint)
  const clearBreakpoints = useSimStore((s) => s.clearLadderBreakpoints)
  const enabled = useSimStore((s) => s.ladderBreakEnabled)
  const setEnabled = useSimStore((s) => s.setLadderBreakEnabled)
  const hit = useSimStore((s) => s.ladderBreakHit)
  const cursor = useSimStore((s) => s.ladderTraceCursor)
  const setCursor = useSimStore((s) => s.setLadderTraceCursor)
  const stepScan = useSimStore((s) => s.ladderStepScan)
  const play = useSimStore((s) => s.play)
  const runState = useSimStore((s) => s.sim.runState)
  const scanCount = useSimStore((s) => s.sim.scanCount)
  const rawTrace = useSimStore((s) => s.runtime.rungTrace)
  // Só as networks da Main (os OBs de arranque/cíclicos também passam no scan, mas não estão nesta vista).
  const ids = new Map(rungs.map((r, i) => [r.id, i]))
  const trace = (rawTrace ?? []).filter((t) => ids.has(t.rungId))
  const at = cursor !== null && cursor >= 0 && cursor < (rawTrace?.length ?? 0) ? (rawTrace ?? [])[cursor] : null
  const atPos = at ? trace.findIndex((t) => t.rungId === at.rungId) : -1
  const go = (pos: number) => {
    const entry = trace[Math.max(0, Math.min(trace.length - 1, pos))]
    if (!entry) return
    setCursor((rawTrace ?? []).indexOf(entry))
    document.getElementById(`rung-${entry.rungId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const nameOf = (id: string) => { const i = ids.get(id) ?? -1; const r = rungs[i]; return `Network ${i + 1}${r?.name ? ` · ${r.name}` : ''}` }
  const bpList = Object.entries(breakpoints).filter(([id]) => ids.has(id))
  const running = runState === 'running'

  return (
    <div className="ladder-debug" aria-label="Depuração do programa Ladder">
      <div className="ladder-debug-bar" role="toolbar" aria-label="Passo a passo">
        <button type="button" className="dc-btn" onClick={stepScan} title="Pausa (se estiver em RUN) e executa exatamente um ciclo de scan">Passo (1 ciclo)</button>
        <button type="button" className="dc-btn" onClick={() => go(atPos <= 0 ? 0 : atPos - 1)} disabled={!trace.length || atPos <= 0} title="Network anterior no rasto do último ciclo">◀ Network</button>
        <button type="button" className="dc-btn" onClick={() => go(atPos < 0 ? 0 : atPos + 1)} disabled={!trace.length || atPos >= trace.length - 1} title="Network seguinte no rasto do último ciclo">Network ▶</button>
        <button type="button" className="dc-btn dc-btn-primary" onClick={play} disabled={running} title="Continuar em RUN até ao próximo ponto de paragem">Continuar</button>
        <label className="ladder-debug-toggle" title="Desligado: os pontos ficam marcados mas a simulação não para">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Parar nos pontos de paragem
        </label>
        <span className="ladder-debug-scan">{running ? 'Em RUN' : runState === 'paused' ? 'Em pausa' : 'Parado'} · ciclo {scanCount.toLocaleString('pt-PT')}</span>
      </div>
      {hit && ids.has(hit.rungId) && <p className="ladder-debug-hit" role="status">Parou no ponto de paragem da {nameOf(hit.rungId)} ({BREAK_MODE_LABEL[hit.mode]}) no ciclo {hit.scan.toLocaleString('pt-PT')}.</p>}
      <div className="ladder-debug-cols">
        <section className="ladder-debug-col" aria-label="Pontos de paragem">
          <div className="ladder-status-title">Pontos de paragem ({bpList.length}){!!bpList.length && <button type="button" className="ladder-debug-link" onClick={clearBreakpoints}>remover todos</button>}</div>
          {bpList.length ? bpList.map(([id, mode]) => (
            <div className="ladder-debug-bp" key={id}>
              <button type="button" className="ladder-debug-link" onClick={() => document.getElementById(`rung-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{nameOf(id)}</button>
              <select aria-label={`Condição do ponto de paragem da ${nameOf(id)}`} value={mode} onChange={(e) => setBreakpoint(id, e.target.value as LadderBreakMode)}>
                {(Object.keys(BREAK_MODE_LABEL) as LadderBreakMode[]).map((m) => <option key={m} value={m}>{BREAK_MODE_LABEL[m]}</option>)}
              </select>
              <button type="button" className="ladder-debug-link is-danger" onClick={() => setBreakpoint(id, null)} aria-label={`Remover o ponto de paragem da ${nameOf(id)}`}>×</button>
            </div>
          )) : <span className="ladder-status-empty">Sem pontos de paragem. Use o botão ● no cabeçalho de uma network.</span>}
        </section>
        <section className="ladder-debug-col" aria-label="Rasto do último ciclo">
          <div className="ladder-status-title">Rasto do último ciclo</div>
          {trace.length ? <ol className="ladder-debug-trace">
            {trace.map((t, pos) => (
              <li key={t.rungId}>
                <button type="button" className={`ladder-debug-step ${pos === atPos ? 'is-cursor' : ''} ${t.skipped ? 'is-skipped' : t.powered ? 'is-on' : ''}`} onClick={() => go(pos)} aria-current={pos === atPos ? 'step' : undefined}>
                  <b>{nameOf(t.rungId)}</b>
                  <span>{t.skipped ? 'saltada (JMP)' : `RLO = ${t.powered ? 1 : 0}`}{t.jumpedTo ? ` · salta para ${t.jumpedTo}` : ''}</span>
                  {!!Object.keys(t.writes).length && <small>{Object.entries(t.writes).map(([k, v]) => `${k}=${formatTraceValue(v)}`).join(' · ')}</small>}
                </button>
              </li>
            ))}
          </ol> : <span className="ladder-status-empty">Execute um ciclo (Passo ou RUN) para ver o que cada network fez.</span>}
        </section>
      </div>
    </div>
  )
}
