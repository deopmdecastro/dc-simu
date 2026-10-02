import { useEffect, useMemo, useState } from 'react'
import { SHORTCUT_HELP } from './shortcuts'

export interface ShortcutHelpExtra {
  title: string
  items: Array<{ keys: string; action: string }>
}

interface Props {
  open: boolean
  onClose: () => void
  /** Nome do editor, mostrado no cabeçalho. */
  editor: string
  /** Atalhos próprios do editor, listados antes dos universais. */
  extra?: ShortcutHelpExtra[]
}

/** Painel de ajuda partilhado: abre com F1, ? ou Ctrl+/ e fecha com Esc. */
export default function ShortcutHelp({ open, onClose, editor, extra = [] }: Props) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery('')
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'F1') { event.preventDefault(); event.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  const groups = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-PT')
    const all = [...extra, { title: 'Atalhos universais', items: SHORTCUT_HELP }]
    return all
      .map((group) => ({ ...group, items: group.items.filter((item) => !q || `${item.action} ${item.keys}`.toLocaleLowerCase('pt-PT').includes(q)) }))
      .filter((group) => group.items.length)
  }, [query, extra])

  if (!open) return null
  return (
    <div className="lk-overlay" onMouseDown={onClose} role="presentation">
      <div className="lk-dialog" role="dialog" aria-modal="true" aria-label="Atalhos de teclado" onMouseDown={(event) => event.stopPropagation()}>
        <header className="lk-head">
          <div>
            <h3>Atalhos de teclado</h3>
            <small>{editor} · no macOS use ⌘ em vez de Ctrl</small>
          </div>
          <button className="ladder-ghost-button" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)">×</button>
        </header>
        <input autoFocus className="lk-search" placeholder="Filtrar atalhos…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="lk-body">
          {groups.length === 0
            ? <p className="lk-empty">Nenhum atalho corresponde a «{query}».</p>
            : <div className="lk-groups">
              {groups.map((group) => (
                <section key={group.title} className="lk-group">
                  <h4>{group.title}</h4>
                  {group.items.map((item) => (
                    <div key={`${group.title}-${item.keys}`} className="lk-row">
                      <span>{item.action}</span>
                      <span className="lk-keys">{item.keys.split(' · ').map((combo) => <kbd key={combo} className="lk-key">{combo}</kbd>)}</span>
                    </div>
                  ))}
                </section>
              ))}
            </div>}
        </div>
      </div>
    </div>
  )
}
