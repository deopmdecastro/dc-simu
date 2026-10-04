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
  /**
   * Profundidade do furo/cavidade medida no modelo (mm). O borne é recuado
   * para dentro do furo (metade da profundidade, no máximo 6 mm), para o cabo
   * entrar mesmo no encaixe em vez de ficar colado à superfície.
   */
  holeDepthMm?: number
}

/**
 * Recuo do borne para dentro do furo, em mm: um terço da profundidade, entre
 * 1 e 3 mm. Chega para o ponto de ligação ficar dentro do encaixe (é lá que o
 * cabo entra) sem o esconder por completo dentro do corpo do aparelho.
 */
export function terminalInsetMm(spot: RealTerminalSpot): number {
  return Math.min(3, Math.max(1, (spot.holeDepthMm ?? 5) / 3))
}

/** Normal da face virada para fora, em coordenadas normalizadas (x, y com 0 = topo, z). */
export const FACE_INWARD: Record<RealTerminalSpot['face'], [number, number, number]> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, -1],
  back: [0, 0, 1],
  left: [1, 0, 0],
  right: [-1, 0, 0],
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
    { label: '1', face: 'top', x: 0.164, y: 0.01, z: 0.711, diameterMm: 12.2, holeDepthMm: 10 },
    { label: '3', face: 'top', x: 0.5, y: 0.01, z: 0.711, diameterMm: 12.2, holeDepthMm: 10 },
    { label: '5', face: 'top', x: 0.836, y: 0.01, z: 0.711, diameterMm: 12.2, holeDepthMm: 10 },
    { label: '2', face: 'bottom', x: 0.164, y: 0.99, z: 0.711, diameterMm: 12.2, holeDepthMm: 10 },
    { label: '4', face: 'bottom', x: 0.5, y: 0.99, z: 0.711, diameterMm: 12.2, holeDepthMm: 10 },
    { label: '6', face: 'bottom', x: 0.836, y: 0.99, z: 0.711, diameterMm: 12.2, holeDepthMm: 10 },
  ],
  /**
   * Steck SD C25 1P (17,8×79,6×72,6 mm, do STEP do fabricante). A caixa de
   * ligação é aberta em cima (1, entrada) e em baixo (2, saída), com cerca de
   * 11 mm de largura e 4,5–5 mm de profundidade, a meio da profundidade
   * (z ≈ 0,39). Os parafusos de aperto ficam acessíveis pela frente.
   */
  breakerSteckSdC25: [
    { label: '1', face: 'top', x: 0.5, y: 0.006, z: 0.389, diameterMm: 11.3, holeDepthMm: 4.5 },
    { label: '2', face: 'bottom', x: 0.5, y: 0.984, z: 0.39, diameterMm: 11.3, holeDepthMm: 5 },
  ],
  /** Disjuntor monopolar genérico: encaixe Ø7,2 mm em cima e em baixo. */
  breaker1p: [
    { label: '1', face: 'top', x: 0.5, y: 0.0, z: 0.866, diameterMm: 7.2, holeDepthMm: 8 },
    { label: '2', face: 'bottom', x: 0.5, y: 1.0, z: 0.866, diameterMm: 7.2, holeDepthMm: 8 },
  ],
  /** Disjuntor bipolar: dois polos a 1/4 e 3/4 da largura. */
  breaker2p: [
    { label: '1', face: 'top', x: 0.25, y: 0.0, z: 0.871, diameterMm: 7.2, holeDepthMm: 8 },
    { label: '3', face: 'top', x: 0.75, y: 0.0, z: 0.871, diameterMm: 7.2, holeDepthMm: 8 },
    { label: '2', face: 'bottom', x: 0.25, y: 1.0, z: 0.871, diameterMm: 7.2, holeDepthMm: 8 },
    { label: '4', face: 'bottom', x: 0.75, y: 1.0, z: 0.871, diameterMm: 7.2, holeDepthMm: 8 },
  ],
  /**
   * Phoenix Contact EC 1 12DC/1A S-R (12,4×80×81,7 mm): Line+ no topo,
   * LOAD+ na base e os sinais (0V, Reset, Status) na frente.
   */
  phoenixEcb3000760: [
    { label: 'Line+', face: 'top', x: 0.5, y: 0.01, z: 0.254, diameterMm: 10.8, holeDepthMm: 6 },
    { label: 'LOAD+', face: 'bottom', x: 0.5, y: 0.99, z: 0.254, diameterMm: 10.8, holeDepthMm: 6 },
    { label: '0V', face: 'front', x: 0.5, y: 0.757, z: 1, diameterMm: 5.1, holeDepthMm: 6 },
    { label: 'RESET', face: 'front', x: 0.3, y: 0.229, z: 1, diameterMm: 4, holeDepthMm: 6 },
    { label: 'STATUS', face: 'front', x: 0.703, y: 0.228, z: 1, diameterMm: 4, holeDepthMm: 6 },
  ],
  /**
   * NHD NPB22-D11 (botoneira dupla 22 mm, 1NA + 1NF): os quatro parafusos
   * ficam atrás do corpo, dois por bloco de contactos (13/14 verde, 21/22 vermelho).
   */
  dualPushButtonNpb22D11: [
    { label: '13', face: 'left', x: 0.145, y: 0.176, z: 0.871, diameterMm: 7.3, holeDepthMm: 7 },
    { label: '14', face: 'left', x: 0.145, y: 0.836, z: 0.871, diameterMm: 7.1, holeDepthMm: 7 },
    { label: '21', face: 'right', x: 0.831, y: 0.176, z: 0.871, diameterMm: 7.3, holeDepthMm: 7 },
    { label: '22', face: 'right', x: 0.831, y: 0.836, z: 0.871, diameterMm: 7.1, holeDepthMm: 7 },
  ],
  /** Botão de emergência P20AKR (1NF): os dois parafusos do bloco, atrás. */
  emergencyButton: [
    { label: '21', face: 'back', x: 0.728, y: 0.754, z: 0, diameterMm: 7.3, holeDepthMm: 7 },
    { label: '22', face: 'back', x: 0.728, y: 0.333, z: 0, diameterMm: 7.3, holeDepthMm: 7 },
  ],
  /** Emergência com rearme por chave P20ACR (1NF). */
  emergencyButtonKeyP20ACR: [
    { label: '21', face: 'back', x: 0.724, y: 0.754, z: 0, diameterMm: 7.2, holeDepthMm: 7 },
    { label: '22', face: 'back', x: 0.724, y: 0.333, z: 0, diameterMm: 7.2, holeDepthMm: 7 },
  ],
  /** Sinaleiro AD22-22DS 24 V: dois terminais atrás (X1 +, X2 −). */
  pilotLightAd22: [
    { label: 'X1', face: 'back', x: 0.346, y: 0.5, z: 0.012, diameterMm: 5.8, holeDepthMm: 6 },
    { label: 'X2', face: 'back', x: 0.654, y: 0.5, z: 0.012, diameterMm: 5.8, holeDepthMm: 6 },
  ],
  /**
   * Contator WEG CWC0 9 A (código 12679840, 3 NA de força + 1 NA auxiliar).
   * O GLB tem as dez cavidades de parafuso na face da frente, em duas filas de
   * cinco (Ø6,5 mm). Serigrafia WEG (diagrama CWC0): fila de cima
   * A1 · 1 · 3 · 5 · 13 e, em baixo, A2 · 2 · 4 · 6 · 14.
   */
  contactorWegCWC09: [
    { label: '1L1', face: 'front', x: 0.132, y: 0.187, z: 1, diameterMm: 6.5, holeDepthMm: 3.7 },
    { label: '3L2', face: 'front', x: 0.32, y: 0.187, z: 1, diameterMm: 6.5, holeDepthMm: 3.7 },
    { label: '5L3', face: 'front', x: 0.508, y: 0.187, z: 1, diameterMm: 6.5, holeDepthMm: 3.7 },
    { label: '13', face: 'front', x: 0.695, y: 0.187, z: 1, diameterMm: 6.5, holeDepthMm: 3.7 },
    { label: 'A1', face: 'front', x: 0.883, y: 0.188, z: 1, diameterMm: 6.5, holeDepthMm: 3.7 },
    { label: '2T1', face: 'front', x: 0.132, y: 0.813, z: 1, diameterMm: 6.5, holeDepthMm: 3.7 },
    { label: '4T2', face: 'front', x: 0.32, y: 0.812, z: 1, diameterMm: 6.5, holeDepthMm: 3.7 },
    { label: '6T3', face: 'front', x: 0.508, y: 0.813, z: 1, diameterMm: 6.5, holeDepthMm: 3.7 },
    { label: '14', face: 'front', x: 0.695, y: 0.813, z: 1, diameterMm: 6.5, holeDepthMm: 3.7 },
    { label: 'A2', face: 'front', x: 0.883, y: 0.812, z: 1, diameterMm: 6.5, holeDepthMm: 3.7 },
  ],
  /**
   * Siemens LOGO! 12/24RC (72×90×55 mm). O GLB tem 11 parafusos na régua de
   * cima (L+, M, I1…I8 e o terminal livre X1) e 8 na de baixo: cada saída a
   * relé Q1…Q4 ocupa dois parafusos (contacto seco).
   */
  plcSiemensLogo1224RC: [
    { label: 'L+', face: 'top', x: 0.121, y: 0, z: 0.465, diameterMm: 2.8, holeDepthMm: 6.5 },
    { label: 'M', face: 'top', x: 0.191, y: 0, z: 0.465, diameterMm: 2.8, holeDepthMm: 6.5 },
    { label: 'I1', face: 'top', x: 0.262, y: 0, z: 0.465, diameterMm: 2.8, holeDepthMm: 6.5 },
    { label: 'I2', face: 'top', x: 0.336, y: 0, z: 0.465, diameterMm: 2.5, holeDepthMm: 6.5 },
    { label: 'I3', face: 'top', x: 0.406, y: 0, z: 0.465, diameterMm: 2.5, holeDepthMm: 6.5 },
    { label: 'I4', face: 'top', x: 0.477, y: 0, z: 0.465, diameterMm: 2.5, holeDepthMm: 6.5 },
    { label: 'I5', face: 'top', x: 0.547, y: 0, z: 0.465, diameterMm: 2.5, holeDepthMm: 6.5 },
    { label: 'I6', face: 'top', x: 0.617, y: 0, z: 0.465, diameterMm: 2.5, holeDepthMm: 6.5 },
    { label: 'I7', face: 'top', x: 0.687, y: 0, z: 0.465, diameterMm: 2.5, holeDepthMm: 6.5 },
    { label: 'I8', face: 'top', x: 0.762, y: 0, z: 0.465, diameterMm: 2.8, holeDepthMm: 6.5 },
    { label: 'X1', face: 'top', x: 0.832, y: 0, z: 0.465, diameterMm: 2.8, holeDepthMm: 6.5 },
    { label: 'Q1', face: 'bottom', x: 0.148, y: 1, z: 0.461, diameterMm: 2.8, holeDepthMm: 6.5 },
    { label: 'Q1.2', face: 'bottom', x: 0.219, y: 1, z: 0.461, diameterMm: 2.8, holeDepthMm: 6.5 },
    { label: 'Q2', face: 'bottom', x: 0.355, y: 1, z: 0.461, diameterMm: 3.1, holeDepthMm: 6.5 },
    { label: 'Q2.2', face: 'bottom', x: 0.426, y: 1, z: 0.461, diameterMm: 3.1, holeDepthMm: 6.5 },
    { label: 'Q3', face: 'bottom', x: 0.562, y: 1, z: 0.461, diameterMm: 2.8, holeDepthMm: 6.5 },
    { label: 'Q3.2', face: 'bottom', x: 0.633, y: 1, z: 0.461, diameterMm: 2.8, holeDepthMm: 6.5 },
    { label: 'Q4', face: 'bottom', x: 0.766, y: 1, z: 0.461, diameterMm: 2.8, holeDepthMm: 6.5 },
    { label: 'Q4.2', face: 'bottom', x: 0.840, y: 1, z: 0.461, diameterMm: 3.1, holeDepthMm: 6.5 },
  ],
  /**
   * Chinfa DRAN120-24A (124,5×64×123,6 mm, ficha p. 4): entrada ⏚ · L · N na
   * régua de baixo (três cavidades Ø8,1 mm medidas no GLB) e saída
   * −V · +V mais o contacto RDY na régua de cima, à mesma distância da frente.
   */
  powerSupplyProauto24A: [
    { label: '-V2', face: 'top', x: 0.18, y: 0, z: 0.848, diameterMm: 8.1, holeDepthMm: 8 },
    { label: '-V1', face: 'top', x: 0.31, y: 0, z: 0.848, diameterMm: 8.1, holeDepthMm: 8 },
    { label: '+V2', face: 'top', x: 0.44, y: 0, z: 0.848, diameterMm: 8.1, holeDepthMm: 8 },
    { label: '+V1', face: 'top', x: 0.57, y: 0, z: 0.848, diameterMm: 8.1, holeDepthMm: 8 },
    { label: 'RDY2', face: 'top', x: 0.70, y: 0, z: 0.848, diameterMm: 8.1, holeDepthMm: 8 },
    { label: 'RDY1', face: 'top', x: 0.83, y: 0, z: 0.848, diameterMm: 8.1, holeDepthMm: 8 },
    { label: 'PE', face: 'bottom', x: 0.352, y: 0.97, z: 0.848, diameterMm: 8.1, holeDepthMm: 8 },
    { label: 'L', face: 'bottom', x: 0.5, y: 0.97, z: 0.848, diameterMm: 8.1, holeDepthMm: 8 },
    { label: 'N', face: 'bottom', x: 0.648, y: 0.97, z: 0.848, diameterMm: 8.1, holeDepthMm: 8 },
  ],
  /**
   * Allen-Bradley Guardmaster MSR127TP (22,6 mm de largura): dois blocos
   * amovíveis, um em cima e outro em baixo, cada um com 8 parafusos em duas
   * colunas. Ordem da documentação MSR127 (frente → trás):
   * cima A1 · S11 · S52 · S12 e 13 · 23 · 33 · 41; baixo A2 · S21 · S22 · S34
   * e 14 · 24 · 34 · 42.
   */
  safetyRelay: [
    { label: 'A1', face: 'top', x: 0.3, y: 0, z: 0.82, diameterMm: 4, holeDepthMm: 6 },
    { label: 'S11', face: 'top', x: 0.3, y: 0, z: 0.62, diameterMm: 4, holeDepthMm: 6 },
    { label: 'S52', face: 'top', x: 0.3, y: 0, z: 0.42, diameterMm: 4, holeDepthMm: 6 },
    { label: 'S12', face: 'top', x: 0.3, y: 0, z: 0.22, diameterMm: 4, holeDepthMm: 6 },
    { label: '13', face: 'top', x: 0.7, y: 0, z: 0.82, diameterMm: 4, holeDepthMm: 6 },
    { label: '23', face: 'top', x: 0.7, y: 0, z: 0.62, diameterMm: 4, holeDepthMm: 6 },
    { label: '33', face: 'top', x: 0.7, y: 0, z: 0.42, diameterMm: 4, holeDepthMm: 6 },
    { label: '41', face: 'top', x: 0.7, y: 0, z: 0.22, diameterMm: 4, holeDepthMm: 6 },
    { label: 'A2', face: 'bottom', x: 0.3, y: 1, z: 0.82, diameterMm: 4, holeDepthMm: 6 },
    { label: 'S21', face: 'bottom', x: 0.3, y: 1, z: 0.62, diameterMm: 4, holeDepthMm: 6 },
    { label: 'S22', face: 'bottom', x: 0.3, y: 1, z: 0.42, diameterMm: 4, holeDepthMm: 6 },
    { label: 'S34', face: 'bottom', x: 0.3, y: 1, z: 0.22, diameterMm: 4, holeDepthMm: 6 },
    { label: '14', face: 'bottom', x: 0.7, y: 1, z: 0.82, diameterMm: 4, holeDepthMm: 6 },
    { label: '24', face: 'bottom', x: 0.7, y: 1, z: 0.62, diameterMm: 4, holeDepthMm: 6 },
    { label: '34', face: 'bottom', x: 0.7, y: 1, z: 0.42, diameterMm: 4, holeDepthMm: 6 },
    { label: '42', face: 'bottom', x: 0.7, y: 1, z: 0.22, diameterMm: 4, holeDepthMm: 6 },
  ],
  /**
   * Siemens TS Adapter IE Basic (6ES7972-0EB00-0XA0): alimentação de 24 V por
   * bornes na traseira (L+ / M / ⏚), RJ45 Ethernet em cima (Ø17,3 medido) e a
   * tomada de serviço na traseira, em baixo.
   */
  siemensTsAdapterIeBasic: [
    { label: 'L+', face: 'back', x: 0.5, y: 0.735, z: 0, diameterMm: 7.8, holeDepthMm: 4 },
    { label: 'M', face: 'back', x: 0.5, y: 0.812, z: 0, diameterMm: 7.4, holeDepthMm: 4 },
    { label: 'ETH', face: 'top', x: 0.541, y: 0.024, z: 0.643, diameterMm: 17.3, holeDepthMm: 4 },
    { label: 'SERVICE', face: 'back', x: 0.5, y: 0.334, z: 0, diameterMm: 7.2, holeDepthMm: 4 },
  ],
  /**
   * SEW DRN80MK4/B3: a caixa de bornes está na face direita do modelo. Placa
   * padrão SEW: fila de cima W2 · U2 · V2, fila de baixo U1 · V1 · W1 e o
   * parafuso de terra por baixo da placa.
   */
  motor3ph: [
    { label: 'W2', face: 'right', x: 0.913, y: 0.445, z: 0.273, diameterMm: 4.8, holeDepthMm: 21 },
    { label: 'U2', face: 'right', x: 0.913, y: 0.445, z: 0.5, diameterMm: 4.8, holeDepthMm: 21 },
    { label: 'V2', face: 'right', x: 0.913, y: 0.445, z: 0.727, diameterMm: 4.8, holeDepthMm: 21 },
    { label: 'U1', face: 'right', x: 0.913, y: 0.786, z: 0.272, diameterMm: 4.8, holeDepthMm: 21 },
    { label: 'V1', face: 'right', x: 0.913, y: 0.786, z: 0.5, diameterMm: 4.8, holeDepthMm: 21 },
    { label: 'W1', face: 'right', x: 0.913, y: 0.786, z: 0.728, diameterMm: 4.8, holeDepthMm: 21 },
    { label: 'PE', face: 'right', x: 0.913, y: 0.953, z: 0.5, diameterMm: 3.9, holeDepthMm: 21 },
  ],
  /**
   * LS Electric XGB XBM-DN32S (82×97,5×30,2 mm): 16 entradas DC na régua de
   * cima e 16 saídas a transístor na de baixo, mais a alimentação de 24 V.
   * Posições distribuídas pela régua medida no GLB (passo regular).
   */
  plcLsXbmDn32s: [
    { label: 'L+', face: 'top', x: 0.04, y: 0, z: 0.5, diameterMm: 3, holeDepthMm: 5 },
    { label: 'M', face: 'bottom', x: 0.04, y: 1, z: 0.5, diameterMm: 3, holeDepthMm: 5 },
    ...Array.from({ length: 16 }, (_, i) => ({ label: `I${i + 1}`, face: 'top' as const, x: 0.12 + i * (0.84 / 15), y: 0, z: 0.5, diameterMm: 3, holeDepthMm: 5 })),
    ...Array.from({ length: 16 }, (_, i) => ({ label: `Q${i + 1}`, face: 'bottom' as const, x: 0.12 + i * (0.84 / 15), y: 1, z: 0.5, diameterMm: 3, holeDepthMm: 5 })),
  ],
  /**
   * Phoenix Contact PTI 6 (3213972): borne de passagem push-in, uma entrada de
   * condutor em cima e outra em baixo, ambas viradas para a frente.
   */
  terminalPhoenixPti6: [
    { label: '1', face: 'front', x: 0.5, y: 0.2, z: 0.78, diameterMm: 4.2, holeDepthMm: 8 },
    { label: '2', face: 'front', x: 0.5, y: 0.8, z: 0.78, diameterMm: 4.2, holeDepthMm: 8 },
  ],
  /** Borne de terra (mesma caixa do borne de passagem): duas entradas PE. */
  terminalPE: [
    { label: 'PE1', face: 'front', x: 0.5, y: 0.2, z: 0.78, diameterMm: 4.2, holeDepthMm: 8 },
    { label: 'PE2', face: 'front', x: 0.5, y: 0.8, z: 0.78, diameterMm: 4.2, holeDepthMm: 8 },
  ],
  /** Multímetro RGK DM-20: fichas banana Ø7 mm na frente (V/Ω/mA e COM). */
  multimeterDm20: [
    { label: 'COM', face: 'front', x: 0.23, y: 0.83, z: 0.886, diameterMm: 7, holeDepthMm: 12 },
    { label: 'VΩmA', face: 'front', x: 0.77, y: 0.83, z: 0.886, diameterMm: 7, holeDepthMm: 12 },
  ],
}

export const REAL_CONTROLS: Partial<Record<ComponentType, RealControlSpot[]>> = {
  /** Manípulo azul original do disjuntor WEG (bascula ON/OFF). */
  breakerWegMdwC10: [{ node: 'WEG_Handle', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' }],
  /** Steck SD C25: o manípulo vai no GLB como `dcsimu_handle_2` (plástico vermelho) e `dcsimu_handle_3` (serigrafia O-OFF). */
  breakerSteckSdC25: [
    { node: 'dcsimu_handle_2', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' },
  ],
}

export const realTerminalsFor = (type: ComponentType): RealTerminalSpot[] | undefined => REAL_TERMINALS[type]
export const realControlsFor = (type: ComponentType): RealControlSpot[] | undefined => REAL_CONTROLS[type]
