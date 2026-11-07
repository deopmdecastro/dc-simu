import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseURL = process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL
  ? { channel: process.env.EDITOR3D_TEST_CHANNEL }
  : process.env.EDITOR3D_TEST_CHROMIUM_PATH
    ? { executablePath: process.env.EDITOR3D_TEST_CHROMIUM_PATH }
    : {})
const context = await browser.newContext({
  viewport: { width: 430, height: 800 },
  serviceWorkers: 'block',
})
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin ? route.continue() : route.abort()
})
await context.route('**/__selection-bar-fixture__', (route) => route.fulfill({
  contentType: 'text/html',
  body: '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',
}))

const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const check = (condition, message) => {
  assert.ok(condition, message)
  console.log('PASS — ' + message)
}

try {
  await page.goto(baseURL + '/__selection-bar-fixture__')
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
    const { default: SelectionBar } = await import('/src/components/SelectionBar.tsx')
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    useSimStore.setState({
      demoMode: false,
      selectedComponentIds: [],
      selectedWireId: 'wire-1',
      selectedWireIds: ['wire-1', 'wire-2'],
      selectedTerminalId: null,
      multiSelectMode: false,
      components: [],
      wires: [
        { id: 'wire-1', locked: false, bundleId: 'bundle-1' },
        { id: 'wire-2', locked: false, bundleId: 'bundle-1' },
      ],
    })
    const root = document.getElementById('root')
    root.style.cssText = 'width:100%;height:100%;'
    ReactDOM.createRoot(root).render(React.createElement('div', {
      className: 'selection-bar-test-stage',
      style: { position: 'relative', width: '100%', height: '100%' },
    }, React.createElement(SelectionBar)))
  })

  const bar = page.getByRole('toolbar', { name: 'Ações para 2 cabos selecionado' })
  await bar.waitFor()
  for (const width of [430, 360]) {
    await page.setViewportSize({ width, height: 800 })
    await page.waitForTimeout(100)
    const layout = await bar.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const buttons = [...el.querySelectorAll('button')].map((button) => {
        const rect = button.getBoundingClientRect()
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height }
      })
      const actions = [...el.querySelectorAll('.dc-selection-action')].map((button) => {
        const icon = button.querySelector('svg')
        const text = button.querySelector('.dc-selection-action-label')
        const iconRect = icon.getBoundingClientRect()
        const textRect = text.getBoundingClientRect()
        return {
          accessibleName: button.getAttribute('aria-label'),
          iconVisible: getComputedStyle(icon).display !== 'none' && iconRect.width > 0,
          labelVisible: getComputedStyle(text).display !== 'none' && textRect.width > 0,
          clipped: text.scrollWidth > text.clientWidth,
          title: button.title,
        }
      })
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        buttons,
        actions,
      }
    })
    check(layout.left >= 0 && layout.right <= width, `Barra centrada dentro do ecrã a ${width} px`)
    check(layout.scrollWidth <= layout.clientWidth + 1, `Sem conteúdo cortado ou rolagem escondida a ${width} px`)
    check(layout.buttons.length === 8, `As oito ações permanecem presentes a ${width} px`)
    check(layout.buttons.every((button) => button.left >= layout.left && button.right <= layout.right + 1), `Todos os controlos ficam dentro da barra a ${width} px`)
    check(layout.buttons.every((button) => button.height >= 40), `Alvos táteis têm pelo menos 40 px a ${width} px`)
    check(layout.actions.every((action) => !action.clipped), `Sem rótulos cortados a ${width} px`)
    check(layout.actions.every((action) => action.iconVisible && !action.labelVisible), `Ações mostram só o ícone a ${width} px`)
    check(layout.actions.map((action) => action.accessibleName).join('|') === 'Filaçar|Desfilaçar', `Nomes acessíveis completos mantidos a ${width} px`)
    check(layout.actions.every((action) => action.title.length > 0), `Dicas das ações disponíveis a ${width} px`)
    check(await bar.getByRole('button', { name: 'Filaçar', exact: true }).isEnabled(), `Filaçar continua operável a ${width} px`)
    check(await bar.getByRole('button', { name: 'Desfilaçar', exact: true }).isEnabled(), `Desfilaçar continua operável a ${width} px`)
    check(await bar.getByRole('button', { name: 'Apagar', exact: true }).isVisible(), `Apagar continua distinto e visível a ${width} px`)
    check(await bar.getByRole('button', { name: 'Limpar seleção', exact: true }).isVisible(), `Limpar seleção continua distinto e visível a ${width} px`)
  }
  assert.deepEqual(errors, [], 'Sem exceções JavaScript')
  console.log('PASS — smoke visual da barra de seleção')
} finally {
  await browser.close()
}
