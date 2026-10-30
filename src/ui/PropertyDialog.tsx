import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconClose, IconSave } from './icons'

interface PropertyDialogProps {
  open: boolean
  id: string
  title: string
  subtitle: string
  children: ReactNode
  onClose: () => void
  onSave: () => void
  onHelp?: () => void
  onEscape?: () => void
  className?: string
  saveDisabled?: boolean
  /** Texto pequeno por cima do título (por omissão, o contexto GRAFCET). */
  eyebrow?: string
  saveLabel?: string
  /** Diálogos só de consulta: sem botão de guardar. */
  hideSave?: boolean
  /** Texto do botão de fechar do rodapé (por omissão «Cancelar»). */
  closeLabel?: string
  /** Dica à esquerda do rodapé (por omissão «Esc para cancelar»). */
  footerHint?: string
  /** Texto junto ao atalho Ctrl/⌘ Enter (por omissão «guardar»). */
  saveShortcutLabel?: string
}

/** Shared keyboard boundary: diagram shortcuts must never consume modal keys. */
export default function PropertyDialog({ open, id, title, subtitle, children, onClose, onSave, onHelp, onEscape, className = '', saveDisabled = false, eyebrow = 'GRAFCET · IEC 60848', saveLabel = 'Guardar alterações', hideSave = false, closeLabel = 'Cancelar', footerHint = 'Esc para cancelar', saveShortcutLabel = 'guardar' }: PropertyDialogProps) {
  const dialogRef = useRef<HTMLFormElement>(null)
  const closeRef = useRef(onClose)
  const escapeRef = useRef(onEscape)
  closeRef.current = onClose
  escapeRef.current = onEscape

  useLayoutEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null
    const dialog = dialogRef.current
    const first = dialog?.querySelector<HTMLElement>('[data-initial-focus]') ?? dialog?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])') ?? dialog?.querySelector<HTMLElement>('button:not([disabled])')
    ;(first ?? dialog)?.focus()
    const containFocus = (event: FocusEvent) => {
      const dialog = dialogRef.current
      // Um diálogo aberto por cima (ex.: pré-visualização de importação) tem o seu próprio foco.
      if (dialog && event.target instanceof Element && !dialog.contains(event.target) && !event.target.closest('[role="dialog"],[role="alertdialog"]')) dialog.focus()
    }
    document.addEventListener('focusin', containFocus)
    return () => {
      document.removeEventListener('focusin', containFocus)
      if (previous?.isConnected && 'focus' in previous && typeof previous.focus === 'function') previous.focus()
    }
  }, [open])

  if (!open) return null
  return createPortal((
    <div className="grafcet-modal-backdrop grafcet-property-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form ref={dialogRef} className={`grafcet-property-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-subtitle`} tabIndex={-1} noValidate
        onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); if (!hideSave && !saveDisabled) onSave() }}
        onKeyDown={(event) => {
          event.stopPropagation()
          const target = event.target
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            const excluded = target instanceof Element && target.closest('[data-property-save-ignore]')
            if (!excluded && !hideSave && !saveDisabled) onSave()
            return
          }
          if (event.key === 'Enter' && (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && ['checkbox', 'radio'].includes(target.type)) || target === dialogRef.current)) event.preventDefault()
          if (event.key === 'Escape') {
            event.preventDefault()
            ;(escapeRef.current ?? closeRef.current)()
          }
          if (event.key === 'Tab') {
            const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]') ?? [])
              .filter((node) => node.getClientRects().length > 0 && !(node instanceof HTMLInputElement && node.type === 'radio' && !node.checked && dialogRef.current?.querySelector(`input[type="radio"][name="${node.name}"]:checked`)))
            const first = nodes[0]
            const last = nodes[nodes.length - 1]
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first?.focus() }
          }
        }}>
        <header className="grafcet-property-header">
          <div><span className="grafcet-property-eyebrow">{eyebrow}</span><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-subtitle`}>{subtitle}</p></div>
          <button type="button" className="grafcet-property-close" onClick={onClose} aria-label="Fechar sem guardar"><IconClose size={16} /></button>
        </header>
        <div className="grafcet-property-content">{children}</div>
        <footer className="grafcet-property-footer">
          {onHelp && <button type="button" className="grafcet-property-help" onClick={onHelp}>Ajuda dos atalhos</button>}
          <span className="grafcet-property-footer-hint">{footerHint === 'Esc para cancelar' ? <><kbd>Esc</kbd> cancelar</> : footerHint}{!hideSave && <><span className="grafcet-footer-separator">·</span><kbd>Ctrl/⌘ Enter</kbd> {saveShortcutLabel}</>}</span>
          <button type="button" className="grafcet-fluidsim-btn" onClick={onClose}>{closeLabel}</button>
          {!hideSave && <button type="submit" className="grafcet-fluidsim-btn primary" disabled={saveDisabled} aria-keyshortcuts="Control+Enter Meta+Enter"><IconSave size={13} />{saveLabel}</button>}
        </footer>
      </form>
    </div>
  ), document.body)
}
