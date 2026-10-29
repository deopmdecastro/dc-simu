import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseURL = process.env.LOGO_EDITOR_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.LOGO_EDITOR_TEST_OUTPUT
const browser = await chromium.launch({
  ...(process.env.LOGO_EDITOR_TEST_CHANNEL ? { channel: process.env.LOGO_EDITOR_TEST_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
})
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
const page = await context.newPage(), errors = []
page.on('pageerror', (error) => errors.push(error.message))
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++; console.log('PASS — ' + message) }
const capture = async (name) => { if (output) await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }) }
const read = () => page.evaluate(async () => {
  const s = (await import('/src/admin/editor3d/editorStore.ts')).useEditorStore.getState()
  return { controls: s.def.controls?.length, displays: s.def.displays?.length, terminals: s.def.terminals.map((t) => t.id), selection: s.selection, tab: s.tab, vars: s.previewVars, parts: s.def.parts, dirty: s.dirty }
})
const pickCanvas = async (kind, name) => {
  const point = await page.evaluate(async ({ kind, name }) => {
    const { useEditorStore } = await import('/src/admin/editor3d/editorStore.ts')
    const def = useEditorStore.getState().def
    const target = kind === 'display' ? def.displays.find((item) => item.name === name) : def.controls.find((item) => item.name === name)
    const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((url) => url.includes('/.vite/deps/@react-three_fiber.js'))
    const { _roots } = await import(url)
    const canvas = document.querySelector('.ce-root canvas'), state = _roots.get(canvas).store.getState()
    const mesh = state.scene.getObjectByName((kind === 'display' ? 'display:' : 'hit:') + target.id)
    if (!mesh) throw new Error('Alvo ausente: ' + name)
    const point = mesh.getWorldPosition(mesh.position.clone()).project(state.camera), rect = canvas.getBoundingClientRect()
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
  }, { kind, name })
  await page.mouse.click(point.x, point.y)
  await page.waitForTimeout(80)
}
try {
  if (output) await fs.mkdir(output, { recursive: true })
  await page.goto(baseURL + '/dashboard')
  const originalIds = await page.evaluate(async () => {
    const { buildBuiltinDraft } = await import('/src/admin/editor3d/builtinComponents.ts')
    const { catalogApi } = await import('/src/catalog/catalogApi.ts')
    const { def, meta } = await buildBuiltinDraft('plcSiemensLogo1224RC')
    // Rascunho anterior à introdução de LCD/teclas; só no armazenamento descartável.
    def.controls = []; def.displays = []; def.vars = []; delete def.builtinSeeds
    await catalogApi.save('synthetic-logo-editor-ui', meta, def)
    return def.terminals.map((item) => item.id)
  })
  await page.goto(baseURL + '/admin/editor/synthetic-logo-editor-ui')
  const hierarchy = page.getByRole('complementary', { name: 'Hierarquia', exact: true })
  await hierarchy.getByRole('button', { name: 'LCD LOGO! Texto', exact: true }).waitFor()
  const migrated = await read()
  check(migrated.controls === 6 && migrated.displays === 1, 'Abrir o PLC antigo acrescenta seis teclas e o LCD')
  check(JSON.stringify(migrated.terminals) === JSON.stringify(originalIds), 'Migração conserva os 19 IDs dos bornes')
  const longPartName = 'Motor SEW DRN80MK4/B3 — modelo de ensaio com nome extenso'
  await page.evaluate(async (name) => {
    const { useEditorStore } = await import('/src/admin/editor3d/editorStore.ts')
    useEditorStore.getState().edit((def) => ({
      ...def,
      parts: def.parts.map((part, index) => index === 0 ? { ...part, name } : part),
    }))
  }, longPartName)
  const firstPart = hierarchy.getByRole('treeitem').first()
  await firstPart.hover()
  check(await firstPart.getAttribute('aria-label') === longPartName, 'Nome completo da peça está disponível para tecnologias de apoio')
  check(await firstPart.locator('.ce-row-name').evaluate((element) => getComputedStyle(element).whiteSpace === 'normal'), 'Nome longo expande na hierarquia ao passar o rato')
  await firstPart.focus()
  check(await firstPart.locator('.ce-row-name').evaluate((element) => getComputedStyle(element).whiteSpace === 'normal'), 'Nome longo expande quando a peça recebe foco de teclado')
  await firstPart.click()
  check(await firstPart.evaluate((element) => element.classList.contains('is-active')) && await firstPart.locator('.ce-row-name').evaluate((element) => getComputedStyle(element).whiteSpace === 'normal'), 'Nome da peça selecionada permanece legível')
  check(await hierarchy.getByRole('button', { name: 'Tecla OK', exact: true }).isVisible(), 'Teclas descobertas antes de percorrer a lista dos bornes')
  const lcdBox = await hierarchy.getByRole('region', { name: 'LCDs e ecrãs', exact: true }).boundingBox()
  const terminalsBox = await hierarchy.getByRole('region', { name: 'Bornes', exact: true }).boundingBox()
  check(lcdBox.y < terminalsBox.y, 'LCD aparece acima dos 19 bornes')
  await hierarchy.getByRole('button', { name: 'LCD LOGO! Texto', exact: true }).click()
  check(await page.getByRole('tab', { name: 'Ecrãs', exact: true }).getAttribute('aria-selected') === 'true', 'Selecionar LCD abre automaticamente as propriedades de Ecrãs')
  await capture('logo-desktop-lcd')
  await hierarchy.getByRole('button', { name: /^Controlos 6$/ }).click()
  check(await hierarchy.getByRole('region', { name: 'Bornes', exact: true }).count() === 0, 'Filtro Controlos isola as seis teclas')
  await hierarchy.getByRole('button', { name: 'Tecla OK', exact: true }).click()
  check(await page.getByRole('tab', { name: 'Botões', exact: true }).getAttribute('aria-selected') === 'true', 'Selecionar tecla abre Botões e a sua área de clique')
  check(await page.getByText('Área de clique', { exact: true }).isVisible(), 'Área de clique individual pode ser editada no inspetor')
  await hierarchy.getByRole('searchbox', { name: 'Pesquisar na hierarquia' }).fill('ESC')
  check(await hierarchy.getByRole('button', { name: 'Tecla ESC', exact: true }).isVisible(), 'Pesquisa encontra teclas pelo nome')
  await hierarchy.getByRole('searchbox', { name: 'Pesquisar na hierarquia' }).press('Escape')
  await hierarchy.getByRole('button', { name: /^Todos 27$/ }).click()
  const separator = page.getByRole('separator', { name: 'Largura da hierarquia' })
  const stageWidthBeforeCollapse = (await page.locator('.ce-stage').boundingBox()).width
  await hierarchy.getByRole('button', { name: 'Recolher hierarquia' }).click()
  await page.waitForTimeout(220)
  check(await page.locator('.ce-body').evaluate((element) => element.classList.contains('is-left-collapsed')), 'Hierarquia pode ser recolhida para dar espaço ao canvas')
  check((await page.locator('.ce-stage').boundingBox()).width > stageWidthBeforeCollapse, 'Recolher a hierarquia aumenta a largura do canvas')
  check(await hierarchy.getByRole('button', { name: 'Expandir hierarquia' }).isVisible(), 'Hierarquia recolhida mantém controlo visível para reabrir')
  const collapsedLabel = hierarchy.locator('.dc-side-panel-collapsed-label, .ce-collapsed-label').first()
  check(await collapsedLabel.isVisible() && (await collapsedLabel.innerText()).includes('Elementos'), 'Calha recolhida identifica a hierarquia como Elementos')
  check(await collapsedLabel.evaluate((element) => getComputedStyle(element).writingMode === 'vertical-rl'), 'Rótulo Elementos cabe na calha estreita sem ser cortado')
  await capture('hierarchy-collapsed')
  await hierarchy.getByRole('button', { name: 'Expandir hierarquia' }).focus()
  await page.keyboard.press('Enter')
  check(!(await page.locator('.ce-body').evaluate((element) => element.classList.contains('is-left-collapsed'))), 'Hierarquia pode ser reaberta pelo teclado')
  const inspector = page.getByRole('complementary', { name: 'Inspetor', exact: true })
  const stageWidthBeforeInspectorCollapse = (await page.locator('.ce-stage').boundingBox()).width
  await inspector.getByRole('button', { name: 'Recolher inspetor' }).click()
  await page.waitForTimeout(220)
  check(await page.locator('.ce-body').evaluate((element) => element.classList.contains('is-right-collapsed')), 'Inspetor pode ser recolhido independentemente')
  check((await page.locator('.ce-stage').boundingBox()).width > stageWidthBeforeInspectorCollapse, 'Recolher o inspetor também liberta espaço para o canvas')
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('dcsimu:ce:panels')).collapsedRight === true), 'Preferência de recolha do inspetor fica guardada')
  await capture('inspector-collapsed')
  await hierarchy.getByRole('button', { name: 'Recolher hierarquia' }).click()
  await page.reload()
  await hierarchy.getByRole('button', { name: 'Expandir hierarquia' }).waitFor()
  await inspector.getByRole('button', { name: 'Expandir inspetor' }).waitFor()
  check(await page.locator('.ce-body').evaluate((element) => element.classList.contains('is-left-collapsed') && element.classList.contains('is-right-collapsed')), 'Estado recolhido dos dois painéis mantém-se após recarregar')
  await page.waitForTimeout(220)
  await capture('panels-collapsed')
  await hierarchy.getByRole('button', { name: 'Expandir hierarquia' }).click()
  await inspector.getByRole('button', { name: 'Expandir inspetor' }).click()
  const expandedPanels = await page.locator('.ce-body').evaluate((element) => !element.classList.contains('is-left-collapsed') && !element.classList.contains('is-right-collapsed'))
  check(expandedPanels, 'Ambos os painéis podem ser restaurados após recarregar')
  await page.waitForTimeout(220)
  await capture('panels-restored')
  const width = Number(await separator.getAttribute('aria-valuenow'))
  await separator.focus(); await separator.press('ArrowRight')
  check(Number(await separator.getAttribute('aria-valuenow')) > width, 'Largura da hierarquia ajustável por teclado')
  await page.evaluate(async () => {
    const { useEditorStore } = await import('/src/admin/editor3d/editorStore.ts')
    useEditorStore.getState().cameraTo('front')
  })
  await page.waitForTimeout(500)
  await pickCanvas('display', 'LCD LOGO!')
  check((await read()).selection?.kind === 'display', 'LCD selecionável com um clique real no modelo')
  await pickCanvas('control', 'Tecla OK')
  check((await read()).selection?.kind === 'control', 'Área da tecla selecionável no modelo sem selecionar o corpo')
  const parts = (await read()).parts
  await page.getByRole('tab', { name: 'Simular', exact: true }).click()
  await pickCanvas('control', 'Tecla ESC')
  await pickCanvas('control', 'Tecla OK')
  check((await read()).vars.logoPage === 'io', 'Clique real em OK muda a página do LCD na simulação')
  await pickCanvas('control', 'Tecla ←')
  check((await read()).vars.logoPage === 'home', 'Tecla esquerda navega para a página anterior')
  check(JSON.stringify((await read()).parts) === JSON.stringify(parts), 'Premir teclas mantém a geometria e pose do corpo')
  await page.getByRole('tab', { name: 'Editar', exact: true }).click()
  await capture('logo-desktop-controls')
  await page.setViewportSize({ width: 1025, height: 900 })
  for (let index = 0; index < 15; index++) await separator.press('ArrowRight')
  const inspectorSeparator = page.getByRole('separator', { name: 'Largura do inspetor' })
  for (let index = 0; index < 15; index++) await inspectorSeparator.press('ArrowLeft')
  const narrowMenuBtn = page.getByRole('button', { name: /^(Organizar|Mais)$/ }).first()
  await narrowMenuBtn.click()
  const viewMenu = page.locator('[role="dialog"][aria-label="Organizar"], [role="menu"][aria-label="Ferramentas e opções"]').first()
  await viewMenu.waitFor()
  check(await viewMenu.evaluate((element) => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 }), 'Canvas estreito em desktop usa menu compacto sem cortar as opções')
  await capture('logo-1025-narrow-canvas')
  await page.keyboard.press('Escape')
  await separator.press('Home'); await inspectorSeparator.press('Home')
  for (const width of [1920, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 1000 : 844 })
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Documento sem overflow a ' + width + ' px')
    if (width === 1024) {
      const canvasPane = page.getByRole('button', { name: 'Canvas 3D', exact: true })
      await page.getByRole('button', { name: 'Objetos', exact: true }).click()
      check(await page.getByRole('button', { name: 'Objetos', exact: true }).getAttribute('aria-pressed') === 'true', 'Navegação do tablet assinala a hierarquia aberta')
      const closeHierarchy = hierarchy.getByRole('button', { name: 'Fechar hierarquia e voltar ao canvas', exact: true })
      check(await closeHierarchy.isVisible() && (await closeHierarchy.getAttribute('title')).includes('canvas'), 'Hierarquia no tablet tem ação clara para voltar ao canvas')
      await closeHierarchy.click()
      check(await canvasPane.getAttribute('aria-pressed') === 'true', 'Fechar hierarquia do tablet restaura o canvas')
      await page.getByRole('button', { name: 'Propriedades', exact: true }).click()
      const closeInspector = inspector.getByRole('button', { name: 'Fechar propriedades e voltar ao canvas', exact: true })
      check(await closeInspector.isVisible(), 'Inspetor no tablet tem ação clara para voltar ao canvas')
      await closeInspector.click()
      check(await canvasPane.getAttribute('aria-pressed') === 'true', 'Fechar inspetor do tablet restaura o canvas')
    }
    if (width <= 1024) {
      await page.getByRole('button', { name: 'Objetos', exact: true }).click()
      check(await page.getByRole('button', { name: 'Objetos', exact: true }).getAttribute('title') === 'Abrir a hierarquia de objetos', 'Navegação móvel descreve o painel Objetos')
      await hierarchy.getByRole('button', { name: /^Ecrãs 1$/ }).click()
      await hierarchy.getByRole('button', { name: 'LCD LOGO! Texto', exact: true }).focus()
      await page.keyboard.press('Enter')
      check(await page.getByRole('button', { name: 'Propriedades', exact: true }).evaluate((el) => el.classList.contains('is-on')), 'Enter no LCD abre propriedades a ' + width + ' px')
      await page.getByRole('button', { name: 'Canvas 3D', exact: true }).click()
      if (width === 390) {
        await page.getByRole('button', { name: 'Propriedades', exact: true }).click()
        await inspector.getByRole('button', { name: 'Fechar propriedades e voltar ao canvas', exact: true }).click()
        check(await page.getByRole('button', { name: 'Canvas 3D', exact: true }).getAttribute('aria-pressed') === 'true', 'Fechar propriedades no telemóvel restaura o canvas')
      }
    }
    // O menu «Mais» reúne todas as ações que não cabem na barra: em ecrãs largos
    // é o «Organizar»; no telemóvel inclui também formas, manipulador e vista.
    const organization = width > 1024
      ? page.getByRole('button', { name: 'Organizar', exact: true })
      : page.getByRole('button', { name: 'Mais', exact: true })
    await organization.click()
    const menu = width > 1024
      ? page.getByRole('dialog', { name: 'Organizar', exact: true })
      : page.getByRole('menu', { name: 'Ferramentas e opções' })
    check(await menu.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }), 'Menu ' + (width > 1024 ? 'Organizar' : 'Mais') + ' cabe no ecrã a ' + width + ' px')
    if (width <= 1024) {
      check(await menu.locator('[data-tm-item^="shape-"]').count() >= 6, 'Menu «Mais» oferece as seis formas do modelo a ' + width + ' px')
      check(await menu.locator('[data-tm-item="delete"]').count() === 1, 'Menu «Mais» inclui a eliminação da seleção a ' + width + ' px')
    }
    await page.keyboard.press('Escape')
    check(await menu.count() === 0, 'Escape fecha o menu a ' + width + ' px')
    await capture('logo-' + width)
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: /(?:Novo|Criar) projeto/i }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Criar novo projeto' })
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('UI sintética — entradas')
  await dialog.getByRole('radio', { name: /^GRAFCET / }).check()
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.locator('.grafcet-canvas').waitFor()
  await page.evaluate(async () => {
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const steps = [1, 2].map((n) => ({ id: 's' + n, name: String(n), initial: n === 1, stepType: n === 1 ? 'initial' : 'simple', action: '', actions: [], condition: '1', x: 150, y: n * 160, pinned: true }))
    useSimStore.getState().setGrafcet({ name: 'Fixture entradas', steps, transitions: [{ id: 't1', from: ['s1'], to: ['s2'], condition: 'I1', name: '' }] }, 'force')
  })
  await page.getByRole('tab', { name: /^Simulador/ }).first().click()
  await page.locator('.gsim-input-main').first().waitFor()
  check(await page.locator('.gsim-input-main').first().evaluate((el) => {
    const button = el.querySelector('.gsim-actuator').getBoundingClientRect(), input = el.querySelector('input').getBoundingClientRect()
    return button.right <= input.left + 1 || button.bottom <= input.top + 1
  }), 'GRAFCET: botão da entrada e campo de nome já não se sobrepõem')
  await capture('grafcet-inputs')
  assert.deepEqual(errors, [], 'Exceções JavaScript')
  console.log(`PASS — ${checks} verificações UI; browser isolado sem API nem publicação`)
} catch (error) { await capture('failure'); console.log('Exceções da página:', errors); throw error }
finally { await browser.close() }
