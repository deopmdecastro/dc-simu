import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Opções dos cabos e ponteiras no painel lateral esquerdo — nos dois editores:
//   · Esquema/3D do simulador (inspetor, ao escolher a ferramenta Cabo)
//   · Editor de componentes (painel de elementos)
// Garante também que já não há cartão de cabos sobre o canvas.
// Requer o Vite em WIRE_TEST_URL (predefinição http://127.0.0.1:5173).
const baseURL = process.env.WIRE_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.WIRE_TEST_OUTPUT
const browser = await chromium.launch(process.env.WIRE_TEST_CHANNEL ? { channel: process.env.WIRE_TEST_CHANNEL } : {})
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
const capture = async (name, locator) => {
  if (!output) return
  await fs.mkdir(output, { recursive: true })
  await (locator ?? page).screenshot({ path: path.join(output, name + '.png') })
}
const simState = () => page.evaluate(async () => {
  const { useSimStore } = await import('/src/store/useSimStore.ts')
  const state = useSimStore.getState()
  return { tool: state.tool, wireDefaults: state.wireDefaults }
})

try {
  // ---------------------------------------------------------------- simulador
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: /(?:Novo|Criar) projeto/i }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Criar novo projeto' })
  await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Cabos — painel lateral')
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.locator('.dc-workspace').waitFor({ timeout: 60000 })

  await page.evaluate(async () => {
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    useSimStore.getState().setMode('schematic')
    useSimStore.getState().setTool('wire')
  })
  await page.waitForTimeout(700)

  const section = page.locator('.dc-wire-new')
  await section.waitFor({ timeout: 20000 })
  check(await section.isVisible(), 'Escolher a ferramenta Cabo abre as opções no painel lateral esquerdo')
  check((await page.locator('.dc-wire-new .wo-fields').count()) === 1, 'O painel lateral mostra o bloco de opções dos cabos')

  const ends = page.locator('.dc-wire-new .wo-end')
  const conductors = page.locator('.dc-wire-new .wo-choice')
  check((await ends.count()) === 8, 'Todas as ponteiras/terminais têm uma opção própria')
  check((await conductors.count()) === 2, 'Condutor rígido e flexível aparecem como duas opções')
  const endIcons = await page.locator('.dc-wire-new .wo-end svg').count()
  const conductorIcons = await page.locator('.dc-wire-new .wo-choice svg').count()
  check(endIcons === 8, 'Cada terminal tem o ícone da ponteira desenhado')
  check(conductorIcons === 2, 'Cada condutor tem o ícone do cabo (flexível/rígido) desenhado')
  check((await page.locator('.dc-wire-new .wo-swatch').count()) === 13, 'A paleta de 13 cores está no painel lateral')
  check((await page.locator('.dc-wire-new .wo-gauge').count()) === 9, 'As secções (0,5 a 16 mm²) estão no painel lateral')

  // O painel fica no painel lateral: à esquerda do esquema, sem sobrepor o canvas.
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.dc-wire-new')
    const sidebar = document.querySelector('.pn-panel')
    const stage = document.querySelector('.dc-workspace')
    if (!panel || !sidebar) return null
    const p = panel.getBoundingClientRect(), s = sidebar.getBoundingClientRect()
    return { panelLeft: p.left, panelRight: p.right, sidebarLeft: s.left, sidebarRight: s.right, inside: sidebar.contains(panel), stageWidth: stage ? stage.getBoundingClientRect().width : null }
  })
  check(!!layout && layout.inside, 'As opções dos cabos vivem dentro do painel lateral (não num cartão sobre o canvas)')
  check(!!layout && layout.panelLeft >= layout.sidebarLeft - 1 && layout.panelRight <= layout.sidebarRight + 1, 'O bloco não extravasa o painel lateral')
  check((await page.locator('.panel3d-wire-context, .panel3d-wire-bar, .panel3d-wire-bar .panel3d-wire-inspector').count()) === 0, 'O cartão de cabos sobre o canvas 3D foi removido')
  await capture('cabos-painel-simulador')

  // Escolhas feitas no painel lateral aplicam-se aos cabos novos.
  await page.locator('.dc-wire-new .wo-end', { hasText: 'Olhal' }).first().click()
  await page.locator('.dc-wire-new .wo-choice', { hasText: 'Rígido' }).first().click()
  await page.locator('.dc-wire-new .wo-swatch[aria-label="Azul"]').click()
  await page.locator('.dc-wire-new .wo-gauge', { hasText: '2.5' }).first().click()
  await page.waitForTimeout(300)
  const applied = await simState()
  check(applied.tool === 'wire', 'A ferramenta Cabo continua ativa durante a configuração')
  check(applied.wireDefaults.endType === 'ring', 'A ponteira escolhida no painel lateral aplica-se aos cabos novos')
  check(applied.wireDefaults.flexibility === 'rigid', 'O condutor rígido escolhido no painel lateral fica ativo')
  check(applied.wireDefaults.color === 'blue' && applied.wireDefaults.autoColor === false, 'A cor escolhida no painel lateral fica ativa (AUTO desligado)')
  check(applied.wireDefaults.gauge === '2.5mm²', 'A secção escolhida no painel lateral fica ativa')

  // Voltar a Selecionar fecha o bloco de cabos novos.
  await page.evaluate(async () => {
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    useSimStore.getState().setTool('select')
  })
  await page.waitForTimeout(500)
  check((await page.locator('.dc-wire-new').count()) === 0, 'Sair da ferramenta Cabo remove as opções do painel lateral')

  // -------------------------------------------------------- editor de componentes
  const entryId = await page.evaluate(async () => {
    const { buildBuiltinDraft } = await import('/src/admin/editor3d/builtinComponents.ts')
    const { catalogApi } = await import('/src/catalog/catalogApi.ts')
    const draft = await buildBuiltinDraft('motorBreakerPkzmC10')
    return (await catalogApi.save('synthetic-wire-panel-review', draft.meta, draft.def)).id
  })
  await page.goto(baseURL + '/admin/editor/' + entryId)
  await page.locator('.ce-root canvas').waitFor({ timeout: 120000 })
  await page.evaluate(async () => {
    const { useEditorStore } = await import('/src/admin/editor3d/editorStore.ts')
    useEditorStore.getState().set({ ribbon: 'wire' })
  })
  await page.waitForTimeout(900)

  const cePanel = page.locator('.ce-left .ce-left-wires .ce-wirepanel')
  await cePanel.waitFor({ timeout: 20000 })
  check(await cePanel.isVisible(), 'No editor de componentes as opções dos cabos estão no painel esquerdo')
  check((await page.locator('.ce-left-wires .wo-fields').count()) === 1, 'O mesmo bloco de opções (partilhado) é usado nos dois editores')
  check((await page.locator('.ce-left-wires .wo-end').count()) === 8, 'O editor mostra os ícones de todas as ponteiras')
  check((await page.locator('.ce-left-wires .wo-choice').count()) === 2, 'O editor mostra os ícones do condutor rígido e flexível')

  const position = await page.evaluate(() => {
    const panel = document.querySelector('.ce-left .ce-left-wires .ce-wirepanel')
    const left = document.querySelector('.ce-left')
    const canvas = document.querySelector('.ce-canvas')
    if (!panel || !left || !canvas) return null
    const p = panel.getBoundingClientRect(), l = left.getBoundingClientRect(), c = canvas.getBoundingClientRect()
    return {
      computed: getComputedStyle(panel).position,
      inside: left.contains(panel),
      overlapsCanvas: p.right > c.left && p.left < c.right && p.top < c.bottom && p.bottom > c.top,
    }
  })
  check(!!position && position.inside, 'O painel dos cabos está dentro do painel esquerdo do editor')
  check(!!position && position.computed !== 'absolute', 'O painel dos cabos deixou de ser um cartão flutuante (position não absoluta)')
  check(!!position && !position.overlapsCanvas, 'Nenhum cartão de cabos se sobrepõe ao canvas 3D')

  await page.locator('.ce-left-wires .wo-end', { hasText: 'Forquilha' }).first().click()
  await page.waitForTimeout(400)
  const editorEnd = await page.evaluate(async () => {
    const { useEditorStore } = await import('/src/admin/editor3d/editorStore.ts')
    return useEditorStore.getState().wireDefaults.endType
  })
  check(editorEnd === 'fork', 'A ponteira escolhida no editor fica guardada nos cabos novos')
  await capture('cabos-painel-editor')

  // Telemóvel: o bloco continua utilizável e sem overflow horizontal.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(600)
  await capture('cabos-painel-editor-telemovel')
  const narrow = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }))
  check(narrow.overflow <= 1, 'Sem overflow horizontal a 390 px')

  check(errors.length === 0, `Sem exceções de JavaScript (${errors.join(' · ') || 'nenhuma'})`)
  console.log(`\n${checks} verificações passaram.`)
} finally {
  await browser.close()
}
