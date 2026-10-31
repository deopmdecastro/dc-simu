import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Esquema IEC: seleção de símbolos e janela «Ligação entre páginas» (browser isolado, sem rede).
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
const read = () => page.evaluate(async () => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  return JSON.parse(JSON.stringify(useSimStore.getState().commands))
})
const shot = (name) => output ? page.screenshot({ path: path.join(output, name + '.png') }) : null
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Ligação entre páginas')
  await create.getByRole('radio', { name: /^Esquema IEC/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  const canvas = page.locator('.dc-cmd-canvas')
  await canvas.waitFor()
  await page.waitForTimeout(300)
  const sidebar = page.locator('.dc-cmd-sidebar')
  const tile = sidebar.locator('.dc-library-folder').getByRole('button', { name: 'Colocar Ligação → outras páginas', exact: true })
  if (!(await tile.count())) await sidebar.getByRole('button', { name: 'Expandir', exact: true }).click()
  await tile.first().click()
  const b = await canvas.boundingBox()
  // Canto livre: o centro do canvas vazio tem o cartão «Ainda não há símbolos».
  await page.mouse.click(b.x + 120, b.y + 90)
  let d = await read()
  const link = d.parts.find((p) => p.kind === 'pageRef')
  check(!!link && link.tag === 'X1', 'o conector de saída entra com o nome de rede X1')
  const symbol = page.locator(`[data-cmd-part="${link.id}"]`)
  await symbol.click()

  // Seleção como no GRAFCET: sem caixa preta; fundo leve e pegas brancas com contorno azul.
  const selFill = await symbol.locator('.dc-cmd-symbol-sel-fill').evaluate((el) => getComputedStyle(el).fill)
  check(await symbol.locator('.dc-cmd-symbol-sel-handle').count() === 4, 'o símbolo selecionado mostra as quatro pegas nos cantos, como no GRAFCET')
  check(!/rgb\(0, 0, 0\)/.test(selFill) && /rgba\(37, 99, 235/.test(selFill), `o fundo da seleção é azul leve, não preto (${selFill})`)
  const tag = await symbol.locator('.dc-cmd-tag').boundingBox()
  const box = await symbol.locator('.dc-cmd-symbol-hit').boundingBox()
  check(tag.y + tag.height <= box.y + 8, 'o nome da rede fica por cima do conector, sem se sobrepor à seta')
  await shot('page-link-selected')

  // Inspetor → «Configurar ligação…» abre a janela.
  await sidebar.locator('.dc-tab', { hasText: 'Inspetor' }).click()
  await sidebar.getByRole('button', { name: 'Configurar ligação…' }).click()
  const dialog = page.getByRole('dialog', { name: /Ligação X1/ })
  await dialog.waitFor()
  const field = await dialog.locator('#cmd-link-name').boundingBox()
  const panel = await dialog.boundingBox()
  check(field.x - panel.x >= 16, `a janela tem margem interior (campo a ${Math.round(field.x - panel.x)} px da borda)`)
  check(await dialog.getByText(/Ainda sem par noutra página/).isVisible(), 'sem par: a janela avisa que a corrente não passa para outra página')
  check(await dialog.getByRole('combobox', { name: 'Página do conector par' }).inputValue() === '__new__', 'só com uma página, propõe criar uma «Nova página»')
  await shot('page-link-dialog')
  await dialog.getByRole('button', { name: 'Criar página e par' }).click()
  d = await read()
  const peer = d.parts.find((p) => p.kind === 'pageRefIn')
  check(d.pages.length === 2 && !!peer && peer.tag === 'X1' && peer.page === d.pages[1].id, 'cria a nova página com o conector de entrada «X1»')
  const pagesBar = page.getByRole('tablist', { name: 'Páginas do esquema IEC' })
  check(await pagesBar.getByRole('tab', { selected: true }).textContent().then((t) => t.includes('Página 2')), 'abre a página nova')
  check(await page.locator(`[data-cmd-part="${peer.id}"] .dc-cmd-symbol-sel-handle`).count() === 4, 'o conector par fica selecionado')

  // A partir do par: «Abrir» volta ao conector de origem.
  await page.locator(`[data-cmd-part="${peer.id}"]`).dblclick()
  const back = page.getByRole('dialog', { name: /Ligação X1/ })
  await back.waitFor()
  check(await back.getByRole('radio', { name: /Entrada/ }).getAttribute('aria-checked') === 'true', 'o par é uma entrada ← (sentido marcado)')
  check(await back.locator('.dc-cmd-link-peers li').count() === 1 && (await back.locator('.dc-cmd-link-peers').textContent()).includes('Página 1'), 'a janela do par lista a ligação à Página 1')
  await back.getByRole('button', { name: 'Abrir', exact: true }).click()
  check(await pagesBar.getByRole('tab', { selected: true }).textContent().then((t) => t.includes('Página 1')) && await page.locator(`[data-cmd-part="${link.id}"] .dc-cmd-symbol-sel-handle`).count() === 4, '«Abrir» volta à Página 1 com o conector de origem selecionado')

  // Mudar nome e sentido, guardar; nome vazio não grava.
  await symbol.dblclick()
  const edit = page.getByRole('dialog', { name: /^Ligação/ })
  await edit.locator('#cmd-link-name').fill('')
  check(await edit.getByRole('button', { name: 'Guardar', exact: true }).isDisabled(), 'sem nome de rede não é possível guardar')
  await edit.locator('#cmd-link-name').fill('24v')
  await edit.getByRole('radio', { name: /Entrada/ }).click()
  await edit.getByRole('button', { name: 'Guardar', exact: true }).click()
  d = await read()
  const saved = d.parts.find((p) => p.id === link.id)
  check(saved.tag === '24V' && saved.kind === 'pageRefIn', 'guardar aplica o nome (em maiúsculas) e o sentido escolhido')
  await page.keyboard.press('Control+z')
  check((await read()).parts.find((p) => p.id === link.id).tag === 'X1', 'Ctrl+Z desfaz a alteração da ligação')
  check(!errors.length, 'sem erros JavaScript: ' + errors.join(' | '))
  console.log(`\n${checks} verificações da ligação entre páginas passaram`)
} finally {
  await browser.close()
}
