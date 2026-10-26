import { useEffect, useRef } from 'react'

/** Estado de um gesto de dois dedos, relativo ao início do gesto. */
export interface PinchState {
  /** Razão entre a distância atual e a inicial dos dedos (>1 = afastar = aumentar). */
  ratio: number
  /** Centro dos dedos agora e no início, em coordenadas do elemento (px). */
  center: { x: number; y: number }
  startCenter: { x: number; y: number }
}

export interface PinchOptions {
  /** Chamado quando o segundo dedo toca: guarde aqui a vista inicial (zoom/posição). */
  onStart?: () => void
  onChange: (state: PinchState) => void
  onEnd?: () => void
  /**
   * Em superfícies com `touch-action: none` e gestos por ponteiro (arrastar nós, mover a vista…), cancela o
   * gesto de um dedo já iniciado e impede que os ponteiros do gesto cheguem aos restantes manipuladores.
   */
  swallowPointers?: boolean
  enabled?: boolean
}

type Point = { x: number; y: number }
const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

/**
 * Liga a deteção de pinça a um elemento e devolve a função que a remove.
 * Usa eventos `touch` não passivos para bloquear o zoom/scroll nativo do browser durante o gesto.
 * Separado do hook para ser testável sem React.
 */
export function bindPinchZoom(el: HTMLElement, getOptions: () => PinchOptions): () => void {
  let start: { distance: number; center: Point } | null = null
  // Ponteiros táteis ativos e o alvo onde cada um começou (para os cancelar ao iniciar a pinça).
  const pointers = new Map<number, EventTarget | null>()
  let locked = false
  let dispatching = false

  const local = (clientX: number, clientY: number): Point => {
    const rect = el.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }
  const swallowing = (e: PointerEvent) => e.pointerType === 'touch' && !!getOptions().swallowPointers && !dispatching

  // ---- ponteiros: só quando o elemento trata gestos de um dedo por ponteiro ----
  const onPointerDown = (e: PointerEvent) => {
    if (!swallowing(e)) return
    pointers.set(e.pointerId, e.target)
    if (pointers.size < 2) return
    if (!locked) {
      locked = true
      // Termina o gesto do primeiro dedo (arrastar nó, mover vista, ligação…) como se fosse cancelado.
      dispatching = true
      for (const [id, target] of pointers) {
        if (id === e.pointerId || !(target instanceof Element)) continue
        try { target.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, pointerType: 'touch', bubbles: true })) } catch { /* sem PointerEvent */ }
      }
      dispatching = false
    }
    e.stopPropagation()
    e.preventDefault()
  }
  const onPointerMove = (e: PointerEvent) => { if (swallowing(e) && locked) e.stopPropagation() }
  const onPointerEnd = (e: PointerEvent) => {
    if (!swallowing(e)) return
    if (locked) e.stopPropagation()
    pointers.delete(e.pointerId)
    if (!pointers.size) locked = false
  }

  // ---- toque: o gesto em si ----
  const begin = (e: TouchEvent) => {
    if (e.touches.length !== 2) return
    const [a, b] = [e.touches[0], e.touches[1]]
    start = { distance: Math.max(1, distance(a, b)), center: local((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2) }
    getOptions().onStart?.()
    if (e.cancelable) e.preventDefault()
  }
  const move = (e: TouchEvent) => {
    if (e.touches.length !== 2) return
    if (!start) begin(e)
    if (!start) return
    if (e.cancelable) e.preventDefault()
    const [a, b] = [e.touches[0], e.touches[1]]
    getOptions().onChange({
      ratio: distance(a, b) / start.distance,
      center: local((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
      startCenter: start.center,
    })
  }
  const end = (e: TouchEvent) => {
    if (e.touches.length >= 2 || !start) return
    start = null
    getOptions().onEnd?.()
  }
  // Safari/iOS: impede o zoom da página com a pinça neste elemento.
  const noGesture = (e: Event) => e.preventDefault()

  el.addEventListener('pointerdown', onPointerDown, { capture: true })
  el.addEventListener('pointermove', onPointerMove, { capture: true })
  el.addEventListener('pointerup', onPointerEnd, { capture: true })
  el.addEventListener('pointercancel', onPointerEnd, { capture: true })
  el.addEventListener('touchstart', begin, { passive: false })
  el.addEventListener('touchmove', move, { passive: false })
  el.addEventListener('touchend', end)
  el.addEventListener('touchcancel', end)
  el.addEventListener('gesturestart', noGesture)
  el.addEventListener('gesturechange', noGesture)
  return () => {
    start = null
    el.removeEventListener('pointerdown', onPointerDown, { capture: true })
    el.removeEventListener('pointermove', onPointerMove, { capture: true })
    el.removeEventListener('pointerup', onPointerEnd, { capture: true })
    el.removeEventListener('pointercancel', onPointerEnd, { capture: true })
    el.removeEventListener('touchstart', begin)
    el.removeEventListener('touchmove', move)
    el.removeEventListener('touchend', end)
    el.removeEventListener('touchcancel', end)
    el.removeEventListener('gesturestart', noGesture)
    el.removeEventListener('gesturechange', noGesture)
  }
}

/**
 * Zoom com dois dedos (pinça) em telemóvel e tablet; também move a vista com o centro dos dedos.
 */
export function usePinchZoom(ref: React.RefObject<HTMLElement | null>, options: PinchOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const enabled = options.enabled !== false
  const bound = useRef<{ el: HTMLElement; dispose: () => void } | null>(null)

  // Sem lista de dependências de propósito: o elemento pode aparecer mais tarde (render condicional);
  // volta a ligar-se sempre que o elemento do `ref` mudar.
  useEffect(() => {
    const el = enabled ? ref.current : null
    if (bound.current && bound.current.el === el) return
    bound.current?.dispose()
    bound.current = null
    if (el) bound.current = { el, dispose: bindPinchZoom(el, () => optionsRef.current) }
  })
  useEffect(() => () => { bound.current?.dispose(); bound.current = null }, [])
}

/** Zoom resultante de uma pinça, limitado: `start * ratio` dentro de [min, max]. */
export const pinchZoom = (start: number, ratio: number, min: number, max: number) => Math.max(min, Math.min(max, start * ratio))

/** Nova posição (px) de um conteúdo escalado de `from` para `to` para que o ponto sob `startCenter` siga o centro dos dedos. */
export function pinchPan(startPos: Point, from: number, to: number, startCenter: Point, center: Point): Point {
  return {
    x: center.x - ((startCenter.x - startPos.x) * to) / from,
    y: center.y - ((startCenter.y - startPos.y) * to) / from,
  }
}
