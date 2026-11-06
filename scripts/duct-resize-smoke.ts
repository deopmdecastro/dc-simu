/** Calha técnica: o comprimento cresce até onde cabe em vez de ser recusado em silêncio. */
import assert from 'node:assert/strict'
import { createComponent } from '../src/electrical/factory'
import { fitDuctResize, fitDuctSideResize, ductEnds, ductLengthFromPointer } from '../src/schematic/ductResize'
import { ductJunctionOpenings, closedSpans } from '../src/schematic/ductJunctions'
import { adjacentDuctPlacement, slotForPoint, snapNewDuct } from '../src/schematic/ductPlacement'
import { SCHEMATIC_PX_PER_MM } from '../src/three/modelPaths'
import { componentPositionIsFree } from '../src/schematic/componentCollision'
import { useSimStore } from '../src/store/useSimStore'

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
// Criação: prolongar, ramificar e encaixar ao largar perto.
for (const rotation of [0, 90]) {
  const host = mk(600, 400, 400); host.rotation = rotation
  const mkFrom = (slot: 'left' | 'right' | 'top' | 'bottom') => {
    const p = adjacentDuctPlacement(host, slot, 300)
    return { ...mk(300), w: p.w, h: p.h, rotation: p.rotation, schematicX: p.schematicX, schematicY: p.schematicY }
  }
  const r = mkFrom('right'), l = mkFrom('left')
  const he = ductEnds(host)
  check(`prolongar à direita ${rotation}°: encosta na ponta direita`, Math.hypot(ductEnds(r).left.x - he.right.x, ductEnds(r).left.y - he.right.y) <= 1.5 && r.rotation === rotation)
  check(`prolongar à esquerda ${rotation}°: encosta na ponta esquerda`, Math.hypot(ductEnds(l).right.x - he.left.x, ductEnds(l).right.y - he.left.y) <= 1.5)
  const t = mkFrom('top'), b = mkFrom('bottom')
  check(`ramal ${rotation}°: perpendicular e abre a parede de cada lado`, t.rotation === (rotation + 90) % 360 && ductJunctionOpenings(host, [host, t]).some((o) => o.side === 'top') && ductJunctionOpenings(host, [host, b]).some((o) => o.side === 'bottom'))
}
{
  const host = mk(600, 400, 400)
  const draft = mk(600)
  const cx = host.schematicX + host.w + 20, cy = host.schematicY + host.h / 2
  check('cursor além da ponta direita → prolonga', slotForPoint(host, cx, cy) === 'right')
  check('cursor abaixo da parede → ramal para baixo', slotForPoint(host, host.schematicX + host.w / 2, host.schematicY + host.h + 10) === 'bottom')
  const s = snapNewDuct({ x: cx, y: cy }, [host], draft)
  check('largar perto encaixa e herda a largura', s !== null && s.slot === 'right' && s.placement.widthMm === 40)
  check('largar longe não encaixa', snapNewDuct({ x: cx + 5000, y: cy + 5000 }, [host], draft) === null)
}
// Fluxo real dos botões do inspetor: a segunda peça cabe parcialmente no quadro.
{
  const enclosure = createComponent('panelEnclosure', 'QE1', undefined, 0, 0, 0, { widthMm:800, heightMm:1000 })
  enclosure.w = 1200; enclosure.h = 1500
  const host = mk(400, 100, 300); host.enclosureId = enclosure.id; host.bodyColor = '#4f7fbf'
  useSimStore.getState().loadJSON(JSON.stringify({app:'dc-simu',version:6,projectKind:'all',components:[enclosure,host],wires:[]}))
  const id = useSimStore.getState().addDuctAdjacent(host.id,'right')
  const added = useSimStore.getState().components.find(c=>c.id===id)!
  check('botão prolongar: cria o maior troço que cabe em vez de recusar 400 mm', !!added && added.state.lengthMm >= 50 && added.state.lengthMm < 400)
  check('troço novo herda largura, altura, cor, quadro e seleção', added.h===host.h && added.state.widthMm===40 && added.state.heightMm===60 && added.bodyColor===host.bodyColor && added.enclosureId===enclosure.id && useSimStore.getState().selectedComponentIds[0]===id)
  check('prolongamento mantém o encosto real', Math.abs(ductEnds(added).left.x-ductEnds(host).right.x)<=1)
  check('repetir o botão na origem não sobrepõe um troço duplicado', useSimStore.getState().addDuctAdjacent(host.id,'right')===null && useSimStore.getState().components.length===3)
  useSimStore.getState().undo()
  check('desfazer remove só a calha criada', useSimStore.getState().components.length===2)
  useSimStore.getState().redo()
  check('refazer recupera a calha e o comprimento ajustado', useSimStore.getState().components.find(c=>c.id===id)?.state.lengthMm===added.state.lengthMm)
  const saved=useSimStore.getState().saveJSON(); useSimStore.getState().loadJSON(saved)
  check('guardar/reabrir preserva a junção', useSimStore.getState().components.find(c=>c.id===id)?.schematicX===added.schematicX)
  const count=useSimStore.getState().components.length, history=useSimStore.getState().history.length
  check('sem 50 mm livres não cria peça fora do quadro', useSimStore.getState().addDuctAdjacent(id!,'right')===null && useSimStore.getState().components.length===count && useSimStore.getState().history.length===history)
}
// Quatro botões, calha rodada e abertura da parede na junção, pelo store real.
for(const rotation of [0,90,180,270]) for(const slot of ['left','right','top','bottom'] as const) {
  const host=mk(400,700,700); host.rotation=rotation
  useSimStore.getState().loadJSON(JSON.stringify({app:'dc-simu',version:6,projectKind:'all',components:[host],wires:[]}))
  const id=useSimStore.getState().addDuctAdjacent(host.id,slot,180)
  const all=useSimStore.getState().components, added=all.find(c=>c.id===id)!
  check(`botão ${slot} ${rotation}° cria 180 mm`, !!added && added.state.lengthMm===180)
  if(slot==='top'||slot==='bottom') check(`ramal ${slot} ${rotation}° abre a parede real`,ductJunctionOpenings(host,all).length>0)
}
console.log(`duct-resize-smoke: ${n} verificações OK`)
