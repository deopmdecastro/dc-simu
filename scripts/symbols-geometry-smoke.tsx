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
import { CMD_PARTS, terminalAt, type CmdKind, type CmdPart } from '../src/commands/model'
import { normalizeCommandsPages } from '../src/commands/pages'
import { emptyCmdRuntime, isClosed } from '../src/commands/engine'

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
assert.match(svgOf(part('currentTransformer')), /<rect x="-15" y="21" width="30" height="6"/, 'TA: duas barras do núcleo')
assert.match(svgOf(part('overcurrentRelay')), />I&gt;</, 'relé de sobrecorrente: I>')
assert.match(svgOf(part('undervoltageRelay')), />U&lt;</, 'relé de subtensão: U<')
assert.match(svgOf(part('latchingRelay')), /<rect x="-13" y="18" width="8" height="24" fill="#0f172a"/, 'retenção: enrolamento escuro')
assert.match(svgOf(part('timerOffCoil')), /<rect x="-13" y="34" width="9" height="8" fill="#0f172a"/, 'TOF: bloco do atraso')
assert.match(svgOf(part('temperatureController')), />CT</, 'controlador: CT')
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

console.log('PASS — geometria dos símbolos: contactos ligam os bornes, resistência IEC, núcleo do transformador e três terras')
