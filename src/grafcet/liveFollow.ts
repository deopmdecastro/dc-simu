import {
  grafcetGraphs,
  stepNumberOf,
  transitionsOf,
  type GrafcetProgram,
  type GrafcetStep,
  type GrafcetTransition,
} from './engine'

/** Unidade independente de GRAFCET para monitorização ao vivo (página `chart` ou sub-GRAFCET autónomo). */
export interface LiveGrafcetUnit {
  id: string
  number: number
  key: string
  title: string
  chartId?: string
  /** Definido apenas quando vários GRAFCETs independentes partilham a mesma página. */
  stepIds?: string[]
  allStepIds: string[]
  initialStepIds: string[]
  transitionCount: number
}

export interface LiveUnitStatus {
  unit: LiveGrafcetUnit
  activeStepIds: string[]
  activeLabels: string[]
  activeComment: string
  /** Etapas a enquadrar automaticamente: ativas em execução, ou iniciais/primeira em repouso. */
  focusStepIds: string[]
  isActive: boolean
  /** Verdadeiro quando pelo menos uma etapa ativa já avançou para lá da etapa inicial. */
  isProgressed: boolean
  lastChangeSeq: number
}

/** Formata sempre o código normalizado `X<n>` (evita mostrar apenas «0» para `X0`). */
export function formatLiveStepCode(step: GrafcetStep, globalIndex: number): string {
  const raw = String(stepNumberOf(step, globalIndex)).trim()
  if (!raw) return `X${globalIndex}`
  return /^x/i.test(raw) ? `X${raw.slice(1)}` : `X${raw}`
}

/** Remove o prefixo `G<n> - ` quando o código `G<n>` já é exibido em etiqueta própria. */
function cleanUnitTitle(raw: string, key: string, fallback: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  const stripped = trimmed.replace(new RegExp(`^${key}\\s*(?:[-–—·:]\\s*)?`, 'i'), '').trim()
  return stripped || trimmed
}

function countTransitionsForSteps(transitions: GrafcetTransition[], stepSet: Set<string>): number {
  let count = 0
  for (const t of transitions) {
    if (t.from.some((id) => stepSet.has(id)) || t.to.some((id) => stepSet.has(id))) count += 1
  }
  return count
}

/**
 * Deteta sub-GRAFCETs desconexos na mesma página (ex.: sequência principal à esquerda
 * e sequência auxiliar/segurança à direita sem transições entre si).
 */
function disconnectedSubUnits(
  steps: GrafcetStep[],
  transitions: GrafcetTransition[],
  chartId: string | undefined,
): LiveGrafcetUnit[] | null {
  if (steps.length < 2) return null
  const byId = new Map(steps.map((s) => [s.id, s]))
  const adj = new Map<string, Set<string>>()
  for (const s of steps) adj.set(s.id, new Set())

  for (const t of transitions) {
    const linked = [...t.from, ...t.to].filter((id) => byId.has(id))
    for (let i = 0; i < linked.length; i += 1) {
      for (let j = i + 1; j < linked.length; j += 1) {
        adj.get(linked[i])!.add(linked[j])
        adj.get(linked[j])!.add(linked[i])
      }
    }
  }

  const visited = new Set<string>()
  const rawGroups: GrafcetStep[][] = []
  for (const s of steps) {
    if (visited.has(s.id)) continue
    const group: GrafcetStep[] = []
    const queue = [s.id]
    visited.add(s.id)
    while (queue.length) {
      const cur = queue.shift()!
      const step = byId.get(cur)
      if (step) group.push(step)
      for (const next of adj.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next)
          queue.push(next)
        }
      }
    }
    rawGroups.push(group)
  }

  // Só considera GRAFCET autónomo um grupo ligado (≥ 2 etapas) ou com etapa inicial própria.
  const mainGroups = rawGroups.filter((g) => g.length >= 2 || g.some((s) => s.initial))
  if (mainGroups.length < 2) return null

  const centerOf = (g: GrafcetStep[]) => ({
    x: g.reduce((acc, s) => acc + (s.x ?? 180), 0) / g.length,
    y: g.reduce((acc, s) => acc + (s.y ?? 60), 0) / g.length,
  })

  // Etapas soltas em rascunho (1 etapa não inicial sem ligações) juntam-se ao sub-GRAFCET mais próximo.
  for (const g of rawGroups) {
    if (mainGroups.includes(g)) continue
    const p = centerOf(g)
    let best = mainGroups[0]
    let bestDist = Infinity
    for (const candidate of mainGroups) {
      const c = centerOf(candidate)
      const d = Math.hypot(p.x - c.x, p.y - c.y)
      if (d < bestDist) {
        bestDist = d
        best = candidate
      }
    }
    best.push(...g)
  }

  mainGroups.sort((a, b) => {
    const ax = Math.min(...a.map((s) => s.x ?? 180))
    const bx = Math.min(...b.map((s) => s.x ?? 180))
    if (Math.abs(ax - bx) > 24) return ax - bx
    const ay = Math.min(...a.map((s) => s.y ?? 60))
    const by = Math.min(...b.map((s) => s.y ?? 60))
    return ay - by
  })

  return mainGroups.map((group, idx) => {
    const allStepIds = group.map((s) => s.id)
    const stepSet = new Set(allStepIds)
    const key = `G${idx}`
    const initial = group.find((s) => s.initial) ?? group[0]
    const hint = (initial?.description || initial?.comment || '').trim()
    return {
      id: `sub:${chartId ?? 'main'}:${group[0].id}`,
      number: idx,
      key,
      title: hint || `GRAFCET ${idx + 1}`,
      chartId,
      stepIds: allStepIds,
      allStepIds,
      initialStepIds: group.filter((s) => s.initial).map((s) => s.id),
      transitionCount: countTransitionsForSteps(transitions, stepSet),
    }
  })
}

/**
 * Identifica todos os GRAFCETs do projeto:
 * 1. Páginas (`program.charts`: G0, G1, G2…), incluindo sub-GRAFCETs titulados `G<n>` na mesma página;
 * 2. Títulos `G<n> - …` numa página única;
 * 3. Sub-GRAFCETs independentes (desconexos) desenhados lado a lado na mesma página.
 */
export function resolveLiveGrafcetUnits(program: GrafcetProgram): LiveGrafcetUnit[] {
  const allSteps = program.steps ?? []
  if (!allSteps.length) return []
  const allTransitions = transitionsOf(program)
  const charts = program.charts ?? []
  const firstChartId = charts[0]?.id
  const graphs = grafcetGraphs(program).filter((g) => g.steps.length > 0)

  if (charts.length > 1) {
    const units: LiveGrafcetUnit[] = []
    charts.forEach((chart, idx) => {
      const pageSteps = allSteps.filter((s) => (s.chart ?? firstChartId) === chart.id)
      if (!pageSteps.length) return
      const pageTransitions = allTransitions.filter((t) => (t.chart ?? firstChartId) === chart.id)
      const titledOnPage = graphs.filter((g) => (g.chartId ?? firstChartId) === chart.id && g.steps.length > 0)
      if (titledOnPage.length > 1) {
        for (const g of titledOnPage) {
          const allStepIds = g.steps.map((s) => s.id)
          const stepSet = new Set(allStepIds)
          units.push({
            id: `graph:${chart.id}:${g.number}`,
            number: g.number,
            key: g.key,
            title: cleanUnitTitle(g.label, g.key, chart.title || chart.name || `Página ${idx + 1}`),
            chartId: chart.id,
            stepIds: allStepIds,
            allStepIds,
            initialStepIds: g.steps.filter((s) => s.initial).map((s) => s.id),
            transitionCount: countTransitionsForSteps(pageTransitions, stepSet),
          })
        }
        return
      }
      const rawLabel = (chart.title || chart.name || `Página ${idx + 1}`).trim()
      const match = /^\s*G(\d+)\b/i.exec(rawLabel)
      const number = match ? Number(match[1]) : idx
      const key = `G${number}`
      const allStepIds = pageSteps.map((s) => s.id)
      units.push({
        id: `chart:${chart.id}`,
        number,
        key,
        title: cleanUnitTitle(rawLabel, key, `Página ${idx + 1}`),
        chartId: chart.id,
        allStepIds,
        initialStepIds: pageSteps.filter((s) => s.initial).map((s) => s.id),
        transitionCount: pageTransitions.length,
      })
    })
    return units
  }

  // Página única com múltiplos títulos `G0 - …`, `G1 - …`
  if (graphs.length > 1) {
    return graphs.map((g) => {
      const allStepIds = g.steps.map((s) => s.id)
      const stepSet = new Set(allStepIds)
      return {
        id: `graph:${g.number}`,
        number: g.number,
        key: g.key,
        title: cleanUnitTitle(g.label, g.key, `GRAFCET ${g.number}`),
        chartId: firstChartId,
        stepIds: allStepIds,
        allStepIds,
        initialStepIds: g.steps.filter((s) => s.initial).map((s) => s.id),
        transitionCount: countTransitionsForSteps(allTransitions, stepSet),
      }
    })
  }

  // Página única com dois ou mais GRAFCETs independentes (sem transições entre si)
  const subUnits = disconnectedSubUnits(allSteps, allTransitions, firstChartId)
  if (subUnits) return subUnits

  // Um único GRAFCET
  const rawLabel = (charts[0]?.title || charts[0]?.name || program.name || 'GRAFCET').trim() || 'GRAFCET'
  return [{
    id: firstChartId ? `chart:${firstChartId}` : 'graph:0',
    number: 0,
    key: 'G0',
    title: cleanUnitTitle(rawLabel, 'G0', rawLabel),
    chartId: firstChartId,
    allStepIds: allSteps.map((s) => s.id),
    initialStepIds: allSteps.filter((s) => s.initial).map((s) => s.id),
    transitionCount: allTransitions.length,
  }]
}

/** Calcula o estado instantâneo de cada GRAFCET (etapas ativas, etiquetas e alvo de foco automático). */
export function computeLiveUnitStatuses(
  program: GrafcetProgram,
  units: LiveGrafcetUnit[],
  activeIds: readonly string[],
  changeSeqByUnit?: ReadonlyMap<string, number>,
): LiveUnitStatus[] {
  const activeSet = new Set(activeIds)
  const stepIndex = new Map<string, number>()
  program.steps.forEach((step, idx) => stepIndex.set(step.id, idx))

  return units.map((unit) => {
    const activeStepIds = unit.allStepIds.filter((id) => activeSet.has(id))
    const initialSet = new Set(unit.initialStepIds)
    const activeLabels = activeStepIds.map((id) => {
      const idx = stepIndex.get(id) ?? 0
      const step = program.steps[idx]
      return step ? formatLiveStepCode(step, idx) : id
    })
    let activeComment = ''
    if (activeStepIds.length) {
      const firstIdx = stepIndex.get(activeStepIds[0]) ?? -1
      const firstStep = firstIdx >= 0 ? program.steps[firstIdx] : undefined
      activeComment = (firstStep?.description || firstStep?.comment || '').trim()
    }
    const focusStepIds = activeStepIds.length
      ? activeStepIds
      : unit.initialStepIds.length
        ? unit.initialStepIds
        : unit.allStepIds.slice(0, 1)
    const isProgressed = activeStepIds.some((id) => !initialSet.has(id))
    return {
      unit,
      activeStepIds,
      activeLabels,
      activeComment,
      focusStepIds,
      isActive: activeStepIds.length > 0,
      isProgressed,
      lastChangeSeq: changeSeqByUnit?.get(unit.id) ?? 0,
    }
  })
}

/**
 * Seleciona o(s) GRAFCET(s) a mostrar no painel:
 * - Se o utilizador fixou manualmente um GRAFCET, mostra esse;
 * - Com 1 GRAFCET ativo, mostra-o a toda a largura (mudando automaticamente de página se necessário);
 * - Com 2 GRAFCETs ativos, coloca-os lado a lado;
 * - Com 3+ GRAFCETs ativos (ex.: G0 + G1 + G2), prioriza os 2 em evolução/atividade mais recente lado a lado;
 * - Parado (0 ativos), mostra a página atual focada na etapa inicial.
 */
export function pickVisibleLiveUnits(
  statuses: readonly LiveUnitStatus[],
  opts: {
    pinnedUnitId?: string | null
    preferredChartId?: string
    maxPanes?: number
  } = {},
): LiveUnitStatus[] {
  if (!statuses.length) return []
  const maxPanes = Math.max(1, opts.maxPanes ?? 2)

  if (opts.pinnedUnitId) {
    const pinned = statuses.find((s) => s.unit.id === opts.pinnedUnitId)
    if (pinned) return [pinned]
  }

  const running = statuses.filter((s) => s.isActive)
  if (!running.length) {
    const preferred = opts.preferredChartId
      ? statuses.find((s) => s.unit.chartId === opts.preferredChartId)
      : undefined
    return [preferred ?? statuses[0]]
  }

  if (running.length <= maxPanes) {
    return [...running].sort((a, b) => a.unit.number - b.unit.number)
  }

  // Com 3+ GRAFCETs ativos em simultâneo, destaca os 2 que realmente estão a evoluir
  // (etapa não inicial + transição mais recente) mantendo ordem estável esquerda→direita.
  const ranked = [...running].sort((a, b) => {
    if (a.isProgressed !== b.isProgressed) return a.isProgressed ? -1 : 1
    if (a.lastChangeSeq !== b.lastChangeSeq) return b.lastChangeSeq - a.lastChangeSeq
    return a.unit.number - b.unit.number
  })
  return ranked.slice(0, maxPanes).sort((a, b) => a.unit.number - b.unit.number)
}
