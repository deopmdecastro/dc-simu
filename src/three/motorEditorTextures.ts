import * as THREE from 'three'
import { boxProjectUv } from '../catalog/definition'
import { finishCadMaterial } from './catalogMaterials'
import { textureLibraryEntry } from './textureLibrary'

const textureLoader = new THREE.TextureLoader()
const mapCache = new Map<string, THREE.Texture>()
const pendingMaterials = new Set<THREE.Material>()
const pendingLoads = new Set<Promise<void>>()

/** Resolve quando todos os mapas do motor já pedidos estão carregados (para as capturas). */
export function waitMotorTextures(): Promise<void> {
  return Promise.all([...pendingLoads]).then(() => undefined)
}

function libraryMap(url: string, srgb: boolean, repeat: number): THREE.Texture {
  const key = `${url}:${srgb ? 'srgb' : 'linear'}:${repeat.toFixed(3)}`
  let texture = mapCache.get(key)
  if (!texture) {
    let settle: () => void = () => undefined
    const ready = new Promise<void>((resolve) => { settle = resolve })
    pendingLoads.add(ready)
    void ready.then(() => pendingLoads.delete(ready))
    texture = textureLoader.load(
      url,
      (loaded) => {
        loaded.needsUpdate = true
        loaded.userData.ready = true
        for (const mat of pendingMaterials) mat.needsUpdate = true
        settle()
      },
      undefined,
      () => {
        console.warn(`[motor-textures] falhou o mapa ${url}`)
        settle()
      },
    )
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeat, repeat)
    texture.anisotropy = 8
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    texture.userData.ready = false
    mapCache.set(key, texture)
  }
  return texture
}

function classifyMaterial(material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial): {
  entryId: string
  role: 'sew-paint' | 'dark-iron' | 'cast-iron' | 'machined-steel' | 'brass'
  keepColor: THREE.Color | null
} {
  const color = material.color
  const r = color.r
  const g = color.g
  const b = color.b
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  // Vermelho SEW-Eurodrive (carcaça aletada pintada em esmalte industrial metálico)
  const isRedPaint = r > 0.4 && r > g * 1.35 && r > b * 1.35
  // Latão / bronze de pernos ou chapa
  const isBrass = !isRedPaint && r > 0.55 && g > 0.42 && b < 0.32 && r > b * 1.6
  const isDark = max < 0.24
  const isMetalGray = !isRedPaint && max - min < 0.14 && max >= 0.24 && max < 0.76
  if (isRedPaint) return { entryId: 'pintura-industrial', role: 'sew-paint', keepColor: color.clone() }
  if (isBrass) return { entryId: 'latao', role: 'brass', keepColor: null }
  if (isDark) return { entryId: 'ferro-fundido', role: 'dark-iron', keepColor: null }
  if (isMetalGray) return { entryId: 'ferro-fundido', role: 'cast-iron', keepColor: null }
  return { entryId: 'aco-escovado', role: 'machined-steel', keepColor: null }
}

/**
 * Garante coordenadas UV em escala física real (mm) nas malhas CAD do motor.
 * O GLB DRN80MK4-B3 traz UVs brutos em milímetros (-233..233), o que esbatia
 * os mapas PBR em mipmaps cinzentos uniformes e tirava todo o relevo metálico.
 */
function ensurePhysicalUv(geometry: THREE.BufferGeometry, tileMm = 85): void {
  if (!geometry || geometry.userData.__dcMotorUvReady) return
  const uv = geometry.getAttribute('uv')
  let needsProjection = !uv
  if (uv) {
    let minU = Infinity
    let maxU = -Infinity
    const step = Math.max(1, Math.floor(uv.count / 120))
    for (let i = 0; i < uv.count; i += step) {
      const u = uv.getX(i)
      if (u < minU) minU = u
      if (u > maxU) maxU = u
    }
    if (!Number.isFinite(maxU - minU) || maxU - minU > 8 || maxU - minU < 1e-4) {
      needsProjection = true
    }
  }
  if (needsProjection) {
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    const span = box ? Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) : 200
    // Se a geometria está em unidades de cena (~2.6) em vez de mm (~264), ajusta o azulejo proporcionalmente.
    const effectiveTile = span > 20 ? tileMm : tileMm * 0.01
    boxProjectUv(geometry, Math.max(effectiveTile, 0.05))
  }
  geometry.userData.__dcMotorUvReady = true
}

/**
 * O GLB do motor SEW só traz cores planas (sem imagens embutidas). Aplica os
 * mapas PBR da biblioteca do editor de elementos — com projeção UV física,
 * esmalte metálico SEW e aço maquinado de alto contraste — reutilizando
 * texturas em cache sem clonar centenas de mapas.
 */
export function applyEditorMotorTextures(root: THREE.Object3D) {
  const materialCache = new Map<string, THREE.Material>()
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    ensurePhysicalUv(mesh.geometry, 82)
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const next = list.map((source) => {
      if ((source as THREE.Material).userData?.__dcMotorTextured) return source
      const cacheKey = source.uuid
      const cached = materialCache.get(cacheKey)
      if (cached) return cached

      const base = finishCadMaterial(source)
      if (!(base instanceof THREE.MeshStandardMaterial) && !(base instanceof THREE.MeshPhysicalMaterial)) {
        return base
      }
      const { entryId, role } = classifyMaterial(base)
      const entry = textureLibraryEntry(entryId) ?? textureLibraryEntry('ferro-fundido')
      if (!entry) return base

      const material = role === 'sew-paint'
        ? new THREE.MeshPhysicalMaterial({
            name: base.name,
            color: new THREE.Color('#b0181d'),
            metalness: 0.46,
            roughness: 0.29,
            clearcoat: 0.42,
            clearcoatRoughness: 0.22,
            reflectivity: 0.78,
          })
        : base

      const repeat = role === 'machined-steel' ? 1.35 : 1.0
      material.map = libraryMap(entry.maps.color, true, repeat)
      material.normalMap = libraryMap(entry.maps.normal, false, repeat)
      const nScale = role === 'sew-paint' ? 0.52 : role === 'machined-steel' ? 0.38 : Math.max(entry.normalScale, 0.65)
      material.normalScale.set(nScale, nScale)
      material.roughnessMap = libraryMap(entry.maps.roughness, false, repeat)
      if (entry.maps.metalness) {
        material.metalnessMap = libraryMap(entry.maps.metalness, false, repeat)
      }

      if (role === 'sew-paint') {
        // Vermelho industrial SEW-Eurodrive rico (RAL 3001/3002) com reflexo metálico nas alhetas
        material.color.set('#b3191e')
        material.metalness = 0.46
        material.roughness = 0.29
        material.envMapIntensity = 1.65
      } else if (role === 'machined-steel') {
        // Veio, chaveta, flange e parafusos em aço torneado/escovado brilhante
        material.color.set('#e4eaf2')
        material.metalness = 0.95
        material.roughness = 0.19
        material.envMapIntensity = 1.85
      } else if (role === 'brass') {
        material.color.set('#d8a63a')
        material.metalness = 0.93
        material.roughness = 0.22
        material.envMapIntensity = 1.75
      } else if (role === 'dark-iron') {
        // Tampa defletora traseira / caixa de ligações / detalhes em ferro fundido grafite
        material.color.set('#282e37')
        material.metalness = 0.68
        material.roughness = 0.34
        material.envMapIntensity = 1.55
      } else {
        // Tampas de rolamento e pés em ferro fundido maquinado
        material.color.set('#687280')
        material.metalness = 0.82
        material.roughness = 0.28
        material.envMapIntensity = 1.65
      }

      material.userData.__dcMotorTextured = true
      material.needsUpdate = true
      pendingMaterials.add(material)
      materialCache.set(cacheKey, material)
      return material
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]
  })
}
