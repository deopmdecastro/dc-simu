import type { Wire, WireEndType } from '../types'

/**
 * Conectores mecânicos ou de instrumentação que nunca são convertidos numa
 * ponteira tubular dupla (ex.: pontas de prova e fichas banana do multímetro,
 * olhais M4/M5 em pernos ou terminais faston).
 */
const FIXED_CONNECTOR_ENDS: ReadonlySet<WireEndType> = new Set([
  'probe',
  'banana',
  'ring',
  'fork',
  'faston',
])

export function wireSideEndType(wire: Wire, side: 'from' | 'to'): WireEndType {
  const raw = side === 'from' ? wire.fromEndType : wire.toEndType
  return raw ?? wire.endType ?? 'ferrule'
}

/**
 * Uma ponta de condutor é elegível para ponteira dupla DIN 46228-4 sempre que
 * está ligada a um borne real (sem ponta livre) e não usa um conector fixo.
 */
export function isSharedFerruleCandidate(
  terminalId: string | undefined,
  hasFreePoint: boolean,
  end: WireEndType | undefined,
): boolean {
  if (!terminalId || hasFreePoint) return false
  if (!end) return true
  return !FIXED_CONNECTOR_ENDS.has(end)
}

/**
 * Regra universal de cablagem industrial (DIN 46228-4):
 * - Borne com ≥ 2 ligações ligadas ao mesmo `terminalId` (incluindo cabo + sonda
 *   ou dois/mais condutores) → todas as pontas de condutor elegíveis passam a `ferruleDouble`;
 * - Borne que volta a ter ≤ 1 ligação → `ferruleDouble` reverte automaticamente para `ferrule`.
 *
 * Devolve a mesma referência de array quando nada muda para evitar renders supérfluos.
 */
export function syncSharedTerminalFerrules(wires: Wire[]): Wire[] {
  if (wires.length === 0) return wires
  const totalAtTerminal = new Map<string, number>()
  for (const w of wires) {
    if (w.fromTerminalId && !w.fromPoint) {
      totalAtTerminal.set(w.fromTerminalId, (totalAtTerminal.get(w.fromTerminalId) ?? 0) + 1)
    }
    if (w.toTerminalId && !w.toPoint) {
      totalAtTerminal.set(w.toTerminalId, (totalAtTerminal.get(w.toTerminalId) ?? 0) + 1)
    }
  }

  let mutated = false
  const next = wires.map((w) => {
    const curFrom = wireSideEndType(w, 'from')
    const curTo = wireSideEndType(w, 'to')
    let nextFrom = w.fromEndType
    let nextTo = w.toEndType

    if (isSharedFerruleCandidate(w.fromTerminalId, Boolean(w.fromPoint), curFrom)) {
      const n = totalAtTerminal.get(w.fromTerminalId) ?? 0
      if (n >= 2) nextFrom = 'ferruleDouble'
      else if (curFrom === 'ferruleDouble') nextFrom = 'ferrule'
    }
    if (isSharedFerruleCandidate(w.toTerminalId, Boolean(w.toPoint), curTo)) {
      const n = totalAtTerminal.get(w.toTerminalId) ?? 0
      if (n >= 2) nextTo = 'ferruleDouble'
      else if (curTo === 'ferruleDouble') nextTo = 'ferrule'
    }

    if (nextFrom === w.fromEndType && nextTo === w.toEndType) return w
    mutated = true
    return { ...w, fromEndType: nextFrom, toEndType: nextTo }
  })

  return mutated ? next : wires
}

export interface SharedFerrulePortAssignment {
  /** Verdadeiro quando ≥ 2 condutores cravados partilham o colar duplo no mesmo borne. */
  shared: boolean
  /** Índice 0..portCount-1 da entrada atribuída a esta ponta na gola dupla. */
  portIndex: number
  /** Total de entradas no colar duplo (mínimo 2 em `ferruleDouble`). */
  portCount: number
  /** Apenas o condutor líder (portIndex === 0) desenha a ferragem física 3D partilhada. */
  isLeader: boolean
}

/**
 * Determina que canal da ponteira dupla (`portIndex` em `0..portCount-1`) cabe a
 * cada ponta ligada ao mesmo borne e qual delas renderiza a gola/pino 3D único.
 */
export function sharedFerrulePort(
  wires: Wire[],
  wireId: string,
  side: 'from' | 'to',
): SharedFerrulePortAssignment {
  const target = wires.find((w) => w.id === wireId)
  if (!target) return { shared: false, portIndex: 0, portCount: 2, isLeader: true }
  const terminalId = side === 'from' ? target.fromTerminalId : target.toTerminalId
  const free = Boolean(side === 'from' ? target.fromPoint : target.toPoint)
  const end = wireSideEndType(target, side)
  if (!terminalId || free || (end !== 'ferruleDouble' && end !== 'probe')) {
    return { shared: false, portIndex: 0, portCount: 2, isLeader: true }
  }

  const ferruleMembers: Array<{ wireId: string; side: 'from' | 'to' }> = []
  const probes: Array<{ wireId: string; side: 'from' | 'to' }> = []
  for (const w of wires) {
    if (w.fromTerminalId === terminalId && !w.fromPoint) {
      const fEnd = wireSideEndType(w, 'from')
      if (fEnd === 'probe') probes.push({ wireId: w.id, side: 'from' })
      else if (fEnd === 'ferruleDouble') ferruleMembers.push({ wireId: w.id, side: 'from' })
    }
    if (w.toTerminalId === terminalId && !w.toPoint) {
      const tEnd = wireSideEndType(w, 'to')
      if (tEnd === 'probe') probes.push({ wireId: w.id, side: 'to' })
      else if (tEnd === 'ferruleDouble') ferruleMembers.push({ wireId: w.id, side: 'to' })
    }
  }

  if (end === 'probe' && !ferruleMembers.length) return { shared: false, portIndex: 0, portCount: 2, isLeader: true }
  const idx = [...ferruleMembers, ...probes].findIndex((m) => m.wireId === wireId && m.side === side)
  const portIndex = idx >= 0 ? idx : 0
  const portCount = Math.max(2, ferruleMembers.length + probes.length)
  return {
    shared: ferruleMembers.length >= 2,
    portIndex,
    portCount,
    isLeader: portIndex === 0,
  }
}
