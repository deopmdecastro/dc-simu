import { useId } from 'react'
import { useSimStore } from '../store/useSimStore'
import { externalOutputsUsable } from '../plc/externalController'

/**
 * Seletor visual do **motor do simulador**: quem decide as saídas do PLC — o programa interno
 * (Ladder/GRAFCET do DC-Simu) ou a CPU simulada no S7-PLCSIM Advanced a partir do TIA Portal.
 *
 * Duas opções exclusivas: rádio nativo (teclado e leitor de ecrã) dentro de cartões clicáveis,
 * com o estado real da ligação por baixo — o cartão escolhido diz «Ativo», mas a linha
 * «Motor ativo» diz quem está mesmo a comandar (uma escolha TIA sem ponte ligada não é o motor).
 */
type Engine = 'internal' | 'tia-portal'

const ENGINE: Record<Engine, { title: string; desc: string }> = {
  internal: { title: 'DC-Simu', desc: 'Ladder e GRAFCET do simulador' },
  'tia-portal': { title: 'TIA Portal', desc: 'S7-PLCSIM Advanced pela ponte local' },
}

function EngineGlyph({ engine }: { engine: Engine }) {
  return (
    <svg className="dc-engine-glyph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      {engine === 'internal' ? (
        // Duas barricadas e dois degraus: o programa interno (Ladder/GRAFCET).
        <>
          <path d="M6 3v18M18 3v18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M6 9h12M6 15h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="12" cy="9" r="1.9" fill="currentColor" />
        </>
      ) : (
        // Circuito integrado com pinos: a CPU simulada comandada pelo TIA Portal.
        <>
          <rect x="6.2" y="6.2" width="11.6" height="11.6" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <rect x="10" y="10" width="4" height="4" rx="0.8" fill="currentColor" />
          <path d="M9 2.6v3.6M15 2.6v3.6M9 17.8v3.6M15 17.8v3.6M2.6 9h3.6M2.6 15h3.6M17.8 9h3.6M17.8 15h3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

/** Estado real do motor, para mostrar junto às opções e no painel «Simulação». */
export function useEngineState(plcId?: string | null) {
  const config = useSimStore((s) => s.controller)
  const runtime = useSimStore((s) => s.externalController)
  const bound = config.mode === 'tia-portal' && (plcId == null || config.plcId === plcId)
  const selected: Engine = bound ? 'tia-portal' : 'internal'
  if (selected === 'internal') return { selected, driving: 'DC-Simu', detail: 'programa interno', badge: 'Ativo' } as const
  if (runtime.status === 'connected' && externalOutputsUsable(runtime)) return { selected, driving: 'TIA Portal', detail: 'CPU em RUN', badge: 'CPU em RUN' } as const
  if (runtime.status === 'connected') return { selected, driving: 'TIA Portal', detail: 'CPU sem RUN', badge: 'CPU parada' } as const
  if (runtime.status === 'connecting') return { selected, driving: 'TIA Portal', detail: 'a ligar…', badge: 'A ligar' } as const
  if (runtime.status === 'error') return { selected, driving: 'TIA Portal', detail: 'ligação com erro', badge: 'Erro' } as const
  return { selected, driving: 'TIA Portal', detail: 'sem ligação — quem manda é o DC-Simu', badge: 'Sem ligação' } as const
}

export function EngineSelector({ plcId, locked, onChoose }: {
  /** PLC a que a escolha se aplica; `null`/`undefined` = seletor global. */
  plcId?: string | null
  /** Em RUN ou com a ponte ligada a escolha fica fechada (evita trocar o motor a meio do ciclo). */
  locked?: boolean
  onChoose: (engine: Engine) => void
}) {
  const name = useId()
  const { selected, driving, detail, badge } = useEngineState(plcId)
  const cards: Engine[] = ['internal', 'tia-portal']
  return (
    <fieldset className="dc-engine" data-engine-selector>
      <legend className="dc-engine-legend">Motor do simulador</legend>
      <div className="dc-engine-options">
        {cards.map((engine) => {
          const active = selected === engine
          const status = active ? (engine === 'tia-portal' ? badge : 'Ativo') : 'Em espera'
          return (
            <label key={engine} className="dc-engine-card" data-engine-card={engine} title={locked ? 'Pare a simulação para mudar o motor.' : undefined}>
              <input
                type="radio"
                name={name}
                value={engine}
                checked={active}
                disabled={locked}
                onChange={() => onChoose(engine)}
                aria-checked={active}
                data-tia-mode={engine}
              />
              <span className="dc-engine-card-body">
                <span className="dc-engine-card-head">
                  <EngineGlyph engine={engine} />
                  <span className="dc-engine-card-title">{ENGINE[engine].title}</span>
                </span>
                <span className="dc-engine-card-desc">{ENGINE[engine].desc}</span>
                <span className="dc-engine-state" data-engine-state={engine}>{status}</span>
              </span>
            </label>
          )
        })}
      </div>
      <p className="dc-engine-live" data-engine-live aria-live="polite">
        Motor ativo: <b>{driving}</b>{selected === 'tia-portal' ? ` · ${detail}` : ''}
      </p>
      {locked && <p className="dc-tia-note">A simulação está a correr ou a ponte está ligada: pare-a para mudar o motor.</p>}
    </fieldset>
  )
}

/** Versão compacta para o painel «Simulação», que é o que fica visível em RUN. */
export function EngineBadge({ plcId }: { plcId?: string | null }) {
  const { driving, detail } = useEngineState(plcId)
  const external = driving === 'TIA Portal'
  return (
    <span className="dc-engine-badge" data-engine-badge data-engine={external ? 'tia-portal' : 'internal'} title={`Motor do simulador: ${driving}${external ? ` · ${detail}` : ''}`}>
      <i aria-hidden="true" />
      Motor: <b>{driving}</b>{external ? <span className="dc-engine-badge-detail"> · {detail}</span> : null}
    </span>
  )
}
