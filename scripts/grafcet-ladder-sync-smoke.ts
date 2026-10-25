import assert from 'node:assert/strict'
import { useSimStore } from '../src/store/useSimStore'
import { applyLadderFromGrafcet, hasGeneratedLadder, ladderSyncStatus } from '../src/grafcet/ladderSync'
import type { GrafcetProgram } from '../src/grafcet/engine'

const check = (condition: unknown, message: string) => { assert.ok(condition, message); console.log(`PASS — ${message}`) }
const state = () => useSimStore.getState()
const step = (id: string, name: string, initial = false, q?: string) => ({ id, name, initial, stepType: initial ? 'initial' as const : 'simple' as const, action: '', condition: '1', actions: q ? [{ id: `a-${id}`, address: q, condition: '1' }] : [] })
const base = (): GrafcetProgram => ({
  steps: [step('s0', '0', true), step('s1', '1', false, 'Q1')],
  transitions: [{ id: 't1', from: ['s0'], to: ['s1'], condition: 'I1' }, { id: 't2', from: ['s1'], to: ['s0'], condition: 'I2' }],
})

state().newProject('grafcet')
state().setGrafcet(base())
check(ladderSyncStatus(state().grafcet) === 'none' && !hasGeneratedLadder(), 'sem Ladder gerado o estado é «none» (botão Gerar)')

applyLadderFromGrafcet(state().grafcet)
check(hasGeneratedLadder() && ladderSyncStatus(state().grafcet) === 'synced', 'depois de gerar o estado é «synced» (botão passa a Atualizar)')
const bitsBefore = state().tags.filter((t) => /^Etapa_/.test(t.name)).map((t) => `${t.name}=${t.address}`).sort()

// Networks do utilizador não são tocadas.
const own = state().addRung()
state().renameRung(own, 'Minha network')
check(ladderSyncStatus(state().grafcet) === 'synced', 'networks do utilizador não desincronizam')

// Alterar o GRAFCET → stale; atualizar → synced.
const grown = base()
grown.steps.push(step('s2', '2', false, 'Q2'))
grown.transitions = [{ id: 't1', from: ['s0'], to: ['s1'], condition: 'I1' }, { id: 't3', from: ['s1'], to: ['s2'], condition: 'I3' }, { id: 't2', from: ['s2'], to: ['s0'], condition: 'I2' }]
state().setGrafcet(grown)
check(ladderSyncStatus(state().grafcet) === 'stale', 'alterar o GRAFCET marca o Ladder como desatualizado')
applyLadderFromGrafcet(state().grafcet)
check(ladderSyncStatus(state().grafcet) === 'synced', 'atualizar volta a sincronizar')
check(state().ladder.rungs.some((r) => r.name === 'Minha network'), 'a network do utilizador mantém-se após atualizar')
check(state().ladder.rungs.filter((r) => r.name.startsWith('GRAFCET ·')).length > 0 && new Set(state().ladder.rungs.map((r) => r.id)).size === state().ladder.rungs.length, 'sem networks duplicadas')
const bitsAfter = state().tags.filter((t) => /^Etapa_/.test(t.name)).map((t) => `${t.name}=${t.address}`)
check(bitsBefore.every((b) => bitsAfter.includes(b)), 'bits das etapas existentes mantêm o endereço')

// Remover uma etapa → tags geradas órfãs desaparecem.
state().setGrafcet(base())
applyLadderFromGrafcet(state().grafcet)
check(!state().tags.some((t) => t.name === 'Etapa_2'), 'tags geradas de etapas removidas são retiradas')
check(ladderSyncStatus(state().grafcet) === 'synced', 'sincronizado depois de remover etapas')

// Erros no GRAFCET bloqueiam.
state().setGrafcet({ ...base(), transitions: [{ id: 't1', from: ['s0'], to: ['s1'], condition: '((' }] })
check(ladderSyncStatus(state().grafcet) === 'blocked', 'erros no GRAFCET bloqueiam a atualização')

// Nome, comparações e Complete restart.
import { evalCondition, validCondition } from '../src/grafcet/engine'
const named: GrafcetProgram = { ...base(), name: 'Enchimento', transitions: [{ id: 't1', from: ['s0'], to: ['s1'], condition: 'I1 * MW1>=5' }, { id: 't2', from: ['s1'], to: ['s0'], condition: '!(C1==3) + I2' }] }
state().setGrafcet(named)
check(validCondition('I1 * MW1>=5') && validCondition('T1 > 2000') && !validCondition('MW1>>5'), 'condições com comparações são válidas (operador inválido não)')
state().newProject('grafcet')
state().setGrafcet(named)
applyLadderFromGrafcet(state().grafcet)
const allRungs = [...state().ladder.rungs, ...(state().projectFiles[state().activePlcId ?? '_general'] ?? []).flatMap((f) => f.rungs ?? [])] // Main + FCs gerados
const cmpContacts = allRungs.flatMap((r) => r.branches.flatMap((b) => b.elements)).filter((c) => c.contactType === 'CMP')
check(cmpContacts.some((c) => c.address === 'MW1' && c.compareOp === '>=' && c.compareValue === '5'), 'MW1>=5 vira contacto CMP no Ladder')
check(cmpContacts.some((c) => c.address === 'C1' && c.compareOp === '<>' && c.compareValue === '3'), '!(C1==3) vira CMP com operador invertido (<>)')
const restart = (state().projectFiles[state().activePlcId ?? '_general'] ?? []).find((f) => f.exec === 'obStartup')
check(!!restart && restart.rungs!.some((r) => r.move?.target === 'MW1' && r.move.source === '0'), 'Complete restart inicia MW1 com MOVE 0')
check(restart!.rungs!.some((r) => /^Complete restart · Etapa/.test(r.name) && (r.comment ?? '').startsWith('Enchimento:')), 'networks do Complete restart levam o nome do GRAFCET')
check(!state().ladder.rungs.some((r) => r.name === 'GRAFCET · Inicialização'), 'a inicialização não fica na Main (só no Complete restart)')
check(ladderSyncStatus(state().grafcet) === 'synced', 'sincronizado com nome e comparações')
state().setGrafcet({ ...named, name: 'Outro nome' })
check(ladderSyncStatus(state().grafcet) === 'stale', 'mudar o nome desatualiza os comentários do Ladder')

// Editor Ladder num projeto só GRAFCET: aparece assim que existe Ladder gerado.
import { allowedViews, coerceView, defaultView } from '../src/project/kind'
check(state().projectKind === 'grafcet' && hasGeneratedLadder(), 'contexto: projeto GRAFCET com Ladder gerado')
check(!allowedViews('grafcet').includes('ladder'), 'projeto só GRAFCET não tem editor Ladder por defeito')
check(allowedViews('grafcet', true).includes('ladder') && allowedViews('grafcet', true)[0] === 'grafcet', 'com Ladder gerado o projeto GRAFCET ganha o editor Ladder (e o GRAFCET continua vista principal)')
check(coerceView('ladder', 'grafcet', true) === 'ladder' && coerceView('ladder', 'grafcet') === 'grafcet', 'a vista Ladder só é aceite quando existe Ladder gerado')
check(defaultView('grafcet') === 'grafcet' && defaultView('ladder') === 'ladder', 'vistas iniciais de cada tipo de projeto mantêm-se')
check(allowedViews(state().projectKind, hasGeneratedLadder()).includes('ladder'), 'depois de gerar, o projeto passa a oferecer o editor Ladder')
check(!allowedViews('grafcet', true).includes('schematic') && !allowedViews('grafcet', true).includes('monitor'), 'o Ladder gerado não arrasta esquema elétrico nem monitor')
console.log('OK')
