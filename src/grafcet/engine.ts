/** Qualificadores de ação (IEC 60848 simplificado):
 *  N = contínua (enquanto a etapa está ativa e a condição é verdadeira)
 *  S = memorizada: coloca a saída a 1 e mantém-na até um R
 *  R = repõe a saída memorizada a 0
 *  D = retardada: só liga depois de `timeMs` com a etapa ativa
 *  L = limitada: liga ao ativar a etapa e desliga após `timeMs` */
export type GrafcetActionKind = 'N' | 'S' | 'R' | 'D' | 'L'
export interface GrafcetAction { id: string; address: string; condition: string; kind?: GrafcetActionKind; timeMs?: number }
export interface GrafcetStep {
  id: string
  name: string
  initial: boolean
  action: string // ação legada; mantida para projetos anteriores
  condition: string // transição legada na sequência linear
  actions?: GrafcetAction[]
  comment?: string
}
/** Uma transição pode ter várias origens (convergência AND) e vários destinos (divergência AND). */
export interface GrafcetTransition { id: string; from: string[]; to: string[]; condition: string; comment?: string }
export interface GrafcetProgram { steps: GrafcetStep[]; transitions?: GrafcetTransition[] }
export interface GrafcetRuntime {
  active: string[]
  owned: string[]
  /** tempo (ms) que cada etapa ativa leva ativa */
  elapsed?: Record<string, number>
  /** valores das entradas no scan anterior (para flancos ^I1 e \I1) */
  prev?: Record<string, boolean>
  /** saídas memorizadas por ações S/R */
  stored?: Record<string, boolean>
  /** nº de transições disparadas desde o início */
  fired?: number
  /** última transição disparada (id) e quando (nº do scan) */
  lastFired?: string[]
}
export const emptyGrafcet = (): GrafcetProgram => ({ steps: [], transitions: [] })
export const emptyGrafcetRuntime = (): GrafcetRuntime => ({ active: [], owned: [], elapsed: {}, prev: {}, stored: {}, fired: 0, lastFired: [] })
export const validBit = (address: string) => /^[IQM]\d{1,2}$/.test(address)
export const ACTION_KINDS: Array<{ id: GrafcetActionKind; label: string; hint: string; timed: boolean }> = [
  { id: 'N', label: 'N · Contínua', hint: 'Ativa enquanto a etapa estiver ativa.', timed: false },
  { id: 'S', label: 'S · Memorizada (set)', hint: 'Coloca a saída a 1 e mantém-na até uma ação R.', timed: false },
  { id: 'R', label: 'R · Reposição (reset)', hint: 'Repõe a saída memorizada a 0.', timed: false },
  { id: 'D', label: 'D · Retardada', hint: 'Liga só depois do tempo indicado com a etapa ativa.', timed: true },
  { id: 'L', label: 'L · Limitada', hint: 'Liga ao ativar a etapa e desliga após o tempo indicado.', timed: true },
]

/** Contexto de avaliação de uma condição. */
export interface ConditionContext {
  table: Record<string, boolean>
  prev?: Record<string, boolean>
  /** etapas ativas por número (índice na lista de etapas) */
  activeIndexes?: Set<number>
  /** tempo (ms) em que as origens da transição estão ativas */
  elapsedMs?: number
}

/** Sintaxe das condições (maiúsculas/minúsculas indiferentes):
 *  I1 Q1 M1 — bits · X2 — etapa 2 ativa · T(5s) / T(500ms) / T(2.5) — etapa(s) de origem ativa(s) há pelo menos esse tempo
 *  ^I1 — flanco ascendente · \I1 — flanco descendente · ! — NÃO · & — E · | — OU · ( ) · 1 / 0 */
const TOKEN = /T\(\d+(?:\.\d+)?(?:MS|S)?\)|X\d{1,2}|[IQM]\d{1,2}|[!&|()01^\\]/g

export function parseDuration(token: string): number | null {
  const match = /^T\((\d+(?:\.\d+)?)(MS|S)?\)$/i.exec(token)
  if (!match) return null
  const value = Number(match[1])
  return match[2]?.toUpperCase() === 'MS' ? value : value * 1000
}

/** Expressões booleanas: I1, !I2, (I1 & M1) | Q2, X3 & T(2s), ^I1, 1, 0.
 * A análise devolve false perante qualquer token inválido ou parêntese incompleto. */
export function validCondition(expression: string): boolean {
  return parseCondition(expression, { table: {} }) !== null
}
export function evalCondition(expression: string, table: Record<string, boolean>, context?: Partial<ConditionContext>): boolean {
  return parseCondition(expression, { table, ...context }) ?? false
}
/** Lista as etapas (números) referidas por X<n> numa condição. */
export function referencedSteps(expression: string): number[] {
  return (expression.toUpperCase().match(/X\d{1,2}/g) ?? []).map((t) => Number(t.slice(1)))
}

function parseCondition(expression: string, ctx: ConditionContext): boolean | null {
  const src = expression.trim().toUpperCase()
  const tokens = src.match(TOKEN)
  if (!tokens || tokens.join('') !== src.replace(/\s+/g, '')) return null
  let i = 0
  const atom = (): boolean | null => {
    const token = tokens[i++]
    if (token === '!') { const value = atom(); return value === null ? null : !value }
    if (token === '(') { const value = or(); if (tokens[i++] !== ')') return null; return value }
    if (token === '1' || token === '0') return token === '1'
    if (token === '^' || token === '\\') {
      const bit = tokens[i++]
      if (!bit || !validBit(bit)) return null
      const now = !!ctx.table[bit]
      const before = !!(ctx.prev ?? {})[bit]
      return token === '^' ? now && !before : !now && before
    }
    if (token && token[0] === 'T' && token[1] === '(') {
      const ms = parseDuration(token)
      return ms === null ? null : (ctx.elapsedMs ?? 0) >= ms
    }
    if (token && token[0] === 'X') return !!ctx.activeIndexes?.has(Number(token.slice(1)))
    if (token && validBit(token)) return !!ctx.table[token]
    return null
  }
  const and = (): boolean | null => {
    let value = atom()
    while (tokens[i] === '&') { i++; const right = atom(); value = value === null || right === null ? null : value && right }
    return value
  }
  const or = (): boolean | null => {
    let value = and()
    while (tokens[i] === '|') { i++; const right = and(); value = value === null || right === null ? null : value || right }
    return value
  }
  const value = or()
  return i === tokens.length ? value : null
}

/** Converte projetos lineares antigos para a estrutura explícita sem alterar dados guardados. */
export function transitionsOf(program: GrafcetProgram): GrafcetTransition[] {
  if (program.transitions) return program.transitions
  return program.steps.map((step, index) => ({ id: `legacy-${step.id}`, from: [step.id], to: [program.steps[(index + 1) % program.steps.length].id], condition: step.condition }))
}

/** Todas as ações de uma etapa (inclui a ação legada). */
export function actionsOfStep(step: GrafcetStep): GrafcetAction[] {
  return [
    ...(step.action ? [{ id: `legacy-${step.id}`, address: step.action, condition: '1', kind: 'N' as const }] : []),
    ...(step.actions ?? []),
  ]
}

const normAddress = (address: string) => address.trim().toUpperCase()

/** Tempo (ms) em que TODAS as origens da transição estão ativas. */
function sourceElapsed(transition: GrafcetTransition, elapsed: Record<string, number>): number {
  return Math.min(...transition.from.map((id) => elapsed[id] ?? 0))
}

/** As transições são avaliadas sobre o mesmo snapshot; um passo só participa
 * numa transição por scan (prioridade à ordem da lista). Divergência AND é
 * uma transição com múltiplos destinos; convergência AND requer TODAS as origens.
 * `dtMs` é o tempo simulado desde o scan anterior (para T(…) e ações D/L).
 */
export function scanGrafcet(program: GrafcetProgram, runtime: GrafcetRuntime, table: Record<string, boolean>, dtMs = 100): GrafcetRuntime {
  const steps = program.steps
  const ids = new Set(steps.map((step) => step.id))
  const indexOf = new Map(steps.map((step, index) => [step.id, index]))
  const kept = runtime.active.filter((id) => ids.has(id))
  const starting = !kept.length
  const current = new Set(kept.length ? kept : steps.filter((step) => step.initial).map((step) => step.id))
  const elapsed: Record<string, number> = {}
  for (const id of current) elapsed[id] = starting ? 0 : (runtime.elapsed?.[id] ?? 0) + dtMs
  const snapshot = { ...table }
  const prev = runtime.prev ?? {}
  const activeIndexes = new Set([...current].map((id) => indexOf.get(id)!).filter((n) => n !== undefined))
  const next = new Set(current)
  const consumed = new Set<string>()
  const firedNow: string[] = []
  const entered = new Set<string>()
  for (const transition of transitionsOf(program)) {
    if (!transition.from.length || !transition.to.length ||
        !transition.from.every((id) => current.has(id) && !consumed.has(id)) ||
        !transition.to.every((id) => ids.has(id)) ||
        !evalCondition(transition.condition, snapshot, { prev, activeIndexes, elapsedMs: sourceElapsed(transition, elapsed) })) continue
    transition.from.forEach((id) => { next.delete(id); consumed.add(id) })
    transition.to.forEach((id) => { next.add(id); elapsed[id] = 0; entered.add(id) })
    firedNow.push(transition.id)
  }

  const stored = { ...(runtime.stored ?? {}) }
  type Flat = GrafcetAction & { stepId: string }
  const actions: Flat[] = steps.flatMap((step) => actionsOfStep(step).map((a) => ({ ...a, stepId: step.id })))
  const owned = [...new Set(actions.map((a) => normAddress(a.address)).filter((a) => /^[QM]\d{1,2}$/.test(a)))]
  for (const address of runtime.owned) if (!owned.includes(address)) { table[address] = false; delete stored[address] }
  const justActivated = entered
  const nextIndexes = new Set([...next].map((id) => indexOf.get(id)!))
  for (const address of owned) {
    const mine = actions.filter((a) => normAddress(a.address) === address)
    const kindOf = (a: Flat) => a.kind ?? 'N'
    let continuous = false
    for (const a of mine) {
      if (!next.has(a.stepId)) continue
      const kind = kindOf(a)
      const holds = evalCondition(a.condition || '1', snapshot, { prev, activeIndexes: nextIndexes, elapsedMs: elapsed[a.stepId] ?? 0 })
      const time = a.timeMs ?? 0
      if (kind === 'N' && holds) continuous = true
      else if (kind === 'D' && holds && (elapsed[a.stepId] ?? 0) >= time) continuous = true
      else if (kind === 'L' && holds && (elapsed[a.stepId] ?? 0) < Math.max(time, 1)) continuous = true
      else if (kind === 'S' && holds && (justActivated.has(a.stepId) || starting)) stored[address] = true
      else if (kind === 'R' && holds && (justActivated.has(a.stepId) || starting)) stored[address] = false
    }
    table[address] = continuous || !!stored[address]
  }
  const trackedPrev: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(snapshot)) if (/^[IQM]\d{1,2}$/.test(key)) trackedPrev[key] = !!value
  return {
    active: [...next], owned, elapsed: Object.fromEntries([...next].map((id) => [id, elapsed[id] ?? 0])),
    prev: trackedPrev, stored, fired: (runtime.fired ?? 0) + firedNow.length, lastFired: firedNow,
  }
}

/** Força as etapas ativas (forçagem GRAFCET): útil para testar uma secção da sequência. */
export function forceSteps(program: GrafcetProgram, runtime: GrafcetRuntime, stepIds: string[]): GrafcetRuntime {
  const valid = stepIds.filter((id) => program.steps.some((step) => step.id === id))
  return { ...runtime, active: valid, elapsed: Object.fromEntries(valid.map((id) => [id, 0])), lastFired: [] }
}

/** Dispara manualmente uma transição (ignora a receptividade) se todas as origens estiverem ativas. */
export function fireTransition(program: GrafcetProgram, runtime: GrafcetRuntime, transitionId: string): GrafcetRuntime | null {
  const transition = transitionsOf(program).find((t) => t.id === transitionId)
  if (!transition || !transition.from.every((id) => runtime.active.includes(id))) return null
  const active = new Set(runtime.active)
  transition.from.forEach((id) => active.delete(id))
  transition.to.forEach((id) => active.add(id))
  const elapsed = { ...(runtime.elapsed ?? {}) }
  transition.from.forEach((id) => delete elapsed[id])
  transition.to.forEach((id) => { elapsed[id] = 0 })
  return { ...runtime, active: [...active], elapsed, fired: (runtime.fired ?? 0) + 1, lastFired: [transition.id] }
}

export type GrafcetIssueLevel = 'error' | 'warning'
export interface GrafcetIssue { id: string; message: string; level: GrafcetIssueLevel; entityId?: string; tab: 'steps' | 'transitions' }

/** Validação estrutural do programa: erros impedem a execução correta; avisos apontam más práticas. */
export function validateGrafcet(program: GrafcetProgram): GrafcetIssue[] {
  const steps = program.steps
  const transitions = transitionsOf(program)
  const issues: GrafcetIssue[] = []
  if (!steps.length) return issues
  const stepIds = new Set(steps.map((step) => step.id))
  const label = (stepId: string) => `${steps.findIndex((s) => s.id === stepId)} «${steps.find((s) => s.id === stepId)?.name ?? '?'}»`
  if (!steps.some((step) => step.initial)) issues.push({ id: 'initial', level: 'error', message: 'Defina pelo menos uma etapa inicial.', tab: 'steps' })
  transitions.forEach((transition, index) => {
    const name = `T${index + 1}`
    if (!transition.from.length || !transition.to.length) issues.push({ id: `${transition.id}:links`, level: 'error', message: `${name} precisa de origem e destino.`, entityId: transition.id, tab: 'transitions' })
    else if ([...transition.from, ...transition.to].some((stepId) => !stepIds.has(stepId))) issues.push({ id: `${transition.id}:missing`, level: 'error', message: `${name} referencia uma etapa inexistente.`, entityId: transition.id, tab: 'transitions' })
    if (!validCondition(transition.condition)) issues.push({ id: `${transition.id}:condition`, level: 'error', message: `Condição inválida em ${name}: «${transition.condition || 'vazia'}».`, entityId: transition.id, tab: 'transitions' })
    else {
      const bad = referencedSteps(transition.condition).filter((n) => n >= steps.length)
      if (bad.length) issues.push({ id: `${transition.id}:x`, level: 'error', message: `${name} usa X${bad[0]}, mas essa etapa não existe.`, entityId: transition.id, tab: 'transitions' })
      if (/^\s*1\s*$/.test(transition.condition)) issues.push({ id: `${transition.id}:always`, level: 'warning', message: `${name} tem receptividade «1»: dispara logo que as origens ficam ativas.`, entityId: transition.id, tab: 'transitions' })
    }
  })
  const incoming = new Set(transitions.flatMap((t) => t.to))
  const outgoing = new Set(transitions.flatMap((t) => t.from))
  const names = new Map<string, number>()
  steps.forEach((step) => names.set(step.name.trim().toLowerCase(), (names.get(step.name.trim().toLowerCase()) ?? 0) + 1))
  steps.forEach((step, stepIndex) => {
    if (!step.initial && !incoming.has(step.id)) issues.push({ id: `${step.id}:orphan`, level: 'error', message: `A etapa ${label(step.id)} não tem transição de entrada.`, entityId: step.id, tab: 'steps' })
    if (!outgoing.has(step.id)) issues.push({ id: `${step.id}:dead`, level: 'warning', message: `A etapa ${label(step.id)} não tem transição de saída: a sequência fica bloqueada nela.`, entityId: step.id, tab: 'steps' })
    if ((names.get(step.name.trim().toLowerCase()) ?? 0) > 1) issues.push({ id: `${step.id}:dup`, level: 'warning', message: `Nome de etapa repetido: «${step.name}».`, entityId: step.id, tab: 'steps' })
    actionsOfStep(step).forEach((action, actionIndex) => {
      if (!/^[QM]\d{1,2}$/.test(normAddress(action.address))) issues.push({ id: `${step.id}:action:${actionIndex}`, level: 'error', message: `Ação ${actionIndex + 1} da etapa ${stepIndex}: use um endereço Q ou M.`, entityId: step.id, tab: 'steps' })
      if (!validCondition(action.condition || '1')) issues.push({ id: `${step.id}:action-condition:${actionIndex}`, level: 'error', message: `Condição inválida na ação ${actionIndex + 1} da etapa ${stepIndex}.`, entityId: step.id, tab: 'steps' })
      if ((action.kind === 'D' || action.kind === 'L') && !(action.timeMs && action.timeMs > 0)) issues.push({ id: `${step.id}:time:${actionIndex}`, level: 'warning', message: `A ação ${actionIndex + 1} da etapa ${stepIndex} (${action.kind}) precisa de um tempo maior que zero.`, entityId: step.id, tab: 'steps' })
    })
  })
  // Alcançabilidade a partir das etapas iniciais.
  const reach = new Set(steps.filter((s) => s.initial).map((s) => s.id))
  let grew = true
  while (grew) {
    grew = false
    for (const t of transitions) if (t.from.some((id) => reach.has(id))) for (const id of t.to) if (stepIds.has(id) && !reach.has(id)) { reach.add(id); grew = true }
  }
  steps.forEach((step) => { if (!reach.has(step.id) && incoming.has(step.id)) issues.push({ id: `${step.id}:unreachable`, level: 'warning', message: `A etapa ${label(step.id)} nunca é alcançada a partir da etapa inicial.`, entityId: step.id, tab: 'steps' }) })
  // Saída comandada por várias etapas sem qualificador S/R.
  const drivers = new Map<string, string[]>()
  steps.forEach((step) => actionsOfStep(step).forEach((a) => { if ((a.kind ?? 'N') === 'N') drivers.set(normAddress(a.address), [...(drivers.get(normAddress(a.address)) ?? []), step.id]) }))
  for (const [address, list] of drivers) if (new Set(list).size > 1) issues.push({ id: `drive:${address}`, level: 'warning', message: `${address} é comandada por ${new Set(list).size} etapas — confirme que não estão ativas em simultâneo.`, entityId: list[0], tab: 'steps' })
  return issues
}
