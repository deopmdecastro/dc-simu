import { Euler, Matrix4, Vector3 } from 'three'
import type { ElectricalComponent } from '../types'
import { componentOrientationOf, orientationRadians } from '../three/componentOrientation'
import { component3DScaleOf, schematicRotationRadians } from '../three/terminal3D'
import { componentPanelXY } from '../three/panelLayout'
import { PANEL_UNITS_PER_MM } from '../three/modelPaths'
import {
  armCupLocalMm, MEC_DIMS, mechatronicsSizeMm, rampDimsOf, slideOffsetMm,
} from '../three/mechatronicsModel'

/** Mesma transformação do Painel 3D, em mm; sem posição explícita usa o pivô do esquema. */
function worldMatrix(c: ElectricalComponent): Matrix4 {
  const p = c.panel3DPosition ?? { ...componentPanelXY(c), z: 0.4 }
  const scale = component3DScaleOf(c)
  const [x, y, z] = orientationRadians(componentOrientationOf(c))
  return new Matrix4().makeTranslation(p.x / PANEL_UNITS_PER_MM, p.y / PANEL_UNITS_PER_MM, p.z / PANEL_UNITS_PER_MM)
    .multiply(new Matrix4().makeRotationZ(schematicRotationRadians(c)))
    .multiply(new Matrix4().makeScale(c.mirrored ? -1 : 1, 1, 1))
    .multiply(new Matrix4().makeRotationFromEuler(new Euler(x, y, z, 'XYZ')))
    .multiply(new Matrix4().makeScale(scale.x, scale.y, scale.z))
}

/** Ponto no eixo da ventosa; offset 0 = lábio, negativo = peça suspensa por baixo. */
function cupPointMm(arm: ElectricalComponent, offset = 0): Vector3 {
  const point = armCupLocalMm(Number(arm.state.angleDeg ?? 0), Number(arm.state.armDownPct ?? 0), offset)
  return new Vector3(point.x, point.y, point.z).applyMatrix4(worldMatrix(arm))
}

/** Só há vedação com a ventosa sobre o topo da peça (folga radial de 7,5 mm e fole de 4 mm). */
export function cupTouchesWorkpiece(arm: ElectricalComponent, station: ElectricalComponent): boolean {
  const size = mechatronicsSizeMm(station.type)!
  const top = station.type === 'mecGravityMagazine'
    ? new Vector3(MEC_DIMS.magazine.pickupOffsetMm, -size.y / 2 + 8 + MEC_DIMS.workpiece.heightMm, 0)
    : new Vector3(0, size.y / 2 - 8 + MEC_DIMS.workpiece.heightMm, 0).add(new Vector3().copy(slideOffsetMm(station.state)))
  const cup = cupPointMm(arm).applyMatrix4(worldMatrix(station).invert())
  const radialGap = (MEC_DIMS.workpiece.diameterMm - MEC_DIMS.rotaryArm.cupDiameterMm) / 2
  return Math.hypot(cup.x - top.x, cup.z - top.z) <= radialGap && Math.abs(cup.y - top.y) <= 4
}

/** Queda vertical da peça sobre a calha real, sem escolher o destino pelo material. */
export function rampBelowWorkpiece(arm: ElectricalComponent, ramp: ElectricalComponent): boolean {
  const inverse = worldMatrix(ramp).invert()
  const bottom = cupPointMm(arm, -MEC_DIMS.workpiece.heightMm)
  const local = bottom.clone().applyMatrix4(inverse)
  const direction = bottom.clone().add(new Vector3(0, -1, 0)).applyMatrix4(inverse).sub(local)
  const r = rampDimsOf(ramp.state)
  const size = mechatronicsSizeMm(ramp.type, ramp.state)!
  const start = -size.x / 2 + 8
  const highY = -size.y / 2 + r.pillarMm
  const slope = Math.tan(r.slope)
  const denominator = direction.y + slope * direction.x
  if (denominator >= -1e-6) return false
  const fall = (highY - local.y - slope * (local.x - start)) / denominator
  if (!Number.isFinite(fall) || fall < 0) return false
  const landing = local.addScaledVector(direction, fall)
  return landing.x >= start && landing.x <= start + r.runMm
    && Math.abs(landing.z) <= (r.widthMm - MEC_DIMS.workpiece.diameterMm) / 2
}
