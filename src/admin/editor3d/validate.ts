import type { CatalogMeta, ComponentDefinition } from '../../catalog/types'

export interface Issue { level: 'error' | 'warn'; text: string }

/** Verificações antes de publicar: erros bloqueiam, avisos informam. */
export function validateDefinition(def: ComponentDefinition, meta: CatalogMeta): Issue[] {
  const issues: Issue[] = []
  if (!meta.name.trim()) issues.push({ level: 'error', text: 'O componente precisa de um nome.' })
  const drawable = def.parts.filter((part) => part.kind !== 'group')
  if (drawable.length === 0) issues.push({ level: 'error', text: 'Adicione pelo menos uma peça com geometria.' })
  const labels = new Map<string, number>()
  def.terminals.forEach((terminal) => labels.set(terminal.label, (labels.get(terminal.label) ?? 0) + 1))
  for (const [label, count] of labels) if (count > 1) issues.push({ level: 'error', text: `O rótulo de borne «${label}» está repetido ${count}×. Os rótulos têm de ser únicos.` })
  def.terminals.forEach((terminal) => { if (!terminal.label.trim()) issues.push({ level: 'error', text: `O borne «${terminal.name}» não tem rótulo.` }) })
  if (def.terminals.length === 0) issues.push({ level: 'warn', text: 'Sem bornes: o componente não poderá ser ligado com cabos.' })
  const partIds = new Set(def.parts.map((part) => part.id))
  def.lights.forEach((light) => { if (!partIds.has(light.partId)) issues.push({ level: 'error', text: `A zona luminosa «${light.name}» aponta para uma peça inexistente.` }) })
  const stateIds = new Set(def.states.map((state) => state.id))
  def.interactions.forEach((item) => {
    if (item.partId && !partIds.has(item.partId)) issues.push({ level: 'error', text: `A interação «${item.name}» aponta para uma peça inexistente.` })
    if (item.actions.length === 0) issues.push({ level: 'warn', text: `A interação «${item.name}» não tem ações.` })
    for (const action of item.actions) {
      const used = action.type === 'toggleState' ? [action.a, action.b] : action.type === 'cycleStates' ? action.states : [action.state]
      for (const id of used) if (!stateIds.has(id)) issues.push({ level: 'error', text: `A interação «${item.name}» usa um estado que já não existe.` })
    }
  })
  const names = new Set<string>()
  def.parts.forEach((part) => { if (!/^[A-Za-z0-9_]+$/.test(part.id)) issues.push({ level: 'error', text: `Identificador interno inválido na peça «${part.name}».` }); names.add(part.id) })
  if (def.states.length < 2 && def.interactions.length > 0) issues.push({ level: 'warn', text: 'Há interações mas só existe um estado.' })
  if (def.parts.some((part) => part.kind === 'glb' && !part.asset)) issues.push({ level: 'warn', text: 'Uma peça GLB não tem modelo associado.' })
  return issues
}
