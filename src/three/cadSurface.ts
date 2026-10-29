import * as THREE from 'three'
import { textureLibraryEntry, type TextureLibraryEntry } from './textureLibrary'

/**
 * Superfície real dos modelos CAD.
 *
 * Os GLB dos fabricantes trazem só cores planas e, na maioria, nem coordenadas
 * UV — por isso qualquer mapa (mesmo o grão de poliamida de `finishCadMaterial`)
 * era amostrado num único ponto e o aparelho ficava liso como gesso.
 *
 * 1. `ensureCadUvs` projeta UVs em caixa à escala física (1 unidade UV = 1 mm),
 *    no referencial do modelo já ajustado; o padrão tem o mesmo tamanho em todas
 *    as peças e não estica.
 * 2. `applyCadSurfaceTextures` junta os mapas PBR digitalizados da biblioteca do
 *    editor (ambientCG, CC0) por família de material: termoplástico acetinado,
 *    poliamida preta, pintura em pó, aço inox/zincado, latão e cobre — e um grão
 *    fino procedimental que só se vê nos reflexos, como no plástico injetado.
 *    As cores de fábrica nunca mudam: os mapas só dão relevo e variação de brilho.
 *
 * Os mapas só são atribuídos depois de carregados (nunca há um frame preto); a
 * promessa devolvida resolve-se quando o modelo está completo, para as capturas.
 */

const DEFAULT_UNITS_PER_MM = 0.01
const loader = new THREE.TextureLoader()
const imageCache = new Map<string, Promise<THREE.Texture>>()
const tiledCache = new Map<string, Promise<THREE.Texture>>()
const readyListeners = new Set<() => void>()

/** O Painel 3D (frameloop a pedido) regista-se para redesenhar quando os mapas chegam. */
export function onCadTexturesReady(listener: () => void): () => void {
  readyListeners.add(listener)
  return () => { readyListeners.delete(listener) }
}
const notifyReady = () => { for (const listener of readyListeners) listener() }

function baseTexture(url: string, srgb: boolean): Promise<THREE.Texture> {
  const key = `${url}|${srgb ? 's' : 'l'}`
  let pending = imageCache.get(key)
  if (!pending) {
    pending = loader.loadAsync(url).then((texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      texture.anisotropy = 8
      texture.needsUpdate = true
      return texture
    })
    pending.catch(() => imageCache.delete(key))
    imageCache.set(key, pending)
  }
  return pending
}

/** Cópia com a repetição do padrão (a imagem e o upload na GPU são partilhados). */
function tiledTexture(url: string, srgb: boolean, tileMm: number): Promise<THREE.Texture> {
  const key = `${url}|${srgb ? 's' : 'l'}|${tileMm}`
  let pending = tiledCache.get(key)
  if (!pending) {
    pending = baseTexture(url, srgb).then((texture) => {
      const tiled = texture.clone()
      tiled.repeat.set(1 / tileMm, 1 / tileMm)
      tiled.needsUpdate = true
      return tiled
    })
    pending.catch(() => tiledCache.delete(key))
    tiledCache.set(key, pending)
  }
  return pending
}

let grain: THREE.DataTexture | null = null
/** Grão de injeção do termoplástico (≈ 0,04 mm por píxel, 2,5 mm por repetição). */
function polymerGrain(): THREE.DataTexture {
  if (grain) return grain
  const size = 64
  const data = new Uint8Array(size * size * 4)
  let seed = 0x2f6b9a1d
  for (let i = 0; i < size * size; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const v = 214 + ((seed >>> 24) % 42)
    data.set([v, v, v, 255], i * 4)
  }
  grain = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping
  grain.repeat.set(1 / 2.5, 1 / 2.5)
  grain.magFilter = THREE.LinearFilter
  grain.minFilter = THREE.LinearMipmapLinearFilter
  grain.generateMipmaps = true
  grain.needsUpdate = true
  return grain
}

/* ------------------------------------------------------------------ UV */

const position = new THREE.Vector3()
const normal = new THREE.Vector3()

/** UV de caixa em milímetros, vértice a vértice (mantém o índice e a partilha da geometria). */
function projectUv(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const pos = geometry.getAttribute('position')
  if (!pos) return
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const nor = geometry.getAttribute('normal')
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix)
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    position.fromBufferAttribute(pos, i).applyMatrix4(matrix)
    normal.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix)
    const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z)
    let u: number, v: number
    if (ax >= ay && ax >= az) { u = position.z * Math.sign(normal.x || 1); v = position.y }
    else if (ay >= az) { u = position.x; v = position.z * -Math.sign(normal.y || 1) }
    else { u = position.x * Math.sign(normal.z || 1); v = position.y }
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

const materialsOf = (mesh: THREE.Mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[]
const usesOwnMaps = (material: THREE.Material) => !!(material as THREE.MeshStandardMaterial).map

/**
 * Garante UVs em mm nas malhas sem texturas próprias. `root` é o modelo já ajustado
 * (`fitComponentModel`), em que `unitsPerMm` unidades de cena valem 1 mm.
 * A geometria do cache é partilhada pelos clones do mesmo tipo: a projeção fica feita uma vez.
 */
export function ensureCadUvs(root: THREE.Object3D, unitsPerMm = DEFAULT_UNITS_PER_MM) {
  root.updateMatrixWorld(true)
  const toModel = root.matrixWorld.clone().invert()
  const toMm = new THREE.Matrix4().makeScale(1 / unitsPerMm, 1 / unitsPerMm, 1 / unitsPerMm)
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry || !mesh.material) return
    if (materialsOf(mesh).some(usesOwnMaps)) return
    const matrix = toMm.clone().multiply(toModel).multiply(mesh.matrixWorld)
    const key = matrix.elements.map((value) => value.toFixed(3)).join(',')
    if (mesh.geometry.userData.cadUvKey === key) return
    projectUv(mesh.geometry, matrix)
    mesh.geometry.userData.cadUvKey = key
  })
}

/* ------------------------------------------------------------- materiais */

type SurfaceFamily = 'polymer' | 'polymer-dark' | 'powder-paint' | 'steel' | 'zinc' | 'brass' | 'copper'

interface FamilySpec {
  entry: string
  tileMm: number
  normalScale: number
  /** Rugosidade média do mapa (para conservar o brilho calibrado em `finishCadMaterial`). */
  roughnessMean: number
  metalness?: boolean
  grain?: number
}

const FAMILIES: Record<SurfaceFamily, FamilySpec> = {
  polymer: { entry: 'plastico-claro', tileMm: 46, normalScale: 0.55, roughnessMean: 0.36, grain: 0.018 },
  'polymer-dark': { entry: 'plastico-preto', tileMm: 40, normalScale: 0.6, roughnessMean: 0.25, grain: 0.022 },
  'powder-paint': { entry: 'pintura-texturada', tileMm: 70, normalScale: 0.7, roughnessMean: 0.53, grain: 0.012 },
  steel: { entry: 'aco-inox', tileMm: 24, normalScale: 0.55, roughnessMean: 0.27, metalness: true },
  zinc: { entry: 'aco-zincado', tileMm: 90, normalScale: 0.5, roughnessMean: 0.41, metalness: true },
  brass: { entry: 'latao', tileMm: 20, normalScale: 0.45, roughnessMean: 0.12, metalness: true },
  copper: { entry: 'cobre', tileMm: 24, normalScale: 0.45, roughnessMean: 0.25, metalness: true },
}

/** Família pela cor e pelo acabamento já calibrados (nunca pelo nome do fabricante). */
export function surfaceFamilyOf(material: THREE.MeshStandardMaterial): SurfaceFamily | null {
  if (material.map || material.transparent || material.opacity < 0.98) return null
  const emissive = material.emissive ? material.emissive.r + material.emissive.g + material.emissive.b : 0
  if (emissive * material.emissiveIntensity > 0.35) return null
  const name = (material.name || '').toLowerCase()
  if (/ecra|ecrã|screen|display|lcd|lente|lens|vidro|glass/.test(name)) return null
  const hsl = material.color.getHSL({ h: 0, s: 0, l: 0 })
  if (material.metalness >= 0.6) {
    if (/cobre|copper/.test(name) || (hsl.h >= 0.02 && hsl.h < 0.07 && hsl.s > 0.4)) return 'copper'
    if (/lat[aã]o|brass/.test(name) || (hsl.h >= 0.07 && hsl.h <= 0.17 && hsl.s >= 0.3)) return 'brass'
    if (/galvan|zinc|zinco/.test(name)) return 'zinc'
    return 'steel'
  }
  // Caixas pintadas (fontes, painéis): azul técnico com metalização baixa — pintura em pó.
  if (material.metalness >= 0.08 && hsl.s >= 0.45 && hsl.h >= 0.5 && hsl.h <= 0.7 && ((material as THREE.MeshPhysicalMaterial).clearcoat ?? 0) > 0.25) return 'powder-paint'
  if (hsl.l < 0.22) return 'polymer-dark'
  return 'polymer'
}

interface SurfaceOptions {
  /** Unidades do modelo ajustado por mm (Painel 3D: 0,01; capturas: 1). */
  unitsPerMm?: number
  /** Unidades de cena por mm no render final (calibra o relevo do grão); por omissão `unitsPerMm`. */
  renderUnitsPerMm?: number
  /** Tipos com acabamento próprio (motor) dispensam a passagem. */
  skip?: boolean
}

/**
 * Aplica UVs físicas e mapas reais aos materiais já acabados (`finishCadMaterial`).
 * Muta os materiais do modelo (que são cópias da instância). Resolve quando todos
 * os mapas estão atribuídos.
 */
export function applyCadSurfaceTextures(root: THREE.Object3D, options: SurfaceOptions = {}): Promise<void> {
  if (options.skip) return Promise.resolve()
  const unitsPerMm = options.unitsPerMm ?? DEFAULT_UNITS_PER_MM
  const renderUnitsPerMm = options.renderUnitsPerMm ?? unitsPerMm
  ensureCadUvs(root, unitsPerMm)
  const jobs: Promise<void>[] = []
  const done = new Set<THREE.Material>()
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('uv')) return
    for (const material of materialsOf(mesh)) {
      if (done.has(material) || !(material instanceof THREE.MeshStandardMaterial)) continue
      done.add(material)
      if (material.userData.cadSurface) continue
      const family = surfaceFamilyOf(material)
      if (!family) continue
      const spec = FAMILIES[family]
      const entry = textureLibraryEntry(spec.entry)
      if (!entry) continue
      material.userData.cadSurface = family
      jobs.push(assignMaps(material, entry, spec, renderUnitsPerMm))
    }
  })
  if (!jobs.length) return Promise.resolve()
  return Promise.all(jobs).then(() => { notifyReady() }, () => { notifyReady() })
}

function assignMaps(material: THREE.MeshStandardMaterial, entry: TextureLibraryEntry, spec: FamilySpec, renderUnitsPerMm: number): Promise<void> {
  const normalP = tiledTexture(entry.maps.normal, false, spec.tileMm)
  const roughP = tiledTexture(entry.maps.roughness, false, spec.tileMm)
  const metalP = spec.metalness && entry.maps.metalness ? tiledTexture(entry.maps.metalness, false, spec.tileMm) : Promise.resolve(null)
  return Promise.all([normalP, roughP, metalP]).then(([normalMap, roughnessMap, metalnessMap]) => {
    material.normalMap = normalMap
    material.normalScale.set(spec.normalScale, spec.normalScale)
    material.roughnessMap = roughnessMap
    // Conserva o brilho médio: o mapa modula à volta do valor já calibrado.
    material.roughness = THREE.MathUtils.clamp(material.roughness / spec.roughnessMean, 0.05, 1)
    if (metalnessMap) material.metalnessMap = metalnessMap
    if (spec.grain) {
      material.bumpMap = polymerGrain()
      // Relevo em mm convertido para as unidades da cena (o shader trabalha em unidades de cena).
      material.bumpScale = spec.grain * renderUnitsPerMm
    }
    material.needsUpdate = true
  }).catch(() => {
    // Sem rede/PWA fria: o material calibrado continua válido, só sem relevo.
    delete material.userData.cadSurface
  })
}
