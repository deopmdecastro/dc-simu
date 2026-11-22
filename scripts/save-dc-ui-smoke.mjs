import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { browserFixture } from './lib/browser-fixture.mjs'

const output = path.resolve('runtime/save-dc')
const f = await browserFixture({ output, baseURL: process.env.DC_SAVE_TEST_URL }), { page, check } = f
const magic = 'DCSIMU\x01'
try {
  const expected = await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const { default: Toolbar } = await window.__fixtureImport('/src/components/Toolbar.tsx')
    const s = useSimStore.getState()
    s.newProject('all')
    const id = s.addComponent('mecRotaryArm', 100, 120)
    s.setComponentState(id, { angleDeg: 180, armDownPct: 50 })
    s.updateComponent(id, { panel3DPosition: { x: 1, y: 2, z: 3 } })
    s.setCurrentProjectName('Ensaio guardar DC')
    window.__fixtureRoot.render(window.__fixtureReact.createElement(Toolbar, {
      mode: 'schematic', setMode() {}, ladderSection: 'main', setLadderSection() {}, onBack() {},
    }))
    await window.__fixtureFrames()
    return JSON.parse(useSimStore.getState().saveJSON())
  })
  const downloadFrom = async (action, suffix) => {
    const [download] = await Promise.all([page.waitForEvent('download'), action()])
    check(download.suggestedFilename() === 'dc-simu-ensaio-guardar-dc.dc', `${suffix}: nome e extensão .dc`)
    const file = path.join(output, suffix + '.dc')
    await download.saveAs(file)
    const content = await readFile(file, 'utf8')
    check(content.startsWith(magic), `${suffix}: cabeçalho nativo DCSIMU versão 1`)
    const { savedAt, ...project } = JSON.parse(content.slice(magic.length))
    const { savedAt: previousSavedAt, ...expectedProject } = expected
    assert.ok(Number.isFinite(Date.parse(savedAt)))
    assert.deepEqual(project, expectedProject)
    check(true, `${suffix}: projeto completo preservado no ficheiro`)
    return file
  }
  const file = await downloadFrom(() => page.getByTitle('Descarregar projeto (.dc) (Ctrl+S)', { exact: true }).click(), 'botao')
  await downloadFrom(() => page.keyboard.press('Control+s'), 'atalho')
  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    useSimStore.getState().newProject('all')
  })
  await page.locator('input[type="file"]').setInputFiles(file)
  await page.waitForFunction(() => window.__fixtureModule('/src/store/useSimStore.ts').useSimStore.getState().components.length === 1)
  const restored = await page.evaluate(() => {
    const c = window.__fixtureModule('/src/store/useSimStore.ts').useSimStore.getState().components[0]
    return { type: c.type, angle: c.state.angleDeg, down: c.state.armDownPct, position: c.panel3DPosition }
  })
  assert.deepEqual(restored, { type: 'mecRotaryArm', angle: 180, down: 50, position: { x: 1, y: 2, z: 3 } })
  check(true, 'Abrir: reimporta o .dc descarregado e restaura os dados 3D')
  await page.evaluate(() => window.__fixtureModule('/src/store/useSimStore.ts').useSimStore.getState().setCurrentProjectName('Ensaio guardar DC'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.dc-project-file-tools button').first().click()
  const mobileExpected = await page.evaluate(() => JSON.parse(window.__fixtureModule('/src/store/useSimStore.ts').useSimStore.getState().saveJSON()))
  Object.assign(expected, mobileExpected)
  await downloadFrom(() => page.getByRole('menuitem', { name: /Guardar projeto/ }).click(), 'menu')
  f.stable()
  console.log(`${f.count()} verificações de Salvar/Abrir .dc passaram`)
} catch (error) {
  console.error(f.errors)
  console.error(await page.locator('body').innerText())
  await page.screenshot({ path: path.join(output, 'failure.png') })
  throw error
} finally { await f.browser.close() }
