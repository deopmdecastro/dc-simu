/**
 * Tablet em modo «igual ao desktop»: painéis laterais fixos (não gavetas).
 * - Tablets em landscape / ecrãs ≥ 900 px usam o layout de secretária.
 * - Telemóveis e ecrãs estreitos continuam com gavetas sobrepostas.
 */
export const isTabletDesktop = (): boolean => {
  if (typeof window === 'undefined') return false
  const width = window.innerWidth
  // Landscape tablet / portátil pequeno: paridade com desktop.
  if (width >= 900) return true
  // Portrait tablet largo ainda cabe painéis estreitos.
  if (width >= 768 && window.matchMedia('(orientation: landscape)').matches) return true
  return false
}
