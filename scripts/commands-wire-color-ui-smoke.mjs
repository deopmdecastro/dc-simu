// Cores das linhas do esquema IEC: cor por cabo no Inspetor (AUTO repõe a automática) e cor
// ativa na barra para os novos cabos. Usa o projeto nativo «Partida direta» (página Comando LOGO!).
// GRAFCET_TEST_URL=http://127.0.0.1:5207 GRAFCET_TEST_CHANNEL=chrome node scripts/commands-wire-color-ui-smoke.mjs
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
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
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Cores IEC')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(3000)
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts')
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  })
  await page.keyboard.press('F6')
  await page.locator('.dc-cmd-canvas').waitFor({ timeout: 60000 })
  // Um cabo da página «Comando LOGO!» (o +24 V da PS1).
  const wireId = await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts')
    const ui = useCommandsUi.getState()
    ui.setActivePageId('page-2')
    const w = useSimStore.getState().commands.wires.find((x) => x.page === 'page-2')
    ui.select({ type: 'wire', id: w.id })
    return w.id
  })
  const stroke = () => page.locator(`[data-cmd-wire="${wireId}"] path.dc-cmd-wire`).getAttribute('stroke')
  const stored = () => page.evaluate(async (id) => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    return useSimStore.getState().commands.wires.find((w) => w.id === id)?.color ?? null
  }, wireId)
  const colors = page.getByRole('radiogroup', { name: 'Cor do cabo IEC' })
  await colors.waitFor({ timeout: 15000 })
  check(await stroke() === '#475569', 'cabo IEC começa com a cor automática')
  await colors.getByRole('radio', { name: 'Vermelho' }).click()
  await page.waitForTimeout(200)
  check(await stored() === 'red' && await stroke() === '#ef4444', 'Inspetor: escolher Vermelho grava a cor e o cabo fica vermelho')
  check(await colors.getByRole('radio', { name: 'Vermelho' }).getAttribute('aria-checked') === 'true', 'a cor escolhida fica marcada')
  await colors.getByRole('radio', { name: 'Azul', exact: true }).click()
  await page.waitForTimeout(200)
  check(await stored() === 'blue' && await stroke() === '#3b82f6', 'trocar para Azul atualiza o cabo')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  check(await stored() === 'red', 'Ctrl+Z desfaz a mudança de cor')
  await page.getByRole('button', { name: 'AUTO' }).first().click()
  await page.waitForTimeout(200)
  check(await stored() === null && await stroke() === '#475569', 'AUTO repõe a cor automática')

  // Barra: com a ferramenta de cabos, a cor ativa aplica-se aos novos cabos.
  await page.evaluate(async () => { const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts'); useCommandsUi.getState().setTool('wire') })
  const swatch = page.getByRole('button', { name: 'Cor dos novos cabos: Violeta' })
  await swatch.waitFor({ timeout: 10000 })
  await swatch.click()
  check(await swatch.getAttribute('aria-pressed') === 'true' && await page.evaluate(async () => { const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts'); return useCommandsUi.getState().wireColor }) === 'violet', 'barra: a cor dos novos cabos fica ativa (Violeta)')
  check(errors.length === 0, `sem erros JavaScript (${errors.join(' | ') || 'nenhum'})`)
} finally {
  await browser.close()
}
console.log(`\n${checks} verificações das cores das linhas IEC passaram`)
