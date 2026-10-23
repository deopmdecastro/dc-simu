import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './icons'

/**
 * Modal padronizada da plataforma.
 *
 * Até aqui cada diálogo criava o seu próprio fundo escurecido, caixa, botão de
 * fechar, tecla Escape e comportamento em telemóvel — sempre com pequenas
 * diferenças. Este componente concentra esse comportamento num só sítio:
 *
 *  - portal no <body> (nunca é cortada por contentores com overflow);
 *  - Esc e clique no fundo fecham (desativável para operações delicadas);
 *  - foco inicial no elemento com `data-autofocus` (ou no primeiro campo) e
 *    devolução do foco a quem abriu a modal;
 *  - em ecrãs pequenos transforma-se numa folha ancorada ao fundo.
 *
 * Os estilos vivem em index.css (.dc-modal-*) para qualquer área poder usar a
 * mesma caixa sem duplicar CSS.
 */
type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  /** ícone à esquerda do título (ex.: tile do tipo de bloco) */
  icon?: ReactNode
  /** largura máxima da caixa em px — o ecrã pequeno sobrepõe-se sempre */
  width?: number
  /** ações no rodapé (Cancelar/Confirmar); sem footer não é desenhado */
  footer?: ReactNode
  /** false impede fechar por Esc/clique fora (ex.: confirmações destrutivas) */
  dismissable?: boolean
  className?: string
  bodyClassName?: string
  closeLabel?: string
  /** Isola atalhos e mantém o foco, incluindo menus Select em portal. */
  keyboardScope?: boolean
  onConfirm?: () => void
  children: ReactNode
}

export default function Modal({
  open, onClose, title, subtitle, icon, width = 560, footer,
  dismissable = true, className = '', bodyClassName = '', closeLabel = 'Fechar', keyboardScope = false, onConfirm, children,
}: ModalProps) {
  const titleId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  const confirmRef = useRef(onConfirm)
  closeRef.current = onClose
  confirmRef.current = onConfirm

  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement as HTMLElement | null
    const ownedMenu = () => {
      const anchor = boxRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"][aria-expanded="true"][aria-controls]')
      const menu = anchor ? document.getElementById(anchor.getAttribute('aria-controls') ?? '') : null
      return { anchor, menu }
    }
    const onKey = (event: KeyboardEvent) => {
      const { anchor, menu } = ownedMenu()
      if (keyboardScope && event.key === 'Escape' && menu && anchor) {
        event.preventDefault()
        event.stopPropagation()
        anchor.click()
        anchor.focus()
        return
      }
      if (event.key === 'Escape' && dismissable) { event.preventDefault(); if (keyboardScope) event.stopPropagation(); closeRef.current(); return }
      if (!keyboardScope) return
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); if (!menu) confirmRef.current?.(); return }
      if (event.key === 'Tab') {
        const nodes = Array.from(boxRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? []).filter((node) => node.getClientRects().length > 0)
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        // O menu está fora da caixa, mas pertence ao seletor deste diálogo.
        if (menu && document.activeElement && menu.contains(document.activeElement)) {
          event.preventDefault()
          anchor?.click()
          const index = nodes.indexOf(anchor!)
          nodes[(index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length]?.focus()
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === boxRef.current)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === boxRef.current)) { event.preventDefault(); first?.focus() }
      }
    }
    const containFocus = (event: FocusEvent) => {
      if (!keyboardScope || !(event.target instanceof Node)) return
      const box = boxRef.current
      if (box && !box.contains(event.target) && !ownedMenu().menu?.contains(event.target)) box.focus()
    }
    window.addEventListener('keydown', onKey, true)
    if (keyboardScope) document.addEventListener('focusin', containFocus)
    const timer = window.setTimeout(() => {
      const target = boxRef.current?.querySelector<HTMLElement>('[data-autofocus]')
        ?? boxRef.current?.querySelector<HTMLElement>('input, select, textarea, button')
      ;(target ?? boxRef.current)?.focus()
    }, 30)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', containFocus)
      window.clearTimeout(timer)
      lastFocus.current?.focus()
    }
  }, [open, dismissable, keyboardScope])

  if (!open) return null

  return createPortal(
    <div
      className="dc-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (dismissable && event.target === event.currentTarget) onClose() }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={keyboardScope ? (event) => event.stopPropagation() : undefined}
        className={`dc-modal ${className}`}
        style={{ '--dc-modal-w': `${width}px` } as CSSProperties}
      >
        <header className="dc-modal-header">
          {icon && <span className="dc-modal-icon">{icon}</span>}
          <div className="dc-modal-heading">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <small>{subtitle}</small>}
          </div>
          <button type="button" className="dc-modal-close" onClick={onClose} aria-label={closeLabel} title={`${closeLabel} (Esc)`}>
            <IconClose size={13} />
          </button>
        </header>
        <div className={`dc-modal-body ${bodyClassName}`}>{children}</div>
        {footer && <footer className="dc-modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
