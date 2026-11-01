// Textos livres do Esquema IEC acompanham o zoom (sem tamanho mínimo que os deixe maiores que o desenho).
// Corre em Chrome (PC) e em WebKit com iPhone, onde o problema foi visto.
// GRAFCET_TEST_URL=http://127.0.0.1:5207 GRAFCET_TEST_CHANNEL=chrome node scripts/commands-text-zoom-ui-smoke.mjs
import assert from 'node:assert/strict'
import { chromium, devices, webkit } from 'playwright'

const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }

async function run(name, launch, contextOptions) {
  const browser = await launch()
  try {
    const context = await browser.newContext(contextOptions)
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
    })
    await context.addInitScript(() => {
      performance.setResourceTimingBufferSize(10000)
      localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
      localStorage.removeItem('dcsimu:supabase:config:v1')
      globalThis.__dcAppImport = (path) => {
        const hit = performance.getEntriesByType('resource').map((entry) => entry.name)
          .filter((url) => { try { return new URL(url).pathname === path } catch { return false } }).pop()
        return import(hit || path)
      }
    })
    const page = await context.newPage()
    await page.goto(baseURL + '/dashboard')
    await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
    const create = page.getByRole('dialog')
    await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Zoom IEC')
    await create.getByRole('radio', { name: /^Tudo/ }).check()
    await create.getByRole('button', { name: 'Criar projeto', exact: true }).dispatchEvent('click')
    await page.waitForTimeout(3000)
    await page.evaluate(async () => {
      const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
      const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts')
      useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
    })
    await page.keyboard.press('F6')
    await page.locator('.dc-cmd-canvas').waitFor({ timeout: 60000 })
    await page.evaluate(async () => { const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts'); useCommandsUi.getState().setActivePageId('page-2') })
    const measure = () => page.evaluate(async () => {
      const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts')
      const body = [...document.querySelectorAll('.dc-cmd-text-body')].find((el) => el.textContent.startsWith('Comando'))
      const tag = [...document.querySelectorAll('.dc-cmd-canvas .dc-cmd-tag')].find((el) => el.textContent === 'PS1')
      return { scale: useCommandsUi.getState().zoom, font: parseFloat(getComputedStyle(body).fontSize), textH: body.getBoundingClientRect().height, tagH: tag.getBoundingClientRect().height }
    })
    // Um passo de cada vez: cada zoom parte da vista já atualizada.
    const zoom = async (n, dir) => { for (let i = 0; i < n; i++) { await page.evaluate(async (dir) => { const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts'); useCommandsUi.getState().emit(dir) }, dir); await page.waitForTimeout(120) } }
    await page.evaluate(async () => { const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts'); useCommandsUi.getState().emit('zoomReset') })
    await page.waitForTimeout(500)
    const base = await measure()
    await zoom(5, 'zoomOut')
    await page.waitForTimeout(600)
    const out = await measure()
    await zoom(10, 'zoomIn')
    await page.waitForTimeout(600)
    const inn = await measure()
    const ratio = (m) => m.font / base.font / (m.scale / base.scale)
    check(out.scale < base.scale && Math.abs(ratio(out) - 1) < 0.05, `${name}: com zoom reduzido (${Math.round(out.scale * 100)}%) o texto encolhe na mesma proporção (${base.font.toFixed(1)} → ${out.font.toFixed(1)} px)`)
    check(inn.scale > base.scale && Math.abs(ratio(inn) - 1) < 0.05, `${name}: com zoom aumentado (${Math.round(inn.scale * 100)}%) o texto cresce na mesma proporção`)
    check(Math.abs(out.textH / out.tagH - base.textH / base.tagH) < 0.25, `${name}: o texto mantém a proporção em relação às referências dos símbolos`)
  } finally {
    await browser.close()
  }
}

await run('Chrome (PC)', () => chromium.launch(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {}), { viewport: { width: 1440, height: 900 } })
await run('WebKit (iPhone)', () => webkit.launch(), { ...devices['iPhone 13'] })
console.log(`\n${checks} verificações do zoom dos textos IEC passaram`)
