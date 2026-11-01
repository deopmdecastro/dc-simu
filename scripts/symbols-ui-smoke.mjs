import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

// Inspector da terra e variante ANSI da resistência, no browser real.
const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.GRAFCET_TEST_OUTPUT
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  performance.setResourceTimingBufferSize(10000)
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  localStorage.removeItem('dcsimu:supabase:config:v1')
  // O Vite serve os módulos alterados com «?t=…»: importar sem esse sufixo criava outra
  // instância da store e o teste lia um estado que a página não usa.
  globalThis.__dcAppImport = (path) => {
    const hit = performance.getEntriesByType('resource').map((entry) => entry.name)
      .filter((url) => { try { return new URL(url).pathname === path } catch { return false } }).pop()
    return import(hit || path)
  }
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const sidebar = page.locator('.dc-cmd-sidebar')
let checks = 0
const check = (value, message) => { assert.ok(value, message); console.log(`PASS — ${message}`); checks++ }
const read = () => page.evaluate(async () => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  return JSON.parse(JSON.stringify(useSimStore.getState().commands))
})
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Símbolos — terra e resistência')
  await create.getByRole('radio', { name: /^Esquema IEC/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.locator('.dc-cmd-canvas').waitFor()
  await sidebar.locator('.dc-tab', { hasText: 'Biblioteca' }).click()
  const put = async (label, x, y) => {
    const tile = sidebar.getByRole('button', { name: `Colocar ${label}`, exact: true })
    if (!(await tile.count())) await sidebar.getByRole('button', { name: 'Expandir', exact: true }).click()
    await tile.first().click()
    const box = await page.locator('.dc-cmd-canvas').boundingBox()
    await page.mouse.click(box.x + 60 + x, box.y + 60 + y)
  }
  // Longe do cartão «Ainda não há símbolos», que cobre o centro do esquema vazio.
  await put('Terra / PE', 20, 20)
  let d = await read()
  check(d.parts.map((p) => p.kind).join() === 'ground', `terra colocada pela biblioteca (${d.parts.map((p) => p.kind).join() || 'nada'})`)

  // Terra: o inspetor passa a ter «Tipo de terra» e o desenho muda sem tocar no modelo elétrico.
  await sidebar.locator('.dc-tab', { hasText: 'Inspetor' }).click()
  const groundSelect = sidebar.getByRole('combobox', { name: 'Tipo de terra' })
  check(await groundSelect.isVisible(), 'o inspetor da terra mostra «Tipo de terra»')
  const before = await page.locator('[data-cmd-kind="ground"]').innerHTML()
  await groundSelect.selectOption({ label: 'Terra de proteção (hachurada)' })
  const protective = await page.locator('[data-cmd-kind="ground"]').innerHTML()
  await groundSelect.selectOption({ label: 'Terra de sinal (triângulo)' })
  const signal = await page.locator('[data-cmd-kind="ground"]').innerHTML()
  check(before !== protective && protective !== signal && before !== signal, 'as três terras desenham-se de forma diferente no esquema')
  d = await read()
  check(d.parts[0].groundVariant === 'signal', 'a variante fica guardada no componente (persiste com o projeto)')

  // Resistência: por omissão IEC; «Zigzag ANSI» é escolha explícita.
  await sidebar.locator('.dc-tab', { hasText: 'Biblioteca' }).click()
  await put('Resistência', 20, 140)
  d = await read()
  check(d.parts.map((p) => p.kind).join() === 'ground,resistor', `resistência colocada pela biblioteca (${d.parts.map((p) => p.kind).join()})`)
  await page.locator('[data-cmd-kind="resistor"]').click()
  const style = sidebar.getByRole('combobox', { name: 'Desenho do símbolo' })
  check((await style.locator('option').allTextContents()).join('|').includes('Zigzag ANSI'), 'o inspetor da resistência oferece «Zigzag ANSI» além do desenho IEC')
  const iec = await page.locator('[data-cmd-kind="resistor"]').innerHTML()
  await style.selectOption({ label: 'Zigzag ANSI' })
  const ansi = await page.locator('[data-cmd-kind="resistor"]').innerHTML()
  check(iec.includes('<rect') && ansi.includes('l 6 6'), 'IEC desenha retângulo; ANSI desenha o zigzag')
  // Evidência: três terras e a resistência em IEC, só a área do esquema (sem barras).
  await style.selectOption({ label: 'DC-Simu (IEC)' })
  await page.locator('[data-cmd-kind="ground"]').first().click()
  await sidebar.getByRole('combobox', { name: 'Tipo de terra' }).selectOption({ label: 'Terra' })
  await sidebar.locator('.dc-tab', { hasText: 'Biblioteca' }).click()
  await put('Terra / PE', 20, 260)
  await sidebar.locator('.dc-tab', { hasText: 'Inspetor' }).click()
  await sidebar.getByRole('combobox', { name: 'Tipo de terra' }).selectOption({ label: 'Terra de proteção (hachurada)' })
  await sidebar.locator('.dc-tab', { hasText: 'Biblioteca' }).click()
  await put('Terra / PE', 20, 380)
  await sidebar.locator('.dc-tab', { hasText: 'Inspetor' }).click()
  await sidebar.getByRole('combobox', { name: 'Tipo de terra' }).selectOption({ label: 'Terra de sinal (triângulo)' })
  d = await read()
  check(d.parts.filter((p) => p.kind === 'ground').map((p) => p.groundVariant ?? 'earth').join() === 'earth,protective,signal', `três terras no esquema (${d.parts.filter((p) => p.kind === 'ground').map((p) => p.groundVariant ?? 'earth').join()})`)
  if (output) await page.locator('.dc-cmd-canvas').screenshot({ path: `${output}/simbolos-terra-resistencia.png` })
  check(errors.length === 0, `sem erros JavaScript: ${errors.join(' | ')}`)
  console.log(`\n${checks} verificações de símbolos passaram`)
} finally {
  await browser.close()
}
