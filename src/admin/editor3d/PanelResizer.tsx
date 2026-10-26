import { useEffect, useRef, useState, type CSSProperties } from 'react'

const DEFAULT = { left: 274, right: 360 }
const LIMITS = { left: [230, 340], right: [300, 420] }
const clamp = (value: number, side: 'left' | 'right') => Math.min(LIMITS[side][1], Math.max(LIMITS[side][0], value))

export function usePanelWidths() {
  const [panels, setPanels] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('dcsimu:ce:panels') ?? '{}')
      return {
        left: clamp(Number(stored.left) || DEFAULT.left, 'left'),
        right: clamp(Number(stored.right) || DEFAULT.right, 'right'),
        collapsedLeft: stored.collapsedLeft === true,
        collapsedRight: stored.collapsedRight === true,
      }
    } catch { return { ...DEFAULT, collapsedLeft: false, collapsedRight: false } }
  })
  useEffect(() => { try { localStorage.setItem('dcsimu:ce:panels', JSON.stringify(panels)) } catch { /* preferência opcional */ } }, [panels])
  const change = (side: 'left' | 'right', value: number) => setPanels((current) => ({ ...current, [side]: clamp(value, side) }))
  const toggle = (side: 'left' | 'right') => setPanels((current) => ({ ...current, [side === 'left' ? 'collapsedLeft' : 'collapsedRight']: !current[side === 'left' ? 'collapsedLeft' : 'collapsedRight'] }))
  return {
    widths: { left: panels.left, right: panels.right },
    collapsed: { left: panels.collapsedLeft, right: panels.collapsedRight },
    change,
    toggle,
    style: {
      '--ce-left-width': `${panels.left}px`, '--ce-right-width': `${panels.right}px`,
      '--ce-left-current-width': `${panels.collapsedLeft ? 48 : panels.left}px`,
      '--ce-right-current-width': `${panels.collapsedRight ? 48 : panels.right}px`,
    } as CSSProperties,
  }
}

export function PanelResizer({ side, width, onChange }: { side: 'left' | 'right'; width: number; onChange: (width: number) => void }) {
  const drag = useRef<{ x: number; width: number } | null>(null)
  const label = side === 'left' ? 'Largura da hierarquia' : 'Largura do inspetor'
  return <div className={`ce-panel-resizer is-${side}`} role="separator" tabIndex={0} aria-orientation="vertical" aria-label={label} aria-valuemin={LIMITS[side][0]} aria-valuemax={LIMITS[side][1]} aria-valuenow={width}
    title={`${label} · arraste ou use as setas · duplo clique repõe`}
    onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); drag.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId) }}
    onPointerMove={(event) => { if (drag.current) onChange(drag.current.width + (event.clientX - drag.current.x) * (side === 'left' ? 1 : -1)) }}
    onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
    onDoubleClick={() => onChange(DEFAULT[side])}
    onKeyDown={(event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); onChange(width + (event.key === 'ArrowRight' ? 10 : -10) * (side === 'left' ? 1 : -1)) }
      else if (event.key === 'Home') { event.preventDefault(); event.stopPropagation(); onChange(DEFAULT[side]) }
    }} />
}
