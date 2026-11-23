/**
 * Mecatrónica didática — Maquete de estampagem e transferência eletropneumática (ATEC / Guião 1185).
 *
 * Componentes paramétricos a partir do relatório técnico e levantamento fotográfico da bancada
 * (cotas em escala 1:1). Todas as dimensões em mm; o 3D converte com PANEL_UNITS_PER_MM (1 u = 100 mm).
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
  'mecDrawerCylinder',
  'mecValveIsland',
  'mecValveTerminalCpv10',
  'mecOpticalSensor',
  'mecInductiveSensor',
  'mecHmiKtp700',
  'mecOperatorBox',
  'mecSignalTower',
  'mecBenchDuct',
  'mecHz20VacuumCylinder',
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
  drawerCylinder: { boreMm: 20, strokeMm: 75, bodyMm: 112 },
  rotaryArm: { discDiameterMm: 140, discThicknessMm: 15, pedestalMm: 60, towerMm: 100, armLengthMm: 240, cupDiameterMm: 25, sweepMm: 440, cylinderBoreMm: 16, cylinderBodyMm: 32, cylinderStrokeMm: 18 },
  gearmotor: { motorDiameterMm: 36, motorLengthMm: 95, encoderDiameterMm: 38, pinionDiameterMm: 30, wheelDiameterMm: 60, ratio: 2 },
  // Curso estimado adaptado para permitir a entrada do cilindro vertical da ventosa sob o prato.
  press: { gantryHeightMm: 312, gantryWidthMm: 170, profileMm: 30, boreMm: 32, strokeMm: 94, plateDiameterMm: 65, bodyMm: 110, plateDropMm: 16, totalHeightMm: 440 },
  table: { lengthMm: 120, depthMm: 80, heightMm: 45, recessDiameterMm: 42 },
  ramp: { lengthMm: 220, widthMm: 50, flangeMm: 20, slopeDeg: 15 },
  microSwitch: { bodyMm: 28, leverMm: 30 },
  ejector: { bodyMm: 52, silencerMm: 30 },
  dragChain: { widthMm: 26, linkHeightMm: 17, bendRadiusMm: 38 },
  supportBlock: { lengthMm: 120, heightMm: 100, depthMm: 80 },
  valveIsland: { lengthMm: 92, heightMm: 44, depthMm: 56 },
  /** Terminal de válvulas Festo CPV10: 5 estações de 10 mm + placas finais + módulo elétrico. */
  valveTerminalCpv10: { lengthMm: 112, heightMm: 52, depthMm: 58 },
  opticalSensor: { lengthMm: 62, heightMm: 76, depthMm: 44, barrelDiameterMm: 18 },
  inductiveSensor: { lengthMm: 36, heightMm: 34, depthMm: 36, barrelDiameterMm: 12 },
  hmiKtp700: { widthMm: 234, heightMm: 286, depthMm: 86, bezelWidthMm: 214, bezelHeightMm: 158 },
  operatorBox: { widthMm: 168, heightMm: 116, depthMm: 94 },
  signalTower: { baseMm: 58, heightMm: 330, lensDiameterMm: 50 },
  benchDuct: { lengthMm: 700, widthMm: 35, heightMm: 45 },
  /** TECHNIK HZ20 series — cilindro guiado com ventosa (duplo ou simples efeito). Cotas base HZ20D15-15. */
  hz20: {
    bodyWidthMm: 42,
    bodyDepthMm: 42,
    bodyHeightMm: 48,
    guideRodDiameterMm: 6,
    guideRodSpacingMm: 28,
    pistonRodDiameterMm: 10,
    strokeMm: 15,
    flangeWidthMm: 48,
    flangeHeightMm: 22,
    flangeDepthMm: 36,
    cupDiameterMm: 32,
    cupHeightMm: 18,
    portThread: 'M5',
  },
} as const

/**
 * Cinemática do manipulador (mm, a partir da base do componente): braço metálico rígido,
 * cilindro vertical na extremidade e ventosa na haste. Todas as estações ficam com o topo da peça
 * à mesma cota `ARM_STATION_TOP_MM`, como na bancada (blocos maquinados de elevação).
 */
export const ARM_PIVOT_MM = 12 + 60 + 16 + 15 + 100 + 6
export const ARM_TIP_MM = 205
export const ARM_CUP_STEM_MM = 4
/** Corpo fixo do cilindro por cima do braço; curso e corpo são estimativas construtivas. */
export const ARM_CYLINDER_BASE_MM = ARM_PIVOT_MM + 2
export const ARM_TOTAL_HEIGHT_MM = 260
/** Adaptação do atuador da biblioteca (Ø66 → Ø25), sem mudar o ativo original. */
export const ARM_VACUUM_SCALE = MEC_DIMS.rotaryArm.cupDiameterMm / 66
export const ARM_VACUUM_CONTACT_MM = 32 + 14 + 45.5
/** Fundo da ventosa com a haste recolhida (mm acima da base do manipulador). */
export const ARM_CUP_UP_MM = ARM_PIVOT_MM + 2 - ARM_CUP_STEM_MM - 17
export const ARM_STATION_TOP_MM = ARM_CUP_UP_MM - MEC_DIMS.rotaryArm.cylinderStrokeMm

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
    /** Pés da mesa (perfil 40 × 40 com travessas e pés niveladores). Ligados por omissão. */
    legs: state?.legs !== false,
    /** 'auto' = até ao chão do pavilhão; número = altura fixa das pernas (mm). */
    legHeightMm: state?.legHeightMm === undefined || state?.legHeightMm === 'auto' ? 'auto' as const : clampNum(state?.legHeightMm, MEC_LEG_MIN_MM, MEC_LEG_MAX_MM, 750),
  }
}

export const MEC_LEG_MIN_MM = 100
export const MEC_LEG_MAX_MM = 1500
/** Altura das pernas quando não há chão conhecido (fora do pavilhão fabril). */
export const MEC_LEG_DEFAULT_MM = 750

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
  // Comprimento da calha editável: as rampas mais curtas libertam a calha lateral e a HMI.
  const lengthMm = clampNum(state?.lengthMm, 120, 300, MEC_DIMS.ramp.lengthMm)
  return { ...MEC_DIMS.ramp, lengthMm, pillarMm, slope, runMm: lengthMm * Math.cos(slope), riseMm: lengthMm * Math.sin(slope) }
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
  return { ...MEC_DIMS.dragChain, lengthMm: clampNum(state?.lengthMm, 80, 1200, 320) }
}

export function benchDuctDimsOf(state?: Record<string, any>) {
  const d = MEC_DIMS.benchDuct
  return {
    lengthMm: clampNum(state?.lengthMm, 100, 1800, d.lengthMm),
    widthMm: clampNum(state?.widthMm, 20, 80, d.widthMm),
    heightMm: clampNum(state?.heightMm, 25, 90, d.heightMm),
    alongZ: state?.axis === 'z',
    coverOn: state?.coverOn !== false,
  }
}

/** Folga entre o corpo e a flange com o HZ20 recolhido. */
export const HZ20_FLANGE_GAP_MM = 2

/** TECHNIK HZ20 — cilindro guiado com ventosa. Inspector expõe curso, diâmetro da ventosa e tipo de efeito. */
export function hz20DimsOf(state?: Record<string, any>) {
  const h = MEC_DIMS.hz20
  return {
    bodyWidthMm: h.bodyWidthMm,
    bodyDepthMm: h.bodyDepthMm,
    bodyHeightMm: h.bodyHeightMm,
    guideRodDiameterMm: h.guideRodDiameterMm,
    guideRodSpacingMm: h.guideRodSpacingMm,
    pistonRodDiameterMm: h.pistonRodDiameterMm,
    strokeMm: clampNum(state?.strokeMm, 5, 50, h.strokeMm),
    flangeWidthMm: h.flangeWidthMm,
    flangeHeightMm: h.flangeHeightMm,
    flangeDepthMm: h.flangeDepthMm,
    cupDiameterMm: clampNum(state?.cupDiameterMm, 16, 50, h.cupDiameterMm),
    cupHeightMm: clampNum(state?.cupHeightMm, 10, 30, h.cupHeightMm),
    /** 'double' = duplo efeito (HZ20D…), 'single' = simples efeito (HZ20S…). */
    acting: state?.acting === 'single' ? 'single' as const : 'double' as const,
    hasVacuumPort: state?.hasVacuumPort !== false,
    modelTag: textOf(state?.modelTag) || (state?.acting === 'single' ? 'HZ20S15-15' : 'HZ20D15-15V'),
  }
}

function textOf(v: unknown): string {
  return typeof v === 'string' ? v : ''
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
    case 'mecDrawerCylinder':
      return { x: 42, y: 44, z: 210 }
    case 'mecRotaryArm': {
      const a = MEC_DIMS.rotaryArm
      return { x: a.sweepMm, y: ARM_TOTAL_HEIGHT_MM, z: a.sweepMm }
    }
    case 'mecDcGearmotor':
      return { x: 212, y: 62, z: 56 }
    case 'mecMicroSwitchRoller':
      return { x: 46, y: 32, z: 18 }
    case 'mecVacuumEjector':
      return { x: 96, y: 28, z: 22 }
    case 'mecValveIsland': {
      const v = MEC_DIMS.valveIsland
      return { x: v.lengthMm, y: v.heightMm, z: v.depthMm }
    }
    case 'mecValveTerminalCpv10': {
      const v = MEC_DIMS.valveTerminalCpv10
      return { x: v.lengthMm, y: v.heightMm, z: v.depthMm }
    }
    case 'mecOpticalSensor': {
      const s = MEC_DIMS.opticalSensor
      return { x: s.lengthMm, y: s.heightMm, z: s.depthMm }
    }
    case 'mecInductiveSensor': {
      const s = MEC_DIMS.inductiveSensor
      return { x: s.lengthMm, y: s.heightMm, z: s.depthMm }
    }
    case 'mecHmiKtp700': {
      const h = MEC_DIMS.hmiKtp700
      return { x: h.widthMm, y: h.heightMm, z: h.depthMm }
    }
    case 'mecOperatorBox': {
      const o = MEC_DIMS.operatorBox
      return { x: o.widthMm, y: o.heightMm, z: o.depthMm }
    }
    case 'mecSignalTower': {
      const t = MEC_DIMS.signalTower
      return { x: t.baseMm, y: t.heightMm, z: t.baseMm }
    }
    case 'mecBenchDuct': {
      const d = benchDuctDimsOf(state)
      return d.alongZ ? { x: d.widthMm, y: d.heightMm, z: d.lengthMm } : { x: d.lengthMm, y: d.heightMm, z: d.widthMm }
    }
    case 'mecDragChain': {
      const d = dragChainDimsOf(state)
      return { x: d.lengthMm + d.bendRadiusMm + d.linkHeightMm, y: d.bendRadiusMm * 2 + d.linkHeightMm, z: d.widthMm + 6 }
    }
    case 'mecHz20VacuumCylinder': {
      const d = hz20DimsOf(state)
      // Corpo + folga + flange + ventosa + curso (todo estendido)
      return { x: Math.max(d.flangeWidthMm, d.bodyWidthMm + 10), y: d.bodyHeightMm + HZ20_FLANGE_GAP_MM + d.flangeHeightMm + d.cupHeightMm + d.strokeMm, z: Math.max(d.flangeDepthMm, d.bodyDepthMm) + 10 }
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
export const ARM_REACH_MM = ARM_TIP_MM

/** Lábio da ventosa nas coordenadas locais do componente, sem inclinação da estrutura. */
export function armCupLocalMm(angleDeg: number, downPct: number, offsetMm = 0) {
  const direction = armDirection(angleDeg)
  const down = Math.max(0, Math.min(100, downPct)) / 100
  return {
    x: direction.x * ARM_REACH_MM,
    y: ARM_CUP_UP_MM - down * MEC_DIMS.rotaryArm.cylinderStrokeMm + offsetMm - ARM_TOTAL_HEIGHT_MM / 2,
    z: direction.z * ARM_REACH_MM,
  }
}

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

/** Identificação no inspetor/biblioteca: cotas e etiquetagem da maquete ATEC / Guião 1185. */
export const MECHATRONICS_INFO: Record<MechatronicsComponentType, MechatronicsInfo> = {
  mecSlotPlate: { name: 'Base ranhurada em alumínio', model: '700 × 500 × 20 mm · ranhuras T passo 25', summary: 'Placa de alumínio extrudido anodizado com 20 ranhuras em T longitudinais para fixação modular da bancada.' },
  mecAluProfile: { name: 'Perfil de alumínio ranhurado', model: '30 × 30 / 40 × 40 mm · tampas + cantoneiras', summary: 'Perfil estrutural com ranhuras em T nas 4 faces, tampas de topo e cantoneiras injetadas.' },
  mecGravityMagazine: { name: 'Magazine vertical de alimentação (MAG1)', model: '50 × 50 × 260 mm · 2 rasgos frontais · zona B10', summary: 'Tubo quadrado em alumínio maquinado com 2 rasgos oblongos de inspeção, elevado sobre pés fresados e canal de recolha.' },
  mecWorkpiece: { name: 'Peça de trabalho (tarugo)', model: 'Ø40 × 35 mm · alumínio / polímero branco / polímero preto', summary: 'Cilindro de ensaio da estação de estampagem: metálico, plástico branco ou plástico preto.' },
  mecDischargeRamp: { name: 'Rampa de descarga em inox', model: '220 × 50 mm · BRANCA / PRETA / METALICA · 15°', summary: 'Calha inclinada em chapa de aço inox dobrada sobre pilar de perfil 30 × 30 com perno transversal de paragem.' },
  mecStampingTable: { name: 'Gaveta deslizante de estampagem (MES1 · FC 2)', model: '120 × 80 × 45 mm · alojamento quadrado fresado', summary: 'Gaveta maquinada em alumínio com cavidade chanfrada para o tarugo e etiqueta frontal FC 2.' },
  mecStampingPress: { name: 'Prensa pneumática de estampagem (Cilindro 4)', model: 'Pórtico 300 mm · CILINDRO 4 (B3 / B4) · prato Ø65', summary: 'Pórtico de perfil 30 × 30 com manómetro na coluna esquerda, cilindro vertical roscado com porca sextavada, sensores B3/B4 e prato circular.' },
  mecFeederCylinder: { name: 'Cilindro de alimentação (Cilindro 1)', model: 'Ø20 × 80 mm · inox · sensores B8 / B9', summary: 'Cilindro redondo em inox de dupla ação com reguladores de caudal, sensores de cinta B8/B9 e bloco empurrador.' },
  mecDrawerCylinder: { name: 'Cilindro da gaveta de estampagem (Cilindro 3)', model: 'Ø20 × 75 mm · inox · sensores B2 / B1', summary: 'Cilindro horizontal traseiro que avança e recua a gaveta de estampagem entre a recolha e o prato da prensa.' },
  mecRotaryArm: { name: 'Manipulador rotativo com ventosa (BR1 · Cilindro 2)', model: 'Torre linear Festo (B6 / B7) · braço aligeirado · ventosa Ø25', summary: 'Prato rotativo sobre 4 colunas com polia dentada, atuador vertical guiado, braço trapezoidal com 2 rasgos, filtro ZFC e ventosa de fole.' },
  mecDcGearmotor: { name: 'Motorredutor DC M1 com par cónico e encoder', model: 'Portescap M1 (1 / 2) · roda cónica nylon · RT3806-AB-400N', summary: 'Motorredutor dourado com borne branco de 2 polos, par cónico 90°, disco ótico de 4 pás e encoder incremental A/B.' },
  mecMicroSwitchRoller: { name: 'Microinterruptor de rolete (FC 1 / FC 2)', model: 'Contacto comutado C / NA / NF · terminais Faston', summary: 'Microinterruptor preto com alavanca de rolete e terminais isolados a vermelho para deteção de fim de curso.' },
  mecVacuumEjector: { name: 'Gerador de vácuo (VAC1 · C4A)', model: 'Ejetor Festo C4A em linha · suporte em L', summary: 'Gerador de vácuo compacto montado em esquadro de inox com racores Push-In para tubo azul Ø4/6 mm.' },
  mecValveIsland: { name: 'Ilha de eletroválvulas 2× 5/2 (C1A / C2A)', model: 'Bloco sub-base Festo 2 estações · comandos manuais azuis', summary: ' Sub-base coletora em alumínio com 2 eletroválvulas 5/2 biestáveis/monoestáveis, bobinas 24 V DC e racores superiores.' },
  mecValveTerminalCpv10: { name: 'Terminal de válvulas Festo CPV10 (YV · 9 bobinas)', model: 'CPV10 · 5 estações 5/2 (C1, C2, C3 biestáveis · C4 monoestável · vácuo biestável) · 24 V DC', summary: 'Sub-base CPV10 com 5 eletroválvulas de 10 mm, LEDs e comandos manuais por bobina, racores QS-4 para A/B, alimentação P à esquerda e módulo elétrico com bornes Y0…Y6, VACUO_ON/OFF e 0 V à direita.' },
  mecOpticalSensor: { name: 'Sensor ótico difuso M18 (S. OTICO · B11)', model: 'Corpo cilíndrico M18 niquelado · Sn = 400 mm · suporte L', summary: 'Fotocélula difusa M18 em suporte vertical de alumínio: distingue peças claras/metálicas das peças pretas.' },
  mecInductiveSensor: { name: 'Sensor indutivo de proximidade (S. INDUTIVO)', model: 'M12 faceado no fundo da zona de recolha · PNP NA', summary: 'Sensor indutivo montado à face sob a zona de recolha para deteção exclusiva de tarugos metálicos.' },
  mecHmiKtp700: { name: 'Consola Siemens SIMATIC HMI KTP700 Basic', model: '6AV2 123-2GB03-0AX0 · ecrã 7" · 8 teclas F1–F8', summary: 'Painel operador SIMATIC HMI montado em bastidor de perfil 30 × 30, com caixa traseira ventilada, ficha 24 V DC e cabo PROFINET.' },
  mecOperatorBox: { name: 'Caixa de botões de comando (6 furos Ø22)', model: 'EMERG · MAN/AUTO · REARME · CICLO · STOP · START', summary: 'Pupitre cinzento de 6 operadores Ø22 fixado à calha frontal: emergência, seletores, rearme azul, paragem e arranque.' },
  mecSignalTower: { name: 'Coluna luminosa de sinalização (Torre LED)', model: 'Base quadrada fundida · tubo alumínio · verde / amarelo / vermelho', summary: 'Coluna de sinalização de 3 níveis LED (Q5.4 amarelo, Q5.5 verde, Q5.6 vermelho) aparafusada ao canto traseiro esquerdo da base.' },
  mecBenchDuct: { name: 'Calha técnica ranhurada da bancada', model: 'PVC cinzento RAL 7030 · dentes ranhurados com tampa', summary: 'Calha perimetral de cablagem elétrica e pneumática à volta da base ranhurada da maquete.' },
  mecSupportBlock: { name: 'Suporte / bloco maquinado de elevação', model: 'Alumínio fresado · cotas parametrizáveis', summary: 'Bloco de elevação para o magazine, a mesa de receção e a gaveta da prensa, fixo à base por parafusos Allen.' },
  mecDragChain: { name: 'Esteira porta-cabos articulada', model: 'Elos 26 × 17 mm · poliamida preta', summary: 'Corrente porta-cabos articulada para proteção dos cabos e tubos móveis da gaveta de estampagem e do manipulador.' },
  mecHz20VacuumCylinder: {
    name: 'Cilindro guiado TECHNIK HZ20 com ventosa',
    model: 'HZ20D15-15V / HZ20S15-15 · alumínio anodizado · guias Ø6 · ventosa de fole',
    summary: 'Cilindro pneumático guiado de simples ou duplo efeito com ventosa integrada, serigrafia TECHNIK, portas M5, flange de montagem e sensores reed opcionais. Dimensões editáveis no inspetor.',
  },
}

/**
 * Carro deslizante (gaveta de estampagem e o FC que viaja com ela): `slideAxis` é o vetor unitário
 * nas coordenadas locais da peça e `slideMm` o deslocamento atual, imposto pelo cilindro da gaveta.
 */
export function slideOffsetMm(state?: Record<string, any>): { x: number; y: number; z: number } {
  const axis = Array.isArray(state?.slideAxis) ? state!.slideAxis.map(Number) : null
  const mm = Number(state?.slideMm ?? 0)
  if (!axis || axis.length !== 3 || !Number.isFinite(mm) || mm === 0) return { x: 0, y: 0, z: 0 }
  return { x: axis[0] * mm, y: axis[1] * mm, z: axis[2] * mm }
}
