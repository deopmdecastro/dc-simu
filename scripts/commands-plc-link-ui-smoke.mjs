import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Esquema IEC ligado ao LOGO!: em RUN o programa do PLC comanda as saídas Q e recebe as entradas I (browser isolado, sem rede).
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
/** Espera ativa (um predicado async em waitForFunction resolve logo). */
const until = async (fn, message, timeout = 20000) => {
  const end = Date.now() + timeout
  while (!(await run(fn))) { if (Date.now() > end) throw new Error('Tempo esgotado: ' + message); await page.waitForTimeout(200) }
  return true
}
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('IEC ligado ao LOGO!')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts')
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  })
  await page.keyboard.press('F6')
  await page.locator('.dc-cmd-canvas').waitFor({ timeout: 60000 })
  check(await run((s) => s.getState().commands.parts.some((p) => p.kind === 'plcLogo')), 'o projeto nativo abre o esquema IEC com o LOGO! em bloco')

  const simBefore = await run((s) => JSON.stringify(s.getState().components.find((c) => c.id === 'native-plc').state.simInputs ?? {}))
  await run((s, ui) => ui.getState().start())
  await until((s) => s.getState().sim.runState === 'running', 'PLC em RUN')
  check(true, 'RUN no esquema IEC arranca também o simulador do PLC')
  const motorId = await run((s) => s.getState().commands.parts.find((p) => p.kind === 'motor3').id)
  await page.waitForTimeout(800)
  check(await run((s, ui, id) => ui.getState().rt.motors[id]?.mode !== 'run', motorId), 'em repouso o motor do esquema está parado')

  await run((s, ui) => ui.getState().press('B1.1', true))
  await until((s) => !!s.getState().runtime.table['Q0.0'], 'Q0.0 do programa ligada após START')
  await run((s, ui) => ui.getState().press('B1.1', false))
  check(true, 'START (B1.1) no esquema chega ao PLC e o programa liga Q0.0')
  await until((s, ui) => !!ui.getState().rt.coils.KM1, 'KM1 no esquema')
  const motorRuns = await run((s, ui, id) => ui.getState().rt.motors[id]?.mode === 'run', motorId)
  check(motorRuns, 'a saída Q0.0 do programa energiza KM1 e M1 roda no esquema IEC')

  await run((s, ui) => ui.getState().press('B1.2', true))
  await until((s) => !s.getState().runtime.table['Q0.0'], 'Q0.0 desligada após STOP')
  await run((s, ui) => ui.getState().press('B1.2', false))
  await until((s, ui) => !ui.getState().rt.coils.KM1, 'KM1 desligado')
  check(true, 'STOP (B1.2) desliga Q0.0, KM1 e o motor')
  if (output) await page.screenshot({ path: path.join(output, 'commands-plc-link.png') })

  await run((s, ui) => ui.getState().stop())
  await until((s) => s.getState().sim.runState !== 'running', 'PLC parado')
  const simAfter = await run((s) => JSON.stringify(s.getState().components.find((c) => c.id === 'native-plc').state.simInputs ?? {}))
  check(simAfter === simBefore, `parar o esquema para o PLC e repõe o simulador de sinais do LOGO! (${simAfter})`)
  check(!errors.length, 'sem erros JavaScript: ' + errors.join(' | '))
  console.log(`\n${checks} verificações da ligação IEC ↔ LOGO! passaram`)
} finally {
  await browser.close()
}
