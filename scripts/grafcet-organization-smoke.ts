import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { grafcetExamples } from '../src/project/grafcetExamples'
import { emptyGrafcetRuntime, scanGrafcet, setGrafcetSignalAliasResolver, transitionsOf, validateGrafcet, type GrafcetProgram } from '../src/grafcet/engine'
import { signalAliasMap } from '../src/grafcet/signals'
import { organizeGrafcetPage } from '../src/grafcet/organize'
import { stepFootprint } from '../src/grafcet/layout'
import { referenceSlot } from '../src/grafcet/referenceLayout'
import { useSimStore } from '../src/store/useSimStore'

let checks = 0
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks++ }
const example = grafcetExamples().find(e => e.id === 'grafcet-estampagem-industrial')!
const aliases = signalAliasMap(example.tags)
setGrafcetSignalAliasResolver(name => aliases.get(name))
class Run {
  table: Record<string, boolean> = { ...example.restInputs }
  rt = emptyGrafcetRuntime()
  scan(ms = 100) { for (let time = 0; time < ms; time += 100) this.rt = scanGrafcet(example.program, this.rt, this.table, 100); return this }
  set(values: Record<string, boolean>) { Object.assign(this.table, values); return this.scan() }
  pulse(bit: string) { return this.set({ [bit]: true }).set({ [bit]: false }) }
  on(bit: string) { return !!this.table[bit] }
  at(n: number) { return this.rt.active.includes(`est-s${n}`) }
}

// Cada tipo percorre o ciclo inteiro e enche só a sua rampa na segunda peça.
for (const [type, stamp, deposit, seconds, drawer, count, full, reset] of [
  ['I0.2', 24, 28, 5, 'I0.7', 'M0.1', 'M0.4', 'I3.6'],
  ['I0.3', 25, 29, 6, 'I1.0', 'M0.2', 'M0.5', 'I3.7'],
  ['I0.4', 26, 30, 8, 'I1.1', 'M0.3', 'M0.6', 'I4.0'],
] as const) {
  const r = new Run().scan()
  r.pulse('I0.0').scan(300)
  for (let piece = 1; piece <= 2; piece++) {
    r.set({ 'I0.1': true, [type]: true }).scan(200)
    r.set({ 'I0.5': true }).scan(100)
    ok(r.at(stamp), `${type}: entrou na estampagem ${stamp}`)
    r.scan(seconds * 1000 - 400)
    ok(r.at(stamp), `${type}: mantém estampagem antes do tempo`)
    r.scan(500)
    ok(r.at(27), `${type}: termina ao cumprir ${seconds} s`)
    r.set({ 'I0.5': false, 'I0.6': true })
    ok(r.at(deposit) && r.on(count), `${type}: depósito conta uma peça`)
    ok(r.on(full) === (piece === 2), `${type}: cheia só na segunda peça`)
    r.scan(1000)
    ok(r.on(full) === (piece === 2), `${type}: manter etapa de depósito não duplica a contagem`)
    r.set({ [drawer]: true }).scan(100)
    r.set({ 'I0.1': false, [type]: false, 'I0.6': false, [drawer]: false, 'I1.2': true })
    r.scan(300)
    r.set({ 'I1.2': false })
  }
  ok(r.at(20), `${type}: rampa cheia bloqueia nova alimentação`)
  // Reset após muitos scans, não apenas ao inicializar o programa.
  r.scan(2000).pulse(reset).scan(300)
  ok(!r.on(count) && !r.on(full), `${type}: reset independente limpa contador e cheia durante execução`)
  ok(r.at(21), `${type}: ciclo retoma com a rampa livre`)
}

// Reset em curso interrompido pela emergência; o atuador corta no próprio scan.
{
  const r = new Run().scan()
  r.set({ 'I0.7': true, 'I1.0': true, 'I1.1': true }).pulse('I1.3').scan(2000)
  ok(r.at(43) && r.on('Q0.5'), 'reset chegou ao retorno do transportador')
  r.set({ 'I1.7': false })
  ok(!r.on('Q0.5'), 'emergência corta retorno no primeiro scan, mesmo antes de G0 reagir')
  r.scan(500)
  ok(r.at(40) && r.at(5) && r.at(11), 'reset regressa ao repouso durante emergência')
  r.set({ 'I1.7': true }).scan(500)
  ok(!r.on('Q0.5') && r.at(40), 'libertar emergência sem rearme não retoma o reset')
}
{
  const r = new Run().scan()
  r.set({ 'I0.0': true, 'I3.5': true }).scan(800)
  ok(r.at(0) && r.at(20) && !r.on('Q0.0'), 'STOP tem prioridade sobre START mantido')
  r.set({ 'I0.0': false, 'I3.5': false, 'I3.4': true }).pulse('I0.0').scan(300)
  ok(r.at(0), 'não inicia ciclo com pausa ligada')
}

const geometry = (p: GrafcetProgram) => p.steps.map(s => { const b = stepFootprint(s); return { id: s.id, chart: s.chart, l: s.x! + b.left, r: s.x! + b.right, t: s.y! + b.top, b: s.y! + b.bottom } })
for (const chart of example.program.charts!) {
  const boxes = geometry(example.program).filter(s => s.chart === chart.id)
  ok(boxes.every(b => Number.isFinite(b.l) && b.l >= 0 && b.t >= 48), `${chart.name}: margem e coordenadas válidas`)
  ok(boxes.every((a, i) => boxes.slice(i + 1).every(b => a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t)), `${chart.name}: etapas e ações sem sobreposição`)
}
{
  const p = structuredClone(example.program)
  const wide = p.steps.find(s => s.name === '24')!
  wide.actions![0] = { ...wide.actions![0], w: 420, h: 150, dx: 100, dy: -40 }
  const next = organizeGrafcetPage(p, 'est-g2')
  const boxes = geometry(next).filter(s => s.chart === 'est-g2')
  ok(boxes.every((a, i) => boxes.slice(i + 1).every(b => a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t)), 'Organizar considera medidas e afastamentos reais das ações')
  const x = (n: string) => next.steps.find(s => s.name === n)!.x!
  ok(x('23') === (x('24') + x('25') + x('26')) / 3 && x('27') === x('23'), 'divergência e convergência mantêm eixo centrado')
  const refs = p.transitions!.filter(t => t.wireless && t.from[0] === 'est-s1')
  const slots = refs.map(t => referenceSlot(t, p.transitions!, { x: 100, bottom: 150, right: 320 }))
  ok(slots.every(s => s.x >= 376) && slots.every((s, i) => !i || s.y >= slots[i - 1].y + 56), 'referências ficam fora das ações, empilhadas sem sobreposição')
  const manual = structuredClone(p)
  manual.transitions!.filter(t => t.chart === 'est-g4').forEach(t => { t.wireless = true })
  const arranged = organizeGrafcetPage(manual, 'est-g4')
  ok(arranged.steps.find(s => s.name === '51')!.y! > arranged.steps.find(s => s.name === '50')!.y!, 'sequência inteiramente por referência continua organizada na vertical')
}
{
  const p = structuredClone(example.program)
  p.linkBars = { 'est-g2-t2': { x: 9000, y: 9000 }, 'est-g4-t1': { x: 340, y: 190 } }
  p.linkBends = { 'est-g2-t2': [{ x: 10000, y: 10000 }], 'est-g4-t1': [{ x: 340, y: 180 }] }
  const t = p.transitions!.find(t => t.id === 'est-g2-t2')!
  t.x = 9999; t.y = 9999
  const next = organizeGrafcetPage(p, 'est-g2')
  ok(!next.linkBars?.['est-g2-t2'] && !next.linkBends?.['est-g2-t2'], 'Organizar elimina rotas antigas da página organizada')
  assert.deepEqual(next.steps.filter(s => s.chart !== 'est-g2'), p.steps.filter(s => s.chart !== 'est-g2')); checks++
  assert.deepEqual(next.linkBends?.['est-g4-t1'], p.linkBends['est-g4-t1']); checks++
  ok(!Number.isFinite(next.transitions!.find(item => item.id === t.id)?.x), 'posições antigas das transições ligadas são recalculadas')
  assert.deepEqual(next.transitions!.map(({ x, y, ...t }) => t), p.transitions!.map(({ x, y, ...t }) => t)); checks++
  assert.deepEqual(next.comments, p.comments); checks++
  useSimStore.setState({ grafcet: p, history: [], future: [], demoMode: false })
  useSimStore.getState().setGrafcet(next, 'force', 'grafcet:organize')
  useSimStore.getState().undo()
  assert.deepEqual(useSimStore.getState().grafcet, p); checks++
  useSimStore.getState().redo()
  assert.deepEqual(useSimStore.getState().grafcet, next); checks++
  const saved = JSON.parse(useSimStore.getState().saveJSON())
  assert.deepEqual(saved.grafcet, JSON.parse(JSON.stringify(next))); checks++
}
const exported = JSON.parse(readFileSync('examples/grafcet-estampagem-industrial.json', 'utf8'))
{
  // O estilo é uma operação visual: mantém ações, qualificadores, condições e destinos.
  const p = structuredClone(example.program)
  const before = structuredClone(p)
  const next = organizeGrafcetPage(p, 'est-g2', 'classic')
  const logic = (program: GrafcetProgram) => ({
    steps: program.steps.map(({ x, y, w, h, pinned, actionLayout, actions, ...step }) => ({
      ...step, actions: actions?.map(({ x, y, w, h, dx, dy, afterActionId, ...a }) => a),
    })),
    transitions: transitionsOf(program).map(({ x, y, wireless, ...t }) => t),
  })
  assert.deepEqual(logic(next), logic(before)); checks++
  assert.deepEqual(p, before); checks++
  assert.deepEqual(organizeGrafcetPage(next, 'est-g2', 'classic'), next); checks++
  assert.deepEqual(next.steps.filter(s => s.chart !== 'est-g2'), before.steps.filter(s => s.chart !== 'est-g2')); checks++
  assert.deepEqual(next.comments, before.comments); checks++
  for (const s of next.steps.filter(s => s.chart === 'est-g2')) {
    const actions = s.actions ?? []
    ok(actions.every(a => a.dx! >= 48 && a.w === actions[0]?.w), `${s.name}: bloco de ações alinhado à direita`)
    const extents = actions.map(a => {
      const conditional = a.type === 'conditional' || a.condition !== '1'
      return { x: a.dx!, y: a.dy! - (conditional ? 48 : 0), w: Math.max(a.w!, 22 + a.condition.length * 6.5), h: a.h! + (conditional ? 48 : 0) }
    })
    ok(extents.every((a, index) => extents.slice(index + 1).every(b => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)), `${s.name}: condições e caixas sem sobreposição`)
  }
  const back = next.transitions!.find(t => t.id === 'est-g2-t16')!
  const rail = next.linkBends![back.id]
  ok(!back.wireless && Math.min(...rail.map(p => p.x)) < Math.min(...next.steps.filter(s => s.chart === 'est-g2').map(s => s.x!)), 'ciclo fecha pela esquerda de todos os ramos')
  const manual = organizeGrafcetPage(before, 'est-g4', 'classic')
  const manualSteps = manual.steps.filter(s => s.chart === 'est-g4')
  ok(manualSteps[0].x === manualSteps[1].x && manualSteps[0].y! < manualSteps[1].y!, 'manual conserva uma única espinha vertical')
  const allClassic = example.program.charts!.reduce((program, chart) => organizeGrafcetPage(program, chart.id, 'classic'), structuredClone(example.program))
  for (const s of allClassic.steps.filter(s => s.actions?.length)) {
    const extents = s.actions!.map(a => {
      const conditional = a.type === 'conditional' || a.condition !== '1'
      return { x: a.dx!, y: a.dy! - (conditional ? 48 : 0), w: Math.max(a.w!, 22 + a.condition.length * 6.5), h: a.h! + (conditional ? 48 : 0) }
    })
    ok(extents.every((a, index) => extents.slice(index + 1).every(b => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)), `${s.chart} · ${s.name}: ações condicionais organizadas sem sobreposição`)
    ok(s.actions!.filter(a => a.type === 'conditional' || a.condition !== '1').every(a => a.w! >= a.condition.length * 7 + 34), `${s.chart} · ${s.name}: largura das caixas acomoda as receptividades`)
    ok(!s.description || s.actions!.filter(a => a.type === 'conditional' || a.condition !== '1').every(a => a.dy! >= 80), `${s.chart} · ${s.name}: receptividades afastadas da legenda da etapa`)
  }
  const rampReset = allClassic.steps.find(s => s.id === 'est-s81')!
  const resetGroups = [...new Set(rampReset.actions!.map(a => a.condition))].map(condition => rampReset.actions!.filter(a => a.condition === condition))
  ok(resetGroups.length === 3 && resetGroups.every(group => group.length === 2 && group[0].dy === group[1].dy && group[0].dx! < group[1].dx!) && new Set(resetGroups.map(group => group[0].dy)).size === 3 && resetGroups.map(group => group[0].dy).every((dy, index, rows) => !index || dy! - rows[index - 1]! >= 104), 'G16 agrupa lado a lado as duas ações de cada rampa e separa as três condições')
  useSimStore.setState({ grafcet: before, history: [], future: [], demoMode: false })
  useSimStore.getState().setGrafcet(next, 'force', 'grafcet:organize')
  useSimStore.getState().undo()
  assert.deepEqual(JSON.parse(JSON.stringify(useSimStore.getState().grafcet)), JSON.parse(JSON.stringify(before))); checks++
  useSimStore.getState().redo()
  assert.deepEqual(JSON.parse(JSON.stringify(useSimStore.getState().grafcet)), JSON.parse(JSON.stringify(next))); checks++
}
{
  const legacy: GrafcetProgram = { steps: [
    { id: 'old-0', name: '0', initial: true, action: 'Q0.0', condition: 'I0.0' },
    { id: 'old-1', name: '1', initial: false, action: 'Q0.1', condition: '!I0.0' },
  ] }
  const next = organizeGrafcetPage(legacy)
  assert.deepEqual(transitionsOf(next), transitionsOf(legacy)); checks++
  ok(next.steps[1].y! > next.steps[0].y! && next.steps[0].action === legacy.steps[0].action, 'projetos lineares antigos mantêm sequência e ações ao organizar')
}
assert.deepEqual(exported.grafcet, JSON.parse(JSON.stringify(example.program))); checks++
ok(exported.nativeId === example.nativeId, 'JSON e projeto nativo têm a mesma versão')
useSimStore.getState().loadJSON(JSON.stringify(exported))
assert.deepEqual(JSON.parse(JSON.stringify(useSimStore.getState().grafcet)), exported.grafcet); checks++
ok(!validateGrafcet(example.program).some(i => i.level === 'error'), 'projeto sem erros no diagnóstico')
setGrafcetSignalAliasResolver(() => undefined)
console.log(`PASS — ${checks} verificações: três ciclos, contagem, resets, emergência, STOP, organização, páginas e histórico`)
