/** Marca o fim de um arrasto no viewport para o clique seguinte não limpar a seleção. */
export const dragState = { endedAt: 0 }
export const justDragged = () => performance.now() - dragState.endedAt < 250
