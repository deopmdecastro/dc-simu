import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { inspectorFixture } from './lib/inspector-fixture.mjs'

const output = path.resolve('docs/validation/panel-labels')
const f = await inspectorFixture({ output }), { page, check } = f
const selected = () => f.store(s => { const a = s.getState().selectedDecal; return a && s.getState().components.find(c => c.id === a.componentId)?.decals?.find(d => d.id === a.decalId) })
const confirm = async (name, value) => { const field = page.getByRole('spinbutton', { name, exact: true }); await field.fill(String(value)); await field.press('Enter'); await f.frame() }
try {
  const [id] = await f.show('panelEnclosure'); await f.openGroups()
  await page.getByRole('button', { name: 'Adicionar texto', exact: true }).click()
  const text = page.getByRole('textbox', { name: 'Texto da etiqueta', exact: true })
  await text.fill('BOMBA 01\nEM SERVIÇO')
  await confirm('Largura da etiqueta (mm)', 80); await confirm('Altura da etiqueta (mm)', 24)
  await confirm('Tamanho do texto (mm)', 4)
  check((await selected()).text === 'BOMBA 01\nEM SERVIÇO' && (await selected()).widthMm === 80 && (await selected()).fontSizeMm === 4, 'Texto multilinha e dimensões editam apenas a etiqueta selecionada')
  await page.evaluate(async () => {
    localStorage.setItem('dc-simu:classic2d', '1')
    const React = window.__fixtureReact
    const { default: Sidebar } = await import('/src/components/Sidebar.tsx')
    const { default: Schematic } = await import('/src/schematic/SchematicView.tsx')
    window.__fixtureRoot.render(React.createElement('div', { style: { display: 'flex', height: '100dvh' } },
      React.createElement('main', { style: { width: 'calc(100vw - 380px)', height: '100%', minWidth: 0 } }, React.createElement(Schematic)),
      React.createElement(Sidebar, { width: 380, quickAddOnPick: true })))
  })
  await f.store(s => s.setState({ zoom: 0.5, panX: 30, panY: 30, components: s.getState().components.map(c => ({ ...c, schematicX: 40, schematicY: 40 })) }))
  await f.frame(); await f.openGroups()
  const decalId = (await selected()).id
  const label = page.locator(`[data-decal-id="${decalId}"]`).first()
  await label.waitFor()
  await label.click()
  check((await selected()).id === decalId, 'Clique na etiqueta do esquema seleciona o item correto')
  const hostBefore = await f.store(s => ({ x: s.getState().components[0].schematicX, y: s.getState().components[0].schematicY, doorOpen: s.getState().components[0].state.doorOpen }))
  const before = await selected(), history = await f.store(s => s.getState().history.length)
  const box = await label.boundingBox(), point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 30, point.y - 15, { steps: 8 }); await page.mouse.up(); await f.frame()
  const dragged = await selected()
  check(Math.abs(dragged.offsetXmm - before.offsetXmm - 40) < 0.5 && Math.abs(dragged.offsetYmm - before.offsetYmm - 20) < 0.5, 'Arrasto SVG converte zoom e eixoY para milímetros da face')
  check(await f.store((s, h) => s.getState().history.length === h + 1, history), 'Arrasto real cria uma única edição')
  await page.keyboard.press('Control+z'); await f.frame()
  check(await f.store((s, { id, x }) => Math.abs(s.getState().components[0].decals.find(d => d.id === id).offsetXmm - x) < 0.01, { id: decalId, x: before.offsetXmm }), 'Ctrl+Z desfaz o arrasto completo')
  await label.click(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowUp'); await f.frame()
  check((await selected()).offsetXmm === before.offsetXmm + 1 && (await selected()).offsetYmm === before.offsetYmm + 10, 'Setas movem1mm e Shift+setas10mm no plano da etiqueta')
  check(await f.store((s, b) => { const c = s.getState().components[0]; return c.schematicX === b.x && c.schematicY === b.y && c.state.doorOpen === b.doorOpen }, hostBefore), 'Clique, arrasto e teclas preservam posição e porta do quadro')
  await text.focus(); const position = await selected(); await text.press('ArrowLeft')
  check((await selected()).offsetXmm === position.offsetXmm && (await selected()).offsetYmm === position.offsetYmm, 'Setas no campo de texto não movem a etiqueta')
  const upload = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 100; c.height = 50; c.getContext('2d').fillRect(0, 0, 100, 50); return c.toDataURL('image/png').split(',')[1] })
  await page.getByLabel('Ficheiro de imagem', { exact: true }).setInputFiles({ name: 'imagem-sintetica.png', mimeType: 'image/png', buffer: Buffer.from(upload, 'base64') })
  await page.waitForFunction(() => { const s = window.__fixtureModule('/src/store/useSimStore.ts').useSimStore.getState(); return s.components[0].decals?.some(d => d.kind === 'image') })
  const image = await f.store(s => s.getState().components[0].decals.find(d => d.kind === 'image'))
  check(Math.abs(image.widthMm / image.heightMm - 2) < 0.01, 'Carregar imagem preserva a proporção original')
  const library = page.getByRole('button', { name: 'Biblioteca de etiquetas', exact: true })
  await library.click()
  const dialog = page.getByRole('dialog')
  const modalBefore = await dialog.boundingBox()
  await dialog.getByRole('searchbox').fill('220V'); await f.frame()
  check(await dialog.getByRole('button', { name: 'Escolher 220 V', exact: true }).isVisible(), 'Pesquisa encontra tensão sem exigir espaços ou acentos')
  check(Math.abs((await dialog.boundingBox()).y - modalBefore.y) < 8, 'Pesquisar mantém o cabeçalho da biblioteca no mesmo lugar')
  await page.keyboard.press('Escape'); await f.frame()
  check(await library.evaluate(el => document.activeElement === el), 'Escape fecha a biblioteca e devolve foco ao botão de abertura')
  await library.click()
  await dialog.getByRole('searchbox').fill('ALTA TENSÃO')
  check(await dialog.getByRole('button', { name: /ALTA TENSÃO/i }).count() > 0, 'Biblioteca encontra sinal de perigo pela pesquisa')
  const preset = dialog.getByRole('button', { name: /ALTA TENSÃO/i }).first()
  const libraryRaster = await preset.locator('img').getAttribute('src')
  await page.screenshot({ path: path.join(output, 'library-desktop.png') })
  await preset.click(); await dialog.getByRole('button', { name: 'Adicionar etiqueta', exact: true }).click(); await f.frame()
  check((await selected()).text.toUpperCase().includes('TENSÃO'), 'Escolher modelo adiciona e seleciona a etiqueta')
  const actualRaster = await page.locator('.dc-decal-fields .dc-decal-preview.is-large img').getAttribute('src')
  const difference = await page.evaluate(async ([a, b]) => {
    const read = async source => { const image = new Image(); image.src = source; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return { width: canvas.width, height: canvas.height, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data } }
    const [x, y] = await Promise.all([read(a), read(b)])
    if (x.width !== y.width || x.height !== y.height) return Infinity
    let error = 0; for (let i = 0; i < x.pixels.length; i++) error += Math.abs(x.pixels[i] - y.pixels[i])
    return error / x.pixels.length
  }, [libraryRaster, actualRaster])
  check(difference < 1.5, `Prévia da biblioteca corresponde ao modelo inserido (diferença média${difference.toFixed(3)})`)
  const sign = await selected()
  await page.locator('.dc-decal-advanced').evaluate(el => { el.open = true })
  await page.getByLabel('Tipo de etiqueta', { exact: true }).click(); await page.getByRole('option', { name: 'Texto', exact: true }).click(); await f.frame()
  check((await selected()).kind === 'text' && !(await selected()).icon && !(await selected()).stickerId, 'Mudar para Texto remove o desenho do modelo e mantém conteúdo editável')
  await f.store((s, { id, sign }) => s.getState().updateDecal(id, sign.id, sign), { id, sign })
  const saved = await f.store(s => s.getState().saveJSON()); await f.store((s, json) => s.getState().loadJSON(json), saved)
  check(await f.store(s => s.getState().components[0].decals.some(d => d.text.includes('BOMBA')) && s.getState().components[0].decals.some(d => d.kind === 'image')), 'Texto e imagem persistem no mesmo projeto')
  await f.store((s, { id, decalId }) => s.getState().selectDecal(id, decalId), { id, decalId: sign.id }); await f.frame(); await f.openGroups()
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await f.frame()
    if (width === 390) await page.evaluate(async () => { const React = window.__fixtureReact, { default: Sidebar } = await import('/src/components/Sidebar.tsx'); window.__fixtureRoot.render(React.createElement(Sidebar, { width: 'min(380px,100vw)' })) })
    await f.openGroups()
    const overflow = await page.locator('.dc-inspector-scroll').evaluate(el => el.scrollWidth > el.clientWidth + 2)
    check(!overflow, `${width}px: formulário de etiquetas sem transbordo horizontal`)
    await page.locator('[data-decal-controls]').evaluate(el => { const root = el.closest('.dc-inspector-scroll'), hero = root.querySelector('.dc-inspector-hero'); root.scrollTop += el.getBoundingClientRect().top - root.getBoundingClientRect().top - hero.getBoundingClientRect().height - 12 })
    await page.screenshot({ path: path.join(output, `labels-${width}.png`) })
    await page.locator('.dc-decal-fields').evaluate(el => { const root = el.closest('.dc-inspector-scroll'), hero = root.querySelector('.dc-inspector-hero'); root.scrollTop += el.getBoundingClientRect().top - root.getBoundingClientRect().top - hero.getBoundingClientRect().height - 12 })
    await page.screenshot({ path: path.join(output, `label-editor-${width}.png`) })
  }
  await f.show('contactorWegCwbc65'); await f.openGroups()
  await page.getByRole('button', { name: 'Adicionar texto', exact: true }).click()
  check((await selected()).face === 'front' && await page.locator('[data-decal-controls]').count() === 1, 'Aparelho genérico reutiliza o editor sem duplicar secções ou trocar a face')
  f.stable()
  await writeFile(path.join(output, 'ui-results.json'), JSON.stringify({ checks: f.count(), errors: f.errors, scope: 'React/Sidebar/SVG/store reais; texto, upload, biblioteca, seleção, arrasto, teclas, Undo e persistência; pedidos externos bloqueados.' }, null, 2) + '\n')
} catch (error) { await page.screenshot({ path: path.join(output, 'ui-failure.png') }).catch(() => {}); throw error }
finally { await f.browser.close() }
