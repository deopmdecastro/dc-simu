import { scanGrafcet, emptyGrafcetRuntime, evalCondition, validCondition } from '../src/grafcet/engine'
/**
 * Teste de fumaça dos motores (executado com `npm run test`).
 * Não depende do React: exercita o motor de continuidade, o motor Ladder, o
 * motor de fases e a sonda exatamente como o store faz a cada ciclo.
 */
import { buildDirectStartScenario, buildReversalScenario, buildStarDeltaScenario, buildSequentialScenario } from '../src/simulation/scenarios'
import { computeContinuity, isCoilPowered, probe, sourceTerminalIds } from '../src/electrical/engine'
import { computePhaseLabels, motorDirectionFromPhases } from '../src/electrical/phases'
import { runScan } from '../src/ladder/ladderEngine'
import type { CounterTable, AddressTable, TimerTable } from '../src/ladder/ladderEngine'
import { createComponent, terminalByLabel } from '../src/electrical/factory'
import { logoTerminalLocal } from '../src/schematic/logoTerminalGeometry'
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
  const l = logoTerminalLocal(logo, terminalByLabel(logo, 'L+')!)
  const i8 = logoTerminalLocal(logo, terminalByLabel(logo, 'I8')!)
  const q1 = logoTerminalLocal(logo, terminalByLabel(logo, 'Q1')!)
  const q4 = logoTerminalLocal(logo, terminalByLabel(logo, 'Q4')!)
  check('bornes superiores do LOGO! estão sobre o modelo', l.y > 0 && l.y < logo.h * 0.2 && i8.x > l.x && i8.x < logo.w * 0.8)
  check('saídas do LOGO! estão sobre os contactos inferiores', q1.y > logo.h * 0.8 && q4.x > q1.x && q4.x < logo.w * 0.8)
  const edited = { ...terminalByLabel(logo, 'Q1')!, x: 0.3, y: 0.7 }
  const moved = logoTerminalLocal(logo, edited)
  check('posição personalizada de borne é respeitada', Math.abs(moved.x - logo.w * 0.3) < 0.01 && Math.abs(moved.y - logo.h * 0.7) < 0.01)
}

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + failures + ' TESTE(S) FALHARAM'}`)
process.exit(failures === 0 ? 0 : 1)
