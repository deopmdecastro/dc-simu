import { LogoMark } from './Brand'

/** Espera partilhada pelas rotas: só a marca, uma barra de progresso indeterminada e o texto por baixo. */
export default function RouteLoading({ label }: { label: string }) {
  return (
    <div className="dx dx-route-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="dx-route-loading-stack">
        <span className="dx-route-loading-mark"><LogoMark size={88} /></span>
        <div className="dx-route-loading-bar" aria-hidden="true">
          <span className="dx-route-loading-bar-fill" />
        </div>
        <p className="dx-route-loading-label">{label}</p>
      </div>
    </div>
  )
}
