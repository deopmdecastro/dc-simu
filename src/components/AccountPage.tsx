import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { User } from '../dashboard/Dashboard'
import Avatar from '../ui/Avatar'
import { accountApi, activeAccountBackend } from '../auth/accountApi'
import AccountPlanCard from '../saas/AccountPlanCard'
import ChangePasswordModal from './ChangePasswordModal'
import { IconArrowLeft, IconCamera, IconCard, IconDelete, IconIdCard, IconKey, IconMail, IconShield } from '../ui/icons'

type Notice = { kind: 'ok' | 'error'; text: string }

/** Reduz a fotografia no cliente: quadrado, JPEG. Servidor/local: 256 px (≤ 150 KB). Supabase: 96 px (≤ 12 KB), porque os metadados do utilizador viajam no token de sessão. */
async function resizeAvatar(file: File, px: number, maxChars: number): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Use uma imagem PNG, JPEG ou WebP.')
  if (file.size > 8 * 1024 * 1024) throw new Error('A imagem é demasiado grande (máx. 8 MB).')
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('O navegador não consegue processar a imagem.')
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, px, px)
  bitmap.close?.()
  for (const quality of [0.86, 0.72, 0.58]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length < maxChars) return url
  }
  throw new Error('Não foi possível reduzir a imagem o suficiente. Escolha outra.')
}

/** Gestão da conta do criador: perfil, avatar, palavra-passe e plano (ACCOUNT-PAGE-01). */
export default function AccountPage({ user, ownedProjects, onUser, onBack }: {
  user: User
  ownedProjects: number
  onUser: (user: User) => void
  onBack: () => void
}) {
  const backend = activeAccountBackend()
  const fixedLocal = backend === 'local'
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [avatar, setAvatar] = useState<string | null>(user.avatar ?? null)
  const [busy, setBusy] = useState<'profile' | 'avatar' | null>(null)
  const [profileNotice, setProfileNotice] = useState<Notice | null>(null)
  const [avatarNotice, setAvatarNotice] = useState<Notice | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setName(user.name); setEmail(user.email); setAvatar(user.avatar ?? null) }, [user.name, user.email, user.avatar])

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase()
  const nameChanged = name.trim() !== user.name
  const needsPassword = emailChanged && backend === 'server'
  const dirty = nameChanged || emailChanged
  const planNote = useMemo(() => user.role === 'admin'
    ? 'As contas de administrador não têm plano: gerem os planos dos outros utilizadores na Administração.'
    : null, [user.role])

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!dirty) return
    setBusy('profile'); setProfileNotice(null)
    try {
      const body: Record<string, unknown> = {}
      if (nameChanged) body.name = name.trim()
      if (emailChanged) { body.email = email.trim(); if (needsPassword) body.currentPassword = currentPassword }
      const result = await accountApi<{ user: User; emailPending?: boolean }>('/account/profile', 'PATCH', body)
      onUser({ ...user, ...result.user })
      setCurrentPassword('')
      setProfileNotice({ kind: 'ok', text: result.emailPending ? 'Dados guardados. Confirme o novo e-mail através da ligação enviada para a nova caixa de correio.' : 'Dados da conta guardados.' })
    } catch (error) {
      setProfileNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível guardar os dados.' })
    } finally { setBusy(null) }
  }

  async function changeAvatar(next: string | null) {
    setBusy('avatar'); setAvatarNotice(null)
    try {
      const result = await accountApi<{ user: User }>('/account/profile', 'PATCH', { avatar: next })
      setAvatar(result.user.avatar ?? null)
      onUser({ ...user, ...result.user })
      setAvatarNotice({ kind: 'ok', text: next ? 'Avatar atualizado.' : 'Avatar removido: voltam as iniciais.' })
    } catch (error) {
      setAvatarNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível atualizar o avatar.' })
    } finally { setBusy(null) }
  }

  async function pickFile(file?: File) {
    if (!file) return
    setAvatarNotice(null)
    try { await changeAvatar(await resizeAvatar(file, backend === 'supabase' ? 96 : 256, backend === 'supabase' ? 12_000 : 150_000)) }
    catch (error) { setAvatarNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Imagem inválida.' }) }
    finally { if (fileRef.current) fileRef.current.value = '' }
  }

  return <div className="acp">
    <header className="acp-head">
      <button type="button" className="dx-btn dx-btn-secondary acp-back" onClick={onBack} aria-label="Voltar aos projetos"><IconArrowLeft size={13} /><span>Projetos</span></button>
      <div className="acp-title">
        <h1>A minha conta</h1>
        <p>Perfil, segurança e plano de {user.role === 'admin' ? 'administrador' : 'criador'}.</p>
      </div>
    </header>

    <div className="acp-grid">
      <section className="acp-card" aria-labelledby="acp-avatar-h">
        <h2 id="acp-avatar-h"><IconCamera size={14} />Avatar</h2>
        <div className="acp-avatar-row">
          <Avatar name={name} email={email} src={avatar} size="lg" className="acp-avatar" />
          <div className="acp-avatar-actions">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void pickFile(event.target.files?.[0])} />
            <button type="button" className="dx-btn dx-btn-secondary" disabled={busy !== null} onClick={() => fileRef.current?.click()}><IconCamera size={13} />{avatar ? 'Mudar fotografia' : 'Carregar fotografia'}</button>
            {avatar && <button type="button" className="dx-btn dx-btn-ghost" disabled={busy !== null} onClick={() => void changeAvatar(null)}><IconDelete size={13} />Remover</button>}
          </div>
        </div>
        <small className="acp-hint">PNG, JPEG ou WebP. A imagem é recortada ao centro e reduzida a {backend === 'supabase' ? '96' : '256'} px.{fixedLocal && ' Em modo local fica guardada só neste navegador.'}</small>
        {avatarNotice && <p className={`acp-notice ${avatarNotice.kind === 'error' ? 'is-error' : ''}`} role={avatarNotice.kind === 'error' ? 'alert' : 'status'}>{avatarNotice.text}</p>}
      </section>

      <form className="acp-card" onSubmit={(event) => void saveProfile(event)} aria-labelledby="acp-profile-h">
        <h2 id="acp-profile-h"><IconIdCard size={14} />Perfil</h2>
        <label className="acp-field"><span>Nome</span>
          <input className="dx-input" value={name} maxLength={80} minLength={2} required autoComplete="name" onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="acp-field"><span><IconMail size={12} />E-mail</span>
          <input className="dx-input" type="email" value={email} maxLength={254} required autoComplete="email" disabled={fixedLocal} onChange={(event) => setEmail(event.target.value)} />
          {fixedLocal && <small className="acp-hint">As contas locais são fixas: o e-mail só muda com o servidor ou o Supabase ligados.</small>}
          {backend === 'supabase' && emailChanged && <small className="acp-hint">O Supabase envia uma ligação de confirmação para o novo e-mail.</small>}
        </label>
        {needsPassword && <label className="acp-field"><span>Palavra-passe atual</span>
          <input className="dx-input" type="password" value={currentPassword} required maxLength={200} autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} />
          <small className="acp-hint">Obrigatória para mudar o e-mail, que é a credencial de acesso.</small>
        </label>}
        <div className="acp-actions">
          <button type="submit" className="dx-btn dx-btn-primary" disabled={!dirty || busy !== null}>{busy === 'profile' ? 'A guardar…' : 'Guardar alterações'}</button>
          {dirty && <button type="button" className="dx-btn dx-btn-ghost" onClick={() => { setName(user.name); setEmail(user.email); setCurrentPassword('') }}>Repor</button>}
        </div>
        {profileNotice && <p className={`acp-notice ${profileNotice.kind === 'error' ? 'is-error' : ''}`} role={profileNotice.kind === 'error' ? 'alert' : 'status'}>{profileNotice.text}</p>}
      </form>

      <section className="acp-card" aria-labelledby="acp-security-h">
        <h2 id="acp-security-h"><IconShield size={14} />Segurança</h2>
        <p className="acp-text">Mude a palavra-passe com regularidade. {backend === 'server' ? 'As outras sessões terminam ao mudar.' : ''}</p>
        <div className="acp-actions">
          <button type="button" className="dx-btn dx-btn-secondary" disabled={fixedLocal} onClick={() => setShowPassword(true)}><IconKey size={13} />Alterar palavra-passe</button>
        </div>
        {fixedLocal && <small className="acp-hint">Requer o servidor ou o Supabase ligados.</small>}
      </section>

      <section className="acp-card acp-plan" aria-labelledby="acp-plan-h">
        <h2 id="acp-plan-h"><IconCard size={14} />Plano e subscrição</h2>
        {planNote ? <p className="acp-text">{planNote}</p> : <AccountPlanCard ownedProjects={ownedProjects} />}
      </section>
    </div>
    <ChangePasswordModal open={showPassword} onClose={() => setShowPassword(false)} />
  </div>
}
