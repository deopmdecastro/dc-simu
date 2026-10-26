/**
 * Verificações da deteção automática de objetos interativos (`src/catalog/interactables.ts`).
 * Módulo puro: corre sem navegador nem Three.js — `npm run test:interactables`.
 */
import { axisName, classifyNode, controlFromSuggestion, displayFromSuggestion, inferReturnMode, suggestFromNodes, variableFromSuggestion, thinAxis, type NodeBox } from '../src/catalog/interactables'
import { isSpringReturn, springHold } from '../src/catalog/behavior'

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

// PKZM C-10: manípulo marcado (dcsimu_handle_*) com categoria de disjuntor-motor →
// botão ROTATIVO: bascula 90° à volta da normal da face (Z), como no aparelho real.
const pkz = suggestFromNodes(
  [
    { name: 'dcsimu_handle_1', meshes: 2, centre: [0, 52, 38], size: [16, 10, 6] },
    { name: 'pkzm_test_1', meshes: 1, centre: [-14, 30, 38], size: [8, 8, 4] },
  ],
  { bounds: { centre: [0, 45, 0], size: [67, 92, 76] }, category: 'Proteção Disjuntor-motor Eaton/Moeller PKZM C-10' },
)
const pkzHandle = pkz.suggestions.find((item) => item.node === 'dcsimu_handle_1')
check('PKZM: manípulo → interruptor com retenção', pkzHandle?.kind === 'toggle' && pkzHandle?.returnMode === 'latch')
check('PKZM: teste é botão com mola', pkz.suggestions.find((item) => item.node === 'pkzm_test_1')?.returnMode === 'spring')
if (pkzHandle) {
  const ctrl = controlFromSuggestion('part1', pkzHandle, 'c1')
  check('PKZM: rotação de 90° à volta do eixo da face (Z), OFF=pose do CAD',
    ctrl.motion?.angleOff === 0 && ctrl.motion?.angleOn === -90 && ctrl.axis[2] === 1, `axis=${ctrl.axis} off=${ctrl.motion?.angleOff} on=${ctrl.motion?.angleOn}`)
}
check('2 sugestões e 1 ignorado', suggestions.length === 2 && ignored.length === 1, `${suggestions.length} sugestões / ${ignored.length} ignorados`)

const handle = suggestions.find((item) => item.node === 'WEG_Handle')
check('manípulo com eixo Z e curso 2 mm', handle?.axis[2] === 1 && handle?.travelMm === 2, `eixo=${handle?.axis.join(',')} curso=${handle?.travelMm}`)
check('manípulo gera ação «alternar variável»', handle?.kind === 'toggle' && handle?.variable.startsWith('ctrl_'))

const led = suggestions.find((item) => item.node === 'led_run')
check('LED RUN liga-se à variável do simulador ($run)', led?.runtimeVar === '$run')

// ——— componentes com nós genéricos (export CAD), deteção pela forma + cor + contexto ———
// Cogumelo de emergência Metaltex P20AKR: cabeça vermelha grande na frente → botão com retenção.
const emergency = suggestFromNodes(
  [{ name: 'P20AKR-1-solid1', meshes: 3, centre: [0, 0, 30], size: [40, 40, 16], color: '#d92626' }],
  { bounds: { centre: [0, 0, 0], size: [52, 52, 72] }, category: 'Comando Botão de emergência Metaltex P20AKR' },
)
const mushroom = emergency.suggestions.find((item) => item.kind === 'button')
check('P20AKR: cabeça vermelha grande → botão (não seletor)', !!mushroom, mushroom?.reason)
check('P20AKR: retenção até rodar/rearmar (não mola)', mushroom?.returnMode === 'latch', mushroom?.returnReason)

// Seletor de chave Metaltex P20ACR: disco escuro médio à face → seletor (mantém a posição).
const keyed = suggestFromNodes(
  [{ name: 'P20ACR-R-1B-1-solid2', meshes: 2, centre: [0, 0, 28], size: [22, 22, 14], color: '#2c2c30' }],
  { bounds: { centre: [0, 0, 0], size: [52, 52, 72] }, category: 'Comando Botão de emergência Metaltex P20ACR chave' },
)
check('P20ACR: disco escuro → seletor rotativo', keyed.suggestions.some((item) => item.kind === 'selector'), keyed.suggestions.map((item) => `${item.kind}:${item.reason}`).join(' · '))

// Sinaleiro AD22-22DS: lente vermelha translúcida na frente → luz que segue $powered.
const pilot = suggestFromNodes(
  [{ name: 'Node0', meshes: 1, centre: [0, 0, 26], size: [29, 29, 8], color: '#ff0000' }],
  { bounds: { centre: [0, 0, 0], size: [50, 70, 60] }, category: 'Sinalização Sinaleiro LED AD22-22DS' },
)
const lens = pilot.suggestions.find((item) => item.kind === 'led')
check('AD22: lente vermelha → indicador luminoso', !!lens, lens?.reason)
check('AD22: liga-se a $powered (acende quando alimentado)', lens?.runtimeVar === '$powered')
check('AD22: sem variável nova (usa a de execução)', !lens || variableFromSuggestion(lens) === null)
check('LED RUN fica verde', led?.color === '#22c55e')

const selector = suggestFromNodes([{ name: 'Seletor_Funcao', meshes: 2, centre: [0, 20, 30], size: [18, 18, 5] }]).suggestions[0]
check('seletor tem duas posições simétricas', selector?.kind === 'selector' && selector?.angle === 35)
check('seletor usa o eixo fino (Z)', selector?.axis[2] === 1)

/* -------------------------------------------- ecrãs, bornes, geometria e retorno (mola/retenção) */
check('«LCD_Display» → ecrã', classifyNode('LCD_Display')?.kind === 'display')
check('«Visor_7seg» → ecrã', classifyNode('Visor_7seg')?.kind === 'display')
check('«Terminal_A1» → borne', classifyNode('Terminal_A1')?.kind === 'terminal')
check('«borne_13» → borne', classifyNode('borne_13')?.kind === 'terminal')
check('«terminal_cover» não é borne', classifyNode('terminal_cover')?.kind !== 'terminal')

check('botão START → mola', inferReturnMode('Botao_Start', 'button', 'command')?.mode === 'spring')
check('emergência → retenção', inferReturnMode('Emergencia_Cogumelo', 'button', 'command')?.mode === 'latch')
check('manípulo de disjuntor → retenção a bascular', (() => { const r = inferReturnMode('dcsimu_handle_1', 'toggle', 'protection breaker'); return r?.mode === 'latch' && r.tilt })())
check('botão TEST de disjuntor → mola', inferReturnMode('pkzm_test_1', 'button', 'motorBreakerPkzmC10')?.mode === 'spring')
check('seletor sem retorno', inferReturnMode('Seletor', 'selector') === null)

// Modelo com nomes genéricos: corpo 80×120×40, ecrã fino à frente, dois botões e um disco seletor.
const generic: NodeBox[] = [
  { name: 'Mesh_0', meshes: 1, centre: [0, 0, 0], size: [80, 120, 40], color: '#222222' },
  { name: 'Mesh_1', meshes: 1, centre: [0, 35, 20.1], size: [50, 30, 0.2], color: '#1a2a1f' },
  { name: 'Mesh_2', meshes: 1, centre: [-20, 0, 22], size: [9, 9, 6], color: '#22c55e' },
  { name: 'Mesh_3', meshes: 1, centre: [20, 0, 22], size: [9, 9, 6], color: '#ef4444' },
  { name: 'Mesh_4', meshes: 1, centre: [0, -30, 24], size: [32, 32, 10], color: '#111111' },
  { name: 'Text_1', meshes: 1, centre: [0, -50, 20.05], size: [30, 8, 0.1], color: '#ffffff' },
  { name: 'Mesh_5', meshes: 1, centre: [0, 0, 0], size: [8, 8, 6], color: '#888888' },
]
const g = suggestFromNodes(generic, { category: 'command' })
const kindOf = (node: string) => g.suggestions.find((item) => item.node === node)?.kind
check('geometria: corpo ignorado', !kindOf('Mesh_0'))
check('geometria: placa fina à face → ecrã', kindOf('Mesh_1') === 'display')
check('geometria: cilindros pequenos à face → botões', kindOf('Mesh_2') === 'button' && kindOf('Mesh_3') === 'button')
check('geometria: disco Ø32 → seletor', kindOf('Mesh_4') === 'selector')
check('geometria: serigrafia não é ecrã', !kindOf('Text_1'))
check('geometria: peça escondida no interior ignorada', !kindOf('Mesh_5'))
check('geometria: confiança baixa (vem desmarcada)', g.suggestions.every((item) => item.source !== 'geometry' || item.confidence < 0.5 || item.kind === 'display'))
const screen = g.suggestions.find((item) => item.node === 'Mesh_1')!
check('ecrã: 50 × 30 mm à face +Z', screen.screen?.widthMm === 50 && screen.screen?.heightMm === 30 && screen.normal?.[2] === 1 && (screen.screen?.position[2] ?? 0) > 20.1)
const display = displayFromSuggestion(screen, 'd1', 'l1')
check('ecrã → DisplayDef com normal e tamanho', !!display && display.widthMm === 50 && display.normal[2] === 1)
const namesOnly = suggestFromNodes(generic, { namesOnly: true })
check('só nomes: nada nos nomes genéricos', namesOnly.suggestions.length === 0)

// Botão com mola: ativo só enquanto premido; retenção alterna e fica.
const pushSuggestion = g.suggestions.find((item) => item.node === 'Mesh_2')!
const push = controlFromSuggestion('p1', pushSuggestion, 'c1', 'start')
check('botão detetado vem com mola', push.returnMode === 'spring' && isSpringReturn(push))
const down = springHold(push, { start: false }, 'off', true)
const up = springHold(push, down.vars, down.state, false, { start: false })
check('mola: premido → ativo; largado → repouso', down.vars.start === true && up.vars.start === false)
const breakerHandle = suggestFromNodes([{ name: 'dcsimu_handle_1', meshes: 1, centre: [0, 10, 30], size: [12, 18, 10] }], { category: 'protection' }).suggestions[0]
const lever = controlFromSuggestion('p1', breakerHandle, 'c2', 'closed')
check('manípulo de disjuntor: retenção + basculante', lever.returnMode === 'latch' && lever.motion?.mode === 'tilt' && !isSpringReturn(lever))

if (failures) throw new Error(`${failures} verificação(ões) falharam`)
console.log('\nDeteção automática: todas as verificações passaram.')
