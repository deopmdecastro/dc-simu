/** Régua de bornes: TAGs X1, X2… / X1.0, X1.1…, espaçamento uniforme e encaixe na mesma folha/calha. */
import assert from 'node:assert/strict'
import { planTerminalStripRefs, TERMINAL_STRIP_GAP_PX } from '../src/electrical/pti6Strip'
import { createComponent } from '../src/electrical/factory'
import { useSimStore } from '../src/store/useSimStore'

let n = 0
const check = (name: string, ok: boolean) => { assert.ok(ok, name); n++ }
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// TAGs hierárquicas
check('X1 → X1.0 + X1.1…X1.3', eq(planTerminalStripRefs([], 'X1', 4, true), { baseRef: 'X1.0', refs: ['X1.1', 'X1.2', 'X1.3'] }))
check('continua a série: X1.3 → X1.4, X1.5', eq(planTerminalStripRefs(['X1.0', 'X1.1', 'X1.2'], 'X1.3', 3, true), { baseRef: 'X1.3', refs: ['X1.4', 'X1.5'] }))
check('salta índices ocupados sem «_1»', eq(planTerminalStripRefs(['X1.2'], 'X1', 4, true).refs, ['X1.1', 'X1.3', 'X1.4']))
check('X1.0 ocupado: a origem mantém a TAG', planTerminalStripRefs(['X1.0'], 'X1', 3, true).baseRef === 'X1')
// TAGs soltas
check('soltos: X1 → X2, X3', eq(planTerminalStripRefs([], 'X1', 3, false), { baseRef: 'X1', refs: ['X2', 'X3'] }))
check('soltos: continuam depois do maior número usado', eq(planTerminalStripRefs(['X1', 'X7'], 'X1', 3, false).refs, ['X8', 'X9']))
check('soltos a partir de X1.2 usam a família X', eq(planTerminalStripRefs([], 'X1.2', 2, false).refs, ['X1']))

// Store: posição uniforme, mesma folha, selecionados, sem TAGs duplicadas
const setup = (extra: Parameters<typeof createComponent>[0][] = []) => {
  const base = createComponent('terminalPhoenixPti6', 'X1', undefined, 0, 400, 300)
  base.sheet = 'sheet-b'
  const comps = [base, ...extra.map((t, i) => { const c = createComponent(t, `Q${i + 1}`, undefined, 0, 0, 0); return c })]
  useSimStore.setState({ components: comps, wires: [], selectedComponentIds: [base.id] } as never)
  return base
}
{
  const base = setup()
  useSimStore.getState().createTerminalStrip(base.id, 5, { hierarchical: true })
  const all = useSimStore.getState().components
  const strip = all.filter((c) => c.type === 'terminalPhoenixPti6').sort((a, b) => a.schematicX - b.schematicX)
  check('5 bornes criados', strip.length === 5)
  check('TAGs X1.0…X1.4 por ordem', eq(strip.map((c) => c.ref), ['X1.0', 'X1.1', 'X1.2', 'X1.3', 'X1.4']))
  const gaps = strip.slice(1).map((c, i) => c.schematicX - (strip[i].schematicX + strip[i].w))
  check('espaçamento igual entre todos (pente encostado)', gaps.every((g) => g === TERMINAL_STRIP_GAP_PX.hierarchical))
  check('mesma folha e mesma linha', strip.every((c) => c.sheet === 'sheet-b' && c.schematicY === 300))
  check('refs únicas', new Set(all.map((c) => c.ref)).size === all.length)
  check('seleção = a régua toda', useSimStore.getState().selectedComponentIds.length === 5)
  const st = useSimStore.getState()
  const g = st.selectionGroups.find((x) => x.view === 'schematic' && strip.every((c) => x.members.includes(c.id)))
  check('a régua fica agrupada (um grupo com os 5)', !!g && g.members.length === 5)
  check('todos partilham o mesmo stripId (o 3D encosta-os pelo corpo real)', new Set(strip.map((c) => c.state.stripId)).size === 1 && typeof strip[0].state.stripId === 'string')
}
{
  const base = setup()
  useSimStore.getState().createTerminalStrip(base.id, 4, { hierarchical: false })
  const strip = useSimStore.getState().components.filter((c) => c.type === 'terminalPhoenixPti6').sort((a, b) => a.schematicX - b.schematicX)
  const gaps = strip.slice(1).map((c, i) => c.schematicX - (strip[i].schematicX + strip[i].w))
  check('soltos: X1…X4 com folga uniforme', eq(strip.map((c) => c.ref), ['X1', 'X2', 'X3', 'X4']) && gaps.every((g) => g === TERMINAL_STRIP_GAP_PX.loose))
}
{
  // Obstáculo na linha: a régua passa para depois dele, sem sobreposição
  const base = setup()
  const blocker = createComponent('terminalPhoenixPti6', 'XB', undefined, 0, base.schematicX + base.w + 10, 300)
  blocker.sheet = 'sheet-b'
  useSimStore.setState({ components: [...useSimStore.getState().components, blocker] } as never)
  useSimStore.getState().createTerminalStrip(base.id, 3, { hierarchical: true })
  const clones = useSimStore.getState().components.filter((c) => /^X1\.[12]$/.test(c.ref))
  check('não sobrepõe aparelhos da linha', clones.every((c) => c.schematicX >= blocker.schematicX + blocker.w))
}
console.log(`terminal-strip-smoke: ${n} verificações OK`)
