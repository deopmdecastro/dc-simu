import { transitionsOf, type GrafcetProgram, type GrafcetTransition } from './engine'

/** Endereços de entrada (I1…I32) referidos numa expressão: I1, !I2, ^I3, \I4, I1*I2… */
export function inputsInCondition(expression: string): string[] {
  const found = new Set<string>()
  const re = /(?<![A-Za-z0-9_%.])I(\d{1,2})(?![A-Za-z0-9_])/gi
  for (const match of expression.matchAll(re)) {
    const n = Number(match[1])
    if (n >= 1 && n <= 32) found.add(`I${n}`)
  }
  return [...found]
}

export interface DetectedTransition {
  id: string
  index: number
  /** nome guardado pelo utilizador (vazio se ainda não foi nomeada) */
  name: string
  /** nome sugerido: T1 · 0 → 1 */
  autoName: string
  /** nome a mostrar (guardado ou sugerido) */
  label: string
  from: string[]
  to: string[]
  condition: string
  inputs: string[]
}

export interface DetectedInput {
  address: string
  /** transições que dependem desta entrada */
  transitions: Array<{ id: string; label: string; index: number }>
}

export interface DetectionResult {
  transitions: DetectedTransition[]
  inputs: DetectedInput[]
  /** maior índice de entrada usado (para ajustar o nº de entradas virtuais) */
  maxInput: number
  /** nº de transições sem nome guardado */
  unnamed: number
}

const joinLabels = (ids: string[], stepLabel: (id: string) => string) => (ids.length ? ids.map(stepLabel).join('+') : '?')

export function autoTransitionName(transition: GrafcetTransition, index: number, stepLabel: (id: string) => string): string {
  return `T${index + 1} · ${joinLabels(transition.from, stepLabel)} → ${joinLabels(transition.to, stepLabel)}`
}

/** Analisa o programa GRAFCET: lista as transições, dá-lhes um nome sugerido e descobre que entradas cada uma usa. */
export function detectGrafcetIo(program: GrafcetProgram, stepLabel: (id: string) => string): DetectionResult {
  const list = transitionsOf(program)
  const transitions: DetectedTransition[] = list.map((transition, index) => {
    const name = (transition.name ?? '').trim()
    const autoName = autoTransitionName(transition, index, stepLabel)
    return {
      id: transition.id,
      index,
      name,
      autoName,
      label: name || autoName,
      from: transition.from,
      to: transition.to,
      condition: transition.condition ?? '',
      inputs: inputsInCondition(transition.condition ?? ''),
    }
  })

  const byInput = new Map<string, DetectedInput>()
  for (const t of transitions) {
    for (const address of t.inputs) {
      const entry = byInput.get(address) ?? { address, transitions: [] }
      entry.transitions.push({ id: t.id, label: t.label, index: t.index })
      byInput.set(address, entry)
    }
  }
  const inputs = [...byInput.values()].sort((a, b) => Number(a.address.slice(1)) - Number(b.address.slice(1)))
  return {
    transitions,
    inputs,
    maxInput: inputs.reduce((max, input) => Math.max(max, Number(input.address.slice(1))), 0),
    unnamed: transitions.filter((t) => !t.name).length,
  }
}
