import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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
}

/** Shared keyboard boundary: diagram shortcuts must never consume modal keys. */
export default function PropertyDialog({ open, id, title, subtitle, children, onClose, onSave, onHelp, onEscape, className = '', saveDisabled = false }: PropertyDialogProps) {
  const dialogRef = useRef<HTMLFormElement>(null)
  const closeRef = useRef(onClose)
  const escapeRef = useRef(onEscape)
  closeRef.current = onClose
  escapeRef.current = onEscape

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current
      const first = dialog?.querySelector<HTMLElement>('[data-initial-focus]') ?? dialog?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])') ?? dialog?.querySelector<HTMLElement>('button:not([disabled])')
      ;(first ?? dialog)?.focus()
    })
    const containFocus = (event: FocusEvent) => {
      const dialog = dialogRef.current
      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) dialog.focus()
    }
    document.addEventListener('focusin', containFocus)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('focusin', containFocus)
      if (previous?.isConnected) previous.focus()
    }
  }, [open])

  if (!open) return null
  return createPortal((
    <div className="grafcet-modal-backdrop grafcet-property-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form ref={dialogRef} className={`grafcet-property-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-subtitle`} tabIndex={-1} noValidate
        onSubmit={(event) => { event.preventDefault(); onSave() }}
        onKeyDown={(event) => {
          event.stopPropagation()
          const target = event.target
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
          <div><span className="grafcet-property-eyebrow">GRAFCET · IEC 60848</span><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-subtitle`}>{subtitle}</p></div>
          <button type="button" className="grafcet-property-close" onClick={onClose} aria-label="Fechar sem guardar">×</button>
        </header>
        <div className="grafcet-property-content">{children}</div>
        <footer className="grafcet-property-footer">
          {onHelp && <button type="button" className="grafcet-property-help" onClick={onHelp}>Ajuda dos atalhos</button>}
          <span className="grafcet-property-footer-hint">Esc para cancelar</span>
          <button type="button" className="grafcet-fluidsim-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="grafcet-fluidsim-btn primary" disabled={saveDisabled}>Guardar alterações</button>
        </footer>
      </form>
    </div>
  ), document.body)
}
