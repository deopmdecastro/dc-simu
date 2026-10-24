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
console.log('OK')
