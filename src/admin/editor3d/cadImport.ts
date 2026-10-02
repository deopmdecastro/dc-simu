import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { createGltfLoader } from '../../three/gltfLoader'
import { glbNodeAt, newId } from '../../catalog/definition'
import type { ComponentDefinition, PartDef, Vec3 } from '../../catalog/types'
import type { GlbCache } from '../../catalog/definition'

export const CAD_EXTENSIONS = ['glb', 'gltf', 'stl', 'obj'] as const
export const CAD_ACCEPT = '.glb,.gltf,.stl,.obj,model/gltf-binary,model/gltf+json,model/stl,model/obj'
/** Limite do GLB guardado no componente (o servidor aceita 8 MB de JSON, com base64). */
export const MAX_ASSET_BYTES = 4 * 1024 * 1024
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024
export const MAX_SPLIT_PARTS = 400

const GREY = () => new THREE.MeshStandardMaterial({ color: '#c8cdd6', roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide })

export const extensionOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase()

function readAs<T extends string | ArrayBuffer>(blob: Blob, mode: 'text' | 'buffer' | 'dataUrl'): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as T)
    reader.onerror = () => reject(reader.error)
    if (mode === 'text') reader.readAsText(blob)
    else if (mode === 'buffer') reader.readAsArrayBuffer(blob)
    else reader.readAsDataURL(blob)
  })
}

function exportGlb(scene: THREE.Object3D): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => new GLTFExporter().parse(scene, (value) => resolve(value as ArrayBuffer), reject, { binary: true }))
}

export interface ConvertedModel { dataUrl: string; name: string; bytes: number; meshes: number }

export const countMeshes = (root: THREE.Object3D) => { let n = 0; root.traverse((node) => { if ((node as THREE.Mesh).isMesh) n += 1 }); return n }

/** Converte .glb/.gltf/.stl/.obj num GLB único (a forma em que o componente guarda os modelos). Lança Error com mensagem para o utilizador. */
export async function convertToGlb(file: File): Promise<ConvertedModel> {
  const ext = extensionOf(file.name)
  if (!(CAD_EXTENSIONS as readonly string[]).includes(ext)) throw new Error('Formato não suportado. Use .glb, .gltf, .stl ou .obj (STEP/IGES: exporte para GLB a partir do CAD).')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('O ficheiro excede 30 MB. Simplifique a malha antes de importar.')
  const base = file.name.replace(/\.[^.]+$/, '')
  let scene: THREE.Object3D
  if (ext === 'glb') {
    if (file.size > MAX_ASSET_BYTES) throw new Error('O modelo excede 4 MB. Simplifique a malha (ou use compressão Meshopt/Draco) antes de importar.')
    const dataUrl = await readAs<string>(file, 'dataUrl')
    const buffer = await readAs<ArrayBuffer>(file, 'buffer')
    const gltf = await parseGltf(buffer)
    return { dataUrl, name: file.name, bytes: file.size, meshes: countMeshes(gltf) }
  }
  if (ext === 'gltf') {
    scene = await parseGltf(await readAs<string>(file, 'text'))
  } else if (ext === 'stl') {
    const geometry = new STLLoader().parse(await readAs<ArrayBuffer>(file, 'buffer'))
    geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, GREY())
    mesh.name = base
    mesh.rotation.x = -Math.PI / 2 // STL de CAD costuma ser Z para cima; o editor usa Y para cima
    scene = new THREE.Group(); scene.add(mesh)
  } else {
    scene = new OBJLoader().parse(await readAs<string>(file, 'text'))
    scene.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) { const old = mesh.material as THREE.MeshPhongMaterial; const color = Array.isArray(old) ? undefined : old?.color; mesh.material = GREY(); if (color) (mesh.material as THREE.MeshStandardMaterial).color.copy(color) } })
  }
  const meshes = countMeshes(scene)
  if (!meshes) throw new Error('O ficheiro não tem geometria utilizável.')
  const buffer = await exportGlb(scene)
  if (buffer.byteLength > MAX_ASSET_BYTES) throw new Error(`O modelo convertido tem ${(buffer.byteLength / 1048576).toFixed(1)} MB (máximo 4 MB). Simplifique a malha antes de importar.`)
  const dataUrl = await readAs<string>(new Blob([buffer], { type: 'model/gltf-binary' }), 'dataUrl')
  return { dataUrl, name: `${base}.glb`, bytes: buffer.byteLength, meshes }
}

async function parseGltf(data: ArrayBuffer | string): Promise<THREE.Object3D> {
  const loader = createGltfLoader()
  try {
    const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => loader.parse(data, '', resolve as never, reject))
    return gltf.scene
  } catch { throw new Error('Não foi possível interpretar este modelo (ficheiro inválido, com recursos externos ou compressão não suportada). Exporte-o como .glb simples.') }
}

/* --------------------------------------------------------- dividir em peças */

const hasMesh = (node: THREE.Object3D) => { let found = false; node.traverse((child) => { if ((child as THREE.Mesh).isMesh) found = true }); return found }

/** Peças em que um modelo (ou sub-nó) se divide: desce enquanto houver um único ramo e devolve os ramos seguintes. */
function branches(holder: THREE.Object3D, path: number[]): Array<{ path: number[]; node: THREE.Object3D; own: boolean }> {
  let node = glbNodeAt(holder, path)
  if (!node) return []
  const current = [...path]
  while (node.children.length === 1 && !(node as THREE.Mesh).isMesh) { node = node.children[0]; current.push(0) }
  const out: Array<{ path: number[]; node: THREE.Object3D; own: boolean }> = []
  node.children.forEach((child, index) => { if (hasMesh(child)) out.push({ path: [...current, index], node: child, own: false }) })
  if ((node as THREE.Mesh).isMesh && out.length) out.unshift({ path: [...current], node, own: true })
  return out
}

function pivotOf(item: { node: THREE.Object3D; own: boolean }): Vec3 {
  const box = new THREE.Box3()
  if (item.own) { const mesh = item.node as THREE.Mesh; mesh.geometry.computeBoundingBox(); if (mesh.geometry.boundingBox) box.copy(mesh.geometry.boundingBox).applyMatrix4(item.node.matrixWorld) } else box.setFromObject(item.node, true)
  if (box.isEmpty()) return [0, 0, 0]
  const c = box.getCenter(new THREE.Vector3())
  return [c.x, c.y, c.z]
}

export function canSplit(def: ComponentDefinition, cache: GlbCache, partId: string): boolean {
  const part = def.parts.find((item) => item.id === partId)
  const holder = part?.kind === 'glb' && part.asset ? cache.get(part.asset) : undefined
  if (!part || !holder) return false
  holder.updateMatrixWorld(true)
  return branches(holder, part.nodePath ?? []).length > 1
}

/** Quem referencia a peça (e deixaria de funcionar depois de dividida). */
export function partReferences(def: ComponentDefinition, partId: string): string[] {
  const out: string[] = []
  if (def.lights.some((item) => item.partId === partId)) out.push('luzes')
  if ((def.controls ?? []).some((item) => item.partId === partId)) out.push('botões/seletores')
  if (def.interactions.some((item) => item.partId === partId)) out.push('interações')
  return out
}

/** Divide uma peça CAD nos seus sub-nós: a peça passa a grupo (mantém posição/rotação/escala) e cada ramo é uma peça filha. */
export function splitPart(def: ComponentDefinition, cache: GlbCache, partId: string): { def: ComponentDefinition; ids: string[] } | { error: string } {
  const part = def.parts.find((item) => item.id === partId)
  const holder = part?.kind === 'glb' && part.asset ? cache.get(part.asset) : undefined
  if (!part || !holder) return { error: 'Selecione uma peça de modelo importado.' }
  const refs = partReferences(def, partId)
  if (refs.length) return { error: `Esta peça é usada em ${refs.join(', ')}. Remova essas ligações antes de dividir.` }
  holder.updateMatrixWorld(true)
  const items = branches(holder, part.nodePath ?? [])
  if (items.length < 2) return { error: 'Esta peça não tem sub-partes para dividir.' }
  if (items.length > MAX_SPLIT_PARTS) return { error: `A peça tem ${items.length} sub-partes (máximo ${MAX_SPLIT_PARTS}). Simplifique o modelo no CAD.` }
  const parentPivot: Vec3 = part.pivot ?? [0, 0, 0]
  const round = (value: number) => Math.round(value * 1e4) / 1e4
  const used = new Map<string, number>()
  const children: PartDef[] = items.map((item, index) => {
    const pivot = pivotOf(item)
    const raw = (item.node.name || `${part.name} ${index + 1}`).trim().slice(0, 60)
    const count = (used.get(raw) ?? 0) + 1
    used.set(raw, count)
    return {
      id: newId('p_'), name: item.own ? `${raw} (corpo)` : count > 1 ? `${raw} ${count}` : raw, kind: 'glb', parentId: part.id, asset: part.asset, nodePath: item.path, pivot: pivot.map(round) as Vec3, ownOnly: item.own || undefined,
      position: pivot.map((value, axis) => round(value - parentPivot[axis])) as Vec3, rotation: [0, 0, 0], scale: [1, 1, 1], size: [1, 1, 1], materialId: null, visible: part.visible, locked: false,
    }
  })
  const asGroup: PartDef = { ...part, kind: 'group', asset: undefined, nodePath: undefined, pivot: undefined, ownOnly: undefined, size: [1, 1, 1] }
  return { def: { ...def, parts: [...def.parts.map((item) => (item.id === part.id ? asGroup : item)), ...children] }, ids: children.map((item) => item.id) }
}
