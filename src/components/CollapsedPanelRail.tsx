import type { ReactNode } from 'react'
import { IconChevronLeft, IconChevronRight } from '../ui/icons'

type CollapsedPanelRailProps = {
  label: string
  side: 'left' | 'right'
  icon: ReactNode
  onExpand: () => void
  controls?: string
  className?: string
}

/** Faixa compacta e acessível para reabrir um painel lateral recolhido. */
export default function CollapsedPanelRail({ label, side, icon, onExpand, controls, className = '' }: CollapsedPanelRailProps) {
  const expandLabel = `Mostrar ${label}`
  return (
    <button
      type="button"
      className={`pn-collapsed-rail pn-collapsed-rail-${side} ${className}`.trim()}
      onClick={onExpand}
      title={expandLabel}
      aria-label={expandLabel}
      aria-expanded={false}
      aria-controls={controls}
    >
      <span className="pn-collapsed-rail-icon" aria-hidden="true">{icon}</span>
      <span className="pn-collapsed-rail-label" aria-hidden="true">{label}</span>
      <span className="pn-collapsed-rail-chevron" aria-hidden="true">
        {side === 'left' ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
      </span>
    </button>
  )
}
