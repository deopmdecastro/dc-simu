import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Regra DC-ADR-059: o canvas não tem cartões flutuantes.
//   · as opções e as ações de uma ferramenta vivem na barra de ferramentas ou no painel lateral;
//   · o que era um cartão (dica da ferramenta, enquadrar, minimapa) passou para a barra;
//   · o canvas do GRAFCET deixou de ter o HUD de zoom/ajustar/mapa e o de esquema o seu HUD compacto.
// Requer o Vite em CARTAS_TEST_URL (predefinição http://127.0.0.1:5173).
const baseURL = process.env.CARTOES_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.CARTOES_TEST_OUTPUT
const browser = await chromium.launch(process.env.CARTOES_TEST_CHANNEL ? { channel: process.env.CARTOES_TEST_CHANNEL } : {})
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks += 1; console.log('PASS — ' + message) }

/** Seletores que identificam cartões sobre o desenho (não podem existir no canvas). */
const CARD_SELECTORS = [
  '.panel3d-tool-context',
  '.component-view-command',
  '.panel3d-hint-toggle',
  '.schematic-hud',
  '.dc-wire-guide',
  '.grafcet-canvas-hud',
]

async function openProject(width, name) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    // A medição das etiquetas resolve fontes de fallback num CDN: sem essa resposta
    // o editor perde o canvas (promessa rejeitada sem tratamento) e o teste mentiria.
    const fonts = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'].includes(url.hostname)
    const local = (url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json') || fonts
    return local ? route.continue() : route.abort()
  })
  await context.addInitScript(() => {
    localStorage.removeItem('dcsimu:supabase:config:v1')
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.setItem('dcsimu:schematic:sim-open', '0')
    localStorage.removeItem('dcsimu:showHints')
    localStorage.removeItem('dcsimu:grafcet:minimap')
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: /(?:Novo|Criar) projeto/i }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Criar novo projeto' })
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.locator('.dc-workspace').waitFor({ timeout: 90000 })
  await page.locator('.dc-toolbar-main').waitFor({ state: 'visible', timeout: 90000 })
  // A barra só fica composta depois de o workspace assentar (os botões passam a ter largura).
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((element) => (element.title || '').includes('cabo entre bornes'))
    return Boolean(button && button.getBoundingClientRect().width > 0)
  }, undefined, { timeout: 90000 })
  // Um componente selecionado e a ferramenta Cabo: é neste estado que apareciam os cartões.
  // O canvas 3D limpa a seleção ao montar: escolhe-se o componente já com a vista assente.
  await page.waitForTimeout(1500)
  await page.evaluate(async () => {
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const store = useSimStore.getState()
    store.setMode('schematic')
    store.setTool('select')
    const id = store.components[0]?.id ?? store.addComponent('breaker3p', 240, 240)
    if (id) useSimStore.getState().selectComponents([id])
  })
  await page.waitForTimeout(1500)
  const state = await page.evaluate(async () => {
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const store = useSimStore.getState()
    return { components: store.components.length, selected: store.selectedComponentIds.length, tool: store.tool }
  })
  check(state.components === 1 && state.selected === 1, `Projeto de teste pronto (${state.components} componente, ${state.selected} selecionado)`)
  return { context, page, errors }
}

const cards = (page) => page.evaluate((selectors) => selectors.filter((selector) => {
  const element = document.querySelector(selector)
  if (!element) return false
  const box = element.getBoundingClientRect()
  return box.width > 0 && box.height > 0
}), CARD_SELECTORS)

try {
  for (const [width, label] of [[1440, 'computador'], [390, 'telemóvel']]) {
    const { context, page, errors } = await openProject(width, `Sem cartões — ${label}`)
    // ---- com um componente selecionado (ferramenta Selecionar)
    const present = await cards(page)
    check(present.length === 0, `Esquema (${label}): nenhum cartão sobre o canvas — ${present.join(', ') || 'nenhum'}`)

    const bar = page.locator('.dc-toolbar-main, .dc-toolbar-row2')

    check(await bar.locator('[aria-label^="Editar componente 3D"]').count() === 1, `Esquema (${label}): editar o componente está na barra`)
    check(await bar.locator('[aria-label^="Editar bornes"], [aria-label^="Adicionar borne"]').count() === 1, `Esquema (${label}): editar os bornes está na barra`)
    check(await bar.locator('[aria-label="Dicas do canvas"]').count() === 1, `Esquema (${label}): as dicas alternam na barra`)
    check(await bar.locator('[aria-label="Enquadrar a vista na seleção"]').count() === 1, `Esquema (${label}): enquadrar a seleção está na barra`)

    // ---- com a ferramenta Cabo: é o estado do cartão «Cabo» que foi reportado
    // Ferramenta escolhida na barra, como o utilizador faz.
    const clicked = await page.evaluate(() => {
      const button = [...document.querySelectorAll('.dc-toolbar-main button, .dc-toolbar-row2 button')]
        .find((element) => element.title.includes('Desenhar cabo entre bornes') && element.getBoundingClientRect().width > 0)
      button?.click()
      return Boolean(button)
    })
    check(clicked, `Esquema (${label}): a ferramenta Cabo está na barra`)
    await page.waitForTimeout(900)
    const withWire = await cards(page)
    check(withWire.length === 0, `Esquema (${label}), ferramenta Cabo: nenhum cartão sobre o canvas — ${withWire.join(', ') || 'nenhum'}`)
    if (width >= 1440) {
      const hint = await page.locator('.tb-hint', { hasText: 'Cabo:' }).first().textContent()
      check(/Cabo:/.test(hint ?? ''), `Esquema (${label}): a dica da ferramenta Cabo vive na barra (${(hint ?? '').trim().slice(0, 44)}…)`)
    }
    // O enquadramento continua acessível pela barra (o cartão já não é o caminho).
    check(await bar.locator('[aria-label="Ajustar à largura"], [aria-label="Enquadrar tudo o que está no canvas"]').count() >= 1, `Esquema (${label}): o enquadramento continua na barra`)

    // GRAFCET: sem HUD flutuante; ajustar e mapa na barra.
    await page.evaluate(() => { const tab = [...document.querySelectorAll('button')].find((button) => (button.textContent || '').trim() === 'GRAFCET'); tab?.click() })
    await page.waitForTimeout(2500)
    const grafcetCards = await cards(page)
    check(grafcetCards.length === 0, `GRAFCET (${label}): nenhum cartão sobre o diagrama — ${grafcetCards.join(', ') || 'nenhum'}`)
    const grafcetBar = page.locator('.dc-grafcet-toolbar')
    check(await grafcetBar.locator('[aria-label="Ajustar o diagrama à janela"]').count() === 1, `GRAFCET (${label}): «Ajustar» está na barra`)
    check(await grafcetBar.locator('[aria-label="Minimapa"]').count() === 1, `GRAFCET (${label}): «Mapa» está na barra`)
    check(await page.locator('.grafcet-minimap').count() === 0, `GRAFCET (${label}): o minimapa não aparece sem ser pedido`)

    if (output) {
      await fs.mkdir(output, { recursive: true })
      await page.screenshot({ path: path.join(output, `grafcet-${width}.png`) })
    }
    check(errors.length === 0, `Sem exceções de JavaScript (${label}): ${errors.join(' | ')}`)
    await context.close()
  }
  console.log(`\n${checks} verificações — o canvas não tem cartões flutuantes (DC-ADR-060)`)
} finally {
  await browser.close()
}
