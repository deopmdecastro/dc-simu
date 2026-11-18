import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Teste de ponta a ponta local: menu → QGD nativo → selecionar → duplicar →
// guardar → recarregar. Recursos externos/API e service workers bloqueados.
const baseURL = process.env.QGD_UI_URL || 'http://127.0.0.1:5173'
const id = 'native-quadro-distribuicao-v1'
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let checks = 0
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS — ' + label) }
try {
  for (const role of ['user', 'admin']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' })
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/version.json') return route.fulfill({ contentType: 'application/json', body: '{}' })
      return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
    })
    await context.addInitScript((role) => {
      performance.setResourceTimingBufferSize(20000)
      localStorage.setItem('dcsimu:account:session:v1', role === 'admin' ? 'dcsimu-admin' : 'dcsimu-user')
      localStorage.removeItem('dcsimu:supabase:config:v1')
      localStorage.setItem('dcsimu:workspace:view', 'schematic')
      localStorage.setItem('dc-simu:schematic-canvas-mode:v1', '2d')
      window.__qgdImport = (path) => {
        const hit = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => new URL(u).pathname === path).pop()
        return import(hit || path)
      }
    }, role)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => {
      if (!errors.length) console.error('Primeira exceção:', error.stack)
      errors.push(error.message)
    })
    page.on('console', (message) => {
      if (/change in the order of Hooks|Rendered (?:more|fewer) hooks|Minified React error #310/.test(message.text())) errors.push(message.text())
    })
    await page.goto(baseURL + '/dashboard')
    const search = page.getByPlaceholder('Pesquisar projeto…')
    await search.waitFor({ timeout: 90_000 })
    await search.fill('QGD')
    const card = page.locator('article.dx-proj').filter({ has: page.getByRole('heading', { name: /Quadro Geral de Distribuição.*QGD/ }) })
    await card.waitFor({ timeout: 45_000 })
    check(await card.count() === 1, `${role}: QGD aparece uma única vez como projeto disponível`)
    check(/47 componentes/.test(await card.textContent()) && /76 cabos/.test(await card.textContent()), `${role}: cartão mostra os equipamentos e cabos da semente revista`)
    await card.getByRole('button', { name: /^Abrir no editor/ }).click()
    await page.waitForURL(`**/projects/${id}`, { timeout: 90_000 })
    await page.getByRole('button', { name: 'Guardar projeto', exact: true }).waitFor({ timeout: 90_000 })
    await page.locator('.pn-tabs').getByRole('button', { name: /^Biblioteca/ }).waitFor({ timeout: 90_000 })
    const readState = () => page.evaluate(async () => {
      const { useSimStore } = await window.__qgdImport('/src/store/useSimStore.ts')
      const state = useSimStore.getState()
      return { components: state.components.length, wires: state.wires.length, dirty: state.dirty }
    })
    check((await readState()).components === 47 && (await readState()).wires === 76, `${role}: abrir carrega o QGD completo no editor`)
    const diagnostics = await page.evaluate(async () => {
      const { useSimStore } = await window.__qgdImport('/src/store/useSimStore.ts')
      const { detectDiagnostics } = await window.__qgdImport('/src/utils/errorDetection.ts')
      const state = useSimStore.getState()
      return detectDiagnostics(state.components, state.wires, new Set())
    })
    check(diagnostics.length === 0, `${role}: normalização ao abrir conserva o diagnóstico limpo: ${diagnostics.map((d) => d.message).join('; ')}`)
    await page.evaluate(async () => {
      const { useSimStore } = await window.__qgdImport('/src/store/useSimStore.ts')
      const state = useSimStore.getState()
      state.selectComponents([state.components.find((c) => c.ref === 'Q_ILUM').id])
    })
    const inspector = page.locator('.dc-inspector-component')
    await inspector.waitFor()
    check(await inspector.locator('.dc-inspector-hero').textContent().then((text) => text.includes('Q_ILUM')), `${role}: seleção abre as propriedades sem erro #310`)
    const duplicate = inspector.getByRole('button', { name: 'Duplicar', exact: true })
    await duplicate.evaluate((button) => button.closest('details').open = true)
    await duplicate.click()
    check((await readState()).components === 48, `${role}: duplicar adiciona um elemento sem desmontar a aplicação`)
    await page.getByRole('button', { name: 'Guardar projeto', exact: true }).click()
    await page.waitForFunction(async () => {
      const { useSimStore } = await window.__qgdImport('/src/store/useSimStore.ts')
      return !useSimStore.getState().dirty
    }, { timeout: 30_000 })
    check(!(await readState()).dirty, `${role}: guardar confirma a persistência`)
    await page.reload()
    await page.getByRole('button', { name: 'Guardar projeto', exact: true }).waitFor({ timeout: 90_000 })
    await page.waitForFunction(async () => {
      const { useSimStore } = await window.__qgdImport('/src/store/useSimStore.ts')
      return useSimStore.getState().components.length === 48
    }, { timeout: 60_000 })
    check((await readState()).components === 48, `${role}: recarregar recupera o elemento adicionado`)
    if (role === 'user') {
      const isolated = await page.evaluate(() => {
        const draft = JSON.parse(localStorage.getItem('dcsimu:free-native-draft:v1:dcsimu-user:native-quadro-distribuicao-v1'))
        const data = JSON.parse(localStorage.getItem('dcsimu:account:data:v1'))
        return { draftCount: draft.content.components.length, seedCount: data.projects.find((p) => p.id === 'native-quadro-distribuicao-v1').content.components.length }
      })
      check(isolated.draftCount === 48 && isolated.seedCount === 47, 'user: guardar altera só o rascunho, não a semente do Admin')
    }
    check(errors.length === 0, `${role}: sem exceções de JavaScript: ${errors.join('; ') || 'OK'}`)
    await context.close()
  }
  console.log(`\n${checks} verificações do QGD no navegador passaram.`)
} finally { await browser.close() }
