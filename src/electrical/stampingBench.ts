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

/**
 * Réguas de bornes do QE1 segundo o relatório Ex10 (S7-300 · DI 32 / DO 32, guião fig. 16–18):
 * X21 = entradas I0.0…I1.7, X22 = saídas Q0.0…Q1.5, X23 = motor M1, X24 = botões sem entrada
 * no autómato, X25 / X26 = distribuição +24 V / 0 V dos sensores (calha A, por cima dos relés).
 * `marker` vai na plaqueta do borne; `tag` é a variável do programa.
 */
export interface BenchTerminalStrip {
  strip: string
  rail: 'A' | 'B'
  points: ReadonlyArray<{ marker: string; tag: string }>
}
const io = (marker: string, tag: string) => ({ marker, tag })
/**
 * Réguas de campo do QE1 com os endereços do GUIAO ATEC 1185 (relatório Ex10).
 *
 * A versão anterior usava a numeração sequencial Q0.x/Q1.x, que não é a do guião (o SM322 da
 * ilha está endereçado em Q4.0…Q5.6). Aqui cada marcador é o endereço real que aparece no GRAFCET
 * e no borne do módulo: I0.0…I1.7 em X21, Q4.0…Q5.6 em X22, motor em X23 e reservas em X24.
 */
export const BENCH_TERMINAL_STRIPS: ReadonlyArray<BenchTerminalStrip> = [
  { strip: 'X21', rail: 'B', points: [
    io('I0.0', 'C1_Recuado'), io('I0.1', 'C1_Avancado'), io('I0.2', 'C3_Avancado'), io('I0.3', 'C3_Recuado'),
    io('I0.4', 'C4_Recuado'), io('I0.5', 'C4_Avancado'), io('I0.6', 'Sensor_Cor'), io('I0.7', 'FC_Estampagem'),
    io('I1.0', 'FC_Alimentador'), io('I1.1', 'Sensor_Metal'), io('I1.2', 'C2_Avancado'), io('I1.3', 'C2_Recuado'),
    io('I1.4', 'B_Start'), io('I1.5', 'B_Stop'), io('I1.6', 'Sel_Auto'), io('I1.7', 'Seguranca_OK'),
  ] },
  { strip: 'X22', rail: 'B', points: [
    // Endereços do guião (Q4.x/Q5.x) ligados às bobinas REAIS do CPV10 da maquete:
    // estação 1 = Cil1 (Y0/Y1) · estação 2 = Cil2 (Y2/Y3) · estação 3 = Cil3 (Y4/Y5) ·
    // estação 4 = Cil4 monoestável (Y6) · estação 5 = ventosa (VON/VOFF).
    io('Q4.0', 'Cil1_Avanc'), io('Q4.1', 'Cil1_Recuo'), io('Q4.2', 'Cil2_Recuo'), io('Q4.3', 'reserva'),
    io('Q4.4', 'Cil2_Avanc'), io('Q4.5', 'Ventosa_On'), io('Q4.6', 'Ventosa_Off'), io('Q4.7', 'Cil3_Recuo'),
    io('Q5.0', 'Cil3_Avanc'), io('Q5.1', 'Cil4_Estampa'), io('Q5.2', 'K1_M1_Esq'), io('Q5.3', 'K2_M1_Dir'),
    io('Q5.4', 'LED_Amarelo'), io('Q5.5', 'LED_Verde'), io('Q5.6', 'LED_Vermelho'),
  ] },
  { strip: 'X23', rail: 'B', points: [io('M+', 'M1 +'), io('M-', 'M1 -'), io('ENC A', 'ENC A'), io('ENC B', 'ENC B')] },
  { strip: 'X24', rail: 'B', points: [io('REARME', 'S6 rearme'), io('CICLO', 'reserva')] },
  { strip: 'X25', rail: 'A', points: Array.from({ length: 7 }, () => io('+24V', '+24 V sensores')) },
  { strip: 'X26', rail: 'A', points: Array.from({ length: 3 }, () => io('0V', '0 V sensores')) },
]
/** Compatibilidade: [régua, marcadores] por ordem de montagem. */
export const BENCH_FIELD_TERMINALS: ReadonlyArray<readonly [string, readonly string[]]> =
  BENCH_TERMINAL_STRIPS.map((s) => [s.strip, s.points.map((p) => p.marker)] as const)

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
    { key: 'fc1', type: 'mecMicroSwitchRoller', x: pickup.x + 5, y: top + magRiser.heightMm + 8 + FC_ABOVE_SEAT_MM, z: pickup.z + FC_FROM_POCKET_MM - 10, state: { actuation: 'feeder', labelText: 'FC 1' }, orientation: { x: 0, y: -90, z: 0 } },
    { key: 'inductiveSensor', type: 'mecInductiveSensor', x: pickup.x, y: top + ARM_STATION_TOP_MM - piece.heightMm / 2, z: pickup.z - 45, state: { actuation: 'feeder', labelText: 'S. INDUTIVO' }, orientation: { x: 90, y: 0, z: 0 } },
    { key: 'inductiveRiser', type: 'mecAluProfile', x: pickup.x, y: top + (ARM_STATION_TOP_MM - piece.heightMm / 2 - 7) / 2, z: pickup.z - 53,
      state: { sectionMm: 30, lengthMm: ARM_STATION_TOP_MM - piece.heightMm / 2 - 7, labelText: 'S. INDUTIVO' } },
    { key: 'opticalSensor', type: 'mecOpticalSensor', x: pickup.x + 72, y: top + ARM_STATION_TOP_MM - piece.heightMm / 2 - 18, z: pickup.z, state: { actuation: 'feeder', labelText: 'S. OTICO', facing: 'x-' } },
    { key: 'opticalRiser', type: 'mecAluProfile', x: pickup.x + 89, y: top + (ARM_STATION_TOP_MM - piece.heightMm / 2 - 56) / 2, z: pickup.z,
      state: { sectionMm: 30, lengthMm: ARM_STATION_TOP_MM - piece.heightMm / 2 - 56, orientation: 'vertical', endCaps: false } },

    // Manipulador rotativo BR1 (Cilindro 2 · B6/B7) + Motorredutor M1 com par cónico e encoder RT3806
    // Batentes 180°–360°: recolha → rampas → gaveta sem passar pelo lado do alimentador e da prensa.
    { key: 'arm', type: 'mecRotaryArm', x: A.x, y: top + h('mecRotaryArm') / 2, z: A.z, state: { rotationStops: [180, 360] } },
    { key: 'motor', type: 'mecDcGearmotor', x: A.x - MEC_DIMS.gearmotor.wheelDiameterMm / 2 - mechatronicsSizeMm('mecDcGearmotor')!.x / 2 + 6, y: top + h('mecDcGearmotor') / 2, z: A.z, orientation: { x: 0, y: 90, z: 0 } },

    // Estação de estampagem, orientada como o alimentador (movimento em X):
    // o braço deposita na gaveta FC 2 a 180°; o Cilindro 3 (à direita, haste para −X) empurra a gaveta
    // por baixo do pórtico do Cilindro 4 (B3/B4), cujas colunas ficam à frente e atrás da guia.
    // B2 (recuado) = gaveta no depósito · B1 (avançado) = gaveta sob o prato.
    { key: 'tableRiser', type: 'mecSupportBlock', x: load.x - drawerStroke / 2, y: top + tableRiser.heightMm / 2, z: load.z, state: tableRiser },
    { key: 'table', type: 'mecStampingTable', x: load.x, y: tableY, z: load.z, state: { labelText: 'FC 2', pocketShape: 'square', slideAxis: [-1, 0, 0], slideMm: 0 } },
    { key: 'fc2', type: 'mecMicroSwitchRoller', x: load.x - 5, y: top + tableTop + FC_ABOVE_SEAT_MM, z: load.z + FC_FROM_POCKET_MM + 10,
      state: { actuation: 'drawer', labelText: 'FC 2', slideAxis: [0, 0, 1], slideMm: 0 }, orientation: { x: 0, y: -90, z: 0 } },
    { key: 'press', type: 'mecStampingPress', x: pressAt.x, y: top + h('mecStampingPress') / 2, z: pressAt.z, orientation: { x: 0, y: 90, z: 0 } },
    ...(drawerCylRiser.heightMm >= 4 ? [{ key: 'drawerCylRiser', type: 'mecSupportBlock' as ComponentType, x: drawerCylX + 43, y: top + drawerCylRiser.heightMm / 2, z: load.z, state: drawerCylRiser }] : []),
    { key: 'drawerCylinder', type: 'mecDrawerCylinder', x: drawerCylX - 10, y: tableY - 4, z: load.z + 5, orientation: { x: 0, y: 90, z: 0 },
      state: { labelText: 'CILINDRO 3', sensorRecLabel: 'B2', sensorAvaLabel: 'B1' } },
    { key: 'chain', type: 'mecDragChain', x: load.x + 50, y: top + h('mecDragChain', { lengthMm: 120 }) / 2, z: load.z + 55, state: { lengthMm: 120 } },

    // Ilhas de eletroválvulas Festo 2× 5/2 (C1A, C2A) e Gerador de vácuo (VAC1 · C4A) à esquerda
    // Terminal de válvulas Festo CPV10 (relatório Ex10): C1, C2, C3 biestáveis, C4 monoestável e vácuo.
    { key: 'valveTerminal', type: 'mecValveTerminalCpv10', x: -plate.lengthMm / 2 + 100, y: top + h('mecValveTerminalCpv10') / 2, z: -72, state: { labelText: 'YV1 · CPV10' } },
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
  // QE1 · quadro de campo sob a mesa, lado esquerdo (porta aberta para fora):
  // calhas técnicas, 2 calhas DIN, fonte 24 V, relé de segurança KS1 e relés de
  // interface K1–K6 e réguas de bornes. Bucins à esquerda (campo) e em cima (QGD).
  // Dobradiça à esquerda (lado de fora da mesa) → a folha roda para a esquerda, para fora da mesa,
  // sem bater nas pernas nem no tampo.
  // ---------------------------------------------------------------------------
  if (plate.legs) {
    const leg = plate.legHeightMm === 'auto' ? 750 : plate.legHeightMm
    // Três filas de aparelhos (fonte/segurança, PLC, bornes) → quadro mais alto e mais largo
    // que a versão de dois aparelhos; a calha do PLC obriga a ~120 mm de altura livre.
    const cabinetH = Math.min(660, leg - 90)
    if (cabinetH >= 420) {
      const cab = { w: 560, h: cabinetH, d: 220 }
      const cabinetY = -55 - cab.h / 2
      const cabinetZ = -plate.widthMm / 2 + 145
      // Lado esquerdo da mesa (folga ~50 mm da borda); dobradiça à esquerda → porta abre para fora.
      const cabinetX = -plate.lengthMm / 2 + cab.w / 2 + 50
      list.push({
        key: 'cabinet', type: 'panelEnclosure', x: cabinetX, y: cabinetY, z: cabinetZ,
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
      const cabLeft = cabinetX - cab.w / 2
      list.push({
        key: 'ductDrop', type: 'mecBenchDuct', x: dropX, y: (20 + cabinetY - 150) / 2, z: cabinetZ + 30,
        state: { lengthMm: Math.round(20 - cabinetY + 150), widthMm: 30, heightMm: 35, coverOn: true, labelText: 'CAMPO → QE1' },
        orientation: { x: 0, y: 0, z: 90 },
      })
      list.push({
        key: 'ductUnder', type: 'mecBenchDuct', x: (dropX + cabLeft) / 2, y: cabinetY - 150, z: cabinetZ + 30,
        state: { lengthMm: Math.round(Math.abs(cabLeft - dropX)), widthMm: 30, heightMm: 35, coverOn: true, labelText: 'CAMPO' },
      })
      // Placa de montagem: a 14 mm da traseira; calha DIN 7,5 mm; aparelhos encostados à calha.
      const plateFront = cabinetZ - cab.d / 2 + 14
      const onRail = (depthMm: number) => plateFront + 7.5 + depthMm / 2
      // `x` relativo ao centro do quadro → convertido para coordenadas da base.
      const inside = (key: string, type: ComponentType, x: number, y: number, z: number, state: Record<string, unknown> = {}): BenchPlacement =>
        ({ key, type, x: cabinetX + x, y: cabinetY + y, z, state: { hostLocation: 'machine', ...state } })
      const usable = cab.w - 40
      // Fila A (topo): fonte + segurança + K1/K2 · Fila B (meio): réguas de bornes ·
      // Fila C (fundo): ilha S7-300 do guião (CPU + DI + DO + AI).
      //
      // Cotas tiradas do FUNDO para cima, com folgas explícitas entre o aparelho mais alto de
      // cada fila e a calha técnica seguinte (fonte 124,5 mm · bornes 66 mm · S7-300 125 mm):
      //   fundo 20 | PLC 125 | 25 | calha 60 | 25 | bornes 66 | 25 | calha 60 | 25 | fonte 124,5 | 20
      // Total ≈ 576 mm — cabe nos 620 mm do quadro standard da bancada.
      const GAP = 25
      const DUCT = 60
      const HALF_PSU = 7.5 + 124.5 / 2
      const bottom = -cab.h / 2
      const railC = bottom + GAP + 30 + 125 / 2
      const ductBC = railC + 125 / 2 + GAP + DUCT / 2
      const railB = ductBC + DUCT / 2 + GAP + 66 / 2
      const ductAB = railB + 66 / 2 + GAP + DUCT / 2
      const railA = ductAB + DUCT / 2 + GAP + HALF_PSU
      // Calhas técnicas 40 × 60, uma por faixa entre filas (por aqui passa a cablagem interior).
      const ductUsable = usable - 30
      for (const [key, y] of [
        ['top', Math.min(cab.h / 2 - 30, railA + HALF_PSU + 30)],
        ['midAB', ductAB],
        ['midBC', ductBC],
        ['bottom', railC - 125 / 2 - GAP - 17],
      ] as const) {
        list.push(inside(`cabinet-duct-${key}`, 'cableDuct', 0, y, plateFront + 30, { lengthMm: ductUsable, widthMm: 40, heightMm: DUCT, coverOn: true }))
      }
      for (const [key, y] of [['relays', railA], ['terminals', railB], ['plc', railC]] as const) {
        list.push(inside(`cabinet-din-${key}`, 'dinRail15x55', 0, y, plateFront + 3.75, { lengthMm: usable, profile: '35×15 mm', perforated: true, finish: 'Aço galvanizado' }))
      }
      // Fila A: fonte 24 V azul do catálogo · relé de segurança KS1 · relés K1/K2 do motor M1.
      // (O guião 1185 comanda o M1 por K1/K2 em Q5.2/Q5.3.)
      const sizeOf = (type: ComponentType) => COMPONENT_PHYSICAL_SIZE_MM[type]!
      let ax = -usable / 2 + 4
      const putA = (key: string, type: ComponentType, state: Record<string, unknown>) => {
        const s = sizeOf(type)
        list.push(inside(key, type, ax + s.width / 2, railA, onRail(s.depth), state))
        ax += s.width + 2
      }
      putA('psu24', 'powerSupplyProauto24A', { labelText: 'G1 · 24 V DC 5 A · azul' })
      putA('safetyRelay', 'safetyRelay', { labelText: 'KS1 · SEGURANÇA (EMERG.)' })
      ;['K1 · Q5.2 M1_ESQ', 'K2 · Q5.3 M1_DIR']
        .forEach((tag, i) => putA(`relay-${i + 1}`, 'relayFinder5534', { labelText: tag }))
      // Fila B: X20 (alimentação 24 V) + X21 (DI) + X22 (DO) + X23 (motor) + X24 (reservas).
      let bx = -usable / 2 + 4
      const pti = sizeOf('terminalPhoenixPti6')
      const power = sizeOf('terminalSet24v')
      list.push({ ...inside('terminals-x20', 'terminalSet24v', bx + power.width / 2, railB, onRail(power.depth), { labelText: 'X20 · +24 V / 0 V / PE' }), ref: 'X20' })
      bx += power.width + 6
      ax += 4
      for (const { strip, rail, points } of BENCH_TERMINAL_STRIPS) {
        const y = rail === 'A' ? railA : railB
        const start = rail === 'A' ? ax : bx
        points.forEach(({ marker, tag }, i) => list.push({
          ...inside(`terminals-${strip}-${i + 1}`, 'terminalPhoenixPti6', start + (i + 0.5) * pti.width, y, onRail(pti.depth),
            // X25 é +24 V e X26 é 0 V: a régua sabe-o pelo marcador, e os bornes têm de nascer com o
            // `kind` certo para o verificador de ligações aceitar os condutores de alimentação neles.
            { markerText: marker, labelText: `${strip}.${i + 1} · ${marker} · ${tag}`, rail: strip }),
          ref: `${strip}.${i + 1}`,
        }))
        if (rail === 'A') ax += points.length * pti.width + 6
        else bx += points.length * pti.width + 6
      }
      // Fila C: ilha Siemens S7-300 do guião ATEC 1185 (relatório Ex10), encostada como numa
      // calha real: CPU 315-2 PN/DP + SM321 DI 32 + SM322 DO 32 + SM334 AI/AO.
      // 4 × 40 mm + folgas = ~164 mm; sobra calha à direita para o futuro módulo de contagem.
      const stepMm = 41.2
      const island = [
        ['plc-cpu', 'plcSiemensS7300Cpu315PnDp', 'PLC1 · CPU 315-2 PN/DP · 6ES7315-2EH14'],
        ['plc-di', 'plcSiemensS7300Sm321Di32', 'PLC1 · DI 32×24 V DC · I0.0…I3.7'],
        ['plc-do', 'plcSiemensS7300Sm322Do32', 'PLC1 · DO 32×24 V DC · Q4.0…Q7.7'],
        ['plc-ai', 'plcSiemensS7300Sm334AiAo', 'PLC1 · AI 4 / AO 2'],
      ] as const
      const islandW = island.length * stepMm - (stepMm - 40)
      const firstC = -usable / 2 + 6 + 20
      island.forEach(([key, type, label], i) => {
        const s = sizeOf(type)
        list.push(inside(`cabinet-${key}`, type, firstC + s.width / 2 + i * stepMm, railC, onRail(s.depth), { labelText: label }))
      })
      // A calha do PLC é a mais funda da caixa: o corpo de 120–130 mm chega perto da porta.
      void islandW
    }
  }

  // 3 Rampas de descarga em inox (BRANCA, PRETA, METALICA) sobre pilares de perfil 30 × 30
  // Espaçamento uniforme = 30° no arco do braço (BENCH_RAMP_ANGLES 240/270/300). Cada rampa fica
  // com a boca na vertical da ventosa no seu ângulo: deslocar em x/z (ex.: ±20 mm) tira a peça do
  // canal e a descarga por gravidade deixa de acontecer (rampBelowWorkpiece, test:mechatronics).
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
  const TRAY_SIDE_MM = 60
  const trayY = trayBottom + TRAY_SIDE_MM / 2 // centro da esteira aérea (fundo em trayBottom)
  const trayTop = trayBottom + TRAY_SIDE_MM
  const comp = pneumaticComponentSizeMm('airCompressor')!
  const frl = pneumaticComponentSizeMm('pneumaticFrl')!
  const compX = panelX - 400 - 250 - comp.x / 2
  const compDropX = compX - comp.x / 2 - 60
  // Esteira aérea afastada 300 mm da parede (consolas), face traseira a ~200 mm.
  const wallTrayZ = wallZ + 300
  const WALL_TRAY_W = 200
  const wallTrayNearZ = wallTrayZ - WALL_TRAY_W / 2
  // Verticais (subida do QGD, descida do compressor, descida da bancada): fundo apoiado na
  // parede/pilar sobre espaçadores de 10 mm, abertura virada para a nave (+Z), largura em X.
  // Euler XYZ {0, 90, 90}: comprimento → +Y, abas (abertura) → +Z, largura → X.
  const VERTICAL_ON_SUPPORT: ComponentViewOrientation = { x: 0, y: 90, z: 90 }
  const ALONG_Z: ComponentViewOrientation = { x: 0, y: 90, z: 0 }
  const STANDOFF_MM = 10
  const onWallZ = wallZ + STANDOFF_MM + TRAY_SIDE_MM / 2
  const branch = { from: wallTrayZ + WALL_TRAY_W / 2, to: -plate.widthMm / 2 }
  // Cabos e tubos dentro de cada esteira (lidos pelo desenho 3D da esteira, com abraçadeiras).
  // Os cabos 3G2,5 da maquete e do compressor são cabos reais (ver `stampingBenchWiring`); nas
  // esteiras fica só o tubo de ar desenhado como feixe filaçado.
  const AIR_TUBE = { kind: 'tube', color: '#2563eb', diameterMm: 10, label: 'PU Ø10 · AR COMPRIMIDO' }
  const laced = (cables: object[]) => ({ cables, tieEveryMm: 250 })
  const tray = (key: string, x: number, y: number, z: number, lengthMm: number, widthMm: number, labelText: string, cables: object[], orientation?: ComponentViewOrientation): BenchPlacement => ({
    key, type: 'cableTrayStraight', x, y, z,
    state: { lengthMm: Math.round(lengthMm), widthMm, sideHeightMm: TRAY_SIDE_MM, withCover: false, labelText, ...laced(cables) },
    ...(orientation ? { orientation } : {}),
  })
  /** Vertical apoiada (fundo na parede/pilar) de `bottomY` até ao topo das abas da esteira de cima. */
  const vertical = (key: string, x: number, z: number, bottomY: number, widthMm: number, labelText: string, cables: object[]) =>
    tray(key, x, (bottomY + trayTop) / 2, z, trayTop - bottomY, widthMm, labelText, cables, VERTICAL_ON_SUPPORT)
  /** Pescoço horizontal da parede até à esteira aérea: entra 20 mm no canal (união em T automática). */
  const neck = (key: string, x: number, widthMm: number, labelText: string, cables: object[]) => {
    const z0 = wallZ + STANDOFF_MM
    const z1 = wallTrayNearZ + 20
    return tray(key, x, trayY, (z0 + z1) / 2, z1 - z0, widthMm, labelText, cables, ALONG_Z)
  }

  list.push({
    key: 'compressor', type: 'airCompressor', x: compX, y: floor + comp.y / 2, z: wallZ + 40 + comp.z / 2,
    state: { labelText: 'COMPRESSOR · AR COMPRIMIDO' },
  })
  const frlPos = { x: -plate.lengthMm / 2 - frl.x / 2 - 2, y: -top - 30 - frl.y / 2, z: -plate.widthMm / 2 + 60 }
  list.push({
    key: 'airTreatment', type: 'pneumaticFrl', ...frlPos,
    state: { labelText: 'FRL · ENTRADA DE AR' },
  })
  // Suporte em esquadro do FRL: aba superior aparafusada por baixo do tampo (antes da travessa do
  // QE1) e chapa traseira atrás do cabeçote MS4 (centro do cabeçote 22 mm acima do centro do FRL).
  {
    const t = 3
    const headBackZ = frlPos.z - 32 // cabeçote MS4 com 64 mm de profundidade
    const standoff = 10
    const backZ = headBackZ - standoff - t
    const depth = 58
    const x0 = frlPos.x - frl.x / 2 - 8
    const x1 = -plate.lengthMm / 2 + 40
    const y1 = -top
    const y0 = frlPos.y - frl.y / 2 + 70
    const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: backZ + depth / 2 }
    list.push({
      key: 'frlBracket', type: 'pneumaticFrlBracket', ...c,
      state: {
        labelText: 'SUPORTE FRL',
        widthMm: Math.round(x1 - x0), heightMm: Math.round(y1 - y0), depthMm: depth, thicknessMm: t,
        flangeLengthMm: Math.round(x1 - (-plate.lengthMm / 2)), flangeSide: 'right', standoffMm: standoff,
        mountXmm: Math.round(frlPos.x - c.x), mountYmm: Math.round(frlPos.y + 22 - c.y),
      },
    })
  }

  // ---------------------------------------------------------------------------
  // Tomadas RoadEu 70929 (CEE 2P+T 16 A + seccionador 0-1) no fim das descidas, com folga de
  // 20 mm entre o topo da caixa e a ponta da esteira:
  //  - parede, junto ao compressor (alimentação do compressor);
  //  - face do pilar IPE100 virada à mesa (alimentação da maquete).
  // Centro a ~1,10 m do chão; costas no mesmo plano do fundo da esteira.
  // ---------------------------------------------------------------------------
  const socketH = 115 // mm · altura da caixa RoadEu 70929
  const socketD = 112 // mm · profundidade total (caseDepth 75 + saliências)
  const SOCKET_GAP_MM = 20
  const socketY = floor + 1100
  const pillarZ = -plate.widthMm / 2 - 125
  const pillarFaceZ = pillarZ + 50
  const socketBenchY = Math.max(socketY, top + socketH / 2 + 40)

  // Subida do topo do QGD, apoiada na parede, e pescoço até à esteira aérea.
  const QGD_CABLES: object[] = []
  if (trayBottom - panelTop >= 300) {
    list.push(vertical('tray-riser-qgd', panelX, onWallZ, panelTop, WALL_TRAY_W, 'QGD → ESTEIRA', QGD_CABLES))
    list.push(neck('tray-neck-qgd', panelX, WALL_TRAY_W, 'PESCOÇO QGD', QGD_CABLES))
  }
  // A aérea passa 60 mm além de cada pescoço: as uniões ficam em T (aba do lado da parede aberta).
  const wallTrayX0 = compDropX - 50 - 60
  const wallTrayX1 = panelX + WALL_TRAY_W / 2 + 60
  list.push(tray('tray-wall', (wallTrayX0 + wallTrayX1) / 2, trayY, wallTrayZ, wallTrayX1 - wallTrayX0, WALL_TRAY_W,
    'ESTEIRA AÉREA · PAREDE', [AIR_TUBE]))
  list.push(tray('tray-to-bench', 0, trayY, (branch.from + branch.to) / 2, branch.to - branch.from, 150, 'QGD → BANCADA', [AIR_TUBE], ALONG_Z))
  list.push({
    key: 'pillar-bench', type: 'industrialPillar', x: 0, y: floor + (trayBottom - floor) / 2, z: pillarZ,
    state: { heightMm: Math.round(trayBottom - floor), profile: 'IPE100', finish: 'safetyYellow' },
  })
  // Descida da bancada: fundo na face do pilar, termina 20 mm acima da tomada da maquete.
  list.push(vertical('tray-drop-bench', 0, pillarFaceZ + 2 + TRAY_SIDE_MM / 2, socketBenchY + socketH / 2 + SOCKET_GAP_MM, 100,
    'DESCIDA BANCADA', [AIR_TUBE]))
  // Descida do compressor: fundo na parede, pescoço até à ponta da esteira aérea, termina 20 mm acima da tomada.
  list.push(neck('tray-neck-compressor', compDropX, 100, 'PESCOÇO COMPRESSOR', [AIR_TUBE]))
  list.push(vertical('tray-drop-compressor', compDropX, onWallZ, socketY + socketH / 2 + SOCKET_GAP_MM, 100,
    'DESCIDA COMPRESSOR', [AIR_TUBE]))

  list.push({
    key: 'socket-compressor',
    type: 'socketFamatelSwitch',
    x: compDropX,
    y: socketY,
    z: wallZ + STANDOFF_MM + socketD / 2,
    state: { switchOn: true, coverOpen: false, labelText: 'TOMADA · COMPRESSOR · RoadEu 70929' },
    ref: 'XS-COMP',
  })
  // Ficha CEE encaixada na tomada do compressor (cabo revestido arrastável até ao motor).
  list.push({
    key: 'plug-compressor',
    type: 'ceePlug16A',
    x: compDropX,
    y: socketY,
    z: wallZ + STANDOFF_MM + socketD + 28,
    state: { labelText: 'FICHA CEE · COMPRESSOR', glandVisible: true },
    ref: 'F-COMP',
  })
  list.push({
    key: 'socket-bench',
    type: 'socketFamatelSwitch',
    x: 0,
    y: socketBenchY,
    z: pillarFaceZ + 2 + socketD / 2,
    state: { switchOn: true, coverOpen: false, labelText: 'TOMADA · MAQUETE · RoadEu 70929' },
    ref: 'XS-MAQ',
  })
  // Ficha CEE na tomada da maquete; lado do quadro = fios L/N/PE aos bornes.
  list.push({
    key: 'plug-bench',
    type: 'ceePlug16A',
    x: 0,
    y: socketBenchY,
    z: pillarFaceZ + 2 + socketD + 28,
    state: { labelText: 'FICHA CEE · MAQUETE / QE', glandVisible: true },
    ref: 'F-MAQ',
  })

  // A orientação é construtiva nesta montagem; deve sobreviver à reabertura do ficheiro.
  return list.map(part => ({ ...part, state: { ...part.state, benchAssembly: true } }))
}
