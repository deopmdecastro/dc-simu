import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Simulador de comandos elétricos (browser isolado, sem rede): construir, ligar, simular, desfazer.
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
const canvas = page.locator('.dc-cmd-canvas')
/** Ponto do ecrã de uma coordenada do esquema (vista inicial: deslocamento 60 px, escala 1). */
const screen = async (x, y) => { const b = await canvas.boundingBox(); return { x: b.x + 60 + x, y: b.y + 60 + y } }
const place = async (label, x, y) => {
  await page.getByRole('button', { name: `Colocar ${label}`, exact: true }).click()
  const p = await screen(x, y); await page.mouse.click(p.x, p.y)
}
const port = (partId, term) => page.locator(`[data-cmd-port="${partId}:${term}"]`)
const mid = async (locator) => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
const dragTo = async (from, to) => { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up() }
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Comandos — isolado')
  await create.getByRole('radio', { name: /^Comandos/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await canvas.waitFor()
  check(await page.getByText('Esquema de comandos vazio').isVisible(), 'um projeto de comandos novo abre o editor vazio com a sugestão de exemplos')
  await page.waitForTimeout(200)

  await place('Alimentação', 100, 40)
  await page.getByRole('combobox', { name: 'Fases da alimentação' }).selectOption('L1')
  await place('Botão NA', 100, 60)
  await place('Bobina', 100, 160)
  await place('Alimentação', 100, 280)
  await page.getByRole('combobox', { name: 'Fases da alimentação' }).selectOption('N')
  await place('Sinalizador', 200, 160)
  let d = await read()
  check(d.parts.map((p) => `${p.kind}:${p.tag}`).join() === 'supply:,pushNO:S1,coil:K1,supply:,lamp:H1', `a paleta coloca os símbolos com referências IEC (${d.parts.map((p) => p.tag || p.kind).join(' ')})`)
  const [l1, s1, k1, n, h1] = d.parts.map((p) => p.id)
  await dragTo(await mid(port(l1, 0)), await mid(port(s1, 0)))
  await dragTo(await mid(port(s1, 1)), await mid(port(k1, 0)))
  await dragTo(await mid(port(k1, 1)), await mid(port(n, 0)))
  d = await read()
  check(d.wires.length === 3, 'puxar de um borne para outro cria o cabo')
  // Cabo do sinalizador largado sobre o cabo S1 → K1: nasce um nó e o cabo divide-se.
  await dragTo(await mid(port(h1, 0)), await screen(100, 140))
  await dragTo(await mid(port(h1, 1)), await mid(port(n, 0)))
  d = await read()
  check(d.parts.some((p) => p.kind === 'node' && p.x === 100 && p.y === 140) && d.wires.length === 6, 'largar um cabo sobre outro cria um nó e divide o cabo')

  await page.getByRole('button', { name: '▶ Simular' }).click()
  const k1Chip = page.locator('.dc-cmd-device', { hasText: 'K1' }).locator('.dc-cmd-chip')
  check((await k1Chip.textContent()) === 'bobina desligada', 'em simulação, a bobina começa desligada')
  const button = await mid(page.locator(`[data-cmd-part="${s1}"]`))
  await page.mouse.move(button.x, button.y); await page.mouse.down(); await page.waitForTimeout(150)
  check((await k1Chip.textContent()) === 'bobina ligada' && (await page.locator('.dc-cmd-device', { hasText: 'H1' }).textContent()).includes('acesa'), 'premir S1 no esquema liga K1 e acende H1')
  check(await page.locator('.dc-cmd-wire[stroke="#8b5a2b"]').count() > 0 && await page.locator('.dc-cmd-wire[stroke="#2563eb"]').count() > 0, 'os cabos sob tensão ganham a cor da fase (L1 castanho, N azul)')
  await page.mouse.up(); await page.waitForTimeout(150)
  check((await k1Chip.textContent()) === 'bobina desligada', 'largar S1 (sem retenção) desliga K1')
  await page.getByRole('button', { name: /Parar simulação/ }).click()

  await page.locator(`[data-cmd-part="${h1}"]`).click()
  await page.keyboard.press('Delete')
  d = await read()
  check(!d.parts.some((p) => p.id === h1) && !d.wires.some((w) => w.a.part === h1 || w.b.part === h1), 'Del apaga o símbolo e os cabos ligados a ele')
  await page.keyboard.press('Control+z')
  d = await read()
  check(d.parts.some((p) => p.id === h1) && d.wires.length === 6, 'Ctrl+Z repõe o símbolo e os cabos')

  await page.getByRole('button', { name: 'Exemplos' }).click()
  await page.getByText('Arranque estrela-triângulo').click()
  await page.getByRole('button', { name: 'Abrir exemplo' }).click()
  d = await read()
  check(d.name === 'Arranque estrela-triângulo' && d.parts.some((p) => p.kind === 'motor6'), 'o exemplo estrela-triângulo abre no editor')
  await page.getByRole('button', { name: '▶ Simular' }).click()
  const start = await mid(page.locator('[data-cmd-kind="pushNO"]').first())
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up()
  const m1 = page.locator('.dc-cmd-device', { hasText: 'M1' })
  await page.waitForTimeout(300)
  check((await m1.textContent()).includes('estrela'), 'o motor arranca em estrela')
  await page.waitForFunction(() => document.querySelector('.dc-cmd-panel')?.textContent?.includes('triângulo (Δ)'), null, { timeout: 9000 })
  check(true, 'após o tempo de K6 o motor passa a triângulo')
  await page.locator('.dc-cmd-device', { hasText: 'F7' }).getByRole('button', { name: 'disparar' }).click()
  await page.waitForTimeout(150)
  check((await m1.textContent()).includes('parado'), 'disparar o térmico F7 para o motor')
  if (output) await page.screenshot({ path: path.join(output, 'commands-star-delta.png') })
  check(!errors.length, `sem erros JavaScript: ${errors.join(' | ')}`)
  console.log(`\n${checks} verificações do simulador de comandos passaram`)
} finally {
  await browser.close()
}
