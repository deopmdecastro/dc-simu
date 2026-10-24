import type { LadderTag } from '../types'
import { normalizeBitAddress } from '../ladder/addresses'
import { actionsOfStep, normalizeActionVariable, stripGrafcetPrefix, transitionsOf, type GrafcetProgram } from './engine'
import { isSymbolicSignalName, symbolWordsInCondition } from './inputDetect'
import { foldText } from '../utils/text'

export type SignalArea = 'I' | 'Q' | 'M'
export interface GrafcetSignalSuggestion {
  address: string
  name: string
  comment: string
  area: SignalArea
}

export const canonicalSignalAddress = (address: string) => normalizeBitAddress(address) ?? address.trim().toUpperCase()
export const isSignalAddress = (address: string) => !!normalizeBitAddress(address.trim())

/** Tags are documentation: always insert the address, never a descriptive name. */
export function grafcetSignals(tags: readonly LadderTag[]): GrafcetSignalSuggestion[] {
  const found = new Map<string, GrafcetSignalSuggestion>()
  for (const tag of tags) {
    const address = canonicalSignalAddress(tag.address)
    if (tag.dataType !== 'Bool' || !isSignalAddress(address) || found.has(address)) continue
    found.set(address, { address, name: tag.name, comment: tag.comment ?? '', area: address[0] as SignalArea })
  }
  return [...found.values()]
}

export const signalSearchText = (signal: GrafcetSignalSuggestion) => foldText(`${signal.address} ${signal.name} ${signal.comment}`)

/** Declaration allocation is independent of runtime's preallocated I/Q bits. */
export function nextDeclaredTagAddress(prefix: 'I' | 'Q' | 'M' | 'T' | 'C', tags: readonly Pick<LadderTag, 'address'>[]): string | null {
  const used = new Set(tags.map((tag) => canonicalSignalAddress(tag.address)))
  // Bits I/Q/M: forma Siemens byte.bit (I0.0, I0.1…, I1.0…; igual para Q/M).
  if (prefix === 'I' || prefix === 'Q' || prefix === 'M') {
    for (let i = 0; i < 96; i++) { const addr = `${prefix}${Math.floor(i / 8)}.${i % 8}`; if (!used.has(addr)) return addr }
    return null
  }
  for (let index = 1; index <= 99; index++) if (!used.has(`${prefix}${index}`)) return `${prefix}${index}`
  return null
}

/** Explicit bit tokens only: no aliases, timers, Xn, frequencies or factory I/O. */
export function signalAddressesInCondition(expression: string): string[] {
  return [...new Set([...expression.matchAll(/(?<![A-Za-z0-9_%.])([IQM]\d{1,4}\.[0-7]|[IQM]\d{1,2})(?![A-Za-z0-9_.])/gi)].map((match) => normalizeBitAddress(match[1]) ?? match[1].toUpperCase()))]
}

export function detectGrafcetSignals(program: GrafcetProgram): string[] {
  const found = new Set<string>()
  const inspectAction = (action: { address?: string; variable?: string; condition?: string }) => {
    const address = canonicalSignalAddress(normalizeActionVariable(action.address || action.variable || ''))
    if (isSignalAddress(address)) found.add(address)
    signalAddressesInCondition(action.condition ?? '').forEach((bit) => found.add(bit))
  }
  program.steps.forEach((step) => actionsOfStep(step).forEach(inspectAction))
  ;(program.freeActions ?? []).forEach(inspectAction)
  transitionsOf(program).forEach((transition) => signalAddressesInCondition(stripGrafcetPrefix(transition.condition ?? '')).forEach((bit) => found.add(bit)))
  return [...found].sort((a, b) => 'IQM'.indexOf(a[0]) - 'IQM'.indexOf(b[0]) || Number(a.slice(1)) - Number(b.slice(1)))
}

export interface DetectedGrafcetSignal {
  address: string
  /** nome sugerido: a grafia usada no programa; vazio quando o próprio endereço já aparece no diagrama */
  name: string
  area: SignalArea
  /** true quando o programa usa um nome (Start, Stop…) e o endereço foi atribuído pela deteção */
  symbolic: boolean
}

/**
 * Deteção completa para a tabela de sinais.
 * 1) Endereços I/Q/M escritos no diagrama (Q1, I2, M7…) — comportamento de sempre.
 * 2) Variáveis simbólicas (Start, /Stop, fc_a0…), que antes passavam ao lado:
 *    lidas em condições → entradas (I); escritas por ações → saídas (Q).
 *    Recebem o primeiro endereço livre da área e o nome tal como foi escrito no programa.
 * Símbolos e endereços já declarados (por endereço ou pelo mesmo nome) não são repetidos.
 */
export function detectGrafcetSignalsDetailed(program: GrafcetProgram, tags: readonly Pick<LadderTag, 'address' | 'name'>[]): DetectedGrafcetSignal[] {
  const claimed: Array<Pick<LadderTag, 'address'>> = [...tags]
  const knownAddresses = new Set(tags.map((tag) => canonicalSignalAddress(tag.address)))
  const knownNames = new Set(tags.map((tag) => foldText(tag.name.trim())).filter(Boolean))

  const out: DetectedGrafcetSignal[] = []
  for (const address of detectGrafcetSignals(program)) {
    if (knownAddresses.has(address)) continue
    knownAddresses.add(address)
    claimed.push({ address })
    out.push({ address, name: '', area: address[0] as SignalArea, symbolic: false })
  }

  // Variáveis simbólicas: chave em maiúsculas → grafia original da primeira ocorrência.
  const read = new Map<string, string>()
  const written = new Map<string, string>()
  const note = (map: Map<string, string>, raw: string) => {
    const word = raw.trim()
    if (word && !map.has(word.toUpperCase())) map.set(word.toUpperCase(), word)
  }
  transitionsOf(program).forEach((transition) => symbolWordsInCondition(transition.condition ?? '').forEach((word) => note(read, word)))
  const inspectAction = (action: { address?: string; variable?: string; condition?: string }) => {
    symbolWordsInCondition(action.condition ?? '').forEach((word) => note(read, word))
    const target = normalizeActionVariable(action.address || action.variable || '').trim().replace(/[+-]$/, '')
    if (isSymbolicSignalName(target)) note(written, target)
  }
  program.steps.forEach((step) => actionsOfStep(step).forEach(inspectAction))
  ;(program.freeActions ?? []).forEach(inspectAction)

  const symbols = [...new Map([...read, ...written]).entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-PT'))
  for (const [upper, name] of symbols) {
    const fold = foldText(name)
    if (knownNames.has(fold)) continue
    const area: 'I' | 'Q' = written.has(upper) ? 'Q' : 'I'
    const address = nextDeclaredTagAddress(area, claimed)
    if (!address) continue
    knownNames.add(fold)
    claimed.push({ address })
    out.push({ address, name, area, symbolic: true })
  }
  return out
}

export function signalTagErrors(tags: readonly LadderTag[], managedIds?: ReadonlySet<string>): Map<string, string> {
  const errors = new Map<string, string>()
  const addresses = new Map<string, string[]>()
  const managed = new Set(tags.filter((tag) => tag.dataType === 'Bool' && (managedIds ? managedIds.has(tag.id) : /^[IQM](?:\d|$)/i.test(tag.address.trim()))).map((tag) => tag.id))
  for (const tag of tags) {
    const address = canonicalSignalAddress(tag.address)
    const ids = addresses.get(address) ?? []
    addresses.set(address, [...ids, tag.id])
    if (managed.has(tag.id) && !isSignalAddress(address)) errors.set(tag.id, 'Use um endereço I, Q ou M com um ou dois algarismos (ex.: I1).')
  }
  for (const [address, ids] of addresses) if (ids.length > 1) ids.filter((id) => managed.has(id)).forEach((id) => errors.set(id, `O endereço ${address} está repetido.`))
  return errors
}

// ---------------------------------------------------------------------------
// Tabela de sinais dinâmica: uso no programa, declaração e autocompletar
// ---------------------------------------------------------------------------

export interface SignalUsage {
  /** Nº de transições cuja condição lê o sinal. */
  transitions: number
  /** Nº de ações que escrevem o sinal ou o usam na condição. */
  actions: number
}

const bump = (map: Map<string, SignalUsage>, address: string, key: keyof SignalUsage) => {
  const usage = map.get(address) ?? { transitions: 0, actions: 0 }
  usage[key] += 1
  map.set(address, usage)
}

/** Conta onde cada endereço I/Q/M é usado no programa (cada elemento conta uma vez por endereço). */
export function signalUsage(program: GrafcetProgram): Map<string, SignalUsage> {
  const usage = new Map<string, SignalUsage>()
  const countAction = (action: { address?: string; variable?: string; condition?: string }) => {
    const own = new Set<string>()
    const address = canonicalSignalAddress(action.address || action.variable || '')
    if (isSignalAddress(address)) own.add(address)
    signalAddressesInCondition(action.condition ?? '').forEach((bit) => own.add(bit))
    own.forEach((bit) => bump(usage, bit, 'actions'))
  }
  program.steps.forEach((step) => actionsOfStep(step).forEach(countAction))
  ;(program.freeActions ?? []).forEach(countAction)
  transitionsOf(program).forEach((transition) => signalAddressesInCondition(stripGrafcetPrefix(transition.condition ?? '')).forEach((bit) => bump(usage, bit, 'transitions')))
  return usage
}

/** Endereços usados no GRAFCET que ainda não existem (como Bool I/Q/M) na tabela de tags. */
export function undeclaredSignals(program: GrafcetProgram, tags: readonly LadderTag[]): string[] {
  const declared = new Set(tags.map((tag) => canonicalSignalAddress(tag.address)))
  return detectGrafcetSignals(program).filter((address) => !declared.has(address))
}

/** Novas tags Bool (sem nome) para os endereços indicados que ainda não estão declarados. */
export function tagsToDeclare(tags: readonly Pick<LadderTag, 'address'>[], addresses: readonly string[], newId: () => string): LadderTag[] {
  const known = new Set(tags.map((tag) => canonicalSignalAddress(tag.address)))
  const out: LadderTag[] = []
  for (const raw of addresses) {
    const address = canonicalSignalAddress(raw)
    if (!isSignalAddress(address) || known.has(address)) continue
    known.add(address)
    out.push({ id: newId(), address, name: '', comment: '', dataType: 'Bool' })
  }
  return out
}

export interface TokenAtCursor {
  start: number
  end: number
  text: string
}

/**
 * Palavra (identificador) sob o cursor numa condição, para o autocompletar.
 * Ignora números e valores como «5s»: só palavras que começam por letra ou «_».
 */
export function tokenAtCursor(value: string, cursor: number): TokenAtCursor | null {
  const at = Math.max(0, Math.min(cursor, value.length))
  const isWord = (char: string | undefined) => !!char && /[A-Za-z0-9_]/.test(char)
  let start = at
  while (start > 0 && isWord(value[start - 1])) start--
  let end = at
  while (end < value.length && isWord(value[end])) end++
  if (start === end) return null
  const text = value.slice(start, end)
  if (!/^[A-Za-z_]/.test(text)) return null
  // «.5HZ», «%I1»: não são endereços escritos à mão.
  if (start > 0 && /[.%]/.test(value[start - 1])) return null
  return { start, end, text }
}

const fold = foldText

/**
 * Ordena as sugestões para uma consulta: endereço começado pela consulta, depois
 * nome começado por ela (ou por uma das palavras), depois qualquer ocorrência
 * no endereço, nome ou comentário. Em empate, I → M → Q e endereço numérico.
 */
export function matchSignals<T extends { address: string; name: string; comment: string; area: SignalArea | 'X' }>(items: readonly T[], query: string, limit = 8): T[] {
  const q = fold(query.trim())
  if (!q) return []
  const rank = (item: T): number => {
    const address = fold(item.address)
    const name = fold(item.name)
    if (address === q) return 0
    if (address.startsWith(q)) return 1
    if (name.startsWith(q) || name.split(/[\s_\-.]+/).some((word) => word.startsWith(q))) return 2
    if (address.includes(q) || name.includes(q) || fold(item.comment).includes(q)) return 3
    return 4
  }
  const order = (area: SignalArea | 'X') => 'IMQX'.indexOf(area)
  return items
    .map((item) => ({ item, score: rank(item) }))
    .filter((entry) => entry.score < 4)
    .sort((a, b) => a.score - b.score || order(a.item.area) - order(b.item.area) || Number(a.item.address.slice(1)) - Number(b.item.address.slice(1)))
    .slice(0, limit)
    .map((entry) => entry.item)
}

/** Acrescenta um sinal a uma condição com AND (`*`); «1» e vazio são substituídos. */
export function insertCondition(base: string, address: string): string {
  const current = base.trim()
  if (!current || current === '1') return address
  if (/[(*+/^\\]$/.test(current)) return `${current}${current.endsWith('(') ? '' : ' '}${address}`.replace(/\s+$/, '')
  return `${current} * ${address}`
}
