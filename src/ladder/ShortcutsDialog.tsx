import { useEffect, useMemo, useState } from 'react'
import Modal from '../ui/Modal'
import { SHORTCUTS, SHORTCUT_GROUPS, type ShortcutGroupId } from './ladderShortcuts'
import { IconHelp, IconSearch } from '../ui/icons'

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

/** Usa a Modal partilhada (Esc/clique fora, folha inferior no telemóvel). */
export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  useEffect(() => { if (open) setQuery('') }, [open])
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={760}
      title="Atalhos de teclado"
      subtitle="Editor Ladder · no macOS use ⌘ em vez de Ctrl"
      icon={<span className="dc-modal-ico-badge"><IconHelp size={13} /></span>}
    >
      <div className="lk-query">
        <IconSearch size={13} />
        <input
          data-autofocus
          className="dc-input"
          placeholder="Filtrar atalhos…"
          aria-label="Filtrar atalhos"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ShortcutList query={query} />
    </Modal>
  )
}
