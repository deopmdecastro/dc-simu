import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type {
  CircuitState,
  ElectricalComponent,
  LadderRung,
  Wire,
  WireColor,
  EditorTool,
  GridSettings,
  SimMode,
  SimEvent,
  FaultState,
  ComponentType,
  Terminal,
  ProbeResult,
} from '../types'
import { computeContinuity, isCoilPowered, isLoadPowered, probe, sourceTerminalIds } from '../electrical/engine'
import { computePhaseLabels, motorDirectionFromPhases } from '../electrical/phases'
import { runScan, type AddressTable, type TimerTable, type CounterTable, emptyTable, nextAddress } from '../ladder/ladderEngine'
import { detectDiagnostics } from '../utils/errorDetection'
import { buildMeasurements } from '../utils/measurements'
import { buildDirectStartScenario, buildReversalScenario, buildStarDeltaScenario, buildSequentialScenario, SCENARIOS } from '../simulation/scenarios'
import { createComponent, createTerminal, nextRef, terminalByLabel } from '../electrical/factory'

export interface Snapshot {
  components: ElectricalComponent[]
  wires: Wire[]
  ladder: LadderRung[]
}

interface RuntimeExtras {
  table: AddressTable
  timers: TimerTable
  counters: CounterTable
  rungPowered: Record<string, boolean>
  energizedTerminals: Set<string>
  energizedWires: Set<string>
}

interface Store extends CircuitState {
  runtime: RuntimeExtras
  history: Snapshot[]
  future: Snapshot[]
  probeResult: ProbeResult | null
  /** primeiro ponto fixado da sonda (o segundo clique conclui a medição) */
  probeA: string | null
  clipboard: Snapshot | null

  // --- ciclo de simulação ---
  loadScenario: (id: string) => void
  play: () => void
  pause: () => void
  stop: () => void
  reset: () => void
  setSpeed: (n: number) => void
  setMode: (m: SimMode) => void
  toggleStepMode: () => void
  step: () => void
  setFaults: (patch: Partial<FaultState>) => void
  toggleBlackBox: () => void
  pushEvent: (level: SimEvent['level'], message: string) => void
  _intervalId: number | null

  // --- acionamento de campo ---
  pressButton: (componentId: string, pressed: boolean) => void
  setComponentState: (componentId: string, patch: Record<string, any>) => void
  toggleTerminal: (terminalId: string) => void

  // --- edição (editor completo) ---
  setTool: (t: EditorTool) => void
  addComponent: (type: ComponentType, x: number, y: number) => string
  duplicateComponents: (ids: string[]) => void
  updateComponent: (id: string, patch: Partial<ElectricalComponent>) => void
  moveComponent: (id: string, x: number, y: number) => void
  rotateComponent: (id: string) => void
  mirrorComponent: (id: string) => void
  toggleLock: (id: string) => void
  deleteComponents: (ids: string[]) => void
  selectComponents: (ids: string[], additive?: boolean) => void
  selectWire: (id: string | null) => void
  selectTerminal: (id: string | null) => void
  addTerminal: (componentId: string) => void
  updateTerminal: (terminalId: string, patch: Partial<Terminal>) => void
  deleteTerminal: (terminalId: string) => void
  addWire: (fromTerminalId: string, toTerminalId: string, color?: WireColor) => void
  updateWire: (id: string, patch: Partial<Wire>) => void
  deleteWire: (id: string) => void
  deleteSelection: () => void
  runProbe: () => void
  clearProbe: () => void

  // --- malha / vista ---
  setGrid: (patch: Partial<GridSettings>) => void
  setZoom: (z: number) => void
  setPan: (x: number, y: number) => void

  // --- histórico ---
  undo: () => void
  redo: () => void
  commitHistory: () => void

  // --- ladder ---
  addRung: () => void
  deleteRung: (rungId: string) => void
  duplicateRung: (rungId: string) => void
  moveRung: (rungId: string, dir: -1 | 1) => void
  renameRung: (rungId: string, name: string) => void
  updateRung: (rungId: string, updater: (r: LadderRung) => LadderRung) => void

  // --- arquivo ---
  saveJSON: () => string
  loadJSON: (json: string) => void
  newProject: () => void
}

const EMPTY_RUNTIME = (): RuntimeExtras => ({
  table: emptyTable(8, 4),
  timers: {},
  counters: {},
  rungPowered: {},
  energizedTerminals: new Set(),
  energizedWires: new Set(),
})

function buildScenario(id: string) {
  switch (id) {
    case 'reversal':
      return buildReversalScenario()
    case 'star-delta':
      return buildStarDeltaScenario()
    case 'sequential':
      return buildSequentialScenario()
    default:
      return buildDirectStartScenario()
  }
}

function runOneTick(state: Store, dtMs: number) {
  const { components, wires, ladder, sim } = state
  const srcs = sourceTerminalIds(components, sim.faults)

  // 1) Primeira passagem — apenas chaves físicas (botões, disjuntores, sensores)
  const pass1 = computeContinuity(components, wires, srcs)

  // 2) Lê as entradas físicas do CLP a partir do resultado real da continuidade
  const plc = components.find((c) => c.type === 'plcLogo' || c.type === 'plcCompact')
  if (plc) {
    for (const t of plc.terminals) {
      if (t.label.startsWith('I')) state.runtime.table[t.label] = pass1.energizedTerminals.has(t.id)
    }
  }

  // 3) Varredura Ladder
  const scan = runScan(ladder, state.runtime.table, state.runtime.timers, state.runtime.counters, dtMs)
  state.runtime.rungPowered = scan.rungPowered

  // 4) Devolve as saídas Q ao CLP para que sua ponte interna ative
  if (plc) {
    for (const key of Object.keys(plc.state.outputs)) plc.state.outputs[key] = !!scan.table[key]
  }

  // 5) Segunda passagem — agora com as saídas do CLP ativas
  const pass2 = computeContinuity(components, wires, srcs)

  // 6) Coils (contator / relé / temporizador / soft-starter)
  for (const c of components) {
    if (c.type === 'contactor' || c.type === 'contactor4p' || c.type === 'auxRelay' || c.type === 'auxRelay4' || c.type === 'timerRelayTON' || c.type === 'timerRelayTOF' || c.type === 'counterRelay' || c.type === 'safetyRelay' || c.type === 'softStarter') {
      const wants = isCoilPowered(c, pass2.energizedTerminals)
      let finalEnergized = wants
      if (wants && c.state.interlockWith) {
        const partner = components.find((p) => p.id === c.state.interlockWith)
        if (partner?.state.energized) finalEnergized = false
      }
      if (sim.faults.overload && c.type.startsWith('contactor')) {
        // sobrecarga mecânica não desenergiza sozinha, mas registra esforço
      }
      c.state.energized = finalEnergized
    }
  }

  // Temporizador estrela-triângulo dedicado (relé KT)
  for (const c of components) {
    if (c.type === 'timerRelayStarDelta') {
      const wants = isCoilPowered(c, pass2.energizedTerminals)
      c.state.energized = wants
      if (wants) {
        c.state.elapsedMs = Math.min(c.state.presetMs, (c.state.elapsedMs ?? 0) + dtMs)
        c.state.starDone = c.state.elapsedMs >= c.state.presetMs
        c.state.deltaDone = c.state.starDone && c.state.elapsedMs >= c.state.presetMs + (c.state.transitionMs ?? 50)
      } else {
        c.state.elapsedMs = 0
        c.state.starDone = false
        c.state.deltaDone = false
      }
    }
  }

  // 7) Terceira passagem — reflete polos que acabaram de fechar
  const pass3 = computeContinuity(components, wires, srcs)
  state.runtime.energizedTerminals = pass3.energizedTerminals
  state.runtime.energizedWires = pass3.energizedWires

  for (const c of components) for (const t of c.terminals) t.energized = pass3.energizedTerminals.has(t.id)
  for (const w of wires) w.energized = pass3.energizedWires.has(w.id)

  // 8) Sinaleiros / buzzer / torre
  for (const c of components) {
    if (c.type === 'ledGreen' || c.type === 'ledRed' || c.type === 'ledYellow' || c.type === 'ledWhite' || c.type === 'buzzer') {
      c.state.on = isLoadPowered(c, pass3.energizedTerminals)
    }
    if (c.type === 'towerLight') {
      c.state.red = pass3.energizedTerminals.has(terminalByLabel(c, 'R')?.id ?? '')
      c.state.yellow = pass3.energizedTerminals.has(terminalByLabel(c, 'Y')?.id ?? '')
      c.state.green = pass3.energizedTerminals.has(terminalByLabel(c, 'G')?.id ?? '')
      c.state.on = c.state.red || c.state.yellow || c.state.green
    }
    if (c.type === 'hmi') c.state.on = isLoadPowered(c, pass3.energizedTerminals, 'L', 'N')
    if (c.type === 'analogAmmeter') {
      const live = isLoadPowered(c, pass3.energizedTerminals, '1', '2')
      c.state.reading = live ? Number((c.state.scaleInA * 0.6).toFixed(1)) : 0
    }
  }

  // 9) Motores — sentido real pela sequência de fases
  const thermalTripped = components.some((c) => c.type === 'thermalRelay' && c.state.tripped)
  const phaseLabels = computePhaseLabels(components, wires)
  for (const c of components) {
    if (c.type === 'motor3ph') {
      const dir = motorDirectionFromPhases(c, phaseLabels, pass3.energizedTerminals)
      const u1 = terminalByLabel(c, 'U1')
      const v1 = terminalByLabel(c, 'V1')
      const w1 = terminalByLabel(c, 'W1')
      const live = !!(u1 && v1 && w1 && pass3.energizedTerminals.has(u1.id) && pass3.energizedTerminals.has(v1.id) && pass3.energizedTerminals.has(w1.id))
      c.state.tripped = thermalTripped
      c.state.running = live && !thermalTripped && !sim.faults.phaseLoss
      if (c.state.running) {
        c.state.direction = dir === 'unknown' ? 'cw' : dir
        c.state.rpmVisual = Math.min(1, c.state.rpmVisual + dtMs / 800)
      } else {
        c.state.direction = 'stopped'
        c.state.rpmVisual = Math.max(0, c.state.rpmVisual - dtMs / 500)
      }
    }
    if (c.type === 'motor1ph') {
      const live = isLoadPowered(c, pass3.energizedTerminals, 'U1', 'U2')
      c.state.running = live && !sim.faults.phaseLoss
      c.state.direction = c.state.running ? 'cw' : 'stopped'
      c.state.rpmVisual = c.state.running ? Math.min(1, c.state.rpmVisual + dtMs / 800) : Math.max(0, c.state.rpmVisual - dtMs / 500)
    }
  }

  // 10) Inversor — rampa de frequência
  for (const c of components) {
    if (c.type === 'vfd') {
      const powered = c.terminals.filter((t) => t.label.startsWith('L')).some((t) => pass3.energizedTerminals.has(t.id))
      const started = !!c.state.enabled && powered
      const step = (dtMs / Math.max(200, c.state.rampUpMs ?? 3000)) * (c.state.presetHz ?? 60)
      if (started) c.state.frequencyHz = Math.min(c.state.presetHz ?? 60, (c.state.frequencyHz ?? 0) + step)
      else c.state.frequencyHz = Math.max(0, (c.state.frequencyHz ?? 0) - step)
      c.state.running = started && c.state.frequencyHz > 0.5
    }
  }

  // 11) Diagnósticos + medições
  state.sim.diagnostics = detectDiagnostics(components, wires, pass3.energizedTerminals, sim.faults)
  state.sim.measurements = buildMeasurements(components, wires, pass3.energizedTerminals)
  state.sim.scanCount += 1
}

export const useSimStore = create<Store>((set, get) => ({
  components: [],
  wires: [],
  ladder: { rungs: [] },
  sim: {
    runState: 'stopped',
    mode: 'realtime',
    scanCount: 0,
    speed: 1,
    stepMode: false,
    diagnostics: [],
    faults: { phaseLoss: false, shortCircuit: false, earthLeak: false, overvoltage: false, overload: false },
    events: [],
    measurements: [],
    blackBox: false,
  },
  activeScenario: 'direct-start',
  selectedComponentIds: [],
  selectedWireId: null,
  selectedTerminalId: null,
  tool: 'select',
  grid: { enabled: true, size: 20, snap: true, style: 'dots', background: '#0b1220' },
  zoom: 1,
  panX: 0,
  panY: 0,
  dirty: false,
  runtime: EMPTY_RUNTIME(),
  history: [],
  future: [],
  probeResult: null,
  probeA: null,
  clipboard: null,
  _intervalId: null,

  // ---------------------------------------------------------------- simulação
  loadScenario: (id) => {
    const scenario = buildScenario(id)
    get().stop()
    set({
      components: scenario.components,
      wires: scenario.wires,
      ladder: scenario.ladder,
      activeScenario: scenario.id,
      selectedComponentIds: [],
      selectedWireId: null,
      selectedTerminalId: null,
      runtime: EMPTY_RUNTIME(),
      history: [],
      future: [],
      probeResult: null,
      sim: {
        ...get().sim,
        runState: 'stopped',
        scanCount: 0,
        diagnostics: [],
        events: [{ id: nanoid(6), ts: Date.now(), level: 'info', message: `Cenário "${scenario.name}" carregado.` }],
      },
      dirty: false,
    })
    get().step()
  },

  play: () => {
    const existing = get()._intervalId
    if (existing) return
    const interval = get().sim.mode === 'turbo' ? 30 : 100
    const iv = window.setInterval(() => {
      const st = get()
      const dt = (st.sim.mode === 'turbo' ? 50 : 100) * st.sim.speed
      runOneTick(st as unknown as Store, dt)
      pushRuntime(set, st)
    }, interval)
    set((s) => ({ sim: { ...s.sim, runState: 'running' }, _intervalId: iv }))
  },

  pause: () => {
    const iv = get()._intervalId
    if (iv) window.clearInterval(iv)
    set((s) => ({ sim: { ...s.sim, runState: 'paused' }, _intervalId: null }))
  },

  stop: () => {
    const iv = get()._intervalId
    if (iv) window.clearInterval(iv)
    set((s) => ({ sim: { ...s.sim, runState: 'stopped' }, _intervalId: null }))
  },

  reset: () => get().loadScenario(get().activeScenario),

  setSpeed: (n) => set((s) => ({ sim: { ...s.sim, speed: n } })),
  setMode: (m) => {
    set((s) => ({ sim: { ...s.sim, mode: m, stepMode: m === 'step' } }))
    if (m === 'realtime') get().play()
    else get().pause()
  },
  toggleStepMode: () => set((s) => ({ sim: { ...s.sim, stepMode: !s.sim.stepMode, mode: !s.sim.stepMode ? 'step' : 'realtime' } })),

  step: () => {
    const st = get()
    runOneTick(st as unknown as Store, 100)
    pushRuntime(set, st)
  },

  setFaults: (patch) => {
    set((s) => ({ sim: { ...s.sim, faults: { ...s.sim.faults, ...patch } } }))
    get().step()
  },

  toggleBlackBox: () => set((s) => ({ sim: { ...s.sim, blackBox: !s.sim.blackBox } })),

  pushEvent: (level, message) =>
    set((s) => ({
      sim: {
        ...s.sim,
        events: [{ id: nanoid(6), ts: Date.now(), level, message }, ...s.sim.events].slice(0, 120),
      },
    })),

  // ------------------------------------------------------------- acionamento
  pressButton: (componentId, pressed) => {
    set((s) => {
      const c = s.components.find((x) => x.id === componentId)
      if (c) c.state.pressed = pressed
      return { components: [...s.components], dirty: true }
    })
    get().step()
  },

  setComponentState: (componentId, patch) => {
    get().commitHistory()
    set((s) => {
      const c = s.components.find((x) => x.id === componentId)
      if (c) c.state = { ...c.state, ...patch }
      return { components: [...s.components], dirty: true }
    })
    get().step()
  },

  toggleTerminal: (terminalId) => {
    set((s) => {
      for (const c of s.components) {
        const t = c.terminals.find((x) => x.id === terminalId)
        if (t) {
          if (c.type === 'breaker1p' || c.type === 'breaker2p' || c.type === 'breaker3p' || c.type === 'breaker4p' || c.type === 'motorBreaker' || c.type === 'residualBreaker') {
            c.state.closed = !c.state.closed
          } else if (c.type === 'fuse' || c.type === 'fuseHolder') {
            c.state.blown = !c.state.blown
          } else if (c.type === 'thermalRelay') {
            c.state.tripped = !c.state.tripped
          }
        }
      }
      return { components: [...s.components], dirty: true }
    })
    get().step()
  },

  // ------------------------------------------------------------------ edição
  setTool: (t) => set({ tool: t, selectedWireId: t === 'select' ? get().selectedWireId : null, selectedTerminalId: null }),

  addComponent: (type, x, y) => {
    get().commitHistory()
    const comp = createComponent(type, undefined, undefined, get().components.length, x, y)
    comp.ref = nextRef(get().components, type)
    set((s) => ({
      components: [...s.components, comp],
      selectedComponentIds: [comp.id],
      selectedWireId: null,
      dirty: true,
    }))
    get().pushEvent('info', `Componente ${comp.ref} (${comp.label}) adicionado ao esquema.`)
    get().step()
    return comp.id
  },

  duplicateComponents: (ids) => {
    get().commitHistory()
    set((s) => {
      const clones: ElectricalComponent[] = []
      for (const id of ids) {
        const src = s.components.find((c) => c.id === id)
        if (!src) continue
        const clone = createComponent(src.type, undefined, src.label, s.components.length + clones.length, src.schematicX + 30, src.schematicY + 30, JSON.parse(JSON.stringify(src.state)))
        clone.ref = nextRef([...s.components, ...clones], src.type)
        clone.rotation = src.rotation
        clone.w = src.w
        clone.h = src.h
        clone.bodyColor = src.bodyColor
        clones.push(clone)
      }
      return { components: [...s.components, ...clones], selectedComponentIds: clones.map((c) => c.id), dirty: true }
    })
    get().step()
  },

  updateComponent: (id, patch) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      dirty: true,
    }))
    get().step()
  },

  moveComponent: (id, x, y) => {
    set((s) => ({
      components: s.components.map((c) => (c.id === id ? { ...c, schematicX: x, schematicY: y } : c)),
      dirty: true,
    }))
  },

  rotateComponent: (id) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (c.id === id ? { ...c, rotation: ((c.rotation + 90) % 360) as number } : c)),
      dirty: true,
    }))
    get().step()
  },

  mirrorComponent: (id) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (c.id === id ? { ...c, mirrored: !c.mirrored } : c)),
      dirty: true,
    }))
  },

  toggleLock: (id) => {
    get().commitHistory()
    set((s) => ({ components: s.components.map((c) => (c.id === id ? { ...c, locked: !c.locked } : c)), dirty: true }))
  },

  deleteComponents: (ids) => {
    get().commitHistory()
    set((s) => {
      const remaining = s.components.filter((c) => !ids.includes(c.id))
      const deadTerminals = new Set(s.components.filter((c) => ids.includes(c.id)).flatMap((c) => c.terminals.map((t) => t.id)))
      const wires = s.wires.filter((w) => !deadTerminals.has(w.fromTerminalId) && !deadTerminals.has(w.toTerminalId))
      return { components: remaining, wires, selectedComponentIds: [], dirty: true }
    })
    get().step()
  },

  selectComponents: (ids, additive = false) =>
    set((s) => ({
      selectedComponentIds: additive ? [...new Set([...s.selectedComponentIds, ...ids])] : ids,
      selectedWireId: null,
      selectedTerminalId: null,
    })),

  selectWire: (id) => set({ selectedWireId: id, selectedComponentIds: [], selectedTerminalId: null }),
  selectTerminal: (id) => set({ selectedTerminalId: id, selectedWireId: null }),

  addTerminal: (componentId) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => {
        if (c.id !== componentId) return c
        const n = c.terminals.length + 1
        const term = createTerminal(c.id, `X${n}`, 'io', 0.1 + (n % 5) * 0.15, n % 2 ? 0.85 : 0.15)
        return { ...c, terminals: [...c.terminals, term] }
      }),
      dirty: true,
    }))
  },

  updateTerminal: (terminalId, patch) => {
    set((s) => ({
      components: s.components.map((c) => ({
        ...c,
        terminals: c.terminals.map((t) => (t.id === terminalId ? { ...t, ...patch } : t)),
      })),
      dirty: true,
    }))
  },

  deleteTerminal: (terminalId) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => ({ ...c, terminals: c.terminals.filter((t) => t.id !== terminalId) })),
      wires: s.wires.filter((w) => w.fromTerminalId !== terminalId && w.toTerminalId !== terminalId),
      selectedTerminalId: null,
      dirty: true,
    }))
    get().step()
  },

  addWire: (fromTerminalId, toTerminalId, color = 'black') => {
    if (fromTerminalId === toTerminalId) return
    const exists = get().wires.some(
      (w) =>
        (w.fromTerminalId === fromTerminalId && w.toTerminalId === toTerminalId) ||
        (w.fromTerminalId === toTerminalId && w.toTerminalId === fromTerminalId),
    )
    if (exists) return
    get().commitHistory()
    const wire: Wire = {
      id: nanoid(8),
      fromTerminalId,
      toTerminalId,
      color,
      gauge: '1.5mm²',
      kind: /A1|A2/.test('') ? 'control' : 'control',
      flexibility: 'flexible',
      route: 'orthogonal',
      bend: 0.5,
      number: `W${get().wires.length + 1}`,
      energized: false,
    }
    // heurística: cabo entre polos de força = 'power'; entre N/PE = neutral/earth
    const labelOf = (tid: string) => {
      for (const c of get().components) {
        const t = c.terminals.find((x) => x.id === tid)
        if (t) return { kind: t.kind, comp: c }
      }
      return null
    }
    const a = labelOf(fromTerminalId)
    const b = labelOf(toTerminalId)
    if (a?.kind === 'power-in' || a?.kind === 'power-out' || b?.kind === 'power-in' || b?.kind === 'power-out') wire.kind = 'power'
    if (a?.kind === 'neutral' || b?.kind === 'neutral') wire.kind = 'neutral'
    if (a?.kind === 'earth' || b?.kind === 'earth') wire.kind = 'earth'
    if (a?.kind === 'io' || b?.kind === 'io') wire.kind = 'signal'

    set((s) => ({ wires: [...s.wires, wire], selectedWireId: wire.id, dirty: true }))
    get().pushEvent('info', `Cabo ${wire.number} criado (${a?.comp.ref ?? '?'} → ${b?.comp.ref ?? '?'}).`)
    get().step()
  },

  updateWire: (id, patch) => {
    set((s) => ({ wires: s.wires.map((w) => (w.id === id ? { ...w, ...patch } : w)), dirty: true }))
  },

  deleteWire: (id) => {
    get().commitHistory()
    set((s) => ({ wires: s.wires.filter((w) => w.id !== id), selectedWireId: null, dirty: true }))
    get().step()
  },

  deleteSelection: () => {
    const { selectedComponentIds, selectedWireId, selectedTerminalId } = get()
    if (selectedTerminalId) return get().deleteTerminal(selectedTerminalId)
    if (selectedWireId) return get().deleteWire(selectedWireId)
    if (selectedComponentIds.length) return get().deleteComponents(selectedComponentIds)
  },

  runProbe: () => {
    const st = get()
    const segundo = st.selectedTerminalId
    if (!segundo) return
    const primeiro = st.probeA
    if (!primeiro || primeiro === segundo) {
      set({
        probeA: segundo,
        probeResult: { a: segundo, b: null, connected: false, hops: -1, resistanceOhm: null, voltage: '—', note: 'Primeiro ponto fixado. Clique no segundo ponto para medir.' },
      })
      return
    }
    set({ probeA: null, probeResult: probe(st.components, st.wires, primeiro, segundo, st.runtime.energizedTerminals) })
  },

  clearProbe: () => set({ probeResult: null, probeA: null }),

  // -------------------------------------------------------------------- vista
  setGrid: (patch) => set((s) => ({ grid: { ...s.grid, ...patch } })),
  setZoom: (z) => set({ zoom: Math.min(3, Math.max(0.25, z)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),

  // ---------------------------------------------------------------- histórico
  commitHistory: () => {
    const s = get()
    set({
      history: [...s.history.slice(-49), { components: JSON.parse(JSON.stringify(s.components)), wires: JSON.parse(JSON.stringify(s.wires)), ladder: JSON.parse(JSON.stringify(s.ladder.rungs)) }],
      future: [],
    })
  },

  undo: () => {
    const s = get()
    if (!s.history.length) return
    const prev = s.history[s.history.length - 1]
    set({
      components: prev.components,
      wires: prev.wires,
      ladder: { rungs: prev.ladder },
      history: s.history.slice(0, -1),
      future: [...s.future, { components: JSON.parse(JSON.stringify(s.components)), wires: JSON.parse(JSON.stringify(s.wires)), ladder: JSON.parse(JSON.stringify(s.ladder.rungs)) }],
    })
    get().step()
  },

  redo: () => {
    const s = get()
    if (!s.future.length) return
    const next = s.future[s.future.length - 1]
    set({
      components: next.components,
      wires: next.wires,
      ladder: { rungs: next.ladder },
      future: s.future.slice(0, -1),
      history: [...s.history, { components: JSON.parse(JSON.stringify(s.components)), wires: JSON.parse(JSON.stringify(s.wires)), ladder: JSON.parse(JSON.stringify(s.ladder.rungs)) }],
    })
    get().step()
  },

  // ------------------------------------------------------------------- ladder
  addRung: () => {
    get().commitHistory()
    set((s) => ({
      ladder: { rungs: [...s.ladder.rungs, { id: nanoid(6), name: `Rung ${s.ladder.rungs.length + 1}`, branches: [{ id: nanoid(6), elements: [] }], coils: [], enabled: true }] },
      dirty: true,
    }))
    get().step()
  },

  deleteRung: (rungId) => {
    get().commitHistory()
    set((s) => ({ ladder: { rungs: s.ladder.rungs.filter((r) => r.id !== rungId) }, dirty: true }))
    get().step()
  },

  duplicateRung: (rungId) => {
    get().commitHistory()
    set((s) => {
      const idx = s.ladder.rungs.findIndex((r) => r.id === rungId)
      if (idx === -1) return s
      const clone: LadderRung = JSON.parse(JSON.stringify(s.ladder.rungs[idx]))
      clone.id = nanoid(6)
      clone.name = clone.name + ' (cópia)'
      const rungs = [...s.ladder.rungs]
      rungs.splice(idx + 1, 0, clone)
      return { ladder: { rungs }, dirty: true }
    })
  },

  moveRung: (rungId, dir) => {
    set((s) => {
      const idx = s.ladder.rungs.findIndex((r) => r.id === rungId)
      const swapWith = idx + dir
      if (idx === -1 || swapWith < 0 || swapWith >= s.ladder.rungs.length) return s
      const rungs = [...s.ladder.rungs]
      ;[rungs[idx], rungs[swapWith]] = [rungs[swapWith], rungs[idx]]
      return { ladder: { rungs } }
    })
  },

  renameRung: (rungId, name) => set((s) => ({ ladder: { rungs: s.ladder.rungs.map((r) => (r.id === rungId ? { ...r, name } : r)) } })),

  updateRung: (rungId, updater) => {
    set((s) => ({ ladder: { rungs: s.ladder.rungs.map((r) => (r.id === rungId ? updater(r) : r)) } }))
    get().step()
  },

  // ------------------------------------------------------------------ arquivo
  saveJSON: () => {
    const s = get()
    return JSON.stringify(
      {
        app: 'dc-simu',
        version: 2,
        savedAt: new Date().toISOString(),
        components: s.components,
        wires: s.wires,
        ladder: s.ladder,
        grid: s.grid,
        activeScenario: s.activeScenario,
        scenarios: SCENARIOS.map((x) => ({ id: x.id, name: x.name })),
      },
      null,
      2,
    )
  },

  loadJSON: (json) => {
    try {
      const parsed = JSON.parse(json)
      get().stop()
      set({
        components: parsed.components ?? [],
        wires: parsed.wires ?? [],
        ladder: parsed.ladder ?? { rungs: [] },
        grid: parsed.grid ?? get().grid,
        activeScenario: parsed.activeScenario ?? 'custom',
        runtime: EMPTY_RUNTIME(),
        selectedComponentIds: [],
        selectedWireId: null,
        history: [],
        future: [],
        dirty: false,
      })
      get().pushEvent('info', 'Projeto carregado de arquivo JSON.')
      get().step()
    } catch (e) {
      get().pushEvent('error', 'Falha ao carregar o JSON: arquivo inválido.')
      console.error(e)
    }
  },

  newProject: () => {
    get().stop()
    set({
      components: [],
      wires: [],
      ladder: { rungs: [] },
      activeScenario: 'custom',
      runtime: EMPTY_RUNTIME(),
      selectedComponentIds: [],
      selectedWireId: null,
      history: [],
      future: [],
      dirty: false,
    })
    get().pushEvent('info', 'Novo projeto em branco criado.')
  },
}))

function pushRuntime(set: (partial: Partial<Store>) => void, st: Store) {
  set({
    components: [...st.components],
    wires: [...st.wires],
    runtime: { ...st.runtime },
    sim: { ...st.sim },
  })
}

/** Deriva a tabela usada pelos monitores a partir do último scan. */
export function deriveTable(): AddressTable {
  return useSimStore.getState().runtime.table
}

export { nextAddress }
