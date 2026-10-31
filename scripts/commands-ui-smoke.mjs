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
const sidebar = page.locator('.dc-cmd-sidebar')
const sideTab = (name) => sidebar.locator('.dc-tab', { hasText: name }).click()
const place = async (label, x, y) => {
  await sideTab('Biblioteca')
  // A pasta pode estar recolhida; o mesmo símbolo pode estar também em Recentes/Favoritos.
  const tileIn = (scope) => scope.getByRole('button', { name: `Colocar ${label}`, exact: true })
  const folderTile = tileIn(sidebar.locator('.dc-library-folder'))
  if (!(await folderTile.count())) await sidebar.getByRole('button', { name: 'Expandir', exact: true }).click()
  await folderTile.first().click()
  const p = await screen(x, y); await page.mouse.click(p.x, p.y)
}
const folder = (title) => sidebar.locator('.dc-library-folder', { has: page.locator('.dc-library-folder-head', { hasText: title }) })
const setLines = async (value) => { await sideTab('Inspetor'); await sidebar.getByRole('combobox', { name: 'Fases da alimentação' }).selectOption(value) }
const dock = page.locator('.dc-cmd-dock')
const run = () => page.getByRole('button', { name: 'Play', exact: true }).click()
const stopRun = () => page.getByTitle('Parar (STOP)').click()
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
  check(await sidebar.isVisible() && await sidebar.locator('.dc-tab', { hasText: 'Biblioteca' }).isVisible() && await sidebar.locator('.dc-tab', { hasText: 'Inspetor' }).isVisible(), 'à esquerda: Biblioteca e Inspetor, como no Esquema 3D')
  const rightTabs = page.getByRole('tablist', { name: 'Painel direito' })
  check(await rightTabs.getByRole('tab', { name: 'GRAFCET' }).isVisible() && await rightTabs.getByRole('tab', { name: 'Entradas/Saídas' }).isVisible() && await rightTabs.getByRole('tab', { name: 'Objetos' }).isVisible(), 'à direita: GRAFCET, Entradas/Saídas e Objetos')
  const tools = page.getByRole('toolbar', { name: 'Ferramentas de comandos' })
  check(['Selecionar', 'Cabo', 'Apagar', 'Mover vista'].every(Boolean) && await tools.locator('button').count() === 4, 'a barra tem as ferramentas Selecionar, Cabo, Apagar e Mover vista')
  await page.waitForTimeout(200)
  check(await sidebar.locator('.dc-library-folder').count() === 6 && await folder('Alimentação').getByRole('button', { name: 'Colocar Alimentação' }).isVisible() && !(await folder('Sinalização e motores').getByRole('button', { name: 'Colocar Motor 3~', exact: true }).count()), 'a biblioteca está em pastas, como no Esquema 3D (as menos usadas começam recolhidas)')
  await folder('Sinalização e motores').locator('.dc-library-folder-head').click()
  check(await folder('Sinalização e motores').getByRole('button', { name: 'Colocar Motor 3~', exact: true }).isVisible(), 'clicar na pasta expande-a')
  await folder('Sinalização e motores').locator('.dc-library-folder-head').click()

  await place('Alimentação', 100, 40)
  check(await sidebar.locator('.dc-tab-active', { hasText: 'Biblioteca' }).count() === 1, 'colocar da Biblioteca não salta para o Inspetor (vários símbolos seguidos)')
  await setLines('L1')
  await place('Botão NA', 100, 60)
  await place('Bobina', 100, 160)
  await place('Alimentação', 100, 280)
  await setLines('N')
  await place('Sinalizador', 200, 160)
  let d = await read()
  check(d.parts.map((p) => `${p.kind}:${p.tag}`).join() === 'supply:,pushNO:S1,coil:K1,supply:,lamp:H1', `a paleta coloca os símbolos com referências IEC (${d.parts.map((p) => p.tag || p.kind).join(' ')})`)
  await sideTab('Biblioteca')
  const recents = sidebar.locator('section[aria-label="Símbolos recentes"] [data-cmd-tile]')
  check((await recents.evaluateAll((els) => els.map((e) => e.getAttribute('data-cmd-tile')))).join() === 'lamp,supply,coil,pushNO', 'os símbolos usados aparecem em Recentes (o último primeiro, sem repetidos)')
  await folder('Contactores e relés').getByRole('button', { name: 'Adicionar Contacto NA aos favoritos' }).click()
  check(await sidebar.locator('section[aria-label="Símbolos favoritos"] [data-cmd-tile="contactNO"]').count() === 1, 'a estrela junta o símbolo aos Favoritos')
  const before = (await read()).parts.length
  await sidebar.locator('section[aria-label="Símbolos favoritos"]').getByRole('button', { name: 'Colocar Contacto NA' }).dblclick()
  d = await read()
  check(d.parts.length === before + 1 && d.parts.at(-1).kind === 'contactNO' && d.parts.at(-1).tag === 'K1', 'duplo clique num cartão insere logo o símbolo no esquema (contacto do K1)')
  await page.keyboard.press('Delete')
  d = await read()
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

  await rightTabs.getByRole('tab', { name: 'Entradas/Saídas' }).click()
  await run()
  check((await page.locator('.dc-run-badge').textContent()).includes('RUN'), 'o Run da barra arranca a simulação de comandos (estado RUN)')
  const k1Chip = dock.locator('.dc-cmd-device', { hasText: 'K1' }).locator('.dc-cmd-chip')
  check((await k1Chip.textContent()) === 'bobina desligada', 'em simulação, a bobina começa desligada')
  const button = await mid(page.locator(`[data-cmd-part="${s1}"]`))
  await page.mouse.move(button.x, button.y); await page.mouse.down(); await page.waitForTimeout(150)
  check((await k1Chip.textContent()) === 'bobina ligada' && (await dock.locator('.dc-cmd-device', { hasText: 'H1' }).textContent()).includes('acesa'), 'premir S1 no esquema liga K1 e acende H1')
  check(await page.locator('.dc-cmd-wire[stroke="#8b5a2b"]').count() > 0 && await page.locator('.dc-cmd-wire[stroke="#2563eb"]').count() > 0, 'os cabos sob tensão ganham a cor da fase (L1 castanho, N azul)')
  await page.mouse.up(); await page.waitForTimeout(150)
  check((await k1Chip.textContent()) === 'bobina desligada', 'largar S1 (sem retenção) desliga K1')
  await stopRun()
  check((await page.locator('.dc-run-badge').textContent()).includes('STOP'), 'o Stop da barra para a simulação')

  await page.locator(`[data-cmd-part="${h1}"]`).click()
  check(await sidebar.locator('.dc-tab-active', { hasText: 'Inspetor' }).count() === 1 && (await sidebar.textContent()).includes('Sinalizador H1'), 'clicar num símbolo no esquema mostra-o no Inspetor')
  await page.keyboard.press('Delete')
  d = await read()
  check(!d.parts.some((p) => p.id === h1) && !d.wires.some((w) => w.a.part === h1 || w.b.part === h1), 'Del apaga o símbolo e os cabos ligados a ele')
  await page.keyboard.press('Control+z')
  d = await read()
  check(d.parts.some((p) => p.id === h1) && d.wires.length === 6, 'Ctrl+Z repõe o símbolo e os cabos')
  await tools.getByRole('button', { name: /Apagar/ }).click()
  await page.locator(`[data-cmd-part="${h1}"]`).click()
  check(!(await read()).parts.some((p) => p.id === h1), 'a ferramenta Apagar remove o símbolo clicado')
  await page.keyboard.press('Control+z')
  await tools.getByRole('button', { name: /Selecionar/ }).click()
  await rightTabs.getByRole('tab', { name: 'Objetos' }).click()
  await dock.getByRole('button', { name: /^Bobina/ }).click()
  check((await read()).parts.find((p) => p.kind === 'coil') && await page.locator(`[data-cmd-part="${k1}"] .dc-cmd-select`).count() === 1, 'em Objetos, clicar num aparelho seleciona-o no esquema')
  await rightTabs.getByRole('tab', { name: 'Entradas/Saídas' }).click()

  await page.getByRole('button', { name: 'Exemplos' }).click()
  await page.getByText('Arranque estrela-triângulo').click()
  await page.getByRole('button', { name: 'Abrir exemplo' }).click()
  d = await read()
  check(d.name === 'Arranque estrela-triângulo' && d.parts.some((p) => p.kind === 'motor6'), 'o exemplo estrela-triângulo abre no editor')
  await run()
  const start = await mid(page.locator('[data-cmd-kind="pushNO"]').first())
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up()
  const m1 = dock.locator('.dc-cmd-device', { hasText: 'M1' })
  await page.waitForTimeout(300)
  check((await m1.textContent()).includes('estrela'), 'o motor arranca em estrela')
  await page.waitForFunction(() => document.querySelector('.dc-cmd-dock')?.textContent?.includes('triângulo (Δ)'), null, { timeout: 9000 })
  check(true, 'após o tempo de K6 o motor passa a triângulo')
  await dock.locator('.dc-cmd-device', { hasText: 'F7' }).getByRole('button', { name: 'disparar' }).click()
  await page.waitForTimeout(150)
  check((await m1.textContent()).includes('parado'), 'disparar o térmico F7 para o motor')
  if (output) await page.screenshot({ path: path.join(output, 'commands-star-delta.png') })
  check(!errors.length, `sem erros JavaScript: ${errors.join(' | ')}`)
  console.log(`\n${checks} verificações do simulador de comandos passaram`)
} finally {
  await browser.close()
}
