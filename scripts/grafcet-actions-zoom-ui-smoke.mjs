import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Conta sintética, contexto descartável, APIs e origens externas bloqueadas.
const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.GRAFCET_TEST_OUTPUT
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch(process.env.GRAFCET_TEST_EXECUTABLE ? { executablePath: process.env.GRAFCET_TEST_EXECUTABLE } : {})
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
await context.route('**/*', route => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  performance.setResourceTimingBufferSize(10000)
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  globalThis.__dcAppImport = modulePath => {
    const hit = performance.getEntriesByType('resource').map(entry => entry.name).filter(url => new URL(url).pathname === modulePath).pop()
    return import(hit || modulePath)
  }
})
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
const action = (id, patch = {}) => ({ id, address: id === 'green' ? 'Q0.0' : 'Q0.1', variable: id, condition: '1', ...patch })
const fixture = () => ({
  steps: [{ id: 's', name: '6', initial: true, pinned: true, x: 180, y: 100, action: '', condition: '', actions: [action('green', { dx: 80, dy: 20, w: 90, h: 40 })] }],
  transitions: [], freeActions: [action('yellow', { x: 490, y: 260, w: 120, h: 36 })],
  comments: [{ id: 'caption', text: 'Máquina a terminar ciclo', x: 250, y: 340, fontSize: 18 }],
})
const emit = name => page.evaluate(async name => { const { useGrafcetUi } = await globalThis.__dcAppImport('/src/grafcet/grafcetBus.ts'); useGrafcetUi.getState().emit(name) }, name)
const tool = name => page.evaluate(async name => { const { useGrafcetUi } = await globalThis.__dcAppImport('/src/grafcet/grafcetBus.ts'); useGrafcetUi.getState().setTool(name) }, name)
const read = () => page.evaluate(async () => { const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts'); return JSON.parse(JSON.stringify(useSimStore.getState().grafcet)) })
const set = async (program = fixture()) => {
  await page.evaluate(async program => { const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts'); useSimStore.getState().setGrafcet(program, 'force') }, program)
  await tool('connect'); await emit('zoomReset')
}
const port = (kind, id, side) => page.locator(`[data-port-kind="${kind}"][data-port-id="${id}"]${side ? `[data-port-side="${side}"]` : ''}`).first()
const center = async locator => { const b = await locator.boundingBox(); assert.ok(b); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
const drag = async (from, to) => {
  const a = await center(from), b = await center(to)
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 14 }); await page.mouse.up()
}
const box = id => page.locator(`.grafcet-pan-layer [data-action-id="${id}"] .grafcet-hover-halo`).evaluate(rect => {
  const b = rect.getBBox(), m = rect.getScreenCTM()
  return { x: b.x * m.a + m.e, y: b.y * m.d + m.f, width: b.width * m.a, height: b.height * m.d }
})
const attached = async () => (await read()).steps[0].actions.find(a => a.id === 'yellow')
const undo = async () => page.evaluate(async () => { const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts'); useSimStore.getState().undo() })
const navigate = async (x, y) => {
  const at = await page.getByRole('img', { name: 'Pré-visualização do GRAFCET real', exact: true }).evaluate((svg, { x, y }) => {
    const p = svg.createSVGPoint(); p.x = x; p.y = y; const at = p.matrixTransform(svg.getScreenCTM()); return { x: at.x, y: at.y }
  }, { x, y })
  await page.mouse.click(at.x, at.y)
}
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Ações e zoom — teste isolado')
  await dialog.getByRole('radio', { name: /^GRAFCET / }).check()
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.locator('.grafcet-canvas').waitFor()
  await set()
  await drag(port('action-in', 'yellow', 'l'), port('action-out', 'green'))
  check((await attached())?.afterActionId === 'green' && (await read()).freeActions.length === 0, 'fio da ação solta até à ação importada liga após essa ação')
  let green = await box('green'), yellow = await box('yellow')
  check(Math.abs(green.x + green.width - yellow.x) < 1 && Math.abs(green.y + green.height / 2 - yellow.y - yellow.height / 2) < 1, 'as caixas ficam lado a lado sem sobreposição, com centros alinhados')
  await undo()
  check((await read()).freeActions.length === 1 && !(await attached()), 'um Desfazer repõe a ação solta e a ligação anterior')
  await set()
  await drag(port('action-out', 'green'), port('action-in', 'yellow', 'l'))
  check((await attached())?.afterActionId === 'green', 'fio no sentido inverso, da ação anexada para a solta, também liga')
  await set()
  await port('action-in', 'yellow', 'l').click(); await port('action-out', 'green').click()
  check((await attached())?.afterActionId === 'green', 'dois cliques nos pontos de ação completam a ligação')
  await set()
  await port('action-out', 'green').focus(); await page.keyboard.press('Enter')
  await port('action-in', 'yellow', 'l').focus(); await page.keyboard.press('Enter')
  check((await attached())?.afterActionId === 'green', 'a ligação entre ações também funciona com teclado')
  await set(); await tool('select')
  await drag(page.locator('[data-action-id="yellow"] .grafcet-hover-halo'), page.locator('[data-action-id="green"] .grafcet-hover-halo'))
  check((await attached())?.afterActionId === 'green', 'arrastar o corpo da ação solta sobre outra ação encaixa-a nessa ação')
  const chained = await read()
  const insert = structuredClone(chained)
  insert.freeActions.push(action('third', { x: 490, y: 260 }))
  await set(insert)
  await drag(port('action-in', 'third', 'l'), port('action-out', 'green'))
  let inserted = (await read()).steps[0].actions
  check(inserted.find(a => a.id === 'third').afterActionId === 'green' && inserted.find(a => a.id === 'yellow').afterActionId === 'third', 'encaixar no meio da cadeia insere a nova ação e conserva a seguinte')
  await port('action-out', 'yellow').focus(); await page.keyboard.press('Enter')
  await port('action-out', 'green').focus(); await page.keyboard.press('Enter')
  inserted = (await read()).steps[0].actions
  check(!inserted.find(a => a.id === 'green').afterActionId && inserted.find(a => a.id === 'third').afterActionId === 'green', 'uma ligação que fecharia um ciclo é recusada sem alterar a cadeia')
  const transfer = fixture()
  transfer.freeActions = []
  transfer.steps.push({ ...transfer.steps[0], id: 'other', name: '8', x: 180, y: 300, initial: false, actions: [action('yellow')] })
  await set(transfer)
  await drag(port('action-out', 'green'), port('action-out', 'yellow'))
  const transferred = await read()
  check(transferred.steps[0].actions.find(a => a.id === 'yellow')?.afterActionId === 'green' && transferred.steps[1].actions.length === 0, 'ligar duas ações anexadas transfere a segunda para a etapa da primeira')
  await set(chained); await tool('select')
  await page.locator('.grafcet-pan-layer [data-action-id="green"] .grafcet-action-box').click()
  await page.locator('.grafcet-pan-layer [data-action-id="green"]').getByRole('button', { name: 'Remover ação', exact: true }).click()
  check((await read()).steps[0].actions.length === 1 && !(await attached()).afterActionId, 'eliminar a ação anterior conserva a seguinte ligada à etapa')
  await undo()
  check((await attached()).afterActionId === 'green', 'Desfazer repõe a ação eliminada e a cadeia')
  chained.steps[0].actions[0].dx += 35; chained.steps[0].actions[0].dy += 45; chained.steps[0].actions[0].w += 60
  await set(chained)
  green = await box('green'); yellow = await box('yellow')
  check(Math.abs(green.x + green.width - yellow.x) < 1 && Math.abs(green.y + green.height / 2 - yellow.y - yellow.height / 2) < 1, 'a ação seguinte acompanha a posição e as dimensões da anterior')
  await set()
  await drag(port('step-action', 's'), port('action-in', 'yellow', 'l'))
  green = await box('green'); yellow = await box('yellow')
  check(yellow.x >= green.x + green.width - 1, 'ligar diretamente à etapa também considera as caixas importadas e evita sobreposição')
  await emit('addAction')
  const program = await read()
  check(program.steps[0].actions.length === 3 && program.steps[0].actions[2].afterActionId === 'yellow', 'adicionar ação à etapa continua após a última caixa existente')

  // Zoom via comandos reais do editor; o SVG deve mudar de resolução física, sem escala CSS.
  await set(chained)
  for (let i = 0; i < 18; i++) await emit('zoomIn')
  const zoom = await page.locator('.grafcet-pan-layer > svg').evaluate(svg => {
    const vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect(), css = getComputedStyle(svg.parentElement)
    return { worldWidth: vb.width, pixelWidth: r.width, scale: r.width / vb.width, transform: css.transform, willChange: css.willChange }
  })
  check(Math.abs(zoom.scale - 5) < 0.01, 'o zoom máximo desenha o SVG com cinco píxeis por unidade do diagrama')
  const matrix = zoom.transform.match(/matrix\(([^)]+)\)/)?.[1].split(',').map(Number)
  check(matrix?.[0] === 1 && matrix?.[3] === 1 && zoom.willChange !== 'transform', 'o zoom não amplia uma camada rasterizada por transformação CSS')
  await navigate(390, 349)
  const caption = await page.locator('.grafcet-pan-layer [data-grafcet-text="caption"] text').boundingBox()
  const canvas = await page.locator('.grafcet-canvas').boundingBox()
  check(caption.x + caption.width > canvas.x && caption.x < canvas.x + canvas.width && caption.y > canvas.y && caption.y < canvas.y + canvas.height, 'o minimapa continua a navegar no diagrama ampliado')
  if (output) await page.screenshot({ path: path.join(output, 'grafcet-zoom-500.png') })
  const downloadPromise = page.waitForEvent('download'); await emit('exportSvg')
  const download = await downloadPromise, chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  const svg = Buffer.concat(chunks).toString('utf8')
  check(svg.includes(`width="${zoom.worldWidth}"`) && svg.includes('Máquina a terminar ciclo'), 'a exportação SVG mantém dimensões do diagrama e texto vetorial independentemente do zoom')
  await emit('zoomReset')
  check(await page.locator('[data-port-kind="action-out"][data-port-id="green"]').count() === 1, 'os pontos de ligação mantêm-se após ampliar, navegar e repor o enquadramento')
  if (output) {
    await page.screenshot({ path: path.join(output, 'grafcet-actions-linked.png') })
  }
  if (process.env.GRAFCET_FLUIDSIM_SAMPLE) {
    const bytes = [...await readFile(process.env.GRAFCET_FLUIDSIM_SAMPLE)]
    const actual = await page.evaluate(async bytes => {
      const { importFluidSim4 } = await globalThis.__dcAppImport('/src/grafcet/fluidSim4.ts')
      return importFluidSim4(new Uint8Array(bytes), 'drawing').program
    }, bytes)
    await set(actual)
    for (let i = 0; i < 22; i++) await emit('zoomIn')
    for (const number of ['5', '6']) {
      const step = actual.steps.find(s => s.name === number), previous = step.actions[0]
      const free = actual.freeActions.find(a => a.variable === (number === '5' ? 'L_Amarela' : 'L_Amarelo'))
      const right = step.x + previous.dx + previous.w
      await navigate((right + free.x) / 2, free.y + (free.h ?? 30) / 2)
      await drag(port('action-in', free.id, 'l'), port('action-out', previous.id))
      const current = await read()
      check(current.steps.find(s => s.id === step.id).actions.find(a => a.id === free.id)?.afterActionId === previous.id, `ATEC: ação amarela liga após a verde na etapa ${number}, a 500%`)
      const a = await box(previous.id), b = await box(free.id)
      check(b.x >= a.x + a.width - 1, `ATEC: caixas da etapa ${number} ficam sem sobreposição`)
      if (output) await page.screenshot({ path: path.join(output, `atec-step-${number}-zoom-500.png`) })
    }
    check((await read()).comments.length === 16 && !!(await read()).importReview, 'as ligações preservam os 16 textos livres e o estado de revisão da importação')
  }
  if (output) await writeFile(path.join(output, 'actions-zoom-report.json'), JSON.stringify({ checks: checks + 1, zoom, errors }, null, 2))
  check(errors.length === 0, 'sem erros JavaScript durante os gestos e o zoom')
  console.log(`${checks} verificações de ações e zoom passaram.`)
} catch (error) {
  if (output) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  throw error
} finally { await browser.close() }
