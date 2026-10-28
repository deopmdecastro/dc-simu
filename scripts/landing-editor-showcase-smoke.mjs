/**
 * Smoke estrutural da «demonstração = editor real» na landing.
 *
 * Sem browser: verifica o contrato de montagem — a landing carrega o editor
 * real (App) em modo demo, com o projeto publicado/nativo, só controlos de
 * simulação disponíveis e restauração segura da loja.
 *
 * Atualizado: 2026-10-28
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const read = (p) => readFileSync(resolve(root, p), 'utf8')

let failures = 0
const assert = (note, cond) => {
  if (cond) console.log(`PASS — ${note}`)
  else { failures++; console.error(`FAIL — ${note}`) }
}

// ── ShowCase da landing ──────────────────────────────────────────────────────
const showcasePath = 'src/landing/LandingEditorShowcase.tsx'
assert('LandingEditorShowcase existe', existsSync(resolve(root, showcasePath)))
const show = existsSync(resolve(root, showcasePath)) ? read(showcasePath) : ''
assert('Carrega o projeto publicado (fallback nativo)', show.includes("'/landing/published'") && show.includes('nativeLandingPayload'))
assert('Hidrata a loja com o conteúdo da obra', show.includes('loadJSON(JSON.stringify(payload.content))'))
assert('Ativa o modo demo na loja', show.includes('setDemoMode(true)'))
assert('Monta o editor real em modo demo', /<App demo\b/.test(show))
assert('Restaura o instantâneo ao desmontar', show.includes('saveJSON()') && show.includes('current.loadJSON(snapshot)') && show.includes('setDemoMode(wasDemo)'))

// ── Loja ─────────────────────────────────────────────────────────────────────
const store = read('src/store/useSimStore.ts')
assert('Loja tem demoMode + setDemoMode', store.includes('demoMode: boolean') && store.includes('setDemoMode: (on)'))
assert('Bloqueia ferramentas de edição em demo (setTool)', /if \(get\(\)\.demoMode && t !== 'select' && t !== 'pan'\) return/.test(store))
assert('Espelha a bandeira para módulos leves', store.includes("from './demoMode'"))

const bus = read('src/grafcet/grafcetBus.ts')
assert('GRAFCET demo: «Ligar» inibido', bus.includes("isDemoMode() && tool === 'connect'"))

// ── Toolbar ─────────────────────────────────────────────────────────────────
const tb = read('src/components/Toolbar.tsx')
assert('Toolbar aceita prop demo', tb.includes('demo?: boolean'))
assert('Pill «Demonstração» + CTA «Abrir no editor»', tb.includes('Demonstração') && tb.includes('onEnterEditor'))
assert('Ações de ficheiro fora da demo', /\{!demo && \(narrowBar/.test(tb))
assert('Histórico undo/redo fora da demo', /\{!demo && <HistoryGroup/.test(tb))
assert('Nova network/bloco só no editor', tb.includes("{mode === 'ladder' && !demo && ("))
assert('GRAFCET sem «connect»/edição na demo', tb.includes("GRAFCET_TOOLS.filter((t) => t.id !== 'connect')") && tb.includes('{!demo && <button type="button" className="grafcet-toolbar-more'))
assert('Esquema: grupo de ferramentas de edição completamente fora da demo', tb.includes("{isCanvas && !demo && (") && tb.includes("role=\"toolbar\" aria-label=\"Ferramentas de edição\""))
assert('Caixa-preta fora da demo', /\{!demo && <button\n\s+onClick=\{\(\) => useSimStore\.getState\(\)\.toggleBlackBox\(\)\}/.test(tb))

// ── App ─────────────────────────────────────────────────────────────────────
const app = read('src/App.tsx')
assert('App aceita demo + onEnterEditor', app.includes('demo?: boolean') && app.includes('onEnterEditor?: () => void'))
assert('Demonstração sem vista Monitor', app.includes("viewsAll.filter((v) => v !== 'monitor')"))
assert('Planos (PlanLocked) não trancam a demonstração', app.includes('!demo && <PlanLocked') && app.includes('(canLadder || demo)'))

// ── Landing ─────────────────────────────────────────────────────────────────
const landing = read('src/landing/Landing.tsx')
assert('Secção editor monta o showcase real', landing.includes('<LandingEditorShowcase onAccess={onAccess} />'))
assert('Anatomia antiga (mock) removida', !landing.includes('EditorAnatomy'))
assert('CSS de enquadre da demonstração', read('src/styles/dx-landing.css').includes('.landing-editor-embed'))


// ── Redução «só simular» (2026-10-28) ────────────────────────────────────────
assert('Run/Pausa/Stop ficam; Passo e Reset fora da demo', tb.includes("{!demo && <button onClick={step}") && tb.includes("{!demo && <button onClick={reset}"))
assert('Botão Clean fora da demo', tb.includes("{!demo && <button type=\"button\" className={`dc-tool-btn dc-clean-toggle"))
assert('Atalhos fora da demo (esquema e grafcet)', tb.includes("{mode !== 'grafcet' && !demo && (") && tb.includes("{!demo && <ShortcutsButton scope=\"grafcet\""))

const store2 = read('src/store/useSimStore.ts')
assert('Arrastar componentes bloqueado na demo (moveComponent)', store2.includes('Demonstração da landing: arrastar componentes edita a obra — bloqueado') && store2.includes('moveComponent: (id, x, y, movingIds) => {'))
assert('setGrafcet: edição estrutural bloqueada; navegação de páginas permitida', store2.includes("demoMode && !historyKey.startsWith('grafcet:pages')"))

const ladder2 = read('src/ladder/LadderEditor.tsx')
assert('Ladder: paleta Elementos/elementos de rede fora da demo', ladder2.includes("!demoMode && (showPalette ?"))
assert('Ladder: demoMode é lido da loja', ladder2.includes("useSimStore((s) => s.demoMode)"))

const grafed = read('src/grafcet/GrafcetEditor.tsx')
assert('GRAFCET: CTA «Abrir editor» escondido na demo', grafed.includes('{!demoMode && (') && grafed.includes('onClick={onOpenEditor}'))
assert('GRAFCET: diálogos de edição (etapa/ação/transição) travados na demo', grafed.includes('disabled: demoMode || !target') && grafed.includes('if (!demoMode) setEditingStep'))

const app2 = read('src/App.tsx')
assert('App: biblioteca lateral e rail fora da demo', app2.includes("(showLibrary || showLadder) && (") && app2.includes('showLibrary && !demo'))
assert('App: canvas sem biblioteca lateral na demo', app2.includes('libraryCollapsed={demo || !showLibrary}'))

const css = read('src/styles/dx-landing.css')
assert('CSS de respiro da demo: barras mais altas e ar entre grupos', css.includes('.dc-demo-root .dc-toolbar-main') && css.includes('.dc-demo-root .dc-toolbar-row2'))

assert('Ladder: undo/redo e mutações por teclado travados na demo', ladder2.includes("!demoMode && mod && !event.altKey && lower === 'z'") && ladder2.includes('if (demoMode) return'))

if (failures) {
  console.error(`\n❌ ${failures} falha(s) no contrato editor-real na landing`)
  process.exit(1)
}
console.log('\n✅ TODOS OS TESTES PASSARAM')
