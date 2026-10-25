import assert from 'node:assert/strict'
import { useSimStore } from '../src/store/useSimStore'
import { applyLadderFromGrafcet, hasGeneratedLadder, ladderSyncStatus } from '../src/grafcet/ladderSync'
import { wordMethodBlocker } from '../src/grafcet/toLadderWord'
import type { GrafcetProgram } from '../src/grafcet/engine'
import { runScan } from '../src/ladder/ladderEngine'
import type { DbTable } from '../src/ladder/dataBlocks'
import { autoExecRungs, callableBlocks } from '../src/ladder/projectFiles'

const check = (condition: unknown, message: string) => { assert.ok(condition, message); console.log(`PASS — ${message}`) }
const state = () => useSimStore.getState()
const files = () => state().projectFiles[state().activePlcId ?? '_general'] ?? []
const step = (id: string, name: string, initial: boolean, out?: string) => ({ id, name, initial, stepType: initial ? 'initial' as const : 'simple' as const, action: '', condition: '1', actions: out ? [{ id: `a-${id}`, address: out, condition: '1' }] : [] })

// O exemplo do utilizador: GRAFCET «teste».
const teste: GrafcetProgram = {
  name: 'teste',
  steps: [step('s1', '1', true, 'L_Verde'), step('s5', '5', false, 'L_Amarelo')],
  transitions: [{ id: 't1', from: ['s1'], to: ['s5'], condition: 'Start * Stop_NC' }, { id: 't2', from: ['s5'], to: ['s1'], condition: '/Stop_NC' }],
}
state().newProject('grafcet')
state().setGrafcet(teste)
check(wordMethodBlocker(teste) === null, 'sequência simples usa o método do registo de etapa')
applyLadderFromGrafcet(state().grafcet)
check(ladderSyncStatus(state().grafcet) === 'synced' && hasGeneratedLadder(), 'depois de gerar fica sincronizado')

const tag = (name: string) => state().tags.find((t) => t.name === name)
check(tag('Start')?.address === 'I0.0' && tag('Stop')?.address === 'I0.1', 'Start → I0.0 e Stop → I0.1 (Stop_NC é o mesmo sinal que Stop)')
check(tag('L_Verde')?.address === 'Q0.0' && tag('L_Amarelo')?.address === 'Q0.1', 'L_Verde → Q0.0 e L_Amarelo → Q0.1')
check(tag('G0')?.address === 'MW0' && tag('G0')?.dataType === 'Int', 'G0 → MW0 (Int)')
check(!state().tags.some((t) => /^Etapa_|^Rec_T/.test(t.name)), 'sem bits de etapa/receptividade do método antigo')

const grafcetFc = files().find((f) => /^Grafcet \[FC \d+\]$/.test(f.name))
const outputsFc = files().find((f) => /^Outputs \[FC \d+\]$/.test(f.name))
check(!!grafcetFc && grafcetFc.rungs!.length === 2 && grafcetFc.rungs!.every((r) => r.move), 'FC Grafcet: uma network com MOVE por transição')
check(grafcetFc!.rungs![0].move!.source === '5' && grafcetFc!.rungs![0].move!.target === 'MW0' && grafcetFc!.rungs![1].move!.source === '1', 'T1 faz MOVE 5 → MW0; T2 faz MOVE 1 → MW0')
const t1 = grafcetFc!.rungs![0].branches[0].elements
check(t1[0].contactType === 'CMP' && t1[0].address === 'MW0' && t1[0].compareOp === '==' && t1[0].compareValue === '1' && t1[1].address === 'I0.0' && t1[1].contactType === 'NO' && t1[2].address === 'I0.1' && t1[2].contactType === 'NO', 'T1: MW0==1, Start (NO), Stop (NO)')
const t2 = grafcetFc!.rungs![1].branches[0].elements
check(t2[0].compareValue === '5' && t2[1].address === 'I0.1' && t2[1].contactType === 'NC', 'T2: MW0==5, Stop (NC)')
check(!!outputsFc && outputsFc.rungs!.length === 2 && outputsFc.rungs![0].coils[0].address === 'Q0.0' && outputsFc.rungs![0].branches[0].elements[0].compareValue === '1' && outputsFc.rungs![1].coils[0].address === 'Q0.1' && outputsFc.rungs![1].branches[0].elements[0].compareValue === '5', 'FC Outputs: MW0==1 → L_Verde; MW0==5 → L_Amarelo')
const main = state().ladder.rungs.filter((r) => r.call)
check(main.length === 2 && main[0].call!.targetId === grafcetFc!.id && main[1].call!.targetId === outputsFc!.id, 'Main [OB1] chama Grafcet e Outputs')
const restart = files().find((f) => f.exec === 'obStartup')
check(!!restart && restart.rungs!.some((r) => r.move?.source === '1' && r.move.target === 'MW0'), 'RESTART COMPLETO [OB 100]: MOVE 1 → MW0 (etapa inicial)')
check(!state().ladder.rungs.some((r) => r.call?.targetId === restart!.id), 'o OB100 não é chamado do Main (corre uma vez no arranque)')

// Simulação de scans.
const table: Record<string, boolean> = {}
const db: DbTable = {}
const edges: Record<string, boolean> = {}
const mw0 = () => db['MW0']?.value
const run = (inputs: Record<string, boolean>) => {
  Object.assign(table, inputs)
  runScan({ rungs: state().ladder.rungs }, table, {}, {}, 10, callableBlocks(files()), [], db, edges)
}
const startup = autoExecRungs(files(), 'obStartup')
runScan({ rungs: startup }, table, {}, {}, 10, {}, [], db, edges)
run({ 'I0.0': false, 'I0.1': true })
check(mw0() === 1 && table['Q0.0'] === true && !table['Q0.1'], 'arranque: etapa 1, L_Verde ligada')
run({ 'I0.0': true, 'I0.1': true })
check(mw0() === 5 && table['Q0.1'] === true, 'Start com Stop (NC) ligado → etapa 5, L_Amarelo ligada')
run({ 'I0.0': false, 'I0.1': true })
check(mw0() === 5, 'a etapa 5 mantém-se sem alterações')
run({ 'I0.0': false, 'I0.1': false })
check(mw0() === 1 && table['Q0.0'] === true && !table['Q0.1'], 'Stop premido → volta à etapa 1, L_Verde ligada')

// Atualizar: sem duplicar FCs; alterar → stale → synced.
applyLadderFromGrafcet(state().grafcet)
check(files().filter((f) => /\[FC \d+\]$/.test(f.name)).length === 2 && ladderSyncStatus(state().grafcet) === 'synced', 'regenerar não duplica FCs')
state().setGrafcet({ ...teste, transitions: [{ ...teste.transitions![0], condition: 'Start' }, teste.transitions![1]] })
check(ladderSyncStatus(state().grafcet) === 'stale', 'alterar uma receptividade marca como desatualizado')
applyLadderFromGrafcet(state().grafcet)
check(ladderSyncStatus(state().grafcet) === 'synced' && state().tags.filter((t) => t.name === 'Start').length === 1, 'atualizar sincroniza sem duplicar tags')

// Fallback: etapas em paralelo continuam a usar o método dos bits.
const parallel: GrafcetProgram = { name: 'par', steps: [step('a', '0', true), step('b', '1', false, 'Q0.0'), step('c', '2', false, 'Q0.1')], transitions: [{ id: 't', from: ['a'], to: ['b', 'c'], condition: 'Start' }, { id: 'u', from: ['b', 'c'], to: ['a'], condition: 'Stop' }] }
check(wordMethodBlocker(parallel) !== null, 'etapas em paralelo não usam o registo de etapa')
state().setGrafcet(parallel)
applyLadderFromGrafcet(state().grafcet)
check(!files().some((f) => /^(Grafcet|Outputs) \[FC/.test(f.name)) && !state().tags.some((t) => t.name === 'G0') && ladderSyncStatus(state().grafcet) === 'synced', 'em paralelo: FCs e G0 removidos, método dos bits aplicado')
console.log('OK')
