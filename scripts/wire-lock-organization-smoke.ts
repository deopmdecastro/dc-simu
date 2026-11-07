import assert from 'node:assert/strict'
import { nativePartidaDiretaContent } from '../src/project/nativeProjects'
import { useSimStore } from '../src/store/useSimStore'
import type { Wire } from '../src/types'

let checks = 0
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++ }
const st = () => useSimStore.getState()
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))
st().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
useSimStore.setState({ demoMode: false, history: [], future: [] })
const [first, second] = st().wires
st().updateWire(first.id, { waypoints3D: [{ x: 12, y: 12, z: 12 }] })
st().updateWire(second.id, { waypoints3D: [{ x: 14, y: 14, z: 14 }], curveOffset: 20 })
st().setWiresLocked(true, [first.id])
check(st().history.length === 1 && st().wires.find(w => w.id === first.id)?.locked, 'bloquear cabo é uma única ação de histórico')
const locked = plain(st().wires.find(w => w.id === first.id))
const historyCount = st().history.length
st().updateWire(first.id, { color: 'pink', fromTerminalId: 'outra-ponta', waypoints3D: [] })
st().deleteWire(first.id)
assert.deepEqual(plain(st().wires.find(w => w.id === first.id)), locked); checks++
check(st().history.length === historyCount, 'edição e eliminação bloqueadas não criam histórico vazio')
st().setWiresLocked(true, [first.id])
check(st().history.length === historyCount, 'bloqueio repetido não cria histórico vazio')

const before = plain(st().wires)
st().organizeWires()
const organized = plain(st().wires)
assert.deepEqual(plain(st().wires.find(w => w.id === first.id)), locked); checks++
check(st().wires.filter(w => !w.locked).every(w => !w.waypoints3D), 'organizar recalcula o traçado 3D dos cabos desbloqueados')
check(st().wires.find(w => w.id === second.id)!.waypoints!.length > 0, 'organizar planeia percursos 2D contornando equipamentos')
const electrical = (wires: Wire[]) => wires.map(({ route, bend, curveOffset, waypoints, waypoints3D, ...wire }) => wire)
assert.deepEqual(electrical(organized), electrical(before)); checks++
st().undo()
assert.deepEqual(plain(st().wires), before); checks++
st().redo()
assert.deepEqual(plain(st().wires), organized); checks++
st().loadJSON(st().saveJSON())
assert.deepEqual(plain(st().wires), organized); checks++
st().setWiresLocked(false, [first.id])
st().updateWire(first.id, { color: 'pink' })
check(st().wires.find(w => w.id === first.id)?.color === 'pink', 'desbloquear permite editar novamente')

const other = plain(st().wires.find(w => w.id === second.id))
st().organizeWires([first.id])
assert.deepEqual(plain(st().wires.find(w => w.id === second.id)), other); checks++
const count = st().history.length
st().organizeWires([])
check(st().history.length === count, 'seleção vazia não organiza todos os cabos')
st().setWiresLocked(true)
check(st().wires.every(w => w.locked), 'bloquear todos protege todos os cabos atuais')
const allLocked = plain(st().wires)
const lockedHistory = st().history.length
st().organizeWires()
st().autoNumberWires('all')
assert.deepEqual(plain(st().wires), allLocked); checks++
check(st().history.length === lockedHistory, 'organização e numeração sem cabos editáveis não criam histórico')
st().step()
check(st().wires.every(w => w.locked) && st().wires.some(w => w.energized), 'bloqueio não impede cálculo elétrico nem se perde durante a simulação')
st().setWiresLocked(false)
check(st().wires.every(w => !w.locked), 'desbloquear todos repõe edição')

for (const mode of ['running', 'paused'] as const) {
  useSimStore.setState({ sim: { ...st().sim, runState: mode } })
  const state = plain(st().wires), history = st().history.length
  st().setWiresLocked(true); st().organizeWires()
  assert.deepEqual(plain(st().wires), state); checks++
  check(st().history.length === history, `${mode}: bloqueio e organização indisponíveis sem alterar o histórico`)
}
useSimStore.setState({ sim: { ...st().sim, runState: 'stopped' }, demoMode: true })
const demo = plain(st().wires)
st().setWiresLocked(true); st().organizeWires()
assert.deepEqual(plain(st().wires), demo); checks++
useSimStore.setState({ demoMode: false })
st().setWiresLocked(true, [first.id])
const number = st().wires.find(w => w.id === first.id)!.number
st().autoNumberWires('all')
check(st().wires.find(w => w.id === first.id)!.number === number && new Set(st().wires.map(w => w.number)).size === st().wires.length, 'renumerar mantém números bloqueados sem criar duplicados')
const freeId = st().addWire3D({ point: { x: 10, y: 4, z: 1 } }, { point: { x: 12, y: 5, z: 2 } }, [{ x: 11, y: 7, z: 1.5 }])!
const free = plain(st().wires.find(w => w.id === freeId))
st().organizeWires([freeId])
const organizedFree = st().wires.find(w => w.id === freeId)!
assert.deepEqual(organizedFree.fromPoint3D, free.fromPoint3D); checks++
assert.deepEqual(organizedFree.toPoint3D, free.toPoint3D); checks++
check(!organizedFree.waypoints3D, 'cabo livre pode voltar ao cálculo automático sem mudar as pontas')
console.log(`PASS — ${checks} verificações de bloqueio, organização 2D/3D, ligações, histórico e persistência`)
