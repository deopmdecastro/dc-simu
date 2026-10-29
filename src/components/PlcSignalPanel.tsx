import { useMemo } from 'react'
import { useSimStore, type VirtualInputMode } from '../store/useSimStore'
import { plcIoRows } from '../ladder/plcIo'
import VirtualInputButton, { readPlcSim } from './VirtualInputButton'

const MODE_LABEL: Record<VirtualInputMode, string> = { latch: 'INT', push: 'NO', nc: 'NC' }
const MODE_NAME: Record<VirtualInputMode, string> = {
  latch: 'Interruptor (liga/desliga, mantém)',
  push: 'Botão de pressão NO (1 só enquanto premido)',
  nc: 'Botão NC (repousa a 1, premido = 0)',
}

/**
 * Simulador de sinais de um PLC do esquema (como o painel de E/S virtual, mas
 * sobre os bornes reais): cada entrada física tem um botão para injetar sinal
 * e o tipo de contacto (INT/NO/NC). O sinal soma-se ao que chega pelos cabos,
 * como um botão virtual ligado entre L+ e o borne. As saídas Q mostram o
 * resultado (precisam do PLC alimentado).
 */
export default function PlcSignalPanel({ plcId, compact = false }: { plcId: string; compact?: boolean }) {
  const plc = useSimStore((s) => s.components.find((c) => c.id === plcId))
  const components = useSimStore((s) => s.components)
  const wires = useSimStore((s) => s.wires)
  const tags = useSimStore((s) => s.tags)
  const activePlcId = useSimStore((s) => s.activePlcId)
  const table = useSimStore((s) => s.runtime.plcRuntime[plcId]?.table ?? (s.activePlcId === plcId ? s.runtime.table : undefined)) ?? {}
  const simInputs = useSimStore((s) => readPlcSim(s, plcId).inputs)
  const simModes = useSimStore((s) => readPlcSim(s, plcId).modes)
  const sim = { inputs: simInputs, modes: simModes }
  const setMode = useSimStore((s) => s.setPlcSimInputMode)
  const clear = useSimStore((s) => s.clearPlcSimInputs)
  const stopped = useSimStore((s) => s.sim.runState === 'stopped')
  const tagList = plc && (plc.id === activePlcId || !activePlcId) ? tags : []
  const inputs = useMemo(() => plcIoRows(plc, 'I', table, wires, components, tagList), [plc, table, wires, components, tagList])
  const outputs = useMemo(() => plcIoRows(plc, 'Q', table, wires, components, tagList), [plc, table, wires, components, tagList])
  if (!plc) return null
  const powered = plc.state.powered !== false
  const injected = inputs.filter((row) => sim.inputs[row.address]).length
  const hasSignals = Object.values(sim.inputs).some(Boolean)

  return <section className={`vio-panel plc-sim ${compact ? 'is-compact' : ''} ${stopped ? 'is-stopped' : ''}`} aria-label={`Simulador de sinais de ${plc.ref}`} data-plc-sim={plc.id}>
    {stopped && <p className="vio-note is-info" role="status"><b>STOP.</b> Pode acionar os sinais: cada alteração calcula um ciclo. Use <b>Run</b> para execução contínua.</p>}
    {!powered && <p className="vio-note" role="status"><b>{plc.ref} sem alimentação</b> (L+/M): o programa lê os sinais, mas as saídas ficam a 0 até ligar a alimentação.</p>}
    <div className="vio-cols">
      <div className="vio-col">
        <div className="vio-head">
          <strong>Simular sinais · {plc.ref} <em className={injected ? 'is-live' : ''}>{injected}/{inputs.length}</em></strong>
          <span className="vio-actions">
            <button type="button" className="vio-clear" onClick={() => clear(plc.id)} disabled={!hasSignals} title="Repor todos os sinais simulados (NC volta a 1)">Limpar</button>
          </span>
        </div>
        <div className="vio-inputs">
          {inputs.map((row) => {
            const mode: VirtualInputMode = sim.modes[row.address] ?? 'latch'
            const wired = row.connectionState === 'connected'
            return <div key={row.address} className="vio-cell plc-sim-cell" data-plc-input={row.address}>
              <VirtualInputButton plcId={plc.id} address={row.address} className="vio-switch"
                title={`${row.address}${row.name ? ` · ${row.name}` : ''}`}>
                <i /><b>{row.address}</b><small className={row.name ? 'vio-name' : 'vio-name-empty'}>{row.name || '—'}</small>
              </VirtualInputButton>
              <div className="vio-cell-foot">
                <select className={`vio-mode plc-sim-mode is-${mode}`} value={mode} aria-label={`Tipo de contacto de ${row.address}`}
                  title={`${row.address}: ${MODE_NAME[mode]}`} onChange={(event) => setMode(plc.id, row.address, event.target.value as VirtualInputMode)}>
                  {(Object.keys(MODE_LABEL) as VirtualInputMode[]).map((key) => <option key={key} value={key} title={MODE_NAME[key]}>{MODE_LABEL[key]}</option>)}
                </select>
                <span className={`plc-sim-state ${row.on ? 'is-on' : ''}`} title={wired ? `Cabo: ${row.destinations.join(', ')}` : 'Sem cabo neste borne — só o sinal simulado'}>
                  <b>{row.on ? '1' : '0'}</b>{wired && <small>cabo</small>}
                </span>
              </div>
            </div>
          })}
          {!inputs.length && <small className="vio-empty">Este PLC não tem entradas digitais.</small>}
        </div>
        <p className="vio-hint"><kbd>Clique</kbd> injeta o sinal · o seletor <b>INT</b>/<b>NO</b>/<b>NC</b> escolhe o tipo de contacto · o sinal soma-se ao dos cabos</p>
      </div>
      <div className="vio-col">
        <div className="vio-head"><strong>Saídas (Q) <em className={outputs.some((row) => row.on) ? 'is-live' : ''}>{outputs.filter((row) => row.on && powered).length} ativa(s)</em></strong></div>
        <div className="vio-outputs">
          {outputs.map((row) => <span key={row.address} className={`vio-lamp ${row.on && powered ? 'is-on' : ''}`} data-plc-output={row.address} title={row.name ? `${row.address} · ${row.name}` : row.address}>
            <i /><b>{row.address}</b>{row.name && <small>{row.name}</small>}
          </span>)}
          {!outputs.length && <small className="vio-empty">Este PLC não tem saídas digitais.</small>}
        </div>
      </div>
    </div>
  </section>
}
