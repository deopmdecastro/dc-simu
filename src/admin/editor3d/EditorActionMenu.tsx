import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronDown } from '../../ui/icons'

/** O portal mantém as ações acessíveis quando a barra precisa de rolagem horizontal. */
export default function EditorActionMenu({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    popup.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const close = (event: PointerEvent) => { if (!button.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false) }
    const resize = () => setOpen(false)
    document.addEventListener('pointerdown', close)
    window.addEventListener('resize', resize)
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('resize', resize) }
  }, [open])
  const rect = button.current?.getBoundingClientRect()
  return <>
    <button ref={button} className={`dc-tool-btn${open ? ' dc-tool-active' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{icon}<span>{label}</span><IconChevronDown size={10} /></button>
    {open && rect && createPortal(<div ref={popup} className="ce-command-popover" role="dialog" aria-label={label} style={{ left: Math.max(8, Math.min(innerWidth - 256, rect.left)), top: Math.min(rect.bottom + 5, innerHeight - 280) }}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus() } }}
      onClick={(event) => { if ((event.target as HTMLElement).closest('button:not(:disabled)')) { setOpen(false); button.current?.focus() } }}>
      <strong className="ce-command-title">{label}</strong>{children}
    </div>, document.body)}
  </>
}
