import type { ReactNode, Ref } from 'react'
import { IconChevronLeft, IconChevronRight, IconLayers } from '../ui/icons'

type SidePanelHeaderProps = {
  eyebrow: string
  title: string
  icon?: ReactNode
  side?: 'left' | 'right'
  detail?: ReactNode
  actions?: ReactNode
  collapsed?: boolean
  expanded?: boolean
  onToggle?: () => void
  toggleLabel?: string
  toggleClassName?: string
  toggleTitle?: boolean
  className?: string
  elementRef?: Ref<HTMLElement>
}

/** Cabeçalho comum das gavetas laterais dos editores e simuladores. */
export default function SidePanelHeader({
  eyebrow,
  title,
  icon = <IconLayers size={16} />,
  side = 'left',
  detail,
  actions,
  collapsed = false,
  expanded,
  onToggle,
  toggleLabel,
  toggleClassName = '',
  toggleTitle = false,
  className = '',
  elementRef,
}: SidePanelHeaderProps) {
  const isExpanded = expanded ?? !collapsed
  const copy = <>
    <span className="dc-side-panel-eyebrow"><i aria-hidden="true" />{eyebrow}</span>
    <strong title={title}>{title}</strong>
    {detail && <small>{detail}</small>}
  </>
  const pointLeft = side === 'left' ? isExpanded : !isExpanded
  const Chevron = pointLeft ? IconChevronLeft : IconChevronRight
  const label = toggleLabel ?? `${onToggle ? 'Recolher' : 'Abrir'} ${title}`

  return (
    <header ref={elementRef} className={`dc-side-panel-head${collapsed ? ' is-collapsed' : ''} ${className}`.trim()}>
      <span className="dc-side-panel-icon" aria-hidden="true">{icon}</span>
      {collapsed
        ? <span className="dc-side-panel-collapsed-label">{title}</span>
        : toggleTitle && onToggle
        ? <button type="button" className="dc-side-panel-copy is-toggle" onClick={onToggle} aria-label={label}>{copy}</button>
        : <div className="dc-side-panel-copy">{copy}</div>}
      {!collapsed && actions && <div className="dc-side-panel-actions">{actions}</div>}
      {onToggle && <button type="button" className={`dc-side-panel-toggle ${toggleClassName}`.trim()} onClick={onToggle} aria-label={label} aria-expanded={isExpanded} title={label}><Chevron size={16} /></button>}
    </header>
  )
}
