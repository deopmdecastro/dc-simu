import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { canvasScrollAxis, canvasScrollThumb, clampCanvasScroll, type CanvasScrollAxis, type CanvasScrollBounds, type CanvasScrollView } from './canvasScroll'
import '../styles/canvas-pan-scrollbars.css'

type Axis = 'x' | 'y'
interface Props {
  view: CanvasScrollView
  bounds: CanvasScrollBounds
  controlsId: string
  label: string
  disabled?: boolean
  onChange: (position: { x: number; y: number }) => void
}

/** Barras da vista, independentes do conteúdo: deslocar nunca modifica o projeto. */
export default function CanvasPanScrollbars(props: Props) {
  const root = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  const [trackSize, setTrackSize] = useState({ x: 1, y: 1 })
  const [dragAxis, setDragAxis] = useState<Axis | null>(null)
  const drag = useRef<{ axis: Axis; pointer: number; start: number; value: number; range: CanvasScrollAxis; travel: number } | null>(null)
  const ranges = {
    x: canvasScrollAxis(props.bounds.minX, props.bounds.maxX, props.view.x, props.view.width),
    y: canvasScrollAxis(props.bounds.minY, props.bounds.maxY, props.view.y, props.view.height),
  }
  const rangesRef = useRef(ranges)
  rangesRef.current = ranges
  useEffect(() => {
    const node = root.current
    if (!node) return
    const measure = () => {
      const x = node.querySelector<HTMLElement>('[data-scroll-axis="x"]')?.clientWidth ?? 1
      const y = node.querySelector<HTMLElement>('[data-scroll-axis="y"]')?.clientHeight ?? 1
      setTrackSize({ x, y })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node); measure()
    // Native listener: the GRAFCET viewport itself has a non-passive native zoom listener.
    const wheel = (event: WheelEvent) => {
      const track = (event.target as Element).closest<HTMLElement>('[data-scroll-axis]')
      if (!track) return
      event.stopPropagation(); event.preventDefault()
      const current = latest.current
      if (current.disabled) return
      const axis: Axis = event.shiftKey ? 'x' : track.dataset.scrollAxis as Axis
      const amount = (axis === 'x' && event.deltaX ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? axis === 'x' ? node.clientWidth : node.clientHeight : 1)
      const range = rangesRef.current[axis]
      current.onChange({ x: current.view.x, y: current.view.y, [axis]: clampCanvasScroll(range.value + amount * range.size / Math.max(1, axis === 'x' ? node.clientWidth : node.clientHeight), range) })
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => { observer.disconnect(); node.removeEventListener('wheel', wheel) }
  }, [])
  useEffect(() => { if (props.disabled) { drag.current = null; setDragAxis(null) } }, [props.disabled])
  const moveTo = (axis: Axis, value: number, range: CanvasScrollAxis) => {
    const current = latest.current
    if (!current.disabled) current.onChange({ x: current.view.x, y: current.view.y, [axis]: clampCanvasScroll(value, range) })
  }
  const down = (axis: Axis, event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation(); event.preventDefault()
    if (props.disabled || event.button !== 0) return
    event.currentTarget.focus({ preventScroll: true })
    const range = ranges[axis], thumb = canvasScrollThumb(range, trackSize[axis])
    const at = axis === 'x' ? event.clientX : event.clientY
    const rect = event.currentTarget.getBoundingClientRect()
    const coordinate = at - (axis === 'x' ? rect.left : rect.top)
    const onThumb = coordinate >= thumb.offset && coordinate <= thumb.offset + thumb.length
    const value = onThumb ? range.value : clampCanvasScroll(range.value + (coordinate < thumb.offset ? -1 : 1) * range.size * 0.85, range)
    if (!onThumb) moveTo(axis, value, range)
    drag.current = { axis, pointer: event.pointerId, start: at, value, range, travel: thumb.travel }
    setDragAxis(axis)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    const delta = (current.axis === 'x' ? event.clientX : event.clientY) - current.start
    moveTo(current.axis, current.value + delta / Math.max(1, current.travel) * (current.range.max - current.range.min), current.range)
  }
  const end = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (drag.current?.pointer !== event.pointerId) return
    drag.current = null; setDragAxis(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const key = (axis: Axis, event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const range = ranges[axis]
    const step = range.size * 0.06
    let value: number
    if (event.key === 'Home') value = range.min
    else if (event.key === 'End') value = range.max
    else if (event.key === 'PageUp') value = range.value - range.size * 0.85
    else if (event.key === 'PageDown') value = range.value + range.size * 0.85
    else if (event.key === (axis === 'x' ? 'ArrowLeft' : 'ArrowUp')) value = range.value - step
    else if (event.key === (axis === 'x' ? 'ArrowRight' : 'ArrowDown')) value = range.value + step
    else return
    event.preventDefault(); moveTo(axis, value, range)
  }
  return <div ref={root} className="canvas-pan-scrollbars" data-canvas-scrollbars={props.label} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()}>
    {(['x', 'y'] as const).map(axis => {
      const frozen = dragAxis === axis ? drag.current?.range : undefined
      const range = frozen ? { ...frozen, value: props.view[axis] } : ranges[axis]
      const thumb = canvasScrollThumb(range, trackSize[axis])
      return <div key={axis} className={`canvas-pan-scrollbar is-${axis} ${dragAxis === axis ? 'is-dragging' : ''}`} data-scroll-axis={axis}
        role="scrollbar" tabIndex={props.disabled ? -1 : 0} aria-label={`Deslocamento ${axis === 'x' ? 'horizontal' : 'vertical'} — ${props.label}`} aria-orientation={axis === 'x' ? 'horizontal' : 'vertical'}
        aria-controls={props.controlsId} aria-valuemin={range.min} aria-valuemax={range.max} aria-valuenow={range.value} aria-disabled={props.disabled || undefined}
        onPointerDown={event => down(axis, event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={event => { if (drag.current?.pointer === event.pointerId) { drag.current = null; setDragAxis(null) } }} onKeyDown={event => key(axis, event)}>
        <div className="canvas-pan-scrollbar-thumb" style={axis === 'x' ? { width: thumb.length, transform: `translateX(${thumb.offset}px)` } : { height: thumb.length, transform: `translateY(${thumb.offset}px)` }} />
      </div>
    })}
  </div>
}
