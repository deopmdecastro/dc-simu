import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseFluidSimCircuitText, circuitTextFromCt } from '../src/commands/fluidSimCircuit'
import { parseCadeJson, parseCadeBinary } from '../src/commands/cadeSimuImport'

let n = 0
const pass = (label: string) => { n++; console.log(`PASS — ${label}`) }

// FluidSIM elect sample
const ct = new Uint8Array(readFileSync('/tmp/festo-ct/elect_02.ct'))
const text = circuitTextFromCt(ct)
assert.ok(text.includes('lampe') || text.includes('magnet') || text.includes('pol'), 'texto CT com símbolos elétricos')
pass('FluidSIM CT expandido com símbolos de circuito')

const result = parseFluidSimCircuitText(text)
assert.ok(result.stats.symbols >= 3, `símbolos >= 3 (foi ${result.stats.symbols})`)
pass(`FluidSIM circuito → ${result.stats.symbols} símbolos, ${result.stats.wires} cabos`)

// CADe JSON
const json = parseCadeJson(JSON.stringify({
  format: 'dc-simu-cade-import',
  name: 'Teste',
  parts: [
    { kind: 'coil', x: 0, y: 100, tag: 'K1' },
    { kind: 'pushNO', x: 0, y: 0, tag: 'S1' },
  ],
  wires: [{ a: { part: 'p1', term: 0 }, b: { part: 'p2', term: 1 } }],
}))
assert.equal(json.stats.symbols, 2)
pass('CADe JSON intermédio')

// CADe binary heuristic
const fake = new TextEncoder().encode('.... K1 .... S2 .... F1 .... M1 .... noise XY99 ....')
const bin = parseCadeBinary(fake)
assert.ok(bin.stats.symbols >= 3, 'tags IEC extraídas do binário')
pass(`CADe binário parcial → ${bin.stats.symbols} refs`)

console.log(`\n✅ ${n} verificações de importação IEC`)
