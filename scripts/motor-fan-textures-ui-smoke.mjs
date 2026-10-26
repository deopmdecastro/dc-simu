import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Motor: pá de 3 pás (teste de rotação no editor, olho no projeto), biblioteca de texturas e caixa de bornes.
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
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const check = (value, message) => { assert.ok(value, message); console.log('PASS — ' + message) }
const capture = async (name, locator) => { if (output) await (locator ?? page).screenshot({ path: path.join(output, name + '.png') }) }
const editor = (source) => page.evaluate(async (source) => {
  const { useEditorStore } = await import('/src/admin/editor3d/editorStore.ts')
  return Function('store', 'return (' + source + ')(store)')(useEditorStore)
}, source.toString())

try {
  if (output) await fs.mkdir(output, { recursive: true })
  await page.goto(baseURL + '/dashboard')
  const entryId = await page.evaluate(async () => {
    const { buildBuiltinDraft } = await import('/src/admin/editor3d/builtinComponents.ts')
    const { catalogApi } = await import('/src/catalog/catalogApi.ts')
    const draft = await buildBuiltinDraft('motor3ph')
    return (await catalogApi.save('synthetic-motor-review', draft.meta, draft.def)).id
  })
  await page.goto(baseURL + '/admin/editor/' + entryId)
  await page.locator('.ce-root canvas').waitFor()
  await page.waitForTimeout(2500)
  await capture('editor-motor', page.locator('.ce-root canvas'))
  const fanCard = page.locator('.ce-root').getByText('Pá do veio (3 pás)', { exact: true }).first()
  check(await fanCard.isVisible(), 'Rascunho do motor traz a pá de três pás (hierarquia)')
  check(await page.locator('.ce-root').getByText('Pá 3', { exact: true }).count() > 0, 'Três pás elípticas na hierarquia')
  await fanCard.click()
  await page.getByRole('tab', { name: 'Objeto', exact: true }).click()
  await page.waitForTimeout(300)
  const spinTest = page.locator('[data-spin-test]')
  await spinTest.scrollIntoViewIfNeeded()
  check(await spinTest.isVisible(), 'Secção «Rotação contínua» com botão «Testar rotação»')
  await spinTest.click()
  await page.waitForTimeout(800)
  check(await page.getByRole('tab', { name: 'Simular', exact: true }).getAttribute('aria-selected') === 'true', 'Testar rotação passa a Simular')
  await capture('editor-spin', page.locator('.ce-root canvas'))
  await spinTest.click()
  await page.getByRole('tab', { name: 'Editar', exact: true }).click()

  await page.getByRole('tab', { name: 'Materiais', exact: true }).click()
  const tiles = page.locator('[data-texture]')
  await tiles.first().waitFor()
  check(await tiles.count() >= 15, `Biblioteca de texturas com ${await tiles.count()} texturas reais`)
  await page.waitForTimeout(800)
  const broken = await page.$$eval('[data-texture] img', (imgs) => Promise.all(imgs.map((img) => new Promise((resolve) => { const probe = new Image(); probe.onload = () => resolve(probe.naturalWidth > 0 ? null : img.getAttribute('src')); probe.onerror = () => resolve(img.getAttribute('src')); probe.src = img.getAttribute('src') }))).then((list) => list.filter(Boolean)))
  check(broken.length === 0, 'Miniaturas carregadas ' + broken.join(', '))
  await page.locator('[data-texture="aluminio-fundido"] .ce-tex-pick').click()
  await page.waitForTimeout(300)
  check(await page.locator('[data-texture="aluminio-fundido"].is-on').count() === 1, 'Clique aplica a textura ao material (assinalada)')
  const swatches = await page.locator('.ce-swatch').count()
  await page.locator('[data-texture="latao"] .ce-tex-new').click()
  await page.waitForTimeout(300)
  check(await page.locator('.ce-swatch').count() === swatches + 1 && await page.locator('[data-texture="latao"].is-on').count() === 1, '⊕ cria um material novo com a textura')
  await page.locator('.ce-root canvas').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  await capture('editor-texturas')

  // Projeto: motor integrado, olho da pá, caixa de bornes de perto.
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: /(?:Novo|Criar) projeto/i }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Criar novo projeto' })
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Revisão do motor')
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.getByRole('tablist', { name: 'Vistas' }).waitFor()
  await page.getByRole('button', { name: 'Visualização 3D', exact: true }).click()
  await page.locator('.panel3d-stage canvas').waitFor()
  await page.evaluate(async () => {
    const { createComponent } = await import('/src/electrical/factory.ts')
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const c = createComponent('motor3ph')
    c.state = { ...c.state, running: true, rpmVisual: 1 }
    useSimStore.setState({ components: [c], wires: [], tool: 'select', selectedComponentIds: [c.id], selectedComponentId: c.id })
  })
  await page.getByRole('button', { name: 'Enquadrar seleção', exact: true }).click()
  await page.waitForTimeout(2000)
  await capture('projeto-motor', page.locator('.panel3d-stage'))
  const eye = page.locator('[data-part-eye="showFan"]')
  await eye.waitFor({ timeout: 5000 })
  check(await eye.getAttribute('aria-pressed') === 'true', 'Olho «Pá do veio (3 pás)» nas propriedades, visível por omissão')
  await eye.click()
  check(await page.evaluate(async () => (await import('/src/store/useSimStore.ts')).useSimStore.getState().components[0].state.showFan) === false, 'Olho oculta a pá (state.showFan = false)')
  check(await eye.getAttribute('aria-pressed') === 'false', 'Olho mostra o estado oculto')
  await page.waitForTimeout(500)
  await capture('projeto-motor-sem-pa', page.locator('.panel3d-stage'))
  await eye.click()
  await page.getByRole('button', { name: 'Vista superior', exact: true }).click({ force: true })
  await page.waitForTimeout(1200)
  await capture('projeto-motor-topo', page.locator('.panel3d-stage'))
  assert.deepEqual(errors, [], 'Exceções JavaScript')
  console.log('PASS — Pá, texturas e olho sem exceções JavaScript')
} finally { await browser.close() }
