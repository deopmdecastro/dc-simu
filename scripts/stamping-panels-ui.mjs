// Evidência visual dos dois quadros da maquete de estampagem (QGD de parede e QE1 da mesa).
//   MAQUETTES_TEST_URL=http://127.0.0.1:5182 [CHROME_PATH=/usr/bin/google-chrome] [PHOTO_STAGE=after] node scripts/stamping-panels-ui.mjs
// Grava capturas em runtime/stamping-panels e a geometria (caixas) dos aparelhos em JSON.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

const output = path.resolve(process.env.PANELS_OUTPUT ?? 'runtime/stamping-panels')
const stage = process.env.PHOTO_STAGE ?? 'after'
await mkdir(output, { recursive: true })
const f = await panelFixture({ baseURL: process.env.MAQUETTES_TEST_URL ?? 'http://127.0.0.1:5182', output, height: 1100 })
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
  await f.page.waitForFunction(() => {
    const r = window.__panelState?.()
    let tubes = 0
    r?.scene.traverse((o) => { if (o.isMesh && o.geometry?.type === 'TubeGeometry') tubes++ })
    return tubes > 150
  }, null, { timeout: 120000 })
  await f.page.waitForTimeout(Number(process.env.SETTLE_MS ?? 30000))

  // Caixas 3D (unidades de cena) de cada aparelho dos dois quadros, para verificações automáticas.
  const geo = await f.page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const T = window.__fixtureThree, r = window.__panelState(), st = useSimStore.getState()
    r.scene.updateMatrixWorld(true)
    const roots = new Map()
    r.scene.traverse((o) => { if (o.userData.isComponentRoot) roots.set(o.userData.componentId, o) })
    const out = {}
    for (const c of st.components) {
      const root = roots.get(c.id)
      if (!root) continue
      const b = new T.Box3().setFromObject(root, true)
      out[c.id] = { ref: c.ref, type: c.type, min: b.min.toArray(), max: b.max.toArray() }
    }
    return out
  })
  await writeFile(path.join(output, `${stage}-geometry.json`), JSON.stringify(geo, null, 2))

  const shot = async (name, panel, direction, zoom = 1, focus = null) => {
    await f.page.evaluate(({ panel, direction, zoom, focus }) => {
      const r = window.__panelState(), T = window.__fixtureThree
      r.scene.updateMatrixWorld(true)
      let box = null
      r.scene.traverse((o) => {
        if (!o.userData.isComponentRoot) return
        o.traverse((n) => { if (n.isSprite) n.visible = false })
        const back = o.getObjectByName('enclosure-back')
        if (!back) return
        const b = new T.Box3().setFromObject(o, true)
        const isQe1 = b.max.y < 6
        if ((panel === 'qe1') === isQe1) box = new T.Box3().setFromObject(back, true).expandByScalar(0.25)
      })
      if (!box) return
      r.scene.background = new T.Color('#e8edf1')
      const center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3())
      if (focus) center.add(new T.Vector3(focus[0] * size.x, focus[1] * size.y, focus[2] * size.z))
      const span = Math.max(size.x, size.z, size.y)
      const distance = span / (2 * Math.tan(r.camera.fov * Math.PI / 360)) * 1.05 / zoom
      r.controls?.dispatchEvent({ type: 'start' })
      r.camera.position.copy(center).add(new T.Vector3(...direction).normalize().multiplyScalar(distance))
      r.camera.lookAt(center); r.controls?.target.copy(center); r.controls?.update(); r.invalidate()
    }, { panel, direction, zoom, focus })
    await f.page.waitForTimeout(700)
    await f.frame()
    await f.page.screenshot({ path: path.join(output, `${stage}-${name}.png`) })
  }
  await shot('qgd-front', 'qgd', [0, 0.05, 1])
  await shot('qgd-iso', 'qgd', [0.45, 0.2, 1])
  await shot('qgd-pente', 'qgd', [0.15, 0.35, 1], 3.2, [-0.3, -0.06, 0])
  await shot('qgd-medidor', 'qgd', [0.2, 0.15, 1], 3.2, [-0.05, 0.36, 0])
  await shot('qe1-front', 'qe1', [-1, 0.08, 0])
  await shot('qe1-iso', 'qe1', [-0.7, 0.45, -0.9])
  await shot('qe1-top', 'qe1', [-0.15, 1, 0.02])
  if (f.errors.length) throw new Error(f.errors.join('\n'))
  console.log(`Capturas em ${output}`)
} finally {
  await f.browser.close()
}
