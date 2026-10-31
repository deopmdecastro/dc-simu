import assert from 'node:assert/strict'
import { buildNativePartidaDireta } from '../src/project/nativeProjects'
import { computeContinuity, sourceTerminalIds } from '../src/electrical/engine'
import { createComponent } from '../src/electrical/factory'
import type { ElectricalComponent, Wire } from '../src/types'

/**
 * Disjuntor tripolar desligado corta TUDO o que está a jusante.
 * Antes, as entradas dos disjuntores a jusante (disjuntor-motor QM1, disjuntor do comando Q0) contavam
 * como «a rede»: com o QG desligado o motor, a fonte 24 V e o PLC continuavam alimentados — e a corrente
 * chegava até à própria saída do QG pelos cabos, em sentido contrário.
 */
let checks = 0
const ok = (cond: unknown, message: string) => { assert.ok(cond, message); checks += 1; console.log('PASS — ' + message) }

const native = buildNativePartidaDireta()
const comps = native.components
const wires = native.wires
const by = (ref: string) => comps.find((c) => c.ref === ref)!
const term = (c: ElectricalComponent, label: string) => c.terminals.find((t) => t.label === label)!.id
const live = () => computeContinuity(comps, wires, sourceTerminalIds(comps, undefined, wires)).energizedTerminals
const downstream = (L: Set<string>) => ['QG:2', 'QG:4', 'QG:6', 'QM1:1', 'QM1:2', 'QM1:6', 'Q0:1', 'Q0:2']
  .map((key) => { const [ref, label] = key.split(':'); return L.has(term(by(ref), label)) })

by('QG').state.closed = true
ok(downstream(live()).every(Boolean), 'QG ligado: QG, QM1 e Q0 com tensão a jusante')
by('QG').state.closed = false
ok(downstream(live()).every((value) => !value), 'QG desligado: nada passa — nem QM1, nem Q0, nem a própria saída do QG')
ok(!live().has(term(by('KM1'), '1L1')), 'QG desligado: o contactor KM1 fica sem tensão nos polos')
by('QG').state.closed = true
by('QG').state.tripped = true
ok(downstream(live()).every((value) => !value), 'QG disparado: corta como desligado')
by('QG').state.tripped = false
ok(live().has(term(by('QG'), '1')), 'a entrada do QG continua com tensão (vem da alimentação XG)')
const xg = by('XG')
xg.state.on = false
ok(!live().has(term(by('QG'), '1')) && !live().has(term(by('QM1'), '2')), 'alimentação XG desligada: o QG deixa de ter tensão (a entrada dele não é uma segunda rede)')
xg.state.on = true

// Disjuntor sem nada a montante (ou só com bornes passivos): continua a ser a entrada da rede, como antes.
const head = createComponent('breaker3p', 'QA')
const load = createComponent('breaker3p', 'QB')
const link: Wire[] = [{ id: 'w1', fromTerminalId: term(head, '2'), toTerminalId: term(load, '1') } as Wire]
const lone = computeContinuity([head, load], link, sourceTerminalIds([head, load], undefined, link)).energizedTerminals
ok(lone.has(term(head, '1')) && lone.has(term(load, '2')), 'disjuntor de cabeça (sem montante) continua a ser a rede')
head.state.closed = false
const cut = computeContinuity([head, load], link, sourceTerminalIds([head, load], undefined, link)).energizedTerminals
ok(!cut.has(term(load, '1')) && !cut.has(term(load, '2')), 'desligar o disjuntor de cabeça corta o disjuntor a jusante')
const old = computeContinuity([head, load], link, sourceTerminalIds([head, load])).energizedTerminals
ok(old.has(term(load, '2')), 'sem cabos (modo antigo) o comportamento anterior mantém-se para quem não passa os cabos')

console.log(`${checks} verificações de corte do disjuntor passaram.`)
