import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

/** Ambiente fabril em vista rasante (câmara a ~11°, pela esquerda/frente, como na captura do utilizador):
 *  arrastar uma bomba pelo chão é contínuo — nenhum pixel de rato provoca um salto grande — e os dois
 *  eixos do pavimento respondem (esquerda/direita e profundidade), também numa vista lateral a 0°.
 *  1 unidade de cena = 100 mm. */
const output = process.env.FACTORY_DRAG_OUTPUT || path.resolve('runtime/factory-drag')
const f = await panelFixture({ baseURL: process.env.FACTORY_DRAG_TEST_URL, output }), { page, check, frame, store } = f
const settle = async () => { for (let i = 0; i < 3; i++) await frame() }
const pos = (id) => store((s, id) => ({ ...s.getState().components.find((c) => c.id === id).panel3DPosition }), id)
const center = (id) => page.evaluate((id) => {
  const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true)
  let o; r.scene.traverse((n) => { if (!o && n.userData.isComponentRoot && n.userData.componentId === id) o = n })
  const c = new T.Box3().setFromObject(o, true).getCenter(new T.Vector3()); c.project(r.camera)
  const rect = r.gl.domElement.getBoundingClientRect()
  return { x: rect.left + (c.x + 1) * rect.width / 2, y: rect.top + (1 - c.y) * rect.height / 2 }
}, id)
const aim = async (id, yawDeg, pitchDeg, distance) => {
  // Cada cenário parte do meio da nave, longe das paredes (que limitam o arrasto).
  await store((s, id) => s.getState().updateComponent(id, { panel3DPosition: { x: 6, y: 0, z: 14 } }), id); await settle()
  return aimCamera(id, yawDeg, pitchDeg, distance)
}
const aimCamera = (id, yawDeg, pitchDeg, distance) => page.evaluate(({ id, yawDeg, pitchDeg, distance }) => {
  const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true)
  let o; r.scene.traverse((n) => { if (!o && n.userData.isComponentRoot && n.userData.componentId === id) o = n })
  const t = new T.Box3().setFromObject(o, true).getCenter(new T.Vector3())
  const yaw = yawDeg * Math.PI / 180, pitch = pitchDeg * Math.PI / 180
  r.controls?.dispatchEvent({ type: 'start' })
  r.camera.position.set(t.x + Math.sin(yaw) * Math.cos(pitch) * distance, t.y + Math.sin(pitch) * distance, t.z + Math.cos(yaw) * Math.cos(pitch) * distance)
  r.camera.lookAt(t); r.controls?.target?.copy(t); r.controls?.update?.(); r.invalidate()
}, { id, yawDeg, pitchDeg, distance })
/** Arrasta `steps` px de 1 px na direção (ux, uy) e devolve o maior salto (mm) entre dois pixels e o total. */
async function drag(id, ux, uy, steps = 40) {
  const start = await center(id), before = await pos(id)
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  let last = before, maxStep = 0
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(start.x + ux * i, start.y + uy * i)
    if (i % 4 === 0 || i === steps) {
      await frame()
      const p = await pos(id)
      maxStep = Math.max(maxStep, Math.hypot(p.x - last.x, p.z - last.z) * 100 / 4)
      last = p
    }
  }
  await page.mouse.up(); await settle()
  const after = await pos(id)
  return { maxStepMm: maxStep, dx: (after.x - before.x) * 100, dz: (after.z - before.z) * 100 }
}
try {
  await page.evaluate(async () => {
    localStorage.setItem('dc-simu:panel3d:environment', 'factory')
    window.__fixtureRoot.render(null); await new Promise((r) => setTimeout(r, 200)); window.__mountPanel()
  })
  await page.waitForTimeout(600)
  const id = await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts'), { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    const pump = createComponent('waterPump', 'P1', '', 0, 700, 100)
    pump.panel3DPosition = { x: 6, y: 0, z: 14 }
    useSimStore.setState({ components: [pump], wires: [], factoryHall: null }); return pump.id
  })
  await page.waitForFunction((id) => { let ok = false; window.__panelState()?.scene.traverse((n) => { if (n.userData.isComponentRoot && n.userData.componentId === id) ok = true }); return ok }, id, { timeout: 60000 })
  await settle()

  // Vista da captura: esquerda/frente, câmara baixa (≈ -33°, 11°) e afastada.
  await aim(id, -33, 11, 90); await settle()
  await page.screenshot({ path: path.join(output, 'rasante.png') })
  const up = await drag(id, 0, -1)
  check(up.maxStepMm <= 60, `Vista rasante: arrastar para cima move sem saltos (maior salto ${up.maxStepMm.toFixed(1)} mm/px ≤ 60)`)
  check(Math.hypot(up.dx, up.dz) >= 40, `Vista rasante: arrastar para cima move o equipamento em profundidade (${Math.hypot(up.dx, up.dz).toFixed(0)} mm)`)
  await aim(id, -33, 11, 90); await settle()
  const side = await drag(id, 1, 0)
  check(side.maxStepMm <= 60, `Vista rasante: arrastar para o lado move sem saltos (maior salto ${side.maxStepMm.toFixed(1)} mm/px ≤ 60)`)
  check(Math.hypot(side.dx, side.dz) >= 40, `Vista rasante: arrastar para o lado move o equipamento (${Math.hypot(side.dx, side.dz).toFixed(0)} mm)`)

  // Ainda mais rasante e longe (equipamento ao fundo da nave): era aqui que saltava dezenas de cm por pixel.
  await aim(id, -40, 6, 140); await settle()
  const far = await drag(id, 0, -1)
  check(far.maxStepMm <= 45, `Vista muito rasante e afastada (6°): arrastar em profundidade sem saltos (maior salto ${far.maxStepMm.toFixed(1)} mm/px ≤ 45)`)

  // Vista lateral totalmente horizontal (0°): o arrasto horizontal também é livre.
  await aim(id, -90, 0, 90); await settle()
  const flat = await drag(id, 1, 0)
  check(Math.abs(flat.dz) >= 40 && flat.maxStepMm <= 60, `Vista lateral a 0°: arrastar para o lado move em Z sem saltos (${flat.dz.toFixed(0)} mm, máx. ${flat.maxStepMm.toFixed(1)} mm/px)`)

  // Vista de cima: mantém-se a interseção exata (o equipamento acompanha o cursor).
  await aim(id, 0, 70, 90); await settle()
  const top = await drag(id, 1, 0)
  check(top.maxStepMm <= 60 && Math.abs(top.dx) >= 40, `Vista alta (70°): arrasto exato e estável (${top.dx.toFixed(0)} mm, máx. ${top.maxStepMm.toFixed(1)} mm/px)`)

  f.stable()
  console.log(`${f.count()} verificações do arrasto no ambiente fabril passaram`)
} catch (error) {
  console.error(f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png') })
  throw error
} finally { await f.browser.close() }
