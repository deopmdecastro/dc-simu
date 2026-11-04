import assert from 'node:assert/strict'
import {
  grafcetSignals, isUsableSignalName, resolveProgramSignalNames, resolveSignalNames, signalAddressesInCondition, signalAliasMap, signalReference, signalUsage,
} from '../src/grafcet/signals'
import { detectGrafcetIo } from '../src/grafcet/inputDetect'
import { emptyGrafcetRuntime, evalCondition, scanGrafcet, type GrafcetProgram } from '../src/grafcet/engine'
import { grafcetToLadder } from '../src/grafcet/toLadder'
import { useSimStore } from '../src/store/useSimStore'
import type { LadderTag } from '../src/types'

let checks = 0
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`PASS — ${message}`) }
const tag = (id: string, address: string, name: string, dataType: LadderTag['dataType'] = 'Bool'): LadderTag => ({ id, address, name, dataType, comment: '' })

// ---- Que nomes se podem escrever numa condição --------------------------------
for (const name of ['Start', 'Sensor_A', 'fc_a0', 'B1', 'Motor2']) check(isUsableSignalName(name), `«${name}» é um nome utilizável`)
for (const name of ['Partida geral', 'Ação', '1Sensor', '_Start', 'AND', 'not', 'T', 'X5', 'G1X2', 'I0', 'Q1', 'MW3', 'T1', 'C2', 'Start+', '']) check(!isUsableSignalName(name), `«${name}» não é utilizável (fica como documentação)`)

// ---- Mapa nome → endereço ----------------------------------------------------
const tags: LadderTag[] = [
  tag('a', 'I0.1', 'Sensor_A'), tag('b', 'I0.2', 'Sensor_B'), tag('c', 'Q0.0', 'Motor'), tag('d', 'I0.3', 'Partida geral'),
  tag('e', 'M0.0', 'Dup'), tag('f', 'M0.1', 'dup'), tag('g', 'M0.2', 'Contagem', 'Int'), tag('h', 'I0.4', 'I0.4'),
]
const aliases = signalAliasMap(tags)
check(aliases.get('SENSOR_A') === 'I0.1' && aliases.get('MOTOR') === 'Q0.0', 'o mapa liga o nome ao endereço canónico')
check(!aliases.has('PARTIDA GERAL') && !aliases.has('CONTAGEM') && !aliases.has('I0.4'), 'sem nomes inutilizáveis, não booleanos ou iguais ao endereço')
check(!aliases.has('DUP'), 'um nome repetido é ambíguo e não vira alias (maiúsculas/minúsculas incluídas)')

// ---- O que o seletor insere --------------------------------------------------
const signals = grafcetSignals(tags)
const reference = (address: string) => signalReference(signals.find((signal) => signal.address === address)!, aliases)
check(reference('I0.1') === 'Sensor_A', 'escolher a variável insere o nome, não I0.1')
check(reference('I0.3') === 'I0.3', 'nome com espaços usa o endereço')
check(reference('M0.0') === 'M0.0' && reference('M0.1') === 'M0.1', 'nome repetido usa o endereço')
check(reference('I0.4') === 'I0.4', 'nome igual ao endereço insere o endereço')

// ---- Nomes → endereços numa expressão ----------------------------------------
check(resolveSignalNames('Sensor_A * /Sensor_B', aliases) === 'I0.1 * /I0.2', 'resolve nomes mantendo operadores')
check(resolveSignalNames('sensor_a + T(5s) + X5 + G1 <=> X11 + 2HZ + MW1 >= 5', aliases) === 'I0.1 + T(5s) + X5 + G1 <=> X11 + 2HZ + MW1 >= 5', 'não toca em tempos, etapas, frequências nem comparações')
check(resolveSignalNames('Sensor_A+ + Motor', aliases) === 'Sensor_A+ + Q0.0', 'um nome com «+» colado é outro nome e não é trocado')
check(resolveSignalNames('Outro * Sensor_AB', aliases) === 'Outro * Sensor_AB', 'só troca palavras inteiras')
assert.deepEqual(signalAddressesInCondition('Sensor_A * Motor + I0.2', aliases), ['I0.1', 'Q0.0', 'I0.2'])
check(true, 'endereços de uma condição incluem os referidos pelo nome')

// ---- Motor: a condição com o nome comporta-se como a do endereço --------------
useSimStore.getState().newProject('grafcet')
useSimStore.getState().setTags(tags)
check(evalCondition('Sensor_A', { 'I0.1': true }) && !evalCondition('Sensor_A', { 'I0.1': false }), 'o motor lê o nome pelo estado do endereço')
check(evalCondition('sensor_a * /Sensor_B', { 'I0.1': true, 'I0.2': false }), 'maiúsculas/minúsculas, AND e NOT com nomes')
check(evalCondition('Sensor_A + Sensor_B', { 'I0.2': true }) && !evalCondition('Sensor_A + Sensor_B', {}), 'OR com nomes; endereço ausente = falso')
check(evalCondition('Sensor_A', { SENSOR_A: true, 'I0.1': false }), 'compatível: uma variável simbólica ligada pelo nome continua a valer')
check(evalCondition('Partida geral', { 'I0.3': true }) === false, 'nome inutilizável continua inválido (não adivinha)')
const previous = { ...emptyGrafcetRuntime(), prev: { 'I0.1': false } }
check(evalCondition('^Sensor_A', { 'I0.1': true }, { prev: previous.prev }), 'flanco ascendente com nome usa o valor anterior do endereço')

const program: GrafcetProgram = {
  steps: [
    { id: 's0', name: '0', initial: true, action: '', condition: '', actions: [] },
    { id: 's1', name: '1', initial: false, action: '', condition: '', actions: [] },
  ],
  transitions: [{ id: 't0', from: ['s0'], to: ['s1'], condition: 'Sensor_A * /Sensor_B' }],
}
let runtime = scanGrafcet(program, emptyGrafcetRuntime(), { 'I0.1': false, 'I0.2': false }, 100)
check(runtime.active.includes('s0') && !runtime.active.includes('s1'), 'sem o sensor, a transição não dispara')
runtime = scanGrafcet(program, runtime, { 'I0.1': true, 'I0.2': false }, 100)
check(runtime.active.includes('s1'), 'com Sensor_A ligado (I0.1), a transição dispara')
const blocked = scanGrafcet(program, scanGrafcet(program, emptyGrafcetRuntime(), {}, 100), { 'I0.1': true, 'I0.2': true }, 100)
check(blocked.active.includes('s0'), '/Sensor_B com I0.2 ligado bloqueia a transição')

// ---- Painel de simulação: o nome é a entrada real, não uma variável à parte ---
const detection = detectGrafcetIo(program, (id) => id, aliases)
const input = detection.inputs.find((item) => item.address === 'I0.1')
check(input && !input.symbol, 'Sensor_A aparece como a entrada I0.1')
check(!detection.inputs.some((item) => item.symbol), 'não sobra variável simbólica duplicada')
check(detection.maxInput === 0, 'endereços com ponto não alteram o nº de entradas virtuais')
check(detectGrafcetIo(program, (id) => id).inputs.every((item) => item.symbol), 'sem a tabela, os nomes continuam variáveis simbólicas (comportamento anterior)')

// ---- Uso dos sinais na aba Sinais ---------------------------------------------
const usage = signalUsage(program, aliases)
check(usage.get('I0.1')?.transitions === 1 && usage.get('I0.2')?.transitions === 1, 'o uso conta as transições que referem o sinal pelo nome')

// ---- Conversão para Ladder (método dos bits) -----------------------------------
const resolved = resolveProgramSignalNames(program, aliases)
check(resolved.transitions?.[0].condition === 'I0.1 * /I0.2', 'a conversão recebe a condição com endereços')
const ladder = grafcetToLadder(resolved)
const contacts = ladder.rungs.flatMap((rung) => rung.branches.flatMap((branch) => branch.elements)).map((element) => (element as { address?: string }).address)
check(contacts.includes('I0.1') && contacts.includes('I0.2') && !contacts.includes('Sensor_A'), 'o Ladder gerado contacta I0.1 e I0.2, não o nome')
check(resolveProgramSignalNames(program, new Map()) === program, 'sem tabela o programa não é copiado nem alterado')

console.log(`\n${checks} verificações de nomes de variáveis passaram.`)
