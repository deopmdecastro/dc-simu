import { actionsOfStep, type GrafcetStep, type GrafcetTransition } from './engine'

/** Coluna central (eixo vertical) das etapas no layout automático. */
export const SPINE_X = 151
/** Topo da primeira etapa no layout automático. */
export const START_Y = 70
/** Passo da grelha (px do diagrama) para encaixe das etapas. */
export const GRID = 20
/** Limite mínimo para que laços de retorno à esquerda caibam na tela. */
export const MIN_X = 110
export const MIN_Y = 48
/** Distância entre colunas de ramos paralelos no "Organizar". */
export const COLUMN_WIDTH = 260
/** Altura da caixa da etapa. */
export const STEP_H = 54

/** Distância vertical entre duas etapas consecutivas na coluna, conforme o nº de ações. */
export const stepPitch = (actionCount: number) => Math.max(140, actionCount * 36 + 88)

/** Encaixa `value` na grelha cuja origem é `origin`. */
export const snapToGrid = (value: number, origin: number, grid = GRID) => Math.round((value - origin) / grid) * grid + origin

export const clampPosition = (x: number, y: number) => ({ x: Math.max(MIN_X, x), y: Math.max(MIN_Y, y) })

export interface GuideResult {
  x: number
  y: number
  guideX: number | null
  guideY: number | null
}

/**
 * Alinha (x, y) ao eixo central / topo de outras etapas quando estiver a menos de
 * `threshold` px, devolvendo as guias a desenhar. Escolhe sempre a etapa mais próxima.
 */
export function alignToOthers(
  x: number,
  y: number,
  others: Array<{ x: number; y: number }>,
  threshold: number
): GuideResult {
  let bestX: number | null = null
  let bestY: number | null = null
  let diffX = threshold + 1
  let diffY = threshold + 1
  for (const other of others) {
    const dx = Math.abs(other.x - x)
    const dy = Math.abs(other.y - y)
    if (dx <= threshold && dx < diffX) {
      diffX = dx
      bestX = other.x
    }
    if (dy <= threshold && dy < diffY) {
      diffY = dy
      bestY = other.y
    }
  }
  return { x: bestX ?? x, y: bestY ?? y, guideX: bestX, guideY: bestY }
}

/**
 * Procura uma posição livre a partir de (x, y), deslocando para a direita
 * enquanto houver outra etapa demasiado perto.
 */
export function findFreeSlot(
  x: number,
  y: number,
  others: Array<{ x: number; y: number }>,
  pitchY = 120,
  stepX = COLUMN_WIDTH / 2
): { x: number; y: number } {
  let cx = x
  for (let guard = 0; guard < 24; guard++) {
    const clash = others.some((o) => Math.abs(o.x - cx) < 90 && Math.abs(o.y - y) < pitchY * 0.8)
    if (!clash) break
    cx += stepX
  }
  return { x: cx, y }
}

/**
 * Layout em camadas para "Organizar": a profundidade de cada etapa é o caminho mais
 * longo a partir das etapas iniciais (ignorando arestas de retorno) e as etapas da
 * mesma camada (ramos simultâneos / alternativos) ficam em colunas lado a lado.
 */
export function autoLayout(
  steps: GrafcetStep[],
  transitions: GrafcetTransition[]
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  if (!steps.length) return result

  const ids = new Set(steps.map((s) => s.id))
  const order = new Map(steps.map((s, i) => [s.id, i]))
  const next = new Map<string, string[]>()
  const prev = new Map<string, string[]>()
  steps.forEach((s) => {
    next.set(s.id, [])
    prev.set(s.id, [])
  })
  for (const t of transitions) {
    for (const from of t.from) {
      if (!ids.has(from)) continue
      for (const to of t.to) {
        if (!ids.has(to) || to === from) continue
        next.get(from)!.push(to)
      }
    }
  }

  const isInitial = (s: GrafcetStep) => s.initial || s.stepType === 'initial' || s.stepType === 'initial-enclosing'
  const hasIncoming = new Set<string>()
  next.forEach((targets) => targets.forEach((t) => hasIncoming.add(t)))
  let roots = steps.filter(isInitial).map((s) => s.id)
  if (!roots.length) roots = steps.filter((s) => !hasIncoming.has(s.id)).map((s) => s.id)
  if (!roots.length) roots = [steps[0].id]

  // DFS para marcar arestas de retorno (ciclos) e obter uma ordenação topológica.
  const state = new Map<string, 0 | 1 | 2>()
  const back = new Set<string>()
  const visit = (id: string) => {
    state.set(id, 1)
    for (const to of next.get(id) ?? []) {
      const st = state.get(to) ?? 0
      if (st === 1) back.add(`${id}>${to}`)
      else if (st === 0) visit(to)
    }
    state.set(id, 2)
  }
  roots.forEach((r) => {
    if (!state.get(r)) visit(r)
  })
  steps.forEach((s) => {
    if (!state.get(s.id)) visit(s.id)
  })

  const forward = new Map<string, string[]>()
  steps.forEach((s) => forward.set(s.id, []))
  next.forEach((targets, from) =>
    targets.forEach((to) => {
      if (!back.has(`${from}>${to}`)) {
        forward.get(from)!.push(to)
        prev.get(to)!.push(from)
      }
    })
  )

  // Camada = caminho mais longo desde uma raiz (relaxamento sobre o DAG).
  const level = new Map<string, number>()
  steps.forEach((s) => level.set(s.id, 0))
  const indeg = new Map<string, number>()
  steps.forEach((s) => indeg.set(s.id, prev.get(s.id)!.length))
  const queue = steps.filter((s) => indeg.get(s.id) === 0).map((s) => s.id)
  while (queue.length) {
    const id = queue.shift()!
    for (const to of forward.get(id) ?? []) {
      level.set(to, Math.max(level.get(to) ?? 0, (level.get(id) ?? 0) + 1))
      indeg.set(to, (indeg.get(to) ?? 1) - 1)
      if (indeg.get(to) === 0) queue.push(to)
    }
  }

  const maxLevel = Math.max(...steps.map((s) => level.get(s.id) ?? 0))
  const column = new Map<string, number>()
  const levelTop: number[] = []
  let cursor = START_Y

  for (let lv = 0; lv <= maxLevel; lv++) {
    const row = steps.filter((s) => (level.get(s.id) ?? 0) === lv)
    levelTop[lv] = cursor
    if (!row.length) {
      cursor += stepPitch(0)
      continue
    }
    const desired = new Map<string, number>()
    row.forEach((s) => {
      const parents = prev.get(s.id)!.filter((p) => column.has(p))
      desired.set(s.id, parents.length ? parents.reduce((sum, p) => sum + column.get(p)!, 0) / parents.length : 0)
    })
    row.sort((a, b) => desired.get(a.id)! - desired.get(b.id)! || order.get(a.id)! - order.get(b.id)!)
    let last = -Infinity
    row.forEach((s) => {
      const col = Math.max(Math.round(desired.get(s.id)!), last + 1)
      column.set(s.id, col)
      last = col
    })
    cursor += Math.max(...row.map((s) => stepPitch(actionsOfStep(s).length)))
  }

  steps.forEach((s) => {
    const lv = level.get(s.id) ?? 0
    result.set(s.id, { x: SPINE_X + (column.get(s.id) ?? 0) * COLUMN_WIDTH, y: levelTop[lv] ?? START_Y })
  })
  return result
}
