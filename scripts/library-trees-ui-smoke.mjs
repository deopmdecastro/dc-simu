import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

/**
 * Bibliotecas do Esquema IEC e do GRAFCET organizadas como a do Esquema 3D realista: domínios recolhíveis
 * com ícone na cor do domínio, subpastas (pasta fechada/aberta) com contagem, chips de domínio com contagem
 * e resumo «N · pastas» com Expandir/Recolher. Corre contra `npm run dev:ui-test`. Capturas em runtime/library-trees/.
 */
const baseURL = process.env.LIBRARY_TREES_TEST_URL || 'http://127.0.0.1:5173'
const output = path.resolve('runtime/library-trees')
fs.mkdirSync(output, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.route('**/*', (route) => new URL(route.request().url()).origin === new URL(baseURL).origin && !new URL(route.request().url()).pathname.startsWith('/api/') ? route.continue() : route.abort())
// Política de cookies já aceite (o banner tapava o diálogo «Novo projeto»).
// Sessão local de teste (modo uitest, sem rede), como nos restantes testes do Esquema IEC.
await context.addInitScript(() => {
  try {
    localStorage.setItem('dcsimu:cookie-consent:v1', JSON.stringify({ accepted: true, at: new Date().toISOString(), version: 1 }))
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.removeItem('dcsimu:supabase:config:v1')
  } catch { /* sem armazenamento */ }
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
let passed = 0
const check = (ok, name) => { if (!ok) throw new Error('FAIL — ' + name); passed += 1; console.log('PASS — ' + name) }
const newProject = async (name, type) => {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill(name)
  await dialog.getByRole('radio', { name: type }).check()
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
}
/** Mesma estrutura da biblioteca 3D: domínio > subpastas com ícone de pasta, contagem e chevron. */
const treeShape = (scope) => scope.evaluate((root) => {
  const domains = [...root.querySelectorAll('.dc-library-domain')]
  return domains.map((d) => ({
    id: d.dataset.libraryDomain,
    head: !!d.querySelector(':scope > .dc-library-domain-head .dc-library-domain-icon') && !!d.querySelector(':scope > .dc-library-domain-head .dc-library-domain-count'),
    count: Number(d.querySelector('.dc-library-domain-count')?.textContent),
    folders: [...d.querySelectorAll('.dc-library-folder')].map((f) => ({
      label: f.querySelector('.dc-library-folder-head strong')?.textContent,
      icon: !!f.querySelector('.dc-library-subfolder-icon'),
      count: Number(f.querySelector('.dc-library-folder-count')?.textContent),
    })),
  }))
})
try {
  // ---------------- Esquema IEC ----------------
  await newProject('Árvore IEC', /^Esquema IEC/)
  await page.locator('.dc-cmd-canvas').waitFor()
  const sidebar = page.locator('.dc-cmd-sidebar')
  const iec = await treeShape(sidebar)
  check(iec.map((d) => d.id).join(',') === 'eletricidade,hidraulica,pneumatica', `IEC: domínios como no Esquema 3D (${iec.map((d) => d.id).join(', ')})`)
  check(iec.every((d) => d.head && d.folders.every((f) => f.icon && f.count > 0)), 'IEC: domínios com ícone e contagem; subpastas com ícone de pasta e contagem')
  check(iec.every((d) => d.count === d.folders.reduce((s, f) => s + f.count, 0)), 'IEC: a contagem de cada domínio soma as suas pastas')
  check(iec[0].folders.length === 9 && iec[0].folders[0].label === 'Alimentação', `IEC: Eletricidade agrupa 9 pastas (${iec[0].folders.map((f) => f.label).join(', ')})`)
  const chips = await sidebar.locator('[role="tablist"][aria-label="Domínios dos símbolos"] [role="tab"]').allInnerTexts()
  check(chips.length === 4 && chips.every((c) => /\d+\s*$/.test(c.trim())), `IEC: chips com contagem (${chips.map((c) => c.replace(/\s+/g, ' ').trim()).join(' · ')})`)
  await page.screenshot({ path: path.join(output, 'iec.png'), clip: { x: 0, y: 0, width: 420, height: 900 } })
  await sidebar.getByRole('tab', { name: /^Pneumática/ }).click()
  const pneu = await treeShape(sidebar)
  check(pneu.length === 1 && pneu[0].id === 'pneumatica', 'IEC: o chip «Pneumática» filtra o domínio')
  await sidebar.getByRole('tab', { name: /^Todos/ }).click()
  await sidebar.locator('[data-library-domain="eletricidade"] > .dc-library-domain-head').click()
  check(await sidebar.locator('[data-library-domain="eletricidade"] .dc-library-folder').count() === 0, 'IEC: recolher o domínio esconde as subpastas')
  await sidebar.getByRole('button', { name: 'Expandir', exact: true }).click()
  check(await sidebar.locator('[data-library-domain="eletricidade"] .dc-library-folder').count() === 9, 'IEC: «Expandir» reabre domínios e pastas')
  await sidebar.getByRole('textbox', { name: 'Pesquisar símbolos' }).fill('motor')
  check((await treeShape(sidebar)).every((d) => d.folders.every((f) => f.count > 0)), 'IEC: a pesquisa mostra só as pastas com resultados')

  // ---------------- GRAFCET ----------------
  await newProject('Árvore GRAFCET', /^GRAFCET /)
  const toolbox = page.locator('.grafcet-toolbox')
  await toolbox.waitFor()
  const g = await treeShape(toolbox)
  check(g.length === 1 && g[0].id === 'grafcet' && g[0].head, 'GRAFCET: domínio «GRAFCET · IEC 60848» com ícone e contagem')
  check(g[0].folders.map((f) => f.label).join(' | ') === 'Etapas e ligações | Ações | Ramos simultâneos | Estruturas prontas' && g[0].folders.every((f) => f.icon && f.count > 0), 'GRAFCET: 4 subpastas com ícone de pasta e contagem')
  check(g[0].count === 9 && g[0].count === g[0].folders.reduce((s, f) => s + f.count, 0), `GRAFCET: ${g[0].count} componentes no domínio`)
  await page.screenshot({ path: path.join(output, 'grafcet.png'), clip: { x: 0, y: 0, width: 360, height: 900 } })
  await toolbox.locator('.dc-library-folder-head[title="Recolher Ações"]').click()
  check(await toolbox.getByRole('button', { name: /Ação condicionada/ }).count() === 0, 'GRAFCET: recolher a pasta «Ações» esconde os itens')
  await page.reload(); await toolbox.waitFor()
  check(await toolbox.getByRole('button', { name: /Ação condicionada/ }).count() === 0, 'GRAFCET: a pasta recolhida fica guardada no navegador')
  await toolbox.getByRole('button', { name: 'Expandir', exact: true }).click()
  const step = toolbox.getByRole('button', { name: /^Etapa inicial/ })
  check(await step.isVisible(), 'GRAFCET: «Expandir» reabre as pastas')
  const before = await page.locator('[data-step-id]').count()
  await step.click()
  await page.waitForTimeout(300)
  check(await page.locator('[data-step-id]').count() > before, 'GRAFCET: clicar num item da pasta insere-o no diagrama')
  check(!errors.length, 'Sem exceções na página: ' + (errors.join(' | ') || 'OK'))
  console.log(`\n${passed} verificações das árvores IEC e GRAFCET passaram`)
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  throw error
} finally { await browser.close() }
