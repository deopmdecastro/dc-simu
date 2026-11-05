import { closedSpans, inOpening, type DuctOpening } from '../schematic/ductJunctions'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Quadro elétrico (armário metálico com porta) e calha técnica ranhurada com tampa —
 * geradores paramétricos em mm, sem DOM (usados pelo Painel 3D e por scripts de GLB).
 *
 * `unit` = unidades de cena por mm (0.01 no Painel 3D; 0.001 para GLB em metros).
 * Referencial: largura/comprimento em X, altura em Y, profundidade em Z (0 = parede do fundo
 * no quadro, 0 = face da chapa na calha técnica), tal como montado no painel.
 */

export type EnclosureHinge = 'left' | 'right'

export const ENCLOSURE = {
  minWidthMm: 200, maxWidthMm: 1600,
  minHeightMm: 200, maxHeightMm: 2200,
  minDepthMm: 120, maxDepthMm: 600,
  defaultWidthMm: 600, defaultHeightMm: 800, defaultDepthMm: 250,
  /** chapa do corpo e da porta */
  sheet: 1.5,
  /** aba frontal (moldura da abertura) */
  flange: 18,
  /** distância da chapa de montagem ao fundo (espaçadores) */
  standoff: 10,
  plate: 2.5,
  doorReturn: 20,
  /** ângulo da porta aberta (graus) */
  openDeg: 110,
} as const

/** Face frontal da chapa de montagem (mm a partir da parede do fundo): o plano onde assentam as calhas. */
export const ENCLOSURE_PLATE_FRONT_MM = ENCLOSURE.sheet + ENCLOSURE.standoff + ENCLOSURE.plate

export const CABLE_DUCT = {
  minLengthMm: 50, maxLengthMm: 3000,
  defaultLengthMm: 600, defaultWidthMm: 40, defaultHeightMm: 60,
  widthsMm: [25, 40, 60, 80, 100, 120, 150] as number[],
  heightsMm: [25, 40, 60, 80, 100, 120, 150] as number[],
  wall: 1.8,
  base: 2,
  slot: 4.5,
  pitch: 12.5,
} as const

export const ENCLOSURE_TYPE = 'panelEnclosure'
export const CABLE_DUCT_TYPE = 'cableDuct'
export const SPIRAL_WRAP_TYPE = 'spiralWrap'
export const isEnclosureType = (type: string): boolean => type === ENCLOSURE_TYPE
export const isCableDuctType = (type: string): boolean => type === CABLE_DUCT_TYPE
export const isSpiralWrapType = (type: string): boolean => type === SPIRAL_WRAP_TYPE
/** Peças mecânicas do quadro (não são aparelhos: sem bornes, fora do encaminhamento dos cabos). */
export const isPanelAccessoryType = (type: string): boolean => isEnclosureType(type) || isCableDuctType(type) || isSpiralWrapType(type)

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : Number(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback
}

export interface EnclosureDims { widthMm: number; heightMm: number; depthMm: number }
export function enclosureDimsOf(state: Record<string, unknown> | undefined): EnclosureDims {
  return {
    widthMm: clamp(state?.widthMm, ENCLOSURE.minWidthMm, ENCLOSURE.maxWidthMm, ENCLOSURE.defaultWidthMm),
    heightMm: clamp(state?.heightMm, ENCLOSURE.minHeightMm, ENCLOSURE.maxHeightMm, ENCLOSURE.defaultHeightMm),
    depthMm: clamp(state?.depthMm, ENCLOSURE.minDepthMm, ENCLOSURE.maxDepthMm, ENCLOSURE.defaultDepthMm),
  }
}
export const enclosureHingeOf = (state: Record<string, unknown> | undefined): EnclosureHinge => state?.hingeSide === 'left' ? 'left' : 'right'

export interface CableDuctDims { lengthMm: number; widthMm: number; heightMm: number }
export function cableDuctDimsOf(state: Record<string, unknown> | undefined): CableDuctDims {
  return {
    lengthMm: clamp(state?.lengthMm, CABLE_DUCT.minLengthMm, CABLE_DUCT.maxLengthMm, CABLE_DUCT.defaultLengthMm),
    widthMm: clamp(state?.widthMm, 15, 150, CABLE_DUCT.defaultWidthMm),
    heightMm: clamp(state?.heightMm, 20, 150, CABLE_DUCT.defaultHeightMm),
  }
}

export interface SpiralWrapDims { lengthMm: number; innerDiaMm: number; pitchMm: number }
export function spiralWrapDimsOf(state: Record<string, unknown> | undefined): SpiralWrapDims {
  return {
    lengthMm: clamp(state?.lengthMm, 50, 2000, 300),
    innerDiaMm: clamp(state?.innerDiaMm, 4, 40, 10),
    pitchMm: clamp(state?.pitchMm, 4, 30, 8),
  }
}

/** Tamanho real (mm) ocupado pela peça: X × Y no plano do painel, Z = profundidade. */
export function panelAccessorySizeMm(type: string, state: Record<string, unknown> | undefined): { x: number; y: number; z: number } | null {
  if (isEnclosureType(type)) { const d = enclosureDimsOf(state); return { x: d.widthMm, y: d.heightMm, z: d.depthMm } }
  if (isCableDuctType(type)) { const d = cableDuctDimsOf(state); return { x: d.lengthMm, y: d.widthMm, z: d.heightMm + 2 } }
  if (isSpiralWrapType(type)) {
    const d = spiralWrapDimsOf(state)
    const outer = d.innerDiaMm + 4
    return { x: d.lengthMm, y: outer, z: outer }
  }
  return null
}

/**
 * UV planares à escala real (1 repetição a cada `tileMm`), escolhidas pela normal de cada face:
 * a textura nunca estica quando a peça muda de tamanho.
 */
export function applyWorldUv(geometry: THREE.BufferGeometry, unit: number, tileMm = 200): THREE.BufferGeometry {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const pos = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = new Float32Array(pos.count * 2)
  const k = 1 / (unit * tileMm)
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i))
    const x = pos.getX(i) * k, y = pos.getY(i) * k, z = pos.getZ(i) * k
    if (nx >= ny && nx >= nz) { uv[i * 2] = z; uv[i * 2 + 1] = y }
    else if (ny >= nz) { uv[i * 2] = x; uv[i * 2 + 1] = z }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geometry
}

/** Caixa já posicionada (em mm → unidades), para juntar várias numa só geometria. */
function boxGeo(unit: number, sx: number, sy: number, sz: number, x: number, y: number, z: number) {
  const geo = new THREE.BoxGeometry(Math.max(sx, 0.01) * unit, Math.max(sy, 0.01) * unit, Math.max(sz, 0.01) * unit)
  geo.translate(x * unit, y * unit, z * unit)
  return geo
}

/** Cilindro posicionado; `axis` = eixo do cilindro. */
function cylGeo(unit: number, r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z', segments = 24) {
  const geo = new THREE.CylinderGeometry(r * unit, r * unit, len * unit, segments)
  if (axis === 'z') geo.rotateX(Math.PI / 2)
  if (axis === 'x') geo.rotateZ(Math.PI / 2)
  geo.translate(x * unit, y * unit, z * unit)
  return geo
}

function mergedMesh(parts: THREE.BufferGeometry[], material: THREE.Material, unit: number, name: string, tileMm = 200) {
  const nonIndexed = parts.map((geo) => (geo.index ? geo.toNonIndexed() : geo))
  const merged = mergeGeometries(nonIndexed, false)!
  parts.forEach((geo) => geo.dispose())
  nonIndexed.forEach((geo) => geo.dispose())
  applyWorldUv(merged, unit, tileMm)
  merged.computeBoundingBox(); merged.computeBoundingSphere()
  const mesh = new THREE.Mesh(merged, material)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export interface EnclosureMaterials {
  body: THREE.Material
  plate: THREE.Material
  gasket: THREE.Material
  metal: THREE.Material
  dark: THREE.Material
}

export interface EnclosureParts {
  /** corpo, chapa de montagem, fundo de bucins e folhas fixas das dobradiças */
  body: THREE.Group
  /** porta (geometria relativa ao eixo das dobradiças) */
  door: THREE.Group
  /** posição do eixo das dobradiças (unidades de cena) */
  hinge: THREE.Vector3
  /** sentido de abertura: rotação Y positiva (dobradiças à direita) ou negativa */
  openSign: 1 | -1
}

/** Armário metálico com chapa de montagem, porta com junta, dobradiças e fechos de ¼ de volta. */
export function buildEnclosure(dims: EnclosureDims, unit: number, m: EnclosureMaterials, hingeSide: EnclosureHinge = 'right'): EnclosureParts {
  const { widthMm: W, heightMm: H, depthMm: D } = dims
  const s = ENCLOSURE.sheet, f = ENCLOSURE.flange
  const body = new THREE.Group(); body.name = 'enclosure-body'

  // Corpo: fundo, laterais, teto/base e moldura frontal (aba dobrada).
  // Fundo à parte: não apanha cliques (o clique chega à chapa e aos aparelhos).
  body.add(mergedMesh([boxGeo(unit, W, H, s, 0, 0, s / 2)], m.body, unit, 'enclosure-back'))
  const shell = [
    boxGeo(unit, s, H, D, -(W / 2 - s / 2), 0, D / 2),
    boxGeo(unit, s, H, D, W / 2 - s / 2, 0, D / 2),
    boxGeo(unit, W - 2 * s, s, D, 0, H / 2 - s / 2, D / 2),
    boxGeo(unit, W - 2 * s, s, D, 0, -(H / 2 - s / 2), D / 2),
    boxGeo(unit, W, f, s, 0, H / 2 - f / 2, D - s / 2),
    boxGeo(unit, W, f, s, 0, -(H / 2 - f / 2), D - s / 2),
    boxGeo(unit, f, H - 2 * f, s, -(W / 2 - f / 2), 0, D - s / 2),
    boxGeo(unit, f, H - 2 * f, s, W / 2 - f / 2, 0, D - s / 2),
    // retorno interior da moldura (dá espessura real à aba)
    boxGeo(unit, W - 2 * s, s, 12, 0, H / 2 - f + s / 2, D - s - 6),
    boxGeo(unit, W - 2 * s, s, 12, 0, -(H / 2 - f + s / 2), D - s - 6),
    boxGeo(unit, s, H - 2 * f, 12, -(W / 2 - f + s / 2), 0, D - s - 6),
    boxGeo(unit, s, H - 2 * f, 12, W / 2 - f + s / 2, 0, D - s - 6),
  ]
  body.add(mergedMesh(shell, m.body, unit, 'enclosure-shell'))

  // Fundo de bucins (chapa amovível na base).
  const glandW = Math.max(40, W - 2 * s - 40), glandD = Math.max(40, D - 50)
  body.add(mergedMesh([
    boxGeo(unit, glandW, 2, glandD, 0, -(H / 2 - s - 1), D / 2 - 5),
    // suportes de fixação à parede (por trás, dentro do contorno)
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => boxGeo(unit, 30, 18, 2, sx * (W / 2 - 40), sy * (H / 2 - 30), -1))),
  ], m.dark, unit, 'enclosure-gland'))

  // Chapa de montagem com abas dobradas para trás, sobre 4 espaçadores.
  const margin = Math.min(30, W * 0.06, H * 0.06)
  const pw = W - 2 * s - 2 * margin, ph = H - 2 * s - 2 * margin
  const pz = s + ENCLOSURE.standoff + ENCLOSURE.plate / 2
  const fold = Math.min(12, ENCLOSURE.standoff + 1)
  body.add(mergedMesh([
    boxGeo(unit, pw, ph, ENCLOSURE.plate, 0, 0, pz),
    boxGeo(unit, pw, ENCLOSURE.plate, fold, 0, ph / 2 - ENCLOSURE.plate / 2, pz - fold / 2),
    boxGeo(unit, pw, ENCLOSURE.plate, fold, 0, -(ph / 2 - ENCLOSURE.plate / 2), pz - fold / 2),
    boxGeo(unit, ENCLOSURE.plate, ph, fold, -(pw / 2 - ENCLOSURE.plate / 2), 0, pz - fold / 2),
    boxGeo(unit, ENCLOSURE.plate, ph, fold, pw / 2 - ENCLOSURE.plate / 2, 0, pz - fold / 2),
  ], m.plate, unit, 'enclosure-mounting-plate', 150))
  body.add(mergedMesh([-1, 1].flatMap((sx) => [-1, 1].map((sy) =>
    cylGeo(unit, 5, ENCLOSURE.standoff, sx * (pw / 2 - 25), sy * (ph / 2 - 25), s + ENCLOSURE.standoff / 2, 'z', 12))), m.metal, unit, 'enclosure-standoffs'))

  // Porta: eixo vertical junto ao canto da frente, do lado das dobradiças.
  const side = hingeSide === 'right' ? 1 : -1
  const dir = -side // do eixo para o centro da porta
  const hinge = new THREE.Vector3(side * (W / 2 + 3) * unit, 0, (D + 6) * unit)
  const door = new THREE.Group(); door.name = 'enclosure-door'
  const cx = dir * (W / 2 + 3)
  const R = ENCLOSURE.doorReturn
  const skinZ = R - 4 // face exterior da porta (relativa ao eixo)
  door.add(mergedMesh([
    boxGeo(unit, W, H, 2, cx, 0, skinZ - 1),
    boxGeo(unit, W, 2, R, cx, H / 2 - 1, skinZ - R / 2),
    boxGeo(unit, W, 2, R, cx, -(H / 2 - 1), skinZ - R / 2),
    boxGeo(unit, 2, H - 4, R, cx - (W / 2 - 1), 0, skinZ - R / 2),
    boxGeo(unit, 2, H - 4, R, cx + (W / 2 - 1), 0, skinZ - R / 2),
    // reforço interior em ómega (portas altas não empenam)
    ...(H > 500 ? [boxGeo(unit, 40, H - 120, 12, cx + dir * W * 0.12, 0, skinZ - 8)] : []),
  ], m.body, unit, 'enclosure-door-panel'))

  // Junta de borracha (espuma PU) em todo o perímetro interior da porta.
  const gi = 26, gw = 10, gt = 7
  const gz = skinZ - R + gt / 2 - 3
  door.add(mergedMesh([
    boxGeo(unit, W - 2 * gi, gw, gt, cx, H / 2 - gi, gz),
    boxGeo(unit, W - 2 * gi, gw, gt, cx, -(H / 2 - gi), gz),
    boxGeo(unit, gw, H - 2 * gi, gt, cx - (W / 2 - gi), 0, gz),
    boxGeo(unit, gw, H - 2 * gi, gt, cx + (W / 2 - gi), 0, gz),
  ], m.gasket, unit, 'enclosure-gasket', 60))

  // Fechos de ¼ de volta (casquilho cromado + inserto de duplo perfil) no lado oposto às dobradiças.
  const lockX = cx + dir * (W / 2 - 34)
  const lockYs = H < 500 ? [0] : [H * 0.3, -H * 0.3]
  door.add(mergedMesh(lockYs.map((y) => cylGeo(unit, 15, 3, lockX, y, skinZ + 1.5, 'z', 32)), m.metal, unit, 'enclosure-lock-bezel', 40))
  door.add(mergedMesh(lockYs.flatMap((y) => [
    cylGeo(unit, 10.5, 7, lockX, y, skinZ + 3.5, 'z', 32),
    boxGeo(unit, 3, 13, 2, lockX, y, skinZ + 7.6),
  ]), m.dark, unit, 'enclosure-lock-insert', 40))

  // Dobradiças: nó (eixo) e folhas — a folha da porta roda com ela, a do corpo fica fixa.
  const hingeYs = H > 1000 ? [H / 2 - 140, 0, -(H / 2 - 140)] : [H / 2 - Math.min(120, H * 0.2), -(H / 2 - Math.min(120, H * 0.2))]
  door.add(mergedMesh(hingeYs.flatMap((y) => [
    cylGeo(unit, 6.5, 56, 0, y, 0, 'y', 20),
    cylGeo(unit, 7.2, 3, 0, y + 29, 0, 'y', 20),
    boxGeo(unit, 30, 52, 2.5, dir * 16, y, skinZ - 6),
  ]), m.metal, unit, 'enclosure-hinge-door', 60))
  const hx = side * (W / 2 + 3)
  body.add(mergedMesh(hingeYs.map((y) => boxGeo(unit, 8, 52, 12, hx - side * 2, y, D + 1)), m.metal, unit, 'enclosure-hinge-body', 60))

  door.position.copy(hinge)
  return { body, door, hinge, openSign: side === 1 ? 1 : -1 }
}

export interface CableDuctMaterials { body: THREE.Material; cover: THREE.Material }

/** Calha técnica ranhurada (dedos destacáveis) com tampa de encaixe. Base em z = 0. */
export function buildCableDuct(dims: CableDuctDims, unit: number, m: CableDuctMaterials, coverOn = true, openings: DuctOpening[] = []): THREE.Group {
  const { lengthMm: L, widthMm: W, heightMm: H } = dims
  const c = CABLE_DUCT
  const group = new THREE.Group(); group.name = 'cable-duct'
  const strip = Math.max(8, H * 0.28)
  const fingerH = H - c.base - strip
  const fingerW = c.pitch - c.slot
  const n = Math.max(1, Math.floor((L - c.slot) / c.pitch))
  const start = -((n - 1) * c.pitch) / 2
  const parts: THREE.BufferGeometry[] = [boxGeo(unit, L, W, c.base, 0, 0, c.base / 2)]
  for (const sy of [-1, 1]) {
    const y = sy * (W / 2 - c.wall / 2)
    // 3D tem y para cima, o Esquema para baixo: lado +y aqui = `top` no Esquema.
    const side = sy === 1 ? 'top' : 'bottom'
    // fita lateral em troços: onde outra calha desemboca/atravessa a parede abre-se (passagem de cabos)
    for (const [a, b] of closedSpans(L, openings, side)) parts.push(boxGeo(unit, b - a, c.wall, strip, (a + b) / 2, y, c.base + strip / 2))
    for (let i = 0; i < n; i++) {
      const x = start + i * c.pitch
      // dedos (pinos) que cairiam na passagem partem-se
      if (inOpening(openings, side, x - fingerW / 2, x + fingerW / 2)) continue
      parts.push(boxGeo(unit, fingerW, c.wall, fingerH, x, y, c.base + strip + fingerH / 2))
      // patilha de encaixe da tampa, virada para dentro
      parts.push(boxGeo(unit, fingerW, 2.2, 1.6, x, y - sy * 1.4, H - 0.8))
    }
  }
  group.add(mergedMesh(parts, m.body, unit, 'cable-duct-body', 120))
  if (coverOn) {
    const skirt = 7
    const lid: THREE.BufferGeometry[] = [boxGeo(unit, L, W + 1.6, 1.8, 0, 0, H + 0.9)]
    for (const sy of [-1, 1]) {
      for (const [a, b] of closedSpans(L, openings, sy === 1 ? 'top' : 'bottom')) lid.push(boxGeo(unit, b - a, 1.2, skirt, (a + b) / 2, sy * (W / 2 + 0.2), H - skirt / 2 + 1.8))
    }
    group.add(mergedMesh(lid, m.cover, unit, 'cable-duct-cover', 120))
  }
  return group
}
