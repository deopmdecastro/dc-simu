import Logo from './Brand'

/** Espera indeterminada partilhada pelas rotas, sem simular etapas ou progresso. */
export default function RouteLoading({ label }: { label: string }) {
  return (
    <div className="dx dx-route-loading" role="status" aria-live="polite" aria-busy="true">
      <section className="dx-route-loading-card">
        <header className="dx-route-loading-brand">
          <Logo size={36} tagline={false} />
          <span>Simulação elétrica</span>
        </header>

        <div className="dx-route-loading-diagram" aria-hidden="true">
          <svg viewBox="0 0 344 144" fill="none" focusable="false">
            <path className="dx-route-loading-wire" d="M24 44h48v28h64M24 108h72V92h40M208 72h64V44h48M208 92h80v16h32" />
            <path className="dx-route-loading-signal" d="M24 44h48v28h64M208 72h64V44h48" />
            <rect className="dx-route-loading-relay" x="136" y="44" width="72" height="72" rx="12" />
            <path className="dx-route-loading-contact" d="M156 96V80m32 16V80m-32-6 32-16" />
            <circle className="dx-route-loading-terminal" cx="24" cy="44" r="5" />
            <circle className="dx-route-loading-terminal" cx="24" cy="108" r="5" />
            <circle className="dx-route-loading-terminal" cx="320" cy="44" r="5" />
            <circle className="dx-route-loading-terminal" cx="320" cy="108" r="5" />
            <circle className="dx-route-loading-junction" cx="72" cy="72" r="3" />
            <circle className="dx-route-loading-junction" cx="288" cy="92" r="3" />
          </svg>
        </div>

        <div className="dx-route-loading-copy">
          <h1 className="dx-route-loading-label">{label}</h1>
          <p>Aguarde enquanto a página é preparada.</p>
        </div>

        <div className="dx-route-loading-bar" aria-hidden="true">
          <span className="dx-route-loading-bar-fill" />
        </div>
      </section>
    </div>
  )
}
