// ============================================================================
// Motor de continuidade elétrica (DC-Simu v2)
//
// Não é animação falsa: constrói um grafo borne→borne a partir de:
//   • cabos (sempre condutivos)
//   • "pontes internas" condicionais de cada componente (disjuntor fechado,
//     contator energizado, contato NA/NF, sensor acionado, drive habilitado…)
//
// A energização é propagada por BFS a partir das fontes (barras L1/L2/L3, N,
// PE, saída da fonte chaveada e do transformador). A cada varredura isso
// determina quais bornes/cabos estão realmente vivos — e portanto se bobinas,
// sinaleiros, motores e acionamentos recebem energia.
//
// Inclui injeção de falhas (falta de fase, curto-circuito, fuga à terra,
// sobretensão, sobrecarga) e medição tipo multímetro (sonda A↔B).
// ============================================================================

import type { ElectricalComponent, Wire, FaultState, ProbeResult } from '../types'

export interface ContinuityResult {
  energizedTerminals: Set<string>
  energizedWires: Set<string>
  /** mapa borne → lista de bornes alcançáveis (usado pela sonda e pelo alerta de curto) */
  reachable: Map<string, Set<string>>
}

const POLE_PAIRS: Record<string, Array<[string, string]>> = {
  breaker1p: [['1', '2']],
  breaker2p: [['1', '2'], ['3', '4']],
  breaker3p: [['1', '2'], ['3', '4'], ['5', '6']],
  breaker4p: [['1', '2'], ['3', '4'], ['5', '6'], ['7', '8']],
  motorBreaker: [['1', '2'], ['3', '4'], ['5', '6']],
  residualBreaker: [['1', '2'], ['3', '4'], ['5', '6'], ['N1', 'N2']],
  thermalRelay: [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3']],
  contactor: [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3']],
  contactor4p: [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3'], ['7', '8']],
  contactorWegCWC09: [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3']],
}

function t(c: ElectricalComponent, label: string) {
  return c.terminals.find((x) => x.label === label)
}

/** Pontes condutivas internas de um componente, dado o estado atual. */
export function internalBridges(c: ElectricalComponent): Array<[string, string]> {
  const bridges: Array<[string, string]> = []
  const pair = (a?: string, b?: string) => {
    if (a && b) bridges.push([a, b])
  }
  const la = (label: string) => t(c, label)?.id

  switch (c.type) {
    // ---- proteção: fecha os polos quando armado e não disparado ----
    case 'breaker1p':
    case 'breaker2p':
    case 'breaker3p':
    case 'breaker4p':
    case 'motorBreaker':
    case 'residualBreaker': {
      if (c.state.closed && !c.state.tripped) {
        for (const [a, b] of POLE_PAIRS[c.type] ?? []) pair(la(a), la(b))
      }
      break
    }
    case 'phoenixEcb3000760': {
      // O catálogo confirma Line+ / LOAD+ / 0V e os sinais Reset/Status.
      // A condutividade em série representa o disjuntor fechado; temporização,
      // limiar de disparo e lógica elétrica do Status não são especificados aqui.
      if (c.state.closed && !c.state.tripped) pair(la('Line+'), la('LOAD+'))
      break
    }
    case 'fuse':
    case 'fuseHolder': {
      if (!c.state.blown) pair(la('IN') ?? la('1'), la('OUT') ?? la('2'))
      break
    }
    case 'surgeProtector': {
      if (!c.state.failed) {
        pair(la('1'), la('2'))
        pair(la('2'), la('3'))
      }
      break
    }
    case 'thermalRelay': {
      if (!c.state.tripped) {
        for (const [a, b] of POLE_PAIRS.thermalRelay) pair(la(a), la(b))
        pair(la('95'), la('96')) // NF abre na sobrecarga
      } else {
        pair(la('97'), la('98')) // NA fecha na sobrecarga
      }
      break
    }

    // ---- comando: contato mecânico ----
    case 'buttonNO':
    case 'selector2':
    case 'selector3':
    case 'keySwitch':
    case 'footSwitch':
    case 'limitSwitch': {
      if (c.state.pressed) {
        pair(la('13'), la('14'))
        pair(la('23'), la('24'))
      }
      break
    }
    case 'buttonNC':
    case 'emergencyButton': {
      if (!c.state.pressed) pair(la('21'), la('22'))
      break
    }

    // ---- sensores ----
    case 'proximitySensor': {
      if (c.state.triggered && c.state.no !== false) pair(la('V+'), la('OUT'))
      break
    }
    case 'photoSensor': {
      if (c.state.triggered) pair(la('NO'), la('0V'))
      else pair(la('NC'), la('0V'))
      break
    }
    case 'pressureSwitch':
    case 'floatSwitch': {
      if (c.state.triggered) pair(la('C'), la('NA'))
      else pair(la('C'), la('NF'))
      break
    }
    case 'thermostat': {
      if (c.state.triggered) pair(la('1'), la('2'))
      break
    }

    // ---- contatores ----
    case 'contactor':
    case 'contactor4p':
    case 'contactorWegCWC09': {
      const en = !!c.state.energized
      if (en) {
        for (const [a, b] of POLE_PAIRS[c.type] ?? []) pair(la(a), la(b))
        pair(la('13'), la('14'))
      } else {
        pair(la('21'), la('22'))
      }
      break
    }
    case 'auxContactBlock': {
      if (c.state.closed) pair(la('13'), la('14'))
      else pair(la('21'), la('22'))
      break
    }

    // ---- relés ----
    case 'auxRelay':
    case 'auxRelay4': {
      if (c.state.energized) {
        pair(la('13'), la('14'))
        pair(la('23'), la('24'))
      } else {
        pair(la('21'), la('22'))
        pair(la('31'), la('32'))
      }
      break
    }
    case 'timerRelayTON':
    case 'timerRelayTOF': {
      if (c.state.energized) pair(la('13'), la('14'))
      else pair(la('21'), la('22'))
      break
    }
    case 'timerRelayStarDelta': {
      // 13-14 = estrela (enquanto não completou), 23-24 = triângulo (após preset)
      if (c.state.energized && !c.state.starDone) pair(la('13'), la('14'))
      if (c.state.deltaDone) pair(la('23'), la('24'))
      if (!c.state.deltaDone) pair(la('31'), la('32'))
      break
    }
    case 'counterRelay': {
      if (c.state.done) pair(la('13'), la('14'))
      else pair(la('21'), la('22'))
      break
    }
    case 'safetyRelay': {
      if (c.state.energized && !c.state.tripped) {
        pair(la('13'), la('14'))
        pair(la('23'), la('24'))
      }
      break
    }

    // ---- acionamentos ----
    case 'vfd': {
      if (c.state.enabled && c.state.running) {
        pair(la('L1'), la('U'))
        pair(la('L2'), la('V'))
        pair(la('L3'), la('W'))
      }
      break
    }
    case 'softStarter': {
      if (c.state.energized) {
        pair(la('L1'), la('U'))
        pair(la('L2'), la('V'))
        pair(la('L3'), la('W'))
      }
      break
    }

    // ---- fontes ----
    case 'powerSupplyProauto24A': {
      // Saída isolada da entrada AC; os dois V+ e os dois V− são paralelos.
      pair(la('+V1'), la('+V2'))
      pair(la('-V1'), la('-V2'))
      if (c.state.powered && c.state.powerReady) pair(la('RDY1'), la('RDY2'))
      break
    }
    case 'powerSupply': {
      if (c.state.on) pair(la('L'), la('+V'))
      break
    }
    case 'transformer': {
      if (!c.state.failed) pair(la('L1'), la('S1'))
      break
    }

    // ---- bornes / barras: passagem direta ----
    case 'terminalBlock':
    case 'terminalPE':
    case 'busbarPhase':
    case 'busbarNeutral':
    case 'earthBar': {
      for (let i = 0; i < c.terminals.length - 1; i++) bridges.push([c.terminals[i].id, c.terminals[i + 1].id])
      break
    }

    // ---- CLP: a saída Q é ponte da alimentação L enquanto o programa a energiza ----
    case 'plcSiemensLogo1224RC': {
      // As 4 saídas são contactos secos: cada Q liga APENAS os seus dois
      // parafusos quando o programa ativa o relé, sem ponte para L+.
      for (const q of Object.keys(c.state.outputs ?? {})) {
        if (c.state.powered !== false && c.state.outputs[q]) pair(la(q), la(`${q}.2`))
      }
      break
    }
    case 'plcLogo':
    case 'plcCompact': {
      const supply = la('L') ?? la('L+')
      if (supply && c.state.outputs) {
        for (const q of Object.keys(c.state.outputs)) {
          if (c.state.outputs[q]) pair(supply, la(q))
        }
      }
      break
    }

    // cargas puras (sinaleiros, motores, medidores) não são ponte de passagem
    default:
      break
  }
  return bridges
}

/** Terminais que são fonte de energia (sempre vivos, ou vivos enquanto a fonte estiver ativa). */
export function sourceTerminalIds(components: ElectricalComponent[], faults?: FaultState): string[] {
  const ids: string[] = []
  for (const c of components) {
    const push = (label: string) => {
      const term = t(c, label)
      if (term) ids.push(term.id)
    }
    // barramentos / bornes de força
    if (c.type === 'busbarPhase' && c.state.source !== false) {
      push('L1')
      if (!faults?.phaseLoss) {
        push('L2')
        push('L3')
      }
    }
    if (c.type === 'busbarNeutral' && c.state.source !== false) {
      c.terminals.forEach((x) => ids.push(x.id))
    }
    if (c.type === 'earthBar') c.terminals.forEach((x) => ids.push(x.id))
    // rede entrando pelos polos de entrada dos disjuntores gerais
    if (c.type === 'breaker1p' || c.type === 'breaker2p' || c.type === 'breaker3p' || c.type === 'breaker4p' || c.type === 'motorBreaker' || c.type === 'residualBreaker') {
      c.terminals.filter((x) => x.kind === 'power-in' || (x.label === 'N1')).forEach((x) => {
        if (faults?.phaseLoss && /L2|[35]/.test(x.label)) return
        ids.push(x.id)
      })
    }
    // fontes locais
    if (c.type === 'powerSupply' && c.state.on) push('+V')
    if (c.type === 'powerSupplyProauto24A' && c.state.powered && c.state.on) { push('+V1'); push('+V2') }
    if (c.type === 'transformer' && !c.state.failed) push('S1')
  }
  return ids
}

interface Graph {
  adjacency: Map<string, string[]>
}

function buildGraph(components: ElectricalComponent[], wires: Wire[]): Graph {
  const adjacency = new Map<string, string[]>()
  const addEdge = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, [])
    if (!adjacency.has(b)) adjacency.set(b, [])
    adjacency.get(a)!.push(b)
    adjacency.get(b)!.push(a)
  }
  for (const w of wires) if (w.fromTerminalId && w.toTerminalId && !w.fromPoint && !w.toPoint) addEdge(w.fromTerminalId, w.toTerminalId)
  for (const c of components) for (const [a, b] of internalBridges(c)) addEdge(a, b)
  return { adjacency }
}

function bfs(graph: Graph, sources: string[]): Set<string> {
  const visited = new Set<string>()
  const queue: string[] = []
  for (const s of sources) {
    if (!visited.has(s)) {
      visited.add(s)
      queue.push(s)
    }
  }
  while (queue.length) {
    const cur = queue.shift()!
    for (const nb of graph.adjacency.get(cur) ?? []) {
      if (!visited.has(nb)) {
        visited.add(nb)
        queue.push(nb)
      }
    }
  }
  return visited
}

export function computeContinuity(components: ElectricalComponent[], wires: Wire[], sourceTerminalIds: string[]): ContinuityResult {
  const graph = buildGraph(components, wires)
  const energizedTerminals = bfs(graph, sourceTerminalIds)
  const energizedWires = new Set<string>()
  for (const w of wires) {
    if (energizedTerminals.has(w.fromTerminalId) && energizedTerminals.has(w.toTerminalId)) energizedWires.add(w.id)
  }
  return { energizedTerminals, energizedWires, reachable: graph.adjacency as unknown as Map<string, Set<string>> }
}

/** Bobina (A1/A2) recebendo energia. */
export function isCoilPowered(c: ElectricalComponent, energizedTerminals: Set<string>): boolean {
  const a1 = t(c, 'A1')?.id
  const a2 = t(c, 'A2')?.id
  if (!a1 || !a2) return false
  return energizedTerminals.has(a1) && energizedTerminals.has(a2)
}

/** Carga de 2 bornes (sinaleiro, buzzer) energizada. */
export function isLoadPowered(c: ElectricalComponent, energizedTerminals: Set<string>, aLabel = 'X1', bLabel = 'X2'): boolean {
  const a = t(c, aLabel)?.id
  const b = t(c, bLabel)?.id
  if (!a || !b) return false
  return energizedTerminals.has(a) && energizedTerminals.has(b)
}

/** Mede continuidade entre dois bornes (função "multímetro" / sonda). */
export function probe(
  components: ElectricalComponent[],
  wires: Wire[],
  a: string,
  b: string,
  energizedTerminals: Set<string>,
): ProbeResult {
  const graph = buildGraph(components, wires)
  const visited = new Map<string, number>([[a, 0]])
  const queue = [a]
  let connected = false
  while (queue.length) {
    const cur = queue.shift()!
    for (const nb of graph.adjacency.get(cur) ?? []) {
      if (!visited.has(nb)) {
        visited.set(nb, (visited.get(cur) ?? 0) + 1)
        if (nb === b) connected = true
        queue.push(nb)
      }
    }
  }
  const hops = visited.get(b) ?? -1
  const liveA = energizedTerminals.has(a)
  const liveB = energizedTerminals.has(b)
  const voltage = liveA && liveB ? '0 V (mesmo potencial)' : liveA !== liveB ? '≈ tensão da fonte' : '0 V'
  const note = connected
    ? hops === 1
      ? 'Continuidade direta (mesmo nó elétrico).'
      : `Caminho condutivo com ${hops} elementos em série.`
    : 'Circuito aberto entre os pontos medidos.'
  return {
    a,
    b,
    connected,
    hops,
    resistanceOhm: connected ? (hops <= 1 ? 0.1 : hops * 0.8) : null,
    voltage,
    note,
  }
}

/** Comprimento estimado do cabo (mm) a partir da distância do roteamento no esquema. */
export function estimateWireLength(from: { x: number; y: number }, to: { x: number; y: number }, scaleMmPerUnit = 4): number {
  const dx = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
  return Math.round((dx * scaleMmPerUnit + 150) / 10) * 10
}
