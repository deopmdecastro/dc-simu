import { useEffect, useRef } from 'react'

/**
 * Duplo toque (toque/caneta) sobre elementos de um canvas SVG/HTML.
 *
 * No telemóvel o `dblclick` não é fiável: os nós usam `touch-action: none` e capturam o ponteiro para arrastar.
 * Este hook escuta `pointerdown/up` em captura no contentor, ignora gestos que foram arrasto, pinça ou toque longo e,
 * quando dois toques limpos acontecem no mesmo alvo (`resolve` devolve a mesma chave), chama `onDoubleTap`.
 * O rato continua a usar o `onDoubleClick` normal (não é tratado aqui).
 */
export interface DoubleTapOptions {
  /** Devolve uma chave estável do objeto sob o toque (ex.: `step:ID`), ou null se não for editável. */
  resolve: (target: Element) => string | null
  onDoubleTap: (key: string) => void
  enabled?: boolean
  /** Intervalo máximo entre toques (ms). */
  interval?: number
  /** Deslocamento máximo de um toque «limpo» e entre os dois toques (px). */
  slop?: number
}

export const DOUBLE_TAP_INTERVAL = 350
export const DOUBLE_TAP_SLOP = 12

/**
 * Liga a deteção de duplo toque a um elemento e devolve a função que a remove.
 * Separado do hook para ser testável sem React (como `bindPinchZoom`).
 */
export function bindDoubleTap(el: HTMLElement, getOptions: () => DoubleTapOptions): () => void {
  const down = new Map<number, { x: number; y: number; t: number; key: string | null }>()
  let last: { key: string; x: number; y: number; t: number } | null = null
  let multi = false
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    if (down.size >= 1) multi = true // 2.º dedo: é pinça, não toque
    const target = e.target instanceof Element ? e.target : null
    down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: clock(), key: target ? getOptions().resolve(target) : null })
  }
  const onUp = (e: PointerEvent) => {
    const start = down.get(e.pointerId)
    if (!start) return
    down.delete(e.pointerId)
    const opts = getOptions()
    const slop = opts.slop ?? DOUBLE_TAP_SLOP
    const interval = opts.interval ?? DOUBLE_TAP_INTERVAL
    const wasMulti = multi
    if (!down.size) multi = false
    const now = clock()
    const clean = !wasMulti && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= slop && now - start.t < 500
    if (!clean || !start.key) { last = null; return }
    if (last && last.key === start.key && now - last.t <= interval && Math.hypot(e.clientX - last.x, e.clientY - last.y) <= slop * 3) {
      last = null
      opts.onDoubleTap(start.key)
      return
    }
    last = { key: start.key, x: e.clientX, y: e.clientY, t: now }
  }
  const onCancel = (e: PointerEvent) => { down.delete(e.pointerId); last = null }

  el.addEventListener('pointerdown', onDown as EventListener, { capture: true })
  el.addEventListener('pointerup', onUp as EventListener, { capture: true })
  el.addEventListener('pointercancel', onCancel as EventListener, { capture: true })
  return () => {
    el.removeEventListener('pointerdown', onDown as EventListener, { capture: true })
    el.removeEventListener('pointerup', onUp as EventListener, { capture: true })
    el.removeEventListener('pointercancel', onCancel as EventListener, { capture: true })
  }
}

export function useDoubleTap(ref: React.RefObject<HTMLElement | null>, options: DoubleTapOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const enabled = options.enabled !== false
  useEffect(() => {
    const el = enabled ? ref.current : null
    if (!el) return
    return bindDoubleTap(el, () => optionsRef.current)
  }, [ref, enabled])
}
