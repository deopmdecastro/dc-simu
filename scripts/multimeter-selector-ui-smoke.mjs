import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Multímetro DM20 no painel 3D: o seletor e as teclas respondem onde estão no modelo real (browser isolado, sem rede).
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
const state = (fn) => page.evaluate(async (source) => {
  const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
  return Function('store', 'return (' + source + ')(store)')(useSimStore)
}, fn.toString())
const capture = (name) => output ? page.screenshot({ path: path.join(output, name + '.png') }) : null
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Multímetro — seletor')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(2000)
  await state((store) => store.getState().addComponent('multimeterDm20', 400, 260))
  // Seletor e teclas do DM20: as áreas de clique têm de ficar sobre as peças reais do GLB
  // (antes eram posições fixas medidas com o modelo pela base; com o pivô central ficavam 0,92 acima).
  const fiber = async (fn) => page.evaluate(async (source) => {
    const panel = await (await fetch('/src/three/Panel3D.tsx')).text()
    const { _roots } = await globalThis.__dcAppImport('/src/three/Panel3D.tsx').then(() => import(panel.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1]))
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const root = [..._roots.values()].map((r) => r.store.getState()).find((r) => r.scene.getObjectByName('dm20-dial-hit'))
    if (!root) { const roots=[..._roots.values()].map((r)=>{const names=[];r.store.getState().scene.traverse((n)=>{if(/dm20|Plane008/.test(n.name))names.push(n.name)});return names.join(',')}); throw Error('Área do seletor não encontrada na cena: '+JSON.stringify(roots)) }
    root.scene.updateMatrixWorld(true)
    return Function('root', 'THREE', 'return (' + source + ')(root, THREE)')(root, THREE)
  }, fn.toString())
  // Espera o GLB do multímetro (a área do seletor só existe depois de o modelo carregar).
  let ready = false
  for (let tries = 0; tries < 60 && !ready; tries++) {
    ready = await page.evaluate(async () => {
      const panel = await (await fetch('/src/three/Panel3D.tsx')).text()
      const { _roots } = await globalThis.__dcAppImport('/src/three/Panel3D.tsx').then(() => import(panel.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1]))
      return [..._roots.values()].some((r) => !!r.store.getState().scene.getObjectByName('dm20-dial-hit'))
    })
    if (!ready) await page.waitForTimeout(500)
  }
  check(ready, 'o multímetro DM20 carrega no painel 3D com o seletor interativo')
  const offsets = await fiber((root, THREE) => {
    const centre = (name) => new THREE.Box3().setFromObject(root.scene.getObjectByName(name), true).getCenter(new THREE.Vector3())
    const pairs = { 'dm20-dial-hit': 'occurrence_of_Plane008_Material004_0', 'dm20-sel-hit': 'occurrence_of_Plane004_Material003_0', 'dm20-off-hit': 'occurrence_of_Plane002_Material002_0', 'dm20-hold-hit': 'occurrence_of_Plane003_Material007_0' }
    return Object.fromEntries(Object.entries(pairs).map(([hit, part]) => {
      const a = centre(hit), b = centre(part)
      return [hit, Math.hypot(a.x - b.x, a.y - b.y) * 100]
    }))
  })
  check(Object.values(offsets).every((mm) => mm < 3), `as áreas de clique do seletor e das teclas ficam sobre as peças reais (desvio em mm: ${Object.entries(offsets).map(([k, v]) => `${k.replace('dm20-', '').replace('-hit', '')} ${v.toFixed(1)}`).join(', ')})`)

  const dialScreen = () => fiber((root, THREE) => {
    const hit = root.scene.getObjectByName('dm20-dial-hit')
    const p = hit.getWorldPosition(new THREE.Vector3()).project(root.camera)
    const rect = root.gl.domElement.getBoundingClientRect()
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height }
  })
  const dialRotation = () => fiber((root) => root.scene.getObjectByName('occurrence_of_Plane008_Material004_0').rotation.z)
  const dial = () => state((store) => store.getState().components[0].state.catalogVars?.dial ?? null)
  const clickDial = async () => { const at = await dialScreen(); await page.mouse.click(at.x, at.y); await page.waitForTimeout(250) }

  const restAngle = await dialRotation()
  await clickDial()
  check(await dial() === null, 'em STOP o seletor fica bloqueado, como os restantes aparelhos 3D (só seleção/edição)')
  await state((store) => store.getState().play())
  await page.waitForTimeout(300)
  await clickDial()
  check(await dial() === 'ma', 'em RUN, clicar no seletor avança para a posição seguinte (V ⎓ → mA)')
  check(Math.abs(await dialRotation() - restAngle) > 0.5, 'o seletor do modelo 3D roda para a nova posição')
  for (let i = 0; i < 6; i++) await clickDial()
  check(await dial() === 'ma', 'o seletor dá a volta completa pelas seis posições')
  const shift = await dialScreen()
  await page.keyboard.down('Shift'); await page.mouse.click(shift.x, shift.y); await page.keyboard.up('Shift'); await page.waitForTimeout(250)
  check(await dial() === 'dcv', 'Shift+clique roda o seletor no sentido contrário')
  await capture('dm20-selector')
  await state((store) => store.getState().stop())
  check(!errors.length, 'sem erros JavaScript: ' + errors.join(' | '))
  console.log('PASS — seletor do multímetro DM20 funcional')
} finally {
  await browser.close()
}
