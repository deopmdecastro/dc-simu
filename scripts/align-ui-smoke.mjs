// Alinhar e distribuir a seleção múltipla (textos e elementos) pela barra de ferramentas — «Alinhar»:
// Esquema IEC (símbolos, títulos e textos livres), GRAFCET (etapas e textos) e 3D (textos no painel).
// Verifica no ecrã (margens/centros iguais), espaços iguais ao distribuir e um só passo de Desfazer.
// GRAFCET_TEST_URL=http://127.0.0.1:5207 GRAFCET_TEST_CHANNEL=chrome node scripts/align-ui-smoke.mjs
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
const near = (values, tol = 1.5) => Math.max(...values) - Math.min(...values) <= tol
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
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Alinhar')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(2500)
  const store = (code, arg) => page.evaluate(async ([code, arg]) => { const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts'); return new Function('s', 'arg', code)(useSimStore.getState(), arg) }, [code, arg])
  const cmdUi = (code) => page.evaluate(async (code) => { const { useCommandsUi } = await globalThis.__dcAppImport('/src/commands/commandsUi.ts'); return new Function('ui', code)(useCommandsUi.getState()) }, code)
  // «body:<id>» mede o corpo de um símbolo IEC (sem a etiqueta K1): a área de clique está a 4 unidades
  // do corpo e o halo a 6, por isso a escala no ecrã sai da diferença entre as duas.
  const rects = (selectors) => page.evaluate((selectors) => selectors.map((sel) => {
    let r = null
    if (sel.startsWith('body:')) {
      const part = document.querySelector(`[data-cmd-part="${sel.slice(5)}"]`)
      const hit = part.querySelector('.dc-cmd-symbol-hit').getBoundingClientRect(), halo = part.querySelector('.dc-cmd-hover-halo').getBoundingClientRect()
      const k = (hit.left - halo.left) / 2 * 4
      r = { left: hit.left + k, right: hit.right - k, top: hit.top + k, bottom: hit.bottom - k }
    } else r = document.querySelector(sel).getBoundingClientRect()
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }
  }), selectors)
  const align = async (label) => {
    await page.locator('button.dc-align-menu').click()
    await page.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click()
    await page.waitForTimeout(400)
  }

  // ================================================================== Esquema IEC: símbolo + título (passa a texto livre lg-*) + texto livre
  await store(`s.loadJSON(JSON.stringify({ app: 'dc-simu', version: 6, components: [], wires: [], commands: {
    name: 'Alinhar', pages: [{ id: 'page-1', name: 'Página 1' }],
    texts: [{ id: 'lb1', text: 'Tags de entrada', x: 330, y: 150, page: 'page-1' }],
    parts: [{ id: 'k1', kind: 'coil', x: 200, y: 260, rot: 0, tag: 'K1', page: 'page-1' }], wires: [] },
    canvasTexts: [{ id: 'tx1', view: 'commands', text: 'Tags de saída', x: 460, y: 360, page: 'page-1', font: 'sans', size: 13, color: '#334155', bold: false, align: 'left', createdAt: '2026-01-01' }] }))`)
  await page.keyboard.press('F6')
  await page.locator('.dc-cmd-canvas').waitFor({ timeout: 60000 })
  await cmdUi("ui.setActivePageId('page-1'); ui.emit('fit')")
  await page.waitForTimeout(800)
  await cmdUi("ui.selectGroup(['k1'], ['tx1', 'lg-lb1'], [])")
  await page.waitForTimeout(200)
  const iecSel = ['body:k1', '[data-cmd-text="lg-lb1"]', '[data-cmd-text="tx1"]']
  const iec0 = await rects(iecSel)
  check(!near(iec0.map((r) => r.l), 5), `IEC: os três elementos começam desalinhados (${iec0.map((r) => Math.round(r.l)).join(', ')})`)
  await align('Alinhar à esquerda')
  const iec1 = await rects(iecSel)
  check(near(iec1.map((r) => r.l), 3), `IEC: «Alinhar à esquerda» iguala a margem do corpo do símbolo (a etiqueta K1 acompanha), do título e do texto (${iec1.map((r) => Math.round(r.l)).join(', ')})`)
  check(near(iec1.map((r, i) => r.t - iec0[i].t), 1), 'IEC: alinhar à esquerda não mexe na altura')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(400)
  const iec2 = await rects(iecSel)
  check(iec2.every((r, i) => Math.abs(r.l - iec0[i].l) < 1.5), 'IEC: um só Ctrl+Z repõe os três elementos')
  await cmdUi("ui.selectGroup(['k1'], ['tx1', 'lg-lb1'], [])")
  await align('Distribuir na vertical')
  const iec3 = (await rects(iecSel)).sort((a, b) => a.t - b.t)
  check(Math.abs((iec3[1].t - iec3[0].b) - (iec3[2].t - iec3[1].b)) <= 3, `IEC: «Distribuir na vertical» deixa espaços iguais (${Math.round(iec3[1].t - iec3[0].b)} e ${Math.round(iec3[2].t - iec3[1].b)} px)`)
  await cmdUi("ui.selectGroup(['k1'], [], [])")
  await align('Centrar na vertical')
  check(await page.locator('.dc-cmd-canvas, body').first().evaluate(() => document.body.innerText.includes('Selecione pelo menos 2')), 'IEC: com um só elemento a barra explica que é preciso selecionar 2')

  // ================================================================== GRAFCET: etapas + texto
  await store(`s.loadJSON(JSON.stringify({ app: 'dc-simu', version: 6, components: [], wires: [], projectKind: 'grafcet', grafcet: {
    name: 'G', steps: [
      { id: 'st0', name: '0', initial: true, stepType: 'initial', action: '', condition: '', actions: [], x: 200, y: 120, pinned: true },
      { id: 'st1', name: '1', initial: false, stepType: 'simple', action: '', condition: '', actions: [], x: 320, y: 320, pinned: true },
    ], transitions: [{ id: 'tr1', name: 'T1', from: ['st0'], to: ['st1'], condition: 'I0.0' }],
    comments: [{ id: 'cm1', text: 'NOTA', x: 470, y: 200, fontSize: 14 }] } }))`)
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: 'GRAFCET', exact: true }).click()
  const step0 = page.locator('[data-step-id="st0"]').first(), step1 = page.locator('[data-step-id="st1"]').first(), note = page.locator('[data-grafcet-text="cm1"]')
  await note.waitFor({ timeout: 20000 })
  await page.waitForTimeout(1500)
  await step0.click()
  await page.keyboard.down('Control'); await step1.click(); await note.click(); await page.keyboard.up('Control')
  await page.waitForTimeout(250)
  const gSel = ['[data-step-id="st0"] rect.grafcet-step-box', '[data-step-id="st1"] rect.grafcet-step-box', '[data-grafcet-text="cm1"]']
  await align('Alinhar ao topo')
  const g1 = await rects(gSel)
  check(near(g1.map((r) => r.t), 3), `GRAFCET: «Alinhar ao topo» põe as etapas e o texto à mesma altura (${g1.map((r) => Math.round(r.t)).join(', ')})`)
  const gStore = await store("return s.grafcet.steps.map((x) => x.y).join() + '|' + s.grafcet.comments[0].y")
  await align('Distribuir na horizontal')
  const g2 = (await rects(gSel)).sort((a, b) => a.l - b.l)
  check(Math.abs((g2[1].l - g2[0].r) - (g2[2].l - g2[1].r)) <= 3, `GRAFCET: «Distribuir na horizontal» deixa espaços iguais (${Math.round(g2[1].l - g2[0].r)} e ${Math.round(g2[2].l - g2[1].r)} px)`)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(400)
  check(await store("return s.grafcet.steps.map((x) => x.y).join() + '|' + s.grafcet.comments[0].y") === gStore, 'GRAFCET: Ctrl+Z desfaz só a distribuição (o alinhamento fica)')

  // ================================================================== 3D: textos no painel
  const native = await page.evaluate(async () => { const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts'); return nativePartidaDiretaContent() })
  const t3 = (id, text, x, y) => ({ id, view: 'schematic', text, x, y, z: 0.6, font: 'sans', size: 12, color: '#111', bold: true, align: 'left', createdAt: '2026-01-01' })
  native.canvasTexts = [t3('ta', 'ENTRADAS', -0.8, 1.5), t3('tb', 'SAÍDAS', -0.2, 1.1), t3('tc', 'LEGENDA LONGA', 0.3, 0.9)]
  await store('s.loadJSON(JSON.stringify(arg))', native)
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: '3D Realista', exact: true }).click()
  await page.waitForTimeout(3000)
  const ta = page.locator('[data-ctext="ta"]'), tb = page.locator('[data-ctext="tb"]'), tc = page.locator('[data-ctext="tc"]')
  await tc.waitFor({ timeout: 20000 })
  await ta.click()
  await page.keyboard.down('Control'); await tb.click(); await tc.click(); await page.keyboard.up('Control')
  await page.waitForTimeout(250)
  const tSel = ['[data-ctext="ta"]', '[data-ctext="tb"]', '[data-ctext="tc"]']
  const d0 = await rects(tSel)
  await align('Alinhar à esquerda')
  const d1 = await rects(tSel)
  check(near(d1.map((r) => r.l), 4), `3D: «Alinhar à esquerda» iguala a margem esquerda dos textos no ecrã (${d0.map((r) => Math.round(r.l)).join(', ')} → ${d1.map((r) => Math.round(r.l)).join(', ')})`)
  await align('Centrar na vertical')
  const d2 = await rects(tSel)
  check(near(d2.map((r) => r.cy), 4), `3D: «Centrar na vertical» põe os textos na mesma linha (${d2.map((r) => Math.round(r.cy)).join(', ')})`)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(400)
  const d3 = await rects(tSel)
  check(d3.every((r, i) => Math.abs(r.cy - d1[i].cy) < 2), '3D: Ctrl+Z desfaz o último alinhamento')
  check(errors.length === 0, `sem erros JavaScript (${errors.join(' | ') || 'nenhum'})`)
} finally {
  await browser.close()
}
console.log(`\n${checks} verificações de alinhar e distribuir passaram`)
