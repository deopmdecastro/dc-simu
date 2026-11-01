// 2.ª linha da barra igual em todas as vistas (3D, Ladder, GRAFCET, IEC, Monitor):
//   Histórico │ Painéis │ Ferramentas │ Edição │ Anotações │ Extras ··· Estado │ Navegação │ Atalhos │ Vista │ Caixa-preta
// Ícone + texto em todos os botões; com espaço (1920 px) as ferramentas mostram o texto em todas as vistas.
// GRAFCET_TEST_URL=http://127.0.0.1:5207 GRAFCET_TEST_CHANNEL=chrome node scripts/toolbar-row2-standard-ui-smoke.mjs
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 900 } })
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
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Barra padrão')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(3000)
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts')
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  })
  const views = [
    { tab: '3D Realista', tools: 'Ferramentas de edição', annotations: true },
    { tab: 'Ladder', tools: null, annotations: false },
    { tab: 'GRAFCET', tools: 'Ferramentas de seleção e navegação', annotations: true },
    { tab: 'Esquema IEC', tools: 'Ferramentas de comandos', annotations: true },
    { tab: 'Monitor', tools: null, annotations: false },
  ]
  for (const view of views) {
    await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: view.tab, exact: true }).click()
    await page.waitForTimeout(1500)
    const info = await page.locator('.dc-toolbar-row2').first().evaluate((row, v) => {
      const pos = (el) => (el ? [...row.querySelectorAll('*')].indexOf(el) : -1)
      const q = (sel) => row.querySelector(sel)
      const spacer = [...row.children].find((el) => el.classList.contains('flex-1'))
      const order = {
        history: pos(q('[aria-label="Histórico"]')),
        sim: pos(q('[data-sim-toggle]') ?? q('.grafcet-palette-tool')),
        tools: v.tools ? pos(q(`[aria-label="${v.tools}"]`)) : null,
        annotations: v.annotations ? pos(q('[aria-label="Anotações"]')) : null,
        spacer: pos(spacer),
        shortcuts: pos(q('[data-shortcuts-button]')),
        view: pos(q('[aria-label="Vista"]')),
        blackbox: pos(q('.dc-blackbox-toggle')),
      }
      const labelShown = (btn) => { const s = btn?.querySelector('span'); return !!s && getComputedStyle(s).display !== 'none' && parseFloat(getComputedStyle(btn).fontSize) > 0 }
      const toolButtons = v.tools ? [...q(`[aria-label="${v.tools}"]`).querySelectorAll('button')] : []
      return { order, dense: row.classList.contains('is-dense'), toolsLabelled: toolButtons.every(labelShown), toolsWithKey: toolButtons.every((b) => !!b.querySelector('kbd')) }
    }, view)
    const o = info.order
    check(o.history >= 0 && o.shortcuts > o.spacer && o.blackbox > o.shortcuts && (o.view < 0 || (o.view > o.shortcuts && o.view < o.blackbox)), `${view.tab}: Histórico à esquerda; Atalhos → Vista → Caixa-preta à direita`)
    if (view.tab !== 'Monitor') check(o.sim > o.history && o.sim < o.spacer, `${view.tab}: Painéis (Simulação) logo a seguir ao histórico`)
    if (view.tools) check(o.tools > o.sim && o.tools < o.spacer && (!view.annotations || o.annotations > o.tools), `${view.tab}: Ferramentas depois dos Painéis e antes das Anotações`)
    if (view.tools) check(!info.dense && info.toolsLabelled && info.toolsWithKey, `${view.tab}: a 1920 px as ferramentas têm ícone, texto e tecla`)
  }
  // Atalhos do Esquema IEC (antes não tinha o botão).
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: 'Esquema IEC', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.locator('.dc-toolbar-row2 [data-shortcuts-button]').click()
  const help = page.getByRole('dialog').filter({ hasText: 'Esquema IEC' })
  await help.waitFor({ timeout: 10000 })
  check(await help.getByText('Rodar o símbolo selecionado 90°').isVisible(), 'Esquema IEC: «Atalhos» abre a ajuda de teclado do IEC')
  check(errors.length === 0, `sem erros JavaScript (${errors.join(' | ') || 'nenhum'})`)
} finally {
  await browser.close()
}
console.log(`\n${checks} verificações da barra padronizada passaram`)
