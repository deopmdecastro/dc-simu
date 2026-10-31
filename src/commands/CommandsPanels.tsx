// Lateral direita do simulador de comandos: Entradas/Saídas (operar e observar a
// simulação) e Objetos (aparelhos e símbolos do esquema). O GRAFCET é o editor comum.
// Layout alinhado ao painel E/S do Esquema 3D (SimulationDock embedded + vio-panel).
import { useMemo } from 'react'
import { useSimStore } from '../store/useSimStore'
import { CMD_PARTS, emptyCommands, type CmdKind } from './model'
import { devicesOf } from './engine'
import { MOMENTARY, TOGGLES, useCommandsUi } from './commandsUi'
import { SimTransportControls } from '../ui/toolbarKit'

const has = (kinds: string[], list: CmdKind[]) => kinds.some((k) => list.includes(k as CmdKind))

/** Painel E/S do esquema IEC — mesma casca visual do E/S 3D (barra de estado + transporte + vio-panel). */
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
                <strong>Entradas <em className={inputs.length ? '' : ''}>{inputs.length}</em></strong>
              </div>
              <div className="vio-inputs dc-cmd-vio-inputs">
                {inputs.map(({ tag, kinds }) => {
                  const toggleKind = kinds.find((k) => TOGGLES.includes(k as CmdKind))
                  const kindLabel = kinds
                    .filter((k) => !k.startsWith('contact') && k !== 'thermalNO')
                    .map((k) => CMD_PARTS[k as CmdKind]?.label ?? k)
                    .join(' · ')
                  const pressed = !!rt.pressed[tag]
                  const toggled = !!rt.toggled[tag]
                  const tripped = !!rt.tripped[tag]
                  return (
                    <div key={tag} className={`vio-cell dc-cmd-device-cell ${pressed || toggled || tripped ? 'is-active' : ''}`}>
                      <div className="dc-cmd-device-main">
                        <b>{tag}</b>
                        <small className={kindLabel ? 'vio-name' : 'vio-name-empty'}>{kindLabel || '—'}</small>
                      </div>
                      <div className="vio-cell-foot dc-cmd-device-actions">
                        {has(kinds, MOMENTARY) && (
                          <button
                            type="button"
                            disabled={idle}
                            className={`dc-btn dc-cmd-press ${pressed ? 'is-on' : ''}`}
                            onPointerDown={() => press(tag, true)}
                            onPointerUp={() => press(tag, false)}
                            onPointerLeave={() => rt.pressed[tag] && press(tag, false)}
                          >
                            {pressed ? 'premido' : 'premir'}
                          </button>
                        )}
                        {toggleKind && (
                          <button
                            type="button"
                            disabled={idle}
                            className={`dc-btn ${toggled ? 'is-on' : ''}`}
                            onClick={() => toggle(tag)}
                          >
                            {toggleKind === 'emergency'
                              ? (toggled ? 'desencravar' : 'encravar')
                              : toggleKind === 'selector'
                                ? (toggled ? 'desligar' : 'ligar')
                                : (toggled ? 'fechar' : 'abrir')}
                          </button>
                        )}
                        {kinds.some((k) => k.startsWith('thermal')) && (
                          <button
                            type="button"
                            disabled={idle}
                            className={`dc-btn ${tripped ? 'is-danger' : ''}`}
                            onClick={() => trip(tag, !rt.tripped[tag])}
                          >
                            {tripped ? 'rearmar' : 'disparar'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {!inputs.length && <small className="vio-empty">Sem botões nem proteções no esquema.</small>}
              </div>
            </div>

            <div className="vio-col">
              <div className="vio-head">
                <strong>
                  Saídas{' '}
                  <em className={outputs.some(({ tag, kinds }) => {
                    const motor = diagram.parts.find((p) => p.tag === tag && (p.kind === 'motor3' || p.kind === 'motor6'))
                    const lamp = diagram.parts.find((p) => p.tag === tag && p.kind === 'lamp')
                    const m = motor ? rt.motors[motor.id] : undefined
                    return !!rt.coils[tag] || !!(lamp && rt.lamps[lamp.id]) || !!(m && m.mode !== 'stop')
                  }) ? 'is-live' : ''}>
                    {outputs.length}
                  </em>
                </strong>
              </div>
              <div className="vio-inputs dc-cmd-vio-inputs">
                {outputs.map(({ tag, kinds }) => {
                  const coil = has(kinds, ['coil', 'timerCoil'])
                  const motor = diagram.parts.find((p) => p.tag === tag && (p.kind === 'motor3' || p.kind === 'motor6'))
                  const lamp = diagram.parts.find((p) => p.tag === tag && p.kind === 'lamp')
                  const since = rt.coilSince[tag]
                  const delay = rt.delays[tag] ?? 3000
                  const m = motor ? rt.motors[motor.id] : undefined
                  const coilOn = !!rt.coils[tag]
                  const lampOn = !!(lamp && rt.lamps[lamp.id])
                  const motorOn = !!(m && m.mode !== 'stop')
                  const on = coilOn || lampOn || motorOn
                  const chips: string[] = []
                  if (coil) chips.push(coilOn ? 'bobina ligada' : 'bobina desligada')
                  if (kinds.includes('timerCoil') && coilOn && since !== undefined) {
                    chips.push(rt.time - since >= delay ? 'tempo cumprido' : `${((rt.time - since) / 1000).toFixed(1)} / ${(delay / 1000).toFixed(1)} s`)
                  }
                  if (motor) {
                    chips.push(!m || m.mode === 'stop'
                      ? (m?.phaseLoss ? 'falta de fase' : 'parado')
                      : `${m.mode === 'star' ? 'estrela (Y)' : m.mode === 'delta' ? 'triângulo (Δ)' : 'a rodar'} · ${m.dir === 1 ? 'sentido horário' : 'sentido anti-horário'}`)
                  }
                  if (lamp) chips.push(lampOn ? 'acesa' : 'apagada')
                  const kindLabel = kinds
                    .filter((k) => !k.startsWith('contact'))
                    .map((k) => CMD_PARTS[k as CmdKind]?.label ?? k)
                    .join(' · ')
                  return (
                    <div key={tag} className={`vio-cell dc-cmd-device-cell ${on ? 'is-active' : ''}`}>
                      <div className="dc-cmd-device-main">
                        <b>{tag}</b>
                        <small className={kindLabel ? 'vio-name' : 'vio-name-empty'}>{kindLabel || '—'}</small>
                      </div>
                      <div className="vio-cell-foot dc-cmd-device-actions">
                        {chips.map((label, i) => (
                          <span key={i} className={`dc-cmd-chip ${on && i === 0 ? 'is-on' : ''}`}>{label}</span>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {!outputs.length && <small className="vio-empty">Sem bobinas, sinalizadores nem motores no esquema.</small>}
              </div>
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
  const pick = (id: string) => { useCommandsUi.getState().select({ type: 'part', id }); useCommandsUi.getState().emit('focusSelection') }
  return (
    <div className="dc-cmd-dock" aria-label="Objetos do esquema de comandos">
      <p className="dc-cmd-muted"><b>{diagram.parts.filter((p) => p.kind !== 'node').length}</b> símbolos · <b>{diagram.wires.length}</b> cabos · <b>{devices.length}</b> aparelhos</p>
      <section>
        <h3>Aparelhos <em>{devices.length}</em></h3>
        <ul className="dc-cmd-objects">
          {devices.map(({ tag }) => (
            <li key={tag}>
              <b>{tag}</b>
              <div>{diagram.parts.filter((p) => p.tag === tag).map((p) => (
                <button key={p.id} type="button" className={`dc-cmd-object ${selection?.id === p.id ? 'is-on' : ''}`} onClick={() => pick(p.id)} title="Selecionar e centrar no esquema">
                  {CMD_PARTS[p.kind].label}{p.labels?.length ? ` ${p.labels.join('-')}` : ''}
                </button>
              ))}</div>
            </li>
          ))}
        </ul>
      </section>
      {supplies.length > 0 && <section>
        <h3>Alimentações <em>{supplies.length}</em></h3>
        <ul className="dc-cmd-objects">
          {supplies.map((p) => <li key={p.id}><button type="button" className={`dc-cmd-object ${selection?.id === p.id ? 'is-on' : ''}`} onClick={() => pick(p.id)}>{(p.lines ?? ['L1']).join(' · ')}</button></li>)}
        </ul>
      </section>}
    </div>
  )
}
