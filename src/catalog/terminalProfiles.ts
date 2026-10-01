import type { ComponentCategory, TerminalElectricalClass, TerminalKind, TerminalType } from '../types'
import type { TerminalDirection, TerminalPolarity } from './types'

/**
 * Biblioteca de bornes e perfis de ligação.
 * Os perfis são SUGESTÕES de configuração: depois de aplicados, cada borne continua totalmente editável.
 */
export type Face = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
export const FACES: Array<[Face, string]> = [['front', 'Frente'], ['back', 'Trás'], ['left', 'Esq.'], ['right', 'Dir.'], ['top', 'Topo'], ['bottom', 'Base']]
export const FACE_NORMAL: Record<Face, [number, number, number]> = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0] }

export interface TerminalSpec {
  label: string
  name: string
  /** Função: L1, N, PE, +24V, A1, I0.0… */
  fn: string
  kind: TerminalKind
  polarity: TerminalPolarity
  electricalClass: TerminalElectricalClass
  direction: TerminalDirection
  terminalType: TerminalType
  color: string
  contact?: 'NO' | 'NC' | 'COM'
  group?: string
  /** Face do componente onde o borne é colocado ao aplicar o perfil. */
  face: Face
  /** Bornes com a mesma linha ficam alinhados na face. */
  row?: string
}

export interface ProfileParam {
  key: string
  label: string
  type: 'bool' | 'number' | 'select'
  default: boolean | number | string
  min?: number
  max?: number
  options?: Array<[string, string]>
}
export type ProfileParams = Record<string, boolean | number | string>

export interface TerminalProfile {
  id: string
  name: string
  /** Caminho na árvore: ['Proteção', 'Disjuntor']. */
  category: string[]
  description: string
  params?: ProfileParam[]
  build: (params: ProfileParams) => TerminalSpec[]
  custom?: boolean
}

/** Perfil guardado pelo administrador (serializável). */
export interface StoredProfile {
  id: string
  name: string
  category: string
  description: string
  specs: TerminalSpec[]
  updatedAt?: string
  updatedBy?: string
}

/* --------------------------------------------------------------- inferência */
const COLORS: Record<string, string> = {
  L: '#92400e', L1: '#92400e', L2: '#1f2937', L3: '#6b7280', N: '#2563eb', PE: '#65a30d', FE: '#84cc16', GND: '#65a30d',
  '+24V': '#dc2626', '+12V': '#ea580c', '+5V': '#f97316', '+V': '#dc2626', '0V': '#1d4ed8', '-V': '#1d4ed8',
}
type Inferred = Pick<TerminalSpec, 'kind' | 'polarity' | 'electricalClass'> & Partial<Pick<TerminalSpec, 'contact' | 'color' | 'direction'>>

/** Valores sensatos a partir da função (o administrador pode alterar tudo depois). */
export function inferFromFunction(fn: string): Inferred {
  const f = fn.trim().toUpperCase()
  if (/^L[123]?$/.test(f) || /^[1-5]L[123]$/.test(f)) return { kind: 'power-in', polarity: 'ac', electricalClass: 'ac', color: COLORS[f.replace(/^\d/, '')] ?? COLORS.L }
  if (/^[2-6]T[123]$/.test(f) || /^[UVW][12]?$/.test(f)) return { kind: 'power-out', polarity: 'ac', electricalClass: 'ac', color: '#92400e' }
  if (f === 'N') return { kind: 'neutral', polarity: 'neutral', electricalClass: 'ac', color: COLORS.N }
  if (['PE', 'FE'].includes(f)) return { kind: 'earth', polarity: 'earth', electricalClass: 'other', color: COLORS.PE }
  if (f === 'GND') return { kind: 'earth', polarity: 'earth', electricalClass: 'other', color: COLORS.GND }
  if (/^\+(24|12|5)?V$/.test(f) || f === 'L+') return { kind: 'power-in', polarity: 'positive', electricalClass: 'dc', color: COLORS[f] ?? '#dc2626' }
  if (f === '0V' || f === '-V' || f === 'M') return { kind: 'power-in', polarity: 'negative', electricalClass: 'dc', color: COLORS['0V'] }
  if (f === 'A1') return { kind: 'coil-plus', polarity: 'positive', electricalClass: 'dc', color: '#dc2626' }
  if (f === 'A2') return { kind: 'coil-minus', polarity: 'negative', electricalClass: 'dc', color: '#1d4ed8' }
  if (f === 'NO' || f === 'NA') return { kind: 'aux-no', polarity: 'none', electricalClass: 'other', contact: 'NO' }
  if (f === 'NC' || f === 'NF') return { kind: 'aux-nc', polarity: 'none', electricalClass: 'other', contact: 'NC' }
  if (f === 'COM' || f === 'C') return { kind: 'io', polarity: 'none', electricalClass: 'other', contact: 'COM' }
  if (/^(AI|AQ|AO)\d/.test(f) || f === 'SIGNAL') return { kind: 'analog', polarity: 'none', electricalClass: 'dc', color: '#7c3aed' }
  if (/^(A|B|CAN-[HL]|TX|RX)$/.test(f)) return { kind: 'bus', polarity: 'none', electricalClass: 'network', color: '#0891b2' }
  if (/^I\d/.test(f) || /^DI\d/.test(f)) return { kind: 'io', polarity: 'none', electricalClass: 'dc', direction: 'in' }
  if (/^Q\d/.test(f) || /^DO\d/.test(f)) return { kind: 'io', polarity: 'none', electricalClass: 'dc', direction: 'out' }
  return { kind: 'io', polarity: 'none', electricalClass: 'other' }
}

type SpecOptions = Partial<TerminalSpec>
/** Construtor de especificações de borne com inferência pela função. */
export function spec(label: string, name: string, fn: string, options: SpecOptions = {}): TerminalSpec {
  const inferred = inferFromFunction(fn)
  return {
    label, name, fn, kind: inferred.kind, polarity: inferred.polarity, electricalClass: inferred.electricalClass,
    direction: inferred.direction ?? 'io', terminalType: 'screw', color: inferred.color ?? '#cbd5e1', contact: inferred.contact,
    face: 'front', ...options,
  }
}
const inn = (label: string, name: string, fn: string, o: SpecOptions = {}) => spec(label, name, fn, { direction: 'in', face: 'top', row: 'in', group: 'Entradas', ...o })
const out = (label: string, name: string, fn: string, o: SpecOptions = {}) => spec(label, name, fn, { direction: 'out', face: 'bottom', row: 'out', group: 'Saídas', ...o })

const bool = (key: string, label: string, def: boolean): ProfileParam => ({ key, label, type: 'bool', default: def })
const num = (key: string, label: string, def: number, min: number, max: number): ProfileParam => ({ key, label, type: 'number', default: def, min, max })
const count = (value: boolean | number | string | undefined, fallback: number, min = 0, max = 64) => Math.max(min, Math.min(max, Math.round(Number(value ?? fallback)) || 0))
const seq = (n: number) => Array.from({ length: n }, (_, i) => i)

/* ----------------------------------------------------------- terminais soltos */
/** Bornes individuais sugeridos (24.1 / 24.2): arrastáveis para o modelo. */
export const TERMINAL_CHIPS: Array<{ group: string; items: TerminalSpec[] }> = [
  { group: 'Contactos', items: [spec('NO', 'Contacto NA', 'NO', { group: 'Contactos' }), spec('NC', 'Contacto NF', 'NC', { group: 'Contactos' }), spec('COM', 'Comum', 'COM', { group: 'Contactos' })] },
  { group: 'Rede e terra', items: [spec('L', 'Fase', 'L'), spec('N', 'Neutro', 'N'), spec('PE', 'Terra de proteção', 'PE'), spec('GND', 'Massa', 'GND')] },
  { group: 'Corrente contínua', items: [spec('+24V', '+24 V', '+24V'), spec('0V', '0 V', '0V'), spec('+12V', '+12 V', '+12V'), spec('+5V', '+5 V', '+5V'), spec('+V', 'Positivo', '+V'), spec('-V', 'Negativo', '-V')] },
  { group: 'Sinal', items: [spec('IN', 'Entrada', 'IN', { direction: 'in' }), spec('OUT', 'Saída', 'OUT', { direction: 'out' }), spec('C', 'Comum (C)', 'C'), spec('A', 'A (barramento)', 'A'), spec('B', 'B (barramento)', 'B')] },
  { group: 'Medição (multímetro)', items: [
    spec('COM', 'COM (preto)', 'COM', { group: 'Medição', kind: 'io', polarity: 'none', contact: undefined, terminalType: 'plug', color: '#111827' }),
    spec('VΩ', 'V · Ω (vermelho)', 'V', { group: 'Medição', kind: 'io', polarity: 'none', terminalType: 'plug', color: '#dc2626' }),
    spec('mA', 'mA · µA', 'mA', { group: 'Medição', kind: 'io', polarity: 'none', terminalType: 'plug', color: '#f59e0b' }),
    spec('10A', 'A (10 A)', 'A', { group: 'Medição', kind: 'io', polarity: 'none', terminalType: 'plug', color: '#ea580c' }),
    spec('CH1', 'Canal 1 (BNC)', 'CH1', { group: 'Medição', kind: 'io', polarity: 'none', terminalType: 'conical', color: '#eab308' }),
  ] },
]

/* ------------------------------------------------------------------ perfis */
const PHASES = ['L1', 'L2', 'L3']

function breaker(poles: number, withN: boolean, numbering: 'iec' | 'letters'): TerminalSpec[] {
  const list: TerminalSpec[] = []
  const names = poles === 1 ? ['L'] : poles === 2 ? ['L', 'N'] : PHASES
  names.forEach((fn, index) => {
    const a = numbering === 'iec' ? String(index * 2 + 1) : `${fn}1`
    const b = numbering === 'iec' ? String(index * 2 + 2) : `${fn}2`
    const isN = fn === 'N'
    list.push((isN ? inn : inn)(a, `${fn} entrada`, fn, { kind: isN ? 'neutral' : 'power-in' }))
    list.push(out(b, `${fn} saída`, fn, { kind: isN ? 'neutral' : 'power-out' }))
  })
  if (withN) {
    const base = poles * 2
    list.push(inn(numbering === 'iec' ? String(base + 1) : 'N1', 'N entrada', 'N'))
    list.push(out(numbering === 'iec' ? String(base + 2) : 'N2', 'N saída', 'N'))
  }
  return list
}

function plcSpecs(p: ProfileParams): TerminalSpec[] {
  const list: TerminalSpec[] = []
  const dc = String(p.power ?? '24V') === '24V'
  if (dc) { list.push(inn('L+', '+24 V', '+24V', { row: 'pwr', group: 'Alimentação' }), inn('M', '0 V', '0V', { row: 'pwr', group: 'Alimentação' })) }
  else { list.push(inn('L', 'Fase', 'L', { row: 'pwr', group: 'Alimentação' }), inn('N', 'Neutro', 'N', { row: 'pwr', group: 'Alimentação' })) }
  if (p.pe !== false) list.push(inn('PE', 'Terra', 'PE', { row: 'pwr', group: 'Alimentação' }))
  const di = count(p.di, 8, 0, 32), dq = count(p.dq, 8, 0, 32), ai = count(p.ai, 0, 0, 16), ao = count(p.ao, 0, 0, 16)
  seq(di).forEach((i) => list.push(inn(`I${Math.floor(i / 8)}.${i % 8}`, `Entrada digital ${i + 1}`, `I${Math.floor(i / 8)}.${i % 8}`, { row: `di${Math.floor(i / 8)}`, group: 'Entradas digitais' })))
  seq(dq).forEach((i) => list.push(out(`Q${Math.floor(i / 8)}.${i % 8}`, `Saída digital ${i + 1}`, `Q${Math.floor(i / 8)}.${i % 8}`, { row: `dq${Math.floor(i / 8)}`, group: 'Saídas digitais' })))
  seq(ai).forEach((i) => list.push(inn(`AI${i}`, `Entrada analógica ${i + 1}`, `AI${i}`, { face: 'front', row: 'ai', group: 'Entradas analógicas' })))
  seq(ao).forEach((i) => list.push(out(`AQ${i}`, `Saída analógica ${i + 1}`, `AQ${i}`, { face: 'front', row: 'ao', group: 'Saídas analógicas' })))
  return list
}
const PLC_PARAMS: ProfileParam[] = [
  { key: 'power', label: 'Alimentação', type: 'select', default: '24V', options: [['24V', '24 V CC (L+ / M)'], ['230V', '230 V CA (L / N)']] },
  bool('pe', 'Terra (PE)', true), num('di', 'Entradas digitais', 8, 0, 32), num('dq', 'Saídas digitais', 8, 0, 32), num('ai', 'Entradas analógicas', 2, 0, 16), num('ao', 'Saídas analógicas', 2, 0, 16),
]

function contactor(p: ProfileParams): TerminalSpec[] {
  const list: TerminalSpec[] = [
    inn('1L1', 'L1 entrada', 'L1', { group: 'Potência' }), inn('3L2', 'L2 entrada', 'L2', { group: 'Potência' }), inn('5L3', 'L3 entrada', 'L3', { group: 'Potência' }),
    out('2T1', 'T1 saída', 'L1', { group: 'Potência', kind: 'power-out' }), out('4T2', 'T2 saída', 'L2', { group: 'Potência', kind: 'power-out' }), out('6T3', 'T3 saída', 'L3', { group: 'Potência', kind: 'power-out' }),
  ]
  if (p.coil !== false) list.push(spec('A1', 'Bobina A1', 'A1', { face: 'front', row: 'coil', group: 'Bobina' }), spec('A2', 'Bobina A2', 'A2', { face: 'front', row: 'coil', group: 'Bobina' }))
  const no = count(p.no, 1, 0, 4), nc = count(p.nc, 1, 0, 4)
  let digit = 1
  seq(no).forEach(() => { list.push(spec(`${digit}3`, `Auxiliar NA ${digit}`, 'NO', { face: 'front', row: 'aux', group: 'Auxiliares', contact: 'NO' }), spec(`${digit}4`, `Auxiliar NA ${digit}`, 'NO', { face: 'front', row: 'aux', group: 'Auxiliares', contact: 'NO' })); digit += 1 })
  seq(nc).forEach(() => { list.push(spec(`${digit}1`, `Auxiliar NF ${digit}`, 'NC', { face: 'front', row: 'aux', group: 'Auxiliares', contact: 'NC' }), spec(`${digit}2`, `Auxiliar NF ${digit}`, 'NC', { face: 'front', row: 'aux', group: 'Auxiliares', contact: 'NC' })); digit += 1 })
  return list
}

function relay(p: ProfileParams): TerminalSpec[] {
  const list: TerminalSpec[] = []
  if (p.coil !== false) list.push(inn('A1', 'Bobina A1', 'A1', { group: 'Bobina' }), inn('A2', 'Bobina A2', 'A2', { group: 'Bobina' }))
  seq(count(p.groups, 1, 1, 4)).forEach((g) => {
    const d = g + 1
    list.push(out(`${d}1`, `Grupo ${d} · COM`, 'COM', { row: `g${d}`, group: `Grupo ${d}` }), out(`${d}2`, `Grupo ${d} · NF`, 'NC', { row: `g${d}`, group: `Grupo ${d}`, contact: 'NC' }), out(`${d}4`, `Grupo ${d} · NA`, 'NO', { row: `g${d}`, group: `Grupo ${d}`, contact: 'NO' }))
  })
  return list
}

function powerSupply(p: ProfileParams, three: boolean): TerminalSpec[] {
  const list: TerminalSpec[] = []
  if (three) { PHASES.forEach((fn, i) => { if (p[fn] !== false) list.push(inn(fn, `Fase ${i + 1}`, fn, { group: 'Alimentação' })) }); if (p.N === true) list.push(inn('N', 'Neutro', 'N', { group: 'Alimentação' })) }
  else { if (p.L !== false) list.push(inn('L', 'Fase', 'L', { group: 'Alimentação' })); if (p.N !== false) list.push(inn('N', 'Neutro', 'N', { group: 'Alimentação' })) }
  if (p.PE !== false) list.push(inn('PE', 'Terra', 'PE', { group: 'Alimentação' }))
  return list
}


/* ------------------------------------------------------- instrumentos de medida */
/** Grupo reservado: portas de medição (multímetro, osciloscópio…) ligam a qualquer borne sem regras de polaridade. */
export const MEASURE_GROUP = 'Medição'
const jack = (label: string, name: string, fn: string, color: string, o: SpecOptions = {}) => spec(label, name, fn, {
  kind: 'io', polarity: 'none', electricalClass: 'other', direction: 'in', contact: undefined, terminalType: 'plug', color, face: 'front', row: 'jacks', group: MEASURE_GROUP, ...o,
})
const METER = { com: '#111827', volt: '#dc2626', ma: '#f59e0b', amp: '#ea580c', temp: '#7c3aed', hz: '#0ea5e9' }

function multimeter(p: ProfileParams): TerminalSpec[] {
  const list = [jack('COM', 'COM (comum, preto)', 'COM', METER.com), jack('VΩ', p.hz === true ? 'V · Ω · Hz · diodo' : 'V · Ω · diodo · continuidade', 'V', METER.volt)]
  if (p.ma !== false) list.push(jack('mA', 'mA · µA', 'mA', METER.ma))
  if (p.amp !== false) list.push(jack('10A', 'A (até 10 A)', 'A', METER.amp))
  if (p.temp === true) list.push(jack('T+', 'Termopar K (+)', 'T+', METER.temp, { row: 'temp' }), jack('T−', 'Termopar K (−)', 'T-', METER.temp, { row: 'temp' }))
  return list
}
function oscilloscope(p: ProfileParams): TerminalSpec[] {
  const channels = count(p.channels, 2, 1, 4)
  return [...seq(channels).map((i) => jack(`CH${i + 1}`, `Canal ${i + 1}`, `CH${i + 1}`, ['#eab308', '#22c55e', '#3b82f6', '#ef4444'][i], { terminalType: 'conical', row: 'ch' })),
    ...(p.ext === true ? [jack('EXT', 'Disparo externo', 'EXT', '#94a3b8', { terminalType: 'conical', row: 'ch' })] : []),
    jack('GND', 'Massa (chassis)', 'GND', METER.com, { row: 'gnd' })]
}

export const BUILTIN_PROFILES: TerminalProfile[] = [
  /* --- Alimentação --- */
  { id: 'power-1ph', name: 'Monofásico (L · N · PE)', category: ['Alimentação', 'Monofásico'], description: 'Alimentação monofásica: fase, neutro e terra.', params: [bool('L', 'Fase (L)', true), bool('N', 'Neutro (N)', true), bool('PE', 'Terra (PE)', true)], build: (p) => powerSupply(p, false) },
  { id: 'power-3ph', name: 'Trifásico (L1 · L2 · L3 · PE)', category: ['Alimentação', 'Trifásico'], description: 'Três fases com terra; neutro opcional.', params: [bool('L1', 'L1', true), bool('L2', 'L2', true), bool('L3', 'L3', true), bool('N', 'Neutro (N)', false), bool('PE', 'Terra (PE)', true)], build: (p) => powerSupply(p, true) },
  { id: 'power-3ph-n', name: 'Trifásico + Neutro', category: ['Alimentação', 'Trifásico + N'], description: 'L1, L2, L3, N e PE.', build: (p) => powerSupply({ ...p, N: true }, true) },
  { id: 'power-dc', name: 'Corrente contínua (+ · 0 V)', category: ['Alimentação', 'CC'], description: 'Alimentação CC com terra opcional.', params: [{ key: 'v', label: 'Tensão', type: 'select', default: '+24V', options: [['+24V', '24 V'], ['+12V', '12 V'], ['+5V', '5 V']] }, bool('PE', 'Terra (PE)', false)], build: (p) => [inn(String(p.v ?? '+24V'), String(p.v ?? '+24V'), String(p.v ?? '+24V'), { group: 'Alimentação' }), inn('0V', '0 V', '0V', { group: 'Alimentação' }), ...(p.PE === true ? [inn('PE', 'Terra', 'PE', { group: 'Alimentação' })] : [])] },
  /* --- Proteção --- */
  { id: 'breaker-1p', name: 'Disjuntor 1P', category: ['Proteção', 'Disjuntor'], description: 'Entrada 1 (topo) e saída 2 (base); neutro opcional.', params: [bool('n', 'Com neutro (N)', false)], build: (p) => breaker(1, p.n === true, 'iec') },
  { id: 'breaker-2p', name: 'Disjuntor 2P (L + N)', category: ['Proteção', 'Disjuntor 2P'], description: 'Fase e neutro cortados: 1/2 e 3/4.', build: () => breaker(2, false, 'iec') },
  { id: 'breaker-3p', name: 'Disjuntor 3P', category: ['Proteção', 'Disjuntor 3P'], description: '1·3·5 entradas L1/L2/L3 e 2·4·6 saídas.', params: [{ key: 'numbering', label: 'Numeração', type: 'select', default: 'iec', options: [['iec', 'IEC (1…6)'], ['letters', 'Por fase (L11, L12…)']] }], build: (p) => breaker(3, false, p.numbering === 'letters' ? 'letters' : 'iec') },
  { id: 'breaker-3p-n', name: 'Disjuntor 3P + N', category: ['Proteção', 'Disjuntor 3P'], description: 'L1, L2, L3 e N, entradas em cima e saídas em baixo.', params: [{ key: 'numbering', label: 'Numeração', type: 'select', default: 'iec', options: [['iec', 'IEC (1…8)'], ['letters', 'Por fase (L11, L12…)']] }], build: (p) => breaker(3, true, p.numbering === 'letters' ? 'letters' : 'iec') },
  { id: 'breaker-4p', name: 'Disjuntor 4P', category: ['Proteção', 'Disjuntor 4P'], description: 'Quatro pólos (L1, L2, L3, N), numeração 1…8.', build: () => breaker(3, true, 'iec') },
  /* --- Comando --- */
  { id: 'pb-no', name: 'Botão NA', category: ['Comando', 'Botão NA'], description: 'Contacto normalmente aberto 13/14.', build: () => [spec('13', 'NA entrada', 'NO', { contact: 'NO', row: 'c', group: 'Contactos' }), spec('14', 'NA saída', 'NO', { contact: 'NO', row: 'c', group: 'Contactos' })] },
  { id: 'pb-nc', name: 'Botão NF', category: ['Comando', 'Botão NF'], description: 'Contacto normalmente fechado 21/22.', build: () => [spec('21', 'NF entrada', 'NC', { contact: 'NC', row: 'c', group: 'Contactos' }), spec('22', 'NF saída', 'NC', { contact: 'NC', row: 'c', group: 'Contactos' })] },
  { id: 'pb-no-nc', name: 'Botão NA + NF', category: ['Comando', 'Botão NA + NF'], description: 'Um contacto NA (13/14) e um NF (21/22).', build: () => [spec('13', 'NA entrada', 'NO', { contact: 'NO', row: 'a', group: 'NA' }), spec('14', 'NA saída', 'NO', { contact: 'NO', row: 'a', group: 'NA' }), spec('21', 'NF entrada', 'NC', { contact: 'NC', row: 'b', group: 'NF' }), spec('22', 'NF saída', 'NC', { contact: 'NC', row: 'b', group: 'NF' })] },
  { id: 'selector', name: 'Seletor / chave', category: ['Comando', 'Seletor'], description: 'Comum e 2 ou 3 posições.', params: [{ key: 'pos', label: 'Posições', type: 'select', default: '2', options: [['2', '2 posições'], ['3', '3 posições']] }], build: (p) => [spec('COM', 'Comum', 'COM', { contact: 'COM', row: 'c', group: 'Seletor' }), spec('P1', 'Posição 1', 'NO', { contact: 'NO', row: 'c', group: 'Seletor' }), ...(String(p.pos) === '3' ? [spec('P0', 'Posição 0', 'NO', { contact: 'NO', row: 'c', group: 'Seletor' })] : []), spec('P2', 'Posição 2', 'NO', { contact: 'NO', row: 'c', group: 'Seletor' })] },
  { id: 'pilot-lamp', name: 'Sinalizador (X1 · X2)', category: ['Comando', 'Sinalização'], description: 'Lâmpada ou buzzer com dois terminais.', build: () => [spec('X1', 'Terminal 1', 'X1', { direction: 'in', row: 'c' }), spec('X2', 'Terminal 2', 'X2', { direction: 'out', row: 'c' })] },
  /* --- Relés / contactores --- */
  { id: 'relay', name: 'Relé', category: ['Relés', 'Relé'], description: 'Bobina A1/A2 e grupos de contactos COM/NF/NA (11/12/14, 21/22/24…).', params: [num('groups', 'Grupos de contactos', 1, 1, 4), bool('coil', 'Bobina A1/A2', true)], build: relay },
  { id: 'relay-no', name: 'Relé só com NA', category: ['Relés', 'Relé NA'], description: 'Bobina e um contacto de trabalho.', build: () => [inn('A1', 'Bobina A1', 'A1', { group: 'Bobina' }), inn('A2', 'Bobina A2', 'A2', { group: 'Bobina' }), out('13', 'NA entrada', 'NO', { contact: 'NO', group: 'Contacto' }), out('14', 'NA saída', 'NO', { contact: 'NO', group: 'Contacto' })] },
  { id: 'contactor-power', name: 'Contactor de potência', category: ['Contactores', 'Potência'], description: 'Potência 1L1…6T3, bobina A1/A2 e contactos auxiliares NA/NF.', params: [bool('coil', 'Bobina A1/A2', true), num('no', 'Auxiliares NA', 1, 0, 4), num('nc', 'Auxiliares NF', 1, 0, 4)], build: contactor },
  { id: 'contactor-aux', name: 'Bloco de auxiliares', category: ['Contactores', 'Auxiliares'], description: 'Só contactos auxiliares NA/NF.', params: [num('no', 'Auxiliares NA', 2, 0, 4), num('nc', 'Auxiliares NF', 2, 0, 4)], build: (p) => contactor({ ...p, coil: false }).filter((t) => t.group === 'Auxiliares') },
  /* --- PLC --- */
  { id: 'plc-8-8', name: 'PLC 8 DI / 8 DO', category: ['PLC', 'Compacto'], description: 'Alimentação 24 V, 8 entradas e 8 saídas digitais.', build: () => plcSpecs({ di: 8, dq: 8, ai: 0, ao: 0 }) },
  { id: 'plc-16-16', name: 'PLC 16 DI / 16 DO', category: ['PLC', 'Compacto'], description: 'Alimentação 24 V, 16 entradas e 16 saídas digitais.', build: () => plcSpecs({ di: 16, dq: 16, ai: 0, ao: 0 }) },
  { id: 'plc-ai-ao', name: 'PLC com AI/AO', category: ['PLC', 'Compacto'], description: '8 DI, 8 DO, 4 entradas e 2 saídas analógicas.', build: () => plcSpecs({ di: 8, dq: 8, ai: 4, ao: 2 }) },
  { id: 'plc-custom', name: 'PLC personalizado', category: ['PLC', 'Personalizado'], description: 'Escolha a alimentação e o número de entradas e saídas (digitais e analógicas).', params: PLC_PARAMS, build: plcSpecs },
  /* --- Sensores --- */
  { id: 'sensor-3w', name: 'Sensor 3 fios', category: ['Sensores', 'Digital'], description: '+24 V, 0 V e saída (PNP/NPN, NA/NF).', params: [{ key: 'type', label: 'Tipo', type: 'select', default: 'PNP', options: [['PNP', 'PNP'], ['NPN', 'NPN']] }, { key: 'mode', label: 'Contacto', type: 'select', default: 'NO', options: [['NO', 'NA (NO)'], ['NC', 'NF (NC)']] }], build: (p) => [spec('+24V', 'Alimentação +24 V', '+24V', { direction: 'in', row: 'c', group: 'Alimentação' }), spec('0V', 'Alimentação 0 V', '0V', { direction: 'in', row: 'c', group: 'Alimentação' }), spec('OUT', `Saída ${p.type ?? 'PNP'} ${p.mode === 'NC' ? 'NF' : 'NA'}`, 'OUT', { direction: 'out', row: 'c', group: 'Saída', contact: p.mode === 'NC' ? 'NC' : 'NO', electricalClass: 'dc' })] },
  { id: 'sensor-4w', name: 'Sensor 4 fios', category: ['Sensores', 'Digital'], description: '+24 V, 0 V, saída NA e saída NF.', build: () => [spec('+24V', 'Alimentação +24 V', '+24V', { direction: 'in', row: 'c' }), spec('0V', 'Alimentação 0 V', '0V', { direction: 'in', row: 'c' }), spec('OUT', 'Saída NA', 'OUT', { direction: 'out', row: 'c', contact: 'NO', electricalClass: 'dc' }), spec('OUT2', 'Saída NF', 'OUT2', { direction: 'out', row: 'c', contact: 'NC', electricalClass: 'dc' })] },
  { id: 'sensor-analog', name: 'Sensor analógico', category: ['Sensores', 'Analógico'], description: '+24 V, 0 V e sinal analógico.', build: () => [spec('+24V', 'Alimentação +24 V', '+24V', { direction: 'in', row: 'c' }), spec('0V', 'Alimentação 0 V', '0V', { direction: 'in', row: 'c' }), spec('SIG', 'Sinal analógico', 'SIGNAL', { direction: 'out', row: 'c' })] },
  /* --- Motores / variadores --- */
  { id: 'motor-3ph', name: 'Motor trifásico', category: ['Motores', 'Trifásico'], description: 'U, V, W e terra.', build: () => [inn('U', 'U', 'U', { group: 'Potência' }), inn('V', 'V', 'V', { group: 'Potência' }), inn('W', 'W', 'W', { group: 'Potência' }), inn('PE', 'Terra', 'PE', { group: 'Terra' })] },
  { id: 'motor-6', name: 'Motor com 6 terminais', category: ['Motores', 'Trifásico'], description: 'U1 V1 W1 / U2 V2 W2 (ligação estrela ou triângulo) e terra.', build: () => [inn('U1', 'U1', 'U1'), inn('V1', 'V1', 'V1'), inn('W1', 'W1', 'W1'), inn('W2', 'W2', 'W2', { row: 'in2' }), inn('U2', 'U2', 'U2', { row: 'in2' }), inn('V2', 'V2', 'V2', { row: 'in2' }), inn('PE', 'Terra', 'PE', { row: 'in2' })] },
  { id: 'motor-1ph', name: 'Motor monofásico', category: ['Motores', 'Monofásico'], description: 'L, N e terra.', build: () => powerSupply({}, false) },
  { id: 'vfd', name: 'Variador de frequência', category: ['Variadores', 'Variador'], description: 'Rede L1/L2/L3/PE, motor U/V/W, entradas/saídas digitais e analógicas.', params: [num('di', 'Entradas digitais', 3, 0, 8), num('do', 'Saídas digitais', 1, 0, 4), num('ai', 'Entradas analógicas', 1, 0, 4), num('ao', 'Saídas analógicas', 1, 0, 4), bool('bus', 'RS485 (A/B)', false)], build: (p) => [
    inn('L1', 'Rede L1', 'L1', { row: 'rede', group: 'Rede' }), inn('L2', 'Rede L2', 'L2', { row: 'rede', group: 'Rede' }), inn('L3', 'Rede L3', 'L3', { row: 'rede', group: 'Rede' }), inn('PE', 'Terra', 'PE', { row: 'rede', group: 'Rede' }),
    out('U', 'Motor U', 'U', { row: 'motor', group: 'Motor' }), out('V', 'Motor V', 'V', { row: 'motor', group: 'Motor' }), out('W', 'Motor W', 'W', { row: 'motor', group: 'Motor' }),
    ...seq(count(p.di, 3, 0, 8)).map((i) => spec(`DI${i + 1}`, `Entrada digital ${i + 1}`, `DI${i + 1}`, { face: 'front', row: 'di', direction: 'in', group: 'Controlo' })),
    ...seq(count(p.do, 1, 0, 4)).map((i) => spec(`DO${i + 1}`, `Saída digital ${i + 1}`, `DO${i + 1}`, { face: 'front', row: 'do', direction: 'out', group: 'Controlo' })),
    ...seq(count(p.ai, 1, 0, 4)).map((i) => spec(`AI${i + 1}`, `Entrada analógica ${i + 1}`, `AI${i + 1}`, { face: 'front', row: 'ai', direction: 'in', group: 'Controlo' })),
    ...seq(count(p.ao, 1, 0, 4)).map((i) => spec(`AO${i + 1}`, `Saída analógica ${i + 1}`, `AO${i + 1}`, { face: 'front', row: 'ao', direction: 'out', group: 'Controlo' })),
    ...(p.bus === true ? [spec('A', 'RS485 A', 'A', { face: 'front', row: 'bus', group: 'Comunicação' }), spec('B', 'RS485 B', 'B', { face: 'front', row: 'bus', group: 'Comunicação' })] : []),
  ] },
  /* --- Comunicação / terra / borneiras --- */
  { id: 'rs485', name: 'RS485 (A · B · GND)', category: ['Comunicação', 'RS485'], description: 'Barramento diferencial A/B com massa.', build: () => [spec('A', 'RS485 A', 'A', { row: 'c' }), spec('B', 'RS485 B', 'B', { row: 'c' }), spec('GND', 'Massa', 'GND', { row: 'c' })] },
  { id: 'can', name: 'CAN (H · L · GND)', category: ['Comunicação', 'CAN'], description: 'Barramento CAN com massa.', build: () => [spec('CANH', 'CAN-H', 'CAN-H', { row: 'c' }), spec('CANL', 'CAN-L', 'CAN-L', { row: 'c' }), spec('GND', 'Massa', 'GND', { row: 'c' })] },
  { id: 'earth-pe', name: 'Terra de proteção (PE)', category: ['Terra', 'PE'], description: 'Um borne de proteção.', build: () => [spec('PE', 'Terra de proteção', 'PE')] },
  { id: 'earth-fe', name: 'Terra funcional (FE)', category: ['Terra', 'FE'], description: 'Um borne de terra funcional.', build: () => [spec('FE', 'Terra funcional', 'FE')] },
  { id: 'terminal-block', name: 'Borneira (entrada/saída)', category: ['Terminais', 'Borneira'], description: 'Pares de bornes em linha, entrada em cima e saída em baixo.', params: [num('n', 'Número de pares', 2, 1, 24)], build: (p) => seq(count(p.n, 2, 1, 24)).flatMap((i) => [inn(`${i + 1}`, `Entrada ${i + 1}`, 'IN'), out(`${i + 1}'`, `Saída ${i + 1}`, 'OUT')]) },
  /* --- Instrumentos de medida --- */
  { id: 'multimeter-basic', name: 'Multímetro (COM · VΩ · mA · 10A)', category: ['Instrumentos', 'Multímetro'], description: 'Tomadas banana de 4 mm: comum, tensão/resistência, mA/µA e 10 A. Termopar K e rótulo Hz opcionais.', params: [bool('ma', 'Entrada mA/µA', true), bool('amp', 'Entrada 10 A', true), bool('temp', 'Termopar K (T+ / T−)', false), bool('hz', 'Rótulo V·Ω·Hz', false)], build: multimeter },
  { id: 'multimeter-3', name: 'Multímetro de 3 entradas', category: ['Instrumentos', 'Multímetro'], description: 'COM, VΩmA e 10 A (modelos simples).', build: () => [jack('COM', 'COM (comum, preto)', 'COM', METER.com), jack('VΩmA', 'V · Ω · mA', 'V', METER.volt), jack('10A', 'A (até 10 A)', 'A', METER.amp)] },
  { id: 'multimeter-clamp', name: 'Alicate amperimétrico', category: ['Instrumentos', 'Multímetro'], description: 'Tomadas COM e VΩ; a corrente mede-se pelo alicate (borne «Alicate» colocado sobre o condutor).', params: [bool('jaw', 'Borne do alicate (corrente)', true)], build: (p) => [jack('COM', 'COM (comum, preto)', 'COM', METER.com), jack('VΩ', 'V · Ω · Hz', 'V', METER.volt), ...(p.jaw !== false ? [jack('CLAMP', 'Alicate (corrente)', 'A', METER.amp, { terminalType: 'bar', face: 'top', row: 'jaw' })] : [])] },
  { id: 'multimeter-bench', name: 'Multímetro de bancada (4 fios)', category: ['Instrumentos', 'Multímetro'], description: 'HI/LO de entrada, SENSE HI/LO para 4 fios e entrada de corrente.', params: [bool('four', 'Medição a 4 fios (SENSE)', true), bool('amp', 'Entrada de corrente (3 A)', true)], build: (p) => [jack('HI', 'Entrada HI', 'V', METER.volt, { row: 'in' }), jack('LO', 'Entrada LO', 'COM', METER.com, { row: 'in' }), ...(p.four !== false ? [jack('SHI', 'Sense HI', 'V', METER.volt, { row: 'sense' }), jack('SLO', 'Sense LO', 'COM', METER.com, { row: 'sense' })] : []), ...(p.amp !== false ? [jack('3A', 'Corrente (3 A)', 'A', METER.amp, { row: 'amp' })] : [])] },
  { id: 'test-probes', name: 'Ponteiras de teste (vermelha · preta)', category: ['Instrumentos', 'Ponteiras'], description: 'Duas ponteiras de medição: positiva (vermelha) e comum (preta), em tomada banana.', build: () => [jack('+', 'Ponteira vermelha', 'V', METER.volt, { terminalType: 'pin', row: 'p' }), jack('−', 'Ponteira preta (COM)', 'COM', METER.com, { terminalType: 'pin', row: 'p' })] },
  { id: 'oscilloscope', name: 'Osciloscópio', category: ['Instrumentos', 'Osciloscópio'], description: 'Canais BNC, massa e disparo externo opcional.', params: [num('channels', 'Canais', 2, 1, 4), bool('ext', 'Disparo externo (EXT)', false)], build: oscilloscope },
]

/** Perfis sugeridos por categoria do componente (24.20). */
export const SUGGESTED_PROFILES: Record<ComponentCategory, string[]> = {
  protection: ['breaker-1p', 'breaker-2p', 'breaker-3p', 'breaker-3p-n', 'breaker-4p'],
  command: ['pb-no', 'pb-nc', 'pb-no-nc', 'selector'],
  contactor: ['contactor-power', 'contactor-aux'],
  relay: ['relay', 'relay-no'],
  signaling: ['pilot-lamp'],
  sensor: ['sensor-3w', 'sensor-4w', 'sensor-analog'],
  measurement: ['multimeter-basic', 'multimeter-3', 'multimeter-clamp', 'multimeter-bench', 'test-probes', 'oscilloscope'],
  motor: ['motor-3ph', 'motor-6', 'motor-1ph'],
  drive: ['vfd'],
  controller: ['plc-8-8', 'plc-16-16', 'plc-ai-ao', 'plc-custom'],
  terminal: ['terminal-block', 'earth-pe'],
  power: ['power-1ph', 'power-3ph', 'power-3ph-n', 'power-dc'],
}

export const CUSTOM_CATEGORY = 'Personalizados'

export function profileFromStored(stored: StoredProfile): TerminalProfile {
  return { id: stored.id, name: stored.name, category: [CUSTOM_CATEGORY, ...(stored.category && stored.category !== CUSTOM_CATEGORY ? [stored.category] : [])], description: stored.description, build: () => stored.specs.map((item) => ({ ...item })), custom: true }
}

export function defaultParams(profile: TerminalProfile): ProfileParams {
  return Object.fromEntries((profile.params ?? []).map((param) => [param.key, param.default]))
}

export function profileCategories(profiles: TerminalProfile[]): Array<{ name: string; children: string[] }> {
  const map = new Map<string, Set<string>>()
  for (const profile of profiles) {
    const [top, sub] = profile.category
    if (!map.has(top)) map.set(top, new Set())
    if (sub) map.get(top)!.add(sub)
  }
  return [...map.entries()].map(([name, children]) => ({ name, children: [...children] }))
}

/** Extrai especificações de um componente (para "Guardar como perfil"). */
export function specsFromTerminals(terminals: Array<{ label: string; name: string; fn?: string; kind: TerminalKind; polarity: TerminalPolarity; electricalClass: TerminalElectricalClass; direction: TerminalDirection; terminalType: TerminalType; color: string; contact?: 'NO' | 'NC' | 'COM'; group?: string; normal: [number, number, number] }>): TerminalSpec[] {
  const faceOf = (normal: [number, number, number]): Face => {
    const abs = normal.map(Math.abs)
    const axis = abs.indexOf(Math.max(...abs))
    return (axis === 0 ? (normal[0] >= 0 ? 'right' : 'left') : axis === 1 ? (normal[1] >= 0 ? 'top' : 'bottom') : normal[2] >= 0 ? 'front' : 'back')
  }
  return terminals.map((t) => ({ label: t.label, name: t.name, fn: t.fn ?? t.label, kind: t.kind, polarity: t.polarity, electricalClass: t.electricalClass, direction: t.direction, terminalType: t.terminalType, color: t.color, contact: t.contact, group: t.group, face: faceOf(t.normal) }))
}
