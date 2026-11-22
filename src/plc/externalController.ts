import type { ElectricalComponent } from '../types'

export type ControllerMode = 'internal' | 'tia-portal'
export interface ExternalControllerConfig {
  mode: ControllerMode
  plcId: string | null
  bridgeUrl: string
  instanceName: string
  inputs: Record<string, string>
  outputs: Record<string, string>
}
export interface ExternalControllerRuntime {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  message: string
  cpuState: string
  receivedAt: number
  outputs: Record<string, boolean>
  telemetry: ExternalTelemetryFrame[]
}
export interface ExternalTelemetryFrame {
  sequence: number
  sentAt: number
  receivedAt: number
  latencyMs: number
  cpuState: string
  inputs: Record<string, boolean>
  acknowledgedInputs: Record<string, boolean>
  outputs: Record<string, boolean>
}
export const EXTERNAL_WATCHDOG_MS = 1500
export const defaultControllerConfig = (): ExternalControllerConfig => ({
  mode: 'internal', plcId: null, bridgeUrl: 'http://127.0.0.1:8787', instanceName: '', inputs: {}, outputs: {},
})
export const disconnectedController = (message = 'Desligado'): ExternalControllerRuntime => ({
  status: 'disconnected', message, cpuState: '', receivedAt: 0, outputs: {}, telemetry: [],
})
export const isIoAddress = (address: string, prefix: 'I' | 'Q') =>
  new RegExp(`^${prefix}(0|[1-9]\\d{0,4})\\.[0-7]$`).test(address) && Number(address.slice(1).split('.')[0]) <= 65535

export function localBridgeUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('A ponte deve usar http://127.0.0.1:porta ou http://localhost:porta.')
  }
  return url.origin
}

export function normalizeControllerConfig(raw: unknown): ExternalControllerConfig {
  const defaults = defaultControllerConfig()
  if (!raw || typeof raw !== 'object') return defaults
  const c = raw as Partial<ExternalControllerConfig>
  let bridgeUrl = defaults.bridgeUrl
  try { bridgeUrl = localBridgeUrl(String(c.bridgeUrl ?? defaults.bridgeUrl)) } catch { /* configuração importada nunca estabelece uma ligação */ }
  const mapping = (raw: unknown, prefix: 'I' | 'Q') => raw && typeof raw === 'object'
    ? Object.fromEntries(Object.entries(raw).filter(([key, value]) => isIoAddress(key, prefix) && typeof value === 'string').slice(0, 256).map(([k,v]) => [k,String(v).trim().toUpperCase().slice(0,32)])) : {}
  return {
    mode: c.mode === 'tia-portal' ? 'tia-portal' : 'internal',
    plcId: typeof c.plcId === 'string' ? c.plcId : null, bridgeUrl,
    instanceName: typeof c.instanceName === 'string' ? c.instanceName.slice(0,128) : '',
    inputs: mapping(c.inputs, 'I'), outputs: mapping(c.outputs, 'Q'),
  }
}

/** Endereço do borne no DC-Simu → endereço de processo da CPU no TIA Portal. */
export function controllerMappings(config: ExternalControllerConfig, plc: ElectricalComponent) {
  const direction = (prefix: 'I' | 'Q', overrides: Record<string,string>) => {
    const rows = [...new Set(plc.terminals.map(t => t.label).filter(a => isIoAddress(a,prefix)))]
    const pairs = rows.map(local => [local, overrides[local] ?? local] as const)
    if (!pairs.length) throw new Error(`O PLC selecionado não tem bornes ${prefix}.`)
    if (pairs.length > 256) throw new Error('Máximo de 256 sinais por direção.')
    if (pairs.some(([,remote]) => !isIoAddress(remote,prefix))) throw new Error(`Use endereços ${prefix}byte.bit, por exemplo ${prefix}0.0.`)
    if (new Set(pairs.map(([,remote]) => remote)).size !== pairs.length) throw new Error(`Existem endereços ${prefix} repetidos no mapeamento.`)
    return Object.fromEntries(pairs)
  }
  return { inputs: direction('I',config.inputs), outputs: direction('Q',config.outputs) }
}

export function externalOutputsUsable(runtime: ExternalControllerRuntime, now = Date.now()) {
  return runtime.status === 'connected' && runtime.cpuState.toUpperCase() === 'RUN'
    && runtime.receivedAt > 0 && now - runtime.receivedAt <= EXTERNAL_WATCHDOG_MS
}
