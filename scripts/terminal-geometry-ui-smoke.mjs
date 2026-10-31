import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseURL = process.env.TERMINAL_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.TERMINAL_TEST_OUTPUT
const browser = await chromium.launch(process.env.TERMINAL_TEST_CHANNEL ? { channel: process.env.TERMINAL_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json'
  const fonts = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
    || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/lojjic/unicode-font-resolver@'))
  return local || fonts ? route.continue() : route.abort()
})
await context.addInitScript(() => localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin'))
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  if (output) await fs.mkdir(output, { recursive: true })
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: /(?:Novo|Criar) projeto/i }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Criar novo projeto' })
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Verificação sintética dos encaixes')
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.getByRole('tablist', { name: 'Vistas' }).waitFor()
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: '3D Realista', exact: true }).click()
  const types = await page.evaluate(async () => Object.keys((await import('/src/electrical/realInterfaces.ts')).REAL_TERMINALS))
  for (const type of types) {
    const expected = await page.evaluate(async (type) => {
      const { createComponent } = await import('/src/electrical/factory.ts')
      const { REAL_TERMINALS } = await import('/src/electrical/realInterfaces.ts')
      const { useSimStore } = await import('/src/store/useSimStore.ts')
      const component = createComponent(type)
      useSimStore.setState({ components: [component], wires: [], selectedComponentIds: [] })
      useSimStore.getState().openViewOrientationEditor(component.id, 'terminals')
      return REAL_TERMINALS[type].map((spot) => ({ face: spot.face, label: spot.label }))
    }, type)
    const stage = page.locator('.tfe-stage')
    try { await stage.waitFor() } catch (error) {
      if (output) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
      console.log(await page.evaluate(async () => {
        const state = (await import('/src/store/useSimStore.ts')).useSimStore.getState()
        return { kind: state.projectKind, components: state.components.map((c) => c.type), editor: state.viewOrientationEditor?.section, errors: document.body.innerText.slice(-2000) }
      }))
      throw error
    }
    for (const [index, face] of ['front', 'back', 'left', 'right', 'top', 'bottom'].entries()) {
      const count = expected.filter((spot) => spot.face === face).length
      const tab = page.locator('.tfe-faces button').nth(index)
      await tab.click()
      await page.waitForFunction((count) => document.querySelectorAll('.tfe-dot').length === count, count)
      assert.equal(await tab.getAttribute('aria-selected'), 'true', type + ': seleção da face ' + face)
      if (count) assert.equal(Number(await tab.locator('b').textContent()), count, type + ': contagem na face ' + face)
    }
    if (output && ['terminalPhoenixPti6', 'terminalPE', 'safetyRelay', 'plcLsXbmDn32s', 'multimeterDm20'].includes(type)) {
      const face = expected[0].face
      await page.locator('.tfe-faces button').nth(['front','back','left','right','top','bottom'].indexOf(face)).click()
      await page.locator('.tfe-image').waitFor({ timeout: 30000 })
      await stage.screenshot({ path: path.join(output, type + '.png') })
    }
    console.log('PASS — ' + type + ': seleção das seis faces e contagem dos bornes no editor completo')
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.tfe-stage').waitFor()
  assert.equal(await page.locator('.tfe-list li').count(), 4, 'Multímetro mantém as quatro tomadas em ecrã pequeno')
  assert.deepEqual(errors, [], 'Exceções JavaScript ao alternar componentes/faces')
  console.log('PASS — 20 componentes, ecrã de 390 px e nenhuma exceção JavaScript')
} catch (error) {
  if (output) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
  console.log('Exceções da página:', errors)
  throw error
} finally {
  await browser.close()
}
