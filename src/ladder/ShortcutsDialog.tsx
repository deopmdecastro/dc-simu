import { useEffect, useMemo, useState } from 'react'
import { SHORTCUTS, SHORTCUT_GROUPS, type ShortcutGroupId } from './ladderShortcuts'
import { IconClose } from '../ui/icons'

export function Kbd({ keys }: { keys: string[] }) {
  return (
    <span className="lk-keys">
      {keys.map((k, i) => <kbd key={`${k}-${i}`} className="lk-key">{k}</kbd>)}
    </span>
  )
}

/** Lista de atalhos reutilizável (diálogo + página Configurações). */
export function ShortcutList({ query = '' }: { query?: string }) {
  const q = query.trim().toLocaleLowerCase('pt-PT')
  const groups = useMemo(() => (Object.keys(SHORTCUT_GROUPS) as ShortcutGroupId[]).map((id) => ({
    id,
    title: SHORTCUT_GROUPS[id],
    items: SHORTCUTS.filter((s) => s.group === id && (!q || `${s.label} ${s.keys.join(' ')}`.toLocaleLowerCase('pt-PT').includes(q))),
  })).filter((g) => g.items.length), [q])
  if (!groups.length) return <p className="lk-empty">Nenhum atalho corresponde a «{query}».</p>
  return (
    <div className="lk-groups">
      {groups.map((g) => (
        <section key={g.id} className="lk-group">
          <h4>{g.title}</h4>
          {g.items.map((s) => (
            <div key={s.id} className="lk-row"><span>{s.label}</span><Kbd keys={s.keys} /></div>
          ))}
        </section>
      ))}
    </div>
  )
}

export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!open) return
    setQuery('')
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="lk-overlay" onMouseDown={onClose} role="presentation">
      <div className="lk-dialog" role="dialog" aria-modal="true" aria-label="Atalhos de teclado" onMouseDown={(e) => e.stopPropagation()}>
        <header className="lk-head">
          <div>
            <h3>Atalhos de teclado</h3>
            <small>Editor Ladder · no macOS use ⌘ em vez de Ctrl</small>
          </div>
          <button className="ladder-ghost-button" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)"><IconClose size={12} /></button>
        </header>
        <input autoFocus className="lk-search" placeholder="Filtrar atalhos…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="lk-body"><ShortcutList query={query} /></div>
      </div>
    </div>
  )
}
