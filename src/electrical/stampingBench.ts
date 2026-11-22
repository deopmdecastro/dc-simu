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
  /** TAG fixa (réguas de bornes X21.1…); sem ela o projeto atribui a próxima livre. */
  ref?: string
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

/** Réguas de bornes do QE1 (X20 alimentação; X21… um sinal de campo por borne, marcação na plaqueta ZB). */
export const BENCH_FIELD_TERMINALS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['X21', ['B1', 'B2', 'B3', 'B4', 'B6', 'B7', 'B8', 'B9', 'B11', 'FC1', 'FC2', 'S.IND']],
  ['X22', ['Y1', 'Y2', 'Y3', 'Y4', 'Y5', '0V']],
  ['X23', ['M+', 'M-', 'ENC A', 'ENC B']],
  ['X24', ['EMERG', 'AUTO', 'REARME', 'CICLO', 'STOP', 'START']],
]

/**
 * Onde está a parede e o quadro geral (QGD), em mm relativos ao centro da base. Sem estes dados
 * assume-se a montagem por omissão: QGD centrado atrás da mesa, parede a 1,2 m da traseira.
 */
export interface BenchEnvironment {
  wallZmm: number
  panelXmm: number
  panelTopMm: number
}

export function stampingBenchLayout(plateState?: Record<string, any>, env?: BenchEnvironment): BenchPlacement[] {
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
  // QE1 · quadro de campo sob a mesa (porta aberta): calhas técnicas, 2 calhas DIN,
  // fonte 24 V, relé de segurança KS1 e relés de interface K1–K6 (nenhuma saída
  // pilota uma válvula diretamente) e réguas de bornes etiquetadas para os sensores,
  // as válvulas, o motor M1 e os botões. Bucins à esquerda (campo) e em cima (QGD).
  // ---------------------------------------------------------------------------
  if (plate.legs) {
    const leg = plate.legHeightMm === 'auto' ? 750 : plate.legHeightMm
    const cabinetH = Math.min(520, leg - 110)
    if (cabinetH >= 300) {
      const cab = { w: 480, h: cabinetH, d: 200 }
      const cabinetY = -55 - cab.h / 2
      const cabinetZ = -plate.widthMm / 2 + 145
      list.push({
        key: 'cabinet', type: 'panelEnclosure', x: 0, y: cabinetY, z: cabinetZ,
        state: {
          hostLocation: 'machine', widthMm: cab.w, heightMm: cab.h, depthMm: cab.d,
          doorOpen: true, hingeSide: 'left', plateFinish: 'Aço galvanizado',
          labelText: 'QE1 · CAMPO ESTAMPAGEM',
          holes: [
            { id: 'field-entry-left', face: 'left', offsetXmm: 40, offsetYmm: -150, diameterMm: 32, glandType: 'M32' },
            { id: 'field-entry-left-2', face: 'left', offsetXmm: -40, offsetYmm: -150, diameterMm: 25, glandType: 'M25' },
            { id: 'supply-top', face: 'top', offsetXmm: 150, offsetYmm: 0, diameterMm: 25, glandType: 'M25' },
          ],
        },
      })
      for (const [key, y] of [['upper', -75], ['lower', -35 - cab.h]] as const) list.push({
        key: `cabinet-rail-${key}`, type: 'mecAluProfile', x: 0, y, z: cabinetZ - 120,
        state: { sectionMm: 40, lengthMm: plate.lengthMm - 90, orientation: 'horizontal', endCaps: true, brackets: true },
      })
      // Descida dos cabos de campo pela perna traseira esquerda até aos bucins laterais.
      const dropX = -plate.lengthMm / 2 + 40
      list.push({
        key: 'ductDrop', type: 'mecBenchDuct', x: dropX, y: (20 + cabinetY - 150) / 2, z: cabinetZ + 30,
        state: { lengthMm: Math.round(20 - cabinetY + 150), widthMm: 30, heightMm: 35, coverOn: true, labelText: 'CAMPO → QE1' },
        orientation: { x: 0, y: 0, z: 90 },
      })
      list.push({
        key: 'ductUnder', type: 'mecBenchDuct', x: (dropX - cab.w / 2) / 2, y: cabinetY - 150, z: cabinetZ + 30,
        state: { lengthMm: Math.round(-cab.w / 2 - dropX), widthMm: 30, heightMm: 35, coverOn: true, labelText: 'CAMPO' },
      })
      // Placa de montagem: a 14 mm da traseira; calha DIN 7,5 mm; aparelhos encostados à calha.
      const plateFront = cabinetZ - cab.d / 2 + 14
      const onRail = (depthMm: number) => plateFront + 7.5 + depthMm / 2
      const inside = (key: string, type: ComponentType, x: number, y: number, z: number, state: Record<string, unknown> = {}): BenchPlacement =>
        ({ key, type, x, y: cabinetY + y, z, state: { hostLocation: 'machine', ...state } })
      const usable = cab.w - 40
      // Calhas técnicas 40 × 60 (cima, meio, baixo) e calhas DIN TS35 (relés e bornes).
      for (const [key, y] of [['top', cab.h / 2 - 45], ['mid', 20], ['bottom', -cab.h / 2 + 50]] as const) {
        list.push(inside(`cabinet-duct-${key}`, 'cableDuct', 0, y, plateFront + 30, { lengthMm: usable, widthMm: 40, heightMm: 60, coverOn: true }))
      }
      const railA = 120, railB = -80
      for (const [key, y] of [['relays', railA], ['terminals', railB]] as const) {
        list.push(inside(`cabinet-din-${key}`, 'dinRail15x55', 0, y, plateFront + 3.75, { lengthMm: usable, profile: '35×15 mm', perforated: true, finish: 'Aço galvanizado' }))
      }
      // Fila A: fonte 24 V · relé de segurança · relés de interface das válvulas e do motor.
      const sizeOf = (type: ComponentType) => COMPONENT_PHYSICAL_SIZE_MM[type]!
      let ax = -usable / 2 + 4
      const putA = (key: string, type: ComponentType, state: Record<string, unknown>) => {
        const s = sizeOf(type)
        list.push(inside(key, type, ax + s.width / 2, railA, onRail(s.depth), state))
        ax += s.width + 2
      }
      putA('psu24', 'powerSupplyProauto24A', { labelText: 'G1 · 24 V DC 5 A' })
      putA('safetyRelay', 'safetyRelay', { labelText: 'KS1 · SEGURANÇA (EMERG.)' })
      ;['K1 · Y1 CIL.1', 'K2 · Y2 CIL.3', 'K3 · Y3 PRENSA', 'K4 · Y4 BRAÇO Z', 'K5 · Y5 VÁCUO', 'K6 · M1 MOTOR']
        .forEach((tag, i) => putA(`relay-${i + 1}`, 'relayFinder5534', { labelText: tag }))
      // Fila B: bornes de alimentação + réguas X2 (sensores), X3 (válvulas), X4 (motor), X5 (botões).
      let bx = -usable / 2 + 4
      const pti = sizeOf('terminalPhoenixPti6')
      const power = sizeOf('terminalSet24v')
      list.push({ ...inside('terminals-x20', 'terminalSet24v', bx + power.width / 2, railB, onRail(power.depth), { labelText: 'X20 · +24 V / 0 V / PE' }), ref: 'X20' })
      bx += power.width + 6
      for (const [strip, markers] of BENCH_FIELD_TERMINALS) {
        markers.forEach((marker, i) => list.push({
          ...inside(`terminals-${strip}-${i + 1}`, 'terminalPhoenixPti6', bx + (i + 0.5) * pti.width, railB, onRail(pti.depth),
            { markerText: marker, labelText: `${strip}.${i + 1} · ${marker}` }),
          ref: `${strip}.${i + 1}`,
        }))
        bx += markers.length * pti.width + 6
      }
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
  // Ambiente fabril: a mesa fica no centro da nave, à frente do QGD de parede.
  // - compressor no chão, encostado à parede, à esquerda do QGD;
  // - esteira aérea a 2,2 m: sobe do topo do QGD, corre ao longo da parede até ao compressor
  //   e segue num ramal (apoiado num pilar HEB) até à traseira da mesa;
  // - cabos da maquete e do compressor e o tubo de ar filaçados nas esteiras;
  // - FRL com manómetro no pé traseiro esquerdo da mesa (entrada de ar).
  // ---------------------------------------------------------------------------
  const legMm = plate.legHeightMm === 'auto' ? 750 : plate.legHeightMm
  const floor = -top - legMm
  const wallZ = env?.wallZmm ?? -plate.widthMm / 2 - 1200
  const panelX = env?.panelXmm ?? 0
  const panelTop = env?.panelTopMm ?? floor + 1460
  const trayBottom = Math.max(floor + 2215, panelTop + 220)
  const trayY = trayBottom + 35 // centro da esteira (abas de 60 mm + fundo)
  const comp = pneumaticComponentSizeMm('airCompressor')!
  const frl = pneumaticComponentSizeMm('pneumaticFrl')!
  const compX = panelX - 400 - 250 - comp.x / 2
  const compDropX = compX - comp.x / 2 - 60
  const wallTrayZ = wallZ + 160
  const branch = { from: wallTrayZ + 100, to: -plate.widthMm / 2 }
  // Cabos e tubos dentro de cada esteira (lidos pelo desenho 3D da esteira, com abraçadeiras).
  const BENCH_CABLE = { kind: 'cable', color: '#9ca3af', diameterMm: 11, label: 'H07RN-F 3G2,5 · MAQUETE' }
  const COMP_CABLE = { kind: 'cable', color: '#1f2937', diameterMm: 10, label: 'H07RN-F 3G2,5 · COMPRESSOR' }
  const AIR_TUBE = { kind: 'tube', color: '#2563eb', diameterMm: 10, label: 'PU Ø10 · AR COMPRIMIDO' }
  const laced = (cables: object[]) => ({ cables, tieEveryMm: 250 })

  list.push({
    key: 'compressor', type: 'airCompressor', x: compX, y: floor + comp.y / 2, z: wallZ + 40 + comp.z / 2,
    state: { labelText: 'COMPRESSOR · AR COMPRIMIDO' },
  })
  list.push({
    key: 'airTreatment', type: 'pneumaticFrl', x: -plate.lengthMm / 2 - frl.x / 2 - 2, y: -top - 30 - frl.y / 2, z: -plate.widthMm / 2 + 60,
    state: { labelText: 'FRL · ENTRADA DE AR' },
  })
  // Subida do topo do QGD até à esteira aérea (cabos da maquete e do compressor).
  const riser = trayBottom - panelTop
  if (riser >= 300) list.push({
    key: 'tray-riser-qgd', type: 'cableTrayStraight', x: panelX, y: panelTop + riser / 2, z: wallTrayZ,
    state: { lengthMm: Math.round(riser), widthMm: 200, sideHeightMm: 60, withCover: false, labelText: 'QGD → ESTEIRA', ...laced([BENCH_CABLE, COMP_CABLE]) },
    orientation: { x: 0, y: 0, z: 90 },
  })
  list.push({
    key: 'tray-wall', type: 'cableTrayStraight', x: (compDropX - 50 + panelX + 150) / 2, y: trayY, z: wallTrayZ,
    state: { lengthMm: Math.round(panelX + 150 - (compDropX - 50)), widthMm: 200, sideHeightMm: 60, withCover: false, labelText: 'ESTEIRA AÉREA · PAREDE', ...laced([BENCH_CABLE, COMP_CABLE, AIR_TUBE]) },
  })
  list.push({
    key: 'tray-to-bench', type: 'cableTrayStraight', x: 0, y: trayY, z: (branch.from + branch.to) / 2,
    state: { lengthMm: Math.round(branch.to - branch.from), widthMm: 150, sideHeightMm: 60, withCover: false, labelText: 'QGD → BANCADA', ...laced([BENCH_CABLE, AIR_TUBE]) },
    orientation: { x: 0, y: 90, z: 0 },
  })
  list.push({
    key: 'pillar-bench', type: 'industrialPillar', x: 0, y: floor + (trayBottom - floor) / 2, z: (branch.from + branch.to) / 2 - 45,
    state: { heightMm: Math.round(trayBottom - floor), profile: 'HEB200', finish: 'safetyYellow' },
  })
  const benchDrop = trayBottom - top
  list.push({
    key: 'tray-drop-bench', type: 'cableTrayStraight', x: 0, y: top + benchDrop / 2, z: -plate.widthMm / 2 - 55,
    state: { lengthMm: Math.round(benchDrop), widthMm: 100, sideHeightMm: 60, withCover: false, labelText: 'DESCIDA BANCADA', ...laced([BENCH_CABLE, AIR_TUBE]) },
    orientation: { x: 0, y: 0, z: 90 },
  })
  const compDropBottom = floor + comp.y * 0.55
  list.push({
    key: 'tray-drop-compressor', type: 'cableTrayStraight', x: compDropX, y: (trayBottom + compDropBottom) / 2, z: wallTrayZ,
    state: { lengthMm: Math.round(trayBottom - compDropBottom), widthMm: 100, sideHeightMm: 60, withCover: false, labelText: 'DESCIDA COMPRESSOR', ...laced([COMP_CABLE, AIR_TUBE]) },
    orientation: { x: 0, y: 0, z: 90 },
  })

  // A orientação é construtiva nesta montagem; deve sobreviver à reabertura do ficheiro.
  return list.map(part => ({ ...part, state: { ...part.state, benchAssembly: true } }))
}
