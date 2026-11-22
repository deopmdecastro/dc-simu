import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'
const output = '/home/user/wago-close'
const f = await panelFixture({ baseURL: 'http://127.0.0.1:5207', output })
const { page } = f
// close-up de UMA tecla (via 3 do 221-415)
await f.show('wago221_5')
await page.waitForTimeout(500)
await page.evaluate(() => {
  const r = window.__panelState(), T = window.__fixtureThree, b = new T.Box3()
  r.scene.updateMatrixWorld(true)
  r.scene.traverse((n) => { if (n.userData.isComponentRoot) b.expandByObject(n, true) })
  const c = b.getCenter(new T.Vector3()), s = b.getSize(new T.Vector3())
  const target = new T.Vector3(c.x + s.x * 0.05, c.y + s.y * 0.32, c.z + s.z * 0.1)
  r.controls?.dispatchEvent({ type: 'start' })
  r.camera.position.copy(target).add(new T.Vector3(0.25, 0.55, 1.0).normalize().multiplyScalar(s.x * 0.36))
  r.camera.lookAt(target); r.controls?.target.copy(target); r.controls?.update(); r.invalidate()
})
await f.frame()
await page.screenshot({ timeout: 60000, path: path.join(output, 'lever-print.png') })
console.log('SHOT lever')
// esteira: enquadramento do conjunto sensor
await f.show('rollerConveyor')
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const r = window.__panelState(), T = window.__fixtureThree, b = new T.Box3()
  r.scene.updateMatrixWorld(true)
  r.scene.traverse((n) => { if (n.userData.isComponentRoot) b.expandByObject(n, true) })
  const c = b.getCenter(new T.Vector3()), s = b.getSize(new T.Vector3())
  const target = new T.Vector3(c.x - s.x * 0.28, c.y + s.y * 0.22, c.z + s.z * 0.18)
  r.controls?.dispatchEvent({ type: 'start' })
  r.camera.position.copy(target).add(new T.Vector3(-0.5, 0.35, 0.9).normalize().multiplyScalar(s.x * 0.42))
  r.camera.lookAt(target); r.controls?.target.copy(target); r.controls?.update(); r.invalidate()
})
await f.frame()
await page.screenshot({ timeout: 60000, path: path.join(output, 'conveyor-mount.png') })
console.log('SHOT conveyor')
await f.browser.close()
