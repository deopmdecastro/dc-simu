import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Painel 3D em simulação (RUN): selecionar componentes e cabos continua possível; mover não (browser isolado, sem rede).
const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.GRAFCET_TEST_OUTPUT
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch(process.env.GRAFCET_TEST_EXECUTABLE
  ? { executablePath: process.env.GRAFCET_TEST_EXECUTABLE }
  : process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  performance.setResourceTimingBufferSize(10000)
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
  localStorage.removeItem('dcsimu:supabase:config:v1'); localStorage.setItem('dc-simu:schematic-canvas-mode:v1', '3d')
// O Vite (com HMR) serve módulos alterados com «?t=…»: um import('/src/…') sem esse sufixo criava
// OUTRA instância da store e os dados de teste iam para uma store que a página não usa. Importa o módulo
// exatamente com o URL que a aplicação carregou.
globalThis.__dcAppImport = (path) => {
  const hit = performance.getEntriesByType('resource').map((entry) => entry.name)
    .filter((url) => { try { return new URL(url).pathname === path } catch { return false } }).pop()
  return import(hit || path)
}
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
let checks = 0
const check = (value, message) => { assert.ok(value, message); console.log(`PASS — ${message}`); checks++ }
const store = (fn) => page.evaluate(async (source) => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  return Function('store', 'return (' + source + ')(store)')(useSimStore)
}, fn.toString())
/** Ponto do ecrã de um objeto da cena 3D (procurado por função), ou null. */
const screenOf = (matchSource) => page.evaluate(async (matchSource) => {
  const panel = await (await fetch('/src/three/Panel3D.tsx')).text()
  const { _roots } = await import(panel.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1])
  const THREE = await import('/node_modules/.vite/deps/three.js')
  const match = Function('node', 'return (' + matchSource + ')(node)')
  for (const r of _roots.values()) {
    const root = r.store.getState()
    let found = null
    root.scene.traverse((n) => { if (!found && match(n)) found = n })
    if (!found) continue
    root.scene.updateMatrixWorld(true)
    const rect = root.gl.domElement.getBoundingClientRect()
    // Tubo (cabo): ponto a meio do próprio percurso — o centro da caixa de um cabo curvo pode ficar fora dele.
    const path = found.geometry?.parameters?.path
    let p
    if (path) p = path.getPointAt(0.5).clone().applyMatrix4(found.matrixWorld)
    else { const box = new THREE.Box3().setFromObject(found); p = box.getCenter(new THREE.Vector3()); p.z = box.max.z }
    const n = p.project(root.camera)
    return { x: rect.left + (n.x + 1) / 2 * rect.width, y: rect.top + (1 - n.y) / 2 * rect.height }
  }
  return null
}, matchSource.toString())
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Simulação — seleção')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(1500)
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts')
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  })
  // O projeto nativo é pesado: espera até os cabos 3D estarem na cena (até 60 s).
  let wiresReady = 0
  for (let i = 0; i < 120 && wiresReady < 30; i++) {
    wiresReady = await page.evaluate(async () => {
      const panel = await (await fetch('/src/three/Panel3D.tsx')).text()
      const { _roots } = await import(panel.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1])
      let n = 0; for (const r of _roots.values()) r.store.getState().scene.traverse((o) => { if (o.userData?.wireHit) n++ })
      return n
    })
    if (wiresReady < 30) await page.waitForTimeout(500)
  }
  check(wiresReady >= 30, 'o projeto nativo abre no painel 3D com os cabos (' + wiresReady + ')')
  await store((s) => s.getState().play())
  await page.waitForTimeout(800)
  check(await store((s) => s.getState().sim.runState) === 'running', 'a simulação está em RUN')

  const wireAt = await screenOf((n) => !!n.userData?.wireHit && n.parent?.userData?.wireId === 'native-wire-3')
  if (!wireAt) throw new Error('cabo native-wire-3 não encontrado na cena')
  await page.mouse.click(wireAt.x, wireAt.y)
  await page.waitForTimeout(300)
  // Cabos sobrepostos: fica selecionado o que está à frente nesse ponto.
  check(/^native-wire-/.test(await store((s) => s.getState().selectedWireId) ?? ''), 'em RUN, clicar num cabo seleciona-o (e mostra-o no Inspetor)')

  const motorAt = await screenOf((n) => n.name === 'leads-x' || (n.userData?.wireSurface && n.userData?.componentId === 'native-m1'))
  const motorId = await store((s) => s.getState().components.find((c) => c.type === 'motor3ph')?.id)
  const motorPoint = motorAt ?? await screenOf((n) => n.userData?.wireSurface && n.children?.some((c) => c.type === 'Group'))
  await store((s) => s.getState().selectWire(null))
  // Clicar no motor (componente sem atuação): fica selecionado, não se move.
  const before = await store((s) => { const m = s.getState().components.find((c) => c.type === 'motor3ph'); return [m.schematicX, m.schematicY] })
  const motorScreen = await page.evaluate(async (id) => {
    const panel = await (await fetch('/src/three/Panel3D.tsx')).text()
    const { _roots } = await import(panel.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1])
    const THREE = await import('/node_modules/.vite/deps/three.js')
    for (const r of _roots.values()) {
      const root = r.store.getState()
      const pivots = []
      root.scene.traverse((n) => { if (n.userData?.wireSurface) pivots.push(n) })
      root.scene.updateMatrixWorld(true)
      const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
      const { componentPanelXY } = await globalThis.__dcAppImport('/src/three/panelLayout.ts')
      const motor = useSimStore.getState().components.find((c) => c.id === id)
      const xy = componentPanelXY(motor)
      const node = pivots.sort((a, b) => a.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(xy.x, xy.y, 0.7)) - b.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(xy.x, xy.y, 0.7)))[0]
      if (!node) continue
      const box = new THREE.Box3().setFromObject(node)
      const p = box.getCenter(new THREE.Vector3()); p.y = box.min.y + (box.max.y - box.min.y) * 0.3; p.z = box.max.z
      const n = p.project(root.camera); const rect = root.gl.domElement.getBoundingClientRect()
      return { x: rect.left + (n.x + 1) / 2 * rect.width, y: rect.top + (1 - n.y) / 2 * rect.height }
    }
    return null
  }, motorId)
  await page.mouse.click(motorScreen.x, motorScreen.y)
  await page.waitForTimeout(300)
  check((await store((s) => s.getState().selectedComponentIds)).includes(motorId), 'em RUN, clicar num componente seleciona-o (Inspetor)')
  await page.mouse.move(motorScreen.x, motorScreen.y); await page.mouse.down(); await page.mouse.move(motorScreen.x + 120, motorScreen.y + 40, { steps: 8 }); await page.mouse.up()
  const after = await store((s) => { const m = s.getState().components.find((c) => c.type === 'motor3ph'); return [m.schematicX, m.schematicY] })
  check(after[0] === before[0] && after[1] === before[1], 'em RUN, arrastar não move o componente (só seleção)')
  if (output) await page.screenshot({ path: path.join(output, 'sim-select-3d.png') })
  await store((s) => s.getState().stop())
  check(!errors.length, 'sem erros JavaScript: ' + errors.join(' | '))
  console.log('\nseleção em simulação: OK')
} finally {
  await browser.close()
}
