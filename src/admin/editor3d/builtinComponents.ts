import * as THREE from 'three'
import { inferBreakerAxes, tiltControlPatch } from '../../catalog/controlMotion'
import { TEMPLATES, type ComponentTemplate, type TerminalTemplate } from '../../electrical/factory'
import { boundsMm, buildDefinitionObject, defaultDefinition, defaultMaterial, defaultPart, loadGlbAssets, newId, type GlbCache } from '../../catalog/definition'
import { inferFromFunction } from '../../catalog/terminalProfiles'
import { DEFAULT_META } from '../../catalog/definition'
import type { CatalogEntry, CatalogMeta, ComponentDefinition, TerminalDef, Vec3 } from '../../catalog/types'
import { BREAKER_HANDLE_RIG, getComponentModelSpec, getComponentPhysicalSizeMm, hasComponent3DVisual } from '../../three/modelPaths'
import { isTerminalAssemblyComponent, terminalAssemblyLayout } from '../../three/terminalAssembly'
import type { ComponentType } from '../../types'
import { REAL_TERMINALS, terminalInsetMm } from '../../electrical/realInterfaces'
import { FACE_NORMAL } from '../../catalog/terminalProfiles'
import { MOTOR_BOARD, MOTOR_BOARD_TOP, MOTOR_FAN, MOTOR_STUD, motorBridges, motorCadToCentered } from '../../three/motorTerminalLayout'
import { seedLogoPanel } from './seedLogoPanel'
import { ACTUATOR_HEAD_NAME, ACTUATOR_HEAD_TYPES } from '../../three/actuatorHead'

/** Componentes que já vêm com a plataforma (Biblioteca do simulador), listados também na Biblioteca 3D do Admin. */
export interface BuiltinInfo {
  type: ComponentType
  name: string
  group: string
  category: ComponentTemplate['category']
  tag: string
  terminals: number
  hasModel: boolean
  hasVisual: boolean
}

export const BUILTIN_ORIGIN_PREFIX = 'Integrado · '

export function builtinComponents(): BuiltinInfo[] {
  return (Object.entries(TEMPLATES) as Array<[ComponentType, ComponentTemplate]>)
    .filter(([type]) => !String(type).startsWith('cat:'))
    .map(([type, tpl]) => ({ type, name: tpl.paletteName, group: tpl.group, category: tpl.category, tag: tpl.tag, terminals: tpl.terminals.length, hasModel: !!getComponentModelSpec(type), hasVisual: hasComponent3DVisual(type) }))
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
function legacyTerminalsFor(list: TerminalTemplate[], box: THREE.Box3): TerminalDef[] {
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

/** Conserva o ponto físico no interior do furo, sem o projetar para a caixa. */
function terminalsFor(type: ComponentType, list: TerminalTemplate[], box: THREE.Box3): TerminalDef[] {
  const size = box.getSize(new THREE.Vector3())
  return legacyTerminalsFor(list, box).map((terminal, index) => {
    const item = list[index], p = item.position3D
    if (!p) return terminal
    const spot = REAL_TERMINALS[type]?.find((spot) => spot.label === item.label)
    const nearest = [
      { distance: 1 - p.z, normal: [0, 0, 1] }, { distance: p.z, normal: [0, 0, -1] },
      { distance: 1 - p.y, normal: [0, 1, 0] }, { distance: p.y, normal: [0, -1, 0] },
      { distance: p.x, normal: [-1, 0, 0] }, { distance: 1 - p.x, normal: [1, 0, 0] },
    ].sort((a, b) => a.distance - b.distance)[0].normal as Vec3
    return { ...terminal,
      position: [box.min.x + p.x * size.x, box.min.y + p.y * size.y, box.min.z + p.z * size.z],
      normal: spot ? [...FACE_NORMAL[spot.face]] : nearest,
      ...(spot ? { diameterMm: spot.diameterMm, socketDepthMm: spot.holeDepthMm, socketInsetMm: terminalInsetMm(spot) } : {}),
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
  if (Object.values(def.assets).some((asset) => asset.builtinType === 'motor3ph')) {
    // A placa, os pernos M4, o PE e o bucim pertencem ao CAD partilhado (motorTerminalBox.ts).
    // Aqui só as pontes Y de pré-visualização (no projeto seguem a ligação Y/Δ escolhida).
    seedMotorBridges(def)
    return
  }
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
  let next: ComponentDefinition = JSON.parse(JSON.stringify(def))
  const cache: GlbCache = new Map()
  await loadGlbAssets(next, cache)
  const assemblyUpgrade = await upgradeTerminalAssemblyPlaceholder(type, next)
  let changed = !!assemblyUpgrade
  if (assemblyUpgrade) {
    next = assemblyUpgrade
    await loadGlbAssets(next, cache)
  }
  const upgraded = await upgradeUneditedGeometry(type, next, cache)
  if (upgraded) { next = upgraded; changed = true }
  if (type === 'multimeterDm20' && (next.controls ?? []).length === 0 && (next.displays ?? []).length === 0) {
    seedMultimeterDm20(next, cache)
    changed = (next.controls ?? []).length > 0
  }
  if (type === 'plcSiemensLogo1224RC' && seedLogoPanel(next, cache)) changed = true
  if (seedEmergencyActuator(next, type)) changed = true
  if (type === 'motor3ph') {
    if (!next.parts.some((part) => part.name === MOTOR_BOARD_GROUP)) { seedMotorTerminalBoard(next, cache); changed = true }
    if (migrateMotorDraft(next, cache)) changed = true
  }
  if (fixFlippedTerminals(type, next, cache).length) changed = true
  return changed ? next : null
}

/** Caixa do modelo original do integrado (só a peça GLB de origem), em mm. */
function builtinBox(type: ComponentType, def: ComponentDefinition, cache: GlbCache): THREE.Box3 {
  const part = def.parts.find((item) => item.kind === 'glb' && item.asset && def.assets[item.asset]?.builtinType === type)
  return boundsMm(part ? { ...def, parts: [{ ...part, parentId: null }] } : def, cache)
}

/**
 * Bornes espelhados em Y (ou Y+Z) face ao integrado — rascunhos antigos do LOGO!
 * ficaram com I0.x/L+/M em baixo e Q0.x em cima. Só corrige bornes cuja posição
 * é exatamente o espelho da posição correta; bornes editados à mão ficam como estão.
 * Devolve as etiquetas corrigidas (o `def` é alterado no lugar).
 */
export function fixFlippedTerminals(type: ComponentType, def: ComponentDefinition, cache: GlbCache): string[] {
  const tpl = TEMPLATES[type]
  if (!tpl || !def.terminals.length) return []
  const box = builtinBox(type, def, cache)
  if (box.isEmpty()) return []
  const fresh = new Map(terminalsFor(type, tpl.terminals, box).map((terminal) => [terminal.label, terminal]))
  const fixed: string[] = []
  def.terminals = def.terminals.map((terminal) => {
    const right = fresh.get(terminal.label)
    if (!right) return terminal
    const [x, y, z] = terminal.position, [fx, fy, fz] = right.position
    const far = Math.hypot(x - fx, y - fy, z - fz) > 5
    const mirrorY = box.min.y + box.max.y - fy, mirrorZ = box.min.z + box.max.z - fz
    const flipped = far && Math.abs(x - fx) <= 2 && Math.abs(y - mirrorY) <= 2 && (Math.abs(z - fz) <= 2 || Math.abs(z - mirrorZ) <= 2)
    if (!flipped) return terminal
    fixed.push(terminal.label)
    return { ...terminal, position: right.position, normal: right.normal, diameterMm: right.diameterMm ?? terminal.diameterMm, socketDepthMm: right.socketDepthMm ?? terminal.socketDepthMm, socketInsetMm: right.socketInsetMm ?? terminal.socketInsetMm }
  })
  return fixed
}

/** Bornes de uma versão publicada (posição normalizada 0..1) espelhados em Y face ao integrado. */
export function flippedRuntimeTerminals(type: ComponentType, terminals: { label: string; position3D?: { x: number; y: number; z: number } }[]): string[] {
  const tpl = TEMPLATES[type]
  if (!tpl) return []
  return terminals.filter((terminal) => {
    const right = tpl.terminals.find((item) => item.label === terminal.label)?.position3D, p = terminal.position3D
    return !!right && !!p && Math.abs(p.y - right.y) > .1 && Math.abs(p.y - (1 - right.y)) < .04 && Math.abs(p.x - right.x) < .04
  }).map((terminal) => terminal.label)
}

const MOTOR_BOARD_GROUP = 'Placa de bornes'
const MOTOR_FAN_NAME = 'Pá do veio (3 pás)'
const FAN_MATERIAL = 'Pá (polímero azul)'

/** Pontes Y (latão) sobre a placa real, só no editor — o projeto desenha-as conforme Y/Δ. */
function seedMotorBridges(def: ComponentDefinition) {
  let brass = def.materials.find((item) => item.name === 'Latão')
  if (!brass) { brass = { ...defaultMaterial('Latão', '#c9a24a'), roughness: .3, metalness: .9 }; def.materials.push(brass) }
  const origin = motorCadToCentered([MOTOR_BOARD.cx, MOTOR_BOARD_TOP, MOTOR_BOARD.cz])
  const group = { ...defaultPart('group', null, MOTOR_BOARD_GROUP), position: origin, editorOnly: true }
  def.parts.push(group, ...motorBridges('star').map((bridge) => {
    const c = motorCadToCentered(bridge.center)
    return { ...defaultPart('box', brass!.id, bridge.name), parentId: group.id, size: [bridge.length, MOTOR_STUD.washer + .2, 7] as Vec3, position: [c[0] - origin[0], c[1] - origin[1], c[2] - origin[2]] as Vec3 }
  }))
}

/** Pá de três pás no veio: peça opcional (olho no projeto) com rotação contínua comandada por `$rpm`. */
export function seedMotorFan(def: ComponentDefinition) {
  // Uma vez semeada, a pá pertence ao utilizador: se a eliminar, não volta (o material fica como marca).
  if (def.parts.some((part) => part.name === MOTOR_FAN_NAME) || def.materials.some((item) => item.name === FAN_MATERIAL)) return
  const blade = { ...defaultMaterial(FAN_MATERIAL, '#1d4ed8'), roughness: .42, metalness: .2 }
  const hubMat = { ...defaultMaterial('Cubo da pá', '#334155'), roughness: .35, metalness: .7 }
  const mark = { ...defaultMaterial('Marca de sentido', '#f59e0b'), emissive: '#b45309', emissiveIntensity: .35 }
  def.materials.push(blade, hubMat, mark)
  const group = { ...defaultPart('group', null, MOTOR_FAN_NAME), position: motorCadToCentered([MOTOR_FAN.hubX, 0, 0]), optional: true, spin: { axis: 'x' as const, turnsPerSecond: 1.5, source: '$rpm' } }
  const hubR = MOTOR_FAN.hubDiameter / 2
  const length = MOTOR_FAN.diameter / 2 - hubR * .85
  const parts = [group,
    { ...defaultPart('cylinder', hubMat.id, 'Cubo de aperto'), parentId: group.id, size: [MOTOR_FAN.hubDiameter, MOTOR_FAN.hubLength, MOTOR_FAN.hubDiameter] as Vec3, position: [0, 0, 0] as Vec3, rotation: [0, 0, 90] as Vec3 },
    ...Array.from({ length: MOTOR_FAN.blades }, (_, index) => {
      const angle = index * 360 / MOTOR_FAN.blades
      const r = hubR * .85 + length / 2, a = angle * Math.PI / 180
      // pá elíptica: esfera achatada (largura × comprimento × espessura); radial em Y local, torção = passo
      return { ...defaultPart('sphere', blade.id, `Pá ${index + 1}`), parentId: group.id, size: [MOTOR_FAN.bladeWidth, MOTOR_FAN.bladeWidth, MOTOR_FAN.bladeWidth] as Vec3,
        scale: [1, length / MOTOR_FAN.bladeWidth, 3 / MOTOR_FAN.bladeWidth] as Vec3,
        position: [0, Math.round(r * Math.cos(a) * 100) / 100, Math.round(r * Math.sin(a) * 100) / 100] as Vec3, rotation: [angle, MOTOR_FAN.pitchDeg, 0] as Vec3 }
    }),
    { ...defaultPart('sphere', mark.id, 'Marca de sentido'), parentId: group.id, size: [7, 7, 7] as Vec3, position: [0, Math.round((hubR * .85 + length * .82) * 100) / 100, 0] as Vec3 },
  ]
  def.parts.push(...parts)
}

/**
 * Rascunhos do motor criados antes da correção da caixa de bornes: bornes e pontes
 * estavam no centro do motor (x = 0) e a caixa do CAD está 31 mm para trás.
 * Move só o que coincide com a disposição antiga (nunca bornes editados à mão).
 */
function migrateMotorDraft(def: ComponentDefinition, cache: GlbCache): boolean {
  let changed = false
  const glbPart = def.parts.find((part) => part.kind === 'glb' && part.asset && def.assets[part.asset]?.builtinType === 'motor3ph')
  const tpl = TEMPLATES.motor3ph
  if (glbPart && tpl) {
    const box = boundsMm({ ...def, parts: [glbPart] }, cache)
    const fresh = new Map(terminalsFor('motor3ph', tpl.terminals, box).map((terminal) => [terminal.label, terminal]))
    def.terminals = def.terminals.map((terminal) => {
      const next = fresh.get(terminal.label)
      const [x, y, z] = terminal.position
      if (!next || Math.abs(x) > 27.5 || Math.abs(z) > 19 || y < 190) return terminal
      if (Math.hypot(x - next.position[0], y - next.position[1], z - next.position[2]) < .5) return terminal
      changed = true
      return { ...terminal, position: next.position, normal: next.normal, diameterMm: next.diameterMm, socketDepthMm: next.socketDepthMm, socketInsetMm: next.socketInsetMm }
    })
  }
  const group = def.parts.find((part) => part.kind === 'group' && part.name === MOTOR_BOARD_GROUP)
  if (group && Math.abs(group.position[0]) < .5 && Math.abs(group.position[2]) < 1 && group.position[1] > 200) {
    const children = def.parts.filter((part) => part.parentId === group.id)
    if (children.every((part) => /^Ponte estrela/.test(part.name))) {
      const ids = new Set([group.id, ...children.map((part) => part.id)])
      def.parts = def.parts.filter((part) => !ids.has(part.id))
      seedMotorBridges(def)
      changed = true
    }
  }
  const before = def.parts.length
  seedMotorFan(def)
  if (def.parts.length !== before) changed = true
  return changed
}

/** Cria a mesma composição PTI6 da capa e do simulador dentro do editor. */
function seedTerminalAssembly(type: ComponentType, def: ComponentDefinition, root: ComponentDefinition['parts'][number]): string | null {
  const spec = getComponentModelSpec('terminalPhoenixPti6')
  if (!spec || !isTerminalAssemblyComponent(type)) return null
  const assetId = newId('a_')
  const rootGroup = {
    ...root, kind: 'group' as const, name: 'Conjunto de bornes', materialId: null,
    position: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3,
  }
  const modules = terminalAssemblyLayout(type, spec.physicalSizeMm.width).map(({ conductor, x, color }) => ({
    ...defaultPart('glb', null, `Borne ${conductor}`),
    parentId: root.id,
    position: [x, 0, 0] as Vec3,
    asset: assetId,
    neutralTintColor: color,
  }))
  def.parts = [rootGroup, ...modules]
  def.assets = {
    ...def.assets,
    [assetId]: { name: spec.path.split('/').pop() ?? 'phoenix-pti6.glb', mime: 'model/gltf-binary', data: spec.path, builtinType: 'terminalPhoenixPti6' },
  }
  return assetId
}

function isUntouchedTerminalAssemblyPlaceholder(type: ComponentType, def: ComponentDefinition): boolean {
  const tpl = TEMPLATES[type], part = def.parts[0]
  if (!tpl || !part || def.parts.length !== 1 || part.kind !== 'box' || part.name !== 'Corpo' || Object.keys(def.assets).length) return false
  if (def.controls?.length || def.displays?.length || def.lights.length) return false
  if (def.states.some((state) => state.parts[part.id])) return false
  const physical = getComponentPhysicalSizeMm(type) ?? {
    width: Math.max(8, Math.round(tpl.w / 1.5)),
    height: Math.max(8, Math.round(tpl.h / 1.5)),
    depth: 45,
  }
  const same = (a: Vec3, b: Vec3) => a.every((value, index) => Math.abs(value - b[index]) < 0.01)
  if (!same(part.size, [physical.width, physical.height, physical.depth])
    || !same(part.position, [0, physical.height / 2, 0])
    || !same(part.rotation, [0, 0, 0])
    || !same(part.scale, [1, 1, 1])) return false
  const expected = terminalsFor(type, tpl.terminals, boundsMm(def))
  return def.terminals.length === expected.length && expected.every((terminal) => {
    const current = def.terminals.find((item) => item.label === terminal.label)
    return current && same(current.position, terminal.position) && same(current.normal, terminal.normal)
  })
}

async function upgradeTerminalAssemblyPlaceholder(type: ComponentType, def: ComponentDefinition): Promise<ComponentDefinition | null> {
  if (!isTerminalAssemblyComponent(type) || !isUntouchedTerminalAssemblyPlaceholder(type, def)) return null
  const next: ComponentDefinition = JSON.parse(JSON.stringify(def))
  const tpl = TEMPLATES[type]
  const root = next.parts[0]
  if (!root || !tpl) return null
  const assetId = seedTerminalAssembly(type, next, root)
  if (!assetId) return null
  const cache: GlbCache = new Map()
  await loadGlbAssets(next, cache)
  if (!cache.has(assetId)) return null
  const updated = terminalsFor(type, tpl.terminals, boundsMm(next, cache))
  next.terminals = updated.map((terminal) => {
    const current = def.terminals.find((item) => item.label === terminal.label)
    return current ? { ...terminal, ...current, position: terminal.position, normal: terminal.normal } : terminal
  })
  return next
}

/** Reconhece apenas o importador GLB antigo intacto; preserva modelos ajustados à mão. */
async function upgradeUneditedGeometry(type: ComponentType, def: ComponentDefinition, cache: GlbCache): Promise<ComponentDefinition | null> {
  const spec = getComponentModelSpec(type), part = def.parts[0]
  if (!spec || def.parts.length !== 1 || part.kind !== 'glb' || !part.asset || part.glbNode || part.locked) return null
  const asset = def.assets[part.asset]
  if (!asset || asset.builtinType || asset.data !== spec.path) return null
  if (def.lights.length || (def.displays ?? []).length || def.states.some((state) => Object.keys(state.parts).length)) return null
  const close = (a: number[], b: number[]) => a.every((n, i) => Math.abs(n - b[i]) < .02)
  const rotation = rotationDeg(spec.rotation, spec.flipDepth)
  const raw: ComponentDefinition = { ...def, parts: [{ ...part, rotation, position: [0, 0, 0], scale: [1, 1, 1] }] }
  const height = boundsMm(raw, cache).getSize(new THREE.Vector3()).y
  const k = spec.physicalSizeMm.height / height
  const scaled: ComponentDefinition = { ...raw, parts: [{ ...raw.parts[0], scale: [k, k, k] }] }
  const box = boundsMm(scaled, cache), center = box.getCenter(new THREE.Vector3())
  if (!close(part.rotation, rotation) || !close(part.scale, [k, k, k]) || !close(part.position, [-center.x, -box.min.y, -center.z])) return null
  const existingBox = boundsMm(def, cache)
  const expected = legacyTerminalsFor(TEMPLATES[type].terminals, existingBox)
  if (def.terminals.length !== expected.length || !expected.every((terminal) => {
    const actual = def.terminals.find((item) => item.label === terminal.label)
    return actual && close(actual.position, terminal.position) && close(actual.normal, terminal.normal)
  })) return null
  const id = newId('a_')
  const next: ComponentDefinition = { ...def, assets: { ...def.assets, [id]: { ...asset, builtinType: type } }, parts: [{ ...part, asset: id, rotation: [0, 0, 0], scale: [1, 1, 1], position: [0, 0, 0] }] }
  await loadGlbAssets(next, cache)
  if (!cache.has(id)) return null
  const terminals = terminalsFor(type, TEMPLATES[type].terminals, boundsMm(next, cache))
  next.terminals = def.terminals.map((terminal) => {
    const updated = terminals.find((item) => item.label === terminal.label)!
    return { ...terminal, position: updated.position, normal: updated.normal, diameterMm: updated.diameterMm, socketDepthMm: updated.socketDepthMm, socketInsetMm: updated.socketInsetMm }
  })
  return next
}

/** Marca do seed do botão de emergência (não volta a mexer em rascunhos já publicados). */
const SEED_EMERGENCY_ACTUATOR = 'emergency-actuator-v1'
/** Curso do cogumelo no aparelho real (mm): o botão afunda ~4 mm até engatar. */
export const EMERGENCY_ACTUATOR_TRAVEL_MM = 4

/**
 * Botão de emergência utilizável: a cabeça (`dcsimu_head`, separada do corpo em
 * `loadGlbAssets`) afunda quando o botão é premido e fica retida, como o
 * aparelho real. Sem este controlo o modelo era só um desenho — clicar não
 * fazia nada e não havia animação nenhuma.
 */
function seedEmergencyActuator(def: ComponentDefinition, type: ComponentType): boolean {
  if (!ACTUATOR_HEAD_TYPES.includes(type)) return false
  if (def.builtinSeeds?.includes(SEED_EMERGENCY_ACTUATOR)) return false
  const partId = def.parts[0]?.id
  if (!partId) return false
  const variable = 'pressed'
  if (!(def.vars ?? []).some((item) => item.id === variable)) {
    def.vars = [...(def.vars ?? []), { id: variable, name: 'Botão premido', type: 'bool', initial: false }]
  }
  def.controls = [...(def.controls ?? []), {
    id: newId('ctl_'), name: 'Botão de emergência', kind: 'button', partId,
    nodes: [ACTUATOR_HEAD_NAME], axis: [0, 0, 1] as Vec3, travelMm: EMERGENCY_ACTUATOR_TRAVEL_MM,
    motion: { mode: 'slide', angleOff: 0, angleOn: 0, pivotRel: [0.5, 0.5, 0.5] as Vec3, feel: 'snap', durationMs: 220 },
    bindVar: variable, positions: [], returnMode: 'latch',
    actions: [{ type: 'toggleVar', var: variable }],
  }]
  def.builtinSeeds = [...(def.builtinSeeds ?? []), SEED_EMERGENCY_ACTUATOR]
  return true
}

/** Rascunho editável a partir de um componente integrado: modelo GLB (ou volume físico) + bornes + metadados. */
export async function buildBuiltinDraft(type: ComponentType): Promise<{ meta: CatalogMeta; def: ComponentDefinition; usedModel: boolean; usedComposite: boolean }> {
  const tpl = TEMPLATES[type]
  if (!tpl) throw new Error('Componente integrado desconhecido.')
  const spec = getComponentModelSpec(type)
  const physical = getComponentPhysicalSizeMm(type) ?? { width: Math.max(8, Math.round(tpl.w / 1.5)), height: Math.max(8, Math.round(tpl.h / 1.5)), depth: 45 }
  const base = defaultDefinition()
  const material = defaultMaterial('Plástico', '#cbd5e1')
  const def: ComponentDefinition = { ...base, mount: spec?.placement === 'rail' ? 'din-rail' : spec?.placement && spec.placement !== 'din-rail' ? spec.placement : MOUNT[tpl.category] ?? 'din-rail', materials: [material], parts: [], terminals: [], assets: {} }
  const cache: GlbCache = new Map()
  let usedModel = false
  let usedComposite = false
  if (spec) {
    const assetId = newId('a_')
    const part = { ...defaultPart('glb', null, tpl.paletteName.slice(0, 40)), asset: assetId }
    const draft: ComponentDefinition = { ...def, parts: [part], assets: { [assetId]: { name: spec.path.split('/').pop() ?? 'modelo.glb', mime: 'model/gltf-binary', data: spec.path, builtinType: type } } }
    await loadGlbAssets(draft, cache)
    if (cache.has(assetId)) {
      Object.assign(def, draft, { materials: [material] })
      usedModel = true
    }
  }
  if (!usedModel && isTerminalAssemblyComponent(type)) {
    const fallback = { ...defaultPart('box', material.id, 'Corpo'), size: [physical.width, physical.height, physical.depth] as Vec3, position: [0, physical.height / 2, 0] as Vec3 }
    const assetId = seedTerminalAssembly(type, def, fallback)
    if (assetId) {
      await loadGlbAssets(def, cache)
      usedComposite = cache.has(assetId)
      if (!usedComposite) { def.parts = [fallback]; def.assets = {} }
    }
  }
  if (!usedModel && !usedComposite) {
    def.parts = [{ ...defaultPart('box', material.id, 'Corpo'), size: [physical.width, physical.height, physical.depth] as Vec3, position: [0, physical.height / 2, 0] as Vec3 }]
  }
  const box = boundsMm(def, cache)
  def.terminals = terminalsFor(type, tpl.terminals, box)
  // Proteções importadas chegam ao editor já testáveis: o manípulo original do
  // GLB (malhas `dcsimu_handle_*`) é o próprio atuador, com a charneira medida no CAD.
  if (['breaker1p', 'breaker2p', 'breaker3p', 'breaker4p', 'breakerSteckSdC25', 'motorBreakerPkzmC10', 'phoenixEcb3000760', 'motorBreaker', 'residualBreaker'].includes(type)) {
    const partId = def.parts[0]?.id
    if (partId) {
      def.vars = [{ id: 'closed', name: 'Disjuntor fechado', type: 'bool', initial: true }, { id: 'tripped', name: 'Disparado', type: 'bool', initial: false }]
      // Easy9, Steck e WEG: o manípulo vai no GLB como malhas `dcsimu_handle_*` (a pose do CAD é OFF). O pivô
      // (cubo da alavanca) e o curso vêm da tabela medida no CAD — o basculante simétrico por omissão
      // (±9° ao centro da caixa) faria a alavanca orbitar em vez de rodar sobre o cubo.
      const rig = BREAKER_HANDLE_RIG[type]
      const tilt = rig ? tiltControlPatch(inferBreakerAxes(def.terminals.map((terminal) => terminal.position)), [0, 0, 1]) : null
      // Botão rotativo (PKZM): gira à volta da normal da frente (Z), no eixo medido no CAD, e «I» é +90°
      // (o mesmo sentido do painel 3D). As alavancas (Easy9, Steck) basculam à volta de X, com ângulo negativo.
      const rotary = rig?.axis === 'z'
      const motion = rig && tilt
        ? { ...tilt.motion, mode: 'tilt' as const, angleOff: 0, angleOn: rotary ? rig.throwDeg : -rig.throwDeg, pivotRel: [rig.hinge.x ?? 0.5, rig.hinge.y, rig.hinge.z] as Vec3, feel: 'snap' as const, durationMs: 280 }
        : tilt?.motion
      def.controls = [{ id: newId('ctl_'), name: 'Liga / desliga', kind: 'toggle', partId, nodes: rig ? rig.nodes : undefined, axis: rig ? (rotary ? [0, 0, 1] as Vec3 : [1, 0, 0] as Vec3) : tilt?.axis ?? [0, 1, 0], travelMm: 0, ...(motion ? { motion } : {}), bindVar: 'closed', positions: [], actions: [{ type: 'toggleVar', var: 'closed' }] }]
    }
  }
  // O multímetro DM-20 chega ao editor completo: seletor, botões e LCD já
  // ligados aos objetos reais do modelo, visíveis na lista como elementos.
  if (type === 'multimeterDm20') seedMultimeterDm20(def, cache)
  seedEmergencyActuator(def, type)
  if (type === 'plcSiemensLogo1224RC') seedLogoPanel(def, cache)
  if (type === 'motor3ph') { seedMotorTerminalBoard(def, cache); seedMotorFan(def) }
  const meta: CatalogMeta = {
    ...DEFAULT_META,
    name: tpl.paletteName, description: `Componente integrado da plataforma, importado como ponto de partida editável${usedModel ? '' : usedComposite ? ' (bornes reais; corpo sem CAD)' : ' (sem modelo CAD: volume com as dimensões físicas)'}.`,
    category: tpl.category, group: tpl.group, tag: tpl.tag.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'X', tags: [],
    properties: [{ key: 'Origem', value: `${BUILTIN_ORIGIN_PREFIX}${type}` }],
  }
  return { meta, def, usedModel, usedComposite }
}
