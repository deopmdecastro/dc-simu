import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseURL = process.env.CANVAS_SCROLL_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.CANVAS_SCROLL_TEST_OUTPUT || path.resolve('../../../runtime/canvas-scrollbars')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ ...(process.env.CANVAS_SCROLL_TEST_EXECUTABLE ? { executablePath: process.env.CANVAS_SCROLL_TEST_EXECUTABLE } : {}), args: ['--enable-unsafe-swiftshader'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', hasTouch: true })
await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort() })
await context.addInitScript(() => {
  performance.setResourceTimingBufferSize(10000)
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  localStorage.setItem('dcsimu:grafcet:palette', '0')
  localStorage.setItem('dcsimu:schematic:sim-open', '0')
  globalThis.__dcAppImport = modulePath => {
    const hit = performance.getEntriesByType('resource').map(entry => entry.name).filter(url => new URL(url).pathname === modulePath).pop()
    return import(hit || modulePath)
  }
})
const page = await context.newPage(), errors = []
page.setDefaultTimeout(60000)
page.on('pageerror', error => errors.push(error.message))
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); console.log('PASS — ' + message); checks++ }
const state = async (fn, arg) => page.evaluate(async ([source, arg]) => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  return Function('store', 'arg', `return (${source})(store,arg)`)(useSimStore, arg)
}, [fn.toString(), arg])
const emit = name => page.evaluate(async name => { const { useGrafcetUi } = await globalThis.__dcAppImport('/src/grafcet/grafcetBus.ts'); useGrafcetUi.getState().emit(name) }, name)
const setTool = name => page.evaluate(async name => { const { useGrafcetUi } = await globalThis.__dcAppImport('/src/grafcet/grafcetBus.ts'); useGrafcetUi.getState().setTool(name) }, name)
const graph = () => state(store => JSON.stringify(store.getState().grafcet))
const rail = (axis, label = 'GRAFCET') => page.getByRole('scrollbar', { name: `Deslocamento ${axis === 'x' ? 'horizontal' : 'vertical'} — ${label}`, exact: true })
const value = async (axis, label) => Number(await rail(axis, label).getAttribute('aria-valuenow'))
const drag = async (axis, delta, label) => {
  const thumb = await rail(axis, label).locator('.canvas-pan-scrollbar-thumb').boundingBox()
  const x = thumb.x + thumb.width / 2, y = thumb.y + thumb.height / 2
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + (axis === 'x' ? delta : 0), y + (axis === 'y' ? delta : 0), { steps: 10 }); await page.mouse.up()
}
const moved = async (axis, before, label = 'GRAFCET') => page.waitForFunction(({ axis, before, label }) => {
  const el = document.querySelector(`[data-canvas-scrollbars="${label}"] [data-scroll-axis="${axis}"]`)
  return el && Math.abs(Number(el.getAttribute('aria-valuenow')) - before) > 0.001
}, { axis, before, label })
const screenshot = name => page.screenshot({ path: path.join(output, name + '.png') })
const fixture = () => ({ steps: [
  { id: 'one', name: '0', initial: true, action: '', condition: '', pinned: true, x: 180, y: 100, actions: [{ id: 'green', address: 'Q0.0', variable: 'Verde', condition: '1', dx: -1800, dy: -1100 }] },
  { id: 'two', name: '1', initial: false, action: '', condition: '', pinned: true, x: 2200, y: 1400, actions: [] },
], transitions: [{ id: 't', from: ['one'], to: ['two'], condition: 'I0.0' }], comments: [{ id: 'note', text: 'Sequência de teste', x: 300, y: 40, fontSize: 20 }], freeActions: [] })
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Barras de deslocamento — isolado')
  await dialog.getByRole('radio', { name: /^GRAFCET / }).check()
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.locator('.grafcet-canvas').waitFor()
  await state((store, program) => store.getState().setGrafcet(program, 'force'), fixture())
  await emit('zoomReset')
  const beforeProgram = await graph()
  check(await rail('x').count() === 1 && await rail('y').count() === 1, 'GRAFCET mostra uma barra de cada eixo dentro do canvas')
  check(Number(await rail('x').getAttribute('aria-valuemin')) < -1620 && Number(await rail('y').getAttribute('aria-valuemin')) < -1000, 'ações anexadas com deslocamento negativo pertencem ao curso das barras')
  for (const axis of ['x', 'y']) {
    const before = await value(axis)
    await drag(axis, 45); await moved(axis, before)
    check(await value(axis) > before, `GRAFCET: arrastar o polegar ${axis === 'x' ? 'horizontal' : 'vertical'} desloca a vista`)
  }
  let before = await value('x')
  await rail('x').focus(); await page.keyboard.press('ArrowLeft'); await moved('x', before)
  check(await value('x') < before, 'GRAFCET: setas do teclado deslocam a vista com foco na barra')
  before = await value('y')
  await rail('y').focus(); await page.keyboard.press('PageDown'); await moved('y', before)
  check(await value('y') > before, 'GRAFCET: PageDown desloca a vista pela barra vertical')
  const scaleBefore = await page.locator('.grafcet-pan-layer > svg').getAttribute('width')
  const r = await rail('x').boundingBox()
  before = await value('x'); await page.mouse.move(r.x + 8, r.y + 6); await page.mouse.wheel(0, 100); await moved('x', before)
  check(await page.locator('.grafcet-pan-layer > svg').getAttribute('width') === scaleBefore, 'roda sobre a barra desloca sem ampliar o GRAFCET')
  const canvas = page.locator('.grafcet-canvas')
  await setTool('pan')
  const area = await canvas.boundingBox(), startX = area.x + area.width / 2, startY = area.y + area.height / 2
  before = await value('x')
  await page.mouse.move(startX, startY); await page.mouse.down(); await page.mouse.move(startX + 42, startY + 20, { steps: 6 }); await page.mouse.up(); await moved('x', before)
  check(await value('x') < before, 'as barras acompanham o deslocamento pela ferramenta mão')
  await emit('zoomIn')
  check(await page.locator('.grafcet-pan-layer > svg').getAttribute('width') !== scaleBefore, 'o zoom continua funcional e atualiza o curso da vista')
  await emit('zoomReset')
  check(await graph() === beforeProgram, 'navegar pelas barras, mão e zoom conserva o programa GRAFCET')
  await screenshot('grafcet-desktop')
  await page.setViewportSize({ width: 390, height: 820 })
  await rail('x').waitFor()
  before = await value('x')
  const thumb = await rail('x').locator('.canvas-pan-scrollbar-thumb').boundingBox()
  const cdp = await context.newCDPSession(page)
  const touchX = thumb.x + thumb.width / 2, touchY = thumb.y + thumb.height / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] })
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX + i * 7, y: touchY }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await moved('x', before)
  check(await value('x') > before && await graph() === beforeProgram, 'toque real arrasta a barra sem iniciar pinça ou editar o desenho')
  const narrow = await canvas.boundingBox(), vr = await rail('y').boundingBox(), hr = await rail('x').boundingBox()
  check(vr.x + vr.width <= narrow.x + narrow.width + 1 && hr.y + hr.height <= narrow.y + narrow.height + 1 && hr.x + hr.width <= vr.x, 'as duas barras cabem no canvas estreito e deixam livre o canto comum')
  await screenshot('grafcet-narrow')
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.goto(baseURL + '/projects/native-partida-direta-v5')
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: 'Esquema', exact: true }).click()
  await page.locator('.panel3d-stage').waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: 'Visualização 3D', exact: true }).click()
  let label = 'Visualização 3D'
  await rail('x', label).waitFor()
  await page.waitForFunction(() => Number(document.querySelector('[data-canvas-scrollbars="Visualização 3D"] [data-scroll-axis="x"]')?.getAttribute('aria-valuemax')) > 0)
  const stored = await state(store => JSON.stringify({ components: store.getState().components, wires: store.getState().wires, grafcet: store.getState().grafcet, history: store.getState().history.length }))
  const hud = await page.locator('.panel3d-axis-hud').innerText()
  for (const axis of ['x', 'y']) {
    before = await value(axis, label); await drag(axis, 35, label); await moved(axis, before, label)
    check(await value(axis, label) > before, `3D frontal: barra ${axis === 'x' ? 'horizontal' : 'vertical'} desloca a câmara`)
  }
  check(await page.locator('.panel3d-axis-hud').innerText() === hud, 'pan pelas barras mantém os ângulos e o zoom da câmara')
  await page.getByRole('button', { name: 'ISO', exact: true }).click()
  await page.waitForFunction(() => Number(document.querySelector('.panel3d-axis-hud strong')?.textContent?.replace('°', '')) > 10)
  before = await value('x', label); await drag('x', -30, label); await moved('x', before, label)
  check(await value('x', label) < before, '3D ISO: barra horizontal desloca no plano do ecrã')
  before = await value('y', label); await rail('y', label).focus(); await page.keyboard.press('ArrowUp'); await moved('y', before, label)
  check(await value('y', label) < before, '3D ISO: teclado da barra vertical desloca a vista')
  const after = await state(store => JSON.stringify({ components: store.getState().components, wires: store.getState().wires, grafcet: store.getState().grafcet, history: store.getState().history.length }))
  check(after === stored, 'deslocar a câmara não altera componentes, ligações, GRAFCET nem histórico')
  await state(store => store.getState().setViewLocked(true))
  before = await value('x', label); await drag('x', 40, label)
  check(await rail('x', label).getAttribute('aria-disabled') === 'true' && Math.abs(await value('x', label) - before) < 0.001, 'Bloquear vista também impede o movimento pelas barras')
  await state(store => store.getState().setViewLocked(false))
  await screenshot('3d-desktop')
  await page.setViewportSize({ width: 390, height: 820 })
  await screenshot('3d-narrow')
  check(await rail('x', label).isVisible() && await rail('y', label).isVisible(), '3D: ambas as barras mantêm-se visíveis na área estreita')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Esquema 2D', exact: true }).click()
  label = 'Esquema 3D frontal'
  check(await rail('x', label).count() === 1 && await rail('y', label).count() === 1, 'o esquema nativo partilhado tem uma única barra por eixo')
  check(errors.length === 0, 'sem erros JavaScript nos percursos GRAFCET e 3D')
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2))
  console.log(`${checks} verificações de barras nos canvas passaram.`)
} catch (error) { await screenshot('failure').catch(() => {}); throw error }
finally { await browser.close() }
