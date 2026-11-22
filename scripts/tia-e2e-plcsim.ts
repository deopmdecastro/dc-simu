import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
// @ts-expect-error módulo JS da ponte local (sem tipos)
import { createTiaBridge, PlcsimProcess } from '../bridge/tia/server.mjs'
import { createComponent } from '../src/electrical/factory'
import { useSimStore } from '../src/store/useSimStore'
import type { ElectricalComponent } from '../src/types'

/**
 * Ensaio REAL de ponta a ponta (manual, exige software Siemens): DC-Simu → ponte local → adaptador
 * → CPU 1511C a correr no S7-PLCSIM Advanced com o programa carregado a partir do TIA Portal
 * (bridge/tia/e2e/Estampagem.scl, mapa %I0.0–%Q0.5 da maquete de estampagem).
 *
 * Pré-requisitos: instância em RUN com o programa (scripts/Test-TiaE2E.ps1 prepara tudo) e o
 * adaptador compilado (scripts/Start-TiaBridge.ps1 -Check). Variáveis: TIA_E2E_INSTANCE (DCSIMU_E2E).
 */
const instance = process.env.TIA_E2E_INSTANCE || 'DCSIMU_E2E'
const exe = path.resolve('runtime/tia-bridge/DcSimu.PlcsimAdapter.exe')
const apiRoot = path.join(process.env['CommonProgramFiles(x86)'] || 'C:\\Program Files (x86)\\Common Files', 'Siemens', 'PLCSIMADV', 'API')
const apiVersion = existsSync(apiRoot) ? readdirSync(apiRoot).filter((v) => /^\d+\.\d+$/.test(v)).sort((a, b) => Number(b) - Number(a))[0] : null
const sdk = apiVersion ? path.join(apiRoot, apiVersion, 'Siemens.Simatic.Simulation.Runtime.Api.x64.dll') : ''
if (!existsSync(exe) || !existsSync(sdk)) {
  console.log(`SKIP: falta o adaptador (${exe}) ou o SDK PLCSIM Advanced. Execute scripts\\Start-TiaBridge.ps1 -Check.`)
  process.exit(0)
}

let passed = 0
async function check(name: string, fn: () => Promise<void> | void) { await fn(); passed += 1; console.log(`  PASS: ${name}`) }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(label: string, fn: () => boolean, ms = 4000) {
  const t0 = Date.now()
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error('Tempo esgotado: ' + label + ' · saídas ' + outs()); await sleep(25) }
}
;(globalThis as unknown as { window: typeof globalThis }).window ??= globalThis

const token = 'e2e-' + Math.random().toString(16).slice(2).padEnd(24, '0')
const adapter = new PlcsimProcess(exe, sdk)
const bridge = createTiaBridge({ adapter, token })
await new Promise<void>((r) => bridge.server.listen(0, '127.0.0.1', () => r()))
const url = `http://127.0.0.1:${(bridge.server.address() as AddressInfo).port}`

const st = () => useSimStore.getState()
const plc = createComponent('plcSiemensS71500Cpu1511c' as never, 'PLC1', '', 0, 0, 0) as ElectricalComponent
useSimStore.setState({ components: [plc], wires: [], selectedComponentIds: [] })
const table = () => st().runtime.plcRuntime[plc.id]?.table ?? {}
const Q = ['Q0.0', 'Q0.1', 'Q0.2', 'Q0.3', 'Q0.4', 'Q0.5'] as const
const outs = () => Q.map((q) => `${q}=${table()[q] ? 1 : 0}`).join(' ')
const set = (inputs: Record<string, boolean>) => { for (const [a, on] of Object.entries(inputs)) st().setPlcSimInput(plc.id, a, on) }
/** Espera que as 6 saídas da CPU (vistas no PLC do cenário) fiquem exatamente iguais a `expected`. */
const expectQ = (label: string, expected: Partial<Record<(typeof Q)[number], boolean>>) =>
  until(label, () => Q.every((q) => !!table()[q] === !!expected[q]))

console.log(`=== Ensaio real: DC-Simu ↔ PLCSIM Advanced ${apiVersion} (instância ${instance}) ===`)
try {
  await check('1. A ponte encontra a instância criada para o ensaio', async () => {
    const r = await fetch(url + '/instances', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DC-Simu-Key': token }, body: '{}' })
    const data = await r.json() as { instances: Array<{ name: string }> }
    assert.ok(data.instances.some((i) => i.name === instance), `instâncias: ${JSON.stringify(data.instances)}`)
  })

  await check('2. Ligar: sessão aberta e CPU em RUN (programa carregado do TIA Portal)', async () => {
    st().setControllerConfig({ mode: 'tia-portal', plcId: plc.id, bridgeUrl: url, instanceName: instance })
    await st().connectExternalController(token)
    await until('CPU em RUN', () => st().externalController.status === 'connected' && st().externalController.cpuState.toUpperCase() === 'RUN')
    st().play()
    assert.equal(st().sim.runState, 'running')
    await expectQ('repouso', {})
  })

  await check('3. Homing (FC_CIL1_REC, FC_PRENSA_SUP, S_HOME_BRACO) + peça no S_OTICO → Y1_ALIMENTA (%Q0.0)', async () => {
    set({ 'I0.3': true, 'I0.5': true, 'I0.7': true, 'I0.1': true })
    await sleep(300)
    await expectQ('sem peça não arranca', {})
    set({ 'I0.0': true })
    await expectQ('Y1_ALIMENTA', { 'Q0.0': true })
  })

  await check('4. FC_CIL1_AVA → recolha: Y4_VACUO (%Q0.3); com a peça no FC1, Y3_BRACO_DESCE (%Q0.2)', async () => {
    set({ 'I0.3': false, 'I0.4': true })
    await expectQ('vácuo', { 'Q0.3': true })
    set({ 'I0.4': false, 'I0.2': true })
    await expectQ('braço desce', { 'Q0.2': true, 'Q0.3': true })
  })

  await check('5. Cilindro recuado → estampagem: Y2_PRENSA (%Q0.1) com o vácuo mantido', async () => {
    set({ 'I0.3': true })
    await expectQ('prensa', { 'Q0.1': true, 'Q0.3': true })
  })

  await check('6. FC_PRENSA_INF com peça metálica (S_INDUTIVO) → K1_M1_HORARIO (%Q0.4), rampa 1', async () => {
    set({ 'I0.5': false, 'I0.6': true })
    await expectQ('rampa metal', { 'Q0.4': true })
  })

  await check('7. Prensa em cima → fim do ciclo; sem nova peça a CPU fica em repouso', async () => {
    set({ 'I0.0': false, 'I0.2': false, 'I0.6': false, 'I0.5': true })
    await expectQ('repouso', {})
  })

  await check('8. Segunda peça polimérica (S_INDUTIVO a 0) → K2_M1_ANTIHOR (%Q0.5), rampa 2/3', async () => {
    set({ 'I0.1': false, 'I0.0': true })
    await expectQ('Y1', { 'Q0.0': true })
    set({ 'I0.3': false, 'I0.4': true }); await expectQ('vácuo', { 'Q0.3': true })
    set({ 'I0.4': false, 'I0.2': true, 'I0.3': true }); await expectQ('prensa', { 'Q0.1': true, 'Q0.3': true })
    set({ 'I0.5': false, 'I0.6': true }); await expectQ('rampa polímero', { 'Q0.5': true })
  })

  await check('9. A CPU confirma as entradas escritas (eco da área I) e a latência fica abaixo de 250 ms', () => {
    const last = st().externalController.telemetry.at(-1)!
    assert.equal(last.acknowledgedInputs['I0.6'], true)
    assert.equal(last.acknowledgedInputs['I0.1'], false)
    const lat = st().externalController.telemetry.map((t) => t.latencyMs)
    console.log(`     latência: média ${(lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(1)} ms · máx ${Math.max(...lat)} ms · ${lat.length} trocas na janela`)
    assert.ok(Math.max(...lat) < 250)
  })
} finally {
  set({ 'I0.0': false, 'I0.1': false, 'I0.2': false, 'I0.3': false, 'I0.4': false, 'I0.5': false, 'I0.6': false, 'I0.7': false })
  st().disconnectExternalController()
  await sleep(200)
  await bridge.close()
}
console.log(`\n✅ ${passed} verificações do ensaio real com o PLCSIM Advanced passaram`)
process.exit(0)
