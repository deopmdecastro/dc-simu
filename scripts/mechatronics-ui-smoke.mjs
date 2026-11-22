import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

/** Maquete de estampagem no Painel 3D: os 22 modelos desenham-se, a montagem completa cabe na base
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
  // Enquadrar a montagem adicionada depois da base inicial, para as capturas mostrarem a bancada.
  await page.evaluate(() => {
    const r = window.__panelState(), T = window.__fixtureThree, box = new T.Box3()
    r.scene.updateMatrixWorld(true)
    r.scene.traverse((n) => { if (n.userData.isComponentRoot) box.expandByObject(n, true) })
    const center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3())
    const distance = size.length() / (2 * Math.tan(r.camera.fov * Math.PI / 360)) * 1.15
    r.controls?.dispatchEvent({ type: 'start' })
    r.camera.position.copy(center).add(new T.Vector3(-0.7, 0.65, 0.8).normalize().multiplyScalar(distance))
    r.camera.lookAt(center); r.camera.updateProjectionMatrix()
    r.controls?.target.copy(center); r.controls?.update(); r.invalidate()
  })
  await frame()
  const types = ['mecSlotPlate', 'mecAluProfile', 'mecGravityMagazine', 'mecWorkpiece', 'mecDischargeRamp', 'mecStampingTable', 'mecStampingPress',
    'mecFeederCylinder', 'mecRotaryArm', 'mecDcGearmotor', 'mecMicroSwitchRoller', 'mecVacuumEjector', 'mecDragChain', 'mecSupportBlock',
    'mecDrawerCylinder', 'mecValveIsland', 'mecOpticalSensor', 'mecInductiveSensor', 'mecHmiKtp700', 'mecOperatorBox', 'mecSignalTower', 'mecBenchDuct']
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
  // Medir a geometria real: corpo e estrutura ficam imóveis, só haste/ventosa fazem o curso Z.
  const motionState = () => page.evaluate(() => {
    const r = window.__panelState(), T = window.__fixtureThree
    r.scene.updateMatrixWorld(true)
    const state = {}
    r.scene.traverse((n) => {
      if (!['Braco_Estrutura_Metalica', 'Braco_Cilindro_Corpo', 'Braco_Cilindro_Z'].includes(n.name)) return
      const p = n.getWorldPosition(new T.Vector3()), q = n.getWorldQuaternion(new T.Quaternion())
      state[n.name] = { position: p.toArray(), rotation: q.toArray() }
    })
    return state
  })
  await set(ids.arm, { angleDeg: 180, armDownPct: 0 }); await page.waitForTimeout(1300); await frame()
  const up = await motionState(), cupUp = await boxOf('mec-mecRotaryArm-3d-', 'Borracha da ventosa')
  await page.screenshot({ path: path.join(output, 'cylinder-up.png') })
  await set(ids.arm, { armDownPct: 100 }); await page.waitForTimeout(1300); await frame()
  const down = await motionState(), cupDown = await boxOf('mec-mecRotaryArm-3d-', 'Borracha da ventosa')
  for (const key of ['Braco_Estrutura_Metalica', 'Braco_Cilindro_Corpo']) {
    const still = up[key].position.every((v, i) => Math.abs(v - down[key].position[i]) < 0.001)
      && up[key].rotation.every((v, i) => Math.abs(v - down[key].rotation[i]) < 0.001)
    check(still, `${key}: posição e orientação constantes durante o curso do cilindro`)
  }
  const { MEC_DIMS } = await page.evaluate(async () => {
    const { MEC_DIMS } = await import('/src/three/mechatronicsModel.ts'); return { MEC_DIMS }
  })
  const travel = (cupUp.minY - cupDown.minY) * 100
  check(Math.abs(travel - MEC_DIMS.rotaryArm.cylinderStrokeMm) < 0.2
    && Math.hypot(cupUp.cx - cupDown.cx, cupUp.cz - cupDown.cz) * 100 < 0.2,
  `Ventosa faz apenas o curso vertical (${travel.toFixed(1)} mm), sem desvio horizontal`)
  check(up.Braco_Cilindro_Z.rotation.every((v, i) => Math.abs(v - down.Braco_Cilindro_Z.rotation[i]) < 0.001), 'Haste e ventosa mantêm a orientação vertical')
  await page.screenshot({ path: path.join(output, 'cylinder-down.png') })
  const plateBox = await boxOf('mec-mecStampingPress-3d-', 'Prato de estampagem')
  await set(ids.arm, { angleDeg: 180, armDownPct: 0 }); await page.waitForTimeout(1200); await frame()
  const arm = await boxOf('mec-mecRotaryArm-3d-', 'Braço aligeirado')
  check(plateBox.minY > arm.maxY, `Prato recolhido da prensa acima do braço (${((plateBox.minY - arm.maxY) * 100).toFixed(1)} mm de folga)`)
  const cylinder = await boxOf('mec-mecRotaryArm-3d-', 'Corpo fixo do cilindro vertical da ventosa')
  check(plateBox.minY > cylinder.maxY, `Prato recolhido acima do cilindro vertical (${((plateBox.minY - cylinder.maxY) * 100).toFixed(1)} mm de folga)`)
  await page.screenshot({ path: path.join(output, 'bench.png') })
  f.stable()
  console.log(`${f.count()} verificações da maquete de estampagem no Painel 3D passaram`)
} catch (error) {
  console.error(f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png') })
  throw error
} finally { await f.browser.close() }
