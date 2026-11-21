import type { TerminalDef } from '../../catalog/types'
import type { ConduitMedium, WireColor, WireEndType, WireFlexibility, WireKind, WireRoute } from '../../types'
import { parseTubularDiameterMm } from '../../three/hydraulicsModel'

/**
 * Aparência dos cabos de teste — as mesmas opções do simulador (cor, secção, função,
 * condutor e terminações das pontas), com valores sugeridos pela função dos bornes.
 */
export const WIRE_COLOR_HEX: Record<WireColor, string> = {
  red: '#ef4444', blue: '#3b82f6', 'green-yellow': '#84cc16', black: '#1f2937',
  orange: '#f59e0b', grey: '#94a3b8', brown: '#92400e', white: '#f1f5f9',
  pink: '#ec4899', violet: '#8b5cf6', green: '#22c55e', yellow: '#eab308', lightblue: '#67e8f9',
}
export const WIRE_COLOR_LABEL: Record<WireColor, string> = {
  red: 'Vermelho', blue: 'Azul', 'green-yellow': 'Verde-amarelo (PE)', black: 'Preto', orange: 'Laranja', grey: 'Cinzento', brown: 'Castanho',
  white: 'Branco', pink: 'Rosa', violet: 'Violeta', green: 'Verde', yellow: 'Amarelo', lightblue: 'Azul-claro',
}
export const WIRE_KIND_LABEL: Record<WireKind, string> = {
  power: 'Força', control: 'Comando', signal: 'Sinal', neutral: 'Neutro', earth: 'Terra (PE)', bus: 'Barramento',
  hydraulic: 'Tubo hidráulico', pneumatic: 'Tubo pneumático',
}
/** Cor normalizada pela função (IEC 60204-1) + fluidos (hidráulica/pneumática). */
export const WIRE_KIND_COLOR: Record<WireKind, WireColor> = {
  power: 'black', control: 'red', signal: 'orange', neutral: 'lightblue', earth: 'green-yellow', bus: 'violet',
  hydraulic: 'grey', pneumatic: 'lightblue',
}
export const WIRE_GAUGES = ['0.5mm²', '0.75mm²', '1mm²', '1.5mm²', '2.5mm²', '4mm²', '6mm²', '10mm²', '16mm²']

export const WIRE_END_LABEL: Record<WireEndType, string> = {
  none: 'Nu', ferrule: 'Ponteira', ferruleDouble: 'Ponteira dupla', heatShrink: 'Termoretrátil',
  ring: 'Olhal', fork: 'Forquilha', pin: 'Pino', faston: 'Faston', tinned: 'Estanhado',
  banana: 'Ficha banana 4 mm', probe: 'Ponteira de teste',
  hydraulicFitting: 'União hidráulica', pneumaticPushIn: 'Conector Push-In',
}
export const WIRE_ROUTE_LABEL: Record<WireRoute, string> = {
  orthogonal: 'Ortogonal',
  manhattan: 'Manhattan',
  arc: 'Curvo',
  direct: 'Direto',
}
export const WIRE_ROUTE_HINT: Record<WireRoute, string> = {
  orthogonal: 'Cantos a 90° com raio suave (padrão de quadro)',
  manhattan: 'Degraus ortogonais em três segmentos',
  arc: 'Curva contínua suave (spline flexível)',
  direct: 'Segmento direto pelo menor percurso',
}
/** Cores normalizadas das veias em cabos multicore (HD 308 S2 / IEC 60445). */
export const DEFAULT_CORE_COLORS_HEX = ['#92400e', '#3b82f6', '#84cc16', '#1f2937', '#94a3b8', '#f59e0b', '#8b5cf6', '#ef4444', '#22c55e', '#eab308', '#ec4899', '#f1f5f9']
export function defaultCoreColors(count: number): string[] {
  const n = Math.max(1, Math.min(24, Math.round(count)))
  if (n === 2) return ['#92400e', '#3b82f6'] // castanho, azul
  if (n === 3) return ['#92400e', '#3b82f6', '#84cc16'] // L, N, PE
  if (n === 4) return ['#92400e', '#1f2937', '#94a3b8', '#84cc16'] // L1, L2, L3, PE
  if (n === 5) return ['#92400e', '#1f2937', '#94a3b8', '#3b82f6', '#84cc16'] // L1, L2, L3, N, PE
  return Array.from({ length: n }, (_, i) => DEFAULT_CORE_COLORS_HEX[i % DEFAULT_CORE_COLORS_HEX.length])
}
/** Corrente admissível indicativa em quadro (A) — IEC 60204-1 Tab. 6, PVC 70 °C (método B1/B2). */
export function wireAmpacityIecA(gauge: string): number | null {
  const area = Number.parseFloat(gauge.replace(',', '.'))
  if (!Number.isFinite(area) || area <= 0) return null
  const table: Array<[number, number]> = [
    [0.5, 7.9], [0.75, 10], [1, 12.4], [1.5, 16], [2.5, 22], [4, 30], [6, 38], [10, 53], [16, 71], [25, 94], [35, 117],
  ]
  for (const [s, iz] of table) if (Math.abs(area - s) < 0.05) return iz
  return Math.round(12.2 * Math.pow(area, 0.62) * 10) / 10
}
/** Raio mínimo de curvatura recomendado em instalação fixa (mm) — EN 50565-1 / IEC 60204-1. */
export function wireMinBendRadiusMm(gauge: string, opts?: { conductorCount?: number; sheathed?: boolean; flexibility?: WireFlexibility }): number {
  const outer = cableOuterDiameterMm(gauge, opts)
  const multicoreOrRigid = (opts?.conductorCount ?? 1) > 1 || !!opts?.sheathed || opts?.flexibility === 'rigid'
  const factor = multicoreOrRigid ? 5 : 4
  return Math.round(outer * factor * 10) / 10
}
/** Fundo CSS do swatch de cor do cabo (inclui riscas diagonais normalizadas para PE). */
export function wireColorSwatchBg(color: WireColor): string {
  return color === 'green-yellow'
    ? 'repeating-linear-gradient(45deg, #22c55e 0 4px, #eab308 4px 8px)'
    : WIRE_COLOR_HEX[color]
}
export const FLAT_LUGS: WireEndType[] = ['ring', 'fork', 'faston']
const ROUND_ENDS: WireEndType[] = ['ferrule', 'ferruleDouble', 'heatShrink', 'pin', 'banana', 'probe']

export interface WireStyle {
  color: WireColor
  gauge: string
  kind: WireKind
  flexibility: WireFlexibility
  /** Terminação de cada ponta (A = origem, B = destino). */
  endA: WireEndType
  endB: WireEndType
}
/** Valores usados nos cabos novos (como a ferramenta Cabo do simulador). */
export interface WireDefaults { medium?: ConduitMedium; autoColor: boolean; color: WireColor; gauge: string; flexibility: WireFlexibility; endType: WireEndType; conductorCount?: number; sheathed?: boolean; sheathColor?: string; conductorColors?: string[]; route?: WireRoute; chainMode?: boolean; orthoSnap?: boolean }
export const DEFAULT_WIRE_DEFAULTS: WireDefaults = { medium: 'electrical', autoColor: true, color: 'red', gauge: '1.5mm²', flexibility: 'flexible', endType: 'ferrule', conductorCount: 1, sheathed: false }

/** Função sugerida a partir dos dois bornes (mesma heurística do simulador). */
export function inferWireKind(a?: TerminalDef, b?: TerminalDef): WireKind {
  const kinds = [a, b].filter((item): item is TerminalDef => !!item)
  const has = (test: (t: TerminalDef) => boolean) => kinds.some(test)
  if (has((t) => t.kind === 'hydraulic-in' || t.kind === 'hydraulic-out')) return 'hydraulic'
  if (has((t) => t.kind === 'pneumatic')) return 'pneumatic'
  let kind: WireKind = 'control'
  if (has((t) => t.kind === 'power-in' || t.kind === 'power-out')) kind = 'power'
  if (has((t) => t.kind === 'neutral')) kind = 'neutral'
  if (has((t) => t.kind === 'earth' || t.polarity === 'earth')) kind = 'earth'
  if (has((t) => t.kind === 'io' || t.kind === 'analog')) kind = 'signal'
  if (has((t) => t.kind === 'bus' || t.electricalClass === 'network')) kind = 'bus'
  return kind
}

export function styleFor(defaults: WireDefaults, a?: TerminalDef, b?: TerminalDef): WireStyle {
  const kind = inferWireKind(a, b)
  return {
    kind, color: defaults.autoColor ? WIRE_KIND_COLOR[kind] : defaults.color, gauge: defaults.gauge, flexibility: defaults.flexibility,
    endA: defaults.endType, endB: defaults.endType,
  }
}


/** Presets de tipo de cabo (fio simples vs cabo multicore isolado). Inspirados em cabos industriais comuns. */
export type CablePresetId =
  | 'single'
  | 'single-sheath'
  | '2c'
  | '3c'
  | '4c'
  | '5c'
  | '7c'
  | 'twisted-pair'
  | 'custom'

export interface CablePreset {
  id: CablePresetId
  label: string
  hint: string
  conductors: number
  sheathed: boolean
  sheathColor?: string
  gauge: string
  flexibility: WireFlexibility
}

export const CABLE_PRESETS: CablePreset[] = [
  { id: 'single', label: 'Fio simples', hint: '1 condutor · sem capa exterior', conductors: 1, sheathed: false, gauge: '1.5mm²', flexibility: 'flexible' },
  { id: 'single-sheath', label: 'Fio com capa', hint: '1× · capa PVC', conductors: 1, sheathed: true, sheathColor: '#1e293b', gauge: '1.5mm²', flexibility: 'flexible' },
  { id: '2c', label: 'Cabo 2×', hint: '2 condutores · isolado', conductors: 2, sheathed: true, sheathColor: '#0f172a', gauge: '1.5mm²', flexibility: 'flexible' },
  { id: '3c', label: 'Cabo 3×', hint: '3 condutores · isolado', conductors: 3, sheathed: true, sheathColor: '#0f172a', gauge: '1.5mm²', flexibility: 'flexible' },
  { id: '4c', label: 'Cabo 4×', hint: '4 condutores · isolado', conductors: 4, sheathed: true, sheathColor: '#0f172a', gauge: '2.5mm²', flexibility: 'flexible' },
  { id: '5c', label: 'Cabo 5×', hint: '5 condutores · isolado', conductors: 5, sheathed: true, sheathColor: '#0f172a', gauge: '1.5mm²', flexibility: 'flexible' },
  { id: '7c', label: 'Cabo 7×', hint: '7 condutores · isolado', conductors: 7, sheathed: true, sheathColor: '#0f172a', gauge: '1mm²', flexibility: 'flexible' },
  { id: 'twisted-pair', label: 'Par trançado', hint: '2 fios trançados · capa leve', conductors: 2, sheathed: true, sheathColor: '#64748b', gauge: '0.75mm²', flexibility: 'flexible' },
]

export function applyCablePreset(preset: CablePreset): Partial<import('../../types').WireDefaults> {
  return {
    conductorCount: preset.conductors,
    sheathed: preset.sheathed,
    sheathColor: preset.sheathed ? (preset.sheathColor ?? '#0f172a') : undefined,
    gauge: preset.gauge,
    flexibility: preset.flexibility,
  }
}

export function matchCablePreset(d: { conductorCount?: number; sheathed?: boolean; sheathColor?: string; gauge?: string }): CablePresetId {
  const n = d.conductorCount ?? 1
  const sheathed = !!d.sheathed
  for (const p of CABLE_PRESETS) {
    if (p.conductors === n && p.sheathed === sheathed) {
      if (!sheathed) return p.id
      if ((d.sheathColor ?? p.sheathColor) === p.sheathColor || !d.sheathColor) return p.id
    }
  }
  return 'custom'
}

/** Diâmetro exterior ligeiramente maior em multicore / com capa. */

export const CABLE_VISUAL_SCALE = 0.72
/** Diâmetro exterior (mm) a partir da secção do condutor ou da bitola tubular (Ø..mm). */
export function cableOuterDiameterMm(gauge: string, opts?: { conductorCount?: number; sheathed?: boolean }): number {
  const tubularMm = parseTubularDiameterMm(gauge)
  if (tubularMm !== null) return tubularMm
  const area = Number.parseFloat(gauge.replace(',', '.'))
  if (!Number.isFinite(area) || area <= 0) return 2.8
  const conductor = Math.sqrt((4 * area) / Math.PI)
  const insulation = area <= 1.5 ? 0.7 : area <= 4 ? 0.85 : 1.05
  const n = Math.max(1, opts?.conductorCount ?? 1)
  // multicore: empacotamento aproximado (fator √n com compressão)
  const pack = n <= 1 ? 1 : Math.sqrt(n) * 0.85
  const jacket = opts?.sheathed ? (n <= 1 ? 0.6 : 0.9) : 0
  return Math.max(1.6, (conductor * pack + insulation * 2 + jacket) * CABLE_VISUAL_SCALE)
}
export const wireRadiusMm = (gauge: string) => cableOuterDiameterMm(gauge) / 2

/** Comprimento físico de cada terminação (mm), da ponta ao início do cabo isolado. */
export function wireEndLengthMm(type: WireEndType): number {
  switch (type) {
    case 'ferrule': return 14
    case 'ferruleDouble': return 16
    case 'heatShrink': return 14
    case 'pin': return 15
    case 'ring': case 'fork': case 'faston': return 20
    case 'tinned': return 8
    case 'banana': return 24
    case 'probe': return 110
    case 'hydraulicFitting': return 24
    case 'pneumaticPushIn': return 18
    default: return 7
  }
}
export const isFlatLug = (type: WireEndType) => FLAT_LUGS.includes(type)
export const isRoundEnd = (type: WireEndType) => ROUND_ENDS.includes(type)
