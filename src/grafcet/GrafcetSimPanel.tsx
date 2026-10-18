import { useEffect, useMemo, useState } from 'react'
import { useSimStore, type VirtualInputMode } from '../store/useSimStore'
import VirtualInputButton from '../components/VirtualInputButton'
import VirtualIoPanel from '../components/VirtualIoPanel'
import { evalCondition, validCondition, type GrafcetProgram, type GrafcetRuntime } from './engine'
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
}: {
  program: GrafcetProgram
  runtime: GrafcetRuntime
  stepLabel: (stepId: string) => string
  extraBits: string[]
  onRenameTransition: (transitionId: string, name: string) => void
  /** Grava, de uma só vez, os nomes sugeridos nas transições ainda sem nome. */
  onRenameAllTransitions: (names: Record<string, string>) => void
  onOpenTransition: (transitionId: string) => void
}) {
  const table = useSimStore((s) => s.runtime.table)
  const tags = useSimStore((s) => s.tags)
  const modes = useSimStore((s) => s.virtualInputModes)
  const inputCount = useSimStore((s) => s.virtualInputCount)
  const setCount = useSimStore((s) => s.setVirtualInputCount)
  const setName = useSimStore((s) => s.setVirtualInputName)
  const clear = useSimStore((s) => s.clearVirtualInputs)

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
  const activeIndexes = new Set(program.steps.map((step, index) => (activeIds.has(step.id) ? index : -1)).filter((n) => n >= 0))
  const lastFired = new Set(runtime.lastFired ?? [])

  const statusOf = (t: DetectedTransition): { id: 'idle' | 'waiting' | 'ready'; text: string } => {
    if (!t.from.length || !t.from.every((id) => activeIds.has(id))) return { id: 'idle', text: 'Inativa' }
    const elapsed = Math.min(...t.from.map((id) => runtime.elapsed?.[id] ?? 0))
    const ok =
      validCondition(t.condition) &&
      evalCondition(t.condition, table, { prev: runtime.prev, activeIndexes, elapsedMs: elapsed })
    return ok ? { id: 'ready', text: 'A disparar' } : { id: 'waiting', text: 'À espera' }
  }

  const autoNames = () => {
    const names: Record<string, string> = {}
    for (const t of detection.transitions) if (!t.name) names[t.id] = t.autoName
    if (Object.keys(names).length) onRenameAllTransitions(names)
  }

  return (
    <div className="gsim">
      <section className="gsim-section" aria-label="Entradas usadas nas transições">
        <header className="gsim-head">
          <div>
            <h4>Entradas detetadas</h4>
            <p>{detection.inputs.length ? `${detection.inputs.length} usada${detection.inputs.length === 1 ? '' : 's'} nas condições das transições` : 'As entradas aparecem aqui quando as usar numa condição.'}</p>
          </div>
          <button type="button" className="gsim-link" onClick={clear} title="Desligar todas as entradas">
            Desligar tudo
          </button>
        </header>

        {detection.inputs.length === 0 ? (
          <div className="gsim-empty">
            <strong>Nenhuma entrada em uso</strong>
            <span>Escreva uma condição como <code>I1</code> ou <code>I1*!I2</code> numa transição e o botão correspondente surge aqui.</span>
          </div>
        ) : (
          <ul className="gsim-inputs">
            {detection.inputs.map((input) => {
              const mode = modes[input.address] ?? 'latch'
              const name = nameOf(input.address)
              return (
                <li key={input.address} className="gsim-input">
                  <VirtualInputButton address={input.address} className="gsim-actuator" title={name || input.address}>
                    <i aria-hidden="true" />
                    <b>{input.address}</b>
                  </VirtualInputButton>
                  <div className="gsim-input-body">
                    <InlineName
                      value={name}
                      placeholder="Dar nome (ex.: Arranque)"
                      label={`Nome da entrada ${input.address}`}
                      onCommit={(next) => setName(input.address, next)}
                    />
                    <ModeToggle address={input.address} mode={mode} />
                    <div className="gsim-uses">
                      <span>Usada em</span>
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
          <div>
            <h4>Transições</h4>
            <p>{detection.transitions.length ? `${detection.transitions.length} detetada${detection.transitions.length === 1 ? '' : 's'}` : 'Ainda não há transições.'}</p>
          </div>
          {detection.unnamed > 0 && (
            <button type="button" className="gsim-btn" onClick={autoNames} title="Dá um nome a cada transição sem nome (ex.: T2 · 1 → 2)">
              Nomear {detection.unnamed === detection.transitions.length ? 'todas' : `${detection.unnamed} sem nome`}
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
                  <button type="button" className="gsim-cond" onClick={() => onOpenTransition(t.id)} title="Abrir transição">
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
