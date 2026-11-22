import assert from 'node:assert/strict'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { browserFixture } from './lib/browser-fixture.mjs'

const output = process.env.INDUSTRIAL_TEST_OUTPUT || path.resolve('runtime/industrial-panel')
const f = await browserFixture({ baseURL: process.env.INDUSTRIAL_TEST_URL, output })
const { page, check } = f
const store = fn => page.evaluate(async source => {
  const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
  return Function('s', 'return (' + source + ')(s)')(useSimStore)
}, fn.toString())
async function show(type, count = 1) {
  const ids = await page.evaluate(async ({ type, count }) => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    useSimStore.getState().stop()
    useSimStore.setState({ components: [], wires: [], canvasNotes: [], canvasTexts: [], selectedComponentIds: [], selectedTerminalId: null, demoMode: false, tool: 'select' })
    await window.__fixtureFrames()
    const components = Array.from({ length: count }, (_, i) => createComponent(type, 'T' + i, 'UI regression', i, i * 200, 0))
    useSimStore.setState({ components })
    return components.map(c => c.id)
  }, { type, count })
  await page.waitForFunction(({ type, count }) => {
    const r = window.__panelState?.(); if (!r) return false
    let n = 0; r.scene.traverse(o => { if (o.name === 'industrial_device_' + type) n++ })
    return n === count
  }, { type, count }, { timeout: 60000 })
  await page.waitForFunction(() => !document.querySelector('.panel3d-loading-overlay'))
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)))
  await page.evaluate(() => {
    const r = window.__panelState(); r.scene.updateMatrixWorld(true)
    const THREE = window.__fixtureThree, bounds = new THREE.Box3()
    r.scene.traverse(o => { if (o.name.startsWith('industrial_device_')) bounds.expandByObject(o, true) })
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3())
    const distance = Math.max(size.x / r.camera.aspect, size.y) / (2 * Math.tan(r.camera.fov * Math.PI / 360)) * 1.4 + size.z
    r.camera.position.set(center.x, center.y, bounds.max.z + distance); r.camera.lookAt(center)
    r.camera.updateProjectionMatrix(); r.controls?.target.copy(center); r.controls?.update(); r.invalidate()
  })
  await page.evaluate(() => window.__fixtureFrames())
  return ids
}
async function state() { return store(s => s.getState().components[0].state) }
async function point(name, index = 0) {
  return page.evaluate(({ name, index }) => {
    const r = window.__panelState(), THREE = window.__fixtureThree, nodes = []
    r.scene.updateMatrixWorld(true)
    r.scene.traverse(o => { if (o.name === name) nodes.push(o) })
    const object = nodes[index]; if (!object) throw new Error('Missing actual scene node: ' + name)
    const b = new THREE.Box3().setFromObject(object, true), p = b.getCenter(new THREE.Vector3()); p.z = b.max.z
    p.project(r.camera)
    const rect = r.gl.domElement.getBoundingClientRect()
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 }
  }, { name, index })
}
const click = async name => { const p = await point(name); await page.mouse.click(p.x, p.y); await page.evaluate(() => window.__fixtureFrames()) }
const wheel = async name => { const p = await point(name); await page.mouse.move(p.x, p.y); await page.mouse.wheel(0, -120); await page.evaluate(() => window.__fixtureFrames()) }
const simRun = async () => { await store(s => s.setState({ sim: { ...s.getState().sim, runState: 'running' } })); await page.evaluate(() => window.__fixtureFrames()) }
try {
  await page.evaluate(async () => {
    const { default: Panel3D } = await import('/src/three/Panel3D.tsx')
    const source = await (await fetch('/src/three/Panel3D.tsx')).text()
    const dep = source.match(/from "([^"]*\/@react-three_fiber\.js\?v=[^"]+)"/)
    if (!dep) throw new Error('Real R3F dependency not found')
    const { _roots } = await import(dep[1])
    window.__fixtureThree = await import('/node_modules/.vite/deps/three.js')
    window.__panelState = () => [..._roots.values()].map(r => r.store.getState()).find(r => r.gl.domElement.isConnected)
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    useSimStore.setState({ components: [], wires: [], demoMode: false, selectedComponentIds: [] })
    window.__fixtureRoot.render(window.__fixtureReact.createElement(Panel3D, { frontEdit: true }))
  })
  for (const type of ['relaySocketFinder9023', 'relayFinder5534', 'timerGeyaGrt8M1', 'timerGeyaGrt8B1', 'levelRelayAvel411', 'buzzerMetaltexTby301', 'vfdSchneiderAtv320']) {
    await show(type)
    const actual = await page.evaluate(() => {
      const r = window.__panelState(), controls = new Set(); let meshes = 0, prints = 0
      r.scene.traverse(o => {
        if (o.userData.industrialControl) controls.add(o.userData.industrialControl)
        if (o.isMesh && o.parent) {
          let p = o, industrial = false
          while (p) { if (p.name.startsWith('industrial_device_')) industrial = true; p = p.parent }
          if (!industrial) return
          meshes++; if (o.userData.protectionMarking && (Array.isArray(o.material) ? o.material : [o.material]).some(m => m.map?.image)) prints++
        }
      })
      return { meshes, prints, controls: [...controls] }
    })
    check(actual.meshes > 0, type + ': rendered in the actual React Panel3D')
    if (!['relaySocketFinder9023'].includes(type)) check(actual.prints > 0, type + ': actual local prints/display uploaded')
    if (['relaySocketFinder9023', 'levelRelayAvel411', 'buzzerMetaltexTby301'].includes(type)) check(!actual.controls.length, type + ': no invented controls')
    await page.screenshot({ path: path.join(output, type + '.png') })
    f.stable()
  }
  await show('timerGeyaGrt8M1')
  const start = (await state()).rangeMs
  await click('industrial_range')
  check((await state()).rangeMs !== start, 'GEYA: real mesh click changes the time range')
  await wheel('industrial_function')
  check((await state()).function === 'B', 'GEYA: wheel over the physical selector chooses function B')
  const beforeFraction = (await state()).fraction
  await click('industrial_fraction')
  check((await state()).fraction > beforeFraction, 'GEYA: real fraction knob responds without moving the component')
  await store(s => s.setState({ tool: 'wire' }))
  const wireRange = (await state()).rangeMs; await click('industrial_range')
  check((await state()).rangeMs === wireRange, 'wire tool does not actuate a knob')
  await store(s => s.setState({ tool: 'select' }))

  await show('relayFinder5534')
  // Regra global de manobra: em STOP o TEST não atua (só seleciona); as manobras exigem ▶.
  let p = await point('industrial_test')
  await page.mouse.move(p.x, p.y); await page.mouse.down()
  check((await state()).testPressed !== true, 'Finder: in STOP the physical TEST is not actuated (manobra rule)')
  await page.mouse.up()
  await simRun()
  p = await point('industrial_test')
  await page.mouse.move(p.x, p.y); await page.mouse.down()
  check((await state()).testPressed === true, 'Finder: pressing physical TEST holds the real control')
  await page.mouse.move(10, 10); await page.mouse.up()
  check((await state()).testPressed === false, 'Finder: release outside cancels the momentary TEST')
  p = await point('industrial_test'); await page.mouse.move(p.x, p.y); await page.mouse.down()
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  check((await state()).testPressed === false, 'Finder: blur releases TEST and restores orbit controls')
  await page.mouse.up()

  await show('vfdSchneiderAtv320')
  await simRun()
  await click('industrial_encoder')
  check((await state()).editing === true && !(await state()).running, 'ATV: encoder enters reference editing, never RUN')
  const hz = (await state()).presetHz
  const cameraBefore = await page.evaluate(() => window.__panelState().camera.position.toArray())
  await wheel('industrial_encoder')
  check((await state()).presetHz === hz + 1, 'ATV: encoder wheel edits the reference frequency')
  const cameraAfter = await page.evaluate(() => window.__panelState().camera.position.toArray())
  check(cameraBefore.every((v, i) => Math.abs(v - cameraAfter[i]) < 1e-8), 'ATV: physical encoder wheel does not zoom the camera')
  await click('industrial_escape')
  check((await state()).editing === false, 'ATV: physical ESC exits editing')
  await click('industrial_cover_latch')
  check((await state()).controlCoverOpen === true, 'ATV: actual latch opens the service cover')
  const visible = await page.evaluate(() => {
    const r = window.__panelState()
    return [r.scene.getObjectByName('industrial_control_cover').visible, r.scene.getObjectByName('industrial_control_interior').visible]
  })
  check(!visible[0] && visible[1], 'ATV: service terminals are exposed, cover is hidden')

  await show('vfdSchneiderAtv320', 2)
  await store(s => {
    const components = s.getState().components.map((c, i) => ({ ...c, state: { ...c.state, powered: true, menu: 'mon', frequencyHz: 12.3 + i * 22.2 } }))
    s.setState({ components })
  })
  await page.evaluate(() => window.__fixtureFrames())
  const lcd = await page.evaluate(() => {
    const meshes = []; window.__panelState().scene.traverse(o => { if (o.name === 'industrial_lcd') meshes.push(o) })
    return meshes.map(m => ({ texture: m.material.map?.uuid, pixels: m.material.map?.image?.toDataURL?.() }))
  })
  check(lcd.length === 2 && lcd[0].texture !== lcd[1].texture && lcd[0].pixels !== lcd[1].pixels, 'two real ATV instances have independent LCDs and readings')
  await page.screenshot({ path: path.join(output, 'independent-atv-lcds.png') })
  f.stable()
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ assertions: f.count(), exceptions: f.errors, scope: 'Actual React Panel3D/R3F; synthetic isolated project, no live cloud.' }, null, 2))
  console.log(`\nPASS — ${f.count()} actual industrial Panel3D assertions`)
} catch (error) {
  console.error('React/WebGL errors:', f.errors)
  console.error('Panel diagnostics:', await page.evaluate(() => ({ html: document.getElementById('root')?.innerHTML.slice(0, 800), scene: window.__panelState?.()?.scene.children.map(n => n.name) })).catch(() => null))
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  throw error
} finally { await f.browser.close() }
