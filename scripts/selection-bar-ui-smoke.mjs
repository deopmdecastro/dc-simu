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

  const visibleLayout = (bar) => bar.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const shown = (node) => node.offsetParent !== null && getComputedStyle(node).display !== 'none'
    const buttons = [...el.querySelectorAll(':scope > .dc-sel-group > button, :scope > button')].filter(shown).map((button) => {
      const rect = button.getBoundingClientRect()
      return { name: button.getAttribute('aria-label'), left: rect.left, right: rect.right, height: rect.height }
    })
    const actions = [...el.querySelectorAll('.dc-selection-action')].filter(shown).map((button) => {
      const icon = button.querySelector('svg')
      const text = button.querySelector('.dc-selection-action-label')
      return {
        accessibleName: button.getAttribute('aria-label'),
        iconVisible: getComputedStyle(icon).display !== 'none' && icon.getBoundingClientRect().width > 0,
        labelVisible: getComputedStyle(text).display !== 'none' && text.getBoundingClientRect().width > 0,
        title: button.title,
      }
    })
    return { left: box.left, right: box.right, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, buttons, actions }
  })
  const fits = (layout, width, label) => {
    check(layout.left >= 0 && layout.right <= width, `${label}: barra dentro do ecrã a ${width} px`)
    check(layout.scrollWidth <= layout.clientWidth + 1, `${label}: sem conteúdo cortado nem rolagem escondida a ${width} px`)
    check(layout.buttons.every((button) => button.left >= layout.left && button.right <= layout.right + 1), `${label}: todos os controlos dentro da barra a ${width} px`)
  }
  const names = (layout) => layout.buttons.map((button) => button.name).join('|')
  // Capturas opcionais para revisão visual: SELECTION_BAR_SHOTS=pasta
  const shot = async (name) => { if (process.env.SELECTION_BAR_SHOTS) await page.screenshot({ path: process.env.SELECTION_BAR_SHOTS + '/' + name + '.png', clip: { x: 0, y: 500, width: page.viewportSize().width, height: 300 } }) }

  // ---- Cabos ----
  const wireBar = page.getByRole('toolbar', { name: 'Ações para cabos selecionados' })
  await wireBar.waitFor()
  for (const width of [430, 360]) {
    await page.setViewportSize({ width, height: 800 })
    await page.waitForTimeout(100)
    const layout = await visibleLayout(wireBar)
    fits(layout, width, 'Cabos')
    await shot('cabos-' + width)
    check(layout.buttons.every((button) => button.height >= 40), `Cabos: alvos táteis com pelo menos 40 px a ${width} px`)
    check(layout.actions.every((action) => action.iconVisible && !action.labelVisible && action.title.length > 0), `Cabos: filaçar/desfilaçar só com ícone e dica a ${width} px`)
    check(layout.actions.map((action) => action.accessibleName).join('|') === 'Filaçar|Desfilaçar', `Cabos: nomes acessíveis completos a ${width} px`)
    check(await wireBar.getByRole('button', { name: 'Filaçar', exact: true }).isEnabled(), `Cabos: Filaçar operável a ${width} px`)
    check(await wireBar.getByRole('button', { name: 'Apagar', exact: true }).isVisible() && await wireBar.getByRole('button', { name: 'Limpar seleção', exact: true }).isVisible(), `Cabos: Apagar e Limpar visíveis a ${width} px`)
    await wireBar.getByRole('button', { name: 'Mais ações' }).click()
    check(await wireBar.getByRole('menuitem', { name: /Organizar cabos/ }).isVisible(), `Cabos: «Organizar» passa para o menu a ${width} px`)
    await page.keyboard.press('Escape')
    check(!(await wireBar.getByRole('menu').count()), `Cabos: Esc fecha o menu a ${width} px`)
  }
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(100)
  check(!(await wireBar.getByRole('button', { name: 'Mais ações' }).isVisible()), 'Cabos: sem menu «Mais» quando tudo cabe (1280 px)')

  // ---- Um componente ----
  const ids = await page.evaluate(async () => {
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const a = useSimStore.getState().addComponent('breaker3p', 200, 200)
    const b = useSimStore.getState().addComponent('breaker3p', 400, 200)
    useSimStore.setState({ selectedWireId: null, selectedWireIds: [], selectedComponentIds: [a] })
    return [a, b]
  })
  const state = () => page.evaluate(async (ids) => {
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const s = useSimStore.getState()
    return ids.map((id) => { const c = s.components.find((entry) => entry.id === id); return { locked: !!c?.locked, rotation: c?.rotation ?? 0, mirrored: !!c?.mirrored } })
  }, ids)
  const bar = page.getByRole('toolbar', { name: 'Ações para objeto selecionado' })
  await bar.waitFor()
  let layout = await visibleLayout(bar)
  fits(layout, 1280, 'Objeto')
  await shot('objeto-1280')
  check(names(layout) === 'Seleção múltipla|Rodar 90° à esquerda|Rodar 90° à direita|Espelhar|Duplicar|Bloquear|Mais ações|Apagar|Limpar seleção', 'Objeto: ações principais visíveis e na ordem certa (1280 px) ' + names(layout))
  await bar.getByRole('button', { name: 'Rodar 90° à direita' }).click()
  check((await state())[0].rotation === 90, 'Objeto: rodar à direita muda a rotação')
  await bar.getByRole('button', { name: 'Espelhar' }).click()
  check((await state())[0].mirrored, 'Objeto: espelhar aplica-se')
  await bar.getByRole('button', { name: 'Bloquear' }).click()
  check((await state())[0].locked && await bar.getByRole('button', { name: 'Desbloquear' }).isVisible(), 'Objeto: bloquear muda para «Desbloquear»')
  check(await bar.getByRole('button', { name: 'Rodar 90° à direita' }).isDisabled(), 'Objeto: bloqueado não roda')
  await bar.getByRole('button', { name: 'Desbloquear' }).click()
  check(!(await state())[0].locked, 'Objeto: desbloquear repõe')
  await bar.getByRole('button', { name: 'Mais ações' }).click()
  const menu = bar.getByRole('menu')
  await shot('objeto-1280-menu')
  check(await menu.getByRole('menuitem', { name: /Trazer para a frente/ }).isVisible() && await menu.getByRole('menuitem', { name: /Editar apresentação/ }).isVisible(), 'Objeto: menu com ordem e apresentação')
  check(!(await menu.getByRole('menuitem', { name: /Rodar 90° à esquerda/ }).isVisible()), 'Objeto: sem duplicados no menu quando cabe na barra')
  check(await page.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem'), 'Objeto: foco entra no menu ao abrir')
  await page.keyboard.press('ArrowDown')
  check(await page.evaluate(() => /Enviar para trás/.test(document.activeElement?.textContent || '')), 'Objeto: setas percorrem o menu')
  await page.keyboard.press('Escape')
  check(!(await bar.getByRole('menu').count()) && await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Mais ações'), 'Objeto: Esc fecha o menu e devolve o foco')
  await page.keyboard.press('ArrowRight')
  check(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Apagar'), 'Objeto: setas percorrem a barra')

  for (const width of [430, 360]) {
    await page.setViewportSize({ width, height: 800 })
    await page.waitForTimeout(100)
    layout = await visibleLayout(bar)
    fits(layout, width, 'Objeto')
    await shot('objeto-' + width)
    check(layout.buttons.every((button) => button.height >= 40), `Objeto: alvos táteis com pelo menos 40 px a ${width} px`)
    check(!names(layout).includes('Rodar 90° à esquerda') && names(layout).includes('Mais ações'), `Objeto: ações secundárias passam para o menu a ${width} px`)
  }
  const before = (await state())[0].rotation
  await bar.getByRole('button', { name: 'Mais ações' }).click()
  await bar.getByRole('menuitem', { name: /Rodar 90° à esquerda/ }).click()
  check((await state())[0].rotation === (before + 270) % 360, 'Objeto: rodar à esquerda pelo menu em ecrã estreito')
  check(!(await bar.getByRole('menu').count()), 'Objeto: menu fecha depois da ação')

  // ---- Vários componentes ----
  await page.evaluate(async (ids) => { const { useSimStore } = await import('/src/store/useSimStore.ts'); useSimStore.setState({ selectedComponentIds: ids }) }, ids)
  await page.setViewportSize({ width: 1280, height: 800 })
  const multi = page.getByRole('toolbar', { name: 'Ações para objetos selecionados' })
  await multi.waitFor()
  check(/2\s*objetos/.test(await multi.locator('.dc-selection-label').innerText()), 'Vários: rótulo com contagem')
  check(!(await multi.getByRole('button', { name: 'Espelhar' }).count()), 'Vários: espelhar só para um objeto')
  await multi.getByRole('button', { name: 'Bloquear' }).click()
  check((await state()).every((c) => c.locked), 'Vários: bloquear aplica-se a todos')
  await multi.getByRole('button', { name: 'Desbloquear' }).click()
  check((await state()).every((c) => !c.locked), 'Vários: desbloquear aplica-se a todos')
  await multi.getByRole('button', { name: 'Mais ações' }).click()
  check(await multi.getByRole('menuitem', { name: /^Agrupar/ }).isVisible(), 'Vários: menu oferece agrupar')
  await shot('varios-1280-menu')
  await page.mouse.click(5, 5)
  check(!(await multi.getByRole('menu').count()), 'Vários: clicar fora fecha o menu')
  assert.deepEqual(errors, [], 'Sem exceções JavaScript')
  console.log('PASS — smoke visual da barra de seleção')
} finally {
  await browser.close()
}
