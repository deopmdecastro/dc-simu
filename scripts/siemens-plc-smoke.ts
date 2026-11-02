import assert from 'node:assert/strict'
import { createComponent } from '../src/electrical/factory'
import { logoElectricalInputs } from '../src/electrical/logoPower'
import { getComponentModelSpec } from '../src/three/modelPaths'
import { plcLamps } from '../src/three/plcStatusLights'
import { terminalNormalWorld3D, terminal3DPositionOf } from '../src/three/terminal3D'
import type { ElectricalComponent, Wire } from '../src/types'

/**
 * PLC Siemens S7 (DI 32×24 V, CPU 1511C-1 PN e CPU 315-2 DP): pose de montagem,
 * bornes frontais e lâmpadas.
 *
 * O que se verifica, e porquê:
 *  · pose — os três chegam em referenciais diferentes e já estiveram de perfil no
 *    Painel 3D. A rotação base tem de os deixar de pé, com a frente em +Z;
 *  · bornes — ficam na frente (o cabo sai por +Z) e nas filas medidas no CAD;
 *  · lâmpadas — só acendem com o módulo alimentado (L+/M), e a posição fica dentro
 *    da frente do aparelho.
 *
 * Uso: npx tsx scripts/siemens-plc-smoke.ts
 */
let checks = 0
const pass = (message: string) => { console.log(`PASS — ${message}`); checks++ }

// ------------------------------------------------------------------ pose e medidas
type Type = 'plcSiemensS71500Di32' | 'plcSiemensS71500Cpu1511c' | 'plcSiemensS7300Cpu315'
const SIZE: Record<Type, { rotation: number[]; mm: [number, number, number] }> = {
  plcSiemensS71500Di32: { rotation: [-90, 0, 0], mm: [47, 147, 131.7] },
  plcSiemensS71500Cpu1511c: { rotation: [-90, 0, 0], mm: [85, 147, 131.7] },
  plcSiemensS7300Cpu315: { rotation: [0, 0, 0], mm: [40, 122.1, 125.04] },
}
for (const [type, expected] of Object.entries(SIZE) as Array<[Type, { rotation: number[]; mm: [number, number, number] }]>) {
  const spec = getComponentModelSpec(type)!
  const rotation = spec.rotation.map((r) => Math.round((r * 180) / Math.PI))
  assert.deepEqual(rotation, expected.rotation, `${type}: rotação base ${rotation.join('/')}° — os S7-1500 precisam de Rx(−90) e o S7-300 de 0`)
  const mm = spec.physicalSizeMm!
  assert.deepEqual([mm.width, mm.height, mm.depth], expected.mm, `${type}: medidas ${mm.width}×${mm.height}×${mm.depth} mm (a altura é o comprimento do perfil na calha)`)
  pass(`${type}: de pé com a frente em +Z, ${expected.mm.join(' × ')} mm`)
}

// ------------------------------------------------------------------ bornes
for (const type of Object.keys(SIZE) as Type[]) {
  const c = createComponent(type)
  const fronts = c.terminals.filter((t) => t.face === 'front')
  assert.equal(fronts.length, c.terminals.length, `${type}: todos os bornes saem pela frente`)
  for (const t of c.terminals) {
    const p = terminal3DPositionOf(t)
    assert.ok(p.z > 0.95, `${type}.${t.label}: borne em z ${p.z.toFixed(2)} — devia estar na frente`)
    const [x, y] = [p.x, p.y]
    assert.ok(x > 0.02 && x < 0.98 && y > 0.02 && y < 0.98, `${type}.${t.label}: fora da frente (x ${x.toFixed(2)} y ${y.toFixed(2)})`)
    // O cabo sai por +Z, não pela lateral onde o CAD desenha o encaixe.
    const normal = terminalNormalWorld3D(c, t)
    assert.ok(normal.z > 0.9, `${type}.${t.label}: o cabo sai a ${normal.toArray().map((n) => n.toFixed(2)).join('/')} — devia sair pela frente`)
  }
  const labels = c.terminals.map((t) => t.label)
  assert.equal(new Set(labels).size, labels.length, `${type}: rótulos de bornes repetidos`)
  pass(`${type}: ${c.terminals.length} bornes na frente, com o cabo a sair por +Z`)
}

// Contagens de E/S iguais às do símbolo IEC (`commands/model.ts`).
const di = createComponent('plcSiemensS71500Di32')
assert.equal(di.terminals.filter((t) => /^I\d\.\d$/.test(t.label)).length, 32, 'DI 32: 32 entradas')
const cpu = createComponent('plcSiemensS71500Cpu1511c')
assert.equal(cpu.terminals.filter((t) => /^I\d\.\d$/.test(t.label)).length, 16, 'CPU 1511C: 16 entradas')
assert.equal(cpu.terminals.filter((t) => /^Q\d\.\d$/.test(t.label)).length, 16, 'CPU 1511C: 16 saídas')
const s7300 = createComponent('plcSiemensS7300Cpu315')
assert.equal(s7300.terminals.filter((t) => /^[IQ]\d\.\d$/.test(t.label)).length, 0, 'CPU 315: sem E/S a bordo')
assert.ok(s7300.terminals.some((t) => t.label === 'L+') && s7300.terminals.some((t) => t.label === 'M'), 'CPU 315: L+/M declarados')
pass('contagens de E/S iguais às do símbolo IEC (32 I · 16 I + 16 Q · só alimentação)')

// As entradas ficam por baixo da fila de alimentação, na ordem do aparelho (I0.0 acima de I0.1).
const yOf = (c: ElectricalComponent, label: string) => terminal3DPositionOf(c.terminals.find((t) => t.label === label)!).y
assert.ok(yOf(di, 'I0.0') > yOf(di, 'I1.7'), 'DI 32: I0.0 acima de I1.7 (filas de cima para baixo)')
assert.ok(yOf(cpu, 'I0.0') > yOf(cpu, 'I1.7'), 'CPU 1511C: I0.0 acima de I1.7')
pass('ordem das filas igual à do aparelho (I0.0 em cima, I1.7 em baixo)')

// ------------------------------------------------------------------ lâmpadas
const psu = createComponent('powerSupplyProauto24A')
psu.state.powered = true; psu.state.on = true
const components: ElectricalComponent[] = [di, cpu, s7300, psu]
const term = (c: ElectricalComponent, label: string) => c.terminals.find((t) => t.label === label)!
let n = 0
const wire = (from: ElectricalComponent, a: string, to: ElectricalComponent, b: string): Wire => ({
  id: `siemens-wire-${++n}`, fromTerminalId: term(from, a).id, toTerminalId: term(to, b).id, color: '#22c55e', points: [],
} as Wire)
const wires: Wire[] = [
  wire(psu, '+V1', di, 'L+'), wire(psu, '-V1', di, 'M'),
  wire(psu, '+V1', cpu, 'L+'), wire(psu, '-V1', cpu, 'M'),
  wire(psu, '+V1', s7300, 'L+'), wire(psu, '-V1', s7300, 'M'),
  wire(di, 'L+', di, 'I0.0'), // sinal vindo do próprio L+ do módulo
]
for (const c of [di, cpu, s7300]) {
  const electrical = logoElectricalInputs(c, components, wires)
  assert.ok(electrical.powered, `${c.type}: L+/M ligados à fonte → o módulo fica alimentado`)
  const running = plcLamps(c.type, { runState: 'running', powered: electrical.powered, error: false })
  const stopped = plcLamps(c.type, { runState: 'stopped', powered: electrical.powered, error: false })
  const off = plcLamps(c.type, { runState: 'running', powered: false, error: false })
  assert.ok(running.some((l) => l.on), `${c.type}: em RUN e alimentado, alguma lâmpada acende`)
  assert.ok(!running.filter((l) => l.on).some((l) => l.name === 'ERROR' || l.name === 'SF'), `${c.type}: sem erro, as lâmpadas de erro ficam apagadas`)
  assert.ok(off.every((l) => !l.on), `${c.type}: sem alimentação nenhuma lâmpada acende`)
  for (const lamp of [...running, ...stopped]) {
    assert.ok(lamp.at.x > 0.02 && lamp.at.x < 0.98 && lamp.at.y > 0.02 && lamp.at.y < 0.98, `${c.type}: lâmpada ${lamp.name} fora da frente`)
  }
  if (c.type === 'plcSiemensS7300Cpu315') {
    assert.ok(running.find((l) => l.name === 'RUN')?.on && running.find((l) => l.name === 'DC5V')?.on, 'CPU 315: em RUN acende RUN e DC5V')
    assert.ok(stopped.find((l) => l.name === 'STOP')?.on && !stopped.find((l) => l.name === 'RUN')?.on, 'CPU 315: parado acende STOP e apaga RUN')
  } else {
    assert.ok(running.find((l) => l.name === 'RUN/STOP')?.on, `${c.type}: em RUN acende RUN/STOP`)
  }
}
const electrical = logoElectricalInputs(di, components, wires)
assert.ok(electrical.positive.has(term(di, 'I0.0').id), 'DI 32: I0.0 ligada ao L+ do módulo recebe sinal')
assert.ok(!electrical.positive.has(term(di, 'I0.1').id), 'DI 32: I0.1 sem cabo não recebe sinal')
pass('lâmpadas: 3 no S7-1500 (RUN/STOP, ERROR, MAINT) e 6 na CPU 315, acesas só com L+/M')

console.log(`\n✅ ${checks} verificações dos PLC Siemens S7`)
