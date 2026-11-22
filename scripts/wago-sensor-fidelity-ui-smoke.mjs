/**
 * Regressão visual WAGO 221 + base BALLUFF + sensor XUKT na esteira.
 * Captura vistas de referência para docs/validation/wago-sensor-fidelity/ e falha
 * se os modelos não renderizarem malhas, lançarem erros de runtime ou as capturas
 * não forem estáveis (animation-frame-equality).
 *
 * Uso (com dev server ativo):
 *   INDUSTRIAL_TEST_URL=http://127.0.0.1:<porta> node scripts/wago-sensor-fidelity-ui-smoke.mjs
 */
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { panelFixture } from './lib/panel-fixture.mjs'

const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/validation/wago-sensor-fidelity')
const { page, check, stable, errors, show, frame, browser } = await panelFixture({
  baseURL: process.env.INDUSTRIAL_TEST_URL || 'http://127.0.0.1:5207',
  output,
})
await mkdir(output, { recursive: true })

const results = []
async function capture(type, name, camera) {
  await show(type)
  await page.waitForTimeout(type === 'rollerConveyor' ? 1500 : 500)
  await page.evaluate((cam) => {
    const r = window.__panelState(), T = window.__fixtureThree, b = new T.Box3()
    r.scene.updateMatrixWorld(true)
    r.scene.traverse((n) => { if (n.userData.isComponentRoot) b.expandByObject(n, true) })
    const c = b.getCenter(new T.Vector3()), s = b.getSize(new T.Vector3())
    const target = cam.target
      ? new T.Vector3(c.x + s.x * cam.target[0], c.y + s.y * cam.target[1], c.z + s.z * cam.target[2])
      : c
    const distance = Math.max(s.x / r.camera.aspect, s.y, s.z) * cam.dist
    r.controls?.dispatchEvent({ type: 'start' })
    r.camera.position.copy(target).add(new T.Vector3(cam.x, cam.y, cam.z).normalize().multiplyScalar(distance))
    r.camera.lookAt(target); r.controls?.target.copy(target); r.controls?.update(); r.invalidate()
  }, camera)
  await frame()
  await page.screenshot({ timeout: 60000, path: path.join(output, `${name}.png`) })
  await stable()
  const meshes = await page.evaluate(() => {
    let n = 0
    window.__panelState().scene.traverse((o) => { if ((o).isMesh) n += 1 })
    return n
  })
  check(meshes > 0, `${type}: malhas renderizadas (${meshes})`)
  results.push({ type, name, meshes })
  console.log(`✓ ${type} → ${name}.png (${meshes} malhas)`)
}

const iso = { x: 0.62, y: 0.3, z: 1.75, dist: 1.8 }
await capture('wago221_2', 'wago221-412-iso', iso)
await capture('wago221_3', 'wago221-413-iso', iso)
await capture('wago221_5', 'wago221-415-iso', iso)
await capture('wago221_5', 'wago221-415-lateral', { x: 0.15, y: 0.42, z: 1.6, dist: 1.25 })
await capture('wago221_5', 'wago221-415-fundos', { x: 0.4, y: -0.55, z: 1.5, dist: 1.25 })
await capture('wago221_inline', 'wago221-2411-iso', iso)
await capture('wago221_double', 'wago221-duplo-iso', iso)
await capture('sensorMountBalluff', 'base-balluff-iso', { x: 0.7, y: 0.25, z: 1.7, dist: 1.15 })
await capture('rollerConveyor', 'esteira-sensor-balluff', {
  x: -0.5, y: 0.35, z: 0.9, dist: 0.42,
  target: [-0.28, 0.22, 0.18],
})

check(errors.length === 0, `sem erros de runtime (${errors.length})`)
await writeFile(path.join(output, 'results.json'), JSON.stringify({ when: new Date().toISOString(), results, errors }, null, 2))
await browser.close()
console.log(`\n${results.length} capturas em ${output}`)
if (errors.length) {
  console.error('ERROS:', errors.slice(0, 5))
  process.exit(1)
}
console.log('PASS — wago-sensor-fidelity-ui')
