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

import { nanoid } from 'nanoid'
import type {
  ElectricalComponent,
  ComponentType,
  ComponentCategory,
  Terminal,
  TerminalKind,
  TerminalType,
} from '../types'

export interface TerminalTemplate {
  label: string
  kind: TerminalKind
  x: number
  y: number
  terminalType?: TerminalType
  color?: string
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
 * seguindo a disposição real do dispositivo: tira superior L+/M/I1..I8 e tira
 * inferior com dois parafusos independentes para cada relé Q1..Q4. O
 * parafuso extra sem legenda na extremidade superior é X1 (19 no total).
 * Todos os bornes são do tipo parafuso, como no equipamento
 * físico.
 */
function plcLogoRCTerminals(): TerminalTemplate[] {
  const top = ['L+', 'M', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8']
  const list: TerminalTemplate[] = top.map((lbl, i) =>
    T(lbl, lbl === 'L+' ? 'power-in' : lbl === 'M' ? 'neutral' : 'io', 0.06 + i * (0.88 / (top.length - 1)), 0, {
      terminalType: 'screw',
      color: lbl === 'L+' ? '#f59e0b' : lbl === 'M' ? '#3b82f6' : '#a855f7',
    }),
  )
  list.push(T('X1', 'io', 0.98, 0, { terminalType: 'screw', color: '#94a3b8' }))
  ;['Q1', 'Q2', 'Q3', 'Q4'].forEach((lbl, i) => {
    list.push(T(lbl, 'io', 0.16 + i * 0.24, 1, { terminalType: 'screw', color: '#f59e0b' }))
    list.push(T(`${lbl}.2`, 'io', 0.21 + i * 0.24, 1, { terminalType: 'screw', color: '#f59e0b' }))
  })
  return list
}

function plcTerminals(inputs: number, outputs: number): TerminalTemplate[] {
  const list: TerminalTemplate[] = [
    T('L', 'power-in', 0.04, 0.5, { color: '#f59e0b' }),
    T('N', 'neutral', 0.96, 0.5),
  ]
  for (let i = 0; i < inputs; i++) list.push(T(`I${i + 1}`, 'io', 0.12 + i * (0.76 / inputs), 0))
  for (let i = 0; i < outputs; i++) list.push(T(`Q${i + 1}`, 'io', 0.2 + i * (0.6 / outputs), 1))
  return list
}

export const TEMPLATES: Record<ComponentType, ComponentTemplate> = {
  // ---------------- Proteção ----------------
  breaker1p: {
    category: 'protection', paletteName: 'Disjuntor monopolar', group: 'Proteção', tag: 'QF', w: 60, h: 110,
    terminals: [T('1', 'power-in', 0.5, 0), T('2', 'power-out', 0.5, 1)],
    defaultState: { closed: true, tripped: false, poles: 1, curve: 'C', inA: 16 },
  },
  breaker2p: {
    category: 'protection', paletteName: 'Disjuntor bipolar', group: 'Proteção', tag: 'QF', w: 90, h: 110,
    terminals: [
      T('1', 'power-in', 0.33, 0), T('2', 'power-out', 0.33, 1),
      T('3', 'power-in', 0.67, 0), T('4', 'power-out', 0.67, 1),
    ],
    defaultState: { closed: true, tripped: false, poles: 2, curve: 'C', inA: 16 },
  },
  breaker3p: {
    category: 'protection', paletteName: 'Disjuntor tripolar', group: 'Proteção', tag: 'QF', w: 120, h: 110,
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
  emergencyButton: {
    category: 'command', paletteName: 'Botão de emergência (cogumelo)', group: 'Comando', tag: 'S', w: 80, h: 80,
    terminals: [T('21', 'aux-nc', 0.15, 0.5), T('22', 'aux-nc', 0.85, 0.5)],
    defaultState: { pressed: false, latched: true, color: '#dc2626' },
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
    category: 'relay', paletteName: 'Relé de segurança (duplo canal)', group: 'Relés', tag: 'KS', w: 130, h: 120,
    terminals: [
      T('A1', 'coil-plus', 0.1, 0), T('A2', 'coil-minus', 0.1, 1),
      T('S11', 'io', 0.45, 0), T('S12', 'io', 0.6, 0), T('S21', 'io', 0.75, 0), T('S22', 'io', 0.9, 0),
      T('13', 'aux-no', 0.3, 1), T('14', 'aux-no', 0.45, 1), T('23', 'aux-no', 0.6, 1), T('24', 'aux-no', 0.75, 1),
    ],
    defaultState: { energized: false, tripped: false, dualChannel: true },
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
    category: 'motor', paletteName: 'Motor trifásico (U1/V1/W1)', group: 'Motores', tag: 'M', w: 120, h: 130,
    terminals: [
      T('U1', 'power-in', 0.25, 0), T('V1', 'power-in', 0.5, 0), T('W1', 'power-in', 0.75, 0),
      T('PE', 'earth', 0.5, 1),
    ],
    defaultState: { running: false, direction: 'stopped', rpmVisual: 0, tripped: false, cv: 1, rpm: 1730, voltage: '380V' },
  },
  motor1ph: {
    category: 'motor', paletteName: 'Motor monofásico', group: 'Motores', tag: 'M', w: 100, h: 120,
    terminals: [
      T('U1', 'power-in', 0.3, 0), T('U2', 'coil-minus', 0.7, 0), T('PE', 'earth', 0.5, 1),
    ],
    defaultState: { running: false, direction: 'stopped', rpmVisual: 0, tripped: false, cv: 0.5 },
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
    defaultState: { inputs: {}, outputs: { Q1: false, Q2: false, Q3: false, Q4: false }, memories: {} },
  },
  plcSiemensLogo1224RC: {
    category: 'controller', paletteName: 'Siemens LOGO! 12/24RC (8DI/4DQ)', group: 'Controladores', tag: 'PLC', w: 280, h: 190,
    terminals: plcLogoRCTerminals(),
    defaultState: { powered: false, inputs: {}, outputs: { Q1: false, Q2: false, Q3: false, Q4: false }, memories: {}, pressedButton: null },
  },
  plcCompact: {
    category: 'controller', paletteName: 'CLP modular 12I/8Q', group: 'Controladores', tag: 'PLC', w: 240, h: 160,
    terminals: plcTerminals(12, 8),
    defaultState: {
      inputs: {},
      outputs: { Q1: false, Q2: false, Q3: false, Q4: false, Q5: false, Q6: false, Q7: false, Q8: false },
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
  terminalPE: {
    category: 'terminal', paletteName: 'Borne de terra (verde/amarelo)', group: 'Bornes e barras', tag: 'XPE', w: 70, h: 50,
    terminals: [T('PE1', 'earth', 0.3, 0.5), T('PE2', 'earth', 0.7, 0.5)],
    defaultState: { bridged: true },
  },
  busbarPhase: {
    category: 'terminal', paletteName: 'Barramento de fases L1/L2/L3', group: 'Bornes e barras', tag: 'BL', w: 220, h: 50,
    terminals: [
      T('L1', 'power-in', 0.2, 0.5, { color: '#ef4444' }),
      T('L2', 'power-in', 0.5, 0.5, { color: '#f8fafc' }),
      T('L3', 'power-in', 0.8, 0.5, { color: '#1d4ed8' }),
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
      T('PE1', 'earth', 0.3, 0.5),
      T('PE2', 'earth', 0.6, 0.5),
      T('PE3', 'earth', 0.85, 0.5),
    ],
    defaultState: { source: true },
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
  analogAmmeter: {
    category: 'power', paletteName: 'Amperímetro analógico', group: 'Fontes', tag: 'PI', w: 80, h: 80,
    terminals: [T('1', 'io', 0.15, 0.5), T('2', 'io', 0.85, 0.5)],
    defaultState: { reading: 0, scaleInA: 10 },
  },
}

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
    energized: false,
  }))
  return {
    id: compId,
    type,
    category: tpl.category,
    ref: ref ?? tpl.tag,
    label: label ?? tpl.paletteName,
    slot,
    schematicX,
    schematicY,
    w: tpl.w,
    h: tpl.h,
    rotation: 0,
    mirrored: false,
    locked: false,
    bodyColor: undefined,
    terminals,
    // Cada PLC precisa das suas próprias tabelas I/Q/M; o spread superficial
    // partilhava `outputs` entre instâncias do mesmo modelo.
    state: { ...structuredClone(tpl.defaultState), ...stateOverride },
    faults: [],
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
  if (!c.terminals.some((t) => /^Q[1-4]\.2$/.test(t.label))) {
    for (let i = 1; i <= 4; i++) {
      const old = c.terminals.find((t) => t.label === `Q${i}`)
      if (old) extra.push({ ...old, id: `${c.id}-Q${i}.2`, label: `Q${i}.2`, x: 0.21 + (i - 1) * 0.24, y: 1, energized: false })
    }
  }
  // Projeto com 14/18 bornes: recuperar o parafuso sem legenda do topo.
  if (!c.terminals.some((t) => t.label === 'X1') && c.terminals.some((t) => t.label === 'I8')) {
    extra.push({ id: `${c.id}-X1`, componentId: c.id, label: 'X1', kind: 'io', terminalType: 'screw', color: '#94a3b8', x: 0.98, y: 0, energized: false })
  }
  return extra.length ? { ...c, terminals: [...c.terminals, ...extra] } : c
}

/** Migra a fonte 24B provisória para a variante de parafuso 24A sem perder cabos. */
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

export function terminalByLabel(c: ElectricalComponent, label: string): Terminal | undefined {
  return c.terminals.find((t) => t.label === label)
}

/** Lista da biblioteca agrupada, para a paleta lateral. */
export function paletteGroups(): Array<{ group: string; items: Array<{ type: ComponentType; name: string; category: ComponentCategory }> }> {
  const groups = new Map<string, Array<{ type: ComponentType; name: string; category: ComponentCategory }>>()
  for (const [type, tpl] of Object.entries(TEMPLATES) as Array<[ComponentType, ComponentTemplate]>) {
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
