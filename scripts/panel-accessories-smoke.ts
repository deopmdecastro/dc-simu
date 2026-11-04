/** Quadro metálico, calha técnica e perfis DIN: medidas, geometria, colisões e diagnóstico. */
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  applyWorldUv, buildCableDuct, buildEnclosure, CABLE_DUCT, cableDuctDimsOf, ENCLOSURE, ENCLOSURE_PLATE_FRONT_MM,
  enclosureDimsOf, isPanelAccessoryType, panelAccessorySizeMm,
} from '../src/three/enclosureParts'
import { buildDinRailGroup, DIN_RAIL_PROFILES, dinRailProfileOf, railSlotCount } from '../src/three/dinRailGeometry'
import { createComponent, TEMPLATES } from '../src/electrical/factory'
import { component3DDimensions } from '../src/three/terminal3D'
import { componentPositionIsFree } from '../src/schematic/componentCollision'
import { detectDiagnostics } from '../src/utils/errorDetection'
import { hasIecSymbol, iecAssociationOf } from '../src/electrical/iecAssociation'
import { isPanelBound } from '../src/three/panelBounds'

let n = 0
const check = (name: string, ok: boolean) => { assert.ok(ok, name); n++ }
const mat = new THREE.MeshBasicMaterial()
const mats = { body: mat, plate: mat, gasket: mat, metal: mat, dark: mat }
const box = (o: THREE.Object3D) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o) }
const names = (o: THREE.Object3D) => { const out: string[] = []; o.traverse((x) => { if ((x as THREE.Mesh).isMesh) out.push(x.name) }); return out }

// Medidas: limites e valores por omissão.
check('quadro: medidas por omissão 600×800×250', JSON.stringify(enclosureDimsOf({})) === JSON.stringify({ widthMm: 600, heightMm: 800, depthMm: 250 }))
check('quadro: medidas limitadas', enclosureDimsOf({ widthMm: 5, heightMm: 99999, depthMm: 'x' }).widthMm === ENCLOSURE.minWidthMm && enclosureDimsOf({ heightMm: 99999 }).heightMm === ENCLOSURE.maxHeightMm)
check('calha técnica: medidas limitadas', cableDuctDimsOf({ lengthMm: 1 }).lengthMm === CABLE_DUCT.minLengthMm && cableDuctDimsOf({}).widthMm === 40)
check('tamanho real vem do estado', JSON.stringify(panelAccessorySizeMm('panelEnclosure', { widthMm: 400, heightMm: 500, depthMm: 200 })) === JSON.stringify({ x: 400, y: 500, z: 200 }))
check('quadro, calha técnica e espiral são acessórios', isPanelAccessoryType('panelEnclosure') && isPanelAccessoryType('cableDuct') && isPanelAccessoryType('spiralWrap') && !isPanelAccessoryType('dinRail15x55'))

// Quadro: corpo dentro das medidas, porta fechada à frente, dobradiças e fechos.
{
  const unit = 1 // mm
  const parts = buildEnclosure({ widthMm: 600, heightMm: 800, depthMm: 250 }, unit, mats, 'right')
  const b = box(parts.body)
  check('corpo do quadro com 600 × 800 mm (+ folhas das dobradiças e suportes de parede)', b.max.x - b.min.x >= 600 && b.max.x - b.min.x <= 612 && b.max.y - b.min.y <= 800 + 40)
  check('chapa de montagem: face no plano ENCLOSURE_PLATE_FRONT_MM', (() => {
    const plate = parts.body.children.find((m) => m.name === 'enclosure-mounting-plate')!
    return Math.abs(box(plate).max.z - ENCLOSURE_PLATE_FRONT_MM) < 0.01
  })())
  const required = ['enclosure-back', 'enclosure-shell', 'enclosure-mounting-plate', 'enclosure-gland', 'enclosure-standoffs', 'enclosure-hinge-body']
  check('corpo: fundo, carcaça, chapa, fundo de bucins, espaçadores e dobradiças', required.every((name) => names(parts.body).includes(name)))
  check('porta: painel, junta, fechos e dobradiças', ['enclosure-door-panel', 'enclosure-gasket', 'enclosure-lock-bezel', 'enclosure-lock-insert', 'enclosure-hinge-door'].every((name) => names(parts.door).includes(name)))
  const closed = box(parts.door)
  check('porta fechada cobre a frente do quadro', closed.min.z >= 245 && closed.max.x - closed.min.x >= 600)
  parts.door.rotation.y = parts.openSign * THREE.MathUtils.degToRad(ENCLOSURE.openDeg)
  const open = box(parts.door)
  check('porta aberta roda para fora (dobradiças à direita)', open.max.z > 250 + 500 && open.min.x > 0)
  const left = buildEnclosure({ widthMm: 600, heightMm: 800, depthMm: 250 }, unit, mats, 'left')
  left.door.rotation.y = left.openSign * THREE.MathUtils.degToRad(ENCLOSURE.openDeg)
  check('dobradiças à esquerda: abre para a esquerda', box(left.door).max.x < 0 && box(left.door).max.z > 750)
  const tall = buildEnclosure({ widthMm: 800, heightMm: 1600, depthMm: 400 }, unit, mats)
  const hingeCount = (p: ReturnType<typeof buildEnclosure>) => (p.door.children.find((m) => m.name === 'enclosure-hinge-door') as THREE.Mesh).geometry.getAttribute('position').count
  check('quadro alto tem 3 dobradiças (baixo tem 2)', hingeCount(tall) / hingeCount(parts) === 1.5)
}

// Calha técnica: dedos ao longo do comprimento e tampa opcional.
{
  const duct = buildCableDuct({ lengthMm: 600, widthMm: 40, heightMm: 60 }, 1, { body: mat, cover: mat }, true)
  const b = box(duct)
  check('calha técnica 600 × 40 × 60 (+ tampa)', Math.abs(b.max.x - b.min.x - 600) < 0.5 && Math.abs(b.max.y - b.min.y - 41.6) < 0.5 && b.max.z > 60 && b.min.z === 0)
  check('com tampa: corpo + tampa', names(duct).join() === 'cable-duct-body,cable-duct-cover')
  check('sem tampa: só o corpo', names(buildCableDuct({ lengthMm: 600, widthMm: 40, heightMm: 60 }, 1, { body: mat, cover: mat }, false)).join() === 'cable-duct-body')
  const fingers = (len: number) => (buildCableDuct({ lengthMm: len, widthMm: 40, heightMm: 60 }, 1, { body: mat, cover: mat }, false).children[0] as THREE.Mesh).geometry.getAttribute('position').count
  check('mais comprimento → mais dedos (o passo nunca estica)', fingers(1200) > fingers(600) * 1.9)
}

// Perfis DIN: TS35 de 7,5 e 15 mm, furação opcional.
{
  for (const [id, profile] of Object.entries(DIN_RAIL_PROFILES)) {
    const b = box(buildDinRailGroup(500, 1, mat, profile))
    check(`perfil ${id}: largura e altura reais`, Math.abs(b.max.y - b.min.y - profile.width) <= profile.thickness + 0.01 && Math.abs(b.max.z - b.min.z - profile.height) < 0.01)
  }
  check('perfil guardado no estado', dinRailProfileOf({ profile: '35×15 mm' }).height === 15 && dinRailProfileOf({ profile: '?' }).height === 5.5)
  check('furos dependem do passo do perfil', railSlotCount(500, DIN_RAIL_PROFILES['35×7,5 mm']) === 20)
  const plain = buildDinRailGroup(500, 1, mat, DIN_RAIL_PROFILES['35×7,5 mm'], false)
  const perforated = buildDinRailGroup(500, 1, mat, DIN_RAIL_PROFILES['35×7,5 mm'], true)
  const verts = (g: THREE.Group) => (g.children[0] as THREE.Mesh).geometry.getAttribute('position').count
  check('calha sem furos tem fundo liso', verts(plain) < verts(perforated))
}

// UV à escala real: a mesma distância dá a mesma repetição, qualquer que seja o tamanho.
{
  const geo = new THREE.BoxGeometry(1000, 10, 10)
  applyWorldUv(geo, 1, 200)
  const uv = geo.getAttribute('uv')
  let max = -Infinity, min = Infinity
  for (let i = 0; i < uv.count; i++) { max = Math.max(max, uv.getX(i)); min = Math.min(min, uv.getX(i)) }
  check('UV: 1000 mm com tile de 200 mm = 5 repetições', Math.abs(max - min - 5) < 1e-6)
}

// Fábrica, dimensões 3D, IEC e montagem.
{
  const enc = createComponent('panelEnclosure', 'QE1', undefined, 0, 0, 0)
  check('fábrica: quadro 900 × 1200 px (600 × 800 mm)', enc.w === 900 && enc.h === 1200 && enc.state.doorOpen === true && enc.terminals.length === 0)
  check('fábrica: grupo «Quadros e calhas»', TEMPLATES.panelEnclosure.group === 'Quadros e calhas' && TEMPLATES.cableDuct.group === 'Quadros e calhas')
  check('dimensões 3D acompanham o estado', Math.abs(component3DDimensions({ ...enc, state: { ...enc.state, widthMm: 400 } }).x - 4) < 1e-9)
  const rail = createComponent('dinRail15x55', 'TR1', undefined, 0, 0, 0)
  check('dimensões 3D da calha seguem o perfil', Math.abs(component3DDimensions({ ...rail, state: { ...rail.state, profile: '35×15 mm' } }).z - 0.15) < 1e-9)
  check('IEC: quadro e calha técnica não são símbolos de circuito', /invólucro/.test(iecAssociationOf('panelEnclosure').iec60617 ?? '') && !hasIecSymbol('panelEnclosure') && !hasIecSymbol('cableDuct'))
  check('o quadro não conta para a chapa automática; a calha técnica sim', !isPanelBound(enc) && isPanelBound(createComponent('cableDuct', 'CT1', undefined, 0, 0, 0)))
}

// Colisões e diagnóstico: o quadro contém aparelhos; calhas técnicas encontram-se nos cantos.
{
  const enc = createComponent('panelEnclosure', 'QE1', undefined, 0, 0, 0)
  const breaker = createComponent('breaker3p', 'QF1', undefined, 0, 200, 200)
  const ductA = createComponent('cableDuct', 'CT1', undefined, 0, 100, 600)
  const ductB = { ...createComponent('cableDuct', 'CT2', undefined, 0, 100, 600), id: 'ct2' }
  check('aparelho dentro do quadro é posição livre', componentPositionIsFree(breaker, breaker.schematicX, breaker.schematicY, [enc]))
  check('duas calhas técnicas podem cruzar-se', componentPositionIsFree(ductB, ductB.schematicX, ductB.schematicY, [ductA]))
  check('calha técnica não entra num aparelho', !componentPositionIsFree({ ...ductA, schematicX: 150, schematicY: 220 }, 150, 220, [breaker]))
  const diags = detectDiagnostics([enc, breaker, ductA], [], new Set())
  check('sem aviso de sobreposição para o quadro', !diags.some((d) => /sobrepostos/.test(d.message)))
}

console.log(`[panel-accessories] OK — ${n} verificações`)
