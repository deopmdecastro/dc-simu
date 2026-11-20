import assert from 'node:assert/strict'
import * as THREE from 'three'
import { catalogPaletteGroup } from '../src/catalog/paletteGroup'
import { buildEnclosure, INNER_COVER_OUTLINE_DEFAULT_COLOR, setInnerCoverInset, setInnerCoverOutlineColor } from '../src/three/enclosureParts'
import { innerCoverInsetOf, modularCoverLayout, vacantCoverBlanks } from '../src/three/modularCoverLayout'

const dims = { widthMm: 600, heightMm: 800, depthMm: 250 }
const material = new THREE.MeshBasicMaterial()
const parts = buildEnclosure(dims, 1, { body: material, plate: material, gasket: material, metal: material, dark: material }, 'right', 4)
const cover = parts.innerCover
const plate = cover.getObjectByName('enclosure-inner-cover-plate') as THREE.Mesh
const outline = cover.getObjectByName('enclosure-inner-cover-outline') as THREE.LineSegments<THREE.BufferGeometry, THREE.LineDashedMaterial>

// Recuo: só translação do grupo; a face frontal da chapa acompanha o valor pedido.
const frontZ = () => { cover.updateMatrixWorld(true); return new THREE.Box3().setFromObject(plate).max.z }
setInnerCoverInset(cover, dims, 42, 1)
const z42 = frontZ()
setInnerCoverInset(cover, dims, 61, 1)
assert.ok(Math.abs((z42 - frontZ()) - 19) < 1e-6, 'recuo 42→61 mm recua a chapa 19 mm')
setInnerCoverInset(cover, dims, 5, 1)
assert.equal(cover.position.z, (42 - 20), 'recuo abaixo do mínimo fica em 20 mm')
assert.equal(innerCoverInsetOf(dims, 'x'), 42, 'recuo inválido volta ao padrão')
assert.equal(innerCoverInsetOf(dims, 999), dims.depthMm - 45, 'recuo limitado pela profundidade')

// Cor do tracejado.
setInnerCoverOutlineColor(cover, '#dc2626')
assert.equal(outline.material.color.getHexString(), 'dc2626')
setInnerCoverOutlineColor(cover, 'not-a-color')
assert.equal('#' + outline.material.color.getHexString(), INNER_COVER_OUTLINE_DEFAULT_COLOR)

// Layout = geometria 3D: as janelas do layout coincidem com os vazios da chapa.
const layout = modularCoverLayout(dims, 4, 42)
assert.equal(layout.rows, 4)
const plateBox = new THREE.Box3().setFromObject(plate)
assert.ok(Math.abs(plateBox.max.x - plateBox.min.x - layout.widthMm) < 1e-6, 'largura da chapa = largura do layout')

// Obturadores: vaga livre = janela menos a projeção real dos aparelhos (inclui desalinhados).
const row = layout.openings[1]
const empty = vacantCoverBlanks(layout, [])
assert.ok(empty.length >= layout.rows, 'sem aparelhos todas as janelas são obturadas')
const occupied = vacantCoverBlanks(layout, [{ xMm: 7, yMm: row.yMm, widthMm: 36, heightMm: 85 }])
const rowBlanks = occupied.filter(b => b.yMm === row.yMm)
assert.ok(rowBlanks.every(b => b.xMm + b.widthMm / 2 <= 7 - 18 + 1e-6 || b.xMm - b.widthMm / 2 >= 7 + 18 - 1e-6), 'nenhum obturador tapa o aparelho')
const covered = rowBlanks.reduce((sum, b) => sum + b.widthMm, 0)
assert.ok(Math.abs(covered - (row.widthMm - 36 - 1.2)) < 1e-6, 'o resto da janela fica obturado')
assert.ok(rowBlanks.every(b => b.widthMm <= 216), 'tiras de no máximo 12 módulos')

// Pastas do catálogo oficial: o texto livre não mete botoneiras na pasta dos relés.
const builtin = [['relay', 'Relés'], ['relay', 'Relés'], ['command', 'Comando'], ['protection', 'Proteção']] as const
assert.equal(catalogPaletteGroup('command', 'Relés', builtin), 'Catálogo oficial · Comando')
assert.equal(catalogPaletteGroup('command', 'reles', builtin), 'Catálogo oficial · Comando')
assert.equal(catalogPaletteGroup('relay', 'Relés', builtin), 'Catálogo oficial · Relés')
assert.equal(catalogPaletteGroup('command', 'Botoneiras Ø22', builtin), 'Catálogo oficial · Botoneiras Ø22')
assert.equal(catalogPaletteGroup('command', '', builtin), 'Catálogo oficial')
console.log('inner-cover smoke OK')
