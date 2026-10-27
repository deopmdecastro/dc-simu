import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Contexto descartável, sem API nem publicação. Requer Vite sem HMR pendente.
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
  performance.setResourceTimingBufferSize(5000)
  localStorage.removeItem('dcsimu:supabase:config:v1')
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const check = (value, message) => { assert.ok(value, message); console.log('PASS — ' + message) }
const capture = async (name) => { if (output) await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }) }
const sim = (fn, argument) => page.evaluate(async ({ source, argument }) => {
  const { useSimStore } = await import('/src/store/useSimStore.ts')
  return Function('store', 'argument', 'return (' + source + ')(store, argument)')(useSimStore, argument)
}, { source: fn.toString(), argument })
// O próprio root Fiber fornece a câmara e os alvos para cliques reais no canvas.
const canvasPoint = (kind) => page.evaluate(async (kind) => {
  const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((url) => url.includes('/.vite/deps/@react-three_fiber.js'))
  const { _roots } = await import(url)
  const canvas = document.querySelector('.panel3d-stage canvas')
  const state = _roots.get(canvas).store.getState()
  let target
  state.scene.traverse((object) => {
    if (target) return
    if (kind === 'component' && object.userData.wireSurface && object.__r3f?.handlers.onClick) target = object
    if (kind === 'terminal' && object.__r3f?.handlers.onClick && object.__r3f?.handlers.onPointerOver
      && object.children.some((child) => child.geometry?.type === 'SphereGeometry') && !object.userData.wireSurface) target = object
  })
  if (!target) throw new Error('Alvo de teste não encontrado: ' + kind)
  const p = target.position.clone()
  if (kind === 'component') {
    const mesh = (() => { let first; target.traverse((object) => { if (!first && object.isMesh && object.geometry?.boundingSphere) first = object }); return first })()
    if (mesh) { p.copy(mesh.geometry.boundingSphere.center); mesh.localToWorld(p) }
    else target.getWorldPosition(p)
  } else target.getWorldPosition(p)
  p.project(state.camera)
  const rect = canvas.getBoundingClientRect()
  return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 }
}, kind)
const clickCanvas = async (kind) => { const point = await canvasPoint(kind); await page.mouse.click(point.x, point.y); await page.waitForTimeout(150) }

try {
  if (output) await fs.mkdir(output, { recursive: true })
  await page.goto(baseURL + '/dashboard')
  const entryId = await page.evaluate(async () => {
    const { buildBuiltinDraft } = await import('/src/admin/editor3d/builtinComponents.ts')
    const { catalogApi } = await import('/src/catalog/catalogApi.ts')
    const draft = await buildBuiltinDraft('terminalPhoenixPti6')
    draft.def.terminals[1].name = 'Saída de teste'
    const entry = await catalogApi.save('synthetic-editor3d-review', draft.meta, draft.def)
    return entry.id
  })
  await page.goto(baseURL + '/admin/editor/' + entryId)
  await page.locator('.ce-root canvas').waitFor()
  await page.getByRole('searchbox', { name: 'Pesquisar na hierarquia' }).fill('saida de teste')
  await page.waitForFunction(() => document.querySelectorAll('.ce-left-lists .ce-row-btn').length === 1)
  check(await page.locator('.ce-left-lists .ce-row-btn').count() === 1, 'Pesquisa encontra um borne por nome em toda a hierarquia')
  const terminal = page.locator('.ce-left-lists .ce-row-btn').first()
  await terminal.focus()
  await terminal.press('Enter')
  check(await terminal.evaluate((el) => el.classList.contains('is-active')), 'Enter seleciona o borne pela hierarquia')
  await page.getByRole('searchbox', { name: 'Pesquisar na hierarquia' }).fill('')
  const before = await page.evaluate(async () => (await import('/src/admin/editor3d/editorStore.ts')).useEditorStore.getState().gizmoSpace)
  await page.locator('.ce-root canvas').click({ position: { x: 20, y: 160 } })
  await page.keyboard.press('Control+x')
  const after = await page.evaluate(async () => (await import('/src/admin/editor3d/editorStore.ts')).useEditorStore.getState().gizmoSpace)
  check(before === after, 'Ctrl+X não muda o eixo/modo do gizmo')
  await capture('admin-desktop-after')
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 844 })
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Editor sem overflow horizontal a ' + width + ' px')
    for (const name of ['Biblioteca', 'Guardar rascunho', 'Publicar…']) {
      check(await page.locator('.ce-top').getByRole('button', { name, exact: true }).isVisible(), name + ' acessível a ' + width + ' px')
    }
    check(await page.evaluate(() => {
      const header = document.querySelector('.ce-top').getBoundingClientRect()
      const toolbar = document.querySelector('.ce-ribbon').getBoundingClientRect()
      return header.bottom <= toolbar.top + 1
    }), 'Cabeçalho sem sobrepor a barra de ferramentas a ' + width + ' px')
    await capture('admin-' + width + '-after')
  }
  await page.getByRole('button', { name: 'Objetos', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Pesquisar na hierarquia' }).fill('saida de teste')
  await page.locator('.ce-left-lists .ce-row-btn').first().focus()
  await page.keyboard.press('Enter')
  check(await page.getByRole('button', { name: 'Propriedades', exact: true }).evaluate((el) => el.classList.contains('is-on')), 'Enter abre as propriedades do borne no mobile')
  await capture('admin-mobile-properties-after')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: /(?:Novo|Criar) projeto/i }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Criar novo projeto' })
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Revisão sintética do esquema 3D')
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.getByRole('tablist', { name: 'Vistas' }).waitFor()
  await page.getByRole('button', { name: 'Visualização 3D', exact: true }).click()
  await page.locator('.panel3d-stage canvas').waitFor()
  await page.evaluate(async () => {
    const { createComponent } = await import('/src/electrical/factory.ts')
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const c = createComponent('breaker1p')
    useSimStore.setState({ components: [c], wires: [], tool: 'select', selectedComponentIds: [c.id] })
  })
  await page.getByRole('button', { name: 'Enquadrar seleção', exact: true }).click()
  await page.waitForTimeout(1000)
  check(await page.locator('.panel3d-stage').getAttribute('data-operating') === 'false', 'Seleção inicia sem manobrar os equipamentos')
  const closed = await sim((store) => store.getState().components[0].state.closed)
  await clickCanvas('component')
  check(await sim((store) => store.getState().components[0].state.closed) === closed, 'Clique de seleção mantém o estado do disjuntor')
  check(await page.getByRole('button', { name: 'Manobrar controlos', exact: true }).count() === 0, 'Não existe botão Manobrar: só a simulação aciona os equipamentos')
  // «Manobrar» deixou de ser um interruptor do painel: os equipamentos acionam-se
  // quando a simulação está a correr (RUN). O teste acompanha esse modelo.
  await page.evaluate(async () => { const { useSimUi } = await import('/src/ui/simUi.ts'); useSimUi.setState({ schematic: true }) })
  await sim((store) => store.getState().play())
  await page.waitForTimeout(300)
  check(await page.locator('.panel3d-stage').getAttribute('data-operating') === 'true', 'Simulação ativa permite manobrar')
  await clickCanvas('component')
  check(await sim((store) => store.getState().components[0].state.closed) !== closed, 'Simulação permite acionar o disjuntor pelo canvas')
  await sim((store) => store.getState().stop())
  await page.evaluate(async () => { const { useSimUi } = await import('/src/ui/simUi.ts'); useSimUi.setState({ schematic: false }) })
  await page.waitForTimeout(300)
  check(await page.locator('.panel3d-stage').getAttribute('data-operating') === 'false', 'Sair da simulação volta a seleção')
  await sim((store) => { const s = store.getState(); store.setState({ components: s.components.map((c) => ({ ...c, locked: true })), selectedComponentIds: s.components.map((c) => c.id) }) })
  await page.keyboard.press('Delete')
  check(await sim((store) => store.getState().components.length) === 1, 'Delete mantém os componentes bloqueados')
  await sim((store) => { const s = store.getState(); store.setState({ components: s.components.map((c) => ({ ...c, locked: false })) }); s.setTool('erase') })
  await clickCanvas('component')
  check(await sim((store) => store.getState().components.length) === 0, 'Ferramenta Apagar elimina pelo canvas')
  await page.keyboard.press('Control+z')
  check(await sim((store) => store.getState().components.length) === 1, 'Ctrl+Z recupera o equipamento eliminado')
  await sim((store) => store.getState().setTool('probe'))
  await page.keyboard.press('Numpad7')
  await page.waitForTimeout(750)
  check(await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((url) => url.includes('/.vite/deps/@react-three_fiber.js'))
    const { _roots } = await import(url)
    const state = _roots.get(document.querySelector('.panel3d-stage canvas')).store.getState()
    const direction = state.camera.position.clone().sub(state.controls.target).normalize()
    return direction.y > 0.98
  }), 'Numpad7 escolhe a vista superior com NumLock desligado')
  await page.getByRole('button', { name: 'Vista superior', exact: true }).click({ force: true })
  await page.waitForTimeout(750)
  await clickCanvas('terminal')
  check(Boolean(await sim((store) => store.getState().probeA)), 'Sonda aceita o primeiro borne no canvas 3D')
  await page.keyboard.press('Escape')
  await page.evaluate(async () => {
    const { createComponent } = await import('/src/electrical/factory.ts')
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const a = createComponent('breaker1p', 'QA', '', 0, 300, 600)
    const b = createComponent('breaker3p', 'QB', '', 1, 1500, 500)
    useSimStore.setState({ components: [a, b], wires: [], tool: 'select', selectedComponentIds: [a.id, b.id] })
  })
  await page.getByRole('button', { name: 'Vista frente', exact: true }).click({ force: true })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Enquadrar seleção', exact: true }).click()
  await page.waitForTimeout(750)
  check(await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((url) => url.includes('/.vite/deps/@react-three_fiber.js'))
    const { _roots } = await import(url)
    const state = _roots.get(document.querySelector('.panel3d-stage canvas')).store.getState()
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const { componentPanelXY } = await import('/src/three/panelLayout.ts')
    const { componentHalfExtents } = await import('/src/three/panelBounds.ts')
    return useSimStore.getState().components.every((component) => {
      const center = componentPanelXY(component), half = componentHalfExtents(component)
      return [-1, 1].every((x) => [-1, 1].every((y) => [-1, 1].every((z) => {
        const p = state.camera.position.clone().set(center.x + x * half.x, center.y + y * half.y, z * half.z).project(state.camera)
        return Math.abs(p.x) < 1 && Math.abs(p.y) < 1
      })))
    })
  }), 'Enquadrar inclui o volume dos dois componentes afastados')
  await capture('panel-desktop-after')
  await page.setViewportSize({ width: 390, height: 844 })
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Esquema 3D sem overflow horizontal a 390 px')
  check(await page.getByRole('region', { name: 'Contexto da ferramenta 3D' }).isVisible(), 'Contexto da ferramenta acessível no esquema mobile')
  await capture('panel-mobile-after')
  assert.deepEqual(errors, [], 'Exceções JavaScript nos editores')
  console.log('PASS — Percursos dos dois editores e nenhuma exceção JavaScript')
} catch (error) {
  await capture('ux-failure')
  console.log('Exceções da página:', errors)
  throw error
} finally { await browser.close() }
