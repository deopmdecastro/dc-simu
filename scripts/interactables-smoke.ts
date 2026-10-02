/**
 * Verificações da deteção automática de objetos interativos (`src/catalog/interactables.ts`).
 * Módulo puro: corre sem navegador nem Three.js — `npm run test:interactables`.
 */
import { axisName, classifyNode, suggestFromNodes, thinAxis } from '../src/catalog/interactables'

let failures = 0
function check(label: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'ok   ' : 'FALHA'} · ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures += 1
}

check('«WEG_Handle» → manípulo/interruptor', classifyNode('WEG_Handle')?.kind === 'toggle')
check('«Botao_Emergencia» → botão', classifyNode('Botao_Emergencia')?.kind === 'button')
check('«led_verde» → indicador', classifyNode('led_verde')?.kind === 'led')
check('«Seletor_Funcao» → seletor', classifyNode('Seletor_Funcao')?.kind === 'selector')
check('«Chave_1-0-2» → seletor', classifyNode('Chave_1-0-2')?.kind === 'selector')
check('«Node2» ignorado (nome genérico)', classifyNode('Node2') === null)
check('«Corpo_Principal» ignorado (estrutura)', classifyNode('Corpo_Principal') === null)
check('«occurrence_of_Plane014_Material009_0» ignorado', classifyNode('occurrence_of_Plane014_Material009_0') === null)

check('eixo fino de [3, 3, 1] é Z', thinAxis([3, 3, 1]) === 2)
check('objeto cúbico assume a frente (+Z)', thinAxis([5, 5, 5]) === 2)
check('eixo fino de [1, 3, 3] é X', thinAxis([1, 3, 3]) === 0)
check('nome do eixo de [0, 1, 0] é Y', axisName([0, 1, 0]) === 'y')

const { suggestions, ignored } = suggestFromNodes([
  { name: 'WEG_Handle', meshes: 1, centre: [0, 0, 30], size: [6, 14, 4] },
  { name: 'led_run', meshes: 1, centre: [10, 20, 30], size: [3, 3, 1] },
  { name: 'Node2', meshes: 4, centre: [0, 0, 0], size: [60, 80, 60] },
])
check('2 sugestões e 1 ignorado', suggestions.length === 2 && ignored.length === 1, `${suggestions.length} sugestões / ${ignored.length} ignorados`)

const handle = suggestions.find((item) => item.node === 'WEG_Handle')
check('manípulo com eixo Z e curso 2 mm', handle?.axis[2] === 1 && handle?.travelMm === 2, `eixo=${handle?.axis.join(',')} curso=${handle?.travelMm}`)
check('manípulo gera ação «alternar variável»', handle?.kind === 'toggle' && handle?.variable.startsWith('ctrl_'))

const led = suggestions.find((item) => item.node === 'led_run')
check('LED RUN liga-se à variável do simulador ($run)', led?.runtimeVar === '$run')
check('LED RUN fica verde', led?.color === '#22c55e')

const selector = suggestFromNodes([{ name: 'Seletor_Funcao', meshes: 2, centre: [0, 20, 30], size: [18, 18, 5] }]).suggestions[0]
check('seletor tem duas posições simétricas', selector?.kind === 'selector' && selector?.angle === 35)
check('seletor usa o eixo fino (Z)', selector?.axis[2] === 1)

if (failures) throw new Error(`${failures} verificação(ões) falharam`)
console.log('\nDeteção automática: todas as verificações passaram.')
