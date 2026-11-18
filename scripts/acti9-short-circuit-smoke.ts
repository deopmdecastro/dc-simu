import assert from 'node:assert/strict'
import { buildCombBusbar, combSequenceOf, combBusbarDimsOf, combCatalogCodeOf } from '../src/three/combBusbarParts'
import { evaluateShortCircuits } from '../src/electrical/shortCircuitEngine'
import type { ElectricalComponent, Wire } from '../src/types'

console.log('— Teste Schneider Acti9 Comb Busbar (A9XPC712) & Curto-Circuito —')

// 1. Barramento tipo pente Schneider Acti9 1P+N (3P balanceado)
const seq = combSequenceOf('1P+N-3P', 'left')
assert.deepEqual(
  seq,
  ['N', 'L1', 'N', 'L2', 'N', 'L3'],
  'Alternância equilibrada N L1 N L2 N L3...',
)
const dims = combBusbarDimsOf({ mode: '1P+N-3P', poleCount: 12, neutralSide: 'left' })
assert.equal(dims.teeth.length, 12, '12 dentes')
assert.deepEqual(
  dims.teeth.slice(0, 6).map((t) => t.label),
  ['N.1', 'L1.1', 'N.2', 'L2.1', 'N.3', 'L3.1'],
  'Sequência de etiquetas N.1, L1.1, N.2, L2.1...',
)
console.log('PASS — Sequência de pinos N-L1-N-L2-N-L3 para Acti9 1P+N-3P')

// Resolução de catálogo Schneider A9XPC712
const code = combCatalogCodeOf('schneider', '1P+N-3P', 12, 80)
assert.equal(code, 'A9XPC712', 'A9XPC712 para 12 módulos')
console.log('PASS — Catálogo Schneider Acti9 A9XPC712 resolvido para 12 módulos')

// Geometria 3D com capas amarelas e tampas de dentes ativas
import * as THREE from 'three'

const dummyMat = new THREE.MeshBasicMaterial()
const busbar = buildCombBusbar(
  {
    mode: '1P+N-3P',
    poleCount: 12,
    pitchMm: 18,
    ratedA: 80,
    neutralSide: 'left',
    hasEndCaps: true,
    brandStyle: 'schneider',
    endCapColor: 'yellow',
    toothCovers: [2, 3], // dentes 2 e 3 protegidos
  },
  0.01,
  {
    pvcOuter: dummyMat,
    pvcBarrier: dummyMat,
    copper: dummyMat,
    silkscreen: dummyMat,
    tinned: dummyMat,
    cage: dummyMat,
    dark: dummyMat,
    yellowCap: dummyMat,
  },
)
assert.ok(busbar.root, 'Grupo raiz 3D gerado')
assert.equal(busbar.dims.bars, 4, '4 condutores equilibrados para 1P+N-3P (N, L1, L2, L3)')
assert.equal(busbar.dims.teeth.length, 12, '12 dentes gerados')
console.log('PASS — Geometria 3D construída com 4 condutores e capas amarelas')

// 2. Curto-Circuito: Disjuntor protege e desarma magneticamente
const breaker: ElectricalComponent = {
  id: 'cb1',
  type: 'breaker1p',
  ref: 'Q1',
  category: 'protection',
  schematicX: 100,
  schematicY: 100,
  w: 18,
  h: 80,
  terminals: [
    { id: 't_cb_in', label: '1', schematicPosition: { x: 9, y: 0 } },
    { id: 't_cb_out', label: '2', schematicPosition: { x: 9, y: 80 } },
  ],
  state: { closed: true, tripped: false },
}

const source: ElectricalComponent = {
  id: 'src1',
  type: 'powerSource1ph',
  ref: 'G1',
  category: 'source',
  schematicX: 0,
  schematicY: 0,
  w: 40,
  h: 60,
  terminals: [
    { id: 't_src_l', label: 'L', schematicPosition: { x: 10, y: 60 } },
    { id: 't_src_n', label: 'N', schematicPosition: { x: 30, y: 60 } },
    { id: 't_src_pe', label: 'PE', schematicPosition: { x: 20, y: 60 } },
  ],
  state: { on: true },
}

// Fio da fonte para o disjuntor
const wire1: Wire = {
  id: 'w1',
  fromTerminalId: 't_src_l',
  toTerminalId: 't_cb_in',
  color: 'brown',
  gauge: '2.5mm²',
  kind: 'rigid',
  flexibility: 'rigid',
  route: 'orthogonal',
  bend: 0.5,
  energized: true,
  carryingCurrent: true,
}

// Fio em curto: saída do disjuntor ligada diretamente ao Neutro da fonte!
const wireShort: Wire = {
  id: 'w_short',
  fromTerminalId: 't_cb_out',
  toTerminalId: 't_src_n',
  color: 'blue',
  gauge: '2.5mm²',
  kind: 'rigid',
  flexibility: 'rigid',
  route: 'orthogonal',
  bend: 0.5,
  energized: true,
  carryingCurrent: true,
}

const energized = new Set(['t_src_l', 't_cb_in', 't_cb_out', 't_src_n'])
const diag = evaluateShortCircuits([source, breaker], [wire1, wireShort], energized)

assert.equal(diag.active, true, 'Curto-circuito detetado')
assert.ok(diag.wires.has('w_short'), 'Cabo de curto identificado')
assert.equal(diag.trippableBreakers.length, 1, 'Disjuntor identificado para disparo magnético')
assert.equal(diag.trippableBreakers[0].id, 'cb1', 'Disjuntor cb1 no circuito em falta')
console.log('PASS — Curto direto Fase-Neutro detectado com disjuntor trippável')

// 3. Curto com disjuntor bloqueado (locked: true) -> Sobreaquecimento e Queima
breaker.locked = true
const diagLocked = evaluateShortCircuits([source, breaker], [wire1, wireShort], energized)
assert.equal(diagLocked.active, true, 'Curto continua ativo')
console.log('PASS — Curto persiste com disjuntor bloqueado')

console.log('\n✅ TODOS OS TESTES DE CURTO-CIRCUITO E SCHNEIDER ACTI9 PASSARAM COM SUCESSO!\n')
