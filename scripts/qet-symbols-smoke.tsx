import React from "react"
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { CmdSymbol } from '../src/commands/symbols'
import { terminalAt, type CmdKind, type CmdPart } from '../src/commands/model'
import { normalizeCommandsPages } from '../src/commands/pages'
import { directStartExample } from '../src/commands/examples'
import { emptyCmdRuntime, stepCommands } from '../src/commands/engine'

for (const kind of ['fuse', 'resistor', 'capacitor', 'diode'] as CmdKind[]) {
  const base: CmdPart = { id: kind, kind, x: 100, y: 120, rot: 90, tag: 'X1' }
  const qet: CmdPart = { ...base, symbolStyle: 'qet' }
  assert.deepEqual(terminalAt(qet, 0), terminalAt(base, 0))
  assert.deepEqual(terminalAt(qet, 1), terminalAt(base, 1))
  assert.notEqual(renderToStaticMarkup(<svg><CmdSymbol part={base} /></svg>), renderToStaticMarkup(<svg><CmdSymbol part={qet} /></svg>))
  const restored = normalizeCommandsPages(JSON.parse(JSON.stringify({ parts: [qet], wires: [] })))
  assert.equal(restored.parts[0].symbolStyle, 'qet')
  assert.equal(renderToStaticMarkup(<svg><CmdSymbol part={restored.parts[0]} /></svg>), renderToStaticMarkup(<svg><CmdSymbol part={qet} /></svg>))
}
const native = directStartExample()
const qet = { ...native, parts: native.parts.map(p => p.kind === 'fuse' ? { ...p, symbolStyle: 'qet' as const } : p) }
const runtime = { ...emptyCmdRuntime(), running: true }
assert.deepEqual(stepCommands(qet, runtime, 0), stepCommands(native, runtime, 0))
console.log('PASS — variantes QElectroTech: renderização, bornes, persistência JSON e simulação')
