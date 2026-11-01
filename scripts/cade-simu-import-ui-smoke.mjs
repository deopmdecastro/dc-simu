// Importar CADe SIMU (.cad) no Esquema IEC pelo diálogo «Importar»: símbolos, cabos e textos; RUN com o
// selo do contactor; importar outro esquema por cima substitui também os textos (Ctrl+Z repõe).
// GRAFCET_TEST_URL=http://127.0.0.1:5207 GRAFCET_TEST_CHANNEL=chrome node scripts/cade-simu-import-ui-smoke.mjs
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { cadeDirectStartFixture } from './fixtures/cade-direct-start.mjs'

const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
const cadFile = (name, text) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text, 'latin1') })
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
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
  page.on('pageerror', (e) => { if (!/Failed to fetch/.test(e.message)) errors.push(e.message) })
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Importar CADe')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(2500)
  await page.keyboard.press('F6')
  await page.locator('.dc-cmd-canvas').waitFor({ timeout: 60000 })
  const ui = (code) => page.evaluate(async (code) => { const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts'); return new Function('ui', code)(useCommandsUi.getState()) }, code)
  const store = (code) => page.evaluate(async (code) => { const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts'); return new Function('s', code)(useSimStore.getState()) }, code)
  const importCad = async (file) => {
    await ui("ui.emit('import')")
    const input = page.locator('input[type=file][accept*=".cad"]').first()
    await input.waitFor({ state: 'attached', timeout: 15000 })
    await input.setInputFiles(file)
    await page.waitForTimeout(1200)
  }

  await importCad(cadFile('ensaio.cad', cadeDirectStartFixture()))
  const imported = await store("const d = s.commands; return { name: d.name, parts: d.parts.length, wires: d.wires.length, kinds: [...new Set(d.parts.map((p) => p.kind))].sort().join(','), texts: s.canvasTexts.filter((t) => t.view === 'commands').map((t) => t.text) }")
  check(imported.name === 'ensaio' && imported.parts === 13 && imported.wires >= 20, `importado pelo diálogo: ${imported.parts} símbolos e ${imported.wires} cabos`)
  check(['breaker3', 'contact3', 'thermal3', 'motor3', 'thermalNC', 'pushNC', 'pushNO', 'contactNO', 'coil', 'timerOffCoil', 'timedOffNO', 'supply', 'ground'].every((k) => imported.kinds.includes(k)), 'tipos IEC esperados (disjuntor, contactor, térmico, motor, botões, selo, bobina, TOF, alimentação, PE)')
  check(imported.texts.join('|') === 'PARTIDA DIRETA (ENSAIO)', 'o texto do desenho passa a texto livre do IEC')
  check(await page.getByText(/Importado «ensaio\.cad»/).isVisible(), 'aviso «Importado …» com o resumo')

  // RUN: START (S1) e largar → KM1 selado, motor a rodar; STOP (S0) → para.
  await ui('ui.start()')
  await page.waitForTimeout(600)
  await ui("ui.press('S1', true)"); await page.waitForTimeout(500); await ui("ui.press('S1', false)"); await page.waitForTimeout(700)
  const running = await ui('const rt = ui.rt; return { km: !!rt.coils.KM1, motor: Object.values(rt.motors).map((m) => m.mode).join(), fault: rt.fault ?? null }')
  check(running.km && running.motor === 'run' && !running.fault, `RUN: START → KM1 selado e motor a rodar (${JSON.stringify(running)})`)
  await ui("ui.press('S0', true)"); await page.waitForTimeout(500); await ui("ui.press('S0', false)"); await page.waitForTimeout(700)
  const stopped = await ui('const rt = ui.rt; return { km: !!rt.coils.KM1, motor: Object.values(rt.motors).map((m) => m.mode).join() }')
  check(!stopped.km && stopped.motor !== 'run', 'STOP (S0): KM1 cai e o motor para')
  await ui('ui.stop()')

  // Outro esquema por cima: substitui símbolos, cabos e textos; Ctrl+Z repõe o anterior com o seu texto.
  const other = cadeDirectStartFixture().replace('PARTIDA DIRETA (ENSAIO)', 'SEGUNDO ESQUEMA')
  await importCad(cadFile('segundo.cad', other))
  const second = await store("return { name: s.commands.name, texts: s.canvasTexts.filter((t) => t.view === 'commands').map((t) => t.text) }")
  check(second.name === 'segundo' && second.texts.join('|') === 'SEGUNDO ESQUEMA', `importar por cima substitui também os textos (${second.texts.join(' | ')})`)
  await page.locator('.dc-cmd-canvas').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(500)
  const undone = await store("return { name: s.commands.name, texts: s.canvasTexts.filter((t) => t.view === 'commands').map((t) => t.text) }")
  check(undone.name === 'ensaio' && undone.texts.join('|') === 'PARTIDA DIRETA (ENSAIO)', 'Ctrl+Z repõe o esquema anterior com o seu texto')
  check(errors.length === 0, `sem erros JavaScript (${errors.join(' | ') || 'nenhum'})`)
} finally {
  await browser.close()
}
console.log(`\n${checks} verificações da importação CADe SIMU no Esquema IEC passaram`)
