/**
 * Endereços bit no formato Siemens (byte.bit): I0.0, I0.1, …, I1.0, Q0.0, M0.0…
 * Os ficheiros e versões antigas usavam números a partir de 1 (I1, I2, I9…);
 * essas formas continuam legíveis como alias — I3 = I0.2, I9 = I1.0.
 * Palavras MWn/MBn/MDn e contadores/temporizadores Cn/Tn não são afetados.
 */

const DOTTED_RE = /^([IQM])(\d{1,4})\.([0-7])$/i
const LEGACY_RE = /^([IQM])(\d{1,4})$/i

/** Normaliza para a forma canónica «P<byte>.<bit>» (P ∈ I/Q/M) ou undefined se inválido. */
export function normalizeBitAddress(raw: string): string | undefined {
  const text = raw.trim().replace(/^%/, '')
  const dotted = text.match(DOTTED_RE)
  if (dotted) return `${dotted[1].toUpperCase()}${Number(dotted[2])}.${Number(dotted[3])}`
  const legacy = text.match(LEGACY_RE)
  if (!legacy) return undefined
  const n = Number(legacy[2])
  if (n < 1) return undefined
  return `${legacy[1].toUpperCase()}${Math.floor((n - 1) / 8)}.${(n - 1) % 8}`
}

/** Lista canónica dos primeiros `count` bits de uma área: I0.0…, Q0.0…, M0.0… */
export function bitAddresses(prefix: 'I' | 'Q' | 'M', count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => `${prefix}${Math.floor(i / 8)}.${i % 8}`)
}

/** Ordem numérica de um bit (byte·8 + bit) para ordenação; sem forma bit → NaN útil para fallback. */
export function bitAddressOrder(address: string): number {
  const m = address.match(/^[IQM](\d+)\.(\d)$/i)
  return m ? Number(m[1]) * 8 + Number(m[2]) : Number(address.slice(1))
}

/** Migração de gravações antigas: NB devolve a forma canónica se for um bit I/Q/M, senão devolve o texto original. */
export const migrateBitAddress = (raw: string): string => normalizeBitAddress(raw) ?? raw
