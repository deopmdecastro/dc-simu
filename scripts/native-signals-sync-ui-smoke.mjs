// Projeto nativo «Partida direta»: quadro 3D, LOGO!, Ladder e GRAFCET sincronizados com o relé
// térmico F1 (97-98 → I0.3) e os sinalizadores H1 (marcha), H2 (parado) e H3 (emergência/falha).
//  · o Ladder nativo é reconhecido pelo GRAFCET como sincronizado e a atualização automática não o troca;
//  · em RUN, o programa do LOGO! fecha os relés e acende os sinalizadores do 3D;
//  · START → KM1 + H1; F1 disparado → I0.3, volta a X0, H3 aceso; emergência → H3.
// GRAFCET_TEST_URL=http://127.0.0.1:5207 GRAFCET_TEST_CHANNEL=chrome node scripts/native-signals-sync-ui-smoke.mjs
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  await context.addInitScript(() => {
    performance.setResourceTimingBufferSize(10000)
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.removeItem('dcsimu:supabase:config:v1')
    globalThis.__dcAppImport = (path) => {
      const hit = performance.getEntriesByType('resource').map((entry) => entry.name)
        .filter((url) => { try { return new URL(url).pathname === path } catch { return false } }).pop()
      return import(hit || path)
    }
  })
  const page = await context.newPage()
  const errors = []
  // As chamadas à API são bloqueadas pelo teste (sem rede): «Failed to fetch» não conta como erro da app.
  page.on('pageerror', (e) => { if (!/Failed to fetch/.test(e.message)) errors.push(e.message) })
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Sinais nativos')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(3000)
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts')
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  })
  // Abrir o GRAFCET (monta a atualização automática) e esperar além do seu atraso (800 ms).
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: 'GRAFCET', exact: true }).click()
  await page.waitForTimeout(2500)
  const ladder = await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { ladderSyncStatus, generatedLadderMethod } = await globalThis.__dcAppImport('/src/grafcet/ladderSync.ts')
    const s = useSimStore.getState()
    const files = s.projectFiles['native-plc'] ?? []
    return {
      status: ladderSyncStatus(s.grafcet), method: generatedLadderMethod(),
      main: s.ladder.rungs.map((r) => r.name),
      startup: files.filter((f) => f.exec === 'obStartup').map((f) => f.name),
      fcs: files.filter((f) => !f.exec).map((f) => f.name),
      tags: s.tags.filter((t) => ['I0.3', 'Q0.3'].includes(t.address)).map((t) => `${t.address}=${t.name}`).sort().join(','),
    }
  })
  check(ladder.status === 'synced' && ladder.method === 'word', `Ladder nativo reconhecido pelo GRAFCET como sincronizado (método registo de etapa) — ${ladder.status}/${ladder.method}`)
  check(JSON.stringify(ladder.main) === JSON.stringify(['GRAFCET · Chamar Grafcet', 'GRAFCET · Chamar Outputs']), `Main [OB1] continua a chamar FC Grafcet e FC Outputs (${ladder.main.join(' | ')})`)
  check(ladder.startup.length === 1 && ladder.fcs.join('|') === 'Grafcet [FC 1]|Outputs [FC 2]', `um só OB100 e os FC gerados (${[...ladder.startup, ...ladder.fcs].join(', ')})`)
  check(ladder.tags === 'I0.3=F1,Q0.3=H3', 'variáveis I0.3 F1 e Q0.3 H3 na tabela do Ladder')

  const snap = () => page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const s = useSimStore.getState()
    const st = (id) => s.components.find((c) => c.id === id)?.state ?? {}
    const t = s.runtime.table
    return {
      step: s.grafcetRuntime?.active?.join(',') ?? '',
      I03: !!t['I0.3'], Q: ['Q0.0', 'Q0.1', 'Q0.2', 'Q0.3'].map((q) => (t[q] ? 1 : 0)).join(''),
      relays: ['Q0.0', 'Q0.1', 'Q0.2', 'Q0.3'].map((q) => (st('native-plc').outputs?.[q] ? 1 : 0)).join(''),
      h1: !!st('native-h1').on, h2: !!st('native-h2').on, h3: !!st('native-h3').on, km1: !!st('native-km1').energized,
      // Bornes onde o MM1 mede (U1–V1 do motor), no 3D e no IEC.
      mm1: s.runtime.energizedTerminals.has('native-m1-U1') && s.runtime.energizedTerminals.has('native-m1-V1'),
    }
  })
  const act = (fn, ...args) => page.evaluate(async ([fn, args]) => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    useSimStore.getState()[fn](...args)
  }, [fn, args])
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: '3D Realista', exact: true }).click()
  await act('play')
  await page.waitForTimeout(1500)
  let s = await snap()
  check(s.step === 'native-s0' && s.Q === '0010' && s.relays === '0010' && s.h2 && !s.h1 && !s.h3, `RUN em repouso: X0, relé Q0.2 fechado e só o H2 PARADO (laranja) aceso — ${JSON.stringify(s)}`)
  await act('setComponentState', 'native-push', { startPressed: true })
  await page.waitForTimeout(800)
  await act('setComponentState', 'native-push', { startPressed: false })
  await page.waitForTimeout(1200)
  s = await snap()
  check(s.step === 'native-s1' && s.Q === '1100' && s.relays === '1100' && s.km1 && s.h1 && !s.h2 && !s.h3 && s.mm1, `START: X1, KM1 energizado, H1 MARCHA (verde) aceso e U1–V1 do motor sob tensão (MM1) — ${JSON.stringify(s)}`)
  await act('setComponentState', 'native-f1', { tripped: true })
  await page.waitForTimeout(1500)
  s = await snap()
  check(s.I03 && s.step === 'native-s0' && !s.km1 && s.h3 && !s.h2 && !s.h1 && !s.mm1, `F1 disparado: 97-98 dá I0.3, volta a X0, KM1 cai (MM1 sem tensão) e acende o H3 (vermelho) — ${JSON.stringify(s)}`)
  await act('setComponentState', 'native-push', { startPressed: true })
  await page.waitForTimeout(800)
  await act('setComponentState', 'native-push', { startPressed: false })
  await page.waitForTimeout(1000)
  s = await snap()
  check(s.step === 'native-s0' && !s.km1, `com o F1 disparado o START não arranca o motor — ${JSON.stringify(s)}`)
  await act('setComponentState', 'native-f1', { tripped: false })
  await page.waitForTimeout(1200)
  s = await snap()
  check(!s.I03 && s.h2 && !s.h3, `RESET do F1: I0.3 a 0, volta o H2 PARADO — ${JSON.stringify(s)}`)
  await act('setComponentState', 'native-emerg', { pressed: true })
  await page.waitForTimeout(1200)
  s = await snap()
  check(s.h3 && !s.h2, `emergência premida: H3 (vermelho) aceso, H2 apagado — ${JSON.stringify(s)}`)
  // Projeto nativo guardado antes da correção (nomes antigos dos blocos): ao abrir fica sincronizado e funciona.
  await act('stop')
  await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { nativePartidaDiretaContent } = await globalThis.__dcAppImport('/src/project/nativeProjects.ts')
    const c = nativePartidaDiretaContent()
    const old = { 'native-fc-grafcet': 'FC1 [Grafcet]', 'native-fc-outputs': 'FC2 [Outputs]', 'native-ob100': 'OB100 [Complete restart]' }
    c.projectFiles['native-plc'] = c.projectFiles['native-plc'].map((file) => ({ ...file, name: old[file.id] }))
    c.nativeFeatures = c.nativeFeatures.filter((x) => x !== 'ladder-sync-v1')
    useSimStore.getState().loadJSON(JSON.stringify(c))
  })
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: 'GRAFCET', exact: true }).click()
  await page.waitForTimeout(2500)
  const migrated = await page.evaluate(async () => {
    const { useSimStore } = await globalThis.__dcAppImport('/src/store/useSimStore.ts')
    const { ladderSyncStatus } = await globalThis.__dcAppImport('/src/grafcet/ladderSync.ts')
    const st = useSimStore.getState()
    return { status: ladderSyncStatus(st.grafcet), startup: (st.projectFiles['native-plc'] ?? []).filter((x) => x.exec === 'obStartup').length, main: st.ladder.rungs.map((r) => r.name).join('|') }
  })
  check(migrated.status === 'synced' && migrated.startup === 1 && migrated.main === 'GRAFCET · Chamar Grafcet|GRAFCET · Chamar Outputs', `projeto antigo (nomes antigos dos blocos): ao abrir fica sincronizado, um só OB100 — ${JSON.stringify(migrated)}`)
  await page.getByRole('tablist', { name: 'Vistas' }).getByRole('tab', { name: '3D Realista', exact: true }).click()
  await act('play')
  await page.waitForTimeout(1500)
  s = await snap()
  check(s.h2 && s.relays === '0010', `projeto antigo em RUN: o LOGO! fecha Q0.2 e acende o H2 — ${JSON.stringify(s)}`)
  check(errors.length === 0, `sem erros JavaScript (${errors.join(' | ') || 'nenhum'})`)
} finally {
  await browser.close()
}
console.log(`\n${checks} verificações da sincronização 3D / LOGO! / Ladder / GRAFCET passaram`)
