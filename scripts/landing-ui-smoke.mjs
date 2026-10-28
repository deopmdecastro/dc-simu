import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseURL = process.env.LANDING_TEST_URL || 'http://127.0.0.1:3000'
const output = process.env.LANDING_UI_TEST_OUTPUT
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL ? { channel: process.env.EDITOR3D_TEST_CHANNEL } : {})
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++; console.log(`PASS — ${message}`) }

try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(baseURL)
      await page.getByRole('tab', { name: 'GRAFCET', exact: true }).click()
      const demo = page.locator('.dx-grafcet-demo')
      await demo.waitFor({ state: 'visible' })
      const run = demo.getByRole('button', { name: 'RUN', exact: true })
      check(await run.isVisible(), `${width} px: controlos GRAFCET visíveis`)
      await run.click()
      await page.waitForFunction(() => document.querySelector('.dx-grafcet-demo-status')?.textContent?.includes('Etapa 0'))
      await demo.getByRole('button', { name: 'START', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('.dx-grafcet-demo-status')?.textContent?.includes('Etapa 1'))
      check(true, `${width} px: RUN/START ativam a etapa de marcha`)
      await demo.getByRole('button', { name: 'STOP', exact: true }).last().click()
      await page.waitForFunction(() => document.querySelector('.dx-grafcet-demo-status')?.textContent?.includes('Etapa 0'))
      check(true, `${width} px: STOP regressa à etapa inicial`)
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} px: página sem transbordo horizontal`)
      check(errors.length === 0, `${width} px: sem erros JavaScript (${errors.join('; ')})`)
      if (output) {
        await mkdir(output, { recursive: true })
        await demo.screenshot({ path: path.join(output, `landing-grafcet-${width}.png`) })
      }
    } finally {
      await context.close()
    }
  }
  console.log(`landing-ui-smoke: ${checks} verificações passaram`)
} finally {
  await browser.close()
}
