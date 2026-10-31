// ============================================================================
// Comandos elétricos — simulação
//
// A cada passo: une os bornes ligados por cabos e por contactos fechados,
// propaga as fases a partir das alimentações e decide que bobinas, sinalizadores
// e motores ficam sob tensão. As bobinas mudam os contactos, por isso repete-se
// até estabilizar (como um relé real, mas sem tempos de comutação).
// Deteta curto-circuitos (duas fases, ou fase e neutro, na mesma rede), falta de
// fase nos motores e oscilações (circuitos que nunca estabilizam).
// ============================================================================

import { CMD_PARTS, partTerminals, type CmdPart, type CommandsDiagram } from './model'

export interface CmdRuntime {
  running: boolean
  /** Tempo simulado (ms). */
  time: number
  /** Botões/fins de curso premidos agora (por referência). */
  pressed: Record<string, boolean>
  /** Emergências encravadas / comutadores ligados / disjuntores e seccionadores ABERTOS (por referência). */
  toggled: Record<string, boolean>
  /** Relés térmicos e disjuntores disparados (por referência). */
  tripped: Record<string, boolean>
  /** Bobinas sob tensão e instante em que ficaram. */
  coils: Record<string, boolean>
  coilSince: Record<string, number>
  /** Atraso de cada temporizador (ms), por referência. */
  delays: Record<string, number>
  /** Bornes sob tensão (`parte:borne` → fase/polaridade). */
  live: Record<string, string>
  /** Cabos sob tensão (id → fase/polaridade). */
  liveWires: Record<string, string>
  lamps: Record<string, boolean>
  motors: Record<string, CmdMotorState>
  fault?: string
}

export interface CmdMotorState {
  /** stop: parado · run: ligação direta · star / delta: arranque Y-Δ */
  mode: 'stop' | 'run' | 'star' | 'delta'
  /** Sentido de rotação pela sequência de fases (L1-L2-L3 = horário). */
  dir: 1 | -1
  /** Alguma fase em falta (motor «a roncar»). */
  phaseLoss?: boolean
}

export const emptyCmdRuntime = (): CmdRuntime => ({
  running: false, time: 0, pressed: {}, toggled: {}, tripped: {}, coils: {}, coilSince: {}, delays: {}, live: {}, liveWires: {}, lamps: {}, motors: {},
})

const key = (part: string, term: number) => `${part}:${term}`
const PHASES = ['L1', 'L2', 'L3']

/** O contacto/elemento está a conduzir? (estado real do aparelho com a mesma referência). */
export function isClosed(part: CmdPart, rt: CmdRuntime): boolean {
  const on = !!rt.coils[part.tag]
  const timed = on && rt.time - (rt.coilSince[part.tag] ?? rt.time) >= (rt.delays?.[part.tag] ?? 3000)
  switch (part.kind) {
    case 'fuse': case 'fuse3': case 'thermal3': return true
    case 'breaker3': return !rt.toggled[part.tag] && !rt.tripped[part.tag]
    case 'disconnector3': return !rt.toggled[part.tag]
    case 'contact3': case 'contactNO': return on
    case 'contactNC': return !on
    case 'timedNO': return timed
    case 'timedNC': return !timed
    case 'thermalNC': return !rt.tripped[part.tag]
    case 'thermalNO': return !!rt.tripped[part.tag]
    case 'pushNO': case 'limitNO': return !!rt.pressed[part.tag]
    case 'pushNC': return !rt.pressed[part.tag]
    case 'emergency': return !rt.toggled[part.tag]
    case 'selector': return !!rt.toggled[part.tag]
    default: return false
  }
}

class Nets {
  private parent = new Map<string, string>()
  find(a: string): string {
    let p = this.parent.get(a) ?? a
    if (p !== a) { p = this.find(p); this.parent.set(a, p) }
    return p
  }
  union(a: string, b: string) { const ra = this.find(a); const rb = this.find(b); if (ra !== rb) this.parent.set(ra, rb) }
}

interface Solved { nets: Nets; potentials: Map<string, Set<string>> }

function solve(diagram: CommandsDiagram, rt: CmdRuntime): Solved {
  const nets = new Nets()
  for (const w of diagram.wires) nets.union(key(w.a.part, w.a.term), key(w.b.part, w.b.term))
  for (const part of diagram.parts) {
    if (!isClosed(part, rt)) continue
    for (const [a, b] of CMD_PARTS[part.kind].poles) nets.union(key(part.id, a), key(part.id, b))
  }
  const potentials = new Map<string, Set<string>>()
  for (const part of diagram.parts) {
    if (part.kind !== 'supply') continue
    partTerminals(part).forEach((t, i) => {
      const root = nets.find(key(part.id, i))
      const set = potentials.get(root) ?? new Set<string>()
      set.add(t.label)
      potentials.set(root, set)
    })
  }
  return { nets, potentials }
}

const potentialOf = (s: Solved, part: string, term: number): Set<string> | undefined => s.potentials.get(s.nets.find(key(part, term)))
/** Rede com fases diferentes (ou fase e neutro): curto-circuito. O PE junto ao N não conta (TN-C). */
const shorted = (set: Set<string>) => {
  const active = [...set].filter((p) => p !== 'PE')
  return new Set(active.map((p) => (p === 'PEN' ? 'N' : p))).size > 1
}
const single = (set?: Set<string>) => (set && set.size === 1 ? [...set][0] : undefined)
/** Há tensão entre os dois bornes de uma carga (fase-neutro, fase-fase ou L+/M). */
const powered = (a?: Set<string>, b?: Set<string>) => {
  const pa = single(a)
  const pb = single(b)
  return !!pa && !!pb && pa !== pb && pa !== 'PE' && pb !== 'PE'
}

/** Avança a simulação `dtMs` e devolve o novo estado (não altera o anterior). */
export function stepCommands(diagram: CommandsDiagram, previous: CmdRuntime, dtMs: number): CmdRuntime {
  const delays = Object.fromEntries(diagram.parts.filter((p) => p.kind === 'timerCoil').map((p) => [p.tag, p.delayMs ?? 3000]))
  const rt: CmdRuntime = { ...previous, delays, time: previous.time + Math.max(0, dtMs), coils: { ...previous.coils }, coilSince: { ...previous.coilSince }, fault: undefined }
  // Parada: tudo sem tensão; a falha que a parou continua visível até se voltar a arrancar.
  if (!rt.running) return { ...rt, fault: previous.fault, coils: {}, coilSince: {}, live: {}, liveWires: {}, lamps: {}, motors: {} }
  const coilParts = diagram.parts.filter((p) => p.kind === 'coil' || p.kind === 'timerCoil')
  let solved = solve(diagram, rt)
  const seen = new Set<string>()
  for (let round = 0; round < 40; round++) {
    const short = [...solved.potentials.values()].find(shorted)
    if (short) { rt.fault = `Curto-circuito entre ${[...short].filter((p) => p !== 'PE').join(' e ')} — verifique os encravamentos e as ligações`; break }
    const next: Record<string, boolean> = {}
    for (const coil of coilParts) next[coil.tag] = next[coil.tag] || powered(potentialOf(solved, coil.id, 0), potentialOf(solved, coil.id, 1))
    const signature = JSON.stringify(Object.entries(next).sort())
    const changed = coilParts.some((c) => !!next[c.tag] !== !!rt.coils[c.tag])
    if (!changed) break
    if (seen.has(signature)) { rt.fault = 'O circuito oscila (uma bobina desliga-se a si própria) — reveja a lógica dos contactos'; break }
    seen.add(signature)
    for (const tag of Object.keys(next)) {
      if (next[tag] && !rt.coils[tag]) rt.coilSince[tag] = rt.time
      if (!next[tag]) delete rt.coilSince[tag]
    }
    rt.coils = next
    solved = solve(diagram, rt)
  }
  if (rt.fault) {
    // Um curto real queima os fusíveis: tudo fica sem tensão até corrigir e reiniciar.
    return { ...rt, running: false, coils: {}, coilSince: {}, live: {}, liveWires: {}, lamps: {}, motors: {} }
  }

  const live: Record<string, string> = {}
  for (const part of diagram.parts) partTerminals(part).forEach((_, i) => {
    const p = single(potentialOf(solved, part.id, i))
    if (p) live[key(part.id, i)] = p
  })
  const liveWires: Record<string, string> = {}
  for (const w of diagram.wires) { const p = live[key(w.a.part, w.a.term)]; if (p) liveWires[w.id] = p }

  const lamps: Record<string, boolean> = {}
  for (const lamp of diagram.parts.filter((p) => p.kind === 'lamp')) lamps[lamp.id] = powered(potentialOf(solved, lamp.id, 0), potentialOf(solved, lamp.id, 1))

  const motors: Record<string, CmdMotorState> = {}
  for (const m of diagram.parts.filter((p) => p.kind === 'motor3' || p.kind === 'motor6')) motors[m.id] = motorState(m, solved, live)

  return { ...rt, live, liveWires, lamps, motors }
}

function motorState(m: CmdPart, s: Solved, live: Record<string, string>): CmdMotorState {
  const phase = (t: number) => live[key(m.id, t)]
  const feed = [phase(0), phase(1), phase(2)]
  const present = feed.filter((p) => p && PHASES.includes(p))
  if (!present.length) return { mode: 'stop', dir: 1 }
  const dirOf = (): 1 | -1 => {
    const order = feed.map((p) => PHASES.indexOf(p!))
    return (order[1] - order[0] + 3) % 3 === 1 ? 1 : -1
  }
  const allThree = present.length === 3 && new Set(present).size === 3
  if (m.kind === 'motor3') return allThree ? { mode: 'run', dir: dirOf() } : { mode: 'stop', dir: 1, phaseLoss: true }
  const net = (t: number) => s.nets.find(key(m.id, t))
  // Estrela: U2, V2 e W2 unidos (ponto de estrela). Triângulo: U1-W2, V1-U2, W1-V2.
  const star = net(3) === net(4) && net(4) === net(5)
  const delta = net(0) === net(5) && net(1) === net(3) && net(2) === net(4)
  const mode = delta ? 'delta' : star ? 'star' : 'stop'
  if (mode === 'stop') return { mode, dir: 1 }
  return allThree ? { mode, dir: dirOf() } : { mode: 'stop', dir: 1, phaseLoss: true }
}

/** Aparelhos do esquema (uma linha por referência), para o painel de estado. */
export function devicesOf(diagram: CommandsDiagram): Array<{ tag: string; kinds: string[] }> {
  const byTag = new Map<string, Set<string>>()
  for (const p of diagram.parts) {
    if (!p.tag) continue
    const set = byTag.get(p.tag) ?? new Set<string>()
    set.add(p.kind)
    byTag.set(p.tag, set)
  }
  return [...byTag.entries()].map(([tag, kinds]) => ({ tag, kinds: [...kinds] })).sort((a, b) => a.tag.localeCompare(b.tag, 'pt', { numeric: true }))
}
