import * as THREE from 'three'
import { MULTIMETER_VARS, initialVars, mergeVars, runControlActions, selectorStep, setSelector, varDefsOf, type Vars } from '../../catalog/behavior'
import { boundsMm, buildDefinitionObject, newId } from '../../catalog/definition'
import { listGlbNodes } from '../../catalog/componentRig'
import { classifyNode, controlFromSuggestion, lightFromSuggestion, variableFromSuggestion, type Suggestion } from '../../catalog/interactables'
import { applyPreset, BUILTIN_PRESETS, inferBreakerAxes, presetFromControl, tiltControlPatch, type BreakerAxes, type MotionPreset } from '../../catalog/controlMotion'
import type { BehaviorDef, ComponentDefinition, ControlDef, DisplayDef, LightZoneDef, MaterialDef, PartDef, VarDef, Vec3 } from '../../catalog/types'
import { glbCache, useEditorStore } from './editorStore'
import { setRealSize } from './sizeOps'

/* --------------------------------------------------------- ações do editor sobre controlos */

const timers: number[] = []

/** Gesto num controlo na pré-visualização do editor (botões/seletores mudam as variáveis de teste). */
export function triggerEditorControl(control: ControlDef, gesture: 'press' | 'long' | { select: string } | { step: 1 | -1 }) {
  const store = useEditorStore.getState()
  let vars: Vars = mergeVars(store.def, store.previewVars)
  let state = store.previewState
  const delayed: Array<{ state: string; afterMs: number }> = []
  if (control.kind === 'selector') {
    const target = typeof gesture === 'object' && 'select' in gesture ? gesture.select : selectorStep(control, vars, typeof gesture === 'object' && 'step' in gesture ? gesture.step : 1)
    if (!target) return
    vars = setSelector(control, vars, target)
  } else {
    const result = runControlActions(gesture === 'long' && control.longActions?.length ? control.longActions : control.actions, vars, state)
    vars = result.vars; state = result.state; delayed.push(...result.delayed)
  }
  store.set({ previewVars: vars, previewState: state })
  for (const action of delayed) timers.push(window.setTimeout(() => useEditorStore.getState().set({ previewState: action.state }), Math.max(0, action.afterMs)))
}

/* ------------------------------------------------- disjuntor: ON/OFF, automação, predefinições */

/** Variável booleana que um interruptor/botão alterna (ação «alternar variável» ou, em falta, a ligada ao controlo). */
export function controlVariable(control: ControlDef): string | null {
  const action = control.actions.find((item) => item.type === 'toggleVar' || item.type === 'setVar') as { var?: string } | undefined
  return action?.var ?? control.bindVar ?? null
}

/** Força o interruptor para ON/OFF na pré-visualização (sem simular clique): serve para afinar as duas poses. */
export function setControlOn(control: ControlDef, on: boolean) {
  const variable = controlVariable(control)
  if (!variable) return
  const store = useEditorStore.getState()
  store.set({ previewVars: { ...mergeVars(store.def, store.previewVars), [variable]: on } })
}

export function controlIsOn(control: ControlDef): boolean {
  const variable = controlVariable(control)
  if (!variable) return false
  const store = useEditorStore.getState()
  return Boolean(mergeVars(store.def, store.previewVars)[variable])
}

/** Eixos do disjuntor deduzidos dos bornes do componente (null se não houver bornes suficientes). */
export function breakerAxesOf(def: ComponentDefinition): BreakerAxes | null {
  return inferBreakerAxes(def.terminals.map((terminal) => terminal.position))
}

/** Objetos do GLB que parecem ser o manípulo (pelo nome: handle, manípulo, alavanca, toggle…). */
export function detectHandleNodes(def: ComponentDefinition, partId: string): string[] {
  const part = def.parts.find((item) => item.id === partId)
  if (!part || part.kind !== 'glb') return []
  const root = buildDefinitionObject(def, glbCache)
  root.updateMatrixWorld(true)
  const holder = root.getObjectByName(partId)
  if (!holder) return []
  return listGlbNodes(holder)
    .map((node) => ({ name: node.name, hit: classifyNode(node.name) }))
    .filter((item) => item.hit?.kind === 'toggle')
    .sort((a, b) => (b.hit?.confidence ?? 0) - (a.hit?.confidence ?? 0))
    .map((item) => item.name)
}

/**
 * Transforma o controlo num manípulo basculante de disjuntor: eixo de rotação deduzido dos bornes,
 * pivô ao centro, mola, e a variável `closed` (a que o motor elétrico usa). Devolve a mensagem para o utilizador.
 */
export function makeBreakerTilt(controlId: string): string {
  const store = useEditorStore.getState()
  const control = (store.def.controls ?? []).find((item) => item.id === controlId)
  if (!control) return 'Escolha primeiro um controlo.'
  const axes = breakerAxesOf(store.def)
  const patch = tiltControlPatch(axes, control.axis)
  const hasClosed = varDefsOf(store.def).some((item) => item.id === 'closed')
  const nodes = control.nodes && control.nodes.length === 0 ? detectHandleNodes(store.def, control.partId) : control.nodes
  store.edit((def) => ({
    ...def,
    vars: hasClosed ? def.vars : [...(def.vars ?? []), { id: 'closed', name: 'Disjuntor fechado', type: 'bool', initial: true }],
    controls: (def.controls ?? []).map((item) => (item.id === controlId ? {
      ...item, kind: 'toggle', travelMm: 0, ...patch, nodes: nodes ?? item.nodes,
      bindVar: 'closed', actions: item.actions.some((action) => action.type === 'toggleVar') ? item.actions : [{ type: 'toggleVar', var: 'closed' }],
    } : item)),
  }), `control:${controlId}:tilt`)
  const found = nodes && nodes !== control.nodes && nodes.length ? ` Manípulo detetado pelo nome: ${nodes.join(', ')}.` : ''
  const how = axes ? `Eixo de rotação deduzido dos bornes (${axes.reason}).` : 'Sem bornes para deduzir o eixo: confirme-o em «Movimento».'
  return `Manípulo basculante criado. ${how}${found} Use «ON / OFF» para ver as duas poses e afine o pivô.`
}

const PRESET_KEY = 'dc-simu:motion-presets'

export function loadMotionPresets(): MotionPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]') as MotionPreset[]
    return Array.isArray(raw) ? raw.filter((item) => item && typeof item.id === 'string' && item.motion) : []
  } catch { return [] }
}

function storePresets(presets: MotionPreset[]) {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets)) } catch { /* armazenamento indisponível: o preset só vale nesta sessão */ }
}

export const allMotionPresets = (): MotionPreset[] => [...BUILTIN_PRESETS, ...loadMotionPresets()]

export function saveMotionPreset(control: ControlDef, name: string): MotionPreset {
  const preset = presetFromControl(control, newId('mp_'), name.trim() || control.name)
  storePresets([...loadMotionPresets(), preset])
  return preset
}

export function deleteMotionPreset(id: string) { storePresets(loadMotionPresets().filter((item) => item.id !== id)) }

/** Aplica um preset de movimento a um controlo; o eixo de rotação vem dos bornes deste componente quando fiáveis. */
export function applyMotionPreset(controlId: string, preset: MotionPreset): string {
  const store = useEditorStore.getState()
  const control = (store.def.controls ?? []).find((item) => item.id === controlId)
  if (!control) return 'Escolha primeiro um controlo.'
  const axes = breakerAxesOf(store.def)
  store.edit((def) => ({ ...def, controls: (def.controls ?? []).map((item) => (item.id === controlId ? applyPreset(item, preset, axes) : item)) }), `control:${controlId}:preset`)
  const fromTerminals = preset.motion.mode === 'tilt' && axes?.confidence === 'high'
  return `«${preset.name}» aplicado.${fromTerminals ? ' Eixo de rotação ajustado aos bornes deste componente.' : ''}`
}

/** Pivô de um basculante a partir de um ponto clicado no modelo (guardado relativo à caixa do manípulo). */
export function setPivotFromPoint(controlId: string, rel: Vec3) {
  useEditorStore.getState().edit((def) => ({
    ...def,
    controls: (def.controls ?? []).map((item) => (item.id === controlId && item.motion ? { ...item, motion: { ...item.motion, pivotRel: rel } } : item)),
  }), `control:${controlId}:pivot`)
}

/* ------------------------------------------------------------------- criação */

export function newControl(def: ComponentDefinition, kind: ControlDef['kind'], partId: string): ControlDef {
  const part = def.parts.find((item) => item.id === partId)
  const isGlb = part?.kind === 'glb'
  const count = (def.controls ?? []).filter((item) => item.kind === kind).length + 1
  const name = kind === 'selector' ? `Seletor ${count}` : kind === 'toggle' ? `Interruptor ${count}` : `Botão ${count}`
  return {
    id: newId('c_'), name, kind, partId, nodes: isGlb ? [] : undefined, axis: kind === 'selector' ? [0, 0, -1] : [0, 0, 1], travelMm: kind === 'selector' ? 0 : 0.6,
    positions: kind === 'selector' ? [{ id: 'p1', label: 'Posição 1', angle: 0 }, { id: 'p2', label: 'Posição 2', angle: 45 }] : [],
    bindVar: kind === 'selector' ? 'pos' : undefined,
    actions: kind === 'selector' ? [] : [{ type: 'toggleVar', var: 'on' }],
  }
}

export function newDisplay(def: ComponentDefinition, box: THREE.Box3): DisplayDef {
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  const count = (def.displays ?? []).length + 1
  return {
    id: newId('d_'), name: `Ecrã ${count}`, position: [centre.x, centre.y, box.max.z], normal: [0, 0, 1], roll: 0,
    widthMm: Math.max(4, Math.round(size.x * 0.5 * 10) / 10), heightMm: Math.max(3, Math.round(size.y * 0.25 * 10) / 10), density: 20,
    background: '#101820', foreground: '#7dff9b', kind: 'text',
    lines: [{ id: newId('ln_'), text: '{state}', x: 0.5, y: 0.5, size: 0.4, align: 'center' }],
  }
}

const snapAxis = (normal: Vec3): Vec3 => {
  const abs = normal.map(Math.abs)
  const axis = abs[0] >= abs[1] && abs[0] >= abs[2] ? 0 : abs[1] >= abs[2] ? 1 : 2
  const out: Vec3 = [0, 0, 0]; out[axis] = normal[axis] >= 0 ? 1 : -1
  return out
}

/** Clique de colocação de um ecrã: 1.º canto, 2.º canto → posição, normal e tamanho. */
export function placeDisplayClick(point: Vec3, normal: Vec3) {
  const store = useEditorStore.getState()
  const id = store.placingDisplay
  if (!id) return
  if (!store.displayCorner) { store.set({ displayCorner: { point, normal: snapAxis(normal) } }); return }
  const first = store.displayCorner
  const n = first.normal
  const axis = n[0] ? 0 : n[1] ? 1 : 2
  const [u, v] = axis === 2 ? [0, 1] : axis === 0 ? [2, 1] : [0, 2]
  const mid = point.map((value, index) => (value + first.point[index]) / 2) as Vec3
  mid[axis] = (first.point[axis] + point[axis]) / 2
  const r = (value: number) => Math.round(value * 100) / 100
  store.edit((def) => ({
    ...def,
    displays: (def.displays ?? []).map((item) => (item.id === id ? {
      ...item, position: mid.map(r) as Vec3, normal: n, roll: 0,
      widthMm: Math.max(1, r(Math.abs(point[u] - first.point[u]))), heightMm: Math.max(1, r(Math.abs(point[v] - first.point[v]))),
    } : item)),
  }))
  store.set({ placingDisplay: null, displayCorner: null })
}

/** LED novo na superfície: pequena peça emissiva + zona luminosa (acende por variável/estado). */
export function addLedAt(point: Vec3, normal: Vec3) {
  const store = useEditorStore.getState()
  const n = new THREE.Vector3(...snapAxis(normal))
  const material: MaterialDef = { id: newId('m_'), name: 'LED', color: '#22c55e', roughness: 0.3, metalness: 0, opacity: 1, emissive: '#000000', emissiveIntensity: 0 }
  const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n))
  const part: PartDef = {
    id: newId('p_'), name: `LED ${(store.def.lights.length + 1)}`, kind: 'cylinder', parentId: null,
    position: [point[0] + n.x * 0.3, point[1] + n.y * 0.3, point[2] + n.z * 0.3].map((value) => Math.round(value * 100) / 100) as Vec3,
    rotation: [rotation.x, rotation.y, rotation.z].map((value) => Math.round((value * 180 / Math.PI) * 10) / 10) as Vec3, scale: [1, 1, 1], size: [3, 0.8, 3], materialId: material.id, visible: true, locked: false,
  }
  const light: LightZoneDef = { id: newId('l_'), name: part.name, partId: part.id, color: '#22c55e', intensity: 2.4, kind: 'led' }
  store.edit((def) => ({ ...def, materials: [...def.materials, material], parts: [...def.parts, part], lights: [...def.lights, light] }))
  store.set({ placingLed: false, selection: { kind: 'light', id: light.id }, tab: 'lights' })
}

/* ------------------------------------------- controlos a partir da deteção automática */

/**
 * Cria os controlos e indicadores marcados na deteção automática (`interactables.ts`):
 * cada objeto do GLB passa a ter eixo, curso/ângulo, variável e ação já configurados.
 * Devolve a mensagem para o utilizador.
 */
export function applyAutoInteractions(partId: string, chosen: Suggestion[]): string {
  const store = useEditorStore.getState()
  if (!chosen.length) return 'Nada marcado: não foi criado nenhum controlo.'
  const part = store.def.parts.find((item) => item.id === partId)
  if (!part || part.kind !== 'glb') return 'Escolha uma peça do tipo modelo GLB.'
  const def = store.def
  // objetos já ligados a um controlo, a uma luz ou a um ecrã não voltam a ser usados
  const used = new Set<string>([
    ...(def.controls ?? []).flatMap((control) => control.nodes ?? []),
    ...def.lights.flatMap((light) => light.nodes ?? []),
    ...(def.displays ?? []).flatMap((display) => display.hideNodes ?? []),
  ])
  const takenVars = new Set(varDefsOf(def).map((item) => item.id))
  const takenNames = new Set([...(def.controls ?? []).map((control) => control.name), ...def.lights.map((light) => light.name)])
  const controls: ControlDef[] = []
  const lights: LightZoneDef[] = []
  const vars: VarDef[] = []
  let skipped = 0
  for (const suggestion of chosen) {
    if (used.has(suggestion.node)) { skipped += 1; continue }
    used.add(suggestion.node)
    let variable = suggestion.variable
    while (takenVars.has(variable)) variable = `${variable}_2`
    takenVars.add(variable)
    let label = suggestion.label
    while (takenNames.has(label)) label = `${label} 2`
    takenNames.add(label)
    const named: Suggestion = { ...suggestion, label, variable }
    if (suggestion.kind === 'led') {
      lights.push(lightFromSuggestion(partId, named, newId('l_')))
      const variableDef = variableFromSuggestion(named, variable)
      if (variableDef && !vars.some((item) => item.id === variableDef.id)) vars.push(variableDef)
      continue
    }
    controls.push(controlFromSuggestion(partId, named, newId('c_'), variable))
    const variableDef = variableFromSuggestion(named, variable)
    if (variableDef && !vars.some((item) => item.id === variableDef.id)) vars.push(variableDef)
  }
  store.edit((current) => ({
    ...current,
    controls: [...(current.controls ?? []), ...controls],
    lights: [...current.lights, ...lights],
    vars: [...(current.vars ?? []), ...vars.filter((item) => !(current.vars ?? []).some((existing) => existing.id === item.id))],
  }), 'auto:interactions')
  if (controls[0]) store.set({ tab: 'controls', selection: { kind: 'control', id: controls[0].id } })
  else if (lights[0]) store.set({ tab: 'lights', selection: { kind: 'light', id: lights[0].id } })
  const created: string[] = []
  if (controls.length) created.push(`${controls.length} controlo(s)`)
  if (lights.length) created.push(`${lights.length} indicador(es)`)
  const extra = skipped ? ` ${skipped} objeto(s) já ligados foram ignorados.` : ''
  return `${created.join(' e ')} criado(s). Afine o eixo, o curso e os ângulos em «Controlo › Movimento».${extra}`
}

/* ---------------------------------------------------------- modelo de multímetro */

/** Nomes dos objetos do GLB do RGK DM-20 (ficheiro «RootNode-compressed.glb» do projeto). */
const DM20_HEIGHT_MM = 184
const round1 = (n: number) => Math.round(n * 10) / 10
const DM20 = {
  dial: ['occurrence_of_Plane010_Material003_0', 'occurrence_of_Plane008_Material004_0'],
  select: ['occurrence_of_Plane004_Material003_0', 'occurrence_of_Plane013__0', 'occurrence_of_Text015__0_(2)'],
  off: ['occurrence_of_Plane002_Material002_0', 'occurrence_of_Text005__0'],
  hold: ['occurrence_of_Plane003_Material007_0', 'occurrence_of_Plane011__0', 'occurrence_of_Text004__0'],
  lcd: 'occurrence_of_Cube002_Material008_0',
  paintedDigits: ['occurrence_of_Plane014_Material009_0_(23)', 'occurrence_of_Text006_Material009_0', 'occurrence_of_Text007_Material009_0'],
}

const find = (def: ComponentDefinition, test: (label: string, name: string) => boolean) => def.terminals.find((item) => test(item.label.toLowerCase(), item.name.toLowerCase()))

/** Liga as fichas COM, V/Ω, mA e 10 A pelos rótulos/nomes dos bornes. */
export function guessBehavior(def: ComponentDefinition): { behavior: BehaviorDef; missing: string[] } {
  const com = find(def, (l, n) => l === 'com' || n.includes('com'))
  const volt = find(def, (l, n) => /^v/.test(l) || /vω|v\/ω|volt/.test(n))
  const ma = find(def, (l) => /^m?a$/.test(l) && l !== '10a' && l.includes('m'))
  const amp = find(def, (l) => l === '10a' || l === 'a' || l === '10 a')
  const missing = [!com && 'COM', !volt && 'VΩ', !ma && 'mA', !amp && '10A'].filter(Boolean) as string[]
  return { behavior: { type: 'multimeter', com: com?.id ?? '', volt: volt?.id ?? '', milliamp: ma?.id ?? '', amp: amp?.id ?? '' }, missing }
}

/** Aplica o comportamento de multímetro (seletor, botões, LCD) ao rascunho. Devolve a mensagem para o utilizador. */
export function applyMultimeterPreset(): string {
  const store = useEditorStore.getState()
  let def = store.def
  const glbPart = def.parts.find((part) => part.kind === 'glb')
  let root = buildDefinitionObject(def, glbCache)
  root.updateMatrixWorld(true)
  let holder = glbPart ? root.getObjectByName(glbPart.id) : null
  const nodes = holder ? listGlbNodes(holder) : []
  const known = new Set(nodes.map((node) => node.name))
  const isDm20 = DM20.dial.every((name) => known.has(name)) && known.has(DM20.lcd)
  let resized = ''
  if (isDm20) {
    // tamanho real do RGK DM-20 (com capa): 184 × 88 × 53 mm — o GLB importado vem com uma escala arbitrária
    const height = boundsMm(def, glbCache).getSize(new THREE.Vector3()).y
    if (height > 0 && Math.abs(height - DM20_HEIGHT_MM) > 1) {
      setRealSize(1, DM20_HEIGHT_MM)
      resized = ` Tamanho ajustado ao real (${DM20_HEIGHT_MM} mm de altura).`
      def = useEditorStore.getState().def
      root = buildDefinitionObject(def, glbCache)
      root.updateMatrixWorld(true)
      holder = glbPart ? root.getObjectByName(glbPart.id) ?? null : null
    }
  }
  const partId = glbPart?.id ?? def.parts[0]?.id ?? ''
  const { behavior, missing } = guessBehavior(def)
  const mk = (kind: ControlDef['kind'], name: string, nodeNames: string[] | undefined, extra: Partial<ControlDef>): ControlDef => ({ ...newControl(def, kind, partId), name, nodes: glbPart ? nodeNames ?? [] : undefined, ...extra })
  const controls: ControlDef[] = [
    mk('selector', 'Seletor de função', isDm20 ? DM20.dial : undefined, {
      axis: [0, 0, -1], bindVar: 'dial', travelMm: 0,
      positions: [
        { id: 'off', label: 'OFF', angle: -52 }, { id: 'acv', label: 'V ~', angle: -22 }, { id: 'dcv', label: 'V ⎓', angle: 0 },
        { id: 'ma', label: 'mA', angle: 68 }, { id: 'a10', label: '10 A', angle: 93 }, { id: 'ohm', label: 'Ω · continuidade', angle: -112 },
      ],
    }),
    mk('button', 'SEL/REL (Ω ⇄ continuidade)', isDm20 ? DM20.select : undefined, { actions: [{ type: 'behavior', event: 'select' }] }),
    mk('button', 'OFF (desligar ecrã)', isDm20 ? DM20.off : undefined, { actions: [{ type: 'behavior', event: 'power' }] }),
    mk('button', 'HOLD (premir longo: luz)', isDm20 ? DM20.hold : undefined, { actions: [{ type: 'behavior', event: 'hold' }], longActions: [{ type: 'behavior', event: 'light' }] }),
  ]
  const box = new THREE.Box3()
  if (isDm20) { const node = holder!.getObjectByName(DM20.lcd); if (node) box.setFromObject(node, true) }
  const display: DisplayDef = {
    ...newDisplay(def, box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-8, 20, 0), new THREE.Vector3(8, 29, 4)) : box),
    name: 'LCD', kind: 'lcd', background: '#c4c9c0', foreground: '#14171a', density: 28, lines: [],
    ...(isDm20 ? { widthMm: round1(box.getSize(new THREE.Vector3()).x * 0.96), heightMm: round1(box.getSize(new THREE.Vector3()).y * 0.96), hideNodesPart: partId, hideNodes: DM20.paintedDigits } : { widthMm: 16, heightMm: 9 }),
  }
  store.edit((current) => ({
    ...current,
    behavior,
    vars: [...(current.vars ?? []).filter((item) => !MULTIMETER_VARS.some((entry) => entry.id === item.id))],
    controls: [...(current.controls ?? []).filter((item) => !['Seletor de função'].includes(item.name) && !/^(SEL\/REL|OFF \(|HOLD \()/.test(item.name)), ...controls],
    displays: [...(current.displays ?? []).filter((item) => item.name !== 'LCD'), display],
  }), 'preset:multimeter')
  store.set({ previewVars: initialVars({ ...def, behavior, controls }), tab: 'controls', selection: { kind: 'control', id: controls[0].id } })
  const notes = [isDm20 ? `Modelo RGK DM-20 reconhecido: seletor, botões e LCD já estão ligados aos objetos do GLB.${resized}` : 'Modelo desconhecido: escolha no modelo os objetos do seletor e dos botões e marque o LCD no separador Ecrãs.']
  if (missing.length) notes.push(`Ligue as fichas em falta no separador Multímetro: ${missing.join(', ')}.`)
  return notes.join(' ')
}
