import * as THREE from 'three'
import type { ImportedControl } from '../electrical/importedComponents'

/**
 * Acabamento e mecânica dos CAD importados em 2026-10-30.
 *
 * Os STEP de vários fabricantes chegaram sem cores (tudo cinzento #797d81) e todos
 * sem peças móveis separadas por nome. Aqui:
 *
 * 1. `paintImportedModel` dá a cada peça o material real (RAL 7035, poliamida preta,
 *    aço zincado, latão, lentes translúcidas…). O nome do material segue a convenção
 *    de `finishCadMaterial`/`cadSurface` (metal_zincado, latao, plastico_…), para os
 *    mapas PBR por família serem os mesmos dos outros aparelhos.
 * 2. `rigImportedModel` separa as peças que mexem (porta-fusível, botões I/O, manípulo,
 *    chave, botão de rearme) em pivôs e guarda os LED/lentes que acendem.
 * 3. `animateImportedRig` aplica o estado do componente (fechado, disparado, posição,
 *    chave rodada, alimentação, saída) com amortecimento, todos os frames.
 *
 * As peças são escolhidas por região (caixa em mm no referencial do GLB: x centrado,
 * y desde a base, z desde a traseira) e, quando ajuda, pela cor de fábrica — nunca
 * pelo índice do nó, que muda a cada exportação.
 */

type Box = { min: [number, number, number]; max: [number, number, number] }

/** GV2ME (mm no GLB): tampa a z 67,4 sobre as teclas; frente das teclas em repouso
 *  (desligado) e curso quando liga — a I afunda, a O salta. Nunca abaixo de z 67,9. */
export const GV2ME_BUTTON_BACK = 64
export const GV2ME_BUTTON_FRONT = { off: 68.6, on: 70.4 } as const
export const GV2ME_BUTTON_TRAVEL = { off: 1.8, on: 2.2 } as const
export type PartInfo = { mesh: THREE.Mesh; box: THREE.Box3; size: THREE.Vector3; center: THREE.Vector3; color: string; vertices: number }

const hex = (material: THREE.Material | THREE.Material[]) => {
  const m = Array.isArray(material) ? material[0] : material
  return (m as THREE.MeshStandardMaterial).color ? `#${(m as THREE.MeshStandardMaterial).color.getHexString(THREE.LinearSRGBColorSpace)}` : '#000000'
}

/** Caixa em mm de uma primitiva, só com os vértices que os seus triângulos usam
 *  (várias primitivas partilham o mesmo atributo de posição no GLB). */
function primitiveBoxMm(mesh: THREE.Mesh): { box: THREE.Box3; vertices: number } {
  const position = mesh.geometry.getAttribute('position')
  const index = mesh.geometry.getIndex()
  const box = new THREE.Box3()
  const point = new THREE.Vector3()
  mesh.updateWorldMatrix(true, false)
  const used = index ? new Set<number>(Array.from(index.array as ArrayLike<number>)) : null
  const visit = (i: number) => { point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).multiplyScalar(1000); box.expandByPoint(point) }
  if (used) used.forEach(visit)
  else for (let i = 0; i < position.count; i += 1) visit(i)
  return { box, vertices: used ? used.size : position.count }
}

/** Retira de `mesh` os triângulos (vértices em mm no referencial do GLB) que cumprem `drop`.
 *  Só reescreve o índice desta primitiva; o atributo de posição partilhado fica intacto. */
function dropTriangles(mesh: THREE.Mesh, drop: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => boolean): number {
  const index = mesh.geometry.getIndex()!, position = mesh.geometry.getAttribute('position')
  mesh.updateWorldMatrix(true, false)
  const at = (i: number) => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).multiplyScalar(1000)
  const kept: number[] = []
  for (let i = 0; i < index.count; i += 3) {
    const [ia, ib, ic] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
    if (!drop(at(ia), at(ib), at(ic))) kept.push(ia, ib, ic)
  }
  const removed = (index.count - kept.length) / 3
  if (removed) { mesh.geometry = mesh.geometry.clone(); mesh.geometry.setIndex(kept) }
  return removed
}

/** Inventário das peças do GLB ainda sem ajuste (raiz na identidade, metros → mm). */
export function inventoryParts(root: THREE.Object3D): PartInfo[] {
  root.updateMatrixWorld(true)
  const parts: PartInfo[] = []
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const { box, vertices } = primitiveBoxMm(mesh)
    if (box.isEmpty()) return
    parts.push({ mesh, box, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), color: hex(mesh.material), vertices })
  })
  return parts
}

const inside = (p: THREE.Vector3, b: Box) => p.x >= b.min[0] && p.x <= b.max[0] && p.y >= b.min[1] && p.y <= b.max[1] && p.z >= b.min[2] && p.z <= b.max[2]
/** Cores de fábrica com tolerância (a conversão do GLB arredonda o último dígito). */
const channels = (value: string) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))
const sameColor = (a: string, b: string) => { const x = channels(a), y = channels(b); return x.every((v, i) => Math.abs(v - y[i]) <= 6) }
const maxDim = (part: PartInfo) => Math.max(part.size.x, part.size.y, part.size.z)

// ----------------------------------------------------------------- materiais
type Finish = { color: string; name: string; metalness?: number; roughness?: number; opacity?: number; emissive?: string }
const RAL7035: Finish = { color: '#d5d6d2', name: 'plastico_ral7035', metalness: 0, roughness: .5 }
const RAL7035_DARK: Finish = { color: '#c3c5c2', name: 'plastico_ral7035', metalness: 0, roughness: .48 }
const BLACK_PA: Finish = { color: '#1d1e20', name: 'plastico_poliamida_preta', metalness: 0, roughness: .55 }
const ZINC: Finish = { color: '#b7bcc1', name: 'metal_zincado', metalness: .9, roughness: .33 }
const ALU: Finish = { color: '#c9cdd2', name: 'metal_aluminio_anodizado', metalness: .85, roughness: .3 }
const WHITE_PA: Finish = { color: '#ecece6', name: 'plastico_branco', metalness: 0, roughness: .45 }
const SMOKED: Finish = { color: '#3a3f46', name: 'plastico_janela_fumada', metalness: 0, roughness: .2 }
const RESISTOR: Finish = { color: '#a8aaa6', name: 'metal_niquel_cromio', metalness: .85, roughness: .4 }
const LENS = { red: { color: '#c72424', emissive: '#ff2a1a' }, amber: { color: '#e79a16', emissive: '#ffb02e' }, green: { color: '#1c9a46', emissive: '#2bff6a' } }

function material(finish: Finish): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: finish.color, metalness: finish.metalness ?? 0, roughness: finish.roughness ?? .5, name: finish.name })
  if (finish.opacity !== undefined && finish.opacity < 1) { m.transparent = true; m.opacity = finish.opacity }
  if (finish.emissive) m.emissive = new THREE.Color(finish.emissive)
  return m
}
const paint = (part: PartInfo, finish: Finish) => { part.mesh.material = material(finish) }

/** Peças pequenas e com forma de parafuso/terminal num CAD sem cores são metálicas. */
const looksLikeScrew = (part: PartInfo) => maxDim(part) <= 9 && part.vertices >= 60

/** Cores e acabamento por modelo. Corre antes de `finishCadMaterial`. */
export function paintImportedModel(type: string, root: THREE.Object3D): PartInfo[] {
  const parts = inventoryParts(root)
  const grey = parts.every((part) => part.color === '#797d81')
  if (type.startsWith('fuseHolderSchneider')) {
    const carriers = parts.filter((part) => part.box.min.z > 50 && part.size.y > 30)
    const neutralXs = carriers.filter((c) => c.vertices < 650).map((c) => c.center.x)
    const isNeutralPart = (x: number) => neutralXs.some((nx) => Math.abs(nx - x) < 5)
    for (const part of parts) {
      if (looksLikeScrew(part)) paint(part, ZINC)
      else if (part.box.min.z > 52 && part.size.y < 10) {
        // Polo de neutro N (gravado à esquerda no CAD DF81N / DF103NV) leva clip azul Schneider;
        // polos de fase levam lente fumada do indicador néon de fusível fundido.
        paint(part, isNeutralPart(part.center.x) ? { color: '#0072ce', name: 'plastico_azul_neutro', roughness: 0.36 } : SMOKED)
      } else if (part.box.min.z > 50 && part.size.y > 30) paint(part, RAL7035_DARK) // porta-fusível (gaveta)
      else paint(part, RAL7035)
    }
  } else if (type === 'residualBreakerHagerCfc225p') {
    for (const part of parts) {
      // Botão azul «T» de ensaio diferencial Hager, alavanca preta acetinada, parafusos zincados e janela mecânica.
      if (part.mesh.name === 'cad_22_') paint(part, { color: '#0067b8', name: 'plastico_azul_teste', roughness: 0.32 })
      else if (part.mesh.name === 'cad_6_Component24') paint(part, BLACK_PA)
      else if (part.mesh.name === 'mesh_21_1') {
        paint(part, { color: '#16a34a', name: 'plastico_indicador_estado', roughness: 0.34 })
        part.mesh.userData.rcdFlag = true
      } else if (/Screws/i.test(part.mesh.name)) paint(part, ZINC)
    }
  } else if (type === 'towerLightSb23011') {
    for (const part of parts) {
      const { min, max } = part.box
      if (part.size.y > 40 && min.y > 150) {
        const lens = min.y > 262 ? LENS.red : min.y > 207 ? LENS.amber : LENS.green
        paint(part, { color: lens.color, name: 'plastico_lente_policarbonato', roughness: .22, opacity: .92 })
        part.mesh.userData.towerLens = lens === LENS.red ? 'red' : lens === LENS.amber ? 'yellow' : 'green'
      } else if (min.y > 140) paint(part, ALU) // anéis e tampa
      else if (max.y <= 13) paint(part, BLACK_PA) // base de fixação
      else if (maxDim(part) < 15) paint(part, ZINC) // parafuso de articulação
      else paint(part, min.y > 100 ? BLACK_PA : ALU) // cabeça e tubo de suporte
    }
  } else if (type === 'keyActuatorEao61') {
    for (const part of parts) {
      if (part.mesh.name === 'cad_3_SOLID' || (part.center.z > 33 && part.size.x <= 2.5)) paint(part, ALU)
      else if (looksLikeScrew(part) || part.center.z < 20) paint(part, ZINC)
      else if (part.center.z > 50) paint(part, BLACK_PA)
      else paint(part, RAL7035)
    }
  } else if (type === 'selectorSchneiderXa2ed33') {
    // Cabeça do operador em preto acetinado; blocos de contactos ZBE na traseira em poliamida branca.
    for (const part of parts) paint(part, part.box.min.z < 24 ? WHITE_PA : BLACK_PA)
  } else if (type === 'contactorWegCwbc65') {
    // CWBC65: the former blue block was the main shell, not a blue actuator.
    // Supplied CAD now uses the verified front frame (Rx +90°, no stretching).
    const shell: Finish = { color: '#9eabb8', name: 'plastico_cinzento_weg', roughness: .48 }
    const insulatedResistance: Finish = { color: '#d5d0bf', name: 'isolamento_resistencia_weg', roughness: .82 }
    for (const part of parts) {
      const id = /^cad_(\d+)_/.exec(part.mesh.name)?.[1]
      const index = Number(id)
      if ([1, 2, 36].includes(index)) paint(part, BLACK_PA) // DIN rear and early-make support
      else if ([66, 74, 75, 85, 86, 87].includes(index)) paint(part, insulatedResistance)
      else if (part.vertices === 1720 || part.vertices === 518 || part.vertices === 640 || (maxDim(part) <= 14 && part.vertices >= 200)) paint(part, ZINC)
      else paint(part, shell)
    }
  } else if (type === 'motorBreakerSchneiderGv2me') {
    for (const part of parts) {
      if (part.size.x < 16 && part.size.y > 15 && part.center.x < 5 && part.center.x > -5) {
        paint(part, { color: '#dc2626', name: 'plastico_vermelho_stop', roughness: 0.38 }) // Botão vermelho O (STOP)
      } else if (part.size.x < 16 && part.size.y > 15 && part.center.x > 8) {
        paint(part, BLACK_PA) // Botão preto I (START)
      } else if (looksLikeScrew(part)) {
        paint(part, ZINC)
      } else if (part.size.x > 30 && part.box.min.z > 50) {
        paint(part, { color: '#ece8d9', name: 'plastico_bege_schneider', roughness: 0.46 }) // Frente TeSys GV2ME
      } else {
        paint(part, BLACK_PA) // Base e terminais
      }
    }
  } else if (type === 'surgeProtectorWegSpw02' || type === 'surgeProtectorWegSpw12') {
    for (const part of parts) {
      if (part.size.x < 5 && part.size.y < 12 && part.box.min.z > 62) { paint(part, { color: '#2f9d47', name: 'plastico_indicador_estado', roughness: .35 }); part.mesh.userData.surgeFlag = true } // janela de estado
      else if (part.vertices > 4000 && maxDim(part) < 22) paint(part, ZINC) // parafusos e gaiolas dos bornes
      else if (part.box.min.z > 52 && part.size.z < 16) paint(part, { color: '#bfc2c5', name: 'plastico_ral7035', roughness: .45 }) // módulo extraível
      else paint(part, { color: '#cfd2d4', name: 'plastico_ral7035', roughness: .5 })
    }
  } else if (grey) {
    for (const part of parts) paint(part, looksLikeScrew(part) ? ZINC : RAL7035)
  }
  return parts
}

// ----------------------------------------------------------------- mecânica
export type ImportedRig = {
  pivots: Array<{ role: string; pivot: THREE.Object3D; rest: THREE.Euler; restPos: THREE.Vector3; value: number; travel?: THREE.Vector3 }>
  lamps: Array<{ role: string; material: THREE.MeshStandardMaterial; base: THREE.Color; glow: THREE.Color; light?: THREE.PointLight; value: number }>
  edges: { closed?: boolean; tripped?: boolean; pulseOn: number; pulseOff: number }
}

/** Coloca `meshes` num pivô na charneira (mm, referencial do GLB). Corre antes do ajuste ao painel. */
function pivotAround(root: THREE.Object3D, meshes: THREE.Mesh[], hingeMm: THREE.Vector3, role: string, rig: ImportedRig) {
  if (!meshes.length) return
  root.updateMatrixWorld(true)
  const parent = meshes[0].parent ?? root
  const pivot = new THREE.Group()
  pivot.name = `imported_${role}`
  pivot.position.copy(parent.worldToLocal(hingeMm.clone().multiplyScalar(.001)))
  parent.add(pivot)
  pivot.updateMatrixWorld(true)
  for (const mesh of meshes) pivot.attach(mesh)
  rig.pivots.push({ role, pivot, rest: pivot.rotation.clone(), restPos: pivot.position.clone(), value: 0 })
}

/** Separa os triângulos de `mesh` cujo centro cumpre `keep` numa malha nova (mesmo pai). */
function splitTriangles(mesh: THREE.Mesh, keep: (center: THREE.Vector3) => boolean, finish: Finish): THREE.Mesh | null {
  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
  const position = source.getAttribute('position')
  const normal = source.getAttribute('normal')
  const kept: number[] = [], rest: number[] = [], keptN: number[] = [], restN: number[] = []
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), center = new THREE.Vector3()
  mesh.updateWorldMatrix(true, false)
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2)
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld).multiplyScalar(1000)
    const target = keep(center) ? kept : rest
    const targetN = target === kept ? keptN : restN
    for (let k = 0; k < 3; k += 1) {
      target.push(position.getX(i + k), position.getY(i + k), position.getZ(i + k))
      if (normal) targetN.push(normal.getX(i + k), normal.getY(i + k), normal.getZ(i + k))
    }
  }
  if (!kept.length) return null
  const build = (values: number[], normals: number[]) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3))
    if (normals.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    else geometry.computeVertexNormals()
    return geometry
  }
  mesh.geometry = build(rest, restN)
  const piece = new THREE.Mesh(build(kept, keptN), material(finish))
  piece.position.copy(mesh.position); piece.quaternion.copy(mesh.quaternion); piece.scale.copy(mesh.scale)
  piece.castShadow = mesh.castShadow; piece.receiveShadow = mesh.receiveShadow
  mesh.parent?.add(piece)
  return piece
}

function lampOf(mesh: THREE.Mesh, role: string, glow: string, rig: ImportedRig, light?: { color: string; distance: number; intensity: number }) {
  const m = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial
  const own = m.clone()
  mesh.material = own
  let point: THREE.PointLight | undefined
  if (light) {
    mesh.geometry.computeBoundingBox()
    point = new THREE.PointLight(light.color, 0, light.distance, 2)
    mesh.geometry.boundingBox!.getCenter(point.position)
    mesh.add(point)
  }
  rig.lamps.push({ role, material: own, base: own.color.clone(), glow: new THREE.Color(glow), light: point, value: 0 })
}

/** Liga as peças móveis e os indicadores. `parts` vem de `paintImportedModel` (mesmo modelo). */
export function rigImportedModel(type: string, root: THREE.Object3D, parts: PartInfo[]): ImportedRig {
  const rig: ImportedRig = { pivots: [], lamps: [], edges: { pulseOn: 0, pulseOff: 0 } }
  const pick = (box: Box, color?: string) => parts.filter((part) => inside(part.center, box) && (!color || sameColor(part.color, color))).map((part) => part.mesh)
  if (type.startsWith('fuseHolderSchneider')) {
    // Cada gaveta roda à volta da aresta inferior da frente (abre para baixo e para fora) e
    // transporta o cartucho cilíndrico real (cerâmica esteatite 10×38 / 8,5×31,5 com casquilhos
    // niquelados nos polos de fase; tubo maciço niquelado no polo de neutro N à esquerda).
    const isDf8 = type === 'fuseHolderSchneiderDf81n'
    const cartR = (isDf8 ? 0.0041 : 0.0048)
    const cartLen = (isDf8 ? 0.031 : 0.035)
    const capLen = 0.0072
    for (const part of parts.filter((p) => p.box.min.z > 50 && p.size.y > 30)) {
      const isNeutral = part.vertices < 650
      const window = parts.filter((p) => p.box.min.z > 52 && p.size.y < 10 && Math.abs(p.center.x - part.center.x) < part.size.x / 2)
      const hingeY = part.box.min.y
      const hingeZ = part.box.max.z - 2
      pivotAround(root, [part.mesh, ...window.map((p) => p.mesh)], new THREE.Vector3(part.center.x, hingeY, hingeZ), 'carrier', rig)
      const pivot = rig.pivots[rig.pivots.length - 1]?.pivot
      if (pivot) {
        pivot.userData.fuseCarrierRole = isNeutral ? 'neutral' : 'fuse'
        pivot.userData.hingeY = hingeY
        pivot.userData.hingeZ = hingeZ
        // Berço interior do cartucho (visível ao abrir a gaveta; recuado no interior quando fechada).
        const holder = new THREE.Group()
        holder.name = '__dcFuseCartridge'
        holder.position.set(0, (44.8 - hingeY) * 0.001, (46.8 - hingeZ) * 0.001)
        const capMat = new THREE.MeshStandardMaterial({ color: '#d6dbe0', metalness: 0.86, roughness: 0.22, name: 'metal_niquel' })
        if (isNeutral) {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(cartR * 0.88, cartR * 0.88, cartLen, 18), capMat)
          tube.raycast = () => null
          const blueBand = new THREE.Mesh(
            new THREE.CylinderGeometry(cartR * 0.92, cartR * 0.92, cartLen * 0.26, 18),
            new THREE.MeshStandardMaterial({ color: '#0072ce', roughness: 0.35, metalness: 0.05 }),
          )
          blueBand.raycast = () => null
          holder.add(tube, blueBand)
        } else {
          const bodyLen = cartLen - capLen * 1.6
          const body = new THREE.Mesh(
            new THREE.CylinderGeometry(cartR * 0.94, cartR * 0.94, bodyLen, 20),
            new THREE.MeshStandardMaterial({ color: '#f6f4ee', roughness: 0.52, metalness: 0.02 }),
          )
          body.name = '__dcFuseCartridgeBody'
          body.rotation.y = Math.PI / 2
          body.raycast = () => null
          const topCap = new THREE.Mesh(new THREE.CylinderGeometry(cartR, cartR, capLen, 20), capMat)
          topCap.position.y = (cartLen - capLen) / 2
          topCap.raycast = () => null
          const botCap = new THREE.Mesh(new THREE.CylinderGeometry(cartR, cartR, capLen, 20), capMat)
          botCap.position.y = -(cartLen - capLen) / 2
          botCap.raycast = () => null
          holder.add(body, topCap, botCap)
        }
        pivot.add(holder)
      }
      if (!isNeutral) {
        for (const w of window) lampOf(w.mesh, 'blown', '#ff3b2f', rig)
      }
    }
  } else if (type === 'residualBreakerHagerCfc225p') {
    // Alavanca basculante no tambor real (x=7.5, y=40.0, z=62.9 mm no GLB; o aparelho é rodado 180° em Z,
    // pelo que a pose nativa aponta para cima = I·ON, -27° = disparado e -52° = O·OFF para baixo).
    const lever = parts.find((p) => p.mesh.name === 'cad_6_Component24')
    if (lever) pivotAround(root, [lever.mesh], new THREE.Vector3(lever.center.x, 40.0, 62.9), 'rcd-lever', rig)
    // Botão azul «T» de ensaio diferencial (mergulha axialmente em -Z e regressa por mola).
    const testBtn = parts.find((p) => p.mesh.name === 'cad_22_')
    if (testBtn) {
      pivotAround(root, [testBtn.mesh], testBtn.center.clone(), 'rcd-test', rig)
      const tp = rig.pivots[rig.pivots.length - 1]?.pivot
      if (tp) {
        tp.name = '__dcHagerTestPivot'
        tp.userData.frontOffsetZ = testBtn.box.max.z - testBtn.center.z + 0.14
      }
    }
    // Janela mecânica de estado por cima da alavanca (verde = OFF, vermelho = ON, âmbar = disparado).
    root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (mesh.isMesh && mesh.userData.rcdFlag) lampOf(mesh, 'rcd-flag', '#dc2626', rig)
    })
  } else if (type === 'contactorWegCwbc65') {
    // Atuador central / carruagem móvel dos contactos que afunda quando o contactor atraca
    const carrier = parts.filter((p) => p.mesh.name === 'cad_38_' || p.mesh.name === 'cad_39_')
    if (carrier.length) {
      const bounds = carrier.reduce((box, part) => box.union(part.box), new THREE.Box3())
      pivotAround(root, carrier.map(part => part.mesh), bounds.getCenter(new THREE.Vector3()), 'carrier', rig)
      const item = rig.pivots[rig.pivots.length - 1], parent = item.pivot.parent!
      // The supplied CAD still contains its rigid Rx(+90°) frame. Translating
      // parent-local Z would lift the carrier in physical Y. Express the real
      // front-normal course in the parent's coordinates before fitting it.
      const origin = parent.worldToLocal(root.localToWorld(new THREE.Vector3()))
      item.travel = parent.worldToLocal(root.localToWorld(new THREE.Vector3(0, 0, -.0028))).sub(origin)
      item.pivot.userData.cwbcCarrier = { rest: item.restPos.toArray(), travel: item.travel.toArray() }
    }
  } else if (type === 'motorBreakerSchneiderGv2me') {
    // Botão vermelho O (STOP) à esquerda e preto I (START) à direita (filtro estrito por tamanho para nunca capturar a carcaça)
    const btnOff = parts.find((p) => p.size.x < 16 && p.size.y > 15 && p.center.x > -5 && p.center.x < 5 && p.center.y > 45 && p.center.y < 62)
    const btnOn = parts.find((p) => p.size.x < 16 && p.size.y > 15 && p.center.x > 8 && p.center.x < 22 && p.center.y > 45 && p.center.y < 62)
    // As teclas do STEP são cascas finas e inclinadas (a I chega a sair 9,5 mm como uma aba).
    // Ao mover-se mostravam o interior oco e a I enfiava-se atrás da travessa da tampa (z 67,4),
    // que aparecia como uma barra branca. Passam a teclas sólidas com o mesmo contorno, da
    // cavidade (z 64) até à frente em repouso; o curso fica sempre à frente da tampa.
    for (const [part, frontMm] of [[btnOff, GV2ME_BUTTON_FRONT.off], [btnOn, GV2ME_BUTTON_FRONT.on]] as const) {
      if (!part) continue
      const { min, max } = part.box
      // A janela da O sobe até y 66,9 (rampa da tampa a z 65,5…66,9); a casca do STEP
      // parava em 64 e essa rampa via-se como uma faixa cinzenta por cima da tecla.
      if (part === btnOff) max.y = Math.max(max.y, 66.9)
      const depth = frontMm - GV2ME_BUTTON_BACK
      const geometry = new THREE.BoxGeometry(max.x - min.x, max.y - min.y, depth)
      geometry.translate((min.x + max.x) / 2, (min.y + max.y) / 2, GV2ME_BUTTON_BACK + depth / 2)
      geometry.scale(.001, .001, .001)
      part.mesh.updateWorldMatrix(true, false)
      geometry.applyMatrix4(part.mesh.matrixWorld.clone().invert())
      part.mesh.geometry = geometry // o atributo original é partilhado com outras primitivas: não se liberta
      part.center.set((min.x + max.x) / 2, (min.y + max.y) / 2, GV2ME_BUTTON_BACK + depth / 2)
      part.box.min.z = GV2ME_BUTTON_BACK; part.box.max.z = frontMm
    }
    // Restos das cascas das teclas noutras primitivas (uma lâmina inclinada até z 71,4 e uma
    // aresta a z 76,9 sobre a I): ficavam a atravessar a tecla sólida como uma barra clara.
    const footprints = [btnOff, btnOn].filter((p): p is PartInfo => !!p).map((p) => p.box)
    const buttons = new Set([btnOff?.mesh, btnOn?.mesh])
    if (footprints.length) root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh || buttons.has(mesh) || !mesh.geometry.index) return
      dropTriangles(mesh, (a, b, c) => [a, b, c].some((v) => v.z > 67.6) && footprints.some((f) => [a, b, c].every((v) => v.x >= f.min.x - .3 && v.x <= f.max.x + .3 && v.y >= f.min.y - .3 && v.y <= f.max.y + .3)))
    })
    if (btnOff) pivotAround(root, [btnOff.mesh], btnOff.center.clone(), 'button-off', rig)
    if (btnOn) pivotAround(root, [btnOn.mesh], btnOn.center.clone(), 'button-on', rig)
    for (const [part, role] of [[btnOff, 'button-off'], [btnOn, 'button-on']] as const) {
      const pivot = part && root.getObjectByName(`imported_${role}`)
      if (pivot) pivot.userData.frontOffsetMm = part.box.max.z - part.center.z
    }
  } else if (type === 'keyActuatorEao61') {
    pivotAround(root, parts.filter((p) => inside(p.center, { min: [-1.5, 9, 33], max: [1.5, 24, 76] }) && p.size.x <= 2.5).map((p) => p.mesh), new THREE.Vector3(0, 20, 50), 'key', rig)
  } else if (type === 'thermalRelaySiemens3ru1116') {
    // Três comandos no CAD: o STOP vermelho, o RESET azul (cruz) e o cursor de ensaio (TEST).
    // O cursor de ensaio não é uma peça separada no GLB (faz parte da frente), por isso só tem
    // zona de clique — ver `thermalRelayControlAt`.
    pivotAround(root, parts.filter((p) => sameColor(p.color, '#ff0000')).map((p) => p.mesh), new THREE.Vector3(-18.1, 37.9, 63.5), 'stop', rig)
    pivotAround(root, parts.filter((p) => sameColor(p.color, '#0000ff')).map((p) => p.mesh), new THREE.Vector3(-7.1, 37.9, 63.5), 'reset', rig)
  } else if (type === 'selectorSchneiderXa2ed33') {
    // O manípulo é a parte da frente que sai do aro: separa-se do sólido único e roda no eixo Z.
    const body = parts[0]?.mesh
    const knob = body && splitTriangles(body, (p) => p.z > 50 && Math.abs(p.x) < 14 && p.y > 4 && p.y < 38, BLACK_PA)
    if (knob) pivotAround(root, [knob], new THREE.Vector3(0, 21, 60), 'knob', rig)
    // Aro e corpo do operador em preto, placa de fixação em aço: o resto do sólido.
    if (body) {
      body.material = material(BLACK_PA)
      splitTriangles(body, (p) => p.z < 24, WHITE_PA) // blocos de contactos ZBE na traseira
    }
  } else if (type === 'towerLightSb23011') {
    root.traverse((node) => {
      const mesh = node as THREE.Mesh
      const lens = mesh.isMesh ? mesh.userData.towerLens as string | undefined : undefined
      if (lens) lampOf(mesh, lens, lens === 'red' ? LENS.red.emissive : lens === 'yellow' ? LENS.amber.emissive : LENS.green.emissive, rig)
    })
  } else if (type === 'safetyRelaySiemens3tk2840') {
    const leds = parts.filter((p) => p.center.x > 6 && p.center.y > 30 && p.center.y < 50 && p.box.max.z > 88 && maxDim(p) < 5).sort((a, b) => b.center.y - a.center.y)
    leds.slice(0, 3).forEach((led, index) => lampOf(led.mesh, ['power', 'ch1', 'ch2'][index], '#35ff6e', rig))
  } else if (type === 'surgeProtectorWegSpw02' || type === 'surgeProtectorWegSpw12') {
    root.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh && mesh.userData.surgeFlag) lampOf(mesh, 'surge', '#d92020', rig) })
  } else if (type === 'photoSensorXukt1ksml2') {
    for (const part of parts) {
      if (sameColor(part.color, '#00ff0b')) lampOf(part.mesh, 'power', '#3dff6a', rig)
      if (sameColor(part.color, '#ffea00')) lampOf(part.mesh, 'output', '#ffb020', rig)
    }
  }
  return rig
}

const springTo = (current: number, target: number, delta: number, speed = 14) => current + (target - current) * (1 - Math.exp(-speed * delta))

/** Estado → pose. Devolve `true` enquanto houver movimento (para pedir mais frames). */
export function animateImportedRig(rig: ImportedRig, type: string, state: Record<string, unknown>, live: boolean, delta: number): boolean {
  let moving = false
  const closed = !!state.closed && !state.tripped
  // GV2ME: o botão I (ligar) ou O (desligar) mergulha um instante quando o estado muda.
  if (rig.edges.closed !== undefined && rig.edges.closed !== closed) { if (closed) rig.edges.pulseOn = .22; else rig.edges.pulseOff = .22 }
  rig.edges.closed = closed
  rig.edges.pulseOn = Math.max(0, rig.edges.pulseOn - delta)
  rig.edges.pulseOff = Math.max(0, rig.edges.pulseOff - delta)
  for (const item of rig.pivots) {
    let target = 0
    if (item.role === 'carrier') target = type === 'contactorWegCwbc65' ? (state.energized ? 1 : 0) : state.closed === false ? 1 : 0
    else if (item.role === 'rcd-lever') target = closed ? 1 : state.tripped ? 0.48 : 0
    else if (item.role === 'rcd-test') target = state.testPressed ? 1 : 0
    else if (item.role === 'button-on') target = type === 'motorBreakerSchneiderGv2me' ? (closed ? 1 : 0) : rig.edges.pulseOn > 0 ? 1 : 0
    else if (item.role === 'button-off') target = type === 'motorBreakerSchneiderGv2me' ? (closed ? 1 : 0) : rig.edges.pulseOff > 0 ? 1 : 0
    else if (item.role === 'key') target = state.pressed ? 1 : 0
    // STOP mantém o curso axial. RESET usa a cruz azul existente como manípulo rotativo
    // didático (−1…1); ao largar, a mola regressa a zero. Não muda a seleção física M/A.
    // TEST não tem peça própria no CAD: atua o cursor de ensaio já gravado na frente.
    else if (item.role === 'stop') target = state.stopPressed ? 1 : 0
    else if (item.role === 'reset') target = typeof state.resetTurn === 'number' && Number.isFinite(state.resetTurn) ? Math.max(-1, Math.min(1, state.resetTurn)) : 0
    else if (item.role === 'knob') target = typeof state.position === 'number' ? state.position : 0
    const speed = item.role.startsWith('button') || item.role === 'stop' || item.role === 'reset' || item.role === 'rcd-test' ? 30 : item.role === 'rcd-lever' ? 22 : 14
    const next = springTo(item.value, target, delta, speed)
    if (Math.abs(next - target) > 1e-4) moving = true
    item.value = Math.abs(next - target) < 1e-4 ? target : next
    const r = item.rest, p = item.restPos
    if (item.role === 'carrier') {
      if (type === 'contactorWegCwbc65') {
        item.pivot.position.copy(p).addScaledVector(item.travel ?? new THREE.Vector3(0, 0, -.0028), item.value)
      } else {
        item.pivot.rotation.set(r.x + item.value * THREE.MathUtils.degToRad(38), r.y, r.z)
      }
    } else if (item.role === 'rcd-lever') item.pivot.rotation.set(r.x - (1 - item.value) * THREE.MathUtils.degToRad(52), r.y, r.z)
    else if (item.role === 'rcd-test') item.pivot.position.set(p.x, p.y, p.z - item.value * 0.0028)
    else if (item.role === 'key') item.pivot.rotation.set(r.x, r.y, r.z - item.value * THREE.MathUtils.degToRad(60))
    else if (item.role === 'knob') item.pivot.rotation.set(r.x, r.y, r.z - (item.value + 1) * THREE.MathUtils.degToRad(45)) // CAD na posição esquerda (-1)
    else if (item.role === 'reset') {
      item.pivot.rotation.set(r.x, r.y, r.z - item.value * THREE.MathUtils.degToRad(35))
      item.pivot.position.set(p.x, p.y, p.z + (state.tripped ? .003 : 0))
    } else if (item.role === 'button-on' && type === 'motorBreakerSchneiderGv2me') {
      item.pivot.position.set(p.x, p.y, p.z - item.value * GV2ME_BUTTON_TRAVEL.on * .001)
    } else if (item.role === 'button-off' && type === 'motorBreakerSchneiderGv2me') {
      item.pivot.position.set(p.x, p.y, p.z + item.value * GV2ME_BUTTON_TRAVEL.off * .001)
    } else if (item.role.startsWith('button') || item.role === 'stop') item.pivot.position.set(p.x, p.y, p.z - item.value * .0028)
  }
  const RCD_TRIP_COLOR = new THREE.Color('#f59e0b')
  for (const lamp of rig.lamps) {
    let on = false
    if (lamp.role === 'red' || lamp.role === 'yellow' || lamp.role === 'green') on = live && !!state[lamp.role]
    else if (lamp.role === 'blown') on = !!state.blown
    else if (lamp.role === 'surge') { lamp.material.color.copy(state.failed ? lamp.glow : lamp.base); continue } // bandeira mecânica: só muda de cor
    else if (lamp.role === 'rcd-flag') { lamp.material.color.copy(state.tripped ? RCD_TRIP_COLOR : closed ? lamp.glow : lamp.base); continue }
    else if (lamp.role === 'power') on = live && !!state.powered
    else if (lamp.role === 'ch1' || lamp.role === 'ch2') on = live && !!state.powered && !!state.energized
    else if (lamp.role === 'output') on = live && !!state.powered && (state.no !== false ? !!state.triggered : !state.triggered)
    const next = springTo(lamp.value, on ? 1 : 0, delta, 18)
    if (Math.abs(next - (on ? 1 : 0)) > 1e-3) moving = true
    lamp.value = next
    lamp.material.emissive.copy(lamp.glow)
    lamp.material.emissiveIntensity = lamp.value * 2.2
    // Como a lâmpada nativa: acesa não passa pelo tone mapping, para saturar e «queimar» no vidro.
    const saturate = lamp.value > 0.02
    if (lamp.material.toneMapped === saturate) { lamp.material.toneMapped = !saturate; lamp.material.needsUpdate = true }
    lamp.material.color.copy(lamp.base).lerp(lamp.glow, lamp.value * .35)
    // Lentes da torre: acesas ficam translúcidas e sem escrever profundidade, para a luz de dentro (GlowHalo) se ver através do vidro.
    if (lamp.role === 'red' || lamp.role === 'yellow' || lamp.role === 'green') {
      lamp.material.transparent = true
      lamp.material.opacity = .92 - .14 * lamp.value
      lamp.material.depthWrite = lamp.value < .02
    }
    if (lamp.light) lamp.light.intensity = lamp.value * 1.1
  }
  return moving
}

// ------------------------------------------------------------------ comandos
/**
 * Zonas de clique dos comandos do relé térmico 3RU1116, em mm no referencial do GLB
 * (x centrado, y desde a base, z desde a traseira). As caixas saem das peças medidas no
 * CAD — `cad_8_` (STOP, vermelho), `cad_9_` (RESET, azul) — e do cursor de ensaio, que
 * está gravado na frente ao lado da escala e não existe como peça própria.
 */
const THERMAL_RELAY_CONTROLS: Array<{ control: ImportedControl; min: [number, number, number]; max: [number, number, number] }> = [
  // Zonas alargadas para toque e clique preciso no GLB 3RU1116 (STOP vermelho, RESET azul, TEST de ensaio).
  { control: 'stop', min: [-24, 28, 58], max: [-12, 48, 76] },
  { control: 'reset', min: [-14, 28, 58], max: [1, 48, 76] },
  { control: 'test', min: [2, 48, 55], max: [18, 68, 75] },
]

/**
 * Zonas de clique do botão azul «T» do diferencial Hager CFC225P já na pose direita
 * (x centrado em [-17,75, +17,75], y desde a base [0, 86,25], z desde a traseira [0, 74,81]):
 * `cad_22_` ocupa x ∈ [3,5, 14,5], y ∈ [55,25, 59,25], z ∈ [61,0, 70,0].
 */
const HAGER_RCD_CONTROLS: Array<{ control: ImportedControl; min: [number, number, number]; max: [number, number, number] }> = [
  { control: 'test', min: [1.5, 52.5, 56], max: [16.5, 62.5, 75] },
]

/** Comando sob um ponto do aparelho (mm do GLB); `null` = corpo, que continua a ser a manobra geral. */
export function importedControlAt(type: string, pointMm: [number, number, number]): ImportedControl | null {
  const [x, y, z] = pointMm
  if (type === 'thermalRelaySiemens3ru1116') {
    const hit = THERMAL_RELAY_CONTROLS.find((box) => x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1] && z >= box.min[2] && z <= box.max[2])
    return hit ? hit.control : null
  }
  if (type === 'residualBreakerHagerCfc225p') {
    const hit = HAGER_RCD_CONTROLS.find((box) => x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1] && z >= box.min[2] && z <= box.max[2])
    return hit ? hit.control : null
  }
  if (type === 'fuseHolderSchneiderDf101v' || type === 'fuseHolderSchneiderDf81n' || type === 'fuseHolderSchneiderDf103nv') {
    // Gaveta porta-fusível articulada na frente (y ∈ [24,7, 65,4], z ≥ 52 mm; aberta avança até z ≈ 86 mm).
    if (y >= 22 && y <= 67 && z >= 48 && z <= 92) return 'carrier'
    return null
  }
  if (type === 'motorBreakerSchneiderGv2me') {
    // Botão vermelho O (STOP): x ∈ [-7, 5], y ∈ [42, 65], z ∈ [64, 80]
    if (x >= -7 && x <= 5 && y >= 42 && y <= 65 && z >= 64 && z <= 80) return 'stop'
    // Botão preto I (START): x ∈ [8, 22], y ∈ [42, 65], z ∈ [64, 80]
    if (x >= 8 && x <= 22 && y >= 42 && y <= 65 && z >= 64 && z <= 80) return 'start'
    return null
  }
  return null
}

/**
 * Ponto do clique (unidades do painel, à saída do grupo do componente) em mm do GLB.
 * O modelo é ajustado com a escala do painel e, na calha, apoiado na base; fora da calha
 * fica centrado — daí o `anchor`. Vale para CAD sem espelho em profundidade (`flipDepth`),
 * que é o caso do 3RU1116.
 */
export function importedPointMm(point: THREE.Vector3, sizeMm: { width: number; height: number; depth: number }, unitsPerMm: number, anchor: 'center' | 'bottom'): [number, number, number] {
  return [
    point.x / unitsPerMm,
    point.y / unitsPerMm + (anchor === 'center' ? sizeMm.height / 2 : 0),
    point.z / unitsPerMm + sizeMm.depth / 2,
  ]
}
