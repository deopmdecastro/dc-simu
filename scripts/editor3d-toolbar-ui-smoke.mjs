import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Barra do editor de componentes: ferramentas na largura do telefone, menu «Mais»
// com todas as ações, zoom com referência honesta e enquadramento que aproveita o
// ecrã. Contexto descartável, sem API. Requer Vite em EDITOR3D_TEST_URL.
const baseURL = process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL ? { channel: process.env.EDITOR3D_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
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
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks += 1; console.log('PASS — ' + message) }
const store = (fn, argument) => page.evaluate(async ({ source, argument }) => {
  const { useEditorStore } = await import('/src/admin/editor3d/editorStore.ts')
  return Function('store', 'argument', 'return (' + source + ')(store, argument)')(useEditorStore, argument)
}, { source: fn.toString(), argument })

try {
  await page.goto(baseURL + '/dashboard')
  await page.waitForTimeout(1500)
  const entryId = await page.evaluate(async () => {
    const { buildBuiltinDraft } = await import('/src/admin/editor3d/builtinComponents.ts')
    const { catalogApi } = await import('/src/catalog/catalogApi.ts')
    const draft = await buildBuiltinDraft('motorBreakerPkzmC10')
    return (await catalogApi.save('synthetic-toolbar-menu-review', draft.meta, draft.def)).id
  })
  await page.goto(baseURL + '/admin/editor/' + entryId)
  await page.locator('.ce-root canvas').waitFor({ timeout: 120000 })
  await page.waitForTimeout(1500)

  // 1) as seis ferramentas cabem na largura do telefone, sem deslizar
  const tools = page.locator('.ce-tools')
  const toolsBox = await tools.boundingBox()
  check(Boolean(toolsBox) && toolsBox.width <= 390, 'As seis ferramentas cabem nos 390 px do telefone')
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Editor sem deslocamento horizontal a 390 px')
  for (const name of ['Selecionar', 'Borne', 'Cabo', 'Apagar', 'Arrastar malha', 'Medir']) {
    check(await page.getByRole('button', { name, exact: true }).isVisible(), `Ferramenta «${name}» visível no telefone`)
  }

  // 2) a dica identifica a ferramenta ativa
  const hint = page.locator('.ce-ribbon-hint')
  check((await hint.innerText()).startsWith('Seleção'), 'A dica nomeia a ferramenta ativa')
  await page.getByRole('button', { name: 'Medir', exact: true }).click()
  await page.waitForTimeout(200)
  check((await hint.innerText()).startsWith('Medir'), 'A dica acompanha a mudança de ferramenta')
  await page.getByRole('button', { name: 'Selecionar', exact: true }).click()

  // 3) menu «Mais»: folha inferior, com todas as ações e motivos de bloqueio
  await page.getByRole('button', { name: 'Mais', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Ferramentas e opções' })
  await menu.waitFor()
  check(await menu.evaluate((el) => el.classList.contains('is-sheet')), 'No telefone o menu abre como folha inferior')
  check(await menu.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight + 1 }), 'A folha do menu cabe no ecrã')
  check(await menu.locator('[data-tm-item]').count() >= 20, 'O menu reúne todas as ações que não cabem na barra')
  check(await menu.locator('[data-tm-item="duplicate"]').isDisabled(), 'Ação sem seleção fica desativada')
  check((await menu.locator('[data-tm-item="duplicate"]').innerText()).includes('Selecione uma peça'), 'Ação desativada explica o que falta')
  check(await menu.locator('[data-tm-item="shortcuts"]').count() === 1, 'Ajuda (atalhos) acessível sem teclado')
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'detached' })
  check(true, 'Escape fecha o menu')

  // 4) zoom honesto: 100 % = modelo enquadrado; aproximar e repor
  await page.waitForTimeout(400)
  const initial = await store((s) => s.getState().camStats)
  check(initial.fit > 0 && initial.zoom > 0, 'A câmara comunica a distância de enquadramento')
  const fitZoom = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.dc-tool-btn')].find((b) => /^\d+%$/.test(b.textContent.trim()))
    return el ? Number(el.textContent.replace('%', '')) : null
  })
  check(fitZoom !== null && Math.abs(fitZoom - 100) <= 12, `Enquadrar deixa o zoom perto de 100 % (${fitZoom}%)`)
  await page.getByRole('button', { name: 'Ampliar zoom' }).click()
  await page.waitForTimeout(400)
  const zoomed = await store((s) => s.getState().camStats.zoom)
  check(zoomed > fitZoom, `Ampliar aproxima a câmara (${fitZoom}% → ${zoomed}%)`)
  await page.getByRole('button', { name: /^Zoom \d+%$/ }).click()
  await page.waitForTimeout(500)
  const reset = await store((s) => s.getState().camStats.zoom)
  check(Math.abs(reset - 100) <= 12, 'Clicar no valor enquadra o modelo outra vez (≈100 %)')

  // 5) enquadramento: o modelo ocupa a altura do canvas na vertical (antes ficava
  //    pequeno porque a câmara usava a esfera envolvente em vez da caixa projetada)
  const fill = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((entry) => entry.includes('/.vite/deps/@react-three_fiber.js'))
    if (!url) return null
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const { _roots } = await import(url)
    const canvas = document.querySelector('.ce-root canvas')
    const state = _roots.get(canvas).store.getState()
    const box = new THREE.Box3()
    // Só as peças do componente (as que têm partId na hierarquia), sem a grelha
    // do chão nem o fundo — esses fariam a medição perder o sentido.
    const belongs = (object) => { let node = object; while (node) { if (node.userData && node.userData.partId) return true; node = node.parent } return false }
    state.scene.traverse((object) => { if (object.isMesh && belongs(object)) box.expandByObject(object) })
    if (box.isEmpty()) return null
    const height = canvas.clientHeight
    let min = Infinity, max = -Infinity
    for (let index = 0; index < 8; index += 1) {
      const corner = new THREE.Vector3(
        index & 1 ? box.max.x : box.min.x,
        index & 2 ? box.max.y : box.min.y,
        index & 4 ? box.max.z : box.min.z,
      ).project(state.camera)
      const y = canvas.getBoundingClientRect().top + (1 - corner.y) * height / 2
      min = Math.min(min, y); max = Math.max(max, y)
    }
    return (max - min) / height
  })
  check(fill !== null && fill > 0.5 && fill < 1.05, `O modelo enquadrado ocupa boa parte da altura do canvas (${fill === null ? 'n/d' : Math.round(fill * 100) + '%'})`)

  assert.deepEqual(errors, [], 'Sem exceções JavaScript')
  console.log(`PASS — ${checks} verificações da barra do editor de componentes`)
} finally {
  await browser.close()
}
