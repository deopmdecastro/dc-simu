import assert from 'node:assert/strict'
import { grafcetSignals, detectGrafcetSignals, detectGrafcetSignalsDetailed, nextDeclaredTagAddress, signalTagErrors, signalSearchText, signalAddressesInCondition } from '../src/grafcet/signals'
import { symbolsInCondition } from '../src/grafcet/inputDetect'
import { useSimStore } from '../src/store/useSimStore'
import { createComponent } from '../src/electrical/factory'
import type { LadderTag } from '../src/types'
import type { GrafcetProgram } from '../src/grafcet/engine'

let checks = 0
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`PASS — ${message}`) }
const tag = (id: string, address: string, name: string, dataType: LadderTag['dataType'] = 'Bool'): LadderTag => ({ id, address, name, dataType, comment: 'Permissão do operador' })
const tags = [tag('i', 'I0.0', 'Partida geral'), tag('q', ' q2 ', 'Motor principal'), tag('q-repeat', 'Q0.1', 'Duplicada'), tag('m', 'M0.0', 'Permissão'), tag('t', 'T1', 'Tempo', 'Time'), tag('int', 'M0.1', 'Contagem', 'Int')]
const suggestions = grafcetSignals(tags)
check(suggestions.length === 3, 'sugestões incluem apenas bits I/Q/M únicos')
check(suggestions.find((item) => item.name === 'Motor principal')?.address === 'Q0.1', 'nome humano conserva endereço canónico executável')
check(!suggestions.some((item) => item.address === 'Partida geral'), 'nomes de documentação não viram aliases executáveis')
check(signalSearchText(suggestions.find((item) => item.address === 'M0.0')!).includes('permissao'), 'pesquisa normaliza acentos e inclui o nome')
check(signalSearchText(suggestions[0]).includes('operador'), 'comentário faz parte da pesquisa do sinal')
check(nextDeclaredTagAddress('I', []) === 'I0.0', "declarações começam em I0.0, independentemente do runtime")
check(nextDeclaredTagAddress('Q', tags) === 'Q0.0', 'alocação encontra endereço livre sem duplicar Q2')
check(nextDeclaredTagAddress('M', Array.from({ length: 99 }, (_, index) => tag(String(index), `M${index + 1}`, ''))) === null, 'área cheia não gera endereço fora do intervalo')
check(signalTagErrors([tag('a', 'M0.0', ''), tag('b', 'm1', '')]).size === 2, 'duplicados são detetados sem distinguir maiúsculas')
check(signalTagErrors([tag('legacy', 'CUSTOM', '')], new Set()).size === 0, 'documentação antiga fora das áreas geridas não bloqueia a tabela')
check(signalTagErrors([tag('new', 'INVALID', '')], new Set(['new'])).has('new'), 'endereço inválido numa linha editada é rejeitado')
assert.deepEqual(signalAddressesInCondition("I1 * /M2 + 'Q1.1' + XI3 + MotorI4 + I5extra + %I0.1 + 1HZ + T(2s)"), ['I0.0', 'M0.1', 'Q1.1'])
check(true, 'deteção distingue tokens I/Q/M de nomes, frequências e endereços de outra sintaxe')
const program: GrafcetProgram = {
  steps: [
    { id: 's0', name: 'Espera', initial: true, action: 'Q0.0', condition: 'I1.0', actions: [{ id: 'a', address: 'Q0.1', condition: '^I1 * /M2' }] },
    { id: 's1', name: 'Motor', initial: false, action: '', condition: 'I0.1', actions: [{ id: 'b', address: '', variable: 'M0.2', condition: 'I0.1' }] },
  ],
  transitions: [{ id: 't', from: ['s0'], to: ['s1'], condition: 'I3 + Q10' }],
  freeActions: [{ id: 'free', address: 'Q0.3', condition: 'M0.6' }],
}
assert.deepEqual(detectGrafcetSignals(program), ['I0.0', 'I0.1', 'I0.2', 'Q0.0', 'Q0.1', 'Q0.3', 'Q1.1', 'M0.1', 'M0.2', 'M0.6'])
check(true, 'deteção cobre ações legadas, anexadas, soltas e condições')
check(detectGrafcetSignals({ ...program, transitions: undefined }).includes('I1.0'), 'programas lineares antigos também fornecem entradas à deteção')

// Deteção de variáveis simbólicas (Start, Stop…) — o caso do «Detetar do GRAFCET» com nomes nas condições.
assert.deepEqual(symbolsInCondition('T1>2000 * MW1>=5 + Start * C1<>3'), ['START'])
check(true, 'operandos numéricos das comparações (MW/T/C) não viram símbolos')
const symProgram: GrafcetProgram = {
  steps: [
    { id: 's0', name: '0', initial: true, action: '', condition: '', actions: [] },
    { id: 's1', name: '1', initial: false, action: '', condition: '', actions: [{ id: 'a1', address: 'Q0.0', condition: '1' }] },
  ],
  transitions: [
    { id: 't1', from: ['s0'], to: ['s1'], condition: 'Start * /Stop' },
    { id: 't2', from: ['s1'], to: ['s0'], condition: 'Stop' },
  ],
}
assert.deepEqual(detectGrafcetSignals(symProgram), ['Q0.0'])
check(true, 'deteção clássica continua a listar apenas endereços I/Q/M explícitos')
const detailed = detectGrafcetSignalsDetailed(symProgram, [])
assert.deepEqual(detailed.map((signal) => signal.address), ['Q0.0', 'I0.0', 'I0.1'])
assert.deepEqual(detailed[0], { address: 'Q0.0', name: '', area: 'Q', symbolic: false })
assert.deepEqual(detailed[1], { address: 'I0.0', name: 'Start', area: 'I', symbolic: true })
assert.deepEqual(detailed[2], { address: 'I0.1', name: 'Stop', area: 'I', symbolic: true })
check(true, 'variáveis das condições viram entradas com endereço livre e grafia original')
const declaredByName = detectGrafcetSignalsDetailed(symProgram, [{ address: 'I0.4', name: 'Start', dataType: 'Bool', comment: '' }])
assert.deepEqual(declaredByName.map((signal) => signal.address), ['Q0.0', 'I0.0'])
check(declaredByName[1].name === 'Stop', 'símbolo já declarado por nome não é duplicado')
const skipTaken = detectGrafcetSignalsDetailed(symProgram, [{ address: 'I0.0', name: 'Ocupada', dataType: 'Bool', comment: '' }])
assert.deepEqual(skipTaken.map((signal) => signal.address), ['Q0.0', 'I0.1', 'I0.2'])
check(true, 'atribuição de endereços salta os já ocupados na tabela')
const writeProgram: GrafcetProgram = {
  steps: [{ id: 's0', name: '0', initial: true, action: '', condition: '', actions: [{ id: 'a', address: 'Motor', condition: '1' }] }],
  transitions: [{ id: 't', from: ['s0'], to: ['s0'], condition: 'Motor * Fc' }],
}
const written = detectGrafcetSignalsDetailed(writeProgram, [])
assert.deepEqual(written.map((signal) => [signal.address, signal.name, signal.area]), [['I0.0', 'Fc', 'I'], ['Q0.0', 'Motor', 'Q']])
check(true, 'variável escrita por uma ação vira saída (Q) e não se duplica com a leitura')
const fullInputs = detectGrafcetSignalsDetailed(symProgram, Array.from({ length: 99 }, (_, index) => ({ address: `I${index + 1}`, name: '', dataType: 'Bool' as const, comment: '' })))
assert.deepEqual(fullInputs.map((signal) => signal.address), ['Q0.0'])
check(true, 'área cheia não inventa endereços fora de I1…I99')

const state = () => useSimStore.getState()
state().newProject('grafcet')
state().addTag('I'); state().addTag('I'); state().addTag('M')
assert.deepEqual(state().tags.map((item) => item.address), ['I0.0', 'I0.1', 'M0.0'])
check(true, 'adicionar tags repetidamente não repete o endereço pré-alocado do runtime')
const before = structuredClone(state().tags)
const after = [tag('start', 'I0.0', 'Partida'), tag('motor', 'Q0.0', 'Motor'), tag('permit', 'M0.0', 'Permissão')]
const historyBefore = state().history.length
const context = { activePlcId: state().activePlcId, projectRevision: state().projectRevision }
check(state().setTags(after, context), 'gravação é aceite no contexto atual')
check(state().history.length === historyBefore + 1, 'gravação de várias linhas cria um único passo de histórico')
state().undo()
assert.deepEqual(state().tags, before)
state().redo()
assert.deepEqual(state().tags, after)
check(true, 'desfazer e refazer preservam a tabela completa')
state().setGrafcet(program)
const originalProgram = JSON.stringify(state().grafcet)
state().setTags([tag('renamed', 'I0.0', 'Novo nome')])
check(JSON.stringify(state().grafcet) === originalProgram, 'alterar documentação não remapeia nem elimina o GRAFCET')
const saved = state().saveJSON()
state().newProject('grafcet')
check(!state().setTags(after, context) && state().tags.length === 0, 'rascunho de outro projeto não pode gravar no novo contexto')
state().loadJSON(saved)
check(state().tags[0]?.name === 'Novo nome', 'guardar e carregar projeto completo preserva tags')

const plcA = createComponent('plcCompact')
const plcB = createComponent('plcSiemensLogo1224RC')
useSimStore.setState({ components: [plcA, plcB], activePlcId: plcA.id, plcPrograms: {}, plcTags: {}, tags: [], history: [], future: [] })
state().setTags([tag('a-start', 'I0.0', 'Partida A')])
const plcAContext = { activePlcId: plcA.id, projectRevision: state().projectRevision }
state().setActivePlc(plcB.id)
check(state().tags.length === 0, 'PLC B começa sem as declarações do PLC A')
check(!state().setTags(after, plcAContext), 'rascunho do PLC A não grava na tabela ativa B')
state().setTags([tag('b-start', 'I0.0', 'Partida B')])
state().setActivePlc(plcA.id)
check(state().tags[0]?.name === 'Partida A', 'regressar ao PLC A recupera a sua tabela')
const exported = JSON.parse(state().saveJSON())
check(exported.plcTags[plcA.id][0].name === 'Partida A' && exported.plcTags[plcB.id][0].name === 'Partida B', 'projeto exportado mantém tabelas isoladas dos dois PLC')
console.log(`\n${checks} verificações de sinais passaram.`)
