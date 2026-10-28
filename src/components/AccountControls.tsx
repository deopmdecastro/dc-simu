import { useEffect, useId, useRef, useState } from 'react'
import type { Invite, User } from '../dashboard/Dashboard'
import { IconAccount, IconBell, IconChevronRight, IconCube, IconKey, IconLogout, IconProjects, IconShield } from '../ui/icons'
import Avatar from '../ui/Avatar'
import SupabaseModal from './SupabaseModal'
import { isSupabaseConfigured } from '../supabase/supabaseClient'
import N8nModal from './N8nModal'
import { isN8nConfigured } from '../n8n/n8nClient'
import { SupabaseLogo, N8nLogo } from '../ui/BrandLogos'
import { activeAccountBackend } from '../auth/accountApi'
import ChangePasswordModal from './ChangePasswordModal'

type AccountControlsProps = {
  user: User
  invites: Invite[]
  context: 'dashboard' | 'editor' | 'admin' | 'contribute' | 'account'
  dirty?: boolean
  errors?: number
  warnings?: number
  onProjects?: () => void
  onAdmin?: () => void
  onContribute?: () => void
  onAccount?: () => void
  onLogout: () => void
  onOpenInvites?: () => void
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
  onContribute,
  onAccount,
  onLogout,
  onOpenInvites,
}: AccountControlsProps) {
  const [open, setOpen] = useState<'notifications' | 'profile' | null>(null)
  const [showSupabase, setShowSupabase] = useState(false)
  const [showN8n, setShowN8n] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const profileTrigger = useRef<HTMLButtonElement>(null)
  const profileMenu = useRef<HTMLElement>(null)
  const profileMenuId = useId()
  const total = invites.length + (dirty ? 1 : 0) + errors + warnings
  const backend = activeAccountBackend()
  const supabaseConfigured = isSupabaseConfigured()
  const n8nConfigured = isN8nConfigured()
  const sessionLabel = backend === 'server' ? 'Sessão no servidor'
    : backend === 'supabase' ? 'Sessão Supabase'
      : backend === 'local' ? 'Sessão neste navegador' : 'Sessão ativa'

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null)
    }
    const closeOnFocus = (event: FocusEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(null)
      if (open === 'profile') profileTrigger.current?.focus({ preventScroll: true })
    }
    if (open === 'profile') profileMenu.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    window.addEventListener('mousedown', close)
    window.addEventListener('focusin', closeOnFocus)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('focusin', closeOnFocus)
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
        ref={profileTrigger}
        className={`dx-account-trigger ${open === 'profile' ? 'is-active' : ''}`}
        onClick={() => setOpen((current) => current === 'profile' ? null : 'profile')}
        aria-label={`Conta de ${user.name}`}
        aria-haspopup="dialog"
        aria-expanded={open === 'profile'}
        aria-controls={open === 'profile' ? profileMenuId : undefined}
      >
        <Avatar name={user.name} email={user.email} src={user.avatar} size="sm" className="dx-account-avatar" />
        <span className="dx-account-trigger-copy"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Administrador' : 'Utilizador'}</small></span>
      </button>
      {open === 'profile' && <section ref={profileMenu} id={profileMenuId} className="dx-account-popover dx-profile-menu" role="dialog" aria-label="Menu da conta">
        <header>
          <Avatar name={user.name} email={user.email} src={user.avatar} size="lg" />
          <div className="dx-profile-identity">
            <strong title={user.name}>{user.name}</strong>
            <small title={user.email}>{user.email}</small>
            <span className="dx-profile-role"><IconShield size={11} />{user.role === 'admin' ? 'Administrador' : 'Utilizador'}</span>
          </div>
        </header>
        <nav aria-label="Ações da conta">
          <div className="dx-profile-group">
            {onAccount && context !== 'account' && <button type="button" className="dx-profile-action is-primary" onClick={() => { setOpen(null); onAccount() }}><span className="dx-profile-action-icon"><IconAccount size={17} /></span><span className="dx-profile-action-copy"><strong>Gerir conta</strong><small>Perfil e segurança</small></span><IconChevronRight className="dx-profile-chevron" size={14} /></button>}
            {onProjects && context !== 'dashboard' && <button type="button" className="dx-profile-action" onClick={showProjects}><span className="dx-profile-action-icon"><IconProjects size={17} /></span><span className="dx-profile-action-copy"><strong>Os meus projetos</strong></span><IconChevronRight className="dx-profile-chevron" size={14} /></button>}
            {onContribute && context !== 'contribute' && <button type="button" className="dx-profile-action" onClick={() => { setOpen(null); onContribute() }}><span className="dx-profile-action-icon"><IconCube size={17} /></span><span className="dx-profile-action-copy"><strong>Contribuir</strong><small>Fichas técnicas e modelos 3D</small></span><IconChevronRight className="dx-profile-chevron" size={14} /></button>}
            {onAdmin && user.role === 'admin' && context !== 'admin' && <button type="button" className="dx-profile-action" onClick={() => { setOpen(null); onAdmin() }}><span className="dx-profile-action-icon"><IconShield size={17} /></span><span className="dx-profile-action-copy"><strong>Administração</strong></span><IconChevronRight className="dx-profile-chevron" size={14} /></button>}
            {['server', 'supabase'].includes(backend) && <button type="button" className="dx-profile-action" onClick={() => { setOpen(null); setShowPassword(true) }}><span className="dx-profile-action-icon"><IconKey size={17} /></span><span className="dx-profile-action-copy"><strong>Alterar palavra-passe</strong></span><IconChevronRight className="dx-profile-chevron" size={14} /></button>}
          </div>
          <div className="dx-profile-group dx-profile-connections">
            <h3>Ligações</h3>
            <button type="button" className="dx-profile-action is-integration" onClick={() => { setOpen(null); setShowSupabase(true) }}>
              <span className="dx-profile-action-icon is-supabase"><SupabaseLogo size={20} title="" /></span>
              <span className="dx-profile-action-copy"><strong>Base de dados</strong><small>Supabase</small></span>
              <span className={`dx-profile-config ${supabaseConfigured ? 'is-set' : ''}`}>{supabaseConfigured ? 'Configurado' : 'Configurar'}</span>
              <IconChevronRight className="dx-profile-chevron" size={14} />
            </button>
            <button type="button" className="dx-profile-action is-integration" onClick={() => { setOpen(null); setShowN8n(true) }}>
              <span className="dx-profile-action-icon is-n8n"><N8nLogo size={20} title="" /></span>
              <span className="dx-profile-action-copy"><strong>Automação</strong><small>n8n Workflow</small></span>
              <span className={`dx-profile-config ${n8nConfigured ? 'is-set' : ''}`}>{n8nConfigured ? 'Configurado' : 'Configurar'}</span>
              <IconChevronRight className="dx-profile-chevron" size={14} />
            </button>
          </div>
        </nav>
        <div className="dx-profile-exit"><button type="button" className="dx-profile-action is-logout" onClick={() => { setOpen(null); onLogout() }}><span className="dx-profile-action-icon"><IconLogout size={17} /></span><span className="dx-profile-action-copy"><strong>Sair da conta</strong></span></button></div>
        <footer><span className="dx-profile-session-dot" aria-hidden="true" />{sessionLabel}</footer>
      </section>}
    </div>

    <SupabaseModal isOpen={showSupabase} onClose={() => setShowSupabase(false)} />
    <N8nModal isOpen={showN8n} onClose={() => setShowN8n(false)} />
    <ChangePasswordModal open={showPassword} onClose={() => setShowPassword(false)} />
  </div>
}
