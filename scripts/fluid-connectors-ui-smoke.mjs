import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

const output = path.resolve('../../../runtime/fluid-connectors')
const f = await panelFixture({ output }), { page, check, store, frame, show } = f
const markers = () => page.evaluate(() => {
  const r = window.__panelState(), T = window.__fixtureThree, found = []
  r.scene.updateMatrixWorld(true)
  r.scene.traverse(node => {
    if (!node.userData.fluidConnectionMarker) return
    const world = node.getWorldPosition(new T.Vector3()), screen = world.clone().project(r.camera)
    const ball = node.children[0].children.find(child => child.isMesh)
    const scale = ball.getWorldScale(new T.Vector3())
    const up = new T.Vector3(0, 1, 0).applyQuaternion(r.camera.quaternion).multiplyScalar(scale.x)
    const edge = world.clone().add(up).project(r.camera), rect = r.gl.domElement.getBoundingClientRect()
    found.push({ id: node.userData.connectionTerminalId, medium: node.userData.connectionMedium,
      x: rect.left + (screen.x + 1) * rect.width / 2, y: rect.top + (1 - screen.y) * rect.height / 2,
      color: ball.material.color.getHexString(), radiusPx: Math.abs(edge.y - screen.y) * rect.height / 2 })
  })
  return found
})
try {
  await page.getByRole('radio', { name: 'Ambiente fabril', exact: true }).click()
  await show('waterPump', 2)
  await store(s => s.setState({ components: s.getState().components.map((c, i) => ({ ...c, schematicX: c.schematicX + i * 800 })) }))
  await frame()
  await page.evaluate(() => {
    const r = window.__panelState(), T = window.__fixtureThree, bounds = new T.Box3()
    r.scene.updateMatrixWorld(true)
    r.scene.traverse(node => { if (node.userData.isComponentRoot) bounds.expandByObject(node, true) })
    const center = bounds.getCenter(new T.Vector3()), size = bounds.getSize(new T.Vector3())
    const distance = Math.max(size.x / r.camera.aspect, size.y) / (2 * Math.tan(r.camera.fov * Math.PI / 360)) * 1.35 + size.z
    r.controls.dispatchEvent({ type: 'start' }); r.camera.position.set(center.x, center.y, bounds.max.z + distance)
    r.camera.lookAt(center); r.controls.target.copy(center); r.controls.update(); r.invalidate()
  })
  await frame()
  check((await markers()).length === 0, 'Selecionar mantém o equipamento sem marcadores de tubagem')
  await store(s => { s.getState().setWireDefaults({ medium: 'hydraulic', route: 'direct' }); s.getState().setTool('wire') })
  await frame(); await frame()
  let ports = await markers()
  check(ports.length === 4 && ports.every(port => port.medium === 'hydraulic'), 'Ferramenta hidráulica mostra só as quatro portas hidráulicas das duas bombas')
  check(ports.every(port => port.radiusPx >= 5 && port.radiusPx <= 9), 'Bolas visíveis com raio de pelo menos 5 px')
  await page.evaluate(() => {
    const r = window.__panelState(); r.controls.dispatchEvent({ type: 'start' })
    r.camera.position.sub(r.controls.target).multiplyScalar(3).add(r.controls.target); r.controls.update(); r.invalidate()
  })
  await frame(); await frame()
  ports = await markers()
  check(ports.every(port => port.radiusPx >= 5 && port.radiusPx <= 9), 'Marcadores mantêm o tamanho na vista afastada da fábrica')
  await page.screenshot({ path: path.join(output, 'hydraulic-ports-overview.png') })
  await page.evaluate(() => {
    const r = window.__panelState(); r.camera.position.sub(r.controls.target).multiplyScalar(1 / 3).add(r.controls.target); r.controls.update(); r.invalidate()
  })
  await frame(); await frame()
  const endpoints = await store(s => {
    const [a, b] = s.getState().components
    return { from: a.terminals.find(t => t.kind === 'hydraulic-out').id, to: b.terminals.find(t => t.kind === 'hydraulic-in').id }
  })
  ports = await markers()
  const from = ports.find(port => port.id === endpoints.from), to = ports.find(port => port.id === endpoints.to)
  await page.mouse.click(from.x, from.y); await frame()
  check((await markers()).some(port => port.id === endpoints.from && port.color === '16a34a'), 'Origem escolhida fica destacada a verde')
  await store(s => s.getState().setWireDefaults({ medium: 'pneumatic' })); await frame()
  await store(s => s.getState().setWireDefaults({ medium: 'hydraulic' })); await frame(); await frame()
  check((await markers()).every(port => port.color !== '16a34a'), 'Trocar o meio cancela o rascunho anterior')
  await page.mouse.click(from.x, from.y); await frame()
  await page.mouse.click(to.x, to.y); await frame()
  check(await store((s, ends) => s.getState().wires.some(wire => wire.kind === 'hydraulic' && wire.fromTerminalId === ends.from && wire.toTerminalId === ends.to), endpoints), 'Clique nas duas bolas cria tubagem hidráulica nos conectores reais')
  await page.waitForFunction(() => {
    let rendered = false
    window.__panelState().scene.traverse(node => { if (node.userData.wireId) rendered = true })
    return rendered
  })
  await page.screenshot({ path: path.join(output, 'hydraulic-connection.png') })
  await store(s => s.getState().setWireDefaults({ medium: 'pneumatic' }))
  await frame()
  check((await markers()).length === 0, 'Modo pneumático não oferece conectores hidráulicos')
  await show('pneumaticFrl')
  await store(s => { s.getState().setWireDefaults({ medium: 'pneumatic' }); s.getState().setTool('wire') })
  await frame(); await frame()
  ports = await markers()
  check(ports.length >= 2 && ports.every(port => port.medium === 'pneumatic'), 'Modo pneumático destaca as portas pneumáticas')
  await store(s => s.getState().setTool('select')); await frame()
  check((await markers()).length === 0, 'Marcadores desaparecem ao sair da ferramenta')
  f.stable()
  console.log(`${f.count()} verificações passaram`)
} finally { await f.browser.close() }
