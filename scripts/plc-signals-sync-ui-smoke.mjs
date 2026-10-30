import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Simulador de sinais do PLC (painel nas propriedades e no separador Entradas/Saídas do Ladder),
// LCD do LOGO! na janela do modelo e varrimento «Sincronização» editor ↔ simulador no Admin.
const baseURL = process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.EDITOR3D_TEST_OUTPUT
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL ? { channel: process.env.EDITOR3D_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json'
  const fonts = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
    || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/lojjic/unicode-font-resolver@'))
  return local || fonts ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  localStorage.removeItem('dcsimu:supabase:config:v1')
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  localStorage.setItem('dcsimu:ladder:status-open', '1')
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const check = (value, message) => { assert.ok(value, message); console.log('PASS — ' + message) }
const capture = async (name, locator) => { if (output) await (locator ?? page).screenshot({ path: path.join(output, name + '.png') }) }
const sim = (source, arg) => page.evaluate(async ([source, arg]) => {
  const { useSimStore } = await import('/src/store/useSimStore.ts')
  return Function('store', 'arg', 'return (' + source + ')(store, arg)')(useSimStore, arg)
}, [source.toString(), arg])

try {
  if (output) await fs.mkdir(output, { recursive: true })
  // 1) Admin · Sincronização: um rascunho antigo do LOGO! com bornes espelhados.
  await page.goto(baseURL + '/dashboard')
  await page.evaluate(async () => {
    const { buildBuiltinDraft } = await import('/src/admin/editor3d/builtinComponents.ts')
    const { boundsMm, loadGlbAssets } = await import('/src/catalog/definition.ts')
    const { catalogApi } = await import('/src/catalog/catalogApi.ts')
    const draft = await buildBuiltinDraft('plcSiemensLogo1224RC')
    const cache = new Map(); await loadGlbAssets(draft.def, cache)
    const box = boundsMm(draft.def, cache)
    draft.def.terminals = draft.def.terminals.map((t) => ({ ...t, position: [t.position[0], box.min.y + box.max.y - t.position[1], t.position[2]], normal: [t.normal[0], -t.normal[1], t.normal[2]] }))
    await catalogApi.save('synthetic-logo-flipped', draft.meta, draft.def)
  })
  await page.goto(baseURL + '/admin/editor')
  await page.locator('[data-sync-toggle]').click()
  const row = page.locator('[data-sync-row="synthetic-logo-flipped"]')
  await row.waitFor({ timeout: 60000 })
  check(await row.locator('[data-sync-issue="draft-flipped"]').count() === 1, 'Sincronização deteta os bornes invertidos do LOGO!')
  check(await row.locator('[data-sync-issue="draft-only"]').count() === 1, 'Sincronização indica que o rascunho não está no simulador')
  check(await page.locator('[data-sync-locked]').count() > 30, `Integrados sem GLB listados (${await page.locator('[data-sync-locked]').count()})`)
  check(await page.locator('[data-builtin-locked]').count() > 30, 'Cartões dos integrados sem GLB marcados «Bloqueado no simulador»')
  await capture('admin-sincronizacao', page.locator('[data-sync-panel]'))
  await row.getByRole('button', { name: 'Corrigir rascunho', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-sync-row="synthetic-logo-flipped"] [data-sync-issue="draft-flipped"]'), null, { timeout: 60000 })
  check(true, '«Corrigir rascunho» repõe os bornes (I/L+/M em cima, Q em baixo)')
  const fixedY = await page.evaluate(async () => {
    const { catalogApi } = await import('/src/catalog/catalogApi.ts')
    const entry = await catalogApi.adminGet('synthetic-logo-flipped')
    const y = (label) => entry.draft.terminals.find((t) => t.label === label).position[1]
    return { i: y('I0.0'), q: y('Q0.1') }
  })
  check(fixedY.i > fixedY.q + 40, `Rascunho guardado com I0.0 acima de Q0.1 (${fixedY.i.toFixed(1)} > ${fixedY.q.toFixed(1)} mm)`)
  await capture('admin-sincronizacao-corrigido', page.locator('[data-sync-panel]'))

  // 2) Projeto: LOGO! no 3D, painel de sinais nas propriedades
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: /(?:Novo|Criar) projeto/i }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Criar novo projeto' })
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Sinais LOGO')
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.getByRole('tablist', { name: 'Vistas' }).waitFor()
  await page.getByRole('button', { name: 'Visualização 3D', exact: true }).click()
  await page.locator('.panel3d-stage canvas').waitFor()
  const plcId = await sim((store) => {
    const id = store.getState().addComponent('plcSiemensLogo1224RC', 200, 200)
    const plc = store.getState().components.find((c) => c.id === id)
    plc.state = { ...plc.state, powered: true }
    store.getState().setActivePlc(id)
    store.setState({ tool: 'select', selectedComponentIds: [id], selectedComponentId: id, ladder: { ...store.getState().ladder, rungs: [{ id: 'r1', name: 'Arranque', branches: [{ id: 'b1', elements: [{ id: 'c1', address: 'I0.0', contactType: 'NO' }, { id: 'c2', address: 'I0.1', contactType: 'NC' }] }], coils: [{ id: 'q', address: 'Q0.1', coilType: 'COIL' }], enabled: true, collapsed: false }] } })
    return id
  })
  await page.getByRole('button', { name: 'Enquadrar seleção', exact: true }).click()
  await page.getByRole('button', { name: 'Frente', exact: true }).click({ force: true }).catch(() => {})
  await page.waitForTimeout(2500)
  await capture('projeto-logo-lcd', page.locator('.panel3d-stage'))
  const group = page.locator('[data-plc-sim-group]')
  await group.waitFor()
  await group.locator('summary').click()
  const panel = group.locator('[data-plc-sim]')
  check(await panel.locator('[data-plc-input]').count() >= 8, `Painel de sinais com ${await panel.locator('[data-plc-input]').count()} entradas do LOGO!`)
  const modeTag = panel.locator('[data-plc-input="I0.1"] .plc-sim-mode')
  await modeTag.click()
  await modeTag.click()
  check(await modeTag.textContent() === 'NC', 'Tipo de contacto muda a cada clique (INT → NO → NC), também em STOP')
  check(await panel.locator('[data-plc-input="I0.0"] button').first().isDisabled(), 'Em STOP o botão de sinal fica inativo (como nas E/S virtuais)')
  await sim((store) => store.getState().play())
  await page.waitForTimeout(400)
  await panel.locator('[data-plc-input="I0.0"] button').first().click()
  await page.waitForTimeout(600)
  const state = await sim((store, id) => { const plc = store.getState().components.find((c) => c.id === id); return { modes: plc.state.simInputModes, inputs: plc.state.simInputs, table: store.getState().runtime.plcRuntime[id]?.table } }, plcId)
  check(state.modes['I0.1'] === 'nc' && state.table['I0.1'] === true, 'Tipo de contacto NC escolhido: I0.1 repousa a 1')
  check(state.inputs['I0.0'] === true && state.table['I0.0'] === true, 'Clique injeta o sinal em I0.0 (interruptor, mantém)')
  check(state.table['Q0.1'] === false, 'Programa I0.0 · /I0.1 → Q0.1: com NC em repouso (1) a saída fica a 0')
  await panel.locator('[data-plc-input="I0.1"] button').first().hover()
  await page.mouse.down()
  await page.waitForTimeout(500)
  const pressed = await sim((store, id) => store.getState().runtime.plcRuntime[id]?.table, plcId)
  check(pressed['I0.1'] === false && pressed['Q0.1'] === true, 'Premir o NC abre o contacto: I0.1 = 0 e Q0.1 = 1')
  await capture('propriedades-sinais-premido', group)
  await page.mouse.up()
  await capture('propriedades-sinais', group)

  // 3) Ladder · Entradas/Saídas: o mesmo simulador
  await page.getByRole('tab', { name: /Ladder/ }).first().click()
  await page.getByRole('tab', { name: /Entradas\/Saídas/ }).first().click().catch(() => {})
  const ladderPanel = page.locator('.ladder-status-grid [data-plc-sim]')
  await ladderPanel.waitFor({ timeout: 10000 })
  check(await ladderPanel.locator('[data-plc-input]').count() >= 8, 'Separador Entradas/Saídas do Ladder mostra o simulador de sinais')
  check(await ladderPanel.locator('[data-plc-input="I0.1"] select').inputValue() === 'nc', 'Modo NC partilhado entre propriedades e Ladder')
  await capture('ladder-sinais', page.locator('.ladder-bottom-panel'))
  assert.deepEqual(errors, [], 'Exceções JavaScript')
  console.log('PASS — Sinais, LCD e sincronização sem exceções JavaScript')
} finally { await browser.close() }
