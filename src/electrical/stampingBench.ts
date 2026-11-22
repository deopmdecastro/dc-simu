import type { ComponentType, ComponentViewOrientation } from '../types'
import { COMPONENT_PHYSICAL_SIZE_MM } from '../three/modelPaths'
import {
  ARM_REACH_MM,
  ARM_STATION_TOP_MM,
  MEC_DIMS,
  armDirection,
  mechatronicsSizeMm,
  slotPlateDimsOf,
} from '../three/mechatronicsModel'
import { pneumaticComponentSizeMm } from '../three/pneumaticsModel'

/**
 * Adaptação fotográfica da maquete ATEC / Guião 1185 sobre uma base ranhurada paramétrica,
 * derivada da cinemática do manipulador: recolha a 0° (frente-esquerda), gaveta/prensa a 180° (trás)
 * e rampas em inox a 270°/300°/240° (direita: BRANCA, PRETA, METALICA).
 *
 * Inclui:
 * - Calhas ranhuradas perimetrais, coluna luminosa, ilhas Festo, sensores, HMI KTP700, pupitre
 * - Quadro de campo sob a mesa (QE1) com fonte 24 V, relés de interface e relé de segurança
 * - Ambiente fabril: parede, quadro de parede completo, compressor, tratamento de ar (FRL)
 * - Esteira aérea na parede, ramal sobre pilar HEB e descidas para a bancada e o compressor
 *
 * Coordenadas em mm, relativas ao centro da base; `y` é a cota do centro do volume de cada peça.
 * A mesa fica no centro do ambiente fabril.
 */
export interface BenchPlacement {
  key: string
  type: ComponentType
  /** Centro do volume, em mm relativos ao centro da base. */
  x: number
  y: number
  z: number
  state?: Record<string, unknown>
  orientation?: ComponentViewOrientation
}

/** Eixo da torre do manipulador na base. */
export const BENCH_ARM_AXIS = { x: -66, z: 5 } as const
export const BENCH_RAMP_ANGLES = [270, 300, 240] as const
/** Comprimento de cada rampa (METALICA, PRETA, BRANCA): terminam antes da calha lateral e da HMI. */
export const BENCH_RAMP_LENGTHS_MM = [170, 180, 140] as const
/**
 * Fim de curso de gaveta: corpo rodado −90° em Y (rolete para −Z), 18 mm acima do assento do
 * tarugo e 41 mm à frente do centro do alojamento — o rolete toca no tarugo Ø40.
 */
const FC_ABOVE_SEAT_MM = 18
const FC_FROM_POCKET_MM = 41

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
  /** Ponto de depósito do braço (180°) e prato da prensa, um curso do Cilindro 3 mais à esquerda. */
  const load = at(180)
  const drawerStroke = MEC_DIMS.drawerCylinder.strokeMm
  const pressAt = { x: load.x - drawerStroke, z: load.z }
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
  // Guia da gaveta: cobre o depósito e o prato da prensa (curso do Cilindro 3).
  const tableRiser = { lengthMm: table.lengthMm + drawerStroke, heightMm: Math.round(tableTop - table.heightMm), depthMm: table.depthMm }
  const tableY = top + tableRiser.heightMm + table.heightMm / 2
  // Cilindro 3 recuado: a forquilha (42 mm à frente do pivô) encosta à face direita da gaveta.
  const drawerCylX = load.x + table.lengthMm / 2 + 42
  const drawerCylRiser = { lengthMm: 112, heightMm: Math.round(tableY - 4 - mechatronicsSizeMm('mecDrawerCylinder')!.y / 2 - top), depthMm: 46 }

  const ductFront = { lengthMm: plate.lengthMm, widthMm: 34, heightMm: 42, axis: 'x', coverOn: true, plaque: 'atec' }
  const ductSide = { lengthMm: Math.max(120, plate.widthMm - 68), widthMm: 34, heightMm: 42, axis: 'z', coverOn: true }
  const towerSize = COMPONENT_PHYSICAL_SIZE_MM.towerLightSb23011!
  const hmiSize = mechatronicsSizeMm('mecHmiKtp700')!
  const opBoxSize = mechatronicsSizeMm('mecOperatorBox')!

  const list: BenchPlacement[] = [
    // Alimentador por gravidade + Cilindro 1 (B8/B9) + FC 1 + S. OTICO (B11) + S. INDUTIVO
    { key: 'magRiser', type: 'mecSupportBlock', x: (riserStart + riserEnd) / 2, y: top + magRiser.heightMm / 2, z: pickup.z, state: magRiser },
    { key: 'magazine', type: 'mecGravityMagazine', x: magX, y: top + magRiser.heightMm + h('mecGravityMagazine') / 2, z: pickup.z },
    { key: 'feeder', type: 'mecFeederCylinder', x: feederX, y: top + magRiser.heightMm + feederSize.y / 2, z: pickup.z, state: { labelText: 'CILINDRO 1', sensorRecLabel: 'B8', sensorAvaLabel: 'B9' } },
    // FC 1 ao centro do alojamento de recolha: corpo fora da guia, rolete a tocar no tarugo.
    { key: 'fc1', type: 'mecMicroSwitchRoller', x: pickup.x, y: top + magRiser.heightMm + 8 + FC_ABOVE_SEAT_MM, z: pickup.z + FC_FROM_POCKET_MM, state: { actuation: 'feeder', labelText: 'FC 1' }, orientation: { x: 0, y: -90, z: 0 } },
    { key: 'inductiveSensor', type: 'mecInductiveSensor', x: pickup.x, y: top + ARM_STATION_TOP_MM - piece.heightMm / 2, z: pickup.z - 45, state: { actuation: 'feeder', labelText: 'S. INDUTIVO' }, orientation: { x: 90, y: 0, z: 0 } },
    { key: 'inductiveRiser', type: 'mecAluProfile', x: pickup.x, y: top + (ARM_STATION_TOP_MM - piece.heightMm / 2 - 7) / 2, z: pickup.z - 53,
      state: { sectionMm: 30, lengthMm: ARM_STATION_TOP_MM - piece.heightMm / 2 - 7, labelText: 'S. INDUTIVO' } },
    { key: 'opticalSensor', type: 'mecOpticalSensor', x: pickup.x + 72, y: top + ARM_STATION_TOP_MM - piece.heightMm / 2 - 18, z: pickup.z, state: { actuation: 'feeder', labelText: 'S. OTICO', facing: 'x-' } },
    { key: 'opticalRiser', type: 'mecAluProfile', x: pickup.x + 89, y: top + (ARM_STATION_TOP_MM - piece.heightMm / 2 - 56) / 2, z: pickup.z,
      state: { sectionMm: 30, lengthMm: ARM_STATION_TOP_MM - piece.heightMm / 2 - 56, orientation: 'vertical', endCaps: false } },

    // Manipulador rotativo BR1 (Cilindro 2 · B6/B7) + Motorredutor M1 com par cónico e encoder RT3806
    // Batentes 180°–360°: recolha → rampas → gaveta sem passar pelo lado do alimentador e da prensa.
    { key: 'arm', type: 'mecRotaryArm', x: A.x, y: top + h('mecRotaryArm') / 2, z: A.z, state: { rotationStops: [180, 360] } },
    { key: 'motor', type: 'mecDcGearmotor', x: A.x - MEC_DIMS.gearmotor.wheelDiameterMm / 2 - mechatronicsSizeMm('mecDcGearmotor')!.x / 2 + 6, y: top + h('mecDcGearmotor') / 2, z: A.z },

    // Estação de estampagem, orientada como o alimentador (movimento em X):
    // o braço deposita na gaveta FC 2 a 180°; o Cilindro 3 (à direita, haste para −X) empurra a gaveta
    // por baixo do pórtico do Cilindro 4 (B3/B4), cujas colunas ficam à frente e atrás da guia.
    // B2 (recuado) = gaveta no depósito · B1 (avançado) = gaveta sob o prato.
    { key: 'tableRiser', type: 'mecSupportBlock', x: load.x - drawerStroke / 2, y: top + tableRiser.heightMm / 2, z: load.z, state: tableRiser },
    { key: 'table', type: 'mecStampingTable', x: load.x, y: tableY, z: load.z, state: { labelText: 'FC 2', pocketShape: 'square', slideAxis: [-1, 0, 0], slideMm: 0 } },
    { key: 'fc2', type: 'mecMicroSwitchRoller', x: load.x, y: top + tableTop + FC_ABOVE_SEAT_MM, z: load.z + FC_FROM_POCKET_MM,
      state: { actuation: 'drawer', labelText: 'FC 2', slideAxis: [0, 0, 1], slideMm: 0 }, orientation: { x: 0, y: -90, z: 0 } },
    { key: 'press', type: 'mecStampingPress', x: pressAt.x, y: top + h('mecStampingPress') / 2, z: pressAt.z, orientation: { x: 0, y: 90, z: 0 } },
    ...(drawerCylRiser.heightMm >= 4 ? [{ key: 'drawerCylRiser', type: 'mecSupportBlock' as ComponentType, x: drawerCylX + 43, y: top + drawerCylRiser.heightMm / 2, z: load.z, state: drawerCylRiser }] : []),
    { key: 'drawerCylinder', type: 'mecDrawerCylinder', x: drawerCylX, y: tableY - 4, z: load.z, orientation: { x: 0, y: -90, z: 0 },
      state: { labelText: 'CILINDRO 3', sensorRecLabel: 'B2', sensorAvaLabel: 'B1' } },
    { key: 'chain', type: 'mecDragChain', x: load.x + 50, y: top + h('mecDragChain', { lengthMm: 120 }) / 2, z: load.z + 55, state: { lengthMm: 120 } },

    // Ilhas de eletroválvulas Festo 2× 5/2 (C1A, C2A) e Gerador de vácuo (VAC1 · C4A) à esquerda
    { key: 'valveIsland1', type: 'mecValveIsland', x: -plate.lengthMm / 2 + 96, y: top + h('mecValveIsland') / 2, z: -26, state: { islandTag: 'C1A' } },
    { key: 'valveIsland2', type: 'mecValveIsland', x: -plate.lengthMm / 2 + 96, y: top + h('mecValveIsland') / 2, z: -118, state: { islandTag: 'C2A' } },
    { key: 'ejector', type: 'mecVacuumEjector', x: -plate.lengthMm / 2 + 92, y: top + h('mecVacuumEjector') / 2, z: -188, state: { labelText: 'C4A' } },

    // Coluna luminosa de sinalização no canto traseiro esquerdo (verde / amarelo / vermelho)
    { key: 'signalTower', type: 'towerLightSb23011', x: -plate.lengthMm / 2 + 68, y: top + towerSize.height / 2, z: -plate.widthMm / 2 + 68, state: { green: false, cableEnabled: false } },

    // Consola Siemens SIMATIC HMI KTP700 Basic em bastidor de perfil 30 × 30 (direita-trás, virada para o operador)
    { key: 'hmi', type: 'mecHmiKtp700', x: plate.lengthMm / 2 - hmiSize.z / 2 - 12, y: top + hmiSize.y / 2, z: -plate.widthMm / 2 + hmiSize.x / 2 + 36, state: { on: true, powered: true }, orientation: { x: 0, y: 90, z: 0 } },

    // Caixa de 6 botões de comando junto à calha frontal-esquerda
    { key: 'operatorBox', type: 'mecOperatorBox', x: -plate.lengthMm / 2 + opBoxSize.x / 2 + 48, y: top + opBoxSize.y / 2 + 42, z: plate.widthMm / 2 - opBoxSize.z / 2 - 44, state: { shellOnly: true } },

    // Calhas técnicas ranhuradas em PVC cinzento no perímetro da base
    { key: 'ductFront', type: 'mecBenchDuct', x: 0, y: top + ductFront.heightMm / 2, z: plate.widthMm / 2 - ductFront.widthMm / 2, state: ductFront },
    { key: 'ductBack', type: 'mecBenchDuct', x: 0, y: top + ductFront.heightMm / 2, z: -plate.widthMm / 2 + ductFront.widthMm / 2, state: ductFront },
    { key: 'ductLeft', type: 'mecBenchDuct', x: -plate.lengthMm / 2 + ductSide.widthMm / 2, y: top + ductSide.heightMm / 2, z: 0, state: ductSide },
    { key: 'ductRight', type: 'mecBenchDuct', x: plate.lengthMm / 2 - ductSide.widthMm / 2, y: top + ductSide.heightMm / 2, z: 0, state: ductSide },

    // Poste de perfil 30 × 30 junto ao bastidor da HMI (apoio de tubagem e cablagem)
    { key: 'profile', type: 'mecAluProfile', x: 290, y: top + h('mecAluProfile', { sectionMm: 30, lengthMm: 286 }) / 2, z: -plate.widthMm / 2 + 200, state: { sectionMm: 30, lengthMm: 286, orientation: 'vertical' } },
  ]

  // Operadores reais da biblioteca: duas filas de três, com contactos alojados na caixa.
  const box = list.find(p => p.key === 'operatorBox')!
  const operators: Array<[string, ComponentType, number, number, string, string?]> = [
    ['emergency', 'emergencyButton', -50, 26, 'EMERGÊNCIA'],
    ['mode', 'selectorSchneiderXa2ed33', 0, 26, 'MAN / AUTO'],
    ['reset', 'pushButtonXb2Blue', 50, 26, 'REARME'],
    ['cycle', 'selectorSchneiderXa2ed33', -50, -26, 'CICLO'],
    ['stop', 'pushButtonXb2Nc', 0, -26, 'STOP'],
    ['start', 'pushButtonXb2No', 50, -26, 'START'],
  ]
  for (const [key, type, x, y, label, color] of operators) list.push({
    key: `operator-${key}`, type, x: box.x + x, y: box.y + y,
    z: box.z + opBoxSize.z / 2 - 25,
    state: { labelText: label, hostLocation: 'machine', ...(color ? { color } : {}) },
  })

  // ---------------------------------------------------------------------------
  // Quadro sob a mesa (QE de máquina) — bornes de campo, relés, fonte 24 V,
  // relé de segurança, calhas e batentes. Nenhuma válvula é pilotada diretamente:
  // as saídas passam por relés.
  // ---------------------------------------------------------------------------
  if (plate.legs) {
    const leg = plate.legHeightMm === 'auto' ? 750 : plate.legHeightMm
    const cabinetH = Math.min(520, leg - 110)
    if (cabinetH >= 200) {
      const cabinetY = -55 - cabinetH / 2
      const cabinetZ = -plate.widthMm / 2 + 145
      // Quadro de campo sob a mesa com etiqueta e bucins de entrada
      list.push({
        key: 'cabinet', type: 'panelEnclosure', x: 0, y: cabinetY, z: cabinetZ,
        state: {
          hostLocation: 'machine', widthMm: 480, heightMm: cabinetH, depthMm: 200,
          doorOpen: false, plateFinish: 'Aço galvanizado',
          labelText: 'QE1 · CAMPO ESTAMPAGEM',
          holes: [
            { id: 'field-entry-left', face: 'left', offsetXmm: 40, offsetYmm: 20, diameterMm: 32, glandType: 'M32' },
            { id: 'field-entry-right', face: 'right', offsetXmm: 40, offsetYmm: 20, diameterMm: 25, glandType: 'M25' },
            { id: 'field-entry-top', face: 'top', offsetXmm: 0, offsetYmm: 0, diameterMm: 25, glandType: 'M25' },
          ],
        },
      })
      // Travessas de suporte do quadro
      for (const [key, y] of [['upper', -75], ['lower', -35 - cabinetH]] as const) {
        list.push({
          key: `cabinet-rail-${key}`, type: 'mecAluProfile', x: 0, y, z: cabinetZ - 120,
          state: { sectionMm: 40, lengthMm: plate.lengthMm - 90, orientation: 'horizontal', endCaps: true, brackets: true },
        })
      }
      // Calha vertical de descida de cabos de campo
      const dropX = -plate.lengthMm / 2 + 40
      const runLength = Math.max(40, -200 - dropX)
      list.push({
        key: 'ductDrop', type: 'mecBenchDuct', x: dropX, y: (20 + cabinetY - 17.5) / 2, z: cabinetZ + 30,
        state: { lengthMm: 20 - cabinetY + 17.5, widthMm: 30, heightMm: 35, coverOn: true, labelText: 'CAMPO → QE1' },
        orientation: { x: 0, y: 0, z: 90 },
      })
      list.push({
        key: 'ductUnder', type: 'mecBenchDuct', x: dropX + runLength / 2, y: cabinetY, z: cabinetZ + 30,
        state: { lengthMm: runLength, widthMm: 30, heightMm: 35, coverOn: true, labelText: 'RESERVA CABOS' },
      })
      // Fonte 24 V DC no interior do quadro de campo (posição relativa aproximada)
      list.push({
        key: 'psu24', type: 'powerSupplyProauto24A',
        x: -80, y: cabinetY + cabinetH * 0.28, z: cabinetZ + 40,
        state: { labelText: 'PSU 24V · 5A', hostLocation: 'machine' },
      })
      // Relés de interface (saídas do PLC/HMI não ativam válvulas diretamente)
      const relayYs = [cabinetY + cabinetH * 0.05, cabinetY - cabinetH * 0.12, cabinetY - cabinetH * 0.28]
      ;['K1 · CIL1', 'K2 · PRENSA', 'K3 · BRAÇO'].forEach((tag, i) => {
        list.push({
          key: `relay-${i + 1}`, type: 'relayFinder5534',
          x: 40, y: relayYs[i], z: cabinetZ + 35,
          state: { labelText: tag, hostLocation: 'machine' },
        })
      })
      // Relé de segurança
      list.push({
        key: 'safetyRelay', type: 'safetyRelay',
        x: 110, y: cabinetY + cabinetH * 0.18, z: cabinetZ + 35,
        state: { labelText: 'KS1 · SEGURANÇA', hostLocation: 'machine' },
      })
    }
  }

  // 3 Rampas de descarga em inox (BRANCA, PRETA, METALICA) sobre pilares de perfil 30 × 30
  const rampPillars = [110, 95, 80]
  const rampLabels = ['METALICA', 'PRETA', 'BRANCA']
  BENCH_RAMP_ANGLES.forEach((deg, i) => {
    const drop = at(deg)
    const state = { pillarMm: rampPillars[i], rampLabel: rampLabels[i], lengthMm: BENCH_RAMP_LENGTHS_MM[i] }
    const size = mechatronicsSizeMm('mecDischargeRamp', state)!
    list.push({ key: `ramp${i + 1}`, type: 'mecDischargeRamp', x: drop.x + size.x / 2 - 22, y: top + size.y / 2, z: drop.z, state })
  })

  // ---------------------------------------------------------------------------
  // Ambiente fabril à volta da bancada (coordenadas relativas ao centro da base;
  // o chão fica por baixo dos pés da mesa). Cotas estimadas, editáveis:
  // - parede em painel a 650 mm da traseira da mesa, com o quadro geral a 1–2 m do chão;
  // - compressor no chão, à esquerda, encostado à parede;
  // - esteira aérea ao longo da parede (2,2 m), ramal até à mesa sobre um pilar HEB
  //   e descidas verticais para a bancada e para o compressor;
  // - FRL de entrada de ar preso ao pé dianteiro esquerdo da mesa.
  // ---------------------------------------------------------------------------
  const legMm = plate.legHeightMm === 'auto' ? 750 : plate.legHeightMm
  const floor = -top - legMm
  const wallFrontZ = -plate.widthMm / 2 - 650
  const wall = { lengthMm: 3000, heightMm: 2600, thicknessMm: 150 }
  const trayBottom = floor + 2215
  const trayY = trayBottom + 35 // centro da esteira (abas de 60 mm + fundo)
  const comp = pneumaticComponentSizeMm('airCompressor')!
  const frl = pneumaticComponentSizeMm('pneumaticFrl')!
  const compX = -plate.lengthMm / 2 - 750
  const wallTray = { from: compX - comp.x / 2 - 110, to: 100 }
  const branch = { from: wallFrontZ + 260, to: -plate.widthMm / 2 }

  list.push({
    key: 'factoryWall', type: 'industrialWall', x: -400, y: floor + wall.heightMm / 2, z: wallFrontZ - wall.thicknessMm / 2,
    state: { ...wall, finish: 'panel', skirting: true, labelText: 'PAREDE FABRIL' },
  })
  list.push({
    key: 'wallPanel', type: 'panelEnclosure', x: -450, y: floor + 1500, z: wallFrontZ + 125,
    state: {
      hostLocation: 'machine', widthMm: 800, heightMm: 1000, depthMm: 250, doorOpen: false,
      plateFinish: 'Aço galvanizado', labelText: 'QE · GERAL ESTAMPAGEM',
      holes: [
        { id: 'main-in', face: 'top', offsetXmm: -120, offsetYmm: 0, diameterMm: 40, glandType: 'M40' },
        { id: 'out-to-bench', face: 'top', offsetXmm: 120, offsetYmm: 0, diameterMm: 32, glandType: 'M32' },
        { id: 'out-to-compressor', face: 'top', offsetXmm: 0, offsetYmm: 0, diameterMm: 32, glandType: 'M32' },
      ],
    },
  })
  list.push({
    key: 'compressor', type: 'airCompressor', x: compX, y: floor + comp.y / 2, z: wallFrontZ + 40 + comp.z / 2,
    state: { labelText: 'COMPRESSOR · AR COMPRIMIDO' },
  })
  list.push({
    key: 'airTreatment', type: 'pneumaticFrl', x: -plate.lengthMm / 2 - frl.x / 2 - 2, y: -top - 30 - frl.y / 2, z: plate.widthMm / 2 - 20,
    state: { labelText: 'FRL · ENTRADA DE AR' },
  })

  // Esteira aérea ao longo da parede: por cima do quadro geral, do compressor até ao ramal da mesa.
  list.push({
    key: 'tray-wall', type: 'cableTrayStraight', x: (wallTray.from + wallTray.to) / 2, y: trayY, z: wallFrontZ + 160,
    state: { lengthMm: wallTray.to - wallTray.from, widthMm: 200, sideHeightMm: 60, withCover: true, labelText: 'QE → BANCADA / COMPRESSOR' },
  })
  // Ramal até à traseira da mesa (eixo Z), apoiado num pilar HEB 200.
  list.push({
    key: 'tray-to-bench', type: 'cableTrayStraight', x: 0, y: trayY, z: (branch.from + branch.to) / 2,
    state: { lengthMm: branch.to - branch.from, widthMm: 150, sideHeightMm: 60, withCover: true, labelText: 'QE → BANCADA' },
    orientation: { x: 0, y: 90, z: 0 },
  })
  list.push({
    key: 'pillar-bench', type: 'industrialPillar', x: 0, y: floor + (trayBottom - floor) / 2, z: (branch.from + branch.to) / 2 - 45,
    state: { heightMm: Math.round(trayBottom - floor), profile: 'HEB200', finish: 'safetyYellow' },
  })
  // Descidas verticais: para a calha traseira da mesa e para o compressor.
  const benchDrop = trayBottom - top
  list.push({
    key: 'tray-drop-bench', type: 'cableTrayStraight', x: 0, y: top + benchDrop / 2, z: -plate.widthMm / 2 - 55,
    state: { lengthMm: Math.round(benchDrop), widthMm: 100, sideHeightMm: 60, withCover: true, labelText: 'DESCIDA BANCADA' },
    orientation: { x: 0, y: 0, z: 90 },
  })
  const compDropBottom = floor + comp.y + 80
  list.push({
    key: 'tray-drop-compressor', type: 'cableTrayStraight', x: compX - comp.x / 2 - 60, y: (trayBottom + compDropBottom) / 2, z: wallFrontZ + 160,
    state: { lengthMm: Math.round(trayBottom - compDropBottom), widthMm: 100, sideHeightMm: 60, withCover: true, labelText: 'DESCIDA COMPRESSOR' },
    orientation: { x: 0, y: 0, z: 90 },
  })

  // A orientação é construtiva nesta montagem; deve sobreviver à reabertura do ficheiro.
  return list.map(part => ({ ...part, state: { ...part.state, benchAssembly: true } }))
}
