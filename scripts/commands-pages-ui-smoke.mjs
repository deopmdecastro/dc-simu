import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Esquema IEC: mudar no sítio o nome do esquema e das páginas, como no GRAFCET (browser isolado, sem rede).
const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.GRAFCET_TEST_OUTPUT
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch(process.env.GRAFCET_TEST_EXECUTABLE
  ? { executablePath: process.env.GRAFCET_TEST_EXECUTABLE }
  : process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
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
let checks = 0
const check = (value, message) => { assert.ok(value, message); console.log(`PASS — ${message}`); checks++ }
const read = () => page.evaluate(async () => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  return JSON.parse(JSON.stringify(useSimStore.getState().commands))
})
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Comandos — páginas')
  await create.getByRole('radio', { name: /^Esquema IEC/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.locator('.dc-cmd-canvas').waitFor()
  const pagesBar = page.getByRole('tablist', { name: 'Páginas do esquema IEC' })
  const input = (attr) => page.locator(`[data-${attr}][data-inline-name-input]`)

  check(await pagesBar.getByRole('button', { name: /Esquema sem nome/ }).isVisible(), 'a barra de páginas mostra o nome do esquema (vazio: «Esquema sem nome»)')
  await pagesBar.getByRole('button', { name: /Esquema sem nome/ }).click()
  await input('cmd-diagram-name').fill('Quadro da bomba')
  await page.keyboard.press('Enter')
  check((await read()).name === 'Quadro da bomba' && await pagesBar.getByText('Quadro da bomba').isVisible(), 'o nome do esquema muda no sítio (Enter grava)')

  await pagesBar.getByRole('tab', { name: /Página 1/ }).click()
  await input('cmd-page-name').fill('Potência')
  await page.keyboard.press('Enter')
  check((await read()).pages?.[0]?.name === 'Potência' && await pagesBar.getByRole('tab', { name: /Potência/ }).isVisible(), 'um clique no nome da página ativa permite mudá-lo')

  await pagesBar.getByRole('button', { name: /Nova página/ }).click()
  await pagesBar.getByRole('tab', { name: /Potência/ }).click()
  await pagesBar.getByRole('tab').nth(1).dblclick()
  await input('cmd-page-name').fill('Comando')
  await page.keyboard.press('Enter')
  check((await read()).pages?.map((p) => p.name).join() === 'Potência,Comando', 'duplo clique numa página não ativa também a renomeia')

  await pagesBar.getByRole('tab', { name: /Potência/ }).click()
  await pagesBar.getByRole('tab', { name: /Potência/ }).click()
  await input('cmd-page-name').fill('Outro nome')
  await page.keyboard.press('Escape')
  check((await read()).pages?.[0]?.name === 'Potência', 'Esc cancela a mudança de nome')

  await pagesBar.getByRole('tab', { name: /Potência/ }).click()
  await input('cmd-page-name').fill('   ')
  await page.keyboard.press('Enter')
  check((await read()).pages?.[0]?.name === 'Potência', 'um nome em branco não apaga o nome da página')

  await page.keyboard.press('Control+z')
  check((await read()).pages?.map((p) => p.name).join() === 'Potência,Página 2', 'Ctrl+Z desfaz a última mudança de nome')
  check(!errors.length, `sem erros JavaScript: ${errors.join(' | ')}`)
  console.log(`\n${checks} verificações de nomes de páginas passaram`)
} finally {
  await browser.close()
}
