import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Painel direito do Esquema 3D e do Esquema IEC: separadores iguais aos do inspetor GRAFCET
// e régua de painel recolhido que mostra o nome e o botão de reabrir em todos os tamanhos.
const baseURL = process.env.RIGHT_DOCK_TEST_URL || process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.RIGHT_DOCK_TEST_OUTPUT || path.resolve('runtime/dcsimu-right-dock-ui')
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL ? { channel: process.env.EDITOR3D_TEST_CHANNEL } : {})
const check = (ok, message) => { assert.ok(ok, message); console.log('PASS — ' + message) }
const STATE = 'const s=store.getState();window.__store=store;'

/** Abre a aplicação com dados sintéticos (Partida direta) num contexto isolado. */
async function open(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json'
    const font = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname) || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/lojjic/unicode-font-resolver@'))
    return local || font ? route.continue() : route.abort()
  })
  await context.route('**/__right-dock-fixture__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' }))
  await context.addInitScript(() => { localStorage.setItem('dcsimu:workspace:view', 'schematic') })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL + '/__right-dock-fixture__')
  await page.evaluate(async () => {
    const refresh = (await import('/@react-refresh')).default
    refresh.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true
    const main = await (await fetch('/src/main.tsx')).text()
    const dep = (name) => { const found = main.match(new RegExp('"([^"\\n]*\\/' + name + '\\.js\\?v=[^"\\n]+)"')); if (!found) throw Error('Dependência Vite: ' + name); return found[1] }
    await Promise.all([...main.matchAll(/import "([^"\n]+\.css(?:\?[^"\n]*)?)"/g)].map((match) => import(match[1])))
    const React = (await import(dep('react'))).default, ReactDOM = (await import(dep('react-dom_client'))).default
    const { BrowserRouter } = await import(dep('react-router-dom'))
    const { default: App } = await import('/src/App.tsx'), { default: DialogHost } = await import('/src/ui/dialogs.tsx')
    const { useSimStore } = await import('/src/store/useSimStore.ts'), { usePlanStore } = await import('/src/saas/usePlan.ts')
    const { nativePartidaDiretaContent } = await import('/src/project/nativeProjects.ts')
    usePlanStore.getState().set({ role: 'admin', plan: null })
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
    document.documentElement.style.height = '100%'; document.body.style.height = '100%'; document.getElementById('root').style.height = '100%'
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter, null, React.createElement(React.Fragment, null, React.createElement(App, { onBack: () => {} }), React.createElement(DialogHost))))
  })
  await page.locator('.mobile-grafcet-panel').waitFor({ state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(1200)
  return { context, page, errors }
}

const view = async (page, name) => {
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name, exact: true }).click()
  await page.waitForTimeout(700)
}
const dock = (page) => page.locator('.mobile-grafcet-panel')
const geometry = (locator) => locator.evaluateAll((nodes) => nodes.map((node) => {
  const rect = node.getBoundingClientRect()
  const icon = node.querySelector('.grafcet-tab-icon, .dc-dock-tab-icon')
  const count = node.querySelector('em, .dc-dock-tab-count')
  const label = node.querySelector('.grafcet-tab-label, .dc-dock-tab-label')
  const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) } : null }
  return { width: Math.round(rect.width), height: Math.round(rect.height), icon: box(icon), count: box(count), label: box(label) }
}))
/** Nome e botão visíveis dentro da régua recolhida (não basta existirem: têm de ter área e não estar cortados). */
const railState = (page) => page.evaluate(() => {
  const panel = document.querySelector('.mobile-grafcet-panel')
  const rail = panel?.querySelector('.pn-shell-rail')
  if (!rail) return null
  const visible = (node) => {
    if (!node) return false
    const style = getComputedStyle(node), rect = node.getBoundingClientRect(), box = rail.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1
      && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1
  }
  const label = rail.querySelector('.pn-collapsed-rail-label'), chevron = rail.querySelector('.pn-collapsed-rail-chevron')
  return {
    panel: Math.round(panel.getBoundingClientRect().width),
    rail: { width: Math.round(rail.getBoundingClientRect().width), height: Math.round(rail.getBoundingClientRect().height) },
    label: label?.textContent, labelVisible: visible(label), chevronVisible: visible(chevron),
    expandLabel: rail.getAttribute('aria-label'), controls: rail.getAttribute('aria-controls'),
  }
})

try {
  await fs.mkdir(output, { recursive: true })

  // ------------------------------------------------ 1440 px: separadores e régua
  const pc = await open(1440, 1000)
  for (const name of ['3D Realista', 'Esquema IEC']) {
    await view(pc.page, name)
    const tiles = await geometry(pc.page.locator('.dc-dock-tabs .dc-dock-tab'))
    check(tiles.length === 4, `${name}: quatro separadores no painel direito`)
    check(tiles.every((tile) => tile.height >= 48 && tile.width > 60), `${name}: mosaicos com alvo ≥ 48 px (${tiles.map((tile) => tile.height).join('/')})`)
    check(tiles.every((tile) => tile.icon && tile.count && tile.label && tile.count.top < tile.label.top), `${name}: ícone e contagem por cima do nome, como no inspetor GRAFCET`)
    check(tiles.every((tile) => tile.width === tiles[0].width), `${name}: quatro mosaicos da mesma largura (${tiles.map((tile) => tile.width).join('/')})`)
    const tilesBox = await pc.page.locator('.dc-dock-tabs').boundingBox()
    check(tilesBox && tilesBox.height >= 60, `${name}: barra de separadores com altura de mosaico (${tilesBox?.height.toFixed(0)} px)`)

    // mesma anatomia do inspetor GRAFCET (ícone+contagem em cima, nome em baixo)
    await view(pc.page, 'GRAFCET')
    // O inspetor pode começar recolhido (régua «Propriedades»): abrir para medir os mosaicos.
    const restore = pc.page.locator('.grafcet-properties-restore')
    if (await restore.count()) { await restore.click(); await pc.page.waitForTimeout(500) }
    const inspectorPanel = pc.page.locator('.grafcet-properties')
    if (await inspectorPanel.count() && !await inspectorPanel.evaluate((el) => el.classList.contains('is-open'))) await inspectorPanel.locator('.dc-side-panel-toggle').first().click()
    await pc.page.waitForTimeout(400)
    const inspector = await geometry(pc.page.locator('.grafcet-properties > .grafcet-tabs > button'))
    check(inspector.length === 4 && inspector.every((tile) => tile.icon && tile.count && tile.label && tile.count.top < tile.label.top), `GRAFCET: inspetor mantém ícone+contagem em cima e nome em baixo`)
    await view(pc.page, name)

    // recolher → régua com nome e botão dentro dos limites do painel
    await dock(pc.page).locator('.dc-side-panel-toggle').click()
    await pc.page.waitForTimeout(600)
    const rail = await railState(pc.page)
    check(rail && rail.panel <= 60, `${name}: recolhido fica uma régua de ${rail?.panel} px`)
    check(rail?.label === 'GRAFCET, sinais, objetos e diagnóstico', `${name}: régua mostra o nome do painel («${rail?.label}»)`)
    check(rail?.labelVisible === true, `${name}: nome do painel inteiro dentro da régua (sem corte)`)
    check(rail?.chevronVisible === true, `${name}: botão de reabrir visível na régua`)
    check(rail?.controls === 'dc-right-dock' && /^Mostrar /.test(rail?.expandLabel ?? ''), `${name}: régua anuncia o painel que abre`)
    check(rail && rail.rail.height > 300, `${name}: régua ocupa a altura do painel (${rail?.rail.height} px)`)
    await pc.page.screenshot({ path: path.join(output, `recolhido-${name.split(' ').pop()}-1440.png`) })
    // Clique a partir do DOM: a régua desmonta no próprio clique (o ponteiro «perde» o alvo).
    await dock(pc.page).locator('.pn-shell-rail').evaluate((el) => el.click())
    await pc.page.waitForTimeout(600)
    check(await pc.page.locator('.dc-dock-tabs').isVisible(), `${name}: clicar na régua reabre o painel`)

    // cada separador muda mesmo o conteúdo
    const ioMarker = name === 'Esquema IEC' ? '.dc-cmd-io' : '.simulation-signals'
    for (const [id, marker] of [['signals', ioMarker], ['objects', name === 'Esquema IEC' ? '.dc-cmd-dock' : '.dc-objects'], ['diagnostics', '[data-diag-panel]']]) {
      const tile = pc.page.locator(`.dc-dock-tabs [data-dock-tab="${id}"]`)
      await tile.click()
      await pc.page.waitForTimeout(400)
      check(await tile.getAttribute('aria-selected') === 'true', `${name}: separador ${id} fica ativo`)
      check(await dock(pc.page).locator(marker).count() === 1, `${name}: separador ${id} mostra o painel correspondente`)
    }
    await pc.page.locator('.dc-dock-tabs [data-dock-tab="grafcet"]').click()
    await pc.page.waitForTimeout(300)
  }
  check(pc.errors.length === 0, `1440 px: sem erros JavaScript (${pc.errors[0] ?? 'ok'})`)
  await pc.context.close()

  // ------------------------------------------------ larguras de PC/tablet
  for (const [width, height] of [[1180, 820], [1024, 900], [820, 1180], [768, 1000]]) {
    const { context, page, errors } = await open(width, height)
    for (const name of ['3D Realista', 'Esquema IEC']) {
      await view(page, name)
      await dock(page).locator('.dc-side-panel-toggle').click()
      await page.waitForTimeout(600)
      const rail = await railState(page)
      check(rail?.labelVisible === true && rail?.chevronVisible === true, `${width} px · ${name}: nome e botão dentro da régua recolhida`)
      check(rail && rail.rail.height > 300, `${width} px · ${name}: régua recolhida com ${rail?.rail.height} px de altura`)
      const backdrop = await page.locator('.dc-mobile-backdrop:visible').count()
      check(backdrop === 0, `${width} px · ${name}: sem cortina sobre painéis fixos (a régua continua clicável)`)
      await dock(page).locator('.pn-shell-rail').evaluate((el) => el.click())
      await page.waitForTimeout(600)
      check(await page.locator('.dc-dock-tabs').isVisible(), `${width} px · ${name}: régua reabre o painel`)
    }
    check(errors.length === 0, `${width} px: sem erros JavaScript (${errors[0] ?? 'ok'})`)
    await context.close()
  }

  // ------------------------------------------------ telemóvel: gaveta com cortina
  const phone = await open(390, 844)
  const closedOnPhone = await phone.page.locator('.mobile-grafcet-panel.mobile-grafcet-closed').count()
  check(closedOnPhone === 1, '390 px: painel começa recolhido (gaveta)')
  check(await phone.page.locator('.dc-mobile-backdrop:visible').count() === 0, '390 px: recolhido não deixa cortina no ecrã')
  // No telemóvel o painel direito abre pelo menu «Painéis» da barra de ferramentas.
  await phone.page.getByRole('button', { name: 'Painéis', exact: true }).click()
  await phone.page.getByRole('menuitem', { name: /Visualizar GRAFCET/ }).click()
  await phone.page.waitForTimeout(800)
  check(await phone.page.locator('.mobile-grafcet-panel.mobile-grafcet-open').count() === 1, '390 px: gaveta direita abre pelo botão GRAFCET da barra')
  check(await phone.page.locator('.dc-mobile-backdrop:visible').count() === 1, '390 px: gaveta aberta fica com cortina (toque fora fecha)')
  const phoneTiles = await geometry(phone.page.locator('.dc-dock-tabs .dc-dock-tab'))
  check(phoneTiles.length === 4 && phoneTiles.every((tile) => tile.height >= 52), `390 px: quatro mosaicos com alvo ≥ 52 px (${phoneTiles.map((tile) => tile.height).join('/')})`)
  await phone.page.screenshot({ path: path.join(output, 'gaveta-390.png') })
  check(phone.errors.length === 0, `390 px: sem erros JavaScript (${phone.errors[0] ?? 'ok'})`)
  await phone.context.close()

  console.log('OK — painel direito do 3D e do IEC igual ao GRAFCET, com régua recolhida legível e clicável')
} catch (error) {
  const pages = browser.contexts().flatMap((context) => context.pages())
  if (pages[0]) await pages[0].screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  throw error
} finally { await browser.close() }
