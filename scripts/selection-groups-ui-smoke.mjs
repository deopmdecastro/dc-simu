// Seleção múltipla e grupos nos editores (Esquema IEC, GRAFCET e 3D):
//  · Ctrl+clique junta símbolos/etapas/componentes E textos livres à seleção;
//  · arrastar um elemento da seleção move tudo (textos incluídos);
//  · Ctrl+G agrupa — depois um clique simples seleciona o grupo todo; Ctrl+Shift+G desagrupa;
//  · Delete apaga a seleção inteira num só passo (Ctrl+Z repõe).
// GRAFCET_TEST_URL=http://127.0.0.1:5207 GRAFCET_TEST_CHANNEL=chrome node scripts/selection-groups-ui-smoke.mjs
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
const center = async (locator) => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  await context.addInitScript(() => {
    performance.setResourceTimingBufferSize(10000)
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.removeItem('dcsimu:supabase:config:v1')
    globalThis.__dcAppImport = (path) => {
      const hit = performance.getEntriesByType('resource').map((entry) => entry.name)
        .filter((url) => { try { return new URL(url).pathname === path } catch { return false } }).pop()
      return import(hit || path)
    }
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => { if (!/Failed to fetch/.test(e.message)) errors.push(e.message) })
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Grupos')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(2500)
  const store = (code, arg) => page.evaluate(async ([code, arg]) => { const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts'); return new Function('s', 'arg', code)(useSimStore.getState(), arg) }, [code, arg])
  const cmdUi = (code) => page.evaluate(async (code) => { const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts'); return new Function('ui', code)(useCommandsUi.getState()) }, code)

  // ================================================================== Esquema IEC
  await store(`s.loadJSON(JSON.stringify({ app: 'dc-simu', version: 6, components: [], wires: [], commands: {
    name: 'Grupos', pages: [{ id: 'page-1', name: 'Página 1' }], texts: [],
    parts: [{ id: 'k1', kind: 'coil', x: 200, y: 200, rot: 0, tag: 'K1', page: 'page-1' }, { id: 's1', kind: 'pushNO', x: 400, y: 200, rot: 0, tag: 'S1', page: 'page-1' }], wires: [] },
    canvasTexts: [{ id: 'tx1', view: 'commands', text: 'LEGENDA', x: 200, y: 360, page: 'page-1', font: 'sans', size: 13, color: '#334155', bold: true, align: 'left', createdAt: '2026-01-01' }] }))`)
  await page.keyboard.press('F6')
  await page.locator('.dc-cmd-canvas').waitFor({ timeout: 60000 })
  await cmdUi("ui.setActivePageId('page-1'); ui.emit('fit')")
  await page.waitForTimeout(800)
  const coil = page.locator('[data-cmd-part="k1"]'), push = page.locator('[data-cmd-part="s1"]'), text = page.locator('[data-cmd-text="tx1"]')
  await coil.click()
  await page.keyboard.down('Control')
  await push.click()
  await text.click()
  await page.keyboard.up('Control')
  const sel = await cmdUi('return { parts: ui.selectedPartIds.slice().sort().join(), texts: ui.selectedTextIds.join() }')
  check(sel.parts === 'k1,s1' && sel.texts === 'tx1', `IEC: Ctrl+clique junta símbolos e o texto livre à seleção (${JSON.stringify(sel)})`)
  // Arrastar a bobina move os dois símbolos e o texto.
  const before = await store("return { k1: s.commands.parts.find((p) => p.id === 'k1').x, s1: s.commands.parts.find((p) => p.id === 's1').x, tx: s.canvasTexts.find((t) => t.id === 'tx1').x }")
  const c = await center(coil)
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 60, c.y, { steps: 6 }); await page.mouse.move(c.x + 120, c.y, { steps: 6 }); await page.mouse.up()
  await page.waitForTimeout(300)
  const after = await store("return { k1: s.commands.parts.find((p) => p.id === 'k1').x, s1: s.commands.parts.find((p) => p.id === 's1').x, tx: s.canvasTexts.find((t) => t.id === 'tx1').x }")
  const d = after.k1 - before.k1
  check(d > 0 && after.s1 - before.s1 === d && after.tx - before.tx === d, `IEC: arrastar move os símbolos e o texto de uma vez (+${d} em todos)`)
  // Ctrl+G, limpar, um clique no texto seleciona o grupo todo.
  await page.keyboard.press('Control+g')
  check(await store("return s.selectionGroups.filter((g) => g.view === 'commands').length") === 1, 'IEC: Ctrl+G agrupa a seleção')
  await page.keyboard.press('Escape')
  await text.click()
  const grouped = await cmdUi('return { parts: ui.selectedPartIds.slice().sort().join(), texts: ui.selectedTextIds.join() }')
  check(grouped.parts === 'k1,s1' && grouped.texts === 'tx1', 'IEC: um clique num membro (o texto) seleciona o grupo todo')
  // Arrastar a partir do texto move o grupo.
  const b2 = await store("return s.commands.parts.find((p) => p.id === 's1').y")
  const t = await center(text)
  await page.mouse.move(t.x, t.y); await page.mouse.down(); await page.mouse.move(t.x, t.y + 50, { steps: 6 }); await page.mouse.move(t.x, t.y + 100, { steps: 6 }); await page.mouse.up()
  await page.waitForTimeout(300)
  check(await store("return s.commands.parts.find((p) => p.id === 's1').y") > b2, 'IEC: arrastar o texto do grupo move também os símbolos')
  await page.keyboard.press('Control+Shift+g')
  check(await store("return s.selectionGroups.filter((g) => g.view === 'commands').length") === 0, 'IEC: Ctrl+Shift+G desagrupa')
  await page.keyboard.press('Escape')
  await coil.click()
  check(await cmdUi('return ui.selectedPartIds.join()') === 'k1', 'IEC: desagrupado, o clique volta a selecionar só o símbolo')
  // Delete da seleção mista num só passo.
  await page.keyboard.down('Control'); await push.click(); await text.click(); await page.keyboard.up('Control')
  await page.keyboard.press('Delete')
  await page.waitForTimeout(300)
  check(await store("return s.commands.parts.length + s.canvasTexts.filter((t) => t.view === 'commands').length") === 0, 'IEC: Delete apaga símbolos e texto selecionados')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  check(await store("return s.commands.parts.length + s.canvasTexts.filter((t) => t.view === 'commands').length") === 3, 'IEC: um Ctrl+Z repõe tudo')

  // ================================================================== GRAFCET
  await store(`s.loadJSON(JSON.stringify({ app: 'dc-simu', version: 6, components: [], wires: [], projectKind: 'grafcet', grafcet: {
    name: 'G', steps: [
      { id: 'st0', name: '0', initial: true, stepType: 'initial', action: '', condition: '', actions: [], x: 200, y: 120, pinned: true },
      { id: 'st1', name: '1', initial: false, stepType: 'simple', action: '', condition: '', actions: [], x: 200, y: 320, pinned: true },
    ], transitions: [{ id: 'tr1', name: 'T1', from: ['st0'], to: ['st1'], condition: 'I0.0' }],
    comments: [{ id: 'cm1', text: 'NOTA', x: 420, y: 140, fontSize: 14 }] } }))`)
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: 'GRAFCET', exact: true }).click()
  await page.waitForTimeout(1500)
  const step0 = page.locator('[data-step-id="st0"]').first(), step1 = page.locator('[data-step-id="st1"]').first(), note = page.locator('[data-grafcet-text="cm1"]')
  await note.waitFor({ timeout: 20000 })
  await page.waitForTimeout(1200) // o GRAFCET ajusta a vista ao abrir
  await step0.click()
  await page.waitForTimeout(250)
  await page.keyboard.down('Control'); await note.click(); await page.keyboard.up('Control')
  await page.waitForTimeout(250)
  await page.keyboard.press('Control+g')
  await page.waitForTimeout(250)
  const gGroup = await store("return s.selectionGroups.filter((g) => g.view === 'grafcet').map((g) => g.members.slice().sort().join()).join()")
  check(gGroup === 'cm1,st0', `GRAFCET: Ctrl+clique junta a etapa e o texto; Ctrl+G agrupa (${gGroup || 'sem grupo'})`)
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)
  // Arrastar o texto do grupo move a etapa.
  const gBefore = await store("return { st: s.grafcet.steps.find((x) => x.id === 'st0').x, cm: s.grafcet.comments[0].x }")
  const n = await center(note)
  await page.mouse.move(n.x, n.y); await page.mouse.down(); await page.mouse.move(n.x + 40, n.y, { steps: 6 }); await page.mouse.move(n.x + 80, n.y, { steps: 6 }); await page.mouse.up()
  await page.waitForTimeout(400)
  const gAfter = await store("return { st: s.grafcet.steps.find((x) => x.id === 'st0').x, cm: s.grafcet.comments[0].x, st1: s.grafcet.steps.find((x) => x.id === 'st1').x }")
  check(gAfter.cm > gBefore.cm && gAfter.st - gBefore.st === gAfter.cm - gBefore.cm && gAfter.st1 === 200, `GRAFCET: arrastar o texto do grupo move a etapa agrupada (e não a outra) — ${JSON.stringify({ gBefore, gAfter })}`)
  // Arrastar a etapa do grupo move o texto.
  const s0 = await center(step0)
  await page.mouse.move(s0.x, s0.y); await page.mouse.down(); await page.mouse.move(s0.x, s0.y + 40, { steps: 6 }); await page.mouse.move(s0.x, s0.y + 80, { steps: 6 }); await page.mouse.up()
  await page.waitForTimeout(400)
  const gAfter2 = await store("return { st: s.grafcet.steps.find((x) => x.id === 'st0').y, cm: s.grafcet.comments[0].y }")
  check(gAfter2.cm > 140, `GRAFCET: arrastar a etapa do grupo move o texto (${JSON.stringify(gAfter2)})`)
  await page.keyboard.press('Control+Shift+g')
  check(await store("return s.selectionGroups.filter((g) => g.view === 'grafcet').length") === 0, 'GRAFCET: Ctrl+Shift+G desagrupa')
  // Ctrl+A inclui os textos; Delete apaga tudo.
  await page.mouse.click(5, 5)
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  // Confirmação «Eliminar … ?» (alertdialog).
  const confirm = page.getByRole('alertdialog').getByRole('button').last()
  await confirm.waitFor({ timeout: 5000 })
  await confirm.click()
  await page.waitForTimeout(400)
  check(await store("return s.grafcet.steps.length + (s.grafcet.comments ?? []).length") === 0, 'GRAFCET: Ctrl+A seleciona etapas e textos; Delete apaga tudo')

  // ================================================================== 3D
  const native = await page.evaluate(async () => { const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts'); return nativePartidaDiretaContent() })
  native.canvasTexts = [{ id: 't3d', view: 'schematic', text: 'QUADRO', x: -0.45, y: 1.2, z: 0.6, font: 'sans', size: 12, color: '#111', bold: true, align: 'left', createdAt: '2026-01-01' }]
  await store('s.loadJSON(JSON.stringify(arg))', native)
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: '3D Realista', exact: true }).click()
  await page.waitForTimeout(3000)
  // Seleciona KM1 e QM1 pelo store (os modelos 3D são do WebGL) e junta o texto com Ctrl+clique.
  await store("s.selectComponents(['native-km1', 'native-qm1'])")
  const text3d = page.locator('.ctext', { hasText: 'QUADRO' })
  await text3d.waitFor({ timeout: 20000 })
  await page.keyboard.down('Control'); await text3d.click(); await page.keyboard.up('Control')
  await page.waitForTimeout(200)
  await page.keyboard.press('Control+g')
  const g3 = await store("return s.selectionGroups.filter((g) => g.view === 'schematic').map((g) => g.members.slice().sort().join()).join()")
  check(g3 === 'native-km1,native-qm1,t3d', `3D: Ctrl+clique junta o texto aos componentes; Ctrl+G agrupa (${g3})`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check(await store('return s.selectedComponentIds.length') === 0, '3D: Esc limpa a seleção')
  // Clique no texto do grupo seleciona os componentes; arrastar o texto move-os.
  const k1Before = await store("const c = s.components.find((x) => x.id === 'native-km1'); return { x: c.schematicX, tx: s.canvasTexts[0].x }")
  const tc = await center(text3d)
  await page.mouse.move(tc.x, tc.y); await page.mouse.down(); await page.mouse.move(tc.x + 40, tc.y, { steps: 8 }); await page.mouse.move(tc.x + 90, tc.y, { steps: 8 }); await page.mouse.up()
  await page.waitForTimeout(500)
  const k1After = await store("const c = s.components.find((x) => x.id === 'native-km1'); return { x: c.schematicX, tx: s.canvasTexts[0].x, sel: s.selectedComponentIds.slice().sort().join() }")
  check(k1After.sel === 'native-km1,native-qm1', `3D: clique no texto do grupo seleciona os componentes (${k1After.sel})`)
  check(k1After.tx > k1Before.tx && k1After.x !== k1Before.x, `3D: arrastar o texto do grupo move o texto e os componentes — ${JSON.stringify({ k1Before, k1After })}`)
  await page.keyboard.press('Control+Shift+g')
  check(await store("return s.selectionGroups.filter((g) => g.view === 'schematic').length") === 0, '3D: Ctrl+Shift+G desagrupa')
  // Delete da seleção mista (componentes + texto) num só passo; Ctrl+Z repõe.
  const counts = () => store("return { comps: s.components.length, texts: s.canvasTexts.length }")
  const c0 = await counts()
  await page.keyboard.press('Escape')
  await store("s.selectComponents(['native-h3'])")
  await page.keyboard.down('Control'); await text3d.click(); await page.keyboard.up('Control')
  await page.waitForTimeout(200)
  await page.keyboard.press('Delete')
  await page.waitForTimeout(400)
  const c1 = await counts()
  check(c1.comps === c0.comps - 1 && c1.texts === c0.texts - 1, `3D: Delete apaga o componente e o texto selecionados (${JSON.stringify({ c0, c1 })})`)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(400)
  const c2 = await counts()
  check(c2.comps === c0.comps && c2.texts === c0.texts, '3D: um Ctrl+Z repõe o componente e o texto')
  await page.mouse.click(1000, 900)
  await page.keyboard.press('Control+a')
  await page.waitForTimeout(300)
  const all = await store("return s.selectedComponentIds.length")
  check(all >= 10 && await page.locator('.ctext.is-selected', { hasText: 'QUADRO' }).count() === 1, `3D: Ctrl+A seleciona os componentes e os textos (${all} componentes)`)
  check(errors.length === 0, `sem erros JavaScript (${errors.join(' | ') || 'nenhum'})`)
} finally {
  await browser.close()
}
console.log(`\n${checks} verificações da seleção múltipla e grupos passaram`)
