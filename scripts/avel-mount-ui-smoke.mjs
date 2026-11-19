import assert from 'node:assert/strict'
import path from 'node:path'
import { browserFixture } from './lib/browser-fixture.mjs'

/** Encaixe visual AVEL↔base Finder 90.23 no Panel3D real (React + WebGL). */
const output = path.resolve('runtime/avel-mount')
const f = await browserFixture({ baseURL: process.env.FIXTURE_URL, output })
  const { page, check } = f
  page.on('console', m => { if (m.text().startsWith('FIXTURE-CAM')) console.log(m.text()) })
const f1 = n => Math.round(n * 10) / 10

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

  // Calha + base na calha + relé encaixado via ação real do store.
  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    useSimStore.setState({ components: [], wires: [], canvasNotes: [], canvasTexts: [], selectedComponentIds: [], selectedTerminalId: null, demoMode: false, tool: 'select' })
    await window.__fixtureFrames()
    const rail = createComponent('dinRail15x55', 'CALHA1', 'UI regression', 0, 860, 520, { lengthMm: 300 })
    const socket = createComponent('relaySocketFinder9023', 'X1', 'UI regression', 1, 900, 520)
    const relay = createComponent('levelRelayAvel411', 'KN1', 'UI regression', 2, 960, 660)
    useSimStore.setState({ components: [rail, socket, relay] })
    useSimStore.getState().snapToRails([socket.id], false)
    useSimStore.getState().mountRelayOnSocket(relay.id, socket.id)
  })
  await page.waitForFunction(() => {
    const r = window.__panelState?.(); if (!r) return false
    let n = 0; r.scene.traverse(o => { if (/^industrial_device_(relaySocketFinder9023|levelRelayAvel411)$/.test(o.name)) n++ })
    return n === 2
  }, null, { timeout: 60000 })
  await page.waitForFunction(() => !document.querySelector('.panel3d-loading-overlay'))
  await page.evaluate(() => new Promise(r => setTimeout(r, 400)))
  f.stable()

  // Alinhamento 3D: centro do par de furos (pins do relé) coincide com o alvéolo no mundo.
  const align = await page.evaluate(async () => {
    const r = window.__panelState(), THREE = window.__fixtureThree
    const { terminalWorld3D } = await window.__fixtureImport('/src/three/terminal3D.ts')
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const s = useSimStore.getState()
    const relay = s.components.find(c => c.type === 'levelRelayAvel411')
    const socket = s.components.find(c => c.type === 'relaySocketFinder9023')
    r.scene.updateMatrixWorld(true)
    const nodes = {}
    r.scene.traverse(o => { if (o.name === 'industrial_device_' + relay.type) nodes.relay = o; if (o.name === 'industrial_device_' + socket.type) nodes.socket = o })
    // terminalWorld3D(component, terminal, pivot) devolve a posição no mundo do painel.
    // No Panel3D o nó industrial_device_* fica exatamente no pivô (sem rotação de grupo),
    // por isso a posição do nó em matrixWorld É o pivô a passar à função.
    const rows = []
    for (const pin of [1, 6, 11]) {
      const pt = relay.terminals.find(t => t.label === String(pin))
      const pv = socket.terminals.find(t => t.label === 'P' + pin)
      if (!pt || !pv) return { error: 'missing terminals ' + pin }
      const wp = terminalWorld3D(relay, pt, new THREE.Vector3().setFromMatrixPosition(nodes.relay.matrixWorld))
      const wv = terminalWorld3D(socket, pv, new THREE.Vector3().setFromMatrixPosition(nodes.socket.matrixWorld))
      rows.push({ pin, dx: wp.x - wv.x, dy: wp.y - wv.y, dz: wp.z - wv.z })
    }
    const back = new THREE.Box3().setFromObject(nodes.relay, true)
    const front = new THREE.Box3().setFromObject(nodes.socket, true)
    return { rows, relayBackZ: back.min.z, socketFrontZ: front.max.z, mountedOn: relay.mountedOn === socket.id }
  })
  check(align.mountedOn === true, 'relé regista mountedOn na base no 3D')
  for (const row of align.rows) {
    check(Math.hypot(row.dx, row.dy) < 1.5, 'pin ' + row.pin + ' alinhado com o alvéolo P' + row.pin + ' no 3D (' + f1(row.dx) + ',' + f1(row.dy) + ' mm)')
  }
  const gap = align.socketFrontZ - align.relayBackZ
  check(gap > 0 && gap < 6.5, 'face traseira do relé junto à base no 3D (folga ' + f1(gap) + ' mm ≈ profundidade dos alvéolos)')

  // Foto do par encaixado: a câmara orbita no Panel3D é reiniciada pelos controlos,
  // por isso usamos os próprios controlos (target + posição relativa via offset).
  await page.evaluate(() => {
    const r = window.__panelState(), THREE = window.__fixtureThree
    r.scene.updateMatrixWorld(true)
    const bounds = new THREE.Box3()
    r.scene.traverse(o => { if (/^industrial_device_/.test(o.name)) bounds.expandByObject(o, true) })
    const center = bounds.getCenter(new THREE.Vector3())
    // O PanelCameraRig re-encaixa a câmara no primeiro paint; o verdadeiro enquadramento
    // consegue-se simulando o rato: centramos com o scroll-bridge interno e aproximamos
    // com a roda do rato (DOLLY). Primeiro centramos o target no par.
    const offset = r.camera.position.clone().sub(r.controls.target)
    r.controls.target.copy(center)
    r.camera.position.copy(center).add(offset.setLength(.5))
    r.controls.update()
    r.invalidate()
    console.log('FIXTURE-CAM ' + JSON.stringify({ cam: r.camera.position, target: r.controls?.target, center, maxZ: bounds.max.z }))
  })
  await page.evaluate(() => window.__fixtureFrames())
  // Aproxima com a roda do rato sobre o centro do canvas (OrbitControls DOLLY real).
  const canvasBox = await page.evaluate(() => { const r = window.__panelState(); const b = r.gl.domElement.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })
  for (let i = 0; i < 14; i++) { await page.mouse.move(canvasBox.x, canvasBox.y); await page.mouse.wheel(0, -240); await page.evaluate(() => window.__fixtureFrames()) }
  await page.screenshot({ path: path.join(output, 'mounted-front.png') })

  // Perfil lateral do «sanduíche»: relé → base → calha, sem artefactos de corte.
  await page.evaluate(() => {
    const r = window.__panelState(), THREE = window.__fixtureThree
    r.scene.updateMatrixWorld(true)
    const bounds = new THREE.Box3()
    r.scene.traverse(o => { if (/^industrial_device_/.test(o.name)) bounds.expandByObject(o, true) })
    const center = bounds.getCenter(new THREE.Vector3())
    r.controls?.target.copy(center)
    r.camera.position.copy(center).add(new THREE.Vector3(1.05, .12, .8))
    r.camera.lookAt(center)
    r.camera.updateProjectionMatrix()
    r.controls?.update()
    r.invalidate()
  })
  await page.evaluate(() => window.__fixtureFrames())
  await page.screenshot({ path: path.join(output, 'mounted-side.png') })

  f.stable()
  console.log('OK — AVEL encaixado na base no Panel3D real (' + f.count() + ' verificações)')
} catch (error) {
  console.error(error)
  f.stable()
  await page.screenshot({ path: path.join(output, 'failure.png') })
  process.exit(1)
} finally {
  await f.browser.close()
}
