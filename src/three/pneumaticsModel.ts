import type { ElectricalComponent } from '../types'

export type PneumaticComponentType =
  | 'pneumaticFrl'
  | 'pneumaticValve52'
  | 'pneumaticCylinder'
  | 'pneumaticTee'

export function isPneumaticComponentType(type: string): type is PneumaticComponentType {
  return (
    type === 'pneumaticFrl' ||
    type === 'pneumaticValve52' ||
    type === 'pneumaticCylinder' ||
    type === 'pneumaticTee'
  )
}

export const PNEUMATIC_FRL_SIZE_MM = { width: 145, height: 225, depth: 92 } as const
export const PNEUMATIC_VALVE52_SIZE_MM = { width: 155, height: 96, depth: 58 } as const
export const PNEUMATIC_CYLINDER_SIZE_MM = { width: 320, height: 84, depth: 78 } as const
export const PNEUMATIC_TEE_SIZE_MM = { width: 78, height: 58, depth: 34 } as const

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
    name: 'Unidade FRL Pneumática · Filtro + Regulador + Manómetro (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu Pneumática',
    model: 'FRL-2000 · 0–10 bar',
    summary: 'Preparação de ar comprimido · Filtragem 5 µm · Regulador 0,5–10 bar · Saída Push-In',
  },
  pneumaticValve52: {
    path: '/datasheets/pneumatics/pneumatic-valve-52-3d.pdf',
    name: 'Eletroválvula Pneumática 5/2 Vias · 24V DC (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu Pneumática',
    model: 'EV52-24DC · ISO',
    summary: '5/2 vias monoestável · Bobina 24V DC (A1/A2) · Pórticos P (1), A (4), B (2) · Comando manual',
  },
  pneumaticCylinder: {
    path: '/datasheets/pneumatics/pneumatic-cylinder-iso15552.pdf',
    name: 'Cilindro Pneumático Dupla Ação · ISO 15552 (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu Pneumática',
    model: 'ISO 15552 · Ø32×125 mm',
    summary: 'Dupla ação · Camisa alumínio anodizado · Haste cromada animada · Pórticos A / B',
  },
  pneumaticTee: {
    path: '/datasheets/pneumatics/pneumatic-frl-unit-3d.pdf',
    name: 'União em T Pneumática Push-In (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu Pneumática',
    model: 'QST-8 · Push-In 3 Vias',
    summary: 'Derivação pneumática rápida em T (P1 / P2 / P3) · 0–10 bar',
  },
}

export function isPneumaticComponent(c: ElectricalComponent): boolean {
  return isPneumaticComponentType(c.type)
}
