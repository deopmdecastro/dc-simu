import assert from 'node:assert/strict'
import { applySegmentDrag, beginSegmentDrag, bendInsertIndex, expandPolyline, interiorBends, nearestLeg, polylineMidpoint, routeThrough, simplifyOrthogonal } from '../src/grafcet/links'
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
// Arrasto ortogonal de troços (linha de retorno): sem desvios nem saltos
// ---------------------------------------------------------------------------
const ret = [{ x: 67, y: 76 }, { x: 67, y: 124 }, { x: -30, y: 124 }, { x: -30, y: 452 }, { x: 67, y: 452 }, { x: 67, y: 476 }]
const isOrtho = (pts: { x: number; y: number }[]) => pts.slice(1).every((p, i) => p.x === pts[i].x || p.y === pts[i].y)
const legMid = nearestLeg(ret, { x: -28, y: 300 })
check(legMid === 2, 'troço vertical do trilho de retorno é identificado pelo clique')
const mid = beginSegmentDrag(ret, legMid)!
const movedMid = applySegmentDrag(mid, 40)
check(isOrtho(movedMid) && movedMid.length === ret.length, 'mover o trilho mantém todos os troços ortogonais e o número de pontos')
check(movedMid[0].x === 67 && movedMid[0].y === 76 && movedMid.at(-1)!.x === 67 && movedMid.at(-1)!.y === 476, 'as ancoragens nas etapas não se movem')
check(movedMid[2].x === 10 && movedMid[3].x === 10, 'só o troço arrastado desliza no seu eixo')
const first = beginSegmentDrag(ret, 0)!
const movedFirst = applySegmentDrag(first, 30)
check(isOrtho(movedFirst) && movedFirst[0].x === 67 && movedFirst[0].y === 76 && movedFirst.length === ret.length + 2, 'arrastar a saída da etapa cria um pequeno degrau e preserva a ancoragem')
const last = beginSegmentDrag(ret, ret.length - 2)!
const movedLast = applySegmentDrag(last, -30)
check(isOrtho(movedLast) && movedLast.at(-1)!.x === 67 && movedLast.at(-1)!.y === 476, 'arrastar a entrada na etapa preserva a ancoragem final')
check(interiorBends(applySegmentDrag(mid, 0)).length === ret.length - 2, 'largar sem mover não altera o percurso')
check(interiorBends(movedMid).every((p) => Number.isInteger(p.x) && Number.isInteger(p.y)), 'as quebras guardadas são inteiras')
check(simplifyOrthogonal([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 100 }]).length === 2, 'pontos colineares são fundidos')
check(simplifyOrthogonal(applySegmentDrag(mid, 97)).length === 2, 'trilho alinhado com a espinha funde-se numa reta, sem desvios')

// ---------------------------------------------------------------------------
// Ligação por referência (sem linha) e quebras: dados e simulação intactos
// ---------------------------------------------------------------------------
const program: GrafcetProgram = {
  steps: [
    { id: 's0', name: 'Espera', initial: true, action: '', condition: '' },
    { id: 's1', name: 'Trabalho', initial: false, action: 'Q0.0', condition: '' },
  ],
  transitions: [{ id: 't0', from: ['s0'], to: ['s1'], condition: 'I0.0', wireless: true }],
  linkBends: { t0: [{ x: 320, y: 240 }] },
}
check(!validateGrafcet(program).some((issue) => issue.level === 'error'), 'ligação por referência não gera erros de validação')

const table: Record<string, boolean> = { 'I0.0': false }
let runtime = scanGrafcet(program, emptyGrafcetRuntime(), table)
check(table['Q0.0'] === false && runtime.active.includes('s0'), 'etapa inicial ativa antes de disparar')
table['I0.0'] = true
runtime = scanGrafcet(program, runtime, table)
check(runtime.active.includes('s1'), 'transição «sem linha» dispara e avança a sequência como uma ligada por linha')
check(table['Q0.0'] === true, 'ação do destino fica ativa após o salto por referência')

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
