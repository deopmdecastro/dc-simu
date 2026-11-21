import path from 'node:path'
import { inspectorFixture } from './lib/inspector-fixture.mjs'

/** Temporizadores: o motor calcula tempo, saída e estado; o inspetor só oferece opções válidas.
 *  O atalho «Configuração» leva a secção para baixo do cartão sticky, sem a tapar. */
const output = path.resolve('docs/validation/inspectors-all-elements')
const f = await inspectorFixture({ output }), { page, check } = f
const panel = () => page.locator('.dc-inspector-scroll')
try {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 })
    for (const type of ['timerGeyaGrt8M1', 'timerGeyaGrt8M2', 'timerGeyaGrt8B1']) {
      await f.show(type)
      const config = panel().locator('[data-inspector-configuration]')
      await panel().getByRole('navigation', { name: 'Secções do inspetor' }).getByRole('button', { name: 'Configuração', exact: true }).click()
      await page.waitForTimeout(100)
      const geo = await panel().evaluate((root) => {
        const hero = root.querySelector('.dc-inspector-hero').getBoundingClientRect()
        const summary = root.querySelector('[data-inspector-configuration] > summary').getBoundingClientRect()
        return { heroBottom: hero.bottom, summaryTop: summary.top, rootBottom: root.getBoundingClientRect().bottom }
      })
      check(geo.summaryTop >= geo.heroBottom - 1 && geo.summaryTop < geo.rootBottom, `${type} @${width}: atalho Configuração não fica tapado pelo cabeçalho`)
      const timer = config.locator('[data-device-controls="geya"]')
      check(await timer.count() === 1, `${type} @${width}: controlos próprios do temporizador`)
      for (const name of ['Tempo definido (calculado)', 'Tempo decorrido', 'Temporização', 'Alimentação', 'Saída do relé']) {
        check(await timer.locator(`output[aria-label="${name}"]`).count() === 1, `${type} @${width}: «${name}» é leitura, não campo`)
      }
      const editable = await config.locator('input:not([disabled]), select:not([disabled]), [aria-haspopup="listbox"]:not([disabled])').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
      const allowed = type === 'timerGeyaGrt8B1' ? ['Escala de tempo', 'Ajuste do tempo (%)'] : ['Função do temporizador', 'Escala de tempo', 'Ajuste do tempo (%)']
      check(JSON.stringify(editable) === JSON.stringify(allowed), `${type} @${width}: só parâmetros válidos editáveis ${JSON.stringify(editable)}`)
      if (type === 'timerGeyaGrt8M2') await page.screenshot({ path: path.join(output, `timer-configuracao-${width}.png`) })
    }
  }
  // Temporizadores genéricos: o inspetor genérico mostra o estado calculado como leitura.
  const GENERIC = { timerRelayTON: ['presetMs'], timerRelayTOF: ['presetMs'], timerRelayStarDelta: ['presetMs', 'transitionMs'] }
  for (const [type, editableKeys] of Object.entries(GENERIC)) {
    await f.show(type)
    const config = panel().locator('[data-inspector-configuration]')
    const readOnly = await config.locator('.dc-inspector-state-row.is-readonly').count()
    const numbers = await config.locator('input[type="number"]:not([disabled])').count()
    const checkboxes = await config.locator('input[type="checkbox"]:not([disabled])').count()
    check(readOnly >= 3 && numbers === editableKeys.length && checkboxes === 0, `${type}: ${editableKeys.join(', ')} editável; ${readOnly} valores calculados só de leitura`)
    const min = await config.locator('input[type="number"]').first().getAttribute('min')
    check(min === '0', `${type}: tempo predefinido não aceita valores negativos`)
  }
  f.stable()
} finally { await f.browser.close() }
