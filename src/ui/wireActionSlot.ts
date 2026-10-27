import { useSyncExternalStore } from 'react'

/**
 * Ponto de montagem, no painel lateral esquerdo, para as ações de traçado do
 * cabo que pertencem à vista 3D (ponto de curva, mover cabo, religar a ponta).
 *
 * O estado dessas ações vive no `Panel3D` (arrasto, ponto ativo, ponta ativa).
 * Em vez de as mostrar num cartão sobre o canvas — o que tirava espaço ao
 * esquema —, o `Panel3D` desenha-as num portal para o elemento que o `Sidebar`
 * disponibiliza no inspetor do cabo. Assim continuam a agir sobre o estado 3D
 * sem duplicar lógica e a UI fica toda no painel lateral.
 */
let node: HTMLElement | null = null
const listeners = new Set<() => void>()

export function setWireActionSlot(next: HTMLElement | null) {
  if (next === node) return
  node = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const snapshot = () => node

/** Elemento do painel lateral onde as ações do traçado 3D são montadas (ou null). */
export function useWireActionSlot() {
  return useSyncExternalStore(subscribe, snapshot, () => null)
}
