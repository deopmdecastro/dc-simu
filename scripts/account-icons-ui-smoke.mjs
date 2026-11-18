import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Requer Vite em ACCOUNT_UI_TEST_URL (por omissão localhost). Contas fixas
// de teste, contextos descartáveis, sem API nem chamadas para integrações reais.
const baseURL = process.env.ACCOUNT_UI_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.ACCOUNT_UI_TEST_OUTPUT
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch()
let checks = 0
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS — ' + label) }
const capture = async (locator, name) => { if (output) await locator.screenshot({ path: path.join(output, name + '.png') }) }
const noEmoji = (text) => !/[\p{Emoji_Presentation}\uFE0F\u2600-\u27BF\u{1F000}-\u{1FAFF}]/u.test(text)

async function session(role, width) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block' })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  await context.addInitScript(({ role }) => {
    localStorage.setItem('dcsimu:account:session:v1', role === 'admin' ? 'dcsimu-admin' : 'dcsimu-user')
    localStorage.removeItem('dcsimu:supabase:config:v1')
    if (!localStorage.getItem('dcsimu:saas:plans:v1')) {
      localStorage.setItem('dcsimu:saas:plans:v1', JSON.stringify({ 'dcsimu-user': { plan: 'free', planExpiresAt: null } }))
    }
  }, { role })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL + '/dashboard')
  await page.locator('.dx-account-trigger').waitFor({ timeout: 60_000 })
  await page.locator('.dx-dash').waitFor({ timeout: 30_000 })
  return { context, page, errors }
}

async function profile(page) {
  await page.locator('.dx-account-trigger').click()
  const menu = page.getByRole('dialog', { name: 'Menu da conta' })
  await menu.waitFor()
  return menu
}

try {
  for (const width of [1440, 390]) {
    const { context, page, errors } = await session('user', width)
    const prefix = `Utilizador ${width}px`
    const card = page.locator('.dx-plan-card[data-plan="free"]')
    await card.waitFor()
    check(await page.locator('.dx-dash-side').getByRole('button', { name: /Supabase|n8n/ }).count() === 0, `${prefix}: sem configuração de integrações no dashboard`)
    const features = card.locator('[data-feature]')
    check(await features.count() === 9, `${prefix}: continuam disponíveis os nove indicadores de funcionalidades`)
    check(await features.locator('svg').count() === 9, `${prefix}: cada funcionalidade tem um SVG`)
    check(await card.locator('[data-enabled="false"] svg[data-icon="lock"]').count() === 6, `${prefix}: funcionalidades bloqueadas usam cadeado SVG`)
    check(await card.locator('[data-enabled="true"] svg[data-icon="check"]').count() === 3, `${prefix}: funcionalidades incluídas usam confirmação SVG`)
    const upgrade = card.getByRole('button', { name: 'Mudar de plano' })
    check(await upgrade.locator('svg[data-icon="bolt"]').count() === 1, `${prefix}: mudar de plano usa raio SVG`)
    check(noEmoji(await card.textContent()), `${prefix}: cartão do plano sem emojis`)
    check(await features.evaluateAll((items) => items.every((item) => {
      const svg = item.querySelector('svg')
      const rect = svg.getBoundingClientRect()
      return rect.width >= 8 && rect.height >= 8 && svg.getAttribute('aria-hidden') === 'true'
    })), `${prefix}: ícones visíveis, com tamanho coerente e sem ruído para leitores de ecrã`)
    await capture(card, `plano-free-${width}`)

    let menu = await profile(page)
    check(await menu.locator('.dx-profile-connections').count() === 0, `${prefix}: grupo Ligações não existe no DOM`)
    check(await menu.getByRole('button', { name: /Base de dados|Automação|Administração/ }).count() === 0, `${prefix}: menu sem ações reservadas ao administrador`)
    check(!/Supabase|n8n|servidor|navegador/.test(await menu.textContent()), `${prefix}: menu não expõe o backend da sessão`)
    check(await menu.locator('footer').textContent() === 'Sessão ativa', `${prefix}: estado da sessão neutro`)
    check(await menu.getByRole('button', { name: /Gerir conta/ }).isVisible() && await menu.getByRole('button', { name: /Contribuir/ }).isVisible() && await menu.getByRole('button', { name: 'Sair da conta' }).isVisible(), `${prefix}: ações normais da conta mantidas`)
    check(await menu.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 }), `${prefix}: menu cabe no ecrã`)
    await capture(menu, `menu-utilizador-${width}`)
    await page.keyboard.press('Escape')
    check(await menu.count() === 0 && await page.locator('.dx-account-trigger').evaluate((el) => el === document.activeElement), `${prefix}: Escape fecha o menu e devolve o foco`)
    if (output && width === 1440) await page.screenshot({ path: path.join(output, 'dashboard-atualizado.png'), fullPage: false })

    for (const route of ['/account', '/contribute']) {
      await page.goto(baseURL + route)
      await page.locator('.dx-account-trigger').waitFor()
      if (route === '/account') await page.locator('.acp').waitFor({ timeout: 30_000 })
      menu = await profile(page)
      check(await menu.locator('.dx-profile-connections').count() === 0 && !/Supabase|n8n/.test(await menu.textContent()), `${prefix}: integrações também ocultas em ${route}`)
      await page.keyboard.press('Escape')
    }

    await page.goto(baseURL + '/admin')
    await page.waitForURL('**/dashboard')
    check(await page.locator('.dx-admin').count() === 0, `${prefix}: abrir /admin diretamente continua bloqueado`)

    if (width === 1440) {
      // A ação principal continua funcional após trocar o seu ícone.
      await page.locator('.dx-plan-card').getByRole('button', { name: 'Mudar de plano' }).click()
      await page.locator('.dx-plan-request').waitFor()
      await page.locator('.dx-plan-request').getByRole('button', { name: 'Pedir plano Pro' }).click()
      await page.locator('.dx-plan-pending').waitFor()
      check(true, 'Plano: pedir uma alteração mantém o fluxo original')
      await page.getByRole('button', { name: 'Cancelar pedido' }).click()
      await page.locator('.dx-plan-card').getByRole('button', { name: 'Mudar de plano' }).waitFor()
      check(await page.locator('.dx-plan-pending').count() === 0, 'Plano: cancelar o pedido continua funcional')

      for (const [plan, icon] of [['pro', 'bolt'], ['escola', 'graduation-cap'], ['empresa', 'star']]) {
        await page.evaluate((plan) => localStorage.setItem('dcsimu:saas:plans:v1', JSON.stringify({ 'dcsimu-user': { plan, planExpiresAt: null } })), plan)
        await page.reload()
        const paidCard = page.locator(`.dx-plan-card[data-plan="${plan}"]`)
        await paidCard.waitFor({ timeout: 30_000 })
        check(await paidCard.locator(`.dx-plan-main > div:first-child > span:last-child svg[data-icon="${icon}"]`).count() === 1, `Plano ${plan}: distintivo vetorial correto`)
        check(noEmoji(await paidCard.textContent()), `Plano ${plan}: sem emojis`)
      }

      // Os decalques físicos usam os mesmos contornos SVG na textura Canvas.
      const vectors = await page.evaluate(async () => {
        const { drawStickerIcon } = await import('/src/three/panelStickers.ts')
        return ['bolt', 'danger'].map((icon) => {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 80
          const ctx = canvas.getContext('2d')
          drawStickerIcon(ctx, icon, 40, 40, 48)
          const pixels = ctx.getImageData(0, 0, 80, 80).data
          let opaque = 0
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) opaque++
          return opaque
        })
      })
      check(vectors.every((pixels) => pixels > 100), 'Etiquetas 3D: energia e perigo desenhados por contornos vetoriais, sem fontes emoji')
    }
    check(errors.length === 0, `${prefix}: sem erros de JavaScript (${errors.join('; ')})`)
    await context.close()
  }

  for (const width of [1440, 390]) {
    const { context, page, errors } = await session('admin', width)
    const prefix = `Administrador ${width}px`
    check(await page.locator('.dx-plan-card').count() === 0, `${prefix}: continua sem plano de utilizador`)
    check(await page.locator('.dx-dash-side').getByRole('button', { name: /Supabase/ }).count() === 1 && await page.locator('.dx-dash-side').getByRole('button', { name: /n8n/ }).count() === 1, `${prefix}: mantém os acessos de configuração no dashboard`)
    let menu = await profile(page)
    check(await menu.locator('.dx-profile-connections').count() === 1, `${prefix}: grupo Ligações visível`)
    check(await menu.getByRole('button', { name: /Base de dados/ }).count() === 1 && await menu.getByRole('button', { name: /Automação/ }).count() === 1, `${prefix}: mantém Supabase e n8n`)
    check(await menu.locator('footer').textContent() === 'Sessão neste navegador', `${prefix}: informação técnica da sessão preservada`)
    await capture(menu, `menu-administrador-${width}`)
    await menu.getByRole('button', { name: /Base de dados/ }).click()
    await page.getByRole('heading', { name: /Base de Dados: Supabase/ }).waitFor()
    check(true, `${prefix}: diálogo da base de dados continua acessível`)
    await page.locator('button[aria-label="Fechar"]').click()
    menu = await profile(page)
    await menu.getByRole('button', { name: /Automação/ }).click()
    await page.getByRole('heading', { name: 'Integração n8n Automation' }).waitFor()
    check(true, `${prefix}: diálogo n8n continua acessível`)
    await page.locator('button[aria-label="Fechar"]').click()
    check(await page.getByRole('heading', { name: 'Integração n8n Automation' }).count() === 0, `${prefix}: diálogo é desmontado ao fechar`)
    await page.goto(baseURL + '/admin')
    await page.locator('.dx-admin').waitFor({ timeout: 60_000 })
    menu = await profile(page)
    check(await menu.locator('.dx-profile-connections').count() === 1, `${prefix}: integrações disponíveis também na Administração`)
    await page.keyboard.press('Escape')
    check(errors.length === 0, `${prefix}: sem erros de JavaScript (${errors.join('; ')})`)
    await context.close()
  }

  console.log(`\n${checks} verificações de menu por perfil e ícones SVG passaram.`)
} finally {
  await browser.close()
}
