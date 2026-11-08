// Varredura do inspetor: cada tipo da biblioteca, cabos e bornes.
// Para cada controlo (TAG, estados, números, listas, texto, medidas de quadro/calha/perfil, rodar,
// espelhar, bloquear) confirma na store que o valor mudou; regista erros da consola e transbordo.
// Uso: servidor de desenvolvimento sem Supabase em INSPECTOR_URL (por omissão http://127.0.0.1:5212)
//   VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= npx vite --port 5212 --strictPort
//   node scripts/inspector-sweep-ui.mjs [--only tipo1,tipo2] [--json saida.json]
import fs from 'node:fs'
import { chromium } from 'playwright'

const base = process.env.INSPECTOR_URL || 'http://127.0.0.1:5212'
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null

const browser = await chromium.launch(process.env.INSPECTOR_CHANNEL === 'bundled' ? {} : { channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
await ctx.addInitScript(() => { performance.setResourceTimingBufferSize(20000); localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin'); localStorage.removeItem('dcsimu:supabase:config:v1') })
await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return u.origin === base && !u.pathname.startsWith('/api/') ? r.continue() : r.abort() })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) pageErrors.push(m.text().slice(0, 300)) })
page.on('requestfailed', (r) => { if (process.env.SWEEP_DEBUG) console.log('pedido falhado', r.url().slice(0, 160)) })

await page.goto(base + '/dashboard')
await page.getByRole('button', { name: 'Novo projeto', exact: true }).click({ timeout: 60000 })
const dialog = page.getByRole('dialog')
await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Varredura do inspetor')
await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
await page.waitForURL(/\/projects\//, { timeout: 60000 })
await page.getByText('A carregar o editor…').waitFor({ state: 'detached', timeout: 120000 }).catch(() => {})
await page.waitForTimeout(2500)

// Utilitários dentro da página: store, módulos e preenchimento compatível com React.
await page.evaluate(() => {
  const imp = (path) => { const hit = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => new URL(u).pathname === path).pop(); return import(hit || path) }
  globalThis.__sweep = {
    imp,
    store: async () => (await imp('/src/store/useSimStore.ts')).useSimStore,
    setValue(el, value) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value))
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
  }
})

// Painel lateral visível e separador Inspetor.
async function openInspector() {
  if (!(await page.locator('.dc-inspector-scroll').count())) {
    const tab = page.getByRole('tab', { name: /Inspetor/ }).or(page.getByRole('button', { name: /^Inspetor/ })).first()
    if (await tab.count()) await tab.click().catch(() => {})
  }
  if (!(await page.locator('.dc-inspector-scroll').count())) {
    await page.locator('[aria-label*="Biblioteca" i], [title*="Biblioteca" i]').first().click().catch(() => {})
    await page.waitForTimeout(500)
    await page.getByText(/^Inspetor$/).first().click().catch(() => {})
  }
  await page.locator('.dc-inspector-scroll').waitFor({ timeout: 10000 })
}

const types = await page.evaluate(async () => {
  const { TEMPLATES } = await __sweep.imp('/src/electrical/factory.ts')
  const { canInsertComponent3D } = await __sweep.imp('/src/three/modelPaths.ts')
  return Object.keys(TEMPLATES).filter((t) => canInsertComponent3D(t))
})
const wanted = only ? types.filter((t) => only.includes(t)) : types
console.log(`${wanted.length} tipos com 3D para testar`)

/** Exercita os controlos do inspetor do item selecionado; devolve resultados por controlo. */
const exercise = (target) => page.evaluate(async (target) => {
  const useSimStore = await __sweep.store()
  const snap = () => {
    const s = useSimStore.getState()
    const item = target.kind === 'wire' ? s.wires.find((w) => w.id === target.id) : target.kind === 'terminal' ? s.components.flatMap((c) => c.terminals).find((t) => t.id === target.id) : s.components.find((c) => c.id === target.id)
    return JSON.stringify(item ?? null) + '#' + s.components.length + '#' + s.wires.length
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const root = document.querySelector('.dc-inspector-scroll')
  const results = []
  // Botões de escolha local (face do furo, medida do bucim…) só mudam o próprio estado premido.
  const uiSig = () => [...root.querySelectorAll('[aria-pressed], [aria-checked], .is-on, .is-active')].map((el) => `${el.getAttribute('aria-pressed')}${el.getAttribute('aria-checked')}${el.className}`).join('|') + root.textContent
  const record = async (label, act, { expectChange = true, uiCounts = false } = {}) => {
    const before = snap(), beforeUi = uiSig()
    let error = ''
    try { await act() } catch (e) { error = String(e?.message ?? e) }
    await wait(80)
    const changed = before !== snap() || (uiCounts && beforeUi !== uiSig())
    results.push({ label, ok: !error && (!expectChange || changed), error, changed })
  }
  if (!root) return { results: [{ label: 'inspetor', ok: false, error: 'sem painel do inspetor' }], overflow: false, text: '' }
  const labelOf = (el) => (el.getAttribute('aria-label') || el.closest('label')?.querySelector('.dc-inspector-state-label, span')?.textContent || el.closest('label')?.textContent || el.closest('div')?.querySelector('label')?.textContent || el.name || el.type || '?').trim().slice(0, 50)
  const skip = (el) => el.disabled || el.readOnly || el.closest('[data-sweep-skip]') || el.offsetParent === null

  // Campos de texto/números (inclui TAG, descrição, medidas do quadro/calha, estado).
  const inputs = [...root.querySelectorAll('input:not([type]), input[type="text"], input[type="number"], input[type="range"], textarea')].filter((el) => !skip(el))
  for (const el of inputs) {
    const label = `${el.type || 'text'} · ${labelOf(el)}`
    if (/pesquis|procur|search/i.test(label)) continue
    // Campos que só preparam a ação seguinte (novo borne, novo furo) não gravam nada sozinhos.
    if (el.closest('[data-sweep-draft]') || /a criar|novo furo|do furo|^number · [XY]$|nova calha|pedido|pólos/i.test(label)) continue
    const before = el.value
    let next
    if (el.type === 'number' || el.type === 'range') {
      const min = el.min !== '' ? Number(el.min) : -Infinity, max = el.max !== '' ? Number(el.max) : Infinity
      const step = el.step && el.step !== 'any' ? Number(el.step) : 1
      const cur = Number(before) || 0
      next = cur + step <= max ? cur + step : cur - step >= min ? cur - step : cur
      if (next === cur) continue
    } else if (/hex/i.test(label)) next = before.toLowerCase() === '#123456' ? '#654321' : '#123456'
    else if (el.inputMode === 'numeric') next = String((Number(before) || 0) + 10)
    else next = `${before}x`
    // Foco → valor → saída: os campos com rascunho só gravam ao perder o foco (como o utilizador).
    await record(label, async () => { el.focus(); __sweep.setValue(el, next); el.blur() })
    // devolve o valor original (não deixa TAGs/medidas estragadas para os passos seguintes)
    if (document.contains(el)) { el.focus(); __sweep.setValue(el, before); el.blur() }
    await wait(30)
  }

  // Caixas de verificação (estado, peças visíveis, perfurada…): liga e volta a desligar.
  const checks = [...root.querySelectorAll('input[type="checkbox"]')].filter((el) => !skip(el))
  for (const el of checks) {
    const label = `checkbox · ${labelOf(el)}`
    if (/imã automático/i.test(label)) continue // preferência global do editor, não do componente
    await record(label, async () => { el.click() })
    if (document.contains(el)) el.click()
    await wait(30)
  }

  // Listas da plataforma: escolhe outra opção.
  const selects = [...root.querySelectorAll('button.dcx-select')].filter((el) => !skip(el))
  for (const el of selects) {
    const label = `lista · ${labelOf(el)}`
    await record(label, async () => {
      el.click(); await wait(80)
      const option = [...document.querySelectorAll('.dcx-select-menu [role="option"]')].find((o) => o.getAttribute('aria-selected') !== 'true' && o.getAttribute('aria-disabled') !== 'true')
      if (!option) { document.body.click(); throw new Error('sem outra opção') }
      option.click()
    })
    await wait(40)
  }

  // Botões segmentados e de preset do quadro/calha/perfil, e ações de posição.
  const buttons = [...root.querySelectorAll('.dc-acc button, .dc-acc-seg button')].filter((el) => !skip(el) && !el.classList.contains('dcx-select') && el.getAttribute('aria-pressed') !== 'true' && !el.classList.contains('dc-btn-primary'))
  for (const el of buttons) {
    if (!document.contains(el) || skip(el)) continue
    const text = (el.textContent.trim() || el.getAttribute('aria-label') || el.title || '').slice(0, 40)
    if (/eliminar|apagar|remover/i.test(text)) continue
    await record(`botão · ${text}`, async () => { el.click() }, { uiCounts: true })
  }
  for (const name of ['Girar 90°', 'Espelhar']) {
    const el = [...root.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith(name))
    if (el && !skip(el)) await record(`botão · ${name}`, async () => { el.click() })
  }
  const lock = [...root.querySelectorAll('button')].find((b) => /^(Bloquear|Desbloquear)$/.test(b.textContent.trim()))
  if (lock) { await record('botão · Bloquear', async () => { lock.click() }); const again = [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Desbloquear'); again?.click() }

  const overflow = root.scrollWidth > root.clientWidth + 2
  const wide = [...root.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); const p = root.getBoundingClientRect(); return r.width > 0 && r.right > p.right + 2 && getComputedStyle(el).position !== 'fixed' }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`)
  return { results, overflow, wide }
}, target)

const report = []
await openInspector()
let col = 0
for (const type of wanted) {
  const errorsBefore = pageErrors.length
  const id = await page.evaluate(async ({ type, col }) => {
    const useSimStore = await __sweep.store()
    const s = useSimStore.getState()
    for (const c of s.components) s.deleteComponents([c.id]) // um de cada vez: tela limpa
    s.wires.forEach(() => {})
    const id = useSimStore.getState().addComponent(type, 1000 + (col % 6) * 10, 700)
    useSimStore.getState().selectComponents(id ? [id] : [])
    return id
  }, { type, col: col++ })
  if (!id) { report.push({ type, ok: false, problems: ['não foi possível inserir'] }); continue }
  await page.waitForTimeout(250)
  await openInspector().catch(() => {})
  const r = await exercise({ kind: 'component', id })
  const failed = r.results.filter((x) => !x.ok)
  const errors = pageErrors.slice(errorsBefore)
  const problems = [...failed.map((x) => `${x.label}${x.error ? ` (${x.error})` : ' (sem efeito)'}`), ...(r.overflow ? [`transbordo horizontal: ${r.wide?.join(', ')}`] : []), ...errors.map((e) => `consola: ${e}`)]
  report.push({ type, controls: r.results.length, ok: problems.length === 0, problems })
  console.log(`${problems.length ? '✗' : '✓'} ${type} · ${r.results.length} controlos${problems.length ? ` · ${problems.length} problema(s)` : ''}`)
}

// Cabo e borne: dois bornes ligados por um cabo.
{
  const errorsBefore = pageErrors.length
  const ids = await page.evaluate(async () => {
    const useSimStore = await __sweep.store()
    const s = useSimStore.getState()
    for (const c of s.components) s.deleteComponents([c.id])
    const a = useSimStore.getState().addComponent('breaker3p', 1000, 700)
    const b = useSimStore.getState().addComponent('breaker3p', 1200, 700)
    const st = useSimStore.getState()
    const ta = st.components.find((c) => c.id === a).terminals[0].id
    const tb = st.components.find((c) => c.id === b).terminals[0].id
    st.addWire(ta, tb)
    const wire = useSimStore.getState().wires.at(-1)
    useSimStore.getState().selectWire(wire.id)
    return { wire: wire.id, terminal: ta }
  })
  await page.waitForTimeout(300); await openInspector().catch(() => {})
  const w = await exercise({ kind: 'wire', id: ids.wire })
  const wp = [...w.results.filter((x) => !x.ok).map((x) => `${x.label}${x.error ? ` (${x.error})` : ' (sem efeito)'}`), ...(w.overflow ? [`transbordo horizontal: ${w.wide?.join(', ')}`] : []), ...pageErrors.slice(errorsBefore).map((e) => `consola: ${e}`)]
  report.push({ type: 'cabo', controls: w.results.length, ok: !wp.length, problems: wp })
  console.log(`${wp.length ? '✗' : '✓'} cabo · ${w.results.length} controlos${wp.length ? ` · ${wp.length} problema(s)` : ''}`)

  const errorsBefore2 = pageErrors.length
  await page.evaluate(async (id) => { const useSimStore = await __sweep.store(); useSimStore.getState().selectWire(null); useSimStore.getState().selectTerminal(id) }, ids.terminal)
  await page.waitForTimeout(300); await openInspector().catch(() => {})
  const t = await exercise({ kind: 'terminal', id: ids.terminal })
  const tp = [...t.results.filter((x) => !x.ok).map((x) => `${x.label}${x.error ? ` (${x.error})` : ' (sem efeito)'}`), ...(t.overflow ? [`transbordo horizontal: ${t.wide?.join(', ')}`] : []), ...pageErrors.slice(errorsBefore2).map((e) => `consola: ${e}`)]
  report.push({ type: 'borne', controls: t.results.length, ok: !tp.length, problems: tp })
  console.log(`${tp.length ? '✗' : '✓'} borne · ${t.results.length} controlos${tp.length ? ` · ${tp.length} problema(s)` : ''}`)
}

const bad = report.filter((r) => !r.ok)
console.log(`\n${report.length - bad.length}/${report.length} sem problemas`)
for (const r of bad) console.log(`\n${r.type}:\n  - ${r.problems.join('\n  - ')}`)
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2))
await browser.close()
process.exit(bad.length ? 1 : 0)
