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
