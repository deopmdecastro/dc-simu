import { useSimStore } from '../store/useSimStore'
import { IconPlay, IconTimer, IconShield, IconSearch } from '../ui/icons'
import { SCENARIOS } from '../simulation/scenarios'

function Bit({ label: name, tagName, value, onToggle }: { label: string; tagName?: string | null; value: boolean; onToggle?: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={!onToggle}
      title={tagName ?? undefined}
      className={`flex flex-col px-2 py-1 rounded-[5px] font-mono text-xs border text-left transition-colors ${
        value
          ? 'border-emerald-400 bg-state-runbg text-emerald-800 shadow-[inset_0_1px_2px_rgba(22,163,74,.12)]'
          : 'border-line bg-white text-ink-400'
      } ${onToggle ? 'hover:border-brand-400 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between w-full gap-2">
        <span className="font-semibold">{name}</span>
        <span className={`text-[9px] font-bold tracking-wider ${value ? 'text-state-run' : 'text-ink-300'}`}>{value ? 'ON' : 'OFF'}</span>
      </div>
      {tagName && <span className="text-[9px] leading-none mt-0.5 text-ink-400 font-sans truncate">{tagName}</span>}
    </button>
  )
}

function SectionTitle({ children, icon: Icon }: { children: string; icon?: typeof IconTimer }) {
  return (
    <h3 className="flex items-center gap-1.5 dc-panel-title mb-1.5">
      {Icon && <Icon size={11} />}
      {children}
    </h3>
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

  const inputs = group('I')
  const outputs = group('Q')
  const memories = group('M')

  const toggleBit = (k: string) => {
    // bits M são de memória interna: permitem forçar leitura/escrita para teste
    if (!k.startsWith('M')) return
    const st = useSimStore.getState()
    useSimStore.setState({
      runtime: {
        ...st.runtime,
        table: { ...st.runtime.table, [k]: !st.runtime.table[k] },
      },
    })
  }

  return (
    <div className="p-4 flex flex-col gap-5 overflow-y-auto h-full bg-surface-app min-h-0">
      {components.length === 0 && (
        <section className="rounded-md border border-line bg-white p-4 shadow-xs">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-bold text-ink-900">Monitor pronto para simular</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-500">
                Carregue um cenário para ver entradas, saídas, temporizadores, contadores e diagnósticos em tempo real.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SCENARIOS.slice(0, 3).map((scenario) => (
                <button key={scenario.id} className="dc-btn" onClick={() => useSimStore.getState().loadScenario(scenario.id)}>
                  {scenario.name}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div>
          <SectionTitle>Entradas físicas</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-1.5">
            {inputs.map((k) => (
              <Bit key={k} label={k} tagName={tagNameFor(k)} value={table[k]} />
            ))}
            {!inputs.length && <div className="col-span-full text-xs text-ink-400">Nenhuma entrada disponível.</div>}
          </div>
        </div>
        <div>
          <SectionTitle>Saídas do CLP</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-1.5">
            {outputs.map((k) => (
              <Bit key={k} label={k} tagName={tagNameFor(k)} value={table[k]} />
            ))}
            {!outputs.length && <div className="col-span-full text-xs text-ink-400">Nenhuma saída disponível.</div>}
          </div>
        </div>
        <div>
          <SectionTitle>Memórias (clique p/ forçar)</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-1.5">
            {memories.map((k) => (
              <Bit key={k} label={k} tagName={tagNameFor(k)} value={table[k]} onToggle={() => toggleBit(k)} />
            ))}
            {!memories.length && <div className="col-span-full text-xs text-ink-400">Nenhuma memória disponível.</div>}
          </div>
        </div>
        <div>
          <SectionTitle>Temporizadores e contadores</SectionTitle>
          <div className="flex flex-col gap-1 font-mono text-xs">
            {Object.entries(timers).map(([k, t]) => (
              <div key={k} className="flex justify-between items-center border border-line rounded-[5px] px-2 py-1 bg-white">
                <span className="flex items-center gap-1.5">
                  <IconTimer size={11} className="text-ink-400" />
                  {k} {t.running ? <IconPlay size={9} className="text-state-run" /> : t.done ? <span className="text-state-run">✓</span> : <span className="text-ink-300">■</span>}
                </span>
                <span className="tabular-nums text-ink-700">
                  {(t.elapsedMs / 1000).toFixed(1)} / {(t.presetMs / 1000).toFixed(1)} s
                </span>
              </div>
            ))}
            {Object.entries(counters).map(([k, c]) => (
              <div key={k} className="flex justify-between items-center border border-line rounded-[5px] px-2 py-1 bg-white">
                <span className="flex items-center gap-1.5">
                  <IconCounterProxy />
                  {k} {c.done ? <span className="text-state-run">✓</span> : ''}
                </span>
                <span className="tabular-nums text-ink-700">{c.count} / {c.preset}</span>
              </div>
            ))}
            {!Object.keys(timers).length && !Object.keys(counters).length && <div className="text-ink-400">Nenhum bloco ativo.</div>}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle icon={IconSearch}>Medições (calculadas do circuito)</SectionTitle>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-1.5 text-xs font-mono">
          {measurements.map((m) => (
            <div key={m.id} className={`flex justify-between border rounded-[5px] px-2 py-1 bg-white ${m.ok ? 'border-line' : 'border-amber-300 text-amber-800 bg-amber-50'}`}>
              <span className="text-ink-500">{m.ref} · {m.kind}</span>
              <span className="text-ink-900 tabular-nums">{m.value.toFixed(m.unit === 'm' ? 1 : 2)} {m.unit}</span>
            </div>
          ))}
          {!measurements.length && <div className="text-ink-400 font-sans">Sem medições.</div>}
        </div>
      </section>

      <section>
        <SectionTitle icon={IconShield}>Injeção de falhas (para treino de diagnóstico)</SectionTitle>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-1.5 text-xs">
          {(
            [
              ['phaseLoss', 'Falta de fase'],
              ['shortCircuit', 'Curto entre fases'],
              ['earthLeak', 'Fuga à terra (>30 mA)'],
              ['overvoltage', 'Sobretensão'],
              ['overload', 'Sobrecarga mecânica'],
            ] as Array<[keyof typeof faults, string]>
          ).map(([key, text]) => (
            <label
              key={key}
              className={`flex items-center gap-2 border rounded-[5px] px-2 py-1.5 cursor-pointer transition-colors ${
                faults[key] ? 'border-red-300 bg-state-errorbg text-red-800 font-medium' : 'border-line bg-white text-ink-700 hover:border-line-strong'
              }`}
            >
              <input type="checkbox" checked={faults[key]} onChange={(e) => setFaults({ [key]: e.target.checked } as any)} />
              {text}
            </label>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Dispositivos</SectionTitle>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5 text-xs font-mono">
          {components
            .filter((c) => ['contactor', 'contactor4p', 'motor', 'relay', 'drive'].includes(c.category) || c.type === 'timerRelayStarDelta')
            .map((c) => (
              <div key={c.id} className="flex justify-between border border-line rounded-[5px] px-2 py-1 bg-white">
                <span>
                  {c.ref} <span className="text-ink-300">{c.type}</span>
                </span>
                <span className={`font-semibold ${c.state.energized || c.state.running ? 'text-state-run' : 'text-ink-400'}`}>
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
        <SectionTitle>Diagnósticos</SectionTitle>
        {diagnostics.length === 0 && (
          <div className="text-xs text-ink-400 border border-line-soft border-dashed rounded-md px-3 py-2 bg-white/60">Nenhum erro ou aviso no circuito atual.</div>
        )}
        <div className="flex flex-col gap-1">
          {diagnostics.map((d) => (
            <div
              key={d.id}
              className={`text-xs px-2.5 py-1.5 rounded-[5px] border ${
                d.level === 'error'
                  ? 'border-red-300 text-red-800 bg-state-errorbg'
                  : d.level === 'warning'
                    ? 'border-amber-300 text-amber-800 bg-state-pausebg'
                    : 'border-brand-200 text-brand-700 bg-brand-50'
              }`}
            >
              {d.message}
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Registro de eventos</SectionTitle>
        <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto dc-card p-2">
          {events.length === 0 && <div className="text-xs text-ink-400">Sem eventos.</div>}
          {events.map((e) => (
            <div key={e.id} className="text-[11px] text-ink-500 font-mono border-l-2 border-line pl-2 py-0.5">
              {new Date(e.ts).toLocaleTimeString()} — {e.message}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/* contador usa o mesmo glifo da família sem importar o editor ladder */
function IconCounterProxy() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink-400">
      <rect x="3" y="6" width="18" height="13" rx="1.5" />
      <path d="M7 3v3M12 3v3M17 3v3" />
    </svg>
  )
}
