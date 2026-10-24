import assert from 'node:assert/strict'
import { bendInsertIndex, expandPolyline, polylineMidpoint, routeThrough } from '../src/grafcet/links'
import { emptyGrafcetRuntime, scanGrafcet, stepNumberOf, validateGrafcet, type GrafcetProgram } from '../src/grafcet/engine'
import { useSimStore } from '../src/store/useSimStore'

let checks = 0
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`PASS — ${message}`) }

// ---------------------------------------------------------------------------
// Traçado ortogonal com pontos de quebra (duplo clique na linha)
// ---------------------------------------------------------------------------
assert.deepEqual(expandPolyline([{ x: 0, y: 0 }, { x: 0, y: 100 }]), [{ x: 0, y: 0 }, { x: 0, y: 100 }])
check(true, 'troço vertical alinhado não ganha cantos')
assert.deepEqual(expandPolyline([{ x: 0, y: 0 }, { x: 50, y: 100 }]), [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 50, y: 100 }])
check(true, 'entre pontos desalinhados aparece o canto V→H (ângulos retos)')
check(routeThrough([{ x: 0, y: 0 }, { x: 50, y: 100 }]) === 'M 0 0 L 0 100 L 50 100', 'o percurso com quebras fica ortogonal')
assert.deepEqual(polylineMidpoint([{ x: 0, y: 0 }, { x: 0, y: 100 }]), { x: 0, y: 50 })
check(true, 'ponto médio numa reta é a meio')
assert.deepEqual(polylineMidpoint([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }]), { x: 0, y: 100 })
check(true, 'ponto médio de um «L» cai no canto quando os troços medem o mesmo')
// Inserção: escolhe o troço mais próximo do clique.
check(bendInsertIndex([{ x: 0, y: 0 }, { x: 0, y: 100 }], { x: 2, y: 20 }) === 0, 'sem quebras, insere no único troço')
check(bendInsertIndex([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 100 }], { x: 4, y: 74 }) === 1, 'clique no segundo troço insere depois da primeira quebra')
check(bendInsertIndex([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 120 }], { x: 52, y: 45 }) === 1, 'clique perto do troço horizontal insere nesse troço')

// ---------------------------------------------------------------------------
// Ligação por referência (sem linha) e quebras: dados e simulação intactos
// ---------------------------------------------------------------------------
const program: GrafcetProgram = {
  steps: [
    { id: 's0', name: 'Espera', initial: true, action: '', condition: '' },
    { id: 's1', name: 'Trabalho', initial: false, action: 'Q1', condition: '' },
  ],
  transitions: [{ id: 't0', from: ['s0'], to: ['s1'], condition: 'I1', wireless: true }],
  linkBends: { t0: [{ x: 320, y: 240 }] },
}
check(!validateGrafcet(program).some((issue) => issue.level === 'error'), 'ligação por referência não gera erros de validação')

const table: Record<string, boolean> = { I1: false }
let runtime = scanGrafcet(program, emptyGrafcetRuntime(), table)
check(table.Q1 === false && runtime.active.includes('s0'), 'etapa inicial ativa antes de disparar')
table.I1 = true
runtime = scanGrafcet(program, runtime, table)
check(runtime.active.includes('s1'), 'transição «sem linha» dispara e avança a sequência como uma ligada por linha')
check(table.Q1 === true, 'ação do destino fica ativa após o salto por referência')

check(stepNumberOf({ name: '141 - Descida' }, 3) === '141', 'número mostrado é o prefixo do nome (para X141)')
check(stepNumberOf({}, 149) === '149', 'sem nome, o número é o índice da etapa')

// Guardar / abrir o projeto preserva a forma «sem linha» e os pontos de quebra.
const state = () => useSimStore.getState()
state().newProject('grafcet')
state().setGrafcet(program)
const saved = state().saveJSON()
state().newProject('grafcet')
state().loadJSON(saved)
check(state().grafcet.transitions?.[0]?.wireless === true, '«sem linha» é guardada no projeto')
assert.deepEqual(state().grafcet.linkBends?.t0, [{ x: 320, y: 240 }])
check(true, 'pontos de quebra sobrevivem a guardar/abrir')

// Projetos antigos (sem estes campos) continuam válidos.
const legacy = state().grafcet
delete (legacy as Record<string, unknown>).linkBends
delete (legacy.transitions![0] as Record<string, unknown>).wireless
check(!validateGrafcet(legacy).some((issue) => issue.level === 'error'), 'projetos antigos sem estes campos continuam válidos')

console.log(`\n${checks} verificações de ligações passaram.`)
