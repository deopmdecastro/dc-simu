import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { panelFixture } from './lib/panel-fixture.mjs'

const output = process.env.LIGHTING_TEST_OUTPUT || path.resolve('runtime/lighting-panel')
const baseURL = process.env.LIGHTING_TEST_URL || 'http://127.0.0.1:5207'
const f = await panelFixture({ baseURL, output })
const { page, check, store, show, click, frame } = f

async function frameLightingGroup(yawDeg = 14, pitchDeg = 12, zoomFactor = 1.65) {
  await page.evaluate(({ yawDeg, pitchDeg, zoomFactor }) => {
    const r = window.__panelState()
    const THREE = r.camera.position.constructor
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    let found = 0
    r.scene.updateMatrixWorld(true)
    r.scene.traverse((o) => {
      if (o.isMesh && (o.name.startsWith('lighting_') || o.name.startsWith('lamp_'))) {
        o.geometry?.computeBoundingBox()
        if (!o.geometry?.boundingBox) return
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)
        minX = Math.min(minX, b.min.x); minY = Math.min(minY, b.min.y); minZ = Math.min(minZ, b.min.z)
        maxX = Math.max(maxX, b.max.x); maxY = Math.max(maxY, b.max.y); maxZ = Math.max(maxZ, b.max.z)
        found++
      }
    })
    if (!found) return
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const cz = (minZ + maxZ) / 2
    const span = Math.max(maxX - minX, maxY - minY, 1.0)
    const dist = span * zoomFactor
    const yaw = (yawDeg * Math.PI) / 180
    const pitch = (pitchDeg * Math.PI) / 180
    r.controls.target.set(cx, cy, cz)
    r.camera.position.set(
      cx + Math.sin(yaw) * Math.cos(pitch) * dist,
      cy + Math.sin(pitch) * dist,
      cz + Math.cos(yaw) * Math.cos(pitch) * dist,
    )
    r.controls.update()
  }, { yawDeg, pitchDeg, zoomFactor })
  await frame()
}

try {
  // 1. Verificar os 6 componentes individualmente no Panel3D real (GLB + serigrafia)
  const types = [
    'lampIncandescentE27',
    'lampFluorescentE27',
    'lampLedE27',
    'wallSwitchSimple',
    'wallSwitchDouble',
    'wallSwitchStaircase',
  ]
  for (const type of types) {
    await show(type)
    const info = await page.evaluate(() => {
      const r = window.__panelState()
      let meshes = 0
      let textured = 0
      const names = []
      r.scene.traverse((o) => {
        if (o.isMesh) {
          meshes++
          if (o.material?.map?.image) textured++
        }
        if (/^lighting_|^lamp_/.test(o.name)) names.push(o.name)
      })
      return { meshes, textured, names }
    })
    check(info.meshes > 5, `${type}: modelo CAD GLB montado no Panel3D (${info.meshes} malhas)`)
    check(info.textured > 0, `${type}: serigrafia canvas aplicada (${info.textured} texturas)`)
    check(info.names.length > 0, `${type}: nós CAD nomeados presentes (${info.names.slice(0, 4).join(', ')})`)
  }

  // 2. Testar clique 3D real no Interruptor Simples, Duplo e Comutador de Escada
  await show('wallSwitchSimple')
  await store((s) => s.setState({ sim: { ...s.getState().sim, runState: 'running' } }))
  await frame()
  await click('lighting_rocker')
  await frame()
  const simpleOn = await store((s) => s.getState().components[0].state.on)
  check(simpleOn === true, 'wallSwitchSimple: clique 3D na tecla liga o interruptor (on=true)')

  await show('wallSwitchDouble')
  await store((s) => s.setState({ sim: { ...s.getState().sim, runState: 'running' } }))
  await frame()
  await click('lighting_rocker_1_decal')
  await frame()
  const double1 = await store((s) => s.getState().components[0].state)
  check(double1.on1 === true && !double1.on2, 'wallSwitchDouble: clique 3D na tecla 1 aciona só Tecla 1')
  await click('lighting_rocker_2_decal')
  await frame()
  const double2 = await store((s) => s.getState().components[0].state)
  check(double2.on1 === true && double2.on2 === true, 'wallSwitchDouble: clique 3D na tecla 2 aciona Tecla 2 independentemente')

  await show('wallSwitchStaircase')
  await store((s) => s.setState({ sim: { ...s.getState().sim, runState: 'running' } }))
  await frame()
  await click('lighting_rocker')
  await frame()
  const stairOn = await store((s) => s.getState().components[0].state.on)
  check(stairOn === true, 'wallSwitchStaircase: clique 3D comuta L–1 para L–2')

  // 3. Montar painel completo comparativo (3 lâmpadas E27 + 3 interruptores Odace + fonte 230 V~)
  await page.evaluate(async () => {
    const { createComponent } = await window.__fixtureImport('/src/electrical/factory.ts')
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const src = createComponent('powerSource1ph', 'G1', undefined, 0, 80, 260)
    const inc = createComponent('lampIncandescentE27', 'E1', undefined, 0, 240, 80)
    const cfl = createComponent('lampFluorescentE27', 'E2', undefined, 0, 400, 80)
    const led = createComponent('lampLedE27', 'E3', undefined, 0, 560, 80)
    const swDouble = createComponent('wallSwitchDouble', 'S1', undefined, 0, 260, 310)
    const swStair1 = createComponent('wallSwitchStaircase', 'S2', undefined, 0, 430, 310)
    const swStair2 = createComponent('wallSwitchStaircase', 'S3', undefined, 0, 600, 310)
    const term = (c, lbl) => c.terminals.find((t) => t.label === lbl).id
    const w = (id, a, al, b, bl, color) => ({
      id,
      fromTerminalId: term(a, al),
      toTerminalId: term(b, bl),
      color,
      gauge: '1.5mm2',
    })
    const wires = [
      w('w1', src, 'L', swDouble, 'L', '#92400e'),
      w('w2', src, 'L', swStair1, 'L', '#92400e'),
      w('w3', swDouble, '1', inc, 'L', '#dc2626'),
      w('w4', swDouble, '2', cfl, 'L', '#ea580c'),
      w('w5', swStair1, '1', swStair2, '1', '#7c3aed'),
      w('w6', swStair1, '2', swStair2, '2', '#a855f7'),
      w('w7', swStair2, 'L', led, 'L', '#dc2626'),
      w('w8', src, 'N', inc, 'N', '#2563eb'),
      w('w9', src, 'N', cfl, 'N', '#2563eb'),
      w('w10', src, 'N', led, 'N', '#2563eb'),
    ]
    const cur = useSimStore.getState()
    useSimStore.setState({
      components: [src, inc, cfl, led, swDouble, swStair1, swStair2],
      wires,
      selectedComponentIds: [],
      sim: { ...cur.sim, runState: 'stopped' },
    })
  })
  await frame()
  await frameLightingGroup(14, 10, 1.35)
  await page.screenshot({ path: path.join(output, 'lighting-panel-off.png') })

  // Ligar simulação e acender todas as 3 lâmpadas (Incandescente 60W + CFL 12W + LED 8W)
  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const s = useSimStore.getState()
    useSimStore.setState({ sim: { ...s.sim, runState: 'running' } })
    const sw1 = useSimStore.getState().components.find((c) => c.ref === 'S1')
    useSimStore.getState().operateComponent(sw1.id, { on1: true, on2: true })
    useSimStore.getState().step()
  })
  await page.waitForTimeout(900)
  // Pausa mantendo todas as lâmpadas acesas para captura estável em SwiftShader
  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const s = useSimStore.getState()
    useSimStore.setState({ sim: { ...s.sim, runState: 'paused' } })
  })
  await frame()
  const litStates = await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    return useSimStore.getState().components
      .filter((c) => c.type.startsWith('lamp'))
      .map((c) => ({ ref: c.ref, type: c.type, on: !!c.state.on }))
  })
  check(litStates.length === 3 && litStates.every((l) => l.on), 'Todas as 3 lâmpadas (Incandescente, CFL, LED) acesas em 230 V~ no painel 3D')
  await page.screenshot({ path: path.join(output, 'lighting-panel-on.png'), animations: 'disabled' })

  // Testar comutação de escada S2 -> apaga LED, S3 -> acende LED
  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const s2 = useSimStore.getState().components.find((c) => c.ref === 'S2')
    useSimStore.getState().operateComponent(s2.id, { on: true })
    useSimStore.getState().step()
  })
  await frame()
  const ledOffByS2 = await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    return useSimStore.getState().components.find((c) => c.ref === 'E3')?.state.on === false
  })
  check(ledOffByS2, 'Comutador S2 em posição 2 apaga lâmpada LED E3')

  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const s3 = useSimStore.getState().components.find((c) => c.ref === 'S3')
    useSimStore.getState().operateComponent(s3.id, { on: true })
    useSimStore.getState().step()
  })
  await frame()
  const ledOnByS3 = await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    return useSimStore.getState().components.find((c) => c.ref === 'E3')?.state.on === true
  })
  check(ledOnByS3, 'Comutador S3 em posição 2 volta a acender lâmpada LED E3')

  // 4. Montar a Sidebar real (Biblioteca + Inspetor + Ficha Técnica PDF) em STOP e validar «Iluminação» + LightingControls
  await page.evaluate(async () => {
    const { default: Sidebar } = await window.__fixtureImport('/src/components/Sidebar.tsx')
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    useSimStore.getState().stop()
    useSimStore.getState().selectComponents([])
    window.__fixtureRoot.render(
      window.__fixtureReact.createElement(
        'div',
        { style: { display: 'flex', height: '100vh', width: '420px', background: '#ffffff' } },
        window.__fixtureReact.createElement(Sidebar, { width: 360 }),
      ),
    )
  })
  await page.waitForSelector('text=Iluminação', { timeout: 10000 })
  check(await page.getByText('Iluminação', { exact: true }).first().isVisible(), 'Biblioteca: categoria «Iluminação» visível')
  check(await page.getByText('Lâmpada LED E27', { exact: false }).first().isVisible(), 'Biblioteca: «Lâmpada LED E27» visível')
  check(await page.getByText('Comutador de Escada', { exact: false }).first().isVisible(), 'Biblioteca: «Comutador de Escada» visível')
  await page.screenshot({ path: path.join(output, 'lighting-library-sidebar.png'), animations: 'disabled' })

  // Selecionar a lâmpada LED E3 e validar Inspetor (Potência, CCT, lm, Poupança e Ficha PDF)
  await page.evaluate(async () => {
    const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
    const led = useSimStore.getState().components.find((c) => c.ref === 'E3')
    useSimStore.getState().selectComponents([led.id])
  })
  await page.waitForSelector('[data-device-controls="lighting-lamp"]', { timeout: 10000 })
  check(await page.locator('[data-device-controls="lighting-lamp"]').isVisible(), 'Inspetor: LightingControls visível para Lâmpada LED E27')
  check(await page.getByRole('button', { name: '10 W', exact: true }).isVisible(), 'Inspetor LED: botão 10 W presente')
  check(await page.getByText('até 95 %', { exact: false }).first().isVisible(), 'Inspetor LED: indicador «até 95 %» presente')
  await page.getByRole('button', { name: '10 W', exact: true }).click()
  await page.waitForTimeout(200)
  check(await page.getByText('1055 lm', { exact: false }).first().isVisible(), 'Inspetor LED: fluxo luminoso atualiza para 1055 lm com 10 W')
  await page.screenshot({ path: path.join(output, 'lighting-inspector-led.png'), animations: 'disabled' })

  f.stable()
  await writeFile(
    path.join(output, 'results.json'),
    JSON.stringify({ assertions: f.count(), errors: f.errors, litStates }, null, 2),
  )
  console.log(`\nPASS — ${f.count()} verificações UI/3D de Iluminação concluídas sem erros.`)
} catch (e) {
  console.error(f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  throw e
} finally {
  await f.browser.close()
}
