import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Disposable browser and local fixtures: no project account or remote service is changed.
const baseURL = process.env.BLOCK_TEST_URL || 'http://127.0.0.1:5175'
const output = process.env.BLOCK_TEST_OUTPUT
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.BLOCK_TEST_CHANNEL || 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/')
  return local || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname) ? route.continue() : route.abort()
})
await context.addInitScript(() => localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin'))
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const check = (condition, message) => { assert.ok(condition, message); console.log('PASS — ' + message) }
const dialog = () => page.getByRole('dialog', { name: 'Adicionar novo bloco', exact: true })
const name = () => dialog().locator('#block-name-input')
const number = () => dialog().locator('#block-number-input')
const create = () => dialog().getByRole('button', { name: 'Criar bloco', exact: true })
const readFiles = () => page.evaluate(async () => {
  const { useSimStore } = await import('/src/store/useSimStore.ts')
  const state = useSimStore.getState()
  return JSON.parse(JSON.stringify(state.projectFiles[state.activePlcId ?? '_general'] ?? []))
})
const open = async () => {
  await page.getByRole('button', { name: 'Adicionar bloco', exact: true }).click()
  await dialog().waitFor()
  await dialog().evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  })
}
const dialogSize = () => dialog().evaluate((el) => {
  const rect = el.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
})
const workspaceLayout = () => dialog().locator('.add-block-workspace').evaluate((el) => ({
  columns: getComputedStyle(el).gridTemplateColumns,
  widths: Array.from(el.children, (child) => child.getBoundingClientRect().width),
}))
const footerAnchored = () => dialog().evaluate((el) => {
  const modal = el.getBoundingClientRect()
  const footer = el.querySelector('.dc-modal-footer')?.getBoundingClientRect()
  return !!footer && Math.abs(modal.bottom - footer.bottom) <= 1
})
const cancel = async () => {
  await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })
}
const pickKind = async (kind) => {
  const labels = { OB: 'Bloco de organização', FB: 'Bloco de função', FC: 'Função', DB: 'Bloco de dados' }
  const option = dialog().getByRole('radio', { name: new RegExp(labels[kind] + '(?:\\s|$)') })
  await option.click()
  await option.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  })
}
const language = () => dialog().locator('#block-language-input')
const pickLanguage = async (value) => {
  if (await language().evaluate((el) => el.tagName === 'SELECT')) await language().selectOption(value)
  else {
    await language().click()
    await page.getByRole('option', { name: new RegExp('^' + value + '(?:\\s|$)') }).click()
  }
}
const snapshot = async (label) => {
  if (output) { await page.mouse.move(3, 3); await page.screenshot({ path: path.join(output, label + '.png') }) }
}

try {
  await page.goto(baseURL + '/dashboard')
  await page.evaluate(async () => {
    const { accountApi } = await import('/src/auth/accountApi.ts')
    await accountApi('/me')
  })
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const project = page.getByRole('dialog')
  await project.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Blocos — verificação isolada')
  await project.getByRole('radio', { name: /^Ladder/ }).check()
  await project.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await open()
  if (process.argv.includes('--inspect')) {
    console.log(await dialog().innerText())
    await snapshot('before')
  } else {
    const defaultSize = await dialogSize()
    check(defaultSize.width === 940 && defaultSize.height === 680, `tamanho padrão desktop é 940×680px (medido ${defaultSize.width}×${defaultSize.height}px)`)
    const defaultWorkspace = await workspaceLayout()
    const initialFiles = await readFiles()
    check(await number().inputValue() === '2', 'novo OB evita o OB1 reservado ao programa principal')
    await snapshot('desktop-ob')
    for (const kind of ['FB', 'FC', 'DB', 'OB']) {
      await pickKind(kind)
      const size = await dialogSize()
      check(Math.abs(size.width - defaultSize.width) <= 1 && Math.abs(size.height - defaultSize.height) <= 1,
        `${kind} mantém as dimensões padrão desktop`)
      check(JSON.stringify(await workspaceLayout()) === JSON.stringify(defaultWorkspace),
        `${kind} mantém a distribuição das duas colunas desktop`)
      check(await dialog().locator('.add-block-type.is-active').getAttribute('aria-checked') === 'true',
        `${kind} preserva aria-checked no tipo ativo`)
      check(await dialog().locator('.add-block-type.is-active').evaluate((el) => {
        const style = getComputedStyle(el)
        return style.borderTopColor === 'rgb(49, 93, 235)' && style.boxShadow.includes('49, 93, 235')
      }), `${kind} conserva a indicação visual azul do tipo ativo`)
      check(await dialog().locator('.add-block-type-check').count() === 0, `${kind} não mostra ícone de seleção no tipo`)
      if (kind !== 'OB') check(await dialog().locator('.add-block-no-model').isVisible(), `${kind} mantém um placeholder no painel de modelos`)
    }
    await name().fill('')
    check(await create().isDisabled(), 'nome-base vazio bloqueia a criação')
    await name().press('Control+Enter')
    check((await readFiles()).length === initialFiles.length, 'atalho com nome inválido não cria um ficheiro')
    await name().fill('Ciclo adicional')
    for (const invalid of ['1', '-1', '1.2', '0', '65536']) {
      await number().fill(invalid)
      check(await create().isDisabled(), 'número reservado ou inválido é rejeitado: ' + invalid)
    }
    await number().fill('1')
    await dialog().getByRole('button', { name: /número livre/i }).click()
    check(await number().inputValue() === '2' && await create().isEnabled(), 'próximo número livre recupera o conflito')
    const search = dialog().getByRole('searchbox')
    await search.fill('arranque')
    check(await dialog().getByRole('button', { name: /RESTART COMPLETO/ }).isVisible(), 'pesquisa encontra modelos pela categoria')
    await search.press('Enter')
    check(await dialog().isVisible() && (await readFiles()).length === initialFiles.length, 'Enter na pesquisa não cria o bloco nem aciona o editor')
    await search.fill('sem-modelo-xyz')
    check(await number().inputValue() === '2', 'pesquisar sem resultados preserva o modelo e o número selecionados')
    await search.fill('100')
    await dialog().getByRole('button', { name: /RESTART COMPLETO/ }).click()
    check(await number().inputValue() === '100', 'escolher modelo de arranque propõe OB100')
    await search.fill('')
    await snapshot('desktop-startup')
    await cancel()
    check((await readFiles()).length === initialFiles.length, 'cancelar o rascunho não cria ficheiros')

    await open()
    await pickKind('FB')
    await page.keyboard.press('ArrowRight')
    check(await dialog().getByRole('radio', { name: /FC Função/ }).getAttribute('aria-checked') === 'true', 'setas do teclado selecionam o tipo de bloco seguinte')
    await page.keyboard.press('ArrowLeft')
    await name().fill('Controlo do motor')
    await number().fill('5')
    await pickLanguage('FBD')
    await pickKind('FC')
    await name().fill('Calcular velocidade')
    await pickKind('FB')
    check(await name().inputValue() === 'Controlo do motor' && await number().inputValue() === '5', 'trocar o tipo conserva o nome e número do rascunho')
    await pickKind('FB')
    check(await name().inputValue() === 'Controlo do motor', 'clicar no tipo atual não apaga o nome')
    await snapshot('desktop-fb')
    await pickKind('DB')
    check(await language().count() === 0, 'DB não apresenta uma linguagem irrelevante')
    await snapshot('desktop-db')
    await pickKind('FB')
    check(await language().evaluate((el) => el.tagName === 'SELECT' ? el.value === 'FBD' : el.textContent.includes('FBD')), 'linguagem de código é preservada ao passar por DB')
    await cancel()

    await open()
    await name().fill('Ciclo adicional')
    await name().press('Control+Enter')
    await dialog().waitFor({ state: 'hidden' })
    const cyclic = (await readFiles()).find((file) => file.name === 'Ciclo adicional [OB 2]')
    check(cyclic?.folder === 'programBlocks' && cyclic.exec === 'obCyclic' && cyclic.rungs?.length === 1, 'criar OB2 gera uma network cíclica editável no PLC atual')
    await open()
    check(await number().inputValue() === '3', 'nova abertura sugere outro número após a criação')
    await number().fill('2')
    check(await create().isDisabled(), 'número do bloco criado fica protegido contra duplicados')
    await number().fill('100')
    await name().fill('Arranque')
    await create().click()
    await dialog().waitFor({ state: 'hidden' })
    check((await readFiles()).find((file) => file.name === 'Arranque [OB 100]')?.exec === 'obStartup', 'OB100 mantém execução de arranque')

    await open()
    await pickKind('FC')
    await name().fill('Calcular')
    await number().fill('3')
    await create().click()
    await dialog().waitFor({ state: 'hidden' })
    const callable = (await readFiles()).find((file) => file.name === 'Calcular [FC 3]')
    check(callable?.folder === 'programBlocks' && !callable.exec && callable.rungs?.length === 1, 'FC é criado como bloco editável chamado por CALL')
    await open()
    await pickKind('DB')
    await name().fill('Parametros')
    await create().click()
    await dialog().waitFor({ state: 'hidden' })
    const data = (await readFiles()).find((file) => file.name.startsWith('Parametros [DB '))
    check(data?.folder === 'dataBlocks' && JSON.parse(data.content).Enable.type === 'BOOL', 'DB cria variáveis tipadas na pasta de dados')

    await open()
    await pickKind('FB')
    await name().fill('Fonte de referencia')
    await pickLanguage('SCL')
    await snapshot('desktop-source')
    await create().click()
    await dialog().waitFor({ state: 'hidden' })
    const source = (await readFiles()).find((file) => file.name.startsWith('Fonte de referencia [FB '))
    check(source?.folder === 'externalSources' && source.content.includes('FUNCTION_BLOCK') && !source.rungs?.length, 'SCL é guardado como fonte de texto sem simulação inventada')

    await open()
    const buttons = dialog().getByRole('button')
    await buttons.last().focus()
    await page.keyboard.press('Tab')
    check(await dialog().evaluate((el) => el.contains(document.activeElement)), 'Tab mantém o foco dentro do diálogo')
    await page.keyboard.press('Shift+Tab')
    check(await dialog().evaluate((el) => el.contains(document.activeElement)), 'Shift+Tab mantém o foco dentro do diálogo')
    if (await language().evaluate((el) => el.tagName !== 'SELECT')) {
      await language().click()
      await page.getByRole('listbox').waitFor()
      await page.keyboard.press('Escape')
      check(await dialog().isVisible() && await page.getByRole('listbox').count() === 0, 'primeiro Escape fecha só o menu da linguagem')
    }
    await page.keyboard.press('Escape')
    await dialog().waitFor({ state: 'hidden' })
    check(await page.getByRole('button', { name: 'Adicionar bloco', exact: true }).evaluate((el) => el === document.activeElement), 'fechar devolve o foco ao botão de origem')

    for (const size of [{ width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(size)
      for (const title of ['Recolher projeto', 'Recolher elementos']) {
        const closePane = page.getByTitle(title, { exact: true })
        if (await closePane.isVisible()) await closePane.click()
      }
      await open()
      const mobileSize = await dialogSize()
      check(mobileSize.height === Math.min(680, size.height - 16), `altura responsiva definida e estável a ${size.width}px`)
      await snapshot('viewport-' + size.width)
      check(await dialog().evaluate((el) => { const rect = el.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1 }), 'diálogo cabe sem rolagem horizontal a ' + size.width + 'px')
      check(await create().evaluate((el) => { const rect = el.getBoundingClientRect(); return rect.bottom <= innerHeight && rect.top >= 0 && el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) }), 'criar permanece visível e acessível a ' + size.width + 'px')
      for (const kind of ['FB', 'FC', 'DB', 'OB']) {
        await pickKind(kind)
        const kindSize = await dialogSize()
        check(Math.abs(kindSize.width - mobileSize.width) <= 1 && Math.abs(kindSize.height - mobileSize.height) <= 1,
          `${kind} mantém as dimensões responsivas a ${size.width}px`)
        check(await dialog().locator('.dc-modal-body').evaluate((el) => getComputedStyle(el).overflowY === 'auto'),
          `conteúdo usa rolagem interna a ${size.width}px`)
        check(await footerAnchored(), `rodapé permanece fixo a ${size.width}px`)
      }
      await pickKind('DB')
      await snapshot('db-' + size.width)
      await cancel()
    }
    check(errors.length === 0, 'nenhuma exceção JavaScript: ' + errors.join('; '))
  }
} catch (error) {
  await snapshot('failure')
  throw error
} finally {
  await browser.close()
}
