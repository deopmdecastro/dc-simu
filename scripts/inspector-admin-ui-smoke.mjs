import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { browserFixture } from './lib/browser-fixture.mjs'

const output = path.resolve('docs/validation/inspectors-all-elements')
const f = await browserFixture({ output }), { page, check } = f
try {
  await page.evaluate(async () => {
    await import('/src/styles/catalog-editor.css')
    const { useEditorStore, BASE_STATE, newTerminal } = await window.__fixtureImport('/src/admin/editor3d/editorStore.ts')
    const { defaultDefinition, defaultPart, DEFAULT_META } = await window.__fixtureImport('/src/catalog/definition.ts')
    const { newControl, newDisplay } = await window.__fixtureImport('/src/admin/editor3d/controlOps.ts')
    const T = await import('/node_modules/.vite/deps/three.js')
    const { default: Navigation } = await import('/src/admin/editor3d/InspectorNavigation.tsx')
    const tabs1 = await import('/src/admin/editor3d/tabs1.tsx'), tabs2 = await import('/src/admin/editor3d/tabs2.tsx')
    const { WiresTab } = await import('/src/admin/editor3d/WireInspector.tsx')
    const controls = await import('/src/admin/editor3d/tabsControls.tsx'), { IecTab } = await import('/src/admin/editor3d/tabsIec.tsx')
    const def = defaultDefinition()
    def.parts.push({ ...defaultPart('box', def.materials[0].id, 'Segunda peça'), position: [0, 40, 0] })
    def.terminals = ['1', '2'].map((label, i) => ({ ...newTerminal(def, [i * 10, 40, 29], [0, 0, 1]), id: 'port-' + label, label, name: 'Borne ' + label }))
    def.controls = [newControl(def, 'toggle', def.parts[0].id)]
    def.displays = [newDisplay(def, new T.Box3(new T.Vector3(-18, 0, -29), new T.Vector3(18, 80, 29)))]
    def.lights = [{ id: 'light', name: 'Luz de ensaio', partId: def.parts[0].id, color: '#22c55e', intensity: 2.2 }]
    const wire = { id: 'test-wire', a: 'port-1', b: 'port-2', points: [], number: 'W1', color: 'black', gauge: '1.5mm²', route: 'orthogonal', kind: 'power', flexibility: 'flexible' }
    useEditorStore.setState({ def, meta: { ...DEFAULT_META, name: 'Inspetor sintético' }, selection: { kind: 'part', id: def.parts[0].id }, mode: 'edit', editState: BASE_STATE, tab: 'object', past: [], future: [], dirty: false, testWires: [wire], selectedWire: 'test-wire' })
    window.__adminInspectorFixture = { ids: { first: def.parts[0].id, second: def.parts[1].id }, tabs: ['object', 'materials', 'terminals', 'wires', 'controls', 'displays', 'lights', 'states', 'interactions', 'component', 'iec'] }
    const tabs = { object: tabs1.ObjectTab, materials: tabs1.MaterialsTab, terminals: tabs2.TerminalsTab, wires: WiresTab, controls: controls.ControlsTab, displays: controls.DisplaysTab, lights: tabs2.LightsTab, states: tabs2.StatesTab, interactions: tabs2.InteractionsTab, component: tabs2.ComponentTab, iec: IecTab }
    const React = window.__fixtureReact
    function Inspector() {
      const tab = useEditorStore(s => s.tab)
      return React.createElement('div', { className: 'ce-root', style: { width: 'min(390px, 100vw)', height: '100dvh' } },
        React.createElement('div', { className: 'ce-body ce-mobile-inspector', style: { display: 'block', height: '100%' } },
          React.createElement('aside', { className: 'ce-right', style: { width: '100%', height: '100%' } },
            React.createElement(Navigation, { onToggle() {}, onMobileClose() {} }),
            React.createElement('div', { key: tab, id: 'ce-inspector-panel', className: 'ce-inspector', role: 'tabpanel', 'aria-labelledby': 'ce-inspector-tab-' + tab }, React.createElement(tabs[tab])))))
    }
    window.__fixtureRoot.render(React.createElement(React.StrictMode, null, React.createElement(Inspector)))
  })
  const editor = (fn, arg) => page.evaluate(async ({ source, arg }) => { const { useEditorStore } = await window.__fixtureImport('/src/admin/editor3d/editorStore.ts'); return Function('s', 'arg', 'return (' + source + ')(s,arg)')(useEditorStore, arg) }, { source: fn.toString(), arg })
  await page.getByLabel('Posição X (mm)', { exact: true }).waitFor()
  const x = page.getByLabel('Posição X (mm)', { exact: true })
  await x.fill('12'); await x.press('Enter')
  check(await editor(s => s.getState().def.parts[0].position[0]) === 12, 'Admin: campo de posição grava o eixo correto ao confirmar')
  await editor(s => s.getState().undo()); await page.evaluate(() => window.__fixtureFrames())
  check(await editor(s => s.getState().def.parts[0].position[0]) === 0, 'Admin: Desfazer restaura a pose base')
  await page.getByLabel('Escala X', { exact: true }).fill('0'); await page.getByLabel('Escala X', { exact: true }).press('Tab')
  check(await page.getByLabel('Escala X', { exact: true }).getAttribute('aria-invalid') === 'true' && await editor(s => s.getState().def.parts[0].scale[0]) === 1, 'Admin: escala nula rejeitada sem deformar a peça')
  await x.fill('23')
  await editor(s => s.getState().set({ selection: { kind: 'part', id: s.getState().def.parts[1].id } })); await page.evaluate(() => window.__fixtureFrames())
  await page.getByLabel('Posição X (mm)', { exact: true }).press('Tab')
  check(await editor(s => s.getState().def.parts.every(p => p.position[0] === 0)), 'Admin: rascunho numérico não passa para a peça seguinte')
  const tabInfo = [
    ['object', 'Construção', 'Objeto'], ['materials', 'Construção', 'Materiais'], ['terminals', 'Construção', 'Bornes'], ['wires', 'Construção', 'Cabos'],
    ['controls', 'Funcionamento', 'Botões'], ['displays', 'Funcionamento', 'Ecrãs'], ['lights', 'Funcionamento', 'Luzes'], ['states', 'Funcionamento', 'Estados'], ['interactions', 'Funcionamento', 'Interações'],
    ['component', 'Componente', 'Componente'], ['iec', 'Componente', 'Símbolo IEC'],
  ]
  for (const [id, group, label] of tabInfo) {
    await editor((s, id) => { const d = s.getState().def; s.getState().set({ selection: id === 'object' ? { kind: 'part', id: d.parts[0].id } : id === 'terminals' ? { kind: 'terminal', id: d.terminals[0].id } : id === 'controls' ? { kind: 'control', id: d.controls[0].id } : id === 'displays' ? { kind: 'display', id: d.displays[0].id } : id === 'lights' ? { kind: 'light', id: d.lights[0].id } : null }) }, id)
    await page.getByRole('button', { name: group, exact: true }).click()
    const tab = page.getByRole('tab', { name: label, exact: true }); await tab.click()
    await page.evaluate(() => window.__fixtureFrames())
    check(await tab.getAttribute('aria-selected') === 'true' && await page.locator('.ce-inspector').innerText().then(t => t.trim().length > 0), 'Admin: separador ' + label + ' abre os controlos do contexto correto')
  }
  await page.getByRole('tab', { name: 'Componente', exact: true }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Nome editado no inspetor')
  check(await editor(s => s.getState().meta.name) === 'Nome editado no inspetor', 'Admin: identificação do componente editável por rótulo acessível')
  await page.screenshot({ path: path.join(output, 'admin-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, 'admin-mobile.png') })
  f.stable()
  await writeFile(path.join(output, 'admin-results.json'), JSON.stringify({ tabs: tabInfo.map(t => t[0]), checks: f.count(), errors: f.errors, scope: '11 separadores reais do editor, definição sintética local; posição/escala, Undo e troca de seleção. Sem API ou publicação.' }, null, 2) + '\n')
} catch (error) { console.error(JSON.stringify(f.errors)); await page.screenshot({ path: path.join(output, 'admin-failure.png') }).catch(() => {}); throw error }
finally { await f.browser.close() }
