/**
 * Marca DC-SIMU — logótipo único usado em toda a aplicação (landing, auth,
 * dashboard, editor). Desenho técnico: módulo em calha DIN + traço de energia.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="dx-mark">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--dx-mark-bg)" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="7.5" fill="none" stroke="var(--dx-mark-ring)" strokeOpacity=".55" />
      <path d="M6 11.5h20M6 20.5h20" stroke="var(--dx-mark-rail)" strokeWidth="1.2" />
      <path d="M18.6 6.2 10.6 17.4h4.6l-2.1 8.4 8-11.2h-4.6z" fill="var(--dx-mark-bolt)" />
    </svg>
  )
}

/** Logótipo completo com wordmark. `tone` adapta ao fundo claro ou escuro. */
export default function Logo({
  size = 28,
  tone = 'light',
  tagline = true,
}: {
  size?: number
  tone?: 'light' | 'dark'
  tagline?: boolean
}) {
  return (
    <span className={`dx-logo dx-logo-${tone}`}>
      <LogoMark size={size} />
      <span className="dx-logo-text">
        <b>
          DC<span>·</span>SIMU
        </b>
        {tagline && <small>electrical panel studio</small>}
      </span>
    </span>
  )
}
