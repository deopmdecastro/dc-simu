import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Requer Vite sem serviços externos, por exemplo: npm run dev -- --mode performance.
const baseURL = process.env.WIRE_ROUTING_TEST_URL || 'http://127.0.0.1:5174'
const output = new URL('../runtime/wire-routing-ui/', import.meta.url)
await mkdir(output, { recursive: true })
await writeFile(new URL('index.html', output), `<!doctype html><html lang="pt"><meta charset="utf-8"><title>Teste de encaminhamento</title><div id="root"></div><script type="module">
import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Vector3 } from 'three'
import { useWireRouting } from '/src/three/useWireRouting.ts'
import { createWireRoutingJob, calculateWireRouting } from '/src/three/wireRoutingJob.ts'
import { buildAllWirePaths3D, componentObstacles } from '/src/three/wireGeometry3D.ts'
import { buildNativePartidaDireta } from '/src/project/nativeProjects.ts'
import { createComponent } from '/src/electrical/factory.ts'
import { componentPanelXY } from '/src/three/panelLayout.ts'
import { componentHalfExtents, isPanelBound, PLATE_Z, PLATE_THICKNESS } from '/src/three/panelBounds.ts'
import { isMountingRail, PANEL_UNITS_PER_MM, registerCatalogModel } from '/src/three/modelPaths.ts'
import { DIN_RAIL_15X55 } from '/src/three/dinRailGeometry.ts'
const NativeWorker = window.Worker
window.audit = { workers: 0, terminated: 0, beats: 0, fail: false }
window.Worker = class extends NativeWorker {
  constructor(...args) { if (window.audit.fail) throw new Error('Falha sintética'); super(...args); window.audit.workers++ }
  terminate() { window.audit.terminated++; super.terminate() }
}
setInterval(() => window.audit.beats++, 20)
const native = buildNativePartidaDireta()
// Modelo dinâmico e orientação pessoal: não existem no contexto inicial do worker.
const custom = createComponent('breaker1p', 1700, 100)
custom.type = 'cat:routing-test:1'
registerCatalogModel(custom.type, '', { width: 33, height: 66, depth: 44 }, 'machine')
localStorage.setItem('dc-simu:component-view-defaults:v1', JSON.stringify({ [custom.type]: { x: 13, y: 21, z: 8 } }))
delete custom.viewOrientation
native.components.push(custom)
const pivotZ = PLATE_Z + PLATE_THICKNESS / 2 + DIN_RAIL_15X55.height / 2 * PANEL_UNITS_PER_MM
const pivots = Object.fromEntries(native.components.map(c => {
  const { x, y } = componentPanelXY(c)
  return [c.id, new Vector3(x, y, isMountingRail(c.type) ? pivotZ : !isPanelBound(c) ? (c.type === 'motor3ph' ? .7 : .4) : pivotZ + DIN_RAIL_15X55.height / 2 * PANEL_UNITS_PER_MM + componentHalfExtents(c).z)]
}))
native.wires.push({ ...native.wires[0], id: 'catalog-test', toTerminalId: custom.terminals[0].id })
const expected = JSON.stringify([...buildAllWirePaths3D(native.wires, native.components, pivots, componentObstacles(native.components, pivots))])
const full = createWireRoutingJob(native.wires, native.components, pivots)
window.auditFullJob = full
window.auditExpected = expected
const clone = structuredClone(full)
window.audit.serializedEqual = JSON.stringify(calculateWireRouting(clone)) === expected
const empty = { ...full, wires: [] }
const small = { ...full, wires: full.wires.slice(0, 1) }
window.audit.inputReady = true
function Harness() {
  const [input, setInput] = useState({ key: 'native', job: full })
  const [, rerender] = useState(0)
  const result = useWireRouting(input.key, () => input.job)
  useEffect(() => {
    window.audit.status = result.error ? 'error' : result.paths ? 'ready' : 'pending'
    window.audit.paths = result.paths?.size
    window.audit.equal = result.paths ? JSON.stringify([...result.paths]) === expected : false
    window.audit.key = input.key
  }, [input.key, result.paths, result.error])
  window.renderSame = () => rerender(n => n + 1)
  window.renderNative = key => setInput({ key, job: full })
  window.renderEmpty = () => setInput({ key: 'empty', job: empty })
  window.renderSmall = key => setInput({ key, job: small })
  return React.createElement('div', null, React.createElement('p', { role: result.error ? 'alert' : 'status' }, result.error ? 'Erro' : result.paths ? 'Concluído' : 'A calcular'), React.createElement('button', { onClick: result.retry }, 'Repetir'))
}
createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(Harness)))
</script></html>`)

const browser = await chromium.launch(process.env.PLATFORM_CHROME ? { executablePath: process.env.PLATFORM_CHROME } : {})
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++; console.log('PASS — ' + message) }
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(baseURL + '/runtime/wire-routing-ui/index.html')
  await page.waitForFunction(() => window.audit?.inputReady && window.audit?.status === 'pending', null, { timeout: 120000 })
  const beats = await page.evaluate(() => window.audit.beats)
  await page.waitForTimeout(300)
  check(await page.evaluate(start => window.audit.beats - start >= 5, beats), 'interface responde enquanto o worker calcula os cabos')
  await page.waitForFunction(() => window.audit.status === 'ready', null, { timeout: 120000 })
  check(await page.evaluate(() => window.audit.equal && window.audit.serializedEqual), 'resultado do worker igual ao algoritmo original, incluindo catálogo e orientação pessoal')
  const workers = await page.evaluate(() => window.audit.workers)
  await page.evaluate(() => window.renderSame())
  await page.waitForTimeout(150)
  check(await page.evaluate(count => window.audit.workers === count, workers), 'atualizar a vista sem mudar geometria não recalcula os cabos')
  await page.evaluate(() => window.renderNative('obsolete'))
  await page.waitForFunction(() => window.audit.key === 'obsolete' && window.audit.status === 'pending')
  const terminated = await page.evaluate(() => window.audit.terminated)
  await page.evaluate(() => window.renderEmpty())
  await page.waitForFunction(() => window.audit.key === 'empty' && window.audit.status === 'ready')
  await page.waitForTimeout(400)
  check(await page.evaluate(count => window.audit.paths === 0 && window.audit.terminated > count, terminated), 'mudança de projeto termina o cálculo anterior e descarta resultados obsoletos')
  await page.evaluate(() => { window.audit.fail = true; window.renderSmall('fail') })
  await page.getByRole('alert').waitFor()
  check(await page.evaluate(() => window.audit.status === 'error'), 'falha ao criar worker é explícita, sem cálculo síncrono na interface')
  await page.evaluate(() => { window.audit.fail = false })
  await page.getByRole('button', { name: 'Repetir' }).click()
  await page.waitForFunction(() => window.audit.status === 'ready' && window.audit.paths === 1)
  check(true, 'repetição recupera da falha')
  if (process.env.WIRE_ROUTING_TEST_BUILD === '1') {
    const assets = new URL('../dist/assets/', import.meta.url)
    const filename = (await readdir(assets)).find(name => /^wireRouting\.worker-.*\.js$/.test(name))
    assert.ok(filename, 'worker emitido pelo build de produção')
    const body = await readFile(new URL(filename, assets), 'utf8')
    await context.route('**/runtime/wire-routing-ui/built-worker.js', route => route.fulfill({ contentType: 'application/javascript', body }))
    const equal = await page.evaluate(() => new Promise((resolve, reject) => {
      const worker = new Worker('/runtime/wire-routing-ui/built-worker.js', { type: 'module' })
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Timeout do worker de produção')) }, 60000)
      worker.onmessage = event => { clearTimeout(timer); worker.terminate(); resolve(JSON.stringify(event.data.paths) === window.auditExpected) }
      worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Falha do worker de produção')) }
      worker.postMessage(window.auditFullJob)
    }))
    check(equal, 'worker emitido pelo build calcula os mesmos trajetos, sem dependências do DOM')
  }
  check(errors.length === 0, 'sem erros JavaScript inesperados')
  await writeFile(new URL('report.json', output), JSON.stringify({ checks, errors }, null, 2))
  console.log(checks + ' verificações passaram')
} finally { await browser.close() }
