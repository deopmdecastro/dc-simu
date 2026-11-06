import { transitionsOf, type GrafcetProgram } from './engine'
import { autoLayout, stepSize } from './layout'

/** Organiza uma página sem tocar na sequência, nas outras páginas ou nas anotações. */
export function organizeGrafcetPage(program: GrafcetProgram, chartId = program.activeChart ?? program.charts?.[0]?.id): GrafcetProgram {
  const first = program.charts?.[0]?.id
  const here = (item: { chart?: string }) => !first || (item.chart ?? first) === chartId
  const pageSteps = program.steps.filter(here)
  const allTransitions = transitionsOf(program)
  const transitions = allTransitions.filter(here)
  if (!pageSteps.length) return program
  const positions = autoLayout(pageSteps, transitions)
  const steps = program.steps.map(s => {
    const at = positions.get(s.id)
    return at ? { ...s, ...at, pinned: true } : s
  })
  const byId = new Map(steps.filter(here).map(s => [s.id, s]))
  const affected = new Set(transitions.map(t => t.id))
  const cleanRoutes = <T,>(routes: Record<string, T> | undefined) => routes && Object.fromEntries(Object.entries(routes).filter(([id]) => !affected.has(id)))
  return {
    ...program, steps,
    transitions: allTransitions.map(t => {
      if (!here(t)) return t
      const sources = t.from.map(id => byId.get(id)).filter(s => !!s)
      const targets = t.to.map(id => byId.get(id)).filter(s => !!s)
      const { x: _x, y: _y, ...rest } = t
      if (sources.length && targets.length) return rest
      // Uma transição-fonte/solta acompanha o destino e deixa margem para a barra.
      const anchor = targets[0] ?? sources[0]
      return anchor ? { ...rest, x: anchor.x, y: targets.length ? Math.max(48, anchor.y! - 60) : anchor.y! + stepSize(anchor).h + 60 } : t
    }),
    linkBends: cleanRoutes(program.linkBends),
    linkBars: cleanRoutes(program.linkBars),
  }
}
