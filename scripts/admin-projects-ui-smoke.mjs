import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseURL = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.ADMIN_PROJECTS_UI_TEST_OUTPUT || 'runtime/admin-projects-ui'
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL ? { channel: process.env.EDITOR3D_TEST_CHANNEL } : {})
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks += 1; console.log('PASS — ' + message) }

const fixtures = {
  projects: [
    {
      id: 'fixture-project-published',
      name: 'QGD A',
      ownerId: 'dcsimu-admin',
      memberIds: ['dcsimu-user'],
      content: {},
      revision: 7,
      updatedAt: '2026-11-20T20:30:00.000Z',
    },
    {
      id: 'fixture-project-long',
      name: 'Distribuição principal da célula industrial com controlo de emergência e blocos auxiliares',
      ownerId: 'dcsimu-user',
      memberIds: ['dcsimu-admin', 'dcsimu-user'],
      content: {},
      revision: 12,
      updatedAt: '2026-11-19T18:15:00.000Z',
    },
  ],
  invitations: [],
  publishedProjectId: 'fixture-project-published',
}

async function openProjects(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  await context.addInitScript(({ fixtures }) => {
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.removeItem('dcsimu:supabase:config:v1')
    localStorage.setItem('dcsimu:account:data:v1', JSON.stringify(fixtures))
    localStorage.setItem('dcsimu:cookie-consent:v1', JSON.stringify({ accepted: true, at: '2026-11-20T21:55:44.266Z', version: 1 }))
  }, { fixtures })

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL + '/admin')
  await page.locator('.dx-admin').first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(700)

  const picker = page.locator('.adm-picker .tm-trigger')
  if (await picker.count()) {
    await picker.click()
    const sheet = page.getByRole('menu', { name: 'Secções da administração' })
    await sheet.waitFor({ timeout: 8000 })
    await sheet.getByRole('menuitem').filter({ hasText: 'Projetos' }).first().click()
  } else {
    await page.locator('.adm-tablist').getByRole('tab', { name: /^Projetos/ }).click()
  }
  await page.waitForTimeout(500)
  await mkdir(output, { recursive: true })
  return { context, page, errors }
}

try {
  {
    const { context, page, errors } = await openProjects(1440, 900)
    const rows = page.locator('.adm-table-projects tbody tr')
    await rows.first().waitFor()
    check(await rows.count() === 2, 'Desktop: os dois projetos sintéticos são apresentados')
    check(await page.locator('.adm-project-result').innerText().then((text) => /^2 de 2 projetos$/.test(text.trim())), 'Desktop: uma única contagem clara mostra 2 de 2 projetos')
    check(await page.locator('.adm-project-section > span').count() === 0, 'Desktop: o cabeçalho não repete contagem')

    const geometry = await page.locator('.adm-table-projects').evaluate((table) => {
      const tableRect = table.getBoundingClientRect()
      const wrapRect = table.parentElement?.getBoundingClientRect()
      const rowRects = [...table.querySelectorAll('tbody tr')].map((row) => row.getBoundingClientRect())
      const firstRow = table.querySelector('tbody tr')
      const landingCell = firstRow?.querySelector('td[data-label="Landing"]')
      const actionCell = firstRow?.querySelector('td.is-actions')
      const actionWrapper = actionCell?.querySelector('.adm-project-actions')
      const rectData = (element) => { const rect = element?.getBoundingClientRect(); return rect ? { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) } : null }
      return {
        tableWidth: Math.round(tableRect.width),
        wrapWidth: Math.round(wrapRect?.width ?? 0),
        columns: table.querySelectorAll('thead th').length,
        rowHeights: rowRects.map((rect) => Math.round(rect.height)),
        names: [...table.querySelectorAll('.adm-project-name strong')].map((name) => ({ text: name.textContent?.trim(), clientWidth: name.clientWidth, scrollWidth: name.scrollWidth, whiteSpace: getComputedStyle(name).whiteSpace })),
        tableRect: rectData(table),
        landingRect: rectData(landingCell),
        actionRect: rectData(actionCell),
        wrapperRect: rectData(actionWrapper),
        actionButtons: [...(actionWrapper?.querySelectorAll('.dx-btn') ?? [])].map((button) => rectData(button)),
      }
    })
    check(geometry.columns === 7, 'Desktop: a tabela mantém sete colunas legíveis')
    check(geometry.tableWidth <= geometry.wrapWidth + 1, 'Desktop: a tabela não tem scroll horizontal')
    check(geometry.rowHeights.every((height) => height >= 88), `Desktop: linhas com altura útil (${geometry.rowHeights.join(', ')} px)`)
    check(geometry.names.every((name) => name.text === 'QGD A' || name.text?.includes('Distribuição principal')), 'Desktop: nomes curto e longo estão presentes')
    check(geometry.names[1].whiteSpace === 'normal' && geometry.names[1].scrollWidth <= geometry.names[1].clientWidth + 1, 'Desktop: nome longo pode envolver-se em vez de ser cortado')

    check(Boolean(geometry.actionRect) && geometry.actionRect.left >= geometry.tableRect.left && geometry.actionRect.right <= geometry.tableRect.right, 'Desktop: célula de ações fica totalmente dentro dos limites da tabela')
    check(Boolean(geometry.wrapperRect) && geometry.wrapperRect.left >= geometry.actionRect.left && geometry.wrapperRect.right <= geometry.actionRect.right, 'Desktop: wrapper de ações fica dentro da célula')
    check(geometry.actionButtons.length === 2 && geometry.actionButtons.every((button) => button.left >= geometry.wrapperRect.left && button.right <= geometry.wrapperRect.right && button.right <= geometry.tableRect.right), 'Desktop: ambos os botões ficam dentro da célula e da tabela')
    check(geometry.actionButtons.length === 2 && geometry.actionButtons[0].bottom <= geometry.actionButtons[1].top, 'Desktop: botões de ação não se sobrepõem')
    check(Boolean(geometry.landingRect) && geometry.landingRect.right <= geometry.actionRect.left, 'Desktop: Landing e ações não se sobrepõem')


    const owners = await page.locator('.adm-table-projects td[data-label="Proprietário"]').allInnerTexts()
    check(owners.some((owner) => owner.includes('admin@dcsimu.local')), 'Desktop: proprietário admin é apresentado como e-mail')
    check(owners.some((owner) => owner.includes('user@dcsimu.local')), 'Desktop: proprietário utilizador é apresentado como e-mail')
    check(await page.getByRole('button', { name: 'Remover fixture-project-published da landing' }).count() === 0, 'Desktop: rótulo acessível usa o nome real, não o ID')
    check(await page.getByRole('button', { name: 'Remover QGD A da landing' }).isVisible(), 'Desktop: projeto publicado tem ação acessível «Remover da landing»')
    check(await page.getByRole('button', { name: 'Publicar Distribuição principal da célula industrial com controlo de emergência e blocos auxiliares na landing' }).isVisible(), 'Desktop: projeto não publicado tem ação acessível «Publicar na landing»')
    check(await page.locator('.ce-pill.is-builtin').filter({ hasText: 'Na landing' }).count() === 1, 'Desktop: existe exatamente uma publicação Landing')

    const search = page.getByRole('searchbox', { name: 'Pesquisar projetos' })
    await search.fill('user@dcsimu.local')
    await page.waitForTimeout(100)
    check(await rows.count() === 1, 'Desktop: a pesquisa por proprietário filtra para um projeto')
    check(await page.locator('.adm-project-result').innerText().then((text) => /^1 de 2 projetos$/.test(text.trim())), 'Desktop: contagem live mostra 1 de 2 projetos')
    await search.fill('')

    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Desktop: página sem overflow horizontal')
    check(await page.locator('.dx-cookie').count() === 0, 'Desktop: consentimento de cookies não obstrui a captura')
    await page.screenshot({ path: path.join(output, 'projects-desktop.png'), fullPage: true })
    assert.deepEqual(errors, [], 'Desktop: nenhuma exceção JavaScript')
    await context.close()
  }

  {
    const { context, page, errors } = await openProjects(740, 900)
    const table = page.locator('.adm-table-projects')
    await table.waitFor()
    const geometry = await table.evaluate((element) => {
      const tableRect = element.getBoundingClientRect()
      const actions = [...element.querySelectorAll('tbody td.is-actions')].map((cell) => {
        const cellRect = cell.getBoundingClientRect()
        const buttons = [...cell.querySelectorAll('.adm-project-actions .dx-btn')].map((button) => {
          const rect = button.getBoundingClientRect()
          return {
            left: rect.left,
            right: rect.right,
            width: button.clientWidth,
            textWidth: button.scrollWidth,
            cellLeft: cellRect.left,
            cellRight: cellRect.right,
          }
        })
        return { left: cellRect.left, right: cellRect.right, buttons }
      })
      return { tableLeft: tableRect.left, tableRight: tableRect.right, actions }
    })
    check(await table.locator('tbody tr').count() === 2, 'Tablet: ambos os projetos mantêm o layout de tabela')
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Tablet: página sem overflow horizontal')
    check(geometry.actions.every((cell) => cell.left >= geometry.tableLeft && cell.right <= geometry.tableRight
      && cell.buttons.every((button) => button.left >= cell.left && button.right <= cell.right && button.textWidth <= button.width + 1)),
    'Tablet: ações e texto dos botões cabem nas células sem cortes')
    assert.deepEqual(errors, [], 'Tablet: nenhuma exceção JavaScript')
    await context.close()
  }

  {
    const { context, page, errors } = await openProjects(390, 844)
    const rows = page.locator('.adm-table-projects tbody tr')
    await rows.first().waitFor()
    check(await rows.count() === 2, 'Mobile: os dois projetos sintéticos são apresentados em cartões')
    check(await page.locator('.adm-project-result').innerText().then((text) => /^2 de 2 projetos$/.test(text.trim())), 'Mobile: contagem live mostra 2 de 2 projetos')

    const geometry = await rows.evaluateAll((list) => list.map((row) => {
      const rect = row.getBoundingClientRect()
      const cover = row.querySelector('.adm-cover-project')?.getBoundingClientRect()
      const actions = [...row.querySelectorAll('.adm-project-actions .dx-btn')].map((button) => {
        const actionRect = button.getBoundingClientRect()
        return { label: button.textContent?.trim(), height: Math.round(actionRect.height), width: Math.round(actionRect.width) }
      })
      return { height: Math.round(rect.height), display: getComputedStyle(row).display, columns: getComputedStyle(row).gridTemplateColumns, coverHeight: cover ? Math.round(cover.height) : 0, actions }
    }))
    check(geometry.every((row) => row.display === 'grid'), 'Mobile: todas as linhas usam layout de cartão')
    check(geometry.every((row) => row.coverHeight <= 60), 'Mobile: capas compactas não ultrapassam 60 px')
    check(geometry.every((row) => row.actions.length === 2 && row.actions.every((action) => action.height >= 40)), 'Mobile: Publicar/Remover e Eliminar têm alvos ≥ 40 px')

    check(await page.getByRole('button', { name: 'Remover QGD A da landing' }).isVisible(), 'Mobile: ação acessível de remover landing')
    check(await page.getByRole('button', { name: 'Publicar Distribuição principal da célula industrial com controlo de emergência e blocos auxiliares na landing' }).isVisible(), 'Mobile: ação acessível de publicar landing')
    check(await page.getByRole('button', { name: 'Eliminar projeto QGD A' }).isVisible(), 'Mobile: ação destrutiva acessível Eliminar projeto QGD A')
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile: página sem overflow horizontal')
    check(await page.locator('.dx-cookie').count() === 0, 'Mobile: consentimento de cookies não obstrui a captura')

    const search = page.getByRole('searchbox', { name: 'Pesquisar projetos' })
    await search.fill('Distribuição principal')
    check(await rows.count() === 1, 'Mobile: a pesquisa por nome filtra para um cartão')
    check(await page.locator('.adm-project-result').innerText().then((text) => /^1 de 2 projetos$/.test(text.trim())), 'Mobile: contagem live acompanha o filtro')
    await search.fill('')

    await page.screenshot({ path: path.join(output, 'projects-mobile.png'), fullPage: true })
    assert.deepEqual(errors, [], 'Mobile: nenhuma exceção JavaScript')
    await context.close()
  }

  console.log(`OK — ${checks} verificações de projetos sintéticos em desktop e mobile`)
} finally {
  await browser.close()
}