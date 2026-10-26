import * as THREE from 'three'
import type { ComponentDefinition, PartDef, StateOverride, Vec3 } from '../../catalog/types'
import { isPartLocked } from './selectionOps'

const poseMatrix = (part: PartDef, override: StateOverride = {}) => new THREE.Matrix4().compose(
  new THREE.Vector3(...(override.position ?? part.position)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...(override.rotation ?? part.rotation).map(THREE.MathUtils.degToRad) as Vec3, 'XYZ')),
  new THREE.Vector3(...(override.scale ?? part.scale)),
)

/** Matriz mundial da pose base ou de um estado, sem carregar os modelos. */
export function partWorldMatrix(def: ComponentDefinition, id: string, stateId?: string, seen = new Set<string>()): THREE.Matrix4 {
  const part = def.parts.find((part) => part.id === id)
  if (!part || seen.has(id)) throw new Error('Hierarquia inválida ou circular.')
  seen.add(id)
  const override = stateId ? def.states.find((state) => state.id === stateId)?.parts[id] : undefined
  const local = poseMatrix(part, override)
  return part.parentId ? partWorldMatrix(def, part.parentId, stateId, seen).multiply(local) : local
}

function decomposePose(matrix: THREE.Matrix4): Pick<PartDef, 'position' | 'rotation' | 'scale'> {
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3()
  matrix.decompose(position, rotation, scale)
  const rebuilt = new THREE.Matrix4().compose(position, rotation, scale)
  const error = Math.max(...matrix.elements.map((n, i) => Math.abs(n - rebuilt.elements[i])))
  if (!Number.isFinite(error) || error > 1e-6) throw new Error('A combinação de rotações e escalas deformaria a peça. Uniformize a escala do grupo antes de reorganizar.')
  const euler = new THREE.Euler().setFromQuaternion(rotation, 'XYZ')
  return { position: position.toArray() as Vec3, rotation: [euler.x, euler.y, euler.z].map(THREE.MathUtils.radToDeg) as Vec3, scale: scale.toArray() as Vec3 }
}

/** Reorganiza uma peça sem a fazer saltar, incluindo as poses dos estados.
 * Se a nova relação precisar de shear, recusa a operação: o formato guarda TRS. */
export function reparentPartPreservingWorld(def: ComponentDefinition, id: string, parentId: string | null): { def: ComponentDefinition; error?: string } {
  const part = def.parts.find((part) => part.id === id)
  if (!part || part.parentId === parentId) return { def }
  if (isPartLocked(def, id) || (parentId && isPartLocked(def, parentId))) return { def, error: 'Peça ou grupo bloqueado — desbloqueie-o antes de reorganizar.' }
  if (parentId && !def.parts.some((part) => part.id === parentId)) return { def, error: 'O grupo de destino já não existe.' }
  let ancestor = parentId
  const seen = new Set<string>()
  while (ancestor) {
    if (ancestor === id || seen.has(ancestor)) return { def, error: 'Uma peça não pode ser colocada dentro de si própria ou de um dos seus filhos.' }
    seen.add(ancestor)
    ancestor = def.parts.find((part) => part.id === ancestor)?.parentId ?? null
  }
  try {
    const localPose = (stateId?: string) => {
      const parent = parentId ? partWorldMatrix(def, parentId, stateId) : new THREE.Matrix4()
      if (Math.abs(parent.determinant()) < 1e-12) throw new Error('O grupo de destino tem uma escala nula. Corrija-a antes de reorganizar.')
      return decomposePose(parent.invert().multiply(partWorldMatrix(def, id, stateId)))
    }
    const pose = localPose()
    const states = def.states.map((state) => ({ ...state, parts: { ...state.parts, [id]: { ...state.parts[id], ...localPose(state.id) } } }))
    return { def: { ...def, parts: def.parts.map((item) => item.id === id ? { ...item, ...pose, parentId } : item), states } }
  } catch (error) {
    return { def, error: error instanceof Error ? error.message : 'Não foi possível manter a posição da peça.' }
  }
}
