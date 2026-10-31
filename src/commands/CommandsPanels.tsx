// Lateral direita do simulador de comandos: Entradas/Saídas (operar e observar a
// simulação) e Objetos (aparelhos e símbolos do esquema). O GRAFCET é o editor comum.
import { useMemo } from 'react'
import { useSimStore } from '../store/useSimStore'
import { IconPause, IconPlay, IconStop } from '../ui/icons'
import { CMD_PARTS, emptyCommands, type CmdKind } from './model'
import { devicesOf } from './engine'
import { MOMENTARY, TOGGLES, useCommandsUi } from './commandsUi'

const has = (kinds: string[], list: CmdKind[]) => kinds.some((k) => list.includes(k as CmdKind))

/** Controlo da simulação (igual nas duas abas): arrancar, pausar e parar. */
function SimBar() {
  const rt = useCommandsUi((s) => s.rt)
  const paused = useCommandsUi((s) => s.paused)
  const { start, pause, stop } = useCommandsUi.getState()
  const empty = !(useSimStore((s) => s.commands)?.parts.length)
  return (
    <div className="dc-cmd-simbar">
      <div className="dc-seg" role="toolbar" aria-label="Simulação de comandos">
        <button type="button" className={`dc-tool-btn !font-semibold ${rt.running && !paused ? '' : '!text-state-run'}`} disabled={empty || (rt.running && !paused)} onClick={start} aria-label="Iniciar simulação de comandos"><IconPlay size={12} /><span>Simular</span></button>
        <button type="button" className="dc-tool-btn !text-state-pause" disabled={!rt.running || paused} onClick={pause} aria-label="Pausar simulação de comandos"><IconPause size={12} /></button>
        <button type="button" className="dc-tool-btn" disabled={!rt.running && !rt.fault} onClick={stop} aria-label="Parar simulação de comandos"><IconStop size={12} /></button>
      </div>
      <span className={`dc-cmd-state ${rt.running ? (paused ? 'is-pause' : 'is-run') : 'is-stop'}`}>{rt.running ? (paused ? 'PAUSA' : 'RUN') : 'STOP'}</span>
      <span className="dc-cmd-time">{(rt.time / 1000).toFixed(1)} s</span>
    </div>
  )
}

export function CommandsIoPanel() {
  const diagram = useSimStore((s) => s.commands) ?? emptyCommands()
  const rt = useCommandsUi((s) => s.rt)
  const { press, toggle, trip } = useCommandsUi.getState()
  const devices = useMemo(() => devicesOf(diagram), [diagram])
  const inputs = devices.filter(({ kinds }) => has(kinds, [...MOMENTARY, ...TOGGLES]) || kinds.some((k) => k.startsWith('thermal')))
  const outputs = devices.filter(({ kinds }) => has(kinds, ['coil', 'timerCoil', 'lamp', 'motor3', 'motor6']))
  const idle = !rt.running

  return (
    <div className="dc-cmd-dock" aria-label="Entradas e saídas dos comandos">
      <SimBar />
      {rt.fault && <div className="dc-cmd-dock-fault" role="alert">{rt.fault}</div>}
      <section>
        <h3>Entradas <em>{inputs.length}</em></h3>
        {idle && <p className="dc-cmd-muted">Inicie a simulação para premir botões, encravar emergências ou disparar térmicos.</p>}
        <ul className="dc-cmd-devices">
          {inputs.map(({ tag, kinds }) => {
            const toggleKind = kinds.find((k) => TOGGLES.includes(k as CmdKind))
            return <li key={tag} className="dc-cmd-device">
              <b>{tag}</b>
              <span className="dc-cmd-kind">{kinds.filter((k) => !k.startsWith('contact') && k !== 'thermalNO').map((k) => CMD_PARTS[k as CmdKind].label).join(' · ')}</span>
              {has(kinds, MOMENTARY) && <button type="button" disabled={idle} className={`dc-btn dc-cmd-press ${rt.pressed[tag] ? 'is-on' : ''}`} onPointerDown={() => press(tag, true)} onPointerUp={() => press(tag, false)} onPointerLeave={() => rt.pressed[tag] && press(tag, false)}>{rt.pressed[tag] ? 'premido' : 'premir'}</button>}
              {toggleKind && <button type="button" disabled={idle} className={`dc-btn ${rt.toggled[tag] ? 'is-on' : ''}`} onClick={() => toggle(tag)}>{toggleKind === 'emergency' ? (rt.toggled[tag] ? 'desencravar' : 'encravar') : toggleKind === 'selector' ? (rt.toggled[tag] ? 'desligar' : 'ligar') : rt.toggled[tag] ? 'fechar' : 'abrir'}</button>}
              {kinds.some((k) => k.startsWith('thermal')) && <button type="button" disabled={idle} className={`dc-btn ${rt.tripped[tag] ? 'is-danger' : ''}`} onClick={() => trip(tag, !rt.tripped[tag])}>{rt.tripped[tag] ? 'rearmar' : 'disparar'}</button>}
            </li>
          })}
          {!inputs.length && <li className="dc-cmd-muted">Sem botões nem proteções no esquema.</li>}
        </ul>
      </section>
      <section>
        <h3>Saídas <em>{outputs.length}</em></h3>
        <ul className="dc-cmd-devices">
          {outputs.map(({ tag, kinds }) => {
            const coil = has(kinds, ['coil', 'timerCoil'])
            const motor = diagram.parts.find((p) => p.tag === tag && (p.kind === 'motor3' || p.kind === 'motor6'))
            const lamp = diagram.parts.find((p) => p.tag === tag && p.kind === 'lamp')
            const since = rt.coilSince[tag]
            const delay = rt.delays[tag] ?? 3000
            const m = motor ? rt.motors[motor.id] : undefined
            return <li key={tag} className="dc-cmd-device">
              <b>{tag}</b>
              {coil && <span className={`dc-cmd-chip ${rt.coils[tag] ? 'is-on' : ''}`}>{rt.coils[tag] ? 'bobina ligada' : 'bobina desligada'}</span>}
              {kinds.includes('timerCoil') && rt.coils[tag] && since !== undefined && <span className="dc-cmd-chip is-timer">{rt.time - since >= delay ? 'tempo cumprido' : `${((rt.time - since) / 1000).toFixed(1)} / ${(delay / 1000).toFixed(1)} s`}</span>}
              {motor && <span className={`dc-cmd-chip ${m && m.mode !== 'stop' ? 'is-on' : ''}`}>{!m || m.mode === 'stop' ? (m?.phaseLoss ? 'falta de fase' : 'parado') : `${m.mode === 'star' ? 'estrela (Y)' : m.mode === 'delta' ? 'triângulo (Δ)' : 'a rodar'} · ${m.dir === 1 ? 'sentido horário' : 'sentido anti-horário'}`}</span>}
              {lamp && <span className={`dc-cmd-chip ${rt.lamps[lamp.id] ? 'is-on' : ''}`}>{rt.lamps[lamp.id] ? 'acesa' : 'apagada'}</span>}
            </li>
          })}
          {!outputs.length && <li className="dc-cmd-muted">Sem bobinas, sinalizadores nem motores no esquema.</li>}
        </ul>
      </section>
    </div>
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
