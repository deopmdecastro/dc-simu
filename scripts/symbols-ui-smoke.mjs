import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

// Inspector da terra e variante ANSI da resistência, no browser real.
const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.GRAFCET_TEST_OUTPUT
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch({ args: ['--no-sandbox'], ...(process.env.GRAFCET_TEST_EXECUTABLE ? { executablePath: process.env.GRAFCET_TEST_EXECUTABLE } : process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {}) })
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
  await sidebar.locator('.dc-tab', { hasText: 'Inspetor' }).click()
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
  // A biblioteca anuncia tantos símbolos quantos os tipos do modelo, e todos estão na paleta.
  const tabLabel = (await sidebar.locator('.dc-tab', { hasText: 'Biblioteca' }).textContent()) || ''
  const palette = await page.evaluate(async () => {
    const m = await globalThis.__dcAppImport('/src/commands/model.ts')
    return { parts: Object.keys(m.CMD_PARTS).length, pal: m.CMD_PALETTE.flatMap((g) => g.kinds) }
  })
  check(tabLabel.includes(String(palette.parts)), `a biblioteca anuncia ${palette.parts} símbolos (${tabLabel.trim()})`)
  const novos = ['meter', 'energyMeter', 'converter', 'transformer3Line', 'motorBreaker3', 'switchDisconnector3', 'motor1', 'counter', 'overvoltageRelay', 'shortCircuitRelay', 'slowRelay', 'mainSwitch', 'threePhaseTransformer', 'sensor3wNO', 'sensor3wNC', 'valve22', 'valve42', 'valve53c', 'valve53p', 'valve53e', 'airFilter', 'airLubricator', 'airRegulator', 'manometer', 'silencer', 'reservoir']
  check(novos.every((k) => palette.pal.includes(k)), `os ${novos.length} símbolos dos cadernos novos estão na paleta`)
  check(palette.parts === palette.pal.length, `todos os ${palette.parts} tipos aparecem na paleta (sem órfãos)`)
  // Instrumento indicador IEC 60617-8: a grandeza escolhe-se no Inspetor e fica no componente.
  await sidebar.locator('.dc-tab', { hasText: 'Biblioteca' }).click()
  await put('Instrumento indicador', 260, 20)
  await page.locator('[data-cmd-kind="meter"]').click()
  await sidebar.locator('.dc-tab', { hasText: 'Inspetor' }).click()
  const quantity = sidebar.getByRole('combobox', { name: 'Grandeza medida' })
  await quantity.selectOption({ label: 'Hz — frequencímetro' })
  d = await read()
  check(d.parts.find((p) => p.kind === 'meter')?.variant === 'Hz' && /Hz/.test(await page.locator('[data-cmd-kind="meter"]').innerHTML()), 'o instrumento indicador muda para frequencímetro (Hz) pelo Inspetor')
  check(errors.length === 0, `sem erros JavaScript: ${errors.join(' | ')}`)
  console.log(`\n${checks} verificações de símbolos passaram`)
} finally {
  await browser.close()
}
