import path from 'node:path'
import { inspectorFixture } from './lib/inspector-fixture.mjs'
import { attachPanel } from './lib/panel-fixture.mjs'

/** Biblioteca de etiquetas: personalização antes de colar (fundo, cor, símbolo), logótipos reais das marcas,
 *  etiquetas na sobretampa (inspetor e Panel3D) e grelha visual de símbolos no editor da etiqueta. */
const output = path.resolve('docs/validation/panel-labels')
const f = await inspectorFixture({ output }), { page, check } = f
const decals = () => f.store(s => s.getState().components[0].decals ?? [])
const last = async () => (await decals()).at(-1)
/** Fração de píxeis de uma imagem (data URL) próximos de uma cor — prova que há desenho e não só fundo. */
const share = (src, [r, g, b], tolerance = 60) => page.evaluate(async ({ src, r, g, b, tolerance }) => {
  const image = new Image(); image.src = src; await image.decode()
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let hit = 0
  for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) < tolerance) hit++
  return hit / (data.length / 4)
}, { src, r, g, b, tolerance })
try {
  await f.show('panelEnclosure'); await f.openGroups()
  const dialog = page.getByRole('dialog', { name: 'Biblioteca de etiquetas' })

  // 1. Personalizar antes de colar: fundo, cor do texto/símbolo e símbolo.
  await page.getByRole('button', { name: 'Biblioteca de etiquetas', exact: true }).click()
  await dialog.getByRole('searchbox').fill('risco')
  await dialog.getByRole('button', { name: 'Escolher RISCO ELÉTRICO', exact: true }).click()
  const editor = dialog.getByRole('region', { name: 'Personalizar etiqueta' })
  check(await editor.isVisible(), 'Escolher um modelo abre a personalização sem colar logo')
  await editor.getByRole('radio', { name: 'Vermelho', exact: true }).click()
  await editor.getByLabel('Cor do texto e do símbolo', { exact: true }).evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '#ffffff'); el.dispatchEvent(new Event('input', { bubbles: true })) })
  await editor.getByRole('radio', { name: 'Perigo de morte', exact: true }).click()
  await page.screenshot({ path: path.join(output, 'library-customize.png') })
  const inside = async () => { const dlg = await dialog.boundingBox(), btn = await editor.getByRole('button', { name: 'Adicionar etiqueta', exact: true }).boundingBox(); return btn.y >= dlg.y && btn.y + btn.height <= dlg.y + dlg.height + 0.5 && btn.x + btn.width <= dlg.x + dlg.width + 0.5 }
  check(await inside(), 'Botões Voltar/Adicionar ficam inteiros dentro da janela (1440 px)')
  await page.setViewportSize({ width: 390, height: 844 }); await f.frame()
  await page.screenshot({ path: path.join(output, 'library-customize-390.png') })
  check(await inside(), 'Botões Voltar/Adicionar ficam inteiros dentro da janela (390 px)')
  check(await page.evaluate(() => { const d = document.querySelector('.dc-sticker-dialog'); return d.scrollWidth <= d.clientWidth + 1 }), '390 px: personalização sem transbordo horizontal')
  await page.setViewportSize({ width: 1440, height: 900 }); await f.frame()
  await editor.getByRole('button', { name: 'Adicionar etiqueta', exact: true }).click(); await f.frame()
  let d = await last()
  check(d.background === '#dc2626' && d.color === '#ffffff' && d.icon === 'danger' && d.face === 'door', `Fundo, cor e símbolo escolhidos no modal ficam na etiqueta (${d.background}, ${d.color}, ${d.icon}, ${d.face})`)

  // 2. Marcas: logótipo real (cores do fabricante), não texto.
  await page.getByRole('button', { name: 'Biblioteca de etiquetas', exact: true }).click()
  await dialog.getByLabel('Categoria de etiquetas').click(); await page.getByRole('option', { name: 'Marcas', exact: true }).click()
  await page.waitForTimeout(800)
  const brands = { 'WEG': [0, 93, 164], 'Siemens': [0, 153, 153], 'Schneider Electric': [61, 205, 88], 'ABB': [255, 0, 15], 'WAGO': [110, 200, 0], 'Eaton': [0, 103, 177], 'Philips': [11, 94, 215], 'Hager': [0, 120, 195] }
  for (const [name, rgb] of Object.entries(brands)) {
    const card = dialog.getByRole('button', { name: `Escolher ${name}`, exact: true })
    const src = await card.locator('img').getAttribute('src')
    const colored = await share(src, rgb, 90)
    check(colored > 0.01, `Marca ${name}: pré-visualização mostra o logótipo real nas cores do fabricante (${(colored * 100).toFixed(1)} % dos píxeis)`)
  }
  await page.screenshot({ path: path.join(output, 'library-brands.png') })
  await dialog.getByRole('button', { name: 'Escolher WEG', exact: true }).click()
  await dialog.getByRole('button', { name: 'Adicionar etiqueta', exact: true }).click(); await f.frame()
  d = await last()
  check(d.icon === 'brand:weg', 'Etiqueta WEG guarda o logótipo (brand:weg)')
  await page.waitForTimeout(500)
  const large = await page.locator('.dc-decal-fields .dc-decal-preview.is-large img').getAttribute('src')
  check(await share(large, [0, 93, 164], 90) > 0.02, 'Editor da etiqueta mostra o logótipo WEG (azul #005da4)')

  // 3. Grelha visual de símbolos no editor da etiqueta selecionada.
  await page.getByRole('button', { name: 'Biblioteca de etiquetas', exact: true }).click()
  await dialog.getByRole('searchbox').fill('Cozinha')
  await dialog.getByRole('button', { name: 'Escolher Cozinha', exact: true }).first().dblclick(); await f.frame()
  check((await last()).text === 'Cozinha', 'Duplo clique num modelo cola-o diretamente')
  await page.locator('.dc-decal-fields').getByRole('radio', { name: 'Bomba', exact: true }).click(); await f.frame()
  check((await last()).icon === 'pump', 'Grelha de símbolos do editor troca o símbolo da etiqueta')

  // 4. Sobretampa: atalho no cartão da sobretampa, destino predefinido e posição na faixa lisa.
  await page.getByRole('button', { name: 'Sólida', exact: true }).click(); await f.frame()
  await page.getByRole('button', { name: 'Adicionar etiqueta na sobretampa', exact: true }).click()
  await dialog.getByRole('searchbox').fill('Sala')
  await dialog.getByRole('button', { name: /^Escolher Sala/ }).first().click()
  check(await dialog.getByRole('group', { name: 'Onde colar a etiqueta' }).getByRole('button', { name: 'Sobretampa', exact: true }).getAttribute('aria-pressed') === 'true', 'Atalho da sobretampa abre a biblioteca com a sobretampa como destino')
  await dialog.getByRole('button', { name: 'Adicionar etiqueta', exact: true }).click(); await f.frame()
  d = await last()
  const layout = await page.evaluate(async (state) => {
    const { modularCoverLayout } = await window.__fixtureImport('/src/three/modularCoverLayout.ts')
    const { enclosureDimsOf } = await window.__fixtureImport('/src/three/enclosureParts.ts')
    return modularCoverLayout(enclosureDimsOf(state), typeof state.modularRows === 'number' ? state.modularRows : undefined)
  }, await f.store(s => s.getState().components[0].state))
  const top = layout.openings.at(-1)
  check(d.face === 'innerCover' && d.offsetYmm > top.yMm + top.heightMm / 2 && d.offsetYmm < layout.heightMm / 2, `Etiqueta na sobretampa fica na faixa lisa acima da fila de aparelhos (y=${d.offsetYmm} mm)`)
  check(await page.locator('[data-inner-cover-stickers] .dc-inspector-count').textContent() === '1', 'Cartão da sobretampa conta as etiquetas lá coladas')
  check(await page.getByLabel('Face da etiqueta', { exact: true }).textContent().then(t => t.includes('Sobretampa')), 'Face da etiqueta selecionada mostra «Sobretampa»')

  // 5. Panel3D real: a etiqueta assenta na chapa da sobretampa e só existe com a sobretampa sólida.
  const coverId = d.id
  // attachPanel monta o Panel3D real e limpa a loja: o projeto é reposto a seguir.
  const project = await f.store(s => s.getState().components)
  const panel = await attachPanel(f)
  await f.store((s, components) => s.setState({ components }), project)
  await f.store(s => s.getState().setComponentState(s.getState().components[0].id, { doorOpen: true }))
  await page.waitForFunction((id) => { const r = window.__panelState?.(); let found = false; r?.scene.traverse(o => { if (o.name === `decal-${id}`) found = true }); return found }, coverId, { timeout: 60000 })
  const placement = await page.evaluate((id) => {
    const r = window.__panelState(), T = window.__fixtureThree; r.scene.updateMatrixWorld(true)
    let decal, cover; r.scene.traverse(o => { if (o.name === `decal-${id}`) decal = o; if (o.name === 'enclosure-inner-cover') cover = o })
    // Raio da frente para trás no centro da etiqueta: a chapa da sobretampa tem de estar logo atrás dela.
    const at = new T.Vector3().setFromMatrixPosition(decal.matrixWorld), lift = 0.5
    const ray = new T.Raycaster(at.clone().add(new T.Vector3(0, 0, lift)), new T.Vector3(0, 0, -1))
    const meshes = []; cover.traverse(o => { if (o.isMesh && o.visible) meshes.push(o) })
    const hit = ray.intersectObjects(meshes, false)[0]
    return { gapMm: hit ? (hit.distance - lift) / 0.01 : null, visible: decal.visible }
  }, coverId)
  check(placement.visible && placement.gapMm !== null && placement.gapMm >= 0 && placement.gapMm < 0.5, `Panel3D: etiqueta colada à frente da chapa da sobretampa (folga ${placement.gapMm?.toFixed(2)} mm)`)
  await page.evaluate((id) => { const r = window.__panelState(), T = window.__fixtureThree; let decal; r.scene.traverse(o => { if (o.name === `decal-${id}`) decal = o }); const c = new T.Vector3().setFromMatrixPosition(decal.matrixWorld); r.controls?.dispatchEvent({ type: 'start' }); r.camera.position.set(c.x + .2, c.y + .1, c.z + 2.2); r.camera.lookAt(c); r.controls?.target?.copy(c); r.controls?.update?.(); r.invalidate() }, coverId)
  await panel.frame(); await page.waitForTimeout(400); await panel.frame()
  await page.screenshot({ path: path.join(output, 'inner-cover-sticker-3d.png') })
  await f.store(s => s.getState().setComponentState(s.getState().components[0].id, { innerCoverMode: 'outline' })); await panel.frame()
  const hidden = await page.evaluate((id) => { let found = false; window.__panelState().scene.traverse(o => { if (o.name === `decal-${id}`) found = true }); return !found }, coverId)
  check(hidden, 'Panel3D: sobretampa tracejada não mostra etiquetas a flutuar (ficam guardadas)')
  check((await decals()).some(item => item.id === coverId), 'Mudar o modo da sobretampa conserva a etiqueta no projeto')
  f.stable()
  console.log(`PASS — ${f.count()} verificações de etiquetas personalizadas, logótipos e sobretampa`)
} finally { await f.browser.close() }
