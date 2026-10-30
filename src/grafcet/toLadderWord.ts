import { nanoid } from 'nanoid'
import type { LadderCoilEl, LadderContact, LadderContactType, LadderRung, LadderTimer } from '../types'
import { normalizeBitAddress } from '../ladder/addresses'
import { foldText } from '../utils/text'
import { COMPARE_TOKEN, actionsOfStep, normalizeActionVariable, parseCompareToken, parseIecTimer, stepNumberOf, stripGrafcetPrefix, transitionsOf, type GrafcetProgram, type GrafcetStep } from './engine'
import { symbolWordsInCondition } from './inputDetect'
import { nextDeclaredTagAddress } from './signals'
import { parse, toDnf, type GeneratedTag, type Literal, type Node } from './toLadder'

/**
 * Método «registo de etapa»: cada sequência do GRAFCET vive numa palavra de memória (G0 = %MW0,
 * G1, G2…) que guarda o número da sua etapa ativa (−1 = sequência parada). Uma etapa inicial abre
 * uma sequência; cada ramo extra de uma divergência E abre outra, que acaba na convergência E.
 *
 * Sequência única, sem ações memorizadas (o caso habitual):
 *   FC Grafcet  : [G0 == etapa] → TON Tn (temporizações t/Xn e T(…) da etapa)
 *                 [G0 == origem] [receptividade] → MOVE destino → G0   (uma evolução por ciclo)
 *   FC Outputs  : [G0 == etapa] [condição da ação] → ( saída )
 *   OB100       : MOVE etapa inicial → G0
 *
 * Várias sequências (paralelo E, vários GRAFCET) ou ações S/R — em duas fases, como o motor GRAFCET:
 *   FC Grafcet  : TON das etapas
 *                 1) [Gx == origem]… [receptividade] [/Rec de transições anteriores em conflito] → ( Rec_Tk )
 *                 2) [Rec_Tk] → MOVE −1 → Gx (sequências que terminam numa convergência)
 *                    [Rec_Tk] → MOVE destino → Gy (uma network por etapa ativada)
 *                    [Rec_Tk] [condição] → (S)/(R) (ações memorizadas da etapa ativada; o R tem prioridade)
 *   OB100       : MOVE etapa inicial (ou −1) → cada Gx; S/R das etapas iniciais
 *
 * Uma referência Xn é a comparação [Gx == n]; uma temporização t/Xn é um TON ativado por [Gx == n].
 * `wordMethodBlocker` diz porquê um GRAFCET não cabe no método.
 */

export const WORD_REGISTER_NAME = 'G0'
export const WORD_REGISTER_COMMENT = 'Registo de etapa do GRAFCET (número da etapa ativa)'
export const WORD_FC_GRAFCET = 'Grafcet'
/** Bit «já houve uma evolução neste ciclo» (uma transposição por scan). */
export const WORD_EVOLVED_NAME = 'Evolucao_G0'
export const WORD_EVOLVED_COMMENT = 'Evolução do GRAFCET neste ciclo (uma transposição por scan)'
export const WORD_FC_OUTPUTS = 'Outputs'
/** Valor de um registo cuja sequência não tem etapa ativa. */
export const WORD_IDLE = '-1'
/** Nome do registo da sequência `lane` (G0, G1…). */
export const wordRegisterName = (lane: number) => `G${lane}`
const MAX_LANES = 16

export interface WordLadder {
  /** Registo da primeira sequência (G0). */
  word: string
  /** Registos de todas as sequências (G0, G1…), pela ordem. */
  words: string[]
  grafcetRungs: LadderRung[]
  outputRungs: LadderRung[]
  startupRungs: LadderRung[]
  /** Só as variáveis novas (registo, entradas e saídas ainda sem tag). */
  tags: GeneratedTag[]
  warnings: string[]
}

export interface WordLadderOptions {
  /** Endereços já usados noutras networks. */
  reserved?: Iterable<string>
  /** Tags já declaradas: nomes simbólicos (Start, L_Verde…) mantêm o endereço que já têm. */
  tags?: Array<{ address: string; name: string }>
  name?: string
}

const isInitialStep = (s: GrafcetStep) => s.initial || s.stepType === 'initial' || s.stepType === 'initial-enclosing'
const actionTarget = (a: { address?: string; variable?: string }) => normalizeActionVariable(a.address || a.variable || '').trim().replace(/[+-]$/, '')
const kindOf = (a: { kind?: string }) => a.kind ?? 'N'
/** Ações contínuas (N; C é a N condicional) e memorizadas (S/R) — as que o registo de etapa converte. */
const CONTINUOUS = new Set(['N', 'C'])
const STORED = new Set(['S', 'R'])
/** Primeiro motivo devolvido por `test` na árvore (ou `null`). */
const findIssue = (n: Node, test: (n: Node) => string | null): string | null => test(n) ?? ((n.t === 'and' || n.t === 'or') ? findIssue(n.a, test) ?? findIssue(n.b, test) : n.t === 'not' ? findIssue(n.a, test) : null)
/** Número da etapa referida numa temporização IEC (t/X2 → «2»). */
const iecStepNumber = (key: string) => { const step = parseIecTimer(key)?.step; return step && /^\d{1,5}$/.test(step) ? String(Number(step)) : null }

/**
 * Sequência (registo) de cada etapa: cada etapa inicial abre uma; numa divergência E o 1.º ramo
 * continua a sequência da origem e os outros abrem sequências novas; numa convergência E a etapa
 * seguinte fica na sequência da 1.ª origem. Etapas sem caminho a partir de uma inicial ficam numa
 * sequência própria, parada no arranque.
 */
export function stepLanes(program: GrafcetProgram): { laneOf: Map<string, number>; count: number; issue: string | null } {
  const steps = program.steps
  const transitions = transitionsOf(program)
  const laneOf = new Map<string, number>()
  let count = 0
  const queue: string[] = []
  const open = (id: string) => { laneOf.set(id, count++); queue.push(id) }
  for (const seed of [...steps.filter(isInitialStep), ...steps.filter((s) => !isInitialStep(s))]) {
    if (laneOf.has(seed.id)) continue
    open(seed.id)
    while (queue.length) {
      const id = queue.shift()!
      for (const t of transitions) {
        if (!t.from.includes(id) || !t.from.every((from) => laneOf.has(from))) continue
        const base = laneOf.get(t.from[0])!
        t.to.forEach((to, index) => {
          if (laneOf.has(to)) return
          if (index === 0) { laneOf.set(to, base); queue.push(to) }
          else open(to)
        })
      }
    }
  }
  const distinct = (ids: string[]) => new Set(ids.map((id) => laneOf.get(id))).size === ids.length
  let issue: string | null = null
  if (count > MAX_LANES) issue = `há mais de ${MAX_LANES} sequências em paralelo`
  else if (!distinct(steps.filter(isInitialStep).map((s) => s.id))) issue = 'duas etapas iniciais ficam na mesma sequência (uma é alcançável a partir da outra)'
  else for (const t of transitions) {
    if (!distinct(t.to) || !distinct(t.from)) { issue = 'etapas em paralelo partilham a mesma sequência (estrutura de divergências/convergências não suportada)'; break }
  }
  return { laneOf, count, issue }
}

/** `null` se o GRAFCET cabe no método do registo de etapa; senão, o motivo (texto curto para o aviso). */
export function wordMethodBlocker(program: GrafcetProgram): string | null {
  const steps = program.steps
  if (!steps.length) return 'não há etapas'
  const numbers = steps.map((s, i) => stepNumberOf(s, i))
  if (numbers.some((n) => !/^\d{1,5}$/.test(n))) return 'os números das etapas têm de ser inteiros (ex.: 1, 5, 12)'
  if (new Set(numbers.map((v) => String(Number(v)))).size !== numbers.length) return 'há números de etapa repetidos'
  if (!steps.some(isInitialStep)) return 'não há etapa inicial'
  const ids = new Set(steps.map((s) => s.id))
  const stepNumbers = new Set(numbers.map((v) => String(Number(v))))
  // Xn → [Gx == n]; t/Xn → TON ativado por [Gx == n]. Só ficam de fora referências a etapas inexistentes e t1/Xn/t2.
  const unsupported = (n: Node): string | null => {
    if (n.t === 'step') return stepNumbers.has(String(n.index)) ? null : `a referência X${n.index} não corresponde a nenhuma etapa`
    if (n.t === 'timer' && n.key) {
      const iec = parseIecTimer(n.key)
      if (!iec) return `a temporização «${n.key}» não é convertível`
      if (iec.d2 !== null) return `a temporização «${n.key}» tem dois tempos (t1/Xn/t2)`
      const step = iecStepNumber(n.key)
      if (iec.step && (!step || !stepNumbers.has(step))) return `a temporização «${n.key}» refere uma etapa inexistente`
    }
    return null
  }
  for (const t of transitionsOf(program)) {
    // Transição-fonte (source): sem origem, sempre validada — só a receptividade decide.
    if ((!t.from.length && !t.source) || !t.to.length || !t.from.every((id) => ids.has(id)) || !t.to.every((id) => ids.has(id))) return 'há transições sem etapa de origem ou destino'
    const tree = parse(t.condition || '1')
    if (!tree) return `a receptividade «${t.condition}» não é convertível`
    const issue = findIssue(tree, unsupported)
    if (issue) return issue
  }
  for (const s of steps) for (const a of actionsOfStep(s)) {
    const kind = kindOf(a)
    if (!CONTINUOUS.has(kind) && !STORED.has(kind)) return `há ações ${kind} (temporizadas ou de impulso): use os bits de etapa`
    if (!actionTarget(a)) continue
    const tree = parse(a.condition || '1')
    if (!tree) return `a condição «${a.condition}» de uma ação não é convertível`
    const issue = findIssue(tree, unsupported)
    if (issue) return issue
  }
  return stepLanes(program).issue
}

export function grafcetToLadderWord(program: GrafcetProgram, options: WordLadderOptions = {}): WordLadder {
  if (program.importReview) throw new Error('Conclua a revisão do desenho importado antes de gerar Ladder.')
  const warnings: string[] = []
  const label = (options.name ?? program.name ?? '').trim()
  const withName = (text: string) => (label ? `${label}: ${text}` : text)
  const steps = program.steps
  const transitions = transitionsOf(program)
  const numberOf = new Map(steps.map((s, i) => [s.id, String(Number(stepNumberOf(s, i)))]))
  const known = options.tags ?? []
  const { laneOf, count: laneCount } = stepLanes(program)
  const laneOfNumber = new Map(steps.map((s) => [numberOf.get(s.id)!, laneOf.get(s.id) ?? 0]))
  const hasStored = steps.some((s) => actionsOfStep(s).some((a) => STORED.has(kindOf(a)) && actionTarget(a)))
  // Caso habitual: uma sequência, transições simples e só ações contínuas.
  const simple = laneCount <= 1 && !hasStored && transitions.every((t) => t.from.length === 1 && t.to.length === 1)

  // ── Endereços ocupados e registos de etapa ───────────────────────────────────
  const used = new Set<string>([...(options.reserved ?? []), ...known.map((t) => t.address)].map((a) => (normalizeBitAddress(a) ?? a.trim().toUpperCase().replace(/^%/, ''))))
  const compareWords = new Set<string>()
  const scanCompare = (text: string) => {
    for (const token of stripGrafcetPrefix(text).toUpperCase().match(new RegExp(COMPARE_TOKEN, 'g')) ?? []) {
      const c = parseCompareToken(token)
      if (!c) continue
      for (const operand of [c.left, c.right]) { if (/^MW\d+$/.test(operand)) { compareWords.add(operand); used.add(operand) } else if (/^[TC]\d+$/.test(operand)) used.add(operand) }
    }
  }
  transitions.forEach((t) => scanCompare(t.condition))
  steps.forEach((s) => actionsOfStep(s).forEach((a) => scanCompare(a.condition || '')))

  const tags: GeneratedTag[] = []
  const tag = (address: string, name: string, comment: string) => { if (!tags.some((t) => t.address === address)) tags.push({ address, name, comment }) }
  const words: string[] = []
  for (let lane = 0; lane < Math.max(laneCount, 1); lane++) {
    const name = wordRegisterName(lane)
    const existing = known.find((t) => foldText(t.name.trim()) === foldText(name) && /^MW\d+$/i.test(t.address.trim().replace(/^%/, '')))
    let address = existing ? existing.address.trim().replace(/^%/, '').toUpperCase() : ''
    if (!address || words.includes(address)) { let n = 0; while (used.has(`MW${n}`)) n++; address = `MW${n}` }
    used.add(address)
    words.push(address)
    if (!existing) tag(address, name, WORD_REGISTER_COMMENT)
  }
  const word = words[0]
  const wordOfNumber = (value: string) => words[laneOfNumber.get(value) ?? 0]

  // ── Variáveis simbólicas (Start, Stop_NC, L_Verde…) → endereços ──────────────
  // Stop_NC / Stop_NF é o mesmo sinal que Stop (o tipo NC é uma propriedade do botão no painel de E/S).
  const byName = new Map<string, string>()
  for (const t of known) { const a = normalizeBitAddress(t.address); if (a && t.name.trim()) byName.set(foldText(t.name.trim()), a) }
  const claimed = [...used].map((address) => ({ address }))
  const original = new Map<string, string>() // MAIÚSCULAS → grafia original
  const noteWords = (text: string) => symbolWordsInCondition(text).forEach((w) => { if (!original.has(w.toUpperCase())) original.set(w.toUpperCase(), w) })
  transitions.forEach((t) => noteWords(t.condition))
  steps.forEach((s) => actionsOfStep(s).forEach((a) => noteWords(a.condition || '')))
  const wherever = new Map<string, Set<string>>()
  const mark = (address: string, where: string) => wherever.set(address, new Set([...(wherever.get(address) ?? []), where]))
  const resolve = (token: string, area: 'I' | 'Q', where: string): string => {
    const upper = token.toUpperCase()
    const bit = normalizeBitAddress(upper)
    if (bit && /^[IQM]\d{1,4}(?:\.[0-7])?$/.test(upper)) { mark(bit, where); return bit }
    if (/^(?:MW\d+|[TC]\d+)$/.test(upper)) return upper
    const shown = original.get(upper) ?? token
    const base = shown.replace(/_(?:NC|NF)$/i, '')
    const hit = byName.get(foldText(shown)) ?? byName.get(foldText(base))
    if (hit) { mark(hit, where); return hit }
    const address = nextDeclaredTagAddress(area, claimed)
    if (!address) { warnings.push(`Sem endereços ${area} livres para «${base}».`); return `${area}0.0` }
    claimed.push({ address })
    used.add(address)
    const name = base || shown
    byName.set(foldText(name), address)
    byName.set(foldText(shown), address)
    mark(address, where)
    tag(address, name, '')
    return address
  }
  /** Bit de memória gerado (formato M<n>, como o método dos bits de etapa). */
  const allocBit = (name: string, comment: string): string => {
    for (let n = 1; n <= 99; n++) {
      const bit = normalizeBitAddress(`M${n}`)!
      if (used.has(bit)) continue
      used.add(bit)
      tag(`M${n}`, name, comment)
      return `M${n}`
    }
    warnings.push(`Sem memórias M livres para «${name}».`)
    return ''
  }

  // ── Construção das networks ──────────────────────────────────────────────────
  const contact = (address: string, contactType: LadderContactType = 'NO'): LadderContact => ({ kind: 'contact', id: nanoid(6), address, contactType })
  const stateNumberIs = (value: string, op: '==' | '<>' = '=='): LadderContact => ({ ...contact(wordOfNumber(value), 'CMP'), compareOp: op, compareType: 'Int', compareValue: value })
  const stateIs = (stepId: string): LadderContact => stateNumberIs(numberOf.get(stepId) ?? '0')
  const coil = (address: string, coilType: LadderCoilEl['coilType'] = 'COIL'): LadderCoilEl => ({ kind: 'coil', id: nanoid(6), address, coilType })
  const stepMarker = /^__X(\d+)$/
  const contactsOf = (lits: Literal[], area: 'I' | 'Q', where: string): LadderContact[] => lits.map((l): LadderContact => stepMarker.test(l.address)
    ? stateNumberIs(l.address.replace(stepMarker, '$1'), l.neg ? '<>' : '==')
    : l.cmp
    ? { ...contact(l.address, 'CMP'), compareOp: l.cmp.op, compareType: /\./.test(l.address + l.cmp.right) ? 'Real' : 'Int', compareValue: l.cmp.right }
    : contact(resolve(l.address, area, where), l.edge === 'R' ? (l.neg ? 'FALLING' : 'RISING') : l.edge === 'F' ? (l.neg ? 'RISING' : 'FALLING') : l.neg ? 'NC' : 'NO'))
  const rung = (name: string, branches: LadderContact[][], extra: Partial<LadderRung> = {}): LadderRung =>
    ({ id: nanoid(6), name, branches: (branches.length ? branches : [[]]).map((elements) => ({ id: nanoid(6), elements })), coils: [], enabled: true, ...extra })
  // Temporizações: um TON por etapa e duração, ativado pelo registo [Gx == etapa]; o contacto Tn entra na condição.
  const timerRungs: LadderRung[] = []
  const timerOf = new Map<string, string>()
  let timerNames = 0
  const freeTimer = (): string | null => {
    let k = 0
    while (used.has(`T${k}`)) k++
    if (k > 99) { warnings.push('Sem temporizadores T livres.'); return null }
    used.add(`T${k}`)
    return `T${k}`
  }
  const timerFor = (stepNumber: string, ms: number): string | null => {
    const key = `${stepNumber}|${ms}`
    const existing = timerOf.get(key)
    if (existing) return existing
    const address = freeTimer()
    if (!address) return null
    timerOf.set(key, address)
    tag(address, `Temp_T${++timerNames}`, `Temporização ${ms / 1000} s da etapa ${stepNumber}`)
    const ton: LadderTimer = { kind: 'timer', id: nanoid(6), address, timerType: 'TON', presetMs: Math.max(ms, 1) }
    timerRungs.push(rung(`Temporização X${stepNumber} (${ms / 1000} s)`, [[stateNumberIs(stepNumber)]], { timer: ton, comment: withName(`${address} conta ${ms / 1000} s enquanto a etapa ${stepNumber} está ativa`) }))
    return address
  }
  // Intermitência (1HZ…): oscilador de dois TON de meio período — [/Tb] → TON Ta; [Ta] → TON Tb. Ta é o relógio.
  const clockOf = new Map<number, string>()
  const clockFor = (hz: number): string | null => {
    const existing = clockOf.get(hz)
    if (existing) return existing
    const half = Math.max(Math.round(500 / hz), 1)
    const on = freeTimer()
    const off = on && freeTimer()
    if (!on || !off) return null
    clockOf.set(hz, on)
    tag(on, `Temp_T${++timerNames}`, `Temporização ${half / 1000} s: relógio ${hz} Hz (meio período ligado)`)
    tag(off, `Temp_T${++timerNames}`, `Temporização ${half / 1000} s: relógio ${hz} Hz (meio período desligado)`)
    timerRungs.push(
      rung(`Relógio ${hz} Hz · ${on}`, [[contact(off, 'NC')]], { timer: { kind: 'timer', id: nanoid(6), address: on, timerType: 'TON', presetMs: half }, comment: withName(`${on} fecha a cada ${half / 1000} s — usado como intermitência ${hz} Hz`) }),
      rung(`Relógio ${hz} Hz · ${off}`, [[contact(on)]], { timer: { kind: 'timer', id: nanoid(6), address: off, timerType: 'TON', presetMs: half }, comment: withName(`${off} repõe ${on} ao fim de ${half / 1000} s`) }),
    )
    return on
  }
  /** Xn → marcador da comparação [Gx == n]; t/Xn ou T(…) → contacto do TON da etapa (a da ação/transição por omissão); 1HZ → relógio. */
  const resolverFor = (stepId: string) => (n: Node): string | null => {
    if (n.t === 'step') return `__X${n.index}`
    if (n.t === 'freq') return clockFor(n.hz)
    if (n.t === 'timer') { const owner = (n.key && iecStepNumber(n.key)) || numberOf.get(stepId); return owner ? timerFor(owner, n.ms) : null }
    return null
  }
  /** Condição → ramos paralelos, cada um a começar por `prefix()` (contactos novos por ramo). `null` = não convertida. */
  const branchesFor = (condition: string, stepId: string, where: string, prefix: () => LadderContact[] = () => [stateIs(stepId)]): LadderContact[][] | null => {
    const tree = parse(condition || '1')
    const dnf = tree && toDnf(tree, false, resolverFor(stepId))
    if (!dnf) { warnings.push(`${where}: condição «${condition}» não convertida (inválida ou demasiado complexa).`); return null }
    return dnf.map((lits) => [...prefix(), ...contactsOf(lits, 'I', where)])
  }
  const stepsText = (ids: string[]) => ids.map((id) => numberOf.get(id)).join('+')

  // ── Ações: contínuas (FC Outputs) e memorizadas (S/R na ativação da etapa) ────
  type Act = { step: GrafcetStep; condition: string; raw: string; kind: string }
  const byOutput = new Map<string, Act[]>()
  steps.forEach((s) => actionsOfStep(s).forEach((a) => {
    const target = actionTarget(a)
    if (!target) return
    const key = foldText(target)
    byOutput.set(key, [...(byOutput.get(key) ?? []), { step: s, condition: a.condition || '1', raw: target, kind: kindOf(a) }])
  }))
  /** Saídas com S/R: endereço onde o valor memorizado é escrito (a própria saída, ou uma memória se também tiver N). */
  const storedTarget = new Map<string, string>()

  // ── FC Grafcet ──────────────────────────────────────────────────────────────
  /** Montado no fim: os TON/relógios pedidos pelas saídas também entram no FC Grafcet. */
  let grafcetRungs: () => LadderRung[]
  const storedSetRungs: LadderRung[] = []
  const storedResetRungs: LadderRung[] = []
  for (const [key, list] of byOutput) {
    if (!list.some((x) => STORED.has(x.kind))) continue
    const address = resolve(list[0].raw, 'Q', '')
    storedTarget.set(key, list.some((x) => CONTINUOUS.has(x.kind)) ? allocBit(`Mem_${list[0].raw}`.slice(0, 24), `Valor memorizado (S/R) de ${list[0].raw}`) || address : address)
  }

  if (simple) {
    // Uma só evolução por ciclo, como o motor GRAFCET: sem isto, depois do MOVE de T1 a network de T2
    // já via a etapa nova e avançava no mesmo scan. O bit é reposto no início do FC Grafcet.
    let evolved = ''
    for (let n = 1; n <= 99 && !evolved; n++) { const bit = normalizeBitAddress(`M${n}`)!; if (!used.has(bit)) { used.add(bit); evolved = `M${n}` } }
    if (!evolved) warnings.push('Sem memórias M livres para limitar a uma evolução por ciclo.')
    else tag(evolved, WORD_EVOLVED_NAME, WORD_EVOLVED_COMMENT)
    const evolvedRungs = evolved && transitions.length
      ? [rung('Ciclo: repor evolução', [[]], { coils: [coil(evolved, 'RESET')], comment: withName(`${evolved} = 0: ainda não houve evolução neste ciclo`) })]
      : []
    const transitionRungs = transitions.map((t, k) => {
      const where = `T${k + 1}`
      const raw = branchesFor(t.condition, t.from[0], where)
      const branches = raw && evolved ? raw.map((b) => [...b, contact(evolved, 'NC')]) : raw
      return rung(`T${k + 1}: ${numberOf.get(t.from[0])} → ${numberOf.get(t.to[0])}`, branches ?? [[stateIs(t.from[0])]], {
        ...(evolved ? { coils: [coil(evolved, 'SET')] } : {}),
        move: { source: numberOf.get(t.to[0]) ?? '0', target: word },
        comment: withName(`Receptividade: ${t.condition || '1'}`),
        enabled: !!branches && branches.length > 0,
      })
    })
    // Os TON correm antes das transições (o FC Outputs é chamado depois do FC Grafcet).
    grafcetRungs = () => [...evolvedRungs, ...timerRungs, ...transitionRungs]
  } else {
    // 1) Receptividades: todas sobre o estado do início do ciclo; uma origem já consumida por uma
    //    transição anterior bloqueia as seguintes (seleção OU), como no motor GRAFCET.
    const rec = transitions.map((_, k) => allocBit(`Rec_T${k + 1}`, `Receptividade T${k + 1} (transpõe neste ciclo)`))
    const receptivity = transitions.map((t, k) => {
      const where = `T${k + 1}`
      const guards = () => transitions.slice(0, k).map((other, j) => ({ other, j })).filter(({ other }) => other.from.some((id) => t.from.includes(id))).map(({ j }) => contact(rec[j], 'NC'))
      const branches = branchesFor(t.condition, t.from[0], where, () => [...t.from.map(stateIs), ...guards()])
      return rung(`T${k + 1}: ${stepsText(t.from)} → ${stepsText(t.to)}`, branches ?? [t.from.map(stateIs)], {
        coils: [coil(rec[k])], comment: withName(`Receptividade: ${t.condition || '1'}`), enabled: !!branches && branches.length > 0,
      })
    })
    // 2) Evolução: primeiro param as sequências que terminam (convergência E), depois ativam-se as etapas.
    const idleRungs: LadderRung[] = []
    const activateRungs: LadderRung[] = []
    transitions.forEach((t, k) => {
      const targetLanes = new Set(t.to.map((id) => laneOf.get(id)))
      for (const lane of new Set(t.from.map((id) => laneOf.get(id) ?? 0))) {
        if (targetLanes.has(lane)) continue
        idleRungs.push(rung(`T${k + 1}: ${wordRegisterName(lane)} parado`, [[contact(rec[k])]], { move: { source: WORD_IDLE, target: words[lane] }, comment: withName(`A sequência ${wordRegisterName(lane)} termina na convergência de T${k + 1}`) }))
      }
      for (const id of t.to) {
        const lane = laneOf.get(id) ?? 0
        activateRungs.push(rung(`T${k + 1}: ativa X${numberOf.get(id)}`, [[contact(rec[k])]], { move: { source: numberOf.get(id) ?? '0', target: words[lane] }, comment: withName(`${wordRegisterName(lane)} = ${numberOf.get(id)}`) }))
      }
    })
    // Ações memorizadas: só no ciclo em que a etapa é ativada; o RESET vem depois (tem prioridade).
    for (const [key, list] of byOutput) {
      const target = storedTarget.get(key)
      if (!target) continue
      for (const x of list) {
        if (!STORED.has(x.kind)) continue
        const where = `Ação ${x.kind} ${x.raw} (etapa ${numberOf.get(x.step.id)})`
        const branches = transitions.flatMap((t, k) => t.to.includes(x.step.id) ? branchesFor(x.condition, x.step.id, where, () => [contact(rec[k])]) ?? [] : [])
        if (!branches.length) continue
        ;(x.kind === 'S' ? storedSetRungs : storedResetRungs).push(rung(`${x.kind} ${x.raw} (X${numberOf.get(x.step.id)})`, branches, { coils: [coil(target, x.kind === 'S' ? 'SET' : 'RESET')], comment: withName(`${x.kind === 'S' ? 'Memoriza' : 'Repõe'} ${x.raw} ao ativar a etapa ${numberOf.get(x.step.id)}`) }))
      }
    }
    grafcetRungs = () => [...timerRungs, ...receptivity, ...idleRungs, ...activateRungs, ...storedSetRungs, ...storedResetRungs]
  }

  // ── FC Outputs: uma network por saída; várias etapas/ações na mesma saída → ramos em paralelo ──
  const outputRungs: LadderRung[] = []
  for (const [key, list] of byOutput) {
    const raw = list[0].raw
    const continuous = list.filter((x) => CONTINUOUS.has(x.kind))
    const stored = storedTarget.get(key)
    const address = resolve(raw, 'Q', '')
    const stepsAll = [...new Set(list.map((x) => numberOf.get(x.step.id)))].join(', ')
    // `resolve` já declarou a tag da saída sem comentário: completa-o.
    const t = tags.find((tg) => tg.address === address)
    if (t) t.comment = `Saída do GRAFCET — etapa${list.length > 1 ? 's' : ''} ${stepsAll}`
    if (!continuous.length) continue // só S/R: escrita diretamente no FC Grafcet
    const branches = continuous.flatMap((x) => branchesFor(x.condition, x.step.id, `Ação ${raw} (etapa ${numberOf.get(x.step.id)})`) ?? [])
    if (stored && stored !== address) branches.push([contact(stored)])
    const stepsN = [...new Set(continuous.map((x) => numberOf.get(x.step.id)))].join(', ')
    outputRungs.push(rung(`${raw}`, branches, { coils: [coil(address)], comment: withName(`Ativa nas etapas ${stepsN}${stored && stored !== address ? ` ou memorizada em ${stored}` : ''}`), enabled: branches.length > 0 }))
  }

  // Comentários das entradas novas: onde são usadas.
  for (const t of tags) if (t.comment === '' && /^I/.test(t.address)) t.comment = `Entrada usada em ${[...(wherever.get(t.address) ?? [])].filter(Boolean).join(', ') || 'GRAFCET'}`

  // OB100: cada registo arranca na sua etapa inicial (ou parado); palavras das comparações a 0; S/R das iniciais.
  const startupRungs: LadderRung[] = []
  for (const w of [...compareWords].sort()) startupRungs.push(rung(`Complete restart · Iniciar ${w}`, [[]], { move: { source: '0', target: w }, comment: withName(`Inicia ${w} a 0 para as comparações do GRAFCET`) }))
  const initials = steps.filter(isInitialStep)
  if (!initials.length) warnings.push('Não há etapa inicial: o Ladder não arranca.')
  words.forEach((address, lane) => {
    const initial = initials.find((s) => laneOf.get(s.id) === lane)
    const value = initial ? numberOf.get(initial.id) ?? '0' : WORD_IDLE
    const name = words.length === 1 ? 'Complete restart · Etapa inicial' : `Complete restart · ${wordRegisterName(lane)} ${initial ? `= ${value}` : 'parado'}`
    startupRungs.push(rung(name, [[]], { move: { source: value, target: address }, comment: withName(initial ? `${address} = ${value} (etapa inicial do GRAFCET)` : `${address} = ${WORD_IDLE} (sequência sem etapa ativa no arranque)`) }))
  })
  for (const kind of ['S', 'R'] as const) for (const [key, list] of byOutput) {
    const target = storedTarget.get(key)
    if (!target) continue
    for (const x of list) {
      if (x.kind !== kind || !isInitialStep(x.step)) continue
      const branches = branchesFor(x.condition, x.step.id, `Ação ${kind} ${x.raw} (etapa ${numberOf.get(x.step.id)})`, () => [])
      if (branches?.length) startupRungs.push(rung(`Complete restart · ${kind} ${x.raw}`, branches, { coils: [coil(target, kind === 'S' ? 'SET' : 'RESET')], comment: withName(`Ação ${kind} da etapa inicial ${numberOf.get(x.step.id)}`) }))
    }
  }

  return { word, words, grafcetRungs: grafcetRungs(), outputRungs, startupRungs, tags, warnings }
}
