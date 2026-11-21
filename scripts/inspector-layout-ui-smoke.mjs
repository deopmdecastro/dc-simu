import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { inspectorFixture } from './lib/inspector-fixture.mjs'

const output = path.resolve('docs/validation/inspectors-all-elements')
const f = await inspectorFixture({ output }), { page, check } = f
const layouts = [], failures = []
const types = ['plcSiemensLogo1224RC', 'timerGeyaGrt8M2', 'residualBreakerSchneiderIid4p', 'busbarPhaseStepped', 'panelEnclosure', 'motor3ph', 'multimeterDm20']
try {
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 })
    for (const type of types) {
      await f.show(type); await f.openGroups()
      const result = await page.locator('.dc-inspector-scroll').evaluate(root => {
        const bounds = root.getBoundingClientRect()
        const overflowing = [...root.querySelectorAll('input,button,textarea,.dc-inspector-group,.dc-inspector-terminal')].filter(el => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0 && getComputedStyle(el).position !== 'fixed' && (r.right > bounds.right + 3 || r.left < bounds.left - 3)
        }).slice(0, 8).map(el => ({ tag: el.tagName, class: String(el.className), label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 45) }))
        return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, overflowing }
      })
      const ok = result.scrollWidth <= result.clientWidth + 2 && !result.overflowing.length
      layouts.push({ width, type, ok, ...result })
      if (!ok) failures.push({ width, type, ...result })
      if ([390, 1440].includes(width) && ['timerGeyaGrt8M2', 'plcSiemensLogo1224RC', 'residualBreakerSchneiderIid4p'].includes(type)) {
        await page.screenshot({ path: path.join(output, type + '-' + width + '.png') })
      }
    }
  }
  check(!failures.length, '35 combinações de família/largura sem campos cortados: ' + JSON.stringify(failures))
  f.stable()
  await writeFile(path.join(output, 'layout-results.json'), JSON.stringify({ checks: f.count(), layouts, failures, errors: f.errors, scope: 'Inspetor real, 7 famílias em360/390/768/1024/1440px; grupos avançados abertos.' }, null, 2) + '\n')
} catch (error) {
  await writeFile(path.join(output, 'layout-results.json'), JSON.stringify({ layouts, failures, errors: f.errors }, null, 2) + '\n')
  throw error
} finally { await f.browser.close() }
