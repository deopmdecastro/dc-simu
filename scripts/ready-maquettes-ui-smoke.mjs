// Biblioteca → «Maquetes prontas»: o domínio novo abre com o cartão da maquete, a capa carrega e um
// único clique monta a bancada inteira (42 componentes) num só passo de histórico.
//   npm run test:maquetes-ui            (usa http://127.0.0.1:5173)
//   MAQUETTES_TEST_URL=http://127.0.0.1:5207 node scripts/ready-maquettes-ui-smoke.mjs
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseURL = process.env.MAQUETTES_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }

try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  await context.addInitScript(() => {
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.removeItem('dcsimu:supabase:config:v1')
    localStorage.setItem('dcsimu:cookie-consent:v1', JSON.stringify({ accepted: true, at: '2026-11-22T10:00:00.000Z', version: 1 }))
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  const errors = []
  page.on('pageerror', (error) => { if (!/Failed to fetch/.test(error.message)) errors.push(error.message) })

  /** URL viva do módulo (o Vite acrescenta `?t=` a cada HMR: importar o caminho nu cria outra instância). */
  const MODULE_URL = `(path) => performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => new URL(name).pathname === path).pop()`

  /** Estado real do simulador (mesma instância de módulo que a aplicação usa). */
  const store = () => page.evaluate(async (moduleUrl) => {
    const url = new Function(`return (${moduleUrl})`)()('/src/store/useSimStore.ts')
    const { useSimStore } = await import(url || '/src/store/useSimStore.ts')
    const state = useSimStore.getState()
    return {
      components: state.components.length,
      history: state.history.length,
      selected: state.selectedComponentIds.length,
      plates: state.components.filter((c) => c.type === 'mecSlotPlate').length,
      placed3D: state.components.filter((c) => c.panel3DPosition).length,
      events: state.sim.events.length,
      lastEvent: state.sim.events[0]?.message ?? '',
    }
  }, MODULE_URL)

  // Editor de um projeto novo (mesmo caminho do teste das capas da biblioteca).
  await page.goto(`${baseURL}/dashboard`)
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Maquetes prontas')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForSelector('[data-library-domain]', { timeout: 60000 })
  await page.waitForTimeout(1500)
  const before = await store()
  check(before.components === 0, 'Projeto novo: nenhum componente antes de montar')

  // 1. O domínio «Maquetes prontas» existe na biblioteca, depois dos quatro domínios de componentes.
  const domainIds = await page.$$eval('[data-library-domain]', (nodes) => nodes.map((node) => node.getAttribute('data-library-domain')))
  check(
    domainIds.join('|') === 'eletricidade|hidraulica|pneumatica|serralharia|maquetes',
    `Cinco domínios, «maquetes» no fim (${domainIds.join(', ')})`,
  )
  const pills = await page.$$eval('[role="tab"]', (nodes) => nodes.map((node) => node.textContent?.trim() ?? ''))
  check(pills.some(text => /^Maquetes(?:\s*\d+)?$/.test(text)), 'Aba «Maquetes» na barra de domínios')

  // 2. Clicar na aba filtra apenas as maquetes e mostra o cartão com a capa.
  await page.locator('[role="tab"]', { hasText: /^Maquetes(?:\s*\d+)?$/ }).click()
  const card = page.locator('[data-maquette="atec-estampagem"]')
  await card.waitFor({ state: 'visible' })
  check(await card.isVisible(), 'Cartão «Maquete ATEC» visível no domínio Maquetes')
  const title = await card.getAttribute('aria-label')
  check(/Maquete ATEC/.test(title ?? '') && /42 componentes/.test(title ?? ''), `Cartão anuncia a montagem completa (${title})`)
  const image = await card.locator('img').evaluate((img) => ({ src: img.getAttribute('src'), width: img.naturalWidth, complete: img.complete }))
  check(image.src === '/maquetes/atec-estampagem.webp', `Capa aponta para o render da maquete (${image.src})`)
  check(image.complete && image.width === 400, `Capa carregada (${image.width}px)`)
  const onlyMaquetes = await page.$$eval('[data-library-domain]', (nodes) => nodes.map((node) => node.getAttribute('data-library-domain')))
  check(onlyMaquetes.join('|') === 'maquetes', 'A aba esconde os domínios de componentes')
  check(
    (await page.locator('[data-maquette="atec-bancada"]').count()) === 1,
    'Variante «Bancada ATEC · base e estrutura» também disponível',
  )

  // 3. Um clique monta a bancada: base + 41 peças, tudo colocado no Painel 3D, um só passo de histórico.
  await card.click()
  await page.waitForFunction(() => {
    const root = document.querySelector('.dc-library-tile-name')
    return !!root || true
  })
  await page.waitForTimeout(1200)
  const after = await store()
  check(after.components === 42, `42 componentes criados num clique (${after.components})`)
  check(after.plates === 1, 'Base ranhurada criada (mecSlotPlate)')
  check(after.placed3D === 42, `Todos os 42 têm posição no Painel 3D (${after.placed3D})`)
  check(after.history - before.history === 1, `Um único passo de histórico (${after.history - before.history})`)
  check(after.selected === 42, 'A montagem fica selecionada para mover/ajustar em bloco')
  check(after.events > before.events, 'Evento «maquete montada» registado no painel de eventos')
  const inspector = await page.locator('body').innerText()
  check(/42 elementos selecionados/.test(inspector), 'Inspetor mostra os 42 elementos selecionados')
  check(/BAS1/.test(inspector) && /Base ranhurada/.test(inspector), 'A base ranhurada (BAS1) está no projeto')

  // 4. Desfazer (Ctrl+Z) desmonta tudo de uma vez; o registo de eventos explica a operação.
  await page.evaluate(async (moduleUrl) => {
    const url = new Function(`return (${moduleUrl})`)()('/src/store/useSimStore.ts')
    const { useSimStore } = await import(url || '/src/store/useSimStore.ts')
    useSimStore.getState().undo()
  }, MODULE_URL)
  await page.waitForTimeout(600)
  const undone = await store()
  check(undone.components === 0, `Desfazer remove os 42 componentes de uma vez (${undone.components})`)
  await page.evaluate(async (moduleUrl) => {
    const url = new Function(`return (${moduleUrl})`)()('/src/store/useSimStore.ts')
    const { useSimStore } = await import(url || '/src/store/useSimStore.ts')
    useSimStore.getState().redo()
  }, MODULE_URL)
  await page.waitForTimeout(800)
  const redone = await store()
  check(redone.components === 42, `Refazer volta a montar a bancada (${redone.components})`)

  // 5. A maquete não existe no catálogo de componentes nem nos favoritos: continua a ser um domínio à parte.
  const catalogTypes = await page.evaluate(async (moduleUrl) => {
    const url = new Function(`return (${moduleUrl})`)()('/src/electrical/factory.ts')
    const { paletteDomains } = await import(url || '/src/electrical/factory.ts')
    const domains = paletteDomains()
    const maquetes = domains.find((domain) => domain.id === 'maquetes')
    return {
      items: domains.filter((domain) => domain.id !== 'maquetes').reduce((sum, domain) => sum + domain.subgroups.reduce((s2, group) => s2 + group.items.length, 0), 0),
      maquetteItems: maquetes?.subgroups.reduce((sum, group) => sum + group.items.length, 0) ?? -1,
      maquetes: maquetes?.subgroups.reduce((sum, group) => sum + (group.maquetes?.length ?? 0), 0) ?? -1,
    }
  }, MODULE_URL)
  check(catalogTypes.items > 100, `Os componentes continuam todos no catálogo (${catalogTypes.items})`)
  check(
    catalogTypes.maquetteItems === 0 && catalogTypes.maquetes === 2,
    `Maquetes prontas: 2 montagens, 0 componentes de catálogo (${catalogTypes.maquetes} montagens, ${catalogTypes.maquetteItems} itens)`,
  )
  check(errors.length === 0, `Sem exceções React/WebGL (${errors.join(' | ') || 'OK'})`)

  console.log(`\n${checks} verificações · Biblioteca «Maquetes prontas» OK`)
} finally {
  await browser.close()
}
