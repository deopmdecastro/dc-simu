import type { GrafcetAction, GrafcetStep, GrafcetTransition } from './engine'
import { GRID, MIN_X, MIN_Y, SPINE_X, START_Y, STEP_H, snapToGrid } from './layout'

/**
 * Lógica pura do editor GRAFCET para trabalhar com várias etapas de uma vez:
 * seleção por retângulo, alinhamento, distribuição, arrasto em grupo e
 * copiar/colar de sub-diagramas. Não depende do React (testável com `npm test`).
 */

/** Meia-largura da caixa da etapa no diagrama. */
export const STEP_HALF_W = 32

export interface Pos {
  id: string
  x: number
  y: number
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Normaliza dois cantos arbitrários num retângulo com x0 ≤ x1 e y0 ≤ y1. */
export const rectFromPoints = (ax: number, ay: number, bx: number, by: number): Rect => ({
  x0: Math.min(ax, bx),
  y0: Math.min(ay, by),
  x1: Math.max(ax, bx),
  y1: Math.max(ay, by),
})

/** true se a caixa da etapa (centro x, topo y) toca o retângulo. */
export const stepTouchesRect = (x: number, y: number, rect: Rect): boolean =>
  x + STEP_HALF_W >= rect.x0 && x - STEP_HALF_W <= rect.x1 && y + STEP_H >= rect.y0 && y <= rect.y1

/** Ids das etapas cuja caixa toca o retângulo, pela ordem recebida. */
export const stepsInRect = (items: Pos[], rect: Rect): string[] => items.filter((item) => stepTouchesRect(item.x, item.y, rect)).map((item) => item.id)

/** União sem repetições, mantendo a ordem de `base` e depois a de `extra`. */
export const unionIds = (base: string[], extra: string[]): string[] => {
  const seen = new Set(base)
  const out = [...base]
  for (const value of extra) {
    if (!seen.has(value)) {
      seen.add(value)
      out.push(value)
    }
  }
  return out
}

/** Liga/desliga um id numa seleção (útil para Shift/Ctrl+clique). */
export const toggleId = (ids: string[], value: string): string[] => (ids.includes(value) ? ids.filter((v) => v !== value) : [...ids, value])

/**
 * Limita o deslocamento de um grupo para que nenhuma etapa saia da área mínima
 * do diagrama (mantém a forma do grupo em vez de o achatar contra a borda).
 */
export function clampGroupDelta(items: Pos[], dx: number, dy: number): { dx: number; dy: number } {
  if (!items.length) return { dx, dy }
  const minX = Math.min(...items.map((item) => item.x))
  const minY = Math.min(...items.map((item) => item.y))
  return { dx: Math.max(dx, MIN_X - minX), dy: Math.max(dy, MIN_Y - minY) }
}

export type AlignMode = 'axis' | 'top'
export type DistributeAxis = 'h' | 'v'

/** Alinha as etapas ao mesmo eixo vertical (x médio, encaixado) ou ao mesmo topo (y mínimo). */
export function alignPositions(items: Pos[], mode: AlignMode): Pos[] {
  if (items.length < 2) return items
  if (mode === 'axis') {
    const mean = items.reduce((sum, item) => sum + item.x, 0) / items.length
    const x = Math.max(MIN_X, snapToGrid(mean, SPINE_X))
    return items.map((item) => ({ ...item, x }))
  }
  const y = Math.min(...items.map((item) => item.y))
  return items.map((item) => ({ ...item, y }))
}

/**
 * Distribui as etapas com espaçamento igual entre os centros, mantendo as duas
 * das pontas onde estão. Precisa de, pelo menos, três etapas.
 */
export function distributePositions(items: Pos[], axis: DistributeAxis): Pos[] {
  if (items.length < 3) return items
  const key = axis === 'h' ? 'x' : 'y'
  const sorted = [...items].sort((a, b) => a[key] - b[key])
  const first = sorted[0][key]
  const last = sorted[sorted.length - 1][key]
  const gap = (last - first) / (sorted.length - 1)
  const placed = new Map(sorted.map((item, index) => [item.id, Math.round(first + gap * index)]))
  return items.map((item) => ({ ...item, [key]: placed.get(item.id) ?? item[key] }))
}

export interface SubDiagram {
  steps: GrafcetStep[]
  transitions: GrafcetTransition[]
}

/**
 * Copia as etapas indicadas (com as respetivas ações) e as transições que ligam
 * apenas etapas copiadas. Gera ids novos e desloca tudo por (dx, dy).
 * A etapa inicial copiada deixa de ser inicial, para não duplicar o arranque.
 */
export function cloneSubDiagram(
  steps: GrafcetStep[],
  transitions: GrafcetTransition[],
  ids: string[],
  where: (stepId: string) => { x: number; y: number },
  offset: { dx: number; dy: number },
  newId: () => string,
  suffix = ' (cópia)'
): SubDiagram {
  const wanted = new Set(ids)
  const picked = steps.filter((step) => wanted.has(step.id))
  const remap = new Map(picked.map((step) => [step.id, newId()]))
  const copiedSteps: GrafcetStep[] = picked.map((step) => {
    const at = where(step.id)
    const clone: GrafcetStep = {
      ...step,
      id: remap.get(step.id)!,
      name: `${step.name}${suffix}`,
      initial: false,
      actions: (step.actions ?? []).map((action: GrafcetAction) => ({ ...action, id: newId() })),
      x: Math.max(MIN_X, Math.round(at.x + offset.dx)),
      y: Math.max(MIN_Y, Math.round(at.y + offset.dy)),
      pinned: true,
    }
    if (step.stepType === 'initial') clone.stepType = undefined
    if (step.stepType === 'initial-enclosing') clone.stepType = 'enclosing'
    return clone
  })
  const copiedTransitions: GrafcetTransition[] = transitions
    .filter((t) => t.from.length > 0 && t.to.length > 0 && t.from.every((v) => wanted.has(v)) && t.to.every((v) => wanted.has(v)))
    .map((t) => ({
      ...t,
      id: newId(),
      from: t.from.map((v) => remap.get(v)!),
      to: t.to.map((v) => remap.get(v)!),
      ...(t.x !== undefined ? { x: t.x + offset.dx } : {}),
      ...(t.y !== undefined ? { y: t.y + offset.dy } : {}),
    }))
  return { steps: copiedSteps, transitions: copiedTransitions }
}

/** Posição de arranque sensata quando uma etapa ainda não tem posição manual. */
export const fallbackPos = (index: number): { x: number; y: number } => ({ x: SPINE_X, y: START_Y + index * GRID * 7 })

/** Caixa envolvente de um conjunto de etapas (null se vazio), para "zoom à seleção". */
export function boundsOf(items: Pos[], padding = 0): Rect | null {
  if (!items.length) return null
  return {
    x0: Math.min(...items.map((i) => i.x)) - STEP_HALF_W - padding,
    y0: Math.min(...items.map((i) => i.y)) - padding,
    x1: Math.max(...items.map((i) => i.x)) + STEP_HALF_W + padding,
    y1: Math.max(...items.map((i) => i.y)) + STEP_H + padding,
  }
}

/**
 * Calcula escala e deslocamento (pan) para enquadrar um retângulo do diagrama
 * no centro de uma janela vw×vh ("zoom à seleção"). A escala fica entre min e max.
 */
export function fitView(rect: Rect, vw: number, vh: number, minScale: number, maxScale: number, margin = 48): { scale: number; x: number; y: number } {
  const w = Math.max(1, rect.x1 - rect.x0)
  const h = Math.max(1, rect.y1 - rect.y0)
  const scale = Math.max(minScale, Math.min(maxScale, (vw - margin * 2) / w, (vh - margin * 2) / h))
  return { scale, x: (vw - w * scale) / 2 - rect.x0 * scale, y: (vh - h * scale) / 2 - rect.y0 * scale }
}
