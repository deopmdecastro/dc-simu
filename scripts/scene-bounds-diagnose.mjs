/**
 * Diagnóstico de escala/posicionamento de modelos procedurais (tipo _debug da validação 2026-11-22).
 * Uso: colocar o tipo/offset no topo e correr com um dev server ativo:
 *   INDUSTRIAL_TEST_URL=http://127.0.0.1:<porta> node scripts/scene-bounds-diagnose.mjs
 * Regista bounds globais (Box3), posição do root, contagem de malhas visíveis e renderInfo.
 * Bounds globais na ordem de centenas de unidades = geometria em mm puro (falta ×U=0.01).
 */
import { panelFixture } from './lib/panel-fixture.mjs'
const f = await panelFixture({ baseURL: 'http://127.0.0.1:5207', output: '/tmp/dbg' })
const { page } = f
const [id] = await f.show('airCompressor')
await page.waitForTimeout(600)
await f.frame()
const info = await page.evaluate((id) => {
  const r = window.__panelState(), T = window.__fixtureThree
  let root
  r.scene.traverse((n) => { if (n.userData.isComponentRoot && n.userData.componentId === id) root = n })
  r.scene.updateMatrixWorld(true)
  const b = new T.Box3().setFromObject(root, true)
  let invisible = 0, zeroGeo = 0, total = 0
  root.traverse((n) => {
    if (n.isMesh) {
      total += 1
      if (!n.visible || (n.parent && !n.parent.visible)) invisible += 1
      const bb = new T.Box3().setFromObject(n, true)
      if (bb.isEmpty()) zeroGeo += 1
    }
  })
  return {
    rootPos: root.position.toArray().map(v=>+v.toFixed(2)), rootScale: root.scale.toArray(),
    bounds: { min: b.min.toArray().map(v=>+v.toFixed(2)), max: b.max.toArray().map(v=>+v.toFixed(2)) },
    camPos: r.camera.position.toArray().map(v=>+v.toFixed(2)),
    camTarget: r.controls?.target.toArray().map(v=>+v.toFixed(2)),
    total, invisible, zeroGeo,
    renderInfo: { calls: r.gl.info.render.calls, triangles: r.gl.info.render.triangles },
  }
}, id)
console.log('INFO', JSON.stringify(info))
await page.screenshot({ path: '/tmp/dbg/ac-debug.png' })
await f.browser.close()
