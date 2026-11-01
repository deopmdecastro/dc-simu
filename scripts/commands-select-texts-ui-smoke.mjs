import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Esquema IEC: selecionar tudo (Ctrl+A / marquee) inclui textos livres e títulos; mover e apagar em grupo (browser isolado, sem rede).
const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.GRAFCET_TEST_OUTPUT
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch(process.env.GRAFCET_TEST_EXECUTABLE
  ? { executablePath: process.env.GRAFCET_TEST_EXECUTABLE }
  : process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  performance.setResourceTimingBufferSize(10000)
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  localStorage.removeItem('dcsimu:supabase:config:v1')
// O Vite (com HMR) serve módulos alterados com «?t=…»: um import('/src/…') sem esse sufixo criava
// OUTRA instância da store e os dados de teste iam para uma store que a página não usa. Importa o módulo
// exatamente com o URL que a aplicação carregou.
globalThis.__dcAppImport = (path) => {
  const hit = performance.getEntriesByType('resource').map((entry) => entry.name)
    .filter((url) => { try { return new URL(url).pathname === path } catch { return false } }).pop()
  return import(hit || path)
}
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
let checks = 0
const check = (value, message) => { assert.ok(value, message); console.log(`PASS — ${message}`); checks++ }
const run = (fn) => page.evaluate(async (source) => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts')
  return Function('store', 'ui', 'return (' + source + ')(store, ui)')(useSimStore, useCommandsUi)
}, fn.toString())
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Seleção com textos')
  await create.getByRole('radio', { name: /^Esquema IEC/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  const canvas = page.locator('.dc-cmd-canvas')
  await canvas.waitFor()
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { directStartExample } = await globalThis.__dcAppImport('/src/commands/examples.ts')
    useSimStore.getState().setCommands(directStartExample())
    useSimStore.getState().addCanvasText({ view: 'commands', text: 'Nota da obra', x: 200, y: 520, font: 'sans', size: 14, color: '#334155' })
  })
  await page.waitForTimeout(600)
  const labels = await run((s) => (s.getState().commands.texts ?? []).map((t) => t.id))
  const freeId = await run((s) => s.getState().canvasTexts.find((t) => t.view === 'commands').id)
  check(labels.length >= 2, 'o exemplo tem títulos no esquema (' + labels.length + ')')

  await canvas.click({ position: { x: 30, y: 30 } })
  await page.keyboard.press('Control+a')
  const sel = await run((s, ui) => ({ parts: ui.getState().selectedPartIds.length, texts: ui.getState().selectedTextIds, labels: ui.getState().selectedLabelIds, total: s.getState().commands.parts.length }))
  check(sel.parts === sel.total, `Ctrl+A seleciona todos os símbolos (${sel.parts}/${sel.total})`)
  check(sel.texts.includes(freeId), 'Ctrl+A inclui o texto livre')
  check(labels.every((id) => sel.labels.includes(id)), 'Ctrl+A inclui os títulos do esquema')
  check(await page.locator('.dc-cmd-text.is-selected').count() === labels.length && await page.locator('.dc-cmd-text-anchor.is-selected').count() === 1, 'títulos e texto livre aparecem realçados como selecionados')

  // Arrastar um símbolo do grupo leva os textos consigo.
  const before = await run((s) => ({ label: s.getState().commands.texts[0], free: s.getState().canvasTexts.find((t) => t.view === 'commands') }))
  const firstPart = await run((s) => s.getState().commands.parts.find((p) => p.kind === 'coil').id)
  const box = await page.locator(`[data-cmd-part="${firstPart}"]`).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 10 }); await page.mouse.up()
  const after = await run((s) => ({ label: s.getState().commands.texts[0], free: s.getState().canvasTexts.find((t) => t.view === 'commands') }))
  check(after.label.x !== before.label.x && after.free.x !== before.free.x, 'arrastar o grupo move também os títulos e o texto livre')
  check(Math.abs((after.label.x - before.label.x) - (after.free.x - before.free.x)) < 25, 'textos e títulos deslocam-se juntos, com o mesmo passo')
  await page.keyboard.press('Control+z')
  const undone = await run((s) => ({ label: s.getState().commands.texts[0], free: s.getState().canvasTexts.find((t) => t.view === 'commands') }))
  check(undone.free.x === before.free.x && undone.free.y === before.free.y && undone.label.x === before.label.x, 'Ctrl+Z desfaz o arrasto do grupo num só passo, incluindo o texto livre')
  await page.keyboard.press('Control+y')
  const redone = await run((s) => s.getState().canvasTexts.find((t) => t.view === 'commands'))
  check(redone.x === after.free.x && redone.y === after.free.y, 'Ctrl+Y volta a aplicar o arrasto do texto livre')

  // Del apaga o grupo inteiro; Ctrl+Z repõe símbolos e títulos num só passo.
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  const gone = await run((s) => ({ parts: s.getState().commands.parts.length, labels: (s.getState().commands.texts ?? []).length, free: s.getState().canvasTexts.filter((t) => t.view === 'commands').length }))
  check(gone.parts === 0 && gone.labels === 0 && gone.free === 0, 'Del apaga símbolos, títulos e texto livre selecionados')
  await page.keyboard.press('Control+z')
  const back = await run((s) => ({ parts: s.getState().commands.parts.length, labels: (s.getState().commands.texts ?? []).length, free: s.getState().canvasTexts.filter((t) => t.view === 'commands').length }))
  check(back.parts > 0 && back.labels === labels.length && back.free === 1, 'Ctrl+Z repõe símbolos, títulos e texto livre num só passo')

  // Só o texto livre: apagar e desfazer.
  await page.keyboard.press('Escape')
  await page.locator('.dc-cmd-text-anchor').first().click()
  await page.keyboard.press('Delete')
  check(await run((s) => s.getState().canvasTexts.filter((t) => t.view === 'commands').length) === 0, 'Del apaga o texto livre selecionado sozinho')
  await page.keyboard.press('Control+z')
  check(await run((s) => s.getState().canvasTexts.some((t) => t.view === 'commands' && t.text === 'Nota da obra')), 'Ctrl+Z recupera o texto livre apagado')

  // Marquee só sobre um título: fica selecionado.
  await page.keyboard.press('Escape')
  const lb = await page.locator(`[data-cmd-label="${labels[0]}"]`).boundingBox()
  await page.mouse.move(lb.x - 12, lb.y - 12); await page.mouse.down(); await page.mouse.move(lb.x + lb.width + 12, lb.y + lb.height + 12, { steps: 8 }); await page.mouse.up()
  check((await run((s, ui) => ui.getState().selectedLabelIds)).includes(labels[0]), 'o retângulo de seleção apanha também títulos')
  if (output) await page.screenshot({ path: path.join(output, 'commands-select-texts.png') })
  check(!errors.length, 'sem erros JavaScript: ' + errors.join(' | '))
  console.log(`\n${checks} verificações da seleção com textos passaram`)
} finally {
  await browser.close()
}
