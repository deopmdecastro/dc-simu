import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { inspectorFixture } from './lib/inspector-fixture.mjs'

const output = path.resolve('docs/validation/inspectors-all-elements')
const f = await inspectorFixture({ output }), { page, check } = f
try {
  const [id] = await f.show('contactorWegCwbc65'); await f.openGroups()
  const t = await f.store(s => s.getState().components[0].terminals.find(t => t.label === 'A1'))
  await page.getByLabel('Nome do borne A1', { exact: true }).fill('Comando da bobina')
  const renamed = await f.store(s => s.getState().components[0].terminals.find(t => t.label === 'A1'))
  check(renamed?.id === t.id && renamed.displayName === 'Comando da bobina' && renamed.label === 'A1', 'Nome do borne é documental: A1 e a identidade elétrica não mudam')
  const tx = page.getByLabel('Posição X do borne A1 (0–1)', { exact: true })
  await tx.fill('2'); await tx.press('Tab'); await f.frame()
  check(await tx.getAttribute('aria-invalid') === 'true' && await f.store(s => s.getState().components[0].terminals.find(t => t.label === 'A1').x) === t.x, 'Coordenada de borne fora0–1 é assinalada sem alterar o modelo')
  await tx.focus(); await tx.press('Escape')
  const x = page.getByLabel('Posição X (px)', { exact: true })
  const original = await f.store(s => s.getState().components[0].schematicX)
  await x.fill(''); await x.press('Tab')
  check(await x.getAttribute('aria-invalid') === 'true' && await f.store(s => s.getState().components[0].schematicX) === original, 'Limpar número não grava zero nem NaN')
  await x.focus(); await x.press('Escape')
  check(await x.inputValue() === String(original), 'Escape restaura o valor atual e elimina o rascunho inválido')
  await x.fill('-14'); await x.press('Enter')
  check(await f.store(s => s.getState().components[0].schematicX) === -14, 'Posições negativas válidas gravam ao confirmar com Enter')
  const json = await f.store(s => s.getState().saveJSON())
  await f.store((s, json) => s.getState().loadJSON(json), json)
  check(await f.store(s => s.getState().components[0].terminals.find(t => t.label === 'A1').displayName) === 'Comando da bobina', 'Nome de borne persiste no projeto real')
  await f.store((s, id) => s.getState().selectComponents([id]), id); await f.frame(); await f.openGroups()
  await f.store(s => { s.getState().setComponentsLocked([s.getState().components[0].id], true) }); await f.frame()
  check(await page.getByLabel('Posição X (px)', { exact: true }).isDisabled(), 'Componente bloqueado: posição estrutural fica protegida')
  const rotation = page.getByRole('button', { name: /Girar 90°/ })
  check(await rotation.isDisabled(), 'Componente bloqueado: Girar fica desativado')
  await f.store(s => s.getState().setComponentsLocked([s.getState().components[0].id], false)); await f.frame()
  await f.store((s, tid) => s.getState().selectTerminal(tid), t.id); await f.frame()
  await page.getByLabel('Nome do borne', { exact: true }).fill('Borne dedicado')
  check(await f.store(s => s.getState().components[0].terminals.find(t => t.label === 'A1').displayName) === 'Borne dedicado', 'Inspetor dedicado e integrado usam o mesmo nome documental')
  await f.store(s => { s.getState().play(); s.getState().pause() }); await f.frame()
  await f.store((s, tid) => s.getState().selectTerminal(tid), t.id); await f.frame()
  check(await f.store(s => s.getState().selectedTerminalId) === null, 'RUN/PAUSA: navegação não reabre o inspetor de edição do borne')
  await f.store(s => s.getState().stop()); await f.frame()

  // Two different wire styles and an external edit made while the inspector
  // session is open: Cancel must restore each edited target, not unrelated work.
  await f.show('breakerSchneiderIc60h1p', 3)
  const setupWires = async () => {
    const baseline = await f.store(s => {
      const cs = s.getState().components
      s.getState().addWire(cs[0].terminals[0].id, cs[1].terminals[0].id)
      s.getState().addWire(cs[0].terminals[1].id, cs[2].terminals[0].id)
      const ws = s.getState().wires.map((w, i) => ({ ...w, color: i ? 'blue' : 'black', gauge: i ? '2.5mm²' : '1.5mm²', label: 'Inicial ' + i }))
      s.setState({ wires: ws, selectedComponentIds: [], selectedTerminalId: null, selectedWireId: ws[0].id, selectedWireIds: ws.map(w => w.id) }); return ws
    })
    await f.frame(); await f.openGroups(); return baseline
  }
  const baseline = await setupWires()
  await page.getByRole('radiogroup', { name: 'Cor do cabo', exact: true }).getByRole('radio', { name: /^Vermelho/ }).click()
  check(await f.store(s => s.getState().wires.every(w => w.color === 'red')), 'Edição em lote aplica a cor aos dois cabos selecionados')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); await f.frame()
  check(await f.store((s, before) => s.getState().wires.every(w => w.color === before.find(b => b.id === w.id).color), baseline), 'Cancelar repõe os estilos individuais dos dois cabos')
  await page.getByRole('radiogroup', { name: 'Cor do cabo', exact: true }).getByRole('radio', { name: /^Vermelho/ }).click()
  await f.store((s, wid) => s.getState().updateWire(wid, { color: 'green', label: 'Alteração posterior externa' }), baseline[1].id)
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); await f.frame()
  check(await f.store((s, before) => { const ws = s.getState().wires; return ws[0].color === before[0].color && ws[1].color === 'green' && ws[1].label === 'Alteração posterior externa' }, baseline), 'Cancelar preserva alterações posteriores e campos externos à sessão')
  await page.getByRole('radio', { name: 'Secção 4mm²', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar cabo', exact: true }).click()
  check(await f.store(s => s.getState().wires.every(w => w.gauge === '4mm²')), 'Guardar confirma a secção dos dois cabos')
  const saved = await f.store(s => s.getState().saveJSON()); await f.store((s, json) => s.getState().loadJSON(json), saved)
  check(await f.store(s => s.getState().wires.every(w => w.gauge === '4mm²')), 'Edição multicabo persiste ao guardar/reabrir')
  await f.show('panelEnclosure'); await f.openGroups()
  const width = page.getByRole('spinbutton', { name: 'Largura do quadro (mm)', exact: true })
  const originalWidth = await f.store(s => s.getState().components[0].state.widthMm)
  await width.fill(''); await width.press('Tab')
  check(await f.store(s => s.getState().components[0].state.widthMm) === originalWidth && await width.getAttribute('aria-invalid') === 'true', 'Quadro: apagar a medida não redimensiona ao mínimo durante a digitação')
  await width.focus(); await width.press('Escape'); await width.fill('800'); await width.press('Enter')
  check(await f.store(s => s.getState().components[0].state.widthMm) === 800, 'Quadro: confirmar medida redimensiona o componente e mantém valor válido')
  await f.show('busbarPhaseAcrylic'); await f.openGroups()
  const poles = page.getByRole('spinbutton', { name: 'Número de bornes do barramento', exact: true })
  const originalPoles = await f.store(s => s.getState().components[0].state.poleCount)
  await poles.fill('2.5'); await poles.press('Tab')
  check(await f.store(s => s.getState().components[0].state.poleCount) === originalPoles && await poles.getAttribute('aria-invalid') === 'true', 'Barramento: contagem fracionária não cria bornes parciais')
  await poles.focus(); await poles.press('Escape'); await poles.fill(String(originalPoles + 1)); await poles.press('Enter')
  check(await f.store((s, n) => s.getState().components[0].state.poleCount === n + 1, originalPoles), 'Barramento: contagem inteira confirmada atualiza os bornes')
  f.stable()
  await writeFile(path.join(output, 'interactions-results.json'), JSON.stringify({ checks: f.count(), errors: f.errors, scope: 'Sidebar e store reais: nomes de bornes, números inválidos, Enter/Escape, bloqueio, manobra, cancelamento multicabo e persistência; pedidos externos bloqueados.' }, null, 2) + '\n')
} catch (error) { await page.screenshot({ path: path.join(output, 'interactions-failure.png') }).catch(() => {}); throw error }
finally { await f.browser.close() }
