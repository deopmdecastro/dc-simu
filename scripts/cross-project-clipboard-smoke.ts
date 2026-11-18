/** Clipboard entre projetos (elétrico + GRAFCET). */
import assert from 'node:assert/strict'
import {
  writeElectricalCrossClipboard,
  readElectricalCrossClipboard,
  writeGrafcetCrossClipboard,
  readGrafcetCrossClipboard,
  hasCrossClipboard,
  clearCrossClipboard,
} from '../src/clipboard/crossProjectClipboard'

// polyfill localStorage for node
const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v) },
  removeItem: (k: string) => { mem.delete(k) },
}

let n = 0
const check = (name: string, ok: boolean) => { assert.ok(ok, name); n++ }

clearCrossClipboard()
check('vazio no início', !hasCrossClipboard())

writeElectricalCrossClipboard({
  components: [{ id: 'c1', type: 'contactor', terminals: [] }],
  wires: [],
  sourceProject: 'Projeto A',
})
check('tem elétrico', hasCrossClipboard('electrical'))
check('não é grafcet', !hasCrossClipboard('grafcet'))
const el = readElectricalCrossClipboard()
check('lê componentes', !!el && el.components.length === 1)
check('origem', el?.sourceProject === 'Projeto A')

writeGrafcetCrossClipboard({
  stepIds: ['s1'],
  steps: [{ id: 's1', name: '10' }],
  transitions: [],
  positions: [{ id: 's1', x: 100, y: 200 }],
  sourceProject: 'ATEC',
})
check('sobrescreve para grafcet', hasCrossClipboard('grafcet') && !hasCrossClipboard('electrical'))
const g = readGrafcetCrossClipboard()
check('lê etapas grafcet', !!g && g.stepIds[0] === 's1' && g.positions[0].y === 200)

// A denied system clipboard is an asynchronous rejection, not a synchronous
// throw. Local cross-project copy/paste must keep working without page errors.
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const rejected: unknown[] = []
const onUnhandled = (error: unknown) => rejected.push(error)
process.on('unhandledRejection', onUnhandled)
try {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: () => Promise.reject(new Error('Write permission denied')) } } })
  writeElectricalCrossClipboard({ components: [{ id: 'permission-denied' }], wires: [] })
  await new Promise(resolve => setTimeout(resolve, 0))
  check('clipboard recusado não produz rejeição não tratada', rejected.length === 0)
  check('clipboard local continua legível sem permissão do sistema', (readElectricalCrossClipboard()?.components[0] as { id: string })?.id === 'permission-denied')
} finally {
  process.off('unhandledRejection', onUnhandled)
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
  else Reflect.deleteProperty(globalThis, 'navigator')
}
clearCrossClipboard()
check('limpo', !hasCrossClipboard())

console.log(`cross-project-clipboard-smoke: ${n} verificações OK`)
