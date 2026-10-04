import * as THREE from 'three'
import { inferBreakerAxes, tiltControlPatch } from '../../catalog/controlMotion'
import { TEMPLATES, type ComponentTemplate, type TerminalTemplate } from '../../electrical/factory'
import { boundsMm, buildDefinitionObject, defaultDefinition, defaultMaterial, defaultPart, loadGlbAssets, newId, type GlbCache } from '../../catalog/definition'
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
    if (item.position3D) {
      // Posição real medida no próprio GLB (furo/encaixe do aparelho).
      const p = item.position3D
      const px = box.min.x + Math.min(1, Math.max(0, p.x)) * size.x
      const py = box.max.y - Math.min(1, Math.max(0, p.y)) * size.y
      const pz = box.min.z + Math.min(1, Math.max(0, p.z)) * size.z
      // A face é a coordenada que está encostada à caixa envolvente.
      const margin = 0.02
      if (p.y <= margin) { position = [px, box.max.y, pz]; normal = [0, 1, 0] }
      else if (p.y >= 1 - margin) { position = [px, box.min.y, pz]; normal = [0, -1, 0] }
      else if (p.z >= 1 - margin) { position = [px, py, box.max.z]; normal = [0, 0, 1] }
      else if (p.z <= margin) { position = [px, py, box.min.z]; normal = [0, 0, -1] }
      else if (p.x >= 1 - margin) { position = [box.max.x, py, pz]; normal = [1, 0, 0] }
      else if (p.x <= margin) { position = [box.min.x, py, pz]; normal = [-1, 0, 0] }
      else { position = [px, py, box.max.z]; normal = [0, 0, 1] }
    }
    else if (item.y <= 0.02) { position = [x, box.max.y, center.z]; normal = [0, 1, 0] }
    else if (item.y >= 0.98) { position = [x, box.min.y, center.z]; normal = [0, -1, 0] }
    else { position = [x, box.max.y - item.y * size.y, box.max.z]; normal = [0, 0, 1] }
    const polarity = inferred.polarity
    const direction = inferred.direction ?? (item.kind === 'power-in' || item.kind === 'coil-plus' || item.kind === 'coil-minus' ? 'in' : item.kind === 'power-out' ? 'out' : 'io')
    return {
      id: item.defId ?? newId('t_'), label, name: item.displayName ?? (label === item.label ? label : item.label), position: [round(position[0]), round(position[1]), round(position[2])], normal,
      kind: item.kind, terminalType: item.terminalType ?? 'screw', polarity, electricalClass: item.electricalClass ?? inferred.electricalClass, direction,
      accepts: item.rules?.accepts ?? '', color: item.color ?? inferred.color ?? '#cbd5e1', fn: item.label, contact: inferred.contact,
      ...(item.diameter ? { diameterMm: item.diameter } : {}),
    }
  })
}


/** Nós reais do CAD do RGK DM-20 (nomes exportados pelo Blender). */
const DM20_NODES = {
  dialBody: 'occurrence_of_Plane008_Material004_0',
  dialPointer: 'occurrence_of_Plane010_Material003_0',
  glass: 'occurrence_of_Cube002_Material008_0',
  buttonLeft: 'occurrence_of_Plane004_Material003_0',
  buttonMiddle: 'occurrence_of_Plane002_Material002_0',
  buttonRight: 'occurrence_of_Plane003_Material007_0',
}

/**
 * Prepara o multímetro RGK DM-20 como componente editável completo:
 * seletor rotativo, três botões e o LCD aparecem na lista de elementos do
 * editor, cada um ligado ao objeto correspondente dentro do GLB.
 */
function seedMultimeterDm20(def: ComponentDefinition, cache: GlbCache) {
  const partId = def.parts[0]?.id
  if (!partId) return
  const root = buildDefinitionObject(def, cache)
  const holder = root.getObjectByName(partId)
  const boxOf = (name: string) => {
    const node = holder?.getObjectByName(name)
    if (!node) return null
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(node, true)
    if (box.isEmpty()) return null
    const centre = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const r = (value: number) => Math.round(value * 100) / 100
    return { centre: [r(centre.x), r(centre.y), r(centre.z)] as Vec3, size: [r(size.x), r(size.y), r(size.z)] as Vec3 }
  }

  def.vars = [
    { id: 'dial', name: 'Seletor de função', type: 'text', initial: 'off' },
    { id: 'hold', name: 'Reter leitura (HOLD)', type: 'bool', initial: false },
    { id: 'backlight', name: 'Retroiluminação', type: 'bool', initial: false },
  ]
  def.behavior = { type: 'multimeter', com: 'dm20-com', volt: 'dm20-volt', milliamp: 'dm20-ma', amp: 'dm20-amp' }
  const button = (node: string, name: string, event: 'select' | 'power' | 'hold') => ({
    id: newId('ctl_'), name, kind: 'button' as const, partId, nodes: [node], axis: [0, 0, 1] as Vec3, travelMm: 1,
    positions: [], actions: [{ type: 'behavior' as const, event }],
  })
  def.controls = [
    {
      id: newId('ctl_'), name: 'Seletor de função', kind: 'selector', partId,
      nodes: [DM20_NODES.dialBody, DM20_NODES.dialPointer], axis: [0, 0, -1], travelMm: 0, bindVar: 'dial',
      actions: [],
      positions: [
        { id: 'off', label: 'OFF', angle: -52 }, { id: 'acv', label: 'V ~', angle: -22 }, { id: 'dcv', label: 'V ⎓', angle: 0 },
        { id: 'ma', label: 'mA', angle: 68 }, { id: 'a10', label: '10 A', angle: 93 }, { id: 'ohm', label: 'Ω', angle: -112 },
      ],
    },
    button(DM20_NODES.buttonLeft, 'Botão de luz / ligar', 'power'),
    button(DM20_NODES.buttonMiddle, 'Botão SELECT', 'select'),
    button(DM20_NODES.buttonRight, 'Botão HOLD', 'hold'),
  ]

  const glass = boxOf(DM20_NODES.glass)
  if (glass) {
    def.displays = [{
      id: newId('dsp_'), name: 'LCD', kind: 'lcd',
      position: [glass.centre[0], glass.centre[1], Math.round((glass.centre[2] + glass.size[2] / 2) * 100) / 100],
      normal: [0, 0, 1], roll: 0,
      widthMm: Math.max(4, glass.size[0]), heightMm: Math.max(4, glass.size[1]), density: 8,
      background: '#bdc8b2', foreground: '#172018', lines: [],
      powerVar: '', backlightVar: 'backlight',
    }]
  }
}


/**
 * Placa de bornes do motor como peças reais e editáveis: base, seis bornes
 * U1/V1/W1/W2/U2/V2 e as pontes em estrela. Assim as ligações aparecem no
 * 3D do editor (e não apenas no componente publicado).
 */
function seedMotorTerminalBoard(def: ComponentDefinition, cache: GlbCache) {
  if (def.parts.some((part) => part.name === 'Placa de bornes')) return
  const box = boundsMm(def, cache)
  const widthMm = Math.max(40, box.max.x - box.min.x)
  const k = widthMm // o modelo publicado desenha a placa em unidades do componente
  const brass = defaultMaterial('Latão', '#c79532')
  const plate = defaultMaterial('Baquelite', '#c9b99f')
  def.materials = [...def.materials, plate, brass]
  const baseY = box.max.y
  const z0 = 0.08 * k
  const group = { ...defaultPart('group', null, 'Placa de bornes'), position: [0, baseY, z0] as Vec3 }
  const parts = [group]
  parts.push({ ...defaultPart('box', plate.id, 'Base da placa'), parentId: group.id, size: [0.52 * k, 0.035 * k, 0.31 * k] as Vec3, position: [0, 0, 0] as Vec3 })
  const xs = [-0.18, 0, 0.18]
  const zs = [-0.09, 0.09]
  const labels = [['U1', 'V1', 'W1'], ['W2', 'U2', 'V2']]
  zs.forEach((z, row) => xs.forEach((x, col) => {
    parts.push({ ...defaultPart('cylinder', brass.id, `Borne ${labels[row][col]}`), parentId: group.id, size: [0.064 * k, 0.06 * k, 0.064 * k] as Vec3, position: [x * k, 0.035 * k, z * k] as Vec3 })
  }))
  parts.push({ ...defaultPart('box', brass.id, 'Ponte estrela W2-U2'), parentId: group.id, size: [0.22 * k, 0.018 * k, 0.052 * k] as Vec3, position: [-0.09 * k, 0.077 * k, zs[1] * k] as Vec3 })
  parts.push({ ...defaultPart('box', brass.id, 'Ponte estrela U2-V2'), parentId: group.id, size: [0.22 * k, 0.018 * k, 0.052 * k] as Vec3, position: [0.09 * k, 0.077 * k, zs[1] * k] as Vec3 })
  def.parts = [...def.parts, ...parts]
}

/**
 * Acrescenta a um rascunho já importado os elementos que passaram a ser
 * gerados na importação (botões, LCD, placa de bornes). Devolve `null` quando
 * não há nada a acrescentar ou quando o utilizador já criou os seus.
 */
export async function upgradeBuiltinDraft(type: ComponentType, def: ComponentDefinition): Promise<ComponentDefinition | null> {
  const next: ComponentDefinition = JSON.parse(JSON.stringify(def))
  const cache: GlbCache = new Map()
  await loadGlbAssets(next, cache)
  let changed = false
  if (type === 'multimeterDm20' && (next.controls ?? []).length === 0 && (next.displays ?? []).length === 0) {
    seedMultimeterDm20(next, cache)
    changed = (next.controls ?? []).length > 0
  }
  if (type === 'motor3ph' && !next.parts.some((part) => part.name === 'Placa de bornes')) {
    seedMotorTerminalBoard(next, cache)
    changed = true
  }
  return changed ? next : null
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
  // Proteções importadas chegam ao editor já testáveis. No WEG, o manípulo
  // azul original do GLB está isolado no nó WEG_Handle e é o próprio atuador.
  if (['breaker1p', 'breaker2p', 'breaker3p', 'breaker4p', 'breakerWegMdwC10', 'breakerSteckSdC25', 'phoenixEcb3000760', 'motorBreaker', 'residualBreaker'].includes(type)) {
    const partId = def.parts[0]?.id
    if (partId) {
      def.vars = [{ id: 'closed', name: 'Disjuntor fechado', type: 'bool', initial: true }, { id: 'tripped', name: 'Disparado', type: 'bool', initial: false }]
      // WEG: o manípulo basculante roda à volta dos polos (eixo deduzido dos bornes) em vez de deslizar 8 mm
      const weg = type === 'breakerWegMdwC10'
      // Steck SD C25: o manípulo vai no GLB como malhas `dcsimu_handle_*` (vermelho + serigrafia O-OFF)
      const steck = type === 'breakerSteckSdC25'
      const tilt = weg || steck ? tiltControlPatch(inferBreakerAxes(def.terminals.map((terminal) => terminal.position)), [0, 0, 1]) : null
      def.controls = [{ id: newId('ctl_'), name: 'Liga / desliga', kind: 'toggle', partId, nodes: weg ? ['WEG_Handle'] : steck ? ['dcsimu_handle_2', 'dcsimu_handle_3'] : undefined, axis: tilt?.axis ?? [0, 1, 0], travelMm: 0, ...(tilt ? { motion: tilt.motion } : {}), bindVar: 'closed', positions: [], actions: [{ type: 'toggleVar', var: 'closed' }] }]
    }
  }
  // O multímetro DM-20 chega ao editor completo: seletor, botões e LCD já
  // ligados aos objetos reais do modelo, visíveis na lista como elementos.
  if (type === 'multimeterDm20') seedMultimeterDm20(def, cache)
  if (type === 'motor3ph') seedMotorTerminalBoard(def, cache)
  const meta: CatalogMeta = {
    ...DEFAULT_META,
    name: tpl.paletteName, description: `Componente integrado da plataforma, importado como ponto de partida editável${usedModel ? '' : ' (sem modelo CAD: volume com as dimensões físicas)'}.`,
    category: tpl.category, group: tpl.group, tag: tpl.tag.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'X', tags: [],
    properties: [{ key: 'Origem', value: `${BUILTIN_ORIGIN_PREFIX}${type}` }],
  }
  return { meta, def, usedModel }
}
