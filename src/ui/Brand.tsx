import { useId } from 'react'

/**
 * Marca DC-SIMU — logótipo único usado em toda a aplicação (landing, auth,
 * dashboard, editor): quadrado arredondado azul com raio branco.
 * É o mesmo símbolo de public/favicon.svg e dos ícones da PWA.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  const gid = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="dx-mark">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#3869fa" />
          <stop offset="1" stopColor="#1944bf" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="14" fill={`url(#${gid})`} />
      <path d="M35 10 17 35h12l-3 19 21-29H34z" fill="#fff" stroke="#fff" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

/** Logótipo completo com wordmark. Tema claro em toda a aplicação. */
export default function Logo({
  size = 28,
  tagline = true,
}: {
  size?: number
  /** Mantido por compatibilidade — a aplicação usa apenas o tema claro. */
  tone?: 'light' | 'dark'
  tagline?: boolean
}) {
  return (
    <span className="dx-logo">
      <LogoMark size={size} />
      <span className="dx-logo-text">
        <b>DC-SIMU</b>
        {tagline && <small>Electrical Panel Studio</small>}
      </span>
    </span>
  )
}
