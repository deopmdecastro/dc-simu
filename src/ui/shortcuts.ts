/**
 * Biblioteca de atalhos partilhada por todos os editores (esquema 2D, painel
 * 3D, ladder, GRAFCET e editor de componentes do Admin).
 *
 * Cada editor liga apenas as ações que sabe executar; as combinações de teclas
 * são sempre as mesmas, para o utilizador não ter de aprender um teclado
 * diferente em cada painel.
 */
import { useEffect, useRef } from 'react'
import { isTypingTarget } from './editorKeys'

export interface EditorShortcutActions {
  /** Ctrl+Z */
  undo?: () => void
  /** Ctrl+Y ou Ctrl+Shift+Z */
  redo?: () => void
  /** Delete / Backspace */
  remove?: () => void
  /** Ctrl+D */
  duplicate?: () => void
  /** Ctrl+G */
  group?: () => void
  /** Ctrl+Shift+G */
  ungroup?: () => void
  /** Ctrl+A */
  selectAll?: () => void
  /** Ctrl+C */
  copy?: () => void
  /** Ctrl+V */
  paste?: () => void
  /** Ctrl+S */
  save?: () => void
  /** Setas: move a seleção. `big` = Shift (passo grande). */
  nudge?: (dx: number, dy: number, big: boolean) => void
  /** Teclado numérico com Num Lock, ou Ctrl+setas: desloca a vista em pixels. */
  panView?: (dx: number, dy: number) => void
  /** Ctrl+= / Ctrl+− / Numpad + / Numpad −: fator multiplicativo do zoom. */
  zoomView?: (factor: number) => void
  /** Home, Ctrl+0 ou Numpad 5: enquadra tudo. */
  fitView?: () => void
  /** Escape */
  escape?: () => void
  /** F1, ? ou Ctrl+/ */
  help?: () => void
}

/** Linhas de ajuda, para os editores mostrarem a mesma tabela de atalhos. */
export const SHORTCUT_HELP: Array<{ keys: string; action: string }> = [
  { keys: 'Ctrl+Z', action: 'Desfazer' },
  { keys: 'Ctrl+Shift+Z · Ctrl+Y', action: 'Refazer' },
  { keys: 'Delete · Backspace', action: 'Apagar a seleção' },
  { keys: 'Ctrl+D', action: 'Duplicar' },
  { keys: 'Ctrl+G', action: 'Agrupar a seleção' },
  { keys: 'Ctrl+Shift+G', action: 'Desagrupar' },
  { keys: 'Ctrl+clique · Shift+clique', action: 'Seleção múltipla' },
  { keys: 'Ctrl+A', action: 'Selecionar tudo' },
  { keys: 'Ctrl+C · Ctrl+V', action: 'Copiar e colar' },
  { keys: 'Ctrl+S', action: 'Guardar' },
  { keys: 'Setas', action: 'Mover a seleção (Shift = passo grande)' },
  { keys: 'Num Lock + 8 4 6 2', action: 'Mover a vista' },
  { keys: 'Num Lock + 5', action: 'Enquadrar tudo' },
  { keys: 'Num Lock + + −', action: 'Zoom' },
  { keys: 'Ctrl+setas', action: 'Mover a vista' },
  { keys: 'Home · Ctrl+0', action: 'Enquadrar tudo' },
  { keys: 'Escape', action: 'Cancelar / limpar seleção' },
  { keys: 'F1 · ?', action: 'Ajuda dos atalhos' },
]

const PAN_STEP = 60
const ARROW: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
const NUMPAD_PAN: Record<string, [number, number]> = { Numpad4: [-1, 0], Numpad6: [1, 0], Numpad8: [0, -1], Numpad2: [0, 1] }

/** Executa o atalho correspondente ao evento. Devolve true quando o tratou. */
export function runEditorShortcut(event: KeyboardEvent, actions: EditorShortcutActions): boolean {
  const mod = event.ctrlKey || event.metaKey
  const key = event.key
  const lower = key.toLowerCase()
  const done = (run?: () => void) => {
    if (!run) return false
    event.preventDefault()
    run()
    return true
  }

  if (key === 'Escape') return done(actions.escape)
  if (mod && lower === 's') return done(actions.save)
  if (mod && !event.altKey && lower === 'z') return done(event.shiftKey ? actions.redo : actions.undo)
  if (mod && !event.altKey && lower === 'y') return done(actions.redo)
  if (mod && lower === 'd') return done(actions.duplicate)
  if (mod && lower === 'g') return done(event.shiftKey ? actions.ungroup : actions.group)
  if (mod && lower === 'a') return done(actions.selectAll)
  if (mod && lower === 'c') return done(actions.copy)
  if (mod && lower === 'v') return done(actions.paste)
  if ((key === 'F1' || key === '?' || (mod && key === '/')) && actions.help) return done(actions.help)

  // Teclado numérico (com Num Lock ligado): move e enquadra a vista, como nos CAD.
  const numLock = event.getModifierState?.('NumLock') !== false
  if (numLock && !mod && !event.altKey) {
    const pan = NUMPAD_PAN[event.code]
    if (pan && actions.panView) return done(() => actions.panView!(pan[0] * PAN_STEP, pan[1] * PAN_STEP))
    if (event.code === 'Numpad5' && actions.fitView) return done(actions.fitView)
    if (event.code === 'NumpadAdd' && actions.zoomView) return done(() => actions.zoomView!(1.2))
    if (event.code === 'NumpadSubtract' && actions.zoomView) return done(() => actions.zoomView!(1 / 1.2))
  }

  if (mod && (key === '+' || key === '=') && actions.zoomView) return done(() => actions.zoomView!(1.2))
  if (mod && key === '-' && actions.zoomView) return done(() => actions.zoomView!(1 / 1.2))
  if (mod && key === '0' && actions.fitView) return done(actions.fitView)
  if (key === 'Home' && !mod && !event.altKey && actions.fitView) return done(actions.fitView)

  const arrow = ARROW[key]
  if (arrow) {
    // Ctrl+setas move a vista; as setas sozinhas movem a seleção.
    if (mod && actions.panView) return done(() => actions.panView!(arrow[0] * PAN_STEP, arrow[1] * PAN_STEP))
    if (!mod && !event.altKey && actions.nudge) return done(() => actions.nudge!(arrow[0], arrow[1], event.shiftKey))
    return false
  }

  if ((key === 'Delete' || key === 'Backspace') && !mod) return done(actions.remove)
  return false
}

/**
 * Liga os atalhos universais a um editor. Fica inativo enquanto o utilizador
 * escreve num campo de texto e pode ser desligado com `enabled: false`
 * (por exemplo quando um diálogo está aberto).
 */
export function useEditorShortcuts(actions: EditorShortcutActions, options: { enabled?: boolean } = {}) {
  const ref = useRef(actions)
  ref.current = actions
  const enabled = options.enabled !== false
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      runEditorShortcut(event, ref.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
