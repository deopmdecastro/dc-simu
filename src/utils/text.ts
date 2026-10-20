/** Texto sem acentos e em minúsculas — base única para pesquisas e comparações tolerantes a acentuação. */
export const foldText = (text: string): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT')
