// Evidência visual do QE1 na lateral da mesa e da cablagem da maquete de estampagem.
//   MAQUETTES_TEST_URL=http://127.0.0.1:5182 [CHROME_PATH=/usr/bin/google-chrome] node scripts/stamping-qe1-side-ui.mjs
// Grava capturas em runtime/stamping-qe1-side e falha se o QE1 ficar por baixo do tampo.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

const output = path.resolve(process.env.QE1_OUTPUT ?? 'runtime/stamping-qe1-side')
const stage = process.env.PHOTO_STAGE ?? 'after'
await mkdir(output, { recursive: true })
const f = await panelFixture({ baseURL: process.env.MAQUETTES_TEST_URL ?? 'http://127.0.0.1:5182', output, height: 1000 })
const assert = (ok, name) => { if (!ok) throw new Error(name); console.log(`PASS ${name}`) }
try {
  const ids = await f.page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    useSimStore.getState().newProject('all')
    return useSimStore.getState().insertReadyMaquette('atec-estampagem', { x: 420, y: 260 })
  })
  await f.page.waitForFunction((ids) => {
    const r = window.__panelState?.()
    if (!r || document.querySelector('.panel3d-loading-overlay')) return false
    const found = new Set()
    r.scene.traverse((o) => { if (o.userData.isComponentRoot) found.add(o.userData.componentId) })
    return ids.every((id) => found.has(id))
  }, ids, { timeout: 120000 })
  const t0 = Date.now()
  await f.page.waitForFunction(() => {
    const r = window.__panelState?.()
    let tubes = 0
    r?.scene.traverse((o) => { if (o.isMesh && o.geometry?.type === 'TubeGeometry') tubes++ })
    return tubes > 150 && !document.body.textContent.includes('Não foi possível calcular os cabos')
  }, null, { timeout: 120000 })
  const firstCablesMs = Date.now() - t0
  await f.page.waitForTimeout(Number(process.env.SETTLE_MS ?? 30000))

  const geo = await f.page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const T = window.__fixtureThree, r = window.__panelState(), st = useSimStore.getState()
    r.scene.updateMatrixWorld(true)
    const roots = new Map()
    r.scene.traverse((o) => { if (o.userData.isComponentRoot) roots.set(o.userData.componentId, o) })
    const box = (c, name) => {
      const root = roots.get(c.id); if (!root) return null
      const target = name ? root.getObjectByName(name) ?? root : root
      const b = new T.Box3().setFromObject(target, true)
      return { min: b.min.toArray(), max: b.max.toArray() }
    }
    const cab = st.components.find((c) => c.type === 'panelEnclosure' && String(c.state.labelText).startsWith('QE1'))
    const plate = st.components.find((c) => c.type === 'mecSlotPlate')
    let tubes = 0
    r.scene.traverse((o) => { if (o.isMesh && o.geometry?.type === 'TubeGeometry') tubes++ })
    const p = plate.panel3DPosition, halfLen = (Number(plate.state.lengthMm) || 700) / 200
    return { plateLeftEdge: plate.panel3DPosition.x - (Number(plate.state.lengthMm) || 700) / 200, cabinet: box(cab, 'enclosure-back'), error: document.body.textContent.includes('Não foi possível calcular os cabos'), plateRightEdge: p.x + halfLen, plateTopY: p.y + 0.1, wires: st.wires.length, tubes }
  })
  await writeFile(path.join(output, `${stage}-geometry.json`), JSON.stringify(geo, null, 2))
  geo.firstCablesMs = firstCablesMs
  assert(!geo.error, 'Cabos calculados sem erro')
  assert(geo.tubes > 150, `Cabos desenhados no 3D (${geo.tubes} tubos)`)
  assert(geo.cabinet.min[0] > geo.plateRightEdge || geo.cabinet.max[0] < geo.plateLeftEdge, 'QE1 inteiro fora da borda do tampo (lateral da mesa, não por baixo)')
  assert(geo.cabinet.max[1] < geo.plateTopY, 'QE1 abaixo do tampo (altura de trabalho)')

  for (const [name, direction, focus] of [
    ['overview', [1.05, 0.55, 1.2], 'bench'],
    ['qe1', [0.55, 0.25, 1.25], 'qe1'],
    ['qe1-side', [-0.2, 0.35, 1.3], 'qe1'],
    ['cables-top', [0.25, 1.2, 0.55], 'bench'],
  ]) {
    await f.page.evaluate(({ direction, focus }) => {
      const r = window.__panelState(), T = window.__fixtureThree, box = new T.Box3()
      r.scene.updateMatrixWorld(true)
      let qe1 = null, plate = null
      r.scene.traverse((o) => {
        if (!o.userData.isComponentRoot) return
        o.traverse((n) => { if (n.isSprite) n.visible = false })
        const b = new T.Box3().setFromObject(o, true)
        if (o.getObjectByName('enclosure-back') && b.max.y < 6 && (!qe1 || b.max.y < qe1.max.y)) qe1 = b
        if (o.userData.componentType === 'mecSlotPlate' || o.name?.includes?.('slot-plate')) plate = b
      })
      r.scene.traverse((o) => {
        if (!o.userData.isComponentRoot) return
        const b = new T.Box3().setFromObject(o, true)
        const c = b.getCenter(new T.Vector3())
        if (focus === 'qe1' && qe1) { if (b.intersectsBox(qe1.clone().expandByScalar(0.6))) box.union(b) }
        else if (Math.abs(c.x - (qe1 ? qe1.getCenter(new T.Vector3()).x - 3 : 0)) < 6 && b.max.y < (qe1 ? qe1.max.y + 6 : 6) && b.getSize(new T.Vector3()).length() < 14) box.union(b)
      })
      if (focus === 'qe1' && qe1) box.copy(qe1.clone().expandByScalar(0.9))
      r.scene.background = new T.Color('#e8edf1')
      const center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3())
      const distance = Math.max(size.x / r.camera.aspect, size.y) / (2 * Math.tan(r.camera.fov * Math.PI / 360)) * 1.15 + size.z * 0.6
      r.controls?.dispatchEvent({ type: 'start' })
      r.camera.position.copy(center).add(new T.Vector3(...direction).normalize().multiplyScalar(distance))
      r.camera.lookAt(center); r.controls?.target.copy(center); r.controls?.update(); r.invalidate()
      void plate
    }, { direction, focus })
    await f.page.waitForTimeout(600)
    await f.frame()
    await f.page.screenshot({ path: path.join(output, `${stage}-${name}.png`) })
  }
  if (f.errors.length) throw new Error(f.errors.join('\n'))
  console.log(`Capturas em ${output} (${geo.wires} cabos, ${geo.tubes} tubos 3D, 1.ºs cabos em ${firstCablesMs} ms)`)
} finally {
  await f.browser.close()
}
