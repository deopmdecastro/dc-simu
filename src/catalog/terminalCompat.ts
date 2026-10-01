import type { TerminalElectricalClass, TerminalKind } from '../types'
import type { TerminalDirection, TerminalPolarity } from './types'
import { MEASURE_GROUP } from './terminalProfiles'

/** Regras de compatibilidade entre bornes — conservadoras, configuráveis e extensíveis. */
export interface CompatTerminal {
  fn?: string
  label?: string
  kind: TerminalKind
  polarity: TerminalPolarity
  electricalClass: TerminalElectricalClass
  direction: TerminalDirection
  contact?: 'NO' | 'NC' | 'COM'
  /** Grupo funcional: «Medição» marca portas de instrumentos (multímetro…). */
  group?: string
}
export type CompatLevel = 'ok' | 'warn' | 'error'
export interface CompatRule { id: string; level: Exclude<CompatLevel, 'ok'>; message: string; test: (a: CompatTerminal, b: CompatTerminal) => boolean }
export interface CompatResult { level: CompatLevel; messages: string[] }

const isEarth = (t: CompatTerminal) => t.kind === 'earth' || t.polarity === 'earth'
const isCoil = (t: CompatTerminal) => t.kind === 'coil-plus' || t.kind === 'coil-minus'
const isPhase = (t: CompatTerminal) => t.polarity === 'ac' && /^L[123]?$|^[1-5]L[123]$|^[2-6]T[123]$/i.test(t.fn ?? '')
const phaseOf = (t: CompatTerminal) => (/[123]/.exec(t.fn ?? '')?.[0] ?? '')
const bothPolarity = (a: CompatTerminal, b: CompatTerminal, x: TerminalPolarity, y: TerminalPolarity) => (a.polarity === x && b.polarity === y) || (a.polarity === y && b.polarity === x)

/** Portas de medição: um multímetro/osciloscópio pode ser ligado a qualquer borne (mede, não conduz). */
const isMeasure = (t: CompatTerminal) => t.group === MEASURE_GROUP

export const COMPAT_RULES: CompatRule[] = [
  { id: 'earth', level: 'error', message: 'Terra (PE/FE/GND) só deve ligar a outra terra.', test: (a, b) => isEarth(a) !== isEarth(b) },
  { id: 'class', level: 'error', message: 'Não misture circuitos CA e CC.', test: (a, b) => (a.electricalClass === 'ac' && b.electricalClass === 'dc') || (a.electricalClass === 'dc' && b.electricalClass === 'ac') },
  { id: 'network', level: 'error', message: 'Bornes de comunicação só ligam a comunicação.', test: (a, b) => (a.kind === 'bus') !== (b.kind === 'bus') },
  { id: 'short-dc', level: 'error', message: 'Positivo ligado a negativo: curto-circuito.', test: (a, b) => bothPolarity(a, b, 'positive', 'negative') },
  { id: 'phase-neutral', level: 'warn', message: 'Fase ligada a neutro sem carga no meio.', test: (a, b) => bothPolarity(a, b, 'ac', 'neutral') },
  { id: 'phases', level: 'warn', message: 'Fases diferentes ligadas entre si (L1/L2/L3).', test: (a, b) => isPhase(a) && isPhase(b) && phaseOf(a) !== '' && phaseOf(b) !== '' && phaseOf(a) !== phaseOf(b) },
  { id: 'in-in', level: 'warn', message: 'Duas entradas ligadas entre si.', test: (a, b) => a.direction === 'in' && b.direction === 'in' && !isEarth(a) && !isCoil(a) && !isCoil(b) },
  { id: 'out-out', level: 'warn', message: 'Duas saídas ligadas entre si.', test: (a, b) => a.direction === 'out' && b.direction === 'out' && !isEarth(a) && !isCoil(a) && !isCoil(b) },
  { id: 'coil', level: 'warn', message: 'A bobina (A1/A2) liga normalmente a comando ou alimentação.', test: (a, b) => (a.kind === 'coil-plus' || a.kind === 'coil-minus') && (b.kind === 'coil-plus' || b.kind === 'coil-minus') && a.kind === b.kind },
]

export function checkConnection(a: CompatTerminal, b: CompatTerminal, rules: CompatRule[] = COMPAT_RULES): CompatResult {
  // instrumentos de medida: ligam a qualquer borne sem regras de polaridade; dois instrumentos entre si é que não faz sentido
  if (isMeasure(a) && isMeasure(b)) return { level: 'warn', messages: ['Duas portas de medição ligadas entre si.'] }
  if (isMeasure(a) || isMeasure(b)) return { level: 'ok', messages: [] }
  const hits = rules.filter((rule) => rule.test(a, b))
  const level: CompatLevel = hits.some((rule) => rule.level === 'error') ? 'error' : hits.length ? 'warn' : 'ok'
  return { level, messages: hits.map((rule) => rule.message) }
}

export const COMPAT_LABEL: Record<CompatLevel, string> = { ok: 'Compatível', warn: 'Atenção', error: 'Ligações incompatíveis' }
