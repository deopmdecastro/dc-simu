import type { ElectricalComponent, LadderTag, Wire } from '../types'
import { terminalConnections } from '../schematic/terminalConnections'
import { bitAddressOrder } from './addresses'

export function plcIoRows(plc: ElectricalComponent | undefined, prefix: 'I' | 'Q', table: Record<string, boolean>, wires: Wire[], components: ElectricalComponent[], tags: LadderTag[]) {
  if (!plc) return []
  const addresses = new Map<string, typeof plc.terminals>()
  for (const terminal of plc.terminals) {
    const m = terminal.label.match(new RegExp(`^${prefix}(\\d+)\\.(\\d+)$`))
    const address = m ? `${prefix}${Number(m[1])}.${Number(m[2])}` : undefined
    if (!address) continue
    addresses.set(address, [...(addresses.get(address) ?? []), terminal])
  }
  return [...addresses].sort(([a], [b]) => bitAddressOrder(a) - bitAddressOrder(b)).map(([address, terminals]) => {
    const connections = terminals.flatMap((t) => terminalConnections(t.id, components, wires))
    const destinations = connections.map(({ owner, terminal, loose }) =>
      loose || !owner || !terminal ? 'Ponta livre' : `${owner.ref}.${terminal.displayName || terminal.label}`)
    const tag = tags.find((t) => t.address.toUpperCase() === address)
    return { address, on: !!table[address], name: tag?.name && tag.name !== address ? tag.name : terminals.find((t) => t.displayName)?.displayName ?? '',
      destinations: [...new Set(destinations)], terminalCount: terminals.length }
  })
}

export function plcIoCapacity(plc: ElectricalComponent) {
  const orders = (rows: ReturnType<typeof plcIoRows>) => rows.map((r) => bitAddressOrder(r.address) + 1)
  return { inputs: Math.max(0, ...orders(plcIoRows(plc, 'I', {}, [], [plc], []))), outputs: Math.max(0, ...orders(plcIoRows(plc, 'Q', {}, [], [plc], []))) }
}
