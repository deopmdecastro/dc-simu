import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { IconChevronDown } from '../ui/icons'

/**
 * Menu «Mais ações» para as linhas da administração: as ações frequentes ficam em botões
 * visíveis e as raras ou destrutivas passam para aqui. Fecha com Esc, clique fora ou ao
 * escolher um item; o foco volta ao botão.
 */
export default function RowMenu({ label = 'Mais ações', children }: { label?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return <div className="adm-menu" ref={root}>
    <button ref={trigger} type="button" className="dx-btn dx-btn-secondary dx-btn-sm" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen(!open)}>
      {label} <IconChevronDown size={10} />
    </button>
    {open && <div className="adm-menu-list" id={listId} role="menu">{children(() => setOpen(false))}</div>}
  </div>
}

/** Item do menu. Quando está desativado, `hint` diz o que falta para o ativar. */
export function MenuItem({ onClick, disabled, hint, danger, children }: { onClick: () => void; disabled?: boolean; hint?: string; danger?: boolean; children: ReactNode }) {
  return <button type="button" role="menuitem" className={`adm-menu-item${danger ? ' is-danger' : ''}`} disabled={disabled} title={hint} onClick={onClick}>
    <span>{children}</span>
    {disabled && hint && <small>{hint}</small>}
  </button>
}
