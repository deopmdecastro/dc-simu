import type { ComponentType } from '../types'

/**
 * Interfaces REAIS dos modelos 3D: onde ficam mesmo os encaixes dos cabos em
 * cada aparelho, e que peça do GLB se mexe quando o aparelho é operado.
 *
 * As posições foram medidas no próprio GLB por `npx tsx scripts/detect-interfaces.ts`
 * (varredura por raios que encontra os furos/cavidades reais de cada face) e os
 * rótulos vêm das fichas técnicas dos fabricantes. É o valor por omissão global:
 * qualquer componente novo nasce já com os bornes nos sítios certos.
 *
 * Coordenadas normalizadas na caixa do componente, como `position3D`:
 *   x: 0 = esquerda, 1 = direita · y: 0 = topo, 1 = base · z: 0 = trás, 1 = frente.
 */
export interface RealTerminalSpot {
  label: string
  /** Face onde está o encaixe (define a direção de saída do cabo). */
  face: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'
  x: number
  y: number
  z: number
  /** Diâmetro do encaixe medido no modelo (mm). */
  diameterMm?: number
}

/** Peça do GLB que se mexe (manípulo, botão) e que deve ser operável por omissão. */
export interface RealControlSpot {
  /** Nome do nó no GLB. */
  node: string
  kind: 'button' | 'toggle' | 'selector'
  name: string
  /** Curso (mm) para botões; 0 em manípulos que bascularem. */
  travelMm?: number
  variable: string
}

export const REAL_TERMINALS: Partial<Record<ComponentType, RealTerminalSpot[]>> = {
  /**
   * WEG MDW-C10-3 (54×79×66 mm, tripolar). O GLB tem as três cavidades Ø12,2 mm
   * em cima (entrada 1/3/5) e três em baixo (saída 2/4/6), recuadas para trás.
   */
  breakerWegMdwC10: [
    { label: '1', face: 'top', x: 0.164, y: 0.01, z: 0.711, diameterMm: 12.2 },
    { label: '3', face: 'top', x: 0.5, y: 0.01, z: 0.711, diameterMm: 12.2 },
    { label: '5', face: 'top', x: 0.836, y: 0.01, z: 0.711, diameterMm: 12.2 },
    { label: '2', face: 'bottom', x: 0.164, y: 0.99, z: 0.711, diameterMm: 12.2 },
    { label: '4', face: 'bottom', x: 0.5, y: 0.99, z: 0.711, diameterMm: 12.2 },
    { label: '6', face: 'bottom', x: 0.836, y: 0.99, z: 0.711, diameterMm: 12.2 },
  ],
  /** Disjuntor monopolar genérico: encaixe Ø7,2 mm em cima e em baixo. */
  breaker1p: [
    { label: '1', face: 'top', x: 0.5, y: 0.0, z: 0.866, diameterMm: 7.2 },
    { label: '2', face: 'bottom', x: 0.5, y: 1.0, z: 0.866, diameterMm: 7.2 },
  ],
  /** Disjuntor bipolar: dois polos a 1/4 e 3/4 da largura. */
  breaker2p: [
    { label: '1', face: 'top', x: 0.25, y: 0.0, z: 0.871, diameterMm: 7.2 },
    { label: '3', face: 'top', x: 0.75, y: 0.0, z: 0.871, diameterMm: 7.2 },
    { label: '2', face: 'bottom', x: 0.25, y: 1.0, z: 0.871, diameterMm: 7.2 },
    { label: '4', face: 'bottom', x: 0.75, y: 1.0, z: 0.871, diameterMm: 7.2 },
  ],
  /**
   * Phoenix Contact EC 1 12DC/1A S-R (12,4×80×81,7 mm): Line+ no topo,
   * LOAD+ na base e os sinais (0V, Reset, Status) na frente.
   */
  phoenixEcb3000760: [
    { label: 'Line+', face: 'top', x: 0.5, y: 0.01, z: 0.254, diameterMm: 10.8 },
    { label: 'LOAD+', face: 'bottom', x: 0.5, y: 0.99, z: 0.254, diameterMm: 10.8 },
    { label: '0V', face: 'front', x: 0.5, y: 0.757, z: 1, diameterMm: 5.1 },
    { label: 'RESET', face: 'front', x: 0.3, y: 0.229, z: 1, diameterMm: 4 },
    { label: 'STATUS', face: 'front', x: 0.703, y: 0.228, z: 1, diameterMm: 4 },
  ],
  /**
   * NHD NPB22-D11 (botoneira dupla 22 mm, 1NA + 1NF): os quatro parafusos
   * ficam atrás do corpo, dois por bloco de contactos (13/14 verde, 21/22 vermelho).
   */
  dualPushButtonNpb22D11: [
    { label: '13', face: 'left', x: 0.145, y: 0.176, z: 0.871, diameterMm: 7.3 },
    { label: '14', face: 'left', x: 0.145, y: 0.836, z: 0.871, diameterMm: 7.1 },
    { label: '21', face: 'right', x: 0.831, y: 0.176, z: 0.871, diameterMm: 7.3 },
    { label: '22', face: 'right', x: 0.831, y: 0.836, z: 0.871, diameterMm: 7.1 },
  ],
  /** Botão de emergência P20AKR (1NF): os dois parafusos do bloco, atrás. */
  emergencyButton: [
    { label: '21', face: 'back', x: 0.728, y: 0.754, z: 0, diameterMm: 7.3 },
    { label: '22', face: 'back', x: 0.728, y: 0.333, z: 0, diameterMm: 7.3 },
  ],
  /** Emergência com rearme por chave P20ACR (1NF). */
  emergencyButtonKeyP20ACR: [
    { label: '21', face: 'back', x: 0.724, y: 0.754, z: 0, diameterMm: 7.2 },
    { label: '22', face: 'back', x: 0.724, y: 0.333, z: 0, diameterMm: 7.2 },
  ],
  /** Sinaleiro AD22-22DS 24 V: dois terminais atrás (X1 +, X2 −). */
  pilotLightAd22: [
    { label: 'X1', face: 'back', x: 0.346, y: 0.5, z: 0.012, diameterMm: 5.8 },
    { label: 'X2', face: 'back', x: 0.654, y: 0.5, z: 0.012, diameterMm: 5.8 },
  ],
  /** Multímetro RGK DM-20: fichas banana Ø7 mm na frente (V/Ω/mA e COM). */
  multimeterDm20: [
    { label: 'COM', face: 'front', x: 0.23, y: 0.83, z: 0.886, diameterMm: 7 },
    { label: 'VΩmA', face: 'front', x: 0.77, y: 0.83, z: 0.886, diameterMm: 7 },
  ],
}

export const REAL_CONTROLS: Partial<Record<ComponentType, RealControlSpot[]>> = {
  /** Manípulo azul original do disjuntor WEG (bascula ON/OFF). */
  breakerWegMdwC10: [{ node: 'WEG_Handle', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' }],
}

export const realTerminalsFor = (type: ComponentType): RealTerminalSpot[] | undefined => REAL_TERMINALS[type]
export const realControlsFor = (type: ComponentType): RealControlSpot[] | undefined => REAL_CONTROLS[type]
