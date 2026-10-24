import { useState, type FormEvent } from 'react'
import Modal from '../ui/Modal'
import { accountApi, activeAccountBackend } from '../auth/accountApi'
import { passwordProblem } from '../admin/adminTypes'

type ChangePasswordModalProps = { open: boolean; onClose: () => void }

export default function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const backend = activeAccountBackend()
  const isServer = backend === 'server'
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const close = () => {
    if (busy) return
    setCurrentPassword('')
    setNewPassword('')
    setConfirmation('')
    setMessage(null)
    onClose()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (newPassword !== confirmation) {
      setMessage({ ok: false, text: 'As palavras-passe novas não coincidem.' })
      return
    }
    const problem = passwordProblem(newPassword)
    if (problem) {
      setMessage({ ok: false, text: problem })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await accountApi<{ ok: true; sessionsClosed?: number }>('/account/password', 'POST', { currentPassword, newPassword })
      const closed = result.sessionsClosed ?? 0
      setMessage({ ok: true, text: `Palavra-passe alterada. A sessão atual foi renovada${closed ? `; ${closed} outra(s) sessão(ões) terminou(aram)` : ''}.` })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Não foi possível alterar a palavra-passe.' })
    } finally {
      setBusy(false)
    }
  }

  return <Modal
    open={open}
    onClose={close}
    title="Alterar palavra-passe"
    subtitle={isServer ? 'Confirme a palavra-passe atual; as outras sessões serão terminadas.' : 'A nova palavra-passe será guardada pela conta Supabase.'}
    width={440}
    keyboardScope
    footer={<>
      <button type="button" className="dc-btn dc-btn-secondary" onClick={close} disabled={busy}>Cancelar</button>
      <button type="submit" form="dc-change-password-form" className="dc-btn dc-btn-primary" disabled={busy}>
        {busy ? 'A guardar…' : 'Alterar palavra-passe'}
      </button>
    </>}
  >
    <form id="dc-change-password-form" onSubmit={(event) => void submit(event)} style={{ display: 'grid', gap: 12 }}>
      {isServer && <label style={{ display: 'grid', gap: 5, color: '#475569', fontSize: 12, fontWeight: 650 }}>
        Palavra-passe atual
        <input className="dc-input" type="password" autoComplete="current-password" required maxLength={200} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
      </label>}
      <label style={{ display: 'grid', gap: 5, color: '#475569', fontSize: 12, fontWeight: 650 }}>
        Palavra-passe nova
        <input className="dc-input" type="password" autoComplete="new-password" required maxLength={200} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 5, color: '#475569', fontSize: 12, fontWeight: 650 }}>
        Repetir palavra-passe nova
        <input className="dc-input" type="password" autoComplete="new-password" required maxLength={200} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      </label>
      <small style={{ color: '#64748b', fontSize: 11, lineHeight: 1.45 }}>Mínimo 10 caracteres, com maiúsculas, minúsculas e pelo menos um número.</small>
      {message && <div role="status" style={{ padding: '8px 10px', borderRadius: 7, color: message.ok ? '#166534' : '#991b1b', background: message.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${message.ok ? '#bbf7d0' : '#fecaca'}`, fontSize: 12 }}>{message.text}</div>}
    </form>
  </Modal>
}
