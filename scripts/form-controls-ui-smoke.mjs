import { inspectorFixture } from './lib/inspector-fixture.mjs'

/**
 * Controlos de formulário da plataforma no inspetor real:
 * - não há <select> nativos (a lista pendente é ui/Select, desenhada pela plataforma);
 * - as checkboxes usam o estilo próprio (appearance: none, preenchimento da marca e visto em SVG);
 * - os estados hidráulicos têm rótulos em português (sem chaves camelCase partidas).
 * Capturas em runtime/form-controls/.
 */
const output = 'runtime/form-controls'
const f = await inspectorFixture({ output, height: 1300 }), { page, check, show, openGroups, stable } = f

for (const type of ['waterSupplyBox', 'hydraulicFlowMeter']) {
  const known = await page.evaluate(async (t) => {
    const { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    try { createComponent(t, 'X', '', 0, 0, 0); return true } catch { return false }
  }, type)
  if (!known) continue
  await show(type)
  await openGroups()
  const scroll = page.locator('.dc-inspector-scroll')

  check(await scroll.locator('select').count() === 0, `${type}: nenhum <select> nativo no inspetor`)

  const boxes = scroll.locator('input[type="checkbox"]')
  const n = await boxes.count()
  const styles = await boxes.evaluateAll((els) => els.map((el) => {
    const cs = getComputedStyle(el)
    return { appearance: cs.appearance, checked: el.checked, image: cs.backgroundImage, bg: cs.backgroundColor }
  }))
  check(n > 0 && styles.every((s) => s.appearance === 'none'), `${type}: ${n} checkboxes com o estilo da plataforma (appearance: none)`)
  const on = styles.filter((s) => s.checked)
  check(on.length === 0 || on.every((s) => s.image.includes('svg') && s.bg !== 'rgba(0, 0, 0, 0)'), `${type}: checkboxes marcadas com preenchimento da marca e visto`)

  const text = await scroll.innerText()
  check(!/\b(flow Rate Lpm|total Volume L|mains Supply On|door Open|valve Open|pipe DN)\b/.test(text), `${type}: estados com rótulos em português`)

  const dn = scroll.locator('button.dcx-select').filter({ hasText: /^DN\d+/ }).first()
  if (await dn.count()) {
    await dn.click()
    const menu = page.locator('.dcx-select-menu')
    await menu.waitFor()
    check((await menu.locator('[role="option"]').count()) >= 6, `${type}: o DN abre a lista da plataforma (DN25–DN80)`)
    await page.screenshot({ path: `${output}/${type}-dn-aberto.png` })
    await menu.locator('[role="option"]', { hasText: 'DN50' }).first().click()
    check(/DN50/.test(await dn.innerText()), `${type}: escolher DN50 atualiza o componente`)
  }
  await page.screenshot({ path: `${output}/${type}.png`, fullPage: true })
}

stable()
await f.browser.close()
console.log('Controlos de formulário verificados')
