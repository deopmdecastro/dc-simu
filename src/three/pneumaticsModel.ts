import type { ElectricalComponent } from '../types'

export type PneumaticComponentType =
  | 'pneumaticFrl'
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
export const AIR_COMPRESSOR_SIZE_MM = { width: 520, height: 420, depth: 280 } as const

export function pneumaticComponentSizeMm(
  type: string,
  _state?: Record<string, any>,
): { x: number; y: number; z: number } | null {
  if (type === 'pneumaticFrl') {
    return { x: PNEUMATIC_FRL_SIZE_MM.width, y: PNEUMATIC_FRL_SIZE_MM.height, z: PNEUMATIC_FRL_SIZE_MM.depth }
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
    name: 'Maxxim · Compressor de Ar 24 L · 2,0 HP (Manual).pdf',
    manufacturer: 'Maxxim',
    model: '24L · 1.8–2.0 HP · 8 bar / 116 PSI',
    summary: 'Compressor de ar com tanque 24 L · motor 2,0 HP · manómetros tanque/saída · saída Push-In · máx. 8 bar',
  },
}

export function isPneumaticComponent(c: ElectricalComponent): boolean {
  return isPneumaticComponentType(c.type)
}
