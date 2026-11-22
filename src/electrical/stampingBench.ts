import type { ComponentType } from '../types'
import {
  ARM_REACH_MM,
  ARM_STATION_TOP_MM,
  MEC_DIMS,
  armDirection,
  mechatronicsSizeMm,
  slotPlateDimsOf,
} from '../three/mechatronicsModel'

/**
 * Disposição da maquete de estampagem sobre a base ranhurada (700 × 500 mm), derivada da cinemática
 * do manipulador: recolha a 0° (frente), gaveta/prensa a 180° (trás) e rampas a 270°/300°/240° (direita).
 * Blocos maquinados elevam a zona de recolha e a gaveta para que o topo das peças fique à cota
 * `ARM_STATION_TOP_MM`, onde a ventosa desce, e por baixo do prato recolhido da prensa.
 * Coordenadas em mm, relativas ao centro da base; `y` é a cota do centro do volume de cada peça.
 */
export interface BenchPlacement {
  key: string
  type: ComponentType
  /** Centro do volume, em mm relativos ao centro da base. */
  x: number
  y: number
  z: number
  state?: Record<string, unknown>
}

/** Eixo da torre do manipulador na base. */
export const BENCH_ARM_AXIS = { x: -66, z: 5 } as const
export const BENCH_RAMP_ANGLES = [270, 300, 240] as const

export function stampingBenchLayout(plateState?: Record<string, any>): BenchPlacement[] {
  const plate = slotPlateDimsOf(plateState)
  const top = plate.thicknessMm / 2
  const h = (type: ComponentType, state?: Record<string, unknown>) => mechatronicsSizeMm(type, state)!.y
  const A = BENCH_ARM_AXIS
  const at = (deg: number) => {
    const d = armDirection(deg)
    return { x: A.x + d.x * ARM_REACH_MM, z: A.z + d.z * ARM_REACH_MM }
  }
  const pickup = at(0)
  const press = at(180)
  const mag = MEC_DIMS.magazine
  const piece = MEC_DIMS.workpiece
  const table = MEC_DIMS.table

  // Zona de recolha: topo do tarugo = base do magazine + 8 mm + 35 mm.
  const magBaseY = ARM_STATION_TOP_MM - 8 - piece.heightMm
  const magX = pickup.x - mag.pickupOffsetMm
  const tubeX = magX + mag.tubeOffsetMm
  // Face do empurrador recuado (+16 mm do centro do cilindro) encostada ao tarugo inferior do tubo.
  const feederX = tubeX - piece.diameterMm / 2 - 16
  const feederSize = mechatronicsSizeMm('mecFeederCylinder')!
  const riserStart = feederX - feederSize.x / 2
  const riserEnd = magX + mag.baseLengthMm / 2
  const magRiser = { lengthMm: Math.round(riserEnd - riserStart), heightMm: Math.round(magBaseY), depthMm: mag.baseDepthMm }
  // Gaveta: topo do tarugo = topo da mesa − rebaixo 8 mm + 35 mm.
  const tableTop = ARM_STATION_TOP_MM - (piece.heightMm - 8)
  const tableRiser = { lengthMm: table.lengthMm, heightMm: Math.round(tableTop - table.heightMm), depthMm: table.depthMm }

  const list: BenchPlacement[] = [
    { key: 'magRiser', type: 'mecSupportBlock', x: (riserStart + riserEnd) / 2, y: top + magRiser.heightMm / 2, z: pickup.z, state: magRiser },
    { key: 'magazine', type: 'mecGravityMagazine', x: magX, y: top + magRiser.heightMm + h('mecGravityMagazine') / 2, z: pickup.z },
    { key: 'feeder', type: 'mecFeederCylinder', x: feederX, y: top + magRiser.heightMm + feederSize.y / 2, z: pickup.z },
    { key: 'fc1', type: 'mecMicroSwitchRoller', x: pickup.x, y: top + magRiser.heightMm + 8 + h('mecMicroSwitchRoller') / 2, z: pickup.z + piece.diameterMm / 2 + 11, state: { actuation: 'feeder' } },
    { key: 'arm', type: 'mecRotaryArm', x: A.x, y: top + h('mecRotaryArm') / 2, z: A.z },
    // Pinhão do motor (ponta +X do volume) a engrenar na roda cónica Ø60 da torre.
    { key: 'motor', type: 'mecDcGearmotor', x: A.x - MEC_DIMS.gearmotor.wheelDiameterMm / 2 - mechatronicsSizeMm('mecDcGearmotor')!.x / 2 + 6, y: top + h('mecDcGearmotor') / 2, z: A.z },
    { key: 'tableRiser', type: 'mecSupportBlock', x: press.x, y: top + tableRiser.heightMm / 2, z: press.z, state: tableRiser },
    { key: 'table', type: 'mecStampingTable', x: press.x, y: top + tableRiser.heightMm + table.heightMm / 2, z: press.z },
    { key: 'press', type: 'mecStampingPress', x: press.x, y: top + h('mecStampingPress') / 2, z: press.z },
    { key: 'ejector', type: 'mecVacuumEjector', x: A.x - 80, y: top + h('mecVacuumEjector') / 2, z: A.z - 95 },
    { key: 'chain', type: 'mecDragChain', x: 200, y: top + h('mecDragChain', { lengthMm: 220 }) / 2, z: -200, state: { lengthMm: 220 } },
    { key: 'profile', type: 'mecAluProfile', x: -300, y: top + h('mecAluProfile', { sectionMm: 40, lengthMm: 420 }) / 2, z: -215, state: { sectionMm: 40, lengthMm: 420, orientation: 'vertical' } },
  ]
  const pillars = [110, 95, 80]
  BENCH_RAMP_ANGLES.forEach((deg, i) => {
    const drop = at(deg)
    const state = { pillarMm: pillars[i] }
    const size = mechatronicsSizeMm('mecDischargeRamp', state)!
    // A ponta alta da calha (pilar traseiro) fica por baixo da ventosa; a calha desce para +X.
    list.push({ key: `ramp${i + 1}`, type: 'mecDischargeRamp', x: drop.x + size.x / 2 - 22, y: top + size.y / 2, z: drop.z, state })
  })
  return list
}
