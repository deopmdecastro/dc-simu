import path from 'node:path'
import { browserFixture } from './lib/browser-fixture.mjs'

const output = path.resolve('../../../runtime/wire-panel-ux')
const f = await browserFixture({ output, height: 900 }), { page, check } = f
const state = () => page.evaluate(async () => (await window.__fixtureImport('/src/store/useSimStore.ts')).useSimStore.getState().wireDefaults)
const openFor = async locator => {
  const parents = await locator.evaluate(el => {
    const all = [...document.querySelectorAll('details')], result = []
    for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) result.unshift(all.indexOf(parent))
    return result
  })
  for (const index of parents) await page.locator('details').nth(index).locator(':scope > summary').click()
}
try {
  await page.evaluate(async () => {
    const React = window.__fixtureReact
    document.body.style.fontFamily = 'Inter, "Segoe UI", system-ui, sans-serif'
    const { default: Sidebar } = await import('/src/components/Sidebar.tsx')
    const { default: Panel3D } = await import('/src/three/Panel3D.tsx')
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    useSimStore.setState({ components: [], wires: [], canvasNotes: [], canvasTexts: [], demoMode: false, tool: 'wire', selectedComponentIds: [] })
    useSimStore.getState().setWireDefaults({ medium: 'electrical', gauge: '1.5mm²', color: 'red', autoColor: true, endType: 'ferrule', route: 'orthogonal' })
    window.__fixtureRoot.render(React.createElement('div', { style: { display: 'flex', height: '100dvh', overflow: 'hidden' } },
      React.createElement(Sidebar, { width: 'min(380px,100vw)' }),
      React.createElement('main', { style: { flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' } }, React.createElement(Panel3D, { frontEdit: true }))))
  })
  const panel = page.locator('.dc-wire-new')
  await panel.locator('.wo-fields').waitFor()
  const choose = async (medium) => panel.locator('[data-conduit-medium-group]').getByRole('radio', { name: { electrical: 'Cabo elétrico', hydraulic: 'Tubo hidráulico', pneumatic: 'Tubo pneumático' }[medium], exact: true }).click()
  const canvas = page.locator('main canvas').first(), canvasBox = await canvas.boundingBox()
  await canvas.click({ position: { x: canvasBox.width * 0.55, y: canvasBox.height * 0.55 } })
  await panel.locator('.wo-draft-card.is-active').waitFor()
  check(await panel.locator('.wo-draft-route').isVisible(), 'Ligação em curso mantém origem e destino visíveis')
  await page.screenshot({ path: path.join(output, 'after-active-draft-1440.png') })
  await panel.getByRole('button', { name: 'Cancelar', exact: true }).click()
  check(await panel.locator('.wo-draft-card.is-active').count() === 0, 'Cancelar regressa ao estado pronto para ligar')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const medium of ['electrical', 'hydraulic', 'pneumatic']) {
      await choose(medium)
      await page.locator('.dc-inspector-scroll').evaluate(el => el.scrollTop = 0)
      check(await panel.locator('.wo-fields').getAttribute('data-conduit-active-medium') === medium, `${width}px: tipo ${medium} selecionado`)
      if (medium === 'electrical') check(await panel.locator('[data-wire-section="color"] .wo-current-color').count() === 0, `${width}px: modo AUTO não mostra a última cor manual`)
      const metrics = await panel.evaluate(el => {
        const fields = el.querySelector('.wo-fields'), rect = fields.getBoundingClientRect()
        const controls = [...fields.querySelectorAll('button, summary')].filter(node => node.getClientRects().length)
        return {
          overflow: fields.scrollWidth > fields.clientWidth + 1,
          small: controls.filter(node => node.getBoundingClientRect().height < 39 || node.getBoundingClientRect().width < 39).map(node => ({ text: node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })),
          typesTop: [...fields.querySelectorAll('[data-conduit-medium-group] [role="radio"]')].map(node => Math.round(node.getBoundingClientRect().top)),
          width: rect.width,
        }
      })
      check(!metrics.overflow, `${width}px/${medium}: opções sem extravasamento horizontal`)
      check(metrics.small.length === 0, `${width}px/${medium}: controlos visíveis com alvo ≥40px ${JSON.stringify(metrics.small)}`)
      check(new Set(metrics.typesTop).size === 1, `${width}px/${medium}: três meios na mesma linha`)
      await page.screenshot({ path: path.join(output, `after-${medium}-${width}.png`) })
    }
  }
  await choose('hydraulic')
  const material = panel.getByRole('radiogroup', { name: 'Material hidráulico', exact: true, includeHidden: true })
  const copper = material.getByRole('radio', { name: 'Cobre', exact: true, includeHidden: true })
  await openFor(copper); await copper.click()
  const pressure = panel.getByRole('radio', { name: 'PN16', exact: true, includeHidden: true })
  await openFor(pressure); await pressure.click()
  check(await material.getByRole('radio', { checked: true }).count() === 1, 'Material mantém uma seleção própria, independente da pressão')
  const gauge = panel.getByRole('radio', { name: 'Bitola DN25 (Ø32mm)', exact: true })
  await gauge.click()
  const before = await state(); await choose('hydraulic'); const after = await state()
  check(before.gauge === after.gauge && after.hydraulicMaterial === 'copper' && after.hydraulicPressureBar === 16, 'Clicar novamente no meio ativo preserva dimensão, material e pressão')
  await choose('electrical')
  const ring = panel.locator('.wo-end').filter({ hasText: 'Olhal' }).first()
  await openFor(ring); await ring.click()
  const blue = panel.getByRole('radio', { name: 'Azul', exact: true, includeHidden: true })
  await openFor(blue); await blue.click()
  const electric = await state()
  check(electric.endType === 'ring' && electric.color === 'blue' && !electric.autoColor, 'Terminação e cor continuam aplicadas ao próximo cabo')
  const summary = panel.locator('details > summary').first()
  await summary.focus()
  const wasOpen = await summary.evaluate(el => el.parentElement.open)
  await page.keyboard.press('Enter')
  check(await summary.evaluate(el => el.parentElement.open) !== wasOpen, 'Grupos recolhíveis funcionam pelo teclado')
  check(await summary.evaluate(el => getComputedStyle(el).outlineStyle !== 'none'), 'Foco de teclado visível')
  await choose('pneumatic')
  const union = panel.locator('[data-pneumatic-only-controls] .wo-preset').filter({ hasText: 'União em Y' })
  await openFor(union); await union.click()
  check((await state()).pneumaticFitting === 'pushInY', 'Conectores pneumáticos continuam disponíveis nos grupos recolhíveis')
  await page.locator('.dc-inspector-scroll').evaluate(el => el.scrollTop = 0)
  await page.evaluate(async () => {
    const { default: WirePanel } = await import('/src/admin/editor3d/WirePanel.tsx')
    const { useEditorStore } = await window.__fixtureImport('/src/admin/editor3d/editorStore.ts')
    useEditorStore.getState().set({ ribbon: 'wire' })
    window.__fixtureRoot.render(window.__fixtureReact.createElement('div', { style: { width: 340 } }, window.__fixtureReact.createElement(WirePanel, { embedded: true })))
  })
  const editor = page.locator('.ce-wirepanel')
  await editor.waitFor()
  check(await editor.locator('.wo-end').count() === 11 && await editor.locator('.wo-choice').count() === 2, 'Editor de componentes conserva todas as pontas e os dois condutores')
  check(await editor.locator('.wo-fields.is-progressive').count() === 0, 'Editor conserva a apresentação sem grupos progressivos')
  await editor.locator('.wo-end').filter({ hasText: 'Forquilha' }).click()
  check(await page.evaluate(async () => (await window.__fixtureImport('/src/admin/editor3d/editorStore.ts')).useEditorStore.getState().wireDefaults.endType) === 'fork', 'Opções partilhadas continuam a alterar cabos no editor de componentes')
  f.stable()
  console.log(`${f.count()} verificações passaram`)
} finally { await f.browser.close() }
