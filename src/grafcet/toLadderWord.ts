import { nanoid } from 'nanoid'
import type { LadderCoilEl, LadderContact, LadderContactType, LadderRung } from '../types'
import { normalizeBitAddress } from '../ladder/addresses'
import { foldText } from '../utils/text'
import { COMPARE_TOKEN, actionsOfStep, normalizeActionVariable, parseCompareToken, stepNumberOf, stripGrafcetPrefix, transitionsOf, type GrafcetProgram, type GrafcetStep } from './engine'
import { symbolWordsInCondition } from './inputDetect'
import { nextDeclaredTagAddress } from './signals'
import { parse, toDnf, type GeneratedTag, type Literal, type Node } from './toLadder'

/**
 * Método «registo de etapa»: o GRAFCET inteiro vive numa palavra de memória (G0 = %MW0) que guarda
 * o número da etapa ativa. Cada transição é um MOVE do número da etapa seguinte, cada saída é uma
 * comparação do registo com o número das etapas onde está ativa:
 *
 *   FC Grafcet  : [G0 == origem] [receptividade] → MOVE destino → G0
 *   FC Outputs  : [G0 == etapa] [condição da ação] → ( saída )
 *   OB100       : MOVE etapa inicial → G0
 *   OB1 (Main)  : CALL Grafcet; CALL Outputs
 *
 * Só serve sequências simples (uma etapa ativa de cada vez); `wordMethodBlocker` diz porquê não.
 */

export const WORD_REGISTER_NAME = 'G0'
export const WORD_REGISTER_COMMENT = 'Registo de etapa do GRAFCET (número da etapa ativa)'
export const WORD_FC_GRAFCET = 'Grafcet'
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
const anyNode = (n: Node, test: (n: Node) => boolean): boolean => test(n) || ((n.t === 'and' || n.t === 'or') && (anyNode(n.a, test) || anyNode(n.b, test))) || (n.t === 'not' && anyNode(n.a, test))

/** `null` se o GRAFCET cabe no método do registo de etapa; senão, o motivo (texto curto para o aviso). */
export function wordMethodBlocker(program: GrafcetProgram): string | null {
  const steps = program.steps
  if (!steps.length) return 'não há etapas'
  const numbers = steps.map((s, i) => stepNumberOf(s, i))
  if (numbers.some((n) => !/^\d{1,5}$/.test(n))) return 'os números das etapas têm de ser inteiros (ex.: 1, 5, 12)'
  if (new Set(numbers).size !== numbers.length) return 'há números de etapa repetidos'
  if (steps.filter(isInitialStep).length !== 1) return 'é preciso exatamente uma etapa inicial'
  const ids = new Set(steps.map((s) => s.id))
  const unsupported = (n: Node) => n.t === 'timer' || n.t === 'step'
  for (const t of transitionsOf(program)) {
    if (t.from.length !== 1 || t.to.length !== 1) return 'há divergências ou convergências (etapas em paralelo)'
    if (!ids.has(t.from[0]) || !ids.has(t.to[0])) return 'há transições sem etapa de origem ou destino'
    const tree = parse(t.condition || '1')
    if (!tree) return `a receptividade «${t.condition}» não é convertível`
    if (anyNode(tree, unsupported)) return 'há temporizações ou referências a etapas (Xn) nas receptividades'
  }
  for (const s of steps) for (const a of actionsOfStep(s)) {
    if ((a.kind ?? 'N') !== 'N') return 'há ações memorizadas ou temporizadas (S/R/D/L)'
    if (!actionTarget(a)) continue
    const tree = parse(a.condition || '1')
    if (!tree) return `a condição «${a.condition}» de uma ação não é convertível`
    if (anyNode(tree, unsupported)) return 'há temporizações ou referências a etapas (Xn) nas condições das ações'
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
  const stateIs = (stepId: string): LadderContact => ({ ...contact(word, 'CMP'), compareOp: '==', compareType: 'Int', compareValue: numberOf.get(stepId) ?? '0' })
  const coil = (address: string): LadderCoilEl => ({ kind: 'coil', id: nanoid(6), address, coilType: 'COIL' })
  const contactsOf = (lits: Literal[], area: 'I' | 'Q', where: string): LadderContact[] => lits.map((l): LadderContact => l.cmp
    ? { ...contact(l.address, 'CMP'), compareOp: l.cmp.op, compareType: /\./.test(l.address + l.cmp.right) ? 'Real' : 'Int', compareValue: l.cmp.right }
    : contact(resolve(l.address, area, where), l.edge === 'R' ? (l.neg ? 'FALLING' : 'RISING') : l.edge === 'F' ? (l.neg ? 'RISING' : 'FALLING') : l.neg ? 'NC' : 'NO'))
  /** Condição → ramos paralelos, todos a começar na comparação do registo. `null` = não convertida. */
  const branchesFor = (condition: string, stepId: string, where: string): LadderContact[][] | null => {
    const tree = parse(condition || '1')
    const dnf = tree && toDnf(tree, false, () => null)
    if (!dnf) { warnings.push(`${where}: condição «${condition}» não convertida (inválida ou demasiado complexa).`); return null }
    return dnf.map((lits) => [stateIs(stepId), ...contactsOf(lits, 'I', where)])
  }
  const rung = (name: string, branches: LadderContact[][], extra: Partial<LadderRung> = {}): LadderRung =>
    ({ id: nanoid(6), name, branches: (branches.length ? branches : [[]]).map((elements) => ({ id: nanoid(6), elements })), coils: [], enabled: true, ...extra })

  // FC Grafcet: uma network por transição.
  const grafcetRungs = transitions.map((t, k) => {
    const where = `T${k + 1}`
    const branches = branchesFor(t.condition, t.from[0], where)
    return rung(`T${k + 1}: ${numberOf.get(t.from[0])} → ${numberOf.get(t.to[0])}`, branches ?? [[stateIs(t.from[0])]], {
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

  return { word, grafcetRungs, outputRungs, startupRungs, tags, warnings }
}
