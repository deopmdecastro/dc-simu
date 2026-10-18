import assert from 'node:assert/strict'
import { grafcetSignals, detectGrafcetSignals, nextDeclaredTagAddress, signalTagErrors, signalSearchText, signalAddressesInCondition } from '../src/grafcet/signals'
import { useSimStore } from '../src/store/useSimStore'
import { createComponent } from '../src/electrical/factory'
import type { LadderTag } from '../src/types'
import type { GrafcetProgram } from '../src/grafcet/engine'

let checks = 0
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`PASS — ${message}`) }
const tag = (id: string, address: string, name: string, dataType: LadderTag['dataType'] = 'Bool'): LadderTag => ({ id, address, name, dataType, comment: 'Permissão do operador' })
const tags = [tag('i', 'I1', 'Partida geral'), tag('q', ' q2 ', 'Motor principal'), tag('q-repeat', 'Q2', 'Duplicada'), tag('m', 'M1', 'Permissão'), tag('t', 'T1', 'Tempo', 'Time'), tag('int', 'M2', 'Contagem', 'Int')]
const suggestions = grafcetSignals(tags)
check(suggestions.length === 3, 'sugestões incluem apenas bits I/Q/M únicos')
check(suggestions.find((item) => item.name === 'Motor principal')?.address === 'Q2', 'nome humano conserva endereço canónico executável')
check(!suggestions.some((item) => item.address === 'Partida geral'), 'nomes de documentação não viram aliases executáveis')
check(signalSearchText(suggestions.find((item) => item.address === 'M1')!).includes('permissao'), 'pesquisa normaliza acentos e inclui o nome')
check(signalSearchText(suggestions[0]).includes('operador'), 'comentário faz parte da pesquisa do sinal')
check(nextDeclaredTagAddress('I', []) === 'I1', 'declarações começam em I1, independentemente do runtime')
check(nextDeclaredTagAddress('Q', tags) === 'Q1', 'alocação encontra endereço livre sem duplicar Q2')
check(nextDeclaredTagAddress('M', Array.from({ length: 99 }, (_, index) => tag(String(index), `M${index + 1}`, ''))) === null, 'área cheia não gera endereço fora do intervalo')
check(signalTagErrors([tag('a', 'M1', ''), tag('b', 'm1', '')]).size === 2, 'duplicados são detetados sem distinguir maiúsculas')
check(signalTagErrors([tag('legacy', 'CUSTOM', '')], new Set()).size === 0, 'documentação antiga fora das áreas geridas não bloqueia a tabela')
check(signalTagErrors([tag('new', 'INVALID', '')], new Set(['new'])).has('new'), 'endereço inválido numa linha editada é rejeitado')
assert.deepEqual(signalAddressesInCondition('I1 * /M2 + Q10 + XI3 + MotorI4 + I5extra + %I0.1 + 1HZ + T(2s)'), ['I1', 'M2', 'Q10'])
check(true, 'deteção distingue tokens I/Q/M de nomes, frequências e endereços de outra sintaxe')
const program: GrafcetProgram = {
  steps: [
    { id: 's0', name: 'Espera', initial: true, action: 'Q1', condition: 'I9', actions: [{ id: 'a', address: 'Q2', condition: '^I1 * /M2' }] },
    { id: 's1', name: 'Motor', initial: false, action: '', condition: 'I2', actions: [{ id: 'b', address: '', variable: 'M3', condition: 'I2' }] },
  ],
  transitions: [{ id: 't', from: ['s0'], to: ['s1'], condition: 'I3 + Q10' }],
  freeActions: [{ id: 'free', address: 'Q4', condition: 'M7' }],
}
assert.deepEqual(detectGrafcetSignals(program), ['I1', 'I2', 'I3', 'Q1', 'Q2', 'Q4', 'Q10', 'M2', 'M3', 'M7'])
check(true, 'deteção cobre ações legadas, anexadas, soltas e condições')
check(detectGrafcetSignals({ ...program, transitions: undefined }).includes('I9'), 'programas lineares antigos também fornecem entradas à deteção')

const state = () => useSimStore.getState()
state().newProject('grafcet')
state().addTag('I'); state().addTag('I'); state().addTag('M')
assert.deepEqual(state().tags.map((item) => item.address), ['I1', 'I2', 'M1'])
check(true, 'adicionar tags repetidamente não repete o endereço pré-alocado do runtime')
const before = structuredClone(state().tags)
const after = [tag('start', 'I1', 'Partida'), tag('motor', 'Q1', 'Motor'), tag('permit', 'M1', 'Permissão')]
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
state().setTags([tag('renamed', 'I1', 'Novo nome')])
check(JSON.stringify(state().grafcet) === originalProgram, 'alterar documentação não remapeia nem elimina o GRAFCET')
const saved = state().saveJSON()
state().newProject('grafcet')
check(!state().setTags(after, context) && state().tags.length === 0, 'rascunho de outro projeto não pode gravar no novo contexto')
state().loadJSON(saved)
check(state().tags[0]?.name === 'Novo nome', 'guardar e carregar projeto completo preserva tags')

const plcA = createComponent('plcCompact')
const plcB = createComponent('plcSiemensLogo1224RC')
useSimStore.setState({ components: [plcA, plcB], activePlcId: plcA.id, plcPrograms: {}, plcTags: {}, tags: [], history: [], future: [] })
state().setTags([tag('a-start', 'I1', 'Partida A')])
const plcAContext = { activePlcId: plcA.id, projectRevision: state().projectRevision }
state().setActivePlc(plcB.id)
check(state().tags.length === 0, 'PLC B começa sem as declarações do PLC A')
check(!state().setTags(after, plcAContext), 'rascunho do PLC A não grava na tabela ativa B')
state().setTags([tag('b-start', 'I1', 'Partida B')])
state().setActivePlc(plcA.id)
check(state().tags[0]?.name === 'Partida A', 'regressar ao PLC A recupera a sua tabela')
const exported = JSON.parse(state().saveJSON())
check(exported.plcTags[plcA.id][0].name === 'Partida A' && exported.plcTags[plcB.id][0].name === 'Partida B', 'projeto exportado mantém tabelas isoladas dos dois PLC')
console.log(`\n${checks} verificações de sinais passaram.`)
