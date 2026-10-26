import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Barra de ferramentas: «Atalhos» em todos os simuladores, «Compilar» do Ladder na barra,
// «Simulação» no Ladder/Esquema/3D, deslocamento horizontal (sem quebrar linha),
// cartão GRAFCET na barra de estado e mudança de nome «no sítio» (sem caixas nativas).
const baseURL = process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.EDITOR3D_TEST_OUTPUT
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL ? { channel: process.env.EDITOR3D_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json'
  const fonts = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
    || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/lojjic/unicode-font-resolver@'))
  return local || fonts ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  localStorage.removeItem('dcsimu:supabase:config:v1')
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  localStorage.setItem('dcsimu:ladder:status-open', '1')
  localStorage.setItem('dcsimu:schematic:sim-open', '0')
})
const page = await context.newPage()
const errors = []
const nativeDialogs = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('dialog', async (dialog) => { nativeDialogs.push(dialog.type() + ': ' + dialog.message()); await dialog.dismiss() })
const check = (value, message) => { assert.ok(value, message); console.log('PASS — ' + message) }
const capture = async (name, locator) => { if (output) await (locator ?? page).screenshot({ path: path.join(output, name + '.png') }) }
const sim = (source, arg) => page.evaluate(async ([source, arg]) => {
  const { useSimStore } = await import('/src/store/useSimStore.ts')
  return Function('store', 'arg', 'return (' + source + ')(store, arg)')(useSimStore, arg)
}, [source.toString(), arg])
const tabs = () => page.getByRole('tablist', { name: 'Vistas' })
const openView = async (name) => { await tabs().getByRole('tab', { name, exact: true }).click(); await page.waitForTimeout(350) }
const shortcutsDialog = () => page.getByRole('dialog').filter({ hasText: /Atalhos/ })
const expectShortcuts = async (view, text) => {
  const button = page.locator(`[data-shortcuts-button="${view}"]`)
  check(await button.count() === 1, `Botão «Atalhos» na barra (${view})`)
  await button.click()
  const dialog = shortcutsDialog()
  await dialog.first().waitFor({ timeout: 8000 })
  check(await dialog.first().textContent().then((t) => text.test(t ?? '')), `«Atalhos» abre a lista de atalhos de ${view}`)
  await page.keyboard.press('Escape')
  await dialog.first().waitFor({ state: 'detached', timeout: 8000 })
}

try {
  if (output) await fs.mkdir(output, { recursive: true })
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: /(?:Novo|Criar) projeto/i }).first().click()
  const create = page.getByRole('dialog', { name: 'Criar novo projeto' })
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Barra e atalhos')
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await tabs().waitFor()

  // 1) Esquema: Atalhos, Simulação e folhas com nome editável no sítio
  await openView('Esquema')
  await expectShortcuts('schematic', /Esquema 2D|Esquema 3D/)
  const schemSim = page.locator('[data-sim-toggle="schematic"]')
  check(await schemSim.count() === 1, 'Botão «Simulação» no Esquema')
  await schemSim.click()
  await page.locator('[data-sim-dock-panel]').waitFor({ timeout: 8000 })
  check(await schemSim.getAttribute('aria-pressed') === 'true', '«Simulação» abre o painel de simulação do Esquema')
  const canvasW = await page.locator('.schematic-canvas-area').evaluate((el) => el.getBoundingClientRect().width)
  const dockBox = await page.locator('[data-sim-dock-panel]').boundingBox()
  await capture('esquema-simulacao')
  check(dockBox && dockBox.width > 240 && canvasW > 300, `Painel ao lado da tela, sem a tapar (tela ${Math.round(canvasW)} px, painel ${Math.round(dockBox?.width ?? 0)} px)`)
  await capture('esquema-simulacao')
  await page.locator('[data-sim-dock-panel]').getByRole('button', { name: /RUN|Executar|Iniciar/i }).first().click()
  await page.waitForFunction(async () => (await import('/src/store/useSimStore.ts')).useSimStore.getState().running === true, null, { timeout: 8000 })
  check(true, 'RUN no painel arranca a simulação')
  await page.locator('[data-sim-dock-panel]').getByRole('button', { name: /Parar|STOP/i }).first().click()

  // 3D: o mesmo painel
  await page.getByRole('button', { name: 'Visualização 3D' }).first().click().catch(() => {})
  await page.waitForTimeout(1200)
  check(await page.locator('[data-sim-dock-panel]').count() === 1, '«Simulação» mantém-se no Esquema 3D')
  await capture('esquema3d-simulacao')
  await expectShortcuts('schematic', /Esquema 3D|Esquema 2D/)
  await schemSim.click()
  await page.locator('[data-sim-dock-panel]').waitFor({ state: 'detached', timeout: 8000 })
  check(true, '«Simulação» volta a esconder o painel')

  // 2) Ladder: Compilar na barra, Simulação = painel de baixo, Atalhos
  await openView('Ladder')
  await expectShortcuts('ladder', /Ladder/)
  const compile = page.locator('.dc-toolbar-row2 [data-compile]')
  check(await compile.count() === 1, '«Compilar» do Ladder está na barra de ferramentas')
  check(await page.locator('.ladder-editor-toolbar [data-compile]').count() === 0, '«Compilar» já não está na barra do programa')
  await sim((store) => store.setState({ ladder: { ...store.getState().ladder, rungs: [{ id: 'r1', name: 'Arranque', branches: [{ id: 'b1', elements: [{ id: 'c1', address: 'I0.0', contactType: 'NO' }] }], coils: [{ id: 'q', address: 'Q0.0', coilType: 'COIL' }], enabled: true, collapsed: false }] } }))
  await page.waitForTimeout(600)
  await compile.click()
  await page.waitForFunction(() => ['ok', 'warning', 'error'].includes(document.querySelector('.dc-toolbar-row2 [data-compile]')?.getAttribute('data-compile-state') ?? ''), null, { timeout: 8000 })
  check(true, `Compilar atualiza o estado na barra (${await compile.getAttribute('data-compile-state')})`)
  await page.waitForTimeout(400)
  check(await compile.getAttribute('data-compile-state') !== 'stale', 'Sem alterações, a compilação não fica «desatualizada»')
  await sim((store) => store.setState({ ladder: { ...store.getState().ladder, rungs: [...store.getState().ladder.rungs, { id: 'r2', name: 'Extra', branches: [{ id: 'b2', elements: [{ id: 'c3', address: 'I0.1', contactType: 'NO' }] }], coils: [{ id: 'q2', address: 'Q0.1', coilType: 'COIL' }], enabled: true, collapsed: false }] } }))
  await page.waitForFunction(() => document.querySelector('.dc-toolbar-row2 [data-compile]')?.getAttribute('data-compile-state') === 'stale', null, { timeout: 8000 })
  check(true, 'Alterar o programa marca «Compilar» como desatualizado na barra')
  const ladderSim = page.locator('[data-sim-toggle="ladder"]')
  check(await ladderSim.count() === 1, 'Botão «Simulação» no Ladder')
  const collapsed = () => page.locator('.ladder-bottom-panel').evaluate((el) => el.classList.contains('is-collapsed'))
  const before = await collapsed()
  await ladderSim.click(); await page.waitForTimeout(250)
  check(await collapsed() !== before, '«Simulação» esconde/mostra o painel de simulação do Ladder')
  await ladderSim.click(); await page.waitForTimeout(250)
  check(await collapsed() === before, '«Simulação» repõe o painel')
  await capture('ladder-barra')

  // 3) GRAFCET: título e páginas editáveis no sítio, cartão na barra de estado
  await openView('GRAFCET')
  check(await page.locator('[data-sim-toggle="grafcet"]').count() === 1, '«Simulação» do GRAFCET continua na barra')
  await expectShortcuts('grafcet', /GRAFCET/)
  check(await page.locator('.grafcet-namebar').count() === 0, 'A linha separada «Nome do GRAFCET» foi removida')
  const example = page.getByRole('button', { name: /Abrir exemplo de 3 etapas/ })
  if (await example.count()) await example.first().click()
  await page.waitForTimeout(400)
  const title = page.locator('button[data-grafcet-name]')
  await title.click()
  const titleInput = page.locator('input[data-grafcet-name]')
  await titleInput.fill('Enchimento')
  await titleInput.press('Enter')
  await page.waitForTimeout(200)
  check((await page.locator('button[data-grafcet-name]').textContent())?.includes('Enchimento'), 'Um clique no título muda o nome do GRAFCET no sítio')
  const pageName = page.locator('.grafcet-page-chip.is-active button[data-grafcet-page-name]')
  await pageName.click()
  const pageInput = page.locator('input[data-grafcet-page-name]')
  check(await pageInput.count() === 1, 'Um clique no nome da página ativa abre a edição no sítio')
  await pageInput.fill('Estação A')
  await pageInput.press('Enter')
  await page.waitForTimeout(200)
  check((await pageName.textContent())?.includes('Estação A'), 'Nome da página gravado com Enter')
  await pageName.dblclick()
  await page.locator('input[data-grafcet-page-name]').fill('Descartar')
  await page.locator('input[data-grafcet-page-name]').press('Escape')
  check((await pageName.textContent())?.includes('Estação A'), 'Escape cancela a edição')
  check(nativeDialogs.length === 0, 'Sem caixas nativas (window.prompt) ao mudar nomes')
  await capture('grafcet-nomes', page.locator('.grafcet-pages'))

  // Cartão GRAFCET ao lado do ciclo
  await sim((store) => { store.getState().play() })
  await page.waitForFunction(() => document.querySelector('[data-grafcet-active-step]'), null, { timeout: 10000 })
  const card = page.locator('[data-grafcet-status]')
  const cardText = await card.textContent()
  check(/Enchimento/.test(cardText ?? '') && /X\d+/.test(cardText ?? ''), `Cartão na barra de estado mostra o GRAFCET e a etapa («${(cardText ?? '').replace(/\s+/g, ' ').trim()}»)`)
  await capture('barra-estado-grafcet', page.locator('[data-grafcet-status]').locator('xpath=..'))
  await sim((store) => { store.getState().stop() })

  // 4) Monitor: Atalhos
  await openView('Monitor')
  await expectShortcuts('monitor', /Monitor/)

  // 5) Barras com muitos botões: deslocamento horizontal, sem passar para baixo
  await page.setViewportSize({ width: 760, height: 900 })
  for (const [index, view] of ['Esquema', 'Ladder', 'GRAFCET'].entries()) {
    await tabs().getByRole('tab').nth(index).click()
    await page.waitForTimeout(350)
    await capture(`barra-estreita-${view.toLowerCase()}`)
    const m = await page.locator('.dc-toolbar-row2').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, h: el.getBoundingClientRect().height, ox: getComputedStyle(el).overflowX, wrap: getComputedStyle(el).flexWrap }))
    check(m.wrap === 'nowrap' && ['auto', 'scroll'].includes(m.ox) && m.h < 56, `${view}: barra numa só linha com deslocamento (${m.sw}/${m.cw} px, altura ${Math.round(m.h)} px)`)
    if (view === 'Ladder') check(m.sw > m.cw, 'Ladder: a barra estreita tem mais conteúdo do que largura (desloca-se)')
  }
  check(errors.length === 0, 'Sem erros na página' + (errors.length ? ': ' + errors.join(' | ') : ''))
  console.log('OK — barra, atalhos, simulação, cartão GRAFCET e nomes no sítio')
} finally {
  await browser.close()
}
