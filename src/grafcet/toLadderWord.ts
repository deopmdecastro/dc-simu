import { nanoid } from 'nanoid'
import type { LadderCoilEl, LadderContact, LadderContactType, LadderRung, LadderTimer } from '../types'
import { normalizeBitAddress } from '../ladder/addresses'
import { foldText } from '../utils/text'
import { COMPARE_TOKEN, actionsOfStep, normalizeActionVariable, parseCompareToken, parseIecTimer, stepNumberOf, stripGrafcetPrefix, transitionsOf, type GrafcetProgram, type GrafcetStep } from './engine'
import { symbolWordsInCondition } from './inputDetect'
import { nextDeclaredTagAddress } from './signals'
import { parse, toDnf, type GeneratedTag, type Literal, type Node } from './toLadder'

/**
 * Método «registo de etapa»: o GRAFCET inteiro vive numa palavra de memória (G0 = %MW0) que guarda
 * o número da etapa ativa. Cada transição é um MOVE do número da etapa seguinte, cada saída é uma
 * comparação do registo com o número das etapas onde está ativa:
 *
 *   FC Grafcet  : [G0 == etapa] → TON Tn (temporizações t/Xn e T(…) da etapa)
 *                 [G0 == origem] [receptividade] → MOVE destino → G0
 *   FC Outputs  : [G0 == etapa] [condição da ação] → ( saída )
 *   OB100       : MOVE etapa inicial → G0
 *   OB1 (Main)  : CALL Grafcet; CALL Outputs
 *
 * Uma referência Xn é a comparação [G0 == n]; uma temporização t/Xn é um TON ativado por [G0 == n].
 * Só serve sequências simples (uma etapa ativa de cada vez); `wordMethodBlocker` diz porquê não.
 */

export const WORD_REGISTER_NAME = 'G0'
export const WORD_REGISTER_COMMENT = 'Registo de etapa do GRAFCET (número da etapa ativa)'
export const WORD_FC_GRAFCET = 'Grafcet'
/** Bit «já houve uma evolução neste ciclo» (uma transposição por scan). */
export const WORD_EVOLVED_NAME = 'Evolucao_G0'
export const WORD_EVOLVED_COMMENT = 'Evolução do GRAFCET neste ciclo (uma transposição por scan)'
export const WORD_FC_OUTPUTS = 'Outputs'

export interface WordLadder {
  word: string
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
/** Primeiro motivo devolvido por `test` na árvore (ou `null`). */
const findIssue = (n: Node, test: (n: Node) => string | null): string | null => test(n) ?? ((n.t === 'and' || n.t === 'or') ? findIssue(n.a, test) ?? findIssue(n.b, test) : n.t === 'not' ? findIssue(n.a, test) : null)
/** Número da etapa referida numa temporização IEC (t/X2 → «2»). */
const iecStepNumber = (key: string) => { const step = parseIecTimer(key)?.step; return step && /^\d{1,5}$/.test(step) ? String(Number(step)) : null }

/** `null` se o GRAFCET cabe no método do registo de etapa; senão, o motivo (texto curto para o aviso). */
export function wordMethodBlocker(program: GrafcetProgram): string | null {
  const steps = program.steps
  if (!steps.length) return 'não há etapas'
  const numbers = steps.map((s, i) => stepNumberOf(s, i))
  if (numbers.some((n) => !/^\d{1,5}$/.test(n))) return 'os números das etapas têm de ser inteiros (ex.: 1, 5, 12)'
  if (new Set(numbers).size !== numbers.length) return 'há números de etapa repetidos'
  if (steps.filter(isInitialStep).length !== 1) return 'é preciso exatamente uma etapa inicial'
  const ids = new Set(steps.map((s) => s.id))
  const stepNumbers = new Set(numbers.map((v) => String(Number(v))))
  // Xn → [G0 == n]; t/Xn → TON ativado por [G0 == n]. Só ficam de fora referências a etapas inexistentes e t1/Xn/t2.
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
    if (t.from.length !== 1 || t.to.length !== 1) return 'há divergências ou convergências (etapas em paralelo)'
    if (!ids.has(t.from[0]) || !ids.has(t.to[0])) return 'há transições sem etapa de origem ou destino'
    const tree = parse(t.condition || '1')
    if (!tree) return `a receptividade «${t.condition}» não é convertível`
    const issue = findIssue(tree, unsupported)
    if (issue) return issue
  }
  for (const s of steps) for (const a of actionsOfStep(s)) {
    if ((a.kind ?? 'N') !== 'N') return 'há ações memorizadas ou temporizadas (S/R/D/L)'
    if (!actionTarget(a)) continue
    const tree = parse(a.condition || '1')
    if (!tree) return `a condição «${a.condition}» de uma ação não é convertível`
    const issue = findIssue(tree, unsupported)
    if (issue) return issue
  }
  return null
}

export function grafcetToLadderWord(program: GrafcetProgram, options: WordLadderOptions = {}): WordLadder {
  const warnings: string[] = []
  const label = (options.name ?? program.name ?? '').trim()
  const withName = (text: string) => (label ? `${label}: ${text}` : text)
  const steps = program.steps
  const transitions = transitionsOf(program)
  const numberOf = new Map(steps.map((s, i) => [s.id, String(Number(stepNumberOf(s, i)))]))
  const known = options.tags ?? []

  // ── Endereços ocupados e registo de etapa ────────────────────────────────────
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

  const existingWord = known.find((t) => foldText(t.name.trim()) === foldText(WORD_REGISTER_NAME) && /^MW\d+$/i.test(t.address.trim().replace(/^%/, '')))
  let word = existingWord ? existingWord.address.trim().replace(/^%/, '').toUpperCase() : ''
  if (!word) { let n = 0; while (used.has(`MW${n}`)) n++; word = `MW${n}` }
  used.add(word)

  const tags: GeneratedTag[] = []
  const tag = (address: string, name: string, comment: string) => { if (!tags.some((t) => t.address === address)) tags.push({ address, name, comment }) }
  if (!existingWord) tag(word, WORD_REGISTER_NAME, WORD_REGISTER_COMMENT)

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

  // ── Construção das networks ──────────────────────────────────────────────────
  const contact = (address: string, contactType: LadderContactType = 'NO'): LadderContact => ({ kind: 'contact', id: nanoid(6), address, contactType })
  const stateNumberIs = (value: string): LadderContact => ({ ...contact(word, 'CMP'), compareOp: '==', compareType: 'Int', compareValue: value })
  const stateIs = (stepId: string): LadderContact => stateNumberIs(numberOf.get(stepId) ?? '0')
  const coil = (address: string): LadderCoilEl => ({ kind: 'coil', id: nanoid(6), address, coilType: 'COIL' })
  const stepMarker = /^__X(\d+)$/
  const contactsOf = (lits: Literal[], area: 'I' | 'Q', where: string): LadderContact[] => lits.map((l): LadderContact => stepMarker.test(l.address)
    ? { ...contact(word, 'CMP'), compareOp: l.neg ? '<>' : '==', compareType: 'Int', compareValue: l.address.replace(stepMarker, '$1') }
    : l.cmp
    ? { ...contact(l.address, 'CMP'), compareOp: l.cmp.op, compareType: /\./.test(l.address + l.cmp.right) ? 'Real' : 'Int', compareValue: l.cmp.right }
    : contact(resolve(l.address, area, where), l.edge === 'R' ? (l.neg ? 'FALLING' : 'RISING') : l.edge === 'F' ? (l.neg ? 'RISING' : 'FALLING') : l.neg ? 'NC' : 'NO'))
  // Temporizações: um TON por etapa e duração, ativado pelo registo [G0 == etapa]; o contacto Tn entra na condição.
  const timerRungs: LadderRung[] = []
  const timerOf = new Map<string, string>()
  let timerNames = 0
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
  const freeTimer = (): string | null => {
    let k = 0
    while (used.has(`T${k}`)) k++
    if (k > 99) { warnings.push('Sem temporizadores T livres.'); return null }
    used.add(`T${k}`)
    return `T${k}`
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
  /** Xn → marcador da comparação [G0 == n]; t/Xn ou T(…) → contacto do TON da etapa (a da ação/transição por omissão); 1HZ → relógio. */
  const resolverFor = (stepId: string) => (n: Node): string | null => {
    if (n.t === 'step') return `__X${n.index}`
    if (n.t === 'freq') return clockFor(n.hz)
    if (n.t === 'timer') { const owner = (n.key && iecStepNumber(n.key)) || numberOf.get(stepId); return owner ? timerFor(owner, n.ms) : null }
    return null
  }
  /** Condição → ramos paralelos, todos a começar na comparação do registo. `null` = não convertida. */
  const branchesFor = (condition: string, stepId: string, where: string): LadderContact[][] | null => {
    const tree = parse(condition || '1')
    const dnf = tree && toDnf(tree, false, resolverFor(stepId))
    if (!dnf) { warnings.push(`${where}: condição «${condition}» não convertida (inválida ou demasiado complexa).`); return null }
    return dnf.map((lits) => [stateIs(stepId), ...contactsOf(lits, 'I', where)])
  }
  const rung = (name: string, branches: LadderContact[][], extra: Partial<LadderRung> = {}): LadderRung =>
    ({ id: nanoid(6), name, branches: (branches.length ? branches : [[]]).map((elements) => ({ id: nanoid(6), elements })), coils: [], enabled: true, ...extra })

  // Uma só evolução por ciclo, como o motor GRAFCET: sem isto, depois do MOVE de T1 a network de T2
  // já via a etapa nova e avançava no mesmo scan. O bit é reposto no início do FC Grafcet.
  let evolved = ''
  for (let n = 1; n <= 99 && !evolved; n++) { const bit = normalizeBitAddress(`M${n}`)!; if (!used.has(bit)) { used.add(bit); evolved = `M${n}` } }
  if (!evolved) warnings.push('Sem memórias M livres para limitar a uma evolução por ciclo.')
  else tag(evolved, WORD_EVOLVED_NAME, WORD_EVOLVED_COMMENT)
  const evolvedRungs = evolved && transitions.length
    ? [rung('Ciclo: repor evolução', [[]], { coils: [{ ...coil(evolved), coilType: 'RESET' }], comment: withName(`${evolved} = 0: ainda não houve evolução neste ciclo`) })]
    : []

  // FC Grafcet: uma network por transição.
  const transitionRungs = transitions.map((t, k) => {
    const where = `T${k + 1}`
    const raw = branchesFor(t.condition, t.from[0], where)
    const branches = raw && evolved ? raw.map((b) => [...b, contact(evolved, 'NC')]) : raw
    return rung(`T${k + 1}: ${numberOf.get(t.from[0])} → ${numberOf.get(t.to[0])}`, branches ?? [[stateIs(t.from[0])]], {
      ...(evolved ? { coils: [{ ...coil(evolved), coilType: 'SET' as const }] } : {}),
      move: { source: numberOf.get(t.to[0]) ?? '0', target: word },
      comment: withName(`Receptividade: ${t.condition || '1'}`),
      enabled: !!branches && branches.length > 0,
    })
  })

  // FC Outputs: uma network por saída; várias etapas/ações na mesma saída → ramos em paralelo.
  const byOutput = new Map<string, Array<{ step: GrafcetStep; condition: string; raw: string }>>()
  steps.forEach((s) => actionsOfStep(s).forEach((a) => {
    const target = actionTarget(a)
    if (!target) return
    const key = foldText(target)
    byOutput.set(key, [...(byOutput.get(key) ?? []), { step: s, condition: a.condition || '1', raw: target }])
  }))
  const outputRungs: LadderRung[] = []
  for (const list of byOutput.values()) {
    const raw = list[0].raw
    const address = resolve(raw, 'Q', '')
    const steps1 = [...new Set(list.map((x) => numberOf.get(x.step.id)))].join(', ')
    const branches = list.flatMap((x) => branchesFor(x.condition, x.step.id, `Ação ${raw} (etapa ${numberOf.get(x.step.id)})`) ?? [])
    // `resolve` já declarou a tag da saída sem comentário: completa-o.
    const t = tags.find((tg) => tg.address === address)
    if (t) t.comment = `Saída do GRAFCET — etapa${list.length > 1 ? 's' : ''} ${steps1}`
    outputRungs.push(rung(`${raw}`, branches, { coils: [coil(address)], comment: withName(`Ativa nas etapas ${steps1}`), enabled: branches.length > 0 }))
  }

  // Comentários das entradas novas: onde são usadas.
  for (const t of tags) if (t.comment === '' && /^I/.test(t.address)) t.comment = `Entrada usada em ${[...(wherever.get(t.address) ?? [])].filter(Boolean).join(', ') || 'GRAFCET'}`

  // OB100: o registo arranca na etapa inicial; palavras usadas nas comparações começam a 0.
  const initial = steps.find(isInitialStep)
  const startupRungs: LadderRung[] = []
  for (const w of [...compareWords].sort()) startupRungs.push(rung(`Complete restart · Iniciar ${w}`, [[]], { move: { source: '0', target: w }, comment: withName(`Inicia ${w} a 0 para as comparações do GRAFCET`) }))
  if (initial) startupRungs.push(rung('Complete restart · Etapa inicial', [[]], { move: { source: numberOf.get(initial.id) ?? '0', target: word }, comment: withName(`${word} = ${numberOf.get(initial.id)} (etapa inicial do GRAFCET)`) }))
  else warnings.push('Não há etapa inicial: o Ladder não arranca.')

  // Os TON correm antes das transições (o FC Outputs é chamado depois do FC Grafcet).
  const grafcetRungs = [...evolvedRungs, ...timerRungs, ...transitionRungs]
  return { word, grafcetRungs, outputRungs, startupRungs, tags, warnings }
}
