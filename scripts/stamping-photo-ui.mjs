import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

const output = path.resolve('runtime/stamping-photo')
await mkdir(output, { recursive: true })
const f = await panelFixture({ baseURL: process.env.MAQUETTES_TEST_URL ?? 'http://127.0.0.1:5182', output, height: 1000 })
try {
  const ids = await f.page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    useSimStore.getState().newProject('all')
    return useSimStore.getState().insertReadyMaquette('atec-estampagem', { x: 420, y: 260 })
  })
  await f.page.waitForFunction(ids => {
    const r = window.__panelState?.()
    if (!r || document.querySelector('.panel3d-loading-overlay')) return false
    const found = new Set()
    r.scene.traverse(o => { if (o.userData.isComponentRoot) found.add(o.userData.componentId) })
    return ids.every(id => found.has(id))
  }, ids, { timeout: 60000 })
  const inspect = () => f.page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const T = window.__fixtureThree, r = window.__panelState(), st = useSimStore.getState()
    r.scene.updateMatrixWorld(true)
    const roots = new Map()
    r.scene.traverse(o => { if (o.userData.isComponentRoot) roots.set(o.userData.componentId, o) })
    const result = {}
    for (const c of st.components) {
      const root = roots.get(c.id)
      if (!root) continue
      const b = new T.Box3()
      root.traverse(o => {
        if (!o.isMesh || !o.visible || !o.material?.visible || o.material?.opacity === 0) return
        b.expandByObject(o, true)
        if (c.type === 'mecHmiKtp700' && o.material?.name?.includes('(LCD)')) {
          result.hmiNormal = new T.Vector3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new T.Quaternion())).toArray()
        }
        if (c.type === 'mecRotaryArm' && o.geometry?.type === 'LatheGeometry') {
          o.geometry.computeBoundingBox()
          const contact = new T.Vector3(0, o.geometry.boundingBox.max.y, 0)
          result.cup = o.localToWorld(contact).toArray()
        }
      })
      const point = root.getWorldPosition(new T.Vector3())
      if (c.type === 'panelEnclosure') b.setFromObject(root.getObjectByName('enclosure-back'), true)
      if (c.type === 'mecRotaryArm') {
        const arm = root.getObjectByName('Braco_Estrutura_Metalica')
        result.armRotation = arm.getWorldQuaternion(new T.Quaternion()).toArray()
      }
      result[c.type === 'mecOperatorBox' ? 'box' : c.type === 'panelEnclosure' ? 'cabinet' : c.type === 'mecSlotPlate' ? 'plate' : c.id] = {
        type: c.type, label: c.state.labelText, point: point.toArray(), min: b.min.toArray(), max: b.max.toArray(), desired: c.panel3DPosition,
      }
    }
    return result
  })
  await f.page.waitForTimeout(500)
  const up = await inspect()
  await writeFile(path.join(output, 'initial-geometry.json'), JSON.stringify(up, null, 2))
  const assert = (ok, name) => { if (!ok) throw new Error(name); console.log(`PASS ${name}`) }
  assert(up.hmiNormal[0] > 0.99, 'HMI com ecrã virado para o exterior (+X)')
  assert(up.cabinet.max[1] < -0.5 && up.cabinet.min[1] > -7.4, 'Quadro sob a mesa e acima do chão')
  const operators = Object.values(up).filter(v => v?.desired && ['buttonNO', 'buttonNC', 'selectorSchneiderXa2ed33', 'emergencyButton'].includes(v.type))
  assert(operators.length === 6, 'Seis operadores reais da biblioteca')
  for (const op of operators) {
    assert(Math.abs(op.point[0] - op.desired.x) < 0.001 && Math.abs(op.point[1] - op.desired.y) < 0.001, `Operador ${op.label} na posição física da caixa`)
    assert(op.max[2] > up.box.max[2] - 0.015, `Cabeça de ${op.label} sai da tampa`)
  }
  await f.page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const arm = useSimStore.getState().components.find(c => c.type === 'mecRotaryArm')
    useSimStore.getState().setComponentState(arm.id, { armDownPct: 100 })
  })
  await f.page.waitForTimeout(1800)
  const down = await inspect()
  assert(Math.abs(up.cup[0] - down.cup[0]) < 0.001 && Math.abs(up.cup[2] - down.cup[2]) < 0.001 && Math.abs(up.cup[1] - down.cup[1] - 0.18) < 0.005, 'Ventosa da biblioteca desce 18 mm só na vertical')
  assert(up.armRotation.every((n, i) => Math.abs(n - down.armRotation[i]) < 0.001), 'Braço metálico conserva a orientação durante o curso')
  await writeFile(path.join(output, 'geometry-evidence.json'), JSON.stringify({ up, down }, null, 2))
  await f.page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const st = useSimStore.getState(), arm = st.components.find(c => c.type === 'mecRotaryArm')
    st.setComponentState(arm.id, { armDownPct: 0 })
  })
  await f.page.waitForTimeout(1800)
  await f.page.waitForTimeout(1200)
  for (const [name, direction, upper] of [
    ['overview', [-0.85, 0.65, 1.1], false],
    ['stations', [0.8, 1.15, 0.9], true],
    ['operator', [1.1, 0.5, 1.1], true],
  ]) {
    await f.page.evaluate(({ direction, upper }) => {
      const r = window.__panelState(), T = window.__fixtureThree, box = new T.Box3()
      r.scene.updateMatrixWorld(true)
      const keep = new Set()
      r.scene.traverse(o => {
        if (!o.userData.isComponentRoot) return
        o.traverse(n => { if (n.isSprite) n.visible = false })
        const b = new T.Box3().setFromObject(o, true)
        if (upper) b.min.y = Math.max(b.min.y, -0.15)
        if (b.max.y >= b.min.y) box.union(b)
        for (let p = o; p && p !== r.scene; p = p.parent) keep.add(p)
      })
      for (const c of r.scene.children) if (!keep.has(c) && !c.isLight && !c.isCamera) c.visible = false
      r.scene.background = new T.Color('#e8edf1')
      const center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3())
      const distance = Math.max(size.x / r.camera.aspect, size.y) / (2 * Math.tan(r.camera.fov * Math.PI / 360)) * 1.1 + size.z * 0.9
      r.controls?.dispatchEvent({ type: 'start' })
      r.camera.position.copy(center).add(new T.Vector3(...direction).normalize().multiplyScalar(distance))
      r.camera.lookAt(center); r.controls?.target.copy(center); r.controls?.update(); r.invalidate()
    }, { direction, upper })
    await f.frame()
    await f.page.screenshot({ path: path.join(output, `${process.env.PHOTO_STAGE ?? 'after'}-${name}.png`) })
  }
  const data = await f.page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    return useSimStore.getState().saveJSON()
  })
  await writeFile(path.join(output, 'maquete-estampagem.dc'), Buffer.concat([Buffer.from('DCSIMU\x01'), Buffer.from(data)]))
  if (f.errors.length) throw new Error(f.errors.join('\n'))
  console.log(`Rendered ${ids.length} components; three reference views and native .dc saved in ${output}`)
} finally {
  await f.browser.close()
}
