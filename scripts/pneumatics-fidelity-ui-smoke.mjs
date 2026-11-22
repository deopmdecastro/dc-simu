// Verificação visual + capturas de evidência dos componentes pneumáticos redesenhados:
// compressor Maxxim 24 L (AirCompressor3D) e ilha de válvulas Festo VTUG (PneumaticManifold3D).
// Reaproveita o panelFixture (mesmo padrão de mechanical-refinement-ui-smoke.mjs):
//   node scripts/pneumatics-fidelity-ui-smoke.mjs
// Saída: docs/validation/compressor-vtug-fidelity/{airCompressor,pneumaticManifold}-*.png
import path from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { panelFixture } from './lib/panel-fixture.mjs'

const output = process.env.PNEUMATICS_FIDELITY_OUTPUT || path.resolve('docs/validation/compressor-vtug-fidelity')
const f = await panelFixture({ baseURL: process.env.INDUSTRIAL_TEST_URL, output })
const { page, check } = f
const evidence = { components: {}, errors: f.errors }

async function pose(dir = [0.65, 0.32, 1.7]) {
  await page.evaluate((dir) => {
    const r = window.__panelState(), T = window.__fixtureThree, b = new T.Box3()
    r.scene.updateMatrixWorld(true)
    r.scene.traverse((n) => { if (n.userData.isComponentRoot) b.expandByObject(n, true) })
    const c = b.getCenter(new T.Vector3()), s = b.getSize(new T.Vector3())
    const distance = Math.max(s.x / r.camera.aspect, s.y, s.z) * 1.9
    r.controls?.dispatchEvent({ type: 'start' })
    r.camera.position.copy(c).add(new T.Vector3(...dir).normalize().multiplyScalar(distance))
    r.camera.lookAt(c)
    r.controls?.target.copy(c)
    r.controls?.update()
    r.invalidate()
  }, dir)
  await f.frame()
}

try {
  await mkdir(output, { recursive: true })
  for (const type of ['airCompressor', 'pneumaticManifold']) {
    const [id] = await f.show(type)
    await page.waitForTimeout(400)
    await f.frame()
    // Contagem de malhas montadas
    const stats = await page.evaluate((id) => {
      const r = window.__panelState()
      let root
      r.scene.traverse((n) => { if (n.userData.isComponentRoot && n.userData.componentId === id) root = n })
      let meshes = 0
      root?.traverse((n) => { if (n.isMesh) meshes += 1 })
      return { meshes }
    }, id)
    check(stats.meshes > 20, `${type}: monta ${stats.meshes} malhas 3D (>20)`)
    // Vista 3/4 (como as capas de produto) + vista frontal
    await pose([0.62, 0.3, 1.75])
    await page.screenshot({ timeout: 120000, path: path.join(output, `${type}-iso.png`) })
    await pose([0.05, 0.12, 2.0])
    await page.screenshot({ timeout: 120000, path: path.join(output, `${type}-front.png`) })
    evidence.components[type] = stats
    console.log(`CAPTURE ${type}`, JSON.stringify(stats))
  }
  f.stable()
  await writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2))
  console.log('PASS — pneumatics fidelity capture')
} finally {
  await f.browser?.close?.()
}
