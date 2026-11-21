import { panelFixture } from './lib/panel-fixture.mjs'

/** Memória GPU estável ao montar/desmontar aparelhos no Panel3D real.
 *  Cada tipo é montado e retirado três vezes; entre a 2.ª e a 3.ª vez, o número de geometrias e de
 *  texturas do renderer não pode crescer. Cobre as fugas corrigidas: cabeça cortada do botão de
 *  emergência, manípulos separados dos disjuntores, caixa de bornes do motor, corpo/tampa do
 *  barramento em degraus e malhas retiradas pela junção estática. Inclui um tipo que já estava limpo. */
const TYPES = [
  'emergencyButton', 'emergencyButtonKeyP20ACR', 'dualPushButtonNpb22D11', 'motor3ph', 'motor1ph',
  'busbarPhaseStepped', 'breaker2p', 'breaker3p', 'motorBreakerPkzmC10', 'switchSchneiderEz9s2p',
  'switchSchneiderEz9s4p', 'contactorWegCWC09', 'pilotLightAd22', 'plcSiemensLogo1224RC', 'wallSwitchDouble',
]
const f = await panelFixture({ baseURL: process.env.PANEL_DISPOSE_TEST_URL, output: process.env.PANEL_DISPOSE_OUTPUT })
const { page, check, show, store, frame } = f
const memory = () => page.evaluate(() => { const r = window.__panelState(); r.invalidate(); return { ...r.gl.info.memory } })
try {
  for (const type of TYPES) {
    const samples = []
    for (let i = 0; i < 3; i++) {
      await show(type, 1)
      // Deixa correr a junção estática (1,4 s após a montagem) para cobrir também as malhas retiradas.
      await page.waitForTimeout(1800); await frame()
      await store((s) => s.setState({ components: [], wires: [] })); await page.waitForTimeout(250); await frame()
      samples.push(await memory())
    }
    const [, second, third] = samples
    check(third.geometries <= second.geometries && third.textures <= second.textures,
      `${type}: montar/desmontar não deixa geometrias nem texturas na GPU (Δgeo=${third.geometries - second.geometries}, Δtex=${third.textures - second.textures})`)
  }
  f.stable()
  console.log(`PASS — ${f.count()} verificações de libertação de memória do Panel3D`)
} finally { await f.browser.close() }
