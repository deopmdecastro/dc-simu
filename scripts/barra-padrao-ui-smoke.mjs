import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

// Compara a barra do editor de componentes com as do simulador (Esquema, Ladder,
// GRAFCET) em 390 × 844: alturas de faixa, altura dos controlos, raio, fundo e
// separadores. Serve de guarda contra a barra voltar a ser "outra aplicação".
const base = process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.BARS_TEST_OUTPUT
await mkdir(output ?? 'runtime/padrao-barras', { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(base).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json' ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  localStorage.removeItem('dcsimu:supabase:config:v1')
  localStorage.setItem('dcsimu:schematic:sim-open', '0')
  localStorage.setItem('dcsimu:ladder:status-open', '0')
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const check = (value, message) => { if (!value) throw new Error('FALHOU — ' + message); console.log('PASS — ' + message) }

/** Lê as faixas de uma barra: altura, fundo, altura/raio dos controlos e separadores. */
const readBar = (selector) => page.evaluate((sel) => {
  const root = document.querySelector(sel)
  if (!root) return null
  const style = getComputedStyle(root)
  const buttons = [...root.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height > 0)
  const segs = [...root.querySelectorAll('.dc-seg')].filter((el) => el.getBoundingClientRect().height > 0)
  const controlHeights = [...new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().height)))]
  const radii = [...new Set(buttons.map((b) => getComputedStyle(b).borderRadius))]
  return {
    height: Math.round(root.getBoundingClientRect().height),
    background: style.backgroundColor,
    wraps: style.flexWrap,
    buttons: buttons.length,
    controlHeights,
    radii,
    segRadius: segs.length ? getComputedStyle(segs[0]).borderRadius : null,
    separators: root.querySelectorAll('.tb-sep').length,
  }
}, selector)

try {
  // ---- barra do simulador (GRAFCET) como referência
  await page.goto(base + '/dashboard')
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /(?:Novo|Criar) projeto/i }).first().click()
  const create = page.getByRole('dialog', { name: 'Criar novo projeto' })
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Padrão das barras')
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.getByRole('tablist', { name: 'Vistas' }).waitFor({ timeout: 60000 })
  await page.waitForTimeout(1200)
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: 'GRAFCET' }).first().click()
  await page.waitForTimeout(1500)
  const reference = await readBar('.dc-toolbar-main')
  check(Boolean(reference), 'Barra do simulador encontrada (GRAFCET)')
  if (output) await page.screenshot({ path: output + '/1-simulador-grafcet.png', clip: { x: 0, y: 60, width: 390, height: 180 } })

  // ---- barra do editor de componentes
  await page.goto(base + '/dashboard')
  await page.waitForTimeout(1500)
  const id = await page.evaluate(async () => {
    const { buildBuiltinDraft } = await import('/src/admin/editor3d/builtinComponents.ts')
    const { catalogApi } = await import('/src/catalog/catalogApi.ts')
    const draft = await buildBuiltinDraft('motorBreakerPkzmC10')
    return (await catalogApi.save('synthetic-bars-pattern', draft.meta, draft.def)).id
  })
  await page.goto(base + '/admin/editor/' + id)
  await page.locator('.ce-root canvas').waitFor({ timeout: 120000 })
  await page.waitForTimeout(1500)
  const primary = await readBar('.ce-toolbars .ce-ribbon-primary')
  const secondary = await readBar('.ce-toolbars .ce-ribbon-secondary')
  if (output) await page.screenshot({ path: output + '/2-componentes.png', clip: { x: 0, y: 60, width: 390, height: 220 } })

  // 1) mesmas alturas de faixa (linha de ferramentas 46, linha de vista 40)
  check(Math.abs(primary.height - reference.height) <= 4, `Linha de ferramentas com a altura da barra do simulador (${primary.height} vs ${reference.height} px)`)
  check(secondary.height === 40, `Linha de vista com a altura comum de 40 px (medido: ${secondary.height})`)

  // 2) mesmos controlos: altura e raio iguais em todas as barras
  check(JSON.stringify(secondary.controlHeights) === '[30]', `Controlos a 30 px na linha de vista (${secondary.controlHeights.join(', ')})`)
  check(secondary.radii.every((radius) => radius === '6px'), `Controlos com o raio comum de 6 px (${secondary.radii.join(', ')})`)
  check(reference.controlHeights.includes(30) && primary.controlHeights.includes(30), 'Ferramentas à mesma altura dos controlos do simulador')

  // 3) a faixa de vista não quebra em linhas: desliza, como a do simulador
  check(secondary.wraps === 'nowrap', `A linha de vista não quebra (flex-wrap: ${secondary.wraps})`)
  check(secondary.height === 40 && secondary.background !== primary.background, 'A linha de vista tem fundo próprio, como a segunda faixa do simulador')

  // 4) a dica da ferramenta vive numa faixa fina, não estica a barra
  const hint = await page.evaluate(() => {
    const bar = document.querySelector('.ce-contextbar .ce-ribbon-hint')
    const box = bar?.getBoundingClientRect()
    return { exists: Boolean(bar), height: box ? Math.round(box.height) : 0, text: bar?.textContent?.slice(0, 20) ?? '' }
  })
  check(hint.exists && hint.height > 0 && hint.height <= 30, `A dica da ferramenta ocupa uma faixa fina (${hint.height} px)`)
  check(/Seleção|Selecionar/.test(hint.text), 'A faixa de contexto nomeia a ferramenta ativa')

  // 5) continuam a caber as seis ferramentas, sem deslocamento da página
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sem deslocamento horizontal a 390 px')
  const tools = await page.locator('.ce-tools .dc-tool-btn').evaluateAll((list) => list.map((b) => Math.round(b.getBoundingClientRect().height)))
  check(tools.length === 6 && tools.every((height) => height === 30), `As seis ferramentas continuam na barra (${tools.join(', ')} px)`)

  // 6) os separadores são os comuns (mesma espessura usada no simulador)
  check(primary.separators >= 1, 'A linha de ferramentas usa os separadores comuns (tb-sep)')

  if (errors.length) throw new Error('Erros de página: ' + errors.join(' | '))
  console.log('PASS — Barra do editor de componentes alinhada com as do simulador (390 px)')
} finally { await browser.close() }
