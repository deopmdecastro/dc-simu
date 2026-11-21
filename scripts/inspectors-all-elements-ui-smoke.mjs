import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { inspectorFixture } from './lib/inspector-fixture.mjs'

const output = path.resolve(process.env.INSPECTOR_OUTPUT || 'docs/validation/inspectors-all-elements')
const f = await inspectorFixture({ output }), { page, check } = f
const coverage = [], failures = []
try {
  const types = await page.evaluate(async () => {
    const { TEMPLATES } = await window.__fixtureImport('/src/electrical/factory.ts')
    return Object.keys(TEMPLATES).filter(t => !t.startsWith('cat:'))
  })
  const selected = process.env.INSPECTOR_TYPES ? process.env.INSPECTOR_TYPES.split(',') : types
  for (const type of selected) {
    try {
      const [id] = await f.show(type)
      await f.openGroups()
      const before = await f.store(s => s.getState().components[0])
      await page.getByLabel('Descrição', { exact: true }).fill('Verificado: ' + type)
      await page.getByLabel('TAG / referência', { exact: true }).fill('TESTE1')
      const x = page.getByLabel('Posição X (px)', { exact: true })
      await x.fill('137'); await x.press('Tab'); await f.frame()
      const edited = await f.store(s => s.getState().components[0])
      const identities = c => c.terminals.map(t => [t.id, t.label])
      check(edited.id === id && edited.ref === 'TESTE1' && edited.label === 'Verificado: ' + type && edited.schematicX === 137, type + ': identificação e posição alteram o elemento selecionado')
      check(JSON.stringify(identities(edited)) === JSON.stringify(identities(before)), type + ': edição preserva códigos e IDs dos bornes')
      await f.store(s => s.getState().undo()); await f.frame()
      check(await f.store(s => s.getState().components[0].schematicX) === before.schematicX, type + ': Desfazer repõe a posição anterior')
      await f.store(s => s.getState().redo()); await f.frame()
      check(await f.store(s => s.getState().components[0].schematicX) === 137, type + ': Refazer repõe a edição')
      const roundtrip = await f.store(s => {
        const json = s.getState().saveJSON(); s.getState().loadJSON(json)
        return s.getState().components[0]
      })
      check(roundtrip.id === id && roundtrip.label === edited.label && roundtrip.schematicX === edited.schematicX && JSON.stringify(identities(roundtrip)) === JSON.stringify(identities(edited)), type + ': guardar/reabrir conserva a configuração e ligações')
      const finite = value => typeof value === 'number' ? Number.isFinite(value) : !value || typeof value !== 'object' || Object.values(value).every(finite)
      check(finite(roundtrip), type + ': configuração sem NaN ou Infinity')
      coverage.push({ type, terminals: edited.terminals.length, checks: 6, ok: true })
    } catch (error) {
      failures.push({ type, error: String(error.stack || error) }); coverage.push({ type, ok: false })
      console.error('FAIL — ' + type + ': ' + error.message)
      await page.screenshot({ path: path.join(output, 'failure-' + type + '.png') }).catch(() => {})
    }
  }
  f.stable()
  await writeFile(path.join(output, 'all-types-results.json'), JSON.stringify({ totalTypes: types.length, tested: selected.length, checks: f.count(), coverage, failures, errors: f.errors, scope: 'Todos os TEMPLATES nativos, incluindo elementos 2D/legados sem inserção 3D. Inspetor React real, grupos abertos, Undo/Redo e persistência; pedidos externos bloqueados.' }, null, 2) + '\n')
  check(!failures.length, 'Todos os elementos nativos passaram: ' + failures.map(f => f.type).join(', '))
} finally { await f.browser.close() }
