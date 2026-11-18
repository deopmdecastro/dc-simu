import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'
import { tsImport } from 'tsx/esm/api'
import { RETAINED_NATIVE_PROJECT_ID } from '../src/project/nativeProjectPolicy.mjs'
// Requer um build existente servido por `npm run preview -- --port 4173`.
// Apenas o processo Node prepara os dados sintéticos; o browser NÃO importa
// /src nem módulos Vite e percorre só os assets minificados e a interface.
// A API externa e service workers são bloqueados: isto não valida RLS/cloud.
const { nativeQuadroDistribuicaoContent, NATIVE_QUADRO_DISTRIBUICAO_NAME } = await tsImport('../src/project/nativeQuadroDistribuicao.ts', import.meta.url)
const fixture = nativeQuadroDistribuicaoContent()
// VERCEL=1 correctly refuses fabricated local sessions. Do not weaken that
// guard just to run an authenticated project fixture. This explicit mode tests
// the real static access boundary; it does NOT approve cloud project editing.
const guardOnly = process.argv.includes('--static-guard')
const base = process.env.QGD_PRODUCTION_URL || 'http://127.0.0.1:4173'
const artifacts = process.env.QGD_ARTIFACT_DIR || 'runtime/qgd-production-ui'
fs.mkdirSync(artifacts, { recursive: true })
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log('PASS — ' + message) }
try {
  const version = await fetch(new URL('/version.json', base), { cache: 'no-store' }).then(response => { assert.equal(response.status, 200); return response.json() })
  check(typeof version.buildId === 'string' && version.buildId.length > 20, 'build servido declara um buildId real, sem intercetar version.json')
  if(process.env.EXPECTED_BUILD_ID) check(version.buildId === process.env.EXPECTED_BUILD_ID, 'buildId corresponde exatamente ao commit/carimbo esperado')
  for (const role of ['user', 'admin']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' })
    const requests = new Set()
    const failed = []
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      return url.origin === new URL(base).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
    })
    await context.addInitScript((role) => {
      const userId = role === 'admin' ? 'dcsimu-admin' : 'dcsimu-user'
      localStorage.setItem('dcsimu:account:session:v1', userId)
      localStorage.setItem('dcsimu:saas:plans:v1', JSON.stringify({[userId]:{plan:'pro',planExpiresAt:null}}))
      localStorage.removeItem('dcsimu:supabase:config:v1')
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
      if(guardOnly){
        await page.waitForURL('**/login', {timeout:90000})
        check(await page.getByPlaceholder('Pesquisar projeto…').count() === 0, `${role}: build estático rejeita sessão local fabricada no dashboard`)
        await page.goto(base + '/admin')
        await page.waitForURL('**/login', {timeout:90000})
        check(await page.getByRole('button', {name:'Guardar projeto',exact:true}).count() === 0, `${role}: rota Admin também exige sessão real de base de dados`)
        check(errors.length === 0, `${role}: recusa de acesso não produz exceções React`)
        check(await page.locator('script[src]').evaluateAll(scripts => scripts.length > 0 && scripts.every(s => !s.src.includes('/src/') && !s.src.includes('/@vite/'))), `${role}: guard executado nos assets minificados reais`)
        await page.screenshot({path:`${artifacts}/static-session-guard-${role}.png`})
        continue
      }
      await page.getByPlaceholder('Pesquisar projeto…').waitFor()
      check(await page.locator('article.dx-proj').count() === 0, `${role}: conta vazia não recebe projetos nativos inventados`)
      check(await page.evaluate(() => !JSON.parse(localStorage.getItem('dcsimu:account:data:v1') || '{}').projects?.length), `${role}: abrir dashboard não resemeia armazenamento`)
      // A record that already exists, created only in this disposable context.
      // Use the retained exact UUID, never the removed native-QGD alias.
      await page.evaluate(({role,fixture,id,name}) => {
        const userId = role === 'admin' ? 'dcsimu-admin' : 'dcsimu-user'
        localStorage.setItem('dcsimu:account:data:v1', JSON.stringify({projects:[{id,name,ownerId:userId,memberIds:[],content:fixture,revision:1,updatedAt:new Date().toISOString()}],invitations:[]}))
      }, {role,fixture,id:RETAINED_NATIVE_PROJECT_ID,name:NATIVE_QUADRO_DISTRIBUICAO_NAME})
      await page.reload()
      await page.getByPlaceholder('Pesquisar projeto…').fill('QGD')
      const card = page.locator('article.dx-proj').filter({ has: page.getByRole('heading', { name: /Quadro Geral de Distribuição.*QGD/ }) })
      await card.waitFor({ timeout: 60000 })
      check(await card.count() === 1 && /47 componentes/.test(await card.textContent()) && /76 cabos/.test(await card.textContent()), `${role}: build minificado apresenta o QGD existente completo (fixture local)`)
      await card.getByRole('button', { name: /^Abrir no editor/ }).click()
      await page.waitForURL('**/projects/' + RETAINED_NATIVE_PROJECT_ID, { timeout: 90000 })
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
      await page.waitForFunction(id => {
        const value = JSON.parse(localStorage.getItem('dcsimu:account:data:v1') || '{}').projects?.find(p => p.id === id)
        return value?.content?.components?.length === 49
      }, RETAINED_NATIVE_PROJECT_ID, { timeout: 60000 })
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
  fs.writeFileSync(`${artifacts}/results.json`, JSON.stringify({assertions:checks,version,mode:guardOnly?'static-session-guard':'existing-local-project',authenticatedProjectFlow:guardOnly?'NOT_RUN_REQUIRES_REAL_SUPABASE':'SYNTHETIC_LOCAL_ONLY',scope:guardOnly?'Actual minified static build rejects fabricated local User/Admin sessions. No authenticated cloud, project or RLS acceptance.':'Actual minified nonstatic build UI with disposable local existing-project fixtures. No browser source imports, no fabricated native seeding. External API/service workers blocked: not Supabase/RLS or live account acceptance.'},null,2))
  console.log(`\n${checks} verificações do build minificado passaram (${guardOnly?'guard de sessão estático; projeto autenticado NÃO ensaiado':'projeto local sintético, não cloud'}).`)
} finally { await browser.close() }
