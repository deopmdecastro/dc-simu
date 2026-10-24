// ============================================================================
// Comparadores do Ladder (estilo TIA Portal): ==, <>, >=, <=, >, <
// Operandos aceites: número (2, -3, 1.5), hexadecimal (16#FF / W#16#FF),
// palavra de memória MWn (INT; começa a 0), valor atual de contador Cn,
// tempo decorrido de temporizador Tn (ms) e variável de bloco de dados DBx.nome.
// ============================================================================

import type { LadderCompareOp, LadderCompareType, LadderContact } from '../types'
import type { DbTable } from './dataBlocks'
import type { CounterTable, TimerTable } from './ladderEngine'

export const COMPARE_OPERAND_RE = /^(?:[+-]?\d+(?:\.\d+)?|(?:W#)?16#[0-9A-F]+|MW\d{1,4}|[TC]\d{1,3}|[A-Z_][A-Z0-9_]*\.[A-Z_][A-Z0-9_]*)$/i

export const COMPARE_OPS: Array<{ op: LadderCompareOp; label: string; detail: string }> = [
  { op: '==', label: '==', detail: 'Igual' },
  { op: '<>', label: '<>', detail: 'Diferente' },
  { op: '>=', label: '>=', detail: 'Maior ou igual' },
  { op: '<=', label: '<=', detail: 'Menor ou igual' },
  { op: '>', label: '>', detail: 'Maior' },
  { op: '<', label: '<', detail: 'Menor' },
]

export const COMPARE_TYPES: LadderCompareType[] = ['Int', 'Word', 'Real']

export interface NumericContext {
  db: DbTable
  timers?: TimerTable
  counters?: CounterTable
}

/** Lê um operando numérico; devolve undefined se for inválido/desconhecido. */
export function readOperand(raw: string, ctx: NumericContext): number | undefined {
  const text = raw.trim().toUpperCase().replace(/^%/, '')
  if (!text) return undefined
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) return Number(text)
  const hex = text.match(/^(?:W#)?16#([0-9A-F]+)$/)
  if (hex) return parseInt(hex[1], 16)
  const entry = ctx.db[text]
  if (entry) return typeof entry.value === 'number' ? entry.value : entry.value ? 1 : 0
  if (/^MW\d+$/.test(text)) return 0
  if (/^C\d+$/.test(text)) return ctx.counters?.[text]?.count ?? 0
  if (/^T\d+$/.test(text)) return ctx.timers?.[text]?.elapsedMs ?? 0
  return undefined
}

/** Word é um inteiro de 16 bits sem sinal; Int é inteiro (truncado); Real mantém decimais. */
function coerce(value: number, type: LadderCompareType): number {
  if (type === 'Word') return Math.trunc(value) & 0xffff
  if (type === 'Int') return Math.trunc(value)
  return value
}

export function compareNumbers(op: LadderCompareOp, a: number, b: number): boolean {
  switch (op) {
    case '==': return a === b
    case '<>': return a !== b
    case '>=': return a >= b
    case '<=': return a <= b
    case '>': return a > b
    case '<': return a < b
  }
}

/** Resultado lógico (RLO) de um comparador. Operando desconhecido → falso. */
export function evalCompare(el: LadderContact, ctx: NumericContext): boolean {
  const type = el.compareType ?? 'Int'
  const a = readOperand(el.address, ctx)
  const b = readOperand(el.compareValue ?? '0', ctx)
  if (a === undefined || b === undefined) return false
  return compareNumbers(el.compareOp ?? '==', coerce(a, type), coerce(b, type))
}
