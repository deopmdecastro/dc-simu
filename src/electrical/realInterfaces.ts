import type { ComponentType } from '../types'
import { MOTOR_SOCKET_DEPTH, MOTOR_STUD, MOTOR_TERMINAL_ORDER, motorTerminalFraction } from '../three/motorTerminalLayout'
import { getComponentPhysicalSizeMm } from '../three/modelPaths'

/**
 * Interfaces REAIS dos modelos 3D: onde ficam mesmo os encaixes dos cabos em
 * cada aparelho, e que peça do GLB se mexe quando o aparelho é operado.
 *
 * Posições verificadas por raios contra o GLB no referencial final de modelFit.
 * SafetyRelay e PLC LS incluem réguas vazadas acrescentadas ao CAD; o motor usa
 * a caixa funcional de sete ligações. `test:terminal-geometry` verifica cada encaixe.
 * A associação entre rótulo e ligação mantém o contrato elétrico existente.
 * É o valor por omissão global:
 * qualquer componente novo nasce já com os bornes nos sítios certos.
 *
 * Coordenadas normalizadas na caixa do componente, como `position3D`:
 *   x: 0 = esquerda, 1 = direita · y: 0 = TOPO, 1 = base (medido de cima para baixo) · z: 0 = trás, 1 = frente.
 * ATENÇÃO: o `position3D` do borne usa y = 1 no topo; `realTerminalPosition` inverte o y e recua o
 * borne para dentro do furo. Estes valores NÃO se copiam diretamente para `position3D`.
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
   * para dentro do furo (um terço da profundidade, entre 1 e 3 mm), para o cabo
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

/** Normal da face virada para dentro, em coordenadas normalizadas (x, y com 0 = topo, z). */
export const FACE_INWARD: Record<RealTerminalSpot['face'], [number, number, number]> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, -1],
  back: [0, 0, 1],
  left: [1, 0, 0],
  right: [-1, 0, 0],
}

/** Ponto de ligação dentro do encaixe medido, na convenção 3D (Y=1 no topo). */
export function realTerminalPosition(type: ComponentType, spot: RealTerminalSpot): { x: number; y: number; z: number } {
  const size = getComponentPhysicalSizeMm(type)
  const inset = size ? terminalInsetMm(spot) : 0
  const [nx, ny, nz] = FACE_INWARD[spot.face]
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  return {
    x: clamp(spot.x + (size ? nx * inset / size.width : 0)),
    y: 1 - clamp(spot.y + (size ? ny * inset / size.height : 0)),
    z: clamp(spot.z + (size ? nz * inset / size.depth : 0)),
  }
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
  breakerSteckSdC25: [
    {"label":"1","face":"top","x":0.501124,"y":0.011678,"z":0.367237,"diameterMm":11.3,"holeDepthMm":13.494},
    {"label":"2","face":"bottom","x":0.501124,"y":0.978464,"z":0.368237,"diameterMm":11.3,"holeDepthMm":13.494},
  ],
  motorBreakerPkzmC10: [
    {"label":"1","face":"top","x":0.19,"y":0.017667,"z":0.497,"diameterMm":9,"holeDepthMm":6.537},
    {"label":"3","face":"top","x":0.5,"y":0.017667,"z":0.497,"diameterMm":9,"holeDepthMm":6.528},
    {"label":"5","face":"top","x":0.81,"y":0.017667,"z":0.497,"diameterMm":9,"holeDepthMm":6.537},
    {"label":"2","face":"bottom","x":0.19,"y":0.982333,"z":0.497,"diameterMm":9,"holeDepthMm":6.537},
    {"label":"4","face":"bottom","x":0.5,"y":0.982333,"z":0.497,"diameterMm":9,"holeDepthMm":6.528},
    {"label":"6","face":"bottom","x":0.81,"y":0.982333,"z":0.497,"diameterMm":9,"holeDepthMm":6.537},
  ],
  breaker1p: [
    {"label":"1","face":"top","x":0.5,"y":0.011834,"z":0.287,"diameterMm":9,"holeDepthMm":15},
    {"label":"2","face":"bottom","x":0.5,"y":0.95858,"z":0.287,"diameterMm":9,"holeDepthMm":15},
  ],
  breaker2p: [
    {"label":"1","face":"top","x":0.254,"y":0.011834,"z":0.284,"diameterMm":9,"holeDepthMm":15},
    {"label":"3","face":"top","x":0.746,"y":0.011834,"z":0.284,"diameterMm":9,"holeDepthMm":15},
    {"label":"2","face":"bottom","x":0.254,"y":0.95858,"z":0.284,"diameterMm":9,"holeDepthMm":15},
    {"label":"4","face":"bottom","x":0.746,"y":0.95858,"z":0.284,"diameterMm":9,"holeDepthMm":15},
  ],
  breaker3p: [
    {"label":"1","face":"top","x":0.169,"y":0.011834,"z":0.284,"diameterMm":9,"holeDepthMm":15},
    {"label":"3","face":"top","x":0.497,"y":0.011834,"z":0.284,"diameterMm":9,"holeDepthMm":15},
    {"label":"5","face":"top","x":0.825,"y":0.011834,"z":0.284,"diameterMm":9,"holeDepthMm":15},
    {"label":"2","face":"bottom","x":0.169,"y":0.95858,"z":0.284,"diameterMm":9,"holeDepthMm":15},
    {"label":"4","face":"bottom","x":0.497,"y":0.95858,"z":0.284,"diameterMm":9,"holeDepthMm":15},
    {"label":"6","face":"bottom","x":0.825,"y":0.95858,"z":0.284,"diameterMm":9,"holeDepthMm":15},
  ],
  phoenixEcb3000760: [
    {"label":"Line+","face":"top","x":0.5,"y":0,"z":0.254,"diameterMm":10.8,"holeDepthMm":12.75},
    {"label":"LOAD+","face":"bottom","x":0.5,"y":1,"z":0.254,"diameterMm":10.8,"holeDepthMm":12.75},
    {"label":"0V","face":"front","x":0.5,"y":0.757,"z":0.970962,"diameterMm":5.1,"holeDepthMm":7.283},
    {"label":"RESET","face":"front","x":0.3,"y":0.229,"z":0.969549,"diameterMm":4,"holeDepthMm":7.168},
    {"label":"STATUS","face":"front","x":0.703,"y":0.228,"z":0.969468,"diameterMm":4,"holeDepthMm":7.161},
  ],
  dualPushButtonNpb22D11: [
    {"label":"13","face":"left","x":0.144468,"y":0.176,"z":0.129,"diameterMm":7.3,"holeDepthMm":4.202},
    {"label":"14","face":"left","x":0.144932,"y":0.836,"z":0.129,"diameterMm":7.1,"holeDepthMm":4.18},
    {"label":"21","face":"right","x":0.830946,"y":0.176,"z":0.129,"diameterMm":7.3,"holeDepthMm":4.202},
    {"label":"22","face":"right","x":0.830482,"y":0.836,"z":0.129,"diameterMm":7.1,"holeDepthMm":4.18},
  ],
  // P20AKR: os parafusos 21/22 estão no bloco de contactos, ATRÁS da chapa (a cabeça
  // opera pela frente). Com a profundidade já não espelhada, o bloco fica em z ≈ 0.
  emergencyButton: [
    {"label":"21","face":"back","x":0.728,"y":0.754,"z":0.001318,"diameterMm":7.3,"holeDepthMm":3.507},
    {"label":"22","face":"back","x":0.728,"y":0.333,"z":0.001318,"diameterMm":7.3,"holeDepthMm":3.507},
  ],
  emergencyButtonKeyP20ACR: [
    {"label":"21","face":"back","x":0.724,"y":0.754,"z":0.001035,"diameterMm":7.2,"holeDepthMm":3.514},
    {"label":"22","face":"back","x":0.724,"y":0.333,"z":0.001035,"diameterMm":7.2,"holeDepthMm":3.514},
  ],
  pilotLightAd22: [
    {"label":"X1","face":"back","x":0.346,"y":0.5,"z":0,"diameterMm":5.8,"holeDepthMm":7.2},
    {"label":"X2","face":"back","x":0.654,"y":0.5,"z":0,"diameterMm":5.8,"holeDepthMm":7.2},
  ],
  contactorWegCWC09: [
    {"label":"1L1","face":"top","x":0.133,"y":0.09861,"z":0.828,"diameterMm":5,"holeDepthMm":4.283},
    {"label":"3L2","face":"top","x":0.32,"y":0.09861,"z":0.828,"diameterMm":5,"holeDepthMm":4.282},
    {"label":"5L3","face":"top","x":0.51,"y":0.09861,"z":0.828,"diameterMm":5,"holeDepthMm":4.287},
    {"label":"13","face":"top","x":0.697,"y":0.09861,"z":0.828,"diameterMm":5,"holeDepthMm":4.283},
    {"label":"A1","face":"top","x":0.886,"y":0.09861,"z":0.828,"diameterMm":5,"holeDepthMm":4.287},
    {"label":"2T1","face":"bottom","x":0.133,"y":0.90139,"z":0.828,"diameterMm":5,"holeDepthMm":4.084},
    {"label":"4T2","face":"bottom","x":0.32,"y":0.90139,"z":0.828,"diameterMm":5,"holeDepthMm":4.081},
    {"label":"6T3","face":"bottom","x":0.51,"y":0.90139,"z":0.828,"diameterMm":5,"holeDepthMm":4.087},
    {"label":"14","face":"bottom","x":0.697,"y":0.90139,"z":0.828,"diameterMm":5,"holeDepthMm":4.084},
    {"label":"A2","face":"bottom","x":0.886,"y":0.90139,"z":0.828,"diameterMm":5,"holeDepthMm":4.087},
  ],
  plcSiemensLogo1224RC: [
    {"label":"L+","face":"top","x":0.121,"y":0,"z":0.465,"diameterMm":2.8,"holeDepthMm":7.027},
    {"label":"M","face":"top","x":0.191,"y":0,"z":0.465,"diameterMm":2.8,"holeDepthMm":7.023},
    {"label":"I0.0","face":"top","x":0.262,"y":0,"z":0.465,"diameterMm":2.8,"holeDepthMm":7.023},
    {"label":"I0.1","face":"top","x":0.336,"y":0,"z":0.465,"diameterMm":2.5,"holeDepthMm":7.015},
    {"label":"I0.2","face":"top","x":0.406,"y":0,"z":0.465,"diameterMm":2.5,"holeDepthMm":7.022},
    {"label":"I0.3","face":"top","x":0.477,"y":0,"z":0.465,"diameterMm":2.5,"holeDepthMm":7.022},
    {"label":"I0.4","face":"top","x":0.547,"y":0,"z":0.465,"diameterMm":2.5,"holeDepthMm":7.028},
    {"label":"I0.5","face":"top","x":0.617,"y":0,"z":0.465,"diameterMm":2.5,"holeDepthMm":7.021},
    {"label":"I0.6","face":"top","x":0.687,"y":0,"z":0.465,"diameterMm":2.5,"holeDepthMm":7.015},
    {"label":"I0.7","face":"top","x":0.762,"y":0,"z":0.465,"diameterMm":2.8,"holeDepthMm":7.017},
    {"label":"X1","face":"top","x":0.832,"y":0,"z":0.465,"diameterMm":2.8,"holeDepthMm":7.024},
    {"label":"Q0.0","face":"bottom","x":0.148,"y":1,"z":0.461,"diameterMm":2.8,"holeDepthMm":5},
    {"label":"Q0.0·2","face":"bottom","x":0.219,"y":1,"z":0.461,"diameterMm":2.8,"holeDepthMm":5},
    {"label":"Q0.1","face":"bottom","x":0.355,"y":1,"z":0.461,"diameterMm":3.1,"holeDepthMm":5},
    {"label":"Q0.1·2","face":"bottom","x":0.426,"y":1,"z":0.461,"diameterMm":3.1,"holeDepthMm":5},
    {"label":"Q0.2","face":"bottom","x":0.562,"y":1,"z":0.461,"diameterMm":2.8,"holeDepthMm":5},
    {"label":"Q0.2·2","face":"bottom","x":0.633,"y":1,"z":0.461,"diameterMm":2.8,"holeDepthMm":5},
    {"label":"Q0.3","face":"bottom","x":0.766,"y":1,"z":0.461,"diameterMm":2.8,"holeDepthMm":5},
    {"label":"Q0.3·2","face":"bottom","x":0.84,"y":1,"z":0.461,"diameterMm":3.1,"holeDepthMm":5},
  ],
  powerSupplyProauto24A: [
    {"label":"-V2","face":"top","x":0.246875,"y":0,"z":0.851618,"diameterMm":8.1,"holeDepthMm":2.911},
    {"label":"-V1","face":"top","x":0.353125,"y":0.007793,"z":0.851618,"diameterMm":8.1,"holeDepthMm":1.94},
    {"label":"+V2","face":"top","x":0.446875,"y":0.007793,"z":0.851618,"diameterMm":8.1,"holeDepthMm":1.94},
    {"label":"+V1","face":"top","x":0.546875,"y":0.007793,"z":0.851618,"diameterMm":8.1,"holeDepthMm":1.94},
    {"label":"RDY2","face":"top","x":0.646875,"y":0.007793,"z":0.851618,"diameterMm":8.1,"holeDepthMm":1.94},
    {"label":"RDY1","face":"top","x":0.746875,"y":0,"z":0.851618,"diameterMm":8.1,"holeDepthMm":2.911},
    {"label":"PE","face":"bottom","x":0.351062,"y":0.97025,"z":0.847515,"diameterMm":8.1,"holeDepthMm":1.94},
    {"label":"L","face":"bottom","x":0.499063,"y":0.97025,"z":0.847515,"diameterMm":8.1,"holeDepthMm":1.94},
    {"label":"N","face":"bottom","x":0.647063,"y":0.97025,"z":0.847515,"diameterMm":8.1,"holeDepthMm":1.94},
  ],
  safetyRelay: [
    {"label":"A1","face":"top","x":0.3,"y":0,"z":0.82,"diameterMm":4,"holeDepthMm":6},
    {"label":"S11","face":"top","x":0.3,"y":0,"z":0.62,"diameterMm":4,"holeDepthMm":6},
    {"label":"S52","face":"top","x":0.3,"y":0,"z":0.42,"diameterMm":4,"holeDepthMm":6},
    {"label":"S12","face":"top","x":0.3,"y":0,"z":0.22,"diameterMm":4,"holeDepthMm":6},
    {"label":"13","face":"top","x":0.7,"y":0,"z":0.82,"diameterMm":4,"holeDepthMm":6},
    {"label":"23","face":"top","x":0.7,"y":0,"z":0.62,"diameterMm":4,"holeDepthMm":6},
    {"label":"33","face":"top","x":0.7,"y":0,"z":0.42,"diameterMm":4,"holeDepthMm":6},
    {"label":"41","face":"top","x":0.7,"y":0,"z":0.22,"diameterMm":4,"holeDepthMm":6},
    {"label":"A2","face":"bottom","x":0.3,"y":1,"z":0.82,"diameterMm":4,"holeDepthMm":6},
    {"label":"S21","face":"bottom","x":0.3,"y":1,"z":0.62,"diameterMm":4,"holeDepthMm":6},
    {"label":"S22","face":"bottom","x":0.3,"y":1,"z":0.42,"diameterMm":4,"holeDepthMm":6},
    {"label":"S34","face":"bottom","x":0.3,"y":1,"z":0.22,"diameterMm":4,"holeDepthMm":6},
    {"label":"14","face":"bottom","x":0.7,"y":1,"z":0.82,"diameterMm":4,"holeDepthMm":6},
    {"label":"24","face":"bottom","x":0.7,"y":1,"z":0.62,"diameterMm":4,"holeDepthMm":6},
    {"label":"34","face":"bottom","x":0.7,"y":1,"z":0.42,"diameterMm":4,"holeDepthMm":6},
    {"label":"42","face":"bottom","x":0.7,"y":1,"z":0.22,"diameterMm":4,"holeDepthMm":6},
  ],
  siemensTsAdapterIeBasic: [
    {"label":"L+","face":"back","x":0.504,"y":0.730075,"z":0.000672,"diameterMm":7.8,"holeDepthMm":4.95},
    {"label":"M","face":"back","x":0.552,"y":0.812379,"z":0.000666,"diameterMm":7.4,"holeDepthMm":4.95},
    {"label":"ETH","face":"top","x":0.448333,"y":0.052853,"z":0.643266,"diameterMm":17.3,"holeDepthMm":10},
    {"label":"SERVICE","face":"back","x":0.449333,"y":0.333242,"z":0.000666,"diameterMm":7.2,"holeDepthMm":4.95},
  ],
  // Medido na caixa de bornes do CAD (ver three/motorTerminalLayout.ts): seis bornes M4
  // com porca-luva sobre a placa isolante e o PE num grampo próprio junto ao bucim.
  motor3ph: MOTOR_TERMINAL_ORDER.map((label) => ({ label, face: 'top' as const, ...motorTerminalFraction(label), diameterMm: label === 'PE' ? 4.2 : MOTOR_STUD.bore, holeDepthMm: MOTOR_SOCKET_DEPTH })),
  // Réguas no topo (L+, I) e na base (M, Q) ao longo da profundidade do corpo slim (trás → frente).
  plcLsXbmDn32s: [
    {"label":"L+","face":"top","x":0.5,"y":0,"z":0.04,"diameterMm":3,"holeDepthMm":5},
    {"label":"M","face":"bottom","x":0.5,"y":1,"z":0.04,"diameterMm":3,"holeDepthMm":5},
    {"label":"I0.0","face":"top","x":0.5,"y":0,"z":0.12,"diameterMm":3,"holeDepthMm":5},
    {"label":"I0.1","face":"top","x":0.5,"y":0,"z":0.176,"diameterMm":3,"holeDepthMm":5},
    {"label":"I0.2","face":"top","x":0.5,"y":0,"z":0.232,"diameterMm":3,"holeDepthMm":5},
    {"label":"I0.3","face":"top","x":0.5,"y":0,"z":0.288,"diameterMm":3,"holeDepthMm":5},
    {"label":"I0.4","face":"top","x":0.5,"y":0,"z":0.344,"diameterMm":3,"holeDepthMm":5},
    {"label":"I0.5","face":"top","x":0.5,"y":0,"z":0.4,"diameterMm":3,"holeDepthMm":5},
    {"label":"I0.6","face":"top","x":0.5,"y":0,"z":0.456,"diameterMm":3,"holeDepthMm":5},
    {"label":"I0.7","face":"top","x":0.5,"y":0,"z":0.512,"diameterMm":3,"holeDepthMm":5},
    {"label":"I1.0","face":"top","x":0.5,"y":0,"z":0.568,"diameterMm":3,"holeDepthMm":5},
    {"label":"I1.1","face":"top","x":0.5,"y":0,"z":0.624,"diameterMm":3,"holeDepthMm":5},
    {"label":"I1.2","face":"top","x":0.5,"y":0,"z":0.68,"diameterMm":3,"holeDepthMm":5},
    {"label":"I1.3","face":"top","x":0.5,"y":0,"z":0.736,"diameterMm":3,"holeDepthMm":5},
    {"label":"I1.4","face":"top","x":0.5,"y":0,"z":0.792,"diameterMm":3,"holeDepthMm":5},
    {"label":"I1.5","face":"top","x":0.5,"y":0,"z":0.848,"diameterMm":3,"holeDepthMm":5},
    {"label":"I1.6","face":"top","x":0.5,"y":0,"z":0.904,"diameterMm":3,"holeDepthMm":5},
    {"label":"I1.7","face":"top","x":0.5,"y":0,"z":0.96,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q0.0","face":"bottom","x":0.5,"y":1,"z":0.12,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q0.1","face":"bottom","x":0.5,"y":1,"z":0.176,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q0.2","face":"bottom","x":0.5,"y":1,"z":0.232,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q0.3","face":"bottom","x":0.5,"y":1,"z":0.288,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q0.4","face":"bottom","x":0.5,"y":1,"z":0.344,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q0.5","face":"bottom","x":0.5,"y":1,"z":0.4,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q0.6","face":"bottom","x":0.5,"y":1,"z":0.456,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q0.7","face":"bottom","x":0.5,"y":1,"z":0.512,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q1.0","face":"bottom","x":0.5,"y":1,"z":0.568,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q1.1","face":"bottom","x":0.5,"y":1,"z":0.624,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q1.2","face":"bottom","x":0.5,"y":1,"z":0.68,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q1.3","face":"bottom","x":0.5,"y":1,"z":0.736,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q1.4","face":"bottom","x":0.5,"y":1,"z":0.792,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q1.5","face":"bottom","x":0.5,"y":1,"z":0.848,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q1.6","face":"bottom","x":0.5,"y":1,"z":0.904,"diameterMm":3,"holeDepthMm":5},
    {"label":"Q1.7","face":"bottom","x":0.5,"y":1,"z":0.96,"diameterMm":3,"holeDepthMm":5},
  ],
  terminalPhoenixPti6: [
    {"label":"1","face":"front","x":0.387117,"y":0.089818,"z":0.763696,"diameterMm":4.2,"holeDepthMm":8.832},
    {"label":"2","face":"front","x":0.387117,"y":0.764876,"z":0.734725,"diameterMm":4.2,"holeDepthMm":8.123},
  ],
  terminalPE: [
    {"label":"PE1","face":"front","x":0.476699,"y":0.112469,"z":1,"diameterMm":4.2,"holeDepthMm":9.35},
    {"label":"PE2","face":"front","x":0.476699,"y":0.892469,"z":1,"diameterMm":4.2,"holeDepthMm":9.35},
  ],
  multimeterDm20: [
    {"label":"COM","face":"front","x":0.769777,"y":0.930647,"z":0.917167,"diameterMm":7,"holeDepthMm":8.419},
    {"label":"VΩ","face":"front","x":0.786597,"y":0.830007,"z":0.883824,"diameterMm":7,"holeDepthMm":12.58},
    {"label":"mA","face":"front","x":0.208857,"y":0.830007,"z":0.878921,"diameterMm":7,"holeDepthMm":12.317},
    {"label":"10A","face":"front","x":0.230223,"y":0.930647,"z":0.917167,"diameterMm":7,"holeDepthMm":8.419},
  ],
}

export const REAL_CONTROLS: Partial<Record<ComponentType, RealControlSpot[]>> = {
  /** Steck SD C25: o manípulo vai no GLB como `dcsimu_handle_2` (plástico vermelho) e `dcsimu_handle_3` (serigrafia O-OFF). */
  breakerSteckSdC25: [
    { node: 'dcsimu_handle_2', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' },
  ],
  /** PKZM C-10: o botão rotativo verde (`dcsimu_handle_1`) e o aro (`dcsimu_handle_2`) rodam juntos de O para I. */
  motorBreakerPkzmC10: [
    { node: 'dcsimu_handle_1', kind: 'toggle', name: 'Botão rotativo O/I', travelMm: 0, variable: 'closed' },
  ],
  /** Easy9: a alavanca de cada polo (`dcsimu_handle_N`) e a barra que as liga (2P/3P) bascúlam juntas. */
  breaker1p: [
    { node: 'dcsimu_handle_1', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' },
  ],
  breaker2p: [
    { node: 'dcsimu_handle_1', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' },
    { node: 'dcsimu_handle_2', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' },
    { node: 'dcsimu_handle_bridge', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' },
  ],
  breaker3p: [
    { node: 'dcsimu_handle_1', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' },
    { node: 'dcsimu_handle_2', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' },
    { node: 'dcsimu_handle_3', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' },
    { node: 'dcsimu_handle_bridge', kind: 'toggle', name: 'Manípulo do disjuntor', travelMm: 0, variable: 'closed' },
  ],
}

export const realTerminalsFor = (type: ComponentType): RealTerminalSpot[] | undefined => REAL_TERMINALS[type]
export const realControlsFor = (type: ComponentType): RealControlSpot[] | undefined => REAL_CONTROLS[type]
