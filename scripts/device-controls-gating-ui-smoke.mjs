import assert from 'node:assert/strict'
import path from 'node:path'
import { browserFixture } from './lib/browser-fixture.mjs'

/** Gating de manobra nos DeviceControls: em STOP a manobra física fica bloqueada e os
 *  parâmetros nominais continuam editáveis; em RUN/PAUSA a manobra atua.
 *  Espelha a regra dos ProtectionControls (DC-ADR-071). */
const f = await browserFixture({ baseURL: process.env.FIXTURE_URL, output: process.env.DEVICE_GATING_OUTPUT, height: 1000 })
const { page, check } = f

async function renderControls(type, state = {}) {
  await page.evaluate(async ([type, state]) => {
    const React = window.__fixtureReact
    const { default: DeviceControls } = await window.__fixtureImport('/src/components/DeviceControls.tsx')
    const { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    useSimStore.getState().stop()
    useSimStore.setState({ components: [], wires: [], demoMode: false, selectedComponentIds: [] })
    const c = createComponent(type, 'T1', 'UI regression', 0, 0, 0)
    Object.assign(c.state, state)
    useSimStore.setState({ components: [c] })
    window.__fixtureRoot.render(React.createElement(DeviceControls, { component: c }))
    await window.__fixtureFrames()
  }, [type, state])
  await page.waitForTimeout(150)
}

const btn = (label) => page.getByRole('button', { name: label, exact: false }).first()
const enabled = async (label) => btn(label).isEnabled()
const disabled = async (label) => btn(label).isDisabled()

try {
  // ── Seletor de 3 posições: manobra (posição) bloqueada em STOP; retorno editável ──
  await renderControls('selector3')
  check(await disabled('23–24'), 'STOP: rodar o seletor está bloqueado')
  check(await disabled('13–14'), 'STOP: posição 13–14 bloqueada')
  check(await enabled('Posição fixa'), 'STOP: tipo de retorno (mola/fixo) continua editável')
  check(await page.getByText('Manobra bloqueada').isVisible(), 'STOP: aviso de manobra bloqueada visível no seletor')

  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    useSimStore.getState().play()
    await window.__fixtureFrames()
  })
  await page.waitForTimeout(150)
  check(await enabled('23–24'), 'RUN: rodar o seletor atua')
  check(await page.getByText('Manobra bloqueada').count() === 0, 'RUN: aviso desaparece')

  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    useSimStore.getState().stop()
    await window.__fixtureFrames()
  })
  await page.waitForTimeout(150)
  check(await disabled('23–24'), 'voltar a STOP bloqueia de novo o seletor')

  // A regra global exige RUN/PAUSA também na demonstração.
  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    useSimStore.setState({ demoMode: true })
    await window.__fixtureFrames()
  })
  await page.waitForTimeout(150)
  check(await disabled('23–24'), 'demoMode em STOP: seletor continua a exigir RUN/PAUSA')

  // ── Fonte de alimentação: ON/OFF bloqueado; tensão nominal editável ──
  await renderControls('powerSource1ph')
  check(await disabled('Ligada (ON)'), 'STOP: ligar a fonte está bloqueado')
  check(await enabled('230V'), 'STOP: tensão nominal da fonte continua editável')
  check(await enabled('60 Hz'), 'STOP: frequência nominal continua editável')

  // ── Botoneira dupla: START/STOP bloqueados em STOP ──
  await renderControls('dualPushButtonNpb22D11')
  check(await disabled('START'), 'STOP: START da botoneira bloqueado')
  check(await disabled('STOP'), 'STOP: STOP da botoneira bloqueado')

  // ── Sensor: evento físico bloqueado; alcance editável ──
  await renderControls('photoSensorXukt1ksml2')
  check(await disabled('Objeto detetado'), 'STOP: simular objeto detetado bloqueado')
  check(await enabled('4 m'), 'STOP: alcance nominal do sensor continua editável')

  // ── Condensador: avaria bloqueada; capacitância editável ──
  await renderControls('capacitorRun60uF')
  check(await disabled('Simular corte'), 'STOP: simular corte do condensador bloqueado')
  check(await enabled('40µF'), 'STOP: capacitância nominal continua editável')

  // ── PLC: seletor RUN/STOP da CPU bloqueado em STOP ──
  await renderControls('plcSiemensS71500Cpu1511c')
  check(await disabled('RUN (executar)'), 'STOP: seletor RUN da CPU bloqueado')
  check(await disabled('STOP (inibir Q)'), 'STOP: seletor STOP da CPU bloqueado')

  // ── Multímetro DM-20: pilha própria — atua mesmo em STOP (decisão de design) ──
  await renderControls('multimeterDm20')
  check(await enabled('V ~'), 'STOP: seletor do multímetro atua (pilha própria)')
  check(await page.getByText('Manobra bloqueada').count() === 0, 'STOP: multímetro sem aviso de bloqueio')

  f.stable()
  console.log(`OK — gating de manobra nos DeviceControls (${f.count()} verificações)`)
} catch (error) {
  console.error(error)
  f.stable()
  await page.screenshot({ path: path.resolve('runtime/device-controls-gating-failure.png') })
  process.exit(1)
} finally {
  await f.browser.close()
}
