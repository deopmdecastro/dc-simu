import assert from 'node:assert/strict'
import { commandsDiagnostics, schematicDiagnostics, summarize } from '../src/diagnostics/viewDiagnostics'
import { COMMANDS_EXAMPLES } from '../src/commands/examples'
import { buildNativePartidaDireta } from '../src/project/nativeProjects'
import { callableFunctions, executedRungs, lintLadder } from '../src/ladder/ladderLint'
import type { CommandsDiagram } from '../src/commands/model'

/** Diagnóstico por simulador (etiqueta ✓/!/✖ e painel «Diagnóstico» do 3D Realista, Esquema IEC e Ladder). */
let checks = 0
const ok = (cond: unknown, message: string) => { assert.ok(cond, message); checks += 1; console.log('PASS — ' + message) }

// ---- Resumo
ok(summarize([]).status === 'ok', 'sem problemas → «Tudo OK»')
ok(summarize([{ id: 'a', level: 'warning', message: 'x' }]).status === 'warning', 'só avisos → estado de aviso')
ok(summarize([{ id: 'a', level: 'warning', message: 'x' }, { id: 'b', level: 'error', message: 'y' }]).status === 'error', 'um erro manda no estado')

// ---- Esquema IEC
ok(commandsDiagnostics({ parts: [], wires: [] }).length === 0, 'Esquema IEC vazio não inventa problemas')
for (const example of COMMANDS_EXAMPLES) {
  const items = commandsDiagnostics(example.build())
  ok(!items.length, `exemplo «${example.title}» sem erros nem avisos${items.length ? ' — ' + items.map((i) => i.message).join(' | ') : ''}`)
}
const broken: CommandsDiagram = {
  parts: [
    { id: 'k1', kind: 'coil', x: 0, y: 0, rot: 0, tag: 'K1' },
    { id: 'k1b', kind: 'coil', x: 100, y: 0, rot: 0, tag: 'K1' },
    { id: 'c9', kind: 'contactNO', x: 200, y: 0, rot: 0, tag: 'K9' },
    { id: 'm1', kind: 'motor3', x: 300, y: 0, rot: 0, tag: 'M1' },
  ],
  wires: [{ id: 'w', a: { part: 'k1', term: 0 }, b: { part: 'ghost', term: 0 } }],
}
const issues = commandsDiagnostics(broken, { fault: 'Curto-circuito entre L1 e L2' })
const has = (text: string, level?: string) => issues.some((item) => item.message.includes(text) && (!level || item.level === level))
ok(has('Simulação: Curto-circuito', 'error'), 'falha da simulação aparece como erro')
ok(has('Não há alimentação', 'error'), 'falta de alimentação é erro')
ok(has('aparece 2 vezes', 'error'), 'bobina repetida é erro')
ok(has('Cabo sem destino válido', 'error'), 'cabo para símbolo apagado é erro')
ok(has('K1: A2 sem ligação', 'error') || has('K1: A1, A2 sem ligação', 'error'), 'bobina com bornes soltos é erro')
ok(has('não existe a bobina K9', 'warning'), 'contacto sem bobina é aviso')
ok(has('sem proteção contra sobrecarga', 'warning'), 'motor sem térmico nem disjuntor-motor é aviso')
ok(issues.filter((item) => item.target).every((item) => broken.parts.some((part) => part.id === item.target)), 'cada problema aponta para um símbolo que existe')

// ---- 3D Realista e Ladder no projeto nativo (não pode haver falsos alarmes no projeto de referência)
const native = buildNativePartidaDireta() as ReturnType<typeof buildNativePartidaDireta> & { projectFiles?: Record<string, Array<{ id: string; folder?: string; rungs?: never[] }>>; activePlcId?: string | null }
const schematic = schematicDiagnostics(native.components, native.wires, [], false)
ok(schematic.length === 0, `3D Realista do projeto nativo: «Tudo OK»${schematic.length ? ' — ' + schematic.map((i) => i.message).join(' | ') : ''}`)
const live = schematicDiagnostics(native.components, native.wires, [{ id: 'x', level: 'error', message: 'ERRO: relé térmico F1 disparou.' }, { id: 'y', level: 'error', message: 'ERRO: relé térmico F1 disparou.' }], true)
ok(live.length === 1 && live[0].message === 'relé térmico F1 disparou.', 'a correr: usa o diagnóstico da simulação, sem repetidos nem prefixo «ERRO:»')
const files = native.projectFiles?.[native.activePlcId ?? '_general'] ?? []
const ladder = lintLadder({ rungs: executedRungs(native.ladder.rungs, callableFunctions(undefined, files as never)) }, { physicalInputs: true, tags: native.tags ?? [] })
ok(!ladder.some((issue) => issue.level !== 'info'), `Ladder do projeto nativo sem avisos (saídas escritas nos FC chamados por CALL)${ladder.length ? ' — ' + ladder.map((i) => i.message).join(' | ') : ''}`)
const onlyMain = lintLadder({ rungs: native.ladder.rungs }, { physicalInputs: true, tags: native.tags ?? [] })
ok(onlyMain.some((issue) => issue.message.includes('nenhuma network a escreve')), 'sem seguir os CALL as saídas pareciam nunca escritas (o caso corrigido)')

console.log(`${checks} verificações de diagnóstico por vista passaram.`)
