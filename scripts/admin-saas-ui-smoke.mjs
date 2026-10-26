import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// SAAS-PLANS-01 · ADMIN-USERS-01 · ADMIN-COMP-01 · PROJ-COMMENTS-01 · LADDER-COMPILE-01
// Fluxo completo no modo local (sem servidor): preços na página inicial, separador
// «Planos e preços», plano de um utilizador, bloqueio de componente, comentários e compilação.
const baseURL = process.env.EDITORS_TEST_URL || process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.ADMIN_SAAS_TEST_OUTPUT || path.resolve('runtime/admin-saas')
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
})
// A conta ativa escolhe-se com `test:account` (vazio = visitante anónimo).
await context.addInitScript(() => {
  const account = localStorage.getItem('test:account') ?? 'dcsimu-admin'
  if (account) localStorage.setItem('dcsimu:account:session:v1', account)
  else localStorage.removeItem('dcsimu:account:session:v1')
  localStorage.setItem('dcsimu:grafcet:autosync', '0')
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const checks = []
const check = (value, label) => { assert.ok(value, label); checks.push(label); console.log('PASS — ' + label) }
const as = async (account) => { await page.goto(baseURL + '/'); await page.evaluate((value) => localStorage.setItem('test:account', value), account) }
const until = async (fn, label, timeout = 15_000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) { if (await fn()) return true; await page.waitForTimeout(150) }
  throw new Error(`Tempo esgotado: ${label}`)
}

// ---------------------------------------------------------------- página inicial (visitante)
await as('')
await page.goto(baseURL + '/')
await page.locator('#precos').waitFor({ timeout: 60_000 })
const cards = async () => page.locator('#precos .dx-price-card').evaluateAll((list) => list.map((el) => el.getAttribute('data-plan')))
check(JSON.stringify(await cards()) === JSON.stringify(['free', 'pro', 'escola']), 'página inicial: cartões Free, Pro e Escola (Empresa oculto por omissão)')
check(await page.locator('a[href="#precos"]').count() > 0, 'página inicial: ligação «Preços» na navegação')
check(await page.locator('#precos .dx-price-card.is-highlighted[data-plan="pro"]').count() === 1, 'página inicial: Pro destacado')
await page.locator('#precos').scrollIntoViewIfNeeded()
await page.getByRole('radio', { name: /Anual/ }).click()
check(/\/ano/.test(await page.locator('#precos .dx-price-card[data-plan="pro"] .dx-price-value').textContent()), 'página inicial: alternar para preços anuais')
await page.locator('#precos').screenshot({ path: path.join(output, 'landing-precos.png') })

// ---------------------------------------------------------------- admin: planos e preços
await as('dcsimu-admin')
await page.goto(baseURL + '/admin')
await page.getByRole('tab', { name: /Planos e preços/ }).or(page.getByRole('button', { name: /Planos e preços/ })).first().click()
await page.locator('.cb-plan-card[data-plan="escola"]').waitFor()
await page.getByRole('checkbox', { name: 'Mostrar Escola na página inicial' }).uncheck()
await page.getByRole('checkbox', { name: 'Mostrar Empresa na página inicial' }).check()
await page.getByLabel('Preço mensal Pro').fill('15')
await page.getByRole('button', { name: 'Guardar planos' }).click()
await until(() => page.evaluate(() => JSON.parse(localStorage.getItem('dcsimu:saas:pricing:v1') || 'null')?.plans?.find((p) => p.id === 'pro')?.priceMonthly === 15), 'guardar planos')
await page.screenshot({ path: path.join(output, 'admin-planos.png'), fullPage: false })
const storedPricing = await page.evaluate(() => JSON.parse(localStorage.getItem('dcsimu:saas:pricing:v1') || 'null'))
check(storedPricing?.plans?.find((p) => p.id === 'escola')?.showOnLanding === false && storedPricing?.plans?.find((p) => p.id === 'pro')?.priceMonthly === 15, 'admin: planos guardados (Escola oculto, Empresa visível, Pro a 15 €)')

// ---------------------------------------------------------------- admin: utilizadores → User passa a Free com nota
await page.getByRole('tab', { name: /Utilizadores/ }).or(page.getByRole('button', { name: /^Utilizadores/ })).first().click()
const userCard = page.locator('.cb-user[data-user="user@dcsimu.local"]')
await userCard.waitFor()
await userCard.getByRole('button', { name: 'Plano…' }).click()
await userCard.getByLabel('Plano', { exact: true }).selectOption('free').catch(async () => {
  // Select próprio da aplicação (não nativo)
  await userCard.getByLabel('Plano', { exact: true }).click(); await page.getByRole('option', { name: 'Free' }).click()
})
await userCard.getByLabel('Nota interna').fill('Conta de teste')
await userCard.getByRole('button', { name: 'Guardar plano' }).click()
await until(async () => /Plano Free/.test(await userCard.textContent()), 'badge Plano Free')
await userCard.getByRole('button', { name: 'Detalhes' }).click()
await page.screenshot({ path: path.join(output, 'admin-utilizadores.png') })
check(true, 'admin: plano do utilizador alterado para Free com nota interna')

// ---------------------------------------------------------------- admin: componentes → bloquear o primeiro
await page.getByRole('tab', { name: /Componentes/ }).or(page.getByRole('button', { name: /^Componentes/ })).first().click()
const firstRow = page.locator('.cb-components > *').first()
await firstRow.waitFor()
await firstRow.getByRole('button', { name: 'Bloquear…' }).click()
const confirm = page.getByRole('button', { name: 'Confirmar bloqueio' })
check(await confirm.isDisabled(), 'componentes: bloquear sem motivo fica desativado')
await page.getByLabel('Motivo').fill('Modelo em revisão')
await confirm.click()
await until(async () => /Bloqueado/.test(await firstRow.textContent()), 'componente bloqueado')
await page.screenshot({ path: path.join(output, 'admin-componentes.png') })
check(true, 'componentes: componente bloqueado com motivo')
await firstRow.getByRole('button', { name: /Desbloquear/ }).click()
await until(async () => !/Bloqueado por/.test(await firstRow.textContent()), 'componente desbloqueado')
check(true, 'componentes: desbloquear repõe o estado')

// ---------------------------------------------------------------- página inicial reflete o admin
await as('')
await page.goto(baseURL + '/')
await page.locator('#precos').waitFor()
check(JSON.stringify(await cards()) === JSON.stringify(['free', 'pro', 'empresa']), 'página inicial: cartões seguem a escolha do admin (sem Escola, com Empresa)')
check(/15/.test(await page.locator('#precos .dx-price-card[data-plan="pro"] .dx-price-value').textContent()), 'página inicial: novo preço do Pro')

// ---------------------------------------------------------------- utilizador Free: plano, limite, pedido
await as('dcsimu-user')
await page.goto(baseURL + '/dashboard')
const planCard = page.locator('.dx-plan-card')
await planCard.waitFor({ timeout: 30_000 })
check(/Free/.test(await planCard.textContent()), 'painel: mostra o plano Free')
await planCard.getByRole('button', { name: 'Mudar de plano' }).click()
await planCard.getByRole('button', { name: /^Pedir plano/ }).click()
await until(async () => /Pedido pendente/.test(await planCard.textContent()), 'pedido pendente')
check(true, 'painel: pedido de plano enviado e pendente')

// cria um projeto (Free permite 3)
await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
const dialog = page.getByRole('dialog')
await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Projeto SaaS')
await dialog.getByRole('radio', { name: /^Tudo/ }).check()
await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
await page.getByRole('button', { name: /^Comentários/ }).waitFor({ timeout: 60_000 })
await page.getByRole('button', { name: /^Comentários/ }).click()
await page.locator('.dx-comments').waitFor()
await until(async () => /plano|Pro/i.test(await page.locator('.dx-comments').textContent()), 'comentários bloqueados no Free')
check(await page.locator('.dx-comments-locked').count() === 1, 'comentários: dono Free não pode comentar (mensagem do plano)')
await page.getByRole('button', { name: 'Fechar comentários' }).click()

// ---------------------------------------------------------------- Ladder: compilar
await page.locator('button', { hasText: /^Ladder$/ }).first().click()
await page.getByRole('button', { name: 'Criar primeira network' }).click()
await page.waitForTimeout(400)
await page.locator('[data-compile]').click()
const summary = page.locator('.ladder-compile-summary')
await summary.waitFor()
const text = await summary.textContent()
check(/Compila(ção concluída|ção com erros): \d+ erro\(s\), \d+ aviso\(s\)/.test(text), `Ladder: resultado da compilação («${text.slice(0, 70)}…»)`)
check(await page.getByRole('tab', { name: /^Compilação/ }).getAttribute('aria-selected') === 'true', 'Ladder: separador «Compilação» fica ativo')
await page.screenshot({ path: path.join(output, 'ladder-compilar.png') })
check(await page.getByRole('checkbox', { name: /Bloquear RUN com erros/ }).count() === 1, 'Ladder: opção «Bloquear RUN com erros»')

// ---------------------------------------------------------------- admin aprova → comentários
await page.evaluate(() => localStorage.setItem('test:account', 'dcsimu-admin'))
await page.goto(baseURL + '/admin')
await page.getByRole('tab', { name: /Planos e preços/ }).or(page.getByRole('button', { name: /Planos e preços/ })).first().click()
const request = page.locator('.cb-plan-request').first()
await request.waitFor()
await request.getByRole('button', { name: 'Aprovar' }).click()
await until(async () => (await page.locator('.cb-plan-request').count()) === 0 || /Sem pedidos/.test(await page.locator('.cb-plan-requests').last().textContent()), 'pedido aprovado')
check(true, 'admin: pedido de plano aprovado')

await as('dcsimu-user')
await page.goto(baseURL + '/dashboard')
await planCard.waitFor()
await until(async () => /Pro/.test(await planCard.locator('.dx-plan-main > strong').textContent()), 'plano Pro ativo')
check(true, 'painel: plano Pro ativo após aprovação')
await page.getByRole('button', { name: /Opções de Projeto SaaS/ }).first().click()
await page.getByRole('menu').getByRole('button', { name: 'Comentários' }).click()
await page.locator('.dx-comments-form textarea').fill('Rever o borne X1 do contactor KM1.')
await page.getByRole('button', { name: 'Comentar' }).click()
await until(async () => (await page.locator('.dx-comment').count()) === 1, 'comentário publicado')
check(/Rever o borne/.test(await page.locator('.dx-comment').first().textContent()), 'comentários: comentário publicado no projeto')
await page.locator('.dx-comment').first().getByRole('button', { name: 'Marcar resolvido' }).click()
await until(async () => (await page.locator('.dx-comment').count()) === 0, 'filtro por resolver')
check(true, 'comentários: resolvido sai do filtro «Por resolver»')
await page.screenshot({ path: path.join(output, 'comentarios.png') })

check(errors.length === 0, `sem erros de página (${errors.join(' | ') || 'nenhum'})`)
console.log(`admin-saas-ui-smoke: ok (${checks.length} verificações)`)
await browser.close()
