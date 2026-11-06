import { actionsOfStep, type GrafcetStep, type GrafcetTransition } from './engine'
import { EDITOR_GRID_STEP } from '../ui/editorTheme'

/** Coluna central (eixo vertical) das etapas no layout automático. */
export const SPINE_X = 151
/** Topo da primeira etapa no layout automático. */
export const START_Y = 78
/** Passo da grelha (px do diagrama) para encaixe das etapas. */
export const GRID = EDITOR_GRID_STEP
/** Limite mínimo para que laços de retorno à esquerda caibam na tela. */
export const MIN_X = 110
export const MIN_Y = 48
/** Distância entre colunas de ramos paralelos no "Organizar". */
export const COLUMN_WIDTH = 340
/** Altura da caixa da etapa. */
export const STEP_H = 54

/** Distância vertical entre duas etapas consecutivas na coluna, conforme o nº de ações. */
export const stepPitch = (actionCount: number) => Math.max(200, actionCount * 52 + 120)

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

/** Componente conexo via arestas não-dirigidas (um Grafcet independente). */
function connectedComponents(steps: GrafcetStep[], next: Map<string, string[]>): string[][] {
  const ids = steps.map((s) => s.id)
  const adj = new Map<string, Set<string>>()
  ids.forEach((id) => adj.set(id, new Set()))
  for (const [from, tos] of next) for (const to of tos) { adj.get(from)!.add(to); adj.get(to)!.add(from) }
  const visited = new Set<string>()
  const comps: string[][] = []
  for (const id of ids) if (!visited.has(id)) {
    const q = [id]; visited.add(id); const comp: string[] = []
    while (q.length) { const cur = q.shift()!; comp.push(cur); for (const nb of adj.get(cur) ?? []) if (!visited.has(nb)) { visited.add(nb); q.push(nb) } }
    comps.push(comp)
  }
  return comps
}

/** Layout de um único Grafcet conexo (camadas + colunas) — extraído para reuso por componente. */
function layoutSingleComponent(
  compSteps: GrafcetStep[],
  transitions: GrafcetTransition[],
  nextGlobal: Map<string, string[]>,
  order: Map<string, number>
): Map<string, { x: number; y: number }> {
  const ids = new Set(compSteps.map((s) => s.id))
  const next = new Map<string, string[]>()
  const prev = new Map<string, string[]>()
  compSteps.forEach((s) => { next.set(s.id, []); prev.set(s.id, []) })
  for (const t of transitions) for (const from of t.from) if (ids.has(from)) for (const to of t.to) if (ids.has(to) && to !== from) next.get(from)!.push(to)

  const isInitial = (s: GrafcetStep) => s.initial || s.stepType === 'initial' || s.stepType === 'initial-enclosing'
  const hasIncoming = new Set<string>(); next.forEach((tos) => tos.forEach((to) => hasIncoming.add(to)))
  let roots = compSteps.filter(isInitial).map((s) => s.id)
  if (!roots.length) roots = compSteps.filter((s) => !hasIncoming.has(s.id)).map((s) => s.id)
  if (!roots.length) roots = [compSteps[0].id]

  const state = new Map<string, 0 | 1 | 2>(); const back = new Set<string>()
  const visit = (id: string) => { state.set(id, 1); for (const to of next.get(id) ?? []) { const st = state.get(to) ?? 0; if (st === 1) back.add(`${id}>${to}`); else if (st === 0) visit(to) }; state.set(id, 2) }
  roots.forEach((r) => { if (!state.get(r)) visit(r) }); compSteps.forEach((s) => { if (!state.get(s.id)) visit(s.id) })

  const forward = new Map<string, string[]>(); compSteps.forEach((s) => forward.set(s.id, []))
  next.forEach((tos, from) => tos.forEach((to) => { if (!back.has(`${from}>${to}`)) { forward.get(from)!.push(to); prev.get(to)!.push(from) } }))

  const level = new Map<string, number>(); compSteps.forEach((s) => level.set(s.id, 0))
  const indeg = new Map<string, number>(); compSteps.forEach((s) => indeg.set(s.id, prev.get(s.id)!.length))
  const queue = compSteps.filter((s) => indeg.get(s.id) === 0).map((s) => s.id)
  while (queue.length) { const id = queue.shift()!; for (const to of forward.get(id) ?? []) { level.set(to, Math.max(level.get(to) ?? 0, (level.get(id) ?? 0) + 1)); indeg.set(to, (indeg.get(to) ?? 1) -1); if (indeg.get(to) === 0) queue.push(to) } }

  // Emergência / source: etapas não-iniciais sem entrada devem ir para o fundo, não para o topo
  const maxLv0 = Math.max(0, ...compSteps.map((s) => level.get(s.id) ?? 0))
  for (const s of compSteps) if (!isInitial(s) && (prev.get(s.id)!.length === 0) && !hasIncoming.has(s.id)) {
    const cur = level.get(s.id) ?? 0
    if (cur < maxLv0) level.set(s.id, maxLv0 + 1)
  }

  const maxLevel = Math.max(...compSteps.map((s) => level.get(s.id) ?? 0))
  const column = new Map<string, number>(); const levelTop: number[] = []; let cursor = 0
  for (let lv = 0; lv <= maxLevel; lv++) {
    const row = compSteps.filter((s) => (level.get(s.id) ?? 0) === lv)
    levelTop[lv] = cursor
    if (!row.length) { cursor += stepPitch(0); continue }
    const desired = new Map<string, number>()
    row.forEach((s) => { const parents = prev.get(s.id)!.filter((p) => column.has(p)); desired.set(s.id, parents.length ? parents.reduce((sum, p) => sum + column.get(p)!, 0) / parents.length : 0) })
    row.sort((a, b) => desired.get(a.id)! - desired.get(b.id)! || order.get(a.id)! - order.get(b.id)!)
    let last = -Infinity; row.forEach((s) => { const col = Math.max(Math.round(desired.get(s.id)!), last + 1); column.set(s.id, col); last = col })
    cursor += Math.max(...row.map((s) => stepPitch(actionsOfStep(s).length)))
  }
  const result = new Map<string, { x: number; y: number }>()
  compSteps.forEach((s) => { const lv = level.get(s.id) ?? 0; result.set(s.id, { x: (column.get(s.id) ?? 0) * COLUMN_WIDTH, y: levelTop[lv] ?? 0 }) })
  return result
}

/**
 * Layout em camadas para "Organizar": a profundidade de cada etapa é o caminho mais
 * longo a partir das etapas iniciais (ignorando arestas de retorno) e as etapas da
 * mesma camada (ramos simultâneos / alternativos) ficam em colunas lado a lado.
 * Multi-Grafcet (ATEC): cada componente conexo é desenhado isolado e depois ladrilhado
 * em grelha — evita que G0/G1/G2/manutenção se sobreponham.
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
  steps.forEach((s) => next.set(s.id, []))
  for (const t of transitions) for (const from of t.from) if (ids.has(from)) for (const to of t.to) if (ids.has(to) && to !== from) next.get(from)!.push(to)

  const comps = connectedComponents(steps, next)
  // Um só Grafcet → layout clássico sem ladrilhamento (mantém comportamento para prensa/portão)
  if (comps.length === 1) {
    const single = layoutSingleComponent(steps, transitions, next, order)
    for (const [id, pos] of single) result.set(id, { x: SPINE_X + pos.x, y: START_Y + pos.y })
    return result
  }

  // Ordena componentes como no ATEC: pelo menor nome numérico (1,11,81,141…) — estável e fiel ao manual
  const stepById = new Map(steps.map((s) => [s.id, s]))
  const compInfos = comps.map((ids) => {
    const compSteps = ids.map((id) => stepById.get(id)!).filter(Boolean)
    const minName = Math.min(...compSteps.map((s) => { const n = parseInt(s.name, 10); return Number.isFinite(n) ? n : 9999 }))
    return { ids, compSteps, minName }
  }).sort((a, b) => a.minName - b.minName || order.get(a.ids[0])! - order.get(b.ids[0])!)

  // Ladrilhamento em grelha — fiel ao ATEC: 3 Grafcets principais em cima (G0/G1/G2),
  // 5 manuais em baixo (G3-G7). Genérico: grandes (>5 etapas) em cima com 3 colunas,
  // pequenos (≤5) em baixo com 5 colunas. Evita sobreposição e replica o manual.
  const GAP_X = 420, GAP_Y = 320
  const LARGE_THRESH = 5
  const largeInfos = compInfos.filter((c) => c.compSteps.length > LARGE_THRESH)
  const smallInfos = compInfos.filter((c) => c.compSteps.length <= LARGE_THRESH)
  const groups: Array<{ infos: typeof compInfos; maxCols: number }> = []
  if (largeInfos.length) groups.push({ infos: largeInfos, maxCols: 3 })
  if (smallInfos.length) groups.push({ infos: smallInfos, maxCols: 5 })
  if (!groups.length) groups.push({ infos: compInfos, maxCols: 3 })

  let cursorY = 0
  for (const group of groups) {
    let col = 0, rowH = 0, cursorX = 0
    let groupStartY = cursorY
    let groupRowH = 0
    for (let idx = 0; idx < group.infos.length; idx++) {
      const { compSteps } = group.infos[idx]
      const local = layoutSingleComponent(compSteps, transitions, next, order)
      const xs = [...local.values()].map((p) => p.x), ys = [...local.values()].map((p) => p.y)
      const compW = (xs.length ? Math.max(...xs) - Math.min(...xs) : 0) + COLUMN_WIDTH
      const compH = (ys.length ? Math.max(...ys) - Math.min(...ys) : 0) + 180
      if (col >= group.maxCols) { col = 0; cursorX = 0; cursorY += rowH + GAP_Y; groupRowH += rowH + GAP_Y; rowH = 0 }
      const offsetX = cursorX, offsetY = cursorY
      for (const [id, pos] of local) result.set(id, { x: SPINE_X + offsetX + pos.x, y: START_Y + offsetY + pos.y })
      cursorX += compW + GAP_X
      rowH = Math.max(rowH, compH)
      col++
    }
    cursorY += rowH + GAP_Y
  }
  return result
}

// ---------------------------------------------------------------- tamanhos
/** Caixa da etapa por omissão (IEC 60848 no editor). */
export const STEP_W = 64
export const STEP_SIZE_LIMITS = { minW: 40, maxW: 260, minH: 36, maxH: 220 } as const
/** Caixa da ação por omissão. */
export const ACTION_SIZE = { w: 140, h: 30 } as const
export const ACTION_SIZE_LIMITS = { minW: 70, maxW: 420, minH: 22, maxH: 180 } as const

const clampTo = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value as number)) : fallback

export const stepSize = (step: { w?: number; h?: number } | undefined) => ({
  w: clampTo(step?.w, STEP_W, STEP_SIZE_LIMITS.minW, STEP_SIZE_LIMITS.maxW),
  h: clampTo(step?.h, STEP_H, STEP_SIZE_LIMITS.minH, STEP_SIZE_LIMITS.maxH),
})
export const actionSize = (action: { w?: number; h?: number } | undefined) => ({
  w: clampTo(action?.w, ACTION_SIZE.w, ACTION_SIZE_LIMITS.minW, ACTION_SIZE_LIMITS.maxW),
  h: clampTo(action?.h, ACTION_SIZE.h, ACTION_SIZE_LIMITS.minH, ACTION_SIZE_LIMITS.maxH),
})

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export type Box = { x: number; y: number; w: number; h: number }

/**
 * Redimensionamento por puxador. As faces mudam uma só dimensão; os cantos mudam as duas na mesma
 * proporção. `centered` (etapas): a largura cresce para os dois lados do eixo, por isso a face
 * este/oeste conta a dobrar e `x` é o eixo central; nas ações `x` é a esquerda.
 * `dx/dy` é o deslocamento do ponteiro em unidades do diagrama.
 */
export function resizeBox(start: Box, handle: ResizeHandle, dx: number, dy: number, limits: { minW: number; maxW: number; minH: number; maxH: number }, centered: boolean): Box {
  const east = handle.includes('e'), west = handle.includes('w'), south = handle.includes('s'), north = handle.includes('n')
  const horizontal = east ? dx : west ? -dx : 0
  const vertical = south ? dy : north ? -dy : 0
  let w = start.w + (centered ? 2 * horizontal : horizontal)
  let h = start.h + vertical
  if (handle.length === 2) {
    // Canto: escala proporcional pelo maior dos dois pedidos (o canto segue o ponteiro).
    const factor = Math.max(w / start.w, h / start.h)
    const minFactor = Math.max(limits.minW / start.w, limits.minH / start.h)
    const maxFactor = Math.min(limits.maxW / start.w, limits.maxH / start.h)
    const f = Math.min(maxFactor, Math.max(minFactor, factor))
    w = start.w * f
    h = start.h * f
  } else {
    w = Math.min(limits.maxW, Math.max(limits.minW, w))
    h = Math.min(limits.maxH, Math.max(limits.minH, h))
  }
  w = Math.round(w)
  h = Math.round(h)
  const x = centered ? start.x : west ? start.x + (start.w - w) : start.x
  const y = north ? start.y + (start.h - h) : start.y
  return { x, y, w, h }
}

/**
 * Deslocamento que devolve ao quadro um diagrama arrastado para lá da borda esquerda/de cima.
 * Recebe os limites (esquerda/topo) já calculados de todos os elementos da página; devolve
 * `{ dx: 0, dy: 0 }` quando nada saiu do quadro (diagramas existentes nunca mudam por acaso).
 */
export function originShift(minLeft: number, minTop: number, margin = { left: 40, top: MIN_Y }) {
  return {
    dx: minLeft < 0 ? Math.ceil(margin.left - minLeft) : 0,
    dy: minTop < 0 ? Math.ceil(margin.top - minTop) : 0,
  }
}
