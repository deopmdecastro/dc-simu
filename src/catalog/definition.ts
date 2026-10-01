import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { createGltfLoader } from '../three/gltfLoader'
import { nanoid } from 'nanoid'
import type {
  CatalogMeta, ComponentDefinition, EasingName, LightState, MaterialDef, PartDef, RuntimeSpec, RuntimeTerminal, StateDef, StateOverride, Vec3,
} from './types'

const safeId = (prefix: string) => `${prefix}${nanoid(6).replace(/[^A-Za-z0-9]/g, 'x')}`
export const newId = safeId

export const DEFAULT_META: CatalogMeta = {
  name: 'Novo componente', description: '', category: 'command', group: 'Personalizados', manufacturer: '', reference: '', internalCode: '', tag: 'X', tags: [], properties: [],
}

export function defaultMaterial(name = 'Plástico', color = '#cbd5e1'): MaterialDef {
  return { id: safeId('m_'), name, color, roughness: 0.55, metalness: 0.05, opacity: 1, emissive: '#000000', emissiveIntensity: 0 }
}

export function defaultPart(kind: PartDef['kind'], materialId: string | null, name?: string): PartDef {
  const sizes: Record<PartDef['kind'], Vec3> = {
    group: [1, 1, 1], box: [40, 40, 40], cylinder: [30, 40, 30], sphere: [30, 30, 30], cone: [30, 40, 30], torus: [30, 30, 6], glb: [1, 1, 1],
  }
  const labels: Record<PartDef['kind'], string> = { group: 'Grupo', box: 'Caixa', cylinder: 'Cilindro', sphere: 'Esfera', cone: 'Cone', torus: 'Anel', glb: 'Modelo GLB' }
  const size = sizes[kind]
  return {
    id: safeId('p_'), name: name ?? labels[kind], kind, parentId: null,
    position: [0, kind === 'group' || kind === 'glb' ? 0 : size[1] / 2, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
    size: [...size] as Vec3, materialId, visible: true, locked: false,
  }
}

export function defaultDefinition(): ComponentDefinition {
  const plastic = defaultMaterial('Plástico claro', '#d1d9e6')
  const body = { ...defaultPart('box', plastic.id, 'Corpo'), size: [36, 80, 58] as Vec3, position: [0, 40, 0] as Vec3 }
  const off: StateDef = { id: 'off', name: 'OFF', parts: {}, lights: {}, durationMs: 250, easing: 'easeInOut' }
  const on: StateDef = { id: 'on', name: 'ON', parts: {}, lights: {}, durationMs: 250, easing: 'easeInOut' }
  return {
    schemaVersion: 1, mount: 'din-rail', parts: [body], materials: [plastic], terminals: [], lights: [], states: [off, on], initialState: 'off', interactions: [], assets: {},
  }
}

/** Mantém a definição íntegra (campos novos, referências partidas) sem perder dados. */
export function normalizeDefinition(input: Partial<ComponentDefinition> | undefined): ComponentDefinition {
  const base = defaultDefinition()
  const def: ComponentDefinition = {
    ...base, ...input,
    schemaVersion: 1,
    parts: input?.parts ?? base.parts,
    materials: input?.materials?.length ? input.materials : base.materials,
    terminals: input?.terminals ?? [], lights: input?.lights ?? [],
    states: input?.states?.length ? input.states : base.states,
    interactions: input?.interactions ?? [], assets: input?.assets ?? {},
  }
  const partIds = new Set(def.parts.map((part) => part.id))
  def.parts = def.parts.map((part) => (part.parentId && !partIds.has(part.parentId) ? { ...part, parentId: null } : part))
  if (!def.states.some((state) => state.id === def.initialState)) def.initialState = def.states[0].id
  return def
}

/* --------------------------------------------------------------- construção 3D */

const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
}
export const applyEasing = (name: EasingName, t: number) => EASINGS[name]?.(Math.max(0, Math.min(1, t))) ?? t

const textureCache = new Map<string, THREE.Texture>()
const textureLoader = new THREE.TextureLoader()
function textureFor(def: ComponentDefinition, assetId: string | undefined, srgb: boolean): THREE.Texture | null {
  if (!assetId || !def.assets[assetId]) return null
  const key = `${assetId}:${def.assets[assetId].data.length}:${srgb}`
  let texture = textureCache.get(key)
  if (!texture) {
    texture = textureLoader.load(def.assets[assetId].data)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace
    textureCache.set(key, texture)
  }
  return texture
}

export function makeMaterial(def: ComponentDefinition, material: MaterialDef | undefined): THREE.MeshStandardMaterial {
  const m = material ?? defaultMaterial()
  const result = new THREE.MeshStandardMaterial({
    color: m.color, roughness: m.roughness, metalness: m.metalness, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity,
    transparent: m.opacity < 1, opacity: m.opacity, side: THREE.DoubleSide,
  })
  const map = textureFor(def, m.map, true)
  if (map) result.map = map
  const normal = textureFor(def, m.normalMap, false)
  if (normal) result.normalMap = normal
  result.name = m.name
  return result
}

function geometryFor(part: PartDef): THREE.BufferGeometry | null {
  const [a, b, c] = part.size
  switch (part.kind) {
    case 'box': return new THREE.BoxGeometry(Math.max(0.1, a), Math.max(0.1, b), Math.max(0.1, c))
    case 'cylinder': return new THREE.CylinderGeometry(Math.max(0.05, a / 2), Math.max(0.05, a / 2), Math.max(0.1, b), 32)
    case 'cone': return new THREE.ConeGeometry(Math.max(0.05, a / 2), Math.max(0.1, b), 32)
    case 'sphere': return new THREE.SphereGeometry(Math.max(0.05, a / 2), 32, 20)
    case 'torus': return new THREE.TorusGeometry(Math.max(0.1, a / 2), Math.max(0.05, c / 2), 14, 36)
    default: return null
  }
}

export type GlbCache = Map<string, THREE.Object3D>

/** Constrói a árvore Three (em mm). Os nomes dos nós são os ids das peças. */
export function buildDefinitionObject(def: ComponentDefinition, glb: GlbCache = new Map(), options: { includeHidden?: boolean } = {}): THREE.Group {
  const root = new THREE.Group()
  root.name = 'component'
  const materials = new Map(def.materials.map((material) => [material.id, material]))
  const nodes = new Map<string, THREE.Object3D>()
  for (const part of def.parts) {
    let node: THREE.Object3D
    if (part.kind === 'glb') {
      const source = part.asset ? glb.get(part.asset) : undefined
      node = new THREE.Group()
      if (source) {
        const clone = source.clone(true)
        clone.traverse((child) => { const mesh = child as THREE.Mesh; if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((item) => item.clone()) : mesh.material.clone() })
        node.add(clone)
      }
    } else if (part.kind === 'group') node = new THREE.Group()
    else {
      const mesh = new THREE.Mesh(geometryFor(part)!, makeMaterial(def, part.materialId ? materials.get(part.materialId) : undefined))
      mesh.castShadow = mesh.receiveShadow = true
      node = mesh
    }
    node.name = part.id
    node.userData.partId = part.id
    node.visible = options.includeHidden ? true : part.visible
    nodes.set(part.id, node)
  }
  for (const part of def.parts) {
    const node = nodes.get(part.id)!
    node.position.set(...part.position)
    node.rotation.set(THREE.MathUtils.degToRad(part.rotation[0]), THREE.MathUtils.degToRad(part.rotation[1]), THREE.MathUtils.degToRad(part.rotation[2]))
    node.scale.set(...part.scale)
    ;(part.parentId ? nodes.get(part.parentId) ?? root : root).add(node)
  }
  return root
}

export async function loadGlbAssets(def: ComponentDefinition, cache: GlbCache): Promise<boolean> {
  let changed = false
  const loader = createGltfLoader()
  for (const part of def.parts) {
    if (part.kind !== 'glb' || !part.asset || cache.has(part.asset)) continue
    const asset = def.assets[part.asset]
    if (!asset) continue
    try {
      const buffer = await (await fetch(asset.data)).arrayBuffer()
      const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => loader.parse(buffer, '', resolve as never, reject))
      // normaliza para ≈ 50 mm de maior dimensão (o utilizador ajusta com a escala)
      gltf.scene.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(gltf.scene, true)
      const size = box.getSize(new THREE.Vector3())
      const largest = Math.max(size.x, size.y, size.z) || 1
      const holder = new THREE.Group()
      const k = 50 / largest
      gltf.scene.scale.multiplyScalar(k)
      gltf.scene.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(k))
      holder.add(gltf.scene)
      cache.set(part.asset, holder)
      changed = true
    } catch { /* GLB inválido: a peça fica vazia */ }
  }
  return changed
}

export function boundsMm(def: ComponentDefinition, glb: GlbCache = new Map()): THREE.Box3 {
  const root = buildDefinitionObject(def, glb)
  const hidden: THREE.Object3D[] = []
  root.traverse((node) => { if (!node.visible) hidden.push(node) })
  hidden.forEach((node) => node.parent?.remove(node))
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root, true)
  if (box.isEmpty()) return new THREE.Box3(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 40, 20))
  return box
}

/* ------------------------------------------------------ estados e animações */

export function resolveState(def: ComponentDefinition, stateId: string | undefined): StateDef {
  return def.states.find((state) => state.id === stateId) ?? def.states.find((state) => state.id === def.initialState) ?? def.states[0]
}

export type PartPose = { position: Vec3; rotation: Vec3; scale: Vec3; visible: boolean; materialId: string | null }
export function posedPart(part: PartDef, override: StateOverride | undefined): PartPose {
  return {
    position: override?.position ?? part.position, rotation: override?.rotation ?? part.rotation, scale: override?.scale ?? part.scale,
    visible: override?.visible ?? part.visible, materialId: override?.materialId ?? part.materialId,
  }
}

export function lightStateOf(state: StateDef, lightId: string): LightState { return state.lights[lightId] ?? { on: false } }

/* ------------------------------------------------------------- derivados */

const DEG = Math.PI / 180
void DEG

/** Dimensões físicas e bornes normalizados (0..1) no volume do componente. */
export function runtimeSpec(def: ComponentDefinition, box: THREE.Box3): RuntimeSpec {
  const size = box.getSize(new THREE.Vector3())
  const width = Math.max(1, size.x), height = Math.max(1, size.y), depth = Math.max(1, size.z)
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  const terminals = def.terminals.map((terminal): RuntimeTerminal => {
    const nx = clamp((terminal.position[0] - box.min.x) / width)
    const ny = clamp((terminal.position[1] - box.min.y) / height)
    const nz = clamp((terminal.position[2] - box.min.z) / depth)
    const [fx, fy, fz] = terminal.normal
    const axis = Math.abs(fx) >= Math.abs(fy) && Math.abs(fx) >= Math.abs(fz) ? 'x' : Math.abs(fy) >= Math.abs(fz) ? 'y' : 'z'
    const position3D = { x: nx, y: ny, z: nz }
    // a face do borne é um dos 6 lados do volume: a normal decide qual
    if (axis === 'x') position3D.x = fx >= 0 ? 1 : 0
    else if (axis === 'y') position3D.y = fy >= 0 ? 1 : 0
    else position3D.z = fz >= 0 ? 1 : 0
    return { ...terminal, position3D, x: clamp(nx), y: clamp(1 - ny) }
  })
  return { widthMm: width, heightMm: height, depthMm: depth, originMm: [(box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2], terminals }
}

export function describeChanges(before: ComponentDefinition | null, after: ComponentDefinition): string[] {
  if (!before) return ['Versão inicial']
  const changes: string[] = []
  const count = (a: unknown[], b: unknown[], one: string, many: string) => {
    if (b.length > a.length) changes.push(`${b.length - a.length} ${b.length - a.length === 1 ? one : many} novo(s)`.replace('(s)', b.length - a.length === 1 ? '' : 's'))
    if (b.length < a.length) changes.push(`${a.length - b.length} ${one} removido(s)`)
  }
  const strip = (def: ComponentDefinition) => JSON.stringify({ ...def, assets: Object.keys(def.assets) })
  if (strip(before) === strip(after)) return ['Sem alterações de conteúdo']
  count(before.terminals, after.terminals, 'terminal', 'terminais')
  const sameTerminals = before.terminals.length === after.terminals.length && JSON.stringify(before.terminals) !== JSON.stringify(after.terminals)
  if (sameTerminals) changes.push('Terminais alterados (posição, tipo ou regras)')
  count(before.parts, after.parts, 'peça', 'peças')
  if (JSON.stringify(before.parts) !== JSON.stringify(after.parts) && before.parts.length === after.parts.length) changes.push('Geometria ajustada')
  if (JSON.stringify(before.materials) !== JSON.stringify(after.materials)) changes.push('Materiais/cores alterados')
  count(before.states, after.states, 'estado', 'estados')
  if (JSON.stringify(before.states) !== JSON.stringify(after.states) && before.states.length === after.states.length) changes.push('Estados ajustados')
  count(before.lights, after.lights, 'zona de luz', 'zonas de luz')
  count(before.interactions, after.interactions, 'interação', 'interações')
  if (JSON.stringify(before.interactions) !== JSON.stringify(after.interactions) && before.interactions.length === after.interactions.length) changes.push('Comportamento alterado')
  if (before.mount !== after.mount) changes.push('Tipo de montagem alterado')
  return changes.length ? changes : ['Ajustes menores']
}

/* ---------------------------------------------------------------- bake GLB */

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  return btoa(binary)
}

/** GLB da versão publicada: geometria + materiais na pose base (os estados animam por cima em tempo de execução); nós nomeados pelos ids das peças. Y para cima, frente em +Z. */
export async function bakeGlb(def: ComponentDefinition, glb: GlbCache): Promise<string> {
  await loadGlbAssets(def, glb)
  const root = buildDefinitionObject(def, glb, { includeHidden: false })
  const initial = resolveState(def, def.initialState)
  const byId = new Map<string, THREE.Object3D>()
  root.traverse((node) => { if (node.userData.partId) byId.set(node.userData.partId, node) })
  // luzes acesas no estado inicial
  for (const light of def.lights) {
    const state = lightStateOf(initial, light.id)
    const mesh = byId.get(light.partId) as THREE.Mesh | undefined
    const material = mesh?.material as THREE.MeshStandardMaterial | undefined
    if (material?.isMeshStandardMaterial) { material.emissive.set(state.on ? state.color ?? light.color : '#000000'); material.emissiveIntensity = state.on ? state.intensity ?? light.intensity : 0 }
  }
  const wrapper = new THREE.Group()
  wrapper.add(root)
  const exporter = new GLTFExporter()
  const result = await new Promise<ArrayBuffer>((resolve, reject) => exporter.parse(wrapper, (value) => resolve(value as ArrayBuffer), reject, { binary: true, onlyVisible: true }))
  return arrayBufferToBase64(result)
}
