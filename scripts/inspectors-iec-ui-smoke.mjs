import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { browserFixture } from './lib/browser-fixture.mjs'

const output = path.resolve('docs/validation/inspectors-all-elements')
const f = await browserFixture({ output }), { page, check } = f
const coverage = []
try {
  const kinds = await page.evaluate(async () => {
    const { default: Sidebar } = await import('/src/commands/CommandsSidebar.tsx')
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const { useCommandsUi } = await window.__fixtureImport('/src/commands/commandsUi.ts')
    const { CMD_PARTS } = await window.__fixtureImport('/src/commands/model.ts')
    useCommandsUi.getState().stop(); useSimStore.setState({ canvasTexts: [], components: [], wires: [], demoMode: false })
    window.__fixtureRoot.render(window.__fixtureReact.createElement(Sidebar, { width: 'min(380px, 100vw)', onCollapse() {} }))
    return Object.keys(CMD_PARTS)
  })
  for (const kind of kinds) {
    const info = await page.evaluate(async kind => {
      const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
      const { useCommandsUi } = await window.__fixtureImport('/src/commands/commandsUi.ts')
      const { CMD_PARTS, emptyCommands } = await window.__fixtureImport('/src/commands/model.ts')
      const part = { id: 'iec-test-' + kind, kind, tag: 'X1', x: 100, y: 100, rot: 0 }
      useSimStore.setState({ commands: { ...emptyCommands(), parts: [part], wires: [] }, history: [], future: [] })
      useCommandsUi.getState().select({ type: 'part', id: part.id }, 'canvas')
      await window.__fixtureFrames()
      return { prefix: CMD_PARTS[kind].prefix, part }
    }, kind)
    await page.locator('.dc-cmd-props').waitFor()
    const tag = page.getByLabel(kind === 'pageRef' || kind === 'pageRefIn' ? 'Nome da ligação entre páginas' : 'Referência do aparelho', { exact: true })
    if (info.prefix || kind === 'pageRef' || kind === 'pageRefIn') {
      await tag.fill(' K 27 ')
      check(await page.evaluate(async () => (await window.__fixtureImport('/src/store/useSimStore.ts')).useSimStore.getState().commands.parts[0].tag) === 'K27', kind + ': referência editável e normalizada')
    }
    const font = page.getByLabel('Tamanho da referência', { exact: true })
    if (await font.count()) {
      await font.fill('18'); await font.press('Tab')
      check(await page.evaluate(async () => (await window.__fixtureImport('/src/store/useSimStore.ts')).useSimStore.getState().commands.parts[0].tagStyle.fontSize) === 18, kind + ': formatação numérica confirma ao sair')
    }
    const state = await page.evaluate(async () => {
      const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
      const current = useSimStore.getState().commands.parts[0], saved = useSimStore.getState().saveJSON()
      useSimStore.getState().loadJSON(saved)
      return { current, reopened: useSimStore.getState().commands.parts[0], controls: document.querySelectorAll('.dc-cmd-props input,.dc-cmd-props button').length }
    })
    check(state.reopened.id === info.part.id && state.reopened.kind === kind && state.reopened.tag === state.current.tag && JSON.stringify(state.reopened.labels) === JSON.stringify(state.current.labels), kind + ': guardar/reabrir preserva símbolo e bornes')
    coverage.push({ kind, controls: state.controls })
  }
  // A draft from one symbol must not be applied to the next when both values
  // are equal; the same React root stays mounted throughout the transitions.
  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const { useCommandsUi } = await window.__fixtureImport('/src/commands/commandsUi.ts')
    const { emptyCommands } = await window.__fixtureImport('/src/commands/model.ts')
    useSimStore.setState({ commands: { ...emptyCommands(), parts: ['a', 'b'].map(id => ({ id, kind: 'coil', tag: id.toUpperCase(), x: 100, y: 100, rot: 0 })) } })
    useCommandsUi.getState().select({ type: 'part', id: 'a' }, 'canvas'); await window.__fixtureFrames()
  })
  const font = page.getByLabel('Tamanho da referência', { exact: true })
  await font.fill('25')
  await page.evaluate(async () => { (await window.__fixtureImport('/src/commands/commandsUi.ts')).useCommandsUi.getState().select({ type: 'part', id: 'b' }, 'canvas'); await window.__fixtureFrames() })
  await page.getByLabel('Tamanho da referência', { exact: true }).press('Tab')
  check(await page.evaluate(async () => (await window.__fixtureImport('/src/store/useSimStore.ts')).useSimStore.getState().commands.parts.every(p => !p.tagStyle?.fontSize)), 'IEC: mudar seleção descarta rascunho sem contaminar o outro símbolo')
  f.stable()
  await writeFile(path.join(output, 'iec-results.json'), JSON.stringify({ kinds: kinds.length, coverage, checks: f.count(), errors: f.errors, scope: 'Todos CMD_PARTS no inspetor IEC React real, configuração e persistência; pedidos externos bloqueados.' }, null, 2) + '\n')
} catch (error) { await page.screenshot({ path: path.join(output, 'iec-failure.png') }).catch(() => {}); throw error }
finally { await f.browser.close() }
