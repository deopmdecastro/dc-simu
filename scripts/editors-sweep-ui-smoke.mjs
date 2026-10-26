import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Varredura dos editores (Esquema 3D, Ladder, GRAFCET) num navegador descartável, com dados sintéticos.
const baseURL = process.env.EDITORS_TEST_URL || process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.EDITORS_TEST_OUTPUT || path.resolve('runtime/editors-sweep')
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  localStorage.setItem('dcsimu:grafcet:autosync', '0')
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const checks = []
const check = (value, label) => { assert.ok(value, label); checks.push(label); console.log('PASS — ' + label) }
const store = (fn) => page.evaluate(async (source) => {
  const { useSimStore } = await import('/src/store/useSimStore.ts')
  // eslint-disable-next-line no-new-func
  return new Function('s', `return (${source})(s)`)(useSimStore.getState())
}, fn.toString())

const newProject = async (name, kind) => {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill(name)
  await dialog.getByRole('radio', { name: new RegExp(`^${kind}`) }).check()
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
}
const tab = (label) => page.locator('button', { hasText: new RegExp(`^${label}$`) }).first().click()

// ---------------------------------------------------------------- Esquema
await newProject('Varredura editores', 'Tudo')
await page.locator('.panel3d-empty').waitFor({ timeout: 60_000 })
check((await page.locator('.panel3d-empty strong').textContent()) === 'O esquema está vazio', 'Esquema 2D vazio não diz «esquema 3D»')
await page.getByRole('button', { name: /Visualização 3D/ }).click()
await page.waitForTimeout(600)
check((await page.locator('.panel3d-empty strong').textContent()) === 'O esquema 3D está vazio', 'Visualização 3D vazia mantém «O esquema 3D está vazio»')
await page.screenshot({ path: path.join(output, 'esquema-3d.png') })

// ---------------------------------------------------------------- Ladder
await tab('Ladder')
const create = page.getByRole('button', { name: 'Criar primeira network' })
await create.waitFor()
const iconColor = await create.evaluate((element) => getComputedStyle(element.querySelector('svg')).color)
const buttonBg = await create.evaluate((element) => getComputedStyle(element).backgroundColor)
check(iconColor !== buttonBg && iconColor === 'rgb(255, 255, 255)', `ícone de «Criar primeira network» visível (${iconColor} sobre ${buttonBg})`)
await create.click()
await page.waitForTimeout(500)
for (const name of ['NA', 'NOT', 'SR', 'CTUD']) {
  await page.locator('.ladder-palette-item', { has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) }).first().click()
  await page.waitForTimeout(250)
}
const rung = await store((s) => s.ladder.rungs[0])
check(rung.branches[0].elements.some((el) => el.contactType === 'NOT' && el.address === ''), 'Ladder: NOT inserido pela paleta, sem operando')
check(rung.coils.some((coil) => coil.coilType === 'SR' && coil.resetAddress), 'Ladder: bobina SR inserida com entrada de reset')
check(rung.counter?.counterType === 'CTUD' && !!rung.counter.downAddress, 'Ladder: contador CTUD inserido com entrada CD')
check(await page.locator('svg text', { hasText: /^NOT$/ }).count() > 0, 'Ladder: NOT desenhado na network')
check(await page.locator('svg text', { hasText: /^SR$/ }).count() > 0, 'Ladder: bobina SR desenhada')
check(await page.locator('svg text', { hasText: /^R: %I/ }).count() > 0, 'Ladder: entrada de reset da SR visível')
check(await page.locator('svg text', { hasText: /^CD$/ }).count() > 0, 'Ladder: pino CD do CTUD visível')
await page.getByRole('tab', { name: /^Verificação/ }).click()
await page.waitForTimeout(300)
const lintText = (await page.locator('.ladder-lint-row').allTextContents()).join(' | ')
check(!/inválido/.test(lintText), `Verificação: I0.0/Q0.0 não são «inválidos» (${lintText || 'sem avisos'})`)
await page.screenshot({ path: path.join(output, 'ladder.png') })

// ---------------------------------------------------------------- GRAFCET
await newProject('Varredura GRAFCET', 'GRAFCET')
await page.getByRole('button', { name: /Abrir exemplo de 3 etapas/ }).click()
await page.waitForTimeout(600)
await page.getByRole('tab', { name: /^Simulador/ }).or(page.getByRole('button', { name: /^Simulador/ })).first().click()
await page.locator('button', { hasText: /^Run$/ }).first().click()
await page.waitForTimeout(800)
check(await page.getByText('Ainda sem disparos').isVisible(), 'GRAFCET: histórico começa vazio')
const force = page.locator('.gsim-force').first()
await force.waitFor()
check(await force.isVisible(), 'GRAFCET: transição à espera mostra «Forçar»')
await force.click()
await page.waitForTimeout(600)
const history = page.locator('.gsim-history li')
check(await history.count() >= 1, 'GRAFCET: disparo forçado aparece no histórico')
check((await history.first().textContent()).includes('forçada'), 'GRAFCET: entrada do histórico marcada como forçada')
await page.screenshot({ path: path.join(output, 'grafcet-sim.png') })

// Diff antes de substituir o Ladder gerado.
await page.locator('button', { hasText: /^Gerar Ladder$/ }).first().click()
await page.getByRole('alertdialog').getByRole('button', { name: 'Continuar' }).click()
// Num projeto só GRAFCET a primeira geração abre o Ladder; voltar ao GRAFCET.
await page.waitForTimeout(1600)
await tab('GRAFCET')
await page.waitForTimeout(600)
await page.locator('button', { hasText: /^Ladder atualizado$/ }).first().click()
await page.waitForTimeout(400)
check(await page.getByRole('alertdialog').count() === 0, 'GRAFCET → Ladder: sem diferenças não pede confirmação')
await store((s) => s.setGrafcet({ ...s.grafcet, transitions: s.grafcet.transitions.map((t, i) => (i === 0 ? { ...t, condition: 'I0.3' } : t)) }))
await page.waitForTimeout(600)
await page.locator('button', { hasText: /^Atualizar Ladder$/ }).first().click()
const confirm = page.getByRole('alertdialog')
await confirm.waitFor()
const diffText = await confirm.textContent()
check(/alterada\(s\)/.test(diffText) && /Atualizar o Ladder gerado/.test(diffText), 'GRAFCET → Ladder: confirmação mostra as networks alteradas')
await page.screenshot({ path: path.join(output, 'grafcet-diff.png') })
await confirm.getByRole('button', { name: 'Cancelar' }).click()
await page.waitForTimeout(300)
check(await page.locator('button', { hasText: /^Atualizar Ladder$/ }).count() > 0, 'GRAFCET → Ladder: cancelar não substitui o Ladder')

check(errors.length === 0, `nenhuma exceção JavaScript: ${errors.join(' | ')}`)
console.log(`OK — ${checks.length} verificações da varredura dos editores`)
await browser.close()
