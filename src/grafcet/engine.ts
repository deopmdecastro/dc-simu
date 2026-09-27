export interface GrafcetStep {
  id: string
  name: string
  initial: boolean
  action: string // Qn ou Mn; vazio = sem ação
  condition: string // In/Mn/Qn, !In, ou 1 (incondicional)
}
export interface GrafcetProgram { steps: GrafcetStep[] }
export interface GrafcetRuntime { active: string[]; owned: string[] }
export const emptyGrafcet = (): GrafcetProgram => ({ steps: [] })
export const emptyGrafcetRuntime = (): GrafcetRuntime => ({ active: [], owned: [] })
export const validBit = (address: string) => /^[IQM]\d{1,2}$/.test(address)
export function evalCondition(condition: string, table: Record<string, boolean>): boolean {
  const value = condition.trim().toUpperCase()
  if (value === '1') return true
  if (value.startsWith('!') && validBit(value.slice(1))) return !table[value.slice(1)]
  return validBit(value) ? !!table[value] : false
}
/** Transições síncronas: cada etapa só avança uma vez por varrimento.
 * A última etapa regressa à inicial; sem etapas iniciais não há execução.
 * As ações são contínuas (ativas enquanto a etapa estiver ativa).
 */
export function scanGrafcet(program: GrafcetProgram, runtime: GrafcetRuntime, table: Record<string, boolean>): GrafcetRuntime {
  const steps = program.steps
  const ids = new Set(steps.map((step) => step.id))
  const active = runtime.active.filter((id) => ids.has(id))
  const current = active.length ? active : steps.filter((step) => step.initial).map((step) => step.id)
  // Ler transições antes de escrever ações impede auto-realimentação no mesmo scan.
  const next = new Set(current)
  steps.forEach((step, index) => {
    if (!current.includes(step.id) || !evalCondition(step.condition, table)) return
    next.delete(step.id)
    next.add(steps[(index + 1) % steps.length].id)
  })
  const owned = [...new Set(steps.map((step) => step.action.trim().toUpperCase()).filter((a) => /^[QM]\d{1,2}$/.test(a)))]
  // Endereços já não usados pelo GRAFCET ficam desligados (não permanecem presos).
  for (const address of runtime.owned) if (!owned.includes(address)) table[address] = false
  for (const address of owned) table[address] = steps.some((step) => next.has(step.id) && step.action.trim().toUpperCase() === address)
  return { active: [...next], owned }
}
