// Três relés no Painel e M2 no Admin; fixture local, pedidos externos bloqueados.
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { panelFixture } from './lib/panel-fixture.mjs'
import { attachAdmin } from './lib/admin-fixture.mjs'

const output = path.resolve('docs/validation/geya-terminal-steps')
const f = await panelFixture({ baseURL: process.env.INDUSTRIAL_TEST_URL, output }), { page, check } = f
const types = ['timerGeyaGrt8M1', 'timerGeyaGrt8M2', 'timerGeyaGrt8B1'], measurements = []
try {
  for (const type of types) {
    await f.show(type)
    await page.waitForFunction(() => ['industrial_fascia', 'industrial_geya_side_l', 'industrial_geya_label_A1', 'industrial_geya_label_15'].every(n => window.__panelState().scene.getObjectByName(n)?.material.map?.image))
    const labels = ['A1', 'S', 'A2', '15', '16', '18', ...(type.endsWith('M2') ? ['25', '26', '28'] : [])]
    const rows = await page.evaluate(({ type, labels }) => {
      const r = window.__panelState(), T = window.__fixtureThree, root = r.scene.getObjectByName('industrial_device_' + type)
      r.scene.updateMatrixWorld(true)
      return labels.map(label => {
        const screw = r.scene.getObjectByName('terminal_screw_geya_' + label), at = root.worldToLocal(screw.getWorldPosition(new T.Vector3())).multiplyScalar(1000)
        const origin = screw.localToWorld(new T.Vector3(.0008, .0008, .012)), target = screw.localToWorld(new T.Vector3(.0008, .0008, 0))
        const hit = new T.Raycaster(origin, target.sub(origin).normalize()).intersectObject(root, true)[0]
        const marking = root.getObjectByName('industrial_geya_label_' + label), local = marking.getWorldPosition(new T.Vector3())
        const direction = new T.Vector3(0, 0, 1).transformDirection(root.matrixWorld)
        const labelHit = new T.Raycaster(local.clone().addScaledVector(direction, .2), direction.negate()).intersectObject(root, true)[0]?.object.name
        return { label, screw: at.toArray(), hit: hit?.object.name, labelHit }
      })
    }, { type, labels })
    for (const row of rows) {
      const deck = ['25', '26', '28'].includes(row.label) ? 38 : 24
      check(Math.abs(row.screw[2] - (deck - 1.25)) < .015 && row.hit === 'terminal_screw_head_geya_' + row.label, type + ' ' + row.label + ': parafuso visível e rebaixado no degrau correto Z' + deck)
      check(row.labelHit === 'industrial_geya_label_' + row.label, type + ' ' + row.label + ': identificação desimpedida no mesmo degrau')
    }
    check(await f.store(s => { const ts = s.getState().components[0].terminals; return new Set(ts.map(t => JSON.stringify(t.socket3D?.position ?? t.position3D))).size === ts.length }), type + ': cada borne tem uma entrada física distinta')
    await page.screenshot({ path: path.join(output, type + '-frente.png') })
    for (const [view, direction] of [['perspetiva', [-.9, .22, 1]], ['inferior', [-.8, -.48, 1]]]) {
      await page.evaluate(direction => {
        const r = window.__panelState(), T = window.__fixtureThree, c = r.controls.target.clone(), d = r.camera.position.distanceTo(c)
        r.controls.dispatchEvent({ type: 'start' }); r.camera.position.copy(c).add(new T.Vector3(...direction).normalize().multiplyScalar(d))
        r.camera.lookAt(c); r.controls.update(); r.invalidate()
      }, direction)
      await f.frame(); await page.screenshot({ path: path.join(output, type + '-' + view + '.png') })
    }
    await f.store(s => { s.getState().play(); s.getState().pause() }); await f.frame()
    for (const [node, key] of [['range', 'rangeMs'], ['fraction', 'fraction'], ...(!type.endsWith('B1') ? [['function', 'function']] : [])]) {
      const before = await f.store((s, key) => s.getState().components[0].state[key], key)
      await f.click('industrial_' + node)
      check(await f.store((s, { key, before }) => s.getState().components[0].state[key] !== before, { key, before }), type + ': seletor ' + node + ' continua funcional')
    }
    measurements.push({ type, rows })
  }
  const admin = await attachAdmin(f), draft = await admin.open('timerGeyaGrt8M2')
  const stepPositions = () => page.evaluate(() => {
    const r = window.__adminState(), T = window.__fixtureThree, root = r.scene.getObjectByName('industrial_device_timerGeyaGrt8M2')
    r.scene.updateMatrixWorld(true)
    return ['15', '25'].map(label => root.worldToLocal(root.getObjectByName('terminal_screw_geya_' + label).getWorldPosition(new T.Vector3())).z * 1000)
  })
  check((await stepPositions()).every((z, i) => Math.abs(z - [22.75, 36.75][i]) < .015), 'Admin: M2 importa os dois degraus inferiores distintos')
  await admin.editor(s => s.getState().edit(def => ({ ...def, terminals: def.terminals.map(t => t.label === '25' ? { ...t, name: 'Nome local 25' } : t) })))
  await admin.reopen(draft.id)
  check((await stepPositions()).every((z, i) => Math.abs(z - [22.75, 36.75][i]) < .015), 'Admin: gravar e reabrir conserva a geometria dos degraus')
  f.stable()
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ checks: f.count(), types, measurements, errors: f.errors, scope: 'Painel/Admin React/R3F, IndexedDB isolado, pedidos externos bloqueados' }, null, 2) + '\n')
} catch (error) { await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); throw error }
finally { await f.browser.close() }
