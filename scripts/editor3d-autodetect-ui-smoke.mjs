import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Deteção automática (bornes, botões com mola/retenção, ecrãs) e encaixe dos bornes nas cavidades,
// no editor completo. Contexto descartável, sem API. Requer Vite em EDITOR3D_TEST_URL.
const baseURL = process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL ? { channel: process.env.EDITOR3D_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json'
  return local ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  localStorage.removeItem('dcsimu:supabase:config:v1')
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const check = (value, message) => { assert.ok(value, message); console.log('PASS — ' + message) }
const store = (fn, argument) => page.evaluate(async ({ source, argument }) => {
  const { useEditorStore } = await import('/src/admin/editor3d/editorStore.ts')
  return Function('store', 'argument', 'return (' + source + ')(store, argument)')(useEditorStore, argument)
}, { source: fn.toString(), argument })
const tab = (name) => page.locator('.ce-tabs').getByRole('tab', { name, exact: true }).click()

try {
  await page.goto(baseURL + '/dashboard')
  const entryId = await page.evaluate(async () => {
    const { buildBuiltinDraft } = await import('/src/admin/editor3d/builtinComponents.ts')
    const { catalogApi } = await import('/src/catalog/catalogApi.ts')
    const draft = await buildBuiltinDraft('motorBreakerPkzmC10')
    draft.def.controls = []
    return (await catalogApi.save('synthetic-autodetect-review', draft.meta, draft.def)).id
  })
  await page.goto(baseURL + '/admin/editor/' + entryId)
  await page.locator('.ce-root canvas').waitFor()
  await page.waitForFunction(async () => {
    const { glbCache, useEditorStore } = await import('/src/admin/editor3d/editorStore.ts')
    return useEditorStore.getState().def.parts.some((part) => part.kind === 'glb' && part.asset && glbCache.get(part.asset))
  }, null, { timeout: 60000 })

  // 1) encaixe: os bornes integrados estão dentro das cavidades
  await tab('Bornes')
  const seat = page.locator('details.ce-section').filter({ has: page.locator('summary', { hasText: 'Encaixe dos bornes' }) })
  await seat.getByRole('button', { name: 'Verificar encaixe' }).click()
  await seat.getByRole('status').filter({ hasText: /cavidade/ }).waitFor({ timeout: 60000 })
  check(/Os \d+ bornes estão dentro das cavidades/.test(await seat.getByRole('status').innerText()), 'Bornes integrados do PKZM confirmados dentro das cavidades')

  // 2) um borne puxado para a boca do furo (como os criados antes da correção) é apanhado e corrigido
  const moved = await store((s) => {
    const t = s.getState().def.terminals[0]
    const axis = t.normal.findIndex((n) => Math.abs(n) > 0.5)
    const position = [...t.position]; position[axis] += Math.sign(t.normal[axis]) * ((t.socketInsetMm ?? 1) + 1.5)
    s.getState().edit((def) => ({ ...def, terminals: def.terminals.map((item, i) => (i ? item : { ...item, position, socketDepthMm: undefined, socketInsetMm: undefined })) }), 'test')
    return t.label
  })
  await seat.getByRole('button', { name: 'Verificar encaixe' }).click()
  await seat.getByRole('status').filter({ hasText: 'fora da cavidade' }).waitFor({ timeout: 30000 })
  check(await seat.locator('.ce-list-item.is-warn').count() === 1, `Borne ${moved} fora da cavidade assinalado`)
  await seat.getByRole('button', { name: 'Encaixar todos' }).click()
  await seat.getByRole('status').filter({ hasText: 'encaixado' }).waitFor({ timeout: 30000 })
  await seat.getByRole('button', { name: 'Verificar encaixe' }).click()
  await seat.getByRole('status').filter({ hasText: 'estão dentro das cavidades' }).waitFor({ timeout: 30000 })
  const fixed = await store((s) => s.getState().def.terminals[0])
  check(fixed.socketDepthMm > 0 && fixed.socketInsetMm > 0 && fixed.socketInsetMm < fixed.socketDepthMm, 'Encaixar todos devolve o borne à cavidade com profundidade e recuo')

  // 3) deteção automática: bornes, manípulos com retenção e botão TEST com mola
  await tab('Botões')
  const auto = page.locator('details.ce-section').filter({ has: page.locator('summary', { hasText: 'Deteção automática no modelo' }) })
  await auto.getByRole('button', { name: 'Analisar objetos do modelo' }).click()
  await auto.getByRole('group', { name: 'Bornes' }).waitFor()
  check(await auto.getByRole('group', { name: 'Manípulos / disjuntores' }).locator('.ce-action-card').count() === 2, 'Deteta os 2 manípulos do disjuntor-motor')
  check((await auto.getByRole('group', { name: 'Manípulos / disjuntores' }).innerText()).includes('retenção'), 'Manípulos marcados com retenção')
  check((await auto.getByRole('group', { name: 'Botões' }).innerText()).includes('mola'), 'Botão TEST marcado com mola')
  check(await auto.getByRole('group', { name: 'Bornes' }).locator('.ce-action-card').count() === 6, 'Deteta os 6 bornes pelo nome')
  // só cria controlos: desmarca os bornes (já existem)
  for (const box of await auto.getByRole('group', { name: 'Bornes' }).getByRole('checkbox').all()) if (await box.isChecked()) await box.uncheck()
  await auto.getByRole('button', { name: 'Criar marcados' }).click()
  await auto.locator('.ce-hint').filter({ hasText: 'com mola' }).first().waitFor()
  const controls = await store((s) => s.getState().def.controls.filter((c) => c.id.startsWith('c_')).map((c) => ({ id: c.id, kind: c.kind, returnMode: c.returnMode, motion: c.motion?.mode, var: c.actions[0]?.var })))
  check(controls.filter((c) => c.kind === 'toggle').every((c) => c.returnMode === 'latch' && c.motion === 'tilt'), 'Manípulos criados com retenção e movimento basculante')
  const spring = controls.find((c) => c.returnMode === 'spring')
  check(!!spring, 'Botão TEST criado com mola')

  // 4) mola: ativo só enquanto premido
  const held = await page.evaluate(async (id) => {
    const { useEditorStore } = await import('/src/admin/editor3d/editorStore.ts')
    const { triggerEditorControl } = await import('/src/admin/editor3d/controlOps.ts')
    const control = useEditorStore.getState().def.controls.find((c) => c.id === id)
    const v = control.actions[0].var
    triggerEditorControl(control, 'down'); const down = useEditorStore.getState().previewVars[v]
    triggerEditorControl(control, 'up'); const up = useEditorStore.getState().previewVars[v]
    triggerEditorControl(control, 'press'); const pulse = useEditorStore.getState().previewVars[v]
    await new Promise((r) => setTimeout(r, 400)); const after = useEditorStore.getState().previewVars[v]
    return { down, up, pulse, after }
  }, spring.id)
  check(held.down === true && held.up === false, 'Mola: variável ativa ao premir e reposta ao largar')
  check(held.pulse === true && held.after === false, 'Mola: clique simples gera impulso curto')

  assert.deepEqual(errors, [], 'Exceções JavaScript')
  console.log('PASS — deteção automática e encaixe dos bornes sem exceções JavaScript')
} finally {
  await browser.close()
}
