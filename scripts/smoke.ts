import { scanGrafcet, emptyGrafcetRuntime, evalCondition, validCondition } from '../src/grafcet/engine'
/**
 * Teste de fumaça dos motores (executado com `npm run test`).
 * Não depende do React: exercita o motor de continuidade, o motor Ladder, o
 * motor de fases e a sonda exatamente como o store faz a cada ciclo.
 */
import { buildDirectStartScenario, buildReversalScenario, buildStarDeltaScenario, buildSequentialScenario } from '../src/simulation/scenarios'
import { computeContinuity, internalBridges, isCoilPowered, isLoadPowered, probe, sourceTerminalIds } from '../src/electrical/engine'
import { computePhaseLabels, motorDirectionFromPhases } from '../src/electrical/phases'
import { runScan } from '../src/ladder/ladderEngine'
import { applyKind } from '../src/ladder/ladderDnd'
import { parseDataBlocks, moveValue } from '../src/ladder/dataBlocks'
import type { CounterTable, AddressTable, TimerTable } from '../src/ladder/ladderEngine'
import { createComponent, terminalByLabel, TEMPLATES, upgradeLogoTerminals, upgradeProauto24A } from '../src/electrical/factory'
import { logoTerminalLocal } from '../src/schematic/logoTerminalGeometry'
import { proautoTerminalLocal } from '../src/schematic/proautoTerminalGeometry'
import { connectNearWireEnds, nearestTerminal, nearestModelTerminal } from '../src/schematic/terminalSnap'
import { terminalPos } from '../src/schematic/symbols'
import { terminalConnections } from '../src/schematic/terminalConnections'
import { wireEndColor } from '../src/schematic/wireEndColor'
import { wireGeometryForWire } from '../src/schematic/wireGeometry'
import { isProgrammablePlc } from '../src/ladder/plcPrograms'
import { plcIoRows, plcIoCapacity } from '../src/ladder/plcIo'
import { PROJECT_FOLDERS } from '../src/ladder/projectFiles'
import type { LadderRung } from '../src/types'
import { useSimStore } from '../src/store/useSimStore'
import { getCommandModelSpec, getComponentGlbSpec, getComponentModelSpec, getProtectionModelSpec, getSchematicPhysicalFootprint, hasComponent3DModel } from '../src/three/modelPaths'
import { COMPONENT_VIEW_PRESETS, componentTerminalViewKey, getDefaultComponent3DPresentation, isOriginalComponentOrientation, normalizeComponentOrientation } from '../src/three/componentOrientation'
import { component3DDimensions, component3DScaleOf, terminalLocal3D, terminalPositionFromLocal3D, terminalWorld3D } from '../src/three/terminal3D'
import * as THREE from 'three'
import { automaticTerminalViewPositions, componentTerminalLocal, projectedComponentBounds } from '../src/schematic/componentTerminalViews'
import { logoElectricalInputs } from '../src/electrical/logoPower'
import { proautoInputPowered } from '../src/electrical/proautoPower'
import { fixedAccountEmails, localApi, verifyFixedCredentials } from '../src/auth/localBackend'
import type { ElectricalComponent, Wire, FaultState } from '../src/types'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' :: ' + extra : ''}`)
  if (!cond) failures++
}

function newTables(comps: ElectricalComponent[]) {
  const table: AddressTable = {}
  const timers: TimerTable = {}
  const counters: CounterTable = {}
  const plc = comps.find((c) => c.type === 'plcLogo' || c.type === 'plcCompact')
  if (plc) for (const t of plc.terminals) if (/^[IQMTC]/.test(t.label)) table[t.label] = false
  return { table, timers, counters }
}

/** Reproduz exatamente o ciclo de varredura do store (3 passagens + ladder). */
function tick(
  comps: ElectricalComponent[],
  wires: Wire[],
  ladder: any,
  table: AddressTable,
  timers: TimerTable,
  counters: CounterTable,
  dt = 100,
  faults?: FaultState,
) {
  const srcs = sourceTerminalIds(comps, faults)
  const pass1 = computeContinuity(comps, wires, srcs)
  const plc = comps.find((c) => c.type === 'plcLogo' || c.type === 'plcCompact')
  if (plc) for (const t of plc.terminals) if (t.label.startsWith('I')) table[t.label] = pass1.energizedTerminals.has(t.id)

  const scan = runScan(ladder, table, timers, counters, dt)
  if (plc) for (const k of Object.keys(plc.state.outputs)) plc.state.outputs[k] = !!scan.table[k]

  const pass2 = computeContinuity(comps, wires, srcs)
  for (const c of comps) {
    if (['contactor', 'contactor4p', 'auxRelay', 'auxRelay4', 'timerRelayTON', 'timerRelayTOF', 'counterRelay', 'softStarter'].includes(c.type)) {
      const wants = isCoilPowered(c, pass2.energizedTerminals)
      let en = wants
      if (wants && c.state.interlockWith) {
        const p = comps.find((x) => x.id === c.state.interlockWith)
        if (p?.state.energized) en = false
      }
      c.state.energized = en
    }
  }
  const pass3 = computeContinuity(comps, wires, srcs)
  for (const c of comps) for (const t of c.terminals) t.energized = pass3.energizedTerminals.has(t.id)
  return pass3
}

const run = (n: number, fn: () => void) => {
  for (let i = 0; i < n; i++) fn()
}

/* ====================================================================== 1 */
console.log('\n— Cenário 1: partida direta com selo —')
{
  const { components: comps, wires, ladder } = buildDirectStartScenario()
  const { table, timers, counters } = newTables(comps)
  const KM1 = comps.find((c) => c.ref === 'KM1')!
  const S1 = comps.find((c) => c.ref === 'S1')! // STOP (NF)
  const S2 = comps.find((c) => c.ref === 'S2')! // START (NA)
  const M1 = comps.find((c) => c.type === 'motor3ph')!

  tick(comps, wires, ladder, table, timers, counters)
  check('KM1 desligado em repouso', KM1.state.energized === false)

  S2.state.pressed = true
  tick(comps, wires, ladder, table, timers, counters)
  check('KM1 liga ao pressionar START', KM1.state.energized === true)

  S2.state.pressed = false
  tick(comps, wires, ladder, table, timers, counters)
  check('selo mantém KM1 após soltar START', KM1.state.energized === true)

  const live3 = ['U1', 'V1', 'W1'].every((l) => M1.terminals.find((t) => t.label === l)!.energized)
  check('motor recebe as três fases', live3)
  const labels = computePhaseLabels(comps, wires)
  const en = new Set(comps.flatMap((c) => c.terminals.filter((t) => t.energized).map((t) => t.id)))
  check('motor gira no sentido horário (L1-L2-L3)', motorDirectionFromPhases(M1, labels, en) === 'cw', `dir=${motorDirectionFromPhases(M1, labels, en)}`)

  S1.state.pressed = true
  tick(comps, wires, ladder, table, timers, counters)
  check('STOP desliga KM1', KM1.state.energized === false)
  S1.state.pressed = false

  tick(comps, wires, ladder, table, timers, counters)
  check('STOP mantém o circuito desligado', KM1.state.energized === false)

  const full = computeContinuity(comps, wires, sourceTerminalIds(comps, undefined))
  const lost = computeContinuity(comps, wires, sourceTerminalIds(comps, { phaseLoss: true, shortCircuit: false, earthLeak: false, overvoltage: false, overload: false }))
  check('falha de falta de fase reduz a malha energizada', lost.energizedTerminals.size < full.energizedTerminals.size)

  const km1 = comps.find((c) => c.ref === 'KM1')!
  const XN = comps.find((c) => c.type === 'busbarNeutral')!
  const r1 = probe(comps, wires, terminalByLabel(km1, 'A2')!.id, terminalByLabel(XN, 'N2')!.id, new Set())
  const r2 = probe(comps, wires, terminalByLabel(km1, 'A1')!.id, terminalByLabel(XN, 'N1')!.id, new Set())
  check('sonda: A2 → neutro tem continuidade', r1.connected === true, r1.note)
  check('sonda: A1 → neutro aberto em repouso', r2.connected === false, r2.note)
}

/* ====================================================================== 2 */
console.log('\n— Cenário 2: reversão de motor —')
{
  const { components: comps, wires, ladder } = buildReversalScenario()
  const { table, timers, counters } = newTables(comps)
  const KM1 = comps.find((c) => c.ref === 'KM1')!
  const KM2 = comps.find((c) => c.ref === 'KM2')!
  const M1 = comps.find((c) => c.type === 'motor3ph')!
  const S0 = comps.find((c) => c.ref === 'S0')!
  const S1 = comps.find((c) => c.ref === 'S1')!
  const S2 = comps.find((c) => c.ref === 'S2')!
  const S3 = comps.find((c) => c.ref === 'S3')!

  S2.state.pressed = true
  const p1 = tick(comps, wires, ladder, table, timers, counters)
  const l1 = computePhaseLabels(comps, wires)
  check('AVANÇO energiza KM1 e bloqueia KM2', KM1.state.energized === true && KM2.state.energized === false)
  check('avanço: motor gira horário', motorDirectionFromPhases(M1, l1, p1.energizedTerminals) === 'cw', `dir=${motorDirectionFromPhases(M1, l1, p1.energizedTerminals)}`)
  S2.state.pressed = false

  // tentativa de reversão direta (sem passar pelo STOP) deve ser bloqueada
  S3.state.pressed = true
  tick(comps, wires, ladder, table, timers, counters)
  check('reversão direta é bloqueada com KM1 energizado', KM1.state.energized === true && KM2.state.energized === false)
  S3.state.pressed = false

  // sequência correta: STOP, depois REVERSÃO
  S1.state.pressed = true
  tick(comps, wires, ladder, table, timers, counters)
  check('STOP desliga KM1', KM1.state.energized === false)
  S1.state.pressed = false
  tick(comps, wires, ladder, table, timers, counters)

  S3.state.pressed = true
  const p2 = tick(comps, wires, ladder, table, timers, counters)
  const l2 = computePhaseLabels(comps, wires)
  check('REVERSÃO energiza KM2 e mantém KM1 desligado', KM2.state.energized === true && KM1.state.energized === false)
  check('reversão: motor gira anti-horário (L3-L2-L1)', motorDirectionFromPhases(M1, l2, p2.energizedTerminals) === 'ccw', `dir=${motorDirectionFromPhases(M1, l2, p2.energizedTerminals)}`)
  check('nunca energiza KM1 e KM2 simultaneamente', !(KM1.state.energized && KM2.state.energized))
  S3.state.pressed = false

  tick(comps, wires, ladder, table, timers, counters)
  check('selo de M2 mantém KM2 após soltar REVERSÃO', KM2.state.energized === true)

  S0.state.pressed = true
  tick(comps, wires, ladder, table, timers, counters)
  check('emergência derruba KM1 e KM2', !KM1.state.energized && !KM2.state.energized)
}

/* ====================================================================== 3 */
console.log('\n— Cenário 3: partida estrela-triângulo (4 s) —')
{
  const { components: comps, wires, ladder } = buildStarDeltaScenario()
  const { table, timers, counters } = newTables(comps)
  const S2 = comps.find((c) => c.ref === 'S2')!
  const KM1 = comps.find((c) => c.ref === 'KM1')!
  const KM2 = comps.find((c) => c.ref === 'KM2')!
  const KM3 = comps.find((c) => c.ref === 'KM3')!
  const M1 = comps.find((c) => c.type === 'motor3ph')!

  S2.state.pressed = true
  run(5, () => tick(comps, wires, ladder, table, timers, counters, 100))
  check(
    'primeiros 0,5 s: KM1 + KM2 (estrela), sem KM3',
    KM1.state.energized === true && KM2.state.energized === true && KM3.state.energized === false,
    `Q1=${table['Q1']} Q2=${table['Q2']} Q3=${table['Q3']} T1=${timers['T1']?.elapsedMs}ms`,
  )
  S2.state.pressed = false

  run(45, () => tick(comps, wires, ladder, table, timers, counters, 100))
  check(
    'após 4 s: KM2 (estrela) sai e KM3 (triângulo) entra',
    KM3.state.energized === true && KM2.state.energized === false && KM1.state.energized === true,
    `T1=${table['T1']} KM2=${KM2.state.energized} KM3=${KM3.state.energized}`,
  )
  const phases = computePhaseLabels(comps, wires)
  const en = new Set(comps.flatMap((c) => c.terminals.filter((t) => t.energized).map((t) => t.id)))
  check('motor roda em estrela e em triângulo', M1.terminals.filter((t) => ['U1', 'V1', 'W1'].includes(t.label)).every((t) => en.has(t.id)), `dir=${motorDirectionFromPhases(M1, phases, en)}`)
}

/* ====================================================================== 4 */
console.log('\n— Cenário 4: partida sequencial + contagem —')
{
  const { components: comps, wires, ladder } = buildSequentialScenario()
  const { table, timers, counters } = newTables(comps)
  const S2 = comps.find((c) => c.ref === 'S2')!
  const KM1 = comps.find((c) => c.ref === 'KM1')!
  const KM2 = comps.find((c) => c.ref === 'KM2')!
  const B1 = comps.find((c) => c.ref === 'B1')!

  S2.state.pressed = true
  run(6, () => tick(comps, wires, ladder, table, timers, counters, 100))
  check('M1 parte imediatamente', KM1.state.energized === true)
  check('M2 ainda não partiu (TON de 3 s em andamento)', KM2.state.energized === false, `T1=${timers['T1']?.elapsedMs}ms`)

  run(35, () => tick(comps, wires, ladder, table, timers, counters, 100))
  check('M2 parte após 3 s', KM2.state.energized === true, `T1done=${table['T1']}`)
  S2.state.pressed = false

  for (let i = 0; i < 3; i++) {
    B1.state.triggered = true
    tick(comps, wires, ladder, table, timers, counters, 100)
    B1.state.triggered = false
    tick(comps, wires, ladder, table, timers, counters, 100)
  }
  const c1 = counters['C1']
  check('contador CTU registra 3 pulsos do sensor', c1?.count === 3, `count=${c1?.count}`)
}

/* Regressões dos temporizadores: pulso não rearma com entrada mantida;
 * estrela-triângulo deve respeitar o tempo morto entre as saídas. */
{
  const base = { id: 'r1', name: 'Timers', enabled: true, branches: [{ id: 'b1', elements: [{ kind: 'contact' as const, id: 'e1', address: 'I1', contactType: 'NO' as const }] }], coils: [] }
  const tp = { rungs: [{ ...base, timer: { kind: 'timer' as const, id: 't1', address: 'T1', timerType: 'TP' as const, presetMs: 300 } }] }
  const table: AddressTable = { I1: true }
  const timers: TimerTable = {}
  const counters: CounterTable = {}
  runScan(tp, table, timers, counters, 100)
  check('TP liga após borda de subida', table.T1 === true)
  runScan(tp, table, timers, counters, 200)
  check('TP termina no tempo pré-definido', table.T1 === false)
  runScan(tp, table, timers, counters, 100)
  check('TP não rearma com entrada mantida', table.T1 === false)
  table.I1 = false
  runScan(tp, table, timers, counters, 100)
  table.I1 = true
  runScan(tp, table, timers, counters, 100)
  check('TP rearma após nova borda', table.T1 === true)

  const sd = { rungs: [{ ...base, timer: { kind: 'timer' as const, id: 't1', address: 'T2', timerType: 'STAR_DELTA' as const, presetMs: 300, preset2Ms: 100 } }] }
  const sdTimers: TimerTable = {}
  runScan(sd, table, sdTimers, counters, 300)
  check('estrela-triângulo respeita intervalo de transição', sdTimers.T2.starDone === true && sdTimers.T2.deltaDone === false)
  runScan(sd, table, sdTimers, counters, 100)
  check('estrela-triângulo ativa delta após intervalo', sdTimers.T2.deltaDone === true)
}

/* GRAFCET: transições síncronas, ações e endereços abandonados. */
{
  const program = { steps: [
    { id: 's0', name: 'Espera', initial: true, action: 'Q1', condition: 'I1' },
    { id: 's1', name: 'Trabalho', initial: false, action: 'M1', condition: '!I1' },
  ] }
  const table: AddressTable = { I1: false }
  let state = scanGrafcet(program, emptyGrafcetRuntime(), table)
  check('GRAFCET ativa etapa inicial e respetiva ação', state.active.includes('s0') && table.Q1 === true && table.M1 === false)
  table.I1 = true
  state = scanGrafcet(program, state, table)
  check('GRAFCET avança uma etapa por scan e atualiza saídas', state.active.includes('s1') && !state.active.includes('s0') && table.Q1 === false && table.M1 === true)
  state = scanGrafcet(program, state, table)
  check('GRAFCET não regressa antes da transição', state.active.includes('s1'))
  table.I1 = false
  state = scanGrafcet(program, state, table)
  check('GRAFCET regressa ao início com transição negada', state.active.includes('s0') && table.Q1 === true)
  state = scanGrafcet({ steps: [] }, state, table)
  check('GRAFCET limpa saídas de programa removido', table.Q1 === false && table.M1 === false)
  check('condição inválida não dispara', !evalCondition('MOVE', table))
}

/* Divergência/convergência AND, ações condicionadas e expressões compostas. */
{
  const steps = ['s0', 's1', 's2', 's3'].map((id, i) => ({ id, name: id, initial: i === 0, action: '', condition: '0', actions: i === 1 ? [{ id: 'a', address: 'Q1', condition: 'I2 & !I3' }] : [] }))
  const program = { steps, transitions: [
    { id: 'fork', from: ['s0'], to: ['s1', 's2'], condition: 'I1 & !M1' },
    { id: 'join', from: ['s1', 's2'], to: ['s3'], condition: 'I4 | M1' },
    { id: 'return', from: ['s3'], to: ['s0'], condition: '1' },
  ] }
  const table: AddressTable = { I1: true, I2: true, I3: false, I4: false, M1: false }
  let runtime = scanGrafcet(program, emptyGrafcetRuntime(), table)
  check('divergência AND ativa duas etapas', runtime.active.includes('s1') && runtime.active.includes('s2') && table.Q1)
  table.I3 = true
  runtime = scanGrafcet(program, runtime, table)
  check('ação condicionada desliga sem sair da etapa', !table.Q1 && runtime.active.length === 2)
  table.I4 = true
  runtime = scanGrafcet(program, runtime, table)
  check('convergência AND espera e consome ambas as origens', runtime.active.length === 1 && runtime.active[0] === 's3')
  runtime = scanGrafcet(program, runtime, table)
  check('retorno no scan seguinte (sem cascata)', runtime.active.length === 1 && runtime.active[0] === 's0')
  check('expressões rejeitam sintaxe incorreta', !validCondition('I1 && I2') && !validCondition('I1 | (I2') && validCondition('(I1 & !I2) | M1'))
}

/* Cabo livre não cria uma ligação fantasma entre bornes de outros componentes. */
{
  const { components, wires } = buildDirectStartScenario()
  const full = computeContinuity(components, wires, sourceTerminalIds(components))
  const template = wires[0]
  const free = { ...template, id: 'free-wire', fromTerminalId: '', toTerminalId: '', fromPoint: { x: 100, y: 200 }, toPoint: { x: 300, y: 200 }, energized: false }
  const withFree = computeContinuity(components, [...wires, free], sourceTerminalIds(components))
  check('cabo livre não altera continuidade do circuito', full.energizedTerminals.size === withFree.energizedTerminals.size && !withFree.energizedWires.has('free-wire'))
  const source = components.flatMap((c) => c.terminals).find((t) => full.energizedTerminals.has(t.id))!
  const isolated = components.flatMap((c) => c.terminals).find((t) => !full.energizedTerminals.has(t.id))!
  const partial = { ...free, fromTerminalId: source.id, fromPoint: undefined }
  const partialResult = computeContinuity(components, [...wires, partial], sourceTerminalIds(components))
  check('ponta ligada e ponta livre ainda não conduzem', !partialResult.energizedWires.has('free-wire'))
  const connected = { ...partial, toTerminalId: isolated.id, toPoint: undefined }
  const connectedResult = computeContinuity(components, [...wires, connected], sourceTerminalIds(components))
  check('duas pontas ligadas podem conduzir', connectedResult.energizedTerminals.has(isolated.id) && connectedResult.energizedWires.has('free-wire'))
}

/* Bornes do LOGO! coincidem com os parafusos do GLB, também em projetos antigos. */
{
  const logo = createComponent('plcSiemensLogo1224RC')
  check('LOGO! tem 19 parafusos/bornes visíveis', logo.terminals.length === 19)
  const legacy = { ...logo, terminals: logo.terminals.filter((t) => !t.label.endsWith('.2') && t.label !== 'X1') }
  check('projetos antigos recebem os segundos contactos sem duplicar', upgradeLogoTerminals(legacy).terminals.length === 19 && upgradeLogoTerminals(logo).terminals.length === 19 && upgradeLogoTerminals({ ...logo, terminals: logo.terminals.filter((t) => t.label !== 'X1') }).terminals.length === 19)
  const switched = { ...logo, state: { ...logo.state, powered: true, outputs: { Q1: true, Q2: false, Q3: false, Q4: false } } }
  const bridges = internalBridges(switched)
  check('relé Q1 liga somente os seus dois parafusos, não L+', bridges.length === 1 && bridges[0].includes(terminalByLabel(logo, 'Q1')!.id) && bridges[0].includes(terminalByLabel(logo, 'Q1.2')!.id))
  check('sem alimentação o relé não fecha', internalBridges({ ...switched, state: { ...switched.state, powered: false } }).length === 0)
  const ps = createComponent('powerSupply')
  const lPlus = terminalByLabel(logo, 'L+')!
  const m = terminalByLabel(logo, 'M')!
  const wire = (a: string, b: string): Wire => ({
    id: `${a}-${b}`, fromTerminalId: a, toTerminalId: b, color: 'red', gauge: '1.5mm²', kind: 'power', route: 'direct', bend: 0.5,
    flexibility: 'rigid', energized: false, number: 1, z: 0,
  }) as Wire
  const plusWire = wire(terminalByLabel(ps, '+V')!.id, lPlus.id)
  const minusWire = wire(terminalByLabel(ps, '-V')!.id, m.id)
  check('L+ isolado não alimenta o LOGO!', !logoElectricalInputs(logo, [ps, logo], [plusWire]).powered)
  check('L+ e M alimentados permitem executar o LOGO!', logoElectricalInputs(logo, [ps, logo], [plusWire, minusWire]).powered)
  const inputWire = wire(terminalByLabel(ps, '+V')!.id, terminalByLabel(logo, 'I1')!.id)
  check('I1 lê 1 apenas na rede positiva', logoElectricalInputs(logo, [ps, logo], [plusWire, minusWire, inputWire]).positive.has(terminalByLabel(logo, 'I1')!.id))
  const l = logoTerminalLocal(logo, terminalByLabel(logo, 'L+')!)
  const i8 = logoTerminalLocal(logo, terminalByLabel(logo, 'I8')!)
  const q1 = logoTerminalLocal(logo, terminalByLabel(logo, 'Q1')!)
  const q4 = logoTerminalLocal(logo, terminalByLabel(logo, 'Q4')!)
  const q4Second = logoTerminalLocal(logo, terminalByLabel(logo, 'Q4.2')!)
  check('bornes superiores do LOGO! estão sobre o modelo', l.y > 0 && l.y < logo.h * 0.2 && i8.x > l.x && i8.x < logo.w * 0.8)
  check('saídas do LOGO! estão sobre os contactos inferiores', q1.y > logo.h * 0.8 && q4.x > q1.x && q4Second.x > q4.x && q4Second.x < logo.w * 0.85)
  // A imagem PNG original mede 560×720; estes alvos foram aferidos visualmente
  // sobre os centros dos parafusos da captura, sem depender do zoom do esquema.
  const fullImage = { ...logo, w: 560, h: 720 }
  const topScrew = logoTerminalLocal(fullImage, terminalByLabel(logo, 'L+')!)
  const lastTop = logoTerminalLocal(fullImage, terminalByLabel(logo, 'I8')!)
  const extraTop = logoTerminalLocal(fullImage, terminalByLabel(logo, 'X1')!)
  const firstBottom = logoTerminalLocal(fullImage, terminalByLabel(logo, 'Q1')!)
  const lastBottom = logoTerminalLocal(fullImage, terminalByLabel(logo, 'Q4.2')!)
  check('alinhamento fino dos parafusos do PNG real',
    Math.abs(topScrew.x - 86) < 2 && Math.abs(lastTop.x - 413) < 2 && Math.abs(extraTop.x - 450) < 2 &&
    Math.abs(topScrew.y - 73) < 2 && Math.abs(firstBottom.x - 100) < 2 &&
    Math.abs(lastBottom.x - 454) < 2 && Math.abs(lastBottom.y - 629) < 2)
  const edited = { ...terminalByLabel(logo, 'Q1')!, x: 0.3, y: 0.7 }
  const moved = logoTerminalLocal(logo, edited)
  check('posição personalizada de borne é respeitada', Math.abs(moved.x - logo.w * 0.3) < 0.01 && Math.abs(moved.y - logo.h * 0.7) < 0.01)
}

/* Fonte DRAN120-24A: pinagem, alimentação AC e saída isolada. */
{
  const ps = createComponent('powerSupplyProauto24A')
  const phase = createComponent('busbarPhase')
  const neutral = createComponent('busbarNeutral')
  const link = (id: string, a: string, b: string): Wire => ({
    id, fromTerminalId: a, toTerminalId: b, color: 'red', gauge: '1.5mm²',
    kind: 'power', route: 'direct', bend: 0.5, flexibility: 'rigid', energized: false, number: 1, z: 0,
  }) as Wire
  const l = link('ac-l', terminalByLabel(phase, 'L1')!.id, terminalByLabel(ps, 'L')!.id)
  const n = link('ac-n', terminalByLabel(neutral, 'N1')!.id, terminalByLabel(ps, 'N')!.id)
  check('DRAN120-24A tem 9 pinos conforme a ficha', ps.terminals.length === 9 && ['RDY1','RDY2','+V1','+V2','-V1','-V2','PE','L','N'].every((label) => !!terminalByLabel(ps, label)))
  check('modelo 24A usa bornes de parafuso', ps.terminals.every((t) => t.terminalType === 'screw'))
  const top = ['-V2', '-V1', '+V2', '+V1', 'RDY2', 'RDY1'].map((label) => proautoTerminalLocal(ps, terminalByLabel(ps, label)!))
  const bottom = ['PE', 'L', 'N'].map((label) => proautoTerminalLocal(ps, terminalByLabel(ps, label)!))
  check('seis parafusos em cima, três em baixo e alinhados por ordem da ficha',
    top.every((p, i) => p.y < ps.h * 0.2 && (i === 0 || p.x > top[i-1].x)) &&
    bottom.every((p, i) => p.y > ps.h * 0.8 && (i === 0 || p.x > bottom[i-1].x)))
  const moved = proautoTerminalLocal(ps, { ...terminalByLabel(ps, 'L')!, x: 0.9, y: 0.8 })
  check('posição personalizada da fonte é respeitada', Math.abs(moved.x - ps.w * 0.9) < 0.01 && Math.abs(moved.y - ps.h * 0.8) < 0.01)
  const old = { ...ps, type: 'powerSupplyProauto24B' as any,
    terminals: ps.terminals.map((t) => ({ ...t, terminalType: 'plug' as const,
      x: ({ RDY1: .18, RDY2: .38, '+V1': .64, '+V2': .84, '-V1': .18, '-V2': .38, PE: .55, L: .72, N: .89 } as Record<string, number>)[t.label],
      y: ['RDY1','RDY2','+V1','+V2'].includes(t.label) ? 0 : 1 })) }
  const migrated = upgradeProauto24A(old)
  check('projetos 24B migram sem trocar IDs dos fios', migrated.type === 'powerSupplyProauto24A' && migrated.terminals.every((t,i) => t.id === old.terminals[i].id && t.terminalType === 'screw') && proautoTerminalLocal(migrated, terminalByLabel(migrated,'RDY1')!).y < migrated.h * .2)
  check('sem fase ou neutro a fonte não arranca', !proautoInputPowered(ps, [ps, phase, neutral], []) && !proautoInputPowered(ps, [ps, phase, neutral], [l]))
  check('L e N em redes distintas alimentam a fonte', proautoInputPowered(ps, [ps, phase, neutral], [l, n]))
  const on = { ...ps, state: { ...ps.state, powered: true, powerReady: true } }
  const bridges = internalBridges(on)
  check('saídas duplas e RDY fazem ponte sem AC→DC', bridges.length === 3 && bridges.some((pair) => pair.includes(terminalByLabel(ps, 'RDY1')!.id) && pair.includes(terminalByLabel(ps, 'RDY2')!.id)) && !bridges.some((pair) => pair.includes(terminalByLabel(ps, 'L')!.id)))
  check('V+ é fonte apenas com a fonte ligada', !sourceTerminalIds([ps]).includes(terminalByLabel(ps, '+V1')!.id) && sourceTerminalIds([on]).includes(terminalByLabel(ps, '+V1')!.id))
}

/* Encaixe exato sem arredondar o conector à malha (caso da captura). */
{
  const plc = createComponent('plcSiemensLogo1224RC')
  const screw = terminalByLabel(plc, 'L+')!
  const center = terminalPos(plc, screw)
  const near = { x: center.x - 9, y: center.y + 4 }
  const target = nearestTerminal([plc], near, 16)
  check('clique próximo encaixa no centro real do borne', target?.id === screw.id && target.point.x === center.x && target.point.y === center.y)
  check('clique fora do alcance não encaixa', nearestTerminal([plc], { x: center.x - 30, y: center.y - 30 }, 16) === null)
  const ps = createComponent('powerSupplyProauto24A', undefined, undefined, 0, 300, 0)
  const output = terminalByLabel(ps, '+V1')!
  const cable = {
    id: 'old-near-screw', fromTerminalId: '', toTerminalId: output.id,
    fromPoint: near, color: 'red', gauge: '1.5mm²', kind: 'power',
    route: 'orthogonal', bend: .5, flexibility: 'rigid', energized: false,
  } as Wire
  const aligned = connectNearWireEnds([plc, ps], [cable])[0]
  check('cabo antigo próximo encaixa e preserva a ligação da outra ponta', aligned.fromTerminalId === screw.id && !aligned.fromPoint && aligned.toTerminalId === output.id)
  const olderPoint = { x: center.x - 20, y: center.y - 9 }
  const repaired = connectNearWireEnds([plc, ps], [{ ...cable, fromPoint: olderPoint }])[0]
  check('ponta antes escondida pela fotografia do PLC encaixa no parafuso', repaired.fromTerminalId === screw.id && !repaired.fromPoint)
  check('encaixe alargado só atua dentro do corpo do modelo', nearestModelTerminal([plc], { x: center.x - 300, y: center.y }, undefined, 28) === null)
}

/* Ordem de camadas: mover cabo e componente com os mesmos botões. */
{
  const plc = createComponent('plcSiemensLogo1224RC')
  const ps = createComponent('powerSupplyProauto24A', undefined, undefined, 0, 300, 0)
  const wire = { id: 'layer-wire', fromTerminalId: plc.terminals[0].id, toTerminalId: ps.terminals[0].id,
    color: 'black', gauge: '1.5mm²', kind: 'control', route: 'orthogonal', bend: .5,
    flexibility: 'rigid', energized: false, endType: 'ferrule', fromEndType: 'ring', toEndType: 'pin',
    fromEndLayer: 'front', toEndLayer: 'back',
  } as Wire
  useSimStore.setState({ components: [plc, ps], wires: [wire], selectedComponentIds: [], selectedWireId: wire.id, history: [], future: [] })
  const store = useSimStore.getState()
  store.bringSelectionToFront()
  check('frente move traçado do cabo à frente dos componentes', (useSimStore.getState().wires[0].z ?? 0) > Math.max(...useSimStore.getState().components.map((c) => c.z ?? 0)))
  store.sendSelectionToBack()
  check('trás move traçado do cabo atrás dos componentes', (useSimStore.getState().wires[0].z ?? 0) < Math.min(...useSimStore.getState().components.map((c) => c.z ?? 0)))
  const saved = useSimStore.getState().saveJSON()
  const loaded = JSON.parse(saved).wires[0] as Wire
  check('tipos e camadas independentes persistem no projeto', loaded.fromEndType === 'ring' && loaded.toEndType === 'pin' && loaded.fromEndLayer === 'front' && loaded.toEndLayer === 'back')
}

/* Inspetor de borne: destinos reais e ponta livre, nome sem trocar a chave. */
{
  const plc = createComponent('plcSiemensLogo1224RC')
  const ps = createComponent('powerSupplyProauto24A', undefined, undefined, 0, 300, 0)
  const input = terminalByLabel(plc, 'L+')!
  input.displayName = 'Alimentação PLC'
  const output = terminalByLabel(ps, '+V1')!
  const base = { color: 'red', gauge: '1.5mm²', kind: 'power', route: 'orthogonal', bend: .5, flexibility: 'rigid', energized: false } as Wire
  const joined: Wire = { ...base, id: 'to-ps', fromTerminalId: input.id, toTerminalId: output.id }
  const open: Wire = { ...base, id: 'open-end', fromTerminalId: input.id, toTerminalId: '', toPoint: { x: 480, y: 40 } }
  const ghost: Wire = { ...base, id: 'free-near', fromTerminalId: input.id, fromPoint: { x: 80, y: 30 }, toTerminalId: output.id }
  const connected = terminalConnections(input.id, [plc, ps], [joined, open, ghost])
  check('inspector lista destino e ponta livre sem contar ponto desligado', connected.length === 2 && connected[0].owner?.id === ps.id && connected[0].terminal?.id === output.id && connected[1].loose)
  check('nome de apresentação não altera o identificador físico do PLC', input.label === 'L+' && input.displayName === 'Alimentação PLC')
}

/* Cada ponteira pode diferir do condutor e da outra extremidade. */
{
  const cable = { color: 'red', fromEndColor: '#00ff00', toEndColor: '#ff00ff' } as Wire
  check('cores das ponteiras independem da cor do cabo e entre si', wireEndColor(cable, 'from', '#112233') === '#00ff00' && wireEndColor(cable, 'to', '#112233') === '#ff00ff')
  const follow = { ...cable, fromEndColor: undefined, toEndColor: undefined }
  check('ponteira não personalizada segue o borne e não o condutor', wireEndColor(follow, 'from', '#112233') === '#112233' && wireEndColor(follow, 'to') === '#64748b')
}

/* Tipo físico não altera nem percurso, nem cantos, nem waypoints no esquema. */
{
  const a = { x: 10, y: 80 }, b = { x: 200, y: 95 }
  const base = { route: 'orthogonal', bend: 0.45, curveOffset: 0, waypoints: [{ x: 75, y: 20 }, { x: 160, y: 20 }] } as Wire
  const rigid = wireGeometryForWire({ ...base, flexibility: 'rigid' }, a, b)
  const flexible = wireGeometryForWire({ ...base, flexibility: 'flexible' }, a, b)
  check('rígido e flexível exibem caminho e pontos idênticos', rigid.d === flexible.d && JSON.stringify(rigid.pts) === JSON.stringify(flexible.pts))
  check('cantos ortogonais substituem curva suave', rigid.d.includes(' Q ') && !rigid.d.includes(' C '))
  const withoutWaypoints = wireGeometryForWire({ ...base, waypoints: [], flexibility: 'rigid' }, a, b)
  check('classificação não muda traçado sem pontos', withoutWaypoints.d === wireGeometryForWire({ ...base, waypoints: [], flexibility: 'flexible' }, a, b).d)
}

/* Cada PLC tem OB1, FC e tabela de saídas próprios, mesmo com Q1 comum. */
{
  const first = createComponent('plcCompact')
  const second = createComponent('plcCompact', undefined, undefined, 0, 300, 0)
  const on: LadderRung = { id: 'plc-a-on', name: 'Liga Q1', enabled: true, branches: [{ id: 'b', elements: [] }], coils: [{ kind: 'coil', id: 'q', address: 'Q1', coilType: 'COIL' }] }
  const off: LadderRung = { id: 'plc-b-off', name: 'Desliga Q1', enabled: false, branches: [{ id: 'b2', elements: [] }], coils: [{ kind: 'coil', id: 'q2', address: 'Q1', coilType: 'COIL' }] }
  useSimStore.setState({ components: [first, second], wires: [], ladder: { rungs: [on] },
    activePlcId: first.id, plcPrograms: {}, fcBlocks: { fc1: [on], fc2: [] }, history: [], future: [] })
  const store = useSimStore.getState()
  check('só PLCs entram no seletor', [first, second].every(isProgrammablePlc) && !isProgrammablePlc(createComponent('contactor')))
  store.setActivePlc(second.id)
  check('novo PLC abre OB1 e FC vazios sem clonar programa', !useSimStore.getState().ladder.rungs.length && !useSimStore.getState().fcBlocks.fc1.length)
  useSimStore.setState({ ladder: { rungs: [off] } })
  store.step()
  check('programas distintos executam saídas Q1 independentes', !!useSimStore.getState().components[0].state.outputs.Q1 && !useSimStore.getState().components[1].state.outputs.Q1)
  store.setActivePlc(first.id)
  check('voltar ao PLC restaura OB1 e FC originais', useSimStore.getState().ladder.rungs[0]?.id === on.id && useSimStore.getState().fcBlocks.fc1[0]?.id === on.id)
  const parsed = JSON.parse(store.saveJSON())
  check('projeto guarda programas distintos por id estável de PLC', parsed.plcPrograms[first.id].rungs[0].id === on.id && parsed.plcPrograms[second.id].rungs[0].id === off.id)
  store.loadJSON(JSON.stringify(parsed))
  check('reabrir projeto restaura PLC ativo e programas', useSimStore.getState().activePlcId === first.id && useSimStore.getState().plcPrograms[second.id].rungs[0].id === off.id)
  const legacy = { ...parsed, version: 2, activePlcId: undefined, plcPrograms: undefined, ladder: { rungs: [on] } }
  store.loadJSON(JSON.stringify(legacy))
  check('projeto antigo atribui programa ao primeiro PLC', useSimStore.getState().activePlcId === first.id && useSimStore.getState().ladder.rungs[0]?.id === on.id)
  store.setActivePlc(second.id)
  check('segundo PLC de projeto antigo inicia programa vazio', useSimStore.getState().ladder.rungs.length === 0)
  store.deleteComponents([second.id])
  check('ao eliminar PLC ativo volta ao programa do PLC restante', useSimStore.getState().activePlcId === first.id && useSimStore.getState().ladder.rungs[0]?.id === on.id)

}

/* Arquivos da árvore e I/O da tabela são derivados do PLC real selecionado. */
{
  const compact = createComponent('plcCompact')
  const logo = createComponent('plcSiemensLogo1224RC', undefined, undefined, 0, 300, 0)
  const source = createComponent('powerSupplyProauto24A', undefined, undefined, 0, 600, 0)
  const i1 = terminalByLabel(compact, 'I1')!
  const out = terminalByLabel(source, '+V1')!
  const cable = { id: 'real-link', fromTerminalId: out.id, toTerminalId: i1.id, color: 'red', gauge: '1.5mm²', kind: 'power', route: 'orthogonal', bend: .5, flexibility: 'rigid', energized: false } as Wire
  const inputRows = plcIoRows(compact, 'I', { I1: true }, [cable], [compact, source], [])
  check('CLP modular mostra 12 entradas reais, nome e destino do fio', inputRows.length === 12 && inputRows[0].on && inputRows[0].destinations.includes(`${source.ref}.${out.label}`))
  check('LOGO mostra 8 entradas e 4 saídas agrupando parafusos duplos', plcIoRows(logo, 'I', {}, [], [logo], []).length === 8 && plcIoRows(logo, 'Q', {}, [], [logo], []).length === 4)
  check('capacidade derivada dos bornes do PLC e não do padrão fixo 8/4', plcIoCapacity(compact).inputs === 12 && plcIoCapacity(compact).outputs === 8)
  useSimStore.setState({ components: [compact, logo, source], activePlcId: compact.id, plcPrograms: {}, plcTags: {}, projectFiles: {}, tags: [] })
  const st = useSimStore.getState()
  const ids = PROJECT_FOLDERS.map((folder) => st.addProjectFile(folder, `Novo ${folder}`))
  check('criação real nas oito pastas do PLC', ids.every(Boolean) && useSimStore.getState().projectFiles[compact.id].length === 8)
  st.updateProjectFile(ids[0]!, { name: 'FC Motor', rungs: [{ id: 'fc-motor', name: 'Teste', enabled: true, branches: [{ id: 'b', elements: [] }], coils: [] }] })
  st.updateProjectFile(ids[5]!, { content: 'I1\nQ8' })
  st.addTag('I'); st.updateTag(useSimStore.getState().tags[0].id, { name: 'Partida', address: 'I1' })
  st.setActivePlc(logo.id)
  check('ficheiros e tags ficam no PLC de origem', !useSimStore.getState().tags.length && !useSimStore.getState().projectFiles[logo.id])
  st.setActivePlc(compact.id)
  const exported = JSON.parse(st.saveJSON())
  check('nomes, networks, tabelas e tags são guardados', exported.projectFiles[compact.id][0].rungs[0].id === 'fc-motor' && exported.projectFiles[compact.id][5].content === 'I1\nQ8' && exported.plcTags[compact.id][0].name === 'Partida')
  st.loadJSON(JSON.stringify(exported))
  check('reabrir repõe ficheiros e tags do PLC', useSimStore.getState().projectFiles[compact.id].length === 8 && useSimStore.getState().tags[0].name === 'Partida')
  st.deleteProjectFile(ids[1]!)
  check('eliminar ficheiro remove apenas item selecionado', useSimStore.getState().projectFiles[compact.id].length === 7)
  st.deleteProjectFolder('documentation')
  check('eliminar pasta opcional remove o conteúdo e oculta a pasta', useSimStore.getState().hiddenProjectFolders[compact.id].includes('documentation') && !useSimStore.getState().projectFiles[compact.id].some((file) => file.folder === 'documentation'))
  const withDeletedFolder = st.saveJSON()
  st.loadJSON(withDeletedFolder)
  check('pastas eliminadas persistem ao reabrir o projeto', useSimStore.getState().hiddenProjectFolders[compact.id].includes('documentation'))
  st.restoreProjectFolder('documentation')
  check('pasta eliminada pode ser restaurada vazia', !useSimStore.getState().hiddenProjectFolders[compact.id].includes('documentation'))
  const backupId = st.addProjectFile('backups', 'Antes da mudança')!
  const tagId = useSimStore.getState().tags[0].id
  st.updateTag(tagId, { name: 'Mudança posterior' })
  check('backup restaura tags e ficheiros do momento da criação', st.restoreProjectBackup(backupId) && useSimStore.getState().tags[0].name === 'Partida' && !useSimStore.getState().projectFiles[compact.id].some((f) => f.id === backupId))
  st.deleteComponents([logo.id])
  check('remoção de PLC limpa só ficheiros desse PLC', !!useSimStore.getState().projectFiles[compact.id] && !useSimStore.getState().projectFiles[logo.id])

}

/* MOVE de paleta não é o gesto de reposicionar um contacto. */
{
  const rung: LadderRung = { id: 'move-bool', name: 'MOVE', enabled: true, branches: [{ id: 'b', elements: [] }], coils: [] }
  const created = applyKind(rung, 'MOVE').rung
  check('MOVE cria operação editável em vez de comentário não suportado', created.move?.source === 'I1' && created.move.target === 'M1')
  const table = { I1: true, M1: false, Q1: false }
  runScan({ rungs: [created] }, table, {}, {}, 100)
  check('MOVE copia entrada ligada para memória no scan', table.M1)
  const disabled = { ...created, enabled: false, move: { source: 'I1', target: 'Q1' } }
  runScan({ rungs: [disabled] }, table, {}, {}, 100)
  check('MOVE desativado não escreve saídas', !table.Q1)
  const readOnly = { ...created, move: { source: '1', target: 'I1' } }
  table.I1 = false
  runScan({ rungs: [readOnly] }, table, {}, {}, 100)
  check('MOVE não altera endereços físicos de entrada', !table.I1)
}

/* Remapeamento conserva o mesmo cabo e a mesma cor, alterando apenas o ID. */
{
  const plc = createComponent('plcCompact')
  const ps = createComponent('powerSupplyProauto24A', undefined, undefined, 0, 300, 0)
  const cable: Wire = { id: 'rewire-same-id', fromTerminalId: plc.terminals[2].id, toTerminalId: ps.terminals[0].id,
    color: 'orange', gauge: '2.5mm²', kind: 'control', flexibility: 'rigid', route: 'orthogonal', bend: .5, energized: false }
  useSimStore.setState({ components: [plc, ps], wires: [cable] })
  useSimStore.getState().updateWire(cable.id, { fromTerminalId: plc.terminals[3].id, fromPoint: undefined })
  const after = useSimStore.getState().wires[0]
  check('arrastar ponta conserva cabo e liga novo borne', after.id === cable.id && after.fromTerminalId === plc.terminals[3].id && after.color === 'orange' && after.gauge === '2.5mm²')
}

/* FCs guardadas no PLC executam apenas quando chamadas de uma network. */
{
  const main: LadderRung = { id: 'main-call', name: 'OB1', enabled: true, branches: [{ id: 'always', elements: [] }], coils: [], call: { targetId: 'fc1' } }
  const fc: LadderRung = { id: 'fc-output', name: 'FC1', enabled: true, branches: [{ id: 'always-fc', elements: [] }], coils: [{ kind: 'coil', id: 'coil-fc', address: 'Q2', coilType: 'COIL' }] }
  const table = { Q2: false }
  runScan({ rungs: [main] }, table, {}, {}, 100, { fc1: [fc] })
  check('CALL FC executa bloco referenciado no mesmo PLC', table.Q2)
  table.Q2 = false
  runScan({ rungs: [{ ...main, enabled: false }] }, table, {}, {}, 100, { fc1: [fc] })
  check('FC não executa sem RLO na chamada', !table.Q2)
  runScan({ rungs: [main] }, table, {}, {}, 100, { fc1: [{ ...fc, call: { targetId: 'fc1' } }] })
  check('CALL recursivo protegido sem bloquear saída do FC', table.Q2)
}

/* DBs BOOL/INT/REAL são dados persistidos com validação, não SCL executável. */
{
  const files = [{ id: 'db-1', folder: 'dataBlocks', name: 'DB1', content: JSON.stringify({ enabled: { type: 'BOOL', value: true }, count: { type: 'INT', value: 3 }, rate: { type: 'REAL', value: 2.5 } }), createdAt: '' }] as import('../src/ladder/projectFiles').ProjectFile[]
  const { values, errors } = parseDataBlocks(files)
  check('DB JSON tipado compila três variáveis válidas', !errors.length && values['DB1.ENABLED'].value === true && values['DB1.COUNT'].type === 'INT' && values['DB1.RATE'].type === 'REAL')
  const table = { I1: false, M1: false, Q1: false }
  check('MOVE tipado copia DB BOOL para saída', moveValue('DB1.enabled', 'Q1', table, values) && table.Q1)
  check('MOVE copia literal INT para DB INT', moveValue('12', 'DB1.count', table, values) && values['DB1.COUNT'].value === 12)
  check('MOVE recusa número em saída BOOL', !moveValue('DB1.rate', 'Q1', table, values) && table.Q1)
  check('MOVE BOOL aceita 0/1 sem reescrever entrada I1', moveValue('1', 'M1', table, values) && table.M1 && !moveValue('1', 'I1', table, values))
  check('DB rejeita tipo inválido sem avaliar código', parseDataBlocks([{ ...files[0], content: '{"x":{"type":"SCRIPT","value":"alert(1)"}}' }]).errors.length === 1)
}

/* Integração DB por PLC com Ladder real e MOVE INT; sem avaliar texto. */
{
  const a = createComponent('plcCompact')
  const b = createComponent('plcCompact', undefined, undefined, 0, 320, 0)
  const program: LadderRung = { id: 'db-rung', name: 'DB', enabled: true,
    branches: [{ id: 'db-branch', elements: [{ kind: 'contact', id: 'db-contact', address: 'DB1.ENABLED', contactType: 'NO' }] }],
    coils: [{ kind: 'coil', id: 'db-q1', address: 'Q1', coilType: 'COIL' }], move: { source: '12', target: 'DB1.COUNT' } }
  const file = (enabled: boolean) => ({ id: `db-${enabled}`, folder: 'dataBlocks' as const, name: 'DB1', createdAt: '', content: JSON.stringify({ enabled: { type: 'BOOL', value: enabled }, count: { type: 'INT', value: 0 } }) })
  useSimStore.setState({ components: [a,b], wires: [], activePlcId: a.id, ladder: { rungs: [program] }, plcPrograms: { [b.id]: { rungs: [program], fc1: [], fc2: [] } },
    projectFiles: { [a.id]: [file(true)], [b.id]: [file(false)] }, runtime: { ...useSimStore.getState().runtime, plcRuntime: {} } })
  useSimStore.getState().step()
  const current = useSimStore.getState()
  check('DB BOOL alimenta contacto sem cruzar valores entre PLCs', !!current.components[0].state.outputs.Q1 && !current.components[1].state.outputs.Q1)
  check('MOVE INT escreve apenas DB do PLC onde o rung está ativo', current.runtime.plcRuntime[a.id].db['DB1.COUNT'].value === 12 && current.runtime.plcRuntime[b.id].db['DB1.COUNT'].value === 0)
}

/* Botão de emergência CAD Metaltex: conserva a ligação 1NF existente. */
{
  const emergency = createComponent('emergencyButton')
  const cad = getCommandModelSpec('emergencyButton')
  check('Botão de emergência usa a face frontal do CAD Metaltex P20AKR', cad?.path === '/models/comando/P20AKR-1.glb' && cad.rotation.every((angle) => angle === 0) && cad.flipDepth)
  check('Botão de emergência CAD mantém os dois bornes NF 21/22', emergency.terminals.some((t) => t.label === '21' && t.kind === 'aux-nc') && emergency.terminals.some((t) => t.label === '22' && t.kind === 'aux-nc'))
}

/* Phoenix Contact EC 1 12DC/1A S-R: valores e ligações confirmados na ficha. */
{
  const ecb = createComponent('phoenixEcb3000760')
  const labels = ecb.terminals.map((terminal) => terminal.label)
  const bridges = internalBridges(ecb)
  const cad = getProtectionModelSpec('phoenixEcb3000760')
  check('Phoenix 3000760 cria Line+, LOAD+, 0V, RESET e STATUS', ['Line+', 'LOAD+', '0V', 'RESET', 'STATUS'].every((label) => labels.includes(label)))
  check('Phoenix 3000760 usa o GLB oficial com orientação frontal vertical', cad?.path === '/models/protecao/phoenix-ec1-12dc-1a-s-r.glb' && cad.rotation[0] === Math.PI / 2)
  check('Phoenix 3000760 encaminha apenas Line+ para LOAD+ quando fechado', bridges.length === 1 && bridges[0][0] === `${ecb.id}-Line+` && bridges[0][1] === `${ecb.id}-LOAD+`)
  const tripped = createComponent('phoenixEcb3000760', undefined, undefined, 0, 0, 0, { tripped: true })
  check('Phoenix 3000760 interrompe a passagem quando disparado', internalBridges(tripped).length === 0)
  const open = createComponent('phoenixEcb3000760', undefined, undefined, 0, 0, 0, { closed: false })
  check('Phoenix 3000760 interrompe a passagem quando aberto', internalBridges(open).length === 0)
}

/* Novos CAD reais: domínio, continuidade e vista física permanecem sincronizados. */
{
  const expectedCad = {
    breakerWegMdwC10: '/models/protecao/weg-mdw-c10.glb',
    emergencyButtonKeyP20ACR: '/models/comando/metaltex-p20acr-r-1b.glb',
    dualPushButtonNpb22D11: '/models/comando/nhd-npb22-d11.glb',
    safetyRelay: '/models/reles/allen-bradley-msr127tp.glb',
    plcLsXbmDn32s: '/models/controladores/ls-xbm-dn32s.glb',
    siemensTsAdapterIeBasic: '/models/controladores/siemens-ts-adapter-ie-basic.glb',
    terminalPhoenixPti6: '/models/bornes-e-barras/phoenix-pti6-3213972.glb',
    terminalPE: '/models/bornes-e-barras/terminal-pe.glb',
  } as const
  check('todos os novos equipamentos têm CAD e vista física correta', Object.entries(expectedCad).every(([type, path]) => {
    const spec = getComponentModelSpec(type as import('../src/types').ComponentType)
    const panelFront = type === 'emergencyButtonKeyP20ACR' || type === 'dualPushButtonNpb22D11'
    return spec?.path === path && spec.placement === (panelFront ? 'panel-front' : 'din-rail')
  }))

  const weg = createComponent('breakerWegMdwC10')
  check('WEG MDW-C10 fecha um polo 1–2 e conserva 10 A curva C', internalBridges(weg).length === 1 && weg.state.inA === 10 && weg.state.curve === 'C')

  const pti = createComponent('terminalPhoenixPti6')
  check('Phoenix PTI 6 cria duas ligações Push-in no mesmo potencial', pti.terminals.length === 2 && pti.terminals.every((t) => t.terminalType === 'spring') && internalBridges(pti).length === 1)

  const dualIdle = createComponent('dualPushButtonNpb22D11')
  const dualStart = createComponent('dualPushButtonNpb22D11', undefined, undefined, 0, 0, 0, { startPressed: true })
  const dualStop = createComponent('dualPushButtonNpb22D11', undefined, undefined, 0, 0, 0, { stopPressed: true })
  check('NPB22-D11 separa START NA de STOP NF', internalBridges(dualIdle).some(([a, b]) => a.endsWith('-21') && b.endsWith('-22'))
    && internalBridges(dualStart).some(([a, b]) => a.endsWith('-13') && b.endsWith('-14'))
    && !internalBridges(dualStop).some(([a, b]) => a.endsWith('-21') && b.endsWith('-22')))

  const safetyOff = createComponent('safetyRelay')
  const safetyOn = createComponent('safetyRelay', undefined, undefined, 0, 0, 0, { energized: true })
  check('MSR127TP modela 3NA de segurança e 1NF auxiliar', internalBridges(safetyOff).some(([a, b]) => a.endsWith('-41') && b.endsWith('-42'))
    && ['13', '23', '33'].every((label) => internalBridges(safetyOn).some(([a]) => a.endsWith(`-${label}`))))

  const ls = createComponent('plcLsXbmDn32s')
  check('LS XBM-DN32S é PLC programável com 16DI/16DO', isProgrammablePlc(ls) && plcIoCapacity(ls).inputs === 16 && plcIoCapacity(ls).outputs === 16)
  check('TS Adapter IE é acessório e não recebe programa Ladder', !isProgrammablePlc(createComponent('siemensTsAdapterIeBasic')))

  const motor = createComponent('motor3ph')
  const motorCad = getComponentModelSpec('motor3ph')
  check('SEW DRN80MK4/B3 usa o GLB real fora da calha DIN', motorCad?.path === '/models/motores/DRN80MK4-B3.glb' && motorCad.placement === 'machine' && motorCad.rotation.every((angle) => angle === 0))
  check('motor SEW conserva U1/V1/W1/PE e dados nominais da ficha', ['U1', 'V1', 'W1', 'PE'].every((label) => motor.terminals.some((terminal) => terminal.label === label))
    && motor.state.powerKw === 0.55 && motor.state.rpm === 1435 && motor.state.frequencyHz === 50
    && motor.state.currentA === 1.29 && motor.state.torqueNm === 3.65 && motor.state.massKg === 11)

  const pilot = createComponent('pilotLightAd22')
  const secondPilot = createComponent('pilotLightAd22')
  const pilotCad = getComponentModelSpec('pilotLightAd22')
  check('AD22-22DS usa o GLB real na frente do painel', pilotCad?.path === '/models/sinalizacao/ad22-22ds-24v.glb'
    && pilotCad.placement === 'panel-front' && pilotCad.rotation[0] === Math.PI / 2)
  check('sinaleiro AD22 cria X1/X2 e dados nominais de 24 V AC/DC', ['X1', 'X2'].every((label) => pilot.terminals.some((terminal) => terminal.label === label))
    && pilot.state.model === 'AD22-22DS' && pilot.state.voltage === '24 V AC/DC' && pilot.state.mountingDiameterMm === 22)
  const pilotX1 = terminalByLabel(pilot, 'X1')!.id
  const pilotX2 = terminalByLabel(pilot, 'X2')!.id
  check('sinaleiro AD22 só acende com X1 e X2 alimentados', !isLoadPowered(pilot, new Set([pilotX1])) && isLoadPowered(pilot, new Set([pilotX1, pilotX2])))
  pilot.state.color = '#3b82f6'
  check('cor da luz é individual e não altera outra instância', pilot.state.color === '#3b82f6' && secondPilot.state.color === '#ef4444')
}

/* A Biblioteca só liberta componentes associados a um GLB real. */
{
  const availableTypes = (Object.keys(TEMPLATES) as import('../src/types').ComponentType[]).filter(hasComponent3DModel)
  check('disponibilidade 3D reconhece os 17 componentes com GLB real', availableTypes.length === 17, `tipos: ${availableTypes.join(', ')}`)
  check('renderizadores CAD dedicados também ficam disponíveis', ['plcSiemensLogo1224RC', 'powerSupplyProauto24A', 'contactorWegCWC09'].every((type) => hasComponent3DModel(type as import('../src/types').ComponentType)))
  check('componentes sem GLB permanecem bloqueados', ['motor1ph', 'contactor', 'buttonNO', 'lamp'].every((type) => !hasComponent3DModel(type as import('../src/types').ComponentType)))
  check('todos os tipos da tabela CAD genérica ficam disponíveis', availableTypes.filter((type) => !['plcSiemensLogo1224RC', 'powerSupplyProauto24A', 'contactorWegCWC09'].includes(type)).every((type) => !!getComponentModelSpec(type)))
  check('disjuntores Q2A5 e DISJUNTOR 2 mostram a face dos manípulos sem tombar o corpo', ['breaker1p', 'breaker2p'].every((type) => {
    const spec = getComponentModelSpec(type as import('../src/types').ComponentType)
    return spec?.rotation.every((angle) => angle === 0) && spec.flipDepth
  }))
  check('todos os componentes disponíveis expõem GLB para o turntable da landing', availableTypes.every((type) => getComponentGlbSpec(type)?.path.toLowerCase().endsWith('.glb')))
  check('Esquema e Painel 3D derivam escala da mesma dimensão física', availableTypes.every((type) => {
    const footprint = getSchematicPhysicalFootprint(type)
    const spec = getComponentGlbSpec(type)
    return !!footprint && !!spec
      && footprint.w === Math.round(spec.physicalSizeMm.width * 1.5)
      && footprint.h === Math.round(spec.physicalSizeMm.height * 1.5)
      && Math.abs(spec.targetHeight - spec.physicalSizeMm.height * 0.01) < 1e-9
  }))
  const directStart3DTypes = ['powerSupplyProauto24A', 'plcSiemensLogo1224RC', 'dualPushButtonNpb22D11', 'contactorWegCWC09', 'pilotLightAd22', 'motor3ph'] as const
  check('demonstração de partida direta 3D usa seis componentes com GLB real', directStart3DTypes.every((type) => hasComponent3DModel(type) && !!getComponentGlbSpec(type)))

  const beforeBlockedAdd = useSimStore.getState().components.length
  const blockedId = useSimStore.getState().addComponent('motor1ph', 0, 0)
  check('store impede inserção indireta de componente sem GLB', blockedId === null && useSimStore.getState().components.length === beforeBlockedAdd)
  useSimStore.getState().setPlacingType('motor1ph')
  useSimStore.getState().setDragType('buttonNO')
  check('estados de posicionamento e arraste não contornam o bloqueio', useSimStore.getState().placingType === null && useSimStore.getState().dragType === null)

  const pilotId = useSimStore.getState().addComponent('pilotLightAd22', 320, 180)
  if (!pilotId) throw new Error('não foi possível inserir o sinaleiro AD22 com GLB')
  useSimStore.getState().setComponentState(pilotId, { color: '#22c55e' })
  const savedPilot = JSON.parse(useSimStore.getState().saveJSON()).components.find((component: ElectricalComponent) => component.id === pilotId)
  check('cor escolhida para o AD22 persiste no projeto', savedPilot?.state.color === '#22c55e')
  useSimStore.getState().deleteComponents([pilotId])
}

/* Orientação visual por instância: isolada da lógica e persistida no projeto. */
{
  const component = createComponent('breakerWegMdwC10')
  check('nova instância recebe uma orientação visual válida', !!component.viewOrientation && isOriginalComponentOrientation(component.viewOrientation))
  check('presets cobrem vista isométrica, faces e reset original', COMPONENT_VIEW_PRESETS.isometric.x !== 0
    && COMPONENT_VIEW_PRESETS.front.y === 0 && COMPONENT_VIEW_PRESETS.back.y === 180
    && COMPONENT_VIEW_PRESETS.left.y === -90 && COMPONENT_VIEW_PRESETS.right.y === 90
    && COMPONENT_VIEW_PRESETS.top.x === -90 && COMPONENT_VIEW_PRESETS.bottom.x === 90
    && isOriginalComponentOrientation(COMPONENT_VIEW_PRESETS.original))
  check('ângulos personalizados são normalizados sem tocar em dados elétricos', normalizeComponentOrientation({ x: 370, y: -450, z: 181 }).x === 10
    && normalizeComponentOrientation({ x: 370, y: -450, z: 181 }).y === -90
    && normalizeComponentOrientation({ x: 370, y: -450, z: 181 }).z === -179)
  check('cada preset tem uma chave estável para o mapa de bornes', componentTerminalViewKey(COMPONENT_VIEW_PRESETS.front) === 'front'
    && componentTerminalViewKey(COMPONENT_VIEW_PRESETS.back) === 'back'
    && componentTerminalViewKey({ x: 12, y: 34, z: 5 }) === 'custom:12:34:5')
  const terminal = component.terminals[0]
  const frontTerminal = componentTerminalLocal(component, terminal, COMPONENT_VIEW_PRESETS.front)
  const sideTerminal = componentTerminalLocal(component, terminal, COMPONENT_VIEW_PRESETS.right)
  const isoBounds = projectedComponentBounds(component, COMPONENT_VIEW_PRESETS.isometric)
  check('rastreio automático projeta o borne quando a vista roda', Math.abs(frontTerminal.x - sideTerminal.x) > 0.1 || Math.abs(frontTerminal.y - sideTerminal.y) > 0.1)
  check('limites projetados nunca cortam o footprint original', isoBounds.w >= component.w && isoBounds.h >= component.h)
  check('rastreio automático cria uma sugestão para cada borne', Object.keys(automaticTerminalViewPositions(component, COMPONENT_VIEW_PRESETS.isometric)).length === component.terminals.length)
  const physicalDimensions = component3DDimensions(component)
  const physicalScale = component3DScaleOf(component)
  const physicalPoint = terminalLocal3D(component, terminal)
  const physicalRoundTrip = terminalPositionFromLocal3D(component, physicalPoint)
  check('geometria física 3D partilhada converte e recupera coordenadas normalizadas', physicalDimensions.x > 0 && physicalDimensions.y > 0 && physicalDimensions.z > 0
    && physicalScale.x === 1 && physicalScale.y === 1 && physicalScale.z === 1
    && Math.abs(physicalRoundTrip.x - (terminal.position3D?.x ?? terminal.x)) < 1e-9
    && Math.abs(physicalRoundTrip.y - (terminal.position3D?.y ?? 1 - terminal.y)) < 1e-9)
  const endpointComponent = { ...component, viewOrientation: { x: 0, y: 90, z: 0 }, view3DScale: { x: 2, y: 0.5, z: 1.5 } }
  const endpoint = terminalWorld3D(endpointComponent, terminal, new THREE.Vector3(3, 4, 5))
  check('endpoint físico do cabo acompanha escala, rotação e pivô da instância', Math.abs(endpoint.x - (3 + physicalDimensions.z * 0.75)) < 1e-9
    && Math.abs(endpoint.y - (4 + physicalDimensions.y * 0.5)) < 1e-9 && Math.abs(endpoint.z - 5) < 1e-9)

  const before = useSimStore.getState().components
  const beforeWires = useSimStore.getState().wires
  const physicalPeer = createComponent('breakerWegMdwC10')
  const preservedWire: Wire = { id: 'smoke-3d-editor-wire', fromTerminalId: terminal.id, toTerminalId: physicalPeer.terminals[0].id, color: 'black', gauge: '1.5mm²', kind: 'control', flexibility: 'flexible', route: 'direct', bend: 0.5, energized: false }
  useSimStore.setState({ components: [...before, component, physicalPeer], wires: [...beforeWires, preservedWire] })
  useSimStore.getState().openViewOrientationEditor(component.id)
  useSimStore.getState().setViewOrientationDraft({ x: 15, y: 35, z: -10 })
  useSimStore.getState().autoPlaceViewTerminals()
  useSimStore.getState().setViewTerminalPosition(terminal.id, { x: 0.23, y: 0.31 })
  useSimStore.getState().setViewTerminalDefinition(terminal.id, { label: 'L1-EDIT', kind: 'spring', color: '#123456' })
  useSimStore.getState().setViewTerminalDefinition(terminal.id, { position3D: { x: 0.2, y: 0.8, z: 0.95 } })
  useSimStore.getState().setView3DScale({ x: 1.25, y: 0.75, z: 1.5 })
  useSimStore.getState().setView3DRenderMode('xray')
  useSimStore.getState().setView3DBodyColor('#1d4ed8')
  useSimStore.getState().applyViewOrientationEditor(false)
  const oriented = useSimStore.getState().components.find((item) => item.id === component.id)
  const customViewKey = componentTerminalViewKey({ x: 15, y: 35, z: -10 })
  check('editor aplica orientação somente à instância selecionada', oriented?.viewOrientation?.x === 15 && oriented.viewOrientation.y === 35 && oriented.viewOrientation.z === -10
    && before.every((item, index) => useSimStore.getState().components[index].id === item.id && useSimStore.getState().components[index].viewOrientation === item.viewOrientation))
  check('posição manual do borne é guardada apenas na vista ativa', oriented?.terminalViewPositions?.[customViewKey]?.[terminal.id]?.x === 0.23
    && oriented.terminalViewPositions[customViewKey][terminal.id].y === 0.31)
  const editedTerminal = oriented?.terminals.find((item) => item.id === terminal.id)
  check('definição física do borne preserva identidade elétrica estável', editedTerminal?.id === terminal.id && editedTerminal.componentId === component.id
    && editedTerminal.label === 'L1-EDIT' && editedTerminal.kind === 'spring' && editedTerminal.color === '#123456'
    && editedTerminal.position3D?.x === 0.2 && editedTerminal.position3D.y === 0.8 && editedTerminal.position3D.z === 0.95)
  check('escala, render e cor são persistidos sem alterar o estado funcional', oriented?.view3DScale?.x === 1.25 && oriented.view3DScale.y === 0.75
    && oriented.view3DScale.z === 1.5 && oriented.view3DRenderMode === 'xray' && oriented.bodyColor === '#1d4ed8'
    && oriented.state === component.state)
  check('editar o componente preserva cabos e referências aos IDs dos bornes', useSimStore.getState().wires.some((wire) => wire.id === preservedWire.id
    && wire.fromTerminalId === terminal.id && wire.toTerminalId === physicalPeer.terminals[0].id))
  const saved = JSON.parse(useSimStore.getState().saveJSON())
  const savedOriented = saved.components.find((item: ElectricalComponent) => item.id === component.id)
  check('orientação, mapa, físico e aparência persistem no JSON do projeto', savedOriented?.viewOrientation?.y === 35
    && savedOriented?.terminalViewPositions?.[customViewKey]?.[terminal.id]?.y === 0.31
    && savedOriented?.terminals.find((item: ElectricalComponent['terminals'][number]) => item.id === terminal.id)?.position3D?.z === 0.95
    && savedOriented?.view3DScale?.z === 1.5 && savedOriented?.view3DRenderMode === 'xray' && savedOriented?.bodyColor === '#1d4ed8')
  useSimStore.getState().openViewOrientationEditor(component.id)
  useSimStore.getState().setViewOrientationDraft(COMPONENT_VIEW_PRESETS.top)
  useSimStore.getState().setViewTerminalPosition(terminal.id, { x: 0.9, y: 0.9 })
  useSimStore.getState().setViewTerminalDefinition(terminal.id, { position3D: { x: 1, y: 0, z: 0 } })
  useSimStore.getState().setView3DScale({ x: 4, y: 4, z: 4 })
  useSimStore.getState().setView3DRenderMode('wireframe')
  useSimStore.getState().setView3DBodyColor('#ef4444')
  useSimStore.getState().cancelViewOrientationEditor()
  const cancelled = useSimStore.getState().components.find((item) => item.id === component.id)
  check('Cancelar descarta orientação, bornes e aparência do rascunho', cancelled?.viewOrientation?.y === 35 && !cancelled?.terminalViewPositions?.top
    && cancelled?.terminals.find((item) => item.id === terminal.id)?.position3D?.z === 0.95
    && cancelled?.view3DScale?.x === 1.25 && cancelled?.view3DRenderMode === 'xray' && cancelled?.bodyColor === '#1d4ed8')
  const idsBeforeDuplicate = new Set(useSimStore.getState().components.map((item) => item.id))
  useSimStore.getState().duplicateComponents([component.id])
  const duplicate = useSimStore.getState().components.find((item) => !idsBeforeDuplicate.has(item.id))
  check('duplicação copia físico e aparência mas cria identidades elétricas novas', duplicate?.view3DScale?.x === 1.25
    && duplicate?.view3DRenderMode === 'xray' && duplicate?.bodyColor === '#1d4ed8'
    && duplicate.terminals[0]?.position3D?.z === cancelled?.terminals[0]?.position3D?.z
    && duplicate.terminals.every((item, index) => item.id !== cancelled?.terminals[index]?.id && item.componentId === duplicate.id))
  useSimStore.setState({ components: before, wires: beforeWires, viewOrientationEditor: null })
}

/* Padrões de tipo usam a ordem estável dos bornes, sem alterar instâncias existentes. */
{
  const memory = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value) },
    removeItem: (key: string) => { memory.delete(key) },
  } })
  const before = useSimStore.getState().components
  const source = createComponent('breakerWegMdwC10')
  const existingPeer = createComponent('breakerWegMdwC10')
  const terminal = source.terminals[0]
  useSimStore.setState({ components: [...before, source, existingPeer] })
  useSimStore.getState().openViewOrientationEditor(source.id)
  useSimStore.getState().setViewOrientationDraft(COMPONENT_VIEW_PRESETS.right)
  useSimStore.getState().setViewTerminalPosition(terminal.id, { x: 0.18, y: 0.27 })
  useSimStore.getState().setView3DScale({ x: 0.8, y: 1.1, z: 1.3 })
  useSimStore.getState().setView3DRenderMode('wireframe')
  useSimStore.getState().setView3DBodyColor('#0f766e')
  useSimStore.getState().applyViewOrientationEditor(true)
  const future = createComponent('breakerWegMdwC10')
  const futurePoint = componentTerminalLocal(future, future.terminals[0])
  check('padrão do tipo aplica orientação, bornes e aparência apenas a futuras instâncias', componentTerminalViewKey(future.viewOrientation) === 'right'
    && Math.abs(futurePoint.x / future.w - 0.18) < 1e-9 && Math.abs(futurePoint.y / future.h - 0.27) < 1e-9
    && future.view3DScale?.x === 0.8 && future.view3DScale.y === 1.1 && future.view3DScale.z === 1.3
    && future.view3DRenderMode === 'wireframe' && future.bodyColor === '#0f766e'
    && isOriginalComponentOrientation(useSimStore.getState().components.find((item) => item.id === existingPeer.id)?.viewOrientation)
    && useSimStore.getState().components.find((item) => item.id === existingPeer.id)?.view3DScale?.x === 1)
  const savedPresentation = getDefaultComponent3DPresentation('breakerWegMdwC10')
  check('padrão físico do tipo é normalizado e persistente', savedPresentation.scale.x === 0.8 && savedPresentation.scale.z === 1.3
    && savedPresentation.renderMode === 'wireframe' && savedPresentation.bodyColor === '#0f766e')
  useSimStore.setState({ components: before, viewOrientationEditor: null })
  delete (globalThis as { localStorage?: Storage }).localStorage
}

/* O histórico partilhado também cobre alterações no editor GRAFCET. */
{
  const previous = structuredClone(useSimStore.getState().grafcet)
  useSimStore.setState({ history: [], future: [] })
  const extra = { id: 'smoke-grafcet-step', name: 'Teste de histórico', initial: previous.steps.length === 0, action: '', condition: 'I1', actions: [] }
  useSimStore.getState().setGrafcet({ ...previous, steps: [...previous.steps, extra] })
  check('edição GRAFCET entra no histórico global', useSimStore.getState().history.length === 1 && useSimStore.getState().grafcet.steps.some((step) => step.id === extra.id))
  useSimStore.getState().undo()
  check('Desfazer restaura o GRAFCET anterior', !useSimStore.getState().grafcet.steps.some((step) => step.id === extra.id))
  useSimStore.getState().redo()
  check('Refazer reaplica a alteração GRAFCET', useSimStore.getState().grafcet.steps.some((step) => step.id === extra.id))

  const base = structuredClone(useSimStore.getState().grafcet)
  const first = { ...base, steps: base.steps.map((step, index) => index === 0 ? { ...step, name: 'M' } : step) }
  const second = { ...first, steps: first.steps.map((step, index) => index === 0 ? { ...step, name: 'Motor' } : step) }
  useSimStore.setState({ history: [], future: [] })
  useSimStore.getState().setGrafcet(first, 'auto', 'smoke:grafcet:nome')
  useSimStore.getState().setGrafcet(second, 'auto', 'smoke:grafcet:nome')
  check('escrita contínua no GRAFCET cria um único passo de histórico', useSimStore.getState().history.length === 1)
  useSimStore.getState().undo()
  check('Ctrl+Z no GRAFCET repõe o valor anterior à escrita agrupada', useSimStore.getState().grafcet.steps[0]?.name === base.steps[0]?.name)
  useSimStore.setState({ grafcet: previous, history: [], future: [] })
}

/* O histórico Ladder mantém a alteração visual e os dados auxiliares no mesmo passo. */
{
  const state = useSimStore.getState()
  const previous = {
    ladder: structuredClone(state.ladder), tags: structuredClone(state.tags), plcTags: structuredClone(state.plcTags),
    projectFiles: structuredClone(state.projectFiles), hiddenProjectFolders: structuredClone(state.hiddenProjectFolders),
    activePlcId: state.activePlcId, history: state.history, future: state.future,
  }
  const contact = { id: 'hist-contact', address: 'I1', contactType: 'NO' as const }
  const rungA = { id: 'hist-a', name: 'Origem', branches: [{ id: 'hist-ba', elements: [contact] }], coils: [], enabled: true }
  const rungB = { id: 'hist-b', name: 'Destino', branches: [{ id: 'hist-bb', elements: [] }], coils: [], enabled: true }
  const tag = { id: 'hist-tag', address: 'I1', name: 'Start', dataType: 'Bool' as const, comment: '' }
  useSimStore.setState({ activePlcId: null, ladder: { rungs: [rungA, rungB] }, tags: [tag], plcTags: {}, history: [], future: [] })
  useSimStore.getState().updateRung(rungA.id, (rung) => ({ ...rung, branches: [{ ...rung.branches[0], elements: [] }] }), 'force')
  useSimStore.getState().updateRung(rungB.id, (rung) => ({ ...rung, branches: [{ ...rung.branches[0], elements: [contact] }] }), 'skip')
  useSimStore.getState().updateTag(tag.id, { name: 'Start alterado' }, 'skip')
  check('mover entre networks e sincronizar tag cria um só passo de histórico', useSimStore.getState().history.length === 1)
  useSimStore.getState().undo()
  check('Ctrl+Z restaura networks e tag em conjunto', useSimStore.getState().ladder.rungs[0].branches[0].elements.length === 1
    && useSimStore.getState().ladder.rungs[1].branches[0].elements.length === 0 && useSimStore.getState().tags[0].name === 'Start')
  useSimStore.getState().redo()
  check('Ctrl+Y reaplica networks e tag em conjunto', useSimStore.getState().ladder.rungs[0].branches[0].elements.length === 0
    && useSimStore.getState().ladder.rungs[1].branches[0].elements.length === 1 && useSimStore.getState().tags[0].name === 'Start alterado')

  const plcKey = '_general'
  const file = { id: 'hist-file', folder: 'dataBlocks' as const, name: 'DB teste', content: '', createdAt: '' }
  useSimStore.setState({ projectFiles: { [plcKey]: [file] }, hiddenProjectFolders: { [plcKey]: [] }, history: [], future: [] })
  useSimStore.getState().deleteProjectFolder('dataBlocks')
  useSimStore.getState().undo()
  check('Ctrl+Z recupera pasta e conteúdo eliminados da árvore', useSimStore.getState().projectFiles[plcKey]?.[0]?.id === file.id
    && !useSimStore.getState().hiddenProjectFolders[plcKey]?.includes('dataBlocks'))
  useSimStore.getState().redo()
  check('Ctrl+Y reaplica eliminação segura da pasta', !useSimStore.getState().projectFiles[plcKey]?.length
    && useSimStore.getState().hiddenProjectFolders[plcKey]?.includes('dataBlocks'))
  useSimStore.setState(previous)
}

/* A autenticação estática aceita exatamente as duas identidades aprovadas. */
{
  const emails = fixedAccountEmails()
  const admin = await verifyFixedCredentials('ADMIN@DCSIMU.LOCAL', 'AdminDcsimu2026!')
  const user = await verifyFixedCredentials('user@dcsimu.local', 'UserDcsimu2026!')
  const wrongPassword = await verifyFixedCredentials('admin@dcsimu.local', 'senha-incorreta')
  const unknown = await verifyFixedCredentials('outra@dcsimu.local', 'AdminDcsimu2026!')
  check('allowlist local contém exatamente Admin e User', emails.length === 2
    && emails.includes('admin@dcsimu.local') && emails.includes('user@dcsimu.local'))
  check('credenciais fixas atribuem os papéis corretos', admin?.role === 'admin' && user?.role === 'user')
  check('senha incorreta e terceira conta nunca autenticam', wrongPassword === null && unknown === null)

  const memory = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, String(value)) },
    removeItem: (key: string) => { memory.delete(key) },
  } })
  const loggedIn = await localApi<{ user: { role: string } }>('/login', 'POST', { email: 'user@dcsimu.local', password: 'UserDcsimu2026!' })
  const created = await localApi<{ id: string; revision: number }>('/projects', 'POST', { name: 'Projeto local', content: { test: 1 } })
  const saved = await localApi<{ revision: number }>(`/projects/${created.id}`, 'PUT', { revision: created.revision, content: { test: 2 } })
  const reopened = await localApi<{ content: { test: number } }>(`/projects/${created.id}`)
  await localApi('/logout', 'POST')
  let sessionClosed = false
  try { await localApi('/me') } catch { sessionClosed = true }
  check('sessão local persiste a identidade e logout encerra o acesso', loggedIn.user.role === 'user' && sessionClosed)
  check('backend sem servidor cria, revê e reabre projetos', saved.revision === 1 && reopened.content.test === 2)
  let registrationBlocked = false
  try { await localApi('/register', 'POST', { email: 'outra@dcsimu.local' }) } catch { registrationBlocked = true }
  check('backend local mantém o registo desativado', registrationBlocked)
  delete (globalThis as { localStorage?: Storage }).localStorage
}

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + failures + ' TESTE(S) FALHARAM'}`)
process.exit(failures === 0 ? 0 : 1)
