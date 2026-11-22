import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

/** Mesa da maquete (base ranhurada mecSlotPlate) no ambiente fabril: pernas em perfil 40 × 40 até ao chão
 *  (automático, acompanha a altura da mesa), altura fixa e opção de as desligar. Referência do chão: o
 *  armário do contador (equipamento de chão, assenta no pavimento). Capturas em runtime/bench-legs/. */
const output = process.env.BENCH_LEGS_OUTPUT || path.resolve('runtime/bench-legs')
const f = await panelFixture({ baseURL: process.env.BENCH_LEGS_TEST_URL, output }), { page, check, frame, store } = f
const boxOf = (prefix) => page.evaluate((prefix) => {
  const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true)
  let o; r.scene.traverse((n) => { if (!o && n.name.startsWith(prefix)) o = n })
  if (!o) return null
  const b = new T.Box3().setFromObject(o, true)
  return { minY: b.min.y, maxY: b.max.y }
}, prefix)
const legs = () => boxOf('Maquete_Pes_Mesa')
const settle = async () => { await page.waitForTimeout(400); await frame(); await frame() }
try {
  await page.evaluate(async () => { localStorage.setItem('dc-simu:panel3d:environment', 'factory'); window.__fixtureRoot.render(null); await new Promise((r) => setTimeout(r, 200)); window.__mountPanel() })
  await page.waitForTimeout(600)
  const ids = await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts'), { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    const box = createComponent('waterSupplyBox', 'CA1', '', 0, -400, 100)
    const plate = createComponent('mecSlotPlate', 'BAS1', '', 1, 300, 100)
    useSimStore.setState({ components: [box, plate], wires: [], tool: 'select' })
    return { box: box.id, plate: plate.id }
  })
  await page.waitForFunction(() => { let ok = false; window.__panelState()?.scene.traverse((o) => { if (o.name === 'Maquete_Pes_Mesa') ok = true }); return ok }, null, { timeout: 60000 })
  // Chão = face superior da laje do pavilhão (1.ª malha do ambiente fabril, centrada em floorY − 0,14 com 0,28 de espessura).
  const floorOf = () => page.evaluate(() => {
    const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true)
    let env; r.scene.traverse((n) => { if (!env && n.name === "dc-simu-factory-environment") env = n })
    const slab = env?.children.find((n) => n.isMesh)
    return slab ? new T.Box3().setFromObject(slab, true).max.y : null
  })
  const placePlate = (y) => store((s, a) => { const st = s.getState(), p = st.components.find((c) => c.id === a.id), pos = p.panel3DPosition ?? { x: 3, y: 0, z: 2 }; st.updateComponent(a.id, { panel3DPosition: { ...pos, y: a.y } }) }, { id: ids.plate, y })
  const plateUnderside = () => boxOf('Maquete_Base').then(async () => page.evaluate((id) => {
    const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true)
    let base; r.scene.traverse((n) => { if (!base && n.name === `mec-mecSlotPlate-3d-${id}`) base = n })
    let plate; base?.traverse((n) => { if (!plate && n.isMesh && n.material?.name === 'Alumínio extrudido anodizado') plate = n })
    return plate ? new T.Box3().setFromObject(plate, true).min.y : null
  }, ids.plate))

  await settle()
  const floor = await floorOf()
  check(typeof floor === 'number', `Chão do pavilhão (face superior da laje) em y = ${floor?.toFixed(3)}`)

  for (const y of [1.2, 2.4]) {
    await placePlate(y); await settle()
    const l = await legs(), under = await plateUnderside(), legOnly = await page.evaluate(() => { const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true); const b = new T.Box3(); r.scene.traverse((n) => { if (n.isMesh && n.material?.name === "Perna em perfil 40 × 40") b.expandByObject(n, true) }); return b.max.y })
    const gapMm = (l.minY - floor) * 100, topMm = (under - legOnly) * 100
    check(Math.abs(gapMm) < 2, `Mesa a ${y.toFixed(1)} U: os pés tocam o chão (folga ${gapMm.toFixed(1)} mm)`)
    check(Math.abs(topMm) < 2, `Mesa a ${y.toFixed(1)} U: as pernas encostam à face inferior da base (${topMm.toFixed(1)} mm)`)
  }
  await page.evaluate(() => { const r = window.__panelState(); r.scene.updateMatrixWorld(true) })
  await page.screenshot({ path: path.join(output, 'auto-floor.png') })

  await store((s, id) => s.getState().setComponentState(id, { legHeightMm: 500 }), ids.plate); await settle()
  const fixed = await legs()
  check(Math.abs((fixed.maxY - fixed.minY) * 100 - 500) < 40, `Altura fixa de 500 mm (${((fixed.maxY - fixed.minY) * 100).toFixed(0)} mm)`)

  await store((s, id) => s.getState().setComponentState(id, { legs: false }), ids.plate); await settle()
  check(await legs() === null, 'Desligar «Pés da mesa» remove as pernas (ficam os pés de borracha)')
  f.stable()
  console.log('\nPernas da mesa da maquete verificadas')
} catch (error) {
  console.error(f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png') })
  throw error
} finally { await f.browser.close() }
