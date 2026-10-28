import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { SHORTCUT_HELP } from './shortcuts'
import { IconHelp, IconSearch } from './icons'

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

/** Painel de ajuda partilhado: abre com F1, ? ou Ctrl+/ e fecha com Esc (Modal partilhada). */
export default function ShortcutHelp({ open, onClose, editor, extra = [] }: Props) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery('')
    // F1 também fecha — o Escape fica a cargo da Modal partilhada
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F1') { event.preventDefault(); event.stopPropagation(); onClose() }
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={760}
      title="Atalhos de teclado"
      subtitle={`${editor} · no macOS use ⌘ em vez de Ctrl`}
      icon={<span className="dc-modal-ico-badge"><IconHelp size={13} /></span>}
    >
      <div className="lk-modal-intro" role="note">
        <span className="lk-modal-intro-dot" aria-hidden="true" />
        <span>Use estes atalhos para navegar e editar sem tirar as mãos do teclado.</span>
      </div>
      <div className="lk-query">
        <IconSearch size={13} />
        <input
          data-autofocus
          className="dc-input"
          placeholder="Filtrar atalhos…"
          aria-label="Filtrar atalhos"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
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
    </Modal>
  )
}
