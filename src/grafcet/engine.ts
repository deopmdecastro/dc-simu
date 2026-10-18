/** Qualificadores de ação (IEC 60848 simplificado e estendido FluidSIM):
 *  N = contínua (enquanto a etapa está ativa e a condição é verdadeira)
 *  S = memorizada: coloca a saída a 1 e mantém-na até um R
 *  R = repõe a saída memorizada a 0
 *  D = retardada: só liga depois de `timeMs` com a etapa ativa
 *  L = limitada: liga ao ativar a etapa e desliga após `timeMs`
 *  A = ativação: pulso ao ativar a etapa (↑)
 *  DA = desativação: pulso ao desativar a etapa (↓)
 *  EV = evento: disparada por evento (⮥)
 *  C = comando imperativo / forçagem */
export type GrafcetActionKind = 'N' | 'S' | 'R' | 'D' | 'L' | 'A' | 'DA' | 'EV' | 'C'

export type GrafcetActionAllocation = 'continuous' | 'activation' | 'deactivation' | 'event' | 'compulsory'

export type GrafcetStepType =
  | 'simple'             // Etapa normal (□)
  | 'initial'            // Etapa inicial (duplo quadrado)
  | 'macro'              // Macro-etapa (com barra M)
  | 'macro-input'        // Entrada de macro-etapa (com E)
  | 'macro-output'       // Saída de macro-etapa (com S)
  | 'enclosing'          // Etapa encapsulante (cantos diagonais)
  | 'initial-enclosing'  // Etapa encapsulante inicial

export interface GrafcetAction {
  id: string
  address: string
  condition: string
  kind?: GrafcetActionKind
  timeMs?: number
  type?: 'simple' | 'conditional'
  allocation?: GrafcetActionAllocation
  description?: string
  displayDescription?: boolean
  variable?: string
  /** Posição livre no diagrama (só para ações soltas, sem etapa associada) */
  x?: number
  y?: number
}

export interface GrafcetStep {
  id: string
  name: string
  initial: boolean
  stepType?: GrafcetStepType
  action: string // ação legada; mantida para projetos anteriores
  condition: string // transição legada na sequência linear
  actions?: GrafcetAction[]
  comment?: string
  description?: string
  activationLink?: boolean
  /** Posição manual no diagrama: x = eixo central da etapa, y = topo. Só é usada quando `pinned` é true. */
  x?: number
  y?: number
  /** true quando o utilizador arrastou a etapa (ou usou "Organizar"); caso contrário o layout é automático. */
  pinned?: boolean
  chart?: string
}

export type GrafcetBranchType =
  | 'none'
  | 'or-divergence'
  | 'or-convergence'
  | 'and-divergence'
  | 'and-convergence'

/** Uma transição pode ter várias origens (convergência AND/OR) e vários destinos (divergência AND/OR). */
export interface GrafcetTransition {
  id: string
  from: string[]
  to: string[]
  condition: string
  comment?: string
  name?: string
  description?: string
  displayDescription?: boolean
  targetInfo?: string
  x?: number
  y?: number
  branchType?: GrafcetBranchType
  chart?: string
}

export interface GrafcetComment {
  id: string
  text: string
  x: number
  y: number
  fontSize?: number
  fontWeight?: string
  chart?: string
}

export interface GrafcetChart {
  id: string
  name: string
  title: string
}

export interface GrafcetProgram {
  steps: GrafcetStep[]
  transitions?: GrafcetTransition[]
  /** Ações soltas: criadas sem etapa; ligam-se depois por arrasto ou por linha */
  freeActions?: GrafcetAction[]
  comments?: GrafcetComment[]
  charts?: GrafcetChart[]
  activeChart?: string
}

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

export const emptyGrafcet = (): GrafcetProgram => ({ steps: [], transitions: [], comments: [] })
export const emptyGrafcetRuntime = (): GrafcetRuntime => ({ active: [], owned: [], elapsed: {}, prev: {}, stored: {}, fired: 0, lastFired: [] })

export const validBit = (address: string) => /^[IQM]\d{1,2}$/.test(address)

const DISALLOWED_VARS = new Set([
  'MOVE', 'ADD', 'SUB', 'MUL', 'DIV', 'CALL', 'RET', 'JMP', 'NOP', 'TON', 'TOF', 'TP', 'CTU', 'CTD',
])

export const validGrafcetVariable = (v: string): boolean => {
  const s = v.trim()
  if (!s || DISALLOWED_VARS.has(s.toUpperCase())) return false
  if (/^[IQM]\d{1,2}$/i.test(s)) return true
  if (/^%?[IQM][XBWDL]?\d+(?:\.\d+)?$/i.test(s)) return true
  if (/^[A-Za-z_][A-Za-z0-9_]*(\+|-)?$/i.test(s)) return true
  return false
}

export const ACTION_KINDS: Array<{ id: GrafcetActionKind; label: string; hint: string; timed: boolean }> = [
  { id: 'N', label: 'N · Contínua', hint: 'Ativa enquanto a etapa estiver ativa.', timed: false },
  { id: 'S', label: 'S · Memorizada (set)', hint: 'Coloca a saída a 1 e mantém-na até uma ação R.', timed: false },
  { id: 'R', label: 'R · Reposição (reset)', hint: 'Repõe a saída memorizada a 0.', timed: false },
  { id: 'D', label: 'D · Retardada', hint: 'Liga só depois do tempo indicado com a etapa ativa.', timed: true },
  { id: 'L', label: 'L · Limitada', hint: 'Liga ao ativar a etapa e desliga após o tempo indicado.', timed: true },
  { id: 'A', label: '↑ · Ao ativar', hint: 'Pulso de ativação ao entrar na etapa.', timed: false },
  { id: 'DA', label: '↓ · Ao desativar', hint: 'Pulso de desativação ao sair da etapa.', timed: false },
  { id: 'EV', label: '⮥ · No evento', hint: 'Disparada por evento sob condição.', timed: false },
  { id: 'C', label: 'C · Forçagem', hint: 'Comando imperativo de forçagem.', timed: false },
]

/** Contexto de avaliação de uma condição. */
export interface ConditionContext {
  table: Record<string, boolean>
  prev?: Record<string, boolean>
  /** etapas ativas por número (índice na lista de etapas) */
  activeIndexes?: Set<number>
  /** nomes ou IDs das etapas ativas */
  activeStepNames?: Set<string>
  activeStepIds?: Set<string>
  /** tempo (ms) em que as origens da transição estão ativas */
  elapsedMs?: number
  /** tempo (ms) ativo de cada etapa indexado por id, nome ou índice */
  stepElapsed?: Record<string, number>
  stepElapsedByName?: Record<string, number>
  simTimeMs?: number
}

/** Análise de duração: T(5s), T(500ms), 10s, 500ms, 2.5s */
export function parseDuration(token: string): number | null {
  const match = /^T\((\d+(?:\.\d+)?)(MS|S)?\)$/i.exec(token)
  if (match) {
    const value = Number(match[1])
    return match[2]?.toUpperCase() === 'MS' ? value : value * 1000
  }
  const match2 = /^(\d+(?:\.\d+)?)(MS|S)?$/i.exec(token)
  if (match2) {
    const value = Number(match2[1])
    return match2[2]?.toUpperCase() === 'MS' ? value : value * 1000
  }
  return null
}

export interface IecTimerInfo {
  d1: number
  step: string | null
  d2: number | null
}

export function parseIecTimer(str: string): IecTimerInfo | null {
  const m = str.match(/^(\d+(?:\.\d+)?(?:MS|S)?)\/X([A-Za-z0-9_]*)(?:\/(\d+(?:\.\d+)?(?:MS|S)?))?$/i)
  if (!m) return null
  const d1 = parseDuration(m[1])
  if (d1 === null) return null
  const step = m[2] ? m[2] : null
  const d2 = m[3] ? parseDuration(m[3]) : null
  return { d1, step, d2 }
}

/** Sintaxe das condições compatível com FluidSim, grafcet.io e IEC 60848:
 *  - I1, Q1, M1, %I0.0
 *  - B_Start, B_Stop_NF, fc_a0, fc_b0, In_Man, b0, b1, S_Rolamento
 *  - Timers: 10s/X85, 5s/X90, 1s/X45, 20s/X15, T(5s), T(500ms)
 *  - Frequências: 1HZ, 0.5 HZ, 2 HZ
 *  - Etapas ativas: X85, X1, G0X3, G0X5, G1X75, G0X1, G2X135, G0 <=> X5
 *  - Operadores: AND (*, ., &, AND), OR (+, |, OR), NOT (!, NOT, leading /, leading _)
 *  - Flancos: ^I1, \I1, ↑I1, ↓I1
 *  - Constantes: 1, 0, TRUE, FALSE */
export function validCondition(expression: string): boolean {
  return parseCondition(expression, { table: {} }) !== null
}

export function evalCondition(expression: string, table: Record<string, boolean>, context?: Partial<ConditionContext>): boolean {
  return parseCondition(expression, { table, ...context }) ?? false
}

/** Lista as etapas (números) referidas por X<n> ou G...X<n> numa condição. */
export function referencedSteps(expression: string): number[] {
  const matches = expression.toUpperCase().match(/(?:G\d+)?X(\d+)/g) ?? []
  return matches.map((t) => {
    const m = t.match(/X(\d+)/)
    return m ? Number(m[1]) : NaN
  }).filter((n) => !isNaN(n))
}

function parseCondition(expression: string, ctx: ConditionContext): boolean | null {
  const src = expression.trim()
  if (!src) return null
  if (DISALLOWED_VARS.has(src.toUpperCase())) return null

  // Rejeita sintaxes incorretas explícitas de operadores duplos ou inválidos
  if (/&&|\|\||\^\s*&|\^\s*\||\\\s*&|\\\s*\||\*\s*\*|\+\s*\+/.test(src)) return null

  const regex = /T\(\d+(?:\.\d+)?(?:MS|S)?\)|(?:(?:\d+(?:\.\d+)?(?:MS|S)?)\/X[A-Za-z0-9_]*(?:\/(?:\d+(?:\.\d+)?(?:MS|S)?))?)|(?:\d+(?:\.\d+)?\s*HZ)|(?:G\d+\s*<=>\s*X\d+)|(?:G\d+X\d+)|X\d{1,3}|[IQM]\d{1,2}|[!&|()01^\\]|\*|\+|NOT|AND|OR|\/|_|[A-Za-z][A-Za-z0-9_]*(\+|-)?/gi

  const rawTokens = src.match(regex)
  if (!rawTokens) return null
  if (rawTokens.join('').replace(/\s+/g, '') !== src.replace(/\s+/g, '')) return null

  const tokens: string[] = []
  for (let idx = 0; idx < rawTokens.length; idx++) {
    const t = rawTokens[idx]
    const up = t.toUpperCase()
    if (up === '*' || up === 'AND') tokens.push('&')
    else if (up === '+' || up === 'OR') tokens.push('|')
    else if (up === 'NOT') tokens.push('!')
    else if (t === '/' || t === '_') tokens.push('!')
    else tokens.push(up)
  }

  let i = 0
  const atom = (): boolean | null => {
    const token = tokens[i++]
    if (!token) return null
    if (token === '!') {
      const v = atom()
      return v === null ? null : !v
    }
    if (token === '(') {
      const v = or()
      if (tokens[i++] !== ')') return null
      return v
    }
    if (token === '1' || token === 'TRUE') return true
    if (token === '0' || token === 'FALSE') return false
    if (token === '^' || token === '\\') {
      const bit = tokens[i++]
      if (!bit || (!validBit(bit) && !validGrafcetVariable(bit))) return null
      const now = !!(ctx.table[bit] ?? ctx.table[bit.toUpperCase()] ?? ctx.table[bit.toLowerCase()])
      const before = !!(ctx.prev?.[bit] ?? ctx.prev?.[bit.toUpperCase()] ?? ctx.prev?.[bit.toLowerCase()])
      return token === '^' ? now && !before : !now && before
    }
    if (token.startsWith('T(')) {
      const ms = parseDuration(token)
      return ms === null ? null : (ctx.elapsedMs ?? 0) >= ms
    }
    const iecTimer = parseIecTimer(token)
    if (iecTimer) {
      const { d1, step, d2 } = iecTimer
      if (!step) {
        const el = ctx.elapsedMs ?? 0
        return el >= d1 && (d2 === null || el <= d1 + d2)
      }
      const stepElapsed = ctx.stepElapsed?.[step] ?? ctx.stepElapsedByName?.[step] ?? (ctx.activeIndexes?.has(Number(step)) ? (ctx.elapsedMs ?? 0) : null)
      if (stepElapsed === null || stepElapsed === undefined) return false
      return stepElapsed >= d1 && (d2 === null || stepElapsed <= d1 + d2)
    }
    if (/^\d+(\.\d+)?\s*HZ$/.test(token)) {
      const hz = parseFloat(token)
      const t = ctx.simTimeMs ?? Date.now()
      const period = 1000 / hz
      return (Math.floor(t / (period / 2)) % 2) === 0
    }
    if (token.startsWith('X') && /^\d+$/.test(token.slice(1))) {
      const num = Number(token.slice(1))
      return !!(ctx.activeIndexes?.has(num) || ctx.activeStepNames?.has(token.slice(1)) || ctx.activeStepIds?.has(token))
    }
    const gStep = token.match(/^G\d+X(\d+)$/i) || token.match(/^G\d+\s*<=>\s*X(\d+)$/i)
    if (gStep) {
      const num = Number(gStep[1])
      return !!(ctx.activeIndexes?.has(num) || ctx.activeStepNames?.has(gStep[1]))
    }
    if (validBit(token) || validGrafcetVariable(token)) {
      return !!(ctx.table[token] ?? ctx.table[token.toUpperCase()] ?? ctx.table[token.toLowerCase()])
    }
    return null
  }

  const and = (): boolean | null => {
    let v = atom()
    while (tokens[i] === '&') {
      i++
      const r = atom()
      v = v === null || r === null ? null : v && r
    }
    return v
  }

  const or = (): boolean | null => {
    let v = and()
    while (tokens[i] === '|') {
      i++
      const r = and()
      v = v === null || r === null ? null : v || r
    }
    return v
  }

  const val = or()
  return i === tokens.length ? val : null
}

/** Converte projetos lineares antigos para a estrutura explícita sem alterar dados guardados. */
export function transitionsOf(program: GrafcetProgram): GrafcetTransition[] {
  if (program.transitions) return program.transitions
  return program.steps.map((step, index) => ({
    id: `legacy-${step.id}`,
    from: [step.id],
    to: [program.steps[(index + 1) % program.steps.length].id],
    condition: step.condition,
  }))
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
  const stepById = new Map(steps.map((step) => [step.id, step]))

  const kept = runtime.active.filter((id) => ids.has(id))
  const starting = !kept.length
  const current = new Set(kept.length ? kept : steps.filter((step) => step.initial || step.stepType === 'initial' || step.stepType === 'initial-enclosing').map((step) => step.id))
  const elapsed: Record<string, number> = {}
  for (const id of current) elapsed[id] = starting ? 0 : (runtime.elapsed?.[id] ?? 0) + dtMs
  const snapshot = { ...table }
  const prev = runtime.prev ?? {}
  const activeIndexes = new Set([...current].map((id) => indexOf.get(id)!).filter((n) => n !== undefined))
  const activeStepNames = new Set([...current].map((id) => stepById.get(id)?.name.trim()).filter((n): n is string => !!n))
  const stepElapsedByName: Record<string, number> = {}
  for (const id of current) {
    const s = stepById.get(id)
    if (s?.name) stepElapsedByName[s.name.trim()] = elapsed[id] ?? 0
  }

  const next = new Set(current)
  const consumed = new Set<string>()
  const firedNow: string[] = []
  const entered = new Set<string>()

  const simTimeMs = (runtime.fired ?? 0) * dtMs

  for (const transition of transitionsOf(program)) {
    if (!transition.from.length || !transition.to.length ||
        !transition.from.every((id) => current.has(id) && !consumed.has(id)) ||
        !transition.to.every((id) => ids.has(id))) continue

    const condContext: ConditionContext = {
      table: snapshot,
      prev,
      activeIndexes,
      activeStepNames,
      activeStepIds: current,
      elapsedMs: sourceElapsed(transition, elapsed),
      stepElapsed: elapsed,
      stepElapsedByName,
      simTimeMs,
    }

    if (!evalCondition(transition.condition, snapshot, condContext)) continue

    transition.from.forEach((id) => { next.delete(id); consumed.add(id) })
    transition.to.forEach((id) => { next.add(id); elapsed[id] = 0; entered.add(id) })
    firedNow.push(transition.id)
  }

  const stored = { ...(runtime.stored ?? {}) }
  type Flat = GrafcetAction & { stepId: string }
  const actions: Flat[] = steps.flatMap((step) => actionsOfStep(step).map((a) => ({ ...a, stepId: step.id })))
  const owned = [...new Set(actions.map((a) => normAddress(a.address || a.variable || '')).filter((a) => a && (validBit(a) || validGrafcetVariable(a))))]
  for (const address of runtime.owned) if (!owned.includes(address)) { table[address] = false; delete stored[address] }
  const justActivated = entered
  const nextIndexes = new Set([...next].map((id) => indexOf.get(id)!))
  const nextStepNames = new Set([...next].map((id) => stepById.get(id)?.name.trim()).filter((n): n is string => !!n))

  for (const address of owned) {
    const mine = actions.filter((a) => normAddress(a.address || a.variable || '') === address)
    const kindOf = (a: Flat) => a.kind ?? 'N'
    let continuous = false
    for (const a of mine) {
      if (!next.has(a.stepId)) continue
      const kind = kindOf(a)
      const actionContext: ConditionContext = {
        table: snapshot,
        prev,
        activeIndexes: nextIndexes,
        activeStepNames: nextStepNames,
        activeStepIds: next,
        elapsedMs: elapsed[a.stepId] ?? 0,
        stepElapsed: elapsed,
        stepElapsedByName,
        simTimeMs,
      }
      const holds = evalCondition(a.condition || '1', snapshot, actionContext)
      const time = a.timeMs ?? 0
      if (kind === 'N' && holds) continuous = true
      else if (kind === 'D' && holds && (elapsed[a.stepId] ?? 0) >= time) continuous = true
      else if (kind === 'L' && holds && (elapsed[a.stepId] ?? 0) < Math.max(time, 1)) continuous = true
      else if (kind === 'A' && holds && (justActivated.has(a.stepId) || starting)) continuous = true
      else if (kind === 'S' && holds && (justActivated.has(a.stepId) || starting)) stored[address] = true
      else if (kind === 'R' && holds && (justActivated.has(a.stepId) || starting)) stored[address] = false
    }
    table[address] = continuous || !!stored[address]
  }

  const trackedPrev: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(snapshot)) {
    if (validBit(key) || validGrafcetVariable(key)) trackedPrev[key] = !!value
  }

  return {
    active: [...next],
    owned,
    elapsed: Object.fromEntries([...next].map((id) => [id, elapsed[id] ?? 0])),
    prev: trackedPrev,
    stored,
    fired: (runtime.fired ?? 0) + firedNow.length,
    lastFired: firedNow,
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

  const hasInitial = steps.some((step) => step.initial || step.stepType === 'initial' || step.stepType === 'initial-enclosing')
  if (!hasInitial) {
    issues.push({ id: 'initial', level: 'error', message: 'Defina pelo menos uma etapa inicial.', tab: 'steps' })
  }

  transitions.forEach((transition, index) => {
    const name = transition.name || `T${index + 1}`
    if (!transition.from.length || !transition.to.length) {
      issues.push({ id: `${transition.id}:links`, level: 'error', message: `${name} precisa de origem e destino.`, entityId: transition.id, tab: 'transitions' })
    } else if ([...transition.from, ...transition.to].some((stepId) => !stepIds.has(stepId))) {
      issues.push({ id: `${transition.id}:missing`, level: 'error', message: `${name} referencia uma etapa inexistente.`, entityId: transition.id, tab: 'transitions' })
    }
    if (!validCondition(transition.condition)) {
      issues.push({ id: `${transition.id}:condition`, level: 'error', message: `Condição inválida em ${name}: «${transition.condition || 'vazia'}».`, entityId: transition.id, tab: 'transitions' })
    } else {
      const bad = referencedSteps(transition.condition).filter((n) => n >= steps.length && !steps.some((s) => s.name.trim() === String(n)))
      if (bad.length) {
        issues.push({ id: `${transition.id}:x`, level: 'error', message: `${name} usa X${bad[0]}, mas essa etapa não existe.`, entityId: transition.id, tab: 'transitions' })
      }
      if (/^\s*1\s*$/.test(transition.condition)) {
        issues.push({ id: `${transition.id}:always`, level: 'warning', message: `${name} tem receptividade «1»: dispara logo que as origens ficam ativas.`, entityId: transition.id, tab: 'transitions' })
      }
    }
  })

  // Ações soltas: criadas sem etapa — a simulação ignora-as até serem ligadas.
  ;(program.freeActions ?? []).forEach((action, index) => {
    const name = action.variable || action.address || `A${index + 1}`
    issues.push({
      id: `${action.id}:free`,
      level: 'warning',
      message: `A ação «${name}» está solta: ligue-a a uma etapa (arrasto ou ferramenta Ligar).`,
      entityId: action.id,
      tab: 'steps',
    })
  })

  const incoming = new Set(transitions.flatMap((t) => t.to))
  const outgoing = new Set(transitions.flatMap((t) => t.from))
  const names = new Map<string, number>()
  steps.forEach((step) => names.set(step.name.trim().toLowerCase(), (names.get(step.name.trim().toLowerCase()) ?? 0) + 1))

  steps.forEach((step, stepIndex) => {
    const isInit = step.initial || step.stepType === 'initial' || step.stepType === 'initial-enclosing'
    if (!isInit && !incoming.has(step.id)) {
      issues.push({ id: `${step.id}:orphan`, level: 'error', message: `A etapa ${label(step.id)} não tem transição de entrada.`, entityId: step.id, tab: 'steps' })
    }
    if (!outgoing.has(step.id)) {
      issues.push({ id: `${step.id}:dead`, level: 'warning', message: `A etapa ${label(step.id)} não tem transição de saída: a sequência fica bloqueada nela.`, entityId: step.id, tab: 'steps' })
    }
    if ((names.get(step.name.trim().toLowerCase()) ?? 0) > 1) {
      issues.push({ id: `${step.id}:dup`, level: 'warning', message: `Nome de etapa repetido: «${step.name}».`, entityId: step.id, tab: 'steps' })
    }
    actionsOfStep(step).forEach((action, actionIndex) => {
      const addr = normAddress(action.address || action.variable || '')
      if (!addr && !action.description) {
        issues.push({ id: `${step.id}:action:${actionIndex}`, level: 'error', message: `Ação ${actionIndex + 1} da etapa ${stepIndex}: indique um endereço ou descrição.`, entityId: step.id, tab: 'steps' })
      } else if (addr && !validBit(addr) && !validGrafcetVariable(addr) && !action.description) {
        issues.push({ id: `${step.id}:action:${actionIndex}`, level: 'error', message: `Ação ${actionIndex + 1} da etapa ${stepIndex}: use uma variável válida ou endereço Q/M.`, entityId: step.id, tab: 'steps' })
      }
      if (!validCondition(action.condition || '1')) {
        issues.push({ id: `${step.id}:action-condition:${actionIndex}`, level: 'error', message: `Condição inválida na ação ${actionIndex + 1} da etapa ${stepIndex}.`, entityId: step.id, tab: 'steps' })
      }
      if ((action.kind === 'D' || action.kind === 'L') && !(action.timeMs && action.timeMs > 0)) {
        issues.push({ id: `${step.id}:time:${actionIndex}`, level: 'warning', message: `A ação ${actionIndex + 1} da etapa ${stepIndex} (${action.kind}) precisa de um tempo maior que zero.`, entityId: step.id, tab: 'steps' })
      }
    })
  })

  // Alcançabilidade a partir das etapas iniciais.
  const reach = new Set(steps.filter((s) => s.initial || s.stepType === 'initial' || s.stepType === 'initial-enclosing').map((s) => s.id))
  let grew = true
  while (grew) {
    grew = false
    for (const t of transitions) {
      if (t.from.some((id) => reach.has(id))) {
        for (const id of t.to) {
          if (stepIds.has(id) && !reach.has(id)) {
            reach.add(id)
            grew = true
          }
        }
      }
    }
  }
  steps.forEach((step) => {
    if (!reach.has(step.id) && incoming.has(step.id)) {
      issues.push({ id: `${step.id}:unreachable`, level: 'warning', message: `A etapa ${label(step.id)} nunca é alcançada a partir da etapa inicial.`, entityId: step.id, tab: 'steps' })
    }
  })

  // Saída comandada por várias etapas sem qualificador S/R.
  const drivers = new Map<string, string[]>()
  steps.forEach((step) => actionsOfStep(step).forEach((a) => {
    const addr = normAddress(a.address || a.variable || '')
    if (addr && (a.kind ?? 'N') === 'N') {
      drivers.set(addr, [...(drivers.get(addr) ?? []), step.id])
    }
  }))
  for (const [address, list] of drivers) {
    if (new Set(list).size > 1) {
      issues.push({ id: `drive:${address}`, level: 'warning', message: `${address} é comandada por ${new Set(list).size} etapas — confirme que não estão ativas em simultâneo.`, entityId: list[0], tab: 'steps' })
    }
  }
  return issues
}
