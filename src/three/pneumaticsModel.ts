import type { ElectricalComponent } from '../types'

export type PneumaticComponentType =
  | 'pneumaticFrl'
  | 'pneumaticFrlBracket'
  | 'pneumaticValve52'
  | 'pneumaticCylinder'
  | 'pneumaticTee'
  | 'pneumaticUnion'
  | 'pneumaticElbow'
  | 'pneumaticY'
  | 'electricCylinderEpcs'
  | 'pneumaticGuidedCylinder'
  | 'pneumaticManifold'
  | 'pneumaticVacuumCup'
  | 'airCompressor'

export function isPneumaticComponentType(type: string): type is PneumaticComponentType {
  return (
    type === 'pneumaticFrl' ||
    type === 'pneumaticFrlBracket' ||
    type === 'pneumaticValve52' ||
    type === 'pneumaticCylinder' ||
    type === 'pneumaticTee' ||
    type === 'pneumaticUnion' ||
    type === 'pneumaticElbow' ||
    type === 'pneumaticY' ||
    type === 'electricCylinderEpcs' ||
    type === 'pneumaticGuidedCylinder' ||
    type === 'pneumaticManifold' ||
    type === 'pneumaticVacuumCup' ||
    type === 'airCompressor'
  )
}

export const PNEUMATIC_FRL_SIZE_MM = { width: 150, height: 245, depth: 96 } as const
/** Suporte em esquadro para FRL (aço galvanizado 3 mm): dimensões por omissão. */
export const PNEUMATIC_FRL_BRACKET_SIZE_MM = { width: 220, height: 290, depth: 60, thickness: 3, flange: 70 } as const

export interface FrlBracketDims {
  widthMm: number
  heightMm: number
  depthMm: number
  thicknessMm: number
  /** Comprimento da aba superior (zona aparafusada por baixo do tampo). */
  flangeLengthMm: number
  flangeSide: 'left' | 'right'
  /** Centro de fixação do FRL na chapa traseira (mm, local). */
  mountXmm: number
  mountYmm: number
  /** Espaçadores entre a chapa e o cabeçote do FRL. */
  standoffMm: number
}

const clampDim = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.max(min, Math.min(max, n)) : fallback
}

export function frlBracketDimsOf(state?: Record<string, any>): FrlBracketDims {
  const S = PNEUMATIC_FRL_BRACKET_SIZE_MM
  const widthMm = clampDim(state?.widthMm, S.width, 80, 600)
  const heightMm = clampDim(state?.heightMm, S.height, 80, 800)
  const depthMm = clampDim(state?.depthMm, S.depth, 30, 200)
  const thicknessMm = clampDim(state?.thicknessMm, S.thickness, 2, 6)
  const flangeLengthMm = Math.min(widthMm, clampDim(state?.flangeLengthMm, S.flange, 30, 400))
  const mountX = Number(state?.mountXmm)
  const mountY = Number(state?.mountYmm)
  return {
    widthMm, heightMm, depthMm, thicknessMm, flangeLengthMm,
    flangeSide: state?.flangeSide === 'left' ? 'left' : 'right',
    mountXmm: Number.isFinite(mountX) ? mountX : -widthMm / 2 + 75,
    mountYmm: Number.isFinite(mountY) ? mountY : 40,
    standoffMm: clampDim(state?.standoffMm, 12, 0.5, 60),
  }
}

export const PNEUMATIC_VALVE52_SIZE_MM = { width: 170, height: 102, depth: 56 } as const
export const PNEUMATIC_CYLINDER_SIZE_MM = { width: 330, height: 88, depth: 78 } as const
export const PNEUMATIC_TEE_SIZE_MM = { width: 82, height: 60, depth: 34 } as const
export const PNEUMATIC_UNION_SIZE_MM = { width: 64, height: 28, depth: 28 } as const
export const PNEUMATIC_ELBOW_SIZE_MM = { width: 52, height: 52, depth: 28 } as const
export const PNEUMATIC_Y_SIZE_MM = { width: 56, height: 68, depth: 30 } as const
export const ELECTRIC_CYLINDER_EPCS_SIZE_MM = { width: 410, height: 122, depth: 82 } as const
export const PNEUMATIC_GUIDED_CYLINDER_SIZE_MM = { width: 220, height: 118, depth: 66 } as const
export const PNEUMATIC_MANIFOLD_SIZE_MM = { width: 250, height: 146, depth: 94 } as const
export const PNEUMATIC_VACUUM_CUP_SIZE_MM = { width: 88, height: 185, depth: 88 } as const
// Volume conservador de enquadramento do modelo proporcional à fotografia.
// O manual fornecido não contém um desenho cotado do MCA2420.
export const AIR_COMPRESSOR_SIZE_MM = { width: 520, height: 530, depth: 280 } as const
/**
 * Bucim / prensa-cabos de entrada do cabo de alimentação, no referencial local do compressor (mm,
 * origem no centro do volume): assenta no topo da carenagem, alinhado com os bornes L/N. É a única
 * entrada de cabo da máquina — o cabo revestido 3G2,5 entra aqui e não "flutua" sobre a carenagem.
 */
export const AIR_COMPRESSOR_CABLE_GLAND = { x: -140.4, y: 285, z: 14 } as const
/** Altura do bocal (boca) do bucim acima da base, em mm. */
export const AIR_COMPRESSOR_CABLE_GLAND_HEIGHT = 20.5

export function pneumaticComponentSizeMm(
  type: string,
  _state?: Record<string, any>,
): { x: number; y: number; z: number } | null {
  if (type === 'pneumaticFrl') {
    return { x: PNEUMATIC_FRL_SIZE_MM.width, y: PNEUMATIC_FRL_SIZE_MM.height, z: PNEUMATIC_FRL_SIZE_MM.depth }
  }
  if (type === 'pneumaticFrlBracket') {
    const d = frlBracketDimsOf(_state)
    return { x: d.widthMm, y: d.heightMm, z: d.depthMm }
  }
  if (type === 'pneumaticValve52') {
    return { x: PNEUMATIC_VALVE52_SIZE_MM.width, y: PNEUMATIC_VALVE52_SIZE_MM.height, z: PNEUMATIC_VALVE52_SIZE_MM.depth }
  }
  if (type === 'pneumaticCylinder') {
    return { x: PNEUMATIC_CYLINDER_SIZE_MM.width, y: PNEUMATIC_CYLINDER_SIZE_MM.height, z: PNEUMATIC_CYLINDER_SIZE_MM.depth }
  }
  if (type === 'pneumaticTee') {
    return { x: PNEUMATIC_TEE_SIZE_MM.width, y: PNEUMATIC_TEE_SIZE_MM.height, z: PNEUMATIC_TEE_SIZE_MM.depth }
  }
  if (type === 'pneumaticUnion') {
    return { x: PNEUMATIC_UNION_SIZE_MM.width, y: PNEUMATIC_UNION_SIZE_MM.height, z: PNEUMATIC_UNION_SIZE_MM.depth }
  }
  if (type === 'pneumaticElbow') {
    return { x: PNEUMATIC_ELBOW_SIZE_MM.width, y: PNEUMATIC_ELBOW_SIZE_MM.height, z: PNEUMATIC_ELBOW_SIZE_MM.depth }
  }
  if (type === 'pneumaticY') {
    return { x: PNEUMATIC_Y_SIZE_MM.width, y: PNEUMATIC_Y_SIZE_MM.height, z: PNEUMATIC_Y_SIZE_MM.depth }
  }
  if (type === 'electricCylinderEpcs') {
    return { x: ELECTRIC_CYLINDER_EPCS_SIZE_MM.width, y: ELECTRIC_CYLINDER_EPCS_SIZE_MM.height, z: ELECTRIC_CYLINDER_EPCS_SIZE_MM.depth }
  }
  if (type === 'pneumaticGuidedCylinder') {
    return { x: PNEUMATIC_GUIDED_CYLINDER_SIZE_MM.width, y: PNEUMATIC_GUIDED_CYLINDER_SIZE_MM.height, z: PNEUMATIC_GUIDED_CYLINDER_SIZE_MM.depth }
  }
  if (type === 'pneumaticManifold') {
    return { x: PNEUMATIC_MANIFOLD_SIZE_MM.width, y: PNEUMATIC_MANIFOLD_SIZE_MM.height, z: PNEUMATIC_MANIFOLD_SIZE_MM.depth }
  }
  if (type === 'pneumaticVacuumCup') {
    return { x: PNEUMATIC_VACUUM_CUP_SIZE_MM.width, y: PNEUMATIC_VACUUM_CUP_SIZE_MM.height, z: PNEUMATIC_VACUUM_CUP_SIZE_MM.depth }
  }
  if (type === 'airCompressor') {
    return { x: AIR_COMPRESSOR_SIZE_MM.width, y: AIR_COMPRESSOR_SIZE_MM.height, z: AIR_COMPRESSOR_SIZE_MM.depth }
  }
  return null
}

export interface PneumaticDatasheetInfo {
  path: string
  name: string
  manufacturer: string
  model: string
  summary: string
}

export const PNEUMATIC_DATASHEETS: Record<PneumaticComponentType, PneumaticDatasheetInfo> = {
  pneumaticFrl: {
    path: '/datasheets/pneumatics/pneumatic-frl-unit-3d.pdf',
    name: 'Festo MS4-LFR · Unidade FRL Filtro-Regulador com Manómetro (Ficha Técnica).pdf',
    manufacturer: 'Festo',
    model: 'MS4-LFR-1/4 · 0–16 bar',
    summary: 'Preparação de ar comprimido Festo MS4 · Filtragem 5 µm · Regulador bloqueável · Manómetro 0–16 bar · Push-In QS',
  },
  pneumaticFrlBracket: {
    path: '/datasheets/pneumatics/pneumatic-frl-unit-3d.pdf',
    name: 'Festo MS4-WR · Suporte em esquadro para unidade FRL (Ficha Técnica).pdf',
    manufacturer: 'Festo',
    model: 'MS4-WR · Esquadro aço galvanizado 3 mm',
    summary: 'Suporte em esquadro para MS4: aba aparafusada sob o tampo (2× M6 em rasgos), chapa traseira com 2× M5 e espaçadores ao cabeçote, reforço na dobra',
  },
  pneumaticValve52: {
    path: '/datasheets/pneumatics/pneumatic-valve-52-3d.pdf',
    name: 'Festo CPE14-M1B-H-5L-QS-8 · Eletroválvula 5/2 Vias 24V DC (Ficha Técnica).pdf',
    manufacturer: 'Festo',
    model: 'CPE14-M1B-H-5L-QS-8 · MSZE 24V DC',
    summary: 'Eletroválvula 5/2 vias monoestável · Bobina MSZE-B-3-24DC (1,28W) · QS-8 · Silenciadores PE · Comando manual',
  },
  pneumaticCylinder: {
    path: '/datasheets/pneumatics/pneumatic-cylinder-iso15552.pdf',
    name: 'Festo DSBC · Cilindro Pneumático Dupla Ação ISO 15552 (Ficha Técnica).pdf',
    manufacturer: 'Festo',
    model: 'DSBC-32-125-PPVA-N3 · ISO 15552',
    summary: 'Dupla ação · Perfil alumínio ranhuras T + sensores magnéticos S0/S1 · Variantes DSBC / ADN / DSNU',
  },
  pneumaticTee: {
    path: '/datasheets/pneumatics/pneumatic-frl-unit-3d.pdf',
    name: 'Festo QST-8 · União em T Pneumática Push-In (Ficha Técnica).pdf',
    manufacturer: 'Festo',
    model: 'QST-8 · Push-In 3 Vias',
    summary: 'Derivação pneumática rápida Festo QST em T (P1 / P2 / P3) · 0–14 bar',
  },
  pneumaticUnion: {
    path: '/datasheets/pneumatics/pneumatic-frl-unit-3d.pdf',
    name: 'Festo QS-8 · União Reta Pneumática Push-In (Ficha Técnica).pdf',
    manufacturer: 'Festo',
    model: 'QS-8 · Push-In Reta',
    summary: 'União reta Push-In 2 vias · corpo PBT preto · anéis azuis de libertação · 0–14 bar',
  },
  pneumaticElbow: {
    path: '/datasheets/pneumatics/pneumatic-frl-unit-3d.pdf',
    name: 'Festo QSL-8 · Cotovelo 90° Pneumático Push-In (Ficha Técnica).pdf',
    manufacturer: 'Festo',
    model: 'QSL-8 · Push-In 90°',
    summary: 'Cotovelo 90° Push-In · corpo PBT preto · anéis azuis · 0–14 bar',
  },
  pneumaticY: {
    path: '/datasheets/pneumatics/pneumatic-frl-unit-3d.pdf',
    name: 'Festo QSY-8 · União em Y Pneumática Push-In (Ficha Técnica).pdf',
    manufacturer: 'Festo',
    model: 'QSY-8 · Push-In Y',
    summary: 'Derivação em Y Push-In 3 vias · corpo PBT preto · anéis azuis · 0–14 bar',
  },
  electricCylinderEpcs: {
    path: '/datasheets/pneumatics/festo-epcs-bs-45-200-sms.pdf',
    name: 'Festo EPCS-BS-45-200-10P-A-ST-M-H1-PLK-AA · Cilindro Elétrico SMS (Ficha Técnica).pdf',
    manufacturer: 'Festo',
    model: 'EPCS-BS-45-200-10P-A-ST-M-H1-PLK-AA',
    summary: 'Cilindro elétrico fuso de esferas · Simplified Motion Series · 24V DC · IO-Link / E/S digitais · Curso 200 mm',
  },
  pneumaticGuidedCylinder: {
    path: '/datasheets/pneumatics/festo-dfm-20-40-guided.pdf',
    name: 'Festo DFM-20-40-P-A-GF · Cilindro Guiado de Dupla Haste (Ficha Técnica).pdf',
    manufacturer: 'Festo',
    model: 'DFM-20-40-P-A-GF · 163346',
    summary: 'Cilindro guiado compacto · Casquilhos deslizantes bronze GF · 2 hastes guia + placa frontal maquinada · Pmax 10 bar',
  },
  pneumaticManifold: {
    path: '/datasheets/pneumatics/festo-vtug-valve-island.pdf',
    name: 'Festo VTUG · Ilha de Válvulas 4 Estações em Calha DIN (Ficha Técnica).pdf',
    manufacturer: 'Festo',
    model: 'VTUG-14-VRLK-4 · 24V DC',
    summary: 'Terminal de válvulas 4 estações 5/2 em calha DIN · 4 bobinas independentes Y1–Y4 · QS-8 · LEDs + comando manual',
  },
  pneumaticVacuumCup: {
    path: '/datasheets/pneumatics/diyi-vfg30-20-vacuum-cup.pdf',
    name: 'DIYI VFG30-20 · Atuador Pneumático com Ventosa de Fole (Ficha Técnica).pdf',
    manufacturer: 'DIYI',
    model: 'VFG30-20 · 0.4–0.7 MPa',
    summary: 'Atuador linear com ventosa dupla de silicone azul para pick-and-place · Curso 20 mm · Pressão 4–7 bar',
  },
  airCompressor: {
    path: '/datasheets/pneumatics/maxxim-air-compressor-24l-manual.pdf',
    name: 'Maxxim MCA2420 · Compressor de Ar 24 L · Manual original.pdf',
    manufacturer: 'Maxxim',
    model: 'MCA2420 · 24 L · 2,0 HP · 8 bar / 116 PSI',
    summary: 'Manual original MCA2420/MCA5020 (36 páginas, PT/ES/FR), com figuras de montagem e manutenção e declaração de conformidade. MCA2420: 24 L e 2,0 HP; a fotografia de referência apresenta a inscrição 1.8 HP.',
  },
}

export function isPneumaticComponent(c: ElectricalComponent): boolean {
  return isPneumaticComponentType(c.type)
}
