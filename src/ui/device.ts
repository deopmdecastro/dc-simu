/** Tablet com o layout do PC: o `index.html` marca <html data-tablet="true"> e fixa o viewport em 1200px. */
export const isTabletDesktop = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.dataset.tablet === 'true'
