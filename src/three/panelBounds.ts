import * as THREE from 'three'
import type { ElectricalComponent, SpatialPoint3D } from '../types'
import { component3DDimensions, component3DScaleOf, schematicRotationRadians } from './terminal3D'
import { getComponentModelSpec } from './modelPaths'
import { orientationRadians, componentOrientationOf } from './componentOrientation'

/** Altura do trilho principal (centro) no Painel 3D. */
export const RAIL_Y = 0.4
/** Chapa de montagem: faces e espessura. */
export const PLATE_TOP = RAIL_Y + 1.9
export const PLATE_BOTTOM = RAIL_Y - 3.7
export const PLATE_Z = -0.28
export const PLATE_THICKNESS = 0.06
/** Profundidade útil da caixa (até à porta), em unidades de cena (1 = 100 mm). */
export const PANEL_DEPTH = 2.2

export interface PanelLimits {
  minX: number; maxX: number
  minY: number; maxY: number
  minZ: number; maxZ: number
}

/** Limites do volume útil do painel: a chapa (largura × altura) e a profundidade da caixa. */
export function panelLimits(plateWidth: number): PanelLimits {
  return {
    minX: -plateWidth / 2, maxX: plateWidth / 2,
    minY: PLATE_BOTTOM, maxY: PLATE_TOP,
    minZ: PLATE_Z + PLATE_THICKNESS / 2, maxZ: PANEL_DEPTH,
  }
}

/** Máquinas externas (motores) não vivem dentro do painel. */
export function isPanelBound(component: ElectricalComponent): boolean {
  return getComponentModelSpec(component.type)?.placement !== 'machine'
    && component.type !== 'motor3ph' && component.type !== 'motor1ph'
}

const CORNERS: Array<[number, number, number]> = [
  [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
]

/**
 * Semi-extensões do componente em torno do pivô, com escala, orientação,
 * rotação e espelho do Esquema aplicados — o que realmente ocupa o painel.
 */
export function componentHalfExtents(component: ElectricalComponent, orientation = componentOrientationOf(component)): SpatialPoint3D {
  const size = component3DDimensions(component)
  const scale = component3DScaleOf(component)
  // Calha: o comprimento vem do estado, não do GLB de 1 m.
  const lengthMm = component.type === 'dinRail15x55' ? Number(component.state.lengthMm) : NaN
  const sx = Number.isFinite(lengthMm) ? lengthMm * 0.01 : size.x
  const half = new THREE.Vector3(sx * scale.x, size.y * scale.y, size.z * scale.z).multiplyScalar(0.5)
  const [rx, ry, rz] = orientationRadians(orientation)
  const euler = new THREE.Euler(rx, ry, rz)
  const zRot = new THREE.Matrix4().makeRotationZ(schematicRotationRadians(component))
  const m = new THREE.Matrix4().makeRotationFromEuler(euler).premultiply(zRot)
  const out = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (const [cx, cy, cz] of CORNERS) {
    v.set(cx * half.x, cy * half.y, cz * half.z).applyMatrix4(m)
    out.set(Math.max(out.x, Math.abs(v.x)), Math.max(out.y, Math.abs(v.y)), Math.max(out.z, Math.abs(v.z)))
  }
  return { x: out.x, y: out.y, z: out.z }
}

const clampAxis = (value: number, min: number, max: number) => (min > max ? (min + max) / 2 : Math.max(min, Math.min(max, value)))

/**
 * Mantém o componente inteiro dentro da chapa. Se for maior que a chapa numa
 * direção, centra-o nessa direção (nunca produz NaN nem inverte limites).
 */
export function clampToPanel(position: SpatialPoint3D, component: ElectricalComponent, limits: PanelLimits, orientation?: ElectricalComponent['viewOrientation']): SpatialPoint3D {
  if (!isPanelBound(component)) return position
  const h = componentHalfExtents(component, orientation ? { x: orientation.x, y: orientation.y, z: orientation.z } : undefined)
  // Os modelos de calha assentam pela base: o pivô fica a meio da altura, por isso o cálculo é simétrico.
  return {
    x: clampAxis(position.x, limits.minX + h.x, limits.maxX - h.x),
    y: clampAxis(position.y, limits.minY + h.y, limits.maxY - h.y),
    z: clampAxis(position.z, limits.minZ + h.z, limits.maxZ - h.z),
  }
}

export function isInsidePanel(position: SpatialPoint3D, component: ElectricalComponent, limits: PanelLimits): boolean {
  const c = clampToPanel(position, component, limits)
  return Math.abs(c.x - position.x) < 1e-4 && Math.abs(c.y - position.y) < 1e-4 && Math.abs(c.z - position.z) < 1e-4
}
