/**
 * Modal para escolher quais dois canvas ver em simultâneo.
 * - Ambientes do projeto (3D, Ladder, GRAFCET, IEC…) quando há mais de um.
 * - Páginas GRAFCET quando o projeto tem várias charts.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { ViewMode } from './Toolbar'
import { useSplitView, type SplitPane } from '../ui/splitViewStore'
import { IconCompare, IconGrafcet, IconLadder, IconSchematic, IconCommands, IconMonitor } from '../ui/icons'

const VIEW_META: Record<ViewMode, { label: string; icon: typeof IconSchematic }> = {
  schematic: { label: '3D Realista', icon: IconSchematic },
  ladder: { label: 'Ladder', icon: IconLadder },
  grafcet: { label: 'GRAFCET', icon: IconGrafcet },
  commands: { label: 'Esquema IEC', icon: IconCommands },
  monitor: { label: 'Monitor', icon: IconMonitor },
}

type Props = {
  /** Vistas permitidas neste projeto. */
  availableViews: ViewMode[]
}

export default function SplitViewDialog({ availableViews }: Props) {
  const open = useSplitView((s) => s.dialogOpen)
  const close = useSplitView((s) => s.closeDialog)
  const apply = useSplitView((s) => s.apply)
  const enabled = useSplitView((s) => s.enabled)
  const currentLeft = useSplitView((s) => s.left)
  const currentRight = useSplitView((s) => s.right)
  const orientation = useSplitView((s) => s.orientation)

  const charts = useSimStore((s) => s.grafcet.charts ?? [])
  const activeChart = useSimStore((s) => s.grafcet.activeChart)

  const multiView = availableViews.length > 1
  const multiPage = charts.length > 1

  const [tab, setTab] = useState<'views' | 'pages'>(() => (multiView ? 'views' : 'pages'))
  const [leftMode, setLeftMode] = useState<ViewMode>(currentLeft.mode)
  const [rightMode, setRightMode] = useState<ViewMode>(currentRight.mode)
  const [leftChart, setLeftChart] = useState<string | undefined>(currentLeft.chartId ?? charts[0]?.id)
  const [rightChart, setRightChart] = useState<string | undefined>(currentRight.chartId ?? charts[1]?.id ?? charts[0]?.id)
  const [orient, setOrient] = useState<'horizontal' | 'vertical'>(orientation)

  useEffect(() => {
    if (!open) return
    setLeftMode(currentLeft.mode)
    setRightMode(currentRight.mode)
    setLeftChart(currentLeft.chartId ?? activeChart ?? charts[0]?.id)
    setRightChart(currentRight.chartId ?? charts.find((c) => c.id !== (currentLeft.chartId ?? activeChart))?.id ?? charts[1]?.id ?? charts[0]?.id)
    setOrient(orientation)
    setTab(multiView ? 'views' : 'pages')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const canApplyViews = leftMode !== rightMode && multiView
  const canApplyPages = multiPage && leftChart && rightChart && leftChart !== rightChart
  const canApply = tab === 'views' ? canApplyViews : canApplyPages

  const pageOptions = useMemo(
    () => charts.map((c, i) => ({ id: c.id, label: c.title || c.name || `Página ${i + 1}` })),
    [charts],
  )

  if (!open) return null

  const onConfirm = () => {
    if (tab === 'views') {
      if (!canApplyViews) return
      apply({ mode: leftMode }, { mode: rightMode }, orient)
    } else {
      if (!canApplyPages) return
      apply(
        { mode: 'grafcet', chartId: leftChart },
        { mode: 'grafcet', chartId: rightChart },
        orient,
      )
    }
  }

  return (
    <div className="gtpl-backdrop" role="presentation" onClick={close}>
      <div
        className="gtpl-dialog split-view-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-view-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gtpl-head">
          <div>
            <strong id="split-view-title">Ver dois canvas</strong>
            <small>Escolha dois ambientes ou duas páginas GRAFCET para ver em simultâneo</small>
          </div>
          <button type="button" className="gtpl-close" aria-label="Fechar" onClick={close}>✕</button>
        </div>

        {(multiView && multiPage) && (
          <div className="gtpl-tools">
            <div className="gtpl-chips" role="tablist" aria-label="Tipo de divisão">
              <button type="button" role="tab" aria-selected={tab === 'views'} className={tab === 'views' ? 'is-active' : ''} onClick={() => setTab('views')}>
                Ambientes
              </button>
              <button type="button" role="tab" aria-selected={tab === 'pages'} className={tab === 'pages' ? 'is-active' : ''} onClick={() => setTab('pages')}>
                Páginas GRAFCET
              </button>
            </div>
          </div>
        )}

        <div className="gtpl-body split-view-body">
          {tab === 'views' && (
            <>
              {!multiView ? (
                <div className="gtpl-empty">Este projeto só tem um ambiente. Adicione Ladder, GRAFCET ou Esquema IEC para dividir a vista.</div>
              ) : (
                <div className="split-view-pick">
                  <PanePicker label="Canvas esquerdo" value={leftMode} options={availableViews} onChange={setLeftMode} exclude={rightMode} />
                  <PanePicker label="Canvas direito" value={rightMode} options={availableViews} onChange={setRightMode} exclude={leftMode} />
                </div>
              )}
            </>
          )}

          {tab === 'pages' && (
            <>
              {!multiPage ? (
                <div className="gtpl-empty">O GRAFCET só tem uma página. Use «Nova página» no editor para criar outra e depois comparar as duas.</div>
              ) : (
                <div className="split-view-pick">
                  <ChartPicker label="Página esquerda" value={leftChart} options={pageOptions} onChange={setLeftChart} exclude={rightChart} />
                  <ChartPicker label="Página direita" value={rightChart} options={pageOptions} onChange={setRightChart} exclude={leftChart} />
                </div>
              )}
            </>
          )}

          <div className="split-view-orient">
            <span>Disposição</span>
            <div className="gtpl-chips">
              <button type="button" className={orient === 'horizontal' ? 'is-active' : ''} onClick={() => setOrient('horizontal')}>Lado a lado</button>
              <button type="button" className={orient === 'vertical' ? 'is-active' : ''} onClick={() => setOrient('vertical')}>Empilhado</button>
            </div>
          </div>
        </div>

        <div className="split-view-foot">
          {enabled && (
            <button type="button" className="dc-btn" onClick={() => { useSplitView.getState().disable(); close() }}>
              Fechar vista dividida
            </button>
          )}
          <div className="split-view-foot-right">
            <button type="button" className="dc-btn" onClick={close}>Cancelar</button>
            <button type="button" className="dc-btn dc-btn-primary" disabled={!canApply} onClick={onConfirm}>
              <IconCompare size={14} />Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PanePicker({
  label,
  value,
  options,
  onChange,
  exclude,
}: {
  label: string
  value: ViewMode
  options: ViewMode[]
  onChange: (m: ViewMode) => void
  exclude?: ViewMode
}) {
  return (
    <fieldset className="split-view-pane">
      <legend>{label}</legend>
      <div className="split-view-options">
        {options.map((id) => {
          const meta = VIEW_META[id]
          const Icon = meta.icon
          const disabled = id === exclude
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              className={value === id ? 'is-active' : ''}
              onClick={() => onChange(id)}
            >
              <Icon size={16} />
              <span>{meta.label}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function ChartPicker({
  label,
  value,
  options,
  onChange,
  exclude,
}: {
  label: string
  value?: string
  options: Array<{ id: string; label: string }>
  onChange: (id: string) => void
  exclude?: string
}) {
  return (
    <fieldset className="split-view-pane">
      <legend>{label}</legend>
      <div className="split-view-options">
        {options.map((opt) => {
          const disabled = opt.id === exclude
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              className={value === opt.id ? 'is-active' : ''}
              onClick={() => onChange(opt.id)}
            >
              <IconGrafcet size={16} />
              <span>{opt.label}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
