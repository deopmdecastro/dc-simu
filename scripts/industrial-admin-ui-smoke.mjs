import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { adminFixture } from './lib/admin-fixture.mjs'
import { attachPanel } from './lib/panel-fixture.mjs'

const output = process.env.INDUSTRIAL_ADMIN_OUTPUT || path.resolve('runtime/industrial-admin')
const f = await adminFixture({ baseURL: process.env.INDUSTRIAL_TEST_URL, output })
const { page, check, editor, frame, open, point, click, reopen, publish } = f
const types = ['relaySocketFinder9023', 'relayFinder5534', 'timerGeyaGrt8M1', 'timerGeyaGrt8B1', 'levelRelayAvel411', 'buzzerMetaltexTby301', 'vfdSchneiderAtv320']
const published = []
const identity = () => editor(s => ({ controls: (s.getState().def.controls ?? []).map(c => [c.id, c.name]), terminals: s.getState().def.terminals.map(t => [t.id, t.label]) }))
try {
  for (const type of types) {
    const draft = await open(type)
    check(draft.usedModel && draft.terminals.length > 0, type + ': real GLB and usable terminals in full Admin editor')
    const document = await editor(s => ({ properties: s.getState().meta.properties, controls: s.getState().def.controls?.length ?? 0, displays: s.getState().def.displays?.length ?? 0 }))
    const pdf = await editor(s => Object.values(s.getState().def.assets).filter(v => v.mime === 'application/pdf' && v.data.startsWith('data:application/pdf')).map(v => atob(v.data.split(',')[1]).slice(0, 5)))
    check(pdf.includes('%PDF-'), type + ': original PDF is really embedded in saved draft')
    check(document.properties.some(p => p.key === 'Origem' && p.value.includes(type)), type + ': explicit builtin provenance survives Admin load')
    if (['relaySocketFinder9023', 'levelRelayAvel411', 'buzzerMetaltexTby301'].includes(type)) check(!document.controls && !document.displays, type + ': no fictitious controls or LCD seeded')
    check(await page.evaluate(() => { let proxies = 0; window.__adminState().scene.traverse(o => { if (o.userData.controlId) proxies++ }); return proxies === 0 }), type + ': no automatic invisible control box over the model')
    await page.screenshot({ path: path.join(output, type + '.png') })
    if (type === 'vfdSchneiderAtv320') {
      await page.getByRole('tab', { name: 'Simular', exact: true }).first().click()
      await click('industrial_encoder')
      check(await editor(s => s.getState().previewVars.editing) === true, 'Admin: actual encoder mesh enters editing')
      const hz = await editor(s => s.getState().previewVars.presetHz)
      const p = await point('industrial_encoder'); await page.mouse.move(p.x, p.y)
      const cameraBefore = await page.evaluate(() => window.__adminState().camera.position.toArray())
      await page.mouse.wheel(0, -120); await frame()
      check(await editor(s => s.getState().previewVars.presetHz) === hz + 1, 'Admin: encoder wheel changes the reference')
      const cameraAfter = await page.evaluate(() => window.__adminState().camera.position.toArray())
      check(cameraBefore.every((value, i) => Math.abs(value - cameraAfter[i]) < 1e-8), 'Admin: physical encoder wheel does not zoom the camera')
      await click('industrial_escape')
      check(await editor(s => s.getState().previewVars.editing) === false, 'Admin: physical ESC exits editing')
      await editor(s => s.getState().set({ previewVars: { ...s.getState().previewVars, powered: true, menu: 'mon', frequencyHz: 27.4 } })); await frame()
      check(await page.evaluate(() => { let n = 0; window.__adminState().scene.traverse(o => { if (o.userData.display && o.material?.map?.image) n++ }); return n === 1 }), 'Admin: exactly one generic dynamic LCD, without duplicate industrial canvas')
      await page.getByRole('tab', { name: 'Editar', exact: true }).first().click()
      // Deliberate author deletion is not an incomplete automatic seed.
      await editor(s => s.getState().edit(def => ({ ...def, controls: def.controls.filter(c => !c.nodes?.includes('industrial_escape')) })))
    } else {
      await editor(s => s.getState().edit(def => ({ ...def, controls: (def.controls ?? []).map((c, i) => i ? c : { ...c, name: c.name + ' · authored' }) })))
    }
    const before = await identity(); await reopen(draft.id)
    check(JSON.stringify(await identity()) === JSON.stringify(before), type + ': actual save/reopen preserves authored controls and every terminal ID')
    const result = await publish()
    check(result.version.definition.terminals.length === draft.terminals.length && JSON.stringify(result.version.definition.controls.map(c => [c.id, c.name])) === JSON.stringify(before.controls), type + ': actual publication/bake retains authored controls and electrical interface')
    published.push({ type, id: result.id, version: result.version.version }); f.stable()
  }

  // A true page reload, not synthetic registerCatalogVersion rows.
  await f.reload()
  await page.evaluate(async () => { const { useCatalogStore } = await window.__fixtureImport('/src/catalog/registry.ts'); await useCatalogStore.getState().load() })
  const panel = await attachPanel(f)
  for (const entry of published) {
    const type = `cat:${entry.id}:v${entry.version}`
    await panel.show(type, 2)
    const result = await page.evaluate(async ({ type, origin }) => {
      const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts'), { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
      const [first, second] = useSimStore.getState().components, ac = createComponent('powerSource1ph', 'AC', '', 9, -800, 600), dc = createComponent('powerSource24v', 'DC', '', 10, -700, 600), motor = createComponent('motor1ph', 'M', '', 11, -600, 600)
      const originalIds = first.terminals.map(t => t.id), wires = []
      const terminal = (c, label) => { const t = c.terminals.find(t => t.label === label); if (!t) throw new Error(origin + ': missing ' + label); return t.id }
      const wire = (a, al, b, bl) => wires.push({ id: 'published-industrial-' + wires.length, fromTerminalId: terminal(a, al), toTerminalId: terminal(b, bl), color: 'black', gauge: '1.5mm²', kind: 'control', route: 'straight', flexibility: 'flexible', bend: .5, energized: false })
      if (origin === 'relaySocketFinder9023') { wire(ac, 'L', first, '1'); wire(first, 'P1', motor, 'U1'); wire(ac, 'N', motor, 'U2') }
      if (origin === 'relayFinder5534') { wire(dc, '+24V', first, 'A1'); wire(dc, '0V', first, 'A2'); wire(ac, 'L', first, '11'); wire(first, '14', motor, 'U1'); wire(ac, 'N', motor, 'U2') }
      if (origin.startsWith('timerGeya')) {
        // M1 TON reaches 100 ms; B1 is a fixed TOF and must still be inside
        // its genuine 1 s initial off-delay window after the first scan.
        Object.assign(first.state, { rangeMs: 1000, fraction: origin === 'timerGeyaGrt8B1' ? 1 : .1, function: 'A' })
        wire(ac, 'L', first, 'A1'); wire(ac, 'N', first, 'A2')
      }
      if (origin === 'levelRelayAvel411') {
        Object.assign(first.state, { probeMode: 'virtual', wellMinWet: true, wellMaxWet: true, tankMinWet: false, tankMaxWet: false })
        wire(ac, 'L', first, '2'); wire(ac, 'N', first, '10'); wire(ac, 'L', first, '1'); wire(first, '3', motor, 'U1'); wire(ac, 'N', motor, 'U2')
      }
      if (origin === 'buzzerMetaltexTby301') { ac.state.nominalV = 110; wire(ac, 'L', first, '1'); wire(ac, 'N', first, '2') }
      if (origin === 'vfdSchneiderAtv320') { wire(ac, 'L', first, 'R/L1'); wire(ac, 'N', first, 'S/L2'); wire(first, '+24', first, 'STO'); wire(first, '+24', first, 'DI1') }
      useSimStore.setState({ components: [first, second, ac, dc, motor], wires })
      const scans = origin === 'vfdSchneiderAtv320' ? 8 : 1
      for (let i = 0; i < scans; i++) useSimStore.getState().step()
      const s = useSimStore.getState(), a = s.components[0], b = s.components[1]
      const on = origin === 'relaySocketFinder9023' ? !!s.components.find(c => c.id === motor.id)?.state.running : origin === 'buzzerMetaltexTby301' ? !!a.state.on : origin === 'vfdSchneiderAtv320' ? !!a.state.running : !!a.state.energized
      const isolated = !b.state.on && !b.state.powered && !b.state.energized && !b.state.running && !b.terminals.some(t => s.runtime.energizedTerminals.has(t.id))
      const endpoints = s.wires.map(w => [w.id, w.fromTerminalId, w.toTerminalId]), saved = s.saveJSON()
      s.newProject(); useSimStore.getState().loadJSON(saved)
      const restored = useSimStore.getState()
      return { on, isolated, sameType: a.type === type && b.type === type && restored.components[0].type === type, sameIds: JSON.stringify(restored.components[0].terminals.map(t => t.id)) === JSON.stringify(originalIds), sameWires: JSON.stringify(restored.wires.map(w => [w.id, w.fromTerminalId, w.toTerminalId])) === JSON.stringify(endpoints) }
    }, { type, origin: entry.type })
    check(result.on && result.isolated, entry.type + ': fresh published catalog instance follows real wiring independently of disconnected second instance')
    check(result.sameType && result.sameIds && result.sameWires, entry.type + ': project save/load preserves catalog type, terminal IDs and wire endpoints')
    await panel.frame(); f.stable()
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ assertions: f.count(), exceptions: f.errors, published, scope: 'Actual ComponentEditor3D save/reopen/publish/bake for all seven types, page reload and wired independent Panel3D catalog instances. Isolated local IndexedDB, not live cloud.' }, null, 2))
  console.log(`\nPASS — ${f.count()} actual industrial Admin/fresh-catalog assertions`)
} catch (error) {
  console.error('Admin exceptions:', f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
  console.error(await page.locator('.ce-error').allTextContents().catch(() => []))
  throw error
} finally { await f.browser.close() }
