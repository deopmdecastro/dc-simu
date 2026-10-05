/**
 * Verificação VISUAL dos bornes: monta cada componente exatamente como o Painel
 * 3D (rotação base, escala pela altura física, base em y = 0) e desenha os
 * bornes como esferas — a vermelho na convenção antiga (altura invertida), a
 * verde na atual.
 *
 * Corre com o Chromium do Playwright: `npx tsx scripts/render-terminal-verify.ts`.
 */
import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), server: { port: 5199 }, logLevel: 'error' })
await server.listen()

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()) })
await page.goto('http://localhost:5199/verify.html', { waitUntil: 'load' })
await page.waitForFunction('window.__done === true', null, { timeout: 180000 })

const cards = await page.$$('.card')
console.log(`cartões: ${cards.length}`)
for (const card of cards) {
  const type = await card.getAttribute('data-type')
  await card.screenshot({ path: `verify/${type}.png` })
}
console.log('imagens em verify/')

await browser.close()
await server.close()
