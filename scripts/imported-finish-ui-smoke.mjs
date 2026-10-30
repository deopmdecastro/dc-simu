import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Os 14 CAD importados no Painel 3D real: inserção, manobra (porta-fusível,
// disparo, chave, seletor), indicadores e mecânica sem erros JavaScript, e a
// página de revisão `imported-finish-audit.html` com materiais e peças móveis.
// Requer Vite (dev) em IMPORTED_TEST_URL (por omissão http://127.0.0.1:5173).
const baseURL = process.env.IMPORTED_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.IMPORTED_TEST_OUTPUT
const launch = process.env.PLATFORM_CHROME ? { executablePath: process.env.PLATFORM_CHROME } : process.env.IMPORTED_TEST_CHANNEL ? { channel: process.env.IMPORTED_TEST_CHANNEL } : {}
const browser = await chromium.launch({ ...launch, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks += 1; console.log('PASS — ' + message) }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  await context.addInitScript(() => { localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin'); localStorage.removeItem('dcsimu:supabase:config:v1') })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  // 1) revisão isolada: materiais reais, peças móveis e indicadores de cada modelo
  await page.goto(baseURL + '/scripts/imported-finish-audit.html')
  await page.waitForFunction(() => window.auditState?.done, null, { timeout: 600000 })
  const audit = await page.evaluate(() => window.auditState)
  check(audit.ready === 14 && audit.errors.length === 0, 'os 14 GLB recebem acabamento e mecânica sem erros')
  const roles = (type, key) => audit.report[type]?.[key] ?? []
  check(roles('fuseHolderSchneiderDf103nv', 'pivots').filter((r) => r === 'carrier').length === 4, 'DF103NV: quatro gavetas articuladas')
  check(roles('fuseHolderSchneiderDf101v', 'lamps').includes('blown'), 'DF101V: indicador de fusível fundido')
  check(roles('keyActuatorEao61', 'pivots').includes('key'), 'EAO 61: chave roda no canhão')
  check(roles('selectorSchneiderXa2ed33', 'pivots').includes('knob'), 'XA2ED33: manípulo separado do corpo e rotativo')
  check(roles('thermalRelaySiemens3ru1116', 'pivots').includes('reset'), '3RU1116: botão de rearme salta no disparo')
  check(['button-on', 'button-off'].every((r) => roles('motorBreakerSchneiderGv2me', 'pivots').includes(r)), 'GV2ME: botões I e O')
  check(['red', 'yellow', 'green'].every((r) => roles('towerLightSb23011', 'lamps').includes(r)), 'torre: três lentes com luz')
  check(['power', 'ch1', 'ch2'].every((r) => roles('safetyRelaySiemens3tk2840', 'lamps').includes(r)), '3TK2840: LED POWER, CH1 e CH2')
  check(['power', 'output'].every((r) => roles('photoSensorXukt1ksml2', 'lamps').includes(r)), 'XUKT1: LED de alimentação e de saída')
  check(['surgeProtectorWegSpw02', 'surgeProtectorWegSpw12'].every((t) => roles(t, 'lamps').includes('surge')), 'DPS: janela de estado')
  const greyOnly = ['fuseHolderSchneiderDf101v', 'towerLightSb23011', 'contactorWegCwbc65', 'surgeProtectorWegSpw12'].filter((t) => !roles(t, 'materials').some((m) => /metal|lente|preta|niquel/.test(m)))
  check(greyOnly.length === 0, `CAD sem cores recebem materiais reais (${greyOnly.join(', ') || 'todos'})`)
  if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, 'imported-finish-audit.png'), fullPage: true }) }

  // 2) Painel 3D real com os 14 tipos e estados de manobra
  await page.goto(baseURL + '/projects/native-partida-direta-v5')
  await page.waitForFunction(() => !document.body.innerText.includes('A carregar'), null, { timeout: 180000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Visualização 3D')?.click())
  await page.waitForTimeout(6000)
  const placed = await page.evaluate(async () => {
    // Os modelos com mecânica e luz, mais leves; o conjunto completo (33 MB) é revisto na página isolada,
    // porque o WebGL por software do navegador sem GPU fica sem memória com todos no mesmo painel.
    const types = ['fuseHolderSchneiderDf101v', 'selectorSchneiderXa2ed33', 'keyActuatorEao61', 'residualBreakerHagerCfc225p', 'towerLightSb23011', 'photoSensorXukt1ksml2', 'motorBreakerSchneiderGv2me']
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const store = useSimStore.getState()
    types.forEach((type, index) => store.addComponent(type, 1500 + (index % 4) * 170, 160 + Math.floor(index / 4) * 280))
    return useSimStore.getState().components.map((c) => c.type).filter((type) => types.includes(type))
  })
  check(placed.length === 7, 'os tipos com mecânica entram no projeto')
  await page.waitForTimeout(8000)
  await page.evaluate(async () => {
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const store = useSimStore.getState()
    store.play()
    const byType = (type) => useSimStore.getState().components.find((c) => c.type === type) ?? (() => { throw new Error('em falta no projeto: ' + type + ' · presentes: ' + useSimStore.getState().components.map((c) => c.type).join(',')) })()
    store.setComponentState(byType('fuseHolderSchneiderDf101v').id, { closed: false })
    store.setComponentState(byType('selectorSchneiderXa2ed33').id, { position: -1 })
    store.setComponentState(byType('keyActuatorEao61').id, { pressed: true })
    store.setComponentState(byType('residualBreakerHagerCfc225p').id, { closed: true })
  })
  await page.waitForTimeout(4000)
  if (output) await page.screenshot({ path: path.join(output, 'imported-panel3d.png'), timeout: 240000 })
  check(await page.locator('canvas').count() > 0, 'Painel 3D desenhado com os componentes importados')
  check(errors.length === 0, `sem erros JavaScript (${errors[0] ?? 'ok'})`)
  console.log(`\n✅ ${checks} verificações de acabamento e mecânica dos CAD importados`)
} finally {
  await browser.close()
}
