import * as THREE from 'three'
import { buildDefinitionObject } from '../../catalog/definition'
import type { ComponentDefinition } from '../../catalog/types'
import { glbCache } from './editorStore'

/**
 * Miniaturas das peças para a lista «Objetos» do editor: cada peça é
 * desenhada sozinha, numa vista isométrica, com um renderer pequeno
 * reutilizado. O resultado é guardado em cache enquanto a peça não mudar.
 */
const SIZE = 96
let renderer: THREE.WebGLRenderer | null = null
let builtKey = ''
let builtRoot: THREE.Object3D | null = null
const cache = new Map<string, string>()

function getRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer
  if (typeof document === 'undefined') return null
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(SIZE, SIZE, false)
    renderer.setClearColor(0x000000, 0)
  } catch { renderer = null }
  return renderer
}

const keyOf = (def: ComponentDefinition) => `${def.parts.length}:${def.parts.map((part) => `${part.id}${part.kind}${part.size.join()}${part.position.join()}${part.rotation.join()}${part.scale.join()}${part.glbNode ?? ''}${part.materialId ?? ''}`).join('|')}|${def.materials.map((item) => `${item.id}${item.color}`).join('|')}`

/** Miniatura (data URL) da peça `partId`, ou null se não for possível desenhar. */
export function partThumbnail(def: ComponentDefinition, partId: string): string | null {
  const key = keyOf(def)
  const cacheKey = `${partId}@${key}`
  const hit = cache.get(cacheKey)
  if (hit !== undefined) return hit || null

  const gl = getRenderer()
  if (!gl) return null
  if (builtKey !== key || !builtRoot) {
    builtRoot = buildDefinitionObject(def, glbCache, { includeHidden: true })
    builtKey = key
    if (cache.size > 400) cache.clear()
  }
  const node = builtRoot.getObjectByName(partId)
  if (!node) { cache.set(cacheKey, ''); return null }

  const scene = new THREE.Scene()
  const holder = new THREE.Group()
  node.updateWorldMatrix(true, true)
  const clone = node.clone(true)
  clone.position.set(0, 0, 0)
  clone.rotation.set(0, 0, 0)
  clone.scale.copy(node.scale)
  holder.add(clone)
  scene.add(holder)
  scene.add(new THREE.AmbientLight(0xffffff, 1.5))
  const key1 = new THREE.DirectionalLight(0xffffff, 1.6)
  key1.position.set(1, 2, 1.6)
  scene.add(key1)

  const box = new THREE.Box3().setFromObject(clone, true)
  if (box.isEmpty()) { cache.set(cacheKey, ''); return null }
  const centre = box.getCenter(new THREE.Vector3())
  const radius = Math.max(0.001, box.getSize(new THREE.Vector3()).length() / 2)
  const camera = new THREE.PerspectiveCamera(32, 1, radius / 100, radius * 100)
  const direction = new THREE.Vector3(1, 0.75, 1).normalize()
  camera.position.copy(centre).addScaledVector(direction, radius * 3.1)
  camera.lookAt(centre)

  try {
    gl.render(scene, camera)
    const url = gl.domElement.toDataURL('image/png')
    cache.set(cacheKey, url)
    return url
  } catch {
    cache.set(cacheKey, '')
    return null
  } finally {
    scene.clear()
  }
}
