import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// LADDER-SIM-02/03 no navegador: XOR, LIMIT, SCALE, JMP/LBL, pontos de paragem e passo a passo.
const baseURL = process.env.EDITORS_TEST_URL || process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.EDITORS_TEST_OUTPUT || path.resolve('runtime/ladder-blocks')
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  localStorage.setItem('dcsimu:grafcet:autosync', '0')
  localStorage.setItem('dcsimu:ladder:status-open', '1')
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const checks = []
const check = (value, label) => { assert.ok(value, label); checks.push(label); console.log('PASS — ' + label) }
const store = (fn, arg) => page.evaluate(async ([source, a]) => {
  const { useSimStore } = await import('/src/store/useSimStore.ts')
  // eslint-disable-next-line no-new-func
  return new Function('s', 'a', 'S', `return (${source})(s, a, S)`)(useSimStore.getState(), a, useSimStore)
}, [fn.toString(), arg ?? null])

await page.goto(baseURL + '/dashboard')
await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
const dialog = page.getByRole('dialog')
await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Blocos Ladder')
await dialog.getByRole('radio', { name: /^Tudo/ }).check()
await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
await page.locator('.panel3d-empty').waitFor({ timeout: 60_000 })
await page.locator('button', { hasText: /^Ladder$/ }).first().click()
await page.getByRole('button', { name: 'Criar primeira network' }).click()
await page.waitForTimeout(400)

// ---- paleta: XOR, LIMIT, SCALE, JMP, LBL inseridos por clique
for (const name of ['XOR', 'LIMIT', 'SCALE']) {
  await page.locator('.ladder-palette-item', { has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) }).first().click()
  await page.waitForTimeout(200)
}
let r0 = await store((s) => s.ladder.rungs[0])
check(r0.branches[0].elements.some((el) => el.contactType === 'XOR' && el.xorAddress && el.xorAddress !== el.address), 'paleta: XOR inserido com dois operandos')
check(!!r0.limit && !!r0.scale, 'paleta: LIMIT e SCALE inseridos')
check(await page.locator('svg text', { hasText: /^XOR$/ }).count() > 0, 'XOR desenhado na network')
check(await page.locator('svg text', { hasText: /^LIMIT$/ }).count() > 0 && await page.locator('svg text', { hasText: /^SCALE$/ }).count() > 0, 'caixas LIMIT e SCALE desenhadas')
check(await page.locator('svg text', { hasText: /^IN_MAX$/ }).count() > 0, 'SCALE mostra os pinos IN_MIN/IN_MAX/OUT_MIN/OUT_MAX')

// duplo clique na caixa LIMIT abre o diálogo com MN/IN/MX/OUT
await page.locator('.lnet-hit[title^="LIMIT"]').first().dblclick()
const limitDialog = page.getByRole('dialog')
await limitDialog.getByText('MN — mínimo').waitFor()
check(await limitDialog.getByText('OUT — destino').count() === 1, 'diálogo do LIMIT com MN/IN/MX/OUT')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// ---- programa de teste: N1 JMP FIM se I0.0 · N2 I0.1→Q0.0 · N3 LBL FIM, I0.1→Q0.1 + LIMIT
await store((s, a, S) => {
  const mk = (id, extra) => ({ id, name: '', enabled: true, branches: [], coils: [], ...extra })
  const c = (id, address, contactType = 'NO', more = {}) => ({ kind: 'contact', id, address, contactType, ...more })
  S.setState({ dirty: true, ladder: { rungs: [
    mk('n1', { branches: [{ id: 'b1', elements: [c('c1', 'I0.0')] }], jump: { label: 'FIM', mode: 'JMP' } }),
    mk('n2', { branches: [{ id: 'b2', elements: [c('c2', 'I0.1')] }], coils: [{ kind: 'coil', id: 'k2', address: 'Q0.0', coilType: 'COIL' }] }),
    mk('n3', { label: 'FIM', branches: [{ id: 'b3', elements: [c('c3', 'I0.1', 'XOR', { xorAddress: 'I0.2' })] }], coils: [{ kind: 'coil', id: 'k3', address: 'Q0.1', coilType: 'COIL' }], limit: { mn: '0', in: 'MW0', mx: '100', out: 'MW2' } }),
  ] } })
})
await page.waitForTimeout(400)
check(await page.locator('#rung-n1 svg text', { hasText: /^JMP$/ }).count() === 1, 'JMP desenhado como bobina de salto')
check(await page.locator('#rung-n1 svg text', { hasText: /^FIM$/ }).count() === 1 && await page.locator('#rung-n3 svg text', { hasText: /^FIM$/ }).count() === 1, 'etiqueta FIM no JMP e no LBL')
check(await page.locator('.ladder-chip.is-label', { hasText: 'LBL FIM' }).count() === 1, 'chip «LBL FIM» no cabeçalho da network 3')
await page.getByRole('tab', { name: /^Verificação/ }).click()
await page.waitForTimeout(200)
const lintText = (await page.locator('.ladder-lint-row').allTextContents()).join(' | ')
check(!/salta para trás|nenhuma network tem a etiqueta/.test(lintText), 'Verificação: salto válido para a frente sem erro')

// ---- ponto de paragem na network 3 (botão ● no cabeçalho)
await page.getByRole('button', { name: 'Pôr um ponto de paragem na network 3' }).click()
check((await store((s) => s.ladderBreakpoints.n3)) === 'rising', 'botão ● cria ponto de paragem «ao ligar»')
await store((s) => { s.play() })
await page.waitForTimeout(500)
check((await store((s) => s.sim.runState)) === 'running', 'sem flanco na network 3 a simulação continua em RUN')
await store((s) => { s.setForce('I0.1', true) })
for (let i = 0; i < 40 && (await store((s) => s.sim.runState)) !== 'paused'; i++) await page.waitForTimeout(200)
const hit = await store((s) => ({ hit: s.ladderBreakHit, q1: s.runtime.table['Q0.1'], run: s.sim.runState, ev: s.sim.events[0]?.message }))
check(hit.hit?.rungId === 'n3' && hit.run === 'paused', 'RUN pára no ponto de paragem da network 3')
check(hit.q1 === true, 'o ciclo terminou inteiro antes da pausa (Q0.1 = 1)')
check(/^Ponto de paragem: Network 3 passou a conduzir/.test(hit.ev ?? ''), `evento PT-PT registado (${hit.ev})`)
await page.waitForTimeout(400)
check(await page.locator('.ladder-rung-card.is-break-hit').count() === 1, 'network 3 destacada a vermelho')
check(await page.locator('.ladder-debug-hit').count() === 1, 'separador Depuração aberto com a mensagem do ponto de paragem')
await page.screenshot({ path: path.join(output, 'ponto-de-paragem.png') })

// ---- passo a passo
const before = await store((s) => s.sim.scanCount)
await page.getByRole('button', { name: 'Passo (1 ciclo)' }).click()
await page.waitForTimeout(300)
const after = await store((s) => ({ n: s.sim.scanCount, run: s.sim.runState, cur: s.ladderTraceCursor }))
check(after.n === before + 1 && after.run === 'paused', `Passo executa exatamente 1 ciclo (${before} → ${after.n}) e mantém a pausa`)
await page.getByRole('button', { name: 'Network ▶' }).click()
await page.waitForTimeout(200)
check(await page.locator('#rung-n2.is-trace-cursor').count() === 1, 'Network ▶ move o cursor do rasto para a network 2')
check(await page.locator('.ladder-debug-step', { hasText: 'Q0.0=1' }).count() === 1, 'rasto mostra o valor escrito pela network 2 (Q0.0=1)')

// ---- JMP ativo: a network 2 é saltada
await store((s) => { s.setForce('I0.0', true) })
await page.getByRole('button', { name: 'Passo (1 ciclo)' }).click()
await page.waitForTimeout(300)
check(await page.locator('#rung-n2 .ladder-chip', { hasText: 'saltada' }).count() === 1, 'com I0.0 = 1 o JMP salta a network 2 (chip «saltada»)')
check(await page.locator('.ladder-debug-step.is-skipped').count() === 1, 'rasto marca a network saltada')
check((await store((s) => s.runtime.table['Q0.0'])) === true, 'a saída da network saltada mantém o último valor')
await page.screenshot({ path: path.join(output, 'passo-a-passo.png'), fullPage: false })

// ---- F9 remove o ponto de paragem da network ativa
await page.locator('#rung-n3 .ladder-network-title').click()
await page.locator('#rung-n3 .lnet-scroll').click({ position: { x: 5, y: 5 } })
await page.keyboard.press('F9')
await page.waitForTimeout(200)
check(!(await store((s) => s.ladderBreakpoints.n3)), 'F9 retira o ponto de paragem da network ativa')
await store((s) => { s.stop(); s.clearForces() })

check(errors.length === 0, `sem erros de página (${errors.join(' | ') || 'nenhum'})`)
await browser.close()
console.log(`[ladder-blocks-ui] OK — ${checks.length} verificações`)
