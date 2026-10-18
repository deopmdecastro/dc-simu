import type { LadderTag } from '../types'
import { actionsOfStep, transitionsOf, type GrafcetProgram } from './engine'

export type SignalArea = 'I' | 'Q' | 'M'
export interface GrafcetSignalSuggestion {
  address: string
  name: string
  comment: string
  area: SignalArea
}

export const canonicalSignalAddress = (address: string) => address.trim().toUpperCase()
export const isSignalAddress = (address: string) => /^[IQM]\d{1,2}$/i.test(address.trim())

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

export const signalSearchText = (signal: GrafcetSignalSuggestion) => `${signal.address} ${signal.name} ${signal.comment}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT')

/** Declaration allocation is independent of runtime's preallocated I/Q bits. */
export function nextDeclaredTagAddress(prefix: 'I' | 'Q' | 'M' | 'T' | 'C', tags: readonly Pick<LadderTag, 'address'>[]): string | null {
  const used = new Set(tags.map((tag) => canonicalSignalAddress(tag.address)))
  for (let index = 1; index <= 99; index++) if (!used.has(`${prefix}${index}`)) return `${prefix}${index}`
  return null
}

/** Explicit bit tokens only: no aliases, timers, Xn, frequencies or factory I/O. */
export function signalAddressesInCondition(expression: string): string[] {
  return [...new Set([...expression.matchAll(/(?<![A-Za-z0-9_%.])([IQM]\d{1,2})(?![A-Za-z0-9_.])/gi)].map((match) => match[1].toUpperCase()))]
}

export function detectGrafcetSignals(program: GrafcetProgram): string[] {
  const found = new Set<string>()
  const inspectAction = (action: { address?: string; variable?: string; condition?: string }) => {
    const address = canonicalSignalAddress(action.address || action.variable || '')
    if (isSignalAddress(address)) found.add(address)
    signalAddressesInCondition(action.condition ?? '').forEach((bit) => found.add(bit))
  }
  program.steps.forEach((step) => actionsOfStep(step).forEach(inspectAction))
  ;(program.freeActions ?? []).forEach(inspectAction)
  transitionsOf(program).forEach((transition) => signalAddressesInCondition(transition.condition ?? '').forEach((bit) => found.add(bit)))
  return [...found].sort((a, b) => 'IQM'.indexOf(a[0]) - 'IQM'.indexOf(b[0]) || Number(a.slice(1)) - Number(b.slice(1)))
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
