import { useMemo } from 'react'
import { useSimStore } from '../store/useSimStore'
import { stepNumberOf } from '../grafcet/engine'
import { IconStep } from '../ui/icons'

/**
 * Cartão da barra de estado (ao lado do ciclo): GRAFCET em execução e etapa(s) ativa(s).
 * Clique → abre a vista GRAFCET. Só aparece quando o projeto tem etapas.
 */
export default function GrafcetStatusCard({ onOpen }: { onOpen?: () => void }) {
  const grafcet = useSimStore((s) => s.grafcet)
  const active = useSimStore((s) => s.grafcetRuntime.active)
  const runState = useSimStore((s) => s.sim.runState)
  const info = useMemo(() => {
    const steps = grafcet.steps ?? []
    if (!steps.length) return null
    const charts = grafcet.charts ?? []
    const firstChart = charts[0]?.id
    const pageOf = (chart?: string) => {
      const page = charts.find((item) => item.id === (chart ?? firstChart))
      return page ? (page.title || page.name) : ''
    }
    const list = active.map((id) => {
      const index = steps.findIndex((step) => step.id === id)
      if (index < 0) return null
      const step = steps[index]
      return { id, number: stepNumberOf(step, index), page: pageOf(step.chart), comment: (step.description || step.comment || '').trim() }
    }).filter(Boolean) as Array<{ id: string; number: string; page: string; comment: string }>
    return { name: (grafcet.name || '').trim() || 'GRAFCET sem nome', pages: charts.length, list }
  }, [grafcet, active])
  if (!info) return null
  const running = runState === 'running'
  const first = info.list[0]
  const page = first?.page && info.pages > 1 ? first.page : ''
  const title = [
    `GRAFCET: ${info.name}`,
    info.list.length
      ? `Etapas ativas: ${info.list.map((item) => `X${item.number}${item.comment ? ` (${item.comment})` : ''}${item.page && info.pages > 1 ? ` · ${item.page}` : ''}`).join(', ')}`
      : 'Nenhuma etapa ativa — prima Run',
    'Clique para abrir o GRAFCET',
  ].join('\n')
  return (
    <button type="button" className={`dc-grafcet-status ${running ? 'is-running' : ''} ${info.list.length ? 'has-active' : ''}`} onClick={onOpen} title={title}
      aria-label={`GRAFCET ${info.name}: ${info.list.length ? `etapa ativa X${first.number}` : 'sem etapa ativa'}`} data-grafcet-status>
      <IconStep size={11} />
      <span className="dc-grafcet-status-name">{info.name}</span>
      {page && <span className="dc-grafcet-status-page">{page}</span>}
      <span className="dc-grafcet-status-sep" aria-hidden="true">·</span>
      {first
        ? <span className="dc-grafcet-status-step" data-grafcet-active-step={first.number}>Etapa <b>X{first.number}</b>{first.comment && <em>{first.comment}</em>}{info.list.length > 1 && <small>+{info.list.length - 1}</small>}</span>
        : <span className="dc-grafcet-status-step is-idle">sem etapa ativa</span>}
    </button>
  )
}
