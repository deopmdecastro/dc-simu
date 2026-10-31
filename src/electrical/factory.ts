// ============================================================================
// Fábrica de componentes — biblioteca completa com templates de bornes reais
// (IEC): A1/A2, 1L1/2T1, 13-14, 21-22, 95-96-97-98, U1/V1/W1, V+/0V/OUT…
//
// Cada template define:
//   category        categoria da paleta
//   size            footprint no esquema 2D { w, h }
//   terminals       bornes (rótulo, função, tipo físico, cor, posição 0..1)
//   defaultState    estado inicial em tempo de execução
//   tag             prefixo padrão do TAG (KM, S, F, M, H…)
//   paletteName     nome exibido na biblioteca
// ============================================================================

import { hiddenCatalogTypes } from '../catalog/hidden'
import { importedTemplates, upgradeImportedTerminals } from './importedComponents'
import { FACE_INWARD, terminalInsetMm, realTerminalPosition, leadRootPosition, LEAD_PIGTAIL_LENGTH_MM, REAL_TERMINALS, type RealTerminalSpot } from './realInterfaces'

const FACE_OUTWARD_3D: Record<RealTerminalSpot['face'], [number, number, number]> = {
  front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0],
}
import { LEGACY_REAL_TERMINALS } from './legacyRealInterfaces'
import { parseCatalogType } from '../catalog/types'
import { railWidthPx } from '../three/railMount'
import { nanoid } from 'nanoid'
import type {
  ElectricalComponent,
  ComponentType,
  ComponentCategory,
  Terminal,
  TerminalKind,
  TerminalType,
} from '../types'
import { getDefaultComponent3DPresentation, getDefaultComponentOrientation, getDefaultComponentTerminalViewPositions } from '../three/componentOrientation'
import { getComponentModelSpec, getComponentPhysicalSizeMm, getSchematicPhysicalFootprint } from '../three/modelPaths'

export interface TerminalTemplate {
  label: string
  kind: TerminalKind
  x: number
  y: number
  terminalType?: TerminalType
  color?: string
  /** Diâmetro publicado do encaixe, convertido para a escala do Esquema. */
  diameter?: number
  /** Catálogo: identidade estável, posição 3D normalizada e regras. */
  defId?: string
  electricalClass?: import('../types').TerminalElectricalClass
  position3D?: { x: number; y: number; z: number }
  socket3D?: Terminal['socket3D']
  /** lead = cabo solto com ponta livre; socket = furo/parafuso. */
  contact?: 'socket' | 'pin' | 'lead' | 'surface'
  rules?: { polarity: string; direction: string; accepts: string }
  displayName?: string
}

export interface ComponentTemplate {
  category: ComponentCategory
  paletteName: string
  group: string
  tag: string
  w: number
  h: number
  terminals: TerminalTemplate[]
  defaultState: Record<string, any>
}

/** Cor padrão de um borne a partir da sua função lógica. */
export const KIND_COLOR: Record<TerminalKind, string> = {
  'power-in': '#ef4444',
  'power-out': '#f87171',
  'coil-plus': '#f59e0b',
  'coil-minus': '#38bdf8',
  'aux-no': '#22c55e',
  'aux-nc': '#eab308',
  neutral: '#3b82f6',
  earth: '#84cc16',
  io: '#a855f7',
  analog: '#06b6d4',
  bus: '#94a3b8',
}

const KIND_TYPE: Record<TerminalKind, TerminalType> = {
  'power-in': 'screw',
  'power-out': 'screw',
  'coil-plus': 'screw',
  'coil-minus': 'screw',
  'aux-no': 'spring',
  'aux-nc': 'spring',
  neutral: 'spring',
  earth: 'ring',
  io: 'spring',
  analog: 'plug',
  bus: 'screw',
}

const T = (label: string, kind: TerminalKind, x: number, y: number, extra: Partial<TerminalTemplate> = {}): TerminalTemplate => ({
  ...extra,
  label,
  kind,
  x,
  y,
  terminalType: extra.terminalType ?? KIND_TYPE[kind],
  color: extra.color ?? KIND_COLOR[kind],
})

/** 3 polos de potência (1/2, 3/4, 5/6) — usados por disjuntores e térmicos. */
function poles3(): TerminalTemplate[] {
  return [
    T('1', 'power-in', 0.2, 0), T('2', 'power-out', 0.2, 1),
    T('3', 'power-in', 0.5, 0), T('4', 'power-out', 0.5, 1),
    T('5', 'power-in', 0.8, 0), T('6', 'power-out', 0.8, 1),
  ]
}

/** Bloco de contatores: bobina A1/A2 + 3 polos + auxiliares 13/14 e 21/22. */
function contactorTerminals(poles: number): TerminalTemplate[] {
  const list: TerminalTemplate[] = [
    T('A1', 'coil-plus', 0.08, 0),
    T('A2', 'coil-minus', 0.08, 1),
  ]
  for (let i = 0; i < poles; i++) {
    const x = 0.32 + i * 0.12
    list.push(T(`${1 + i * 2}L${i + 1}`, 'power-in', x, 0))
    list.push(T(`${2 + i * 2}T${i + 1}`, 'power-out', x, 1))
  }
  list.push(T('13', 'aux-no', 0.88, 0), T('14', 'aux-no', 0.88, 0.3))
  list.push(T('21', 'aux-nc', 0.88, 0.65), T('22', 'aux-nc', 0.88, 1))
  return list
}

/** Relé auxiliar: bobina + 1 ou 2 contatos NA/NF. */
function relayTerminals(extraContacts: number): TerminalTemplate[] {
  const list: TerminalTemplate[] = [T('A1', 'coil-plus', 0.15, 0), T('A2', 'coil-minus', 0.15, 1)]
  for (let i = 0; i < extraContacts; i++) {
    const x = 0.55 + i * 0.2
    list.push(T(`1${i}3`, 'aux-no', x, 0), T(`1${i}4`, 'aux-no', x, 0.35))
    list.push(T(`2${i}1`, 'aux-nc', x, 0.65), T(`2${i}2`, 'aux-nc', x, 1))
  }
  return list
}

/**
 * Bornes do Siemens LOGO! 12/24RC (8 entradas digitais DC + 4 saídas a relé),
 * seguindo a disposição real do dispositivo: tira superior L+/M/I0.0..I0.7 e tira
 * inferior com dois parafusos independentes para cada relé Q0.0..Q0.3. O
 * parafuso extra sem legenda na extremidade superior é X1 (19 no total).
 * Todos os bornes são do tipo parafuso, como no equipamento
 * físico.
 */
function plcLogoRCTerminals(): TerminalTemplate[] {
  const top = ['L+', 'M', 'I0.0', 'I0.1', 'I0.2', 'I0.3', 'I0.4', 'I0.5', 'I0.6', 'I0.7']
  const list: TerminalTemplate[] = top.map((lbl, i) =>
    T(lbl, lbl === 'L+' ? 'power-in' : lbl === 'M' ? 'neutral' : 'io', 0.06 + i * (0.88 / (top.length - 1)), 0, {
      terminalType: 'screw',
      color: lbl === 'L+' ? '#f59e0b' : lbl === 'M' ? '#3b82f6' : '#a855f7',
    }),
  )
  list.push(T('X1', 'io', 0.98, 0, { terminalType: 'screw', color: '#94a3b8' }))
  ;['Q0.0', 'Q0.1', 'Q0.2', 'Q0.3'].forEach((lbl, i) => {
    list.push(T(lbl, 'io', 0.16 + i * 0.24, 1, { terminalType: 'screw', color: '#f59e0b' }))
    list.push(T(`${lbl}·2`, 'io', 0.21 + i * 0.24, 1, { terminalType: 'screw', color: '#f59e0b' }))
  })
  return list
}

function plcTerminals(inputs: number, outputs: number): TerminalTemplate[] {
  const list: TerminalTemplate[] = [
    T('L', 'power-in', 0.04, 0.5, { color: '#f59e0b' }),
    T('N', 'neutral', 0.96, 0.5),
  ]
  for (let i = 0; i < inputs; i++) list.push(T(`I${Math.floor(i / 8)}.${i % 8}`, 'io', 0.12 + i * (0.76 / inputs), 0))
  for (let i = 0; i < outputs; i++) list.push(T(`Q${Math.floor(i / 8)}.${i % 8}`, 'io', 0.2 + i * (0.6 / outputs), 1))
  return list
}

/**
 * LS Electric XGB XBM-DN32S: 16 entradas DC e 16 saídas transistor NPN.
 * Vista frontal real (corpo slim de 30 mm): L+ em cima, M em baixo; entradas nas
 * metades de cima das duas arestas (I0.x à esquerda, I1.x à direita) e saídas nas de baixo.
 */
export function lsXbmTerminalLayout(label: string): { x: number; y: number } | null {
  if (label === 'L+') return { x: 0.5, y: 0 }
  if (label === 'M') return { x: 0.5, y: 1 }
  const match = /^([IQ])([01])\.([0-7])$/.exec(label)
  if (!match) return null
  const [, area, byte, bit] = match
  const top = area === 'I' ? 0.08 : 0.56
  return { x: byte === '0' ? 0 : 1, y: top + Number(bit) * (0.36 / 7) }
}

function plcLsXbmDn32sTerminals(): TerminalTemplate[] {
  const at = (label: string) => lsXbmTerminalLayout(label)!
  const list: TerminalTemplate[] = [
    T('L+', 'power-in', at('L+').x, at('L+').y, { terminalType: 'screw', color: '#ef4444' }),
    T('M', 'neutral', at('M').x, at('M').y, { terminalType: 'screw', color: '#3b82f6' }),
  ]
  for (let i = 0; i < 16; i++) {
    const input = `I${Math.floor(i / 8)}.${i % 8}`, output = `Q${Math.floor(i / 8)}.${i % 8}`
    list.push(T(input, 'io', at(input).x, at(input).y, { terminalType: 'screw' }))
    list.push(T(output, 'io', at(output).x, at(output).y, { terminalType: 'screw' }))
  }
  return list
}

export const TEMPLATES: Record<ComponentType, ComponentTemplate> = {
  ...importedTemplates(),
  // ---------------- Proteção ----------------
  breaker1p: {
    category: 'protection', paletteName: 'Disjuntor Schneider Easy9 EZ9 · 1P', group: 'Proteção', tag: 'QF', w: 60, h: 110,
    terminals: [
      T('1', 'power-in', 0.5, 0, { position3D: { x: 0.5, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('2', 'power-out', 0.5, 1, { position3D: { x: 0.5, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 10 }),
    ],
    defaultState: { closed: true, tripped: false, poles: 1, curve: 'C', inA: 16 },
  },
  breakerSteckSdC25: {
    category: 'protection', paletteName: 'Disjuntor Steck SD C25 · 1P 25 A curva C', group: 'Proteção', tag: 'QF', w: 27, h: 119,
    terminals: [
      T('1', 'power-in', 0.5, 0, { position3D: { x: 0.5, y: 0.0, z: 0.35 }, terminalType: 'screw', diameter: 9 }),
      T('2', 'power-out', 0.5, 1, { position3D: { x: 0.5, y: 1.0, z: 0.35 }, terminalType: 'screw', diameter: 9 }),
    ],
    defaultState: { closed: true, tripped: false, poles: 1, curve: 'C', inA: 25, ue: '230/400 V~ · 50/60 Hz', code: 'SD C25 1P', icn: '3 kA', norm: 'IEC 60898' },
  },
  /**
   * Moeller/Eaton PKZM C-10 (44,7 × 91,8 × 75,5 mm, medido no STEP do fabricante).
   * Disjuntor-motor de 3 polos com botão rotativo O/I, regulação 6,3-10 A.
   * Bornes 1/L1 · 3/L2 · 5/L3 em cima e 2/T1 · 4/T2 · 6/T3 em baixo.
   */
  motorBreakerPkzmC10: {
    category: 'protection', paletteName: 'Disjuntor-motor Eaton/Moeller PKZM C-10 · 3P 6,3-10 A', group: 'Proteção', tag: 'QM', w: 67, h: 138,
    terminals: [
      T('1', 'power-in', 0.19, 0, { position3D: { x: 0.19, y: 0.846, z: 0.497 }, terminalType: 'screw', diameter: 10 }),
      T('3', 'power-in', 0.5, 0, { position3D: { x: 0.5, y: 0.846, z: 0.497 }, terminalType: 'screw', diameter: 10 }),
      T('5', 'power-in', 0.81, 0, { position3D: { x: 0.81, y: 0.846, z: 0.497 }, terminalType: 'screw', diameter: 10 }),
      T('2', 'power-out', 0.19, 1, { position3D: { x: 0.19, y: 0.154, z: 0.497 }, terminalType: 'screw', diameter: 10 }),
      T('4', 'power-out', 0.5, 1, { position3D: { x: 0.5, y: 0.154, z: 0.497 }, terminalType: 'screw', diameter: 10 }),
      T('6', 'power-out', 0.81, 1, { position3D: { x: 0.81, y: 0.154, z: 0.497 }, terminalType: 'screw', diameter: 10 }),
    ],
    defaultState: { closed: false, tripped: false, poles: 3, curve: 'D', inA: 10, rangeA: '6,3 - 10 A', magnetic: 14, ue: '690 V~', code: 'PKZM C-10', norm: 'IEC/EN 60947' },
  },
  breaker2p: {
    category: 'protection', paletteName: 'Disjuntor Schneider Easy9 EZ9 · 2P', group: 'Proteção', tag: 'QF', w: 90, h: 110,
    terminals: [
      T('1', 'power-in', 0.25, 0, { position3D: { x: 0.25, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('2', 'power-out', 0.25, 1, { position3D: { x: 0.25, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('3', 'power-in', 0.75, 0, { position3D: { x: 0.75, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('4', 'power-out', 0.75, 1, { position3D: { x: 0.75, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 10 }),
    ],
    defaultState: { closed: true, tripped: false, poles: 2, curve: 'C', inA: 16 },
  },
  breaker3p: {
    category: 'protection', paletteName: 'Disjuntor Schneider Easy9 EZ9 · 3P', group: 'Proteção', tag: 'QF', w: 120, h: 110,
    terminals: poles3(),
    defaultState: { closed: true, tripped: false, poles: 3, curve: 'C', inA: 25 },
  },
  breaker4p: {
    category: 'protection', paletteName: 'Disjuntor tetrapolar', group: 'Proteção', tag: 'QF', w: 150, h: 110,
    terminals: [
      ...poles3(),
      T('7', 'power-in', 0.93, 0), T('8', 'power-out', 0.93, 1),
    ],
    defaultState: { closed: true, tripped: false, poles: 4, curve: 'C', inA: 25 },
  },
  phoenixEcb3000760: {
    category: 'protection', paletteName: 'Phoenix Contact EC 1 12DC/1A S-R · 3000760', group: 'Proteção', tag: 'QF', w: 76, h: 128,
    // Terminais funcionais conforme ficha, calibrados na face de ligação do módulo.
    terminals: [
      T('Line+', 'power-in', 0.25, 0, { position3D: { x: 0.25, y: 0.88, z: 1 }, terminalType: 'screw', diameter: 9 }),
      T('LOAD+', 'power-out', 0.25, 1, { position3D: { x: 0.25, y: 0.12, z: 1 }, terminalType: 'screw', diameter: 9 }),
      T('0V', 'neutral', 0.75, 1, { position3D: { x: 0.75, y: 0.12, z: 1 }, terminalType: 'screw', diameter: 9 }),
      T('RESET', 'io', 0.75, 0.25, { position3D: { x: 0.75, y: 0.76, z: 1 }, terminalType: 'screw', diameter: 9 }),
      T('STATUS', 'io', 0.75, 0.62, { position3D: { x: 0.75, y: 0.38, z: 1 }, terminalType: 'screw', diameter: 9 }),
    ],
    defaultState: { closed: true, tripped: false },
  },
  motorBreaker: {
    category: 'protection', paletteName: 'Disjuntor-motor', group: 'Proteção', tag: 'QM', w: 120, h: 120,
    terminals: poles3(),
    defaultState: { closed: true, tripped: false, poles: 3, curve: 'D', inA: 6.3, magnetic: 13 },
  },
  residualBreaker: {
    category: 'protection', paletteName: 'Disjuntor DR (30mA)', group: 'Proteção', tag: 'QDR', w: 120, h: 110,
    terminals: [
      ...poles3(),
      T('N1', 'neutral', 0.93, 0), T('N2', 'neutral', 0.93, 1),
    ],
    defaultState: { closed: true, tripped: false, sensmA: 30 },
  },
  fuse: {
    category: 'protection', paletteName: 'Fusível NH/DIAZED', group: 'Proteção', tag: 'F', w: 50, h: 90,
    terminals: [T('IN', 'power-in', 0.5, 0), T('OUT', 'power-out', 0.5, 1)],
    defaultState: { blown: false, inA: 6 },
  },
  fuseHolder: {
    category: 'protection', paletteName: 'Porta-fusível cilíndrico', group: 'Proteção', tag: 'F', w: 60, h: 100,
    terminals: [T('1', 'power-in', 0.5, 0), T('2', 'power-out', 0.5, 1)],
    defaultState: { blown: false, inA: 2 },
  },
  surgeProtector: {
    category: 'protection', paletteName: 'DPS / supressor de surto', group: 'Proteção', tag: 'F', w: 90, h: 110,
    terminals: [
      T('1', 'power-in', 0.25, 0), T('2', 'power-out', 0.25, 1),
      T('3', 'earth', 0.75, 0.5),
    ],
    defaultState: { failed: false, upKv: 1.5 },
  },
  thermalRelay: {
    category: 'protection', paletteName: 'Relé térmico 95/96/97/98', group: 'Proteção', tag: 'RT', w: 120, h: 130,
    terminals: [
      T('1L1', 'power-in', 0.2, 0), T('2T1', 'power-out', 0.2, 1),
      T('3L2', 'power-in', 0.45, 0), T('4T2', 'power-out', 0.45, 1),
      T('5L3', 'power-in', 0.7, 0), T('6T3', 'power-out', 0.7, 1),
      T('95', 'aux-nc', 0.94, 0.25), T('96', 'aux-nc', 0.94, 0.4),
      T('97', 'aux-no', 0.94, 0.6), T('98', 'aux-no', 0.94, 0.75),
    ],
    defaultState: { tripped: false, currentPct: 0, rangeInA: 6, manual: true },
  },

  // ---------------- Comando ----------------
  buttonNO: {
    category: 'command', paletteName: 'Botão NA (verde)', group: 'Comando', tag: 'S', w: 70, h: 80,
    terminals: [T('13', 'aux-no', 0.15, 0.5), T('14', 'aux-no', 0.85, 0.5)],
    defaultState: { pressed: false, momentary: true, color: '#22c55e' },
  },
  buttonNC: {
    category: 'command', paletteName: 'Botão NF (vermelho)', group: 'Comando', tag: 'S', w: 70, h: 80,
    terminals: [T('21', 'aux-nc', 0.15, 0.5), T('22', 'aux-nc', 0.85, 0.5)],
    defaultState: { pressed: false, momentary: true, color: '#ef4444' },
  },
  dualPushButtonNpb22D11: {
    category: 'command', paletteName: 'Botoeira dupla NHD NPB22-D11 · START/STOP', group: 'Comando', tag: 'S', w: 105, h: 100,
    terminals: [
      T('13', 'aux-no', 0.08, 0.30, { terminalType: 'screw', color: '#22c55e' }),
      T('14', 'aux-no', 0.92, 0.30, { terminalType: 'screw', color: '#22c55e' }),
      T('21', 'aux-nc', 0.08, 0.72, { terminalType: 'screw', color: '#ef4444' }),
      T('22', 'aux-nc', 0.92, 0.72, { terminalType: 'screw', color: '#ef4444' }),
    ],
    defaultState: { startPressed: false, stopPressed: false, momentary: true, mountingMm: 22, ithA: 5 },
  },
  emergencyButton: {
    category: 'command', paletteName: 'Botão de emergência Metaltex P20AKR · 1NF', group: 'Comando', tag: 'S', w: 80, h: 80,
    terminals: [T('21', 'aux-nc', 0.15, 0.5), T('22', 'aux-nc', 0.85, 0.5)],
    defaultState: { pressed: false, latched: true, resetMethod: 'giro', color: '#dc2626' },
  },
  emergencyButtonKeyP20ACR: {
    category: 'command', paletteName: 'Botão de emergência Metaltex P20ACR · chave · 1NF', group: 'Comando', tag: 'S', w: 80, h: 88,
    terminals: [
      T('21', 'aux-nc', 0.15, 0.5, { terminalType: 'screw' }),
      T('22', 'aux-nc', 0.85, 0.5, { terminalType: 'screw' }),
    ],
    defaultState: { pressed: false, latched: true, resetMethod: 'chave', color: '#dc2626', mountingMm: 22, ithA: 10 },
  },
  selector2: {
    category: 'command', paletteName: 'Seletor 2 posições', group: 'Comando', tag: 'S', w: 80, h: 80,
    terminals: [T('13', 'aux-no', 0.15, 0.5), T('14', 'aux-no', 0.85, 0.5)],
    defaultState: { pressed: false, position: 0, maintain: true },
  },
  selector3: {
    category: 'command', paletteName: 'Seletor 3 posições', group: 'Comando', tag: 'S', w: 90, h: 80,
    terminals: [
      T('13', 'aux-no', 0.15, 0.3), T('14', 'aux-no', 0.85, 0.3),
      T('23', 'aux-no', 0.15, 0.7), T('24', 'aux-no', 0.85, 0.7),
    ],
    defaultState: { pressed: false, position: 0, maintain: true },
  },
  keySwitch: {
    category: 'command', paletteName: 'Chave com segredo', group: 'Comando', tag: 'S', w: 80, h: 80,
    terminals: [T('13', 'aux-no', 0.15, 0.5), T('14', 'aux-no', 0.85, 0.5)],
    defaultState: { pressed: false, maintain: true },
  },
  footSwitch: {
    category: 'command', paletteName: 'Pedal de comando', group: 'Comando', tag: 'S', w: 70, h: 90,
    terminals: [T('13', 'aux-no', 0.5, 0.1), T('14', 'aux-no', 0.5, 0.9)],
    defaultState: { pressed: false, momentary: true },
  },
  limitSwitch: {
    category: 'command', paletteName: 'Chave fim de curso', group: 'Comando', tag: 'S', w: 90, h: 70,
    terminals: [T('13', 'aux-no', 0.15, 0.5), T('14', 'aux-no', 0.85, 0.5)],
    defaultState: { pressed: false, momentary: true, actuator: 'roller' },
  },

  // ---------------- Sensores ----------------
  proximitySensor: {
    category: 'sensor', paletteName: 'Sensor indutivo PNP (M18)', group: 'Sensores', tag: 'B', w: 80, h: 110,
    terminals: [
      T('V+', 'power-in', 0.2, 0, { color: '#92400e' }),
      T('0V', 'coil-minus', 0.5, 0, { color: '#1d4ed8' }),
      T('OUT', 'io', 0.8, 0, { color: '#111827' }),
    ],
    defaultState: { triggered: false, sensingMm: 8, type: 'PNP', no: true },
  },
  photoSensor: {
    category: 'sensor', paletteName: 'Sensor fotoelétrico', group: 'Sensores', tag: 'B', w: 90, h: 110,
    terminals: [
      T('V+', 'power-in', 0.15, 0, { color: '#92400e' }),
      T('0V', 'coil-minus', 0.4, 0, { color: '#1d4ed8' }),
      T('NO', 'aux-no', 0.65, 0, { color: '#111827' }),
      T('NC', 'aux-nc', 0.9, 0, { color: '#6b7280' }),
    ],
    defaultState: { triggered: false, rangeM: 3, mode: 'diffuse' },
  },
  pressureSwitch: {
    category: 'sensor', paletteName: 'Pressostato', group: 'Sensores', tag: 'B', w: 80, h: 90,
    terminals: [T('C', 'aux-no', 0.15, 0.5), T('NA', 'aux-no', 0.85, 0.3), T('NF', 'aux-nc', 0.85, 0.75)],
    defaultState: { triggered: false, bar: 6 },
  },
  thermostat: {
    category: 'sensor', paletteName: 'Termostato', group: 'Sensores', tag: 'B', w: 80, h: 90,
    terminals: [T('1', 'aux-no', 0.15, 0.5), T('2', 'aux-no', 0.85, 0.5)],
    defaultState: { triggered: false, celsius: 60 },
  },
  floatSwitch: {
    category: 'sensor', paletteName: 'Boia / chave de nível', group: 'Sensores', tag: 'B', w: 80, h: 90,
    terminals: [T('C', 'aux-no', 0.15, 0.5), T('NA', 'aux-no', 0.85, 0.3), T('NF', 'aux-nc', 0.85, 0.75)],
    defaultState: { triggered: false, level: 'alto' },
  },

  // ---------------- Contatores ----------------
  // Contator WEG da familia CWC (tripolar, 3 NA + 1 NA auxiliar). Os bornes
  // seguem a serigrafia real do aparelho: 1L1/2T1, 3L2/4T2, 5L3/6T3 nas tres
  // colunas de forca, 13/14 no contato auxiliar, 21/22 no contato fechado
  // (o CWC07/CWC09 10E tem ambos) e a bobina em A1/A2.
  contactorWegCWC09: {
    category: 'contactor', paletteName: 'Contator WEG CWC09 · 9 A (3NA + 1NA)', group: 'Contatores', tag: 'KM', w: 150, h: 150,
    terminals: [
      T('1L1', 'power-in', 0.20, 0, { terminalType: 'screw', color: '#ef4444' }),
      T('3L2', 'power-in', 0.36, 0, { terminalType: 'screw', color: '#f8fafc' }),
      T('5L3', 'power-in', 0.52, 0, { terminalType: 'screw', color: '#1d4ed8' }),
      T('13', 'aux-no', 0.68, 0, { terminalType: 'screw', color: '#22c55e' }),
      T('14', 'aux-no', 0.84, 0, { terminalType: 'screw', color: '#22c55e' }),
      T('2T1', 'power-out', 0.20, 1, { terminalType: 'screw', color: '#ef4444' }),
      T('4T2', 'power-out', 0.36, 1, { terminalType: 'screw', color: '#f8fafc' }),
      T('6T3', 'power-out', 0.52, 1, { terminalType: 'screw', color: '#1d4ed8' }),
      T('21', 'aux-nc', 0.68, 1, { terminalType: 'screw', color: '#eab308' }),
      T('22', 'aux-nc', 0.84, 1, { terminalType: 'screw', color: '#eab308' }),
      T('A1', 'coil-plus', 0.06, 0.18, { terminalType: 'screw', color: '#f59e0b' }),
      T('A2', 'coil-minus', 0.06, 0.82, { terminalType: 'screw', color: '#38bdf8' }),
    ],
    defaultState: { energized: false, interlockWith: null, poles: 3, ie: 9, code: '12679840', coil: '42 V 50 Hz / 48 V 60 Hz' },
  },
  contactor: {
    category: 'contactor', paletteName: 'Contator tripolar (KM)', group: 'Contatores', tag: 'KM', w: 130, h: 120,
    terminals: contactorTerminals(3),
    defaultState: { energized: false, interlockWith: null, poles: 3 },
  },
  contactor4p: {
    category: 'contactor', paletteName: 'Contator tetrapolar (KM)', group: 'Contatores', tag: 'KM', w: 150, h: 120,
    terminals: [...contactorTerminals(3), T('7', 'neutral', 0.76, 0), T('8', 'neutral', 0.76, 1)],
    defaultState: { energized: false, interlockWith: null, poles: 4 },
  },
  auxContactBlock: {
    category: 'contactor', paletteName: 'Bloco de contato auxiliar', group: 'Contatores', tag: 'KA', w: 70, h: 80,
    terminals: [T('13', 'aux-no', 0.2, 0.5), T('14', 'aux-no', 0.8, 0.5), T('21', 'aux-nc', 0.2, 0.9), T('22', 'aux-nc', 0.8, 0.9)],
    defaultState: { closed: true },
  },

  // ---------------- Relés ----------------
  auxRelay: {
    category: 'relay', paletteName: 'Relé auxiliar 1NA+1NF', group: 'Relés', tag: 'KA', w: 90, h: 120,
    terminals: relayTerminals(1),
    defaultState: { energized: false },
  },
  auxRelay4: {
    category: 'relay', paletteName: 'Relé auxiliar 2NA+2NF', group: 'Relés', tag: 'KA', w: 110, h: 120,
    terminals: relayTerminals(2),
    defaultState: { energized: false },
  },
  timerRelayTON: {
    category: 'relay', paletteName: 'Relé temporizador TON', group: 'Relés', tag: 'KT', w: 100, h: 120,
    terminals: relayTerminals(1),
    defaultState: { energized: false, done: false, presetMs: 3000, elapsedMs: 0, running: false },
  },
  timerRelayTOF: {
    category: 'relay', paletteName: 'Relé temporizador TOF', group: 'Relés', tag: 'KT', w: 100, h: 120,
    terminals: relayTerminals(1),
    defaultState: { energized: false, done: false, presetMs: 3000, elapsedMs: 0, running: false, offDelay: true },
  },
  timerRelayStarDelta: {
    category: 'relay', paletteName: 'Temporizador estrela-triângulo', group: 'Relés', tag: 'KT', w: 110, h: 120,
    terminals: [
      T('A1', 'coil-plus', 0.12, 0), T('A2', 'coil-minus', 0.12, 1),
      T('13', 'aux-no', 0.5, 0), T('14', 'aux-no', 0.5, 0.35),
      T('23', 'aux-no', 0.8, 0), T('24', 'aux-no', 0.8, 0.35),
      T('31', 'aux-nc', 0.5, 0.65), T('32', 'aux-nc', 0.5, 1),
    ],
    defaultState: { energized: false, starDone: false, deltaDone: false, presetMs: 4000, transitionMs: 50, elapsedMs: 0 },
  },
  counterRelay: {
    category: 'relay', paletteName: 'Relé contador CTU/CTD', group: 'Relés', tag: 'KC', w: 100, h: 120,
    terminals: [
      T('A1', 'coil-plus', 0.15, 0), T('A2', 'coil-minus', 0.15, 1),
      T('13', 'aux-no', 0.6, 0), T('14', 'aux-no', 0.6, 0.35),
      T('21', 'aux-nc', 0.6, 0.65), T('22', 'aux-nc', 0.6, 1),
    ],
    defaultState: { energized: false, count: 0, preset: 5, done: false },
  },
  safetyRelay: {
    category: 'relay', paletteName: 'Relé de segurança Allen-Bradley Guardmaster MSR127TP', group: 'Relés', tag: 'KS', w: 150, h: 145,
    // 24 V AC/DC, dois canais, reset auto/manual, 3 saídas de segurança NA
    // e uma saída auxiliar NF. Serigrafia segundo a documentação MSR127TP.
    terminals: [
      T('A1', 'coil-plus', 0.06, 0, { terminalType: 'screw' }),
      T('S11', 'io', 0.19, 0, { terminalType: 'screw' }),
      T('S12', 'io', 0.32, 0, { terminalType: 'screw' }),
      T('S21', 'io', 0.45, 0, { terminalType: 'screw' }),
      T('S22', 'io', 0.58, 0, { terminalType: 'screw' }),
      T('S34', 'io', 0.71, 0, { terminalType: 'screw' }),
      T('41', 'aux-nc', 0.84, 0, { terminalType: 'screw' }),
      T('42', 'aux-nc', 0.96, 0, { terminalType: 'screw' }),
      T('A2', 'coil-minus', 0.06, 1, { terminalType: 'screw' }),
      // S52 (reset monitorizado) existe no CAD; sem posição própria no esquema ficava a 3 px de S12.
      T('S52', 'io', 0.15, 1, { terminalType: 'screw' }),
      T('13', 'aux-no', 0.24, 1, { terminalType: 'screw' }),
      T('14', 'aux-no', 0.36, 1, { terminalType: 'screw' }),
      T('23', 'aux-no', 0.49, 1, { terminalType: 'screw' }),
      T('24', 'aux-no', 0.61, 1, { terminalType: 'screw' }),
      T('33', 'aux-no', 0.74, 1, { terminalType: 'screw' }),
      T('34', 'aux-no', 0.86, 1, { terminalType: 'screw' }),
    ],
    defaultState: { energized: false, tripped: false, dualChannel: true, supply: '24 V AC/DC', reset: 'auto/manual', safetyCategory: 'Cat. 4 / PLe / SIL 3' },
  },

  // ---------------- Sinalização ----------------
  ledGreen: {
    category: 'signaling', paletteName: 'Sinaleiro LED verde 22mm', group: 'Sinalização', tag: 'H', w: 50, h: 70,
    terminals: [T('X1', 'io', 0.5, 0.1, { color: '#ef4444' }), T('X2', 'io', 0.5, 0.9, { color: '#3b82f6' })],
    defaultState: { on: false, color: '#22c55e', voltage: '230V' },
  },
  ledRed: {
    category: 'signaling', paletteName: 'Sinaleiro LED vermelho 22mm', group: 'Sinalização', tag: 'H', w: 50, h: 70,
    terminals: [T('X1', 'io', 0.5, 0.1, { color: '#ef4444' }), T('X2', 'io', 0.5, 0.9, { color: '#3b82f6' })],
    defaultState: { on: false, color: '#ef4444', voltage: '230V' },
  },
  ledYellow: {
    category: 'signaling', paletteName: 'Sinaleiro LED amarelo 22mm', group: 'Sinalização', tag: 'H', w: 50, h: 70,
    terminals: [T('X1', 'io', 0.5, 0.1, { color: '#ef4444' }), T('X2', 'io', 0.5, 0.9, { color: '#3b82f6' })],
    defaultState: { on: false, color: '#eab308', voltage: '230V' },
  },
  ledWhite: {
    category: 'signaling', paletteName: 'Sinaleiro LED branco 22mm', group: 'Sinalização', tag: 'H', w: 50, h: 70,
    terminals: [T('X1', 'io', 0.5, 0.1, { color: '#ef4444' }), T('X2', 'io', 0.5, 0.9, { color: '#3b82f6' })],
    defaultState: { on: false, color: '#f8fafc', voltage: '24V' },
  },
  pilotLightAd22: {
    category: 'signaling', paletteName: 'Sinaleiro LED AD22-22DS · 24 V', group: 'Sinalização', tag: 'H', w: 70, h: 82,
    terminals: [
      T('X1', 'io', 0.5, 0.08, { color: '#ef4444', terminalType: 'screw' }),
      T('X2', 'io', 0.5, 0.92, { color: '#3b82f6', terminalType: 'screw' }),
    ],
    defaultState: {
      on: false, color: '#ef4444', model: 'AD22-22DS', voltage: '24 V AC/DC', lamp: 'LED',
      mountingDiameterMm: 22, currentMa: 20, serviceLifeHours: 30000,
      protection: 'IP40 (série)', operatingTemperature: '-25…+55 °C',
    },
  },
  buzzer: {
    category: 'signaling', paletteName: 'Buzzer / sirene', group: 'Sinalização', tag: 'HA', w: 60, h: 80,
    terminals: [T('X1', 'io', 0.5, 0.1, { color: '#ef4444' }), T('X2', 'io', 0.5, 0.9, { color: '#3b82f6' })],
    defaultState: { on: false, db: 90 },
  },
  towerLight: {
    category: 'signaling', paletteName: 'Torre de sinalização', group: 'Sinalização', tag: 'H', w: 70, h: 120,
    terminals: [
      T('R', 'io', 0.2, 1, { color: '#ef4444' }),
      T('Y', 'io', 0.5, 1, { color: '#eab308' }),
      T('G', 'io', 0.8, 1, { color: '#22c55e' }),
    ],
    defaultState: { red: false, yellow: false, green: false, on: false },
  },

  // ---------------- Motores / acionamentos ----------------
  motor3ph: {
    category: 'motor', paletteName: 'Motor SEW DRN80MK4/B3 · 0,55 kW', group: 'Motores', tag: 'M', w: 140, h: 120,
    terminals: [
      T('U1', 'power-in', 0.25, 0, { position3D: { x: 0.28, y: 1, z: 0.34 }, terminalType: 'screw', diameter: 11 }),
      T('V1', 'power-in', 0.5, 0, { position3D: { x: 0.5, y: 1, z: 0.34 }, terminalType: 'screw', diameter: 11 }),
      T('W1', 'power-in', 0.75, 0, { position3D: { x: 0.72, y: 1, z: 0.34 }, terminalType: 'screw', diameter: 11 }),
      T('W2', 'coil-minus', 0.25, 1, { position3D: { x: 0.28, y: 1, z: 0.7 }, terminalType: 'screw', diameter: 11 }),
      T('U2', 'coil-minus', 0.5, 1, { position3D: { x: 0.5, y: 1, z: 0.7 }, terminalType: 'screw', diameter: 11 }),
      T('V2', 'coil-minus', 0.75, 1, { position3D: { x: 0.72, y: 1, z: 0.7 }, terminalType: 'screw', diameter: 11 }),
      T('PE', 'earth', 0.93, 0.5, { position3D: { x: 0.9, y: 1, z: 0.52 }, terminalType: 'screw', diameter: 11 }),
    ],
    // Valores da ficha CADENAS/3Dfindit recebida com o modelo DRN80MK4-B3.
    // motorConnection: 'star' | 'delta' — define a ligação dos enrolamentos (estrela ou triângulo).
    // Em estrela: W2-U2-V2 interligados (tensão de fase = linha/√3). Em triângulo: U1-W2, V1-U2, W1-V2.
    defaultState: {
      running: false, direction: 'stopped', rpmVisual: 0, tripped: false,
      manufacturer: 'SEW-EURODRIVE', model: 'DRN80MK4/B3', mounting: 'B3', frame: 80,
      phases: 3, powerKw: 0.55, cv: 0.75, rpm: 1435, frequencyHz: 50, voltage: '400V', currentA: 1.29,
      cosPhi: 0.75, torqueNm: 3.65, massKg: 11, motorConnection: 'star', // opção: 'star' | 'delta'
    },
  },
  motor1ph: {
    category: 'motor', paletteName: 'Motor monofásico · azul DC-Simu', group: 'Motores', tag: 'M', w: 120, h: 120,
    terminals: [
      T('U1', 'power-in', 0.25, 0, { position3D: { x: 0.28, y: 1, z: 0.34 }, terminalType: 'screw', diameter: 11 }),
      T('U2', 'coil-minus', 0.75, 0, { position3D: { x: 0.72, y: 1, z: 0.34 }, terminalType: 'screw', diameter: 11 }),
      T('PE', 'earth', 0.5, 1, { position3D: { x: 0.5, y: 1, z: 0.52 }, terminalType: 'screw', diameter: 11 }),
    ],
    // Adaptado do motor3ph SEW; cor azul característica DC-Simu para identificação visual no esquema e 3D.
    defaultState: {
      running: false, direction: 'stopped', rpmVisual: 0, tripped: false,
      manufacturer: 'DC-Simu', model: 'Mono 0,37 kW', mounting: 'B3', frame: 71,
      phases: 1, powerKw: 0.37, cv: 0.5, rpm: 1400, frequencyHz: 50, voltage: '230V', currentA: 2.5,
      cosPhi: 0.85, torqueNm: 2.5, massKg: 7, motorConnection: 'single', color: '#2563eb',
    },
  },
  /**
   * Condensador de arranque/funcionamento CBB65 60 µF 450 VAC (Godrej / estilo industrial).
   * Dois terminais de faston no topo. Não polarizado. Usado com motores monofásicos
   * (enrolamento auxiliar) e correção de fator de potência.
   * Modelo de referência: 60uf capacitor godrej.SLDPRT + foto do utilizador.
   */
  capacitorRun60uF: {
    category: 'motor', paletteName: 'Condensador 60 µF · CBB65 450 VAC', group: 'Motores', tag: 'C', w: 70, h: 110,
    terminals: [
      T('1', 'power-in', 0.3, 0, { position3D: { x: 0.32, y: 1, z: 0.55 }, terminalType: 'faston', diameter: 8, color: '#94a3b8' }),
      T('2', 'power-out', 0.7, 0, { position3D: { x: 0.68, y: 1, z: 0.55 }, terminalType: 'faston', diameter: 8, color: '#94a3b8' }),
    ],
    defaultState: {
      capacitanceUf: 60,
      tolerancePct: 5,
      voltageVac: 450,
      frequencyHz: 50,
      temperatureClass: '40/85/21',
      manufacturer: 'Godrej / CBB65',
      model: '60 µF 450 VAC',
      code: 'CBB65',
      failed: false,
    },
  },
  vfd: {
    category: 'drive', paletteName: 'Inversor de frequência (VFD)', group: 'Acionamentos', tag: 'CFW', w: 150, h: 170,
    terminals: [
      T('L1', 'power-in', 0.15, 0), T('L2', 'power-in', 0.3, 0), T('L3', 'power-in', 0.45, 0),
      T('DI1', 'io', 0.65, 0), T('DI2', 'io', 0.8, 0), T('DI3', 'io', 0.95, 0),
      T('U', 'power-out', 0.2, 1), T('V', 'power-out', 0.4, 1), T('W', 'power-out', 0.6, 1),
      T('PE', 'earth', 0.85, 1),
    ],
    defaultState: { enabled: false, running: false, frequencyHz: 0, presetHz: 60, rampMs: 1000, rampUpMs: 3000 },
  },
  softStarter: {
    category: 'drive', paletteName: 'Soft-starter', group: 'Acionamentos', tag: 'SS', w: 140, h: 160,
    terminals: [
      T('L1', 'power-in', 0.2, 0), T('L2', 'power-in', 0.4, 0), T('L3', 'power-in', 0.6, 0),
      T('U', 'power-out', 0.2, 1), T('V', 'power-out', 0.4, 1), T('W', 'power-out', 0.6, 1),
      T('A1', 'coil-plus', 0.85, 0), T('A2', 'coil-minus', 0.85, 1),
    ],
    defaultState: { energized: false, running: false, rampMs: 3000, bypass: false },
  },

  // ---------------- Controladores ----------------
  plcLogo: {
    category: 'controller', paletteName: 'LOGO! / CLP compacto 8I/4Q', group: 'Controladores', tag: 'PLC', w: 190, h: 150,
    terminals: plcTerminals(8, 4),
    defaultState: { inputs: {}, outputs: { 'Q0.0': false, 'Q0.1': false, 'Q0.2': false, 'Q0.3': false }, memories: {} },
  },
  plcSiemensLogo1224RC: {
    category: 'controller', paletteName: 'Siemens LOGO! 12/24RC (8DI/4DQ)', group: 'Controladores', tag: 'PLC', w: 280, h: 190,
    terminals: plcLogoRCTerminals(),
    defaultState: { powered: false, inputs: {}, outputs: { 'Q0.0': false, 'Q0.1': false, 'Q0.2': false, 'Q0.3': false }, memories: {}, pressedButton: null },
  },
  plcLsXbmDn32s: {
    category: 'controller', paletteName: 'CLP LS Electric XGB XBM-DN32S · 16DI/16DO', group: 'Controladores', tag: 'PLC', w: 360, h: 210,
    terminals: plcLsXbmDn32sTerminals(),
    defaultState: {
      powered: false,
      inputs: {},
      outputs: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`Q${Math.floor(i / 8)}.${i % 8}`, false])),
      memories: {},
      supply: '24 V DC',
      outputType: '16 transistor NPN (sink)',
      programCapacity: '10 ksteps',
    },
  },
  siemensTsAdapterIeBasic: {
    category: 'controller', paletteName: 'Siemens SIMATIC TS Adapter IE Basic · 6ES7972-0EB00-0XA0', group: 'Controladores', tag: 'NET', w: 135, h: 180,
    terminals: [
      T('L+', 'power-in', 0.28, 1, { terminalType: 'plug', color: '#ef4444' }),
      T('M', 'neutral', 0.48, 1, { terminalType: 'plug', color: '#3b82f6' }),
      T('ETH', 'io', 0.72, 1, { terminalType: 'plug', color: '#22c55e' }),
      T('SERVICE', 'io', 0.92, 0.55, { terminalType: 'plug', color: '#94a3b8' }),
    ],
    defaultState: { powered: false, supply: '19.2–28.8 V DC', ethernetMbps: 100, service: 'TeleService' },
  },
  plcCompact: {
    category: 'controller', paletteName: 'CLP modular 12I/8Q', group: 'Controladores', tag: 'PLC', w: 240, h: 160,
    terminals: plcTerminals(12, 8),
    defaultState: {
      inputs: {},
      outputs: { 'Q0.0': false, 'Q0.1': false, 'Q0.2': false, 'Q0.3': false, 'Q0.4': false, 'Q0.5': false, 'Q0.6': false, 'Q0.7': false },
      memories: {},
    },
  },
  hmi: {
    category: 'controller', paletteName: 'IHM / painel de operação', group: 'Controladores', tag: 'IHM', w: 170, h: 120,
    terminals: [
      T('L', 'power-in', 0.2, 1, { color: '#f59e0b' }),
      T('N', 'neutral', 0.5, 1),
      T('PE', 'earth', 0.8, 1),
    ],
    defaultState: { on: false, screen: 'menu' },
  },

  // ---------------- Bornes / barras ----------------
  terminalBlock: {
    category: 'terminal', paletteName: 'Borne de passagem 2,5mm²', group: 'Bornes e barras', tag: 'X', w: 90, h: 50,
    terminals: [
      T('T1', 'io', 0.15, 0.5, { terminalType: 'spring' }),
      T('T2', 'io', 0.5, 0.5, { terminalType: 'spring' }),
      T('T3', 'io', 0.85, 0.5, { terminalType: 'spring' }),
    ],
    defaultState: { bridged: true },
  },
  terminalPhoenixPti6: {
    category: 'terminal', paletteName: 'Borne Phoenix Contact PTI 6 · 3213972', group: 'Bornes e barras', tag: 'X', w: 76, h: 118,
    terminals: [
      T('1', 'io', 0.5, 0, { terminalType: 'spring', color: '#f59e0b' }),
      T('2', 'io', 0.5, 1, { terminalType: 'spring', color: '#f59e0b' }),
    ],
    defaultState: { bridged: true, connection: 'Push-in', sectionMm2: 6, maxSectionMm2: 10, nominalA: 41, nominalV: 800, article: '3213972' },
  },
  terminalPE: {
    category: 'terminal', paletteName: 'Borne de terra (verde/amarelo)', group: 'Bornes e barras', tag: 'XPE', w: 70, h: 50,
    terminals: [T('PE1', 'earth', 0.3, 0.5, { color: '#27834a' }), T('PE2', 'earth', 0.7, 0.5, { color: '#27834a' })],
    defaultState: { bridged: true },
  },
  dinRail15x55: {
    category: 'terminal', paletteName: 'Calha DIN perfurada 15×5,5 mm (galvanizada) · 1 m', group: 'Bornes e barras', tag: 'TR', w: 1500, h: 23,
    terminals: [],
    defaultState: { lengthMm: 1000, profile: '15×5,5 mm', finish: 'Aço galvanizado', perforated: true },
  },
  busbarPhase: {
    category: 'terminal', paletteName: 'Barramento de fases L1/L2/L3', group: 'Bornes e barras', tag: 'BL', w: 220, h: 50,
    terminals: [
      T('L1', 'power-in', 0.2, 0.5, { color: '#171717' }),
      T('L2', 'power-in', 0.5, 0.5, { color: '#8b4513' }),
      T('L3', 'power-in', 0.8, 0.5, { color: '#6b7280' }),
    ],
    defaultState: { source: true },
  },
  busbarNeutral: {
    category: 'terminal', paletteName: 'Barramento de neutro', group: 'Bornes e barras', tag: 'BN', w: 180, h: 50,
    terminals: [
      T('N1', 'neutral', 0.25, 0.5),
      T('N2', 'neutral', 0.5, 0.5),
      T('N3', 'neutral', 0.75, 0.5),
    ],
    defaultState: { source: true },
  },
  earthBar: {
    category: 'terminal', paletteName: 'Barra de terra (PE)', group: 'Bornes e barras', tag: 'BPE', w: 180, h: 50,
    terminals: [
      T('PE1', 'earth', 0.3, 0.5, { color: '#27834a' }),
      T('PE2', 'earth', 0.6, 0.5, { color: '#27834a' }),
      T('PE3', 'earth', 0.85, 0.5, { color: '#27834a' }),
    ],
    defaultState: { source: true },
  },
  terminalSet1ph: {
    category: 'terminal', paletteName: 'Conjunto de bornes monofásico · L/N/PE', group: 'Bornes e barras', tag: 'X', w: 135, h: 86,
    terminals: [
      T('L-IN', 'power-in', 1 / 6, 0, { color: '#171717', terminalType: 'screw', position3D: { x: 1 / 6, y: 1, z: 1 } }), T('L-OUT', 'power-out', 1 / 6, 1, { color: '#171717', terminalType: 'screw', position3D: { x: 1 / 6, y: 0, z: 1 } }),
      T('N-IN', 'neutral', 0.50, 0, { color: '#2563eb', terminalType: 'screw', position3D: { x: 0.50, y: 1, z: 1 } }), T('N-OUT', 'neutral', 0.50, 1, { color: '#2563eb', terminalType: 'screw', position3D: { x: 0.50, y: 0, z: 1 } }),
      T('PE-IN', 'earth', 5 / 6, 0, { color: '#27834a', terminalType: 'screw', position3D: { x: 5 / 6, y: 1, z: 1 } }), T('PE-OUT', 'earth', 5 / 6, 1, { color: '#27834a', terminalType: 'screw', position3D: { x: 5 / 6, y: 0, z: 1 } }),
    ],
    defaultState: {},
  },
  terminalSet3ph: {
    category: 'terminal', paletteName: 'Conjunto de bornes trifásico · L1/L2/L3/N/PE', group: 'Bornes e barras', tag: 'X', w: 200, h: 86,
    terminals: [
      T('L1-IN', 'power-in', 0.10, 0, { color: '#171717', terminalType: 'screw', position3D: { x: 0.10, y: 1, z: 1 } }), T('L1-OUT', 'power-out', 0.10, 1, { color: '#171717', terminalType: 'screw', position3D: { x: 0.10, y: 0, z: 1 } }),
      T('L2-IN', 'power-in', 0.30, 0, { color: '#8b4513', terminalType: 'screw', position3D: { x: 0.30, y: 1, z: 1 } }), T('L2-OUT', 'power-out', 0.30, 1, { color: '#8b4513', terminalType: 'screw', position3D: { x: 0.30, y: 0, z: 1 } }),
      T('L3-IN', 'power-in', 0.50, 0, { color: '#6b7280', terminalType: 'screw', position3D: { x: 0.50, y: 1, z: 1 } }), T('L3-OUT', 'power-out', 0.50, 1, { color: '#6b7280', terminalType: 'screw', position3D: { x: 0.50, y: 0, z: 1 } }),
      T('N-IN', 'neutral', 0.70, 0, { color: '#2563eb', terminalType: 'screw', position3D: { x: 0.70, y: 1, z: 1 } }), T('N-OUT', 'neutral', 0.70, 1, { color: '#2563eb', terminalType: 'screw', position3D: { x: 0.70, y: 0, z: 1 } }),
      T('PE-IN', 'earth', 0.90, 0, { color: '#27834a', terminalType: 'screw', position3D: { x: 0.90, y: 1, z: 1 } }), T('PE-OUT', 'earth', 0.90, 1, { color: '#27834a', terminalType: 'screw', position3D: { x: 0.90, y: 0, z: 1 } }),
    ],
    defaultState: {},
  },

  // ---------------- Fontes ----------------
  transformer: {
    category: 'power', paletteName: 'Transformador de comando 380/24V', group: 'Fontes', tag: 'TR', w: 140, h: 130,
    terminals: [
      T('L1', 'power-in', 0.2, 0), T('L2', 'power-in', 0.45, 0),
      T('S1', 'power-out', 0.2, 1), T('S2', 'power-out', 0.45, 1),
      T('PE', 'earth', 0.85, 0.5),
    ],
    defaultState: { primaryV: 380, secondaryV: 24, va: 100, failed: false },
  },
  powerSupplyProauto24A: {
    category: 'power', paletteName: 'Fonte Proauto / DRAN120-24A · 24V 5A', group: 'Fontes', tag: 'PS', w: 145, h: 170,
    // Vista frontal A: pinos 6..1 da esquerda para a direita no topo
    // (V−, V−, V+, V+, RDY, RDY); PE, L, N em baixo — ficha p. 3–4.
    terminals: [
      T('-V2', 'neutral', 0.18, 0, { terminalType: 'screw', color: '#3b82f6' }),
      T('-V1', 'neutral', 0.31, 0, { terminalType: 'screw', color: '#3b82f6' }),
      T('+V2', 'power-out', 0.44, 0, { terminalType: 'screw', color: '#ef4444' }),
      T('+V1', 'power-out', 0.57, 0, { terminalType: 'screw', color: '#ef4444' }),
      T('RDY2', 'aux-no', 0.70, 0, { terminalType: 'screw' }),
      T('RDY1', 'aux-no', 0.83, 0, { terminalType: 'screw' }),
      T('PE', 'earth', 0.30, 1, { terminalType: 'screw', color: '#84cc16' }),
      T('L', 'power-in', 0.50, 1, { terminalType: 'screw', color: '#92400e' }),
      T('N', 'neutral', 0.70, 1, { terminalType: 'screw', color: '#3b82f6' }),
    ],
    defaultState: { powered: false, on: true, outV: 24, amp: 5, watt: 120, powerReady: false },
  },
  powerSupply: {
    category: 'power', paletteName: 'Fonte chaveada 24Vdc', group: 'Fontes', tag: 'PS', w: 120, h: 130,
    terminals: [
      T('L', 'power-in', 0.25, 0, { color: '#f59e0b' }),
      T('N', 'neutral', 0.55, 0, { color: '#3b82f6' }),
      T('+V', 'power-out', 0.25, 1, { color: '#ef4444' }),
      T('-V', 'coil-minus', 0.55, 1, { color: '#1d4ed8' }),
      T('PE', 'earth', 0.85, 0.5),
    ],
    defaultState: { on: true, outV: 24, amp: 5, rippleMv: 50 },
  },
  powerSource1ph: {
    category: 'power', paletteName: 'Fonte AC monofásica · L/N/PE', group: 'Fontes', tag: 'QG', w: 135, h: 95,
    terminals: [
      T('L', 'power-in', 1 / 6, 0, { color: '#171717', terminalType: 'screw', position3D: { x: 1 / 6, y: 1, z: 1 } }),
      T('N', 'neutral', 0.50, 0, { color: '#2563eb', terminalType: 'screw', position3D: { x: 0.50, y: 1, z: 1 } }),
      T('PE', 'earth', 5 / 6, 0, { color: '#27834a', terminalType: 'screw', position3D: { x: 5 / 6, y: 1, z: 1 } }),
    ],
    defaultState: { on: true, nominalV: 230, frequencyHz: 50 },
  },
  powerSource3ph: {
    category: 'power', paletteName: 'Fonte AC trifásica · L1/L2/L3/N/PE', group: 'Fontes', tag: 'QG', w: 205, h: 105,
    terminals: [
      T('L1', 'power-in', 0.10, 0, { color: '#171717', terminalType: 'screw', position3D: { x: 0.10, y: 1, z: 1 } }),
      T('L2', 'power-in', 0.30, 0, { color: '#8b4513', terminalType: 'screw', position3D: { x: 0.30, y: 1, z: 1 } }),
      T('L3', 'power-in', 0.50, 0, { color: '#6b7280', terminalType: 'screw', position3D: { x: 0.50, y: 1, z: 1 } }),
      T('N', 'neutral', 0.70, 0, { color: '#2563eb', terminalType: 'screw', position3D: { x: 0.70, y: 1, z: 1 } }),
      T('PE', 'earth', 0.90, 0, { color: '#27834a', terminalType: 'screw', position3D: { x: 0.90, y: 1, z: 1 } }),
    ],
    defaultState: { on: true, nominalV: 400, frequencyHz: 50 },
  },
  analogAmmeter: {
    category: 'power', paletteName: 'Amperímetro analógico', group: 'Fontes', tag: 'PI', w: 80, h: 80,
    terminals: [T('1', 'io', 0.15, 0.5), T('2', 'io', 0.85, 0.5)],
    defaultState: { reading: 0, scaleInA: 10 },
  },
  multimeterDm20: {
    category: 'measurement', paletteName: 'Multímetro digital RGK DM-20', group: 'Aparelhos de medir', tag: 'MM', w: 132, h: 276,
    terminals: [
      T('COM', 'io', 0.772, 0.93, { defId: 'dm20-com', position3D: { x: 0.77205, y: 0.07044, z: 0.67151 }, terminalType: 'plug', diameter: 8, color: '#111827', electricalClass: 'other' }),
      T('VΩ', 'io', 0.789, 0.829, { defId: 'dm20-volt', position3D: { x: 0.78887, y: 0.17108, z: 0.67391 }, terminalType: 'plug', diameter: 8, color: '#dc2626', electricalClass: 'other' }),
      T('mA', 'io', 0.211, 0.829, { defId: 'dm20-ma', position3D: { x: 0.21113, y: 0.17108, z: 0.67391 }, terminalType: 'plug', diameter: 8, color: '#dc2626', electricalClass: 'other' }),
      T('10A', 'io', 0.228, 0.93, { defId: 'dm20-amp', position3D: { x: 0.22795, y: 0.07044, z: 0.67151 }, terminalType: 'plug', diameter: 8, color: '#dc2626', electricalClass: 'other' }),
    ],
    defaultState: { selector: 'off', hold: false, backlight: false, relative: false },
  },
}

/* ---------------------------------------------------------------------------
   Interfaces reais dos modelos 3D (ver src/electrical/realInterfaces.ts).

   As posições medidas no GLB passam a ser o valor por omissão GLOBAL: todos os
   componentes nascem com os bornes dentro dos encaixes verdadeiros do aparelho,
   tanto na Visualização 3D como no Esquema. Um borne já existente mantém o
   rótulo, o tipo e a identidade (os cabos ligados não se perdem); os que o
   aparelho tem a mais são criados.
--------------------------------------------------------------------------- */
/**
 * Convenção LEGADA (até 2026-10-25): recuava o borne para dentro do furo e usava
 * «y = 0 é o topo» diretamente como `position3D`, onde y = 1 é o topo. Mantida só
 * para reconhecer e migrar projetos guardados com essas posições.
 */
function legacyInsetIntoHole(type: ComponentType, spot: RealTerminalSpot): { x: number; y: number; z: number } {
  const size = getComponentPhysicalSizeMm(type)
  const point = { x: spot.x, y: spot.y, z: spot.z }
  if (!size) return point
  const inset = terminalInsetMm(spot)
  const [nx, ny, nz] = FACE_INWARD[spot.face]
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  return {
    x: clamp(point.x + (nx * inset) / size.width),
    y: clamp(point.y + (ny * inset) / size.height),
    z: clamp(point.z + (nz * inset) / size.depth),
  }
}

/** Coordenadas automáticas da versão anterior: ponto na superfície do aparelho. */
function surfacePosition(spot: RealTerminalSpot): { x: number; y: number; z: number } {
  const point = { x: spot.x, y: 1 - spot.y, z: spot.z }
  if (spot.face === 'top') point.y = 1
  else if (spot.face === 'bottom') point.y = 0
  else if (spot.face === 'front') point.z = 1
  else if (spot.face === 'back') point.z = 0
  else if (spot.face === 'left') point.x = 0
  else point.x = 1
  return point
}

/** Migra posições automáticas antigas (Y invertido ou ponto na superfície).
 *  Preserva bornes movidos à mão e a identidade dos componentes já atualizados. */
export function upgradeRealInterfacePositions(input: ElectricalComponent): ElectricalComponent {
  const c = upgradeImportedTerminals(input, createTerminal)
  const spots = REAL_TERMINALS[c.type]
  if (!spots?.length) return c
  let changed = false
  const repairMeter = c.type === 'multimeterDm20' && c.terminals.length === 2 && c.terminals.some((terminal) => terminal.label === 'VΩmA')
  const terminals = c.terminals.map((terminal) => {
    const label = repairMeter && terminal.label === 'VΩmA' ? 'VΩ' : terminal.label
    const canonical = label === terminal.label ? terminal : { ...terminal, label, defId: 'dm20-volt' }
    if (canonical !== terminal) changed = true
    const spot = spots.find((item) => item.label.toLocaleUpperCase() === label.toLocaleUpperCase())
    const previous = LEGACY_REAL_TERMINALS[c.type]?.find((item) => item.label.toLocaleUpperCase() === terminal.label.toLocaleUpperCase())
    const at = terminal.position3D
    if (!spot || !at || terminal.pinned) return canonical
    const target = realTerminalPosition(c.type, spot)
    if (Math.hypot(at.x - target.x, at.y - target.y, at.z - target.z) < 1e-9) return canonical
    const legacy = legacyInsetIntoHole(c.type, previous ?? spot)
    const surface = surfacePosition(previous ?? spot)
    const inset = realTerminalPosition(c.type, previous ?? spot)
    const matches = (position: { x: number; y: number; z: number }) =>
      Math.abs(at.x - position.x) <= 1e-3 && Math.abs(at.y - position.y) <= 1e-3 && Math.abs(at.z - position.z) <= 1e-3
    if (!matches(legacy) && !matches(surface) && !matches(inset) && !matches(surfacePosition(spot))) return canonical
    changed = true
    return { ...terminal, label, ...(repairMeter ? { defId: label === 'COM' ? 'dm20-com' : 'dm20-volt' } : {}), position3D: target }
  })
  // 3D-DATA-01: S52 do relé de segurança nascia com a posição 3D (x 0,3) como posição 2D, por cima de S12,
  // e com o tipo «power-in». Projetos guardados com essa posição automática passam para a do modelo.
  if (c.type === 'safetyRelay') {
    const template = TEMPLATES.safetyRelay.terminals.find((item) => item.label === 'S52')
    terminals.forEach((terminal, index) => {
      if (!template || terminal.label !== 'S52' || terminal.pinned) return
      const legacy = Math.abs((terminal.x ?? 0) - 0.3) < 1e-6 && (terminal.y ?? 0) === 0
      if (!legacy && terminal.kind !== 'power-in') return
      terminals[index] = { ...terminal, ...(legacy ? { x: template.x, y: template.y } : {}), kind: 'io' }
      changed = true
    })
  }
  if (repairMeter) {
    for (const template of TEMPLATES.multimeterDm20.terminals) {
      if (terminals.some((terminal) => terminal.label === template.label)) continue
      terminals.push({ ...createTerminal(c.id, template.label, template.kind), ...template })
    }
    changed = true
  }
  return changed ? { ...c, terminals } : c
}

function applyRealInterfaces() {
  for (const [type, spots] of Object.entries(REAL_TERMINALS) as Array<[ComponentType, RealTerminalSpot[]]>) {
    const template = TEMPLATES[type]
    if (!template || !spots?.length) continue
    const previous = template.terminals
    template.terminals = spots.map((spot) => {
      const existing = previous.find((item) => item.label.toLocaleUpperCase() === spot.label.toLocaleUpperCase())
      const schematicY = spot.face === 'top' ? 0 : spot.face === 'bottom' ? 1 : spot.y
      const kind: TerminalKind = existing?.kind
        ?? (spot.face === 'top' ? 'power-in' : spot.face === 'bottom' ? 'power-out' : 'io')
      // O desenho 2D já está calibrado (ex.: parafusos do LOGO! sobre o PNG):
      // a interface real só manda na posição 3D, nunca na vista de esquema.
      const tip = realTerminalPosition(type, spot)
      const root = leadRootPosition(type, spot)
      const [inx, iny, inz] = FACE_INWARD[spot.face]
      const isLead = spot.contact === 'lead'
      const leadColor = ({
        R: '#dc2626', Y: '#eab308', G: '#16a34a', COM: '#1e293b',
        'V+': '#92400e', '0V': '#2563eb', OUT: '#111827',
      } as Record<string, string>)[spot.label]
      return T(existing?.label ?? spot.label, kind, existing?.x ?? spot.x, existing?.y ?? schematicY, {
        ...existing,
        position3D: tip,
        diameter: spot.diameterMm ?? existing?.diameter,
        terminalType: isLead ? 'tubular' : (existing?.terminalType ?? 'screw'),
        contact: spot.contact ?? 'socket',
        color: leadColor ?? existing?.color,
        socket3D: isLead
          ? {
              diameterMm: spot.diameterMm ?? 1.5,
              depthMm: LEAD_PIGTAIL_LENGTH_MM,
              insetMm: 0,
              normal: FACE_OUTWARD_3D[spot.face],
              position: root,
            }
          : existing?.socket3D,
      })
    })
  }
}

applyRealInterfaces()

/** Aplica aos conjuntos e fontes a calibração dos furos do PTI6 usado em cada módulo. */
function applyTerminalAssemblyInterfaces() {
  const types: ComponentType[] = ['terminalSet1ph', 'terminalSet3ph', 'powerSource1ph', 'powerSource3ph']
  const module = getComponentPhysicalSizeMm('terminalPhoenixPti6')
  const spots = REAL_TERMINALS.terminalPhoenixPti6
  if (!module || !spots?.length) return
  for (const type of types) {
    const template = TEMPLATES[type]
    const conductors = type.endsWith('1ph') ? ['L', 'N', 'PE'] : ['L1', 'L2', 'L3', 'N', 'PE']
    for (const terminal of template.terminals) {
      const match = /^(L1|L2|L3|L|N|PE)(?:-(IN|OUT))?$/.exec(terminal.label)
      if (!match) continue
      const [, conductor, direction] = match
      const index = conductors.indexOf(conductor)
      if (index < 0) continue
      const spot = spots.find((item) => item.label === (direction === 'OUT' ? '2' : '1'))
      if (!spot) continue
      const position = realTerminalPosition('terminalPhoenixPti6', spot)
      const normalized = { x: (index + position.x) / conductors.length, y: position.y, z: position.z }
      terminal.position3D = normalized
      terminal.socket3D = {
        diameterMm: spot.diameterMm ?? 4.2,
        depthMm: spot.holeDepthMm ?? 5,
        insetMm: terminalInsetMm(spot),
        normal: [0, 0, 1],
        position: normalized,
      }
    }
  }
}

applyTerminalAssemblyInterfaces()

/**
 * Calibração conservadora dos bornes dos CAD integrados. Posições manuais já
 * existentes têm prioridade; os restantes são projetados para a superfície
 * física coerente com a vista elétrica (topo/base ou frente/trás).
 */
export function calibrateModelTerminalTemplates(): void {
  for (const [type, template] of Object.entries(TEMPLATES) as Array<[ComponentType, ComponentTemplate]>) {
    const spec = getComponentModelSpec(type)
    if (!spec) continue
    // Estes modelos têm geometria dedicada calibrada por parafuso no Esquema;
    // não substituir essa calibração fina por projeção genérica.
    const dedicatedGeometry = ['plcSiemensLogo1224RC', 'powerSupplyProauto24A'].includes(type)
    for (const terminal of template.terminals) {
      // A tipologia explícita evita que um modelo publicado dependa do
      // fallback visual. Perfis especiais já definidos nunca são substituídos.
      terminal.terminalType ??= 'screw'
      terminal.diameter ??= terminal.terminalType === 'plug' || terminal.terminalType === 'conical' ? 12 : terminal.terminalType === 'bar' ? 10 : 9
      if (dedicatedGeometry || terminal.position3D) continue
      const x = Math.max(0.025, Math.min(0.975, terminal.x))
      const screenY = Math.max(0.025, Math.min(0.975, terminal.y))
      // Linhas de entrada/saída ficam nas faces superior/inferior. Bornes que
      // aparecem no corpo ficam na face operacional; em comando de painel,
      // os contactos físicos estão atrás do atuador.
      terminal.position3D = screenY <= 0.12
        ? { x, y: 1, z: 1 }
        : screenY >= 0.88
          ? { x, y: 0, z: 1 }
          : spec.placement === 'panel-front'
            ? { x, y: 1 - screenY, z: 0 }
            : { x, y: 1 - screenY, z: 1 }
    }
  }
}

calibrateModelTerminalTemplates()

/** Cria um componente novo a partir do template, com TAG automático se não informado. */
export function createComponent(
  type: ComponentType,
  ref?: string,
  label?: string,
  slot = 0,
  schematicX = 0,
  schematicY = 0,
  stateOverride: Record<string, any> = {},
): ElectricalComponent {
  const tpl = TEMPLATES[type]
  const footprint = getSchematicPhysicalFootprint(type) ?? { w: tpl.w, h: tpl.h }
  const compId = nanoid(8)
  const terminals: Terminal[] = tpl.terminals.map((t) => ({
    id: `${compId}-${t.label}`,
    componentId: compId,
    label: t.label,
    kind: t.kind,
    terminalType: t.terminalType ?? KIND_TYPE[t.kind],
    color: t.color ?? KIND_COLOR[t.kind],
    x: t.x,
    y: t.y,
    ...(t.defId ? { defId: t.defId } : {}),
    ...(t.electricalClass && t.electricalClass !== 'other' ? { electricalClass: t.electricalClass } : {}),
    ...(t.position3D ? { position3D: { ...t.position3D } } : {}),
    ...(t.socket3D ? { socket3D: { ...t.socket3D, normal: [...t.socket3D.normal], position: { ...t.socket3D.position } } } : {}),
    ...(t.contact ? { contact: t.contact } : {}),
    ...(t.rules ? { catalogRules: { ...t.rules } } : {}),
    ...(t.displayName ? { displayName: t.displayName } : {}),
    ...(t.diameter ? { diameter: t.diameter } : {}),
    energized: false,
  }))
  const presentation3D = getDefaultComponent3DPresentation(type)
  const createdAt = new Date().toISOString()
  return {
    id: compId,
    type,
    category: tpl.category,
    ref: ref ?? tpl.tag,
    label: label ?? tpl.paletteName,
    slot,
    schematicX,
    schematicY,
    // Calha com comprimento indicado: o footprint do Esquema acompanha os mm.
    w: type === 'dinRail15x55' && typeof stateOverride.lengthMm === 'number' ? railWidthPx(stateOverride.lengthMm) : footprint.w,
    h: footprint.h,
    rotation: 0,
    viewOrientation: getDefaultComponentOrientation(type),
    terminalViewPositions: getDefaultComponentTerminalViewPositions(type),
    view3DScale: presentation3D.scale,
    view3DRenderMode: presentation3D.renderMode,
    mirrored: false,
    locked: false,
    bodyColor: presentation3D.bodyColor,
    ...(parseCatalogType(type) ? { catalog: { id: parseCatalogType(type)!.id, version: parseCatalogType(type)!.version, source: 'official' as const } } : {}),
    editorVersion: 1,
    editorUpdatedAt: createdAt,
    editorLastChange: 'Versão inicial',
    editorHistory: [],
    terminals,
    // Cada PLC precisa das suas próprias tabelas I/Q/M; o spread superficial
    // partilhava `outputs` entre instâncias do mesmo modelo.
    state: { ...structuredClone(tpl.defaultState), ...stateOverride },
    faults: [],
  }
}

/**
 * Atualiza apenas footprints legados ainda exatamente no tamanho do template.
 * Posições, bornes normalizados, IDs, fios, estado e vistas da instância ficam intactos.
 */
export function upgradePhysicalFootprint(c: ElectricalComponent): ElectricalComponent {
  const template = TEMPLATES[c.type]
  const footprint = getSchematicPhysicalFootprint(c.type)
  if (!template || !footprint || c.w !== template.w || c.h !== template.h) return c
  return { ...c, w: footprint.w, h: footprint.h }
}

/**
 * XBM-DN32S guardado com a vista antiga (o lado do corpo, 82 mm de largura): passa para a
 * frente real (30 mm). Só mexe no footprint e na posição 2D dos bornes não fixados à mão;
 * IDs, cabos, estado e posição no esquema ficam intactos.
 */
export function upgradeLsXbmFront(c: ElectricalComponent): ElectricalComponent {
  if (c.type !== 'plcLsXbmDn32s') return c
  const footprint = getSchematicPhysicalFootprint(c.type)
  const legacyWidth = Math.round(82.03 * 1.5)
  if (!footprint || Math.round(c.w) !== legacyWidth || c.w === footprint.w) return c
  const centerX = c.schematicX + c.w / 2
  return {
    ...c,
    schematicX: Math.round(centerX - footprint.w / 2),
    w: footprint.w,
    h: footprint.h,
    terminals: c.terminals.map((terminal) => {
      const at = terminal.pinned ? null : lsXbmTerminalLayout(terminal.label)
      return at ? { ...terminal, x: at.x, y: at.y } : terminal
    }),
  }
}

/** Cria um borne novo (usado pelo editor ao adicionar bornes). */
export function createTerminal(componentId: string, label: string, kind: TerminalKind = 'io', x = 0.5, y = 0.5): Terminal {
  return {
    id: `${componentId}-${label}-${nanoid(4)}`,
    componentId,
    label,
    kind,
    terminalType: KIND_TYPE[kind],
    color: KIND_COLOR[kind],
    x,
    y,
    energized: false,
  }
}

/** Atualiza projetos anteriores sem tocar nos IDs nem nos cabos existentes. */
export function upgradeLogoTerminals(c: ElectricalComponent): ElectricalComponent {
  if (c.type !== 'plcSiemensLogo1224RC') return c
  const extra: Terminal[] = []
  // Projeto com 14 bornes: recuperar os quatro segundos parafusos dos relés.
  if (!c.terminals.some((t) => /^Q(?:[1-4]\.2|0\.[0-3]·2)$/.test(t.label))) {
    for (let i = 0; i < 4; i++) {
      const canonical = `Q0.${i}`
      const legacy = `Q${i + 1}`
      const old = c.terminals.find((t) => t.label === canonical || t.label === legacy)
      if (old) {
        const label = old.label === legacy ? `${legacy}.2` : `${canonical}·2`
        extra.push({ ...old, id: `${c.id}-${label}`, label, x: 0.21 + i * 0.24, y: 1, energized: false })
      }
    }
  }
  // Projeto com 14/18 bornes: recuperar o parafuso sem legenda do topo.
  if (!c.terminals.some((t) => t.label === 'X1') && c.terminals.some((t) => t.label === 'I0.7' || t.label === 'I8')) {
    extra.push({ id: `${c.id}-X1`, componentId: c.id, label: 'X1', kind: 'io', terminalType: 'screw', color: '#94a3b8', x: 0.98, y: 0, energized: false })
  }
  return extra.length ? { ...c, terminals: [...c.terminals, ...extra] } : c
}

/** Completa projetos anteriores às posições físicas. Posições existentes são
 * tratadas pela migração versionada, para não apagar ajustes manuais. */
export function upgradeProtectionTerminalPositions(c: ElectricalComponent): ElectricalComponent {
  if (!['breaker1p', 'breaker2p', 'breaker3p', 'breakerSteckSdC25', 'phoenixEcb3000760', 'multimeterDm20'].includes(c.type)) return c
  // Uma revisão feita no editor tem prioridade sobre os novos padrões.
  if ((c.editorVersion ?? 1) > 1) return c
  const defaults = TEMPLATES[c.type].terminals
  let changed = false
  const terminals = c.terminals.map((terminal) => {
      if (terminal.pinned || terminal.position3D) return terminal
      const calibrated = defaults.find((item) => item.label === terminal.label)
      if (!calibrated?.position3D) return terminal
      changed = true
      return { ...terminal, position3D: { ...calibrated.position3D }, terminalType: calibrated.terminalType ?? terminal.terminalType, diameter: calibrated.diameter ?? terminal.diameter }
    })
  return changed ? { ...c, terminals } : c
}

export function upgradeProauto24A(c: ElectricalComponent): ElectricalComponent {
  if ((c.type as string) !== 'powerSupplyProauto24B') return c
  const oldPos: Record<string, [number, number]> = {
    RDY1: [0.18, 0], RDY2: [0.38, 0], '+V1': [0.64, 0], '+V2': [0.84, 0],
    '-V1': [0.18, 1], '-V2': [0.38, 1], PE: [0.55, 1], L: [0.72, 1], N: [0.89, 1],
  }
  const defaultPos = new Map(TEMPLATES.powerSupplyProauto24A.terminals.map((t) => [t.label, t]))
  return {
    ...c,
    type: 'powerSupplyProauto24A',
    label: c.label.replace('24B', '24A'),
    terminals: c.terminals.map((t) => {
      const old = oldPos[t.label], next = defaultPos.get(t.label)
      return { ...t, terminalType: 'screw',
        x: old && next && Math.abs(t.x - old[0]) < 0.002 && Math.abs(t.y - old[1]) < 0.002 ? next.x : t.x,
        y: old && next && Math.abs(t.x - old[0]) < 0.002 && Math.abs(t.y - old[1]) < 0.002 ? next.y : t.y,
      }
    }),
  }
}

/** Atualiza os passos monofásicos antigos para encaixarem os bornes PTI6 lado a lado. */
export function upgradeTerminalAssemblyPositions(c: ElectricalComponent): ElectricalComponent {
  if (!['terminalSet1ph', 'powerSource1ph'].includes(c.type) || (c.editorVersion ?? 1) > 1) return c
  const legacy = c.type === 'terminalSet1ph'
    ? { L: 0.12, N: 0.5, PE: 0.88 }
    : { L: 0.18, N: 0.5, PE: 0.82 }
  const current = { L: 1 / 6, N: 0.5, PE: 5 / 6 }
  let changed = false
  const terminals = c.terminals.map((terminal) => {
    if (terminal.pinned) return terminal
    const label = terminal.label.toUpperCase()
    const conductor = (['L', 'N', 'PE'] as const).find((name) => label === name || label.startsWith(`${name}-`))
    if (!conductor) return terminal
    const oldX = legacy[conductor]
    if (Math.abs((terminal.position3D?.x ?? terminal.x) - oldX) > 0.002) return terminal
    changed = true
    const position3D = terminal.position3D ? { ...terminal.position3D, x: current[conductor] } : undefined
    const x = Math.abs(terminal.x - oldX) <= 0.002 ? current[conductor] : terminal.x
    return { ...terminal, x, ...(position3D ? { position3D } : {}) }
  })
  return changed ? { ...c, terminals } : c
}

export function terminalByLabel(c: ElectricalComponent, label: string): Terminal | undefined {
  return c.terminals.find((t) => t.label === label)
}

/** Lista da biblioteca agrupada, para a paleta lateral. */
export function paletteGroups(): Array<{ group: string; items: Array<{ type: ComponentType; name: string; category: ComponentCategory }> }> {
  const groups = new Map<string, Array<{ type: ComponentType; name: string; category: ComponentCategory }>>()
  for (const [type, tpl] of Object.entries(TEMPLATES) as Array<[ComponentType, ComponentTemplate]>) {
    if (hiddenCatalogTypes.has(type)) continue
    if (!groups.has(tpl.group)) groups.set(tpl.group, [])
    groups.get(tpl.group)!.push({ type, name: tpl.paletteName, category: tpl.category })
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }))
}

/** Próximo TAG livre para um tipo (KM1 → KM2 → KM3…). */
export function nextRef(components: ElectricalComponent[], type: ComponentType): string {
  const tag = TEMPLATES[type].tag
  const used = components
    .filter((c) => c.ref.startsWith(tag))
    .map((c) => Number(c.ref.replace(tag, '')))
    .filter((n) => !Number.isNaN(n))
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `${tag}${next}`
}
