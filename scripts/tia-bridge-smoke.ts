import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
// @ts-expect-error módulo JS da ponte local (sem tipos)
import { createTiaBridge } from '../bridge/tia/server.mjs'
import { createComponent } from '../src/electrical/factory'
import { useSimStore } from '../src/store/useSimStore'
import type { ElectricalComponent } from '../src/types'

/**
 * Ligação TIA Portal de ponta a ponta, sem software da Siemens: a ponte local REAL
 * (bridge/tia/server.mjs) fala com um PLCSIM Advanced falso que executa um programa simples
 * (Q0.0 = I0.0, Q0.1 = NOT I0.0). Cobre ligar, trocar E/S com a simulação, CPU em STOP,
 * chave errada, instância inexistente e desligar.
 */
let passed = 0
async function check(name: string, fn: () => Promise<void> | void) {
  await fn()
  passed += 1
  console.log(`  PASS: ${name}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(label: string, fn: () => boolean, ms = 3000) {
  const t0 = Date.now()
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error('Tempo esgotado: ' + label); await sleep(20) }
}

// --- PLCSIM Advanced falso (mesmo contrato JSON do PlcsimAdapter.cs) ---
const cpu = { state: 'Run', inputs: {} as Record<string, boolean>, wired: [] as string[], outs: [] as string[] }
const adapter = {
  async request(method: string, body: Record<string, unknown> = {}) {
    if (method === 'list') return { instances: [{ name: 'CPU_Estampagem' }] }
    if (method === 'disconnect') { cpu.inputs = {}; return { disconnected: true } }
    if (method === 'connect') {
      if (body.instanceName !== 'CPU_Estampagem') throw new Error('Instância PLCSIM Advanced não encontrada.')
      cpu.wired = body.inputs as string[]; cpu.outs = body.outputs as string[]
      return { cpuState: cpu.state }
    }
    if (method === 'exchange') {
      cpu.inputs = { ...(body.inputs as Record<string, boolean>) }
      const run = cpu.state === 'Run', i0 = !!cpu.inputs['I0.0']
      const outputs = Object.fromEntries(cpu.outs.map((a) => [a, run && (a === 'Q0.0' ? i0 : a === 'Q0.1' ? !i0 : false)]))
      return { cpuState: cpu.state, inputs: Object.fromEntries(cpu.wired.map((a) => [a, !!cpu.inputs[a]])), outputs }
    }
    throw new Error('Método desconhecido')
  },
  close() {},
}
const token = 'chave-de-teste-0123456789abcdef'
const bridge = createTiaBridge({ adapter, token, origins: [] })
await new Promise<void>((r) => bridge.server.listen(0, '127.0.0.1', () => r()))
const url = `http://127.0.0.1:${(bridge.server.address() as AddressInfo).port}`

const st = () => useSimStore.getState()
const plc = createComponent('plcSiemensS71500Cpu1511c' as never, 'PLC1', '', 0, 0, 0) as ElectricalComponent
useSimStore.setState({ components: [plc], wires: [], selectedComponentIds: [] })
const table = () => st().runtime.plcRuntime[plc.id]?.table ?? {}
// O RUN real usa window.setInterval (como no navegador).
;(globalThis as unknown as { window: typeof globalThis }).window ??= globalThis

console.log('=== Smoke Test: DC-Simu ↔ TIA Portal (ponte local + PLCSIM Advanced simulado) ===')
try {
  await check('1. Modo TIA Portal: configuração associada ao PLC, ponte local e mapa I/Q por omissão válido', () => {
    st().setControllerConfig({ mode: 'tia-portal', plcId: plc.id, bridgeUrl: url, instanceName: 'CPU_Estampagem' })
    assert.equal(st().controller.mode, 'tia-portal')
    assert.equal(st().controller.plcId, plc.id)
  })

  await check('2. Sem ligação, ▶ é recusado em modo TIA (não corre o Ladder interno às escondidas)', () => {
    st().play()
    assert.equal(st().sim.runState, 'stopped')
  })

  await check('3. Chave errada é recusada pela ponte, sem ligação', async () => {
    await assert.rejects(st().connectExternalController('chave-errada-xxxxxxxxxxxx'), /Chave da ponte inválida/)
    assert.equal(st().externalController.status, 'error')
  })

  await check('4. Instância inexistente é recusada com mensagem clara', async () => {
    st().setControllerConfig({ instanceName: 'NaoExiste' })
    await assert.rejects(st().connectExternalController(token), /Instância PLCSIM Advanced não encontrada/)
    st().setControllerConfig({ instanceName: 'CPU_Estampagem' })
  })

  await check('5. Ligar: sessão aberta, CPU em RUN e trocas periódicas com telemetria', async () => {
    await st().connectExternalController(token)
    await until('primeira troca', () => st().externalController.status === 'connected' && st().externalController.telemetry.length >= 2)
    assert.equal(st().externalController.cpuState.toUpperCase(), 'RUN')
    assert.ok(cpu.wired.includes('I0.0') && cpu.outs.includes('Q0.0'), 'mapa enviado à CPU')
  })

  await check('6. Entrada do DC-Simu chega à CPU e a saída da CPU aciona o PLC do cenário', async () => {
    st().play()
    assert.equal(st().sim.runState, 'running', 'RUN permitido com a CPU ligada e em RUN')
    await until('Q0.1 = NOT I0.0 com I0.0 a 0', () => table()['Q0.1'] === true && table()['Q0.0'] === false)
    st().setPlcSimInput(plc.id, 'I0.0', true)
    await until('CPU recebe I0.0 e devolve Q0.0', () => cpu.inputs['I0.0'] === true && table()['Q0.0'] === true)
    assert.equal(table()['Q0.0'], true, 'Q0.0 = I0.0 no PLC do cenário')
    assert.equal(table()['Q0.1'], false, 'Q0.1 = NOT I0.0')
    const last = st().externalController.telemetry.at(-1)!
    assert.equal(last.acknowledgedInputs['I0.0'], true, 'a CPU confirma a entrada')
  })

  await check('7. CPU em STOP no PLCSIM: as saídas do cenário caem para 0', async () => {
    cpu.state = 'Stop'
    await until('CPU em STOP', () => st().externalController.cpuState.toUpperCase() === 'STOP')
    await until('saídas a 0', () => table()['Q0.0'] === false)
    assert.equal(table()['Q0.0'], false)
    assert.equal(table()['Q0.1'], false)
    cpu.state = 'Run'
  })

  await check('8. Desligar fecha a sessão na ponte e para a simulação', async () => {
    st().disconnectExternalController()
    await sleep(150)
    assert.equal(st().externalController.status, 'disconnected')
    assert.equal(st().sim.runState, 'stopped')
    assert.deepEqual(cpu.inputs, {}, 'a ponte repõe as entradas geridas')
  })

  await check('9. A chave da sessão não fica no projeto guardado', () => {
    assert.ok(!JSON.stringify(st().controller).includes(token))
  })
} finally {
  st().disconnectExternalController()
  await bridge.close()
}
console.log(`\n✅ ${passed} verificações da ligação ao TIA Portal passaram`)
process.exit(0)
