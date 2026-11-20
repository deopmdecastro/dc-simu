import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { acceptCookies, hasAcceptedCookies } from './cookieConsent'

/** Ícone de cookie no azul da marca, sem dependências externas. */
function CookieIcon() {
  return (
    <span className="dx-cookie-icon" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="22" height="22" fill="none">
        <path
          d="M24 4a20 20 0 1 0 20 20c0-1.6-1.4-2.6-2.9-2.2-2.5.7-4.6-1.2-4.4-3.7.1-1.7-1.2-3-2.9-2.9-2.5.2-4.4-1.9-3.7-4.4.4-1.5-.6-2.9-2.2-2.9-1 0-2-.9-2.3-1.9C25.1 4.9 24.6 4 24 4Z"
          fill="currentColor"
        />
        <circle cx="17" cy="18" r="2.4" fill="#fff" />
        <circle cx="26" cy="27" r="2.4" fill="#fff" />
        <circle cx="16" cy="31" r="2" fill="#fff" />
        <circle cx="31" cy="36" r="2.2" fill="#fff" />
      </svg>
    </span>
  )
}

/**
 * Aviso de cookies / armazenamento local — tema claro institucional (v4).
 * Só mostra se ainda não existir aceitação da versão atual da política.
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(!hasAcceptedCookies())
  }, [])

  if (!visible) return null

  function confirm() {
    acceptCookies()
    setVisible(false)
  }

  return (
    <div className="dx-cookie" role="dialog" aria-labelledby="dx-cookie-title" aria-describedby="dx-cookie-desc">
      <div className="dx-cookie-in">
        <div className="dx-cookie-header">
          <CookieIcon />
          <div className="dx-cookie-copy">
            <strong id="dx-cookie-title">Cookies e dados no dispositivo</strong>
            <p id="dx-cookie-desc">
              Utilizamos armazenamento local essencial para sessão, projetos e preferências.
              Ao continuar, confirma que leu a{' '}
              <Link to="/cookies">política de cookies</Link>
              {' '}e a{' '}
              <Link to="/privacidade">política de privacidade</Link>.
            </p>
          </div>
        </div>
        <div className="dx-cookie-actions">
          <Link to="/cookies" className="dx-cookie-secondary">
            Saber mais
          </Link>
          <button type="button" className="dx-cookie-primary" onClick={confirm}>
            Aceitar e continuar
          </button>
        </div>
      </div>
    </div>
  )
}
