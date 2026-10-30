import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Fresh browser + blocked API/network: no account/project data leaves this test.
const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.GRAFCET_TEST_OUTPUT
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch(process.env.GRAFCET_TEST_EXECUTABLE
  ? { executablePath: process.env.GRAFCET_TEST_EXECUTABLE }
  : process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  performance.setResourceTimingBufferSize(10000)
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  localStorage.removeItem('dcsimu:supabase:config:v1')
// O Vite (com HMR) serve módulos alterados com «?t=…»: um import('/src/…') sem esse sufixo criava
// OUTRA instância da store e os dados de teste iam para uma store que a página não usa. Importa o módulo
// exatamente com o URL que a aplicação carregou.
globalThis.__dcAppImport = (path) => {
  const hit = performance.getEntriesByType('resource').map((entry) => entry.name)
    .filter((url) => { try { return new URL(url).pathname === path } catch { return false } }).pop()
  return import(hit || path)
}
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
let checks = 0
const check = (value, message) => { assert.ok(value, message); console.log(`PASS — ${message}`); checks++ }
const step = (id, name, x, y, initial = false) => ({ id, name, x, y, pinned: true, initial, action: '', condition: '', actions: [] })
const fixture = () => ({ steps: [step('a', '1', 180, 100, true), step('b', '2', 180, 400), step('c', '3', 500, 400)], transitions: [{ id: 't1', name: 'T1', from: ['a'], to: ['b'], condition: 'I1' }], comments: [], freeActions: [] })
const read = () => page.evaluate(async () => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  return JSON.parse(JSON.stringify(useSimStore.getState().grafcet))
})
const chooseImportFile = async (file, mode = 'strict') => {
  const direct = page.getByRole('button', { name: /^Importar GRAFCET: FluidSIM 4/ })
  if (await direct.isVisible()) {
    await direct.click()
  } else {
    // A barra compacta (larguras em que nem tudo cabe) guarda a importação em «Mais GRAFCET» ou em «Mais».
    const grafcetMenu = page.getByRole('button', { name: /Mais GRAFCET/ })
    if (await grafcetMenu.isVisible()) {
      await grafcetMenu.click()
      await page.locator('[data-tm-item="import-grafcet"]').click()
    } else {
      // Mesmo pedido que o item de menu emite (o menu compacto varia com a largura da barra).
      await page.evaluate(async () => { const { useGrafcetUi } = await globalThis.__dcAppImport('/src/grafcet/grafcetBus.ts'); useGrafcetUi.getState().emit('importJson') })
    }
  }
  const input = page.locator('input[type="file"][accept*=".ct"]').first()
  await input.waitFor({ state: 'attached' })
  if (mode === 'drawing') await page.locator('input[name="fluidsim-import-mode"][value="drawing"]').check()
  await input.setInputFiles(file)
}
const set = (program = fixture()) => page.evaluate(async (program) => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  const { useGrafcetUi } = await globalThis.__dcAppImport('/src/grafcet/grafcetBus.ts')
  useSimStore.getState().setGrafcet(program, 'force')
  useGrafcetUi.getState().setTool('connect')
}, program)
const port = (kind, id) => page.locator(`[data-port-kind="${kind}"][data-port-id="${id}"]`).first()
const middle = async (locator) => { const b = await locator.boundingBox(); assert.ok(b); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
const drag = async (from, to) => {
  const a = await middle(from), b = await middle(to)
  await page.mouse.move(a.x, a.y); await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up()
}
const wait = (predicate) => page.waitForFunction(predicate)
const undo = async () => { await page.locator('.grafcet-canvas').click({ position: { x: 20, y: 80 } }); await page.keyboard.press('Control+z') }
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Construção GRAFCET — isolado')
  await create.getByRole('radio', { name: /^GRAFCET / }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.locator('.grafcet-canvas').waitFor()
  await set()
  await drag(port('step-out', 'c'), port('trans-in', 't1'))
  let program = await read()
  check(program.transitions.length === 1 && program.transitions[0].from.includes('c'), 'arrastar etapa para uma transição já completa acrescenta a origem sem criar outra transição')
  await undo()
  check((await read()).transitions[0].from.length === 1, 'uma operação Desfazer repõe a ligação anterior')

  await set()
  await drag(port('trans-in', 't1'), port('step-out', 'c'))
  check((await read()).transitions[0].from.includes('c'), 'o arrasto inverso da entrada da transição até uma saída de etapa também liga')
  await set()
  await drag(port('trans-out', 't1'), port('step-in', 'c'))
  check((await read()).transitions[0].to.includes('c'), 'a saída de uma transição completa liga outro destino diretamente')

  await set()
  await port('step-out', 'b').click()
  check(await page.locator('.grafcet-wire-draft').count() === 1, 'um clique mantém o fio armado para ligar por dois cliques')
  await port('step-in', 'c').click()
  program = await read()
  check(program.transitions.length === 2 && program.transitions[1].from[0] === 'b' && program.transitions[1].to[0] === 'c', 'dois cliques criam a transição entre as etapas escolhidas')
  await set()
  await port('step-out', 'b').focus(); await page.keyboard.press('Enter')
  await port('step-in', 'c').focus(); await page.keyboard.press('Enter')
  check((await read()).transitions.length === 2, 'os pontos de ligação também funcionam com teclado')

  await set()
  const a = await middle(port('step-out', 'b')), c = await middle(port('step-in', 'c'))
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(c.x, c.y, { steps: 8 })
  await page.keyboard.press('Escape'); await page.mouse.up()
  check((await read()).transitions.length === 1 && await page.locator('.grafcet-wire-draft').count() === 0, 'Escape cancela o arrasto sem alterar o diagrama')

  await set()
  await page.evaluate(async () => { const { useGrafcetUi } = await globalThis.__dcAppImport('/src/grafcet/grafcetBus.ts'); useGrafcetUi.getState().setTool('select') })
  const segment = page.locator('.grafcet-editable-segment').first()
  const bounds = await segment.boundingBox(); assert.ok(bounds)
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 4)
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 55, bounds.y + bounds.height / 4 + 25, { steps: 10 }); await page.mouse.up()
  program = await read()
  check(program.linkBends?.t1?.length >= 1, 'arrastar a linha cria uma dobra persistente')
  await undo()
  check(!(await read()).linkBends?.t1?.length, 'Desfazer remove a dobra criada num único gesto')

  const importedBends = { ...fixture(), transitions: [{ ...fixture().transitions[0], condition: 'G0 <> X9 * /1Hz' }], linkBends: { t1: [{ x: 300, y: 240 }] } }
  await set(importedBends)
  await page.evaluate(async () => { const { useGrafcetUi } = await globalThis.__dcAppImport('/src/grafcet/grafcetBus.ts'); useGrafcetUi.getState().setTool('select') })
  const conditionChecks = await page.evaluate(async () => {
    const { validCondition } = await globalThis.__dcAppImport('/src/grafcet/engine.ts')
    return { crossChart: validCondition('G0 <> X9'), negatedClock: validCondition('/1Hz') }
  })
  check(conditionChecks.crossChart && conditionChecks.negatedClock, 'o browser reconhece G0 <> X9 e a condição negada /1Hz')
  check((await page.locator('.grafcet-graph-link').first().textContent()).includes('G0 <> X9'), 'o desenho mantém a referência G0 <> X9 ao apresentar /1Hz')
  const negated = page.locator('.grafcet-graph-link tspan[style*="overline"]').filter({ hasText: '1Hz' }).first()
  check(await negated.count() > 0, 'a condição negada /1Hz mantém a sobrelinha no diagrama')
  await set({ ...importedBends, transitions: [{ ...importedBends.transitions[0], condition: 'I1' }] })
  await page.evaluate(async () => { const { useGrafcetUi } = await globalThis.__dcAppImport('/src/grafcet/grafcetBus.ts'); useGrafcetUi.getState().setTool('select') })
  const transitionBar = page.locator('.grafcet-transition-bar').first()
  const barPoint = await transitionBar.evaluate((line) => {
    const matrix = line.getScreenCTM(), svg = line.ownerSVGElement
    const point = svg.createSVGPoint(); point.x = (Number(line.getAttribute('x1')) + Number(line.getAttribute('x2'))) / 2; point.y = Number(line.getAttribute('y1'))
    const screen = point.matrixTransform(matrix)
    const path = svg.querySelector('.grafcet-editable-segment')
    const length = path.getTotalLength()
    let nearest = { distance: Infinity, at: 0 }
    for (let i = 0; i <= 100; i++) {
      const at = length * i / 100, candidate = path.getPointAtLength(at)
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y)
      if (distance < nearest.distance) nearest = { distance, at }
    }
    const before = path.getPointAtLength(Math.max(0, nearest.at - 1)), after = path.getPointAtLength(Math.min(length, nearest.at + 1))
    return { x: screen.x, y: screen.y, moveX: Math.abs(after.x - before.x) < 1 }
  })
  const barHitTarget = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y)
    return target?.getAttribute('class') || target?.nodeName
  }, barPoint)
  check(barHitTarget === 'grafcet-transition-bar', 'a barra visível da transição recebe o gesto do rato')
  const bendsBeforeBarDrag = JSON.stringify((await read()).linkBends.t1)
  await page.mouse.move(barPoint.x, barPoint.y); await page.mouse.down(); await page.mouse.move(barPoint.x + (barPoint.moveX ? 48 : 0), barPoint.y + (barPoint.moveX ? 0 : 48), { steps: 8 }); await page.mouse.up()
  check(JSON.stringify((await read()).linkBends.t1) !== bendsBeforeBarDrag, 'arrastar a barra visível move a ligação importada e persiste linkBends')
  const bendsBeforeAddButton = (await read()).linkBends.t1.length
  const nodeButton = page.getByRole('button', { name: 'Adicionar nó à ligação da transição T1', exact: true })
  await nodeButton.click()
  check((await read()).linkBends?.t1?.length === bendsBeforeAddButton + 1, 'o botão Adicionar nó cria e persiste uma nova dobra na ligação importada')
  const bendHandle = page.locator('[aria-label^="Ponto de quebra"]').first()
  const bendBounds = await bendHandle.boundingBox(); assert.ok(bendBounds)
  const bendsBeforeHandleDrag = JSON.stringify((await read()).linkBends.t1)
  await page.mouse.move(bendBounds.x + bendBounds.width / 2, bendBounds.y + bendBounds.height / 2)
  await page.mouse.down(); await page.mouse.move(bendBounds.x + bendBounds.width / 2 + 44, bendBounds.y + bendBounds.height / 2 + 22, { steps: 8 }); await page.mouse.up()
  check(JSON.stringify((await read()).linkBends.t1) !== bendsBeforeHandleDrag, 'o nó criado pode ser arrastado e a nova posição fica em linkBends')
  const savedBends = JSON.stringify((await read()).linkBends.t1)
  if (output) await page.screenshot({ path: path.join(output, 'grafcet-add-link-node-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  const collapseTools = page.getByRole('button', { name: /Recolher ferramentas/ })
  if (await collapseTools.isVisible()) await collapseTools.click()
  if (output) await page.locator('.grafcet-canvas svg[aria-label="Etapas, ações e transições do GRAFCET"]').screenshot({ path: path.join(output, 'grafcet-add-link-node-mobile.png') })
  await page.setViewportSize({ width: 1440, height: 900 })
  const restoredBends = await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const store = useSimStore.getState()
    const name = 'GRAFCET line-node browser smoke'
    return store.saveProjectAs(name) && store.loadProjectByName(name) ? useSimStore.getState().grafcet.linkBends?.t1 : null
  })
  check(JSON.stringify(restoredBends) === savedBends, 'guardar e reabrir o projeto conserva o nó e a posição arrastada')

  const cycle = fixture()
  cycle.steps.find((item) => item.id === 'c').x = 180
  cycle.transitions.push({ id: 't3', name: 'T3', from: ['c'], to: ['a'], condition: 'I3' })
  await set(cycle)
  await page.evaluate(async () => { const { useGrafcetUi } = await globalThis.__dcAppImport('/src/grafcet/grafcetBus.ts'); useGrafcetUi.getState().setTool('select') })
  const returnSegment = page.locator('.grafcet-editable-segment').nth(1)
  const returnPoint = await returnSegment.evaluate((element) => {
    const path = element
    const point = path.getPointAtLength(path.getTotalLength() * 0.6)
    const screen = path.ownerSVGElement.createSVGPoint()
    screen.x = point.x; screen.y = point.y
    const result = screen.matrixTransform(path.getScreenCTM())
    return { x: result.x, y: result.y }
  })
  const returnBefore = await returnSegment.getAttribute('d')
  // x do troço vertical antes do arrasto (independente do zoom/enquadramento).
  const verticalX = (d) => { const pts = d.replace('M ', '').split(' L ').map((p) => p.split(' ').map(Number)); const seg = pts.findIndex((p, i) => i && p[0] === pts[i - 1][0] && Math.abs(p[1] - pts[i - 1][1]) > 200); return seg > 0 ? pts[seg][0] : NaN }
  await page.mouse.move(returnPoint.x, returnPoint.y)
  await page.mouse.down()
  await page.mouse.move(returnPoint.x + 42, returnPoint.y + 28, { steps: 8 })
  await page.mouse.up()
  program = await read()
  const returnPath = await returnSegment.getAttribute('d')
  check(program.linkBends?.t3?.length > 1 && returnPath?.startsWith('M 180 454') && returnPath.endsWith('180 100') && verticalX(returnPath) > verticalX(returnBefore) && returnPath.split(' L ').slice(1).every((seg, i, all) => { const [x, y] = seg.split(' ').map(Number); const [px, py] = (i ? all[i - 1] : returnPath.split(' L ')[0].replace('M ', '')).split(' ').map(Number); return x === px || y === py }), 'arrastar a linha de retorno desliza o troço, mantém ângulos retos e as ligações às duas etapas')
  if (output) await page.screenshot({ path: path.join(output, 'construction-return-link-drag.png') })

  await set()
  await page.locator('.grafcet-graph-link').first().locator('text').first().click()
  await port('branch-out', 't1').waitFor()
  await drag(port('branch-out', 't1'), port('step-in', 'c'))
  program = await read()
  check(program.transitions.length === 2 && program.transitions.every((t) => t.from[0] === 'a') && program.transitions[1].to[0] === 'c', 'um nó de derivação cria um ramo OR real com a origem comum')
  check(program.transitions.every((t) => t.branchType === 'or-divergence') && program.transitions.every((t) => program.linkBends[t.id]?.length), 'o ramo guarda a derivação e o traçado comum para reabrir o projeto')
  if (output) await page.screenshot({ path: path.join(output, 'construction-branches-desktop.png') })

  await set({ ...fixture(), charts: [{ id: 'p1', name: 'Página 1', title: 'Página 1' }, { id: 'p2', name: 'Página 2', title: 'Página 2' }], activeChart: 'p1' })
  const previous = JSON.stringify(await read())
  await chooseImportFile({ name: 'invalido.json', mimeType: 'application/json', buffer: Buffer.from('{"steps":[null]}') })
  await page.locator('.grafcet-toast').waitFor()
  check(JSON.stringify(await read()) === previous, 'uma importação inválida preserva o programa atual')
  const imported = { steps: [step('imported', '9', 200, 100, true)], transitions: [], comments: [], freeActions: [] }
  const payload = { name: 'programa.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) }
  await chooseImportFile(payload)
  await page.getByRole('alertdialog', { name: 'Importar GRAFCET' }).waitFor()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  check(JSON.stringify(await read()) === previous, 'cancelar a confirmação conserva as páginas e o diagrama')
  await chooseImportFile(payload)
  await page.getByRole('button', { name: 'Importar', exact: true }).click()
  await wait(() => document.querySelector('[data-port-id="imported"]') !== null)
  check((await read()).steps.length === 1 && !(await read()).charts?.length, 'confirmar substitui o programa inteiro sem conservar páginas antigas')
  await undo()
  check((await read()).steps.length === 3 && (await read()).charts.length === 2, 'Desfazer restaura também as páginas anteriores à importação')

  if (process.env.GRAFCET_FLUIDSIM_SAMPLE) {
    const expectedSteps = Number(process.env.GRAFCET_EXPECT_STEPS) || 5
    const expectedTransitions = Number(process.env.GRAFCET_EXPECT_TRANSITIONS) || 7
    const sample = await readFile(process.env.GRAFCET_FLUIDSIM_SAMPLE)
    const drawing = process.env.GRAFCET_FLUIDSIM_MODE === 'drawing'
    await chooseImportFile({ name: path.basename(process.env.GRAFCET_FLUIDSIM_SAMPLE), mimeType: 'application/octet-stream', buffer: sample }, drawing ? 'drawing' : 'strict')
    await page.getByRole('alertdialog', { name: 'Importar GRAFCET' }).waitFor()
    check((await page.getByRole('alertdialog').textContent()).includes(`${expectedSteps} etapas`), 'a confirmação do CT real apresenta as etapas recuperadas')
    await page.getByRole('button', { name: 'Importar', exact: true }).click()
    await page.waitForFunction((count) => document.querySelectorAll('.grafcet-graph-node').length === count, expectedSteps)
    program = await read()
    check(program.steps.length === expectedSteps && program.transitions.length === expectedTransitions, 'o exemplo FluidSIM fornecido importa através do seletor real')
    if (drawing) {
      const expectedTexts = Number(process.env.GRAFCET_EXPECT_TEXTS)
      check(!!program.importReview && program.comments.length === expectedTexts && await page.locator('.grafcet-pan-layer > svg [data-grafcet-text]').count() === expectedTexts, 'os textos do CT são elementos de texto livres e o desenho mantém a revisão pendente')
      await page.evaluate(async () => { const { useGrafcetUi } = await globalThis.__dcAppImport('/src/grafcet/grafcetBus.ts'); useGrafcetUi.getState().setTool('select') })
      if (output) await page.screenshot({ path: path.join(output, 'atec-before-text-edit.png') })
      const first = program.comments[0]
      const text = page.locator(`.grafcet-pan-layer > svg [data-grafcet-text="${first.id}"]`)
      await text.locator('rect').dblclick({ force: true })
      const editor = page.getByRole('textbox', { name: 'Editar texto do GRAFCET' })
      await editor.fill(first.text + ' (revisto)')
      await editor.press('Control+Enter')
      check((await read()).comments.find(c => c.id === first.id).text === first.text + ' (revisto)', 'o texto importado pode ser editado no próprio GRAFCET')
      await undo()
      check((await read()).comments.find(c => c.id === first.id).text === first.text, 'Desfazer repõe o texto original')
      await page.locator('summary').filter({ hasText: 'Desenho importado para revisão' }).click()
      await page.getByRole('button', { name: 'Concluir revisão', exact: true }).click()
      const review = page.getByRole('alertdialog', { name: 'Revisão da importação' })
      await review.waitFor()
      check((await review.textContent()).includes('Corrija os pontos indicados'), 'a conclusão da revisão identifica os pontos ainda por corrigir')
      await review.getByRole('button', { name: 'Voltar ao desenho', exact: true }).click()
      check(!!(await read()).importReview, 'o exemplo incompleto mantém-se como rascunho após a revisão')
      program = await read()
      if (output) await writeFile(path.join(output, 'Grafcet-ATEC.grafcet'), JSON.stringify(program, null, 2))
      await chooseImportFile({ name: 'desenho.grafcet', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(program)) })
      await page.getByRole('alertdialog', { name: 'Importar GRAFCET' }).waitFor()
      await page.getByRole('button', { name: 'Importar', exact: true }).click()
      await page.waitForFunction(count => document.querySelectorAll('.grafcet-pan-layer > svg [data-grafcet-text]').length === count, expectedTexts)
      const reopened = await read()
      check(JSON.stringify(reopened.comments) === JSON.stringify(program.comments) && !!reopened.importReview, 'reabrir o .grafcet mantém todos os textos e a revisão pendente')
      await page.locator('summary').filter({ hasText: 'Desenho importado para revisão' }).click()
    }
    if (output) await page.screenshot({ path: path.join(output, 'fluidsim-import-canvas.png') })
  }
  check(errors.length === 0, `sem erros JavaScript: ${errors.join('; ')}`)
  console.log(`${checks} verificações de construção/importação passaram`)
} finally {
  if (output) await page.screenshot({ path: path.join(output, 'construction-final-state.png') }).catch(() => {})
  if (output && errors.length) await page.screenshot({ path: path.join(output, 'construction-error.png') })
  await context.close(); await browser.close()
}
