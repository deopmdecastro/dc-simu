import { transitionsOf, type GrafcetProgram } from './engine'
import { autoLayout, stepFootprint, stepSize } from './layout'

/** Organiza uma página sem tocar na sequência, nas outras páginas ou nas anotações. */
export function organizeGrafcetPage(program: GrafcetProgram, chartId = program.activeChart ?? program.charts?.[0]?.id, style: 'preserve' | 'classic' = 'preserve'): GrafcetProgram {
  const first = program.charts?.[0]?.id
  const here = (item: { chart?: string }) => !first || (item.chart ?? first) === chartId
  const classic = style === 'classic'
  const pageSteps = program.steps.filter(here).map(s => {
    if (!classic) return s
    const actions = s.actions?.map(({ x, y, dx, dy, afterActionId, ...action }) => {
      return {
        ...action,
        w: Math.min(360, Math.max(190, (action.displayDescription ? action.description || action.variable || action.address : action.variable || action.address).length * 7 + 64)),
        h: 34,
      }
    })
    const width = Math.max(190, ...actions?.map(a => a.w) ?? [])
    const rows = new Map<string, number>()
    const columns = new Map<string, number>()
    const laidOutActions = actions?.map((action, index) => {
      const conditional = action.type === 'conditional' || !!action.condition && action.condition !== '1'
      const key = conditional ? `condition:${action.condition}` : `action:${index}`
      if (!rows.has(key)) rows.set(key, rows.size)
      const row = rows.get(key)!
      const column = columns.get(key) ?? 0
      columns.set(key, column + 1)
      return {
        ...action, w: width, dx: 48 + column * (width + 24), dy: (conditional ? 48 : 7) + row * 88,
      }
    })
    // Caixas compactas e alinhadas; os campos de execução das ações ficam intactos.
    return { ...s, w: 48, h: 48, actionLayout: 'column' as const, actions: laidOutActions }
  })
  const allTransitions = transitionsOf(program)
  const transitions = allTransitions.filter(here).map(t => {
    if (!classic || !t.wireless || t.from.length !== 1 || t.to.length !== 1 || t.displayCondition === false) return t
    const target = pageSteps.find(s => s.id === t.to[0])
    // Fechar o ciclo pela esquerda. Abortos e saltos de modo densos mantêm as referências.
    const exits = allTransitions.filter(other => here(other) && other.from.includes(t.from[0]) && other.displayCondition !== false)
    return target?.initial && exits.length === 1 ? { ...t, wireless: false } : t
  })
  if (!pageSteps.length) return program
  const positions = autoLayout(pageSteps, transitions, classic)
  const steps = program.steps.map(s => {
    const at = positions.get(s.id)
    return at ? { ...pageSteps.find(item => item.id === s.id)!, ...at, pinned: true } : s
  })
  const byId = new Map(steps.filter(here).map(s => [s.id, s]))
  const affected = new Set(transitions.map(t => t.id))
  const cleanRoutes = <T,>(routes: Record<string, T> | undefined) => routes && Object.fromEntries(Object.entries(routes).filter(([id]) => !affected.has(id)))
  return {
    ...program, steps,
    transitions: allTransitions.map(original => {
      if (!here(original)) return original
      const t = transitions.find(item => item.id === original.id)!
      const sources = t.from.map(id => byId.get(id)).filter(s => !!s)
      const targets = t.to.map(id => byId.get(id)).filter(s => !!s)
      const { x: _x, y: _y, ...rest } = t
      if (sources.length && targets.length) return rest
      // Uma transição-fonte/solta acompanha o destino e deixa margem para a barra.
      const anchor = targets[0] ?? sources[0]
      return anchor ? { ...rest, x: anchor.x, y: targets.length ? Math.max(48, anchor.y! - 60) : anchor.y! + stepSize(anchor).h + 60 } : t
    }),
    linkBends: {
      ...cleanRoutes(program.linkBends),
      ...(classic ? Object.fromEntries(transitions.flatMap(t => {
        if (t.wireless || t.from.length !== 1 || t.to.length !== 1) return []
        const source = byId.get(t.from[0]), target = byId.get(t.to[0])
        if (!source || !target || target.y! > source.y!) return []
        const track = Math.min(...steps.filter(here).map(s => s.x!)) - 96
        const bottom = source.y! + Math.max(stepSize(source).h + 48, stepFootprint(source).bottom + 36)
        return [[t.id, [{ x: source.x!, y: bottom }, { x: track, y: bottom }, { x: track, y: target.y! - 28 }, { x: target.x!, y: target.y! - 28 }]]]
      })) : {}),
    },
    linkBars: cleanRoutes(program.linkBars),
  }
}
