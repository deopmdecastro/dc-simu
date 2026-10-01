import type { ComponentViewOrientation, ElectricalComponent, Terminal } from '../types'
import { CAPTURE_FRAME_PADDING } from './captureFrame'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import {
  component3DDimensions,
  normalizeTerminal3DPosition,
  positionOnTerminalFace,
  terminal3DPositionOf,
  terminalFaceCreationPosition,
  type Terminal3DFace,
  type Terminal3DPosition,
} from './terminal3D'

/**
 * Bornes por face: cada borne vive na SUPERFÍCIE de uma (ou, na aresta, de duas)
 * faces do volume do componente. A vista de uma face é a captura ortográfica real
 * do GLB vista de fora, com a face virada para o utilizador. Estas funções
 * convertem entre um ponto dessa imagem e a posição física normalizada (0..1).
 */

export const FACE_ORDER: Terminal3DFace[] = ['front', 'back', 'left', 'right', 'top', 'bottom']

export const FACE_META: Record<Terminal3DFace, { label: string; tile: string; short: string; orientation: ComponentViewOrientation; hint: string }> = {
  front: { label: 'Frente', tile: 'Frente', short: 'F', orientation: { x: 0, y: 0, z: 0 }, hint: 'Face operacional, vista de frente' },
  back: { label: 'Trás', tile: 'Trás', short: 'T', orientation: { x: 0, y: 180, z: 0 }, hint: 'Face de montagem, vista de trás' },
  left: { label: 'Esquerda', tile: 'Esq.', short: 'E', orientation: { x: 0, y: 90, z: 0 }, hint: 'Lateral esquerda, vista de fora' },
  right: { label: 'Direita', tile: 'Dir.', short: 'D', orientation: { x: 0, y: -90, z: 0 }, hint: 'Lateral direita, vista de fora' },
  top: { label: 'Topo', tile: 'Topo', short: 'S', orientation: { x: 90, y: 0, z: 0 }, hint: 'Face superior, vista de cima' },
  bottom: { label: 'Base', tile: 'Base', short: 'I', orientation: { x: -90, y: 0, z: 0 }, hint: 'Face inferior, vista de baixo' },
}

/** Folga que a captura ortográfica deixa à volta do modelo, em fração da imagem. */
export const FACE_IMAGE_PAD = (1 - 1 / CAPTURE_FRAME_PADDING) / 2

const SURFACE_EPS = 0.004

/** Faces cuja superfície contém o borne (um borne numa aresta pertence a duas). */
export function facesOfPosition(position: Terminal3DPosition, eps = SURFACE_EPS): Terminal3DFace[] {
  const faces: Terminal3DFace[] = []
  if (position.z >= 1 - eps) faces.push('front')
  if (position.z <= eps) faces.push('back')
  if (position.x <= eps) faces.push('left')
  if (position.x >= 1 - eps) faces.push('right')
  if (position.y >= 1 - eps) faces.push('top')
  if (position.y <= eps) faces.push('bottom')
  return faces
}

export const facesOfTerminal = (terminal: Terminal) => facesOfPosition(terminal3DPositionOf(terminal))

/** Face mais próxima (para fixar à superfície um borne que ficou no interior). */
export function nearestFace(position: Terminal3DPosition): Terminal3DFace {
  const distances: Array<[Terminal3DFace, number]> = [
    ['front', 1 - position.z], ['back', position.z],
    ['left', position.x], ['right', 1 - position.x],
    ['top', 1 - position.y], ['bottom', position.y],
  ]
  return distances.sort((a, b) => a[1] - b[1])[0][0]
}

/** Coloca o borne exatamente na superfície da face mais próxima, mantendo as coordenadas no plano. */
export function snapToNearestSurface(position: Terminal3DPosition): Terminal3DPosition {
  return positionOnTerminalFace(position, nearestFace(position))
}

/**
 * Coordenadas (u para a direita, v para baixo, 0..1) do borne na imagem da face,
 * já sem a folga da captura. As orientações replicam a câmara ortográfica de cada face.
 */
export function faceUV(face: Terminal3DFace, p: Terminal3DPosition): { u: number; v: number } {
  switch (face) {
    case 'front': return { u: p.x, v: 1 - p.y }
    case 'back': return { u: 1 - p.x, v: 1 - p.y }
    case 'left': return { u: p.z, v: 1 - p.y }
    case 'right': return { u: 1 - p.z, v: 1 - p.y }
    case 'top': return { u: p.x, v: p.z }
    case 'bottom': return { u: p.x, v: 1 - p.z }
  }
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/** Inverso de `faceUV`: o ponto cai sempre na superfície da face (coordenada normal = 0 ou 1). */
export function positionFromFaceUV(face: Terminal3DFace, u: number, v: number): Terminal3DPosition {
  const a = clamp01(u)
  const b = clamp01(v)
  const position = (() => {
    switch (face) {
      case 'front': return { x: a, y: 1 - b, z: 1 }
      case 'back': return { x: 1 - a, y: 1 - b, z: 0 }
      case 'left': return { x: 0, y: 1 - b, z: a }
      case 'right': return { x: 1, y: 1 - b, z: 1 - a }
      case 'top': return { x: a, y: 1, z: b }
      case 'bottom': return { x: a, y: 0, z: 1 - b }
    }
  })()
  return normalizeTerminal3DPosition(position, position)
}

/** Dimensões reais (mm) da face tal como aparece na imagem: largura × altura. */
export function faceSizeMm(component: ElectricalComponent, face: Terminal3DFace): { w: number; h: number } {
  const d = component3DDimensions(component)
  const mm = (value: number) => value / PANEL_UNITS_PER_MM
  if (face === 'front' || face === 'back') return { w: mm(d.x), h: mm(d.y) }
  if (face === 'left' || face === 'right') return { w: mm(d.z), h: mm(d.y) }
  return { w: mm(d.x), h: mm(d.z) }
}

/** Posição inicial de um novo borne, distribuída na face escolhida. */
export function defaultFacePosition(component: ElectricalComponent, face: Terminal3DFace): Terminal3DPosition {
  const occupied = component.terminals.filter((terminal) => facesOfTerminal(terminal).includes(face)).length
  return terminalFaceCreationPosition(face, occupied)
}

/** Menor número inteiro positivo ainda não usado como identificação. */
export function nextFreeTerminalLabel(terminals: Terminal[]): string {
  const used = new Set(terminals.map((terminal) => terminal.label.trim().toLocaleUpperCase()))
  let n = 1
  while (used.has(String(n))) n += 1
  return String(n)
}
