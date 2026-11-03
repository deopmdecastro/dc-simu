import { stepGraphNumbers, stepNumberOf, stepReferenceText, stepStateReferences, validateGrafcet, type GrafcetProgram, type GrafcetTransition } from './engine'

/**
 * Textos livres de comparação (`G4 <> X159`) → condição de estado «Só se» da transição que ativa essa etapa.
 *
 * Em projetos importados do FluidSIM a comparação vinha como texto solto por cima da transição; o motor só a
 * avalia quando é a condição de estado (`guard`) da transição. Conversão em duas fases, com revisão pelo meio:
 * 1. `applyTextGuards` acrescenta a condição às transições (os textos mantêm-se, para comparar);
 * 2. depois de confirmado, `removeTextGuardComments` apaga os textos já cobertos.
 */

export interface TextGuardMatch {
  commentId: string
  /** texto original do desenho */
  text: string
  /** condição canónica a guardar na transição, ex.: `G4 <> X159` */
  guard: string
  transitionId: string
  transitionName: string
  /** receptividade da transição (sem a condição de estado) */
  condition: string
  /** transição-fonte (sem etapa de origem), o caso típico da emergência */
  source: boolean
  /** GRAFCET e número da etapa que a transição ativa */
  graph: number
  step: string
  /** a transição já tem esta condição de estado */
  applied: boolean
}
export interface TextGuardScan {
  matches: TextGuardMatch[]
  /** textos que parecem comparações mas não têm transição que ative essa etapa: ficam como estão */
  unmatched: { commentId: string; text: string }[]
}

/** Distância máxima (unidades do desenho) entre o texto e a barra da transição que o recebe. */
const MAX_SOURCE_DISTANCE = 320
const MAX_LINKED_DISTANCE = 200

/** O texto é só uma ou mais referências de estado ligadas por `*` (ou `·`)? Devolve-as, ou null. */
function referencesOfText(text: string) {
  const refs = stepStateReferences(text).filter((ref) => ref.graph !== null && !ref.implicit)
  if (!refs.length) return null
  let rest = text
  for (const ref of [...stepStateReferences(text)].sort((a, b) => b.at - a.at)) rest = rest.slice(0, ref.at) + ' ' + rest.slice(ref.at + ref.text.length)
  if (!/^[\s*·]*$/.test(rest)) return null
  if (stepStateReferences(text).length !== refs.length) return null
  return refs
}

const sameTerms = (guard: string | undefined, wanted: string): boolean => {
  const have = new Set(stepStateReferences(guard ?? '').map((ref) => stepReferenceText(ref.graph, ref.step, ref.active)))
  return stepStateReferences(wanted).every((ref) => have.has(stepReferenceText(ref.graph, ref.step, ref.active)))
}

export function scanTextGuards(program: GrafcetProgram): TextGuardScan {
  const transitions = program.transitions ?? []
  const graphs = stepGraphNumbers(program)
  const stepsByRef = new Map<string, string>()
  program.steps.forEach((step, index) => stepsByRef.set(`${graphs.get(step.id) ?? 0}:${stepNumberOf(step, index)}`, step.id))
  const matches: TextGuardMatch[] = []
  const unmatched: TextGuardScan['unmatched'] = []
  for (const comment of program.comments ?? []) {
    const refs = referencesOfText(comment.text.trim())
    if (!refs) continue
    const guard = refs.map((ref) => stepReferenceText(ref.graph, ref.step, ref.active)).join(' * ')
    // A etapa de destino é a da 1.ª referência: «G4 <> X159» pertence à transição que ativa a etapa 159 do G4.
    const targetId = stepsByRef.get(`${Number(refs[0].graph)}:${refs[0].step}`)
    const candidates = transitions.filter((t) => targetId && t.to.includes(targetId))
    const pool = candidates.some((t) => !t.from.length) ? candidates.filter((t) => !t.from.length) : candidates
    const limit = pool.some((t) => !t.from.length) ? MAX_SOURCE_DISTANCE : MAX_LINKED_DISTANCE
    let best: GrafcetTransition | undefined
    let bestDistance = Infinity
    for (const t of pool) {
      const distance = Math.hypot((t.x ?? comment.x) - comment.x, (t.y ?? comment.y) - comment.y)
      if (distance < bestDistance) { best = t; bestDistance = distance }
    }
    if (!best || bestDistance > limit) { unmatched.push({ commentId: comment.id, text: comment.text }); continue }
    const index = transitions.indexOf(best)
    matches.push({
      commentId: comment.id, text: comment.text.trim(), guard, transitionId: best.id,
      transitionName: best.name?.trim() || `T${index + 1}`, condition: best.condition, source: !best.from.length,
      graph: Number(refs[0].graph), step: refs[0].step, applied: sameTerms(best.guard, guard),
    })
  }
  return { matches, unmatched }
}

/** Fase 1: acrescenta a condição de estado às transições (junta com `*` se já houver uma); os textos ficam. */
export function applyTextGuards(program: GrafcetProgram, matches: TextGuardMatch[]): GrafcetProgram {
  const wanted = new Map<string, string[]>()
  for (const match of matches) wanted.set(match.transitionId, [...(wanted.get(match.transitionId) ?? []), match.guard])
  return {
    ...program,
    transitions: (program.transitions ?? []).map((t) => {
      const add = wanted.get(t.id)
      if (!add) return t
      let guard = (t.guard ?? '').trim()
      for (const term of add) if (!sameTerms(guard, term)) guard = guard ? `${guard} * ${term}` : term
      return { ...t, guard }
    }),
  }
}

/** Fase 2: apaga os textos pedidos (só se a condição já estiver na transição). */
export function removeTextGuardComments(program: GrafcetProgram, commentIds: string[]): GrafcetProgram {
  const drop = new Set(commentIds)
  return { ...program, comments: (program.comments ?? []).filter((comment) => !drop.has(comment.id)) }
}

/** Erros de validação ligados a uma condição de estado inválida, para confirmar a fase 1. */
export const guardErrors = (program: GrafcetProgram): number =>
  validateGrafcet(program).filter((issue) => issue.level === 'error' && /Condição de estado/.test(issue.message)).length
