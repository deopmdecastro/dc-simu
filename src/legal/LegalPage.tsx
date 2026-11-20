import { Link } from 'react-router-dom'
import { LogoMark } from '../ui/Brand'
import { LEGAL_DOCS, LEGAL_NAV, type LegalDocId } from './legalContent'

export default function LegalPage({ docId }: { docId: LegalDocId }) {
  const doc = LEGAL_DOCS[docId]
  const related = LEGAL_NAV.filter((item) => item.id !== docId)

  return (
    <div className="dx-legal">
      <header className="dx-legal-top">
        <div className="dx-wrap dx-legal-top-in">
          <Link to="/" className="dx-legal-brand" aria-label="DC-SIMU — início">
            <LogoMark size={26} />
            <span className="dx-legal-brand-text">
              <strong>DC-SIMU</strong>
              <small>Electrical Panel Studio</small>
            </span>
          </Link>
          <div className="dx-legal-top-actions">
            <Link to="/" className="dx-legal-ghost">
              Início
            </Link>
            <Link to="/login" className="dx-legal-enter">
              Entrar
            </Link>
          </div>
        </div>
        <div className="dx-legal-tabs-wrap">
          <nav className="dx-wrap dx-legal-tabs" aria-label="Documentos legais">
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
        </div>
      </header>

      <main className="dx-wrap dx-legal-main">
        <article className="dx-legal-article">
          <header className="dx-legal-hero">
            <p className="dx-legal-kicker">Informação legal</p>
            <h1>{doc.title}</h1>
            <p className="dx-legal-summary">{doc.summary}</p>
            <p className="dx-legal-updated">Última atualização: {doc.updated}</p>
          </header>

          <ol className="dx-legal-toc" aria-label="Índice">
            {doc.sections.map((section, index) => (
              <li key={section.title}>
                <a href={`#sec-${index + 1}`}>{section.title.replace(/^\d+\.\s*/, '')}</a>
              </li>
            ))}
          </ol>

          <div className="dx-legal-body">
            {doc.sections.map((section, index) => (
              <section
                key={section.title}
                id={`sec-${index + 1}`}
                className="dx-legal-section"
              >
                <h2>{section.title}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 72)}>{paragraph}</p>
                ))}
              </section>
            ))}
          </div>
        </article>

        <aside className="dx-legal-more" aria-label="Outros documentos">
          <p className="dx-legal-more-title">Outros documentos</p>
          <ul className="dx-legal-more-list">
            {related.map((item) => (
              <li key={item.id}>
                <Link to={item.path}>
                  <span className="dx-legal-more-label">{item.label}</span>
                  <span className="dx-legal-more-name">{LEGAL_DOCS[item.id].title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </main>

      <footer className="dx-legal-foot">
        <div className="dx-wrap dx-legal-foot-in">
          <div className="dx-legal-foot-brand">
            <LogoMark size={20} />
            <small>© {new Date().getFullYear()} DC-SIMU · Uso sujeito aos Termos de utilização</small>
          </div>
          <nav className="dx-legal-foot-links" aria-label="Rodapé legal">
            {LEGAL_NAV.map((item) => (
              <Link key={item.id} to={item.path} className={item.id === docId ? 'is-active' : undefined}>
                {item.label}
              </Link>
            ))}
            <Link to="/">Início</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
