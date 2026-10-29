import * as THREE from 'three'

export interface FinishOptions {
  envMapIntensity?: number
  clearcoat?: boolean
}

let cachedMicroGrain: THREE.DataTexture | null = null

function getPolymerMicroGrain(): THREE.DataTexture {
  if (cachedMicroGrain) return cachedMicroGrain
  const size = 64
  const data = new Uint8Array(size * size * 4)
  let seed = 0x5f3759df
  for (let i = 0; i < size * size; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const v = 232 + ((seed >>> 24) % 24)
    const o = i * 4
    data[o] = v
    data[o + 1] = v
    data[o + 2] = v
    data[o + 3] = 255
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(10, 10)
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  cachedMicroGrain = tex
  return tex
}

/**
 * Converte materiais CAD GLB (muitas vezes exportados com roughness=1,0 e metalness=0,0
 * tipo gesso opaco) em materiais PBR industriais realistas — poliamida acetinada,
 * policarbonato com verniz, lentes translúcidas e metais maquinados (aço, latão, cobre) —
 * preservando sempre as cores originais do modelo para deteção de ecrãs/lentes/botões.
 */
export function finishCadMaterial(source: THREE.Material, options: FinishOptions = {}): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial)) return source.clone()

  const envIntensity = options.envMapIntensity ?? 1.25
  const useClearcoat = options.clearcoat ?? true
  const name = (source.name || '').toLowerCase()
  const color = source.color.clone()
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)

  const namedMetal = /aco|aço|metal|parafuso|borne_aco|latao|latão|cobre|ferro|galvaniz|steel|brass|chrome/.test(name)
  const namedBrass = /latao|latão|brass|cobre/.test(name)
    || (!source.map && hsl.h >= 0.07 && hsl.h <= 0.17 && hsl.s >= 0.32 && hsl.l >= 0.28 && hsl.l <= 0.78)
  const neutralSilver = !source.map && hsl.s < 0.09 && hsl.l >= 0.45 && hsl.l <= 0.86
    && (source.metalness >= 0.25 || namedMetal)

  const physical = new THREE.MeshPhysicalMaterial({
    name: source.name,
    color,
    map: source.map,
    normalMap: source.normalMap,
    normalScale: source.normalScale?.clone() ?? new THREE.Vector2(1, 1),
    roughnessMap: source.roughnessMap,
    metalnessMap: source.metalnessMap,
    aoMap: source.aoMap,
    aoMapIntensity: source.aoMapIntensity,
    emissive: source.emissive.clone(),
    emissiveMap: source.emissiveMap,
    emissiveIntensity: source.emissiveIntensity,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaMap: source.alphaMap,
    alphaTest: source.alphaTest,
    side: source.side,
    vertexColors: source.vertexColors,
    flatShading: source.flatShading,
  })

  if (namedBrass) {
    physical.metalness = Math.max(source.metalness, 0.88)
    physical.roughness = Math.min(source.roughness || 0.24, 0.24)
    physical.envMapIntensity = envIntensity * 1.2
  } else if (namedMetal || neutralSilver || source.metalness >= 0.55) {
    physical.metalness = Math.max(source.metalness, 0.84)
    physical.roughness = THREE.MathUtils.clamp(source.roughness >= 0.8 ? 0.25 : source.roughness * 0.62, 0.18, 0.34)
    physical.envMapIntensity = envIntensity * 1.18
  } else if (!source.map && hsl.h >= 0.54 && hsl.h <= 0.66 && hsl.s >= 0.5 && hsl.l >= 0.16 && hsl.l <= 0.52) {
    // Caixas industriais anodizadas/pintadas em azul técnico (ex.: fonte Proauto/Chinfa, LOGO! detalhe)
    physical.metalness = 0.28
    physical.roughness = 0.30
    physical.clearcoat = useClearcoat ? 0.38 : 0
    physical.clearcoatRoughness = 0.22
    physical.envMapIntensity = envIntensity * 1.12
  } else if (!source.map && hsl.s >= 0.58 && hsl.l >= 0.22 && hsl.l <= 0.68) {
    // Lentes de sinalizadores, tampas START/STOP e botões coloridos em policarbonato brilhante
    physical.metalness = 0.03
    physical.roughness = 0.22
    physical.clearcoat = useClearcoat ? 0.56 : 0
    physical.clearcoatRoughness = 0.16
    physical.envMapIntensity = envIntensity * 1.15
  } else if (hsl.l < 0.22) {
    // Poliamida técnica preta/antracite (PA66 GF30 — blocos de contacto, alavancas, bornes L1)
    physical.metalness = 0.04
    physical.roughness = 0.38
    physical.clearcoat = useClearcoat ? 0.16 : 0
    physical.clearcoatRoughness = 0.42
    physical.envMapIntensity = envIntensity
    if (!physical.bumpMap) {
      physical.bumpMap = getPolymerMicroGrain()
      physical.bumpScale = 0.00014
    }
  } else if (hsl.l > 0.72) {
    // Termoplástico industrial RAL 7035 / branco técnico (disjuntores, contatores WEG, PKZM0)
    physical.metalness = 0.03
    physical.roughness = 0.33
    physical.clearcoat = useClearcoat ? 0.26 : 0
    physical.clearcoatRoughness = 0.28
    physical.envMapIntensity = envIntensity * 1.05
  } else {
    // Policarbonato cinza técnico (ex.: Siemens LOGO!, calhas de suporte, bornes cinza)
    physical.metalness = Math.max(source.metalness, 0.06)
    physical.roughness = THREE.MathUtils.clamp(source.roughness >= 0.75 ? 0.36 : source.roughness * 0.72, 0.26, 0.44)
    physical.clearcoat = useClearcoat ? 0.22 : 0
    physical.clearcoatRoughness = 0.32
    physical.envMapIntensity = envIntensity
  }

  return physical
}

/** Clona e enriquece os materiais PBR de um modelo (a fonte em cache nunca é alterada). */
export function applyCatalogFinish(root: THREE.Object3D, options: FinishOptions = {}) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const finished = list.map((material) => finishCadMaterial(material, options))
    mesh.material = Array.isArray(mesh.material) ? finished : finished[0]
  })
}

/**
 * Acabamento físico fiel à botoneira de emergência industrial (cogumelo vermelho vivo
 * RAL 3020 com setas em relevo e recartilhado lateral, gola/porca e bloco NC ZB2/P20 em
 * poliamida preta acetinada, clip metálico zincado e parafusos dos bornes em latão).
 *
 * Resolve também o defeito do `P20AKR-1.glb`, cuja cabeça do cogumelo vinha exportada
 * com o material `Metal técnico` (fazendo o botão parecer todo preto/cinza escuro).
 */
export function applyEmergencyButtonFinish(root: THREE.Object3D, type?: string) {
  root.updateMatrixWorld(true)
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const totalBox = new THREE.Box3()
  const meshInfos: Array<{ mesh: THREE.Mesh; box: THREE.Box3; verts: number; matName: string }> = []
  let redNamedVerts = 0

  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    mesh.geometry.computeBoundingBox()
    const geomBox = mesh.geometry.boundingBox
    if (!geomBox) return
    const rel = new THREE.Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld)
    const box = geomBox.clone().applyMatrix4(rel)
    totalBox.union(box)
    const verts = mesh.geometry.attributes.position?.count ?? 0
    const firstMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const matName = ((firstMat?.name ?? '') as string).toLowerCase()
    if (matName.includes('cogumelo') || matName.includes('vermelho')) redNamedVerts += verts
    meshInfos.push({ mesh, box, verts, matName })
  })

  if (meshInfos.length === 0 || totalBox.isEmpty()) return

  // Eixo de profundidade do botão: Z após normalização (`P20AKR`), ou o maior eixo do aparelho.
  const size = totalBox.getSize(new THREE.Vector3())
  const keyOperated = type === 'emergencyButtonKeyP20ACR' || redNamedVerts > 500
  const grain = getPolymerMicroGrain()

  const redCapMat = new THREE.MeshPhysicalMaterial({
    name: 'Cogumelo vermelho RAL3020',
    color: new THREE.Color('#dc2626'),
    emissive: new THREE.Color('#7f1d1d'),
    emissiveIntensity: 0.05,
    metalness: 0.03,
    roughness: 0.27,
    clearcoat: 0.42,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.25,
    bumpMap: grain,
    bumpScale: 0.00016,
    side: THREE.DoubleSide,
  })

  const blackBodyMat = new THREE.MeshPhysicalMaterial({
    name: 'Poliamida preta ZB2',
    color: new THREE.Color('#181a20'),
    metalness: 0.04,
    roughness: 0.42,
    clearcoat: 0.14,
    clearcoatRoughness: 0.46,
    envMapIntensity: 1.05,
    bumpMap: grain,
    bumpScale: 0.0002,
    side: THREE.DoubleSide,
  })

  const silverClipMat = new THREE.MeshPhysicalMaterial({
    name: 'Aço zincado',
    color: new THREE.Color('#dce2ea'),
    metalness: 0.9,
    roughness: 0.22,
    envMapIntensity: 1.38,
    side: THREE.DoubleSide,
  })

  const brassScrewMat = new THREE.MeshPhysicalMaterial({
    name: 'Latão bornes NC',
    color: new THREE.Color('#d6b465'),
    metalness: 0.88,
    roughness: 0.22,
    envMapIntensity: 1.35,
    side: THREE.DoubleSide,
  })

  // No P20AKR normalizado (frente +Z) ou bruto (frente +Z), a cabeça do cogumelo ocupa os ~29 % frontais.
  const depthZ = Math.max(size.z, 1e-6)
  for (const info of meshInfos) {
    const center = info.box.getCenter(new THREE.Vector3())
    const fracZ = (center.z - totalBox.min.z) / depthZ
    const isNamedRed = info.matName.includes('cogumelo') || info.matName.includes('vermelho')
    const isNamedBlack = info.matName.includes('preto') || info.matName.includes('black')

    let chosen: THREE.Material
    if (keyOperated) {
      if (isNamedRed) chosen = redCapMat
      else if (isNamedBlack) chosen = blackBodyMat
      else chosen = fracZ < 0.32 ? brassScrewMat : silverClipMat
    } else {
      // P20AKR (rearme por giro): toda a cabeça frontal (fracZ >= 0.70) é cogumelo vermelho vivo;
      // a gola canelada, porca e bloco NC são poliamida preta; parafusos traseiros em latão e aro metálico em aço.
      if (fracZ >= 0.70) chosen = redCapMat
      else if (isNamedBlack || isNamedRed) chosen = blackBodyMat
      else chosen = fracZ < 0.28 ? brassScrewMat : silverClipMat
    }
    info.mesh.material = chosen
    info.mesh.castShadow = true
    info.mesh.receiveShadow = true
  }
}
