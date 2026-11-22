/**
 * Mecatrónica didática — Maquete de estampagem e transferência eletropneumática.
 *
 * Componentes paramétricos a partir do relatório técnico da bancada (cotas ESTIMADAS por
 * proporção fotográfica, escala 1:1). Sem fabricante nem referência comercial inventados:
 * a identificação é sempre «DC-Simu Mecatrónica» + a cota do relatório.
 * Todas as dimensões em mm; o 3D converte com PANEL_UNITS_PER_MM (1 u = 100 mm).
 */

export const MECHATRONICS_TYPES = [
  'mecSlotPlate',
  'mecAluProfile',
  'mecGravityMagazine',
  'mecWorkpiece',
  'mecDischargeRamp',
  'mecStampingTable',
  'mecStampingPress',
  'mecFeederCylinder',
  'mecRotaryArm',
  'mecDcGearmotor',
  'mecMicroSwitchRoller',
  'mecVacuumEjector',
  'mecDragChain',
  'mecSupportBlock',
] as const

export type MechatronicsComponentType = typeof MECHATRONICS_TYPES[number]

const TYPE_SET = new Set<string>(MECHATRONICS_TYPES)
export function isMechatronicsType(type: string): type is MechatronicsComponentType {
  return TYPE_SET.has(type)
}

export type WorkpieceMaterial = 'aluminio' | 'branco' | 'preto'
export const WORKPIECE_MATERIALS: Array<{ id: WorkpieceMaterial; label: string; metallic: boolean }> = [
  { id: 'aluminio', label: 'Alumínio (metálico)', metallic: true },
  { id: 'branco', label: 'Polímero branco', metallic: false },
  { id: 'preto', label: 'Polímero escuro', metallic: false },
]
export const workpieceMaterialOf = (value: unknown): WorkpieceMaterial =>
  value === 'branco' || value === 'preto' ? value : 'aluminio'

/* ------------------------------------------------------------ cotas do relatório */

export const MEC_DIMS = {
  slotPlate: { lengthMm: 700, widthMm: 500, thicknessMm: 20, slotPitchMm: 25 },
  workpiece: { diameterMm: 40, heightMm: 35 },
  // Base 170 × 80: tubo a −40 mm do centro e zona de recolha a +40 mm (curso do Cilindro 1 = 80 mm).
  magazine: { outerMm: 50, heightMm: 260, wallMm: 3, liftMm: 45, slotW: 20, slotH: 85, baseLengthMm: 170, baseDepthMm: 80, tubeOffsetMm: -40, pickupOffsetMm: 40 },
  feeder: { boreMm: 20, strokeMm: 80, bodyMm: 118 },
  rotaryArm: { discDiameterMm: 140, discThicknessMm: 15, towerMm: 160, armLengthMm: 240, cupDiameterMm: 25, sweepMm: 440 },
  gearmotor: { motorDiameterMm: 36, motorLengthMm: 95, encoderDiameterMm: 30, pinionDiameterMm: 30, wheelDiameterMm: 60, ratio: 2 },
  // Cilindro montado por cima da travessa (haste atravessa-a); o prato recolhido fica 46 mm abaixo dela.
  press: { gantryHeightMm: 300, gantryWidthMm: 170, profileMm: 30, boreMm: 32, strokeMm: 50, plateDiameterMm: 65, bodyMm: 110, plateDropMm: 46, totalHeightMm: 420 },
  table: { lengthMm: 120, depthMm: 80, heightMm: 45, recessDiameterMm: 42 },
  ramp: { lengthMm: 220, widthMm: 50, flangeMm: 20, slopeDeg: 15 },
  microSwitch: { bodyMm: 28, leverMm: 30 },
  ejector: { bodyMm: 52, silencerMm: 30 },
  dragChain: { widthMm: 26, linkHeightMm: 17, bendRadiusMm: 38 },
  supportBlock: { lengthMm: 120, heightMm: 100, depthMm: 80 },
} as const

/**
 * Cinemática do manipulador (mm, a partir da base do componente): eixo da articulação, alcance
 * da ventosa e descida. Todas as estações (recolha, gaveta da prensa) ficam com o topo da peça
 * à mesma cota `ARM_STATION_TOP_MM`, como na bancada (blocos maquinados de elevação).
 */
export const ARM_PIVOT_MM = 12 + 16 + 15 + 160 + 6
export const ARM_TILT_RAD = 0.09
export const ARM_TIP_MM = 205
export const ARM_CUP_STEM_MM = 4
/** Fundo da ventosa com o braço em cima (mm acima da base do manipulador). */
export const ARM_CUP_UP_MM = ARM_PIVOT_MM + 2 - ARM_CUP_STEM_MM - 17
export const ARM_STATION_TOP_MM = Math.round(ARM_CUP_UP_MM - ARM_TIP_MM * Math.sin(ARM_TILT_RAD))

const clampNum = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

export function slotPlateDimsOf(state?: Record<string, any>) {
  return {
    lengthMm: clampNum(state?.lengthMm, 200, 1600, MEC_DIMS.slotPlate.lengthMm),
    widthMm: clampNum(state?.widthMm, 100, 1000, MEC_DIMS.slotPlate.widthMm),
    thicknessMm: MEC_DIMS.slotPlate.thicknessMm,
    slotPitchMm: MEC_DIMS.slotPlate.slotPitchMm,
  }
}

export function aluProfileDimsOf(state?: Record<string, any>) {
  const sectionMm = Number(state?.sectionMm) === 40 ? 40 : 30
  return {
    sectionMm,
    lengthMm: clampNum(state?.lengthMm, 40, 2000, 300),
    vertical: state?.orientation !== 'horizontal',
    endCaps: state?.endCaps !== false,
    brackets: state?.brackets !== false,
  }
}

/** Altura do pilar traseiro de cada rampa (relatório: 110, 95 e 80 mm). */
export const RAMP_PILLAR_OPTIONS = [110, 95, 80] as const
export function rampDimsOf(state?: Record<string, any>) {
  const pillarMm = clampNum(state?.pillarMm, 40, 200, 110)
  const slope = (MEC_DIMS.ramp.slopeDeg * Math.PI) / 180
  return { ...MEC_DIMS.ramp, pillarMm, slope, runMm: MEC_DIMS.ramp.lengthMm * Math.cos(slope), riseMm: MEC_DIMS.ramp.lengthMm * Math.sin(slope) }
}

export function supportBlockDimsOf(state?: Record<string, any>) {
  const b = MEC_DIMS.supportBlock
  return {
    lengthMm: clampNum(state?.lengthMm, 20, 800, b.lengthMm),
    heightMm: clampNum(state?.heightMm, 10, 400, b.heightMm),
    depthMm: clampNum(state?.depthMm, 20, 500, b.depthMm),
  }
}

export function dragChainDimsOf(state?: Record<string, any>) {
  return { ...MEC_DIMS.dragChain, lengthMm: clampNum(state?.lengthMm, 120, 1200, 320) }
}

export const MAGAZINE_CAPACITY = 6

/** Volume (mm) de cada peça — o pivô 3D é o centro deste volume. */
export function mechatronicsSizeMm(type: string, state?: Record<string, any>): { x: number; y: number; z: number } | null {
  switch (type) {
    case 'mecSlotPlate': {
      const d = slotPlateDimsOf(state)
      return { x: d.lengthMm, y: d.thicknessMm, z: d.widthMm }
    }
    case 'mecAluProfile': {
      const d = aluProfileDimsOf(state)
      return d.vertical ? { x: d.sectionMm, y: d.lengthMm, z: d.sectionMm } : { x: d.lengthMm, y: d.sectionMm, z: d.sectionMm }
    }
    case 'mecGravityMagazine': {
      const m = MEC_DIMS.magazine
      return { x: m.baseLengthMm, y: m.liftMm + m.heightMm, z: m.baseDepthMm }
    }
    case 'mecWorkpiece':
      return { x: MEC_DIMS.workpiece.diameterMm, y: MEC_DIMS.workpiece.heightMm, z: MEC_DIMS.workpiece.diameterMm }
    case 'mecDischargeRamp': {
      const r = rampDimsOf(state)
      return { x: Math.round(r.runMm + 16), y: Math.round(r.pillarMm + r.flangeMm + 6), z: r.widthMm + 8 }
    }
    case 'mecStampingTable':
      return { x: MEC_DIMS.table.lengthMm, y: MEC_DIMS.table.heightMm, z: MEC_DIMS.table.depthMm }
    case 'mecStampingPress': {
      const p = MEC_DIMS.press
      return { x: p.gantryWidthMm, y: p.totalHeightMm, z: 110 }
    }
    case 'mecSupportBlock': {
      const d = supportBlockDimsOf(state)
      return { x: d.lengthMm, y: d.heightMm, z: d.depthMm }
    }
    case 'mecFeederCylinder':
      return { x: 236, y: 46, z: 42 }
    case 'mecRotaryArm': {
      const a = MEC_DIMS.rotaryArm
      return { x: a.sweepMm, y: 205, z: a.sweepMm }
    }
    case 'mecDcGearmotor':
      return { x: 212, y: 62, z: 56 }
    case 'mecMicroSwitchRoller':
      return { x: 46, y: 32, z: 18 }
    case 'mecVacuumEjector':
      return { x: 96, y: 28, z: 22 }
    case 'mecDragChain': {
      const d = dragChainDimsOf(state)
      return { x: d.lengthMm + d.bendRadiusMm + d.linkHeightMm, y: d.bendRadiusMm * 2 + d.linkHeightMm, z: d.widthMm + 6 }
    }
    default:
      return null
  }
}

/* --------------------------------------------------------- simulação (pura) */

/** Ângulo normalizado em [0, 360). */
export const wrapDeg = (deg: number) => ((deg % 360) + 360) % 360

/**
 * Direção (no plano XZ) da ventosa para um ângulo do manipulador: 0° = frente (+Z, recolha),
 * 90° = esquerda (−X), 180° = trás (−Z, prensa), 270° = direita (+X, rampas). Rotação horária vista de cima.
 */
export const armDirection = (angleDeg: number) => {
  const a = (angleDeg * Math.PI) / 180
  return { x: -Math.sin(a), z: Math.cos(a) }
}
/** Raio da ventosa ao eixo da torre (mm). */
export const ARM_REACH_MM = Math.round(205 * Math.cos(0.09))

/** Sensor de referência do manipulador: ativo numa janela de ±4° em torno de 0°. */
export const armAtHome = (angleDeg: number) => {
  const a = wrapDeg(angleDeg)
  return a <= 4 || a >= 356
}

/** Velocidade de saída do motorredutor (rpm) e rotação do braço após o par cónico 2:1. */
export const GEARMOTOR_OUTPUT_RPM = 30
export const armDegPerSecond = (motorRpm = GEARMOTOR_OUTPUT_RPM) => (motorRpm * 6) / MEC_DIMS.gearmotor.ratio

/** Encoder incremental simplificado para o tempo de simulação: 24 impulsos/volta do veio do motor. */
export const ENCODER_SIM_PPR = 24
export function encoderPhases(motorAngleDeg: number) {
  const step = 360 / ENCODER_SIM_PPR
  const quarter = Math.floor(motorAngleDeg / (step / 4))
  const q = ((quarter % 4) + 4) % 4
  return { a: q === 1 || q === 2, b: q === 2 || q === 3, count: Math.floor(motorAngleDeg / step) }
}

/** Reed magnético: ativo nos últimos/primeiros 8 % do curso. */
export const reedRetracted = (positionPct: number) => positionPct <= 8
export const reedExtended = (positionPct: number) => positionPct >= 92

export interface MechatronicsInfo {
  name: string
  model: string
  summary: string
}

/** Identificação no inspetor/biblioteca: cotas do relatório (estimadas), sem fabricante atribuído. */
export const MECHATRONICS_INFO: Record<MechatronicsComponentType, MechatronicsInfo> = {
  mecSlotPlate: { name: 'Base ranhurada em alumínio', model: '700 × 500 × 20 mm · ranhuras T passo 25', summary: 'Placa de alumínio extrudido com 20 ranhuras em T longitudinais para fixação modular.' },
  mecAluProfile: { name: 'Perfil de alumínio ranhurado', model: '30 × 30 / 40 × 40 mm · tampas + cantoneiras', summary: 'Perfil estrutural com ranhuras em T, tampas de topo em plástico e cantoneiras de fixação.' },
  mecGravityMagazine: { name: 'Magazine vertical de alimentação', model: '50 × 50 × 260 mm · parede 3 mm', summary: 'Tubo quadrado maquinado com 2 rasgos frontais 20 × 85 mm, elevado 45 mm sobre base fresada com zona de recolha.' },
  mecWorkpiece: { name: 'Peça de trabalho (tarugo)', model: 'Ø40 × 35 mm', summary: 'Cilindro maciço de ensaio: alumínio, polímero branco ou polímero escuro.' },
  mecDischargeRamp: { name: 'Rampa de descarga', model: '220 × 50 mm · abas 20 mm · 15°', summary: 'Calha inclinada em chapa de alumínio dobrada sobre pilar traseiro (110, 95 ou 80 mm).' },
  mecStampingTable: { name: 'Gaveta / mesa de estampagem', model: '120 × 80 × 45 mm · rebaixo Ø42', summary: 'Bloco maquinado com alojamento de centragem da peça sob o prato da prensa.' },
  mecStampingPress: { name: 'Prensa pneumática de estampagem', model: 'Pórtico 300 mm · cilindro Ø32 × 50 · prato Ø65', summary: 'Cilindro vertical de dupla ação sobre a travessa de um pórtico de perfil 30 × 30, haste com prato circular, manómetro e sensores magnéticos SUP/INF.' },
  mecFeederCylinder: { name: 'Cilindro de alimentação (Cilindro 1)', model: 'Ø20 × 80 mm · dupla ação', summary: 'Cilindro horizontal com empurrador e sensores magnéticos de recuo/avanço na base do magazine.' },
  mecRotaryArm: { name: 'Manipulador rotativo com ventosa', model: 'Disco Ø140 · torre 160 · braço 240 · ventosa Ø25', summary: 'Base rotativa com roda cónica Ø60, braço aligeirado articulado, elevação pneumática, ventosa de fole e sensor de referência 0°.' },
  mecDcGearmotor: { name: 'Motorredutor DC M1 com encoder', model: 'Motor Ø36 × 95 · pinhão cónico Ø30 · encoder Ø30', summary: 'Motor de corrente contínua com redutor, pinhão cónico 2:1, encoder incremental A/B e entradas de sentido horário/anti-horário.' },
  mecMicroSwitchRoller: { name: 'Microinterruptor de rolete (FC 1)', model: 'Contacto comutado C / NA / NF', summary: 'Microinterruptor com alavanca e rolete na lateral da gaveta de receção.' },
  mecVacuumEjector: { name: 'Gerador de vácuo Venturi', model: 'Ejetor com silenciador · Push-In', summary: 'Ejetor Venturi: ar comprimido em P produz vácuo na porta V da ventosa.' },
  mecSupportBlock: { name: 'Suporte / bloco maquinado de elevação', model: 'Alumínio fresado · cotas parametrizáveis', summary: 'Bloco de elevação para o magazine, a mesa de receção e a gaveta da prensa, fixo à base por parafusos e porcas T.' },
  mecDragChain: { name: 'Esteira porta-cabos articulada', model: 'Elos 26 × 17 mm · raio 38 mm', summary: 'Corrente porta-cabos em poliamida para a cablagem do manipulador até ao PLC.' },
}
