import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { inspectorFixture } from './lib/inspector-fixture.mjs'

const output = path.resolve('docs/validation/enclosure-holes')
const f = await inspectorFixture({ output }), { page, check } = f
const layouts = []
try {
  const [id] = await f.show('panelEnclosure')
  await f.openGroups()
  const section = page.locator('summary').filter({ hasText: /^Furos no quadro/ }).first().locator('..')
  const holes = () => f.store(s => s.getState().components[0].state.holes ?? [])
  const commit = async (name, value) => { const field = section.getByRole('spinbutton', { name, exact: true }); await field.fill(String(value)); await field.press('Enter'); await f.frame() }
  check((await section.innerText()).match(/Furos no quadro/gi)?.length === 1, 'Título do grupo sem repetição')
  await section.getByRole('button', { name: 'Porta', exact: true }).click()
  await section.getByRole('button', { name: 'Ø22', exact: true }).click()
  await commit('Posição X do furo (mm)', -35)
  await commit('Posição Y do furo (mm)', 60)
  await section.getByRole('button', { name: 'Fazer furo', exact: true }).click(); await f.frame()
  let created = (await holes())[0]
  check(created.face === 'door' && created.diameterMm === 22 && created.offsetXmm === -35 && created.offsetYmm === 60 && created.glandType === 'none', 'Criação usa face, diâmetro e coordenadas confirmados')
  const dia = section.getByRole('spinbutton', { name: 'Diâmetro do furo (mm)', exact: true })
  await dia.fill(''); await dia.press('Tab')
  check(await dia.getAttribute('aria-invalid') === 'true', 'Diâmetro vazio recebe erro acessível')
  check(await section.getByRole('button', { name: 'Fazer furo', exact: true }).isDisabled(), 'Rascunho inválido impede criar com valor anterior')
  await dia.focus(); await dia.press('Escape'); await commit('Diâmetro do furo (mm)', 28)
  await section.getByRole('button', { name: 'Fazer furo', exact: true }).click(); await f.frame()
  check((await holes())[1].diameterMm === 28, 'Diâmetro personalizado confirmado cria o furo certo')
  await section.getByRole('button', { name: 'Remover furo 2', exact: true }).click(); await f.frame()
  check((await holes()).length === 1, 'Remover elimina apenas o furo indicado')
  await f.store(s => s.getState().undo()); await f.frame()
  check((await holes()).length === 2, 'Desfazer recupera furo removido')
  await f.store(s => s.getState().redo()); await f.frame()
  const item = section.locator('[data-hole-id]').first()
  await item.locator('summary').click()
  await commit('Posição X do furo 1 (mm)', -50)
  check((await holes())[0].offsetXmm === -50, 'Editar posição altera o furo existente')
  const snapshot = await f.store(s => s.getState().saveJSON())
  await f.store((s, json) => s.getState().loadJSON(json), snapshot)
  await f.store((s, id) => s.getState().selectComponents([id]), id); await f.frame()
  check((await holes())[0].offsetXmm === -50, 'Edição persiste ao guardar e reabrir')
  await section.locator(':scope > summary').evaluate(el => { el.parentElement.open = true })
  created = (await holes())[0]
  await f.store((s, { id, hole }) => s.getState().addMountedDevice('emergencyButton', id, hole.face, hole.offsetXmm, hole.offsetYmm, hole.diameterMm, hole.id), { id, hole: created })
  await f.store((s, id) => s.getState().selectComponents([id]), id)
  await f.frame()
  await section.locator(':scope > summary').evaluate(el => { el.parentElement.open = true })
  await section.locator('[data-hole-id] details').first().evaluate(el => { el.open = true })
  check(await section.getByRole('spinbutton', { name: 'Posição X do furo 1 (mm)', exact: true }).isDisabled() && await section.getByRole('button', { name: 'Remover furo 1', exact: true }).isDisabled(), 'Furo ocupado protege geometria e remoção para manter aparelho alinhado')
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await f.frame()
    await section.scrollIntoViewIfNeeded()
    const result = await section.evaluate(root => {
      const b = root.getBoundingClientRect()
      const controls = [...root.querySelectorAll('button,input')].filter(el => el.getBoundingClientRect().height > 0)
      return { width: b.width, overflow: root.scrollWidth > root.clientWidth + 2, small: controls.filter(el => el.getBoundingClientRect().height < 39).map(el => el.getAttribute('aria-label') || el.textContent) }
    })
    layouts.push({ width, ...result })
    check(!result.overflow && !result.small.length, `${width}px: sem transbordo e alvos de pelo menos40px: ${JSON.stringify(result)}`)
    if ([390, 1440].includes(width)) await section.screenshot({ path: path.join(output, `holes-occupied-${width}.png`) })
  }
  await f.show('panelEnclosure'); await f.openGroups()
  await section.locator('.dc-hole-shortcuts').evaluate(el => { el.open = false })
  check(await section.getByText('Ainda sem furos', { exact: true }).isVisible(), 'Estado vazio explica como começar')
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1100 }); await f.frame()
    await section.evaluate(el => {
      const scroll = el.closest('.dc-inspector-scroll'), hero = scroll.querySelector('.dc-inspector-hero')
      scroll.scrollTop += el.getBoundingClientRect().top - scroll.getBoundingClientRect().top - hero.getBoundingClientRect().height - 12
    })
    await page.screenshot({ path: path.join(output, `holes-empty-${width}.png`) })
  }
  await section.locator('.dc-hole-shortcuts > summary').click()
  await section.getByRole('button', { name: '3 bucins M20 no fundo', exact: true }).click(); await f.frame()
  check((await holes()).length === 3 && (await holes()).every((hole, index) => hole.face === 'bottom' && hole.diameterMm === 20 && hole.glandType === 'M20' && hole.offsetXmm === [-60, 0, 60][index]), 'Atalho cria três bucins M20 separados60mm')
  f.stable()
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ checks: f.count(), layouts, errors: f.errors, scope: 'React/Sidebar/store reais; criar, validar, editar, remover, desfazer, persistir e proteger furo ocupado; pedidos externos bloqueados.' }, null, 2) + '\n')
} catch (error) { await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); throw error }
finally { await f.browser.close() }
