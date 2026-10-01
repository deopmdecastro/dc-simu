import type { TerminalDef } from '../../catalog/types'
import type { WireColor, WireEndType, WireFlexibility, WireKind } from '../../types'

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
export const WIRE_KIND_LABEL: Record<WireKind, string> = { power: 'Força', control: 'Comando', signal: 'Sinal', neutral: 'Neutro', earth: 'Terra (PE)', bus: 'Barramento' }
/** Cor normalizada pela função (IEC 60204-1) — igual à do simulador. */
export const WIRE_KIND_COLOR: Record<WireKind, WireColor> = { power: 'black', control: 'red', signal: 'orange', neutral: 'lightblue', earth: 'green-yellow', bus: 'violet' }
export const WIRE_GAUGES = ['0.5mm²', '0.75mm²', '1mm²', '1.5mm²', '2.5mm²', '4mm²', '6mm²', '10mm²', '16mm²']

export const WIRE_END_LABEL: Record<WireEndType, string> = { none: 'Nu', ferrule: 'Ponteira', ferruleDouble: 'Ponteira dupla', ring: 'Olhal', fork: 'Forquilha', pin: 'Pino', faston: 'Faston', tinned: 'Estanhado' }
export const FLAT_LUGS: WireEndType[] = ['ring', 'fork', 'faston']
const ROUND_ENDS: WireEndType[] = ['ferrule', 'ferruleDouble', 'pin']

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
export interface WireDefaults { autoColor: boolean; color: WireColor; gauge: string; flexibility: WireFlexibility; endType: WireEndType }
export const DEFAULT_WIRE_DEFAULTS: WireDefaults = { autoColor: true, color: 'red', gauge: '1.5mm²', flexibility: 'flexible', endType: 'ferrule' }

/** Função sugerida a partir dos dois bornes (mesma heurística do simulador). */
export function inferWireKind(a?: TerminalDef, b?: TerminalDef): WireKind {
  const kinds = [a, b].filter((item): item is TerminalDef => !!item)
  const has = (test: (t: TerminalDef) => boolean) => kinds.some(test)
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

/** Diâmetro exterior (mm) a partir da secção do condutor — igual ao Painel 3D. */
export function cableOuterDiameterMm(gauge: string): number {
  const area = Number.parseFloat(gauge.replace(',', '.'))
  if (!Number.isFinite(area) || area <= 0) return 2.8
  const conductor = Math.sqrt((4 * area) / Math.PI)
  const insulation = area <= 1.5 ? 0.7 : area <= 4 ? 0.85 : 1.05
  return Math.max(2.2, conductor + insulation * 2)
}
export const wireRadiusMm = (gauge: string) => cableOuterDiameterMm(gauge) / 2

/** Comprimento físico de cada terminação (mm), da ponta ao início do cabo isolado. */
export function wireEndLengthMm(type: WireEndType): number {
  switch (type) {
    case 'ferrule': return 14
    case 'ferruleDouble': return 16
    case 'pin': return 15
    case 'ring': case 'fork': case 'faston': return 20
    case 'tinned': return 8
    default: return 7
  }
}
export const isFlatLug = (type: WireEndType) => FLAT_LUGS.includes(type)
export const isRoundEnd = (type: WireEndType) => ROUND_ENDS.includes(type)
