import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { boundsMm, loadGlbAssets, newId, type GlbCache } from '../../catalog/definition'
import type { ComponentDefinition, PartDef } from '../../catalog/types'
import type { ComponentType } from '../../types'
import { buildBuiltinDraft } from './builtinComponents'

export const MAX_MODEL_IMPORT_BYTES = 4 * 1024 * 1024
let worker: Worker | null = null
let sequence = 0
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o ficheiro.')); reader.readAsDataURL(file) })
}

function importStep(buffer: ArrayBuffer): Promise<any> {
  worker ??= new Worker(new URL('./stepImport.worker.ts', import.meta.url), { type: 'module' })
  worker.onerror = () => { for (const task of pending.values()) task.reject(new Error('Falha ao iniciar o conversor STEP no navegador.')); pending.clear(); worker?.terminate(); worker = null }
  worker.onmessage = ({ data }) => {
    const task = pending.get(data.id); if (!task) return
    pending.delete(data.id)
    data.error ? task.reject(new Error(data.error)) : task.resolve(data.result)
  }
  const id = ++sequence
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker!.postMessage({ id, buffer }, [buffer]) })
}

function triples(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  if (typeof value[0] === 'number') return value as number[]
  return (value as number[][]).flat()
}

async function stepToGlb(file: File): Promise<Blob> {
  const result = await importStep(await file.arrayBuffer())
  const scene = new THREE.Group()
  for (const [index, mesh] of result.meshes.entries()) {
    const positions = triples(mesh.attributes?.position?.array)
    const indices = triples(mesh.index?.array)
    if (positions.length < 9 || indices.length < 3) continue
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    if (mesh.attributes?.normal?.array) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(triples(mesh.attributes.normal.array), 3))
    geometry.setIndex(indices)
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
    const color = Array.isArray(mesh.color) ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]) : new THREE.Color('#b9c2cc')
    const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, metalness: 0.18, roughness: 0.48 }))
    object.name = mesh.name || `Malha ${index + 1}`
    scene.add(object)
  }
  if (!scene.children.length) throw new Error('O STEP não gerou malhas utilizáveis.')
  const output = await new GLTFExporter().parseAsync(scene, { binary: true })
  if (!(output instanceof ArrayBuffer)) throw new Error('Não foi possível gerar o modelo GLB.')
  return new Blob([output], { type: 'model/gltf-binary' })
}

async function validateModel(file: File): Promise<{ data: string; name: string }> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['glb', 'step', 'stp'].includes(extension ?? '')) throw new Error('Escolha um ficheiro .glb, .step ou .stp.')
  if (file.size <= 0) throw new Error('O ficheiro está vazio.')
  if (file.size > MAX_MODEL_IMPORT_BYTES) throw new Error('O ficheiro excede 4 MB. Simplifique o modelo e tente novamente.')
  if (extension === 'glb') return { data: await readDataUrl(file), name: file.name }
  const blob = await stepToGlb(file)
  if (blob.size > MAX_MODEL_IMPORT_BYTES) throw new Error('O GLB convertido excede 4 MB. Simplifique a malha no CAD e tente novamente.')
  return { data: await readDataUrl(new File([blob], `${file.name.replace(/\.(step|stp)$/i, '')}.glb`)), name: file.name.replace(/\.(step|stp)$/i, '.glb') }
}

/** Cria um rascunho novo mantendo ids funcionais e substituindo só o volume de referência. */
export async function buildBuiltinDraftWithModel(type: ComponentType, file: File): Promise<Awaited<ReturnType<typeof buildBuiltinDraft>>> {
  const model = await validateModel(file)
  const { meta, def, usedModel } = await buildBuiltinDraft(type)
  if (usedModel) throw new Error('Este componente já possui um modelo CAD real.')
  const placeholder = def.parts[0]
  if (!placeholder) throw new Error('Não foi encontrado o volume de referência para substituir.')
  const assetId = newId('a_')
  // A geometria do GLB é recentrada pelo loader; tirar também a posição Y do
  // volume procedural antes de medir para a nova origem ficar pousada em Y=0.
  const replacement: PartDef = { ...placeholder, name: 'Modelo importado', kind: 'glb', asset: assetId, materialId: null, position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0] }
  const draft: ComponentDefinition = { ...def, parts: def.parts.map((part) => part.id === placeholder.id ? replacement : part), assets: { ...def.assets, [assetId]: { name: model.name, mime: 'model/gltf-binary', data: model.data } } }
  const cache: GlbCache = new Map()
  await loadGlbAssets(draft, cache)
  if (!cache.has(assetId)) throw new Error('Não foi possível interpretar este modelo. Exporte novamente como GLB simples ou verifique o STEP.')
  const box = boundsMm({ ...draft, parts: [replacement] }, cache)
  if (box.isEmpty()) throw new Error('O modelo não contém geometria visível.')
  const size = box.getSize(new THREE.Vector3())
  const factor = Math.max(0.001, Math.round((Math.max(placeholder.size[0], placeholder.size[1], placeholder.size[2]) * 1.2 / (Math.max(size.x, size.y, size.z) || 1)) * 1000) / 1000)
  const centerX = (box.min.x + box.max.x) / 2, centerZ = (box.min.z + box.max.z) / 2
  const placed = { ...replacement, scale: [factor, factor, factor] as [number, number, number], position: [-centerX * factor, -box.min.y * factor, -centerZ * factor] as [number, number, number] }
  const final = { ...draft, parts: draft.parts.map((part) => part.id === placeholder.id ? placed : part) }
  return { meta: { ...meta, description: `${meta.description.replace(/ \(sem modelo CAD: volume com as dimensões físicas\)/, '')} — modelo CAD importado localmente.` }, def: final, usedModel: true }
}
