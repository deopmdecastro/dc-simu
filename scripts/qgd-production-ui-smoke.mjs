import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'
// Requer um build existente servido por `npm run preview -- --port 4173`.
// Não importa /src: percorre apenas os assets minificados e ações da interface.
const base = process.env.QGD_PRODUCTION_URL || 'http://127.0.0.1:4173'
const artifacts = process.env.QGD_ARTIFACT_DIR || 'runtime/qgd-production-ui'
fs.mkdirSync(artifacts, { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log('PASS — ' + message) }
try {
  for (const role of ['user', 'admin']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' })
    const requests = new Set()
    const failed = []
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/version.json') return route.fulfill({ contentType: 'application/json', body: '{}' })
      return url.origin === new URL(base).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
    })
    await context.addInitScript((role) => {
      localStorage.setItem('dcsimu:account:session:v1', role === 'admin' ? 'dcsimu-admin' : 'dcsimu-user')
      localStorage.setItem('dcsimu:workspace:view', 'schematic')
      localStorage.setItem('dc-simu:schematic-canvas-mode:v1', '2d')
    }, role)
    const page = await context.newPage()
    page.setDefaultTimeout(120000)
    const errors = []
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error.stack) })
    page.on('console', (message) => {
      if (/change in the order of Hooks|Rendered (?:more|fewer) hooks|Minified React error #310/.test(message.text())) errors.push(message.text())
    })
    page.on('request', (request) => requests.add(request.url()))
    page.on('requestfinished', (request) => requests.delete(request.url()))
    page.on('requestfailed', (request) => { requests.delete(request.url()); failed.push(request.url()) })
    try {
      await page.goto(base + '/dashboard')
      await page.getByPlaceholder('Pesquisar projeto…').fill('QGD')
      const card = page.locator('article.dx-proj').filter({ has: page.getByRole('heading', { name: /Quadro Geral de Distribuição.*QGD/ }) })
      await card.waitFor({ timeout: 60000 })
      check(await card.count() === 1 && /47 componentes/.test(await card.textContent()) && /76 cabos/.test(await card.textContent()), `${role}: build minificado apresenta o QGD nativo completo`)
      await card.getByRole('button', { name: /^Abrir no editor/ }).click()
      await page.getByRole('button', { name: 'Guardar projeto', exact: true }).waitFor({ timeout: 90000 })
      await page.locator('.pn-tabs').getByRole('button', { name: /^Biblioteca/ }).waitFor({ timeout: 90000 })
      await page.getByRole('tab', { name: 'Objetos', exact: true }).click()
      const count = page.locator('.dc-objects-title b')
      await count.waitFor()
      check(await count.textContent() === '47', `${role}: o editor de produção abriu 47 objetos`)
      const loading = page.locator('[data-testid="panel3d-loading"]')
      await loading.waitFor({ state: 'hidden', timeout: 120000 })
      check(await page.locator('.panel3d-stage canvas').count() > 0, `${role}: canvas 3D frontal termina de carregar`)
      const qIlum = page.locator('.dc-objects-main').filter({ has: page.locator('.dc-objects-ref', { hasText: /^Q_ILUM$/ }) })
      await qIlum.click()
      const inspector = page.locator('.dc-inspector-component')
      await inspector.waitFor()
      check((await inspector.locator('.dc-inspector-hero').textContent()).includes('Q_ILUM'), `${role}: seleção real abre o inspetor no React minificado`)
      const duplicate = inspector.getByRole('button', { name: 'Duplicar', exact: true })
      await duplicate.evaluate((button) => button.closest('details').open = true)
      await duplicate.click()
      check(await count.textContent() === '48', `${role}: duplicar não desmonta o editor`)
      await page.locator('.pn-tabs').getByRole('button', { name: /^Biblioteca/ }).click()
      await page.getByRole('button', { name: 'Posicionar Barramento tipo pente (pino) no esquema', exact: true }).dblclick()
      check(await count.textContent() === '49', `${role}: adicionar pela biblioteca funciona em produção`)
      await page.getByRole('button', { name: 'Guardar projeto', exact: true }).click()
      await page.waitForFunction(({ role }) => {
        const value = role === 'admin'
          ? JSON.parse(localStorage.getItem('dcsimu:account:data:v1') || '{}').projects?.find((p) => p.id === 'native-quadro-distribuicao-v1')
          : JSON.parse(localStorage.getItem('dcsimu:free-native-draft:v1:dcsimu-user:native-quadro-distribuicao-v1') || '{}')
        return value?.content?.components?.length === 49
      }, { role }, { timeout: 60000 })
      check(true, `${role}: gravação persistiu os 49 objetos`)
      await page.reload()
      await page.getByRole('button', { name: 'Guardar projeto', exact: true }).waitFor({ timeout: 90000 })
      await page.getByRole('tab', { name: 'Objetos', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('.dc-objects-title b')?.textContent === '49', null, { timeout: 60000 })
      check(await count.textContent() === '49', `${role}: reabrir recupera o projeto alterado`)
      check(errors.length === 0, `${role}: sem exceções ou React #310 no build minificado`)
      check(await page.locator('script[src]').evaluateAll((scripts) => scripts.every((s) => !s.src.includes('/src/') && !s.src.includes('/@vite/'))), `${role}: fluxo usa apenas os assets de produção`)
      await page.screenshot({ path: `${artifacts}/qgd-production-${role}.png` })
    } catch (error) {
      console.error('Pedidos pendentes', [...requests]); console.error('Pedidos falhados', failed)
      await page.screenshot({ path: `${artifacts}/qgd-production-${role}-failure.png` })
      fs.writeFileSync(`${artifacts}/qgd-production-${role}-failure.txt`, await page.locator('body').innerText())
      throw error
    } finally { await context.close() }
  }
  console.log(`\n${checks} verificações do QGD no build minificado passaram.`)
} finally { await browser.close() }
