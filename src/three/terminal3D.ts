import type { Component3DScale, ElectricalComponent, Terminal } from '../types'
import { getComponentModelSpec, PANEL_UNITS_PER_MM } from './modelPaths'
import { orientationRadians } from './componentOrientation'
import * as THREE from 'three'

export type Terminal3DFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
export type Terminal3DPosition = { x: number; y: number; z: number }

const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

export function normalizeTerminal3DPosition(value: Partial<Terminal3DPosition> | undefined, fallback: Terminal3DPosition): Terminal3DPosition {
  return {
    x: clamp(finite(value?.x, fallback.x)),
    y: clamp(finite(value?.y, fallback.y)),
    z: clamp(finite(value?.z, fallback.z)),
  }
}

/** Ponto inicial compatível com projetos antigos: reutiliza o footprint frontal
 * e coloca o borne na face operacional (+Z) do equipamento. */
export function terminal3DPositionOf(terminal: Terminal): Terminal3DPosition {
  const fallback = { x: clamp(terminal.x), y: clamp(1 - terminal.y), z: 1 }
  return normalizeTerminal3DPosition(terminal.position3D, fallback)
}

export function positionOnTerminalFace(position: Terminal3DPosition, face: Terminal3DFace): Terminal3DPosition {
  const next = { ...position }
  if (face === 'front') next.z = 1
  else if (face === 'back') next.z = 0
  else if (face === 'left') next.x = 0
  else if (face === 'right') next.x = 1
  else if (face === 'top') next.y = 1
  else next.y = 0
  return next
}

/** Posição inicial distribuída para um novo borne na face escolhida. */
export function terminalFaceCreationPosition(face: Terminal3DFace, occupiedOnFace = 0): Terminal3DPosition {
  const column = Math.max(0, occupiedOnFace) % 5
  const row = Math.floor(Math.max(0, occupiedOnFace) / 5) % 2
  const across = 0.16 + column * 0.17
  const vertical = 0.38 + row * 0.28
  const base = positionOnTerminalFace({ x: 0.5, y: 0.5, z: 0.5 }, face)
  if (face === 'front' || face === 'back') return { ...base, x: across, y: vertical }
  if (face === 'left' || face === 'right') return { ...base, z: across, y: vertical }
  return { ...base, x: across, z: vertical }
}

export function normalizeComponent3DScale(value?: Partial<Component3DScale>): Component3DScale {
  return {
    x: clamp(finite(value?.x, 1), 0.25, 4),
    y: clamp(finite(value?.y, 1), 0.25, 4),
    z: clamp(finite(value?.z, 1), 0.25, 4),
  }
}

export function component3DScaleOf(component: ElectricalComponent, override?: Partial<Component3DScale>): Component3DScale {
  return normalizeComponent3DScale(override ?? component.view3DScale)
}

/** Dimensões do volume local no Painel 3D. Para componentes legados sem ficha
 * física, deriva uma caixa conservadora do footprint sem mudar o projeto. */
export function component3DDimensions(component: ElectricalComponent): Terminal3DPosition {
  const physical = getComponentModelSpec(component.type)?.physicalSizeMm
  if (physical) return {
    x: physical.width * PANEL_UNITS_PER_MM,
    y: physical.height * PANEL_UNITS_PER_MM,
    z: physical.depth * PANEL_UNITS_PER_MM,
  }
  return {
    x: Math.max(0.18, component.w / 150),
    y: Math.max(0.24, component.h / 150),
    z: Math.max(0.16, Math.min(component.w, component.h) / 180),
  }
}

/** Centro do volume relativamente ao pivô. O pivô da instância é sempre o centro
 * do volume (o Painel 3D recentra cada GLB na origem da instância), por isso os
 * bornes, o brilho de seleção e os limites partilham o mesmo referencial. */
export function component3DVolumeCenter(_component: ElectricalComponent): THREE.Vector3 {
  return new THREE.Vector3(0, 0, 0)
}

export function terminalLocal3D(component: ElectricalComponent, terminal: Terminal): THREE.Vector3 {
  const point = terminal3DPositionOf(terminal)
  const size = component3DDimensions(component)
  return new THREE.Vector3(
    (point.x - 0.5) * size.x,
    (point.y - 0.5) * size.y,
    (point.z - 0.5) * size.z,
  ).add(component3DVolumeCenter(component))
}

export function terminalPositionFromLocal3D(component: ElectricalComponent, local: THREE.Vector3): Terminal3DPosition {
  const size = component3DDimensions(component)
  const centered = local.clone().sub(component3DVolumeCenter(component))
  return normalizeTerminal3DPosition({
    x: centered.x / size.x + 0.5,
    y: centered.y / size.y + 0.5,
    z: centered.z / size.z + 0.5,
  }, { x: 0.5, y: 0.5, z: 1 })
}

/** Endpoint mundial usado pelos cabos do Painel 3D. Aplica a mesma escala,
 * orientação e pivô que a instância visual sem alterar o borne elétrico. */
export function terminalWorld3D(component: ElectricalComponent, terminal: Terminal, pivot: THREE.Vector3): THREE.Vector3 {
  const scale = component3DScaleOf(component)
  const local = terminalLocal3D(component, terminal).multiply(new THREE.Vector3(scale.x, scale.y, scale.z))
  const [x, y, z] = orientationRadians(component.viewOrientation)
  local.applyEuler(new THREE.Euler(x, y, z, 'XYZ'))
  // Rotação/espelho do esquema (mesma ordem do Esquema 2D: espelha, depois roda).
  if (component.mirrored) local.x *= -1
  return local.applyEuler(new THREE.Euler(0, 0, schematicRotationRadians(component), 'XYZ')).add(pivot)
}

/** O Esquema roda no sentido horário; no 3D, visto de frente, isso é -Z. */
export function schematicRotationRadians(component: Pick<ElectricalComponent, 'rotation'>): number {
  return -((((component.rotation ?? 0) % 360) + 360) % 360) * Math.PI / 180
}

/** Normal exterior (no mundo) da face onde o borne está fixo: é por aqui que a
 * ponteira entra e que o cabo sai. Aplica as mesmas rotações/espelho que `terminalWorld3D`. */
/** Normal exterior local de cada face do volume (Y = cima, Z = frente). */
export const TERMINAL_FACE_NORMALS: Record<Terminal3DFace, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
}

export function terminalNormalWorld3D(component: ElectricalComponent, terminal: Terminal): THREE.Vector3 {
  const p = terminal3DPositionOf(terminal)
  // A face declarada manda: um borne do topo perto da aresta direita (ex.: A1 do
  // contator, a 89 % da largura) saía pela lateral só porque essa aresta estava
  // mais perto do que o plano do topo. Sem face declarada, cai-se na mais próxima.
  const declared = terminal.position3DFace
  const normal = declared ? TERMINAL_FACE_NORMALS[declared].clone() : (() => {
    const faces: Array<[number, THREE.Vector3]> = [
      [1 - p.z, new THREE.Vector3(0, 0, 1)], [p.z, new THREE.Vector3(0, 0, -1)],
      [p.x, new THREE.Vector3(-1, 0, 0)], [1 - p.x, new THREE.Vector3(1, 0, 0)],
      [1 - p.y, new THREE.Vector3(0, 1, 0)], [p.y, new THREE.Vector3(0, -1, 0)],
    ]
    return faces.sort((a, b) => a[0] - b[0])[0][1].clone()
  })()
  const [x, y, z] = orientationRadians(component.viewOrientation)
  normal.applyEuler(new THREE.Euler(x, y, z, 'XYZ'))
  if (component.mirrored) normal.x *= -1
  return normal.applyEuler(new THREE.Euler(0, 0, schematicRotationRadians(component), 'XYZ')).normalize()
}
