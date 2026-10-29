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
assert('Hidrata a loja com o conteúdo da obra', show.includes('loadJSON(JSON.stringify(tidyDemoWires(payload.content)))'))
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
assert('Secção editor monta o showcase real', landing.includes('<LandingEditorShowcase onAccess={onAccess} />') && landing.includes('function DeferredEditorShowcase'))
assert('Anatomia antiga (mock) removida', !landing.includes('EditorAnatomy'))
assert('CSS de enquadre da demonstração', read('src/styles/dx-landing.css').includes('.landing-editor-embed'))


// ── Redução «só simular» (2026-10-28) ────────────────────────────────────────
assert('Run/Pausa/Stop ficam; Passo e Reset fora da demo', tb.includes("{!demo && <button onClick={step}") && tb.includes("{!demo && <button onClick={reset}"))
assert('Botão Clean fora da demo', tb.includes("{!demo && <button type=\"button\" className={`dc-tool-btn dc-clean-toggle"))
assert('Atalhos fora da demo (esquema e grafcet)', tb.includes("{mode !== 'grafcet' && !demo && (") && tb.includes("{!demo && <ShortcutsButton scope=\"grafcet\""))

const store2 = read('src/store/useSimStore.ts')
assert('Arrastar componentes bloqueado na demo (moveComponent)', store2.includes('moveComponent: (id, x, y, movingIds) => {\n    // Demonstração e simulação em curso: utilizadores não movem componentes.\n    if (get().demoMode) return'))
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

// Vista limpa da demonstração (revisão: «ambiente de visualização, sem muitas ferramentas»)
assert('Toolbar demo: viewControls só com zoom (sem grelha/ímã/passo)', tb.includes('Demonstração (landing): vista limpa') && tb.includes('const viewControls: ViewControlsProps | null = demo ? ('))

const sv = read('src/schematic/SchematicView.tsx')
assert('Esquema abre em vista frontal (apenas motor isométrico)', sv.includes('const [tilt, setTilt] = useState<Tilt2D>(() => ({ yaw: 0, pitch: 0 }))'))
const orient = read('src/three/componentOrientation.ts')
assert('Apenas o motor usa orientação isométrica por omissão no simulador', orient.includes('MOTOR_ISOMETRIC_ORIENTATION') && orient.includes("type === 'motor3ph' || type === 'motor1ph'") && orient.includes('if (isIsometricMotorType(type)) return { ...MOTOR_ISOMETRIC_ORIENTATION }'))

const panel = read('src/three/Panel3D.tsx')
assert('Painel 3D: botão «+ Comentário» fora da demo', panel.includes('{!demoMode && <button type="button" onClick={addNote}'))
assert('Painel 3D: abre em vista frontal por omissão (apenas o motor é isométrico)', panel.includes("view: 'front'") && panel.includes("moveCamera('front')") && !panel.includes('isoFirst'))
assert('Painel 3D: DPR limitado e pausa offscreen / demand em repouso', panel.includes('dpr={[1, 1.5]}') && panel.includes("frameloop={!stageVisible ? 'never'"))

const wg3d = read('src/three/wireGeometry3D.ts')
assert('Cabos 3D correm em calhas entre as filas de equipamentos', wg3d.includes('export function trunkLaneHints') && wg3d.includes('trunkY !== undefined'))

const nproj = read('src/project/nativeProjects.ts')
assert('Cabos 3D: 9 faixas + 3 camadas de profundidade por calha', wg3d.includes('trunkLayer') && wg3d.includes('% 9) - 4'))
assert('Projeto nativo: routing cozido sem atravessar equipamentos', nproj.includes("import { bakeNativeRouting } from './nativeRouting'") && nproj.includes('wires: bakeNativeRouting(components, wires)'))

// Demo simplificada ao essencial (revisão 2: «ambiente de visualização»)
assert('Ladder demo: painel do Projeto e Ferramentas fora', ladder2.includes("{section === 'Projeto' && !demoMode && (showProjectPane ? ("))
assert('Ladder demo: ações e interruptor «ativa» da network fora', ladder2.includes('{!demoMode && <label className="ladder-switch"') && ladder2.includes('{!demoMode && <div className="ladder-rung-actions"'))
assert('Ladder demo: comentário da network só de leitura', ladder2.includes('readOnly={demoMode}'))

assert('GRAFCET demo: paleta Componentes fora', grafed.includes('{full && !demoMode &&') && grafed.includes('className="grafcet-toolbox"'))
assert('GRAFCET demo: «Nova página» e apagar página fora', grafed.includes('{!demoMode && <button type="button" className="grafcet-page-add"') && grafed.includes('pageCharts.length > 1 && !demoMode && ('))
assert('GRAFCET demo: «Editar propriedades» fora', grafed.includes('{!demoMode && <button') && grafed.includes('setEditingTransition(selectedTransition)'))
assert('GRAFCET demo: dica do canvas orientada à visualização', grafed.includes("demoMode ? 'Selecione etapas e ligações"))
assert('Toolbar GRAFCET demo: Modelos/Ladder, Organizar e Ficheiro fora', tb.includes('{!demo && <div className="dc-seg grafcet-toolbar-secondary" role="toolbar" aria-label="Modelos e Ladder">') && tb.includes('aria-label="Disposição">') && tb.includes('aria-label="Ficheiro">'))

// Revisão: render leve, sem rotação automática e seleção possível durante o RUN
assert('Painel 3D: sem amortecimento nem rotação automática', panel.includes('screenSpacePanning autoRotate={false} />') && !panel.includes('enableDamping dampingFactor'))
assert('Painel 3D: shadow map sob pedido (não por frame)', panel.includes('gl.shadowMap.autoUpdate = false') && panel.includes('function ShadowsOnDemand') && panel.includes('<ShadowsOnDemand watch={shadowWatch} />'))
assert('Painel 3D: geometria dos cabos em cache (não reconstrói por scan)', panel.includes('cachedWireGeometry(wire, from, to, obstacles)') && panel.includes('wireGeomCache.set(key, geom)'))
assert('Painel 3D: caixas de obstáculos estáveis durante o RUN', panel.includes('const obstaclesKey = useMemo'))
assert('Demo: simLocked inclui demoMode e barra de seleção/edição fica oculta', panel.includes('const simLocked = demoMode ||') && read('src/components/SelectionBar.tsx').includes('if (demoMode || (!hasComponents && !wireId && !terminalId)) return null'))
const cat3d = read('src/three/CatalogComponent3D.tsx')
assert('Catálogo 3D: premir botão na demo atua sem abrir barra de edição/seleção', cat3d.includes('if (!useSimStore.getState().demoMode) useSimStore.getState().selectComponents([c.id])'))
assert('Toolbar mobile: botão para abrir o editor usa ícone «Abrir» (sem «+» ambíguo)', tb.includes('<IconOpen size={13} /><span className="hidden md:inline">Abrir no editor</span><span className="md:hidden">Editor</span>'))
assert('GRAFCET e Ladder bloqueiam edição/eliminação na demo', grafed.includes('const full = fullProp && !demoMode') && ladder2.includes('readonly={demoMode}'))

if (failures) {
  console.error(`\n❌ ${failures} falha(s) no contrato editor-real na landing`)
  process.exit(1)
}
console.log('\n✅ TODOS OS TESTES PASSARAM')
