/**
 * Utilitários partilhados pelos atalhos de teclado dos editores (esquema 2D,
 * painel 3D, GRAFCET, ladder e editor de componentes do Admin).
 *
 * Centralizar estas regras garante que «Delete» apaga, que as setas movem e
 * que nenhum atalho dispara enquanto o utilizador escreve num campo.
 */

const TYPING_SELECTOR = 'input,textarea,select,[contenteditable="true"]'

/** Verdadeiro quando o evento vem de um campo de texto: os atalhos ficam suspensos. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return !!element?.closest?.(TYPING_SELECTOR)
}

/**
 * Tira o foco de um campo de texto antes de o utilizador trabalhar na tela.
 * Sem isto, selecionar um componente deixa o foco no painel de propriedades e
 * teclas como «Delete» são entregues ao campo, não ao editor.
 */
export function releaseTypingFocus(): void {
  const active = document.activeElement as HTMLElement | null
  if (active && active.closest?.(TYPING_SELECTOR)) active.blur()
}

/** Deslocamento pedido por uma tecla de seta, ou null se a tecla for outra. */
export function arrowDelta(key: string, step: number): { dx: number; dy: number } | null {
  if (key === 'ArrowLeft') return { dx: -step, dy: 0 }
  if (key === 'ArrowRight') return { dx: step, dy: 0 }
  if (key === 'ArrowUp') return { dx: 0, dy: -step }
  if (key === 'ArrowDown') return { dx: 0, dy: step }
  return null
}

/** Verdadeiro para «Delete» e «Backspace», as duas teclas de apagar. */
export const isDeleteKey = (key: string) => key === 'Delete' || key === 'Backspace'
