import type { ReactNode } from 'react'

export interface ConditionSegment {
  text: string
  overline: boolean
}

/** Divide uma expressão de condição em segmentos com ou sem sobrelinha (NOT).
 *  Suporta negação padrão FluidSIM: /VAR, _VAR, !VAR */
export function splitConditionSegments(cond: string): ConditionSegment[] {
  if (!cond) return []
  const tokens = cond.split(/(\s+|[*+&|()])/g)
  const parts: ConditionSegment[] = []

  for (const t of tokens) {
    if (!t) continue
    if ((t.startsWith('/') || t.startsWith('_') || t.startsWith('!')) && t.length > 1) {
      parts.push({ text: t.slice(1), overline: true })
    } else {
      parts.push({ text: t, overline: false })
    }
  }

  return parts
}

/** Renderiza a condição com suporte visual a sobrelinhas (overline) como no FluidSIM. */
export function renderConditionTspans(condition: string): ReactNode {
  const segments = splitConditionSegments(condition)
  if (!segments.length) return condition

  return segments.map((seg, idx) => (
    <tspan
      key={idx}
      style={seg.overline ? { textDecoration: 'overline', fontWeight: 'bold' } : undefined}
    >
      {seg.text}
    </tspan>
  ))
}

/** Formata milissegundos para formato legível (ex: 1.5 s, 500 ms). */
export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  return s % 1 === 0 ? `${s} s` : `${s.toFixed(1)} s`
}
