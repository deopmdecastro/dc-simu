import { browserFixture } from './browser-fixture.mjs'

/** Actual Sidebar and Vite modules in a disposable React root. No API/remote
 * writes, no canvas fitting/GPU needed to inspect legacy 2D-only components. */
export async function inspectorFixture(options = {}) {
  const f = await browserFixture(options), { page } = f
  await page.evaluate(async () => {
    document.getElementById('root').style.height = '100dvh'
    const { default: Sidebar } = await import('/src/components/Sidebar.tsx')
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    await window.__fixtureImport('/src/electrical/factory.ts')
    useSimStore.getState().stop()
    useSimStore.setState({ components: [], wires: [], canvasNotes: [], canvasTexts: [], selectedComponentIds: [], selectedWireId: null, selectedWireIds: [], selectedTerminalId: null, demoMode: false, tool: 'select', history: [], future: [] })
    window.__fixtureRoot.render(window.__fixtureReact.createElement(window.__fixtureReact.StrictMode, null,
      window.__fixtureReact.createElement(Sidebar, { width: 'min(380px, 100vw)', quickAddOnPick: true })))
  })
  await page.getByRole('textbox', { name: 'Pesquisar componentes' }).waitFor()
  const store = (fn, arg) => page.evaluate(async ({ source, arg }) => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    return Function('s', 'arg', 'return (' + source + ')(s,arg)')(useSimStore, arg)
  }, { source: fn.toString(), arg })
  const frame = () => page.evaluate(() => window.__fixtureFrames())
  const show = async (type, count = 1) => {
    const ids = await page.evaluate(async ({ type, count }) => {
      const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
      const { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
      useSimStore.getState().stop()
      const components = Array.from({ length: count }, (_, i) => createComponent(type, 'TEST' + i, 'Elemento de teste', i, 160 * i, 0))
      useSimStore.setState({ components, wires: [], canvasNotes: [], canvasTexts: [], selectedComponentIds: components.map(c => c.id), selectedWireId: null, selectedWireIds: [], selectedTerminalId: null, demoMode: false, tool: 'select', history: [], future: [] })
      return components.map(c => c.id)
    }, { type, count })
    await page.locator('.dc-inspector-component').waitFor(); await frame()
    return ids
  }
  const openGroups = async () => { await page.locator('.dc-inspector-scroll details').evaluateAll(nodes => nodes.forEach(n => { n.open = true })); await frame() }
  return { ...f, store, frame, show, openGroups }
}
