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
// Barra completa: a 1440 px a 2.ª linha do Esquema/GRAFCET não cabe e a barra passa a compacta (Atalhos no «Mais»); medir a barra completa num ecrã largo.
const context = await browser.newContext({ viewport: { width: 1920, height: 1000 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json'
  const fonts = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
    || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/lojjic/unicode-font-resolver@'))
  return local || fonts ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  localStorage.removeItem('dcsimu:supabase:config:v1')
  localStorage.setItem('dcsimu:ladder:status-open', '1')
  localStorage.setItem('dcsimu:schematic:sim-open', '0')
  localStorage.setItem('dcsimu:workspace:view', 'schematic')
})
// Monta os componentes reais sem passar por contas, projetos remotos ou configuração Supabase.
await context.route('**/__toolbar-fixture__', (route) => route.fulfill({
  contentType: 'text/html',
  body: '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',
}))
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
  await page.goto(baseURL + '/__toolbar-fixture__')
  await page.evaluate(async () => {
    const refresh = (await import('/@react-refresh')).default
    refresh.injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type) => type
    window.__vite_plugin_react_preamble_installed__ = true
    const main = await (await fetch('/src/main.tsx')).text()
    const dependency = (name) => {
      const match = main.match(new RegExp('"([^"\\n]*\\/' + name + '\\.js\\?v=[^"\\n]+)"'))
      if (!match) throw new Error('Dependência Vite não encontrada: ' + name)
      return match[1]
    }
    await Promise.all([...main.matchAll(/import "([^"\n]+\.css(?:\?[^"\n]*)?)"/g)].map((match) => import(match[1])))
    const React = (await import(dependency('react'))).default
    const ReactDOM = (await import(dependency('react-dom_client'))).default
    const { BrowserRouter } = await import(dependency('react-router-dom'))
    const { default: App } = await import('/src/App.tsx')
    const { default: DialogHost } = await import('/src/ui/dialogs.tsx')
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const { usePlanStore } = await import('/src/saas/usePlan.ts')
    usePlanStore.getState().set({ role: 'admin', plan: null })
    useSimStore.getState().newProject()
    useSimStore.getState().setCurrentProjectName('Barra e atalhos')
    document.documentElement.style.height = '100%'
    document.body.style.height = '100%'
    document.getElementById('root').style.height = '100%'
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter, null,
      React.createElement(React.Fragment, null, React.createElement(App, { onBack: () => {} }), React.createElement(DialogHost))))
  })
  await tabs().waitFor()

  // 1) Esquema: Atalhos, Simulação e folhas com nome editável no sítio
  await openView('3D Realista')
  await expectShortcuts('schematic', /Esquema 2D|Esquema 3D/)
  const schemSim = page.locator('[data-sim-toggle="schematic"]')
  check(await schemSim.count() === 1, 'Botão «Simulação» no Esquema')
  await schemSim.click()
  const rightPanel = page.locator('.mobile-grafcet-panel')
  const signals = rightPanel.locator('[data-sim-signals-panel]')
  await signals.waitFor({ timeout: 8000 })
  check(await schemSim.getAttribute('aria-pressed') === 'true', '«Simulação» abre Entradas/Saídas no painel do projeto')
  check(await rightPanel.getByRole('tab', { name: 'Entradas/Saídas', exact: true }).getAttribute('aria-selected') === 'true', 'Separador Entradas/Saídas selecionado')
  check(await page.locator('.schematic-canvas-area [data-sim-signals-panel], [data-sim-dock-panel]').count() === 0, 'O canvas já não tem um segundo painel de simulação')
  const canvasW = await page.locator('.schematic-canvas-area').evaluate((el) => el.getBoundingClientRect().width)
  const dockBox = await rightPanel.boundingBox()
  await capture('esquema-simulacao')
  check(dockBox && dockBox.width > 240 && canvasW > 300, `E/S no único painel direito (tela ${Math.round(canvasW)} px, painel ${Math.round(dockBox?.width ?? 0)} px)`)
  await signals.locator('.vio-switch').first().click()
  check(await sim((store) => Boolean(store.getState().runtime.table['I0.0'])), 'Entrada virtual funciona no separador integrado')
  await signals.getByRole('button', { name: /RUN|Executar|Iniciar/i }).first().click()
  await page.waitForFunction(async () => (await import('/src/store/useSimStore.ts')).useSimStore.getState().sim.runState === 'running', null, { timeout: 8000 })
  check(true, 'RUN no painel arranca a simulação')
  await rightPanel.getByRole('tab', { name: 'GRAFCET', exact: true }).click()
  check(await schemSim.getAttribute('aria-pressed') === 'false', 'Trocar para GRAFCET desativa o botão do separador E/S')
  check(await sim((store) => store.getState().sim.runState === 'running'), 'Trocar de separador mantém a simulação em RUN')
  await schemSim.click()
  await signals.waitFor()
  check(await sim((store) => store.getState().sim.runState === 'running'), 'Reabrir as E/S mantém o estado da simulação')
  await signals.getByRole('button', { name: /Parar|STOP/i }).first().click()

  // 3D: o mesmo painel
  await page.getByRole('button', { name: 'Visualização 3D' }).first().click().catch(() => {})
  await page.waitForTimeout(1200)
  check(await signals.count() === 1, 'Entradas/Saídas mantém-se no painel do projeto em 3D')
  await capture('esquema3d-simulacao')
  await expectShortcuts('schematic', /Esquema 3D|Esquema 2D/)
  await schemSim.click()
  await signals.waitFor({ state: 'detached', timeout: 8000 })
  check(await schemSim.getAttribute('aria-pressed') === 'false', '«Simulação» recolhe o painel direito e desativa o botão')

  await page.setViewportSize({ width: 390, height: 844 })
  await schemSim.click()
  await signals.waitFor()
  const mobileTabs = await rightPanel.locator('.dc-dock-tabs').evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }))
  check(mobileTabs.scroll <= mobileTabs.client, 'Os três separadores cabem na gaveta do telemóvel')
  await capture('esquema3d-sinais-mobile')
  await page.keyboard.press('Escape')
  await signals.waitFor({ state: 'detached' })
  check(await schemSim.getAttribute('aria-pressed') === 'false', 'Escape fecha a gaveta E/S e atualiza o botão')
  await page.setViewportSize({ width: 1440, height: 1000 })

  // 2) Ladder: Compilar na barra, Simulação = painel de baixo, Atalhos
  await openView('Ladder')
  await expectShortcuts('ladder', /Ladder/)
  const compile = page.locator('.dc-toolbar-row2 [data-compile]')
  check(await compile.count() === 1, '«Compilar» do Ladder está na barra de ferramentas')
  check(await page.locator('.ladder-editor-toolbar [data-compile]').count() === 0, '«Compilar» já não está na barra do programa')
  // «+ Bloco» e «Nova network» na barra de ferramentas; network vazia automática
  const addNet = page.locator('.dc-toolbar-row2 [data-ladder-add-network]')
  const addBlock = page.locator('.dc-toolbar-row2 [data-ladder-add-block]')
  check(await addNet.count() === 1 && await addBlock.count() === 1, '«+ Bloco» e «Nova network» estão na barra de ferramentas')
  check(await page.locator('.ladder-editor-toolbar').getByRole('button', { name: /Nova network|Bloco/ }).count() === 0, '«+ Bloco» e «Nova network» saíram da barra do programa')
  const rungCount = () => sim((store) => store.getState().ladder.rungs.length)
  const netsBefore = await rungCount()
  await addNet.click(); await page.waitForTimeout(250)
  check(await rungCount() === netsBefore + 1, '«Nova network» da barra cria uma network no Main')
  await page.locator('.ladder-palette-item').first().click(); await page.waitForTimeout(300)
  const after = await sim((store) => store.getState().ladder.rungs.map((r) => r.branches.some((b) => b.elements.length) || r.coils.length > 0))
  check(after.length === netsBefore + 2 && after[after.length - 2] && !after[after.length - 1], `Elemento numa network vazia → nova network vazia em baixo (${after.length} networks)`)
  await page.locator('.ladder-palette-item').first().click(); await page.waitForTimeout(250)
  check(await rungCount() === netsBefore + 2, 'Mais elementos na mesma network não criam outra')
  await capture('ladder-network-automatica')
  await addBlock.click()
  const blockDialog = page.getByRole('dialog', { name: /Adicionar novo bloco/ })
  await blockDialog.waitFor({ timeout: 8000 })
  check(true, '«+ Bloco» da barra abre «Adicionar novo bloco»')
  await page.keyboard.press('Escape')
  await blockDialog.waitFor({ state: 'detached', timeout: 8000 })
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

  // 5) Tablet e telemóvel: menus em vez de ferramentas cortadas ou scroll oculto.
  for (const width of [375,390,760,1024]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [index, view] of ['3D Realista', 'Ladder', 'GRAFCET'].entries()) {
      await tabs().getByRole('tab').nth(index).click()
      await page.waitForTimeout(250)
      const metrics = await page.locator('.dc-toolbar-row2').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, h: el.getBoundingClientRect().height, wrap: getComputedStyle(el).flexWrap }))
      const main = await page.locator('.dc-toolbar-main').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }))
      check(metrics.sw <= metrics.cw + 1 && main.sw <= main.cw + 1 && metrics.wrap === 'nowrap' && metrics.h < 56, `${view} a ${width}px: barras sem cortes nem transbordo`)
      const simulation = await page.locator('[data-sim-toggle]').boundingBox()
      check(simulation && simulation.x >= 0 && simulation.x + simulation.width <= width, `${view} a ${width}px: Simulação sempre visível`)
      await page.getByRole('button', { name: 'Mais', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Tempo real', exact: true }).waitFor()
      check(true, `${view} a ${width}px: opções de execução acessíveis no menu Mais`)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Ferramentas', exact: true }).click()
      await page.getByRole('menu').waitFor()
      check(true, `${view} a ${width}px: ferramentas acessíveis no menu`)
      await page.keyboard.press('Escape')
      await capture(`barra-${width}-${view.toLowerCase()}`)
    }
  }
  check(errors.length === 0, 'Sem erros na página' + (errors.length ? ': ' + errors.join(' | ') : ''))
  console.log('OK — barra, atalhos, simulação, cartão GRAFCET e nomes no sítio')
} finally {
  await browser.close()
}
