import type { ElectricalComponent, LadderTag, Wire } from '../types'
import { terminalConnections } from '../schematic/terminalConnections'

export function plcIoRows(plc: ElectricalComponent | undefined, prefix: 'I' | 'Q', table: Record<string, boolean>, wires: Wire[], components: ElectricalComponent[], tags: LadderTag[]) {
  if (!plc) return []
  const addresses = new Map<string, typeof plc.terminals>()
  for (const terminal of plc.terminals) {
    const address = terminal.label.match(new RegExp(`^(${prefix}\\d+)(?:\\.\\d+)?$`))?.[1]
    if (!address) continue
    addresses.set(address, [...(addresses.get(address) ?? []), terminal])
  }
  return [...addresses].sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1))).map(([address, terminals]) => {
    const connections = terminals.flatMap((t) => terminalConnections(t.id, components, wires))
    const destinations = connections.map(({ owner, terminal, loose }) =>
      loose || !owner || !terminal ? 'Ponta livre' : `${owner.ref}.${terminal.displayName || terminal.label}`)
    const tag = tags.find((t) => t.address.toUpperCase() === address)
    return { address, on: !!table[address], name: tag?.name && tag.name !== address ? tag.name : terminals.find((t) => t.displayName)?.displayName ?? '',
      destinations: [...new Set(destinations)], terminalCount: terminals.length }
  })
}

export function plcIoCapacity(plc: ElectricalComponent) {
  const inputs = plcIoRows(plc, 'I', {}, [], [plc], []).map((r) => Number(r.address.slice(1)))
  const outputs = plcIoRows(plc, 'Q', {}, [], [plc], []).map((r) => Number(r.address.slice(1)))
  return { inputs: Math.max(0, ...inputs), outputs: Math.max(0, ...outputs) }
}
