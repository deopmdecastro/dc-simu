import http from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'
import readline from 'node:readline'
import { pathToFileURL } from 'node:url'

const protocol = 'dc-simu-plcsim/1'
export const WATCHDOG_MS = 1500
const validAddress = (a,prefix) => typeof a === 'string' && new RegExp(`^${prefix}(0|[1-9]\\d{0,4})\\.[0-7]$`).test(a) && Number(a.slice(1).split('.')[0]) <= 65535
const addresses = (raw,prefix) => {
  if (!Array.isArray(raw) || !raw.length || raw.length > 256 || raw.some(a => !validAddress(a,prefix)) || new Set(raw).size !== raw.length) throw new Error(`Mapeamento ${prefix} inválido, vazio ou repetido.`)
  return raw
}

export class PlcsimProcess {
  constructor(executable,sdk) {
    this.sequence = 0; this.pending = new Map()
    this.child = spawn(executable,[sdk],{ windowsHide: true, stdio: ['pipe','pipe','pipe'] })
    this.child.stderr.on('data',chunk => process.stderr.write(chunk))
    const fail = error => { for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error) }; this.pending.clear() }
    this.child.on('error',fail)
    this.child.on('exit',() => fail(new Error('O adaptador PLCSIM terminou. Reinicie a ponte.')))
    readline.createInterface({ input: this.child.stdout }).on('line',line => {
      let data
      try { data = JSON.parse(line) } catch { return }
      const request = this.pending.get(data.id)
      if (!request) return
      clearTimeout(request.timer); this.pending.delete(data.id)
      if (data.ok) request.resolve(data.result)
      else request.reject(new Error(data.error || 'Erro da API PLCSIM Advanced.'))
    })
  }
  request(method,body = {}) {
    return new Promise((resolve,reject) => {
      const id = ++this.sequence
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Tempo limite da API PLCSIM.')); this.child.kill() },1200)
      this.pending.set(id,{ resolve,reject,timer })
      this.child.stdin.write(JSON.stringify({ ...body,id,method })+'\n',error => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(error) }
      })
    })
  }
  close() { this.child.stdin.end() }
}

/** Serviço exclusivamente local. Só a área I é escrita; a área Q é de leitura. */
export function createTiaBridge({ adapter, token, origins = [], now = Date.now, watchdogMs = WATCHDOG_MS }) {
  if (!token || token.length < 16) throw new Error('A chave da ponte tem de ter pelo menos 16 caracteres.')
  let session = null, queue = Promise.resolve(), closing = false
  const serial = task => { const next = queue.then(task); queue = next.catch(() => {}); return next }
  const release = async () => { session = null; await adapter.request('disconnect') }
  const allowedOrigin = value => {
    if (!value) return true // Clientes locais de diagnóstico também têm de fornecer a chave.
    try { const u = new URL(value); return (u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname)) || origins.includes(u.origin) } catch { return false }
  }
  const watchdog = setInterval(() => {
    if (session && now()-session.seenAt > watchdogMs) {
      session = null
      void serial(() => adapter.request('disconnect')).catch(() => {})
    }
  },100)
  watchdog.unref()
  const server = http.createServer(async (request,response) => {
    const reply = (status,data) => { response.writeHead(status,{ 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store' }); response.end(JSON.stringify({ protocol,...data })) }
    try {
      const host = new URL(`http://${request.headers.host}`).hostname
      if (!['localhost','127.0.0.1'].includes(host) || !allowedOrigin(request.headers.origin)) return reply(403,{ error:'Origem não autorizada pela ponte local.' })
      if (request.headers.origin) {
        response.setHeader('Access-Control-Allow-Origin',request.headers.origin)
        response.setHeader('Vary','Origin')
        response.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS')
        response.setHeader('Access-Control-Allow-Headers','Content-Type, X-DC-Simu-Key')
        response.setHeader('Access-Control-Allow-Private-Network','true')
      }
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
      if (request.method === 'GET' && request.url === '/health') return reply(200,{ service:'DC-Simu TIA Bridge' })
      const supplied = Buffer.from(String(request.headers['x-dc-simu-key'] || '')), expected = Buffer.from(token)
      if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) return reply(401,{ error:'Chave da ponte inválida. Copie a chave apresentada na consola da ponte.' })
      if (request.method !== 'POST' || request.headers['content-type']?.split(';')[0] !== 'application/json') return reply(415,{ error:'Use POST com JSON.' })
      let raw = '', length = 0
      for await (const chunk of request) { length += chunk.length; if (length > 65536) return reply(413,{ error:'Pedido demasiado grande.' }); raw += chunk.toString('utf8') }
      const body = JSON.parse(raw)
      const result = await serial(async () => {
        if (closing) throw new Error('A ponte está a terminar.')
        if (request.url === '/instances') return adapter.request('list')
        if (request.url === '/connect') {
          if (session) throw new Error('A ponte já está ligada a outra sessão. Desligue-a primeiro.')
          if (typeof body.instanceName !== 'string' || !body.instanceName.trim() || body.instanceName.length > 128) throw new Error('Escolha uma instância PLCSIM Advanced.')
          const inputs = addresses(body.inputs,'I'), outputs = addresses(body.outputs,'Q')
          const data = await adapter.request('connect',{ instanceName:body.instanceName,inputs,outputs })
          session = { id:randomBytes(24).toString('hex'),inputs,outputs,seenAt:now() }
          return { ...data,sessionId:session.id }
        }
        if (!session || body.sessionId !== session.id) throw new Error('Sessão expirada ou desligada. Volte a ligar.')
        if (request.url === '/disconnect') { await release(); return { disconnected:true } }
        if (request.url !== '/exchange') throw new Error('Operação desconhecida.')
        if (!body.inputs || typeof body.inputs !== 'object' || Array.isArray(body.inputs) || Object.keys(body.inputs).length !== session.inputs.length || session.inputs.some(a => typeof body.inputs[a] !== 'boolean')) throw new Error('Imagem de entradas inválida ou incompleta.')
        session.seenAt = now()
        try {
          const data = await adapter.request('exchange',{ inputs:body.inputs })
          if (!data.outputs || session.outputs.some(a => typeof data.outputs[a] !== 'boolean') || !data.inputs || session.inputs.some(a => typeof data.inputs[a] !== 'boolean')) throw new Error('Telemetria de E/S incompleta.')
          return data
        } catch (error) { await release().catch(() => {}); throw error }
      })
      reply(200,result)
    } catch (error) { reply(400,{ error:error.message || 'Pedido inválido.' }) }
  })
  server.requestTimeout = 3000
  server.headersTimeout = 3000
  return { server, async close() { closing = true; clearInterval(watchdog); await serial(release).catch(() => {}); adapter.close?.(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [executable,sdk] = process.argv.slice(2)
  if (!executable || !sdk) throw new Error('Inicie através de scripts/Start-TiaBridge.ps1.')
  const token = randomBytes(24).toString('hex')
  const adapter = new PlcsimProcess(executable,sdk)
  const bridge = createTiaBridge({ adapter,token,origins:(process.env.DC_SIMU_ORIGINS || '').split(',').filter(Boolean) })
  const port = Number(process.env.DC_SIMU_TIA_PORT || 8787)
  bridge.server.listen(port,'127.0.0.1',() => {
    console.log(`DC-Simu ↔ PLCSIM Advanced: http://127.0.0.1:${port}`)
    console.log(`Chave da sessão (copiar para o DC-Simu): ${token}`)
    console.log('Mantenha esta consola aberta. Ctrl+C termina a ligação e repõe as entradas geridas a 0.')
  })
  process.on('SIGINT',() => { void bridge.close().then(() => process.exit(0)) })
  process.on('SIGTERM',() => { void bridge.close().then(() => process.exit(0)) })
}
