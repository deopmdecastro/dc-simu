import type * as THREE from 'three'
import type { EnclosureParts } from './enclosureParts'

export const ENCLOSURE_FACES = [
  ['door', 'Porta'], ['left', 'Lateral esquerda'], ['right', 'Lateral direita'],
  ['top', 'Topo'], ['bottom', 'Base'], ['back', 'Fundo'], ['plate', 'Chapa de montagem'],
] as const
export type EnclosureFace = (typeof ENCLOSURE_FACES)[number][0]
const faces = new Set<string>(ENCLOSURE_FACES.map(([face]) => face))

export function hiddenEnclosureFaces(state: Record<string, unknown>): EnclosureFace[] {
  return Array.isArray(state.editorHiddenFaces)
    ? [...new Set(state.editorHiddenFaces.filter((face): face is EnclosureFace => typeof face === 'string' && faces.has(face)))] : []
}

export const enclosureFaceVisible = (state: Record<string, unknown>, face: EnclosureFace): boolean => !hiddenEnclosureFaces(state).includes(face)

const meshFaces: Record<string, EnclosureFace> = {
  'enclosure-left': 'left', 'enclosure-right': 'right', 'enclosure-top': 'top', 'enclosure-bottom': 'bottom',
  'enclosure-back': 'back', 'enclosure-wall-brackets': 'back', 'enclosure-gland': 'bottom',
  'enclosure-mounting-plate': 'plate', 'enclosure-standoffs': 'plate', 'enclosure-hinge-body': 'door',
}
const raycasts = new WeakMap<THREE.Object3D, THREE.Object3D['raycast']>()
const noRaycast: THREE.Object3D['raycast'] = () => {}

/** Ocultar é só edição visual: preserva as peças e o roteamento físico dos cabos. */
export function applyEnclosureVisibility(parts: EnclosureParts, state: Record<string, unknown>): void {
  const hidden = new Set(hiddenEnclosureFaces(state))
  parts.door.visible = !hidden.has('door')
  for (const [root, door] of [[parts.body, false], [parts.door, true]] as const) root.traverse(node => {
    if (!(node as THREE.Mesh).isMesh) return
    const face = door ? 'door' : meshFaces[node.name]
    if (!face) return
    if (!raycasts.has(node)) raycasts.set(node, node.raycast)
    node.visible = !hidden.has(face)
    // O Raycaster do Three também visita filhos de grupos invisíveis.
    node.raycast = node.visible ? raycasts.get(node)! : noRaycast
  })
}
