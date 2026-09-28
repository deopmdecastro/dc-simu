import { scanGrafcet, emptyGrafcetRuntime, evalCondition, validCondition } from '../src/grafcet/engine'
/**
 * Teste de fumaça dos motores (executado com `npm run test`).
 * Não depende do React: exercita o motor de continuidade, o motor Ladder, o
 * motor de fases e a sonda exatamente como o store faz a cada ciclo.
 */
import { buildDirectStartScenario, buildReversalScenario, buildStarDeltaScenario, buildSequentialScenario } from '../src/simulation/scenarios'
import { computeContinuity, internalBridges, isCoilPowered, probe, sourceTerminalIds } from '../src/electrical/engine'
import { computePhaseLabels, motorDirectionFromPhases } from '../src/electrical/phases'
import { runScan } from '../src/ladder/ladderEngine'
import type { CounterTable, AddressTable, TimerTable } from '../src/ladder/ladderEngine'
import { createComponent, terminalByLabel, upgradeLogoTerminals, upgradeProauto24A } from '../src/electrical/factory'
import { logoTerminalLocal } from '../src/schematic/logoTerminalGeometry'
import { proautoTerminalLocal } from '../src/schematic/proautoTerminalGeometry'
import { connectNearWireEnds, nearestTerminal, nearestModelTerminal } from '../src/schematic/terminalSnap'
import { terminalPos } from '../src/schematic/symbols'
import { terminalConnections } from '../src/schematic/terminalConnections'
import { wireEndColor } from '../src/schematic/wireEndColor'
import { wireGeometryForWire } from '../src/schematic/wireGeometry'
import { isProgrammablePlc } from '../src/ladder/plcPrograms'
import type { LadderRung } from '../src/types'
import { useSimStore } from '../src/store/useSimStore'
import { logoElectricalInputs } from '../src/electrical/logoPower'
import { proautoInputPowered } from '../src/electrical/proautoPower'
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
  check('saídas do LOGO! estão sobre os contactos inferiores', q1.y > logo.h * 0.8 && q4.x > q1.x && q4Second.x > q4.x && q4Second.x < logo.w * 0.8)
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

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + failures + ' TESTE(S) FALHARAM'}`)
process.exit(failures === 0 ? 0 : 1)
