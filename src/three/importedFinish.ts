import * as THREE from 'three'

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
    for (const part of parts) {
      if (looksLikeScrew(part)) paint(part, ZINC)
      else if (part.box.min.z > 52 && part.size.y < 10) paint(part, SMOKED) // janela do indicador de fusível
      else if (part.box.min.z > 50 && part.size.y > 30) paint(part, RAL7035_DARK) // porta-fusível (gaveta)
      else paint(part, RAL7035)
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
  } else if (type === 'selectorSchneiderXa2ed33') {
    // Um só sólido no CAD: cabeça e manípulo (frente) em preto, blocos de contactos brancos,
    // a placa de fixação em aço zincado. A divisão do manípulo é feita no `rig`.
    for (const part of parts) paint(part, part.size.z > 40 ? WHITE_PA : BLACK_PA)
  } else if (type === 'contactorWegCwbc65') {
    for (const part of parts) {
      if (part.vertices === 518 || part.vertices === 640) paint(part, RESISTOR) // resistências de pré-carga
      else if (maxDim(part) <= 14 && part.vertices >= 200) paint(part, ZINC) // parafusos e terminais dos bornes
      else paint(part, RAL7035)
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
  pivots: Array<{ role: string; pivot: THREE.Object3D; rest: THREE.Euler; restPos: THREE.Vector3; value: number }>
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
    // Cada gaveta roda à volta da aresta inferior da frente (abre para baixo e para fora).
    for (const part of parts.filter((p) => p.box.min.z > 50 && p.size.y > 30)) {
      const window = parts.filter((p) => p.box.min.z > 52 && p.size.y < 10 && Math.abs(p.center.x - part.center.x) < part.size.x / 2)
      pivotAround(root, [part.mesh, ...window.map((p) => p.mesh)], new THREE.Vector3(part.center.x, part.box.min.y, part.box.max.z - 2), 'carrier', rig)
      for (const w of window) lampOf(w.mesh, 'blown', '#ff3b2f', rig)
    }
  } else if (type === 'motorBreakerSchneiderGv2me') {
    pivotAround(root, pick({ min: [-7, 40, 60], max: [6, 67, 80] }), new THREE.Vector3(0, 52, 66), 'button-off', rig)
    pivotAround(root, pick({ min: [8, 42, 60], max: [22, 67, 80] }), new THREE.Vector3(14.5, 55, 66), 'button-on', rig)
  } else if (type === 'keyActuatorEao61') {
    pivotAround(root, parts.filter((p) => inside(p.center, { min: [-1.5, 9, 33], max: [1.5, 24, 76] }) && p.size.x <= 2.5).map((p) => p.mesh), new THREE.Vector3(0, 20, 50), 'key', rig)
  } else if (type === 'thermalRelaySiemens3ru1116') {
    pivotAround(root, parts.filter((p) => sameColor(p.color, '#0000ff')).map((p) => p.mesh), new THREE.Vector3(-8, 40, 70), 'reset', rig)
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
      if (lens) lampOf(mesh, lens, lens === 'red' ? LENS.red.emissive : lens === 'yellow' ? LENS.amber.emissive : LENS.green.emissive, rig, { color: lens === 'red' ? '#ff3a2a' : lens === 'yellow' ? '#ffb340' : '#3dff7a', distance: 1.4, intensity: 1 })
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
    if (item.role === 'carrier') target = state.closed === false ? 1 : 0
    else if (item.role === 'button-on') target = rig.edges.pulseOn > 0 ? 1 : 0
    else if (item.role === 'button-off') target = rig.edges.pulseOff > 0 ? 1 : 0
    else if (item.role === 'key') target = state.pressed ? 1 : 0
    else if (item.role === 'reset') target = state.tripped ? 1 : 0
    else if (item.role === 'knob') target = typeof state.position === 'number' ? state.position : 0
    const next = springTo(item.value, target, delta, item.role.startsWith('button') ? 30 : 14)
    if (Math.abs(next - target) > 1e-4) moving = true
    item.value = Math.abs(next - target) < 1e-4 ? target : next
    const r = item.rest, p = item.restPos
    if (item.role === 'carrier') item.pivot.rotation.set(r.x + item.value * THREE.MathUtils.degToRad(24), r.y, r.z)
    else if (item.role === 'key') item.pivot.rotation.set(r.x, r.y, r.z - item.value * THREE.MathUtils.degToRad(60))
    else if (item.role === 'knob') item.pivot.rotation.set(r.x, r.y, r.z - (item.value - 1) * THREE.MathUtils.degToRad(45)) // CAD na posição direita
    else if (item.role.startsWith('button')) item.pivot.position.set(p.x, p.y, p.z - item.value * .0028)
    else if (item.role === 'reset') item.pivot.position.set(p.x, p.y, p.z + item.value * .003)
  }
  for (const lamp of rig.lamps) {
    let on = false
    if (lamp.role === 'red' || lamp.role === 'yellow' || lamp.role === 'green') on = live && !!state[lamp.role]
    else if (lamp.role === 'blown') on = !!state.blown
    else if (lamp.role === 'surge') { lamp.material.color.copy(state.failed ? lamp.glow : lamp.base); continue } // bandeira mecânica: só muda de cor
    else if (lamp.role === 'power') on = live && !!state.powered
    else if (lamp.role === 'ch1' || lamp.role === 'ch2') on = live && !!state.powered && !!state.energized
    else if (lamp.role === 'output') on = live && !!state.powered && (state.no !== false ? !!state.triggered : !state.triggered)
    const next = springTo(lamp.value, on ? 1 : 0, delta, 18)
    if (Math.abs(next - (on ? 1 : 0)) > 1e-3) moving = true
    lamp.value = next
    lamp.material.emissive.copy(lamp.glow)
    lamp.material.emissiveIntensity = lamp.value * 2.2
    lamp.material.color.copy(lamp.base).lerp(lamp.glow, lamp.value * .35)
    if (lamp.light) lamp.light.intensity = lamp.value * 1.1
  }
  return moving
}
