import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Verificação visual/integrada da grelha comum. Usa um projeto local descartável;
// não depende de conta nem chama serviços remotos.
const baseURL = process.env.GRID_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.GRID_TEST_CHANNEL ? { channel: process.env.GRID_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/')
  return local || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname) ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  // Expõe o SVG 2D para confirmar o padrão que também orienta a textura 3D.
  localStorage.setItem('dc-simu:classic2d', '1')
})

const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const check = (condition, message) => { assert.ok(condition, message); console.log('PASS — ' + message) }
const setGrid = (patch) => page.evaluate(async (next) => {
  const { useSimStore } = await import('/src/store/useSimStore.ts')
  useSimStore.getState().setGrid(next)
}, patch)

try {
  await page.goto(baseURL + '/dashboard')
  await page.evaluate(async () => {
    const { accountApi } = await import('/src/auth/accountApi.ts')
    await accountApi('/me')
  })
  await page.getByRole('button', { name: /(?:Novo|Criar) projeto/i }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Criar novo projeto' })
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Grelha — verificação isolada')
  await dialog.getByRole('radio', { name: /^Tudo/ }).check()
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()

  const dots = page.locator('pattern#dc-grid-dots circle')
  await dots.waitFor({ state: 'attached' })
  check(await dots.getAttribute('fill') === '#c9d3e3' && await dots.getAttribute('r') === '1', 'Esquema 2D usa pontos comuns de 1 px')
  check(await page.locator('svg pattern#dc-grid-lines path').getAttribute('stroke') === '#e4eaf2', 'Esquema 2D usa a cor de linhas comum')

  await setGrid({ style: 'lines', enabled: true, size: 20 })
  check(await page.locator('pattern#dc-grid-lines').evaluate((el) => Number(el.getAttribute('width')) === 20), 'passo padrão de 20 px preservado no Esquema')

  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: 'GRAFCET', exact: true }).click()
  const grafcetCanvas = page.locator('.grafcet-canvas')
  await grafcetCanvas.waitFor()
  check(await grafcetCanvas.evaluate((el) => {
    const style = getComputedStyle(el)
    return el.classList.contains('grid-lines') && style.backgroundColor === 'rgb(247, 249, 252)' && style.backgroundImage.includes('linear-gradient')
  }), 'GRAFCET herda o fundo e o modo linhas comuns')

  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: 'Ladder', exact: true }).click()
  await page.evaluate(async () => {
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    useSimStore.getState().addRung()
  })
  const ladderLines = page.locator('pattern[id^="lnet-grid-"] path')
  await ladderLines.first().waitFor({ state: 'attached' })
  check(await ladderLines.first().getAttribute('stroke') === '#e4eaf2', 'network Ladder usa linhas comuns')
  check(await page.locator('.ladder-networks').evaluate((el) => {
    const style = getComputedStyle(el)
    return style.backgroundColor === 'rgb(247, 249, 252)' && style.backgroundImage.includes('linear-gradient')
  }), 'área Ladder herda fundo e linhas comuns')

  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: 'Esquema', exact: true }).click()
  await page.getByRole('button', { name: 'Visualização 3D', exact: true }).click()
  await page.locator('.schematic-view-shell[data-canvas-mode="3d"] canvas').waitFor()
  await setGrid({ style: 'dots', size: 20 })
  await page.waitForTimeout(250)
  check(await page.locator('.schematic-view-shell[data-canvas-mode="3d"] canvas').isVisible(), 'Painel 3D mantém a grelha ao alternar pontos/linhas')
  check(errors.length === 0, 'nenhuma exceção JavaScript ao alternar a grelha entre todos os editores')
} finally {
  await browser.close()
}
