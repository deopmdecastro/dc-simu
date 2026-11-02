import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Gestos reais no GLB do projeto nativo. A câmara só enquadra o aparelho; não dispara ações.
const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.GRAFCET_TEST_OUTPUT
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/version.json') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  await context.addInitScript(() => {
    performance.setResourceTimingBufferSize(10000)
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.removeItem('dcsimu:supabase:config:v1')
    localStorage.setItem('dc-simu:schematic-canvas-mode:v1', '3d')
    globalThis.__dcAppImport = (p) => {
      const hit = performance.getEntriesByType('resource').map(e => e.name).filter(u => { try { return new URL(u).pathname === p } catch { return false } }).pop()
      return import(hit || p)
    }
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => { if (!/Failed to fetch/.test(e.message)) errors.push(e.message) })
  const act = (fn, ...args) => page.evaluate(async ([fn, args]) => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    useSimStore.getState()[fn](...args)
  }, [fn, args])
  const snap = () => page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const s = useSimStore.getState(), st = id => s.components.find(c => c.id === id)?.state ?? {}
    return { test: !!st('native-f1').testPressed, trip: !!st('native-f1').tripped, stop: !!st('native-f1').stopPressed,
      motor: !!st('native-m1').running, green: !!st('native-h1').on, red: !!st('native-h3').on,
      i03: !!s.runtime.table['I0.3'], step: s.grafcetRuntime.active.join(','), run: s.sim.runState }
  })
  const initRoot = () => page.evaluate(async () => {
    const source = await (await fetch('/src/three/Panel3D.tsx')).text()
    const match = source.match(/from ["']([^"']*\/\@react-three_fiber\.js\?[^"']+)["']/)
    const { _roots } = await import(match[1])
    for (const r of _roots.values()) {
      const root = r.store.getState()
      let reset = null
      root.scene.traverse(n => { if (n.name === 'imported_reset') reset = n })
      if (!reset) continue
      globalThis.__thermalRoot = root
      globalThis.__thermalReset = reset
      return true
    }
    return false
  })
  const locateControls = () => page.evaluate(async () => {
    const root = globalThis.__thermalRoot, reset = globalThis.__thermalReset
    const { importedControlAt, importedPointMm } = await globalThis.__dcAppImport('/src/three/importedFinish.ts')
    const { PANEL_UNITS_PER_MM, getComponentModelSpec } = await globalThis.__dcAppImport('/src/three/modelPaths.ts')
    const size = getComponentModelSpec('thermalRelaySiemens3ru1116').physicalSizeMm
    let group = reset
    while (group && !group.__r3f?.handlers?.onPointerDown) group = group.parent
    root.scene.updateMatrixWorld(true); root.camera.updateMatrixWorld(true)
    const rect = root.gl.domElement.getBoundingClientRect()
    const p = reset.getWorldPosition(new root.camera.position.constructor()).project(root.camera)
    const cx = rect.left + (p.x + 1) * rect.width / 2, cy = rect.top + (1 - p.y) * rect.height / 2
    const points = {}
    for (let dy = -170; dy <= 170 && Object.keys(points).length < 3; dy += 6) {
      for (let dx = -150; dx <= 150 && Object.keys(points).length < 3; dx += 6) {
        const x = cx + dx, y = cy + dy
        root.raycaster.setFromCamera({ x: (x - rect.left) / rect.width * 2 - 1, y: -(y - rect.top) / rect.height * 2 + 1 }, root.camera)
        const hit = root.raycaster.intersectObjects(group.children, true)[0]
        if (!hit) continue
        const mm = importedPointMm(group.worldToLocal(hit.point.clone()), size, PANEL_UNITS_PER_MM, 'bottom')
        const control = importedControlAt('thermalRelaySiemens3ru1116', mm)
        if (control && !points[control]) points[control] = { x, y }
      }
    }
    if (Object.keys(points).length !== 3) throw new Error('Alvos físicos em falta: ' + Object.keys(points))
    return points
  })
  let physicalPoints = null
  const photo = async name => {
    if (!output) return
    const data = await page.evaluate(() => { const r = globalThis.__thermalRoot; r.gl.render(r.scene, r.camera); return r.gl.domElement.toDataURL('image/png') })
    await writeFile(path.join(output, name + '.png'), Buffer.from(data.split(',')[1], 'base64'))
  }
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Validação TEST e RESET')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts')
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  })
  await page.waitForTimeout(5000)
  await page.waitForTimeout(8000)
  let mounted = false
  for (let i = 0; i < 30 && !(mounted = await initRoot()); i++) await page.waitForTimeout(2000)
  if (!mounted) console.log('Diagnóstico 3D:', errors, await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(n => /Panel3D|fiber|three|3ru|version/.test(n)).slice(-25)))
  check(mounted, 'GLB real montado com o pivô RESET azul')
  await page.evaluate(() => {
    const root = globalThis.__thermalRoot, reset = globalThis.__thermalReset
    const p = reset.getWorldPosition(new root.camera.position.constructor())
    root.controls.target.copy(p)
    root.camera.position.set(p.x, p.y, p.z + 1.3)
    root.camera.zoom = 1
    root.camera.updateProjectionMatrix(); root.controls.update(); root.invalidate()
  })
  await page.waitForTimeout(700)
  await act('play')
  await act('setComponentState', 'native-push', { startPressed: true })
  await page.waitForTimeout(700)
  await act('setComponentState', 'native-push', { startPressed: false })
  await page.waitForTimeout(500)
  let s = await snap()
  check(s.motor && s.green && !s.red, 'Preparação: motor em marcha e H1 verde aceso')
  await photo('01-marcha')
  physicalPoints = await locateControls()
  let at = physicalPoints.test
  await page.mouse.move(at.x, at.y); await page.mouse.down()
  await page.waitForTimeout(650)
  s = await snap()
  check(s.test && s.trip && !s.motor && !s.green && s.red && s.i03 && s.step === 'native-s0', `TEST físico premido: motor parado, verde OFF, vermelho ON, I0.3 e X0 — ${JSON.stringify(s)}`)
  await photo('02-test-premido')
  await page.mouse.up(); await page.waitForTimeout(600)
  s = await snap()
  check(!s.test && s.trip && !s.motor && !s.green && s.red, 'TEST físico libertado: dispara fica retido, sem rearranque')
  await photo('03-disparo-retido')
  // Gesto curto não rearma.
  at = physicalPoints.reset
  await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + 7, at.y); await page.mouse.up()
  await page.waitForTimeout(250)
  check((await snap()).trip, 'RESET: arrasto curto não rearma')
  for (const [direction, dx] of [['esquerda', -38], ['direita', 38]]) {
    // Injetar falha pelo comando partilhado para testar o gesto seguinte sem clicar no corpo.
    await act('actuateImported', 'native-f1', true, 'test'); await act('actuateImported', 'native-f1', false, 'test')
    await page.waitForTimeout(250)
    at = physicalPoints.reset
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + dx, at.y)
    await page.waitForTimeout(200)
    check((await snap()).trip, `RESET ${direction}: ainda premido, não rearma antes de concluir o gesto`)
    await page.mouse.up(); await page.waitForTimeout(600)
    s = await snap()
    check(!s.trip && !s.motor && !s.red, `RESET ${direction}: rearma ao concluir, sem ligar o motor`)
  }
  // Cancelamento e perda de foco libertam TEST, mas preservam a falha.
  at = physicalPoints.test; await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.waitForTimeout(200)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.mouse.up(); await page.waitForTimeout(250)
  s = await snap(); check(!s.test && s.trip, 'Perda de foco liberta TEST e mantém o disparo')
  await act('actuateImported', 'native-f1', true, 'reset')
  await act('setComponentState', 'native-push', { startPressed: true }); await page.waitForTimeout(650)
  await act('setComponentState', 'native-push', { startPressed: false }); await page.waitForTimeout(300)
  s = await snap(); check(s.motor && s.green && !s.red, 'Nova ordem START depois de RESET restaura a marcha')
  check(errors.length === 0, `Sem erros JavaScript (${errors.join(' | ') || 'nenhum'})`)
  console.log(`\n${checks} verificações físicas TEST/RESET passaram`)
} finally { await browser.close() }
