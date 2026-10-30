import type { GrafcetAction } from './engine'

export type ActionBox = { x: number; y: number; w: number; h: number; offset: boolean; flowIndex: number; afterActionId?: string }
type Point = { x: number; y: number }
type Size = { w: number; h: number }

/** Resolve cadeias dentro da etapa, tolerando referências ausentes e ciclos em ficheiros importados. */
export function attachedActionBoxes(
  actions: GrafcetAction[], step: Point & Size, layout: 'row' | 'column',
  sizeOf: (action: GrafcetAction) => Size,
  livePosition: (action: GrafcetAction) => Point | undefined = () => undefined,
): Map<string, ActionBox> {
  const byId = new Map(actions.map(action => [action.id, action]))
  const parents = new Map<string, string>()
  for (const action of actions) {
    let current: GrafcetAction | undefined = action
    const seen = new Set<string>()
    while (current?.afterActionId && byId.has(current.afterActionId) && !seen.has(current.id)) {
      seen.add(current.id)
      current = byId.get(current.afterActionId)
    }
    if (action.afterActionId && byId.has(action.afterActionId) && current && !seen.has(current.id)) parents.set(action.id, action.afterActionId)
  }
  const out = new Map<string, ActionBox>()
  const isOffset = (a: GrafcetAction) => Number.isFinite(a.dx) && Number.isFinite(a.dy)
  const roots = actions.filter(a => !parents.has(a.id))
  const overlaps = (a: Point & Size, b: Point & Size) => a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01
  const clearSlot = (box: Point & Size, axis: 'x' | 'y') => {
    let hits: ActionBox[]
    while ((hits = [...out.values()].filter(other => overlaps(box, other))).length) {
      if (axis === 'x') box.x = Math.max(...hits.map(other => other.x + other.w))
      else box.y = Math.max(...hits.map(other => other.y + other.h + 8))
    }
    return box
  }
  // Reservar primeiro as posições explícitas: os encaixes automáticos não podem cobrir ações importadas.
  for (const action of roots.filter(isOffset)) {
    out.set(action.id, { ...sizeOf(action), x: step.x + action.dx!, y: step.y + action.dy!, ...livePosition(action), offset: true, flowIndex: -1 })
  }
  const childrenOf = (parent: GrafcetAction): void => {
    let previous = out.get(parent.id)!
    for (const child of actions.filter(a => parents.get(a.id) === parent.id)) {
      const size = sizeOf(child)
      const pos = livePosition(child)
      const box = pos ? { ...size, ...pos } : clearSlot({ ...size, x: previous.x + previous.w, y: previous.y + (previous.h - size.h) / 2 }, 'x')
      out.set(child.id, { ...box, offset: false, flowIndex: -1, afterActionId: parent.id })
      childrenOf(child)
      previous = out.get(child.id)!
    }
  }
  roots.filter(isOffset).forEach(childrenOf)
  const baseX = step.x + step.w / 2 + 48
  let rowX = baseX, colY: number | undefined, flowIndex = 0
  for (const action of roots.filter(a => !isOffset(a))) {
    const size = sizeOf(action)
    colY ??= step.y + (step.h - size.h) / 2
    const pos = livePosition(action)
    const box = pos ? { ...size, ...pos } : clearSlot({ ...size, x: layout === 'row' ? rowX : baseX, y: layout === 'row' ? step.y + (step.h - size.h) / 2 : colY }, layout === 'row' ? 'x' : 'y')
    out.set(action.id, { ...box, offset: false, flowIndex: flowIndex++ })
    childrenOf(action)
    rowX = Math.max(...[...out.values()].map(b => b.x + b.w), box.x + box.w)
    colY = Math.max(...[...out.values()].map(b => b.y + b.h + 8), box.y + box.h + 8)
  }
  return out
}

/** Copiar uma etapa preserva as ligações entre as suas ações com identificadores novos. */
export function cloneActions(actions: GrafcetAction[], newId: () => string): GrafcetAction[] {
  const ids = new Map(actions.map(a => [a.id, newId()]))
  return actions.map(a => ({ ...a, id: ids.get(a.id)!, afterActionId: a.afterActionId ? ids.get(a.afterActionId) : undefined }))
}
