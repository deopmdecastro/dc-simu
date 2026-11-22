import { useMemo, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { ElectricalComponent } from '../types'
import { controllerMappings, externalOutputsUsable, isIoAddress, localBridgeUrl } from '../plc/externalController'
import { bridgeRequest } from '../plc/externalTransport'

/**
 * Ligação do PLC do cenário a uma CPU simulada no S7-PLCSIM Advanced (programa feito no TIA Portal),
 * através da ponte local (scripts/Start-TiaBridge.ps1). O DC-Simu escreve as entradas I e lê as saídas Q.
 * A chave da sessão nunca é guardada no projeto: vive só neste ecrã enquanto está aberto.
 */
const STATUS_LABEL = { disconnected: 'Desligado', connecting: 'A ligar…', connected: 'Ligado', error: 'Erro' } as const

export default function TiaPortalControls({ plc }: { plc: ElectricalComponent }) {
  const config = useSimStore((s) => s.controller)
  const runtime = useSimStore((s) => s.externalController)
  const runState = useSimStore((s) => s.sim.runState)
  const setConfig = useSimStore((s) => s.setControllerConfig)
  const [key, setKey] = useState('')
  const [instances, setInstances] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  const tia = config.mode === 'tia-portal'
  const thisPlc = tia && config.plcId === plc.id
  const otherPlc = tia && config.plcId !== null && config.plcId !== plc.id
  const connected = runtime.status === 'connected' || runtime.status === 'connecting'
  const stopped = runState === 'stopped'
  const configLocked = !stopped || connected

  const rows = useMemo(() => {
    const labels = (prefix: 'I' | 'Q') => [...new Set(plc.terminals.map((t) => t.label).filter((a) => isIoAddress(a, prefix)))]
    return { inputs: labels('I'), outputs: labels('Q') }
  }, [plc.terminals])
  const mappingError = useMemo(() => {
    if (!thisPlc) return ''
    try { controllerMappings(config, plc); return '' } catch (error) { return error instanceof Error ? error.message : 'Mapeamento inválido.' }
  }, [config, plc, thisPlc])
  const bridgeError = useMemo(() => { try { localBridgeUrl(config.bridgeUrl); return '' } catch (error) { return error instanceof Error ? error.message : 'Endereço inválido.' } }, [config.bridgeUrl])

  const choose = (mode: 'internal' | 'tia-portal') => {
    setLocalError('')
    if (mode === 'internal') setConfig({ mode: 'internal' })
    else setConfig({ mode: 'tia-portal', plcId: plc.id })
  }
  const remap = (dir: 'inputs' | 'outputs', local: string, remote: string) => {
    const next = { ...config[dir] }
    const value = remote.trim().toUpperCase()
    if (!value || value === local) delete next[local]; else next[local] = value
    setConfig({ [dir]: next })
  }
  const findInstances = async () => {
    setLocalError(''); setBusy(true)
    try {
      const data = await bridgeRequest(config.bridgeUrl, key.trim(), '/instances', {})
      const names = Array.isArray(data.instances) ? data.instances.map((i: { name?: unknown }) => String(i?.name ?? '')).filter(Boolean) : []
      setInstances(names)
      if (!names.length) setLocalError('A ponte respondeu, mas não há instâncias no PLCSIM Advanced. Crie uma e carregue o programa a partir do TIA Portal.')
      else if (!config.instanceName) setConfig({ instanceName: names[0] })
    } catch (error) {
      setInstances(null); setLocalError(error instanceof Error ? error.message : 'Não foi possível contactar a ponte.')
    } finally { setBusy(false) }
  }
  const connect = async () => {
    setLocalError(''); setBusy(true)
    try { await useSimStore.getState().connectExternalController(key) }
    catch (error) { setLocalError(error instanceof Error ? error.message : 'Não foi possível ligar.') }
    finally { setBusy(false) }
  }

  return (
    <div className="dc-tia flex flex-col gap-2 text-[11px]" data-tia-panel>
      <div className="dc-tia-mode" role="radiogroup" aria-label="Programa do PLC">
        <button type="button" role="radio" aria-checked={!thisPlc} className={`dc-btn text-[11px] justify-center ${!thisPlc ? 'dc-btn-primary' : ''}`} disabled={configLocked} onClick={() => choose('internal')} data-tia-mode="internal">Programa interno</button>
        <button type="button" role="radio" aria-checked={thisPlc} className={`dc-btn text-[11px] justify-center ${thisPlc ? 'dc-btn-primary' : ''}`} disabled={configLocked} onClick={() => choose('tia-portal')} data-tia-mode="tia-portal">TIA Portal</button>
      </div>
      {otherPlc && <p className="dc-tia-note">O TIA Portal está associado a outro PLC do cenário. Escolha «TIA Portal» para o usar neste.</p>}
      {!thisPlc && !otherPlc && <p className="dc-tia-note">O Ladder e o GRAFCET do DC-Simu comandam este PLC. Com «TIA Portal», quem decide as saídas é a CPU simulada no S7-PLCSIM Advanced.</p>}

      {thisPlc && <>
        <details className="dc-tia-help">
          <summary>Como ligar</summary>
          <ol>
            <li>No TIA Portal, carregue o programa numa instância do <b>S7-PLCSIM Advanced</b> (o PLCSIM normal não tem a API) e coloque a CPU em RUN.</li>
            <li>No Windows, execute <code>scripts\Start-TiaBridge.ps1</code> e copie a chave apresentada na consola.</li>
            <li>Cole a chave abaixo, escolha a instância e confirme o mapa de E/S.</li>
            <li>Carregue em «Ligar» e depois em ▶ para simular.</li>
          </ol>
        </details>

        <label className="dc-tia-field">
          <span>Ponte local</span>
          <input className="dc-input text-[11px]" value={config.bridgeUrl} disabled={configLocked} onChange={(e) => setConfig({ bridgeUrl: e.target.value })} spellCheck={false} data-tia-bridge-url />
        </label>
        {bridgeError && <p className="dc-tia-error">{bridgeError}</p>}
        <label className="dc-tia-field">
          <span>Chave da sessão</span>
          <input className="dc-input text-[11px] font-mono" type="password" autoComplete="off" value={key} disabled={connected} onChange={(e) => setKey(e.target.value)} placeholder="copiada da consola da ponte" data-tia-key />
        </label>
        <div className="dc-tia-field">
          <span>Instância PLCSIM</span>
          <div className="dc-tia-inline">
            {instances && instances.length
              ? <select className="dc-input text-[11px]" value={config.instanceName} disabled={configLocked} onChange={(e) => setConfig({ instanceName: e.target.value })} data-tia-instance>
                  {!instances.includes(config.instanceName) && config.instanceName && <option value={config.instanceName}>{config.instanceName}</option>}
                  {instances.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              : <input className="dc-input text-[11px]" value={config.instanceName} disabled={configLocked} onChange={(e) => setConfig({ instanceName: e.target.value })} placeholder="nome da instância" data-tia-instance />}
            <button type="button" className="dc-btn text-[11px]" disabled={busy || connected || !key.trim() || !!bridgeError} onClick={() => void findInstances()} data-tia-find>Procurar</button>
          </div>
        </div>

        <details className="dc-tia-map" data-tia-map>
          <summary>Mapa de E/S ({rows.inputs.length} I · {rows.outputs.length} Q)</summary>
          <p className="dc-tia-note">Borne do PLC no DC-Simu → endereço na CPU do TIA Portal. Por omissão são iguais.</p>
          <table>
            <thead><tr><th>Borne</th><th>CPU</th><th>Sentido</th></tr></thead>
            <tbody>
              {(['inputs', 'outputs'] as const).flatMap((dir) => rows[dir].map((local) => (
                <tr key={dir + local}>
                  <td className="font-mono">{local}</td>
                  <td><input className="dc-input text-[11px] font-mono" value={config[dir][local] ?? local} disabled={configLocked} onChange={(e) => remap(dir, local, e.target.value)} aria-label={`Endereço na CPU para ${local}`} data-tia-map-row={local} /></td>
                  <td>{dir === 'inputs' ? 'DC-Simu → CPU' : 'CPU → DC-Simu'}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </details>
        {mappingError && <p className="dc-tia-error" data-tia-map-error>{mappingError}</p>}

        <div className="dc-tia-actions">
          {!connected && <button type="button" className="dc-btn dc-btn-primary text-[11px] justify-center" disabled={busy || !stopped || !key.trim() || !config.instanceName.trim() || !!mappingError || !!bridgeError} onClick={() => void connect()} title={!stopped ? 'Pare a simulação (■) para ligar' : undefined} data-tia-connect>Ligar</button>}
        </div>
        {localError && <p className="dc-tia-error" role="alert" data-tia-error>{localError}</p>}
        <TiaLiveStatus plc={plc} />
      </>}
    </div>
  )
}

/**
 * Estado ao vivo da ligação TIA (estado, CPU, latência, imagem de E/S e «Desligar»). Aparece no
 * inspetor e no painel «Simulação», que é o que fica visível em RUN (o inspetor esconde-se em RUN).
 */
export function TiaLiveStatus({ plc }: { plc: ElectricalComponent }) {
  const runtime = useSimStore((s) => s.externalController)
  const stopped = useSimStore((s) => s.sim.runState === 'stopped')
  const connected = runtime.status === 'connected' || runtime.status === 'connecting'
  const rows = useMemo(() => {
    const labels = (prefix: 'I' | 'Q') => [...new Set(plc.terminals.map((t) => t.label).filter((a) => isIoAddress(a, prefix)))]
    return { inputs: labels('I'), outputs: labels('Q') }
  }, [plc.terminals])
  const last = runtime.telemetry[runtime.telemetry.length - 1]
  const live = externalOutputsUsable(runtime)
  const cpu = runtime.cpuState ? runtime.cpuState.toUpperCase() : '—'
  return (
    <div className="dc-tia-live flex flex-col gap-2 text-[11px]" data-tia-live>
      <dl className="dc-tia-status" aria-live="polite" data-tia-status={runtime.status}>
        <div><dt>TIA Portal</dt><dd className={`is-${runtime.status}`}>{STATUS_LABEL[runtime.status]}</dd></div>
        <div><dt>CPU</dt><dd className={cpu === 'RUN' ? 'is-connected' : ''} data-tia-cpu>{cpu}</dd></div>
        <div><dt>Latência</dt><dd className="font-mono">{last ? `${last.latencyMs} ms` : '—'}</dd></div>
        <div><dt>Trocas</dt><dd className="font-mono">{last ? last.sequence : 0}</dd></div>
      </dl>
      {runtime.status === 'error' && runtime.message && <p className="dc-tia-error" role="alert">{runtime.message}</p>}
      {runtime.status === 'connected' && !live && <p className="dc-tia-note">Ligado, mas a CPU não está em RUN: as saídas ficam desligadas. Coloque a CPU em RUN no TIA Portal ou no PLCSIM.</p>}
      {runtime.status === 'connected' && live && stopped && <p className="dc-tia-note">CPU em RUN. Carregue em ▶ para a simulação trocar sinais com o TIA Portal.</p>}
      {runtime.status === 'disconnected' && !stopped && <p className="dc-tia-note">Sem ligação ao TIA Portal. Pare a simulação e ligue no inspetor do PLC.</p>}
      {last && connected && (
        <div className="dc-tia-io" data-tia-io>
          <div><b>Entradas</b>{rows.inputs.map((a) => <span key={a} className={last.acknowledgedInputs[a] ? 'is-on' : ''} title={`Enviado: ${last.inputs[a] ? 1 : 0} · Confirmado pela CPU: ${last.acknowledgedInputs[a] ? 1 : 0}`}>{a}</span>)}</div>
          <div><b>Saídas</b>{rows.outputs.map((a) => <span key={a} className={last.outputs[a] ? 'is-on' : ''}>{a}</span>)}</div>
        </div>
      )}
      {connected && <button type="button" className="dc-btn text-[11px] justify-center" onClick={() => useSimStore.getState().disconnectExternalController()} data-tia-disconnect>Desligar do TIA Portal</button>}
    </div>
  )
}
