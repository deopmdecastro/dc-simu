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
  children: ReactNode
}

export default function Modal({
  open, onClose, title, subtitle, icon, width = 560, footer,
  dismissable = true, className = '', bodyClassName = '', closeLabel = 'Fechar', children,
}: ModalProps) {
  const titleId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement as HTMLElement | null
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissable) { event.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    const timer = window.setTimeout(() => {
      const target = boxRef.current?.querySelector<HTMLElement>('[data-autofocus]')
        ?? boxRef.current?.querySelector<HTMLElement>('input, select, textarea, button')
      ;(target ?? boxRef.current)?.focus()
    }, 30)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.clearTimeout(timer)
      lastFocus.current?.focus()
    }
  }, [open, onClose, dismissable])

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
