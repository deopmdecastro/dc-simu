import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Dados sintéticos num navegador descartável. Não consulta contas, APIs ou projetos reais.
const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.GRAFCET_TEST_OUTPUT || path.resolve('runtime/grafcet-ux-modals')
await mkdir(output, { recursive: true })
const browser = await chromium.launch(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  performance.setResourceTimingBufferSize(10000)
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
// O Vite (com HMR) serve módulos alterados com «?t=…»: um import('/src/…') sem esse sufixo criava
// OUTRA instância da store e os dados de teste iam para uma store que a página não usa. Importa o módulo
// exatamente com o URL que a aplicação carregou.
globalThis.__dcAppImport = (path) => {
  const hit = performance.getEntriesByType('resource').map((entry) => entry.name)
    .filter((url) => { try { return new URL(url).pathname === path } catch { return false } }).pop()
  return import(hit || path)
}
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const checks = []
const check = (value, label) => { assert.ok(value, label); checks.push(label); console.log('PASS — ' + label) }
const dialog = () => page.getByRole('dialog')
const save = () => dialog().getByRole('button', { name: 'Guardar alterações', exact: true }).click()
const close = async () => { await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'hidden' }) }
const readProgram = () => page.evaluate(async () => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  return JSON.parse(JSON.stringify(useSimStore.getState().grafcet))
})
const openStep = () => page.locator('[data-step-id="ux-step-1"]').dblclick()
const openTransition = () => page.getByRole('button', { name: /^Transição T1:/ }).locator('text').first().dblclick()
const openAction = () => page.locator('.grafcet-graph-action:not(.grafcet-action-free)').first().dblclick()
const capture = (name) => page.screenshot({ path: path.join(output, name + '.png') })
const closeToolboxIfOpen = async () => {
  // O cabeçalho da paleta passou a ser o SidePanelHeader comum («Recolher ferramentas»).
  const closeButton = page.getByRole('button', { name: /^Recolher ferramentas/ })
  if (await closeButton.count() && await closeButton.first().isVisible()) await closeButton.first().click()
  await page.getByRole('button', { name: 'Fechar componentes' }).waitFor({ state: 'hidden' })
}
const fitsViewport = async () => dialog().evaluate((element) => {
  const box = element.getBoundingClientRect()
  const footer = element.querySelector('.grafcet-property-footer').getBoundingClientRect()
  return box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && footer.bottom <= innerHeight + 1 && element.scrollWidth <= element.clientWidth + 1
})

try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  await dialog().getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('QA GRAFCET — modais sintéticas')
  await dialog().getByRole('radio', { name: /^GRAFCET / }).check()
  await dialog().getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.locator('.grafcet-canvas').waitFor()
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const positions = [[151, 80], [151, 270], [151, 460], [451, 270], [451, 460]]
    const steps = ['1', '5', '6', '3', '7'].map((name, index) => ({
      id: 'ux-step-' + name, name, initial: index === 0, stepType: index === 0 ? 'initial' : 'simple',
      action: '', condition: '1', actions: index === 0 ? [{ id: 'ux-action', address: 'Q1', variable: 'Q1', condition: '1', kind: 'N', type: 'simple', allocation: 'continuous' }] : [],
      x: positions[index][0], y: positions[index][1], pinned: true,
    }))
    useSimStore.getState().setGrafcet({ name: 'QA sintética', steps, transitions: [{ id: 'ux-transition', from: ['ux-step-1'], to: ['ux-step-5'], condition: 'I1' }] }, 'force')
  })

  await openStep()
  await page.locator('#step-name-input').waitFor()
  check(await fitsViewport(), 'etapa cabe no ecrã de 1440×900 com rodapé acessível')
  check(await dialog().evaluate((element) => element.getBoundingClientRect().height < 650), 'etapa deixa de ocupar quase toda a altura do ecrã')
  await page.locator('#step-name-input').fill('')
  await save()
  check(await page.locator('#step-name-error').isVisible(), 'nome vazio continua a impedir guardar')
  await page.locator('#step-name-input').fill('Rascunho por cancelar')
  await capture('desktop-step')
  await close()
  check((await readProgram()).steps[0].name === '1', 'cancelar descarta o rascunho da etapa')

  await openTransition()
  await page.locator('#trans-condition-input').waitFor()
  check(await fitsViewport(), 'transição cabe no ecrã com Guardar visível')
  check(!await page.locator('#trans-reference-input').isVisible(), 'anotações opcionais começam recolhidas')
  const origins = dialog().getByRole('group', { name: 'Origens · todas ativas', exact: true })
  const destinations = dialog().getByRole('group', { name: 'Destinos · ativados juntos', exact: true })
  await destinations.getByRole('searchbox').fill('7')
  await destinations.getByRole('checkbox', { name: /^Etapa 7/ }).check()
  await destinations.getByRole('searchbox').fill('')
  check(await destinations.getByRole('checkbox', { name: /^Etapa 7/ }).isChecked(), 'pesquisar e voltar conserva a seleção do destino')
  await origins.getByText('Ligar pelo número', { exact: true }).click()
  await origins.getByRole('textbox', { name: 'Ligar origem pelo número da etapa' }).fill('3')
  await origins.getByRole('button', { name: 'Ligar nº', exact: true }).click()
  check(await origins.getByRole('checkbox', { name: /^Etapa 3/ }).isChecked(), 'ligar pelo número mantém o percurso rápido nas origens')
  await origins.getByText('Ligar pelo número', { exact: true }).click()
  await capture('desktop-transition')
  await dialog().locator('.grafcet-dialog-annotations > summary').click()
  await page.locator('#trans-reference-input').fill('Referência de teste')
  await page.locator('#trans-condition-input').fill('I1 **')
  await save()
  check(await page.locator('#trans-condition-error').isVisible(), 'expressão inválida não é aceite pela modal compacta')
  await page.locator('#trans-condition-input').fill('I1 * /I2')
  await save()
  await dialog().waitFor({ state: 'hidden' })
  const transition = (await readProgram()).transitions[0]
  check(transition.from.includes('ux-step-3') && transition.to.includes('ux-step-7') && transition.targetInfo === 'Referência de teste', 'guardar preserva origens, destinos e anotação')

  await openAction()
  await page.locator('#action-var-input').waitFor()
  check(await fitsViewport(), 'ação cabe no ecrã com o rodapé acessível')
  check(await dialog().evaluate((element) => element.getBoundingClientRect().height < 800), 'opções da ação têm uma altura útil em vez de uma lista extensa de cartões')
  await dialog().getByRole('radio', { name: 'D — Retardada', exact: true }).check()
  await page.locator('#action-time-input').fill('0.25')
  await dialog().getByRole('radio', { name: /^Ao ativar/ }).check()
  check(await page.locator('#action-time-input').count() === 0, 'alocação de ativação esconde a duração incompatível')
  await dialog().getByRole('radio', { name: /^Durante a etapa/ }).check()
  check(await page.locator('#action-time-input').inputValue() === '0.25', 'alternar alocação conserva a duração do rascunho')
  await capture('desktop-action')
  await page.keyboard.press('Control+Enter')
  await dialog().waitFor({ state: 'hidden' })
  check((await readProgram()).steps[0].actions[0].timeMs === 250, 'atalho de guardar conserva a duração fracionária')

  await page.setViewportSize({ width: 1024, height: 768 })
  await closeToolboxIfOpen()
  await openTransition()
  await page.locator('#trans-condition-input').waitFor()
  check(await fitsViewport(), 'transição conserva rodapé visível a 1024×768')
  await capture('laptop-transition')
  await close()

  await page.setViewportSize({ width: 390, height: 844 })
  // Botão «ajustar vista» (rótulo atual «Ajustar à largura»); sem ele à vista, Ctrl+0 faz o mesmo.
  const fitButton = page.getByRole('button', { name: /^Ajustar/ }).first()
  if (await fitButton.isVisible().catch(() => false)) await fitButton.click()
  else { await page.locator('.grafcet-canvas').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('Control+0') }
  await closeToolboxIfOpen()
  for (const [name, open] of [['step', openStep], ['transition', openTransition], ['action', openAction]]) {
    await open()
    await dialog().waitFor()
    check(await fitsViewport(), name + ': sem transbordo horizontal e com rodapé acessível a 390×844')
    const lastButton = dialog().getByRole('button').last()
    await lastButton.focus()
    await page.keyboard.press('Tab')
    check(await dialog().evaluate((element) => element.contains(document.activeElement)), name + ': Tab mantém o foco dentro da modal')
    await capture('mobile-' + name)
    await close()
  }
  check(errors.length === 0, 'sem erros de execução no navegador')
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ ok: true, checks, browserErrors: errors }, null, 2) + '\n')
  console.log(`OK — ${checks.length} verificações de modais`)
} finally {
  await context.close()
  await browser.close()
}
