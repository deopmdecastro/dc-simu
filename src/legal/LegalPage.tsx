import { Link } from 'react-router-dom'
import { LogoMark } from '../ui/Brand'
import { LEGAL_DOCS, LEGAL_NAV, type LegalDocId } from './legalContent'

export default function LegalPage({ docId }: { docId: LegalDocId }) {
  const doc = LEGAL_DOCS[docId]

  return (
    <div className="dx-legal">
      <header className="dx-legal-top">
        <div className="dx-wrap dx-legal-top-in">
          <Link to="/" className="dx-legal-brand" aria-label="DC-SIMU — início">
            <LogoMark size={28} />
            <span className="dx-legal-brand-text">
              <strong>DC-SIMU</strong>
              <small>Electrical Panel Studio</small>
            </span>
          </Link>
          <nav className="dx-legal-nav" aria-label="Documentos legais">
            {LEGAL_NAV.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className={item.id === docId ? 'is-active' : undefined}
                aria-current={item.id === docId ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link to="/login" className="dx-legal-enter">
            Entrar
          </Link>
        </div>
      </header>

      <main className="dx-wrap dx-legal-main">
        <div className="dx-legal-hero">
          <p className="dx-legal-kicker">Informação legal</p>
          <h1>{doc.title}</h1>
          <p className="dx-legal-summary">{doc.summary}</p>
          <p className="dx-legal-updated">Última atualização: {doc.updated}</p>
        </div>

        <div className="dx-legal-body">
          {doc.sections.map((section) => (
            <section key={section.title} className="dx-legal-section">
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph.slice(0, 64)}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <nav className="dx-legal-more" aria-label="Outros documentos">
          <p>Documentos relacionados</p>
          <ul>
            {LEGAL_NAV.filter((item) => item.id !== docId).map((item) => (
              <li key={item.id}>
                <Link to={item.path}>{LEGAL_DOCS[item.id].title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>

      <footer className="dx-legal-foot">
        <div className="dx-wrap dx-legal-foot-in">
          <small>© {new Date().getFullYear()} DC-SIMU · Uso sujeito aos Termos de utilização</small>
          <div className="dx-legal-foot-links">
            {LEGAL_NAV.map((item) => (
              <Link key={item.id} to={item.path}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
