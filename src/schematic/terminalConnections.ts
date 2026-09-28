import type { ElectricalComponent, Wire } from '../types'

/** Ligações reais ao borne; pontas livres não contam como ligações elétricas. */
export function terminalConnections(terminalId: string, components: ElectricalComponent[], wires: Wire[]) {
  return wires.flatMap((wire) => {
    const from = wire.fromTerminalId === terminalId && !wire.fromPoint
    const to = wire.toTerminalId === terminalId && !wire.toPoint
    if (!from && !to) return []
    const peerId = from ? wire.toTerminalId : wire.fromTerminalId
    const loose = from ? !!wire.toPoint : !!wire.fromPoint
    const owner = !loose ? components.find((c) => c.terminals.some((t) => t.id === peerId)) : undefined
    const terminal = owner?.terminals.find((t) => t.id === peerId)
    return [{ wire, owner, terminal, loose: loose || !terminal }]
  })
}
