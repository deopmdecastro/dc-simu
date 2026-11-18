import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Servidor Vite, contextos descartáveis e recursos estritamente locais. O mesmo
// root React atravessa as seleções: remontá-lo em cada caso esconderia o #310.
const baseURL = process.env.INSPECTOR_HOOKS_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
})
await context.route('**/__inspector-hooks-fixture__', (route) => route.fulfill({
  contentType: 'text/html',
  body: '<!doctype html><html lang="pt"><head><meta charset="utf-8"></head><body><div id="root" style="height:950px"></div></body></html>',
}))
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/change in the order of Hooks|Rendered (?:more|fewer) hooks|Minified React error #310|Invalid hook call/.test(message.text())) errors.push(message.text())
})
let checks = 0
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS — ' + label) }
const stable = () => check(errors.length === 0, `Sem violações de hooks ou exceções: ${errors.join('; ') || 'OK'}`)
const read = (key) => page.evaluate(async (key) => {
  const { useSimStore } = await window.__inspectorImport('/src/store/useSimStore.ts')
  return useSimStore.getState()[key]
}, key)
async function change(action, value) {
  await page.evaluate(async ({ action, value }) => {
    const { useSimStore } = await window.__inspectorImport('/src/store/useSimStore.ts')
    useSimStore.getState()[action](value)
  }, { action, value })
  // Uma frame completa de React antes da seleção seguinte, sem a agrupar no
  // mesmo batch (o erro acontece precisamente entre renders distintos).
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  stable()
}

async function mount(kind) {
  await page.goto(baseURL + '/__inspector-hooks-fixture__')
  await page.evaluate(async (kind) => {
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
    window.__inspectorImport = (path) => {
      const hit = performance.getEntriesByType('resource').map((entry) => entry.name).filter((url) => new URL(url).pathname === path).pop()
      return import(hit || path)
    }
    const { default: Inspector } = await import(kind === 'sidebar' ? '/src/components/Sidebar.tsx' : '/src/components/BusbarControls.tsx')
    const { useSimStore } = await window.__inspectorImport('/src/store/useSimStore.ts')
    const { createComponent } = await window.__inspectorImport('/src/electrical/factory.ts')
    useSimStore.setState({ components: [], wires: [], selectedComponentIds: [], selectedWireId: null, selectedWireIds: [], selectedTerminalId: null, demoMode: false })
    const root = ReactDOM.createRoot(document.getElementById('root'))
    if (kind === 'sidebar') {
      root.render(React.createElement(React.StrictMode, null, React.createElement(Inspector, { width: 360, quickAddOnPick: true })))
    } else {
      // Nunca substituir o root nem usar key por tipo: regressão das saídas
      // antecipadas de BusbarControls e da passagem comb → acrílico → escada.
      window.__renderBusbar = (type) => {
        const c = createComponent(type, 'BB1', 'Barramento de teste', 0, 0, 0)
        root.render(React.createElement(React.StrictMode, null, React.createElement(Inspector, { c })))
      }
      window.__renderBusbar('busbarComb')
    }
  }, kind)
}

try {
  await mount('sidebar')
  await page.getByRole('textbox', { name: 'Pesquisar componentes' }).waitFor({ timeout: 60_000 })
  check((await read('selectedComponentIds')).length === 0, 'Biblioteca abre sem seleção')
  await page.getByRole('textbox', { name: 'Pesquisar componentes' }).fill('breakerSchneiderIc60h1p')
  await page.locator('.dc-library-tile-main:not(:disabled)').first().click()
  // Antes da correção este clique dispara "Rendered more hooks" no Sidebar.
  await page.waitForTimeout(150)
  stable()
  await page.locator('.dc-inspector-component').waitFor()
  const added = await read('components')
  check(added.length === 1 && added[0].type === 'breakerSchneiderIc60h1p', 'Inserção rápida adiciona e seleciona um elemento real da biblioteca')
  const componentId = added[0].id
  const detach = page.getByLabel('Soltar cabos ao arrastar componentes')
  // O grupo é recolhível. Abrir apenas o antepassado deste controlo.
  await detach.evaluate((input) => input.closest('details').open = true)
  const previousDetach = await read('detachWiresOnDrag')
  await detach.setChecked(!previousDetach)
  check(await read('detachWiresOnDrag') === !previousDetach, 'Preferência de soltar cabos mantém a subscrição e a ação funcionais')
  await change('selectComponents', [])
  await page.getByText('Nada selecionado', { exact: true }).waitFor()
  check(true, 'Limpar a seleção não altera a ordem de hooks')
  await change('selectComponents', [componentId])
  await change('selectTerminal', added[0].terminals[0].id)
  await page.getByText('Propriedades do borne', { exact: true }).waitFor()
  await change('selectComponents', [componentId])
  await change('selectComponents', [])

  const ids = await page.evaluate(async () => {
    const { useSimStore } = await window.__inspectorImport('/src/store/useSimStore.ts')
    const { createComponent } = await window.__inspectorImport('/src/electrical/factory.ts')
    const types = ['busbarPhaseAcrylic', 'busbarPhaseStepped', 'busbarComb', 'combBusbarConnector', 'breakerSchneiderIc60h1p']
    const components = types.map((type, i) => createComponent(type, 'E' + i, 'Teste', i, i * 150, 0))
    const wire = { id: 'hook-test-wire', fromTerminalId: components[0].terminals[0].id, toTerminalId: components[1].terminals[0].id, color: 'blue', gauge: '1.5mm²', kind: 'neutral', flexibility: 'rigid', route: 'orthogonal', bend: 0.5, endType: 'ferrule' }
    useSimStore.setState({ components, wires: [wire], selectedComponentIds: [] })
    return components.map((c) => c.id)
  })
  for (let round = 0; round < 2; round++) {
    for (const id of ids) {
      await change('selectComponents', [id])
      await page.locator('.dc-inspector-component').waitFor()
    }
    await change('selectComponents', ids.slice(0, 2))
    await change('selectWire', 'hook-test-wire')
    await page.getByText('Inspetor do cabo', { exact: true }).waitFor()
    await change('selectComponents', [])
  }
  await change('selectComponents', [ids[4]])
  await change('deleteComponents', [ids[4]])
  await change('undo')
  check((await read('components')).some((c) => c.id === ids[4]), 'Eliminar e desfazer repõem o elemento sem desmontar o editor')

  await mount('busbar')
  await page.locator('[data-busbar-controls="busbarComb"]').waitFor()
  for (const type of ['busbarPhaseAcrylic', 'busbarComb', 'combBusbarConnector', 'busbarPhaseStepped', 'breakerSchneiderIc60h1p', 'busbarPhaseAcrylic']) {
    await page.evaluate((type) => window.__renderBusbar(type), type)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    stable()
    if (type !== 'breakerSchneiderIc60h1p') await page.locator(`[data-busbar-controls="${type}"]`).waitFor()
    else check(await page.locator('[data-busbar-controls]').count() === 0, 'Tipo não suportado devolve null sem omitir hooks')
  }
  const countInput = page.getByRole('spinbutton', { name: 'Número de bornes do barramento' })
  check(await countInput.isVisible(), 'Inspetor acrílico continua funcional depois de alternar famílias')
  stable()
  console.log(`\n${checks} verificações da inserção e da estabilidade de hooks passaram.`)
} finally {
  await browser.close()
}
