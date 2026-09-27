export interface GrafcetAction { id: string; address: string; condition: string }
export interface GrafcetStep {
  id: string
  name: string
  initial: boolean
  action: string // ação legada; mantida para projetos anteriores
  condition: string // transição legada na sequência linear
  actions?: GrafcetAction[]
}
/** Uma transição pode ter várias origens (convergência AND) e vários destinos (divergência AND). */
export interface GrafcetTransition { id: string; from: string[]; to: string[]; condition: string }
export interface GrafcetProgram { steps: GrafcetStep[]; transitions?: GrafcetTransition[] }
export interface GrafcetRuntime { active: string[]; owned: string[] }
export const emptyGrafcet = (): GrafcetProgram => ({ steps: [], transitions: [] })
export const emptyGrafcetRuntime = (): GrafcetRuntime => ({ active: [], owned: [] })
export const validBit = (address: string) => /^[IQM]\d{1,2}$/.test(address)

/** Expressões booleanas: I1, !I2, (I1 & M1) | Q2, 1, 0.
 * A análise devolve false perante qualquer token inválido ou parêntese incompleto. */
export function validCondition(expression: string): boolean {
  return parseCondition(expression, {}) !== null
}
export function evalCondition(expression: string, table: Record<string, boolean>): boolean {
  return parseCondition(expression, table) ?? false
}
function parseCondition(expression: string, table: Record<string, boolean>): boolean | null {
  const src = expression.trim().toUpperCase()
  const tokens = src.match(/I\d{1,2}|Q\d{1,2}|M\d{1,2}|[!&|()01]/g)
  if (!tokens || tokens.join('') !== src.replace(/\s+/g, '')) return null
  let i = 0
  const atom = (): boolean | null => {
    const token = tokens[i++]
    if (token === '!') { const value = atom(); return value === null ? null : !value }
    if (token === '(') { const value = or(); if (tokens[i++] !== ')') return null; return value }
    if (token === '1' || token === '0') return token === '1'
    if (token && validBit(token)) return !!table[token]
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

/** As transições são avaliadas sobre o mesmo snapshot; um passo só participa
 * numa transição por scan (prioridade à ordem da lista). Divergência AND é
 * uma transição com múltiplos destinos; convergência AND requer TODAS as origens.
 */
export function scanGrafcet(program: GrafcetProgram, runtime: GrafcetRuntime, table: Record<string, boolean>): GrafcetRuntime {
  const steps = program.steps
  const ids = new Set(steps.map((step) => step.id))
  const kept = runtime.active.filter((id) => ids.has(id))
  const current = new Set(kept.length ? kept : steps.filter((step) => step.initial).map((step) => step.id))
  const snapshot = { ...table }
  const next = new Set(current)
  const consumed = new Set<string>()
  for (const transition of transitionsOf(program)) {
    if (!transition.from.length || !transition.to.length ||
        !transition.from.every((id) => current.has(id) && !consumed.has(id)) ||
        !transition.to.every((id) => ids.has(id)) ||
        !evalCondition(transition.condition, snapshot)) continue
    transition.from.forEach((id) => { next.delete(id); consumed.add(id) })
    transition.to.forEach((id) => next.add(id))
  }
  const actions = steps.flatMap((step) => [
    ...(step.action ? [{ address: step.action, condition: '1', stepId: step.id }] : []),
    ...(step.actions ?? []).map((a) => ({ ...a, stepId: step.id })),
  ])
  const owned = [...new Set(actions.map((a) => a.address.trim().toUpperCase()).filter((a) => /^[QM]\d{1,2}$/.test(a)))]
  for (const address of runtime.owned) if (!owned.includes(address)) table[address] = false
  for (const address of owned) table[address] = actions.some((a) => next.has(a.stepId) && a.address.trim().toUpperCase() === address && evalCondition(a.condition || '1', snapshot))
  return { active: [...next], owned }
}
