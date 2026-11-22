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
import { industrialTemplates } from './industrialDevices'
import { FACE_INWARD, terminalInsetMm, realTerminalPosition, leadRootPosition, LEAD_PIGTAIL_LENGTH_MM, REAL_TERMINALS, type RealTerminalSpot } from './realInterfaces'
import {
  ACRYLIC_BUSBAR,
  busbarFootprintPx,
  busbarTerminalSpecs,
  STEPPED_BUSBAR,
} from '../three/busbarParts'
import { COMB_BUSBAR, COMB_CONNECTOR } from '../three/combBusbarParts'

const FACE_OUTWARD_3D: Record<RealTerminalSpot['face'], [number, number, number]> = {
  front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0],
}
import { LEGACY_REAL_TERMINALS, LEGACY_METER_POSITIONS, LEGACY_MODULAR_SIZE, MECHANICAL_INTERFACE_TYPES, GEYA_PREVIOUS_STEP_TERMINALS } from './legacyRealInterfaces'
import { parseCatalogType } from '../catalog/types'
import { railWidthPx } from '../three/railMount'
import { terminalAssemblyConductors, TERMINAL_CONDUCTOR_PATTERN } from '../three/terminalAssembly'
import { nanoid } from 'nanoid'
import { pti6TerminalTemplates } from './pti6Strip'
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
import { S7_FRONT_FACE, SIEMENS_S7_TYPES, s71500Cpu1511cTerminalRows, s71500Di32TerminalRows, s7300Cpu315TerminalRows } from './siemensPlc'

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
  /** Grupo funcional do borne (ex.: conector frontal «X10», «X11»). */
  row?: string
  /**
   * Face do aparelho por onde o cabo entra. Existe para os PLC Siemens S7, cuja
   * frente tem os bornes na face lateral do CAD (`left`) mas o cabo sai pela
   * frente do módulo — a posição 3D manda no ponto, esta face manda na direção.
   */
  face?: Terminal['face']
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
  'hydraulic-in': '#0284c7',
  'hydraulic-out': '#0ea5e9',
  pneumatic: '#38bdf8',
  'pneumatic-in': '#38bdf8',
  'pneumatic-out': '#0284c7',
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
  'hydraulic-in': 'plug',
  'hydraulic-out': 'plug',
  pneumatic: 'plug',
  'pneumatic-in': 'plug',
  'pneumatic-out': 'plug',
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

/**
 * Bornes de um PLC Siemens S7. As tabelas de `siemensPlc.ts` contam as filas **do
 * topo para a base** (como se lê no CAD); o `position3D` do inspetor conta a altura
 * **da base para o topo**. A conversão fica aqui, num sítio só.
 */
const s7Terminals = (
  rows: Array<{ label: string; x: number; y: number }>,
  kindOf: (label: string) => TerminalKind,
  extraOf: (label: string) => Partial<TerminalTemplate>,
): TerminalTemplate[] => rows.map((row) => {
  const extra = extraOf(row.label)
  // y da tabela siemensPlc conta do topo; position3D conta da base.
  // z=0.92 = superfície dos conectores frontais X10/X11 (não a faixa de LEDs de canal).
  const yFromBase = 1 - row.y
  return T(row.label, kindOf(row.label), row.x, yFromBase, {
    terminalType: 'plug',
    face: S7_FRONT_FACE,
    position3D: { x: row.x, y: yFromBase, z: 0.92 },
    ...extra,
  })
})

/**
 * S7-1500 DI 32×24 V DC (6ES7521-1BL00-0AB0): 32 entradas nos conectores frontais
 * X10 (I0.x, I1.x) e X11 (I2.x, I3.x), com L+/M na fila de cima.
 */
function plcS71500Di32Terminals(): TerminalTemplate[] {
  return s7Terminals(s71500Di32TerminalRows(),
    (label) => label === 'L+' ? 'power-in' : label === 'M' ? 'neutral' : 'io',
    (label) => ({
      color: label === 'L+' ? '#ef4444' : label === 'M' ? '#3b82f6' : '#a855f7',
      row: label === 'L+' ? 'X10' : label === 'M' ? 'X11' : label.startsWith('I0') || label.startsWith('I1') ? 'X10' : 'X11',
    }))
}

/** CPU 1511C-1 PN: 16 DI (X10) + 16 DQ (X11) nos conectores frontais, L+/M em cima e o port PROFINET em baixo. */
function plcS71500Cpu1511cTerminals(): TerminalTemplate[] {
  return s7Terminals(s71500Cpu1511cTerminalRows(),
    (label) => label === 'L+' ? 'power-in' : label === 'M' ? 'neutral' : label.startsWith('Q') ? 'power-out' : 'io',
    (label) => ({
      color: label === 'L+' ? '#ef4444' : label === 'M' ? '#3b82f6' : label === 'PN' ? '#22c55e' : label.startsWith('Q') ? '#f87171' : '#a855f7',
      row: label === 'PN' ? 'X1' : label === 'M' || label.startsWith('Q') ? 'X11' : 'X10',
    }))
}

/**
 * CPU 315-2 DP: alimentação 24 V e interfaces (MPI/DP) — sem E/S digitais a bordo.
 * Ficam na metade inferior da frente, por baixo da tampa do compartimento.
 */
function plcS7300Cpu315Terminals(): TerminalTemplate[] {
  return s7Terminals(s7300Cpu315TerminalRows(),
    (label) => label === 'L+' ? 'power-in' : label === 'M' ? 'neutral' : 'io',
    (label) => ({
      terminalType: label === 'L+' || label === 'M' ? 'screw' : 'plug',
      color: label === 'L+' ? '#ef4444' : label === 'M' ? '#3b82f6' : '#94a3b8',
      row: 'frente',
    }))
}

export const TEMPLATES: Record<ComponentType, ComponentTemplate> = {
  ...importedTemplates(),
  ...industrialTemplates(),
  // ---------------- Proteção ----------------
  breaker1p: {
    category: 'protection', paletteName: 'Disjuntor Schneider Easy9 EZ9 · 1P', group: 'Proteção', tag: 'QF', w: 60, h: 110,
    terminals: [
      T('1', 'power-in', 0.5, 0, { position3D: { x: 0.5, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('2', 'power-out', 0.5, 1, { position3D: { x: 0.5, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 10 }),
    ],
    defaultState: { closed: true, tripped: false, poles: 1, curve: 'C', inA: 16, icn: '4,5 kA' },
  },
  breakerSchneiderIc60h1p: {
    category: 'protection', paletteName: 'Disjuntor Schneider Acti9 iC60H · 1P C20', group: 'Proteção', tag: 'QF', w: 60, h: 110,
    terminals: [
      T('1', 'power-in', 0.5, 0, { position3D: { x: 0.5, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('2', 'power-out', 0.5, 1, { position3D: { x: 0.5, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 10 }),
    ],
    defaultState: { closed: true, tripped: false, poles: 1, curve: 'C', inA: 20, icn: '10 kA', code: 'A9F07120', brand: 'Schneider Electric' },
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
    defaultState: { closed: true, tripped: false, poles: 2, curve: 'C', inA: 16, icn: '4,5 kA' },
  },
  breaker3p: {
    category: 'protection', paletteName: 'Disjuntor Schneider Easy9 EZ9 · 3P', group: 'Proteção', tag: 'QF', w: 120, h: 110,
    terminals: poles3(),
    defaultState: { closed: true, tripped: false, poles: 3, curve: 'C', inA: 25, icn: '4,5 kA' },
  },
  switchSchneiderEz9s1p: {
    category: 'protection', paletteName: 'Interruptor de corte Schneider Easy9 Switch · 1P 63 A', group: 'Proteção', tag: 'QS', w: 60, h: 110,
    terminals: [
      T('1', 'power-in', 0.5, 0, { position3D: { x: 0.5, y: 0.9556, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
      T('2', 'power-out', 0.5, 1, { position3D: { x: 0.5, y: 0.0444, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
    ],
    defaultState: { closed: true, tripped: false, poles: 1, inA: 63, ue: '230 V~', code: 'EZ9S16163', norm: 'IEC 60947-3', icn: '0,945 kA' },
  },
  switchSchneiderEz9s2p: {
    category: 'protection', paletteName: 'Interruptor de corte Schneider Easy9 Switch · 2P 63 A', group: 'Proteção', tag: 'QS', w: 90, h: 110,
    terminals: [
      T('1', 'power-in', 0.25, 0, { position3D: { x: 0.25, y: 0.9556, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
      T('2', 'power-out', 0.25, 1, { position3D: { x: 0.25, y: 0.0444, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
      T('3', 'power-in', 0.75, 0, { position3D: { x: 0.75, y: 0.9556, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
      T('4', 'power-out', 0.75, 1, { position3D: { x: 0.75, y: 0.0444, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
    ],
    defaultState: { closed: true, tripped: false, poles: 2, inA: 63, ue: '400 V~', code: 'EZ9S16263', norm: 'IEC 60947-3', icn: '0,945 kA' },
  },
  switchSchneiderEz9s4p: {
    category: 'protection', paletteName: 'Interruptor de corte Schneider Easy9 Switch · 4P 100 A', group: 'Proteção', tag: 'QS', w: 150, h: 110,
    terminals: [
      T('1', 'power-in', 0.125, 0, { position3D: { x: 0.125, y: 0.9556, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
      T('2', 'power-out', 0.125, 1, { position3D: { x: 0.125, y: 0.0444, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
      T('3', 'power-in', 0.375, 0, { position3D: { x: 0.375, y: 0.9556, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
      T('4', 'power-out', 0.375, 1, { position3D: { x: 0.375, y: 0.0444, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
      T('5', 'power-in', 0.625, 0, { position3D: { x: 0.625, y: 0.9556, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
      T('6', 'power-out', 0.625, 1, { position3D: { x: 0.625, y: 0.0444, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
      T('7', 'power-in', 0.875, 0, { position3D: { x: 0.875, y: 0.9556, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
      T('8', 'power-out', 0.875, 1, { position3D: { x: 0.875, y: 0.0444, z: 0.2763 }, terminalType: 'screw', diameter: 9 }),
    ],
    defaultState: { closed: true, tripped: false, poles: 4, inA: 100, ue: '400 V~', code: 'EZ9S16491', norm: 'IEC 60947-3', icn: '0,945 kA' },
  },
  breaker4p: {
    category: 'protection', paletteName: 'Disjuntor tetrapolar', group: 'Proteção', tag: 'QF', w: 150, h: 110,
    terminals: [
      ...poles3(),
      T('7', 'power-in', 0.93, 0), T('8', 'power-out', 0.93, 1),
    ],
    defaultState: { closed: true, tripped: false, poles: 4, curve: 'C', inA: 25, icn: '6 kA' },
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
    defaultState: { closed: true, tripped: false, inA: 1, ueDc: '24 V DC', code: 'EC-E1 1A' },
  },
  motorBreaker: {
    category: 'protection', paletteName: 'Disjuntor-motor', group: 'Proteção', tag: 'QM', w: 120, h: 120,
    terminals: poles3(),
    defaultState: { closed: true, tripped: false, poles: 3, curve: 'D', inA: 6.3, rangeA: '4 - 6,3 A', magnetic: 88 },
  },
  residualBreaker: {
    category: 'protection', paletteName: 'Disjuntor DR (30mA)', group: 'Proteção', tag: 'QDR', w: 120, h: 110,
    terminals: [
      ...poles3(),
      T('N1', 'neutral', 0.93, 0), T('N2', 'neutral', 0.93, 1),
    ],
    defaultState: { closed: true, tripped: false, inA: 40, sensmA: 30, rcdType: 'AC' },
  },
  residualBreakerSchneiderIid4p: {
    category: 'protection', paletteName: 'Interruptor Diferencial Schneider Acti9 iID · 4P 40A 30mA', group: 'Proteção', tag: 'QDR', w: 140, h: 110,
    terminals: [
      T('N1', 'neutral', 0.125, 0, { position3D: { x: 0.125, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('1', 'power-in', 0.375, 0, { position3D: { x: 0.375, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('3', 'power-in', 0.625, 0, { position3D: { x: 0.625, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('5', 'power-in', 0.875, 0, { position3D: { x: 0.875, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('N2', 'neutral', 0.125, 1, { position3D: { x: 0.125, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('2', 'power-out', 0.375, 1, { position3D: { x: 0.375, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('4', 'power-out', 0.625, 1, { position3D: { x: 0.625, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('6', 'power-out', 0.875, 1, { position3D: { x: 0.875, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 10 }),
    ],
    defaultState: { closed: true, tripped: false, inA: 40, sensmA: 30, rcdType: 'AC', poles: 4, code: 'A9R11440', brand: 'Schneider Electric' },
  },
  residualBreakerSchneiderIdpnVigi: {
    category: 'protection', paletteName: 'Disjuntor Diferencial Schneider Acti9 iDPN N Vigi · 1P+N C16 30mA', group: 'Proteção', tag: 'QDR', w: 90, h: 110,
    terminals: [
      T('N1', 'neutral', 0.25, 0, { position3D: { x: 0.25, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('1', 'power-in', 0.75, 0, { position3D: { x: 0.75, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('N2', 'neutral', 0.25, 1, { position3D: { x: 0.25, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 10 }),
      T('2', 'power-out', 0.75, 1, { position3D: { x: 0.75, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 10 }),
    ],
    defaultState: { closed: true, tripped: false, inA: 16, curve: 'C', sensmA: 30, rcdType: 'A', poles: 2, code: 'A9D32616', brand: 'Schneider Electric' },
  },
  fuse: {
    category: 'protection', paletteName: 'Fusível NH/DIAZED', group: 'Proteção', tag: 'F', w: 50, h: 90,
    terminals: [T('IN', 'power-in', 0.5, 0), T('OUT', 'power-out', 0.5, 1)],
    defaultState: { blown: false, inA: 6, fuseClass: 'gG' },
  },
  fuseHolder: {
    category: 'protection', paletteName: 'Porta-fusível cilíndrico', group: 'Proteção', tag: 'F', w: 60, h: 100,
    terminals: [T('1', 'power-in', 0.5, 0), T('2', 'power-out', 0.5, 1)],
    defaultState: { closed: true, blown: false, inA: 2, fuseClass: 'gG' },
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

  // ---------------- Botoeiras KEOLEA KL-XB2 Ø22 mm ----------------
  pushButtonXb2No: {
    category: 'command', paletteName: 'Botoeira KEOLEA KL-XB2 verde · NA 3-4 · momentânea', group: 'Comando', tag: 'S', w: 70, h: 80,
    terminals: [T('3', 'power-in', 0.15, 0.5), T('4', 'power-out', 0.85, 0.5)],
    defaultState: { pressed: false, momentary: true, color: '#16a34a' },
  },
  pushButtonXb2Nc: {
    category: 'command', paletteName: 'Botoeira KEOLEA KL-XB2 vermelha · NF 1-2 · momentânea', group: 'Comando', tag: 'S', w: 70, h: 80,
    terminals: [T('1', 'power-in', 0.15, 0.5), T('2', 'power-out', 0.85, 0.5)],
    defaultState: { pressed: false, momentary: true, color: '#dc2626' },
  },
  pushButtonXb2Black: {
    category: 'command', paletteName: 'Botoeira KEOLEA KL-XB2 preta · NA 3-4 · momentânea', group: 'Comando', tag: 'S', w: 70, h: 80,
    terminals: [T('3', 'power-in', 0.15, 0.5), T('4', 'power-out', 0.85, 0.5)],
    defaultState: { pressed: false, momentary: true, color: '#1f2937' },
  },
  pushButtonXb2Yellow: {
    category: 'command', paletteName: 'Botoeira KEOLEA KL-XB2 amarela · NA 3-4 · momentânea', group: 'Comando', tag: 'S', w: 70, h: 80,
    terminals: [T('3', 'power-in', 0.15, 0.5), T('4', 'power-out', 0.85, 0.5)],
    defaultState: { pressed: false, momentary: true, color: '#eab308' },
  },
  pushButtonXb2Blue: {
    category: 'command', paletteName: 'Botoeira KEOLEA KL-XB2 azul · NA 3-4 · momentânea', group: 'Comando', tag: 'S', w: 70, h: 80,
    terminals: [T('3', 'power-in', 0.15, 0.5), T('4', 'power-out', 0.85, 0.5)],
    defaultState: { pressed: false, momentary: true, color: '#2563eb' },
  },
  pushButtonXb2White: {
    category: 'command', paletteName: 'Botoeira KEOLEA KL-XB2 branca · NA 3-4 · momentânea', group: 'Comando', tag: 'S', w: 70, h: 80,
    terminals: [T('3', 'power-in', 0.15, 0.5), T('4', 'power-out', 0.85, 0.5)],
    defaultState: { pressed: false, momentary: true, color: '#f8fafc' },
  },

  // ---------------- Sensores ----------------
  proximitySensor: {
    category: 'sensor', paletteName: 'Sensor indutivo PNP (M18)', group: 'Sensores', tag: 'B', w: 80, h: 110,
    terminals: [
      T('V+', 'power-in', 0.2, 1, {
        color: '#92400e', terminalType: 'tubular', contact: 'lead', diameter: 1.5,
        position3D: { x: -0.25, y: 0.55, z: 0.2 },
        socket3D: { diameterMm: 1.5, depthMm: 45, insetMm: 0, normal: [-1, 0, 0], position: { x: 0, y: 0.55, z: 0.2 } },
      }),
      T('0V', 'coil-minus', 0.5, 1, {
        color: '#2563eb', terminalType: 'tubular', contact: 'lead', diameter: 1.5,
        position3D: { x: -0.25, y: 0.5, z: 0.18 },
        socket3D: { diameterMm: 1.5, depthMm: 45, insetMm: 0, normal: [-1, 0, 0], position: { x: 0, y: 0.5, z: 0.18 } },
      }),
      T('OUT', 'io', 0.8, 1, {
        color: '#1e293b', terminalType: 'tubular', contact: 'lead', diameter: 1.5,
        position3D: { x: -0.25, y: 0.45, z: 0.16 },
        socket3D: { diameterMm: 1.5, depthMm: 45, insetMm: 0, normal: [-1, 0, 0], position: { x: 0, y: 0.45, z: 0.16 } },
      }),
    ],
    defaultState: { triggered: false, sensingMm: 8, type: 'PNP', no: true },
  },
  photoSensor: {
    category: 'sensor', paletteName: 'Sensor fotoelétrico', group: 'Sensores', tag: 'B', w: 90, h: 110,
    // Cabos soltos por omissão: COM / NA / NF (cores típicas do cabo multipolar).
    terminals: [
      T('COM', 'aux-no', 0.2, 1, {
        color: '#1e293b', terminalType: 'tubular', contact: 'lead', diameter: 1.5,
        position3D: { x: -0.25, y: 0.5, z: 0.2 },
        socket3D: { diameterMm: 1.5, depthMm: 45, insetMm: 0, normal: [-1, 0, 0], position: { x: 0, y: 0.5, z: 0.2 } },
      }),
      T('NA', 'aux-no', 0.5, 1, {
        color: '#92400e', terminalType: 'tubular', contact: 'lead', diameter: 1.5,
        position3D: { x: -0.25, y: 0.55, z: 0.18 },
        socket3D: { diameterMm: 1.5, depthMm: 45, insetMm: 0, normal: [-1, 0, 0], position: { x: 0, y: 0.55, z: 0.18 } },
      }),
      T('NF', 'aux-nc', 0.8, 1, {
        color: '#2563eb', terminalType: 'tubular', contact: 'lead', diameter: 1.5,
        position3D: { x: -0.25, y: 0.45, z: 0.16 },
        socket3D: { diameterMm: 1.5, depthMm: 45, insetMm: 0, normal: [-1, 0, 0], position: { x: 0, y: 0.45, z: 0.16 } },
      }),
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
    category: 'sensor', paletteName: 'Boia / chave de nível · FELIX ENERGY IP68', group: 'Hidráulica', tag: 'B', w: 110, h: 100,
    terminals: [
      T('NA', 'aux-no', 0.14, 0.22, { position3D: { x: 0.43, y: 0.88, z: 0.5 }, face: 'left', contact: 'lead', color: '#92400e', terminalType: 'tinned' as any }),
      T('C', 'aux-no', 0.14, 0.50, { position3D: { x: 0.43, y: 0.82, z: 0.5 }, face: 'left', contact: 'lead', color: '#111827', terminalType: 'tinned' as any }),
      T('NF', 'aux-nc', 0.14, 0.78, { position3D: { x: 0.43, y: 0.76, z: 0.5 }, face: 'left', contact: 'lead', color: '#2563eb', terminalType: 'tinned' as any }),
    ],
    defaultState: {
      triggered: false,
      level: 'baixo',
      autoCoupleTank: true,
      manufacturer: 'FELIX ENERGY',
      model: 'Float Switch IP68',
      voltage: '250V~',
      currentA: 16,
      cable: 'H07RN-F 3×1.0 mm²',
      protection: 'IP68 · T60',
    },
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
      // S52 é entrada de segurança, não reset; o start TP é S12–S34.
      T('S52', 'io', 0.15, 1, { terminalType: 'screw' }),
      T('13', 'aux-no', 0.24, 1, { terminalType: 'screw' }),
      T('14', 'aux-no', 0.36, 1, { terminalType: 'screw' }),
      T('23', 'aux-no', 0.49, 1, { terminalType: 'screw' }),
      T('24', 'aux-no', 0.61, 1, { terminalType: 'screw' }),
      T('33', 'aux-no', 0.74, 1, { terminalType: 'screw' }),
      T('34', 'aux-no', 0.86, 1, { terminalType: 'screw' }),
    ],
    defaultState: { powered: false, energized: false, channel1On: false, channel2On: false, tripped: false, dualChannel: true, supply: '24 V AC/DC', reset: 'TP · automático/manual por nível S12–S34', safetyCategory: 'Modelo didático · sem validação PL/SIL', startupElapsedMs: 0, recoveryElapsedMs: 0 },
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
  pilotLightSchneiderIil1p: {
    category: 'signaling', paletteName: 'Sinalizador Modular Schneider Acti9 iIL · 1P 230V', group: 'Sinalização', tag: 'H', w: 60, h: 100,
    terminals: [
      T('X1', 'io', 0.5, 0, { position3D: { x: 0.5, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 9 }),
      T('X2', 'io', 0.5, 1, { position3D: { x: 0.5, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 9 }),
    ],
    defaultState: { on: false, color: '#ef4444', voltage: '230V AC', brand: 'Schneider Electric', code: 'A9E18320' },
  },
  pilotLightSchneiderIil3p: {
    category: 'signaling', paletteName: 'Sinalizador Trifásico Schneider Acti9 iIL · Presença de tensão L1-L2-L3 · 1 módulo', group: 'Sinalização', tag: 'H', w: 110, h: 100,
    terminals: [
      T('L1', 'power-in', 0.2, 0, { position3D: { x: 0.167, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 9 }),
      T('L2', 'power-in', 0.5, 0, { position3D: { x: 0.5, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 9 }),
      T('L3', 'power-in', 0.8, 0, { position3D: { x: 0.833, y: 0.86, z: 1 }, terminalType: 'screw', diameter: 9 }),
      T('N', 'neutral', 0.5, 1, { position3D: { x: 0.5, y: 0.14, z: 1 }, terminalType: 'screw', diameter: 9 }),
    ],
    defaultState: { on: false, l1On: false, l2On: false, l3On: false, phaseLoss: false, color: '#ef4444', voltage: '230/400V AC', brand: 'Schneider Electric', code: 'A9E18327' },
  },
  buzzer: {
    category: 'signaling', paletteName: 'Buzzer / sirene', group: 'Sinalização', tag: 'HA', w: 60, h: 80,
    terminals: [T('X1', 'io', 0.5, 0.1, { color: '#ef4444' }), T('X2', 'io', 0.5, 0.9, { color: '#3b82f6' })],
    defaultState: { on: false, db: 90 },
  },
  towerLight: {
    category: 'signaling', paletteName: 'Torre de sinalização', group: 'Sinalização', tag: 'H', w: 70, h: 120,
    // Cabos soltos (pigtails) por omissão — iguais à torre SB2-3011 (R/Y/G/COM).
    terminals: [
      T('R', 'io', 0.2, 1, {
        color: '#dc2626', terminalType: 'tubular', contact: 'lead', diameter: 2,
        position3D: { x: 0.33, y: -0.2, z: 0.5 },
        socket3D: { diameterMm: 2, depthMm: 45, insetMm: 0, normal: [0, -1, 0], position: { x: 0.33, y: 0, z: 0.5 } },
      }),
      T('Y', 'io', 0.4, 1, {
        color: '#eab308', terminalType: 'tubular', contact: 'lead', diameter: 2,
        position3D: { x: 0.44, y: -0.2, z: 0.5 },
        socket3D: { diameterMm: 2, depthMm: 45, insetMm: 0, normal: [0, -1, 0], position: { x: 0.44, y: 0, z: 0.5 } },
      }),
      T('G', 'io', 0.6, 1, {
        color: '#16a34a', terminalType: 'tubular', contact: 'lead', diameter: 2,
        position3D: { x: 0.56, y: -0.2, z: 0.5 },
        socket3D: { diameterMm: 2, depthMm: 45, insetMm: 0, normal: [0, -1, 0], position: { x: 0.56, y: 0, z: 0.5 } },
      }),
      T('COM', 'coil-minus', 0.8, 1, {
        color: '#1e293b', terminalType: 'tubular', contact: 'lead', diameter: 2,
        position3D: { x: 0.67, y: -0.2, z: 0.5 },
        socket3D: { diameterMm: 2, depthMm: 45, insetMm: 0, normal: [0, -1, 0], position: { x: 0.67, y: 0, z: 0.5 } },
      }),
    ],
    defaultState: { red: false, yellow: false, green: false, on: false },
  },

  // ---------------- Iluminação residencial / predial ----------------
  lampIncandescentE27: {
    category: 'lighting',
    paletteName: 'Lâmpada Incandescente E27 · Philips Classic A60 (40–100 W)',
    group: 'Iluminação',
    tag: 'E',
    w: 96,
    h: 198,
    terminals: [
      T('L', 'power-in', 0.31, 0.96, { color: '#8b4513', displayName: 'Fase comutada (contacto central E27)' }),
      T('N', 'neutral', 0.69, 0.96, { color: '#2563eb', displayName: 'Neutro (rosca lateral E27)' }),
    ],
    defaultState: {
      on: false,
      powerW: 60,
      cctK: 2700,
      brand: 'Philips',
      model: 'Classic A60 E27',
      socket: 'E27',
      voltage: '230V AC',
    },
  },
  lampFluorescentE27: {
    category: 'lighting',
    paletteName: 'Lâmpada Fluorescente CFL E27 · Philips Genie (8–20 W)',
    group: 'Iluminação',
    tag: 'E',
    w: 96,
    h: 231,
    terminals: [
      T('L', 'power-in', 0.31, 0.96, { color: '#8b4513', displayName: 'Fase comutada (contacto central E27)' }),
      T('N', 'neutral', 0.69, 0.96, { color: '#2563eb', displayName: 'Neutro (rosca lateral E27)' }),
    ],
    defaultState: {
      on: false,
      powerW: 12,
      cctK: 4000,
      brand: 'Philips',
      model: 'Genie CFL E27',
      socket: 'E27',
      voltage: '220–240V AC',
    },
  },
  lampLedE27: {
    category: 'lighting',
    paletteName: 'Lâmpada LED E27 · Philips CorePro A60 (4–10 W)',
    group: 'Iluminação',
    tag: 'E',
    w: 96,
    h: 207,
    terminals: [
      T('L', 'power-in', 0.31, 0.96, { color: '#8b4513', displayName: 'Fase comutada (contacto central E27)' }),
      T('N', 'neutral', 0.69, 0.96, { color: '#2563eb', displayName: 'Neutro (rosca lateral E27)' }),
    ],
    defaultState: {
      on: false,
      powerW: 8,
      cctK: 4000,
      brand: 'Philips',
      model: 'CorePro LEDbulb A60 E27',
      socket: 'E27',
      voltage: '220–240V AC',
    },
  },
  wallSwitchSimple: {
    category: 'lighting',
    paletteName: 'Interruptor Simples · Schneider Odace S520201 (10AX 250V~)',
    group: 'Iluminação',
    tag: 'S',
    w: 128,
    h: 128,
    terminals: [
      T('L', 'power-in', 0.34, 0.96, { color: '#8b4513', displayName: 'Fase (entrada comum L)' }),
      T('1', 'power-out', 0.66, 0.96, { color: '#ea580c', displayName: 'Retorno de lâmpada (1)' }),
    ],
    defaultState: {
      on: false,
      brand: 'Schneider Electric',
      model: 'Odace S520201',
      ue: '250V AC · 10AX',
      norm: 'EN 60669-1',
    },
  },
  wallSwitchDouble: {
    category: 'lighting',
    paletteName: 'Interruptor Duplo · Schneider Odace S520214 (2×10AX 250V~)',
    group: 'Iluminação',
    tag: 'S',
    w: 128,
    h: 128,
    terminals: [
      T('L', 'power-in', 0.29, 0.96, { color: '#8b4513', displayName: 'Fase comum (L)' }),
      T('1', 'power-out', 0.50, 0.96, { color: '#ea580c', displayName: 'Retorno Tecla 1' }),
      T('2', 'power-out', 0.71, 0.96, { color: '#d97706', displayName: 'Retorno Tecla 2' }),
    ],
    defaultState: {
      on1: false,
      on2: false,
      brand: 'Schneider Electric',
      model: 'Odace S520214',
      ue: '250V AC · 2×10AX',
      norm: 'EN 60669-1',
    },
  },
  wallSwitchStaircase: {
    category: 'lighting',
    paletteName: 'Comutador de Escada · Schneider Odace S520204 (10AX 250V~)',
    group: 'Iluminação',
    tag: 'S',
    w: 128,
    h: 128,
    terminals: [
      T('L', 'power-in', 0.29, 0.96, { color: '#8b4513', displayName: 'Comum (L)' }),
      T('1', 'power-out', 0.50, 0.96, { color: '#ea580c', displayName: 'Via / Retorno 1' }),
      T('2', 'power-out', 0.71, 0.96, { color: '#d97706', displayName: 'Via / Retorno 2' }),
    ],
    defaultState: {
      on: false,
      brand: 'Schneider Electric',
      model: 'Odace S520204',
      ue: '250V AC · 10AX',
      norm: 'EN 60669-1',
    },
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
      cosPhi: 0.75, torqueNm: 3.65, massKg: 11, motorConnection: 'star', terminalBoxCovered: false, // opção: 'star' | 'delta'
    },
  },
  motor1ph: {
    category: 'motor', paletteName: 'Motor monofásico · azul DC-Simu', group: 'Motores', tag: 'M', w: 140, h: 120,
    // O mesmo motor SEW DRN80 (GLB duplicado e pintado de azul) com a placa monofásica:
    // U1-U2 enrolamento principal, Z1-Z2 enrolamento auxiliar de arranque (IEC 60034-8) e PE.
    terminals: [
      T('U1', 'power-in', 0.25, 0, { position3D: { x: 0.28, y: 1, z: 0.34 }, terminalType: 'screw', diameter: 11 }),
      T('Z1', 'power-in', 0.75, 0, { position3D: { x: 0.72, y: 1, z: 0.34 }, terminalType: 'screw', diameter: 11 }),
      T('U2', 'coil-minus', 0.25, 1, { position3D: { x: 0.28, y: 1, z: 0.7 }, terminalType: 'screw', diameter: 11 }),
      T('Z2', 'coil-minus', 0.75, 1, { position3D: { x: 0.72, y: 1, z: 0.7 }, terminalType: 'screw', diameter: 11 }),
      T('PE', 'earth', 0.93, 0.5, { position3D: { x: 0.9, y: 1, z: 0.52 }, terminalType: 'screw', diameter: 11 }),
    ],
    // Adaptado do motor3ph SEW; cor azul característica DC-Simu para identificação visual no esquema e 3D.
    defaultState: {
      running: false, direction: 'stopped', rpmVisual: 0, tripped: false, terminalBoxCovered: false,
      manufacturer: 'DC-Simu', model: 'Mono 0,37 kW', mounting: 'B3', frame: 71,
      phases: 1, powerKw: 0.37, cv: 0.5, rpm: 1400, frequencyHz: 50, voltage: '230V', currentA: 2.5,
      cosPhi: 0.85, torqueNm: 2.5, massKg: 7, motorConnection: 'single', color: '#2563eb',
    },
  },
  waterPump: {
    category: 'motor', paletteName: 'Bomba de água periférica · CALPEDA CT 61 (0,37 kW)', group: 'Hidráulica', tag: 'P', w: 160, h: 130,
    terminals: [
      T('L1', 'power-in', 0.45, 0, { position3D: { x: 0.54, y: 0.90, z: 0.42 }, face: 'top', terminalType: 'screw', color: '#92400e', diameter: 10 }),
      T('N', 'neutral', 0.65, 0, { position3D: { x: 0.64, y: 0.90, z: 0.42 }, face: 'top', terminalType: 'screw', color: '#3b82f6', diameter: 10 }),
      T('PE', 'earth', 0.85, 0, { position3D: { x: 0.74, y: 0.90, z: 0.42 }, face: 'top', terminalType: 'screw', color: '#84cc16', diameter: 10 }),
      T('IN', 'hydraulic-in', 0.04, 0.58, { position3D: { x: 0.03, y: 0.46, z: 0.50 }, face: 'left', terminalType: 'plug', color: '#0ea5e9', diameter: 12 }),
      T('OUT', 'hydraulic-out', 0.22, 0.04, { position3D: { x: 0.16, y: 0.89, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#0284c7', diameter: 12 }),
    ],
    defaultState: {
      running: false, direction: 'stopped', rpmVisual: 0, tripped: false, terminalBoxCovered: false,
      manufacturer: 'CALPEDA', model: 'CT 61',
      phases: 1, powerKw: 0.37, cv: 0.5, rpm: 2900, frequencyHz: 50, voltage: '230V~', currentA: 2.4,
      cosPhi: 0.90, flowLmin: 40, headM: 40, portSize: 'G 1"', protection: 'IP54',
    },
  },
  hydraulicValve: {
    category: 'motor', paletteName: 'Válvula de esfera hidráulica 3D · Latão G 1"', group: 'Hidráulica', tag: 'VH', w: 110, h: 86,
    terminals: [
      T('IN', 'hydraulic-in', 0.04, 0.62, { position3D: { x: 0.04, y: 0.37, z: 0.50 }, face: 'left', terminalType: 'plug', color: '#0ea5e9', diameter: 12 }),
      T('OUT', 'hydraulic-out', 0.96, 0.62, { position3D: { x: 0.96, y: 0.37, z: 0.50 }, face: 'right', terminalType: 'plug', color: '#0284c7', diameter: 12 }),
    ],
    defaultState: {
      open: true,
      manufacturer: 'DC-Simu Hidráulica',
      model: 'Válvula Esfera G 1" PN16',
    },
  },
  hydraulicTee: {
    category: 'terminal', paletteName: 'União em T hidráulica · Latão 3 vias G 1"', group: 'Hidráulica', tag: 'TH', w: 96, h: 78,
    terminals: [
      // Bocas dos colares sextavados A/B/C alinhadas ao volume 3D do tê de latão
      T('A', 'hydraulic-in', 0.06, 0.58, { position3D: { x: 0.06, y: 0.38, z: 0.50 }, face: 'left', terminalType: 'plug', color: '#0ea5e9', diameter: 12 }),
      T('B', 'hydraulic-out', 0.94, 0.58, { position3D: { x: 0.94, y: 0.38, z: 0.50 }, face: 'right', terminalType: 'plug', color: '#0284c7', diameter: 12 }),
      T('C', 'hydraulic-out', 0.50, 0.04, { position3D: { x: 0.50, y: 0.94, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#0284c7', diameter: 12 }),
    ],
    defaultState: {
      manufacturer: 'DC-Simu Hidráulica',
      model: 'Tê Latão 3 Vias G 1"',
    },
  },

  airCompressor: {
    category: 'power', paletteName: 'Maxxim · Compressor de Ar 24 L · 2,0 HP', group: 'Pneumática', tag: 'CMP', w: 200, h: 140,
    terminals: [
      T('L', 'power-in', 0.12, 0.92, { position3D: { x: 0.18, y: 0.88, z: 0.55 }, face: 'top', terminalType: 'screw', color: '#dc2626', diameter: 10 }),
      T('N', 'neutral', 0.22, 0.92, { position3D: { x: 0.28, y: 0.88, z: 0.55 }, face: 'top', terminalType: 'screw', color: '#2563eb', diameter: 10 }),
      T('OUT', 'pneumatic-out', 0.92, 0.55, { position3D: { x: 0.96, y: 0.62, z: 0.55 }, face: 'right', terminalType: 'plug', color: '#38bdf8', diameter: 12 }),
      T('IN', 'pneumatic-in', 0.08, 0.55, { position3D: { x: 0.08, y: 0.72, z: 0.35 }, face: 'left', terminalType: 'plug', color: '#64748b', diameter: 10 }),
    ],
    defaultState: {
      running: false,
      coverOpen: false,
      tankPressureBar: 0,
      outletPressureBar: 0,
      maxPressureBar: 8,
      airSupplyOn: true,
      manufacturer: 'Maxxim',
      model: '24L · 2,0 HP · 8 bar',
    },
  },
  pneumaticFrl: {
    category: 'power', paletteName: 'Festo MS4-LFR · Unidade FRL Filtro-Regulador + Manómetro', group: 'Pneumática', tag: 'FRL', w: 120, h: 150,
    terminals: [
      T('IN', 'pneumatic-in', 0.04, 0.42, { position3D: { x: 0.04, y: 0.58, z: 0.50 }, face: 'left', terminalType: 'plug', color: '#38bdf8', diameter: 10 }),
      T('OUT', 'pneumatic-out', 0.96, 0.42, { position3D: { x: 0.96, y: 0.58, z: 0.50 }, face: 'right', terminalType: 'plug', color: '#0284c7', diameter: 10 }),
    ],
    defaultState: {
      airSupplyOn: true,
      pressureBar: 6,
      manufacturer: 'Festo',
      model: 'MS4-LFR-1/4 · 0–16 bar',
    },
  },
  pneumaticValve52: {
    category: 'motor', paletteName: 'Festo CPE14-M1B · Eletroválvula 5/2 vias · 24 V DC', group: 'Pneumática', tag: 'YV', w: 140, h: 100,
    terminals: [
      T('A1', 'coil-plus', 0.14, 0.08, { position3D: { x: 0.14, y: 0.56, z: 0.56 }, face: 'left', terminalType: 'screw', color: '#dc2626', diameter: 9 }),
      T('A2', 'coil-minus', 0.28, 0.08, { position3D: { x: 0.14, y: 0.42, z: 0.56 }, face: 'left', terminalType: 'screw', color: '#2563eb', diameter: 9 }),
      T('P', 'pneumatic-in', 0.60, 0.94, { position3D: { x: 0.58, y: 0.06, z: 0.50 }, face: 'bottom', terminalType: 'plug', color: '#0284c7', diameter: 10 }),
      T('A', 'pneumatic-out', 0.48, 0.06, { position3D: { x: 0.48, y: 0.92, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 10 }),
      T('B', 'pneumatic-out', 0.76, 0.06, { position3D: { x: 0.70, y: 0.92, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 10 }),
    ],
    defaultState: {
      energized: false,
      manualOverride: false,
      coilVoltage: '24V DC',
      manufacturer: 'Festo',
      model: 'CPE14-M1B-H-5L-QS-8',
    },
  },
  pneumaticCylinder: {
    category: 'motor', paletteName: 'Festo DSBC · Cilindro pneumático ISO 15552 (DSBC / ADN / DSNU)', group: 'Pneumática', tag: 'CIL', w: 200, h: 86,
    terminals: [
      T('A', 'pneumatic-in', 0.12, 0.06, { position3D: { x: 0.10, y: 0.92, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 10 }),
      T('B', 'pneumatic-in', 0.62, 0.06, { position3D: { x: 0.64, y: 0.92, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 10 }),
    ],
    defaultState: {
      positionPct: 0,
      extended: false,
      cylinderVariant: 'dsbc',
      boreMm: 32,
      strokeMm: 125,
      manufacturer: 'Festo',
      model: 'DSBC-32-125-PPVA-N3',
    },
  },
  pneumaticTee: {
    category: 'terminal', paletteName: 'Festo QST-8 · União em T pneumática Push-In · 3 vias', group: 'Pneumática', tag: 'TP', w: 80, h: 64,
    terminals: [
      // Bornes centrados nas bocas dos anéis azuis (iguais ao rastreamento elétrico)
      T('P1', 'pneumatic-in', 0.02, 0.50, { position3D: { x: 0.02, y: 0.50, z: 0.50 }, face: 'left', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('P2', 'pneumatic-out', 0.98, 0.50, { position3D: { x: 0.98, y: 0.50, z: 0.50 }, face: 'right', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('P3', 'pneumatic-out', 0.50, 0.02, { position3D: { x: 0.50, y: 0.98, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
    ],
    defaultState: {
      manufacturer: 'Festo',
      model: 'QST-8 · Push-In T',
    },
  },
  pneumaticUnion: {
    category: 'terminal', paletteName: 'Festo QS-8 · União reta pneumática Push-In · 2 vias', group: 'Pneumática', tag: 'UR', w: 72, h: 36,
    terminals: [
      T('P1', 'pneumatic-in', 0.02, 0.50, { position3D: { x: 0.02, y: 0.50, z: 0.50 }, face: 'left', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('P2', 'pneumatic-out', 0.98, 0.50, { position3D: { x: 0.98, y: 0.50, z: 0.50 }, face: 'right', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
    ],
    defaultState: {
      manufacturer: 'Festo',
      model: 'QS-8 · Push-In Reta',
    },
  },
  pneumaticElbow: {
    category: 'terminal', paletteName: 'Festo QSL-8 · Cotovelo 90° pneumático Push-In', group: 'Pneumática', tag: 'UE', w: 56, h: 56,
    terminals: [
      T('P1', 'pneumatic-in', 0.02, 0.50, { position3D: { x: 0.02, y: 0.50, z: 0.50 }, face: 'left', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('P2', 'pneumatic-out', 0.50, 0.02, { position3D: { x: 0.50, y: 0.98, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
    ],
    defaultState: {
      manufacturer: 'Festo',
      model: 'QSL-8 · Push-In 90°',
    },
  },
  pneumaticY: {
    category: 'terminal', paletteName: 'Festo QSY-8 · União em Y pneumática Push-In · 3 vias', group: 'Pneumática', tag: 'UY', w: 72, h: 64,
    terminals: [
      // P1 entrada em baixo; P2/P3 saídas paralelas no topo (como QSY real)
      T('P1', 'pneumatic-in', 0.50, 0.98, { position3D: { x: 0.50, y: 0.02, z: 0.50 }, face: 'bottom', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('P2', 'pneumatic-out', 0.32, 0.04, { position3D: { x: 0.32, y: 0.96, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('P3', 'pneumatic-out', 0.68, 0.04, { position3D: { x: 0.68, y: 0.96, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
    ],
    defaultState: {
      manufacturer: 'Festo',
      model: 'QSY-8 · Push-In Y',
    },
  },
  electricCylinderEpcs: {
    category: 'motor', paletteName: 'Festo EPCS-BS-45-200 · Cilindro elétrico SMS 24 V DC', group: 'Pneumática', tag: 'EPCS', w: 220, h: 96,
    terminals: [
      T('+24V', 'power-in', 0.08, 0.06, { position3D: { x: 0.08, y: 0.94, z: 0.36 }, face: 'top', terminalType: 'plug', color: '#dc2626', diameter: 8 }),
      T('0V', 'neutral', 0.18, 0.06, { position3D: { x: 0.08, y: 0.94, z: 0.64 }, face: 'top', terminalType: 'plug', color: '#2563eb', diameter: 8 }),
      T('IN1', 'io', 0.28, 0.06, { position3D: { x: 0.16, y: 0.94, z: 0.36 }, face: 'top', terminalType: 'plug', color: '#16a34a', diameter: 8 }),
      T('IN2', 'io', 0.38, 0.06, { position3D: { x: 0.16, y: 0.94, z: 0.64 }, face: 'top', terminalType: 'plug', color: '#f59e0b', diameter: 8 }),
    ],
    defaultState: {
      positionPct: 0,
      extended: false,
      powered: false,
      speedOutPct: 70,
      speedInPct: 70,
      forcePct: 60,
      strokeMm: 200,
      manufacturer: 'Festo',
      model: 'EPCS-BS-45-200-10P-A-ST-M-H1-PLK-AA',
    },
  },
  pneumaticGuidedCylinder: {
    category: 'motor', paletteName: 'Festo DFM-20-40-P-A-GF · Cilindro guiado dupla haste', group: 'Pneumática', tag: 'DFM', w: 180, h: 96,
    terminals: [
      T('A', 'pneumatic-in', 0.22, 0.06, { position3D: { x: 0.22, y: 0.94, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 10 }),
      T('B', 'pneumatic-in', 0.48, 0.06, { position3D: { x: 0.48, y: 0.94, z: 0.50 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 10 }),
    ],
    defaultState: {
      positionPct: 0,
      extended: false,
      boreMm: 20,
      strokeMm: 40,
      manufacturer: 'Festo',
      model: 'DFM-20-40-P-A-GF · 163346',
    },
  },
  pneumaticManifold: {
    category: 'motor', paletteName: 'Festo VTUG · Ilha de válvulas 4 estações em calha DIN', group: 'Pneumática', tag: 'VTUG', w: 220, h: 120,
    terminals: [
      T('P', 'pneumatic-in', 0.04, 0.72, { position3D: { x: 0.04, y: 0.34, z: 0.50 }, face: 'left', terminalType: 'plug', color: '#0284c7', diameter: 10 }),
      T('0V', 'coil-minus', 0.94, 0.12, { position3D: { x: 0.94, y: 0.84, z: 0.50 }, face: 'right', terminalType: 'screw', color: '#2563eb', diameter: 8 }),
      T('Y1', 'coil-plus', 0.22, 0.06, { position3D: { x: 0.24, y: 0.92, z: 0.50 }, face: 'top', terminalType: 'screw', color: '#dc2626', diameter: 8 }),
      T('Y2', 'coil-plus', 0.40, 0.06, { position3D: { x: 0.40, y: 0.92, z: 0.50 }, face: 'top', terminalType: 'screw', color: '#dc2626', diameter: 8 }),
      T('Y3', 'coil-plus', 0.58, 0.06, { position3D: { x: 0.56, y: 0.92, z: 0.50 }, face: 'top', terminalType: 'screw', color: '#dc2626', diameter: 8 }),
      T('Y4', 'coil-plus', 0.76, 0.06, { position3D: { x: 0.72, y: 0.92, z: 0.50 }, face: 'top', terminalType: 'screw', color: '#dc2626', diameter: 8 }),
      T('A1', 'pneumatic-out', 0.22, 0.94, { position3D: { x: 0.22, y: 0.06, z: 0.56 }, face: 'bottom', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('B1', 'pneumatic-out', 0.28, 0.94, { position3D: { x: 0.28, y: 0.06, z: 0.44 }, face: 'bottom', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('A2', 'pneumatic-out', 0.40, 0.94, { position3D: { x: 0.38, y: 0.06, z: 0.56 }, face: 'bottom', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('B2', 'pneumatic-out', 0.46, 0.94, { position3D: { x: 0.44, y: 0.06, z: 0.44 }, face: 'bottom', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('A3', 'pneumatic-out', 0.58, 0.94, { position3D: { x: 0.54, y: 0.06, z: 0.56 }, face: 'bottom', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('B3', 'pneumatic-out', 0.64, 0.94, { position3D: { x: 0.60, y: 0.06, z: 0.44 }, face: 'bottom', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('A4', 'pneumatic-out', 0.76, 0.94, { position3D: { x: 0.70, y: 0.06, z: 0.56 }, face: 'bottom', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
      T('B4', 'pneumatic-out', 0.82, 0.94, { position3D: { x: 0.76, y: 0.06, z: 0.44 }, face: 'bottom', terminalType: 'plug', color: '#38bdf8', diameter: 9 }),
    ],
    defaultState: {
      station1On: false,
      station2On: false,
      station3On: false,
      station4On: false,
      station1Manual: false,
      station2Manual: false,
      station3Manual: false,
      station4Manual: false,
      manufacturer: 'Festo',
      model: 'VTUG-14-VRLK-4 · 24V DC',
    },
  },
  pneumaticVacuumCup: {
    category: 'motor', paletteName: 'DIYI VFG30-20 · Atuador pneumático com ventosa de fole', group: 'Pneumática', tag: 'VAC', w: 96, h: 126,
    terminals: [
      T('P', 'pneumatic-in', 0.06, 0.82, { position3D: { x: 0.06, y: 0.16, z: 0.50 }, face: 'left', terminalType: 'plug', color: '#38bdf8', diameter: 10 }),
    ],
    defaultState: {
      vacuumActive: false,
      manualVacuum: false,
      mountingFlange: true,
      manufacturer: 'DIYI',
      model: 'VFG30-20 · 0.4–0.7 MPa',
    },
  },
  // ---------------- Mecatrónica didática: maquete de estampagem e transferência ----------------
  // Cotas do relatório técnico da bancada (estimadas por proporção). Sem fabricante atribuído.
  mecSlotPlate: {
    category: 'terminal', paletteName: 'Base ranhurada em alumínio 700 × 500 mm · ranhuras T', group: 'Mecatrónica', tag: 'BAS', w: 140, h: 100,
    terminals: [],
    defaultState: { lengthMm: 700, widthMm: 500, manufacturer: 'DC-Simu Mecatrónica', model: 'Base T 700 × 500 × 20' },
  },
  mecAluProfile: {
    category: 'terminal', paletteName: 'Perfil de alumínio ranhurado 30 × 30 / 40 × 40 + cantoneiras', group: 'Mecatrónica', tag: 'PRF', w: 40, h: 120,
    terminals: [],
    defaultState: { sectionMm: 30, lengthMm: 300, orientation: 'vertical', endCaps: true, brackets: true, manufacturer: 'DC-Simu Mecatrónica', model: 'Perfil T 30 × 30' },
  },
  mecGravityMagazine: {
    category: 'terminal', paletteName: 'Magazine vertical de alimentação por gravidade 50 × 50 × 260', group: 'Mecatrónica', tag: 'MAG', w: 60, h: 140,
    terminals: [],
    defaultState: { pieceCount: 6, pieceOffset: 0, pickupMaterial: '', pieceSequence: ['aluminio', 'branco', 'preto'], manufacturer: 'DC-Simu Mecatrónica', model: 'Magazine 50 × 50 × 260' },
  },
  mecWorkpiece: {
    category: 'terminal', paletteName: 'Peça de trabalho (tarugo) Ø40 × 35 · alumínio / polímero', group: 'Mecatrónica', tag: 'PÇ', w: 50, h: 50,
    terminals: [],
    defaultState: { material: 'aluminio', manufacturer: 'DC-Simu Mecatrónica', model: 'Tarugo Ø40 × 35' },
  },
  mecDischargeRamp: {
    category: 'terminal', paletteName: 'Rampa de descarga inclinada 15° · 220 × 50 mm', group: 'Mecatrónica', tag: 'RMP', w: 120, h: 60,
    terminals: [],
    defaultState: { pillarMm: 110, manufacturer: 'DC-Simu Mecatrónica', model: 'Rampa 220 × 50 · 15°' },
  },
  mecStampingTable: {
    category: 'terminal', paletteName: 'Gaveta / mesa de estampagem 120 × 80 × 45 · rebaixo Ø42', group: 'Mecatrónica', tag: 'MES', w: 100, h: 60,
    terminals: [],
    defaultState: { pieceMaterial: '', manufacturer: 'DC-Simu Mecatrónica', model: 'Mesa 120 × 80 × 45' },
  },
  mecStampingPress: {
    category: 'motor', paletteName: 'Prensa pneumática de estampagem · pórtico 300 · cilindro Ø32 × 80 (estimado)', group: 'Mecatrónica', tag: 'PRS', w: 110, h: 150,
    terminals: [
      T('A', 'pneumatic-in', 0.2, 0.05, { position3D: { x: 0.5, y: 0.975, z: 0.77 }, face: 'front', terminalType: 'plug', color: '#38bdf8', diameter: 8 }),
      T('B', 'pneumatic-in', 0.2, 0.45, { position3D: { x: 0.5, y: 0.745, z: 0.77 }, face: 'front', terminalType: 'plug', color: '#38bdf8', diameter: 8 }),
      T('SUP+', 'power-in', 0.95, 0.15, { position3D: { x: 0.62, y: 0.95, z: 0.5 }, face: 'right', color: '#92400e', diameter: 4 }),
      T('SUP', 'io', 0.95, 0.3, { position3D: { x: 0.62, y: 0.93, z: 0.5 }, face: 'right', color: '#111827', diameter: 4 }),
      T('INF+', 'power-in', 0.95, 0.6, { position3D: { x: 0.62, y: 0.79, z: 0.5 }, face: 'right', color: '#92400e', diameter: 4 }),
      T('INF', 'io', 0.95, 0.75, { position3D: { x: 0.62, y: 0.77, z: 0.5 }, face: 'right', color: '#111827', diameter: 4 }),
    ],
    defaultState: { positionPct: 0, extended: false, pressureBar: 0, manufacturer: 'DC-Simu Mecatrónica', model: 'Prensa Ø32 × 80 (estimado) · prato Ø65' },
  },
  mecFeederCylinder: {
    category: 'motor', paletteName: 'Cilindro de alimentação Ø20 × 80 com empurrador e sensores', group: 'Mecatrónica', tag: 'CIL', w: 150, h: 60,
    terminals: [
      T('A', 'pneumatic-in', 0.06, 0.05, { position3D: { x: 0.025, y: 0.98, z: 0.5 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 7 }),
      T('B', 'pneumatic-in', 0.45, 0.05, { position3D: { x: 0.475, y: 0.98, z: 0.5 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 7 }),
      T('REC+', 'power-in', 0.1, 0.95, { position3D: { x: 0.08, y: 0.66, z: 1 }, face: 'front', color: '#92400e', diameter: 4 }),
      T('REC', 'io', 0.2, 0.95, { position3D: { x: 0.12, y: 0.66, z: 1 }, face: 'front', color: '#111827', diameter: 4 }),
      T('AVA+', 'power-in', 0.38, 0.95, { position3D: { x: 0.36, y: 0.66, z: 1 }, face: 'front', color: '#92400e', diameter: 4 }),
      T('AVA', 'io', 0.48, 0.95, { position3D: { x: 0.40, y: 0.66, z: 1 }, face: 'front', color: '#111827', diameter: 4 }),
    ],
    defaultState: { positionPct: 0, extended: false, manufacturer: 'DC-Simu Mecatrónica', model: 'Cilindro Ø20 × 80 · dupla ação' },
  },
  mecRotaryArm: {
    category: 'motor', paletteName: 'Manipulador rotativo · braço metálico rígido, cilindro vertical e ventosa Ø25', group: 'Mecatrónica', tag: 'BR', w: 130, h: 130,
    terminals: [
      T('Z', 'pneumatic-in', 0.1, 0.05, { position3D: { x: 0.5, y: 0.96, z: 0.985 }, face: 'front', terminalType: 'plug', color: '#38bdf8', diameter: 6 }),
      T('VAC', 'pneumatic-in', 0.9, 0.05, { position3D: { x: 0.466, y: 0.854, z: 0.966 }, face: 'left', terminalType: 'plug', color: '#38bdf8', diameter: 6 }),
      T('HOME+', 'power-in', 0.35, 0.95, { position3D: { x: 0.48, y: 0.17, z: 0.69 }, face: 'front', color: '#92400e', diameter: 4 }),
      T('HOME', 'io', 0.65, 0.95, { position3D: { x: 0.52, y: 0.17, z: 0.69 }, face: 'front', color: '#111827', diameter: 4 }),
    ],
    defaultState: { angleDeg: 0, armDownPct: 0, vacuumActive: false, manualVacuum: false, holding: '', homeActive: true, manufacturer: 'DC-Simu Mecatrónica', model: 'Disco Ø140 · braço 240 · ventosa Ø25' },
  },
  mecDcGearmotor: {
    category: 'motor', paletteName: 'Motorredutor DC M1 com pinhão cónico e encoder incremental', group: 'Mecatrónica', tag: 'M', w: 140, h: 80,
    terminals: [
      T('+24V', 'power-in', 0.08, 0.05, { position3D: { x: 0.17, y: 0.8, z: 0.64 }, face: 'top', color: '#dc2626', diameter: 4 }),
      T('0V', 'coil-minus', 0.24, 0.05, { position3D: { x: 0.17, y: 0.52, z: 0.64 }, face: 'front', color: '#2563eb', diameter: 4 }),
      T('CW', 'coil-plus', 0.42, 0.05, { position3D: { x: 0.21, y: 0.8, z: 0.64 }, face: 'top', color: '#f59e0b', diameter: 4 }),
      T('CCW', 'coil-plus', 0.58, 0.05, { position3D: { x: 0.21, y: 0.52, z: 0.64 }, face: 'front', color: '#f59e0b', diameter: 4 }),
      T('A', 'io', 0.78, 0.05, { position3D: { x: 0.04, y: 0.98, z: 0.5 }, face: 'top', color: '#a855f7', diameter: 4 }),
      T('B', 'io', 0.94, 0.05, { position3D: { x: 0.08, y: 0.98, z: 0.5 }, face: 'top', color: '#a855f7', diameter: 4 }),
    ],
    defaultState: { running: false, direction: 'cw', motorAngleDeg: 0, encoderCount: 0, manufacturer: 'DC-Simu Mecatrónica', model: 'Motor DC Ø36 × 95 · encoder Ø30' },
  },
  mecMicroSwitchRoller: {
    category: 'sensor', paletteName: 'Microinterruptor de rolete FC 1 · C / NA / NF', group: 'Mecatrónica', tag: 'FC', w: 70, h: 60,
    terminals: [
      T('C', 'io', 0.2, 1, { position3D: { x: 0.30, y: 0.06, z: 0.5 }, face: 'bottom', diameter: 3 }),
      T('NO', 'aux-no', 0.5, 1, { position3D: { x: 0.50, y: 0.06, z: 0.5 }, face: 'bottom', diameter: 3 }),
      T('NC', 'aux-nc', 0.8, 1, { position3D: { x: 0.70, y: 0.06, z: 0.5 }, face: 'bottom', diameter: 3 }),
    ],
    defaultState: { pressed: false, actuation: 'feeder', manufacturer: 'DC-Simu Mecatrónica', model: 'Microinterruptor de rolete' },
  },
  mecVacuumEjector: {
    category: 'terminal', paletteName: 'Gerador de vácuo Venturi com silenciador', group: 'Mecatrónica', tag: 'VAC', w: 100, h: 50,
    terminals: [
      T('P', 'pneumatic-in', 0.3, 0.05, { position3D: { x: 0.23, y: 1, z: 0.5 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 6 }),
      T('V', 'pneumatic-out', 0.02, 0.5, { position3D: { x: 0.02, y: 0.5, z: 0.5 }, face: 'left', terminalType: 'plug', color: '#0284c7', diameter: 6 }),
    ],
    defaultState: { vacuumActive: false, manufacturer: 'DC-Simu Mecatrónica', model: 'Ejetor Venturi' },
  },
  mecSupportBlock: {
    category: 'terminal', paletteName: 'Suporte / bloco maquinado de elevação em alumínio', group: 'Mecatrónica', tag: 'SUP', w: 90, h: 70,
    terminals: [],
    defaultState: { lengthMm: 120, heightMm: 100, depthMm: 80, manufacturer: 'DC-Simu Mecatrónica', model: 'Bloco fresado 120 × 100 × 80' },
  },
  mecDragChain: {
    category: 'terminal', paletteName: 'Esteira porta-cabos articulada 26 × 17 mm', group: 'Mecatrónica', tag: 'EPC', w: 140, h: 50,
    terminals: [],
    defaultState: { lengthMm: 320, manufacturer: 'DC-Simu Mecatrónica', model: 'Corrente porta-cabos 26 × 17' },
  },
  mecDrawerCylinder: {
    category: 'motor', paletteName: 'Cilindro da gaveta de estampagem (Cilindro 3) · Ø20 × 75 · B2/B1', group: 'Mecatrónica', tag: 'CIL', w: 150, h: 60,
    terminals: [
      T('A', 'pneumatic-in', 0.08, 0.05, { position3D: { x: 0.5, y: 0.98, z: 0.06 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 7 }),
      T('B', 'pneumatic-in', 0.45, 0.05, { position3D: { x: 0.5, y: 0.98, z: 0.54 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 7 }),
      T('REC+', 'power-in', 0.1, 0.95, { position3D: { x: 0.98, y: 0.66, z: 0.12 }, face: 'right', color: '#92400e', diameter: 4 }),
      T('REC', 'io', 0.2, 0.95, { position3D: { x: 0.98, y: 0.66, z: 0.16 }, face: 'right', color: '#111827', diameter: 4 }),
      T('AVA+', 'power-in', 0.38, 0.95, { position3D: { x: 0.98, y: 0.66, z: 0.46 }, face: 'right', color: '#92400e', diameter: 4 }),
      T('AVA', 'io', 0.48, 0.95, { position3D: { x: 0.98, y: 0.66, z: 0.50 }, face: 'right', color: '#111827', diameter: 4 }),
    ],
    defaultState: { positionPct: 0, extended: false, labelText: 'CILINDRO 3', sensorRecLabel: 'B2', sensorAvaLabel: 'B1', manufacturer: 'DC-Simu Mecatrónica', model: 'Cilindro Ø20 × 75 · dupla ação' },
  },
  mecValveIsland: {
    category: 'motor', paletteName: 'Ilha de eletroválvulas 2× 5/2 Festo (C1A / C2A) · 24 V DC', group: 'Mecatrónica', tag: 'YV', w: 130, h: 72,
    terminals: [
      T('P', 'pneumatic-in', 0.05, 0.5, { position3D: { x: 0.03, y: 0.52, z: 0.5 }, face: 'left', terminalType: 'plug', color: '#38bdf8', diameter: 7 }),
      T('A1', 'pneumatic-out', 0.28, 0.05, { position3D: { x: 0.36, y: 0.98, z: 0.32 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 6 }),
      T('B1', 'pneumatic-out', 0.44, 0.05, { position3D: { x: 0.54, y: 0.98, z: 0.32 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 6 }),
      T('A2', 'pneumatic-out', 0.66, 0.05, { position3D: { x: 0.36, y: 0.98, z: 0.68 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 6 }),
      T('B2', 'pneumatic-out', 0.82, 0.05, { position3D: { x: 0.54, y: 0.98, z: 0.68 }, face: 'top', terminalType: 'plug', color: '#38bdf8', diameter: 6 }),
      T('Y1', 'coil-plus', 0.25, 0.95, { position3D: { x: 0.05, y: 0.62, z: 0.32 }, face: 'left', color: '#f59e0b', diameter: 4 }),
      T('Y2', 'coil-plus', 0.52, 0.95, { position3D: { x: 0.05, y: 0.62, z: 0.68 }, face: 'left', color: '#f59e0b', diameter: 4 }),
      T('0V', 'coil-minus', 0.82, 0.95, { position3D: { x: 0.95, y: 0.62, z: 0.5 }, face: 'right', color: '#2563eb', diameter: 4 }),
    ],
    defaultState: { islandTag: 'C1A', station1On: false, station2On: false, station1Manual: false, station2Manual: false, manufacturer: 'DC-Simu Mecatrónica', model: 'Sub-base 2× 5/2 · 24 V DC' },
  },
  mecOpticalSensor: {
    category: 'sensor', paletteName: 'Sensor ótico difuso M18 (S. OTICO · B11) · PNP NA', group: 'Mecatrónica', tag: 'B', w: 72, h: 64,
    terminals: [
      T('+24V', 'power-in', 0.2, 0.95, { position3D: { x: 0.16, y: 0.14, z: 0.5 }, face: 'left', color: '#92400e', diameter: 4 }),
      T('0V', 'coil-minus', 0.5, 0.95, { position3D: { x: 0.22, y: 0.14, z: 0.5 }, face: 'left', color: '#2563eb', diameter: 4 }),
      T('OUT', 'io', 0.8, 0.95, { position3D: { x: 0.28, y: 0.14, z: 0.5 }, face: 'left', color: '#111827', diameter: 4 }),
    ],
    defaultState: { triggered: false, actuation: 'feeder', labelText: 'S. OTICO', manufacturer: 'DC-Simu Mecatrónica', model: 'Fotocélula difusa M18 · Sn 400 mm' },
  },
  mecInductiveSensor: {
    category: 'sensor', paletteName: 'Sensor indutivo faceado M12 (S. INDUTIVO) · PNP NA', group: 'Mecatrónica', tag: 'B', w: 72, h: 60,
    terminals: [
      T('+24V', 'power-in', 0.2, 0.95, { position3D: { x: 0.35, y: 0.06, z: 0.5 }, face: 'bottom', color: '#92400e', diameter: 4 }),
      T('0V', 'coil-minus', 0.5, 0.95, { position3D: { x: 0.50, y: 0.06, z: 0.5 }, face: 'bottom', color: '#2563eb', diameter: 4 }),
      T('OUT', 'io', 0.8, 0.95, { position3D: { x: 0.65, y: 0.06, z: 0.5 }, face: 'bottom', color: '#111827', diameter: 4 }),
    ],
    defaultState: { triggered: false, actuation: 'feeder', labelText: 'S. INDUTIVO', manufacturer: 'DC-Simu Mecatrónica', model: 'Indutivo M12 faceado · metais' },
  },
  mecHmiKtp700: {
    category: 'controller', paletteName: 'Consola Siemens SIMATIC HMI KTP700 Basic · bastidor 30 × 30', group: 'Mecatrónica', tag: 'HMI', w: 140, h: 110,
    terminals: [
      T('L+', 'power-in', 0.25, 0.95, { position3D: { x: 0.36, y: 0.38, z: 0.18 }, face: 'back', color: '#dc2626', diameter: 4 }),
      T('M', 'coil-minus', 0.5, 0.95, { position3D: { x: 0.42, y: 0.38, z: 0.18 }, face: 'back', color: '#2563eb', diameter: 4 }),
      T('PN', 'io', 0.78, 0.95, { position3D: { x: 0.66, y: 0.38, z: 0.18 }, face: 'back', color: '#16a34a', diameter: 5 }),
    ],
    defaultState: { on: true, powered: true, screenPage: 'start-center', selectedRow: 1, manufacturer: 'Siemens', model: 'SIMATIC HMI KTP700 Basic · 6AV2 123-2GB03-0AX0' },
  },
  mecOperatorBox: {
    category: 'command', paletteName: 'Caixa de botões de comando 6 furos · EMERG / MAN-AUTO / START / STOP', group: 'Mecatrónica', tag: 'CMD', w: 160, h: 86,
    terminals: [
      T('+24V', 'power-in', 0.06, 0.05, { position3D: { x: 0.12, y: 0.5, z: 0.02 }, face: 'back', color: '#dc2626', diameter: 4 }),
      T('EMERG', 'aux-nc', 0.20, 0.95, { position3D: { x: 0.22, y: 0.5, z: 0.02 }, face: 'back', color: '#ef4444', diameter: 4 }),
      T('AUTO', 'aux-no', 0.35, 0.95, { position3D: { x: 0.36, y: 0.5, z: 0.02 }, face: 'back', color: '#f59e0b', diameter: 4 }),
      T('REARME', 'aux-no', 0.50, 0.95, { position3D: { x: 0.50, y: 0.5, z: 0.02 }, face: 'back', color: '#3b82f6', diameter: 4 }),
      T('CICLO', 'aux-no', 0.65, 0.95, { position3D: { x: 0.64, y: 0.5, z: 0.02 }, face: 'back', color: '#a855f7', diameter: 4 }),
      T('STOP', 'aux-nc', 0.80, 0.95, { position3D: { x: 0.78, y: 0.5, z: 0.02 }, face: 'back', color: '#dc2626', diameter: 4 }),
      T('START', 'aux-no', 0.94, 0.95, { position3D: { x: 0.90, y: 0.5, z: 0.02 }, face: 'back', color: '#16a34a', diameter: 4 }),
    ],
    defaultState: { emergLatched: false, autoMode: true, resetPressed: false, dirRight: false, stopPressed: false, startPressed: false, manufacturer: 'DC-Simu Mecatrónica', model: 'Pupitre 6 furos Ø22 · Guião 1185' },
  },
  mecSignalTower: {
    category: 'signaling', paletteName: 'Coluna luminosa de sinalização 3 cores · base quadrada em alumínio', group: 'Mecatrónica', tag: 'HL', w: 68, h: 120,
    terminals: [
      T('G', 'coil-plus', 0.2, 0.95, { position3D: { x: 0.32, y: 0.04, z: 0.5 }, face: 'bottom', color: '#16a34a', diameter: 4 }),
      T('Y', 'coil-plus', 0.45, 0.95, { position3D: { x: 0.46, y: 0.04, z: 0.5 }, face: 'bottom', color: '#eab308', diameter: 4 }),
      T('R', 'coil-plus', 0.7, 0.95, { position3D: { x: 0.60, y: 0.04, z: 0.5 }, face: 'bottom', color: '#dc2626', diameter: 4 }),
      T('0V', 'coil-minus', 0.9, 0.95, { position3D: { x: 0.76, y: 0.04, z: 0.5 }, face: 'bottom', color: '#2563eb', diameter: 4 }),
    ],
    defaultState: { green: true, yellow: false, red: false, manualGreen: true, manualYellow: false, manualRed: false, manufacturer: 'DC-Simu Mecatrónica', model: 'Torre LED Ø50 · 24 V DC' },
  },
  mecBenchDuct: {
    category: 'terminal', paletteName: 'Calha técnica ranhurada da bancada · PVC cinzento RAL 7030', group: 'Mecatrónica', tag: 'CAL', w: 140, h: 42,
    terminals: [],
    defaultState: { lengthMm: 700, widthMm: 35, heightMm: 45, axis: 'x', coverOn: true, manufacturer: 'DC-Simu Mecatrónica', model: 'Calha ranhurada 35 × 45' },
  },
  industrialWall: {
    category: 'terminal', paletteName: 'Parede industrial modular 3D (betão / painel / tijolo)', group: 'Estruturas e esteiras', tag: 'PAR', w: 220, h: 48,
    terminals: [],
    defaultState: {
      lengthMm: 3000,
      heightMm: 3200,
      thicknessMm: 200,
      finish: 'concrete',
      skirting: true,
      manufacturer: 'DC-Simu Estruturas',
      model: 'Parede Modular PBR',
    },
  },
  industrialPillar: {
    category: 'terminal', paletteName: 'Pilar metálico estrutural 3D · Perfil IPE / HEB', group: 'Estruturas e esteiras', tag: 'PIL', w: 68, h: 68,
    terminals: [],
    defaultState: {
      heightMm: 3200,
      profile: 'HEB200',
      finish: 'steel',
      manufacturer: 'DC-Simu Estruturas',
      model: 'Coluna HEB 200',
    },
  },
  cableTrayStraight: {
    category: 'terminal', paletteName: 'Esteira porta-cabos reta perfurada galvanizada', group: 'Estruturas e esteiras', tag: 'EST', w: 200, h: 64,
    terminals: [],
    defaultState: {
      lengthMm: 1200,
      widthMm: 200,
      sideHeightMm: 60,
      withCover: false,
      manufacturer: 'DC-Simu / IEC 61537',
      model: 'Esteira Perfurada Galvanizada',
    },
  },
  cableTrayElbow90: {
    category: 'terminal', paletteName: 'Curva horizontal 90° de esteira porta-cabos', group: 'Estruturas e esteiras', tag: 'EC', w: 120, h: 120,
    terminals: [],
    defaultState: {
      widthMm: 200,
      sideHeightMm: 60,
      radiusMm: 220,
      manufacturer: 'DC-Simu / IEC 61537',
      model: 'Curva 90° Galvanizada',
    },
  },
  cableTrayCross: {
    category: 'terminal', paletteName: 'Cruzamento X / Derivação T de esteira porta-cabos', group: 'Estruturas e esteiras', tag: 'EX', w: 130, h: 130,
    terminals: [],
    defaultState: {
      widthMm: 200,
      sideHeightMm: 60,
      variant: 'cross',
      manufacturer: 'DC-Simu / IEC 61537',
      model: 'Cruzamento X / Tê Galvanizado',
    },
  },
  cableTrayVerticalBend: {
    category: 'terminal', paletteName: 'Pescoço / Curva vertical articulada de esteira', group: 'Estruturas e esteiras', tag: 'EP', w: 130, h: 90,
    terminals: [],
    defaultState: {
      widthMm: 200,
      sideHeightMm: 60,
      angleDeg: 45,
      direction: 'up',
      manufacturer: 'DC-Simu / IEC 61537',
      model: 'Pescoço Articulado Galvanizado',
    },
  },
  cableTrayRiser90: {
    category: 'terminal', paletteName: 'Curva vertical 90° exterior/interior de esteira (riser)', group: 'Estruturas e esteiras', tag: 'ER', w: 120, h: 110,
    terminals: [],
    defaultState: {
      widthMm: 200,
      sideHeightMm: 60,
      radiusMm: 220,
      riserKind: 'exterior',
      manufacturer: 'DC-Simu / IEC 61537',
      model: 'Curva Vertical 90° Galvanizada',
    },
  },
  wireTrayStraight: {
    category: 'terminal', paletteName: 'Esteira aramada reta galvanizada · Cablofil / OBO GR-Magic', group: 'Estruturas e esteiras', tag: 'EA', w: 180, h: 72,
    terminals: [],
    defaultState: {
      lengthMm: 1200,
      widthMm: 200,
      sideHeightMm: 60,
      mountBracket: 'wall-console',
      dropOutPlate: false,
      couplerClips: true,
      manufacturer: 'Cablofil / OBO GR-Magic',
      model: 'Leito Aramado Reto · Ø4,8 mm',
    },
  },
  wireTrayElbow90: {
    category: 'terminal', paletteName: 'Curva 90° de esteira aramada galvanizada', group: 'Estruturas e esteiras', tag: 'EA', w: 124, h: 124,
    terminals: [],
    defaultState: {
      widthMm: 200,
      sideHeightMm: 60,
      radiusMm: 220,
      manufacturer: 'Cablofil / OBO GR-Magic',
      model: 'Curva 90° Aramada · Ø4,8 mm',
    },
  },
  wireTrayTee: {
    category: 'terminal', paletteName: 'Derivação Tê / Cruz de esteira aramada galvanizada', group: 'Estruturas e esteiras', tag: 'EA', w: 132, h: 132,
    terminals: [],
    defaultState: {
      widthMm: 200,
      sideHeightMm: 60,
      variant: 'tee',
      manufacturer: 'Cablofil / OBO GR-Magic',
      model: 'Derivação Tê / Cruz Aramada',
    },
  },
  wireTrayRiser90: {
    category: 'terminal', paletteName: 'Curva vertical / subida 90° de esteira aramada', group: 'Estruturas e esteiras', tag: 'EA', w: 122, h: 112,
    terminals: [],
    defaultState: {
      widthMm: 200,
      sideHeightMm: 60,
      radiusMm: 220,
      riserKind: 'exterior',
      manufacturer: 'Cablofil / OBO GR-Magic',
      model: 'Subida Vertical 90° Aramada',
    },
  },
  hydraulicFlowMeter: {
    category: 'measurement', paletteName: 'Contador de água eletrónico 3D · ZJLCD-BT01 (PVC DN25–DN80)', group: 'Hidráulica', tag: 'FM', w: 152, h: 96,
    terminals: [
      T('IN', 'hydraulic-in', 0.04, 0.56, { position3D: { x: 0.02, y: 0.42, z: 0.50 }, face: 'left', terminalType: 'plug', color: '#0284c7', diameter: 11 }),
      T('OUT', 'hydraulic-out', 0.96, 0.56, { position3D: { x: 0.98, y: 0.42, z: 0.50 }, face: 'right', terminalType: 'plug', color: '#0284c7', diameter: 11 }),
      T('+24V', 'power-in', 0.34, 0.96, { position3D: { x: 0.62, y: 0.14, z: 0.72 }, face: 'bottom', terminalType: 'screw', color: '#dc2626', diameter: 8 }),
      T('PULSE', 'io', 0.50, 0.96, { position3D: { x: 0.62, y: 0.10, z: 0.72 }, face: 'bottom', terminalType: 'screw', color: '#eab308', diameter: 8 }),
      T('GND', 'neutral', 0.66, 0.96, { position3D: { x: 0.62, y: 0.06, z: 0.72 }, face: 'bottom', terminalType: 'screw', color: '#111827', diameter: 8 }),
    ],
    defaultState: {
      pipeDN: 'DN32',
      withCable: true,
      displayMode: 'total',
      installOrientation: 'horizontal',
      singleVolumeL: 14.894,
      totalVolumeL: 19.3,
      flowRateLpm: 0,
      flowing: false,
      manualTestFlow: false,
      pulseHigh: false,
      manufacturer: 'ZJLCD / SEA',
      model: 'ZJLCD-BT01 · PVC DN32',
      powered: false,
    },
  },
  waterSupplyBox: {
    category: 'power', paletteName: 'Caixa / Fonte de Água 3D · ARCO + ZJLCD-BT01 + WAGO 221', group: 'Hidráulica', tag: 'AG', w: 184, h: 132,
    terminals: [
      T('OUT', 'hydraulic-out', 0.96, 0.56, { position3D: { x: 1.066, y: 0.58, z: 0.44 }, face: 'right', terminalType: 'plug', color: '#0284c7', diameter: 11 }),
      T('+24V', 'power-in', 0.30, 0.96, { position3D: { x: 0.8373, y: 0.8485, z: 0.2118 }, face: 'right', terminalType: 'screw', color: '#dc2626', diameter: 7 }),
      T('PULSE', 'io', 0.50, 0.96, { position3D: { x: 0.8373, y: 0.7909, z: 0.2118 }, face: 'right', terminalType: 'screw', color: '#eab308', diameter: 7 }),
      T('GND', 'neutral', 0.70, 0.96, { position3D: { x: 0.8373, y: 0.7333, z: 0.2118 }, face: 'right', terminalType: 'screw', color: '#111827', diameter: 7 }),
    ],
    defaultState: {
      doorOpen: true,
      readingHatchOpen: false,
      // Passador fechado ao criar: sem tubo no OUT, abrir derrama água no chão.
      valveOpen: false,
      mainsSupplyOn: true,
      pressureBar: 3.5,
      pipeDN: 'DN32',
      singleVolumeL: 0,
      totalVolumeL: 124.5,
      flowRateLpm: 0,
      flowing: false,
      manualTestFlow: false,
      pulseHigh: false,
      internalBoxCoverOpen: true,
      manufacturer: 'DC-Simu Hidráulica',
      model: 'Caixa Água ABS · ARCO + ZJLCD-BT01 + WAGO 221',
      powered: false,
    },
  },
  triProofLedBatten: {
    category: 'signaling', paletteName: 'Luminária LED Tri-Proof IP65 · Potência & CCT Ajustável (Linkable)', group: 'Iluminação', tag: 'H', w: 196, h: 64,
    terminals: [
      T('L', 'power-in', 0.06, 0.24, { position3D: { x: 0.04, y: 0.54, z: 0.50 }, face: 'left', terminalType: 'screw', color: '#8b4513', diameter: 8 }),
      T('N', 'neutral', 0.06, 0.50, { position3D: { x: 0.04, y: 0.44, z: 0.50 }, face: 'left', terminalType: 'screw', color: '#2563eb', diameter: 8 }),
      T('PE', 'earth', 0.06, 0.76, { position3D: { x: 0.04, y: 0.34, z: 0.50 }, face: 'left', terminalType: 'screw', color: '#16a34a', diameter: 8 }),
      T('L_OUT', 'power-out', 0.94, 0.24, { position3D: { x: 0.96, y: 0.54, z: 0.50 }, face: 'right', terminalType: 'screw', color: '#8b4513', diameter: 8 }),
      T('N_OUT', 'neutral', 0.94, 0.50, { position3D: { x: 0.96, y: 0.44, z: 0.50 }, face: 'right', terminalType: 'screw', color: '#2563eb', diameter: 8 }),
      T('PE_OUT', 'earth', 0.94, 0.76, { position3D: { x: 0.96, y: 0.34, z: 0.50 }, face: 'right', terminalType: 'screw', color: '#16a34a', diameter: 8 }),
    ],
    defaultState: {
      on: false,
      testOn: false,
      wattage: 40,
      cctK: 4000,
      linkable: true,
      ipRating: 'IP65',
      cableEnabled: true,
      cableLengthMm: 650,
      cableExitDir: 'left',
      cableColor: '#1f2937',
      manufacturer: 'DC-Simu Iluminação',
      model: 'Tri-Proof LED IP65 · 18–60W · 3000K–6500K · Linkable',
    },
  },
  conduitVdsStraight: {
    category: 'terminal', paletteName: 'Tubo VDS Rígido PVC c/ Serigrafia & Encaixes Automáticos', group: 'Tubos VDS & Abraçadeiras', tag: 'TV', w: 180, h: 48,
    terminals: [],
    defaultState: {
      diameterMm: 25,
      lengthMm: 1000,
      autoCouplers: true,
      clampCount: 2,
      clampStyle: 'pvc-clip',
      serigraphy: 'VDS PVC-U Ø25mm · EN 61386-21 · 750N · IP65',
      manufacturer: 'DC-Simu / EN 61386-21',
      model: 'Tubo VDS Rígido Ø25 mm',
    },
  },
  conduitVdsElbow90: {
    category: 'terminal', paletteName: 'Curva 90° Tubo VDS PVC c/ Encaixes Automáticos', group: 'Tubos VDS & Abraçadeiras', tag: 'CV', w: 108, h: 108,
    terminals: [],
    defaultState: {
      diameterMm: 25,
      autoCouplers: true,
      clampCount: 0,
      clampStyle: 'pvc-clip',
      manufacturer: 'DC-Simu / EN 61386-21',
      model: 'Curva VDS 90° Ø25 mm',
    },
  },
  conduitCorrugated: {
    category: 'terminal', paletteName: 'Tubo Corrugado Flexível Anelado Ø16–Ø40 mm', group: 'Tubos VDS & Abraçadeiras', tag: 'TC', w: 180, h: 52,
    terminals: [],
    defaultState: {
      diameterMm: 25,
      lengthMm: 1000,
      bendAngleDeg: 0,
      color: '#1b1f25',
      clampCount: 2,
      clampStyle: 'pvc-clip',
      manufacturer: 'DC-Simu / EN 61386-22',
      model: 'Tubo Corrugado Flexível Ø25 mm',
    },
  },
  pipeClampPvc: {
    category: 'terminal', paletteName: 'Abraçadeira Clip PVC VDS Encaixe Rápido', group: 'Tubos VDS & Abraçadeiras', tag: 'AB', w: 72, h: 72,
    terminals: [],
    defaultState: {
      diameterMm: 25,
      manufacturer: 'DC-Simu / VDS',
      model: 'Clip PVC VDS Ø25 mm',
    },
  },
  pipeClampMetalEpdm: {
    category: 'terminal', paletteName: 'Abraçadeira Metálica Galvanizada c/ Borracha EPDM', group: 'Tubos VDS & Abraçadeiras', tag: 'AB', w: 76, h: 76,
    terminals: [],
    defaultState: {
      diameterMm: 25,
      manufacturer: 'DC-Simu / DIN 3567',
      model: 'Abraçadeira Isófona EPDM Ø25 mm',
    },
  },
  pipeClampMetalScrew: {
    category: 'terminal', paletteName: 'Abraçadeira Metálica Simples c/ Espigão Roscado', group: 'Tubos VDS & Abraçadeiras', tag: 'AB', w: 76, h: 76,
    terminals: [],
    defaultState: {
      diameterMm: 25,
      manufacturer: 'DC-Simu / Fixação',
      model: 'Abraçadeira Metálica Espigão Ø25 mm',
    },
  },
  junctionBoxOboT60: {
    category: 'terminal', paletteName: 'Caixa de derivação OBO T60 · IP66 (114×114×57 mm)', group: 'Caixas OBO & WAGO 221', tag: 'CX', w: 116, h: 116,
    terminals: [],
    defaultState: {
      coverOpen: false,
      glandTop: true,
      glandBottom: true,
      glandLeft: false,
      glandRight: false,
      lidSticker: 'none',
      lidLabelText: '',
      manufacturer: 'OBO Bettermann',
      model: 'T60 · IP66 · 500V',
    },
  },
  junctionBoxOboA6: {
    category: 'terminal', paletteName: 'Caixa de derivação OBO A6 · IP55 (80×43×34 mm)', group: 'Caixas OBO & WAGO 221', tag: 'CX', w: 108, h: 72,
    terminals: [],
    defaultState: {
      coverOpen: false,
      glandTop: true,
      glandBottom: true,
      glandLeft: false,
      glandRight: false,
      lidSticker: 'none',
      lidLabelText: '',
      manufacturer: 'OBO Bettermann',
      model: 'A6 · IP55 · 400V',
    },
  },
  junctionBoxOboT25: {
    category: 'terminal', paletteName: 'Caixa de derivação redonda OBO T25 · IP55 (Ø80 mm)', group: 'Caixas OBO & WAGO 221', tag: 'CX', w: 98, h: 98,
    terminals: [],
    defaultState: {
      coverOpen: false,
      glandTop: true,
      glandBottom: true,
      glandLeft: false,
      glandRight: false,
      lidSticker: 'none',
      lidLabelText: '',
      manufacturer: 'OBO Bettermann',
      model: 'T25 · IP55 · Ø80',
    },
  },
  wago221_2: {
    category: 'terminal', paletteName: 'Conector WAGO 221-412 · 2 vias (alavanca 32A)', group: 'Caixas OBO & WAGO 221', tag: 'W', w: 72, h: 64,
    terminals: [
      T('1', 'bus', 0.30, 0.92, { position3D: { x: 0.30, y: 0.04, z: 0.56 }, face: 'bottom', terminalType: 'spring', color: '#f25610', diameter: 9 }),
      T('2', 'bus', 0.70, 0.92, { position3D: { x: 0.70, y: 0.04, z: 0.56 }, face: 'bottom', terminalType: 'spring', color: '#f25610', diameter: 9 }),
    ],
    defaultState: {
      hostLocation: 'free',
      hostBoxId: '',
      leversOpen: [false, false],
      manufacturer: 'WAGO',
      model: '221-412 · 450V 32A',
    },
  },
  wago221_3: {
    category: 'terminal', paletteName: 'Conector WAGO 221-413 · 3 vias (alavanca 32A)', group: 'Caixas OBO & WAGO 221', tag: 'W', w: 96, h: 64,
    terminals: [
      T('1', 'bus', 0.22, 0.92, { position3D: { x: 0.22, y: 0.04, z: 0.56 }, face: 'bottom', terminalType: 'spring', color: '#f25610', diameter: 9 }),
      T('2', 'bus', 0.50, 0.92, { position3D: { x: 0.50, y: 0.04, z: 0.56 }, face: 'bottom', terminalType: 'spring', color: '#f25610', diameter: 9 }),
      T('3', 'bus', 0.78, 0.92, { position3D: { x: 0.78, y: 0.04, z: 0.56 }, face: 'bottom', terminalType: 'spring', color: '#f25610', diameter: 9 }),
    ],
    defaultState: {
      hostLocation: 'free',
      hostBoxId: '',
      leversOpen: [false, false, false],
      manufacturer: 'WAGO',
      model: '221-413 · 450V 32A',
    },
  },
  wago221_5: {
    category: 'terminal', paletteName: 'Conector WAGO 221-415 · 5 vias (alavanca 32A)', group: 'Caixas OBO & WAGO 221', tag: 'W', w: 120, h: 64,
    terminals: [
      T('1', 'bus', 0.14, 0.92, { position3D: { x: 0.16, y: 0.04, z: 0.56 }, face: 'bottom', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('2', 'bus', 0.32, 0.92, { position3D: { x: 0.33, y: 0.04, z: 0.56 }, face: 'bottom', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('3', 'bus', 0.50, 0.92, { position3D: { x: 0.50, y: 0.04, z: 0.56 }, face: 'bottom', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('4', 'bus', 0.68, 0.92, { position3D: { x: 0.67, y: 0.04, z: 0.56 }, face: 'bottom', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('5', 'bus', 0.86, 0.92, { position3D: { x: 0.84, y: 0.04, z: 0.56 }, face: 'bottom', terminalType: 'spring', color: '#f25610', diameter: 8 }),
    ],
    defaultState: {
      hostLocation: 'free',
      hostBoxId: '',
      leversOpen: [false, false, false, false, false],
      manufacturer: 'WAGO',
      model: '221-415 · 450V 32A',
    },
  },
  wago221_inline: {
    category: 'terminal', paletteName: 'Conector WAGO 221-2411 · Inline 2 vias (emenda 32A)', group: 'Caixas OBO & WAGO 221', tag: 'W', w: 112, h: 48,
    terminals: [
      T('1', 'bus', 0.06, 0.50, { position3D: { x: 0.04, y: 0.50, z: 0.50 }, face: 'left', terminalType: 'spring', color: '#f25610', diameter: 9 }),
      T('2', 'bus', 0.94, 0.50, { position3D: { x: 0.96, y: 0.50, z: 0.50 }, face: 'right', terminalType: 'spring', color: '#f25610', diameter: 9 }),
    ],
    defaultState: {
      hostLocation: 'free',
      hostBoxId: '',
      leversOpen: [false, false],
      manufacturer: 'WAGO',
      model: '221-2411 Inline · 450V 32A',
    },
  },
  wago221_double: {
    category: 'terminal', paletteName: 'Conector WAGO 221 Duplo · 2×5 vias (10 alavancas 32A)', group: 'Caixas OBO & WAGO 221', tag: 'W', w: 124, h: 86,
    terminals: [
      T('A1', 'bus', 0.14, 0.12, { position3D: { x: 0.16, y: 0.72, z: 0.96 }, face: 'front', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('A2', 'bus', 0.32, 0.12, { position3D: { x: 0.33, y: 0.72, z: 0.96 }, face: 'front', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('A3', 'bus', 0.50, 0.12, { position3D: { x: 0.50, y: 0.72, z: 0.96 }, face: 'front', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('A4', 'bus', 0.68, 0.12, { position3D: { x: 0.67, y: 0.72, z: 0.96 }, face: 'front', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('A5', 'bus', 0.86, 0.12, { position3D: { x: 0.84, y: 0.72, z: 0.96 }, face: 'front', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('B1', 'bus', 0.14, 0.88, { position3D: { x: 0.16, y: 0.28, z: 0.96 }, face: 'front', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('B2', 'bus', 0.32, 0.88, { position3D: { x: 0.33, y: 0.28, z: 0.96 }, face: 'front', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('B3', 'bus', 0.50, 0.88, { position3D: { x: 0.50, y: 0.28, z: 0.96 }, face: 'front', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('B4', 'bus', 0.68, 0.88, { position3D: { x: 0.67, y: 0.28, z: 0.96 }, face: 'front', terminalType: 'spring', color: '#f25610', diameter: 8 }),
      T('B5', 'bus', 0.86, 0.88, { position3D: { x: 0.84, y: 0.28, z: 0.96 }, face: 'front', terminalType: 'spring', color: '#f25610', diameter: 8 }),
    ],
    defaultState: {
      hostLocation: 'free',
      hostBoxId: '',
      commonBus: false,
      leversOpen: [false, false, false, false, false, false, false, false, false, false],
      manufacturer: 'WAGO',
      model: '221-415 2×5 · 450V 32A',
    },
  },
  rollerConveyor: {
    category: 'motor', paletteName: 'Tapete rolante industrial 3D · FERPLAST (motorizado / livre)', group: 'Motores', tag: 'TR', w: 220, h: 120,
    terminals: [
      T('U1', 'power-in', 0.58, 0.94, { position3D: { x: 0.76, y: 0.86, z: 0.94 }, face: 'top', terminalType: 'screw', color: '#78350f', diameter: 10 }),
      T('V1', 'power-in', 0.68, 0.94, { position3D: { x: 0.80, y: 0.86, z: 0.94 }, face: 'top', terminalType: 'screw', color: '#111827', diameter: 10 }),
      T('W1', 'power-in', 0.78, 0.94, { position3D: { x: 0.84, y: 0.86, z: 0.94 }, face: 'top', terminalType: 'screw', color: '#6b7280', diameter: 10 }),
      T('PE', 'earth', 0.88, 0.94, { position3D: { x: 0.88, y: 0.86, z: 0.94 }, face: 'top', terminalType: 'screw', color: '#84cc16', diameter: 10 }),
    ],
    defaultState: {
      running: false,
      direction: 'stopped',
      rpmVisual: 0,
      tripped: false,
      motorized: true,
      motorSide: 'front',
      terminalBoxCovered: false,
      lengthMm: 1600,
      widthMm: 680,
      heightMm: 750,
      testBoxActive: true,
      testBoxPosPct: 24,
      lineSensors: [
        { id: 's-in', label: 'S1 Entrada', kind: 'optical', positionPct: 18, side: 'front', angleDeg: 0, heightOffsetMm: 65, withReflector: true, triggered: false },
        { id: 's-out', label: 'S2 Saída', kind: 'optical', positionPct: 82, side: 'front', angleDeg: 0, heightOffsetMm: 65, withReflector: true, triggered: false },
      ],
      manufacturer: 'FERPLAST / DC-Simu',
      model: 'Série RLM 3~',
      phases: 3,
      powerKw: 0.55,
      voltage: '400V~',
    },
  },
  opticalReflector: {
    category: 'sensor', paletteName: 'Espelho refletor ótico prismático · XUZC50', group: 'Sensores', tag: 'ER', w: 68, h: 74,
    terminals: [],
    defaultState: {
      angleDeg: 0,
      tiltDeg: 0,
      faceSizeMm: 50,
      bracketMounted: true,
      manufacturer: 'Schneider / DC-Simu',
      model: 'XUZC50 · IP67',
    },
  },
  sensorMountBalluff: {
    category: 'sensor', paletteName: 'Base de montagem BALLUFF para sensores · braço com olhal', group: 'Sensores', tag: 'BM', w: 104, h: 118,
    terminals: [],
    defaultState: {
      armYawDeg: 0,
      manufacturer: 'BALLUFF',
      model: 'Braço de montagem · base + coluna + braço + olhal',
    },
  },
  waterTank: {
    category: 'sensor', paletteName: 'Reservatório de água 3D (transparente)', group: 'Hidráulica', tag: 'TK', w: 150, h: 170,
    terminals: [
      T('IN', 'hydraulic-in', 0.04, 0.22, { position3D: { x: 0.04, y: 0.78, z: 0.50 }, face: 'left', terminalType: 'plug', color: '#0ea5e9', diameter: 12 }),
      T('OUT', 'hydraulic-out', 0.96, 0.78, { position3D: { x: 0.96, y: 0.22, z: 0.50 }, face: 'right', terminalType: 'plug', color: '#dc2626', diameter: 12 }),
    ],
    defaultState: {
      diameterMm: 360,
      heightMm: 480,
      // Começa vazio: enche pela fonte de água, por uma bomba ou pelo enchimento manual.
      levelPct: 0,
      outletValveOpen: false,
      manualFill: false,
      filling: false,
      manufacturer: 'DC-Simu Hidráulica',
      model: 'Reservatório Transparente 3D',
    },
  },
  /**
   * Condensador genérico de arranque/funcionamento (estilo CBB65 cilíndrico).
   * GLB gerado a partir do STEP «60uf capacitor godrej». Valores de capacitância,
   * tensão e tolerância são atribuídos no estado (defaults 60 µF / 450 VAC).
   * Dois terminais faston no topo. Não polarizado.
   */
  capacitorRun60uF: {
    category: 'motor', paletteName: 'Condensador (genérico CBB65 · 6 pinos faston)', group: 'Motores', tag: 'C', w: 70, h: 110,
    terminals: [
      T('1', 'power-in', 0.18, 0, { position3D: { x: 0.35, y: 1, z: 0.5 }, terminalType: 'faston', diameter: 8, color: '#94a3b8' }),
      T('1B', 'power-in', 0.36, 0, { position3D: { x: 0.41, y: 1, z: 0.5 }, terminalType: 'faston', diameter: 8, color: '#94a3b8' }),
      T('2', 'power-out', 0.55, 0.06, { position3D: { x: 0.59, y: 1, z: 0.45 }, terminalType: 'faston', diameter: 8, color: '#94a3b8' }),
      T('2B', 'power-out', 0.82, 0.06, { position3D: { x: 0.65, y: 1, z: 0.45 }, terminalType: 'faston', diameter: 8, color: '#94a3b8' }),
      T('2C', 'power-out', 0.55, 0.2, { position3D: { x: 0.59, y: 1, z: 0.55 }, terminalType: 'faston', diameter: 8, color: '#94a3b8' }),
      T('2D', 'power-out', 0.82, 0.2, { position3D: { x: 0.65, y: 1, z: 0.55 }, terminalType: 'faston', diameter: 8, color: '#94a3b8' }),
    ],
    defaultState: {
      capacitanceUf: 60,
      tolerancePct: 5,
      voltageVac: 450,
      frequencyHz: 50,
      temperatureClass: '40/85/21',
      manufacturer: 'Genérico / CBB65',
      model: 'Condensador de arranque',
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
  plcSiemensS71500Di32: {
    category: 'controller', paletteName: 'Siemens S7-1500 DI 32×24 V · 6ES7521-1BL00-0AB0', group: 'Controladores', tag: 'DI', w: 320, h: 220,
    terminals: plcS71500Di32Terminals(),
    defaultState: {
      powered: false,
      inputs: {},
      outputs: {},
      memories: {},
      supply: '24 V DC',
      channels: 32,
      reference: '6ES7521-1BL00-0AB0',
      ledSF: false,
      ledDIAG: false,
    },
  },
  plcSiemensS71500Cpu1511c: {
    category: 'controller', paletteName: 'Siemens S7-1500 CPU 1511C-1 PN · 6ES7511-1CK00-0AB0', group: 'Controladores', tag: 'PLC', w: 380, h: 240,
    terminals: plcS71500Cpu1511cTerminals(),
    defaultState: {
      powered: false,
      inputs: {},
      outputs: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`Q${Math.floor(i / 8)}.${i % 8}`, false])),
      memories: {},
      supply: '24 V DC',
      reference: '6ES7511-1CK00-0AB0',
      ledRUN: false,
      ledERROR: false,
      ledMAINT: false,
      displayOn: false,
    },
  },
  plcSiemensS7300Cpu315: {
    category: 'controller', paletteName: 'Siemens S7-300 CPU 315-2 DP', group: 'Controladores', tag: 'PLC', w: 280, h: 220,
    terminals: plcS7300Cpu315Terminals(),
    defaultState: {
      powered: false,
      inputs: {},
      outputs: {},
      memories: {},
      supply: '24 V DC',
      reference: 'CPU 315-2 DP',
      mode: 'STOP',
      ledSF: false,
      ledBATF: false,
      ledDC5V: false,
      ledFRCE: false,
      ledRUN: false,
      ledSTOP: true,
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
    defaultState: { bridged: true, connection: 'Push-in', sectionMm2: 6, maxSectionMm2: 10, nominalA: 41, nominalV: 800, article: '3213972', poleCount: 1 },
  },
  terminalPE: {
    category: 'terminal', paletteName: 'Borne de terra (verde/amarelo)', group: 'Bornes e barras', tag: 'XPE', w: 70, h: 50,
    terminals: [T('PE1', 'earth', 0.3, 0.5, { color: '#27834a' }), T('PE2', 'earth', 0.7, 0.5, { color: '#27834a' })],
    defaultState: { bridged: true },
  },
  dinRail15x55: {
    category: 'terminal',
    paletteName: 'Calha DIN perfurada TS35 / G-rail (EN 60715) · textura real',
    group: 'Quadros e calhas',
    tag: 'TR',
    w: 1500,
    h: 53, // footprint 2D para TS35 (35 mm × SCHEMATIC_PX_PER_MM ≈ 52,5)
    terminals: [],
    defaultState: { lengthMm: 1000, profile: '35×7,5 mm', finish: 'Aço galvanizado', perforated: true },
  },
  panelEnclosure: {
    category: 'terminal', paletteName: 'Quadro metálico com porta (IP66) · chapa de montagem', group: 'Quadros e calhas', tag: 'QE', w: 900, h: 1200,
    terminals: [],
    defaultState: { widthMm: 600, heightMm: 800, depthMm: 250, doorOpen: true, hingeSide: 'left', plateFinish: 'Aço galvanizado' },
  },
  cableDuct: {
    category: 'terminal', paletteName: 'Calha técnica ranhurada com tampa (PVC)', group: 'Quadros e calhas', tag: 'CT', w: 900, h: 60,
    terminals: [],
    defaultState: { lengthMm: 600, widthMm: 40, heightMm: 60, coverOn: true },
  },
  spiralWrap: {
    category: 'terminal', paletteName: 'Espiral de proteção de cabos (PVC)', group: 'Quadros e calhas', tag: 'ESP', w: 400, h: 40,
    terminals: [],
    defaultState: { lengthMm: 300, innerDiaMm: 10, pitchMm: 8, color: '#0a0a0a' },
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
  busbarPhaseAcrylic: {
    category: 'terminal',
    paletteName: 'Barramento de fase (L)',
    group: 'Bornes e barras',
    tag: 'BF',
    ...busbarFootprintPx('busbarPhaseAcrylic')!,
    terminals: busbarTerminalSpecs('busbarPhaseAcrylic', {
      poleCount: ACRYLIC_BUSBAR.defaultPoles,
      acrylicColor: ACRYLIC_BUSBAR.defaultPhaseAcrylicColor,
    }),
    defaultState: {
      poleCount: ACRYLIC_BUSBAR.defaultPoles,
      acrylicColor: ACRYLIC_BUSBAR.defaultPhaseAcrylicColor,
      coverVisible: true,
      source: false,
      sourcePhase: 'L1',
    },
  },
  busbarNeutral: {
    category: 'terminal',
    paletteName: 'Barramento de neutro (N)',
    group: 'Bornes e barras',
    tag: 'BN',
    ...busbarFootprintPx('busbarNeutral')!,
    terminals: busbarTerminalSpecs('busbarNeutral', {
      poleCount: ACRYLIC_BUSBAR.defaultPoles,
    }),
    defaultState: {
      poleCount: ACRYLIC_BUSBAR.defaultPoles,
      coverVisible: true,
      source: true,
    },
  },
  earthBar: {
    category: 'terminal',
    paletteName: 'Barramento de terra (PE)',
    group: 'Bornes e barras',
    tag: 'BPE',
    ...busbarFootprintPx('earthBar')!,
    terminals: busbarTerminalSpecs('earthBar', {
      poleCount: ACRYLIC_BUSBAR.defaultPoles,
    }),
    defaultState: {
      poleCount: ACRYLIC_BUSBAR.defaultPoles,
      coverVisible: true,
      source: true,
    },
  },
  busbarPhaseStepped: {
    category: 'terminal',
    paletteName: 'Barramento de fases em escada',
    group: 'Bornes e barras',
    tag: 'QBL',
    ...busbarFootprintPx('busbarPhaseStepped')!,
    terminals: busbarTerminalSpecs('busbarPhaseStepped', {
      poleCount: STEPPED_BUSBAR.defaultHoles,
      barsMode: STEPPED_BUSBAR.defaultBars,
    }),
    defaultState: {
      poleCount: STEPPED_BUSBAR.defaultHoles,
      barsMode: STEPPED_BUSBAR.defaultBars,
      coverOpen: false,
      coverVisible: true,
      source: false,
    },
  },
  busbarComb: {
    category: 'terminal',
    paletteName: 'Barramento tipo pente (pino)',
    group: 'Bornes e barras',
    tag: 'BP',
    ...busbarFootprintPx('busbarComb', {
      poleCount: COMB_BUSBAR.defaultPoles,
      combMode: COMB_BUSBAR.defaultMode,
    })!,
    terminals: busbarTerminalSpecs('busbarComb', {
      poleCount: COMB_BUSBAR.defaultPoles,
      combMode: COMB_BUSBAR.defaultMode,
      neutralSide: COMB_BUSBAR.defaultNeutralSide,
      teethDirection: COMB_BUSBAR.defaultTeethDirection,
      endCaps: true,
      feedConnectors: COMB_BUSBAR.defaultFeedConnectors,
    }),
    defaultState: {
      poleCount: COMB_BUSBAR.defaultPoles,
      combMode: COMB_BUSBAR.defaultMode,
      neutralSide: COMB_BUSBAR.defaultNeutralSide,
      teethDirection: COMB_BUSBAR.defaultTeethDirection,
      brandStyle: COMB_BUSBAR.defaultBrand,
      ratedA: COMB_BUSBAR.defaultRatedA,
      endCaps: true,
      feedConnectors: COMB_BUSBAR.defaultFeedConnectors,
      connectorColor: COMB_BUSBAR.defaultConnectorColor,
      connectorPhaseColors: false,
      source: false,
      sourcePhase: 'L1',
    },
  },
  combBusbarConnector: {
    category: 'terminal',
    paletteName: 'Conector para barramento pente',
    group: 'Bornes e barras',
    tag: 'CB',
    ...busbarFootprintPx('combBusbarConnector')!,
    terminals: busbarTerminalSpecs('combBusbarConnector', {
      connectorColor: COMB_CONNECTOR.defaultColor,
      pinDirection: COMB_CONNECTOR.defaultPinDirection,
      pinStyle: COMB_CONNECTOR.defaultPinStyle,
      gaugeRange: COMB_CONNECTOR.defaultGauge,
    }),
    defaultState: {
      connectorColor: COMB_CONNECTOR.defaultColor,
      pinDirection: COMB_CONNECTOR.defaultPinDirection,
      pinStyle: COMB_CONNECTOR.defaultPinStyle,
      gaugeRange: COMB_CONNECTOR.defaultGauge,
    },
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
  terminalSet24v: {
    category: 'terminal', paletteName: 'Conjunto de bornes 24V · 0V/+24V/PE', group: 'Bornes e barras', tag: 'X', w: 135, h: 86,
    terminals: [
      T('0V-IN', 'neutral', 1 / 6, 0, { color: '#171717', terminalType: 'screw', position3D: { x: 1 / 6, y: 1, z: 1 } }), T('0V-OUT', 'neutral', 1 / 6, 1, { color: '#171717', terminalType: 'screw', position3D: { x: 1 / 6, y: 0, z: 1 } }),
      T('+24V-IN', 'power-in', 0.50, 0, { color: '#dc2626', terminalType: 'screw', position3D: { x: 0.50, y: 1, z: 1 } }), T('+24V-OUT', 'power-out', 0.50, 1, { color: '#dc2626', terminalType: 'screw', position3D: { x: 0.50, y: 0, z: 1 } }),
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
  powerSource24v: {
    category: 'power', paletteName: 'Fonte DC 24V · 0V/+24V/PE', group: 'Fontes', tag: 'QG', w: 135, h: 95,
    terminals: [
      T('0V', 'neutral', 1 / 6, 0, { color: '#171717', terminalType: 'screw', position3D: { x: 1 / 6, y: 1, z: 1 } }),
      T('+24V', 'power-out', 0.50, 0, { color: '#dc2626', terminalType: 'screw', position3D: { x: 0.50, y: 1, z: 1 } }),
      T('PE', 'earth', 5 / 6, 0, { color: '#27834a', terminalType: 'screw', position3D: { x: 5 / 6, y: 1, z: 1 } }),
    ],
    defaultState: { on: true, nominalV: 24 },
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
  currentTransformerSplitCore: {
    category: 'measurement', paletteName: 'TC externo abrível · janela Ø16 mm', group: 'Aparelhos de medir', tag: 'TC', w: 54, h: 72,
    terminals: [
      T('P1','io',.5,.12,{displayName:'Primário · passagem do mesmo condutor (entrada)',position3D:{x:.5,y:28/48,z:1},terminalType:'spring'}),
      T('P2','io',.5,.3,{displayName:'Primário · passagem do mesmo condutor (saída)',position3D:{x:.5,y:28/48,z:0},terminalType:'spring'}),
      T('S1','io',.35,.88,{displayName:'Secundário S1 · só entrada TC compatível',position3D:{x:14/36,y:5/48,z:.92},terminalType:'screw',color:'#dc2626'}),
      T('S2','io',.65,.88,{displayName:'Secundário S2 · só entrada TC compatível',position3D:{x:22/36,y:5/48,z:.92},terminalType:'screw',color:'#1f2937'}),
    ],
    defaultState:{primaryA:100,secondaryA:.05,primaryConductor:false,referenceOnly:true},
  },
  meterD522066: {
    category: 'measurement', paletteName: 'Medidor monofásico multifunções D52-2066 LCD', group: 'Aparelhos de medir', tag: 'PM', w: 108, h: 160,
    terminals: [
      T('1', 'power-in', 0.28, 0.92, {
        displayName: '1 · Tensão L (AC 40–300V)', color: '#171717', terminalType: 'screw',
        position3D: { x: 0.28, y: 0.16, z: 0.88 },
      }),
      T('2', 'neutral', 0.48, 0.92, {
        displayName: '2 · Tensão N', color: '#2563eb', terminalType: 'screw',
        position3D: { x: 0.48, y: 0.16, z: 0.88 },
      }),
      T('3', 'io', 0.28, 0.08, {
        displayName: '3 · TC secundário (S1)', color: '#f59e0b', terminalType: 'screw',
        position3D: { x: 0.28, y: 0.84, z: 0.88 },
      }),
      T('4', 'io', 0.48, 0.08, {
        displayName: '4 · TC secundário (S2)', color: '#f59e0b', terminalType: 'screw',
        position3D: { x: 0.48, y: 0.84, z: 0.88 },
      }),
    ],
    defaultState: { on: false, voltage: 0, current: 0, power: 0, energy: 0, frequency: 0, powerFactor: 1.0, resetPressed: false },
  },
  meterKws306: {
    category: 'measurement', paletteName: 'Medidor trifásico KWS-306 LCD', group: 'Aparelhos de medir', tag: 'PM', w: 148, h: 173,
    terminals: [
      T('L1-IN', 'power-in', 0.15, 0.08, {
        displayName: 'A (L1) · Entrada de rede', color: '#171717', terminalType: 'screw',
        position3D: { x: 0.1351, y: 0.88, z: 0.5692 },
      }),
      T('L2-IN', 'power-in', 0.38, 0.08, {
        displayName: 'B (L2) · Entrada de rede', color: '#8b4513', terminalType: 'screw',
        position3D: { x: 0.3784, y: 0.88, z: 0.5692 },
      }),
      T('L3-IN', 'power-in', 0.62, 0.08, {
        displayName: 'C (L3) · Entrada de rede', color: '#6b7280', terminalType: 'screw',
        position3D: { x: 0.6216, y: 0.88, z: 0.5692 },
      }),
      T('N-IN', 'neutral', 0.85, 0.08, {
        displayName: 'N · Entrada de rede', color: '#2563eb', terminalType: 'screw',
        position3D: { x: 0.8649, y: 0.88, z: 0.5692 },
      }),
      T('L1-OUT', 'power-out', 0.15, 0.92, {
        displayName: 'A (L1) · Saída para carga', color: '#171717', terminalType: 'screw',
        position3D: { x: 0.1351, y: 0.12, z: 0.5692 },
      }),
      T('L2-OUT', 'power-out', 0.38, 0.92, {
        displayName: 'B (L2) · Saída para carga', color: '#8b4513', terminalType: 'screw',
        position3D: { x: 0.3784, y: 0.12, z: 0.5692 },
      }),
      T('L3-OUT', 'power-out', 0.62, 0.92, {
        displayName: 'C (L3) · Saída para carga', color: '#6b7280', terminalType: 'screw',
        position3D: { x: 0.6216, y: 0.12, z: 0.5692 },
      }),
      T('N-OUT', 'neutral', 0.85, 0.92, {
        displayName: 'N · Saída para carga', color: '#2563eb', terminalType: 'screw',
        position3D: { x: 0.8649, y: 0.12, z: 0.5692 },
      }),
    ],
    defaultState: { on: false, switchOn: true, vA: 0, vB: 0, vC: 0, iA: 0, iB: 0, iC: 0, pA: 0, pB: 0, pC: 0, energy: 0, frequency: 0, temp: 20, screenMode: 0 },
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
  // Authored native geometry has priority over the mechanical factory revision.
  if (MECHANICAL_INTERFACE_TYPES.has(input.type) && (input.editorVersion ?? 1) > 1) return input
  const imported = upgradeImportedTerminals(input, createTerminal)
  // Os medidores DIN estavam classificados como fontes. Só corrige essa
  // categoria legada; referências, nomes, estado e ligações ficam intactos.
  let c = (imported.type === 'meterD522066' || imported.type === 'meterKws306') && imported.category === 'power'
    ? { ...imported, category: 'measurement' as const } : imported
  if(c.type==='pilotLightSchneiderIil3p' && c.state.code==='A9E18324') c={...c,state:{...c.state,code:'A9E18327'}}
  const oldSize=LEGACY_MODULAR_SIZE[c.type], footprint=getSchematicPhysicalFootprint(c.type)
  if(oldSize && footprint && (c.w!==footprint.w || c.h!==footprint.h) && c.w===Math.round(oldSize.width*1.5) && c.h===Math.round(oldSize.height*1.5)) {
    c={...c,w:footprint.w,h:footprint.h,schematicX:c.schematicX+(c.w-footprint.w)/2,schematicY:c.schematicY+(c.h-footprint.h)/2}
  }
  const spots = REAL_TERMINALS[c.type]
  if (!spots?.length) return c
  let changed = false
  const repairMeter = c.type === 'multimeterDm20' && c.terminals.length === 2 && c.terminals.some((terminal) => terminal.label === 'VΩmA')
  const terminals = c.terminals.map((terminal) => {
    const label = repairMeter && terminal.label === 'VΩmA' ? 'VΩ' : terminal.label
    const canonical = label === terminal.label ? terminal : { ...terminal, label, defId: 'dm20-volt' }
    if (canonical !== terminal) changed = true
    const spot = spots.find((item) => item.label.toLocaleUpperCase() === label.toLocaleUpperCase())
    const at = terminal.position3D
    const oldStep = c.type === 'timerGeyaGrt8M2' ? GEYA_PREVIOUS_STEP_TERMINALS.find(item => item.label === label) : undefined
    const matchesOldStep = oldStep && at && [realTerminalPosition(c.type, oldStep), legacyInsetIntoHole(c.type, oldStep), surfacePosition(oldStep)]
      .some(p => Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z) < 1e-6)
    const previous = matchesOldStep ? oldStep : LEGACY_REAL_TERMINALS[c.type]?.find((item) => item.label.toLocaleUpperCase() === terminal.label.toLocaleUpperCase())
    if (!spot || terminal.pinned) return canonical
    // XUKT: as primeiras raízes automáticas estavam deslocadas do fim da
    // bainha que já existe no CAD. Migrar só o par ponta/raiz conhecido;
    // bornes movidos ou fixados pelo utilizador nunca são reposicionados.
    if (c.type === 'photoSensorXukt1ksml2' && terminal.contact === 'lead' && at && terminal.socket3D?.position) {
      const oldY: Record<string, number> = { COM: 0.95, NA: 0.905, NF: 0.995 }
      const oldZ: Record<string, number> = { COM: 0.19, NA: 0.24, NF: 0.14 }
      if (oldY[label] !== undefined) {
        const oldSpot = { ...spot, y: oldY[label], z: oldZ[label] }
        const oldTip = realTerminalPosition(c.type, oldSpot, true)
        const oldRoot = leadRootPosition(c.type, oldSpot)
        const root = terminal.socket3D.position
        const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6
        if (close(at, oldTip) && close(root, oldRoot)) {
          changed = true
          return { ...canonical, position3D: realTerminalPosition(c.type, spot), socket3D: { ...terminal.socket3D, position: leadRootPosition(c.type, spot) } }
        }
      }
    }
    // Projetos antigos sem pigtails: aplica contact:lead + cores + socket da ficha real.
    if (spot.contact === 'lead' && terminal.contact !== 'lead') {
      changed = true
      const tip = realTerminalPosition(c.type, spot)
      const root = leadRootPosition(c.type, spot)
      const leadColor = ({
        R: '#dc2626', Y: '#eab308', G: '#16a34a', COM: '#1e293b',
        'V+': '#92400e', '0V': '#2563eb', OUT: '#111827',
      } as Record<string, string>)[spot.label]
      return {
        ...canonical,
        contact: 'lead' as const,
        terminalType: (canonical.terminalType === 'screw' ? 'tubular' : canonical.terminalType),
        color: leadColor ?? canonical.color,
        position3D: tip,
        diameter: spot.diameterMm ?? canonical.diameter,
        socket3D: {
          diameterMm: spot.diameterMm ?? 1.5,
          depthMm: LEAD_PIGTAIL_LENGTH_MM,
          insetMm: 0,
          normal: FACE_OUTWARD_3D[spot.face],
          position: root,
        },
      } satisfies Terminal
    }
    if (!at) return canonical
    const target = realTerminalPosition(c.type, spot)
    if (Math.hypot(at.x - target.x, at.y - target.y, at.z - target.z) < 1e-9) return canonical
    const legacy = legacyInsetIntoHole(c.type, previous ?? spot)
    const surface = surfacePosition(previous ?? spot)
    const inset = realTerminalPosition(c.type, previous ?? spot)
    const tolerance = MECHANICAL_INTERFACE_TYPES.has(c.type) ? 1e-6 : 1e-3
    const matches = (position: { x: number; y: number; z: number }) =>
      Math.abs(at.x - position.x) <= tolerance && Math.abs(at.y - position.y) <= tolerance && Math.abs(at.z - position.z) <= tolerance
    const meterPosition=LEGACY_METER_POSITIONS[c.type]?.[label]
    const oldPhysical=LEGACY_MODULAR_SIZE[c.type]
    const oldInset=previous && oldPhysical ? (()=>{
      const [nx,ny,nz]=FACE_INWARD[previous.face],d=terminalInsetMm(previous)
      return {x:previous.x+nx*d/oldPhysical.width,y:1-previous.y-ny*d/oldPhysical.height,z:previous.z+nz*d/oldPhysical.depth}
    })() : null
    if (!matches(legacy) && !matches(surface) && !matches(inset) && !matches(surfacePosition(spot)) && !(oldInset&&matches(oldInset)) && !(meterPosition&&matches(meterPosition))) return canonical
    const mechanical: Partial<Terminal> = {}
    if (MECHANICAL_INTERFACE_TYPES.has(c.type) && previous) {
      // A manual cable direction / socket is geometry too. Position alone is
      // not authority to overwrite it, even if it still sits at an old default.
      const socket = terminal.socket3D
      const close = (a: number, b: number) => Math.abs(a - b) < 1e-6
      // Older saves can carry a known legacy position with current default
      // metadata supplied by the loader. Accept either COMPLETE automatic
      // interface, never a mixture containing an authored socket or normal.
      const known = [previous, spot].map(candidate => {
        if (terminal.face && terminal.face !== candidate.face) return null
        if (terminal.contact && terminal.contact !== (candidate.contact ?? 'socket')) return null
        if (!socket) return { atMouth: false }
        const atMouth = close(socket.insetMm, 0) && close(socket.position.x, candidate.x)
          && close(socket.position.y, 1 - candidate.y) && close(socket.position.z, candidate.z)
        const atEndpoint = close(socket.insetMm, terminalInsetMm(candidate)) && close(socket.position.x, at.x)
          && close(socket.position.y, at.y) && close(socket.position.z, at.z)
        if ((!atMouth && !atEndpoint)
          || !socket.normal.every((n, i) => close(n, (candidate.normal ?? FACE_OUTWARD_3D[candidate.face])[i]))
          || !close(socket.diameterMm, candidate.diameterMm ?? 4)
          || !close(socket.depthMm, candidate.holeDepthMm ?? 5)) return null
        return { atMouth }
      }).find(candidate => candidate !== null)
      if (!known) return canonical
      if (socket) {
        mechanical.socket3D = { ...socket,
          position: known.atMouth ? { x: spot.x, y: 1 - spot.y, z: spot.z } : { ...target },
          normal: [...(spot.normal ?? FACE_OUTWARD_3D[spot.face])], diameterMm: spot.diameterMm ?? 4,
          depthMm: spot.holeDepthMm ?? 5, insetMm: known.atMouth ? 0 : terminalInsetMm(spot) }
      }
      mechanical.face = spot.face
      mechanical.contact = spot.contact ?? 'socket'
      if (terminal.diameter === previous.diameterMm) mechanical.diameter = spot.diameterMm
    }
    changed = true
    return { ...terminal, label, ...(repairMeter ? { defId: label === 'COM' ? 'dm20-com' : 'dm20-volt' } : {}), position3D: target,
      ...mechanical,
      // A calibração dos Acti9 também estreita a entrada no CAD; só o diâmetro
      // automático antigo acompanha a migração (valores personalizados ficam).
      ...((oldPhysical || c.type === 'residualBreakerSchneiderIid4p' || c.type === 'residualBreakerSchneiderIdpnVigi')
        && previous?.diameterMm === terminal.diameter ? { diameter: spot.diameterMm } : {}),
    }
  })
  // Sensor fotoelétrico: migrar V+/0V/OUT ou NO/NC para COM/NA/NF com pigtails.
  if (c.type === 'photoSensor' || c.type === 'photoSensorXukt1ksml2') {
    const rename: Record<string, string> = { 'V+': 'NA', 'OUT': 'NA', 'NO': 'NA', '0V': 'NF', 'NC': 'NF', 'C': 'COM' }
    for (let i = 0; i < terminals.length; i++) {
      const t = terminals[i]
      const next = rename[t.label]
      if (!next || terminals.some((x) => x.label === next && x.id !== t.id)) continue
      terminals[i] = { ...t, label: next }
      changed = true
    }
  }

    // Torre: garantir COM e pigtails R/Y/G/COM se o projeto só tinha R/Y/G.
  if ((c.type === 'towerLight' || c.type === 'towerLightSb23011' || c.type === 'photoSensor' || c.type === 'photoSensorXukt1ksml2' || c.type === 'proximitySensor') && spots) {
    for (const spot of spots) {
      if (terminals.some((t) => t.label.toLocaleUpperCase() === spot.label.toLocaleUpperCase())) continue
      const tip = realTerminalPosition(c.type, spot)
      const root = leadRootPosition(c.type, spot)
      const leadColor = ({ R: '#dc2626', Y: '#eab308', G: '#16a34a', COM: '#1e293b' } as Record<string, string>)[spot.label]
      const kind: TerminalKind = spot.label === 'COM' || spot.label === '0V'
        ? (spot.label === '0V' ? 'coil-minus' : 'aux-no')
        : spot.label === 'NF' || spot.label === 'NC'
          ? 'aux-nc'
          : spot.label === 'V+' || spot.label === 'OUT'
            ? (spot.label === 'V+' ? 'power-in' : 'io')
            : spot.label === 'NA' || spot.label === 'NO'
              ? 'aux-no'
              : 'io'
      terminals.push(createTerminal(c.id, spot.label, kind, spot.x, spot.face === 'bottom' ? 1 : spot.y))
      const last = terminals[terminals.length - 1]
      Object.assign(last, {
        contact: 'lead' as const,
        terminalType: 'tubular' as const,
        color: leadColor ?? last.color,
        position3D: tip,
        diameter: spot.diameterMm ?? 2,
        socket3D: {
          diameterMm: spot.diameterMm ?? 1.5,
          depthMm: LEAD_PIGTAIL_LENGTH_MM,
          insetMm: 0,
          normal: FACE_OUTWARD_3D[spot.face],
          position: root,
        },
      })
      changed = true
    }
  }

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
  // Só projetos nativos automáticos recebem a segunda entrada ON; as identidades
  // dos onze bornes existentes e os extremos dos cabos são conservados.
  if (c.type === 'breakerMurrelektronikMico46' && !terminals.some(t => t.label === 'ON2')) {
    const template = TEMPLATES.breakerMurrelektronikMico46.terminals.find(t => t.label === 'ON2')!
    terminals.push({ ...createTerminal(c.id, template.label, template.kind), ...template })
    changed = true
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
        NA: '#92400e', NF: '#2563eb', NO: '#92400e', NC: '#2563eb',
        // Cores típicas de cabo multipolar industrial (torres / sensores)
        BN: '#92400e', BU: '#2563eb', BK: '#1e293b', WH: '#f8fafc', GY: '#6b7280',
      } as Record<string, string>)[spot.label]
      return T(existing?.label ?? spot.label, kind, existing?.x ?? spot.x, existing?.y ?? schematicY, {
        ...existing,
        position3D: tip,
        diameter: spot.diameterMm ?? existing?.diameter,
        terminalType: isLead ? 'tubular' : (existing?.terminalType ?? 'screw'),
        contact: (spot.contact ?? 'socket') as Terminal['contact'],
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
  const types: ComponentType[] = ['terminalSet1ph', 'terminalSet3ph', 'terminalSet24v', 'powerSource1ph', 'powerSource3ph', 'powerSource24v']
  const module = getComponentPhysicalSizeMm('terminalPhoenixPti6')
  const spots = REAL_TERMINALS.terminalPhoenixPti6
  if (!module || !spots?.length) return
  for (const type of types) {
    const template = TEMPLATES[type]
    const conductors = terminalAssemblyConductors(type)
    for (const terminal of template.terminals) {
      const match = TERMINAL_CONDUCTOR_PATTERN.exec(terminal.label)
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
    // Os Siemens S7 mediram-se nos conectores frontais do CAD (`siemensPlc.ts`):
    // a projeção genérica punha-os nas faces superior/inferior, onde o módulo não
    // tem bornes. Ficam com a posição e a face próprias.
    const measuredFront = SIEMENS_S7_TYPES.includes(type)
    for (const terminal of template.terminals) {
      // A tipologia explícita evita que um modelo publicado dependa do
      // fallback visual. Perfis especiais já definidos nunca são substituídos.
      terminal.terminalType ??= 'screw'
      terminal.diameter ??= terminal.terminalType === 'plug' || terminal.terminalType === 'conical' ? 12 : terminal.terminalType === 'bar' ? 10 : 9
      if (measuredFront) {
        // Frente do módulo: o cabo sai por +Z e o borne fica na profundidade da frente.
        // Os pinos dos conectores estão a 0,02–0,03 das bordas: o limite tem de ser largo.
        terminal.position3D ??= { x: Math.max(0.02, Math.min(0.98, terminal.x)), y: Math.max(0.02, Math.min(0.98, terminal.y)), z: 1 }
        terminal.face ??= S7_FRONT_FACE
        terminal.contact ??= 'pin'
        continue
      }
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
  // PTI6 régua variável: footprint depende de poleCount (76px por pólo)
  let footprint = getSchematicPhysicalFootprint(type) ?? { w: tpl.w, h: tpl.h }
  if (type === 'terminalPhoenixPti6' && typeof stateOverride.poleCount === 'number') {
    const n = Math.max(1, Math.min(48, Math.floor(Number(stateOverride.poleCount)) || 1))
    footprint = { w: 76 * n, h: tpl.h }
  }
  const compId = nanoid(8)
  // PTI6 multi-pólo: gerar 2*N bornes dinamicamente em vez do template fixo 1-2
  let srcTemplates: TerminalTemplate[] = tpl.terminals
  if (type === 'terminalPhoenixPti6' && typeof stateOverride.poleCount === 'number' && Number(stateOverride.poleCount) > 1) {
    srcTemplates = pti6TerminalTemplates(Number(stateOverride.poleCount))
  }
  const terminals: Terminal[] = srcTemplates.map((t) => ({
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
    ...(t.face ? { face: t.face } : {}),
    ...(t.row ? { row: t.row } : {}),
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
/** Motor monofásico de projetos anteriores (só U1 U2 PE): junta os bornes do enrolamento auxiliar Z1-Z2. */
export function upgradeMonoMotorTerminals(c: ElectricalComponent): ElectricalComponent {
  if (c.type !== 'motor1ph') return c
  const template = TEMPLATES.motor1ph.terminals
  const missing = template.filter((t) => !c.terminals.some((x) => x.label === t.label))
  if (!missing.length) return c
  return { ...c, terminals: [...c.terminals, ...missing.map((t): Terminal => ({
    id: `${c.id}-${t.label}`, componentId: c.id, label: t.label, kind: t.kind,
    terminalType: t.terminalType ?? KIND_TYPE[t.kind], color: t.color ?? KIND_COLOR[t.kind], x: t.x, y: t.y,
    ...(t.position3D ? { position3D: { ...t.position3D } } : {}), energized: false,
  }))] }
}

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

export interface PaletteSubgroup {
  id: string
  label: string
  items: Array<{ type: ComponentType; name: string; category: ComponentCategory }>
}

export interface PaletteDomain {
  id: 'eletricidade' | 'hidraulica' | 'pneumatica' | 'serralharia'
  label: string
  icon: string
  accent: string
  subgroups: PaletteSubgroup[]
}

/**
 * Hierarquia oficial da Biblioteca de Componentes por Domínio -> Subcategoria:
 * Eletricidade, Hidráulica, Pneumática e Serralharia & Infraestrutura.
 */
export function paletteDomains(): PaletteDomain[] {
  const domains: PaletteDomain[] = [
    { id: 'eletricidade', label: 'Eletricidade', icon: 'bolt', accent: '#f59e0b', subgroups: [] },
    { id: 'hidraulica', label: 'Hidráulica', icon: 'water', accent: '#0284c7', subgroups: [] },
    { id: 'pneumatica', label: 'Pneumática', icon: 'air', accent: '#06b6d4', subgroups: [] },
    { id: 'serralharia', label: 'Serralharia & Infraestrutura', icon: 'structure', accent: '#64748b', subgroups: [] },
  ]
  const byId = Object.fromEntries(domains.map((d) => [d.id, d])) as Record<PaletteDomain['id'], PaletteDomain>
  const subMap = new Map<string, PaletteSubgroup>()

  const pushTo = (
    domainId: PaletteDomain['id'],
    subId: string,
    subLabel: string,
    item: { type: ComponentType; name: string; category: ComponentCategory },
  ) => {
    const key = `${domainId}:${subId}`
    let sg = subMap.get(key)
    if (!sg) {
      sg = { id: subId, label: subLabel, items: [] }
      subMap.set(key, sg)
      byId[domainId].subgroups.push(sg)
    }
    sg.items.push(item)
  }

  for (const [type, tpl] of Object.entries(TEMPLATES) as Array<[ComponentType, ComponentTemplate]>) {
    if (hiddenCatalogTypes.has(type)) continue
    const item = { type, name: tpl.paletteName, category: tpl.category }

    if (tpl.group === 'Mecatrónica') {
      if (
        type === 'mecStampingPress' ||
        type === 'mecFeederCylinder' ||
        type === 'mecDrawerCylinder' ||
        type === 'mecRotaryArm' ||
        type === 'mecVacuumEjector' ||
        type === 'mecValveIsland'
      ) {
        pushTo('pneumatica', 'pneu-maquete', 'Maquete de estampagem · Atuadores & vácuo', item)
      } else if (
        type === 'mecDcGearmotor' ||
        type === 'mecMicroSwitchRoller' ||
        type === 'mecOpticalSensor' ||
        type === 'mecInductiveSensor' ||
        type === 'mecHmiKtp700' ||
        type === 'mecOperatorBox' ||
        type === 'mecSignalTower'
      ) {
        pushTo('eletricidade', 'ele-mecatronica', 'Mecatrónica · Motor DC, encoder, sensores & HMI', item)
      } else {
        pushTo('serralharia', 'ser-mecatronica', 'Mecatrónica · Perfis, base, calhas, magazine & rampas', item)
      }
      continue
    }
    if (tpl.group === 'Hidráulica') {
      if (type === 'waterSupplyBox' || type === 'hydraulicFlowMeter') {
        pushTo('hidraulica', 'hid-abastecimento', 'Abastecimento & Medição', item)
      } else {
        pushTo('hidraulica', 'hid-bombagem', 'Reservatórios, Bombas & Válvulas', item)
      }
      continue
    }

    if (tpl.group === 'Pneumática') {
      if (type === 'pneumaticFrl' || type === 'pneumaticManifold' || type === 'pneumaticTee' || type === 'pneumaticUnion' || type === 'pneumaticElbow' || type === 'pneumaticY' || type === 'airCompressor') {
        pushTo('pneumatica', 'pneu-tratamento', 'Tratamento & Distribuição de Ar', item)
      } else if (type === 'pneumaticValve52') {
        pushTo('pneumatica', 'pneu-valvulas', 'Eletroválvulas', item)
      } else {
        pushTo('pneumatica', 'pneu-atuadores', 'Cilindros, Atuadores & Vácuo', item)
      }
      continue
    }

    if (tpl.group === 'Estruturas e esteiras' || tpl.group === 'Tubos VDS & Abraçadeiras' || type === 'rollerConveyor') {
      if (type === 'industrialWall' || type === 'industrialPillar') {
        pushTo('serralharia', 'ser-estruturas', 'Paredes & Pilares Metálicos', item)
      } else if (type === 'wireTrayStraight' || type === 'wireTrayElbow90' || type === 'wireTrayTee' || type === 'wireTrayRiser90') {
        pushTo('serralharia', 'ser-aramadas', 'Esteiras Aramadas (Cablofil)', item)
      } else if (
        type === 'cableTrayStraight' ||
        type === 'cableTrayElbow90' ||
        type === 'cableTrayCross' ||
        type === 'cableTrayVerticalBend' ||
        type === 'cableTrayRiser90'
      ) {
        pushTo('serralharia', 'ser-perfuradas', 'Esteiras Perfuradas Galvanizadas', item)
      } else if (
        type === 'conduitVdsStraight' ||
        type === 'conduitVdsElbow90' ||
        type === 'conduitCorrugated' ||
        type === 'pipeClampPvc' ||
        type === 'pipeClampMetalEpdm' ||
        type === 'pipeClampMetalScrew'
      ) {
        pushTo('serralharia', 'ser-tubos-vds', 'Tubos VDS, Corrugados & Abraçadeiras', item)
      } else {
        pushTo('serralharia', 'ser-transportadores', 'Tapetes & Mecânica Industrial', item)
      }
      continue
    }

    // Todos os restantes pertencem ao domínio Eletricidade, mantendo cada grupo como subcategoria limpa
    pushTo('eletricidade', `ele-${tpl.group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, tpl.group, item)
  }

  return domains.filter((d) => d.subgroups.length > 0)
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
    .map((c) => {
      const rest = c.ref.slice(tag.length)
      // Reconhece tanto TAGs simples (`X1`, `X2`) como prefixos de réguas hierárquicas (`X1.0`, `X2.7`, `X1:3`)
      // sem nunca gerar números decimais (`1.3 + 1 = X2.3`).
      const m = /^(\d+)(?:[.:].*)?$/.exec(rest)
      return m ? Number(m[1]) : NaN
    })
    .filter((n) => Number.isInteger(n) && n >= 0)
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `${tag}${next}`
}
