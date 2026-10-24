import { useEffect, useMemo, useState } from 'react'
import { useSimStore, type VirtualInputMode } from '../store/useSimStore'
import VirtualInputButton from '../components/VirtualInputButton'
import VirtualIoPanel from '../components/VirtualIoPanel'
import { transitionReceptivity, transitionsOf, type GrafcetProgram, type GrafcetRuntime } from './engine'
import { detectGrafcetIo, type DetectedTransition } from './inputDetect'

/** Campo de texto que só grava ao sair (blur) ou com Enter; Esc repõe o valor anterior. */
function InlineName({
  value,
  placeholder,
  label,
  onCommit,
  className = '',
}: {
  value: string
  placeholder: string
  label: string
  onCommit: (next: string) => void
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      className={`gsim-name ${className}`}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      title={value || placeholder}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft.trim() !== value.trim() && onCommit(draft.trim())}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

const MODES: Array<{ id: VirtualInputMode; label: string; hint: string }> = [
  { id: 'push', label: 'Pressão', hint: 'Só está a 1 enquanto o botão é premido (como um botão de arranque).' },
  { id: 'latch', label: 'Encravamento', hint: 'Cada clique liga ou desliga e mantém o estado (como um interruptor).' },
]

function ModeToggle({ address, mode }: { address: string; mode: VirtualInputMode }) {
  const setMode = useSimStore((s) => s.setVirtualInputMode)
  return (
    <div className="gsim-seg" role="radiogroup" aria-label={`Tipo de botão de ${address}`}>
      {MODES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={mode === option.id}
          className={mode === option.id ? 'is-active' : ''}
          title={option.hint}
          onClick={() => setMode(address, option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default function GrafcetSimPanel({
  program,
  runtime,
  stepLabel,
  extraBits,
  onRenameTransition,
  onRenameAllTransitions,
  onOpenTransition,
  onOpenStep,
  stepDescription,
}: {
  program: GrafcetProgram
  runtime: GrafcetRuntime
  stepLabel: (stepId: string) => string
  extraBits: string[]
  onRenameTransition: (transitionId: string, name: string) => void
  /** Grava, de uma só vez, os nomes sugeridos nas transições ainda sem nome. */
  onRenameAllTransitions: (names: Record<string, string>) => void
  onOpenTransition: (transitionId: string) => void
  onOpenStep: (stepId: string) => void
  stepDescription: (stepId: string) => string
}) {
  const table = useSimStore((s) => s.runtime.table)
  const tags = useSimStore((s) => s.tags)
  const modes = useSimStore((s) => s.virtualInputModes)
  const inputCount = useSimStore((s) => s.virtualInputCount)
  const setCount = useSimStore((s) => s.setVirtualInputCount)
  const setName = useSimStore((s) => s.setVirtualInputName)
  const clear = useSimStore((s) => s.clearVirtualInputs)
  const runState = useSimStore((s) => s.sim.runState)

  const detection = useMemo(() => detectGrafcetIo(program, stepLabel), [program, stepLabel])

  // Garante que todas as entradas usadas nas condições existem no painel.
  useEffect(() => {
    if (detection.maxInput > inputCount) setCount(detection.maxInput)
  }, [detection.maxInput, inputCount, setCount])

  const nameOf = (address: string) => {
    const name = tags.find((t) => t.address.toUpperCase() === address)?.name ?? ''
    return name.toUpperCase() === address ? '' : name
  }

  const activeIds = new Set(runtime.active)
  const lastFired = new Set(runtime.lastFired ?? [])

  const statusOf = (t: DetectedTransition): { id: 'idle' | 'waiting' | 'ready'; text: string } => {
    if (!t.from.length || !t.from.every((id) => activeIds.has(id))) return { id: 'idle', text: 'Inativa' }
    const real = transitionsOf(program).find((tr) => tr.id === t.id)
    const ok = !!real && transitionReceptivity(program, runtime, table, real)
    return ok ? { id: 'ready', text: 'A disparar' } : { id: 'waiting', text: 'À espera' }
  }

  const autoNames = () => {
    const names: Record<string, string> = {}
    for (const t of detection.transitions) if (!t.name) names[t.id] = t.autoName
    if (Object.keys(names).length) onRenameAllTransitions(names)
  }

  const activeSteps = program.steps.filter((step) => activeIds.has(step.id))
  const firedCount = runtime.fired ?? 0

  return (
    <div className="gsim">
      <section className={`gsim-state is-${runState === 'running' ? 'running' : 'stopped'}`} aria-label="Estado da sequência" aria-live="polite">
        <div className="gsim-state-head">
          <h4>{runState === 'running' ? 'Etapas ativas' : runState === 'paused' ? 'Sequência em pausa' : 'Estado da sequência'}</h4>
          <span title="Transições disparadas desde o início da simulação">{firedCount} {firedCount === 1 ? 'disparo' : 'disparos'}</span>
        </div>
        {activeSteps.length ? (
          <ul className="gsim-state-steps">
            {activeSteps.map((step) => (
              <li key={step.id}>
                <button type="button" onClick={() => onOpenStep(step.id)} title={`Abrir etapa ${stepLabel(step.id)}`}>
                  <b>{stepLabel(step.id)}</b>
                  {stepDescription(step.id) && <span>{stepDescription(step.id)}</span>}
                  <em>{(((runtime.elapsed?.[step.id] ?? 0)) / 1000).toFixed(1)} s</em>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gsim-state-none">Nenhuma etapa ativa. Prima Run para começar.</p>
        )}
      </section>

      <section className="gsim-section" aria-label="Entradas usadas nas transições">
        <header className="gsim-head">
          <div className="gsim-heading">
            <span className="gsim-heading-icon is-input" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="2" fill="currentColor" />
                <path d="M7.8 7.8a6 6 0 0 0 0 8.4m8.4-8.4a6 6 0 0 1 0 8.4M4.5 4.5a10.6 10.6 0 0 0 0 15m15-15a10.6 10.6 0 0 1 0 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h4>Entradas <span className="gsim-count">{detection.inputs.length}</span></h4>
            </div>
          </div>
          <button type="button" className="gsim-link" onClick={clear} title="Desligar todas as entradas">
            Desligar tudo
          </button>
        </header>

        {detection.inputs.length === 0 ? (
          <div className="gsim-empty">
            <strong>Nenhuma entrada em uso</strong>
            <span>Escreva uma condição como <code>I1</code>, <code>I1*!I2</code> ou <code>Start</code> numa transição e o botão correspondente surge aqui.</span>
          </div>
        ) : (
          <ul className="gsim-inputs">
            {detection.inputs.map((input) => {
              const mode = modes[input.address] ?? 'latch'
              const name = input.symbol ? '' : nameOf(input.address)
              const title = input.symbol ? input.address : name || input.address
              return (
                <li key={input.address} className={`gsim-input${input.symbol ? ' is-symbol' : ''}`}>
                  <div className="gsim-input-main">
                    <VirtualInputButton address={input.address} className={`gsim-actuator${input.symbol ? ' is-symbol' : ''}`} title={title}>
                      <i aria-hidden="true" />
                      <b>{input.address}</b>
                    </VirtualInputButton>
                    {!input.symbol && (
                      <InlineName
                        value={name}
                        placeholder="Nome da entrada"
                        label={`Nome da entrada ${input.address}`}
                        onCommit={(next) => setName(input.address, next)}
                      />
                    )}
                  </div>
                  <div className="gsim-input-row">
                    <ModeToggle address={input.address} mode={mode} />
                    <div className="gsim-uses" aria-label={`Transições que usam ${input.address}`}>
                      <span>Em</span>
                      {input.transitions.map((use) => (
                        <button key={use.id} type="button" onClick={() => onOpenTransition(use.id)} title={use.label}>
                          T{use.index + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="gsim-section" aria-label="Transições">
        <header className="gsim-head">
          <div className="gsim-heading">
            <span className="gsim-heading-icon is-transition" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 7h15m0 0-3.5-3.5M19 7l-3.5 3.5M20 17H5m0 0 3.5-3.5M5 17l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h4>Transições <span className="gsim-count">{detection.transitions.length}</span></h4>
            </div>
          </div>
          {detection.unnamed > 0 && (
            <button type="button" className="gsim-btn" onClick={autoNames} title="Dá um nome a cada transição sem nome (ex.: T2 · 1 → 2)">
              Nomear {detection.unnamed === detection.transitions.length ? 'todas' : detection.unnamed}
            </button>
          )}
        </header>

        {detection.transitions.length === 0 ? (
          <div className="gsim-empty">
            <strong>Sem transições</strong>
            <span>Ligue duas etapas no diagrama para criar a primeira transição.</span>
          </div>
        ) : (
          <ul className="gsim-transitions">
            {detection.transitions.map((t) => {
              const status = statusOf(t)
              return (
                <li key={t.id} className={`gsim-transition is-${status.id} ${lastFired.has(t.id) ? 'was-fired' : ''}`}>
                  <div className="gsim-transition-top">
                    <InlineName
                      className={t.name ? '' : 'is-auto'}
                      value={t.name}
                      placeholder={t.autoName}
                      label={`Nome da transição T${t.index + 1}`}
                      onCommit={(next) => onRenameTransition(t.id, next)}
                    />
                    <span className={`gsim-badge is-${status.id}`}>{status.text}</span>
                  </div>
                  <button type="button" className="gsim-cond" onClick={() => onOpenTransition(t.id)} title={`Abrir transição · ${t.condition.trim() || 'sem condição'}`}>
                    <span>Receptividade</span>
                    <code>{t.condition.trim() || 'sem condição'}</code>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <details className="gsim-all">
        <summary>Todas as entradas e saídas</summary>
        <VirtualIoPanel compact extraBits={extraBits} />
      </details>
    </div>
  )
}
