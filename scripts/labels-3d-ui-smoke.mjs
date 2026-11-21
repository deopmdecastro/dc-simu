import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { browserFixture } from './lib/browser-fixture.mjs'

const output = path.resolve('docs/validation/panel-labels')
const f = await browserFixture({ output, height: 900 }), { page, check } = f
try {
  await page.evaluate(async () => {
    const React = window.__fixtureReact
    const { Canvas, useThree } = await import('/node_modules/.vite/deps/@react-three_fiber.js')
    const { OrbitControls } = await import('/node_modules/.vite/deps/@react-three_drei.js')
    const { Enclosure3D } = await import('/src/three/PanelAccessories3D.tsx')
    const { useDecalKeyboard } = await import('/src/ui/useDecalKeyboard.ts')
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const c = createComponent('panelEnclosure', 'QE1', 'Quadro sintético', 0, 0, 0)
    c.state = { ...c.state, widthMm: 600, heightMm: 800, depthMm: 250, doorOpen: false }
    c.decals = [{ id: 'drag-label', kind: 'text', face: 'door', text: 'BOMBA 01\nEM SERVIÇO', widthMm: 120, heightMm: 36, fontSizeMm: 6, background: '#111111', color: '#ffffff', offsetXmm: 0, offsetYmm: 0 }]
    useSimStore.getState().stop()
    useSimStore.setState({ components: [c], wires: [], selectedComponentIds: [], selectedWireId: null, selectedWireIds: [], selectedTerminalId: null, selectedDecal: null, history: [], future: [], demoMode: false })
    function Probe() { const scene = useThree(); window.__label3d = { ...scene, THREE, id: c.id }; return null }
    function Content() {
      const components = useSimStore(s => s.components), component = components[0]
      useDecalKeyboard()
      return React.createElement(React.Fragment, null,
        React.createElement('ambientLight', { intensity: 2 }),
        React.createElement(Enclosure3D, { c: component, interactive: true, plateFrontZ: 0 }),
        React.createElement(OrbitControls, { makeDefault: true, enableDamping: false }), React.createElement(Probe))
    }
    window.__fixtureRoot.render(React.createElement('div', { style: { width: '100vw', height: '100dvh' } }, React.createElement(Canvas, { orthographic: true, camera: { position: [0, 0, 20], zoom: 65, near: 0.1, far: 100 } }, React.createElement(Content))))
  })
  await page.waitForFunction(() => window.__label3d?.scene.getObjectByName('decal-drag-label'))
  const state = () => page.evaluate(async () => { const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts'); const s = useSimStore.getState(); return { decal: s.components[0].decals[0], selected: s.selectedDecal, history: s.history.length, doorOpen: s.components[0].state.doorOpen, host: [s.components[0].schematicX, s.components[0].schematicY], gesture: !!s._decalMove } })
  const focusLabel = () => page.evaluate(() => {
    const s = window.__label3d, mesh = s.scene.getObjectByName('decal-drag-label'), { Vector3 } = s.THREE
    s.scene.updateMatrixWorld(true)
    const center = mesh.getWorldPosition(new Vector3()), normal = new Vector3(0, 0, 1).transformDirection(mesh.matrixWorld), up = new Vector3(0, 1, 0).transformDirection(mesh.matrixWorld)
    s.camera.position.copy(center).addScaledVector(normal, 20); s.camera.up.copy(up); s.camera.lookAt(center); s.camera.updateMatrixWorld(); s.camera.updateProjectionMatrix()
    s.controls.target.copy(center); s.controls.update(); s.invalidate()
    const projected = center.clone().project(s.camera), rect = s.gl.domElement.getBoundingClientRect()
    return { x: rect.left + (projected.x + 1) / 2 * rect.width, y: rect.top + (1 - projected.y) / 2 * rect.height, world: center.toArray(), controls: s.controls.enabled }
  })
  let center = await focusLabel()
  await page.mouse.click(center.x, center.y)
  check((await state()).selected?.decalId === 'drag-label', 'Clique no mesh3D seleciona a etiqueta sem abrir a porta')
  check((await state()).doorOpen === false, 'Selecionar etiqueta mantém a porta fechada')
  const before = await state()
  const textureId = await page.evaluate(() => window.__label3d.scene.getObjectByName('decal-drag-label').material.map.uuid)
  await page.mouse.move(center.x, center.y); await page.mouse.down()
  check(await page.evaluate(() => !window.__label3d.controls.enabled), 'Arrastar etiqueta suspende OrbitControls')
  await page.mouse.move(center.x + 39, center.y - 13, { steps: 8 }); await page.mouse.up()
  const moved = await state()
  check(Math.abs(moved.decal.offsetXmm - before.decal.offsetXmm - 60) < 1 && Math.abs(moved.decal.offsetYmm - before.decal.offsetYmm - 20) < 1, 'Arrasto3D converte o plano da face em mm')
  check(moved.history === before.history + 1 && await page.evaluate(() => window.__label3d.controls.enabled), 'Fim do arrasto cria um Undo e restaura a câmara')
  check(await page.evaluate(id => window.__label3d.scene.getObjectByName('decal-drag-label').material.map.uuid === id, textureId), 'Mover conserva a textura e evita recriar o conteúdo por evento')
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowUp')
  check((await state()).decal.offsetXmm === moved.decal.offsetXmm + 1 && (await state()).decal.offsetYmm === moved.decal.offsetYmm + 10, 'Teclas3D movem somente a etiqueta selecionada')
  const repeatBefore = await state()
  await page.keyboard.down('ArrowDown'); await page.keyboard.down('ArrowDown'); await page.keyboard.down('ArrowDown'); await page.keyboard.up('ArrowDown')
  check((await state()).decal.offsetYmm === repeatBefore.decal.offsetYmm - 3 && (await state()).history === repeatBefore.history + 1, 'Manter seta premida agrupa as repetições num único Undo')
  check(JSON.stringify((await state()).host) === JSON.stringify(before.host), 'Gestos e setas não movem o quadro')
  await page.screenshot({ path: path.join(output, 'label-3d-closed.png') })
  const closedWorld = (await focusLabel()).world
  await page.evaluate(async () => { const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts'); const s = useSimStore.getState(); s.setComponentState(s.components[0].id, { doorOpen: true }) })
  await page.waitForTimeout(2200)
  center = await focusLabel()
  check(center.world.some((n, i) => Math.abs(n - closedWorld[i]) > 0.1), 'Etiqueta acompanha a dobradiça ao abrir a porta')
  const openBefore = await state()
  await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 26, center.y, { steps: 8 }); await page.mouse.up()
  check(Math.abs((await state()).decal.offsetXmm - openBefore.decal.offsetXmm - 40) < 1 && Math.abs((await state()).decal.offsetYmm - openBefore.decal.offsetYmm) < 1, 'Porta aberta: arrasto continua no referencial local correto')
  check((await state()).doorOpen === true, 'Arrastar na porta aberta mantém a porta aberta')
  await page.screenshot({ path: path.join(output, 'label-3d-open.png') })
  center = await focusLabel()
  const cancelBefore = await state()
  await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 20, center.y + 10, { steps: 5 }); await page.keyboard.press('Escape'); await page.mouse.up()
  check(JSON.stringify((await state()).decal) === JSON.stringify(cancelBefore.decal) && await page.evaluate(() => window.__label3d.controls.enabled), 'Escape cancela gesto3D e liberta os controlos da câmara')
  center = await focusLabel(); const blurBefore = await state()
  await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 13, center.y, { steps: 4 })
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  const blurAfter = await state()
  check(!blurAfter.gesture && blurAfter.history === blurBefore.history + 1 && await page.evaluate(() => window.__label3d.controls.enabled), 'Perder foco confirma o gesto uma vez e liberta a câmara')
  await page.mouse.move(center.x + 39, center.y + 10, { steps: 5 }); await page.mouse.up()
  check(JSON.stringify((await state()).decal) === JSON.stringify(blurAfter.decal), 'Após perder foco, mover o ponteiro não continua a arrastar a etiqueta')
  await page.evaluate(async () => { const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts'); const s = useSimStore.getState(); useSimStore.setState({ sim: { ...s.sim, runState: 'running' } }) })
  center = await focusLabel(); const doorBeforeClick = (await state()).doorOpen
  await page.mouse.click(center.x, center.y)
  check((await state()).doorOpen !== doorBeforeClick && !(await state()).selected, 'RUN: etiqueta não bloqueia a ação existente da porta nem entra em edição')
  f.stable()
  await writeFile(path.join(output, '3d-results.json'), JSON.stringify({ checks: f.count(), errors: f.errors, scope: 'Enclosure3D/EquipmentDecal3D, OrbitControls e gesto/teclado reais; portas fechada/aberta em Canvas WebGL local, dados sintéticos.' }, null, 2) + '\n')
} catch (error) { await page.screenshot({ path: path.join(output, '3d-failure.png') }).catch(() => {}); throw error }
finally { await f.browser.close() }
