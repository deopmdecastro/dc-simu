import assert from 'node:assert/strict'
import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

const output = path.resolve('runtime/panel-groups')
const f = await panelFixture({ baseURL: process.env.PANEL_GROUPS_TEST_URL, output }), { page, check, frame, store } = f
const settle = async () => { await frame(); await frame() }
const positions = () => store((s) => s.getState().components.map((c) => ({ ...c.panel3DPosition })))
const center = (id) => page.evaluate((id) => {
  const r = window.__panelState(), T = window.__fixtureThree
  r.scene.updateMatrixWorld(true)
  let root
  r.scene.traverse((n) => { if (n.userData.isComponentRoot && n.userData.componentId === id) root = n })
  const p = new T.Box3().setFromObject(root, true).getCenter(new T.Vector3()).project(r.camera)
  const rect = r.gl.domElement.getBoundingClientRect()
  return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 }
}, id)
try {
  const ids = await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    const { default: Panel3D } = await window.__fixtureImport('/src/three/Panel3D.tsx')
    const { default: SelectionBar } = await window.__fixtureImport('/src/components/SelectionBar.tsx')
    const st = useSimStore.getState()
    st.newProject('all')
    const comps = [0, 1, 2].map((i) => {
      const c = createComponent('mecSupportBlock', 'B' + i, '', i, 100 + i * 180, 100)
      c.panel3DPosition = { x: -2 + i * 2, y: 1 + i * 0.3, z: 4 }
      return c
    })
    useSimStore.setState({ components: comps, wires: [], selectedComponentIds: [], allowOutsideFactory: true })
    localStorage.setItem('dc-simu:panel3d:environment', 'factory')
    window.__fixtureRoot.render(null); await window.__fixtureFrames()
    window.__fixtureRoot.render(window.__fixtureReact.createElement(window.__fixtureReact.Fragment, null,
      window.__fixtureReact.createElement(Panel3D, { frontEdit: true }), window.__fixtureReact.createElement(SelectionBar)))
    return comps.map((c) => c.id)
  })
  await page.waitForFunction(() => !!window.__panelState()?.controls)
  await page.waitForFunction((ids) => {
    const found = new Set()
    window.__panelState()?.scene.traverse((n) => { if (n.userData.isComponentRoot) found.add(n.userData.componentId) })
    return ids.every((id) => found.has(id))
  }, ids, { timeout: 60000 })
  await page.waitForTimeout(1400)
  await page.evaluate(() => {
    const r = window.__panelState(), T = window.__fixtureThree
    r.controls.dispatchEvent({ type: 'start' })
    const target = new T.Vector3(0, 1.2, 4)
    r.camera.position.set(7, 8, 16); r.camera.lookAt(target); r.camera.updateProjectionMatrix()
    r.controls.target.copy(target); r.controls.update(); r.invalidate()
  })
  await settle()
  await store((s, ids) => s.getState().selectComponents(ids.slice(0, 2)), ids)
  const bar = page.getByRole('toolbar', { name: 'Ações para objetos selecionados' })
  await bar.waitFor()
  check(await bar.getByRole('button', { name: 'Agrupar', exact: true }).isEnabled(), 'Agrupar visível na barra, sem abrir Mais ações')
  check(await bar.getByRole('button', { name: 'Desagrupar', exact: true }).isDisabled(), 'Desagrupar explica a ausência de grupo')
  await page.screenshot({ path: path.join(output, 'desktop-before.png') })
  await bar.getByRole('button', { name: 'Agrupar', exact: true }).click()
  check(await store((s) => s.getState().selectionGroups.length === 1), 'botão cria um grupo persistente')
  check(await bar.getByRole('button', { name: 'Desagrupar', exact: true }).isEnabled(), 'Desagrupar fica disponível após agrupar')
  await settle()
  await page.screenshot({ path: path.join(output, 'desktop-after.png') })
  await store((s) => s.getState().selectComponents([])); await settle()
  const p = await center(ids[0]); await page.mouse.click(p.x, p.y); await settle()
  check(await store((s) => s.getState().selectedComponentIds.length === 2), 'clicar num membro no 3D seleciona o grupo inteiro')
  const before = await positions(), history = await store((s) => s.getState().history.length)
  const start = await center(ids[0])
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  await page.mouse.move(start.x + 60, start.y - 35, { steps: 12 }); await page.mouse.up(); await settle()
  const after = await positions(), d = { x: after[0].x - before[0].x, y: after[0].y - before[0].y, z: after[0].z - before[0].z }
  check(Math.hypot(d.x, d.y, d.z) > 0.1, 'arrasto real move o grupo no 3D')
  check(['x', 'y', 'z'].every((axis) => Math.abs(after[1][axis] - before[1][axis] - d[axis]) < 1e-5), 'arrasto preserva as distâncias e alturas relativas')
  assert.deepEqual(after[2], before[2]); check(true, 'objeto não agrupado fica imóvel')
  check(await store((s, history) => s.getState().history.length === history + 1, history), 'arrasto do grupo cria uma única entrada no histórico')
  check(await store((s) => s.getState().sim.runState === 'stopped'), 'arrasto e agrupamento mantêm a simulação em STOP')
  await page.keyboard.press('Control+z'); await settle()
  assert.deepEqual(await positions(), before); check(true, 'um Ctrl+Z repõe todos os membros')
  await page.keyboard.press('Control+y'); await settle()
  assert.deepEqual(await positions(), after); check(true, 'Ctrl+Y repõe o movimento completo')
  await page.screenshot({ path: path.join(output, 'desktop-after.png') })
  await bar.getByRole('button', { name: 'Desagrupar', exact: true }).click()
  await store((s) => s.getState().selectComponents([])); await settle()
  const single = await center(ids[0]); await page.mouse.click(single.x, single.y); await settle()
  check(await store((s) => s.getState().selectedComponentIds.length === 1 && s.getState().selectionGroups.length === 0), 'desagrupar devolve a seleção individual')
  await store((s, ids) => s.getState().selectComponents(ids.slice(0, 2)), ids)
  await page.keyboard.press('Control+g'); await settle()
  check(await store((s) => s.getState().selectionGroups.length === 1), 'Ctrl+G agrupa no 3D')
  await page.keyboard.press('Control+Shift+g'); await settle()
  check(await store((s) => s.getState().selectionGroups.length === 0), 'Ctrl+Shift+G desagrupa no 3D')
  await page.setViewportSize({ width: 390, height: 844 }); await settle()
  const mobile = await bar.boundingBox()
  check(mobile.x >= 0 && mobile.x + mobile.width <= 390, 'barra cabe a 390 px sem cortes')
  const groupButton = bar.getByRole('button', { name: 'Agrupar', exact: true })
  const target = await groupButton.boundingBox()
  check(target.width >= 40 && target.height >= 40 && target.x >= 0 && target.x + target.width <= 390, 'ação Agrupar visível com alvo de toque de 40 × 40 px')
  await page.screenshot({ path: path.join(output, 'phone-before.png') })
  await groupButton.click(); await settle()
  check(await bar.getByRole('button', { name: 'Desagrupar', exact: true }).isVisible(), 'Desagrupar acessível também a 390 px')
  await page.screenshot({ path: path.join(output, 'phone-after.png') })
  await page.setViewportSize({ width: 1440, height: 900 }); await settle()
  await store((s, ids) => s.getState().setComponentsLocked([ids[1]], true), ids)
  const lockedPositions = await positions(), lockedStart = await center(ids[0])
  await page.mouse.move(lockedStart.x, lockedStart.y); await page.mouse.down()
  await page.mouse.move(lockedStart.x + 50, lockedStart.y - 25, { steps: 8 }); await page.mouse.up(); await settle()
  assert.deepEqual(await positions(), lockedPositions)
  check(true, 'um membro bloqueado impede mover apenas parte do grupo')
  await store((s) => s.setState({ sim: { ...s.getState().sim, runState: 'running' } }))
  await settle()
  check(!await bar.isVisible() || await bar.getByRole('button', { name: 'Desagrupar', exact: true }).isDisabled(), 'Desagrupar fica indisponível durante RUN')
  f.stable()
  console.log(`${f.count()} verificações de grupos no 3D passaram`)
} catch (error) {
  console.error(f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png') })
  throw error
} finally { await f.browser.close() }
