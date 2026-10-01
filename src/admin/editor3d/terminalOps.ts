import { boundsMm, newId } from '../../catalog/definition'
import { specToTerminal, specsToTerminals, type BoundsMm } from '../../catalog/terminalLayout'
import { FACE_NORMAL, type Face, type ProfileParams, type TerminalProfile, type TerminalSpec } from '../../catalog/terminalProfiles'
import type { ComponentDefinition, TerminalDef, Vec3 } from '../../catalog/types'
import { glbCache, useEditorStore } from './editorStore'

/** Caixa envolvente do componente em mm (com um valor por omissão para componentes ainda vazios). */
export function defBounds(def: ComponentDefinition): BoundsMm {
  const box = boundsMm(def, glbCache)
  if (box.isEmpty()) return { min: [-20, 0, -20], max: [20, 40, 20] }
  return { min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 }
}

/** Normal alinhada ao eixo dominante (os bornes saem sempre perpendiculares a uma face). */
export function snapNormal(normal: Vec3): Vec3 {
  const [x, y, z] = normal
  const axis = Math.abs(x) >= Math.abs(y) && Math.abs(x) >= Math.abs(z) ? 0 : Math.abs(y) >= Math.abs(z) ? 1 : 2
  const snapped: Vec3 = [0, 0, 0]
  snapped[axis] = normal[axis] >= 0 ? 1 : -1
  return snapped
}

export function faceOfNormal(normal: Vec3): Face {
  const n = snapNormal(normal)
  return n[0] > 0 ? 'right' : n[0] < 0 ? 'left' : n[1] > 0 ? 'top' : n[1] < 0 ? 'bottom' : n[2] > 0 ? 'front' : 'back'
}

export function faceCounts(terminals: TerminalDef[]): Record<Face, number> {
  const counts: Record<Face, number> = { front: 0, back: 0, left: 0, right: 0, top: 0, bottom: 0 }
  terminals.forEach((terminal) => { counts[faceOfNormal(terminal.normal)] += 1 })
  return counts
}

/** Centro da face (superfície da caixa envolvente). */
export function faceCenter(bounds: BoundsMm, face: Face): Vec3 {
  const { min, max } = bounds
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const normal = FACE_NORMAL[face]
  const axis = normal[0] ? 0 : normal[1] ? 1 : 2
  center[axis] = normal[axis] > 0 ? max[axis] : min[axis]
  return center
}

/** Aplica um perfil: cria os bornes nas faces certas (sugestão — ficam todos editáveis). */
export function applyProfile(profile: TerminalProfile, params: ProfileParams, replace: boolean): number {
  const state = useEditorStore.getState()
  const specs = profile.build(params)
  if (!specs.length) return 0
  let created: TerminalDef[] = []
  state.edit((def) => {
    const base = replace ? [] : def.terminals
    created = specsToTerminals(specs, defBounds(def), base, () => newId('t_'), profile.id)
    return { ...def, terminals: [...base, ...created] }
  })
  state.set({ selection: { kind: 'terminal', id: created[0].id }, tab: 'terminals', placing: false, placingSpec: null, testWires: [] })
  state.cameraTo('iso')
  return created.length
}

/** Cria um borne a partir de um chip da biblioteca (ou em branco) numa posição da superfície. */
export function addTerminalAt(spec: TerminalSpec | null, position: Vec3, normal: Vec3): TerminalDef {
  const state = useEditorStore.getState()
  const snapped = snapNormal(normal)
  const base = specToTerminal(spec ?? { label: '', name: '', fn: '', kind: 'io', polarity: 'none', electricalClass: 'other', direction: 'io', terminalType: 'screw', color: '#cbd5e1', face: 'front' }, position, snapped, state.def.terminals, () => newId('t_'))
  let terminal = base
  if (!spec) {
    const used = new Set(state.def.terminals.map((item) => item.label))
    let n = state.def.terminals.length + 1
    while (used.has(String(n))) n += 1
    terminal = { ...base, label: String(n), name: `Borne ${n}` }
  }
  state.edit((def) => ({ ...def, terminals: [...def.terminals, terminal] }))
  state.set({ selection: { kind: 'terminal', id: terminal.id }, tab: 'terminals' })
  return terminal
}
