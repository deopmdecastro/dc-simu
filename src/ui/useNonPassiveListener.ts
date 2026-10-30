import { useEffect, useRef, type RefObject } from 'react'

/**
 * Listener nativo com `{ passive: false }`. O React regista `wheel` e `touchstart/touchmove` como
 * passivos: um `preventDefault()` dentro de `onWheel`/`onTouchMove` é ignorado (aviso «Unable to
 * preventDefault inside passive event listener») e o browser faz o seu próprio scroll/zoom da página.
 * Usa sempre o handler mais recente e volta a ligar-se se o elemento do `ref` mudar (montado mais tarde).
 */
export function useNonPassiveListener<E extends Event>(ref: RefObject<Element | null>, type: string, handler: (event: E) => void) {
  const latest = useRef(handler)
  latest.current = handler
  const bound = useRef<{ element: Element; listener: EventListener } | null>(null)
  useEffect(() => {
    const element = ref.current
    if (bound.current?.element === element) return
    if (bound.current) bound.current.element.removeEventListener(type, bound.current.listener)
    bound.current = null
    if (!element) return
    const listener: EventListener = (event) => latest.current(event as E)
    element.addEventListener(type, listener, { passive: false })
    bound.current = { element, listener }
  })
  useEffect(() => () => {
    if (bound.current) bound.current.element.removeEventListener(type, bound.current.listener)
    bound.current = null
  }, [type])
}
