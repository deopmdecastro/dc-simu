import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

/** Maquete de estampagem no Painel 3D: os 14 modelos desenham-se, a montagem completa cabe na base
 *  e a ventosa em baixo encosta ao topo do tarugo na zona de recolha e na gaveta da prensa. */
const output = process.env.MECHATRONICS_OUTPUT || path.resolve('runtime/mechatronics')
const f = await panelFixture({ baseURL: process.env.MECHATRONICS_TEST_URL, output, height: 820 }), { page, check, frame, store, show } = f
const boxOf = (prefix, meshName) => page.evaluate(({ prefix, meshName }) => {
  const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true)
  let root; r.scene.traverse((n) => { if (!root && n.name.startsWith(prefix)) root = n })
  if (!root) return null
  const b = new T.Box3()
  root.traverse((n) => { if (n.isMesh && n.visible && (!meshName || n.material?.name === meshName || n.name === meshName)) b.expandByObject(n, true) })
  return b.isEmpty() ? null : { minY: b.min.y, maxY: b.max.y, cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2 }
}, { prefix, meshName })
try {
  const [plateId] = await show('mecSlotPlate')
  const ids = await page.evaluate(async (plateId) => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const { stampingBenchLayout } = await window.__fixtureImport('/src/electrical/stampingBench.ts')
    const st = useSimStore.getState(), plate = st.components.find((c) => c.id === plateId)
    const base = { x: 0, y: 0, z: 1.6 }
    st.updateComponent(plateId, { panel3DPosition: base })
    const out = {}
    stampingBenchLayout(plate.state).forEach((p, i) => {
      const id = useSimStore.getState().addComponent(p.type, 100 + i * 120, 400)
      const s2 = useSimStore.getState()
      s2.updateComponent(id, { panel3DPosition: { x: base.x + p.x * 0.01, y: base.y + p.y * 0.01, z: base.z + p.z * 0.01 } })
      if (p.state) s2.setComponentState(id, p.state)
      out[p.key] = id
    })
    // Peça de alumínio isolada para incluir o tarugo no conjunto renderizado.
    const wp = useSimStore.getState().addComponent('mecWorkpiece', 100, 700)
    useSimStore.getState().updateComponent(wp, { panel3DPosition: { x: 3.2, y: 0.275, z: 1.6 + 2.2 } })
    return out
  }, plateId)
  await page.waitForTimeout(1500); await frame(); await frame()
  const types = ['mecSlotPlate', 'mecAluProfile', 'mecGravityMagazine', 'mecWorkpiece', 'mecDischargeRamp', 'mecStampingTable', 'mecStampingPress',
    'mecFeederCylinder', 'mecRotaryArm', 'mecDcGearmotor', 'mecMicroSwitchRoller', 'mecVacuumEjector', 'mecDragChain', 'mecSupportBlock']
  for (const type of types) check(!!(await boxOf(`mec-${type}-3d-`)), `${type}: modelo 3D desenhado no Painel 3D`)

  const set = (id, patch) => store((s, a) => s.getState().setComponentState(a.id, a.patch), { id, patch })
  await set(ids.magazine, { pickupMaterial: 'aluminio' })
  await set(ids.table, { pieceMaterial: 'branco' })
  for (const [angle, target, label] of [[0, 'mec-mecGravityMagazine-3d-', 'recolha'], [180, 'mec-mecStampingTable-3d-', 'gaveta da prensa']]) {
    await set(ids.arm, { angleDeg: angle, armDownPct: 100 })
    await page.waitForTimeout(1300); await frame(); await frame()
    const cup = await boxOf('mec-mecRotaryArm-3d-', 'Borracha da ventosa')
    const piece = await boxOf(target, angle === 0 ? 'tarugo-zona-recolha' : 'tarugo-gaveta')
    const gap = (cup.minY - piece.maxY) * 100
    const offset = Math.hypot(cup.cx - piece.cx, cup.cz - piece.cz) * 100
    check(Math.abs(gap) <= 6 && offset <= 12, `Ventosa em baixo sobre o tarugo na ${label} (folga ${gap.toFixed(1)} mm, desvio ${offset.toFixed(1)} mm)`)
  }
  const plateBox = await boxOf('mec-mecStampingPress-3d-', 'Prato de estampagem')
  await set(ids.arm, { angleDeg: 180, armDownPct: 0 }); await page.waitForTimeout(1200); await frame()
  const arm = await boxOf('mec-mecRotaryArm-3d-', 'Braço aligeirado')
  check(plateBox.minY > arm.maxY, `Prato recolhido da prensa acima do braço (${((plateBox.minY - arm.maxY) * 100).toFixed(1)} mm de folga)`)
  await page.screenshot({ path: path.join(output, 'bench.png') })
  f.stable()
  console.log(`${f.count()} verificações da maquete de estampagem no Painel 3D passaram`)
} catch (error) {
  console.error(f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png') })
  throw error
} finally { await f.browser.close() }
