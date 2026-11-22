import path from 'node:path'
import { createTiaBridge } from '../bridge/tia/server.mjs'
import { inspectorFixture } from './lib/inspector-fixture.mjs'

/** Ecrã «Controlador TIA Portal» no inspetor real do PLC, contra a ponte local REAL e um PLCSIM
 *  Advanced simulado (Q0.0 = I0.0): escolher o modo, procurar a instância, validar o mapa de E/S,
 *  ligar, ver CPU/latência/E/S ao vivo e desligar. */
const output = process.env.TIA_PANEL_OUTPUT || path.resolve('runtime/tia-panel')
const cpu = { state: 'Run', inputs: {}, wired: [], outs: [] }
const adapter = {
  async request(method, body = {}) {
    if (method === 'list') return { instances: [{ name: 'CPU_Estampagem' }] }
    if (method === 'disconnect') { cpu.inputs = {}; return { disconnected: true } }
    if (method === 'connect') { cpu.wired = body.inputs; cpu.outs = body.outputs; return { cpuState: cpu.state } }
    if (method === 'exchange') {
      cpu.inputs = { ...body.inputs }
      const outputs = Object.fromEntries(cpu.outs.map((a) => [a, cpu.state === 'Run' && a === 'Q0.0' && !!cpu.inputs['I0.0']]))
      return { cpuState: cpu.state, inputs: Object.fromEntries(cpu.wired.map((a) => [a, !!cpu.inputs[a]])), outputs }
    }
    throw new Error('Método desconhecido')
  },
  close() {},
}
const token = 'chave-ui-0123456789abcdef0123'
const bridge = createTiaBridge({ adapter, token })
await new Promise((r) => bridge.server.listen(0, '127.0.0.1', r))
const bridgeUrl = `http://127.0.0.1:${bridge.server.address().port}`

const f = await inspectorFixture({ baseURL: process.env.TIA_PANEL_TEST_URL, output, height: 1100 }), { page, check, store, show, frame } = f
// O fixture bloqueia origens externas; a ponte local é a exceção (como no navegador do utilizador).
await f.context.route(bridgeUrl + '/**', (route) => route.continue())
// Chrome (Local Network Access): o acesso a 127.0.0.1 exige a autorização que o utilizador dá uma vez.
await f.context.grantPermissions(['local-network-access'], { origin: new URL(f.page.url()).origin })
const panel = page.locator('[data-tia-panel]')
// Inspetor real + painel «Simulação» real lado a lado (em RUN o inspetor esconde-se; o painel fica).
await page.evaluate(async () => {
  const React = window.__fixtureReact, { default: Sidebar } = await import('/src/components/Sidebar.tsx'), { default: SimulationDock } = await import('/src/components/SimulationDock.tsx')
  window.__fixtureRoot.render(React.createElement('div', { style: { display: 'flex', height: '100dvh' } },
    React.createElement(Sidebar, { width: 'min(380px, 100vw)', quickAddOnPick: true }),
    React.createElement('div', { style: { width: 420, overflow: 'auto' } }, React.createElement(SimulationDock, {}))))
})
try {
  const [plcId] = await show('plcSiemensS71500Cpu1511c')
  await page.locator('[data-tia-group] > summary').click(); await frame()
  check(await page.locator('[data-tia-mode="internal"]').getAttribute('aria-checked') === 'true', 'Por omissão o PLC usa o programa interno (Ladder/GRAFCET)')

  await page.click('[data-tia-mode="tia-portal"]'); await frame()
  const cfg = await store((s) => s.getState().controller)
  check(cfg.mode === 'tia-portal' && cfg.plcId === plcId, 'Escolher «TIA Portal» associa a CPU externa a este PLC')

  await page.fill('[data-tia-bridge-url]', bridgeUrl)
  await page.fill('[data-tia-key]', token)
  await page.click('[data-tia-find]')
  // Lista pendente da plataforma (ui/Select): o botão expõe o valor escolhido em `value`.
  await page.locator('button[data-tia-instance]').waitFor()
  check(await page.locator('button[data-tia-instance]').getAttribute('value') === 'CPU_Estampagem', '«Procurar» lista as instâncias do PLCSIM Advanced através da ponte')

  await page.locator('[data-tia-map] > summary').click()
  const rows = await page.locator('[data-tia-map-row]').count()
  check(rows === 32, `Mapa de E/S com todos os bornes I e Q do PLC (${rows})`)
  await page.fill('[data-tia-map-row="I0.0"]', 'X9'); await frame()
  check(await page.locator('[data-tia-map-error]').isVisible() && await page.locator('[data-tia-connect]').isDisabled(), 'Endereço inválido no mapa mostra o erro e impede «Ligar»')
  await page.fill('[data-tia-map-row="I0.0"]', 'I0.0'); await frame()
  check(!(await page.locator('[data-tia-map-error]').count()), 'Repor o endereço remove o erro')

  await page.click('[data-tia-connect]')
  await page.locator('[data-tia-panel] [data-tia-status="connected"]').waitFor({ timeout: 5000 })
  await panel.screenshot({ path: path.join(output, 'tia-inspetor.png') })
  await page.waitForFunction(() => document.querySelector('[data-tia-panel] [data-tia-cpu]')?.textContent === 'RUN')
  check(true, 'Ligar: estado «Ligado» e CPU em RUN no ecrã')
  check(await page.locator('[data-tia-bridge-url]').isDisabled(), 'Ligado: a configuração fica bloqueada até desligar')

  await store((s) => s.getState().play())
  check(await store((s) => s.getState().sim.runState) === 'running', '▶ arranca com a CPU externa em RUN')
  const dock = page.locator('[data-sim-signals-panel] [data-tia-live]')
  await dock.waitFor({ timeout: 5000 })
  check(await page.locator('[data-tia-panel]').count() === 0, 'Em RUN o inspetor esconde-se (DC-ADR-086)…')
  check(await dock.locator('[data-tia-cpu]').textContent() === 'RUN', '…e o painel «Simulação» mostra a ligação TIA ao vivo (CPU em RUN)')
  await store((s, id) => s.getState().setPlcSimInput(id, 'I0.0', true), plcId)
  await page.waitForFunction(() => [...document.querySelectorAll('[data-sim-signals-panel] [data-tia-io] span')].some((n) => n.textContent === 'Q0.0' && n.classList.contains('is-on')), null, { timeout: 5000 })
  check(cpu.inputs['I0.0'] === true && await store((s) => s.getState().sim.runState) === 'running', 'A entrada I0.0 chega à CPU, Q0.0 vinda do TIA Portal acende no painel e a simulação continua em RUN')
  await page.locator('[data-sim-signals-panel]').screenshot({ path: path.join(output, 'tia-em-run.png') })

  await dock.locator('[data-tia-disconnect]').click()
  await page.locator('[data-sim-signals-panel] [data-tia-status="disconnected"]').waitFor()
  check(await store((s) => s.getState().sim.runState) === 'stopped', 'Desligar volta a «Desligado» e para a simulação')
  check(!(await page.evaluate(() => JSON.stringify(localStorage))).includes(token), 'A chave da sessão não é guardada no navegador')
  f.stable()
  console.log(`${f.count()} verificações do ecrã TIA Portal passaram`)
} catch (error) {
  console.error(f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png') })
  throw error
} finally { await f.browser.close(); await bridge.close() }
