import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Paridade tablet ↔ PC e barras sem cortes.
// - Tablets (tátil, lado curto ≥ 600 px) recebem a largura de layout do PC (1280 px).
// - PC e tablet mostram SEMPRE a barra completa (sem menus «Ferramentas/Painéis/Mais»); o que não cabe desliza na horizontal.
// - Os indicadores da administração não sobrepõem ícone, rótulo, valor e seta.
// Requer `vite preview` em PARITY_TEST_URL (por omissão http://127.0.0.1:4173).
const baseURL = process.env.PARITY_TEST_URL || 'http://127.0.0.1:4173'
const output = process.env.PARITY_TEST_OUTPUT
const browser = await chromium.launch(process.env.PLATFORM_CHROME ? { executablePath: process.env.PLATFORM_CHROME } : {})
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks += 1; console.log('PASS — ' + message) }
const capture = async (page, name) => { if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, name + '.png') }) } }

async function open(vp, url) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch, serviceWorkers: 'block' })
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url())
    return u.origin === new URL(baseURL).origin && !u.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  await context.addInitScript(() => {
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.removeItem('dcsimu:supabase:config:v1')
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(baseURL + url)
  await page.waitForFunction(() => !document.body.innerText.includes('A carregar'), null, { timeout: 120000 })
  await page.waitForTimeout(1500)
  return { context, page, errors }
}

/** Botões visíveis da barra cortados pela borda do seu contentor (ou do ecrã). */
const clippedToolbarButtons = (page) => page.evaluate(() => {
  const out = []
  const shell = document.querySelector('.dc-toolbar-shell')
  if (!shell) return ['sem barra']
  for (const scroller of [shell.querySelector('.dc-toolbar-main'), shell.querySelector('.dc-toolbar-row2'), ...shell.querySelectorAll('.dc-views-container')]) {
    if (!scroller) continue
    const box = scroller.getBoundingClientRect()
    if (scroller.scrollWidth - scroller.clientWidth > 1) out.push(`${scroller.className.split(' ')[0]} desliza ${scroller.scrollWidth - scroller.clientWidth}px`)
    for (const btn of scroller.querySelectorAll('button')) {
      const r = btn.getBoundingClientRect()
      if (r.width === 0 || getComputedStyle(btn).visibility === 'hidden') continue
      if (r.left < Math.max(0, box.left) - 1 || r.right > Math.min(window.innerWidth, box.right) + 1) out.push((btn.textContent || btn.getAttribute('aria-label') || '?').trim().slice(0, 24))
    }
  }
  return out
})

const VIEWPORTS = [
  { name: 'pc-1440', width: 1440, height: 900, touch: false },
  { name: 'pc-1280', width: 1280, height: 800, touch: false },
  { name: 'tablet-1180x820', width: 1180, height: 820, touch: true },
  { name: 'tablet-820x1180', width: 820, height: 1180, touch: true },
  { name: 'tablet-744x1133', width: 744, height: 1133, touch: true },
]

try {
  for (const vp of VIEWPORTS) {
    const { context, page, errors } = await open(vp, '/projects/native-partida-direta-v5')
    const layout = await page.evaluate(() => ({ width: window.innerWidth, tablet: document.documentElement.dataset.tablet }))
    if (vp.touch) {
      check(layout.tablet === 'true', `${vp.name}: reconhecido como tablet`)
      check(layout.width >= 1280, `${vp.name}: layout com a largura do PC (${layout.width}px)`)
    } else check(layout.width === vp.width, `${vp.name}: PC com a largura real`)
    check(await page.locator('.dc-mobile-backdrop:visible, .grafcet-toolbox-backdrop:visible').count() === 0, `${vp.name}: painéis laterais fixos (sem gaveta)`)
    for (const view of ['3D Realista', 'Ladder', 'GRAFCET']) {
      const tab = page.locator('.dc-toolbar-shell button').filter({ hasText: new RegExp('^\\s*' + view) }).first()
      await tab.click()
      await page.waitForTimeout(1800)
      const compactMenus = await page.locator('.dc-toolbar-shell.is-compact, .dc-toolbar-compact, .dc-compact-menu').count()
      check(compactMenus === 0, `${vp.name} · ${view}: barra completa, sem menus compactos de telemóvel (${compactMenus})`)
      const scrolls = await clippedToolbarButtons(page)
      check(scrolls.every((item) => item.includes('desliza')), `${vp.name} · ${view}: o excedente só desliza, nada fica inacessível (${scrolls.join(', ') || 'cabe tudo'})`)
      await capture(page, `${vp.name}--${view.toLowerCase()}`)
    }
    check(errors.length === 0, `${vp.name}: sem erros JavaScript (${errors[0] ?? 'ok'})`)
    await context.close()
  }

  for (const vp of [VIEWPORTS[0], VIEWPORTS[1], VIEWPORTS[3]]) {
    const { context, page } = await open(vp, '/admin')
    await page.locator('.adm-tile').first().waitFor()
    const overlaps = await page.evaluate(() => [...document.querySelectorAll('.adm-tile')].filter((tile) => {
      const parts = ['.adm-tile-top', 'strong', '.adm-tile-foot'].map((sel) => tile.querySelector(sel)?.getBoundingClientRect())
      if (parts.some((r) => !r)) return true
      return parts[0].bottom > parts[1].top + 1 || parts[1].bottom > parts[2].top + 1
    }).length)
    check(overlaps === 0, `${vp.name}: indicadores da administração sem sobreposição`)
    await capture(page, `${vp.name}--admin`)
    await context.close()
  }
  console.log(`\n✅ ${checks} verificações de paridade tablet/PC`)
} finally {
  await browser.close()
}
