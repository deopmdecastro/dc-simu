import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const root = new URL('../', import.meta.url)
const [indexCss, toolbarCss, toolbarSource] = await Promise.all([
  readFile(new URL('src/index.css', root), 'utf8'),
  readFile(new URL('src/styles/toolbar-spacing.css', root), 'utf8'),
  readFile(new URL('src/components/Toolbar.tsx', root), 'utf8'),
])

const extract = (source, pattern, label) => {
  const match = source.match(pattern)
  assert.ok(match, `regra de CSS encontrada: ${label}`)
  return match[0]
}

const tagRule = extract(indexCss, /\.dc-diag-tag\s*\{[^}]*\}/, 'etiqueta de diagnóstico')
const badgeRule = extract(indexCss, /\.dc-diag-tag\.is-badge\s*\{[^}]*\}/, 'selo de diagnóstico')
const badgeTabRule = extract(indexCss, /\.dc-view-tab > \.dc-diag-tag\.is-badge\s*\{[^}]*\}/, 'espaço entre selo e conteúdo do separador')
const tabletTabRule = extract(toolbarCss, /html\[data-tablet="true"\] \.dc-views-container \[role="tab"\]\s*\{[^}]*\}/, 'separadores compactos de tablet')
const tabletLabelsRule = extract(toolbarCss, /html\[data-tablet="true"\] \.dc-views-container \.dc-view-label,[\s\S]*?\{[^}]*\}/, 'rótulos ocultos no modo compacto')
const containerRule = extract(indexCss, /@container dc-views \(max-width: 640px\) \{[^}]*\}/, 'rótulos responsivos em vistas estreitas')

assert.match(toolbarSource, /className=\{`dc-view-tab /, 'cada modo tem a classe de separador testada')
assert.match(toolbarSource, /'hidden md:inline'/, 'a vista móvel mantém os modos em estado de ícone')
assert.match(toolbarSource, /role="tablist"/, 'os modos continuam agrupados como separadores')
assert.match(toolbarSource, /aria-pressed=\{splitEnabled\}/, 'Dois canvas continua um controlo separado')
assert.match(toolbarSource, /'Dois canvas'/, 'o controlo separado conserva o rótulo Dois canvas')
assert.doesNotMatch(badgeRule, /position\s*:\s*absolute|(?:top|right)\s*:\s*-\d/, 'o selo não usa offsets negativos fora do botão')

const browser = await chromium.launch(process.env.PLATFORM_CHROME ? { executablePath: process.env.PLATFORM_CHROME } : {})
let checks = 0
const check = (condition, label) => {
  assert.ok(condition, label)
  checks += 1
  console.log(`PASS — ${label}`)
}

const fixture = `
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <div class="dc-views-container">
    <div role="tablist" aria-label="Vistas">
      <button class="dc-view-tab" role="tab" aria-selected="true"><svg class="icon" viewBox="0 0 14 14"></svg><span class="dc-view-label">3D Realista</span><span class="dc-diag-tag is-badge is-ok" role="status">✓</span></button>
      <button class="dc-view-tab" role="tab" aria-selected="false"><svg class="icon" viewBox="0 0 14 14"></svg><span class="dc-view-label">Ladder</span><span class="dc-diag-tag is-badge is-warning" role="status">12</span></button>
      <button class="dc-view-tab" role="tab" aria-selected="false"><svg class="icon" viewBox="0 0 14 14"></svg><span class="dc-view-label">GRAFCET</span><span class="dc-diag-tag is-badge is-error" role="status">99+</span></button>
    </div>
    <button class="split-control" type="button" aria-pressed="false">Dois canvas</button>
  </div>`

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 500 } })
  await page.setContent(fixture)
  await page.addStyleTag({ content: `
    * { box-sizing: border-box; }
    body { margin: 0; font: 12px Arial, sans-serif; }
    .dc-views-container { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; overflow-x: auto; container: dc-views / inline-size; }
    [role="tablist"] { display: inline-flex; flex: none; align-items: center; gap: 4px; padding: 5px; background: #eef1f7; }
    .dc-view-tab { display: inline-flex; flex: none; align-items: center; gap: 6px; min-height: 30px; padding: 0 12px; border: 1px solid #d6deea; white-space: nowrap; }
    .dc-view-tab .icon { width: 14px; height: 14px; flex: none; background: #607087; }
    .dc-view-label { display: none; }
    @media (min-width: 768px) { .dc-view-label { display: inline; } }
    .dc-diag-tag { display: inline-flex; align-items: center; height: 18px; padding: 0 7px; border: 1px solid; border-radius: 999px; white-space: nowrap; flex: 0 0 auto; }
    ${tagRule}
    ${badgeRule}
    ${badgeTabRule}
    ${tabletTabRule}
    ${tabletLabelsRule}
    ${containerRule}
    .split-control { flex: none; min-height: 30px; }
  ` })

  const verifyLayout = async (label, width, tablet = false) => {
    await page.setViewportSize({ width, height: 500 })
    await page.evaluate((isTablet) => { document.documentElement.dataset.tablet = String(isTablet) }, tablet)
    const result = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')]
      const tablist = document.querySelector('[role="tablist"]')
      const split = document.querySelector('.split-control')
      return {
        tabs: tabs.map((tab) => {
          const button = tab.getBoundingClientRect()
          const icon = tab.querySelector('.icon').getBoundingClientRect()
          const badge = tab.querySelector('.dc-diag-tag').getBoundingClientRect()
          const text = tab.querySelector('.dc-view-label')
          const label = text.getBoundingClientRect()
          return {
            button: { left: button.left, right: button.right, width: button.width },
            icon: { right: icon.right },
            badge: { left: badge.left, right: badge.right, width: badge.width },
            label: { left: label.left, right: label.right, visible: getComputedStyle(text).display !== 'none' },
            badgePosition: getComputedStyle(tab.querySelector('.dc-diag-tag')).position,
          }
        }),
        splitLeft: split.getBoundingClientRect().left,
        tablistRight: tablist.getBoundingClientRect().right,
        splitIsSibling: split.parentElement === tablist.parentElement && !tablist.contains(split),
      }
    })

    check(result.tabs.length === 3, `${label}: os três modos continuam presentes`)
    for (const [index, tab] of result.tabs.entries()) {
      check(tab.badgePosition === 'static', `${label}: selo ${index + 1} participa no fluxo do separador`)
      check(tab.badge.left > tab.icon.right && tab.badge.right <= tab.button.right - 1, `${label}: selo ${index + 1} fica dentro do botão e não cobre o ícone`)
      check(tab.badge.width >= (index === 2 ? 18 : 14), `${label}: badge multi-dígito reserva largura suficiente (${tab.badge.width.toFixed(1)}px)`)
      if (tab.label.visible) check(tab.badge.left >= tab.label.right, `${label}: selo ${index + 1} não se sobrepõe ao rótulo`)
      if (tablet) check(!tab.label.visible && tab.button.width >= 42, `${label}: estado compacto mantém alvo de toque e só ícone + selo`)
    }
    if (width < 768 && !tablet) check(result.tabs.every((tab) => !tab.label.visible), `${label}: estado móvel mantém os separadores em modo de ícone`)
    check(result.splitIsSibling && result.splitLeft >= result.tablistRight, `${label}: «Dois canvas» permanece separado dos separadores`)
  }

  await verifyLayout('desktop largo', 1440)
  await verifyLayout('vista estreita', 360)
  await verifyLayout('tablet compacto', 820, true)
  console.log(`\n✅ ${checks} verificações de geometria do selo de diagnóstico`)
} finally {
  await browser.close()
}
