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
 * Disposição da maquete de estampagem ATEC / Guião 1185 sobre a base ranhurada (700 × 500 mm),
 * derivada da cinemática do manipulador: recolha a 0° (frente-esquerda), gaveta/prensa a 180° (trás)
 * e rampas em inox a 270°/300°/240° (direita: BRANCA, PRETA, METALICA).
 * Inclui calhas ranhuradas perimetrais, coluna luminosa no canto traseiro esquerdo, ilhas de
 * eletroválvulas Festo 2× 5/2 (C1A/C2A), sensores S. OTICO / S. INDUTIVO, cilindro da gaveta
 * (Cilindro 3), consola Siemens SIMATIC HMI KTP700 Basic e caixa de 6 botões de comando.
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
  const riserStart = feederX - feederSize.x / 2 + 44
  const riserEnd = magX + mag.baseLengthMm / 2
  const magRiser = { lengthMm: Math.round(riserEnd - riserStart), heightMm: Math.round(magBaseY), depthMm: mag.baseDepthMm }
  // Gaveta: topo do tarugo = topo da mesa − rebaixo 8 mm + 35 mm.
  const tableTop = ARM_STATION_TOP_MM - (piece.heightMm - 8)
  const tableRiser = { lengthMm: table.lengthMm, heightMm: Math.round(tableTop - table.heightMm), depthMm: table.depthMm }

  const ductFront = { lengthMm: plate.lengthMm, widthMm: 34, heightMm: 42, axis: 'x', coverOn: true, plaque: 'atec' }
  const ductSide = { lengthMm: Math.max(120, plate.widthMm - 68), widthMm: 34, heightMm: 42, axis: 'z', coverOn: true }
  const drawerCylSize = mechatronicsSizeMm('mecDrawerCylinder')!
  const optSize = mechatronicsSizeMm('mecOpticalSensor')!
  const indSize = mechatronicsSizeMm('mecInductiveSensor')!
  const towerSize = mechatronicsSizeMm('mecSignalTower')!
  const hmiSize = mechatronicsSizeMm('mecHmiKtp700')!
  const opBoxSize = mechatronicsSizeMm('mecOperatorBox')!

  const list: BenchPlacement[] = [
    // Alimentador por gravidade + Cilindro 1 (B8/B9) + FC 1 + S. OTICO (B11) + S. INDUTIVO
    { key: 'magRiser', type: 'mecSupportBlock', x: (riserStart + riserEnd) / 2, y: top + magRiser.heightMm / 2, z: pickup.z, state: magRiser },
    { key: 'magazine', type: 'mecGravityMagazine', x: magX, y: top + magRiser.heightMm + h('mecGravityMagazine') / 2, z: pickup.z },
    { key: 'feeder', type: 'mecFeederCylinder', x: feederX, y: top + magRiser.heightMm + feederSize.y / 2, z: pickup.z, state: { labelText: 'CILINDRO 1', sensorRecLabel: 'B8', sensorAvaLabel: 'B9' } },
    { key: 'fc1', type: 'mecMicroSwitchRoller', x: pickup.x, y: top + magRiser.heightMm + 8 + h('mecMicroSwitchRoller') / 2, z: pickup.z + piece.diameterMm / 2 + 11, state: { actuation: 'feeder', labelText: 'FC 1' } },
    { key: 'inductiveSensor', type: 'mecInductiveSensor', x: pickup.x, y: top + magRiser.heightMm - indSize.y / 2 + 8, z: pickup.z, state: { actuation: 'feeder', labelText: 'S. INDUTIVO' } },
    { key: 'opticalSensor', type: 'mecOpticalSensor', x: pickup.x + 96, y: top + optSize.y / 2, z: pickup.z - 12, state: { actuation: 'feeder', labelText: 'S. OTICO', facing: 'x-' } },

    // Manipulador rotativo BR1 (Cilindro 2 · B6/B7) + Motorredutor M1 com par cónico e encoder RT3806
    { key: 'arm', type: 'mecRotaryArm', x: A.x, y: top + h('mecRotaryArm') / 2, z: A.z },
    { key: 'motor', type: 'mecDcGearmotor', x: A.x - MEC_DIMS.gearmotor.wheelDiameterMm / 2 - mechatronicsSizeMm('mecDcGearmotor')!.x / 2 + 6, y: top + h('mecDcGearmotor') / 2, z: A.z },

    // Estação de estampagem: Pórtico Cilindro 4 (B3/B4) + Gaveta deslizante FC 2 + Cilindro 3 (B2/B1) + Esteira
    { key: 'tableRiser', type: 'mecSupportBlock', x: press.x, y: top + tableRiser.heightMm / 2, z: press.z, state: tableRiser },
    { key: 'table', type: 'mecStampingTable', x: press.x, y: top + tableRiser.heightMm + table.heightMm / 2, z: press.z, state: { labelText: 'FC 2' } },
    { key: 'press', type: 'mecStampingPress', x: press.x, y: top + h('mecStampingPress') / 2, z: press.z },
    { key: 'drawerCylinder', type: 'mecDrawerCylinder', x: press.x, y: top + drawerCylSize.y / 2, z: -140, state: { facing: 'z-', labelText: 'CILINDRO 3', sensorRecLabel: 'B2', sensorAvaLabel: 'B1' } },
    { key: 'chain', type: 'mecDragChain', x: press.x + 112, y: top + h('mecDragChain', { lengthMm: 120 }) / 2, z: press.z + 18, state: { lengthMm: 120 } },

    // Ilhas de eletroválvulas Festo 2× 5/2 (C1A, C2A) e Gerador de vácuo (VAC1 · C4A) à esquerda
    { key: 'valveIsland1', type: 'mecValveIsland', x: -plate.lengthMm / 2 + 96, y: top + h('mecValveIsland') / 2, z: -26, state: { islandTag: 'C1A' } },
    { key: 'valveIsland2', type: 'mecValveIsland', x: -plate.lengthMm / 2 + 96, y: top + h('mecValveIsland') / 2, z: -118, state: { islandTag: 'C2A' } },
    { key: 'ejector', type: 'mecVacuumEjector', x: -plate.lengthMm / 2 + 92, y: top + h('mecVacuumEjector') / 2, z: -188, state: { labelText: 'C4A' } },

    // Coluna luminosa de sinalização no canto traseiro esquerdo (verde / amarelo / vermelho)
    { key: 'signalTower', type: 'mecSignalTower', x: -plate.lengthMm / 2 + 68, y: top + towerSize.y / 2, z: -plate.widthMm / 2 + 68, state: { green: true, manualGreen: true } },

    // Consola Siemens SIMATIC HMI KTP700 Basic em bastidor de perfil 30 × 30 (direita-trás, virada para o operador)
    { key: 'hmi', type: 'mecHmiKtp700', x: plate.lengthMm / 2 - hmiSize.x / 2 - 38, y: top + hmiSize.y / 2, z: -plate.widthMm / 2 + hmiSize.z / 2 + 44, state: { on: true, powered: true } },

    // Caixa de 6 botões de comando junto à calha frontal-esquerda
    { key: 'operatorBox', type: 'mecOperatorBox', x: -plate.lengthMm / 2 + opBoxSize.x / 2 + 38, y: top + opBoxSize.y / 2, z: plate.widthMm / 2 - opBoxSize.z / 2 - 4 },

    // Calhas técnicas ranhuradas em PVC cinzento no perímetro da base
    { key: 'ductFront', type: 'mecBenchDuct', x: 0, y: top + ductFront.heightMm / 2, z: plate.widthMm / 2 - ductFront.widthMm / 2, state: ductFront },
    { key: 'ductBack', type: 'mecBenchDuct', x: 0, y: top + ductFront.heightMm / 2, z: -plate.widthMm / 2 + ductFront.widthMm / 2, state: ductFront },
    { key: 'ductLeft', type: 'mecBenchDuct', x: -plate.lengthMm / 2 + ductSide.widthMm / 2, y: top + ductSide.heightMm / 2, z: 0, state: ductSide },
    { key: 'ductRight', type: 'mecBenchDuct', x: plate.lengthMm / 2 - ductSide.widthMm / 2, y: top + ductSide.heightMm / 2, z: 0, state: ductSide },

    // Poste de perfil 40 × 40 no canto dianteiro direito (apoio de tubagem e cablagem da maquete)
    { key: 'profile', type: 'mecAluProfile', x: 290, y: top + h('mecAluProfile', { sectionMm: 40, lengthMm: 420 }) / 2, z: 196, state: { sectionMm: 40, lengthMm: 420, orientation: 'vertical' } },
  ]

  // 3 Rampas de descarga em inox (BRANCA, PRETA, METALICA) sobre pilares de perfil 30 × 30
  const pillars = [110, 95, 80]
  const rampLabels = ['METALICA', 'PRETA', 'BRANCA']
  BENCH_RAMP_ANGLES.forEach((deg, i) => {
    const drop = at(deg)
    const state = { pillarMm: pillars[i], rampLabel: rampLabels[i] }
    const size = mechatronicsSizeMm('mecDischargeRamp', state)!
    // A ponta alta da calha (pilar traseiro) fica por baixo da ventosa; a calha desce para +X.
    list.push({ key: `ramp${i + 1}`, type: 'mecDischargeRamp', x: drop.x + size.x / 2 - 22, y: top + size.y / 2, z: drop.z, state })
  })
  return list
}
