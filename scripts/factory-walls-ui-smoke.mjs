import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

/** Ambiente fabril: o seletor «Paredes» mostra, corta automaticamente (lado da câmara) ou oculta as
 *  paredes, sem esconder o pavimento nem os equipamentos do projeto, e a escolha fica guardada. */
const output = process.env.FACTORY_WALLS_OUTPUT || path.resolve('runtime/factory-walls')
const f = await panelFixture({ baseURL: process.env.FACTORY_WALLS_TEST_URL, output }), { page, check, frame } = f
const settle = async () => { for (let i = 0; i < 4; i++) await frame() }
const walls = () => page.evaluate(() => {
  const r = window.__panelState(), out = {}
  r.scene.traverse((n) => { if (n.name.startsWith('factory-wall-')) out[n.name.slice(13)] = n.visible })
  let floor = false, tank = false
  r.scene.traverse((n) => { if (n.name === 'dc-simu-factory-environment') floor = n.visible; if (n.name.startsWith('water-tank-3d-')) tank = n.visible })
  return { ...out, floor, tank }
})
const camera = (x, y, z) => page.evaluate(([x, y, z]) => {
  const r = window.__panelState(); r.controls?.dispatchEvent({ type: 'start' })
  r.camera.position.set(x, y, z); r.camera.lookAt(0, 0, 4); r.controls?.target?.set(0, 0, 4); r.controls?.update?.(); r.invalidate()
}, [x, y, z])
try {
  await page.evaluate(async () => {
    localStorage.setItem('dc-simu:panel3d:environment', 'factory'); localStorage.removeItem('dc-simu:factory-walls')
    window.__fixtureRoot.render(null); await new Promise((r) => setTimeout(r, 200)); window.__mountPanel()
  })
  await page.waitForTimeout(600)
  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts'), { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    useSimStore.setState({ components: [createComponent('waterTank', 'R1', '', 0, 700, 100)], wires: [], factoryHall: null })
  })
  await page.waitForFunction(() => { let ok = false; window.__panelState()?.scene.traverse((n) => { if (n.name === 'factory-wall-back') ok = true }); return ok }, null, { timeout: 60000 })
  await settle()

  // 1) Por omissão: todas as paredes visíveis.
  let w = await walls()
  check(w.back && w.left && w.right, 'Por omissão («Mostrar») as três paredes estão visíveis')
  check(await page.locator('[data-factory-walls-mode="show"]').getAttribute('aria-checked') === 'true', 'O seletor «Paredes» indica «Mostrar»')

  // 2) Ocultar: paredes escondidas, pavimento e equipamentos continuam.
  await page.click('[data-factory-walls-mode="hide"]'); await settle()
  w = await walls()
  check(!w.back && !w.left && !w.right, '«Ocultar» esconde parede de fundo, lateral esquerda e murete direito')
  check(w.floor && w.tank, '«Ocultar» mantém o pavimento e o equipamento do projeto visíveis')
  await page.screenshot({ path: path.join(output, 'walls-hidden.png') })

  // 3) Auto: vista de frente/esquerda esconde a lateral esquerda; a de fundo fica.
  await page.click('[data-factory-walls-mode="auto"]'); await settle()
  await camera(-60, 25, 40); await settle()
  w = await walls()
  check(w.back && !w.left && w.right, `«Auto» com câmara à esquerda: esconde só a parede esquerda (fundo=${w.back}, esq=${w.left}, dir=${w.right})`)
  await page.screenshot({ path: path.join(output, 'walls-auto-left.png') })
  await camera(0, 25, 40); await settle()
  w = await walls()
  check(w.back && w.left && w.right, '«Auto» com câmara de frente, dentro da largura: todas as paredes visíveis')
  await camera(0, 25, -40); await settle()
  w = await walls()
  check(!w.back, '«Auto» com câmara atrás da nave: esconde a parede de fundo')

  // 4) A escolha fica guardada no navegador e não suja o projeto.
  const stored = await page.evaluate(() => localStorage.getItem('dc-simu:factory-walls'))
  check(stored === 'auto', `Preferência guardada no navegador (${stored})`)
  const dirty = await page.evaluate(async () => (await window.__fixtureImport('/src/store/useSimStore.ts')).useSimStore.getState().dirty)
  check(!dirty, 'Mudar a visibilidade das paredes não marca o projeto como alterado')

  await page.click('[data-factory-walls-mode="show"]'); await settle()
  w = await walls()
  check(w.back && w.left && w.right, '«Mostrar» repõe as três paredes')
  f.stable()
  console.log(`${f.count()} verificações das paredes da nave fabril passaram`)
} catch (error) {
  console.error(f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png') })
  throw error
} finally { await f.browser.close() }
