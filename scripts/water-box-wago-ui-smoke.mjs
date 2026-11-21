import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

/** Ambiente fabril: armário do contador assente no chão (arrasto incluído) e condutores emendados em WAGO 221-2411
 *  (um por condutor) no armário do contador e na caixa OBO onde entram os cabos das bóias. */
const output = process.env.WATER_BOX_OUTPUT || path.resolve('runtime/water-box-wago')
const f = await panelFixture({ baseURL: process.env.WATER_BOX_TEST_URL, output }), { page, check, frame, store } = f
/** Base do modelo do aparelho (só a malha do próprio modelo: sem gizmos de seleção nem etiquetas). */
const minY = (id) => page.evaluate((id) => {
  const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true)
  let model; r.scene.traverse((n) => { if (!model && (n.name === `water-supply-box-3d-${id}` || n.name === `water-tank-3d-${id}`)) model = n })
  return model ? new T.Box3().setFromObject(model, true).min.y : null
}, id)
const screenOf = (name) => page.evaluate((name) => {
  const r = window.__panelState(), T = window.__fixtureThree; let o; r.scene.traverse((n) => { if (!o && n.name.startsWith(name)) o = n })
  const c = new T.Box3().setFromObject(o, true).getCenter(new T.Vector3()).project(r.camera), rect = r.gl.domElement.getBoundingClientRect()
  return { x: rect.left + (c.x + 1) * rect.width / 2, y: rect.top + (1 - c.y) * rect.height / 2 }
}, name)
const frameOne = (id) => page.evaluate((id) => {
  const r = window.__panelState(), T = window.__fixtureThree, b = new T.Box3(); r.scene.updateMatrixWorld(true)
  r.scene.traverse((n) => { if (n.userData.isComponentRoot && n.userData.componentId === id) b.expandByObject(n, true) })
  const c = b.getCenter(new T.Vector3()), s = b.getSize(new T.Vector3()).length()
  r.controls?.dispatchEvent({ type: 'start' }); r.camera.position.set(c.x, c.y + s * 0.6, c.z + s * 2.2); r.camera.lookAt(c); r.controls?.target?.copy(c); r.controls?.update?.(); r.invalidate()
}, id)
const frameAll = () => page.evaluate(() => {
  const r = window.__panelState(), T = window.__fixtureThree, b = new T.Box3(); r.scene.updateMatrixWorld(true)
  r.scene.traverse((n) => { if (n.userData.isComponentRoot) b.expandByObject(n, true) })
  const c = b.getCenter(new T.Vector3()), s = b.getSize(new T.Vector3()).length()
  r.controls?.dispatchEvent({ type: 'start' }); r.camera.position.set(c.x, c.y + s * 0.35, c.z + s * 1.1); r.camera.lookAt(c); r.controls?.target?.copy(c); r.controls?.update?.(); r.invalidate()
})
try {
  await page.evaluate(async () => { localStorage.setItem('dc-simu:panel3d:environment', 'factory'); window.__fixtureRoot.render(null); await new Promise((r) => setTimeout(r, 200)); window.__mountPanel() })
  await page.waitForTimeout(600)
  const ids = await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts'), { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    const box = createComponent('waterSupplyBox', 'CA1', '', 0, -400, 100); box.state.doorOpen = true
    const tank = createComponent('waterTank', 'R1', '', 1, 700, 100)
    const obo = createComponent('junctionBoxOboT60', 'X1', '', 2, 1000, 100); obo.state.coverOpen = true
    const floats = [3, 4].map((i) => { const fl = createComponent('floatSwitch', 'B' + i, '', i, 420, 80); fl.state.linkedTankId = tank.id; fl.state.linkedJunctionBoxId = obo.id; return fl })
    const wago = createComponent('wago221_5', 'W1', '', 5, 600, 100); wago.state.hostLocation = 'box'; wago.state.hostBoxId = obo.id
    useSimStore.setState({ components: [box, tank, obo, ...floats, wago], wires: [], tool: 'select' })
    return { box: box.id, tank: tank.id, floats: floats.map((fl) => fl.id) }
  })
  await page.waitForFunction(() => { let n = 0; window.__panelState()?.scene.traverse((o) => { if (o.name.startsWith('wago-splice-')) n++ }); return n >= 3 }, null, { timeout: 60000 })
  await frame()

  // 1. Assente no chão (mesma cota de apoio do reservatório, que é máquina de chão).
  const floor = await minY(ids.tank), boxY = await minY(ids.box)
  check(Math.abs(boxY - floor) < 0.02, `Armário do contador assenta no pavimento (base ${boxY.toFixed(2)} = chão ${floor.toFixed(2)})`)

  // 2. Arrasto real: continua no chão e muda de sítio (câmara enquadrada só no armário).
  await frameOne(ids.box); await frame()
  const start = await screenOf('water-supply-box-3d'), before = await store((s, id) => s.getState().components.find((c) => c.id === id).panel3DPosition ?? null, ids.box)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x - 120, start.y + 40, { steps: 10 }); await page.mouse.up(); await frame()
  const after = await store((s, id) => s.getState().components.find((c) => c.id === id).panel3DPosition ?? null, ids.box)
  check(!!after && (!before || Math.hypot(after.x - before.x, after.z - before.z) > 0.2), 'Arrastar o armário desloca-o no pavimento')
  // A cota do pavimento acompanha o conteúdo da cena: compara-se com o chão atual (base do reservatório).
  const floorNow = await minY(ids.tank), boxNow = await minY(ids.box)
  check(Math.abs(boxNow - floorNow) < 0.02, `Depois de arrastado, o armário continua assente no chão (base ${boxNow.toFixed(2)} = chão ${floorNow.toFixed(2)})`)

  // 3. Fixo na parede: deixa de ser forçado ao chão e Shift + arrastar muda a altura.
  await store((s, id) => s.getState().setComponentState(id, { mounting: 'wall' }), ids.box); await frameOne(ids.box); await frame()
  const wallStart = await screenOf('water-supply-box-3d'), y0 = await minY(ids.box)
  await page.keyboard.down('Shift'); await page.mouse.move(wallStart.x, wallStart.y); await page.mouse.down(); await page.mouse.move(wallStart.x, wallStart.y - 90, { steps: 10 }); await page.mouse.up(); await page.keyboard.up('Shift'); await frame()
  check((await minY(ids.box)) > y0 + 0.2, 'Fixo na parede: Shift + arrastar sobe o armário')

  // 4. Emendas: um WAGO 221-2411 por condutor (contador: 3; duas bóias na OBO: 6).
  const splices = await page.evaluate(() => {
    const out = {}; window.__panelState().scene.traverse((o) => { const m = /^wago-221-2411-(.+)-(\d)$/.exec(o.name); if (m) out[m[1]] = (out[m[1]] ?? 0) + 1 })
    return out
  })
  check(splices.contador === 3, `Contador: +24V, PULSE e GND cada um no seu WAGO (${splices.contador ?? 0})`)
  check(ids.floats.every((id) => splices[id] === 3), `Bóias na OBO: NA, C e NF de cada bóia em WAGO próprios (${ids.floats.map((id) => splices[id] ?? 0).join(' + ')})`)
  await frameAll(); await frame()
  await page.screenshot({ path: path.join(output, 'factory-water-box-obo.png') })
  f.stable()
  console.log(`PASS — ${f.count()} verificações do armário do contador e das emendas WAGO`)
} finally { await f.browser.close() }
