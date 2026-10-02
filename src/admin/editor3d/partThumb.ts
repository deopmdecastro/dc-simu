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

function builtFor(def: ComponentDefinition, key: string): THREE.Object3D | null {
  if (builtKey !== key || !builtRoot) {
    builtRoot = buildDefinitionObject(def, glbCache, { includeHidden: true })
    builtKey = key
    if (cache.size > 400) cache.clear()
  }
  return builtRoot
}

function shoot(scene: THREE.Scene, camera: THREE.Camera, gl: THREE.WebGLRenderer): string | null {
  try {
    gl.render(scene, camera)
    return gl.domElement.toDataURL('image/png')
  } catch {
    return null
  } finally {
    scene.clear()
  }
}

function lit(): THREE.Scene {
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 1.5))
  const key = new THREE.DirectionalLight(0xffffff, 1.6)
  key.position.set(1, 2, 1.6)
  scene.add(key)
  return scene
}

/**
 * Miniatura de uma zona do componente (ecrã, botão): vista a direito pela
 * normal indicada, enquadrada na área pedida. Serve de cartão para LCDs e
 * controlos, que não são peças próprias do modelo.
 */
export function areaThumbnail(def: ComponentDefinition, centre: [number, number, number], normal: [number, number, number], widthMm: number, heightMm: number): string | null {
  const key = keyOf(def)
  const cacheKey = `area:${centre.join()}:${normal.join()}:${widthMm}x${heightMm}@${key}`
  const hit = cache.get(cacheKey)
  if (hit !== undefined) return hit || null
  const gl = getRenderer()
  const root = gl ? builtFor(def, key) : null
  if (!gl || !root) return null

  const scene = lit()
  scene.add(root.clone(true))
  const centreVec = new THREE.Vector3(...centre)
  const direction = new THREE.Vector3(...normal).normalize()
  const half = Math.max(2, Math.max(widthMm, heightMm) * 0.75)
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, half * 40)
  camera.position.copy(centreVec).addScaledVector(direction, half * 8)
  camera.up.set(Math.abs(direction.y) > 0.9 ? 0 : 0, Math.abs(direction.y) > 0.9 ? 0 : 1, Math.abs(direction.y) > 0.9 ? -1 : 0)
  camera.lookAt(centreVec)
  const url = shoot(scene, camera, gl)
  cache.set(cacheKey, url ?? '')
  return url
}

/**
 * Miniatura (data URL) da peça `partId`. Quando `nodes` é indicado, mostra só
 * esses objetos do GLB (o manípulo, a tecla do botão…).
 */
export function partThumbnail(def: ComponentDefinition, partId: string, nodes?: string[]): string | null {
  const key = keyOf(def)
  const cacheKey = `${partId}:${nodes?.join('+') ?? ''}@${key}`
  const hit = cache.get(cacheKey)
  if (hit !== undefined) return hit || null

  const gl = getRenderer()
  const root = gl ? builtFor(def, key) : null
  if (!gl || !root) return null
  const holderNode = root.getObjectByName(partId)
  if (!holderNode) { cache.set(cacheKey, ''); return null }
  let node: THREE.Object3D = holderNode
  if (nodes?.length) {
    const picked = nodes.map((name) => holderNode.getObjectByName(name)).filter((item): item is THREE.Object3D => !!item)
    if (picked.length) {
      const group = new THREE.Group()
      for (const item of picked) {
        item.updateWorldMatrix(true, false)
        const clone = item.clone(true)
        clone.matrixAutoUpdate = false
        clone.matrix.copy(item.matrixWorld)
        group.add(clone)
      }
      node = group
    }
  }

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
