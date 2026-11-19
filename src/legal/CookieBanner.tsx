import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { acceptCookies, hasAcceptedCookies } from './cookieConsent'

/**
 * Aviso de cookies / armazenamento local.
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
        <div className="dx-cookie-actions">
          <Link to="/cookies" className="dx-btn dx-cookie-secondary">
            Saber mais
          </Link>
          <button type="button" className="dx-btn dx-cookie-primary" onClick={confirm}>
            Aceitar e continuar
          </button>
        </div>
      </div>
    </div>
  )
}
