/** Um tablet só usa painéis de desktop quando tem largura real para os apresentar. */
export const isTabletDesktop = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.dataset.tablet === 'true' && window.innerWidth >= 1200
