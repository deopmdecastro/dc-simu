import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Dados sintéticos num navegador descartável. Não consulta contas, APIs ou projetos reais.
const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.GRAFCET_TEST_OUTPUT || path.resolve('runtime/grafcet-ux-modals')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  ...(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {}),
  ...(process.env.GRAFCET_TEST_EXECUTABLE ? { executablePath: process.env.GRAFCET_TEST_EXECUTABLE } : {}),
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  performance.setResourceTimingBufferSize(10000)
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  localStorage.removeItem('dcsimu:supabase:config:v1')
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
  const origins = dialog().getByRole('group', { name: 'Origens', exact: true })
  const destinations = dialog().getByRole('group', { name: 'Destinos', exact: true })
  check(await origins.getByRole('button', { name: 'Retirar Etapa 1' }).count() === 1 && await origins.getByRole('listbox').count() === 0, 'as etapas ligadas aparecem uma só vez, como pílulas; a lista só abre ao escolher')
  const destinationPicker = destinations.getByRole('combobox', { name: 'Adicionar etapa de destino' })
  await destinationPicker.fill('7')
  check(await destinations.getByRole('option').count() === 1, 'escrever filtra a lista de etapas (só a Etapa 7)')
  await destinations.getByRole('option', { name: /^Etapa 7/ }).click()
  check(await destinations.getByRole('button', { name: 'Retirar Etapa 7' }).count() === 1, 'escolher na lista junta a etapa aos destinos')
  const originPicker = origins.getByRole('combobox', { name: 'Adicionar etapa de origem' })
  await originPicker.fill('3')
  await originPicker.press('Enter')
  check(await origins.getByRole('button', { name: 'Retirar Etapa 3' }).count() === 1, 'escrever o número e Enter junta a etapa às origens')
  await originPicker.press('ArrowDown')
  await originPicker.press('Escape')
  check(await dialog().isVisible() && await origins.getByRole('listbox').count() === 0, 'Esc fecha a lista de etapas sem fechar a janela')
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

  // Transição-fonte (sem origem, ex.: emergência) e condições de estado G0 <> Xn nas origens.
  const setTransition = (patch) => page.evaluate(async (patch) => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const program = useSimStore.getState().grafcet
    useSimStore.getState().setGrafcet({ ...program, transitions: program.transitions.map((item, index) => (index === 0 ? { ...item, ...patch } : item)) }, 'force')
  }, patch)
  await setTransition({ from: [], to: ['ux-step-7'], condition: '/I7', source: false })
  await page.getByRole('button', { name: /^Transição T1 por ligar:/ }).dispatchEvent('dblclick')
  await page.locator('#trans-condition-input').waitFor()
  check(await dialog().getByText(/Transição solta: faltam origens/).isVisible(), 'sem origem e sem a marca de fonte, a transição continua assinalada como solta')
  await origins.getByRole('button', { name: /Usar como transição-fonte/ }).click()
  check(await dialog().getByText(/Transição solta/).count() === 0 && await origins.getByRole('combobox', { name: 'Adicionar etapa de origem' }).count() === 0, 'transição-fonte: sem aviso de solta e sem seletor de etapas de origem')
  check(await dialog().locator('.grafcet-map-steps .is-source').isVisible(), 'a pré-visualização mostra «Transição-fonte · sempre validada»')
  const stateBlock = origins.getByRole('group', { name: 'Condições de estado de etapa' })
  await stateBlock.getByText('Depende do estado de outra etapa').click()
  await stateBlock.getByRole('combobox', { name: 'Número da etapa para a condição de estado' }).fill('5')
  await stateBlock.getByRole('button', { name: 'Juntar', exact: true }).click()
  check(await page.locator('#trans-condition-input').inputValue() === '/I7 * G0 <> X5', 'Juntar acrescenta G0 <> X5 (X5 inativa) à condição com E')
  check(await stateBlock.getByText('X5 inativa').isVisible(), 'a condição de estado aparece como pílula nas origens')
  await stateBlock.getByRole('button', { name: 'Retirar G0 <> X5 da condição' }).click()
  check(await page.locator('#trans-condition-input').inputValue() === '/I7', 'retirar a pílula devolve a condição anterior')
  await stateBlock.getByRole('combobox', { name: 'Número da etapa para a condição de estado' }).fill('X6')
  await stateBlock.getByRole('radio', { name: 'ativa', exact: true }).click()
  await stateBlock.getByRole('button', { name: 'Juntar', exact: true }).click()
  check(await page.locator('#trans-condition-input').inputValue() === '/I7 * G0 <=> X6', 'estado «ativa» escreve G0 <=> X6')
  await capture('desktop-transition-source')
  await save()
  await dialog().waitFor({ state: 'hidden' })
  check(await page.getByRole('button', { name: /^Transição-fonte T1:/ }).count() === 1, 'no diagrama a transição deixa de dizer «por ligar» e identifica-se como transição-fonte')
  const sourceTransition = (await readProgram()).transitions[0]
  check(sourceTransition.source === true && !sourceTransition.from.length && sourceTransition.condition === '/I7 * G0 <=> X6', 'guardar conserva a transição-fonte e a condição de estado')
  await setTransition({ ...transition, source: false })

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
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    useSimStore.getState().setGrafcet({ name: 'Projeto atual', steps: [], transitions: [] }, 'force')
  })
  const importTrigger = page.getByRole('button', { name: 'Importar GRAFCET', exact: true })
  const openImport = () => importTrigger.click()
  await openImport()
  const returnFocusTarget = await importTrigger.elementHandle()
  const reviewWarnings = [
    'a transição 9 tem ligações incompletas ou uma sincronização ainda não suportada.',
    'a transição 9 tem ligações incompletas ou uma sincronização ainda não suportada.',
    'Destino por referência 51 inexistente; ligação por completar.',
    'condição não suportada em T24: G0 <> X5.',
    'A ação L_Amarela ficou solta: não tem ligação a uma etapa.',
    'A ação L_Amarela ficou solta: não tem ligação a uma etapa.',
    'ação memorizada, de evento ou de forçagem ainda não suportada.',
    'variável de ação inválida: Y7_E+_Vacuo_On.',
  ]
  const reviewProgram = {
    name: 'GRAFCET sintético para teste de revisão',
    steps: [{ id: 'review-step-0', name: '0', initial: true, action: '', condition: '', actions: [], x: 0, y: 0 }],
    transitions: [], comments: [], importReview: { source: 'fluidsim4', warnings: reviewWarnings },
  }
  const reviewFile = { name: 'Grafcet sintético.grafcet', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(reviewProgram)) }
  await page.locator('form.grafcet-import-dialog input[type="file"]').setInputFiles(reviewFile)
  const review = page.getByRole('alertdialog', { name: 'Importar GRAFCET' })
  await review.waitFor()
  check(await review.evaluate((element) => element.contains(document.activeElement)), 'ao abrir, o foco entra no diálogo')
  const warningRegion = review.getByRole('region', { name: `Avisos da importação (${reviewWarnings.length})` })
  check(await warningRegion.getAttribute('tabindex') === '0', 'lista de avisos tem tab stop próprio')
  await warningRegion.focus()
  check(await warningRegion.evaluate((element) => element === document.activeElement), 'a lista focada é identificada como região de avisos')
  await page.keyboard.press('Tab')
  check(await review.getByRole('button', { name: 'Cancelar', exact: true }).evaluate((element) => element === document.activeElement), 'Tab da lista avança para as ações do diálogo')
  await page.keyboard.press('Shift+Tab')
  check(await warningRegion.evaluate((element) => element === document.activeElement), 'Shift+Tab permanece no ciclo de foco do diálogo')
  check(await review.getByText('Grafcet sintético.grafcet', { exact: true }).isVisible(), 'a revisão identifica ficheiro e formato de origem')
  check(await review.getByText('Desenho importado para revisão', { exact: true }).isVisible(), 'a revisão explica o bloqueio de simulação e Ladder')
  check(await review.getByText('Ligações e destinos', { exact: true }).isVisible() && await review.getByText('Condições e variáveis', { exact: true }).isVisible() && await review.getByText('Ações e qualificadores', { exact: true }).isVisible(), 'avisos são agrupados por área de revisão')
  const looseAction = 'A ação L_Amarela ficou solta: não tem ligação a uma etapa.'
  const actionGroup = review.locator('#grafcet-import-review-actions').locator('xpath=..')
  const linkGroup = review.locator('#grafcet-import-review-links').locator('xpath=..')
  check(await actionGroup.getByText(looseAction, { exact: true }).count() === 1 && await linkGroup.getByText(looseAction, { exact: true }).count() === 0, 'ações soltas são classificadas como ações mesmo quando descrevem ligações')
  check(await review.getByText('×2', { exact: true }).count() === 2, 'avisos repetidos ficam resumidos sem perder o número de ocorrências')
  check(await review.getByText('Etapas', { exact: true }).isVisible() && await review.getByText('Transições', { exact: true }).isVisible() && await review.getByText('Ações', { exact: true }).isVisible() && await review.getByText('Textos', { exact: true }).isVisible(), 'contagens do conteúdo ficam legíveis em indicadores')
  const reviewBox = await review.boundingBox()
  await page.screenshot({ path: path.join(output, 'import-review-desktop.png') })
  check(reviewBox.x >= 0 && reviewBox.x + reviewBox.width <= 1440 && reviewBox.y >= 0 && reviewBox.y + reviewBox.height <= 900, 'pré-visualização cabe no ecrã desktop')
  const beforeCancel = await readProgram()
  await review.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await review.waitFor({ state: 'hidden' })
  check(JSON.stringify(await readProgram()) === JSON.stringify(beforeCancel), 'cancelar mantém o GRAFCET atual intacto')
  check(await returnFocusTarget.evaluate((element) => element === document.activeElement), 'fechar a confirmação devolve o foco ao controlo que a abriu')
  await openImport()
  await page.locator('form.grafcet-import-dialog input[type="file"]').setInputFiles(reviewFile)
  const mobileReview = page.getByRole('alertdialog', { name: 'Importar GRAFCET' })
  await mobileReview.waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileBox = await mobileReview.boundingBox()
  check(mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 390 && mobileBox.y >= 0 && mobileBox.y + mobileBox.height <= 844, 'pré-visualização cabe no ecrã móvel')
  check(await mobileReview.getByRole('button', { name: 'Cancelar', exact: true }).isVisible() && await mobileReview.getByRole('button', { name: 'Importar', exact: true }).isVisible(), 'ações ficam visíveis no telemóvel')
  await page.screenshot({ path: path.join(output, 'import-review-mobile.png') })
  await page.keyboard.press('Escape')
  await mobileReview.waitFor({ state: 'hidden' })
  check(JSON.stringify(await readProgram()) === JSON.stringify(beforeCancel), 'Escape cancela sem alterar o GRAFCET atual')
  await openImport()
  await page.locator('form.grafcet-import-dialog input[type="file"]').setInputFiles(reviewFile)
  const enterReview = page.getByRole('alertdialog', { name: 'Importar GRAFCET' })
  await enterReview.waitFor()
  await enterReview.getByRole('button', { name: 'Importar', exact: true }).focus()
  await page.keyboard.press('Enter')
  await enterReview.waitFor({ state: 'hidden' })
  const importedReview = await readProgram()
  check(importedReview.name === reviewProgram.name && importedReview.importReview.warnings.length === reviewWarnings.length, 'confirmar importa e conserva os avisos para revisão')
  check(errors.length === 0, 'sem erros de execução no navegador')
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ ok: true, checks, browserErrors: errors }, null, 2) + '\n')
  console.log(`OK — ${checks.length} verificações de modais`)
} finally {
  await context.close()
  await browser.close()
}
