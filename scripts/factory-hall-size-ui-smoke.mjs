import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

/** Ambiente fabril: fixar o tamanho da nave bloqueia o crescimento automático ao mover equipamentos,
 *  mantém os equipamentos dentro das paredes e o botão «+» aumenta a nave. */
const output = process.env.FACTORY_HALL_OUTPUT || path.resolve('runtime/factory-hall-size')
const f = await panelFixture({ baseURL: process.env.FACTORY_HALL_TEST_URL, output }), { page, check, frame, store } = f
const hall = () => page.evaluate(() => {
  const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true)
  let env; r.scene.traverse((n) => { if (!env && n.name === 'dc-simu-factory-environment') env = n })
  const b = new T.Box3().setFromObject(env, true)
  return { minX: b.min.x, maxX: b.max.x, maxZ: b.max.z, width: b.max.x - b.min.x }
})
const tankX = (id) => page.evaluate((id) => {
  const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true)
  let o; r.scene.traverse((n) => { if (!o && n.name === `water-tank-3d-${id}`) o = n })
  const b = new T.Box3().setFromObject(o, true); return { minX: b.min.x, maxX: b.max.x }
}, id)
const moveTank = async (id, x) => { await store((s, a) => s.getState().updateComponent(a.id, { panel3DPosition: { x: a.x, y: 0, z: 4 } }), { id, x }); await frame(); await frame() }
try {
  await page.evaluate(async () => { localStorage.setItem('dc-simu:panel3d:environment', 'factory'); window.__fixtureRoot.render(null); await new Promise((r) => setTimeout(r, 200)); window.__mountPanel() })
  await page.waitForTimeout(600)
  const tankId = await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts'), { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    const tank = createComponent('waterTank', 'R1', '', 0, 700, 100)
    useSimStore.setState({ components: [tank], wires: [], factoryHall: null }); return tank.id
  })
  await page.waitForFunction((id) => { let ok = false; window.__panelState()?.scene.traverse((n) => { if (n.name === `water-tank-3d-${id}`) ok = true }); return ok }, tankId, { timeout: 60000 })
  await frame(); await frame()

  // 1) Automático: afastar o reservatório alarga a nave.
  await moveTank(tankId, 4)
  const autoNear = await hall()
  await moveTank(tankId, 40)
  const autoFar = await hall()
  check(autoFar.maxX > autoNear.maxX + 1, `Automático: afastar o equipamento alarga a nave (${autoNear.maxX.toFixed(1)} → ${autoFar.maxX.toFixed(1)})`)

  // 2) Fixar o tamanho atual no painel.
  await moveTank(tankId, 4)
  await page.click('[data-factory-hall-toggle]')
  await page.click('[data-factory-hall-fixed]')
  await frame(); await frame()
  const fixedSize = await store((s) => s.getState().factoryHall)
  check(!!fixedSize && fixedSize.widthM > 0, `Tamanho fixo guardado no projeto (${fixedSize?.widthM} × ${fixedSize?.depthM} × ${fixedSize?.heightM} m)`)
  const fixedHall = await hall()
  await moveTank(tankId, 40)
  const afterMove = await hall()
  check(Math.abs(afterMove.width - fixedHall.width) < 0.01 && Math.abs(afterMove.maxZ - fixedHall.maxZ) < 0.01, 'Tamanho fixo: mover o equipamento já não altera a nave')
  const tb = await tankX(tankId)
  await page.evaluate((id) => {
    const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true)
    let o; r.scene.traverse((n) => { if (!o && n.name === `water-tank-3d-${id}`) o = n })
    const b = new T.Box3().setFromObject(o, true), c = b.getCenter(new T.Vector3())
    r.controls?.dispatchEvent({ type: 'start' }); r.camera.position.set(c.x - 2, c.y + 4, c.z + 14); r.camera.lookAt(c); r.controls?.target?.copy(c); r.controls?.update?.(); r.invalidate()
  }, tankId)
  await frame(); await frame()
  await page.screenshot({ path: path.join(output, 'tank-at-wall.png') })
  check(tb.maxX <= afterMove.maxX - 0.65 + 0.01, `Equipamento arrastado para fora (incluindo suporte OBO e passador) fica dentro das paredes (${tb.maxX.toFixed(2)} ≤ ${(afterMove.maxX - 0.65).toFixed(2)})`)

  // 3) Aumentar a largura com o botão «+».
  await page.click('[aria-label="Aumentar largura"]'); await page.click('[aria-label="Aumentar largura"]')
  await frame(); await frame()
  const grown = await hall()
  check(grown.width > afterMove.width + 9, `«+» aumenta a largura da nave (+1 m → ${(afterMove.width / 10).toFixed(1)} → ${(grown.width / 10).toFixed(1)} m)`)
  const saved = await store((s) => JSON.parse(s.getState().saveJSON()).factoryHall ?? null)
  check(saved?.widthM === fixedSize.widthM + 1, 'Dimensões gravadas no ficheiro do projeto')
  await page.screenshot({ path: path.join(output, 'fixed-hall.png') })

  // 4) Voltar a automático.
  await page.click('[data-factory-hall-fixed]'); await frame(); await frame()
  check((await store((s) => s.getState().factoryHall)) === null, 'Desmarcar volta à nave automática')
  f.stable()
  console.log(`${f.count()} verificações da nave fabril passaram`)
} catch (error) {
  console.error(f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png') })
  throw error
} finally { await f.browser.close() }
