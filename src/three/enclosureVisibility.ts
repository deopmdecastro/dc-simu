import type * as THREE from 'three'
import type { EnclosureParts } from './enclosureParts'

export const ENCLOSURE_FACES = [
  ['door', 'Porta'], ['left', 'Lateral esquerda'], ['right', 'Lateral direita'],
  ['top', 'Topo'], ['bottom', 'Base'], ['back', 'Fundo'], ['plate', 'Chapa de montagem'],
  ['innerCover', 'Proteção interior'],
] as const
export type EnclosureFace = (typeof ENCLOSURE_FACES)[number][0]
export const ENCLOSURE_EXTERIOR_FACES: readonly EnclosureFace[] = ['door', 'left', 'right', 'top', 'bottom']
const faces = new Set<string>(ENCLOSURE_FACES.map(([face]) => face))

export function hiddenEnclosureFaces(state: Record<string, unknown>): EnclosureFace[] {
  return Array.isArray(state.editorHiddenFaces)
    ? [...new Set(state.editorHiddenFaces.filter((face): face is EnclosureFace => typeof face === 'string' && faces.has(face)))] : []
}

export function toggleEnclosureExteriorVisibility(state: Record<string, unknown>): EnclosureFace[] {
  const hidden = hiddenEnclosureFaces(state)
  const allExteriorHidden = ENCLOSURE_EXTERIOR_FACES.every(face => hidden.includes(face))
  return allExteriorHidden
    ? hidden.filter(face => !ENCLOSURE_EXTERIOR_FACES.includes(face))
    : [...hidden, ...ENCLOSURE_EXTERIOR_FACES.filter(face => !hidden.includes(face))]
}

export const enclosureFaceVisible = (state: Record<string, unknown>, face: EnclosureFace): boolean => !hiddenEnclosureFaces(state).includes(face)

const meshFaces: Record<string, EnclosureFace> = {
  'enclosure-left': 'left', 'enclosure-right': 'right', 'enclosure-top': 'top', 'enclosure-bottom': 'bottom',
  'enclosure-back': 'back', 'enclosure-wall-brackets': 'back', 'enclosure-gland': 'bottom',
  'enclosure-mounting-plate': 'plate', 'enclosure-standoffs': 'plate', 'enclosure-hinge-body': 'door',
  // A sobretampa também é composta pelo modo (tracejada/sólida) em applyInnerCoverMode,
  // que corre sempre depois de applyEnclosureVisibility e tem a palavra final.
  'enclosure-inner-cover-plate': 'innerCover', 'enclosure-inner-cover-screws': 'innerCover', 'enclosure-inner-cover-details': 'innerCover',
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

const INNER_COVER_SOLID_MESHES = new Set(['enclosure-inner-cover-plate', 'enclosure-inner-cover-screws', 'enclosure-inner-cover-details'])

/**
 * Modo da sobretampa modular interna: dono único da visibilidade dessas peças
 * (compõe o modo com a face «innerCover» ocultada na edição 3D).
 *  · 'hidden'  → grupo inteiro fora de cena;
 *  · 'solid'   → chapa/parafusos visíveis e clicáveis; contornos tracejados fora;
 *  · 'outline' → só os contornos tracejados; a chapa desaparece e deixa de apanhar
 *                cliques — seleciona/posiciona os aparelhos através da sobretampa.
 */
export function applyInnerCoverMode(innerCover: THREE.Group | undefined, mode: 'hidden' | 'outline' | 'solid', faceHidden: boolean): void {
  if (!innerCover) return
  const solid = mode === 'solid' && !faceHidden
  const outline = mode === 'outline' && !faceHidden
  innerCover.visible = (solid || outline)
  innerCover.traverse((node) => {
    const line = node as THREE.LineSegments
    const mesh = node as THREE.Mesh
    if (line.isLineSegments) {
      node.visible = outline
      return // linhas nunca apanham cliques (raycast já neutralizado na construção)
    }
    if (!mesh.isMesh || !INNER_COVER_SOLID_MESHES.has(node.name)) return
    if (!raycasts.has(node)) raycasts.set(node, node.raycast)
    node.visible = solid
    node.raycast = solid ? raycasts.get(node)! : noRaycast
  })
}
