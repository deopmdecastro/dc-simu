/** Calha técnica: o comprimento cresce até onde cabe em vez de ser recusado em silêncio. */
import assert from 'node:assert/strict'
import { createComponent } from '../src/electrical/factory'
import { fitDuctResize } from '../src/schematic/ductResize'
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
console.log(`duct-resize-smoke: ${n} verificações OK`)
