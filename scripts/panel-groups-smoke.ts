import assert from 'node:assert/strict'
import { createComponent } from '../src/electrical/factory'
import { useSimStore } from '../src/store/useSimStore'
import { translatePanelGroup } from '../src/three/panelGroupMove'
import type { Wire } from '../src/types'

let count = 0
const check = (ok: boolean, text: string) => { assert.ok(ok, text); console.log('PASS — ' + text); count++ }
const st = () => useSimStore.getState()
st().newProject('all')
const a = createComponent('mecRotaryArm', 'A', '', 0, 100, 100)
const b = createComponent('mecStampingTable', 'B', '', 1, 260, 140)
const c = createComponent('mecFeederCylinder', 'C', '', 2, 400, 100)
a.panel3DPosition = { x: 0, y: 1, z: 4 }
b.panel3DPosition = { x: 2, y: 2, z: 5 }
c.panel3DPosition = { x: 5, y: 1, z: 5 }
const wire = { id: 'internal', fromTerminalId: a.terminals[0].id, toTerminalId: b.id + '-test', waypoints: [{ x: 100, y: 110 }], waypoints3D: [{ x: 1, y: 1, z: 4 }] } as Wire
b.terminals = [{ ...a.terminals[0], id: b.id + '-test', componentId: b.id }]
const external = { ...wire, id: 'external', toTerminalId: c.terminals[0].id }
useSimStore.setState({ components: [a, b, c], wires: [wire, external] })
st().selectComponents([a.id, b.id])
st().groupSelection()
st().selectComponents([a.id])
check(st().selectedComponentIds.length === 2, 'um membro selecionado pela lista expande para o grupo inteiro')
st().selectComponents([a.id], false, false)
check(st().selectedComponentIds.length === 1, '«Só este» permite inspecionar um membro')
const origins = [a, b].map((component) => ({ component, pivot: component.panel3DPosition! }))
const delta = { x: 0.4, y: 0.2, z: -0.6 }
const moved = translatePanelGroup([a, b, c], [wire, external], origins, delta)
for (const o of origins) {
  const after = moved.components.find((c) => c.id === o.component.id)!
  for (const axis of ['x', 'y', 'z'] as const) assert.ok(Math.abs(after.panel3DPosition![axis] - o.pivot[axis] - delta[axis]) < 1e-9)
}
check(true, 'todos os membros recebem a mesma translação X/Y/Z')
check(moved.components[2] === c, 'elementos fora do grupo não se movem')
assert.deepEqual(moved.wires[0].waypoints3D, [{ x: 1.4, y: 1.2, z: 3.4 }])
assert.deepEqual(moved.wires[0].waypoints, [{ x: 160, y: 80 }])
check(true, 'percursos internos 2D/3D acompanham o grupo em profundidade')
check(moved.wires[1] === external, 'o percurso de um cabo ligado fora do grupo mantém-se')
const again = translatePanelGroup(moved.components, [wire, external], origins, delta)
assert.deepEqual(again, moved)
check(true, 'eventos repetidos do ponteiro não acumulam deslocamentos')
st().commitHistory()
useSimStore.setState({ ...moved, dirty: true })
st().undo()
assert.deepEqual(st().components.map((c) => c.panel3DPosition), [a, b, c].map((c) => c.panel3DPosition))
assert.deepEqual(st().wires, [wire, external])
check(true, 'um Desfazer repõe o grupo inteiro e os cabos')
st().redo()
assert.deepEqual(st().components.map((c) => c.panel3DPosition), moved.components.map((c) => c.panel3DPosition))
check(true, 'Refazer repõe o movimento do conjunto')
const saved = st().saveJSON()
st().newProject('all'); st().loadJSON(saved)
st().selectComponents([a.id])
check(st().selectedComponentIds.length === 2, 'guardar/abrir mantém o agrupamento e a seleção conjunta')
st().ungroupSelection(); st().selectComponents([a.id])
check(st().selectedComponentIds.length === 1 && st().selectionGroups.length === 0, 'desagrupar volta a permitir seleção individual')
st().groupItems('schematic', [a.id, b.id])
useSimStore.setState((s) => ({ sim: { ...s.sim, runState: 'running' } }))
check(!st().ungroupItems('schematic', [a.id]) && !st().groupItems('schematic', [b.id, c.id]), 'RUN bloqueia alterações de agrupamento')
st().stop()
console.log(`${count} verificações de agrupamento no painel passaram`)
