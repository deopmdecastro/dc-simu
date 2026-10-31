// Lateral direita do simulador de comandos: Entradas/Saídas e Objetos.
// Cards idênticos ao painel E/S virtual do Esquema 3D (vio-cell / vio-switch / vio-lamp).
import { useMemo } from 'react'
import { useSimStore } from '../store/useSimStore'
import { CMD_PARTS, emptyCommands, type CmdKind } from './model'
import { devicesOf } from './engine'
import { MOMENTARY, TOGGLES, useCommandsUi } from './commandsUi'
import { SimTransportControls } from '../ui/toolbarKit'

const has = (kinds: string[], list: CmdKind[]) => kinds.some((k) => list.includes(k as CmdKind))

/** Rótulo curto do tipo de actuação (equivalente a INT/NO/NC no painel 3D). */
function modeLabel(kinds: string[]): { code: string; mode: 'latch' | 'push' | 'nc'; title: string } {
  if (kinds.some((k) => k.startsWith('thermal'))) return { code: 'TERM', mode: 'latch', title: 'Relé térmico — clique para disparar/rearmar' }
  if (kinds.includes('emergency')) return { code: 'EMG', mode: 'nc', title: 'Emergência — clique para encravar/desencravar' }
  if (has(kinds, TOGGLES)) return { code: 'INT', mode: 'latch', title: 'Interruptor — clique para ligar/desligar' }
  if (kinds.some((k) => /NC|nc|pushNC|limitNC/.test(k))) return { code: 'NC', mode: 'nc', title: 'Contacto NF — pressione para abrir' }
  return { code: 'NO', mode: 'push', title: 'Contacto NA — pressione para fechar' }
}

function shortKind(kinds: string[]): string {
  return kinds
    .filter((k) => !k.startsWith('contact') && k !== 'thermalNO')
    .map((k) => CMD_PARTS[k as CmdKind]?.label ?? k)
    .join(' · ') || '—'
}

/** Painel E/S do esquema IEC — mesma casca e cards do E/S 3D. */
export function CommandsIoPanel() {
  const diagram = useSimStore((s) => s.commands) ?? emptyCommands()
  const rt = useCommandsUi((s) => s.rt)
  const paused = useCommandsUi((s) => s.paused)
  const { start, pause, stop, press, toggle, trip, tick } = useCommandsUi.getState()
  const devices = useMemo(() => devicesOf(diagram), [diagram])
  const inputs = devices.filter(({ kinds }) => has(kinds, [...MOMENTARY, ...TOGGLES]) || kinds.some((k) => k.startsWith('thermal')))
  const outputs = devices.filter(({ kinds }) => has(kinds, ['coil', 'timerCoil', 'lamp', 'motor3', 'motor6']))
  const empty = !diagram.parts.length
  const running = rt.running && !paused
  const stopped = !rt.running
  const idle = stopped

  const onPlay = () => { if (!empty) start() }
  const onPause = () => pause()
  const onStop = () => stop()
  const onReset = () => { stop(); if (!empty) start() }
  const onStep = () => {
    if (empty) return
    if (!rt.running) start()
    else if (paused) { useCommandsUi.setState({ paused: false }); tick(50); useCommandsUi.setState({ paused: true }) }
    else tick(50)
  }

  const activeInputs = inputs.filter(({ tag, kinds }) => !!(rt.pressed[tag] || rt.toggled[tag] || rt.tripped[tag])).length
  const activeOutputs = outputs.filter(({ tag, kinds }) => {
    const motor = diagram.parts.find((p) => p.tag === tag && (p.kind === 'motor3' || p.kind === 'motor6'))
    const lamp = diagram.parts.find((p) => p.tag === tag && p.kind === 'lamp')
    const m = motor ? rt.motors[motor.id] : undefined
    return !!rt.coils[tag] || !!(lamp && rt.lamps[lamp.id]) || !!(m && m.mode !== 'stop')
  }).length

  const actuate = (tag: string, kinds: string[]) => {
    if (idle) return
    if (kinds.some((k) => k.startsWith('thermal'))) {
      trip(tag, !rt.tripped[tag])
      return
    }
    if (has(kinds, TOGGLES)) {
      toggle(tag)
      return
    }
  }

  return (
    <section className="schematic-sim-dock is-embedded dc-cmd-io" aria-label="Entradas e saídas dos comandos" data-sim-signals-panel>
      <div className="sim-embed-bar">
        <span
          className={`gdock-state ${running ? 'is-running' : stopped ? '' : 'is-paused'}`}
          role="status"
          title={rt.running ? `${(rt.time / 1000).toFixed(1)} s` : 'Parado'}
        >
          <i aria-hidden="true" />
          <span className="gdock-state-label">{running ? 'RUN' : stopped ? 'STOP' : 'PAUSA'}</span>
          <small className="sim-embed-cycle">{(rt.time / 1000).toFixed(1)} s</small>
        </span>
        <SimTransportControls
          running={running}
          stopped={stopped}
          onPlay={onPlay}
          onPause={onPause}
          onStep={onStep}
          onStop={onStop}
          onReset={onReset}
          variant="dock"
          className="gdock-transport"
        />
      </div>

      <div className="schematic-sim-dock-body">
        {rt.fault && <div className="dc-cmd-dock-fault" role="alert">{rt.fault}</div>}

        <div className={`vio-panel is-compact ${stopped ? 'is-stopped' : ''}`} aria-label="Dispositivos de comando">
          {idle && (
            <details className="vio-help is-info" open>
              <summary><b>STOP</b> · Inicie a simulação para testar</summary>
              <p>Prima Run para premir botões, encravar emergências ou disparar térmicos. Em STOP os controlos ficam bloqueados.</p>
            </details>
          )}

          <div className="vio-cols">
            <div className="vio-col">
              <div className="vio-head">
                <strong>
                  Entradas{' '}
                  <em className={activeInputs ? 'is-live' : ''}>{activeInputs}/{inputs.length || 0}</em>
                </strong>
              </div>
              <div className="vio-inputs">
                {inputs.map(({ tag, kinds }) => {
                  const pressed = !!rt.pressed[tag]
                  const toggled = !!rt.toggled[tag]
                  const tripped = !!rt.tripped[tag]
                  const on = pressed || toggled || tripped
                  const name = shortKind(kinds)
                  const mode = modeLabel(kinds)
                  const momentary = has(kinds, MOMENTARY) && !has(kinds, TOGGLES) && !kinds.some((k) => k.startsWith('thermal'))

                  return (
                    <div key={tag} className="vio-cell">
                      <button
                        type="button"
                        className={`vio-switch ${on ? 'is-on' : ''} ${mode.mode === 'nc' ? 'is-nc' : ''}`}
                        disabled={idle}
                        title={`${tag}${name !== '—' ? ` · ${name}` : ''} — ${mode.title}`}
                        onClick={() => actuate(tag, kinds)}
                        onPointerDown={(e) => {
                          if (!momentary || idle || e.button !== 0) return
                          e.preventDefault()
                          press(tag, true)
                        }}
                        onPointerUp={() => { if (momentary) press(tag, false) }}
                        onPointerLeave={() => { if (momentary && pressed) press(tag, false) }}
                        onPointerCancel={() => { if (momentary && pressed) press(tag, false) }}
                      >
                        <i aria-hidden="true" />
                        <b>{tag}</b>
                        <small className={name !== '—' ? 'vio-name' : 'vio-name-empty'}>{name}</small>
                      </button>
                      <div className="vio-cell-foot">
                        <span
                          className={`vio-mode is-${mode.mode}`}
                          title={mode.title}
                          aria-hidden="true"
                        >
                          {mode.code}
                        </span>
                        <span className={`plc-sim-state ${on ? 'is-on' : ''}`} aria-hidden="true">
                          <b>{on ? '1' : '0'}</b>
                        </span>
                      </div>
                    </div>
                  )
                })}
                {!inputs.length && <small className="vio-empty">Sem botões nem proteções no esquema.</small>}
              </div>
              {!!inputs.length && (
                <p className="vio-hint">
                  <b>Clique</b> liga/desliga · <b>pressão</b> nos botões momentâneos · a etiqueta NO/NC/INT indica o tipo
                </p>
              )}
            </div>

            <div className="vio-col">
              <div className="vio-head">
                <strong>
                  Saídas{' '}
                  <em className={activeOutputs ? 'is-live' : ''}>
                    {activeOutputs ? `${activeOutputs} ativa${activeOutputs === 1 ? '' : 's'}` : outputs.length}
                  </em>
                </strong>
              </div>
              {!outputs.length
                ? <small className="vio-empty">Sem bobinas, lâmpadas ou motores no esquema.</small>
                : (
                  <div className="vio-outputs">
                    {outputs.map(({ tag, kinds }) => {
                      const motor = diagram.parts.find((p) => p.tag === tag && (p.kind === 'motor3' || p.kind === 'motor6'))
                      const lamp = diagram.parts.find((p) => p.tag === tag && p.kind === 'lamp')
                      const m = motor ? rt.motors[motor.id] : undefined
                      const coilOn = !!rt.coils[tag]
                      const lampOn = !!(lamp && rt.lamps[lamp.id])
                      const motorOn = !!(m && m.mode !== 'stop')
                      const on = coilOn || lampOn || motorOn
                      let detail = shortKind(kinds)
                      if (motor && m) {
                        detail = m.mode === 'stop'
                          ? (m.phaseLoss ? 'falta de fase' : 'parado')
                          : `${m.mode === 'star' ? 'Y' : m.mode === 'delta' ? 'Δ' : 'a rodar'}`
                      }
                      if (kinds.includes('timerCoil') && coilOn) {
                        const since = rt.coilSince[tag]
                        const delay = rt.delays[tag] ?? 3000
                        if (since !== undefined && rt.time - since < delay) {
                          detail = `${((rt.time - since) / 1000).toFixed(1)}s`
                        }
                      }
                      return (
                        <span
                          key={tag}
                          className={`vio-lamp ${on ? 'is-on' : ''}`}
                          title={detail ? `${tag} · ${detail}` : tag}
                        >
                          <i aria-hidden="true" />
                          <b>{tag}</b>
                          {detail && detail !== '—' && <small>{detail}</small>}
                        </span>
                      )
                    })}
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function CommandsObjects() {
  const diagram = useSimStore((s) => s.commands) ?? emptyCommands()
  const selection = useCommandsUi((s) => s.selection)
  const devices = useMemo(() => devicesOf(diagram), [diagram])
  const supplies = diagram.parts.filter((p) => p.kind === 'supply')
  const pick = (id: string) => {
    useCommandsUi.getState().select({ type: 'part', id })
    useCommandsUi.getState().emit('focusSelection')
  }
  return (
    <div className="dc-cmd-dock" aria-label="Objetos do esquema de comandos">
      <p className="dc-cmd-muted">
        <b>{diagram.parts.filter((p) => p.kind !== 'node').length}</b> símbolos · <b>{diagram.wires.length}</b> cabos · <b>{devices.length}</b> aparelhos
      </p>
      <section>
        <h3>Aparelhos <em>{devices.length}</em></h3>
        <ul className="dc-cmd-objects">
          {devices.map(({ tag }) => (
            <li key={tag}>
              <b>{tag}</b>
              <div>
                {diagram.parts.filter((p) => p.tag === tag).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`dc-cmd-object ${selection?.id === p.id ? 'is-on' : ''}`}
                    onClick={() => pick(p.id)}
                    title="Selecionar e centrar no esquema"
                  >
                    {CMD_PARTS[p.kind].label}{p.labels?.length ? ` ${p.labels.join('-')}` : ''}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {supplies.length > 0 && (
        <section>
          <h3>Alimentações <em>{supplies.length}</em></h3>
          <ul className="dc-cmd-objects">
            {supplies.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`dc-cmd-object ${selection?.id === p.id ? 'is-on' : ''}`}
                  onClick={() => pick(p.id)}
                >
                  {(p.lines ?? ['L1']).join(' · ')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
