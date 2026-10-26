import type { LadderMathOp } from '../types'
import { readOperand, type NumericContext } from './compare'
import type { DbTable } from './dataBlocks'

/** Operações matemáticas do Ladder (estilo TIA Portal: ADD, SUB, MUL, DIV, MOD). */
export const MATH_OPS: Array<{ op: LadderMathOp; label: string; detail: string; symbol: string }> = [
  { op: 'ADD', label: 'ADD', detail: 'Somar (IN1 + IN2)', symbol: '+' },
  { op: 'SUB', label: 'SUB', detail: 'Subtrair (IN1 − IN2)', symbol: '−' },
  { op: 'MUL', label: 'MUL', detail: 'Multiplicar (IN1 × IN2)', symbol: '×' },
  { op: 'DIV', label: 'DIV', detail: 'Dividir (IN1 ÷ IN2)', symbol: '÷' },
  { op: 'MOD', label: 'MOD', detail: 'Resto da divisão', symbol: '%' },
]
export const MATH_OP_NAMES = MATH_OPS.map((m) => m.op)
export const isMathOp = (v: string): v is LadderMathOp => (MATH_OP_NAMES as string[]).includes(v)

const INT_MIN = -32768
const INT_MAX = 32767

export function computeMath(op: LadderMathOp, a: number, b: number, integer: boolean): number | undefined {
  switch (op) {
    case 'ADD': return a + b
    case 'SUB': return a - b
    case 'MUL': return a * b
    case 'DIV': return b === 0 ? undefined : integer ? Math.trunc(a / b) : a / b
    case 'MOD': return b === 0 ? undefined : a % b
  }
}

/**
 * Executa o bloco (só quando a network está ativa). Devolve false quando o ENO
 * seria 0: operando desconhecido, divisão por zero, destino inválido ou overflow Int.
 */
export function execMath(math: { op: LadderMathOp; in1: string; in2: string; out: string }, ctx: NumericContext & { db: DbTable }): boolean {
  const a = readOperand(math.in1, ctx)
  const b = readOperand(math.in2, ctx)
  if (a === undefined || b === undefined) return false
  const dst = math.out.trim().toUpperCase().replace(/^%/, '')
  if (/^MW\d+$/.test(dst) && !ctx.db[dst]) ctx.db[dst] = { type: 'INT', value: 0 }
  const entry = ctx.db[dst]
  if (!entry || entry.type === 'BOOL') return false
  const integer = entry.type === 'INT'
  const result = computeMath(math.op, integer ? Math.trunc(a) : a, integer ? Math.trunc(b) : b, integer)
  if (result === undefined || !Number.isFinite(result)) return false
  if (integer && (result < INT_MIN || result > INT_MAX)) return false
  entry.value = result
  return true
}

/** Escreve um valor numérico numa palavra/variável (cria MWn como INT). Devolve false (ENO = 0) se o destino não aceita números ou há overflow Int. */
export function writeNumeric(out: string, value: number, ctx: NumericContext & { db: DbTable }): boolean {
  const dst = out.trim().toUpperCase().replace(/^%/, '')
  if (/^MW\d+$/.test(dst) && !ctx.db[dst]) ctx.db[dst] = { type: 'INT', value: 0 }
  const entry = ctx.db[dst]
  if (!entry || entry.type === 'BOOL' || !Number.isFinite(value)) return false
  const v = entry.type === 'INT' ? Math.round(value) : value
  if (entry.type === 'INT' && (v < INT_MIN || v > INT_MAX)) return false
  entry.value = v
  return true
}

/** LIMIT (TIA Portal): OUT = MIN(MAX(IN, MN), MX). Com MN > MX o bloco não limita (OUT = IN) e ENO = 0. */
export function computeLimit(mn: number, value: number, mx: number): { value: number; ok: boolean } {
  if (mn > mx) return { value, ok: false }
  return { value: Math.min(Math.max(value, mn), mx), ok: true }
}

export function execLimit(limit: { mn: string; in: string; mx: string; out: string }, ctx: NumericContext & { db: DbTable }): boolean {
  const mn = readOperand(limit.mn, ctx)
  const value = readOperand(limit.in, ctx)
  const mx = readOperand(limit.mx, ctx)
  if (mn === undefined || value === undefined || mx === undefined) return false
  const r = computeLimit(mn, value, mx)
  return writeNumeric(limit.out, r.value, ctx) && r.ok
}

/**
 * SCALE (NORM_X + SCALE_X numa caixa): IN é limitado a [IN_MIN, IN_MAX] e convertido
 * linearmente para [OUT_MIN, OUT_MAX] (aceita gamas invertidas). IN_MIN = IN_MAX → ENO = 0.
 */
export function computeScale(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number | undefined {
  if (inMax === inMin) return undefined
  const lo = Math.min(inMin, inMax)
  const hi = Math.max(inMin, inMax)
  const x = Math.min(Math.max(value, lo), hi)
  return outMin + (x - inMin) * (outMax - outMin) / (inMax - inMin)
}

export function execScale(scale: { in: string; inMin: string; inMax: string; outMin: string; outMax: string; out: string }, ctx: NumericContext & { db: DbTable }): boolean {
  const vals = [scale.in, scale.inMin, scale.inMax, scale.outMin, scale.outMax].map((op) => readOperand(op, ctx))
  if (vals.some((v) => v === undefined)) return false
  const [value, inMin, inMax, outMin, outMax] = vals as number[]
  const result = computeScale(value, inMin, inMax, outMin, outMax)
  if (result === undefined) return false
  return writeNumeric(scale.out, result, ctx)
}
