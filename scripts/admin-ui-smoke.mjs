import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Painel de administração em ecrãs pequenos: secções alcançáveis, linhas curtas,
// barra de gravação que não tapa campos e alvos de toque com altura suficiente.
// Contexto descartável, sem API. Requer Vite em ADMIN_TEST_URL (ou EDITOR3D_TEST_URL).
const baseURL = process.env.ADMIN_TEST_URL || process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.ADMIN_UI_TEST_OUTPUT
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL ? { channel: process.env.EDITOR3D_TEST_CHANNEL } : {})
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks += 1; console.log('PASS — ' + message) }
const capture = async (page, name) => { if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, name + '.png') }) } }

async function session(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  await context.addInitScript(() => {
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.removeItem('dcsimu:supabase:config:v1')
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL + '/admin')
  await page.locator('.dx-admin').first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(1000)
  return { context, page, errors }
}

/** Abre uma secção em qualquer largura: folha do seletor no telefone, faixa/lateral fora dele. */
async function openSection(page, name) {
  const picker = page.locator('.adm-picker .tm-trigger')
  if (await picker.count() > 0) {
    await picker.click()
    const sheet = page.getByRole('menu', { name: 'Secções da administração' })
    await sheet.waitFor({ timeout: 8000 })
    await sheet.getByRole('menuitem').filter({ hasText: name }).first().click()
    await sheet.waitFor({ state: 'detached', timeout: 8000 })
  } else {
    const tab = page.locator('.adm-tablist').getByRole('tab', { name: new RegExp('^' + name) })
    await tab.scrollIntoViewIfNeeded()
    await tab.click()
  }
  await page.waitForTimeout(450)
}

try {
  // ------------------------------------------------------------------ telemóvel
  {
    const { context, page, errors } = await session(390, 844)

    // 0) resumo: indicadores com ícone, cabeçalho sem botões empilhados,
    //    pendências sem ponto órfão e atividade sem identificações repetidas
    const tiles = page.locator('.adm-tile')
    check(await tiles.count() === 6, 'Telemóvel: o resumo mostra os seis indicadores')
    check(await tiles.locator('.adm-tile-icon svg').count() === 6, 'Telemóvel: cada indicador tem o seu ícone')
    const tileBox = await tiles.evaluateAll((list) => list.map((el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), height: Math.round(r.height) } }))
    check(new Set(tileBox.map((t) => t.left)).size === 2, 'Telemóvel: indicadores em duas colunas')
    check(Math.max(...tileBox.map((t) => t.height)) <= 132, `Telemóvel: indicador ≤ 132 px (medido: ${tileBox.map((t) => t.height).join(', ')})`)
    const clear = page.locator('.adm-clear')
    if (await clear.count() === 1) {
      const clearBox = await clear.evaluate((el) => { const icon = el.querySelector('.adm-attn-icon').getBoundingClientRect(); const text = el.querySelector('.adm-attn-text').getBoundingClientRect(); return { iconTop: Math.round(icon.top), textTop: Math.round(text.top) } })
      check(Math.abs(clearBox.iconTop - clearBox.textTop) <= 14, 'Telemóvel: o ícone de «Sem pendências» fica ao lado do texto, não numa linha própria')
    }
    const headBtns = await page.locator('.dx-admin-head-actions .dx-btn').evaluateAll((list) => list.map((el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height) } }))
    check(headBtns.length === 2 && headBtns[0].top === headBtns[1].top && Math.min(...headBtns.map((b) => b.height)) >= 40, 'Telemóvel: «Novo componente 3D» e «Projetos» lado a lado, com altura de toque')
    const quick = page.locator('.adm-quick-grid button')
    check(await quick.count() === 4, 'Telemóvel: acesso rápido com as quatro áreas mais usadas')
    const quickLeft = await quick.evaluateAll((list) => list.map((el) => Math.round(el.getBoundingClientRect().left)))
    check(new Set(quickLeft).size === 2, 'Telemóvel: acesso rápido em duas colunas')
    const dupMeta = await page.locator('.adm-activity-text small').evaluateAll((list) => list.filter((el) => { const parts = el.textContent.split('·').map((p) => p.trim()).filter(Boolean); return new Set(parts).size !== parts.length }).length)
    check(dupMeta === 0, 'Resumo: a atividade não repete a mesma identificação na mesma linha')
    check(await page.locator('.adm-card-action').count() >= 3, 'Resumo: cada cartão tem uma única ação no cabeçalho')
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Telemóvel: resumo sem deslocamento horizontal')
    await capture(page, 'adm-telefone-resumo')

    // 1) navegação: um seletor com todas as secções, não uma faixa que desliza
    check(await page.locator('.adm-picker .tm-trigger').count() === 1, 'Telemóvel: a secção atual aparece num seletor único')
    check(await page.locator('.adm-tablist').count() === 0, 'Telemóvel: a faixa de nove separadores deixou de existir')
    await page.locator('.adm-picker .tm-trigger').click()
    const sheet = page.getByRole('menu', { name: 'Secções da administração' })
    await sheet.waitFor({ timeout: 8000 })
    check(await sheet.evaluate((el) => el.classList.contains('is-sheet')), 'Telemóvel: a lista de secções abre como folha inferior')
    check(await sheet.locator('[data-tm-item]').count() === 9, 'Telemóvel: as nove secções estão todas na folha')
    for (const group of ['Geral', 'Conteúdo', 'Gestão', 'Sistema']) check(await sheet.getByRole('heading', { name: group }).count() === 1, `Telemóvel: o grupo «${group}» continua a agrupar as secções`)
    check(await sheet.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 1 }), 'Telemóvel: a folha fica encostada ao ecrã (sem sair pelos lados)')
    await sheet.getByRole('menuitem').filter({ hasText: 'Registos' }).first().click()
    await sheet.waitFor({ state: 'detached', timeout: 8000 })
    check(/Registos de atividade/.test(await page.locator('.adm-main').innerText()), 'Telemóvel: escolher «Registos» muda a secção')
    check(await page.locator('.adm-picker .tm-trigger').innerText().then((text) => /Registos/.test(text)), 'Telemóvel: o seletor mostra a nova secção')
    await capture(page, 'adm-telefone-registos')

    // 2) cabeçalho compacto (antes gastava ~250 px do ecrã)
    const head = await page.locator('.adm-head').evaluate((el) => Math.round(el.getBoundingClientRect().height))
    check(head <= 160, `Telemóvel: o cabeçalho ocupa ${head} px (limite 160)`)
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Telemóvel: administração sem deslocamento horizontal')

    // 3) registos: os campos de data dizem o que são
    check(await page.getByLabel('Desde').isVisible() && await page.getByLabel('Até').isVisible(), 'Telemóvel: os campos «De» e «Até» têm nome visível')

    // 4) componentes: linha curta, ações ao alcance do polegar
    await openSection(page, 'Componentes')
    const rows = page.locator('.cb-component')
    await rows.first().waitFor()
    const heights = await rows.evaluateAll((list) => list.slice(0, 8).map((el) => Math.round(el.getBoundingClientRect().height)))
    check(Math.max(...heights) <= 150, `Telemóvel: cada componente ocupa ≤ 150 px (medido: ${heights.join(', ')})`)
    check(await rows.first().getByRole('button', { name: 'Bloquear…' }).isVisible(), 'Telemóvel: «Bloquear…» fica à mão na linha')
    await rows.first().getByRole('button', { name: 'Mais ações' }).click()
    const rowMenu = page.locator('.adm-menu-list')
    await rowMenu.waitFor()
    check(await rowMenu.getByRole('menuitem', { name: /Arquivar/ }).count() === 1, 'Telemóvel: «Arquivar…» passa para o menu da linha')
    check(await rowMenu.getByRole('menuitem', { name: /Eliminar/ }).count() === 1, 'Telemóvel: «Eliminar…» continua alcançável')
    await page.keyboard.press('Escape')
    const help = page.locator('.adm-help')
    check(await help.count() === 1 && !(await help.evaluate((el) => el.hasAttribute('open'))), 'Telemóvel: a nota de ajuda começa fechada (a lista ganha 130 px)')
    await capture(page, 'adm-telefone-componentes')

    // 5) planos: a barra de gravação não tapa os últimos campos
    await openSection(page, 'Planos e preços')
    const bar = page.locator('.cb-save-bar')
    await bar.waitFor()
    const barBox = await bar.boundingBox()
    check(barBox.y + barBox.height <= 844 + 1, 'Telemóvel: a barra de gravação cabe no ecrã')
    check(await bar.evaluate((el) => el.classList.contains('is-narrow')), 'Telemóvel: a barra de gravação usa a versão estreita')
    check(await bar.getByRole('button', { name: 'Guardar planos' }).isVisible(), 'Telemóvel: «Guardar planos» continua visível')
    const reserve = await page.locator('.adm-main').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))
    check(reserve >= barBox.height, `Telemóvel: o conteúdo reserva ${Math.round(reserve)} px para a barra (altura ${Math.round(barBox.height)} px)`)
    await capture(page, 'adm-telefone-planos')

    // 6) utilizadores: ações da conta numa grelha legível
    await openSection(page, 'Utilizadores')
    const actions = page.locator('.cb-user-actions').first()
    await actions.waitFor()
    const actionHeights = await actions.locator('> .dx-btn, > .adm-menu > .dx-btn').evaluateAll((list) => list.map((el) => Math.round(el.getBoundingClientRect().height)))
    check(actionHeights.length > 0 && Math.min(...actionHeights) >= 32, `Telemóvel: botões da conta com ≥ 32 px de altura (${actionHeights.join(', ')})`)
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Telemóvel: utilizadores sem deslocamento horizontal')

    assert.deepEqual(errors, [], 'Telemóvel: nenhuma exceção JavaScript')
    check(true, 'Telemóvel: percurso sem exceções JavaScript')
    await context.close()
  }

  // ------------------------------------------------------------------ tablet
  {
    const { context, page, errors } = await session(768, 1024)
    const nav = page.locator('.adm-tablist')
    await nav.waitFor()
    const layout = await nav.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const tabs = [...el.querySelectorAll('.adm-tab')].map((tab) => { const r = tab.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) } })
      return { width: Math.round(box.width), scrollWidth: el.scrollWidth, tabs, lines: new Set(tabs.map((t) => t.top)).size }
    })
    check(layout.lines === 2, `Tablet: as nove secções cabem em duas linhas (medido: ${layout.lines})`)
    check(layout.scrollWidth <= layout.width + 1, `Tablet: a faixa já não desliza (${layout.scrollWidth} ≤ ${layout.width})`)
    check(layout.tabs.every((tab) => tab.left >= 0 && tab.right <= 768), 'Tablet: todas as secções ficam dentro do ecrã')
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Tablet: sem deslocamento horizontal')
    await capture(page, 'adm-tablet-resumo')
    assert.deepEqual(errors, [], 'Tablet: nenhuma exceção JavaScript')
    check(true, 'Tablet: percurso sem exceções JavaScript')
    await context.close()
  }

  // ------------------------------------------------------------------ portátil (1024 px)
  // A 1024 px a navegação lateral ainda existe e a coluna de conteúdo é estreita:
  // era aqui que a lista de componentes e os filtros das contas empurravam a
  // página para fora do ecrã (31 px e 114 px, medidos antes da correção).
  {
    const { context, page, errors } = await session(1024, 900)
    for (const section of ['Resumo', 'Componentes', 'Utilizadores', 'Registos']) {
      await openSection(page, section)
      const info = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }))
      check(info.scrollWidth <= info.innerWidth, `Portátil: «${section}» sem deslocamento horizontal (${info.scrollWidth}/${info.innerWidth})`)
    }
    await openSection(page, 'Componentes')
    const rows = page.locator('.cb-component')
    await rows.first().waitFor()
    const heights = await rows.evaluateAll((list) => list.slice(0, 6).map((el) => Math.round(el.getBoundingClientRect().height)))
    check(Math.max(...heights) <= 200, `Portátil: a linha do componente não estica (${heights.join(', ')} px)`)
    await capture(page, 'adm-portatil-componentes')
    assert.deepEqual(errors, [], 'Portátil: nenhuma exceção JavaScript')
    check(true, 'Portátil: percurso sem exceções JavaScript')
    await context.close()
  }

  // ------------------------------------------------------------------ secretária
  {
    const { context, page, errors } = await session(1440, 900)
    check(await page.locator('.adm-tablist').count() === 1 && await page.locator('.adm-picker').count() === 0, 'Secretária: mantém-se a navegação lateral')
    check(await page.locator('.adm-tab .adm-tab-main svg').count() === 9, 'Secretária: as nove secções têm ícone na navegação lateral')
    const deskTiles = await page.locator('.adm-tile').evaluateAll((list) => list.map((el) => Math.round(el.getBoundingClientRect().left)))
    check(new Set(deskTiles).size === 3, 'Secretária: indicadores em três colunas')
    const deskQuick = await page.locator('.adm-quick-grid button').evaluateAll((list) => list.map((el) => Math.round(el.getBoundingClientRect().left)))
    check(new Set(deskQuick).size === 4, 'Secretária: acesso rápido em quatro colunas')
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Secretária: resumo sem deslocamento horizontal')
    await capture(page, 'adm-desktop-resumo')
    const side = await page.locator('.adm-tablist').boundingBox()
    check(Boolean(side) && side.width <= 240, `Secretária: navegação lateral estreita (${Math.round(side.width)} px)`)
    await openSection(page, 'Planos e preços')
    const bar = page.locator('.cb-save-bar')
    await bar.waitFor()
    check(!(await bar.evaluate((el) => el.classList.contains('is-narrow'))), 'Secretária: a barra de gravação fica em linha (Descartar · Repor · Guardar)')
    check(await bar.getByRole('button', { name: 'Descartar' }).isVisible() && await bar.getByRole('button', { name: /Repor valores de fábrica/ }).isVisible(), 'Secretária: as três ações continuam à vista')
    await openSection(page, 'Componentes')
    await page.locator('.cb-component').first().waitFor()
    check(await page.locator('.cb-component').first().getByRole('button', { name: 'Arquivar…' }).isVisible(), 'Secretária: as ações ficam na linha, sem menu escondido')
    await capture(page, 'adm-desktop-componentes')
    assert.deepEqual(errors, [], 'Secretária: nenhuma exceção JavaScript')
    check(true, 'Secretária: percurso sem exceções JavaScript')
    await context.close()
  }

  console.log(`OK — ${checks} verificações do painel de administração em 390, 768, 1024 e 1440 px`)
} finally { await browser.close() }
