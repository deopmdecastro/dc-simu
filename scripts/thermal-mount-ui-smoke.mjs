import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Relé térmico encaixado por baixo do contactor no projeto nativo: soltar, voltar a encaixar com o íman, acompanhar o contactor e conduzir em RUN (browser isolado, sem rede).
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
try {
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Relé térmico encaixado')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(1500)
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts')
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  })
  const f1 = () => store((s) => { const c = s.getState().components.find((x) => x.id === 'native-f1'); return { x: c.schematicX, y: c.schematicY, mountedOn: c.mountedOn ?? null } })
  const start = await f1()
  check(start.mountedOn === 'native-km1', 'o projeto nativo abre com o F1 encaixado no KM1')

  // Afastar e largar: solta-se do contactor.
  await store((s) => { s.getState().moveComponent('native-f1', s.getState().components.find((c) => c.id === 'native-f1').schematicX + 260, 980); s.getState().snapToRails(['native-f1']) })
  check((await f1()).mountedOn === null, 'arrastado para longe, o relé solta-se do contactor')
  // Largar perto do fundo do KM1: o íman encaixa-o na posição dos bornes.
  await page.evaluate(async ([x, y]) => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    useSimStore.setState((s) => ({ components: s.components.map((c) => (c.id === 'native-f1' ? { ...c, schematicX: x + 12, schematicY: y + 18 } : c)) }))
    useSimStore.getState().snapToRails(['native-f1'])
  }, [start.x, start.y])
  const back = await f1()
  check(back.mountedOn === 'native-km1' && back.x === start.x && back.y === start.y, 'largado perto do fundo do KM1, encaixa outra vez nos bornes')

  // Mover o contactor leva o relé.
  const km = await store((s) => { const c = s.getState().components.find((x) => x.id === 'native-km1'); return { x: c.schematicX, y: c.schematicY } })
  await page.evaluate(async ([x, y]) => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    useSimStore.getState().moveComponent('native-km1', x, y - 30)
  }, [km.x, km.y])
  const moved = await f1()
  const kmMoved = await store((s) => s.getState().components.find((x) => x.id === 'native-km1').schematicY)
  check(moved.mountedOn === 'native-km1' && moved.y - back.y === kmMoved - km.y && moved.x - back.x === 0, 'mover o KM1 leva o F1 encaixado')
  await page.evaluate(async ([x, y]) => { const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts'); useSimStore.getState().moveComponent('native-km1', x, y) }, [km.x, km.y])

  // RUN + START: a potência passa pelo encaixe (sem cabos KM1 → F1) e chega ao motor.
  await store((s) => { s.getState().play(); s.getState().setComponentState('native-push', { startPressed: true }) })
  let energized = false
  for (let i = 0; i < 60 && !energized; i++) {
    energized = await store((s) => { const e = s.getState().runtime.energizedTerminals; return ['U1', 'V1', 'W1'].every((t) => e.has(`native-m1-${t}`)) })
    if (!energized) await page.waitForTimeout(250)
  }
  check(energized, 'em RUN com START, U1/V1/W1 do motor têm tensão através do F1 encaixado')
  await store((s) => s.getState().setComponentState('native-push', { startPressed: false }))
  if (output) {
    await page.getByText('A carregar o editor').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {})
    await page.waitForTimeout(2000)
    await page.evaluate(async () => {
      const panel = await (await fetch('/src/three/Panel3D.tsx')).text()
      const { _roots } = await import(panel.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1])
      const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
      const { componentPanelXY } = await globalThis.__dcAppImport('/src/three/panelLayout.ts')
      const xy = componentPanelXY(useSimStore.getState().components.find((c) => c.id === 'native-km1'))
      for (const r of _roots.values()) { const s = r.store.getState(); if (!s.controls) continue; s.controls.target.set(xy.x, xy.y - 0.3, 0.4); s.camera.position.set(xy.x + 0.4, xy.y + 0.2, 3.0); s.camera.zoom = 1; s.camera.updateProjectionMatrix(); s.controls.update(); s.invalidate() }
    })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(output, 'thermal-mount.png') })
  }
  await store((s) => s.getState().stop())
  // O teste corta a rede /api/: a gravação automática do projeto alterado falha com «Failed to fetch» (esperado).
  const jsErrors = errors.filter((message) => !/Failed to fetch/.test(message))
  check(!jsErrors.length, 'sem erros JavaScript: ' + jsErrors.join(' | '))
  console.log(`\n${checks} verificações do relé térmico encaixado passaram`)
} finally {
  await browser.close()
}
