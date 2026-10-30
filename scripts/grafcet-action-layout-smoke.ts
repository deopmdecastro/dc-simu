import assert from 'node:assert/strict'
import { attachedActionBoxes, cloneActions } from '../src/grafcet/actionLayout'
import { cloneSubDiagram } from '../src/grafcet/selection'
import { readGrafcetFile } from '../src/grafcet/importFile'
import type { GrafcetAction, GrafcetStep } from '../src/grafcet/engine'

let checks = 0
const check = (ok: unknown, message: string) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
const action = (id: string, patch: Partial<GrafcetAction> = {}): GrafcetAction => ({ id, address: id, condition: '1', ...patch })
const step = { x: 180, y: 100, w: 64, h: 54 }
const size = (a: GrafcetAction) => ({ w: a.w ?? 140, h: a.h ?? 30 })
const layout = (actions: GrafcetAction[], mode: 'row' | 'column' = 'row') => attachedActionBoxes(actions, step, mode, size)
const imported = action('green', { dx: 80, dy: 20, w: 90, h: 40 })
const yellow = action('yellow', { afterActionId: 'green', w: 120, h: 30 })
let boxes = layout([imported, yellow])
check(boxes.get('yellow')!.x === boxes.get('green')!.x + 90 && boxes.get('yellow')!.y + 15 === boxes.get('green')!.y + 20, 'ação ligada encaixa após a caixa importada, alinhando centros e respeitando medidas')
boxes = layout([{ ...imported, dx: 130, dy: 80, w: 180 }, yellow])
check(boxes.get('yellow')!.x === 490 && boxes.get('yellow')!.y === 185, 'a cadeia acompanha deslocamento e redimensionamento da ação anterior')
boxes = layout([yellow, imported, action('third', { afterActionId: 'yellow' })])
check(boxes.get('third')!.x === boxes.get('yellow')!.x + 120, 'cadeias de três ações funcionam independentemente da ordem no ficheiro')
boxes = layout([imported, action('normal')])
check(boxes.get('normal')!.x >= boxes.get('green')!.x + 90, 'uma posição automática não cobre uma caixa importada')
boxes = layout([action('a'), action('b')], 'column')
check(boxes.get('b')!.y === boxes.get('a')!.y + 38 && boxes.get('a')!.x === boxes.get('b')!.x, 'a disposição em coluna mantém espaçamento e alinhamento')
boxes = layout([action('a', { afterActionId: 'b' }), action('b', { afterActionId: 'a' }), action('c', { afterActionId: 'missing' })])
check(boxes.size === 3 && [...boxes.values()].every(b => Number.isFinite(b.x) && Number.isFinite(b.y)), 'ciclos e referências ausentes não bloqueiam o editor nem escondem ações')
let next = 0
const copied = cloneActions([imported, yellow], () => `new-${++next}`)
check(copied[1].afterActionId === copied[0].id && copied[0].id !== imported.id, 'duplicar ações remapeia as ligações internas')
const original: GrafcetStep = { id: 's', name: '1', initial: true, action: '', condition: '', actions: [imported, yellow] }
const clone = cloneSubDiagram([original], [], ['s'], () => step, { dx: 40, dy: 40 }, () => `new-${++next}`).steps[0]
check(clone.actions![1].afterActionId === clone.actions![0].id, 'copiar e colar etapas preserva as cadeias sem apontar para o original')
const bytes = new TextEncoder().encode(JSON.stringify({ steps: [original] }))
const loaded = await readGrafcetFile({ name: 'chain.grafcet', size: bytes.length, arrayBuffer: async () => bytes.buffer })
check(loaded.program.steps[0].actions![1].afterActionId === imported.id, 'exportar e reimportar JSON preserva a ligação gráfica')
const invalid = new TextEncoder().encode(JSON.stringify({ steps: [{ ...original, actions: [{ ...yellow, afterActionId: 12 }] }] }))
await assert.rejects(readGrafcetFile({ name: 'invalid.grafcet', size: invalid.length, arrayBuffer: async () => invalid.buffer }))
check(true, 'a importação recusa uma referência de ação com tipo inválido')
console.log(`${checks} verificações de disposição de ações passaram.`)
