import * as THREE from 'three'
import { finishCadMaterial } from './catalogMaterials'
import { textureLibraryEntry } from './textureLibrary'

const textureLoader = new THREE.TextureLoader()
const mapCache = new Map<string, THREE.Texture>()

function libraryMap(url: string, srgb: boolean): THREE.Texture {
  const key = `${url}:${srgb ? 'srgb' : 'linear'}`
  let texture = mapCache.get(key)
  if (!texture) {
    texture = textureLoader.load(
      url,
      (loaded) => {
        loaded.needsUpdate = true
        // Clones partilham a imagem — marcar todos os materiais quando carregar.
        loaded.userData.ready = true
      },
      undefined,
      () => {
        console.warn(`[motor-textures] falhou o mapa ${url}`)
      },
    )
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = 8
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    texture.userData.ready = false
    mapCache.set(key, texture)
  }
  return texture
}

function classifyMaterial(material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial): {
  entryId: string
  keepColor: THREE.Color | null
} {
  const color = material.color
  const r = color.r
  const g = color.g
  const b = color.b
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  // Vermelho SEW (RAL-like): carcaça pintada
  const isRedPaint = r > 0.4 && r > g * 1.35 && r > b * 1.35
  const isDark = max < 0.22
  const isMetalGray = !isRedPaint && max - min < 0.14 && max > 0.22 && max < 0.8
  if (isRedPaint) return { entryId: 'pintura-texturada', keepColor: color.clone() }
  if (isDark) return { entryId: 'plastico-preto', keepColor: null }
  if (isMetalGray) return { entryId: 'ferro-fundido', keepColor: null }
  return { entryId: 'aco-escovado', keepColor: null }
}

/**
 * O GLB do motor SEW só traz cores planas (sem imagens embutidas). Aplica os
 * mapas PBR da biblioteca do editor de elementos — a mesma usada nas peças
 * publicadas — para a carcaça pintada e os metais/plásticos técnicos.
 */
export function applyEditorMotorTextures(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const next = list.map((source) => {
      const material = finishCadMaterial(source)
      if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) {
        return material
      }
      const { entryId, keepColor } = classifyMaterial(material)
      const entry = textureLibraryEntry(entryId)
      if (!entry) return material

      // Azulejo um pouco mais apertado → detalhe visível no hero da landing.
      const tile = Math.max(0.55, 55 / entry.tileMm)

      const colorMap = libraryMap(entry.maps.color, true).clone()
      colorMap.wrapS = colorMap.wrapT = THREE.RepeatWrapping
      colorMap.repeat.set(tile, tile)
      colorMap.colorSpace = THREE.SRGBColorSpace
      material.map = colorMap

      const normalMap = libraryMap(entry.maps.normal, false).clone()
      normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping
      normalMap.repeat.set(tile, tile)
      normalMap.colorSpace = THREE.NoColorSpace
      material.normalMap = normalMap
      // Normal um pouco mais marcado para o relevo da tinta se notar no telemóvel.
      const nScale = Math.max(entry.normalScale, entryId.startsWith('pintura') ? 1.15 : entry.normalScale)
      material.normalScale.set(nScale, nScale)

      const roughMap = libraryMap(entry.maps.roughness, false).clone()
      roughMap.wrapS = roughMap.wrapT = THREE.RepeatWrapping
      roughMap.repeat.set(tile, tile)
      roughMap.colorSpace = THREE.NoColorSpace
      material.roughnessMap = roughMap

      if (entry.maps.metalness) {
        const metalMap = libraryMap(entry.maps.metalness, false).clone()
        metalMap.wrapS = metalMap.wrapT = THREE.RepeatWrapping
        metalMap.repeat.set(tile, tile)
        metalMap.colorSpace = THREE.NoColorSpace
        material.metalnessMap = metalMap
      }

      material.roughness = entry.roughness
      material.metalness = entry.metalness
      if (entry.tint) {
        if (keepColor) material.color.copy(keepColor)
        else material.color.set(entry.color)
      }
      // Carcaça SEW: garantir vermelho industrial se o CAD trouxe vermelho puro.
      if (entryId.startsWith('pintura') && keepColor) {
        material.color.setRGB(
          Math.max(keepColor.r, 0.72),
          Math.min(keepColor.g, 0.12),
          Math.min(keepColor.b, 0.1),
        )
      }
      material.envMapIntensity = Math.max(material.envMapIntensity ?? 1, 1.35)
      material.needsUpdate = true
      return material
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]
  })
}
