/**
 * Geometria dos símbolos de comando — o que é desenhado tem de representar o estado.
 *
 * Corrige uma regressão real: no contacto «fechado» a lâmina terminava em y=30 e o
 * borne inferior só começava em y=42, ou seja, 12 px de ar num contacto que conduz.
 * Aqui a verificação é geométrica (o desenho liga os dois bornes?), não textual.
 */
import React from 'react'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { CmdSymbol, symbolBody } from '../src/commands/symbols'
import { CMD_PALETTE, CMD_PARTS, partTerminals, terminalAt, type CmdKind, type CmdPart } from '../src/commands/model'
import { normalizeCommandsPages } from '../src/commands/pages'
import { emptyCmdRuntime, isClosed, stepCommands } from '../src/commands/engine'
const terminalLabelsOf = (p: CmdPart) => partTerminals(p).map((t) => t.label)

const svgOf = (part: CmdPart, st = {}) => renderToStaticMarkup(<svg><CmdSymbol part={part} state={st} showTerminals={false} /></svg>)

/** Segmentos `<line>` do desenho, em coordenadas locais do símbolo. */
function segments(markup: string) {
  const out: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  for (const m of markup.matchAll(/<line x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g)) {
    out.push({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] })
  }
  return out
}

const key = (x: number, y: number) => `${Math.round(x * 1000) / 1000},${Math.round(y * 1000) / 1000}`

/** Existe caminho contínuo de `from` a `to` pelos segmentos desenhados? */
function connects(markup: string, from: [number, number], to: [number, number]) {
  const segs = segments(markup)
  const seen = new Set([key(...from)])
  const queue: Array<[number, number]> = [from]
  while (queue.length) {
    const [x, y] = queue.shift()!
    const here = key(x, y)
    for (const s of segs) {
      const a: [number, number] = [s.x1, s.y1]
      const b: [number, number] = [s.x2, s.y2]
      const other = key(a[0], a[1]) === here ? b : key(b[0], b[1]) === here ? a : null
      if (!other) continue
      const oKey = key(other[0], other[1])
      if (seen.has(oKey)) continue
      seen.add(oKey)
      queue.push(other)
    }
  }
  return seen.has(key(...to))
}

const part = (kind: CmdKind, extra: Partial<CmdPart> = {}): CmdPart =>
  ({ id: kind, kind, x: 0, y: 0, rot: 0, tag: 'X1', ...extra })

// 1. Contacto simples: fechado liga os bornes (0,0)-(0,60); aberto não.
for (const kind of ['contactNO', 'pushNO', 'limitNO', 'timedNO'] as CmdKind[]) {
  const closed = svgOf(part(kind), { closed: true })
  const open = svgOf(part(kind), { closed: false })
  assert.ok(connects(closed, [0, 0], [0, 60]), `${kind}: fechado deve ligar os dois bornes`)
  assert.ok(!connects(open, [0, 0], [0, 60]), `${kind}: aberto não pode parecer ligado`)
}
for (const kind of ['contactNC', 'pushNC', 'emergency', 'limitNC', 'timedNC'] as CmdKind[]) {
  const closed = svgOf(part(kind), { closed: true })
  const open = svgOf(part(kind), { closed: false })
  assert.ok(connects(closed, [0, 0], [0, 60]), `${kind}: fechado deve ligar os dois bornes`)
  assert.ok(!connects(open, [0, 0], [0, 60]), `${kind}: aberto não pode parecer ligado`)
}

// 2. Três polos: cada coluna liga topo ao fundo quando fechado.
for (const kind of ['contact3', 'breaker3', 'disconnector3', 'rcd'] as CmdKind[]) {
  const closed = svgOf(part(kind), { closed: true })
  const poles = CMD_PARTS[kind].poles.length
  for (let i = 0; i < poles; i++) {
    const x = i * 20
    assert.ok(connects(closed, [x, 0], [x, 60]), `${kind}: polo ${i + 1} fechado deve ligar topo ao fundo`)
  }
}

// 2b. Relé térmico: elemento de aquecimento (bimetal), não lâmina — desenha-se em `path`.
const thermal = svgOf(part('thermal3'), { closed: true })
assert.match(thermal, /v 4 h 5 v 8 h -5 v 4/, 'relé térmico: bimetal por fase')
assert.doesNotMatch(thermal, /NaN/)

// 3. Resistência: o desenho por omissão é o retângulo IEC; o zigzag é variante explícita.
const resNative = svgOf(part('resistor'))
const resAnsi = svgOf(part('resistor', { symbolStyle: 'ansi' }))
const resQet = svgOf(part('resistor', { symbolStyle: 'qet' }))
assert.match(resNative, /<rect x="-7" y="12" width="14" height="36"/)
assert.doesNotMatch(resNative, /l 6 6/)
assert.match(resAnsi, /M 0 12 l 6 6/)
assert.notEqual(resNative, resAnsi)
assert.notEqual(resNative, resQet)
for (const style of [{}, { symbolStyle: 'ansi' as const }, { symbolStyle: 'qet' as const }]) {
  const p = part('resistor', style)
  assert.deepEqual(terminalAt(p, 0), { x: 0, y: 0 })
  assert.deepEqual(terminalAt(p, 1), { x: 0, y: 60 })
}

// 4. Transformador: núcleo desenhado entre os dois enrolamentos.
const trafo = svgOf(part('transformer'))
assert.match(trafo, /<line x1="13" y1="19" x2="13" y2="41"/)
assert.match(trafo, /<line x1="17" y1="19" x2="17" y2="41"/)

// 5. Terra: três variantes distintas, todas com o mesmo borne PE.
const grounds = ['earth', 'protective', 'signal'] as const
const marks = grounds.map((g) => svgOf(part('ground', { groundVariant: g })))
assert.equal(new Set(marks).size, 3, 'as três terras devem ser desenhos distintos')
assert.ok(marks[1].includes('<line x1="-2" y1="9" x2="-8" y2="16"'), 'terra hachurada')
assert.ok(marks[2].includes('M -10 8 L 10 8 L 0 21 Z'), 'terra triangular')
for (const g of grounds) {
  const p = part('ground', { groundVariant: g })
  assert.equal(CMD_PARTS[p.kind].terminals.length, 1)
  assert.deepEqual(terminalAt(p, 0), { x: 0, y: 0 })
}

// 6. A variante não sobrevive ao JSON? Tem de sobreviver, como o `symbolStyle`.
const json = JSON.parse(JSON.stringify({ parts: [part('ground', { groundVariant: 'signal' })], wires: [] }))
const restored = normalizeCommandsPages(json)
assert.equal(restored.parts[0].groundVariant, 'signal')
assert.equal(svgOf(restored.parts[0]), svgOf(part('ground', { groundVariant: 'signal' })))

// 7. Nenhum tipo de símbolo rebenta a desenhar (incl. variantes e estados).
for (const kind of Object.keys(CMD_PARTS) as CmdKind[]) {
  for (const st of [{}, { closed: true }, { closed: true, energized: true, load: true, lit: true, tripped: true }]) {
    const markup = svgOf(part(kind), st)
    assert.ok(markup.includes('dc-cmd-symbol'), `${kind}: desenho vazio`)
    assert.doesNotMatch(markup, /NaN|undefined/, `${kind}: coordenada inválida`)
  }
  assert.ok(symbolBody(part(kind)) !== undefined, `${kind}: symbolBody devolveu undefined`)
}

// 8. Símbolos das folhas de 2026-11-01: medida, relés de medida/tempo, seccionadora fusível e pressostato.
const meter = svgOf(part('ammeter'))
assert.match(meter, /<circle cx="0" cy="30" r="12"/, 'amperímetro: círculo de medida')
assert.match(meter, />A</, 'amperímetro: letra A')
assert.match(svgOf(part('voltmeter')), />V</, 'voltímetro: letra V')
assert.match(svgOf(part('currentTransformer')), /<circle cx="0" cy="30" r="9"/, 'TA: anel atravessado pelo condutor (IEC 60617-6)')
assert.match(svgOf(part('overcurrentRelay')), />I&gt;</, 'relé de sobrecorrente: I>')
assert.match(svgOf(part('undervoltageRelay')), />U&lt;</, 'relé de subtensão: U<')
assert.match(svgOf(part('latchingRelay')), /<rect x="-13" y="18" width="8" height="24" fill="#0f172a"/, 'retenção: enrolamento escuro')
assert.match(svgOf(part('timerOffCoil')), /<rect x="-13" y="34" width="9" height="8" fill="#0f172a"/, 'TOF: bloco do atraso')
assert.match(svgOf(part('temperatureController')), />θ</, 'controlador de temperatura: θ')
assert.match(svgOf(part('siren')), /dc-cmd-buzz|M -12 24 L 4 24 L 12 15/, 'sirene: trombeta')
for (const kind of ['ammeter', 'voltmeter', 'currentTransformer', 'siren', 'overcurrentRelay', 'undervoltageRelay', 'latchingRelay', 'timerOffCoil', 'temperatureController', 'fuseDisconnector', 'pressureSwitch'] as CmdKind[]) {
  assert.ok(CMD_PARTS[kind], `${kind}: definição em falta`)
  assert.deepEqual(terminalAt(part(kind), 0).y, 0, `${kind}: borne de cima em y=0`)
  assert.deepEqual(terminalAt(part(kind), 1).y, 60, `${kind}: borne de baixo em y=60`)
}

const rtEmpty = emptyCmdRuntime()

// 8a. Segundo bloco das folhas: contador, relés de medida/tempo, chave geral, trafo 3~ e sensores de 3 fios.
assert.match(svgOf(part('counter')), />0\.0</, 'contador: dígitos')
assert.match(svgOf(part('overvoltageRelay')), />U&gt;</, 'relé de sobretensão: U>')
assert.match(svgOf(part('shortCircuitRelay')), />I&gt;&gt;</, 'relé de curto-circuito: I>>')
assert.match(svgOf(part('slowRelay')), /a 6 6 0 0 1 0 12/, 'operação lenta: semicírculo do atraso')
assert.match(svgOf(part('mainSwitch')), /M -6 8 L 46 8/, 'chave geral: barra mecânica dos 3 pólos')
assert.equal(CMD_PARTS.mainSwitch.terminals.length, 6, 'chave geral: 6 bornes')
assert.equal(CMD_PARTS.threePhaseTransformer.terminals.length, 6, 'trafo trifásico: 6 bornes')
assert.match(svgOf(part('threePhaseTransformer')), /a 7 10 0 1 1 0 20/, 'trafo trifásico: enrolamento por fase')
for (const kind of ['counter', 'overvoltageRelay', 'shortCircuitRelay', 'slowRelay'] as CmdKind[]) {
  assert.ok(CMD_PARTS[kind], `${kind}: definição em falta`)
  assert.deepEqual(terminalAt(part(kind), 0).y, 0, `${kind}: borne de cima em y=0`)
  assert.deepEqual(terminalAt(part(kind), 1).y, 60, `${kind}: borne de baixo em y=60`)
}
// Sensores de 3 fios: BR/BK em série, BL ao lado, cabeça «Fe».
for (const kind of ['sensor3wNO', 'sensor3wNC'] as CmdKind[]) {
  assert.deepEqual(CMD_PARTS[kind].terminals.map((x) => x.label), ['BR', 'BK', 'BL'], `${kind}: cores dos fios`)
  assert.match(svgOf(part(kind)), />Fe</, `${kind}: marca Fe`)
  assert.ok(connects(svgOf(part(kind), { closed: true }), [0, 0], [0, 60]), `${kind}: conduz fechado`)
  assert.ok(!connects(svgOf(part(kind), { closed: false }), [0, 0], [0, 60]), `${kind}: não conduz aberto`)
}
assert.equal(isClosed(part('sensor3wNO'), rtEmpty), false, 'sensor NA em repouso não conduz')
assert.equal(isClosed(part('sensor3wNO'), { ...rtEmpty, pressed: { X1: true } }), true, 'sensor NA detecta conduz')
assert.equal(isClosed(part('sensor3wNC'), rtEmpty), true, 'sensor NF em repouso conduz')
assert.equal(isClosed(part('sensor3wNC'), { ...rtEmpty, pressed: { X1: true } }), false, 'sensor NF detecta abre')
assert.equal(isClosed(part('mainSwitch'), rtEmpty), true, 'chave geral fecha')
assert.equal(isClosed(part('mainSwitch'), { ...rtEmpty, toggled: { X1: true } }), false, 'chave geral desliga')

// 8b. O desenho e a condução concordam: seccionadora conduz sempre; pressostato só quando actuado.
assert.equal(isClosed(part('fuseDisconnector'), rtEmpty), true, 'seccionadora fusível conduz')
assert.ok(connects(svgOf(part('fuseDisconnector')), [0, 0], [0, 60]))
assert.equal(isClosed(part('pressureSwitch'), rtEmpty), false, 'pressostato em repouso não conduz')
assert.equal(isClosed(part('pressureSwitch'), { ...rtEmpty, pressed: { X1: true } }), true, 'pressostato actuado conduz')
assert.ok(connects(svgOf(part('pressureSwitch'), { closed: true }), [0, 0], [0, 60]))
assert.ok(!connects(svgOf(part('pressureSwitch'), { closed: false }), [0, 0], [0, 60]))
// Bobinas novas entram na malha dos elementos com bobina (sobem a `rt.coils` pela referência).
for (const kind of ['timerOffCoil', 'overcurrentRelay', 'undervoltageRelay', 'latchingRelay'] as CmdKind[]) {
  assert.ok(svgOf(part(kind)), `${kind}: desenho`)
}

// 9. Manobra IEC 60617-7: cada pólo liga topo e fundo fechado, não liga aberto, e leva o qualificativo da norma.
const switching: Array<[CmdKind, 'breaker' | 'disconnector' | 'switchDisconnector']> = [
  ['breaker1', 'breaker'], ['breaker2', 'breaker'], ['breaker3', 'breaker'], ['breakerTM1', 'breaker'], ['motorBreaker3', 'breaker'], ['rcd', 'breaker'],
  ['disconnector1', 'disconnector'], ['disconnector2', 'disconnector'], ['disconnector3', 'disconnector'], ['mainSwitch', 'disconnector'], ['fuseDisconnector3', 'disconnector'],
  ['switchDisconnector1', 'switchDisconnector'], ['switchDisconnector3', 'switchDisconnector'], ['fuseSwitchDisconnector3', 'switchDisconnector'],
]
for (const [kind, q] of switching) {
  const closed = svgOf(part(kind), { closed: true })
  const open = svgOf(part(kind), { closed: false })
  CMD_PARTS[kind].poles.forEach((_, i) => {
    const x = i * 20
    assert.ok(connects(closed, [x, 0], [x, 60]), `${kind}: pólo ${i + 1} fechado liga topo ao fundo`)
    assert.ok(!connects(open, [x, 0], [x, 60]), `${kind}: pólo ${i + 1} aberto não pode parecer ligado`)
  })
  if (q === 'breaker') assert.match(closed, /M -3\.5 14\.5 L 3\.5 21\.5/, `${kind}: × do disjuntor no contacto fixo`)
  else assert.match(closed, /M -4\.5 18 L 4\.5 18/, `${kind}: barra do seccionador no contacto fixo`)
  if (q === 'switchDisconnector') assert.match(closed, /<circle cx="0" cy="18" r="2.3"/, `${kind}: círculo do interruptor`)
  if (q === 'breaker') assert.doesNotMatch(closed, /stroke-dasharray="3 2"/, `${kind}: já não usa a caixa tracejada antiga`)
  const rt = emptyCmdRuntime()
  assert.equal(isClosed(part(kind), rt), true, `${kind}: ligado por omissão`)
  assert.equal(isClosed(part(kind), { ...rt, toggled: { X1: true } }), false, `${kind}: desliga com o clique`)
}
for (const kind of ['breakerTM1', 'motorBreaker3'] as CmdKind[]) {
  const markup = svgOf(part(kind), { closed: true })
  assert.match(markup, />I&gt;</, `${kind}: disparador magnético I>`)
  assert.match(markup, /v -8 h 4 v 8/, `${kind}: disparador térmico (bimetal)`)
  assert.equal(isClosed(part(kind), { ...emptyCmdRuntime(), tripped: { X1: true } }), false, `${kind}: disparado abre`)
}
assert.match(svgOf(part('rcd')), />IΔ</, 'diferencial: disparador IΔ')
assert.match(svgOf(part('fuseDisconnector3'), { closed: true }), /<rect x="-4" y="25" width="8" height="13" transform="rotate\(0 0 42\)"/, 'seccionador fusível: a lâmina é o fusível')
assert.ok(connects(svgOf(part('fuse2')), [20, 0], [20, 60]), 'fusíveis 2P conduzem nos dois pólos')

// 10. Instrumentos, conversores, transformadores e motores com variante normalizada.
const variants = (kind: CmdKind, values: string[]) => {
  const marks = values.map((variant) => svgOf(part(kind, { variant })))
  assert.equal(new Set(marks).size, values.length, `${kind}: cada variante tem desenho próprio`)
  assert.equal(svgOf(part(kind)), marks[0], `${kind}: sem variante desenha a primeira`)
  assert.equal(svgOf(part(kind, { variant: 'inexistente' })), marks[0], `${kind}: variante inválida cai na de omissão`)
  return marks
}
const meters = variants('meter', ['W', 'var', 'Hz', 'cosφ', 'φ', 'n', 'θ', 'Ω'])
assert.match(meters[0], /<circle cx="0" cy="30" r="13"/, 'instrumento indicador: círculo')
assert.match(meters[2], />Hz</, 'frequencímetro: Hz')
const energy = variants('energyMeter', ['Wh', 'varh', 'Ah', 'h'])
assert.match(energy[0], /M -15 23 L 15 23/, 'contador de energia: faixa do instrumento integrador')
variants('converter', ['acdc', 'dcac', 'dcdc', 'acac'])
assert.match(svgOf(part('converter')), /M -4 46 L 24 14/, 'conversor: diagonal')
assert.deepEqual(terminalLabelsOf(part('converter')), ['L', 'N', '+', '−'], 'retificador: L N → + −')
assert.deepEqual(terminalLabelsOf(part('converter', { variant: 'dcac' })), ['+', '−', 'L', 'N'], 'inversor: + − → L N')
const groups = variants('transformer3Line', ['Dyn11', 'Yy0', 'Yd11', 'Dd0', 'Yzn11'])
assert.match(groups[0], />Dyn11</, 'trafo unifilar: grupo de ligações')
assert.equal((groups[0].match(/<circle/g) ?? []).length, 2, 'trafo unifilar: dois círculos')
assert.ok(connects(svgOf(part('autotransformer')), [0, 30], [20, 60]), 'autotransformador: tomada ligada ao borne 3')
assert.match(svgOf(part('motor1')), />1~</, 'motor monofásico: 1~')
assert.match(svgOf(part('motorDC')), /M 3 58 L 17 58/, 'motor DC: traço de contínua')
assert.equal((svgOf(part('motorSlipRing')).match(/<circle/g) ?? []).length, 2, 'rotor bobinado: círculo interior')
assert.equal(CMD_PARTS.motorSlipRing.terminals.length, 6, 'rotor bobinado: U1 V1 W1 + K L M')

// 11. Simulação: motores 1~ e DC rodam com tensão entre bornes; rotor bobinado com as três fases.
const runWith = (lines: string[], kind: CmdKind, terms: number) => {
  const diagram = { parts: [
    { id: 's', kind: 'supply' as CmdKind, x: 0, y: 0, rot: 0 as const, tag: '', lines },
    { id: 'm', kind, x: 0, y: 100, rot: 0 as const, tag: 'M1' },
  ], wires: Array.from({ length: terms }, (_, i) => ({ id: `w${i}`, a: { part: 's', term: i }, b: { part: 'm', term: i } })) }
  return stepCommands(diagram, { ...emptyCmdRuntime(), running: true }, 100).motors.m
}
assert.equal(runWith(['L1', 'N'], 'motor1', 2).mode, 'run', 'motor 1~ roda entre fase e neutro')
assert.equal(runWith(['L1', 'N'], 'motor1', 1).mode, 'stop', 'motor 1~ sem neutro fica parado')
assert.equal(runWith(['L+', 'M'], 'motorDC', 2).mode, 'run', 'motor DC roda entre L+ e M')
assert.equal(runWith(['L1', 'L2', 'L3'], 'motorSlipRing', 3).mode, 'run', 'rotor bobinado roda com as três fases')
assert.equal(runWith(['L1', 'L2', 'L3'], 'motorSlipRing', 2).phaseLoss, true, 'rotor bobinado com falta de fase')

// 12. A variante sobrevive ao JSON e todos os novos estão na paleta.
assert.equal(normalizeCommandsPages(JSON.parse(JSON.stringify({ parts: [part('meter', { variant: 'Hz' })], wires: [] }))).parts[0].variant, 'Hz')
const inPalette = new Set(CMD_PALETTE.flatMap((g) => g.kinds))
for (const kind of Object.keys(CMD_PARTS) as CmdKind[]) assert.ok(inPalette.has(kind), `${kind}: falta na paleta`)

// 13. Contactos comandados (IEC 60617-7): órgão de comando à esquerda, ligado à lâmina por tracejado.
const operated: Array<[CmdKind, RegExp, string]> = [
  ['pushNO', /M -18 \S+ L -22 \S+ L -22/, 'botão: «[» de premir'],
  ['emergency', /fill="#fecaca"/, 'emergência: cabeça em cogumelo'],
  ['pullCord', /M -29 \S+ L -25 \S+ L -25/, 'emergência por cabo: «]» de puxar'],
  ['selector', /M -26 \S+ L -22 \S+ L -22 \S+ L -18/, 'comutador: órgão rotativo'],
  ['proximity', /Z" fill="#fff"/, 'proximidade: losango'],
  ['pressureSwitch', />p</, 'pressostato: p'],
  ['levelNO', /q 1\.75 -2 3\.5 0/, 'nível: boia e superfície do líquido'],
  ['footNO', /M -28 \S+ L -19/, 'pedal'],
  ['thermalNC', /h 3\.5 v -6 h 7 v 6 h 3\.5/, 'térmico: bimetal'],
  ['timedNO', /A 6 6 0 0 0/, 'temporizado à operação: paraquedas'],
  ['timedOffNO', /A 6 6 0 0 1/, 'temporizado à desoperação: paraquedas invertido'],
]
for (const [kind, mark, label] of operated) {
  const markup = svgOf(part(kind))
  assert.match(markup, mark, label)
  if (kind !== 'limitNO') assert.match(markup, /stroke-dasharray="2\.6 2\.2"/, `${label}: ligação mecânica tracejada`)
}
assert.match(svgOf(part('limitNO')), /L -\S+ \S+ L -\S+ \S+ Z" fill="#fff"/, 'fim de curso: cunha na lâmina')
for (const kind of ['timedOffNO', 'timedOffNC', 'pullCord', 'levelNO', 'levelNC', 'footNO', 'footNC'] as CmdKind[]) {
  assert.ok(connects(svgOf(part(kind), { closed: true }), [0, 0], [0, 60]), `${kind}: fechado liga os bornes`)
  assert.ok(!connects(svgOf(part(kind), { closed: false }), [0, 0], [0, 60]), `${kind}: aberto não parece ligado`)
}
assert.match(svgOf(part('contact3'), { closed: true }), /a 3\.4 3\.4 0 0 0 6\.8 0/, 'contactos principais: semicírculo da função de contactor')
assert.match(svgOf(part('pushIllum')), /<circle cx="20" cy="30" r="8"/, 'botão luminoso: lâmpada entre X1 e X2')
// Simulação: TOF mantém o NA fechado durante o atraso depois de a bobina desligar.
{
  const diagram = { parts: [
    { id: 's', kind: 'supply' as CmdKind, x: 0, y: 0, rot: 0 as const, tag: '', lines: ['L1', 'N'] },
    { id: 'b', kind: 'pushNO' as CmdKind, x: 0, y: 20, rot: 0 as const, tag: 'S1' },
    { id: 'k', kind: 'timerOffCoil' as CmdKind, x: 0, y: 100, rot: 0 as const, tag: 'K1', delayMs: 1000 },
    { id: 'c', kind: 'timedOffNO' as CmdKind, x: 80, y: 20, rot: 0 as const, tag: 'K1' },
    { id: 'h', kind: 'lamp' as CmdKind, x: 80, y: 100, rot: 0 as const, tag: 'H1' },
  ], wires: [
    { id: 'w1', a: { part: 's', term: 0 }, b: { part: 'b', term: 0 } }, { id: 'w2', a: { part: 'b', term: 1 }, b: { part: 'k', term: 0 } },
    { id: 'w3', a: { part: 'k', term: 1 }, b: { part: 's', term: 1 } }, { id: 'w4', a: { part: 's', term: 0 }, b: { part: 'c', term: 0 } },
    { id: 'w5', a: { part: 'c', term: 1 }, b: { part: 'h', term: 0 } }, { id: 'w6', a: { part: 'h', term: 1 }, b: { part: 's', term: 1 } },
  ] }
  let rt = stepCommands(diagram, { ...emptyCmdRuntime(), running: true, pressed: { S1: true } }, 100)
  assert.equal(rt.lamps.h, true, 'TOF: com a bobina ligada o contacto fecha logo')
  rt = stepCommands(diagram, { ...rt, pressed: {} }, 100)
  rt = stepCommands(diagram, rt, 500)
  assert.equal(rt.lamps.h, true, 'TOF: meio segundo depois de largar, ainda fechado')
  rt = stepCommands(diagram, rt, 600)
  assert.equal(rt.lamps.h, false, 'TOF: passado o atraso abre')
  const rtEmpty2 = emptyCmdRuntime()
  assert.equal(isClosed(part('levelNO'), { ...rtEmpty2, pressed: { X1: true } }), true, 'boia NA fecha ao subir o nível')
  assert.equal(isClosed(part('footNC'), { ...rtEmpty2, pressed: { X1: true } }), false, 'pedal NF abre ao pisar')
  assert.equal(isClosed(part('pullCord'), { ...rtEmpty2, toggled: { X1: true } }), false, 'cabo puxado fica aberto (encravado)')
}

console.log('PASS — geometria dos símbolos: contactos ligam os bornes, resistência IEC, núcleo do transformador e três terras')
console.log('PASS — contactos comandados IEC 60617-7: órgãos de comando com ligação mecânica, TOF, boia, pedal e cabo')
console.log('PASS — IEC 60617: manobra (× / barra / barra + círculo), disparadores, instrumentos, conversores, trafos e motores com variantes')
