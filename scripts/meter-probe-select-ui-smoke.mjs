// Multímetro do projeto nativo no 3D: clicar na pinça da ponta de prova (o punho, longe do cabo)
// seleciona o cabo da ponta — antes só o próprio cabo respondia ao clique.
// GRAFCET_TEST_URL=http://127.0.0.1:5207 GRAFCET_TEST_CHANNEL=chrome node scripts/meter-probe-select-ui-smoke.mjs
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  await context.addInitScript(() => {
    performance.setResourceTimingBufferSize(10000)
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.removeItem('dcsimu:supabase:config:v1')
    localStorage.setItem('dc-simu:schematic-canvas-mode:v1', '3d')
    globalThis.__dcAppImport = (path) => {
      const hit = performance.getEntriesByType('resource').map((entry) => entry.name)
        .filter((url) => { try { return new URL(url).pathname === path } catch { return false } }).pop()
      return import(hit || path)
    }
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => { if (!/Failed to fetch/.test(e.message)) errors.push(e.message) })
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Pinça')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(2500)
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts')
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
    useSimStore.getState().selectWire?.(null)
  })
  // Centro do volume de clique da pinça vermelha (ponta no borne U1 do motor), projetado no ecrã.
  const probeOnScreen = () => page.evaluate(async () => {
    const panel = await (await fetch('/src/three/Panel3D.tsx')).text()
    const { _roots } = await import(panel.match(/from "([^"]*\/@react-three_fiber\.js\?v=[^"]+)"/)[1])
    const THREE = await import('/node_modules/.vite/deps/three.js')
    for (const root of _roots.values()) {
      const s = root.store.getState()
      let hit = null
      s.scene.traverse((n) => {
        if (hit || !n.userData?.wireEndHit) return
        let p = n.parent; while (p && !p.userData?.wireId) p = p.parent
        if (p?.userData.wireId === 'native-meter-red' && n.userData.wireEndHit === 'to') hit = n
      })
      if (!hit) continue
      hit.updateWorldMatrix(true, false)
      // Punho da pinça: 3/4 do volume a partir da ponta (longe do cabo e da agulha).
      const local = new THREE.Vector3(0, hit.geometry.parameters.height * 0.2, 0)
      const world = hit.localToWorld(local)
      const ndc = world.clone().project(s.camera)
      const rect = s.gl.domElement.getBoundingClientRect()
      return { x: rect.left + (ndc.x + 1) / 2 * rect.width, y: rect.top + (1 - ndc.y) / 2 * rect.height }
    }
    return null
  })
  let at = null
  for (let i = 0; i < 60 && !at; i++) { at = await probeOnScreen(); if (!at) await page.waitForTimeout(500) }
  check(!!at, 'a pinça vermelha do MM1 tem volume de clique no 3D')
  await page.waitForTimeout(1500)
  at = await probeOnScreen()
  // O que está debaixo do rato nesse ponto é a pinça (não o cabo).
  const under = await page.evaluate(async ({ x, y }) => {
    const panel = await (await fetch('/src/three/Panel3D.tsx')).text()
    const { _roots } = await import(panel.match(/from "([^"]*\/@react-three_fiber\.js\?v=[^"]+)"/)[1])
    const THREE = await import('/node_modules/.vite/deps/three.js')
    for (const root of _roots.values()) {
      const s = root.store.getState()
      const rect = s.gl.domElement.getBoundingClientRect()
      const ray = new THREE.Raycaster()
      ray.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), s.camera)
      const first = ray.intersectObjects(s.scene.children, true).find((h) => h.object.userData?.wireHit)
      if (first) return first.object.userData.wireEndHit ? 'pinça' : 'cabo'
    }
    return 'nada'
  }, at)
  check(under === 'pinça', `o clique cai na pinça e não no cabo (${under})`)
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(600)
  const selected = await page.evaluate(async () => { const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts'); return useSimStore.getState().selectedWireId })
  check(selected === 'native-meter-red', `clicar na pinça seleciona o cabo da ponta vermelha (${selected})`)
  check(errors.length === 0, `sem erros JavaScript (${errors.join(' | ') || 'nenhum'})`)
} finally {
  await browser.close()
}
console.log(`\n${checks} verificações da seleção da pinça do multímetro passaram`)
