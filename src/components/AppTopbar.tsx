import type { ReactNode } from 'react'
import type { Invite, User } from '../dashboard/Dashboard'
import Logo from '../ui/Brand'
import AccountControls from './AccountControls'

export function AppTopbar({ user, invites, section, onProjects, onAdmin, onContribute, onInvites, onLogout }: {
  user: User
  invites: Invite[]
  section: 'dashboard' | 'admin' | 'contribute'
  onProjects: () => void
  onAdmin: () => void
  onContribute: () => void
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
        onContribute={onContribute} onOpenInvites={onInvites} onLogout={onLogout} />
    </div>
  </header>
}

export function EditorTopbar({ projectName, dirty, message, actions }: {
  projectName: string
  dirty: boolean
  message?: string
  actions: ReactNode
}) {
  return <div className="account-bar dx">
    <Logo size={22} tagline={false} />
    <span className="dx-bar-sep">/</span>
    <div className="dx-project-context"><strong>{projectName}</strong><small>{dirty ? 'Alterações por guardar' : 'Guardado na conta'}</small></div>
    {message && <span className="dx-bar-msg">{message}</span>}
    <div className="account-bar-actions">{actions}</div>
  </div>
}
