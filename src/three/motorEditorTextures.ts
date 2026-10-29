import * as THREE from 'three'
import { finishCadMaterial } from './catalogMaterials'
import { textureLibraryEntry } from './textureLibrary'

const textureLoader = new THREE.TextureLoader()
const mapCache = new Map<string, THREE.Texture>()

function libraryMap(url: string, srgb: boolean): THREE.Texture {
  const key = `${url}:${srgb ? 'srgb' : 'linear'}`
  let texture = mapCache.get(key)
  if (!texture) {
    texture = textureLoader.load(url)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = 8
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace
    mapCache.set(key, texture)
  }
  return texture
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
      const color = material.color
      const r = color.r
      const g = color.g
      const b = color.b
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const isRedPaint = r > 0.45 && r > g * 1.6 && r > b * 1.6
      const isDark = max < 0.22
      const isMetalGray = !isRedPaint && max - min < 0.12 && max > 0.25 && max < 0.75
      const entryId = isRedPaint ? 'pintura-industrial' : isDark ? 'plastico-preto' : isMetalGray ? 'ferro-fundido' : 'aco-escovado'
      const entry = textureLibraryEntry(entryId)
      if (!entry) return material
      const tile = Math.max(0.35, 80 / entry.tileMm)
      const colorMap = libraryMap(entry.maps.color, true).clone()
      colorMap.repeat.set(tile, tile)
      material.map = colorMap
      const normalMap = libraryMap(entry.maps.normal, false).clone()
      normalMap.repeat.set(tile, tile)
      material.normalMap = normalMap
      material.normalScale.set(entry.normalScale, entry.normalScale)
      const roughMap = libraryMap(entry.maps.roughness, false).clone()
      roughMap.repeat.set(tile, tile)
      material.roughnessMap = roughMap
      if (entry.maps.metalness) {
        const metalMap = libraryMap(entry.maps.metalness, false).clone()
        metalMap.repeat.set(tile, tile)
        material.metalnessMap = metalMap
      }
      material.roughness = entry.roughness
      material.metalness = entry.metalness
      if (entry.tint) {
        if (isRedPaint) material.color.setRGB(r, g, b)
        else material.color.set(entry.color)
      }
      material.envMapIntensity = Math.max(material.envMapIntensity ?? 1, 1.15)
      material.needsUpdate = true
      return material
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]
  })
}
