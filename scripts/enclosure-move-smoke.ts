/** Mover o quadro leva o conteúdo (aparelhos, calhas, pontos de passagem dos cabos); o resto fica. */
import assert from 'node:assert/strict'
import { useSimStore } from '../src/store/useSimStore'

let n = 0
const check = (name: string, ok: boolean) => { assert.ok(ok, name); n++ }
const st = () => useSimStore.getState()
const get = (id: string) => st().components.find((c) => c.id === id)!
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

st().newProject?.()
for (const c of [...st().components]) st().deleteComponents([c.id])

const enc = st().addComponent('panelEnclosure', 0, 0)!            // 900 × 1200 px
const rail = st().addComponent('dinRail15x55', 100, 300)!
st().setRailLength(rail, 400, 'left')       // 1 m não cabe: encurta e põe dentro do quadro
st().moveComponent(rail, 100, 400)
const qa = st().addComponent('breaker3p', 150, 250)!
const qb = st().addComponent('breaker3p', 400, 250)!
const motor = st().addComponent('motor3ph', 200, 700)!              // máquina: nunca vai com o quadro
const outside = st().addComponent('breaker3p', 1300, 250)!          // fora do quadro
check('componentes criados', [enc, rail, qa, qb, motor, outside].every(Boolean))

const ta = get(qa).terminals[0].id, tb = get(qb).terminals[0].id
st().addWire(ta, tb, undefined, [{ x: 300, y: 500 }])
const wire = st().wires.at(-1)!
useSimStore.setState((s) => ({ wires: s.wires.map((x) => (x.id === wire.id ? { ...x, waypoints3D: [{ x: 1, y: 2, z: 0.3 }] } : x)) }))

const before = Object.fromEntries([enc, rail, qa, qb, motor, outside].map((id) => [id, { x: get(id).schematicX, y: get(id).schematicY }]))
const wpBefore = st().wires.find((w) => w.id === wire.id)!

// Arrasto em dois passos seguidos (mesma sessão).
st().moveComponent(enc, before[enc].x + 30, before[enc].y + 20)
st().moveComponent(enc, before[enc].x + 60, before[enc].y + 40)
const moved = (id: string) => get(id).schematicX - before[id].x === 60 && get(id).schematicY - before[id].y === 40
check('o quadro move-se', moved(enc))
check('a calha DIN dentro do quadro acompanha', moved(rail))
check('os aparelhos dentro do quadro acompanham', moved(qa) && moved(qb))
check('o motor (máquina) não acompanha', get(motor).schematicX === before[motor].x && get(motor).schematicY === before[motor].y)
check('o aparelho fora do quadro não acompanha', get(outside).schematicX === before[outside].x)

const w = st().wires.find((x) => x.id === wire.id)!
check('pontos de passagem 2D acompanham', w.waypoints?.[0].x === wpBefore.waypoints![0].x + 60 && w.waypoints?.[0].y === wpBefore.waypoints![0].y + 40)
{
  check('pontos de passagem 3D acompanham (Y do 3D é o inverso do esquema)', Math.abs(w.waypoints3D![0].x - wpBefore.waypoints3D[0].x - 0.4) < 1e-9 && Math.abs(w.waypoints3D![0].y - wpBefore.waypoints3D[0].y + 0.2667) < 1e-3)
}

// Na mesma sessão, o quadro passa por cima do aparelho de fora: não o apanha.
st().moveComponent(enc, 1000, before[enc].y + 40)
check('o quadro não apanha aparelhos por onde passa durante o arrasto', get(outside).schematicX === before[outside].x)

// Nova sessão (pausa): o que agora está dentro passa a acompanhar.
await sleep(700)
const insideNow = get(outside).schematicX >= get(enc).schematicX && get(outside).schematicX + get(outside).w <= get(enc).schematicX + get(enc).w
const outsideX = get(outside).schematicX
st().moveComponent(enc, get(enc).schematicX + 20, get(enc).schematicY)
check('numa nova sessão o conteúdo é recalculado', insideNow ? get(outside).schematicX === outsideX + 20 : get(outside).schematicX === outsideX)

console.log(`[enclosure-move] OK — ${n} verificações`)
