import { useEffect, useRef, useState } from 'react'
import type { Invite, User } from '../dashboard/Dashboard'
import { IconBell, IconChevronRight, IconLogout, IconProjects, IconShield, IconUser } from '../ui/icons'

type AccountControlsProps = {
  user: User
  invites: Invite[]
  context: 'dashboard' | 'editor' | 'admin'
  dirty?: boolean
  errors?: number
  warnings?: number
  onProjects?: () => void
  onAdmin?: () => void
  onLogout: () => void
  onOpenInvites?: () => void
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'U'
}

/** Avatar e centro de notificações partilhados pelo Dashboard e pelo simulador. */
export default function AccountControls({
  user,
  invites,
  context,
  dirty = false,
  errors = 0,
  warnings = 0,
  onProjects,
  onAdmin,
  onLogout,
  onOpenInvites,
}: AccountControlsProps) {
  const [open, setOpen] = useState<'notifications' | 'profile' | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const total = invites.length + (dirty ? 1 : 0) + errors + warnings

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', escape)
    }
  }, [open])

  const showProjects = () => {
    setOpen(null)
    onProjects?.()
  }
  const showInvites = () => {
    setOpen(null)
    onOpenInvites?.()
  }

  return <div className={`dx-account-controls ${context === 'editor' ? 'is-editor' : ''}`} ref={root}>
    <div className="dx-account-popover-anchor">
      <button
        type="button"
        className={`dx-account-icon ${open === 'notifications' ? 'is-active' : ''}`}
        onClick={() => setOpen((current) => current === 'notifications' ? null : 'notifications')}
        aria-label={`Notificações${total ? ` (${total})` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open === 'notifications'}
        title="Notificações"
      >
        <IconBell size={17} />
        {total > 0 && <span className="dx-notification-badge">{total > 99 ? '99+' : total}</span>}
      </button>
      {open === 'notifications' && <section className="dx-account-popover dx-notifications" aria-label="Caixa de notificações">
        <header>
          <span><strong>Notificações</strong><small>{total ? `${total} por rever` : 'Tudo em dia'}</small></span>
          {total > 0 && <i aria-hidden />}
        </header>
        <div className="dx-notification-list">
          {invites.map((invite) => <button type="button" key={invite.id} className="dx-notification-item" onClick={showInvites}>
            <span className="dx-notification-symbol is-brand"><IconProjects size={15} /></span>
            <span><strong>Convite para {invite.project}</strong><small>{invite.sender} convidou-o para colaborar.</small></span>
            <IconChevronRight size={13} />
          </button>)}
          {dirty && <div className="dx-notification-item">
            <span className="dx-notification-symbol is-warning">●</span>
            <span><strong>Alterações por guardar</strong><small>Guarde o projeto na conta antes de sair.</small></span>
          </div>}
          {errors > 0 && <div className="dx-notification-item">
            <span className="dx-notification-symbol is-error">!</span>
            <span><strong>{errors} {errors === 1 ? 'erro ativo' : 'erros ativos'}</strong><small>Consulte o Monitor para diagnosticar o circuito.</small></span>
          </div>}
          {warnings > 0 && <div className="dx-notification-item">
            <span className="dx-notification-symbol is-warning">!</span>
            <span><strong>{warnings} {warnings === 1 ? 'aviso ativo' : 'avisos ativos'}</strong><small>Existem verificações pendentes no projeto.</small></span>
          </div>}
          {total === 0 && <div className="dx-notification-empty">
            <span><IconBell size={18} /></span>
            <strong>Sem novas notificações</strong>
            <small>Convites, avisos e estado de gravação aparecem aqui.</small>
          </div>}
        </div>
      </section>}
    </div>

    <div className="dx-account-popover-anchor">
      <button
        type="button"
        className={`dx-account-trigger ${open === 'profile' ? 'is-active' : ''}`}
        onClick={() => setOpen((current) => current === 'profile' ? null : 'profile')}
        aria-label={`Conta de ${user.name}`}
        aria-haspopup="dialog"
        aria-expanded={open === 'profile'}
      >
        <span className="dx-avatar">{initials(user.name)}</span>
        <span className="dx-account-trigger-copy"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Administrador' : 'Utilizador'}</small></span>
      </button>
      {open === 'profile' && <section className="dx-account-popover dx-profile-menu" aria-label="Menu da conta">
        <header>
          <span className="dx-avatar is-large">{initials(user.name)}</span>
          <span><strong>{user.name}</strong><small>{user.email}</small></span>
        </header>
        <div className="dx-profile-role"><IconShield size={13} />{user.role === 'admin' ? 'Conta de administrador' : 'Conta de utilizador'}</div>
        <nav>
          {onProjects && context !== 'dashboard' && <button type="button" onClick={showProjects}><IconProjects size={15} /><span>Os meus projetos</span><IconChevronRight size={13} /></button>}
          {onAdmin && user.role === 'admin' && context !== 'admin' && <button type="button" onClick={() => { setOpen(null); onAdmin() }}><IconShield size={15} /><span>Administração</span><IconChevronRight size={13} /></button>}
          {context === 'admin' && onProjects && <button type="button" onClick={showProjects}><IconProjects size={15} /><span>Voltar aos projetos</span><IconChevronRight size={13} /></button>}
          <button type="button" className="is-logout" onClick={() => { setOpen(null); onLogout() }}><IconLogout size={15} /><span>Sair da conta</span></button>
        </nav>
        <footer><IconUser size={12} />Sessão local protegida</footer>
      </section>}
    </div>
  </div>
}
