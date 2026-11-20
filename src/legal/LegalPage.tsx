import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../ui/Brand'
import { LEGAL_DOCS, LEGAL_NAV, type LegalDocId } from './legalContent'

/** Ícones simples por secção (mesmo traço da UI institucional). */
function SectionIcon({ index }: { index: number }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  }
  switch (index % 10) {
    case 0: // responsável / documento
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      )
    case 1: // dados
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          <path d="M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" />
        </svg>
      )
    case 2: // finalidades
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
    case 3: // armazenamento
      return (
        <svg {...common}>
          <path d="M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" />
          <path d="M4 7l2-3h12l2 3" />
          <path d="M9 12h6" />
        </svg>
      )
    case 4: // partilha
      return (
        <svg {...common}>
          <circle cx="7" cy="12" r="2.5" />
          <circle cx="17" cy="7" r="2.5" />
          <circle cx="17" cy="17" r="2.5" />
          <path d="M9.3 11l5.4-3.2M9.3 13l5.4 3.2" />
        </svg>
      )
    case 5: // prazos
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      )
    case 6: // direitos
      return (
        <svg {...common}>
          <path d="M12 3 4 7v5c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V7l-8-4z" />
        </svg>
      )
    case 7: // segurança
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      )
    case 8: // menores
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 19c1.2-3.2 3.5-4.8 6.5-4.8S17.3 15.8 18.5 19" />
        </svg>
      )
    default: // alterações
      return (
        <svg {...common}>
          <path d="M4 12a8 8 0 0 1 13.5-5.7M20 12a8 8 0 0 1-13.5 5.7" />
          <path d="M17.5 6.3V3.5H20M6.5 17.7v2.8H4" />
        </svg>
      )
  }
}

const DOC_ICONS: Record<LegalDocId, ReactNode> = {
  privacidade: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 4 7v5c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V7l-8-4z" />
    </svg>
  ),
  termos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  ),
  cookies: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="14" cy="9" r="1" fill="currentColor" />
      <circle cx="11" cy="14" r="1" fill="currentColor" />
      <circle cx="15.5" cy="13.5" r="1" fill="currentColor" />
    </svg>
  ),
  licencas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 12 11 14l4-4" />
      <path d="M12 3 4 7v5c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V7l-8-4z" />
    </svg>
  ),
}

export default function LegalPage({ docId }: { docId: LegalDocId }) {
  const doc = LEGAL_DOCS[docId]
  const related = LEGAL_NAV.filter((item) => item.id !== docId)

  return (
    <div className="dx dx-legal">
      {/* Mesma barra da landing */}
      <nav className="dx-nav is-scrolled">
        <div className="dx-wrap dx-nav-in">
          <Link to="/" className="dx-legal-logo-link" aria-label="DC-SIMU — início">
            <Logo size={32} />
          </Link>
          <div className="dx-nav-cta">
            <Link to="/" className="dx-btn dx-btn-ghost dx-btn-sm">
              Início
            </Link>
            <Link to="/login" className="dx-btn dx-btn-primary dx-btn-sm">
              Entrar
            </Link>
          </div>
        </div>
      </nav>

      {/* Tabs dos documentos */}
      <div className="dx-legal-tabs-bar">
        <nav className="dx-wrap dx-legal-tabs" aria-label="Documentos legais">
          {LEGAL_NAV.map((item) => (
            <Link
              key={item.id}
              to={item.path}
              className={item.id === docId ? 'is-active' : undefined}
              aria-current={item.id === docId ? 'page' : undefined}
            >
              <span className="dx-legal-tab-icon">{DOC_ICONS[item.id]}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <main className="dx-wrap dx-legal-main">
        <article className="dx-legal-article">
          <header className="dx-legal-hero">
            <p className="dx-legal-kicker">
              <span className="dx-legal-kicker-icon">{DOC_ICONS[docId]}</span>
              Informação legal
            </p>
            <h1>{doc.title}</h1>
            <p className="dx-legal-summary">{doc.summary}</p>
            <p className="dx-legal-updated">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <rect x="4" y="5" width="16" height="15" rx="2" />
                <path d="M8 3v4M16 3v4M4 10h16" />
              </svg>
              Última atualização: {doc.updated}
            </p>
          </header>

          <ol className="dx-legal-toc" aria-label="Índice">
            {doc.sections.map((section, index) => (
              <li key={section.title}>
                <a href={`#sec-${index + 1}`}>
                  <span className="dx-legal-toc-icon">
                    <SectionIcon index={index} />
                  </span>
                  <span>{section.title.replace(/^\d+\.\s*/, '')}</span>
                </a>
              </li>
            ))}
          </ol>

          <div className="dx-legal-body">
            {doc.sections.map((section, index) => (
              <section key={section.title} id={`sec-${index + 1}`} className="dx-legal-section">
                <h2>
                  <span className="dx-legal-section-icon">
                    <SectionIcon index={index} />
                  </span>
                  {section.title}
                </h2>
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
                  <span className="dx-legal-more-icon">{DOC_ICONS[item.id]}</span>
                  <span className="dx-legal-more-copy">
                    <span className="dx-legal-more-label">{item.label}</span>
                    <span className="dx-legal-more-name">{LEGAL_DOCS[item.id].title}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </main>

      <footer className="dx-legal-foot">
        <div className="dx-wrap dx-legal-foot-in">
          <div className="dx-legal-foot-brand">
            <Logo size={22} tagline={false} />
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
