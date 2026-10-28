import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Invite, User } from '../dashboard/Dashboard'
import Logo from '../ui/Brand'
import { IconEdit } from '../ui/icons'
import AccountControls from './AccountControls'

export function AppTopbar({ user, invites, section, onProjects, onAdmin, onContribute, onAccount, onInvites, onLogout }: {
  user: User
  invites: Invite[]
  section: 'dashboard' | 'admin' | 'contribute' | 'account'
  onProjects: () => void
  onAdmin: () => void
  onContribute: () => void
  onAccount: () => void
  onInvites: () => void
  onLogout: () => void
}) {
  return <header className="dx-topbar">
    <Logo size={28} />
    <div className="dx-topbar-right">
      {section !== 'contribute' && <button className="dx-btn dx-btn-secondary dx-btn-sm dx-topbar-link" onClick={onContribute}>Contribuir</button>}
      {user.role === 'admin' && section !== 'admin' && <button className="dx-btn dx-btn-secondary dx-btn-sm dx-topbar-link" onClick={onAdmin}>Administração</button>}
      <AccountControls user={user} invites={invites} context={section}
        onProjects={section !== 'dashboard' ? onProjects : undefined}
        onAdmin={user.role === 'admin' ? onAdmin : undefined}
        onContribute={onContribute} onAccount={onAccount} onOpenInvites={onInvites} onLogout={onLogout} />
    </div>
  </header>
}

export function EditorTopbar({ projectName, dirty, message, onRename, actions }: {
  projectName: string
  dirty: boolean
  message?: string
  /** Chamado ao confirmar um novo nome (clique no nome); o pai resolve conflitos e grava. */
  onRename?: (name: string) => void
  actions: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(projectName)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!editing) setValue(projectName) }, [projectName, editing])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])
  const commit = () => {
    const next = value.trim()
    setEditing(false)
    if (!next || next === projectName) return
    onRename?.(next)
  }
  return <div className="account-bar dx">
    <Logo size={22} tagline={false} />
    <span className="dx-bar-sep">/</span>
    <div className="dx-project-context">
      {editing ? (
        <input
          ref={inputRef}
          className="dx-project-name-input"
          value={value}
          maxLength={120}
          autoFocus
          aria-label="Nome do projeto"
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); commit() }
            if (event.key === 'Escape') { event.preventDefault(); setValue(projectName); setEditing(false) }
          }}
        />
      ) : (
        <button
          type="button"
          className="dx-project-rename"
          onClick={() => onRename && setEditing(true)}
          disabled={!onRename}
          title={onRename ? 'Clique para mudar o nome do projeto' : undefined}
        >
          <strong>{projectName}</strong>
          {onRename && <IconEdit size={11} />}
        </button>
      )}
      <small>{dirty ? 'Alterações por guardar' : 'Guardado na conta'}</small>
    </div>
    {message && <span className="dx-bar-msg">{message}</span>}
    <div className="account-bar-actions">{actions}</div>
  </div>
}
