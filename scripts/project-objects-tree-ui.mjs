import path from 'node:path'
import { browserFixture } from './lib/browser-fixture.mjs'

/**
 * Lista de Objetos: grupos (Ctrl+G) em árvore e seleção por intervalo.
 * - cada grupo é uma pasta (recolhida por omissão) na posição do membro mais à frente;
 * - expandir mostra os membros indentados; clicar num membro seleciona só esse membro;
 * - Shift+clique seleciona tudo entre duas linhas; Ctrl+clique liga/desliga uma linha;
 * - duplo clique muda o nome do grupo; o botão Desagrupar desfaz a pasta.
 */
const output = path.resolve('runtime/project-objects-tree')
const f = await browserFixture({ baseURL: process.env.OBJECTS_TEST_URL ?? 'http://127.0.0.1:5173', output, height: 900 })
const { page, check } = f
const store = (fn, arg) => page.evaluate(async ({ source, arg }) => {
  const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
  return Function('s', 'arg', 'return (' + source + ')(s, arg)')(useSimStore, arg)
}, { source: fn.toString(), arg })
const selected = () => store((s) => s.getState().selectedComponentIds.map((id) => s.getState().components.find((c) => c.id === id).ref).sort())
try {
  await page.evaluate(async () => {
    // Carregar o componente primeiro: o store fica com o mesmo URL (?t=…) que o componente usa.
    await import('/src/components/ProjectObjects.tsx')
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    const types = ['mecDischargeRamp', 'mecDischargeRamp', 'mecDischargeRamp', 'mecBenchDuct', 'mecAluProfile', 'pushButtonXb2No']
    const refs = ['RMP1', 'RMP2', 'RMP3', 'CAL1', 'PRF1', 'S1']
    const components = types.map((t, i) => ({ ...createComponent(t, refs[i], '', i, i * 120, 0), z: i }))
    useSimStore.setState({ components, wires: [], selectionGroups: [], selectedComponentIds: [], demoMode: false })
    useSimStore.getState().groupItems('schematic', components.slice(0, 3).map((c) => c.id))
    const { default: ProjectObjects } = await import('/src/components/ProjectObjects.tsx')
    window.__fixtureRoot.render(window.__fixtureReact.createElement('div', { style: { width: 420, height: 800, display: 'flex', flexDirection: 'column' } }, window.__fixtureReact.createElement(ProjectObjects)))
  })
  await page.waitForSelector("[data-object-group]")
  const rows = () => page.$$eval('.dc-objects-list > li', (lis) => lis.map((li) => li.matches('[data-object-group]') ? 'G:' + li.querySelectorAll('.dc-objects-children > li').length : li.querySelector('.dc-objects-ref').textContent))
  check(JSON.stringify(await rows()) === JSON.stringify(['S1', 'PRF1', 'CAL1', 'G:0']), `Grupo numa pasta recolhida, na ordem de desenho: ${await rows()}`)
  const head = page.locator('[data-object-group] .dc-objects-group-head')
  check((await head.locator('.dc-objects-count').textContent()) === '3' && (await head.textContent()).includes('Grupo 1'), 'Pasta «Grupo 1» com 3 objetos')
  await head.locator('.dc-objects-main').click()
  check(JSON.stringify(await selected()) === JSON.stringify(['RMP1', 'RMP2', 'RMP3']), 'Clicar na pasta seleciona o grupo inteiro')
  await head.locator('.dc-objects-twisty').click()
  check(JSON.stringify(await rows()) === JSON.stringify(['S1', 'PRF1', 'CAL1', 'G:3']), 'Expandir mostra os 3 membros por baixo da pasta')
  const nested = page.locator('.dc-objects-children .dc-objects-main')
  await nested.nth(1).click()
  check(JSON.stringify(await selected()) === JSON.stringify(['RMP2']), 'Clicar num membro seleciona só esse membro')
  check(await page.locator('.dc-objects-children').count() === 1, 'O grupo continua aberto com parte selecionada')
  // Shift+clique: de PRF1 (topo) a RMP2 (membro) → PRF1, CAL1, a pasta (grupo todo) e os membros até RMP2.
  await page.locator('.dc-objects-list > li:not([data-object-group]) .dc-objects-main').nth(1).click()
  await nested.nth(1).click({ modifiers: ['Shift'] })
  check(JSON.stringify(await selected()) === JSON.stringify(['CAL1', 'PRF1', 'RMP2', 'RMP3']), `Shift+clique seleciona o intervalo (pasta aberta, membros por ordem de desenho RMP3→RMP1: só até ao clicado): ${await selected()}`)
  await page.locator('.dc-objects-list > li:not([data-object-group]) .dc-objects-main').first().click({ modifiers: ['Shift'] })
  check(JSON.stringify(await selected()) === JSON.stringify(['PRF1', 'S1']), `Shift+clique para cima a partir da mesma âncora: ${await selected()}`)
  await page.locator('.dc-objects-list > li:not([data-object-group]) .dc-objects-main').nth(2).click({ modifiers: ['Control'] })
  check(JSON.stringify(await selected()) === JSON.stringify(['CAL1', 'PRF1', 'S1']), 'Ctrl+clique junta uma linha')
  await page.locator('.dc-objects-list > li:not([data-object-group]) .dc-objects-main').first().click({ modifiers: ['Control'] })
  check(JSON.stringify(await selected()) === JSON.stringify(['CAL1', 'PRF1']), 'Ctrl+clique retira uma linha')
  await head.locator('.dc-objects-main').dblclick()
  await page.fill('.dc-objects-rename', 'Rampas')
  await page.keyboard.press('Enter')
  check((await store((s) => s.getState().selectionGroups[0].name)) === 'Rampas' && (await head.textContent()).includes('Rampas'), 'Duplo clique muda o nome do grupo (vai com o projeto)')
  await page.fill('.dc-objects-search input', 'RMP3')
  check(JSON.stringify(await rows()) === JSON.stringify(['G:1']), 'Pesquisa abre o grupo e mostra só o membro encontrado')
  await page.fill('.dc-objects-search input', '')
  await page.screenshot({ path: path.join(output, 'objects-tree.png'), clip: { x: 0, y: 0, width: 440, height: 520 } })
  await head.locator('[title^="Desagrupar"]').click()
  check(JSON.stringify(await rows()) === JSON.stringify(['S1', 'PRF1', 'CAL1', 'RMP3', 'RMP2', 'RMP1']), 'Desagrupar devolve os membros à lista')
  f.stable()
  console.log(`\n✅ ${f.count()} verificações da árvore de Objetos passaram`)
} finally {
  await f.browser.close()
}
