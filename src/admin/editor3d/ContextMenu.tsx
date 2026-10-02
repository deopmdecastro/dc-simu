import { useEffect, useRef } from 'react'

export interface MenuItem { label: string; hint?: string; danger?: boolean; disabled?: boolean; onClick: () => void }
export type MenuEntry = MenuItem | 'sep'

/** Menu de contexto genérico (fecha com clique fora, Esc, scroll ou resize; navega com setas). */
export default function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) { // mantém o menu dentro da janela
      const r = el.getBoundingClientRect()
      el.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 4))}px`
      el.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 4))}px`
      el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    }
    const close = (event: Event) => { if (!(event.target instanceof Node && ref.current?.contains(event.target))) onClose() }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
    }
    window.addEventListener('pointerdown', close, true); window.addEventListener('wheel', close, true); window.addEventListener('resize', onClose); window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('wheel', close, true); window.removeEventListener('resize', onClose); window.removeEventListener('keydown', key, true) }
  }, [x, y, onClose])
  return <div ref={ref} className="ce-ctx" role="menu" style={{ left: x, top: y }} onContextMenu={(event) => event.preventDefault()}>
    {items.map((item, index) => item === 'sep'
      ? <span key={`s${index}`} className="ce-menu-sep" role="separator" />
      : <button key={item.label} role="menuitem" disabled={item.disabled} className={`ce-menu-item${item.danger ? ' is-danger' : ''}`} onClick={() => { onClose(); item.onClick() }}>
        <span>{item.label}</span>{item.hint && <kbd className="ce-kbd" style={{ display: 'inline' }}>{item.hint}</kbd>}
      </button>)}
  </div>
}
