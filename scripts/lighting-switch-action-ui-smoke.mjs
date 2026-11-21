import { panelFixture } from './lib/panel-fixture.mjs'

/** Ação dos interruptores Odace no Panel3D real (interruptor duplo S520214 em destaque):
 *  - só as teclas acionam; moldura, caixa e bornes não mudam o estado;
 *  - a tecla atua ao premir (pointerdown), afunda enquanto premida e volta ao largar;
 *  - arrastar a câmara a partir de uma tecla não roda a vista e não aciona duas vezes;
 *  - em STOP a tecla seleciona o aparelho em vez de o manobrar. */
const baseURL = process.env.LIGHTING_TEST_URL
const f = await panelFixture({ baseURL, output: process.env.LIGHTING_TEST_OUTPUT })
const { page, check, store, show, point, frame } = f
const state = () => store((s) => ({ ...s.getState().components[0].state }))
const run = () => store((s) => s.setState({ sim: { ...s.getState().sim, runState: 'running' } }))
const pivotZ = (name) => page.evaluate((name) => { const r = window.__panelState(); let z = null; r.scene.traverse((o) => { if (o.name === name) z = o.position.z }); return z }, name)
const settle = async () => { for (let i = 0; i < 12; i++) await frame() }

try {
  await show('wallSwitchDouble'); await run(); await frame()

  // Moldura e bornes: sem efeito.
  for (const name of ['lighting_switch_brand', 'lighting_terminal_screw_L']) {
    const p = await point(name); await page.mouse.click(p.x, p.y); await frame()
    const s = await state()
    check(!s.on1 && !s.on2, `wallSwitchDouble: tocar em «${name}» não aciona nenhuma tecla`)
  }

  // Premir a tecla 1: aciona logo ao premir e afunda; ao largar regressa.
  // Cursor: mão só sobre as teclas (a moldura por trás não o desfaz).
  const cursorNow = () => page.evaluate(() => window.__panelState().gl.domElement.style.cursor)
  const brand = await point('lighting_switch_brand')
  await page.mouse.move(brand.x, brand.y, { steps: 4 }); await frame()
  const cursorFrame = await cursorNow()
  const rest = await pivotZ('lighting_rocker_1_pivot')
  const p1 = await point('lighting_rocker_1_decal')
  await page.mouse.move(p1.x, p1.y, { steps: 6 }); await frame()
  const cursorKey = await cursorNow()
  check(cursorKey === 'pointer' && cursorFrame !== 'pointer', `wallSwitchDouble: cursor de mão só sobre a tecla (tecla=${cursorKey || '—'}, moldura=${cursorFrame || '—'})`)
  await page.mouse.down(); await settle()
  const held = await pivotZ('lighting_rocker_1_pivot'), heldState = await state()
  check(heldState.on1 === true && !heldState.on2, 'wallSwitchDouble: a tecla 1 atua ao premir, sem esperar pelo largar')
  check(held < rest - 1e-5, `wallSwitchDouble: a tecla 1 afunda enquanto premida (Δz=${(rest - held).toExponential(2)})`)
  // Arrastar com o botão premido: não roda a câmara nem volta a acionar.
  const cam = await page.evaluate(() => window.__panelState().camera.position.toArray())
  await page.mouse.move(p1.x + 120, p1.y + 40, { steps: 8 }); await page.mouse.up(); await settle()
  const camAfter = await page.evaluate(() => window.__panelState().camera.position.toArray())
  const afterDrag = await state()
  check(camAfter.every((v, i) => Math.abs(v - cam[i]) < 1e-6), 'wallSwitchDouble: arrastar a partir da tecla não roda a câmara')
  check(afterDrag.on1 === true && !afterDrag.on2, 'wallSwitchDouble: largar depois de arrastar não aciona outra vez')
  check(Math.abs((await pivotZ('lighting_rocker_1_pivot')) - rest) < 1e-6, 'wallSwitchDouble: a tecla volta à posição ao largar')

  // Tecla 2 independente; segundo toque desliga só a tecla 1.
  const p2 = await point('lighting_rocker_2_decal'); await page.mouse.click(p2.x, p2.y); await settle()
  let s = await state()
  check(s.on1 === true && s.on2 === true, 'wallSwitchDouble: tecla 2 aciona independentemente da tecla 1')
  const p1b = await point('lighting_rocker_1_decal'); await page.mouse.click(p1b.x, p1b.y); await settle()
  s = await state()
  check(s.on1 === false && s.on2 === true, 'wallSwitchDouble: novo toque na tecla 1 desliga só a tecla 1')

  // Em STOP: seleciona, não manobra.
  await store((st) => st.getState().stop()); await store((st) => st.setState({ selectedComponentIds: [] })); await frame()
  const p2b = await point('lighting_rocker_2_decal'); await page.mouse.click(p2b.x, p2b.y); await settle()
  const stopped = await state(), selected = await store((st) => st.getState().selectedComponentIds.length)
  check(stopped.on2 === true && selected === 1, 'wallSwitchDouble: em STOP o toque seleciona o aparelho sem o manobrar')

  // Simples e escada: a mesma regra de tecla única.
  for (const [type, label] of [['wallSwitchSimple', 'liga'], ['wallSwitchStaircase', 'comuta para 2']]) {
    await show(type); await run(); await frame()
    const frameHit = await point('lighting_switch_brand'); await page.mouse.click(frameHit.x, frameHit.y); await frame()
    check((await state()).on !== true, `${type}: tocar na moldura não aciona`)
    const key = await point('lighting_rocker_decal'); await page.mouse.click(key.x, key.y); await settle()
    check((await state()).on === true, `${type}: tocar na tecla ${label}`)
  }
  f.stable()
  console.log(`PASS — ${f.count()} verificações da ação dos interruptores`)
} finally { await f.browser.close() }
