import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Botão de emergência no editor: controlo na lista, clique no cogumelo a afundar
// SÓ a cabeça (com retenção) e segunda ordem a rearmar. Requer Vite em
// EDITOR3D_TEST_URL. A cena expõe a rig em `window.__ceRig` (só em `vite dev`).
const baseURL = process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.EDITOR3D_TEST_OUTPUT
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL ? { channel: process.env.EDITOR3D_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json'
  return local ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  localStorage.removeItem('dcsimu:supabase:config:v1')
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks += 1; console.log('PASS — ' + message) }
const capture = async (name, locator) => { if (output) { await fs.mkdir(output, { recursive: true }); await (locator ?? page).screenshot({ path: path.join(output, name + '.png') }) } }
const scene = () => page.evaluate(() => {
  const rig = window.__ceRig
  if (!rig) return null
  const head = rig.root.getObjectByName('dcsimu_head')
  rig.root.updateMatrixWorld(true)
  return {
    controls: (rig.def.controls ?? []).map((item) => ({ name: item.name, kind: item.kind, nodes: item.nodes, travelMm: item.travelMm, returnMode: item.returnMode })),
    vars: (rig.def.vars ?? []).map((item) => item.id),
    terminalsBehind: (rig.def.terminals ?? []).every((item) => item.position[2] < 0),
    head: !!head,
    z: head ? Math.round(head.matrixWorld.elements[14] * 100) / 100 : null,
    pressed: rig.vars?.pressed,
  }
})

try {
  await page.goto(baseURL + '/dashboard')
  await page.waitForTimeout(1500)
  const entryId = await page.evaluate(async () => {
    const { buildBuiltinDraft } = await import('/src/admin/editor3d/builtinComponents.ts')
    const { catalogApi } = await import('/src/catalog/catalogApi.ts')
    const draft = await buildBuiltinDraft('emergencyButton')
    return (await catalogApi.save('synthetic-emergency-button-review', draft.meta, draft.def)).id
  })
  await page.goto(baseURL + '/admin/editor/' + entryId)
  await page.locator('.ce-root canvas').waitFor({ timeout: 120000 })
  await page.waitForTimeout(2000)

  // 1) O componente abre com o controlo ligado à cabeça e com os bornes atrás.
  const initial = await scene()
  check(!!initial, 'A cena 3D do editor está montada')
  check(initial.controls.some((item) => item.nodes?.includes('dcsimu_head')), 'O controlo «Botão de emergência» está ligado à cabeça (dcsimu_head)')
  check(initial.controls.some((item) => item.returnMode === 'latch'), 'O botão de emergência fica retido (não é um pulsador)')
  check(initial.vars.includes('pressed'), 'A variável «pressed» faz parte do componente')
  check(initial.head, 'A cabeça é uma peça própria na cena')
  check(initial.terminalsBehind, 'Os bornes 21/22 ficam atrás da cabeça, do lado da chapa')
  await capture('emergency-editor')

  // 2) O controlo aparece na lista de botões e seletores do inspector.
  const controlsTab = page.getByRole('tab', { name: 'Controlos' }).or(page.getByRole('button', { name: 'Controlos' })).first()
  if (await controlsTab.count()) { await controlsTab.click(); await page.waitForTimeout(500) }
  check((await page.getByText('Botão de emergência', { exact: false }).count()) >= 1, 'O controlo aparece na lista de botões e seletores')

  // 3) Simular + clique no cogumelo: só a cabeça se afunda e o estado fica retido.
  await page.getByRole('tab', { name: 'Simular', exact: true }).or(page.getByRole('button', { name: 'Simular', exact: true })).first().click()
  await page.waitForTimeout(800)
  const rest = await scene()
  const canvas = page.locator('.ce-root canvas').first()
  const box = await canvas.boundingBox()
  await page.mouse.click(box.x + box.width * 0.41, box.y + box.height * 0.55)
  await page.waitForTimeout(1200)
  const pressed = await scene()
  check(pressed.pressed === true, 'Clicar no cogumelo preme o botão')
  check(pressed.z < rest.z - 1, `A cabeça afunda ao premir (${(rest.z - pressed.z).toFixed(1)} mm)`)
  await capture('emergency-premido', canvas)

  await page.mouse.click(box.x + box.width * 0.41, box.y + box.height * 0.55)
  await page.waitForTimeout(1200)
  const released = await scene()
  check(released.pressed === false, 'Segundo clique rearma o botão')
  check(Math.abs(released.z - rest.z) < 0.5, 'A cabeça volta à posição de repouso')

  // 4) Telemóvel: a mesma cena, sem deslocamento horizontal.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(1200)
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Sem deslocamento horizontal a 390 px')
  await capture('emergency-telemovel')

  check(errors.length === 0, `Sem exceções JavaScript${errors.length ? ': ' + errors[0] : ''}`)
  console.log(`PASS — ${checks} verificações do botão de emergência na interface`)
} finally {
  await browser.close()
}
