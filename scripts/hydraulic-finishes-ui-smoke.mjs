import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

const output = path.resolve('../../../runtime/hydraulic-finishes')
const phase = process.env.HYDRAULIC_FINISH_PHASE || 'after'
const f = await panelFixture({ output, height: 1000 }), { page, show, frame, store, check } = f
page.on('pageerror', error => console.error(error.message))
const lcd = () => page.evaluate(() => {
  let result = null
  window.__panelState().scene.traverse(node => {
    if (!node.isMesh) return
    const material = Array.isArray(node.material) ? node.material.find(m => m.name === 'Serigrafia do contador') : node.material
    if (material?.name !== 'Serigrafia do contador' || !material.map?.image?.getContext) return
    const pixels = material.map.image.getContext('2d').getImageData(170, 75, 280, 140).data
    let segments = 0
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 60 && pixels[i + 1] < 65 && pixels[i + 2] < 60) segments++
    result = { segments }
  })
  return result
})
const detailCapture = async (type, name) => {
  await page.evaluate(type => {
    const r = window.__panelState(), T = window.__fixtureThree
    r.controls.dispatchEvent({ type: 'start' }); r.scene.updateMatrixWorld(true)
    let root; r.scene.traverse(n => { if (n.name.startsWith(type === 'waterSupplyBox' ? 'water-supply-box-3d-' : 'water-flow-meter-3d-')) root ??= n })
    const box = new T.Box3().setFromObject(root, true), size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3())
    const distance = Math.max(size.x / r.camera.aspect, size.y) / (2 * Math.tan(r.camera.fov * Math.PI / 360)) * 1.3 + size.z
    r.camera.position.set(center.x + distance * 0.15, center.y + distance * 0.08, box.max.z + distance)
    r.camera.lookAt(center); r.controls.target.copy(center); r.controls.update(); r.invalidate()
  }, type)
  await frame(); await frame()
  const clip = await page.evaluate(type => {
    const r = window.__panelState(), T = window.__fixtureThree
    r.scene.updateMatrixWorld(true)
    let root; r.scene.traverse(n => { if (n.name.startsWith(type === 'waterSupplyBox' ? 'water-supply-box-3d-' : 'water-flow-meter-3d-')) root ??= n })
    const box = new T.Box3().setFromObject(root, true), rect = r.gl.domElement.getBoundingClientRect()
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new T.Vector3(x, y, z).project(r.camera), sx = rect.left + (p.x + 1) * rect.width / 2, sy = rect.top + (1 - p.y) * rect.height / 2
      left = Math.min(left, sx); right = Math.max(right, sx); top = Math.min(top, sy); bottom = Math.max(bottom, sy)
    }
    left = Math.max(0, left - 20); top = Math.max(0, top - 20); right = Math.min(innerWidth, right + 20); bottom = Math.min(innerHeight, bottom + 20)
    return { x: Math.floor(left), y: Math.floor(top), width: Math.ceil(right - left), height: Math.ceil(bottom - top) }
  }, type)
  await page.screenshot({ path: path.join(output, name + '.png'), clip })
}
const capture = async type => {
  await show(type)
  await page.evaluate(() => {
    const r = window.__panelState(), target = r.controls.target.clone()
    const distance = r.camera.position.distanceTo(target)
    r.camera.position.set(target.x + distance * 0.15, target.y + distance * 0.08, target.z + distance)
    r.camera.lookAt(target); r.controls.update(); r.invalidate()
  })
  await frame(); await frame()
  await page.screenshot({ path: path.join(output, `${phase}-${type}.png`) })
}
try {
  await capture('waterSupplyBox')
  await capture('hydraulicFlowMeter')
  if (phase === 'before') process.exitCode = 0
  else {
    check((await lcd())?.segments === 0, 'Contador sem alimentação: visor real sem segmentos desenhados')
    await detailCapture('hydraulicFlowMeter', 'meter-off-detail')
    const supplyId = await store(s => {
      const st = s.getState(), meter = st.components.find(c => c.type === 'hydraulicFlowMeter')
      st.setWireDefaults({ medium: 'electrical' })
      const sourceId = st.addComponent('powerSource24v', -1500, -800)
      const source = s.getState().components.find(c => c.id === sourceId)
      st.addWire(source.terminals.find(t => t.label === '+24V').id, meter.terminals.find(t => t.label === '+24V').id)
      st.addWire(source.terminals.find(t => t.label === '0V').id, meter.terminals.find(t => t.label === 'GND').id)
      st.step()
      return sourceId
    })
    await frame(); await frame()
    check((await lcd())?.segments > 100, 'Alimentação real de 24V desenha os valores do LCD')
    await detailCapture('hydraulicFlowMeter', 'meter-on-detail')
    await store((s, id) => { s.getState().setComponentState(id, { on: false }); s.getState().step() }, supplyId)
    await frame(); await frame()
    check((await lcd())?.segments === 0, 'Cortar a fonte apaga os segmentos na textura do visor')
    for (const type of ['waterSupplyBox', 'hydraulicValve', 'pneumaticFrl', 'junctionBoxOboT60', 'conduitVdsStraight', 'panelEnclosure']) {
      await capture(type)
      await page.waitForFunction(() => {
        let mapped = 0
        window.__panelState().scene.traverse(node => {
          if (!node.isMesh || !node.parent) return
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material.userData.cadSurface && material.normalMap && material.roughnessMap) mapped++
        })
        return mapped > 0
      })
      check(true, `${type}: mapas físicos de normal e rugosidade carregados`)
      if (type === 'waterSupplyBox') {
        check((await lcd())?.segments === 0, 'Contador interno do armário também começa desligado')
        await detailCapture(type, 'water-box-detail')
      }
    }
    f.stable()
    console.log(`${f.count()} verificações visuais passaram`)
  }
} catch (error) {
  console.error(f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png') })
  throw error
} finally { await f.browser.close() }
