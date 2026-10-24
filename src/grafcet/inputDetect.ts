import { COMPARE_TOKEN, stripGrafcetPrefix, transitionsOf, type GrafcetProgram, type GrafcetTransition } from './engine'

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

const RESERVED_WORDS = new Set(['AND', 'OR', 'NOT', 'TRUE', 'FALSE', 'T', 'HZ', 'MS', 'S'])

const COMPARE_RE = new RegExp(COMPARE_TOKEN, 'gi')

/** true para identificadores que funcionam como variável simbólica (Start, B_Stop…).
 *  Exclui endereços I/Q/M, palavras reservadas e registos numéricos (MW1, T1, C1). */
export function isSymbolicSignalName(raw: string): boolean {
  const word = raw.trim().replace(/[+-]$/, '')
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(word)) return false
  const upper = word.toUpperCase()
  if (RESERVED_WORDS.has(upper) || /^[IQM]\d{1,4}(?:\.[0-7])?$/.test(upper)) return false
  if (/^MW\d{1,4}$/.test(upper) || /^[TC]\d{1,3}$/.test(upper)) return false
  return true
}

/** Variáveis simbólicas (Start, B_Stop, fc_a0…) usadas numa condição, com a grafia original.
 *  Ignora endereços I/Q/M, referências a etapas (X5, G0X3), temporizações (5s/X3, T(2s)),
 *  frequências e os operandos numéricos das comparações (MW1>=5, T1>2000). */
export function symbolWordsInCondition(expression: string): string[] {
  const cleaned = stripGrafcetPrefix(expression)
    .replace(COMPARE_RE, ' ')
    .replace(/T\(\s*\d+(?:\.\d+)?\s*(?:ms|s)?\s*\)/gi, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:ms|s)?\s*\/\s*X[A-Za-z0-9_]*(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:ms|s)?)?/gi, ' ')
    .replace(/\d+(?:\.\d+)?\s*hz/gi, ' ')
    .replace(/G\d+\s*<=>\s*X\d+/gi, ' ')
    .replace(/(?<![A-Za-z0-9_])(?:G\d+)?X\d+(?![A-Za-z0-9_])/gi, ' ')
  const found = new Map<string, string>()
  for (const match of cleaned.matchAll(/(?<![A-Za-z0-9_%.])[A-Za-z][A-Za-z0-9_]*/g)) {
    const upper = match[0].toUpperCase()
    if (RESERVED_WORDS.has(upper) || /^[IQM]\d{1,4}(?:\.[0-7])?$/.test(upper) || /^MW\d{1,4}$/.test(upper)) continue
    if (!found.has(upper)) found.set(upper, match[0])
  }
  return [...found.values()]
}

/** Variáveis simbólicas (Start, B_Stop, fc_a0…) usadas numa condição, em maiúsculas. */
export function symbolsInCondition(expression: string): string[] {
  return symbolWordsInCondition(expression).map((word) => word.toUpperCase())
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
  /** variáveis simbólicas usadas na condição */
  symbols: string[]
}

export interface DetectedInput {
  /** chave na tabela de simulação: I1… ou, nas variáveis simbólicas, o nome em maiúsculas */
  address: string
  /** true quando é uma variável simbólica (Start, B_Stop…) e não um endereço I */
  symbol: boolean
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
      symbols: symbolsInCondition(transition.condition ?? ''),
    }
  })

  const byInput = new Map<string, DetectedInput>()
  const register = (address: string, symbol: boolean, t: DetectedTransition) => {
    const entry = byInput.get(address) ?? { address, symbol, transitions: [] }
    entry.transitions.push({ id: t.id, label: t.label, index: t.index })
    byInput.set(address, entry)
  }
  for (const t of transitions) {
    for (const address of t.inputs) register(address, false, t)
    for (const symbol of t.symbols) register(symbol, true, t)
  }
  // Endereços I primeiro (por número), depois as variáveis simbólicas por ordem alfabética.
  const inputs = [...byInput.values()].sort((a, b) => Number(a.symbol) - Number(b.symbol) || (a.symbol ? a.address.localeCompare(b.address) : Number(a.address.slice(1)) - Number(b.address.slice(1))))
  return {
    transitions,
    inputs,
    maxInput: inputs.reduce((max, input) => (input.symbol ? max : Math.max(max, Number(input.address.slice(1)))), 0),
    unnamed: transitions.filter((t) => !t.name).length,
  }
}
