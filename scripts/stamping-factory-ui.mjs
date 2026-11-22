import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { browserFixture } from './lib/browser-fixture.mjs'
import { attachPanel } from './lib/panel-fixture.mjs'

/**
 * Maquete de estampagem no «Ambiente fabril»: QGD completo na parede, mesa no centro da nave,
 * compressor no chão, esteiras aéreas com cabos/tubo filaçados sobre pilar e QE1 sob a mesa com
 * calhas DIN, relés, relé de segurança, fonte 24 V e réguas de bornes.
 */
const output = path.resolve('runtime/stamping-factory')
await mkdir(output, { recursive: true })
// O modo «Ambiente fabril» é lido ao montar o painel: gravá-lo antes de o montar.
const bf = await browserFixture({ baseURL: process.env.MAQUETTES_TEST_URL ?? 'http://127.0.0.1:5173', output, height: 1000 })
await bf.page.evaluate(() => localStorage.setItem('dc-simu:panel3d:environment', 'factory'))
const f = await attachPanel(bf)
const { page, check } = f
try {
  const ids = await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    useSimStore.getState().newProject('all')
    return useSimStore.getState().insertReadyMaquette('atec-estampagem', { x: 420, y: 260 })
  })
  await page.waitForFunction((ids) => {
    const r = window.__panelState?.()
    if (!r || document.querySelector('[data-testid="panel3d-loading"]')) return false
    const found = new Set(); r.scene.traverse((o) => { if (o.userData.isComponentRoot) found.add(o.userData.componentId) })
    return ids.every((id) => found.has(id))
  }, ids, { timeout: 240000, polling: 500 })
  await page.waitForTimeout(1500)
  const g = await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const T = window.__fixtureThree, r = window.__panelState(), st = useSimStore.getState()
    r.scene.updateMatrixWorld(true)
    const roots = new Map(); r.scene.traverse((o) => { if (o.userData.isComponentRoot) roots.set(o.userData.componentId, o) })
    const box = (c) => {
      const root = roots.get(c.id), b = new T.Box3()
      root?.traverse((o) => { if (o.isMesh && o.visible && o.material?.visible !== false && !o.isSprite) b.expandByObject(o, true) })
      return { min: b.min.toArray(), max: b.max.toArray() }
    }
    const one = (pred) => { const c = st.components.find(pred); return c ? { ref: c.ref, ...box(c) } : null }
    const many = (pred) => st.components.filter(pred).map((c) => ({ ref: c.ref, label: c.state.labelText, ...box(c) }))
    let floor = null; r.scene.traverse((o) => { if (/factory.*floor|floor/i.test(o.name) && o.isMesh && floor === null) floor = new T.Box3().setFromObject(o).max.y })
    return {
      floor,
      qgd: one((c) => c.ref === 'QGD'),
      plate: one((c) => c.type === 'mecSlotPlate'),
      compressor: one((c) => c.type === 'airCompressor'),
      pillar: one((c) => c.type === 'industrialPillar'),
      cabinet: one((c) => c.type === 'panelEnclosure' && String(c.state.labelText).startsWith('QE1')),
      trays: many((c) => c.type === 'cableTrayStraight'),
      inside: many((c) => c.state.hostLocation === 'machine' && ['relayFinder5534', 'safetyRelay', 'powerSupplyProauto24A', 'terminalPhoenixPti6', 'terminalSet24v', 'dinRail15x55', 'cableDuct'].includes(c.type)),
      qgdParts: st.components.filter((c) => c.enclosureId && st.components.find((e) => e.id === c.enclosureId)?.ref === 'QGD').length,
      bundles: (() => { let n = 0; r.scene.traverse((o) => { if (o.name === 'esteira-cabos-filacados') n++ }); return n })(),
    }
  })
  const near = (a, b, tol) => Math.abs(a - b) <= tol
  const floorY = g.compressor.min[1]
  check(g.qgdParts >= 40, `QGD na parede com o conteúdo completo (${g.qgdParts} peças dentro)`)
  check(near(g.plate.min[1], floorY, 0.12), `Pés da mesa no chão da nave (${g.plate.min[1].toFixed(2)} vs ${floorY.toFixed(2)})`)
  // A porta aberta (dobradiça à esquerda) alarga a caixa para −X: o corpo tem 800 mm a partir da direita.
  const plateCx = (g.plate.min[0] + g.plate.max[0]) / 2, qgdCx = g.qgd.max[0] - 4
  check(near(plateCx, qgdCx, 0.3), 'Mesa centrada à frente do QGD')
  check(g.plate.min[2] > g.compressor.max[2] + 5, `Mesa afastada da parede, no meio da nave (${(g.plate.min[2] - g.compressor.max[2]).toFixed(1)} u)`)
  check(near(g.pillar.min[1], floorY, 0.12), 'Pilar assente no chão')
  const top = Math.max(...g.trays.map((t) => t.max[1]))
  check(top > g.qgd.max[1] + 1.5 && near(g.pillar.max[1], Math.min(...g.trays.filter((t) => t.label === 'QGD → BANCADA').map((t) => t.min[1])), 0.4), 'Esteira aérea acima do QGD, apoiada no pilar')
  check(g.bundles >= 5, `Cabos e tubo filaçados nas esteiras (${g.bundles})`)
  const cab = g.cabinet
  const inCab = g.inside.filter((p) => p.min[0] >= cab.min[0] - 0.05 && p.max[0] <= cab.max[0] + 0.05 && p.min[1] >= cab.min[1] - 0.05 && p.max[1] <= cab.max[1] + 0.05)
  check(g.inside.length >= 40 && inCab.length === g.inside.length, `QE1: ${g.inside.length} peças (calhas, relés, fonte, bornes) dentro do quadro`)
  for (const [name, dir, focus] of [['overview', [-0.8, 0.75, 1.1], null], ['cabinet', [0.25, 0.15, 1], 'cabinet'], ['trays', [-0.35, 0.45, 1], 'trays'], ['qgd', [0.15, 0.1, 1], 'qgd']]) {
    await page.evaluate(({ dir, focus, g }) => {
      const r = window.__panelState(), T = window.__fixtureThree
      r.scene.traverse((o) => { if (o.isSprite) o.visible = false })
      let box
      if (focus === 'cabinet') box = new T.Box3(new T.Vector3(...g.cabinet.min), new T.Vector3(...g.cabinet.max))
      else if (focus === 'qgd') box = new T.Box3(new T.Vector3(...g.qgd.min), new T.Vector3(...g.qgd.max))
      else if (focus === 'trays') { box = new T.Box3(); for (const t of g.trays) box.union(new T.Box3(new T.Vector3(...t.min), new T.Vector3(...t.max))); box.union(new T.Box3(new T.Vector3(...g.compressor.min), new T.Vector3(...g.compressor.max))) }
      else { box = new T.Box3(new T.Vector3(...g.compressor.min), new T.Vector3(...g.compressor.max)); box.union(new T.Box3(new T.Vector3(...g.plate.min), new T.Vector3(...g.plate.max))); box.union(new T.Box3(new T.Vector3(...g.qgd.min), new T.Vector3(...g.qgd.max))); for (const t of g.trays) box.union(new T.Box3(new T.Vector3(...t.min), new T.Vector3(...t.max))) }
      const c = box.getCenter(new T.Vector3()), s = box.getSize(new T.Vector3())
      const dist = Math.max(s.x / r.camera.aspect, s.y, s.z * 0.6) / (2 * Math.tan(r.camera.fov * Math.PI / 360)) * 1.25 + s.z * 0.5
      r.controls?.dispatchEvent({ type: 'start' })
      r.camera.position.copy(c).add(new T.Vector3(...dir).normalize().multiplyScalar(dist))
      r.camera.lookAt(c); r.controls?.target.copy(c); r.controls?.update(); r.invalidate()
    }, { dir, focus, g })
    await page.waitForTimeout(700); await f.frame()
    await page.screenshot({ path: path.join(output, `${name}.png`) })
  }
  f.stable()
  console.log(`\n✅ ${f.count()} verificações da maquete no ambiente fabril passaram`)
} finally {
  await f.browser.close()
}
