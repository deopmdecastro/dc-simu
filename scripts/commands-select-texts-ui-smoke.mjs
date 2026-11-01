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
const run = (fn, arg) => page.evaluate(async ([source, arg]) => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts')
  return Function('store', 'ui', 'arg', 'return (' + source + ')(store, ui, arg)')(useSimStore, useCommandsUi, arg)
}, [fn.toString(), arg])
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
  // As legendas do exemplo passam a textos livres ao abrir o editor (999b9db): títulos e nota são todos textos livres.
  const freeTexts = () => run((s) => s.getState().canvasTexts.filter((t) => t.view === 'commands'))
  for (let i = 0; i < 20 && (await freeTexts()).length < 3; i++) await page.waitForTimeout(200)
  const all = await freeTexts()
  const titles = all.filter((t) => t.text !== 'Nota da obra').map((t) => t.id)
  const freeId = all.find((t) => t.text === 'Nota da obra').id
  check(titles.length >= 2 && (await run((s) => (s.getState().commands.texts ?? []).length)) === 0, 'os títulos do exemplo passam a textos livres (' + titles.length + ')')

  await canvas.click({ position: { x: 30, y: 30 } })
  await page.keyboard.press('Control+a')
  const sel = await run((s, ui) => ({ parts: ui.getState().selectedPartIds.length, texts: ui.getState().selectedTextIds, total: s.getState().commands.parts.length }))
  check(sel.parts === sel.total, `Ctrl+A seleciona todos os símbolos (${sel.parts}/${sel.total})`)
  check(sel.texts.includes(freeId) && titles.every((id) => sel.texts.includes(id)), 'Ctrl+A inclui a nota e os títulos (textos livres)')
  check(await page.locator('.dc-cmd-text-anchor.is-selected').count() === titles.length + 1, 'títulos e nota aparecem realçados como selecionados')

  // Arrastar um símbolo do grupo leva os textos consigo.
  const textsNow = () => run((s, ui, ids) => ids.map((id) => s.getState().canvasTexts.find((t) => t.id === id)), [titles[0], freeId])
  const before = await textsNow()
  const firstPart = await run((s) => s.getState().commands.parts.find((p) => p.kind === 'coil').id)
  const box = await page.locator(`[data-cmd-part="${firstPart}"]`).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 10 }); await page.mouse.up()
  const after = await textsNow()
  check(after[0].x !== before[0].x && after[1].x !== before[1].x, 'arrastar o grupo move também os títulos e a nota')
  check(Math.abs((after[0].x - before[0].x) - (after[1].x - before[1].x)) < 1, 'títulos e nota deslocam-se juntos, com o mesmo passo')
  await page.keyboard.press('Control+z')
  const undone = await textsNow()
  check(undone.every((t, i) => t.x === before[i].x && t.y === before[i].y), 'Ctrl+Z desfaz o arrasto do grupo num só passo, incluindo os textos')
  await page.keyboard.press('Control+y')
  const redone = await textsNow()
  check(redone[1].x === after[1].x && redone[1].y === after[1].y, 'Ctrl+Y volta a aplicar o arrasto dos textos')

  // Del apaga o grupo inteiro; Ctrl+Z repõe símbolos e textos num só passo.
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  const gone = await run((s) => ({ parts: s.getState().commands.parts.length, free: s.getState().canvasTexts.filter((t) => t.view === 'commands').length }))
  check(gone.parts === 0 && gone.free === 0, 'Del apaga símbolos, títulos e nota selecionados')
  await page.keyboard.press('Control+z')
  const back = await run((s) => ({ parts: s.getState().commands.parts.length, free: s.getState().canvasTexts.filter((t) => t.view === 'commands').length }))
  check(back.parts > 0 && back.free === titles.length + 1, 'Ctrl+Z repõe símbolos, títulos e nota num só passo')

  // Só a nota: apagar e desfazer.
  await page.keyboard.press('Escape')
  // Clicar abre a escrita (como no GRAFCET); Escape sai dela e o texto fica selecionado para o Delete.
  await page.locator(`[data-cmd-text="${freeId}"]`).click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Delete')
  check(!(await run((s, ui, id) => s.getState().canvasTexts.some((t) => t.id === id), freeId)), 'Del apaga o texto livre selecionado sozinho')
  await page.keyboard.press('Control+z')
  check(await run((s) => s.getState().canvasTexts.some((t) => t.view === 'commands' && t.text === 'Nota da obra')), 'Ctrl+Z recupera o texto livre apagado')

  // Marquee só sobre um título: fica selecionado.
  await page.keyboard.press('Escape')
  const lb = await page.locator(`[data-cmd-text="${titles[0]}"]`).boundingBox()
  await page.mouse.move(lb.x - 12, lb.y - 12); await page.mouse.down(); await page.mouse.move(lb.x + lb.width + 12, lb.y + lb.height + 12, { steps: 8 }); await page.mouse.up()
  check((await run((s, ui) => ui.getState().selectedTextIds)).includes(titles[0]), 'o retângulo de seleção apanha também títulos')
  if (output) await page.screenshot({ path: path.join(output, 'commands-select-texts.png') })
  check(!errors.length, 'sem erros JavaScript: ' + errors.join(' | '))
  console.log(`\n${checks} verificações da seleção com textos passaram`)
} finally {
  await browser.close()
}
