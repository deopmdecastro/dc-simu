import assert from 'node:assert/strict'
import type { LadderBranch, LadderCoilEl, LadderContact, LadderRung, LadderTag } from '../src/types'
import { runScan, collectUsedAddresses, isValidAddress, type CounterTable, type EdgeTable, type TimerTable } from '../src/ladder/ladderEngine'
import { canonicalAddress, isLadderBitAddress, lintLadder } from '../src/ladder/ladderLint'
import { applyKind, isCoilKind, isContactKind, isCounterKind } from '../src/ladder/ladderDnd'
import { emptyGrafcetRuntime, fireTransition, scanGrafcet, GRAFCET_HISTORY_LIMIT, type GrafcetProgram } from '../src/grafcet/engine'
import { describeLadderDiff, diffRungs } from '../src/grafcet/ladderSync'
import { floorGridVisible, FLOOR_GRID_MIN_PITCH } from '../src/three/panel3DEditing'
import { TEMPLATES, upgradeRealInterfacePositions, createComponent } from '../src/electrical/factory'

// Varredura dos editores Esquema 3D / Ladder / GRAFCET (correções e blocos novos).
let checks = 0
const check = (name: string, ok: boolean) => { assert.ok(ok, name); checks++ }

const contact = (address: string, contactType: LadderContact['contactType'] = 'NO'): LadderContact => ({ kind: 'contact', id: `c-${address}-${contactType}-${checks}-${Math.random()}`, address, contactType })
const coil = (address: string, coilType: LadderCoilEl['coilType'] = 'COIL', extra: Partial<LadderCoilEl> = {}): LadderCoilEl => ({ kind: 'coil', id: `k-${address}-${Math.random()}`, address, coilType, ...extra })
const branch = (...elements: LadderContact[]): LadderBranch => ({ id: `b-${Math.random()}`, elements })
const rung = (id: string, branches: LadderBranch[], coils: LadderCoilEl[], extra: Partial<LadderRung> = {}): LadderRung => ({ id, name: `Network ${id}`, enabled: true, branches, coils, ...extra })

// ---------------------------------------------------------------- lint
{
  check('canonicalAddress: I1 (antigo) ≡ I0.0', canonicalAddress('I1') === 'I0.0')
  check('canonicalAddress: %Q0.1 → Q0.1', canonicalAddress('%q0.1') === 'Q0.1')
  check('isLadderBitAddress aceita I0.0, M1.7, T1, C2', ['I0.0', 'M1.7', 'T1', 'C2'].every(isLadderBitAddress))
  check('isLadderBitAddress recusa I0.8 e X1', !isLadderBitAddress('I0.8') && !isLadderBitAddress('X1'))
  check('isValidAddress (motor) aceita formato Siemens I0.0', isValidAddress('I0.0') && isValidAddress('Q12.7') && isValidAddress('T1'))

  const program = { rungs: [rung('r1', [branch(contact('I0.0'), contact('M0.1'))], [coil('Q0.0')])] }
  const issues = lintLadder(program)
  check('lint: endereços Siemens canónicos já não são «inválidos»', !issues.some((issue) => issue.level === 'error'))
  check('lint: M0.1 lido e nunca escrito é avisado', issues.some((issue) => issue.id === 'unwritten:M0.1'))

  const tags: LadderTag[] = [
    { id: 't1', address: 'I0.0', name: 'Start', dataType: 'Bool' },
    { id: 't2', address: 'Q0.0', name: 'Motor', dataType: 'Bool' },
    { id: 't3', address: 'Q0.5', name: 'Lampada', dataType: 'Bool' },
  ]
  const withTags = lintLadder(program, { tags })
  check('LADDER-LINT-02: M0.1 usado e não declarado na Tabela de Tags', withTags.some((issue) => issue.id === 'undeclared:M0.1' && issue.level === 'info'))
  check('LADDER-LINT-02: I0.0 declarado não gera aviso de declaração', !withTags.some((issue) => issue.id === 'undeclared:I0.0'))
  check('LADDER-LINT-02: Q0.5 declarado sem escrita é avisado', withTags.some((issue) => issue.id === 'untraced:Q0.5' && issue.message.includes('Lampada')))
  check('LADDER-LINT-02: Q0.0 escrito não gera aviso', !withTags.some((issue) => issue.id === 'untraced:Q0.0'))
  check('LADDER-LINT-02: sem Tabela de Tags não há avisos de declaração', !issues.some((issue) => issue.id.startsWith('undeclared:')))
  check('lint: alias antigo Q1 conta como escrita de Q0.0', !lintLadder({ rungs: [rung('r', [branch(contact('I0.0'))], [coil('Q1')])] }, { tags }).some((issue) => issue.id === 'untraced:Q0.0'))

  const srNoReset = lintLadder({ rungs: [rung('r', [branch(contact('I0.0'))], [coil('Q0.1', 'SR')])] })
  check('lint: SR sem entrada de reset é avisada', srNoReset.some((issue) => issue.id.endsWith(':no-reset')))
  const notOnly = lintLadder({ rungs: [rung('r', [branch(contact('', 'NOT'))], [coil('Q0.1')])] })
  check('lint: NOT sem endereço não é «inválido»', !notOnly.some((issue) => issue.level === 'error'))
  check('lint: ramo só com NOT é avisado', notOnly.some((issue) => issue.id.endsWith(':not-only')))
  const ctudNoDown = lintLadder({ rungs: [rung('r', [branch(contact('I0.0'))], [], { counter: { kind: 'counter', id: 'n', address: 'C1', counterType: 'CTUD', preset: 3 } })] })
  check('lint: CTUD sem CD é avisado', ctudNoDown.some((issue) => issue.id.endsWith(':ctud-down')))
}

// ---------------------------------------------------------------- motor Ladder
const scan = (rungs: LadderRung[], table: Record<string, boolean>, state: { timers: TimerTable; counters: CounterTable; edges: EdgeTable }) =>
  runScan({ rungs }, table, state.timers, state.counters, 100, {}, [], {}, state.edges)
const fresh = () => ({ timers: {} as TimerTable, counters: {} as CounterTable, edges: {} as EdgeTable })

{
  // NOT: inverte o RLO acumulado à esquerda.
  const rungs = [rung('not', [branch(contact('I0.0'), contact('', 'NOT'))], [coil('Q0.0')])]
  const st = fresh()
  const t: Record<string, boolean> = { 'I0.0': false, 'Q0.0': false }
  scan(rungs, t, st)
  check('NOT: I0.0=0 → Q0.0=1', t['Q0.0'] === true)
  t['I0.0'] = true; scan(rungs, t, st)
  check('NOT: I0.0=1 → Q0.0=0', t['Q0.0'] === false)

  const two = [rung('not2', [branch(contact('I0.0'), contact('', 'NOT'), contact('I0.1'))], [coil('Q0.1')])]
  const t2: Record<string, boolean> = { 'I0.0': false, 'I0.1': true, 'Q0.1': false }
  scan(two, t2, fresh())
  check('NOT a meio do ramo: !(I0.0)·I0.1 = 1', t2['Q0.1'] === true)
  check('collectUsedAddresses ignora o NOT sem operando', !collectUsedAddresses({ rungs: two }).includes(''))
}

{
  // SR (prioridade SET) e RS (prioridade RESET).
  const sr = [rung('sr', [branch(contact('I0.0'))], [coil('Q0.0', 'SR', { resetAddress: 'I0.1' })])]
  const rs = [rung('rs', [branch(contact('I0.0'))], [coil('Q0.1', 'RS', { resetAddress: 'I0.1' })])]
  const st = fresh()
  const t: Record<string, boolean> = { 'I0.0': true, 'I0.1': false, 'Q0.0': false, 'Q0.1': false }
  scan([...sr, ...rs], t, st)
  check('SR/RS: SET liga a saída', t['Q0.0'] && t['Q0.1'])
  t['I0.0'] = false; scan([...sr, ...rs], t, st)
  check('SR/RS: sem SET nem RESET a saída mantém-se', t['Q0.0'] && t['Q0.1'])
  t['I0.0'] = true; t['I0.1'] = true; scan([...sr, ...rs], t, st)
  check('SR: SET e RESET juntos → 1 (prioridade SET)', t['Q0.0'] === true)
  check('RS: SET e RESET juntos → 0 (prioridade RESET)', t['Q0.1'] === false)
  t['I0.0'] = false; scan([...sr, ...rs], t, st)
  check('SR: só RESET → 0', t['Q0.0'] === false)
  const legacy: Record<string, boolean> = { 'I0.0': true, 'I0.1': false, 'Q0.0': false }
  scan([rung('a', [branch(contact('I0.0'))], [coil('Q0.0', 'SR', { resetAddress: 'I2' })])], legacy, fresh())
  legacy['I0.0'] = false; legacy['I0.1'] = true
  scan([rung('a', [branch(contact('I0.0'))], [coil('Q0.0', 'SR', { resetAddress: 'I2' })])], legacy, fresh())
  check('SR: reset com alias antigo I2 ≡ I0.1', legacy['Q0.0'] === false)
}

{
  // CTUD: CU no RLO, CD noutro endereço, R a zero.
  const rungs = [rung('ctud', [branch(contact('I0.0'))], [], { counter: { kind: 'counter', id: 'n', address: 'C1', counterType: 'CTUD', preset: 2, downAddress: 'I0.1', resetAddress: 'I0.2' } })]
  const st = fresh()
  const t: Record<string, boolean> = { 'I0.0': false, 'I0.1': false, 'I0.2': false }
  const pulse = (address: string) => { t[address] = true; scan(rungs, t, st); t[address] = false; scan(rungs, t, st) }
  pulse('I0.0'); pulse('I0.0')
  check('CTUD: duas contagens crescentes → 2 e QU=1', st.counters.C1.count === 2 && st.counters.C1.done && t.C1 === true)
  pulse('I0.0')
  check('CTUD: não fica preso ao preset (3)', st.counters.C1.count === 3)
  pulse('I0.1'); pulse('I0.1')
  check('CTUD: duas descontagens → 1 e QU=0', st.counters.C1.count === 1 && !st.counters.C1.done)
  pulse('I0.2')
  check('CTUD: reset → 0', st.counters.C1.count === 0)
  t['I0.1'] = true; scan(rungs, t, st); scan(rungs, t, st)
  check('CTUD: CD mantido conta só uma vez (flanco)', st.counters.C1.count === -1)
}

{
  // Flanco P sem curto-circuito: com o 1.º contacto aberto, a memória P continua a seguir o operando.
  const rungs = [rung('p', [branch(contact('I0.0'), contact('I0.1', 'RISING'))], [coil('Q0.0')])]
  const st = fresh()
  const t: Record<string, boolean> = { 'I0.0': false, 'I0.1': false, 'Q0.0': false }
  scan(rungs, t, st)
  t['I0.1'] = true; scan(rungs, t, st) // flanco de I0.1 com o ramo aberto
  t['I0.0'] = true; scan(rungs, t, st) // ramo fecha, I0.1 já estava a 1 → não é flanco novo
  check('flanco P: não dispara com um flanco antigo quando o ramo volta a conduzir', t['Q0.0'] === false)
}

{
  // Paleta: os novos tipos são reconhecidos e nascem com os campos certos.
  check('paleta: NOT é contacto, SR/RS são bobinas, CTUD é contador', isContactKind('NOT') && isCoilKind('SR') && isCoilKind('RS') && isCounterKind('CTUD'))
  const base = rung('base', [branch(contact('I0.0'))], [coil('Q0.0')])
  const withNot = applyKind(base, 'NOT', { kind: 'branch', branchIndex: 0, index: 1 })
  check('paleta: NOT nasce sem endereço', withNot.rung.branches[0].elements.some((el) => el.contactType === 'NOT' && el.address === ''))
  const withSr = applyKind(base, 'SR')
  check('paleta: SR nasce com entrada de reset', withSr.rung.coils.some((c) => c.coilType === 'SR' && !!c.resetAddress))
  const withCtud = applyKind(base, 'CTUD')
  check('paleta: CTUD nasce com entrada CD', withCtud.rung.counter?.counterType === 'CTUD' && !!withCtud.rung.counter.downAddress)
  check('paleta: CTUD deixa de ser «ainda não suportado»', !/não suportado/.test(withCtud.rung.comment ?? ''))
}

// ---------------------------------------------------------------- GRAFCET
{
  // Duas etapas iniciais simultâneas: S e R da mesma saída no mesmo instante → conflito, RESET domina.
  const program: GrafcetProgram = {
    steps: [
      { id: 'a', name: '0', initial: true, stepType: 'initial', action: '', condition: '', actions: [{ id: 'a1', kind: 'S', address: 'Q0.0', condition: '' }] },
      { id: 'b', name: '10', initial: true, stepType: 'initial', action: '', condition: '', actions: [{ id: 'b1', kind: 'R', address: 'Q0.0', condition: '' }] },
      { id: 'c', name: '1', stepType: 'simple', action: '', condition: '', actions: [] },
    ],
    transitions: [{ id: 't1', from: ['a'], to: ['c'], condition: 'I0.0' }],
    comments: [],
  } as GrafcetProgram
  const table: Record<string, boolean> = { 'I0.0': false }
  let rt = scanGrafcet(program, emptyGrafcetRuntime(), table)
  check('GRAFCET-SIM-01: conflito S/R detetado em Q0.0', rt.conflicts?.length === 1 && rt.conflicts[0].address === 'Q0.0')
  check('GRAFCET-SIM-01: conflito indica as etapas SET e RESET', rt.conflicts?.[0].setBy.includes('a') === true && rt.conflicts?.[0].resetBy.includes('b') === true)
  check('GRAFCET-SIM-01: RESET domina (resultado determinístico)', table['Q0.0'] === false)
  rt = scanGrafcet(program, rt, table)
  check('GRAFCET-SIM-01: conflito só dura o instante em que acontece', (rt.conflicts ?? []).length === 0)
  check('histórico: vazio antes do primeiro disparo', (rt.history ?? []).length === 0)
  table['I0.0'] = true
  rt = scanGrafcet(program, rt, table)
  check('histórico: disparo registado com origem e destino', rt.history?.length === 1 && rt.history[0].transitionId === 't1' && rt.history[0].from[0] === 'a' && rt.history[0].to[0] === 'c' && !rt.history[0].forced)
  check('histórico: instante simulado registado', (rt.history?.[0].atMs ?? 0) > 0)

  const loop: GrafcetProgram = {
    steps: [
      { id: 's0', name: '0', initial: true, stepType: 'initial', action: '', condition: '', actions: [] },
      { id: 's1', name: '1', stepType: 'simple', action: '', condition: '', actions: [] },
    ],
    transitions: [{ id: 'go', from: ['s0'], to: ['s1'], condition: 'I0.5' }, { id: 'back', from: ['s1'], to: ['s0'], condition: '1' }],
    comments: [],
  } as GrafcetProgram
  let r2 = scanGrafcet(loop, emptyGrafcetRuntime(), { 'I0.5': false })
  const forced = fireTransition(loop, r2, 'go')
  check('forçar transição: dispara sem receptividade e fica marcada como forçada', !!forced && forced.active.includes('s1') && forced.history?.at(-1)?.forced === true)
  r2 = forced!
  for (let i = 0; i < GRAFCET_HISTORY_LIMIT * 2; i++) { r2 = scanGrafcet(loop, r2, { 'I0.5': true }) }
  check(`histórico limitado a ${GRAFCET_HISTORY_LIMIT} entradas`, (r2.history ?? []).length === GRAFCET_HISTORY_LIMIT)
}

{
  // GRAFCET-LADDER-DIFF-01
  const a = rung('x', [branch(contact('I0.0'))], [coil('Q0.0')], { name: 'GRAFCET · Etapa 1' })
  const b = rung('y', [branch(contact('I0.1'))], [coil('Q0.1')], { name: 'GRAFCET · Etapa 2' })
  const bChanged = { ...b, id: 'y2', branches: [branch(contact('I0.2'))] }
  const c = rung('z', [branch(contact('I0.3'))], [coil('Q0.2')], { name: 'GRAFCET · Etapa 3' })
  const d = diffRungs([a, b], [{ ...a, id: 'novo' }, bChanged, c])
  check('diff: ids diferentes com o mesmo conteúdo contam como sem alterações', d.unchanged === 1)
  check('diff: network alterada', d.changed.length === 1 && d.changed[0] === 'GRAFCET · Etapa 2')
  check('diff: network nova', d.added.length === 1 && d.added[0] === 'GRAFCET · Etapa 3')
  const gone = diffRungs([a, b], [a])
  check('diff: network removida', gone.removed.length === 1 && gone.removed[0] === 'GRAFCET · Etapa 2')
  const text = describeLadderDiff({ sections: [{ label: 'Main [OB 1]', diff: d }], tagsAdded: ['M0.3'], tagsRemoved: [], empty: false })
  check('diff: resumo legível em PT-EU', text.includes('1 nova(s)') && text.includes('1 alterada(s)') && text.includes('Variáveis novas: M0.3'))
  check('diff: vazio diz que nada muda', describeLadderDiff({ sections: [], tagsAdded: [], tagsRemoved: [], empty: true }).startsWith('Nada muda'))
}

// ---------------------------------------------------------------- Esquema 3D
{
  check('piso escondido na vista de frente (pitch 0°)', !floorGridVisible(0))
  check(`piso escondido abaixo de ${FLOOR_GRID_MIN_PITCH}°`, !floorGridVisible(FLOOR_GRID_MIN_PITCH - 0.5) && !floorGridVisible(-3))
  check('piso visível em vista ISO / de cima', floorGridVisible(30) && floorGridVisible(-35) && floorGridVisible(90))
  check('piso: pitch inválido não mostra a faixa', !floorGridVisible(Number.NaN))

  // 3D-DATA-01: nenhum par de bornes 2D a menos de 8 px em todos os modelos.
  const close: string[] = []
  for (const [type, template] of Object.entries(TEMPLATES)) {
    const ts = template.terminals
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
      if (Math.hypot((ts[i].x - ts[j].x) * template.w, (ts[i].y - ts[j].y) * template.h) < 8) close.push(`${type}:${ts[i].label}/${ts[j].label}`)
    }
  }
  check(`3D-DATA-01: nenhum borne 2D sobreposto (${close.join(', ') || 'ok'})`, close.length === 0)
  const s52 = TEMPLATES.safetyRelay.terminals.find((t) => t.label === 'S52')
  check('safetyRelay: S52 é entrada (io), não «power-in»', s52?.kind === 'io')
  const relay = createComponent('safetyRelay')
  const legacy = { ...relay, terminals: relay.terminals.map((t) => (t.label === 'S52' ? { ...t, x: 0.3, y: 0, kind: 'power-in' as const } : t)) }
  const migrated = upgradeRealInterfacePositions(legacy)
  const m52 = migrated.terminals.find((t) => t.label === 'S52')
  check('migração: S52 guardado em cima de S12 passa para a posição nova', !!m52 && m52.x === s52?.x && m52.y === s52?.y && m52.kind === 'io')
}

console.log(`editors-sweep: ${checks} verificações OK`)
