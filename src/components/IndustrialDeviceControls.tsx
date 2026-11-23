import { useEffect, useRef } from 'react'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { useManobraAllowed } from '../store/useManobraAllowed'
import { MANOBRA_BLOCKED_TITLE } from '../store/manobra'
import { GEYA_FUNCTIONS, GEYA_FUNCTION_LABELS, GEYA_RANGES_MS, INDUSTRIAL_INFO, industrialControlPatch, industrialDeviceTypeOf, micoProfile, type IndustrialControl } from '../electrical/industrialDevices'
import InspectorNumberInput from '../ui/InspectorNumberInput'
import Select from '../ui/Select'

const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const time = (ms: unknown) => `${number(ms).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} ms`
const RANGE_LABELS: Record<number, string> = { 1000: '1 s', 10000: '10 s', 60000: '1 min', 600000: '10 min', 3600000: '1 h', 36000000: '10 h', 86400000: '1 dia', 864000000: '10 dias', '-1': 'ON · saída permanente', 0: 'OFF · saída desligada' }

function Readout({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="dc-industrial-readout"><dt>{label}</dt><dd><output aria-label={label}>{children}</output></dd></div>
}

/** Alternativa de teclado/toque ao mesmo comando momentâneo existente no CAD. */
function MomentaryButton({ component, stateKey, children, disabled }: { component: ElectricalComponent; stateKey: 'testPressed' | 'pressed'; children: string; disabled: boolean }) {
  const held = useRef(false)
  const release = () => {
    if (!held.current) return
    held.current = false
    if (useSimStore.getState().components.some((item) => item.id === component.id)) useSimStore.getState().setComponentState(component.id, { [stateKey]: false })
  }
  useEffect(() => release, [component.id, stateKey])
  const press = () => {
    if (disabled || held.current) return
    held.current = true
    useSimStore.getState().operateComponent(component.id, { [stateKey]: true })
  }
  return <button type="button" className="dc-btn" disabled={disabled} title={disabled ? MANOBRA_BLOCKED_TITLE : 'Manter premido; largar liberta o comando.'} aria-label={children} aria-pressed={!!component.state[stateKey]}
    onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); press() }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onBlur={release}
    onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); press() } }}
    onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); release() } }}>{children}</button>
}

/** Parâmetros declarados pelo contrato industrial; o estado calculado nunca é um formulário livre. */
export default function IndustrialDeviceControls({ component: c, disabled = false }: { component: ElectricalComponent; disabled?: boolean }) {
  const stopped = useSimStore((s) => s.sim.runState === 'stopped')
  const simActive = useManobraAllowed()
  useSimStore((s) => s.simTick)
  const type = industrialDeviceTypeOf(c)
  if (!type) return null
  const s = c.state
  const configDisabled = disabled || !stopped
  const actDisabled = disabled || !simActive
  const configure = (patch: Record<string, unknown>) => {
    const store = useSimStore.getState()
    if (disabled || store.sim.runState !== 'stopped') return
    store.setComponentState(c.id, patch)
  }
  const act = (control: IndustrialControl) => {
    const store = useSimStore.getState()
    if (disabled || store.sim.runState === 'stopped') return
    const current = store.components.find((item) => item.id === c.id)
    if (current) store.operateComponent(c.id, industrialControlPatch(type, current.state, control))
  }
  const status = <dl className="dc-industrial-status" aria-label="Estado da simulação">
    <Readout label="Alimentação">{s.powered ? 'Alimentado' : 'Sem alimentação'}</Readout>
    {'energized' in s && <Readout label="Saída do relé">{s.energized ? 'Ativa' : 'Em repouso'}</Readout>}
    {'supplyMismatch' in s && <Readout label="Compatibilidade da alimentação">{s.supplyMismatch ? 'Alimentação incompatível' : 'Sem incompatibilidade detetada'}</Readout>}
  </dl>

  if (type.startsWith('timerGeya')) {
    const fixed = type === 'timerGeyaGrt8B1'
    // Reutiliza o reset declarado para o seletor físico, aplicando apenas uma opção válida.
    const timerPatch = (control: 'function' | 'range' | 'fraction', key: string, value: string | number) => {
      const current = useSimStore.getState().components.find((item) => item.id === c.id)
      if (!current) return
      configure({ ...industrialControlPatch(type, current.state, control), [key]: value })
      // O motor calcula o tempo e o diagnóstico; um scan em STOP não inicia a simulação.
      if (!configDisabled) useSimStore.getState().refreshCircuit()
    }
    return <div className="dc-industrial-controls" data-device-controls="geya">
      <h3 className="dc-field-label">Configuração do temporizador</h3>
      <label className="dc-inspector-state-row"><span className="dc-inspector-state-label">Função</span>
        <Select className="dc-input dc-inspector-state-input" aria-label="Função do temporizador" disabled={configDisabled || fixed} value={fixed ? 'E' : String(s.function ?? 'A')}
          onChange={(event) => { if (!fixed && GEYA_FUNCTIONS.includes(event.target.value as typeof GEYA_FUNCTIONS[number])) timerPatch('function', 'function', event.target.value) }}>
          {(fixed ? ['E'] : GEYA_FUNCTIONS).map((fn) => <option key={fn} value={fn}>{fn} · {GEYA_FUNCTION_LABELS[fn]}</option>)}
        </Select></label>
      {fixed && <p className="dc-industrial-help">GRT8-B1: TOF fixo — atraso à desoperação pelo borne S.</p>}
      <label className="dc-inspector-state-row"><span className="dc-inspector-state-label">Escala de tempo</span>
        <Select className="dc-input dc-inspector-state-input" aria-label="Escala de tempo" disabled={configDisabled} value={number(s.rangeMs, 10000)}
          onChange={(event) => { const value = Number(event.target.value); if (GEYA_RANGES_MS.includes(value as typeof GEYA_RANGES_MS[number])) timerPatch('range', 'rangeMs', value) }}>
          {GEYA_RANGES_MS.map((value) => <option key={value} value={value}>{RANGE_LABELS[value]}</option>)}
        </Select></label>
      <label className="dc-inspector-state-row"><span className="dc-inspector-state-label">Ajuste (10–100 %)</span>
        <InspectorNumberInput className="dc-input dc-inspector-state-input" resetKey={c.id} aria-label="Ajuste do tempo (%)" type="number" min={10} max={100} step={1} value={number(s.fraction, .3) * 100} disabled={configDisabled}
          onChange={(event) => timerPatch('fraction', 'fraction', Number(event.target.value) / 100)} /></label>
      <p className="dc-industrial-help">Tempo definido = escala × ajuste. ON e OFF fixam a saída; o comando S depende da cablagem.</p>
      <dl className="dc-industrial-status" aria-label="Temporização calculada">
        <Readout label="Tempo definido (calculado)">{number(s.rangeMs) <= 0 ? 'Não se aplica (ON/OFF)' : time(s.presetMs)}</Readout>
        <Readout label="Tempo decorrido">{time(s.elapsedMs)}</Readout>
        <Readout label="Temporização">{s.running ? 'Em curso' : 'Em repouso'}</Readout>
      </dl>
      {status}
    </div>
  }

  if (type === 'vfdSchneiderAtv320') return <div className="dc-industrial-controls" data-device-controls="atv320">
    <h3 className="dc-field-label">Configuração do variador</h3>
    {([
      ['presetHz', 'Referência de frequência (Hz)', 0, 599],
      ['rampUpMs', 'Rampa de aceleração (ms)', 100, 600000],
      ['rampDownMs', 'Rampa de desaceleração (ms)', 100, undefined],
    ] as const).map(([key, label, min, max]) => <label key={key} className="dc-inspector-state-row"><span className="dc-inspector-state-label">{label}</span>
      <InspectorNumberInput resetKey={c.id} aria-label={label} className="dc-input dc-inspector-state-input" type="number" min={min} max={max} step={key === 'presetHz' ? .1 : 100} value={number(s[key], key === 'presetHz' ? 50 : 3000)} disabled={configDisabled} onChange={(event) => configure({ [key]: Number(event.target.value) })} /></label>)}
    <label className="dc-inspector-state-row is-toggle"><span className="dc-inspector-state-label">Variador habilitado</span><input type="checkbox" checked={s.enabled !== false} disabled={configDisabled} onChange={(event) => configure({ enabled: event.target.checked })} /></label>
    <p className="dc-industrial-help">Marcha, sentido e STO são definidos pela cablagem. O encoder e ESC do equipamento mantêm a manobra existente.</p>
    <dl className="dc-industrial-status" aria-label="Estado do variador">
      <Readout label="Frequência de saída">{number(s.frequencyHz).toLocaleString('pt-PT')} Hz</Readout>
      <Readout label="Marcha">{s.running ? 'Em funcionamento' : 'Parado'}</Readout>
      <Readout label="Sentido de rotação">{s.direction === 'ccw' ? 'Anti-horário' : 'Horário'}</Readout>
      <Readout label="STO">{s.stoReleased ? 'Libertado' : 'Ativo'}</Readout>
      <Readout label="Falha do variador">{s.deviceFault ? 'Ativa' : 'Sem falha'}</Readout>
    </dl>{status}
  </div>

  if (type === 'levelRelayAvel411') return <div className="dc-industrial-controls" data-device-controls="avel">
    <h3 className="dc-field-label">Configuração das sondas</h3>
    <label className="dc-inspector-state-row"><span className="dc-inspector-state-label">Origem das sondas</span><Select aria-label="Origem das sondas" className="dc-input dc-inspector-state-input" disabled={configDisabled} value={s.probeMode === 'virtual' ? 'virtual' : 'wired'} onChange={(event) => { if (['wired', 'virtual'].includes(event.target.value)) configure({ probeMode: event.target.value }) }}>
      <option value="wired">Sondas cabladas</option><option value="virtual">Sondas virtuais de ensaio</option></Select></label>
    <p className="dc-industrial-help">Em modo cablado, a humidade é calculada pelas ligações das sondas. O ensaio virtual define o ambiente inicial.</p>
    {([
      ['tankMinWet', 'Sonda mínima do depósito molhada'], ['tankMaxWet', 'Sonda máxima do depósito molhada'],
      ['wellMinWet', 'Sonda mínima do poço molhada'], ['wellMaxWet', 'Sonda máxima do poço molhada'],
    ] as const).map(([key, label]) => <label key={key} className="dc-inspector-state-row is-toggle"><span className="dc-inspector-state-label">{label}</span>
      <input aria-label={label} type="checkbox" checked={!!s[key]} disabled={configDisabled || s.probeMode !== 'virtual'} onChange={(event) => configure({ [key]: event.target.checked })} /></label>)}
    <dl className="dc-industrial-status" aria-label="Estado do nível">
      <Readout label="Poço disponível">{s.wellReady ? 'Sim' : 'Não'}</Readout><Readout label="Pedido do depósito">{s.tankDemand ? 'Encher' : 'Satisfeito'}</Readout>
    </dl>{status}
  </div>

  const profile = micoProfile(type)
  if (profile) {
    const channels = (s.channels ?? {}) as Record<string, { on?: boolean; tripped?: boolean; fault?: boolean; currentA?: number; setpointA?: number }>
    return <div className="dc-industrial-controls" data-device-controls="mico">
      <h3 className="dc-field-label">Proteção por canal · {profile.count} canais</h3>
      {Array.from({ length: profile.count }, (_, index) => {
        const id = String(index + 1), channel = channels[id] ?? {}
        return <div key={id} className="dc-industrial-channel">
          <label className="dc-inspector-state-row"><span className="dc-inspector-state-label">Canal {id} · regulação</span><Select aria-label={`Corrente nominal do canal ${id} (A)`} className="dc-input dc-inspector-state-input" disabled={configDisabled} value={number(channel.setpointA, 1)} onChange={(event) => {
            const value = Number(event.target.value)
            if (!(profile.currents as readonly number[]).includes(value)) return
            const live = useSimStore.getState().components.find((item) => item.id === c.id)
            if (!live) return
            const patch = industrialControlPatch(type, live.state, `sel${id}` as IndustrialControl)
            patch.channels[id].setpointA = value
            configure(patch)
          }}>{profile.currents.map((amps) => <option key={amps} value={amps}>{amps} A</option>)}</Select></label>
          <dl className="dc-industrial-status"><Readout label={`Estado do canal ${id}`}>{channel.fault ? 'Defeito interno' : channel.tripped ? 'Disparado' : channel.on ? 'Ligado' : 'Desligado'}</Readout><Readout label={`Corrente do canal ${id}`}>{number(channel.currentA).toLocaleString('pt-PT')} A</Readout></dl>
          <button type="button" className="dc-btn" disabled={actDisabled} title={actDisabled ? MANOBRA_BLOCKED_TITLE : undefined} onClick={() => act(`ch${id}` as IndustrialControl)}>{channel.on ? 'Desligar' : 'Ligar'} canal {id}</button>
        </div>
      })}
      <p className="dc-industrial-help">Alterar a regulação coloca o canal em OFF, como o seletor do equipamento. A manobra dos canais e a entrada ON remota pertencem à simulação.</p>
      <dl className="dc-industrial-status"><Readout label="Contacto de alarme">{s.alarmOpen ? 'Aberto' : 'Fechado'}</Readout><Readout label="Comando ON remoto">{s.onRemote ? 'Ativo' : 'Inativo'}</Readout></dl>{status}
    </div>
  }

  if (type === 'relayFinder5534') return <div className="dc-industrial-controls" data-device-controls="finder">
    <p className="dc-industrial-help">Bobina de 24 V CC; quatro contactos inversores. O teste mecânico é momentâneo.</p>
    <MomentaryButton component={c} stateKey="testPressed" disabled={actDisabled}>TEST · manter premido</MomentaryButton>{status}
  </div>
  if (type === 'buzzerMetaltexTby301') return <div className="dc-industrial-controls" data-device-controls="industrial-buzzer">
    <p className="dc-industrial-help">110 V CA; o som depende da alimentação e do limite de serviço contínuo.</p>
    <dl className="dc-industrial-status"><Readout label="Sinal sonoro">{s.on ? 'Ativo' : 'Inativo'}</Readout><Readout label="Tempo de serviço contínuo">{time(s.activeMs)}</Readout><Readout label="Limite de serviço">{s.dutyLimitReached ? 'Atingido' : 'Disponível'}</Readout></dl>{status}
  </div>
  if (type.startsWith('pushButtonXb2')) return <div className="dc-industrial-controls" data-device-controls="xb2">
    <p className="dc-industrial-help">{type === 'pushButtonXb2Nc' ? 'Contacto normalmente fechado (NF).' : 'Contacto normalmente aberto (NA).'} Retorno por mola.</p>
    <MomentaryButton component={c} stateKey="pressed" disabled={actDisabled}>Premir botão · manter premido</MomentaryButton>
    <dl className="dc-industrial-status"><Readout label="Posição do botão">{s.pressed ? 'Premido' : 'Em repouso'}</Readout></dl>
  </div>
  return <p className="dc-industrial-help">{INDUSTRIAL_INFO[type].scope}</p>
}
