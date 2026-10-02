import { useCallback, useEffect, useRef } from 'react'

const KEY = 'dcsimu:ce:panels'
export interface Panels { left: number; right: number; leftOpen: boolean; rightOpen: boolean }
export const DEFAULT_PANELS: Panels = { left: 240, right: 360, leftOpen: true, rightOpen: true }
const LIMITS = { left: [180, 460], right: [280, 640] } as const

export function loadPanels(): Panels {
  try { return { ...DEFAULT_PANELS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Panels>) } } catch { return DEFAULT_PANELS }
}
export function savePanels(panels: Panels) { try { localStorage.setItem(KEY, JSON.stringify(panels)) } catch { /* ignorar */ } }
export const clampPanel = (side: 'left' | 'right', value: number) => Math.min(LIMITS[side][1], Math.max(LIMITS[side][0], Math.round(value)))

/** Pega para redimensionar um painel lateral: arrastar, setas (±16 px), duplo clique repõe a largura. */
export default function PanelResizer({ side, width, onChange, onReset }: { side: 'left' | 'right'; width: number; onChange: (value: number) => void; onReset: () => void }) {
  const drag = useRef<{ x: number; w: number } | null>(null)
  const move = useCallback((event: PointerEvent) => {
    if (!drag.current) return
    const delta = event.clientX - drag.current.x
    onChange(clampPanel(side, drag.current.w + (side === 'left' ? delta : -delta)))
  }, [onChange, side])
  const stop = useCallback(() => { drag.current = null; document.body.classList.remove('ce-resizing') }, [])
  useEffect(() => {
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
  }, [move, stop])
  return <div className={`ce-resizer is-${side}`} role="separator" aria-orientation="vertical" aria-label={side === 'left' ? 'Largura da hierarquia' : 'Largura do inspetor'} aria-valuenow={width} tabIndex={0}
    title="Arraste para redimensionar · duplo clique repõe"
    style={side === 'left' ? { left: width - 3 } : { right: width - 3 }}
    onPointerDown={(event) => { event.preventDefault(); drag.current = { x: event.clientX, w: width }; document.body.classList.add('ce-resizing') }}
    onDoubleClick={onReset}
    onKeyDown={(event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault(); event.stopPropagation()
      const dir = (event.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 1 : -1)
      onChange(clampPanel(side, width + dir * 16))
    }} />
}
