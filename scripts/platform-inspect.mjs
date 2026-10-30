import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Inspeção visual da plataforma inteira em PC e tablet: capturas, erros JS,
// transbordo horizontal e marcadores de layout (gavetas vs. painéis fixos).
// Uso: PLATFORM_URL=http://127.0.0.1:5173 PLATFORM_OUT=/tmp/shots node scripts/platform-inspect.mjs
const baseURL = process.env.PLATFORM_URL || 'http://127.0.0.1:4173'
const out = process.env.PLATFORM_OUT || 'runtime/platform-inspect'
const only = process.env.PLATFORM_ONLY ? process.env.PLATFORM_ONLY.split(',') : null

const VIEWPORTS = [
  { name: 'pc-1440', width: 1440, height: 900, touch: false },
  { name: 'pc-1280', width: 1280, height: 800, touch: false },
  { name: 'tab-land-1180', width: 1180, height: 820, touch: true },
  { name: 'tab-port-820', width: 820, height: 1180, touch: true },
  { name: 'tab-mini-744', width: 744, height: 1133, touch: true },
].filter((v) => !only || only.includes(v.name))

const PAGES = [
  { name: 'landing', url: '/', session: null, ready: 'body', full: true },
  { name: 'login', url: '/login', session: null, ready: 'form' },
  { name: 'dashboard', url: '/dashboard', session: 'dcsimu-admin', ready: 'main, .dx-dash, body' },
  { name: 'editor-esquema', url: '/projects/native-partida-direta-v5', session: 'dcsimu-admin', ready: '.dc-tool-btn', view: null },
  { name: 'editor-3d', url: '/projects/native-partida-direta-v5', session: 'dcsimu-admin', ready: '.dc-tool-btn', view: /3D|Painel/ },
  { name: 'editor-ladder', url: '/projects/native-partida-direta-v5', session: 'dcsimu-admin', ready: '.dc-tool-btn', view: /Ladder/ },
  { name: 'editor-grafcet', url: '/projects/native-partida-direta-v5', session: 'dcsimu-admin', ready: '.dc-tool-btn', view: /GRAFCET/ },
  { name: 'admin', url: '/admin', session: 'dcsimu-admin', ready: '.dx-admin' },
  { name: 'admin-editor3d', url: '/admin/editor', session: 'dcsimu-admin', ready: '.dx-admin, canvas, body' },
]

const browser = await chromium.launch(process.env.PLATFORM_CHROME ? { executablePath: process.env.PLATFORM_CHROME } : {})
const report = []
await mkdir(out, { recursive: true })

for (const vp of VIEWPORTS) {
  for (const pg of PAGES) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch, serviceWorkers: 'block', deviceScaleFactor: 1 })
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
    })
    await context.addInitScript((session) => {
      localStorage.removeItem('dcsimu:supabase:config:v1')
      if (session) localStorage.setItem('dcsimu:account:session:v1', session)
      else localStorage.removeItem('dcsimu:account:session:v1')
    }, pg.session)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errors.push('console: ' + m.text().slice(0, 200)) })
    try {
      await page.goto(baseURL + pg.url, { waitUntil: 'domcontentloaded' })
      await page.locator(pg.ready).first().waitFor({ timeout: 60000 })
      await page.waitForFunction(() => !document.body.innerText.includes('A carregar'), null, { timeout: 90000 }).catch(() => errors.push('ainda a carregar após 90 s'))
      await page.waitForTimeout(3000)
      if (pg.view) {
        const tab = page.getByRole('tab', { name: pg.view }).or(page.getByRole('button', { name: pg.view })).first()
        if (await tab.count()) { await tab.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(2500) }
        else errors.push('vista não encontrada: ' + pg.view)
      }
      const metrics = await page.evaluate(() => ({
        layoutWidth: window.innerWidth,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        coarse: matchMedia('(pointer: coarse)').matches,
        drawers: [...document.querySelectorAll('[class*="drawer"], [class*="sheet"]')].filter((el) => el.getBoundingClientRect().width > 0).length,
        rails: document.querySelectorAll('.dc-collapsed-rail, [class*="collapsed-rail"]').length,
        smallText: [...document.querySelectorAll('button, a, label, span, p')].filter((el) => { const r = el.getBoundingClientRect(); const fs = parseFloat(getComputedStyle(el).fontSize); return r.width > 0 && el.childElementCount === 0 && el.textContent.trim() && fs < 11 }).length,
        smallTargets: [...document.querySelectorAll('button, [role="tab"], a[href]')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24) }).length,
      }))
      await page.screenshot({ path: path.join(out, `${vp.name}--${pg.name}.png`), fullPage: !!pg.full })
      report.push({ vp: vp.name, page: pg.name, ...metrics, errors: [...new Set(errors)].slice(0, 6) })
      console.log(vp.name, pg.name, JSON.stringify(metrics), errors.length ? 'ERR ' + errors[0] : '')
    } catch (e) {
      await page.screenshot({ path: path.join(out, `${vp.name}--${pg.name}--FAIL.png`) }).catch(() => {})
      report.push({ vp: vp.name, page: pg.name, fail: String(e.message).slice(0, 200), errors })
      console.log(vp.name, pg.name, 'FAIL', String(e.message).slice(0, 160))
    }
    await context.close()
  }
}
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
await browser.close()
