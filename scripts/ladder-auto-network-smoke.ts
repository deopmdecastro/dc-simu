import assert from 'node:assert/strict'
import { rungHasContent, withEmptyNetworkBelow } from '../src/ladder/autoNetwork'
import { useSimStore } from '../src/store/useSimStore'
import type { LadderRung } from '../src/types'

// LADDER-AUTO-NET-01: colocar um elemento numa network vazia cria uma network vazia em baixo.
let passed = 0
const check = (value: unknown, message: string) => { assert.ok(value, message); passed++ }
const empty = (id: string): LadderRung => ({ id, name: '', enabled: true, branches: [{ id: id + 'b', elements: [] }], coils: [] })
const withContact = (rung: LadderRung): LadderRung => ({ ...rung, branches: [{ ...rung.branches[0], elements: [{ id: rung.id + 'c', address: 'I0.0', contactType: 'NO' }] }] })
let n = 0
const make = () => empty('auto' + (++n))

// helper puro
check(!rungHasContent(empty('a')), 'network vazia não tem conteúdo')
check(rungHasContent(withContact(empty('a'))), 'contacto conta como conteúdo')
check(rungHasContent({ ...empty('a'), coils: [{ id: 'q', address: 'Q0.0', coilType: 'COIL' }] }), 'bobina conta como conteúdo')
check(rungHasContent({ ...empty('a'), call: { targetId: 'f' } }), 'CALL conta como conteúdo')
check(!rungHasContent({ ...empty('a'), label: 'L1', comment: 'x' }), 'etiqueta/comentário sozinhos não contam')

let prev = [empty('a')]
let next = withEmptyNetworkBelow(prev, [withContact(prev[0])], make)
check(next.length === 2 && next[1].id === 'auto1' && !rungHasContent(next[1]), 'última network preenchida → nova network vazia em baixo')
check(withEmptyNetworkBelow(next, next.map((r, i) => (i === 0 ? { ...r, coils: [{ id: 'q', address: 'Q0.0', coilType: 'COIL' }] } : r)), make).length === 2, 'acrescentar a uma network já preenchida não cria outra')
prev = [empty('a'), empty('b')]
check(withEmptyNetworkBelow(prev, [withContact(prev[0]), prev[1]], make).length === 2, 'já existe network vazia logo abaixo → não duplica')
prev = [empty('a'), withContact(empty('b'))]
next = withEmptyNetworkBelow(prev, [withContact(prev[0]), prev[1]], make)
check(next.length === 3 && next[1].id.startsWith('auto') && next[2].id === 'b', 'network do meio preenchida → vazia inserida logo abaixo (antes da seguinte)')
check(withEmptyNetworkBelow([], [withContact(empty('z'))], make).length === 1, 'network nova que já nasce preenchida (duplicar/colar) não cria vazia')
prev = [empty('a'), empty('b')]
check(withEmptyNetworkBelow(prev, [prev[0]], make).length === 1, 'eliminar networks não cria nada')

// store (Main): updateRung com histórico
const store = useSimStore
const firstId = store.getState().addRung()
check(store.getState().ladder.rungs.length === 1, 'Main com uma network vazia')
store.getState().updateRung(firstId, (r) => withContact(r), 'force')
let rungs = store.getState().ladder.rungs
check(rungs.length === 2 && !rungHasContent(rungs[1]) && rungs[1].name === 'Rung 2', `Main: elemento na network vazia → «${rungs[1]?.name}» vazia em baixo`)
store.getState().updateRung(firstId, (r) => ({ ...r, coils: [{ id: 'q', address: 'Q0.0', coilType: 'COIL' }] }), 'force')
check(store.getState().ladder.rungs.length === 2, 'Main: mais elementos na mesma network não criam outra')
store.getState().updateRung(store.getState().ladder.rungs[1].id, (r) => withContact(r), 'force')
check(store.getState().ladder.rungs.length === 3, 'Main: preencher a network vazia cria a seguinte')
store.getState().undo()
rungs = store.getState().ladder.rungs
check(rungs.length === 2 && !rungHasContent(rungs[1]), 'Desfazer remove o elemento e a network automática de uma só vez')

console.log(`[ladder-auto-network] OK — ${passed} verificações`)
