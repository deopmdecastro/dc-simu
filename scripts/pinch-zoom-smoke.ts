import assert from 'node:assert/strict'
import { pinchPan, pinchZoom } from '../src/ui/usePinchZoom'
import { LADDER_ZOOM_MAX, LADDER_ZOOM_MIN, useLadderZoom } from '../src/ladder/ladderZoom'

let checks = 0
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`PASS — ${message}`) }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

check(pinchZoom(1, 2, 0.15, 5) === 2, 'afastar os dedos ao dobro duplica o zoom')
check(pinchZoom(1, 0.5, 0.15, 5) === 0.5, 'aproximar os dedos reduz o zoom')
check(pinchZoom(2, 10, 0.15, 5) === 5, 'o zoom respeita o máximo (5×)')
check(pinchZoom(1, 0.01, 0.15, 5) === 0.15, 'o zoom respeita o mínimo')

// O ponto do mundo sob o centro inicial dos dedos tem de ficar sob o centro atual.
const startPos = { x: 40, y: 20 }
const startCenter = { x: 200, y: 300 }
const world = { x: (startCenter.x - startPos.x) / 1, y: (startCenter.y - startPos.y) / 1 }
const center = { x: 230, y: 280 }
const pos = pinchPan(startPos, 1, 2.5, startCenter, center)
check(near(pos.x + world.x * 2.5, center.x) && near(pos.y + world.y * 2.5, center.y), 'o ponto sob os dedos acompanha-os durante o zoom')
const still = pinchPan(startPos, 1, 1, startCenter, startCenter)
check(near(still.x, startPos.x) && near(still.y, startPos.y), 'sem alteração de escala nem movimento a vista não muda')
const panOnly = pinchPan(startPos, 1.5, 1.5, startCenter, { x: startCenter.x + 30, y: startCenter.y - 10 })
check(near(panOnly.x, startPos.x + 30) && near(panOnly.y, startPos.y - 10), 'mover os dedos sem mudar a escala desloca a vista')

check(LADDER_ZOOM_MAX >= 3 && LADDER_ZOOM_MIN <= 0.4, 'o Ladder permite ampliar até 3× e reduzir até 0,4× (network inteira num telefone)')
useLadderZoom.getState().setZoom(99)
check(useLadderZoom.getState().zoom === LADDER_ZOOM_MAX, 'o store do Ladder limita ao máximo')
useLadderZoom.getState().setZoom(0)
check(useLadderZoom.getState().zoom === LADDER_ZOOM_MIN, 'o store do Ladder limita ao mínimo')

console.log(`\n${checks} verificações de zoom por pinça passaram.`)
