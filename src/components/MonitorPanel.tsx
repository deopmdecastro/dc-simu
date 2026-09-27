import { useSimStore } from '../store/useSimStore'

function Bit({ label: name, tagName, value, onToggle }: { label: string; tagName?: string | null; value: boolean; onToggle?: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={!onToggle}
      title={tagName ?? undefined}
      className={`flex flex-col px-2 py-1 rounded font-mono text-xs border text-left ${
        value ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300' : 'border-neutral-700 text-neutral-400'
      } ${onToggle ? 'hover:border-cyan-500' : ''}`}
    >
      <div className="flex items-center justify-between w-full">
        <span>{name}</span>
        <span>{value ? 'ON' : 'OFF'}</span>
      </div>
      {tagName && <span className="text-[9px] leading-none mt-0.5 text-neutral-500 truncate">{tagName}</span>}
    </button>
  )
}

export default function MonitorPanel() {
  const table = useSimStore((s) => s.runtime.table)
  const timers = useSimStore((s) => s.runtime.timers)
  const counters = useSimStore((s) => s.runtime.counters)
  const diagnostics = useSimStore((s) => s.sim.diagnostics)
  const events = useSimStore((s) => s.sim.events)
  const measurements = useSimStore((s) => s.sim.measurements)
  const faults = useSimStore((s) => s.sim.faults)
  const components = useSimStore((s) => s.components)
  const setFaults = useSimStore((s) => s.setFaults)
  const tags = useSimStore((s) => s.tags)

  const tagNameFor = (address: string) => {
    const t = tags.find((tt) => tt.address === address)
    return t && t.name !== t.address ? t.name : null
  }

  const group = (prefix: string) =>
    Object.keys(table)
      .filter((k) => k.startsWith(prefix) && !k.startsWith('I0'))
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))

  const toggleBit = (k: string) => {
    // bits M são de memória interna: permitem forçar leitura/escrita para teste
    if (k.startsWith('M')) useSimStore.getState().runtime.table[k] = !table[k]
  }

  return (
    <div className="p-3 flex flex-col gap-4 overflow-y-auto h-full text-neutral-200">
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div>
          <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Entradas físicas</h3>
          <div className="grid grid-cols-2 gap-1">
            {group('I').map((k) => (
              <Bit key={k} label={k} tagName={tagNameFor(k)} value={table[k]} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Saídas do CLP</h3>
          <div className="grid grid-cols-2 gap-1">
            {group('Q').map((k) => (
              <Bit key={k} label={k} tagName={tagNameFor(k)} value={table[k]} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Memórias (clique p/ forçar)</h3>
          <div className="grid grid-cols-2 gap-1">
            {group('M').map((k) => (
              <Bit key={k} label={k} tagName={tagNameFor(k)} value={table[k]} onToggle={() => toggleBit(k)} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Temporizadores e contadores</h3>
          <div className="flex flex-col gap-1 font-mono text-xs">
            {Object.entries(timers).map(([k, t]) => (
              <div key={k} className="flex justify-between border border-neutral-700 rounded px-2 py-1">
                <span>{k} {t.running ? '▶' : t.done ? '✓' : '■'}</span>
                <span>
                  {(t.elapsedMs / 1000).toFixed(1)} s / {(t.presetMs / 1000).toFixed(1)} s
                </span>
              </div>
            ))}
            {Object.entries(counters).map(([k, c]) => (
              <div key={k} className="flex justify-between border border-neutral-700 rounded px-2 py-1">
                <span>{k} {c.done ? '✓' : ''}</span>
                <span>{c.count} / {c.preset}</span>
              </div>
            ))}
            {!Object.keys(timers).length && !Object.keys(counters).length && <div className="text-neutral-600">Nenhum bloco ativo.</div>}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Medições (calculadas do circuito)</h3>
        <div className="grid grid-cols-2 gap-1 text-xs font-mono">
          {measurements.map((m) => (
            <div key={m.id} className={`flex justify-between border rounded px-2 py-1 ${m.ok ? 'border-neutral-700' : 'border-amber-700 text-amber-300'}`}>
              <span>{m.ref} · {m.kind}</span>
              <span>{m.value.toFixed(m.unit === 'm' ? 1 : 2)} {m.unit}</span>
            </div>
          ))}
          {!measurements.length && <div className="text-neutral-600">Sem medições.</div>}
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Injeção de falhas (para treino de diagnóstico)</h3>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {(
            [
              ['phaseLoss', 'Falta de fase'],
              ['shortCircuit', 'Curto entre fases'],
              ['earthLeak', 'Fuga à terra (>30 mA)'],
              ['overvoltage', 'Sobretensão'],
              ['overload', 'Sobrecarga mecânica'],
            ] as Array<[keyof typeof faults, string]>
          ).map(([key, text]) => (
            <label key={key} className={`flex items-center gap-2 border rounded px-2 py-1 ${faults[key] ? 'border-red-600 bg-red-950/30 text-red-200' : 'border-neutral-700'}`}>
              <input type="checkbox" checked={faults[key]} onChange={(e) => setFaults({ [key]: e.target.checked } as any)} />
              {text}
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Dispositivos</h3>
        <div className="flex flex-col gap-1 text-xs font-mono">
          {components
            .filter((c) => ['contactor', 'contactor4p', 'motor', 'relay', 'drive'].includes(c.category) || c.type === 'timerRelayStarDelta')
            .map((c) => (
              <div key={c.id} className="flex justify-between border border-neutral-800 rounded px-2 py-1">
                <span>
                  {c.ref} <span className="text-neutral-600">{c.type}</span>
                </span>
                <span className={c.state.energized || c.state.running ? 'text-emerald-400' : 'text-neutral-500'}>
                  {c.type === 'motor3ph' || c.type === 'motor1ph'
                    ? c.state.running
                      ? `RUN ${String(c.state.direction).toUpperCase()}`
                      : 'STOP'
                    : c.type === 'vfd'
                      ? `${(c.state.frequencyHz ?? 0).toFixed(1)} Hz`
                      : c.state.energized
                        ? c.state.done
                          ? 'ENERGIZADO / T!=0'
                          : 'ENERGIZADO'
                        : 'desenergizado'}
                </span>
              </div>
            ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Diagnósticos</h3>
        {diagnostics.length === 0 && <div className="text-xs text-neutral-600">Nenhum erro ou aviso no circuito atual.</div>}
        <div className="flex flex-col gap-1">
          {diagnostics.map((d) => (
            <div
              key={d.id}
              className={`text-xs px-2 py-1 rounded border ${
                d.level === 'error' ? 'border-red-600 text-red-300 bg-red-950/40' : d.level === 'warning' ? 'border-amber-600 text-amber-300 bg-amber-950/40' : 'border-cyan-700 text-cyan-300 bg-cyan-950/30'
              }`}
            >
              {d.message}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Registro de eventos</h3>
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {events.length === 0 && <div className="text-xs text-neutral-600">Sem eventos.</div>}
          {events.map((e) => (
            <div key={e.id} className="text-[11px] text-neutral-400 font-mono border-l-2 border-neutral-700 pl-2">
              {new Date(e.ts).toLocaleTimeString()} — {e.message}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
