/** Calha técnica: o comprimento cresce até onde cabe em vez de ser recusado em silêncio. */
import assert from 'node:assert/strict'
import { createComponent } from '../src/electrical/factory'
import { fitDuctResize, fitDuctSideResize, ductEnds, ductLengthFromPointer } from '../src/schematic/ductResize'
import { ductJunctionOpenings, closedSpans } from '../src/schematic/ductJunctions'
import { SCHEMATIC_PX_PER_MM } from '../src/three/modelPaths'
import { componentPositionIsFree } from '../src/schematic/componentCollision'

let n = 0
const check = (name: string, ok: boolean) => { assert.ok(ok, name); n++ }
const mk = (len: number, x = 0, y = 0) => {
  const d = createComponent('cableDuct', 'CT1', undefined, 0, x, y, { lengthMm: len, widthMm: 40, heightMm: 60 })
  d.w = Math.round(len * SCHEMATIC_PX_PER_MM); d.h = Math.round(40 * SCHEMATIC_PX_PER_MM)
  return d
}
{
  const d = mk(600)
  const fit = fitDuctResize(d, [d], 1000, 40)!
  check('livre: cresce para o pedido sem limitar', fit.lengthMm === 1000 && !fit.limited)
}
{
  const d = mk(600, 100, 100)
  const blocker = createComponent('terminalPhoenixPti6', 'X1', undefined, 0, d.schematicX + d.w + 40, d.schematicY)
  const fit = fitDuctResize(d, [d, blocker], 1000, 40)!
  check('bloqueada à direita: ancora à esquerda/centro e cabe mais do que o atual', fit.lengthMm > 600)
  const grown = { ...d, w: fit.w, h: fit.h, schematicX: fit.schematicX, schematicY: fit.schematicY }
  check('o resultado não entra no aparelho', componentPositionIsFree(grown, grown.schematicX, grown.schematicY, [d, blocker], new Set([d.id])))
}
{
  const d = mk(600, 100, 100)
  const left = createComponent('terminalPhoenixPti6', 'X1', undefined, 0, 0, d.schematicY)
  left.schematicX = d.schematicX - 4 - left.w
  const right = createComponent('terminalPhoenixPti6', 'X2', undefined, 0, d.schematicX + d.w + 4, d.schematicY)
  const fit = fitDuctResize(d, [d, left, right], 1500, 40)
  check('encurralada: fica no comprimento atual e marca como limitada', fit !== null && fit.limited && fit.lengthMm === 600)
}
// Barras esquerda/direita: a ponta oposta não se mexe, nem rodada.
for (const rotation of [0, 90, 180, 270]) {
  const d = mk(600, 300, 300); d.rotation = rotation
  const before = ductEnds(d)
  const r = fitDuctSideResize(d, [d], 'right', 900)!
  const grown = { ...d, w: r.w, h: r.h, schematicX: r.schematicX, schematicY: r.schematicY }
  const after = ductEnds(grown)
  check(`direita ${rotation}°: ponta esquerda fixa`, Math.abs(after.left.x - before.left.x) <= 1 && Math.abs(after.left.y - before.left.y) <= 1 && r.lengthMm === 900)
  const l = fitDuctSideResize(d, [d], 'left', 400)!
  const shrunk = { ...d, w: l.w, h: l.h, schematicX: l.schematicX, schematicY: l.schematicY }
  const a2 = ductEnds(shrunk)
  check(`esquerda ${rotation}°: reduz e a ponta direita fica`, Math.abs(a2.right.x - before.right.x) <= 1 && Math.abs(a2.right.y - before.right.y) <= 1 && l.lengthMm === 400)
}
{
  const d = mk(600, 100, 100)
  const end = ductEnds(d).right
  check('rato na ponta direita +100 mm dá 700 mm', ductLengthFromPointer(d, 'right', { x: end.x + 100 * SCHEMATIC_PX_PER_MM, y: end.y }) === 700)
}
{
  const d = mk(600, 100, 100)
  const blocker = createComponent('terminalPhoenixPti6', 'X1', undefined, 0, d.schematicX + d.w + 40, d.schematicY)
  const r = fitDuctSideResize(d, [d, blocker], 'right', 1500)
  check('barra direita para antes do aparelho', r !== null && r.limited && r.lengthMm > 600 && r.lengthMm < 1500)
}
// Junções: a calha vertical desemboca na parede da horizontal → parede aberta, dedos partidos.
{
  const h = mk(600, 100, 200)
  const v = mk(300, 0, 0); v.rotation = 90
  v.schematicX = Math.round(h.schematicX + h.w / 2 - v.w / 2)
  v.schematicY = Math.round(h.schematicY - v.w / 2 + 3 - v.h / 2) // centro tal que a ponta de baixo entra 3 px na parede de cima
  const op = ductJunctionOpenings(h, [h, v])
  check('T: a horizontal abre a parede de cima', op.length === 1 && op[0].side === 'top' && op[0].to - op[0].from > 30)
  const far = mk(300, 0, 0); far.rotation = 90; far.schematicX = v.schematicX; far.schematicY = h.schematicY - 600
  check('calha longe não abre nada', ductJunctionOpenings(h, [h, far]).length === 0)
  const par = mk(600, 100, 200 + h.h + 1)
  check('paralelas lado a lado não abrem', ductJunctionOpenings(h, [h, par]).length === 0)
  const spans = closedSpans(600, op, 'top')
  check('a fita fica em dois troços com vão no meio', spans.length === 2 && spans[0][1] <= op[0].from + 0.01 && spans[1][0] >= op[0].to - 0.01)
  check('o lado de baixo fica inteiro', closedSpans(600, op, 'bottom').length === 1)
}
console.log(`duct-resize-smoke: ${n} verificações OK`)
