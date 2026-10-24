import { COMPARE_OPERAND_RE } from './compare'
import { normalizeBitAddress } from './addresses'

/**
 * Validação e conversão dos valores editados «in-place» (clique no texto de um
 * elemento da network). As regras espelham as da modal de propriedades.
 */

// Bits Siemens: I0.0, Q0.1, M0.2 (byte.bit); as formas antigas I1/Q2/M3 continuam válidas como alias.
const BIT = '[IQM]\\d{1,4}(?:\\.[0-7])?'
export const ADDRESS_RE = new RegExp(`^(?:${BIT}|T\\d{1,3}|C\\d{1,3}|[A-Z_][A-Z0-9_]*\\.[A-Z_][A-Z0-9_]*)$`, 'i')
export const OPERAND_RE = new RegExp(`^(?:TRUE|FALSE|-?\\d+(?:\\.\\d+)?|MW\\d{1,4}|${BIT}|T\\d{1,3}|C\\d{1,3}|[A-Z_][A-Z0-9_]*\\.[A-Z_][A-Z0-9_]*)$`, 'i')
/** Destino numérico de um bloco matemático: palavra de memória ou variável de DB. */
export const MATH_TARGET_RE = /^(?:MW\d{1,4}|[A-Z_][A-Z0-9_]*\.[A-Z_][A-Z0-9_]*)$/i
export const MOVE_TARGET_RE = new RegExp(`^(?:MW\\d{1,4}|[QM]\\d{1,4}(?:\\.[0-7])?|[A-Z_][A-Z0-9_]*\\.[A-Z_][A-Z0-9_]*)$`, 'i')

/** «%I0.1», « q1 » → «I0.1», «Q1». */
export const normalizeOperand = (text: string) => text.trim().replace(/^%/, '').toUpperCase()

export type InlineResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseAddress(text: string, kind: 'address' | 'compare' | 'operand' | 'moveTarget' | 'mathTarget' = 'address'): InlineResult<string> {
  const value = normalizeOperand(text)
  const re = kind === 'compare' ? COMPARE_OPERAND_RE : kind === 'operand' ? OPERAND_RE : kind === 'moveTarget' ? MOVE_TARGET_RE : kind === 'mathTarget' ? MATH_TARGET_RE : ADDRESS_RE
  if (re.test(value)) return { ok: true, value: normalizeBitAddress(value) ?? value }
  const error = kind === 'compare' ? 'Use MW0, C1, T1, DB1.Variavel ou um número.'
    : kind === 'operand' ? 'Use um endereço, DB.variável, TRUE/FALSE ou um número.'
    : kind === 'moveTarget' ? 'O destino deve ser Q, M, MWn ou DB.variável.'
    : kind === 'mathTarget' ? 'O destino deve ser MWn ou DB.variável numérica.'
    : 'Use um endereço como I0.0, Q0.1, M0.2, T1, C1 ou DB1.Variavel.'
  return { ok: false, error }
}

/** «T#3S», «3s», «1.5 s», «500ms», «500» (ms) → milissegundos. */
export function parsePresetMs(text: string): InlineResult<number> {
  const m = text.trim().replace(/^T#/i, '').replace(/\s+/g, '').match(/^(\d+(?:[.,]\d+)?)(ms|s|m|min)?$/i)
  if (!m) return { ok: false, error: 'Use um tempo como T#3S, 3s, 500ms ou 1500.' }
  const n = Number(m[1].replace(',', '.'))
  const unit = (m[2] ?? 'ms').toLowerCase()
  const ms = Math.round(unit === 'ms' ? n : unit === 's' ? n * 1000 : n * 60000)
  return Number.isFinite(ms) && ms >= 0 && ms <= 86_400_000 ? { ok: true, value: ms } : { ok: false, error: 'Tempo fora do intervalo (0 a 24 h).' }
}

export function formatPresetMs(ms: number) {
  if (ms >= 1000 && ms % 1000 === 0) return `T#${ms / 1000}S`
  if (ms >= 1000) return `T#${(ms / 1000).toFixed(1)}S`
  return `T#${Math.round(ms)}MS`
}

export function parseCounterPreset(text: string): InlineResult<number> {
  const t = text.trim()
  if (!/^\d{1,5}$/.test(t)) return { ok: false, error: 'Use um número inteiro entre 0 e 99999.' }
  return { ok: true, value: Number(t) }
}
