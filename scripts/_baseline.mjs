import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { panelFixture } from './lib/panel-fixture.mjs'
const output = '/home/user/wago-new'
const f = await panelFixture({ baseURL: 'http://127.0.0.1:5207', output })
const { page } = f
await mkdir(output, { recursive: true })
for (const type of ['wago221_2', 'wago221_3', 'wago221_5', 'wago221_inline', 'wago221_double', 'sensorMountBalluff', 'rollerConveyor']) {
  try {
    await f.show(type)
    await page.waitForTimeout(type === 'rollerConveyor' ? 1500 : 400)
    await page.evaluate(() => {
      const r = window.__panelState(), T = window.__fixtureThree, b = new T.Box3()
      r.scene.updateMatrixWorld(true)
      r.scene.traverse((n) => { if (n.userData.isComponentRoot) b.expandByObject(n, true) })
      const c = b.getCenter(new T.Vector3()), s = b.getSize(new T.Vector3())
      const distance = Math.max(s.x / r.camera.aspect, s.y, s.z) * 1.8
      r.controls?.dispatchEvent({ type: 'start' })
      r.camera.position.copy(c).add(new T.Vector3(0.62, 0.3, 1.75).normalize().multiplyScalar(distance))
      r.camera.lookAt(c); r.controls?.target.copy(c); r.controls?.update(); r.invalidate()
    })
    await f.frame()
    await page.screenshot({ timeout: 60000, path: path.join(output, `${type}.png`) })
    console.log('SHOT', type)
  } catch (e) { console.log('FAIL', type, e.message.split('\n')[0]) }
}
await f.browser.close()
