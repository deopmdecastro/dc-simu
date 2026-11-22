import { inspectorFixture } from './lib/inspector-fixture.mjs'

/** Cabeçalho da biblioteca: ações lado a lado, aviso de bloqueados só quando há bloqueados,
 *  contagem nos chips de domínio e Esc limpa a pesquisa. Capturas em runtime/library-header/. */
const output = 'runtime/library-header'
const f = await inspectorFixture({ output, height: 760 }), { page, check, stable } = f
try {
  const search = page.getByRole('textbox', { name: 'Pesquisar componentes' })
  const actions = page.locator('.dc-library-actions .dc-btn')
  check(await actions.count() === 2, 'Duas ações da biblioteca')
  const [a, b] = await actions.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) })))
  check(a.top === b.top && a.h === b.h && Math.abs(a.w - b.w) <= 1, `Ações lado a lado com o mesmo tamanho (${a.w}×${a.h} e ${b.w}×${b.h})`)
  check((await page.locator('[data-library-iec]').getAttribute('title')).includes('Esquema IEC 60617'), 'A explicação completa da ação IEC fica no título')

  const locked = await page.locator('.dc-library-model-notice').count()
  const text = locked ? await page.locator('.dc-library-model-notice').innerText() : ''
  check(!/^\s*0 componentes/.test(text), locked ? `Aviso compacto: «${text.trim()}»` : 'Sem componentes bloqueados, o aviso não aparece')

  const chips = page.locator('[role="tablist"][aria-label="Domínios da biblioteca"] [role="tab"]')
  const labels = await chips.allInnerTexts()
  check(labels.length > 1 && labels.every((l) => /\d+\s*$/.test(l.trim())), `Chips com contagem: ${labels.map((l) => l.replace(/\s+/g, ' ').trim()).join(' · ')}`)
  const total = Number(labels[0].match(/(\d+)\s*$/)[1]), parts = labels.slice(1).reduce((s, l) => s + Number(l.match(/(\d+)\s*$/)[1]), 0)
  check(total === parts, `«Todos» soma os domínios (${total} = ${parts})`)
  await page.screenshot({ path: `${output}/header.png`, clip: { x: 0, y: 0, width: 400, height: 330 } })

  await search.fill('contador')
  await search.press('Escape')
  check(await search.inputValue() === '', 'Esc limpa a pesquisa')
  stable()
  console.log('\nCabeçalho da biblioteca verificado')
} finally { await f.browser.close() }
