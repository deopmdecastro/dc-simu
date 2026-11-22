import { localBridgeUrl, type ExternalControllerRuntime, type ExternalTelemetryFrame } from './externalController'

export interface BridgeInstance { name: string }
type Mapping = { inputs: Record<string,string>; outputs: Record<string,string> }

export async function bridgeRequest(url: string, token: string, path: string, body: unknown, signal?: AbortSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort',abort,{ once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(abort, 1200)
  try {
    const response = await fetch(localBridgeUrl(url) + path, {
      method: 'POST', mode: 'cors', cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', 'X-DC-Simu-Key': token },
      body: JSON.stringify(body), signal: controller.signal,
    })
    const data = await response.json()
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `Ponte: HTTP ${response.status}`)
    if (data.protocol !== 'dc-simu-plcsim/1') throw new Error('A ponte local tem uma versão de protocolo incompatível.')
    return data
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
      throw new Error('Sem resposta da ponte local. Inicie a ponte no Windows e confirme a permissão de rede local do navegador.')
    }
    throw error
  } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort) }
}

/** Uma troca de cada vez; fechar a ligação invalida também respostas em trânsito. */
export class ExternalControllerClient {
  private closed = false
  private session: string | null = null
  private timer?: ReturnType<typeof setTimeout>
  private abort = new AbortController()
  private telemetry: ExternalTelemetryFrame[] = []
  private sequence = 0
  constructor(private options: {
    url: string; token: string; instanceName: string; mapping: Mapping
    readInputs: () => Record<string,boolean>
    onFrame: (runtime: ExternalControllerRuntime) => void
    onError: (message: string) => void
  }) {}

  async connect() {
    try {
      const { url, token, instanceName, mapping } = this.options
      const data = await bridgeRequest(url,token,'/connect',{
        instanceName, inputs: Object.values(mapping.inputs), outputs: Object.values(mapping.outputs),
      })
      if (typeof data.sessionId !== 'string') throw new Error('A ponte não devolveu uma sessão válida.')
      this.session = data.sessionId
      if (this.closed) { await this.disconnect(); return }
      await this.exchange()
    } catch (error) {
      if (this.closed) return
      await this.fail(error)
      throw error
    }
  }

  private async exchange() {
    if (this.closed || !this.session) return
    const { url, token, mapping } = this.options
    const local = this.options.readInputs()
    const sentAt = Date.now()
    const inputs = Object.fromEntries(Object.entries(mapping.inputs).map(([address,remote]) => [remote,local[address] === true]))
    try {
      const data = await bridgeRequest(url,token,'/exchange',{ sessionId: this.session, inputs },this.abort.signal)
      if (this.closed) return
      if (!data.outputs || typeof data.outputs !== 'object' || !data.inputs || typeof data.inputs !== 'object' || typeof data.cpuState !== 'string') throw new Error('Resposta de E/S incompleta.')
      const outputs: Record<string,boolean> = {}
      const acknowledgedInputs: Record<string,boolean> = {}
      for (const [address,remote] of Object.entries(mapping.inputs)) {
        if (typeof data.inputs[remote] !== 'boolean') throw new Error(`Falta a confirmação da entrada ${remote}.`)
        acknowledgedInputs[address] = data.inputs[remote]
      }
      for (const [address,remote] of Object.entries(mapping.outputs)) {
        if (typeof data.outputs[remote] !== 'boolean') throw new Error(`Falta a saída ${remote} na resposta da CPU.`)
        outputs[address] = data.outputs[remote]
      }
      const receivedAt = Date.now()
      this.telemetry = [...this.telemetry.slice(-59), { sequence: ++this.sequence, sentAt, receivedAt, latencyMs: receivedAt-sentAt, cpuState: data.cpuState, inputs: { ...local }, acknowledgedInputs, outputs }]
      this.options.onFrame({ status: 'connected', message: 'Ligado ao PLCSIM Advanced', cpuState: data.cpuState, receivedAt, outputs, telemetry: this.telemetry })
      this.timer = setTimeout(() => { void this.exchange().catch(() => {}) },100)
    } catch (error) {
      if (!this.closed) { await this.fail(error); throw error }
    }
  }

  private async fail(error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha de comunicação com o PLCSIM.'
    this.options.onError(message)
    await this.disconnect()
  }

  async disconnect() {
    this.closed = true
    clearTimeout(this.timer)
    this.abort.abort()
    const sessionId = this.session
    this.session = null
    if (sessionId) await bridgeRequest(this.options.url,this.options.token,'/disconnect',{ sessionId }).catch(() => {})
  }
}
