import * as THREE from 'three'
import { TEMPLATES, type ComponentTemplate, type TerminalTemplate } from '../../electrical/factory'
import { boundsMm, defaultDefinition, defaultMaterial, defaultPart, loadGlbAssets, newId, type GlbCache } from '../../catalog/definition'
import { inferFromFunction } from '../../catalog/terminalProfiles'
import { DEFAULT_META } from '../../catalog/definition'
import type { CatalogEntry, CatalogMeta, ComponentDefinition, TerminalDef, Vec3 } from '../../catalog/types'
import { getComponentModelSpec, getComponentPhysicalSizeMm } from '../../three/modelPaths'
import type { ComponentType } from '../../types'

/** Componentes que já vêm com a plataforma (Biblioteca do simulador), listados também na Biblioteca 3D do Admin. */
export interface BuiltinInfo {
  type: ComponentType
  name: string
  group: string
  category: ComponentTemplate['category']
  tag: string
  terminals: number
  hasModel: boolean
}

export const BUILTIN_ORIGIN_PREFIX = 'Integrado · '

export function builtinComponents(): BuiltinInfo[] {
  return (Object.entries(TEMPLATES) as Array<[ComponentType, ComponentTemplate]>)
    .filter(([type]) => !String(type).startsWith('cat:'))
    .map(([type, tpl]) => ({ type, name: tpl.paletteName, group: tpl.group, category: tpl.category, tag: tpl.tag, terminals: tpl.terminals.length, hasModel: !!getComponentModelSpec(type) }))
}

/** Tipo integrado de que um componente do catálogo foi importado (ou null). */
export function builtinTypeOf(entry: Pick<CatalogEntry, 'meta'>): string | null {
  const origin = entry.meta.properties?.find((item) => item.key === 'Origem' && item.value.startsWith(BUILTIN_ORIGIN_PREFIX))
  return origin ? origin.value.slice(BUILTIN_ORIGIN_PREFIX.length) : null
}

const MOUNT: Record<string, ComponentDefinition['mount']> = {
  protection: 'din-rail', relay: 'din-rail', contactor: 'din-rail', terminal: 'din-rail', controller: 'din-rail', power: 'din-rail', drive: 'din-rail',
  command: 'panel-front', signaling: 'panel-front', motor: 'machine', sensor: 'machine', measurement: 'machine',
}

/** Rotação base do modelo (e inversão de profundidade) como Euler XYZ em graus. */
function rotationDeg(base: [number, number, number], flipDepth?: boolean): Vec3 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...base, 'XYZ'))
  if (flipDepth) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
  const round = (value: number) => Math.round(THREE.MathUtils.radToDeg(value) * 100) / 100
  return [round(e.x) + 0, round(e.y) + 0, round(e.z) + 0]
}

/** Bornes do modelo integrado, colocados sobre a caixa envolvente (topo, base ou frente conforme a posição no esquema). */
function terminalsFor(list: TerminalTemplate[], box: THREE.Box3): TerminalDef[] {
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const used = new Set<string>()
  return list.map((item) => {
    const inferred = inferFromFunction(item.label)
    let label = item.label
    while (used.has(label)) label += '′'
    used.add(label)
    const x = box.min.x + Math.min(1, Math.max(0, item.x)) * size.x
    const round = (v: number) => Math.round(v * 100) / 100
    let position: Vec3
    let normal: Vec3
    if (item.y <= 0.02) { position = [x, box.max.y, center.z]; normal = [0, 1, 0] }
    else if (item.y >= 0.98) { position = [x, box.min.y, center.z]; normal = [0, -1, 0] }
    else { position = [x, box.max.y - item.y * size.y, box.max.z]; normal = [0, 0, 1] }
    const polarity = inferred.polarity
    const direction = inferred.direction ?? (item.kind === 'power-in' || item.kind === 'coil-plus' || item.kind === 'coil-minus' ? 'in' : item.kind === 'power-out' ? 'out' : 'io')
    return {
      id: newId('t_'), label, name: item.displayName ?? (label === item.label ? label : item.label), position: [round(position[0]), round(position[1]), round(position[2])], normal,
      kind: item.kind, terminalType: item.terminalType ?? 'screw', polarity, electricalClass: item.electricalClass ?? inferred.electricalClass, direction,
      accepts: item.rules?.accepts ?? '', color: item.color ?? inferred.color ?? '#cbd5e1', fn: item.label, contact: inferred.contact,
    }
  })
}

/** Rascunho editável a partir de um componente integrado: modelo GLB (ou volume físico) + bornes + metadados. */
export async function buildBuiltinDraft(type: ComponentType): Promise<{ meta: CatalogMeta; def: ComponentDefinition; usedModel: boolean }> {
  const tpl = TEMPLATES[type]
  if (!tpl) throw new Error('Componente integrado desconhecido.')
  const spec = getComponentModelSpec(type)
  const physical = getComponentPhysicalSizeMm(type) ?? { width: Math.max(8, Math.round(tpl.w / 1.5)), height: Math.max(8, Math.round(tpl.h / 1.5)), depth: 45 }
  const base = defaultDefinition()
  const material = defaultMaterial('Plástico', '#cbd5e1')
  const def: ComponentDefinition = { ...base, mount: spec?.placement === 'rail' ? 'din-rail' : spec?.placement && spec.placement !== 'din-rail' ? spec.placement : MOUNT[tpl.category] ?? 'din-rail', materials: [material], parts: [], terminals: [], assets: {} }
  const cache: GlbCache = new Map()
  let usedModel = false
  if (spec) {
    const assetId = newId('a_')
    const part = { ...defaultPart('glb', null, tpl.paletteName.slice(0, 40)), asset: assetId, rotation: rotationDeg(spec.rotation, spec.flipDepth) }
    const draft: ComponentDefinition = { ...def, parts: [part], assets: { [assetId]: { name: spec.path.split('/').pop() ?? 'modelo.glb', mime: 'model/gltf-binary', data: spec.path } } }
    await loadGlbAssets(draft, cache)
    if (cache.has(assetId)) {
      // escala uniforme pela altura física (igual ao Painel 3D) e base em Y = 0, centrado em X/Z
      const raw = boundsMm(draft, cache)
      const k = raw.getSize(new THREE.Vector3()).y > 1e-6 ? physical.height / raw.getSize(new THREE.Vector3()).y : 1
      const scaled: ComponentDefinition = { ...draft, parts: [{ ...part, scale: [k, k, k] as Vec3 }] }
      const box = boundsMm(scaled, cache)
      const c = box.getCenter(new THREE.Vector3())
      scaled.parts = [{ ...scaled.parts[0], position: [-c.x, -box.min.y, -c.z] as Vec3 }]
      Object.assign(def, scaled, { materials: [material] })
      usedModel = true
    }
  }
  if (!usedModel) {
    def.parts = [{ ...defaultPart('box', material.id, 'Corpo'), size: [physical.width, physical.height, physical.depth] as Vec3, position: [0, physical.height / 2, 0] as Vec3 }]
  }
  const box = boundsMm(def, cache)
  def.terminals = terminalsFor(tpl.terminals, box)
  // Proteções importadas chegam ao editor já testáveis. O WEG não expõe a
  // alavanca como nó separado no GLB; nesse caso, o corpo funciona como área
  // de clique sem receber deslocamento artificial.
  if (['breaker1p', 'breaker2p', 'breaker3p', 'breaker4p', 'breakerWegMdwC10', 'phoenixEcb3000760', 'motorBreaker', 'residualBreaker'].includes(type)) {
    const partId = def.parts[0]?.id
    if (partId) {
      def.vars = [{ id: 'closed', name: 'Disjuntor fechado', type: 'bool', initial: true }, { id: 'tripped', name: 'Disparado', type: 'bool', initial: false }]
      def.controls = [{ id: newId('ctl_'), name: 'Liga / desliga', kind: 'toggle', partId, axis: [0, 1, 0], travelMm: 0, bindVar: 'closed', positions: [], actions: [{ type: 'toggleVar', var: 'closed' }] }]
    }
  }
  const meta: CatalogMeta = {
    ...DEFAULT_META,
    name: tpl.paletteName, description: `Componente integrado da plataforma, importado como ponto de partida editável${usedModel ? '' : ' (sem modelo CAD: volume com as dimensões físicas)'}.`,
    category: tpl.category, group: tpl.group, tag: tpl.tag.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'X', tags: [],
    properties: [{ key: 'Origem', value: `${BUILTIN_ORIGIN_PREFIX}${type}` }],
  }
  return { meta, def, usedModel }
}
