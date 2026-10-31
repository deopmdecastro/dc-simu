/**
 * Paridade tablet ↔ PC.
 *
 * - Tablet = ecrã tátil com o lado curto ≥ 480 px (telemóveis ≤ ~440 px; tablets de 7–8″ ~533 px). O `index.html` dá-lhe uma
 *   largura de layout mínima de `TABLET_LAYOUT_WIDTH` (meta viewport), por isso
 *   o tablet recebe exatamente o mesmo layout do PC, apenas escalado.
 * - Telemóvel = ecrã tátil estreito (≤ 743 px) ou deitado com pouca altura
 *   (≤ 520 px). Só aqui se aplicam gavetas, barras compactas e alvos maiores.
 *   Usar `PHONE_TOUCH_QUERY` em vez de `(pointer: coarse)` isolado, que também
 *   apanha tablets e lhes muda o layout. A regra «deitado com pouca altura» leva
 *   `(max-width: 1100px)`: o tablet tem sempre ≥ 1280 px de largura de layout, por
 *   isso nunca cai no layout de telemóvel (nem com o teclado aberto a encolher a altura).
 */
export const TABLET_LAYOUT_WIDTH = 1280
export const PHONE_TOUCH_QUERY = '(pointer: coarse) and (max-width: 743px), (pointer: coarse) and (max-height: 520px) and (max-width: 1100px)'

export const isTabletDevice = (): boolean => {
  if (typeof window === 'undefined') return false
  if (document.documentElement.getAttribute('data-tablet') === 'true') return true
  const coarse = window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints ?? 0) > 1
  return coarse && Math.min(screen.width, screen.height) >= 480
}

export const isPhoneTouch = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_TOUCH_QUERY).matches

/** Layout de secretária: qualquer tablet, ou janelas a partir de 900 px. */
export const isTabletDesktop = (): boolean => {
  if (typeof window === 'undefined') return false
  if (isTabletDevice()) return true
  const width = window.innerWidth
  if (width >= 900) return true
  if (width >= 768 && window.matchMedia('(orientation: landscape)').matches) return true
  return false
}
