import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

// O painel de Diagnóstico do exemplo nativo, no browser real: 0 erros e 0 avisos,
// e continua a apontar o erro quando o circuito tem mesmo um erro.
const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.GRAFCET_TEST_OUTPUT
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch({ args: ['--no-sandbox'], ...(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {}) })
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
page.on('pageerror', (error) => errors.push(error.message))
let checks = 0
const check = (value, message) => { assert.ok(value, message); console.log(`PASS — ${message}`); checks++ }
const loadNative = () => page.evaluate(async () => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts')
  useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  return true
})
const diagnostics = () => page.evaluate(() => JSON.parse(JSON.stringify(globalThis.__dcSimDiagnostics ?? [])))
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Partida direta (nativo)')
  await create.getByRole('radio', { name: /^Esquema IEC/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.locator('.dc-cmd-canvas').waitFor()
  await loadNative()
  // A vista 3D Realista é a que mostra o painel do projeto deste exemplo.
  // Atalho F1 = vista 3D Realista (a barra de vistas muda de posição com a largura).
  await page.keyboard.press('F1')
  await page.waitForTimeout(3000)
  const tabs = page.getByRole('tablist', { name: 'Painel direito' })
  const diagTab = tabs.getByRole('tab', { name: /Diagnóstico/ })
  if (await diagTab.count()) await diagTab.first().click()
  await page.waitForTimeout(700)
  const live = await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { detectDiagnostics } = await globalThis.__dcAppImport('/src/utils/errorDetection.ts')
    const s = useSimStore.getState()
    const list = detectDiagnostics(s.components, s.wires, new Set())
    return { total: list.length, errors: list.filter((d) => d.level === 'error').length, messages: list.map((d) => d.message) }
  })
  check(live.total === 0, `o exemplo carregado na aplicação não tem diagnósticos (${live.total}: ${live.messages.join(' · ').slice(0, 160)})`)
  const pageText = await page.evaluate(() => document.body.innerText)
  check(!/lena|liga KM1:A2|borne PE de|fase não identificada|RDY\d sem cabo/.test(pageText), 'nenhum dos cinco erros e três avisos antigos aparece no ecrã')
  if (output) {
    await page.screenshot({ path: `${output}/nativo-diagnostico.png` })
    const dock = page.locator('#dc-right-dock')
    if (await dock.count()) await dock.first().screenshot({ path: `${output}/nativo-diagnostico-painel.png` })
  }
  check(errors.length === 0, `sem erros JavaScript: ${errors.join(' | ')}`)
  console.log(`\n${checks} verificações do diagnóstico no browser passaram`)
} finally {
  await browser.close()
}
