import assert from 'node:assert/strict'
import { useSimStore } from '../src/store/useSimStore'
import { applyLadderFromGrafcet, generatedLadderMethod, hasGeneratedLadder, ladderMethodOptions, ladderSyncStatus } from '../src/grafcet/ladderSync'
import { grafcetToLadderWord, stepLanes, wordMethodBlocker } from '../src/grafcet/toLadderWord'
import { grafcetToLadder } from '../src/grafcet/toLadder'
import { emptyGrafcetRuntime, scanGrafcet, stepNumberOf, transitionsOf } from '../src/grafcet/engine'
import { grafcetExamples } from '../src/project/grafcetExamples'
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
const moves = grafcetFc!.rungs!.filter((r) => r.move)
check(!!grafcetFc && moves.length === 2, 'FC Grafcet: uma network com MOVE por transição')
const evolvedBit = tag('Evolucao_G0')?.address
check(!!evolvedBit && grafcetFc!.rungs![0].coils.some((c) => c.address === evolvedBit && c.coilType === 'RESET') && moves.every((r) => r.coils.some((c) => c.address === evolvedBit && c.coilType === 'SET') && r.branches.every((b) => b.elements.some((e) => e.address === evolvedBit && e.contactType === 'NC'))), 'uma evolução por ciclo: bit reposto no início do FC e exigido/armado em cada transição')
check(moves[0].move!.source === '5' && moves[0].move!.target === 'MW0' && moves[1].move!.source === '1', 'T1 faz MOVE 5 → MW0; T2 faz MOVE 1 → MW0')
const t1 = moves[0].branches[0].elements
check(t1[0].contactType === 'CMP' && t1[0].address === 'MW0' && t1[0].compareOp === '==' && t1[0].compareValue === '1' && t1[1].address === 'I0.0' && t1[1].contactType === 'NO' && t1[2].address === 'I0.1' && t1[2].contactType === 'NO', 'T1: MW0==1, Start (NO), Stop (NO)')
const t2 = moves[1].branches[0].elements
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

// Etapas em paralelo: um registo por sequência (G0, G1); o ramo extra para (−1) na convergência.
const parallel: GrafcetProgram = { name: 'par', steps: [step('a', '0', true), step('b', '1', false, 'Q0.0'), step('c', '2', false, 'Q0.1')], transitions: [{ id: 't', from: ['a'], to: ['b', 'c'], condition: 'Start' }, { id: 'u', from: ['b', 'c'], to: ['a'], condition: 'Stop' }] }
check(wordMethodBlocker(parallel) === null, 'etapas em paralelo também usam o registo de etapa (um registo por sequência)')
state().setGrafcet(parallel)
applyLadderFromGrafcet(state().grafcet)
check(files().some((f) => /^Grafcet \[FC/.test(f.name)) && state().tags.some((t) => t.name === 'G0') && state().tags.some((t) => t.name === 'G1') && ladderSyncStatus(state().grafcet) === 'synced', 'em paralelo: FC Grafcet com G0 e G1, sincronizado')
{
  const grafcetFile = files().find((f) => /^Grafcet \[FC/.test(f.name))!
  const g1 = state().tags.find((t) => t.name === 'G1')!.address
  check(grafcetFile.rungs!.some((r) => r.move?.target === g1 && r.move.source === '-1'), 'a convergência E para a sequência G1 (MOVE −1)')
  const tbl: Record<string, boolean> = {}
  const pdb: DbTable = {}
  const pedges: Record<string, boolean> = {}
  runScan({ rungs: autoExecRungs(files(), 'obStartup') }, tbl, {}, {}, 10, {}, [], pdb, pedges)
  const scanPar = (inputs: Record<string, boolean>) => { Object.assign(tbl, inputs); runScan({ rungs: state().ladder.rungs }, tbl, {}, {}, 10, callableBlocks(files()), [], pdb, pedges) }
  const regs = () => [pdb[state().tags.find((t) => t.name === 'G0')!.address]?.value, pdb[g1]?.value].join(',')
  scanPar({ 'I0.0': false, 'I0.1': false })
  check(regs() === '0,-1', 'arranque: G0 = 0 e G1 parado (−1)')
  scanPar({ 'I0.0': true })
  check(regs() === '1,2' && tbl['Q0.0'] && tbl['Q0.1'], 'Start: as etapas 1 e 2 ficam ativas ao mesmo tempo (Q0.0 e Q0.1)')
  scanPar({ 'I0.0': false, 'I0.1': true })
  check(regs() === '0,-1' && !tbl['Q0.0'] && !tbl['Q0.1'], 'Stop: a convergência volta à etapa 0 e para G1')
}

// Método escolhido pelo utilizador: bits numa sequência que cabe no MOVE; fica até se pedir outro.
state().newProject('grafcet')
state().setGrafcet(teste)
applyLadderFromGrafcet(state().grafcet, 'bit')
check(generatedLadderMethod() === 'bit' && !files().some((f) => /^(Grafcet|Outputs) \[FC/.test(f.name)), 'escolha «bits de etapa» gera SET/RESET mesmo numa sequência simples')
check(ladderSyncStatus(state().grafcet) === 'synced', 'com bits escolhidos o estado fica sincronizado (não volta sozinho ao MOVE)')
applyLadderFromGrafcet(state().grafcet)
check(generatedLadderMethod() === 'bit', 'atualizar sem escolher mantém o método já gerado')
applyLadderFromGrafcet(state().grafcet, 'word')
check(generatedLadderMethod() === 'word' && ladderSyncStatus(state().grafcet) === 'synced' && !state().tags.some((t) => /^Etapa_/.test(t.name)), 'trocar para MOVE substitui os bits pelo registo G0')
const delayed: GrafcetProgram = { ...teste, steps: teste.steps.map((s, i) => i ? { ...s, actions: [{ id: 'd', address: 'Q0.3', condition: '1', kind: 'D' as const, timeMs: 500 }] } : s) }
check(ladderMethodOptions(parallel).word.available === true && ladderMethodOptions(delayed).word.available === false && !!ladderMethodOptions(delayed).word.reason, 'paralelo disponível no MOVE; ações D continuam indisponíveis, com o motivo')

// Exemplos GRAFCET 1 e 2 (temporizações t/Xn e flancos) também cabem no registo de etapa:
// o Ladder MOVE gerado evolui como o GRAFCET — mesma etapa ativa e mesmas saídas — com entradas
// pseudoaleatórias mantidas 1–40 ciclos (dá tempo às temporizações).
const [basicExample, normalExample, advancedExample] = grafcetExamples()
const advancedBits = grafcetToLadder({ ...advancedExample.program, transitions: transitionsOf(advancedExample.program) }, [], { startupBlock: true })
check(advancedBits.warnings.length === 0 && advancedBits.rungs.some((r) => /Relógio 2 Hz/.test(r.name) && r.timer?.timerType === 'TON'), `exemplo avançado: bits de etapa sem avisos, com a intermitência 2HZ num relógio de dois TON${advancedBits.warnings.length ? ' — ' + advancedBits.warnings.join('; ') : ''}`)
for (const example of [basicExample, normalExample, advancedExample]) {
  const program = { ...example.program, transitions: transitionsOf(example.program) }
  check(wordMethodBlocker(program) === null, `${example.level}: cabe no registo de etapa (MOVE)`)
  const ladder = grafcetToLadderWord(program, { tags: example.tags, name: program.name })
  check(ladder.warnings.length === 0, `${example.level}: geração MOVE sem avisos${ladder.warnings.length ? ' — ' + ladder.warnings.join('; ') : ''}`)
  check(ladder.grafcetRungs.some((r) => r.timer?.timerType === 'TON'), `${example.level}: temporização convertida num TON ativado pelo registo`)
  // Saídas intermitentes (1HZ): o relógio do Ladder corre livre (fase própria); verificadas à parte.
  const blinking = new Set(program.steps.flatMap((s) => (s.actions ?? []).filter((a) => /HZ/i.test(a.condition ?? '')).map((a) => a.address)))
  const outputs = [...new Set(program.steps.flatMap((s) => (s.actions ?? []).map((a) => a.address)))].filter((a): a is string => !!a && !blinking.has(a))
  const inputs = [...new Set([...Object.keys(example.restInputs), ...program.transitions.flatMap((t) => t.condition.match(/I\d+\.[0-7]/g) ?? [])])]
  const gTable: Record<string, boolean> = { ...example.restInputs }
  let rt = emptyGrafcetRuntime()
  const lTable: Record<string, boolean> = { ...example.restInputs }
  const lDb: DbTable = {}
  const lEdges: Record<string, boolean> = {}
  const lTimers = {}
  runScan({ rungs: ladder.startupRungs }, lTable, lTimers, {}, 100, {}, [], lDb, lEdges)
  const rungs = [...ladder.grafcetRungs, ...ladder.outputRungs]
  const numberOf = new Map(program.steps.map((s, i) => [s.id, Number(stepNumberOf(s, i))]))
  let seed = 7
  let mismatches = 0
  const visited = new Set<number>()
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  // Três sementes seguidas (o estado continua de uma para a outra): 1200 patamares por exemplo.
  for (const start of [7, 42, 2026]) for (let hold = (seed = start, 0); hold < 400; hold++) {
    for (const input of inputs) if (rand() < 0.35) { const v = !gTable[input]; gTable[input] = v; lTable[input] = v }
    const scans = 1 + Math.floor(rand() * 40)
    for (let k = 0; k < scans; k++) {
      rt = scanGrafcet(program, rt, gTable, 100)
      runScan({ rungs }, lTable, lTimers, {}, 100, {}, [], lDb, lEdges)
    }
    const gStep = rt.active.map((id) => numberOf.get(id)!).sort((a, b) => a - b).join(',')
    const lActive = ladder.words.map((w) => Number(lDb[w]?.value)).filter((v) => v >= 0).sort((a, b) => a - b)
    const lStep = lActive.join(',')
    lActive.forEach((v) => visited.add(v))
    if (gStep !== lStep || outputs.some((q) => !!gTable[q] !== !!lTable[q])) {
      if (mismatches < 3) console.log(`  divergência ${example.level} patamar ${hold}: GRAFCET X${gStep} · Ladder ${ladder.words.length > 1 ? 'G0…G' + (ladder.words.length - 1) : 'G0'}=${lStep} · entradas ${inputs.map((i) => `${i}=${+!!gTable[i]}`).join(' ')}`)
      mismatches++
    }
  }
  check(mismatches === 0, `${example.level}: Ladder MOVE evolui como o GRAFCET em 1200 patamares de entradas (3 sementes) (${mismatches} divergências)`)
  check(visited.size === program.steps.length, `${example.level}: a sequência passou por todas as ${program.steps.length} etapas (${[...visited].sort((a, b) => a - b).join(', ')})`)
  for (const q of blinking) {
    const owner = program.steps.find((s) => (s.actions ?? []).some((a) => a.address === q))!
    const hz = parseFloat((owner.actions ?? []).find((a) => a.address === q)!.condition!)
    const ownerWord = ladder.words[stepLanes(program).laneOf.get(owner.id) ?? 0]
    lDb[ownerWord] = { type: 'INT', value: Number(stepNumberOf(owner, program.steps.indexOf(owner))) }
    // Mantém a etapa (entradas que não a fazem evoluir não interessam aqui): força G0 antes de cada scan.
    let toggles = 0
    let last = !!lTable[q]
    for (let k = 0; k < 100; k++) {
      lDb[ownerWord].value = Number(stepNumberOf(owner, program.steps.indexOf(owner)))
      runScan({ rungs: ladder.outputRungs.concat(ladder.grafcetRungs.filter((r) => r.timer && !r.move)) }, lTable, lTimers, {}, 100, {}, [], lDb, lEdges)
      if (!!lTable[q] !== last) { toggles++; last = !!lTable[q] }
    }
    // 10 s a 1 Hz → ~20 mudanças (o TON demora um scan a repor: período 1,0–1,2 s).
    const expected = 10 * hz * 2
    check(toggles >= expected * 0.8 && toggles <= expected, `${example.level}: ${q} pisca a ${hz} Hz no Ladder (${toggles} mudanças em 10 s)`)
  }
}
console.log('OK')
