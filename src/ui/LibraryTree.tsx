import type { ReactNode } from 'react'
import { IconChevronDown, IconFolder, IconOpen, IconProjects } from './icons'

/**
 * Árvore de biblioteca partilhada (Esquema IEC, GRAFCET…), com o mesmo desenho e as mesmas classes da
 * biblioteca do Esquema 3D realista: chips de domínio com contagem, domínios recolhíveis com ícone na cor
 * do domínio e subpastas (pasta fechada/aberta, contagem, chevron).
 */

export type LibraryDomainChip = { id: string; label: string; count: number }

const chipClass = (active: boolean) => `rounded-full px-2 py-0.5 text-[10px] font-semibold border transition ${
  active ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface-sunken text-ink-600 border-line hover:bg-surface'
}`

/** Chips «Todos · domínio…» com contagem; clicar no chip ativo volta a «Todos». */
export function LibraryDomainChips({ domains, active, onChange, label = 'Domínios da biblioteca' }: {
  domains: LibraryDomainChip[]
  active: string
  onChange: (id: string) => void
  label?: string
}) {
  const total = domains.reduce((sum, d) => sum + d.count, 0)
  return (
    <div className="pn-section is-compact flex flex-wrap gap-1" role="tablist" aria-label={label}>
      <button type="button" role="tab" aria-selected={active === 'all'} onClick={() => onChange('all')} className={chipClass(active === 'all')}>
        Todos <span className="dc-domain-count">{total}</span>
      </button>
      {domains.map((d) => (
        <button key={d.id} type="button" role="tab" aria-selected={active === d.id} onClick={() => onChange(active === d.id ? 'all' : d.id)} className={chipClass(active === d.id)}>
          {d.label}{d.count > 0 && <span className="dc-domain-count">{d.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Linha de resumo «N itens · M pastas» com Expandir/Recolher. */
export function LibraryTreeSummary({ children, onExpand, onCollapse }: { children: ReactNode; onExpand: () => void; onCollapse: () => void }) {
  return (
    <div className="pn-section is-compact flex items-center justify-between text-[10px] text-ink-500">
      <span>{children}</span>
      <span className="flex gap-2"><button type="button" onClick={onExpand}>Expandir</button><button type="button" onClick={onCollapse}>Recolher</button></span>
    </div>
  )
}

/** Domínio (nível 1): ícone na cor do domínio, nome, contagem e chevron. */
export function LibraryDomain({ id, label, accent, count, collapsed, onToggle, icon, children }: {
  id: string
  label: string
  accent: string
  count: number
  collapsed: boolean
  onToggle: () => void
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="dc-library-domain" data-library-domain={id}>
      <button type="button" aria-expanded={!collapsed} onClick={onToggle} className="dc-library-domain-head">
        <span className="dc-library-folder-icon dc-library-domain-icon" style={{ color: accent }} aria-hidden="true">{icon ?? <IconProjects size={16} />}</span>
        <span className="dc-library-domain-label">{label}</span>
        <span className="dc-library-domain-count">{count}</span>
        <IconChevronDown size={13} className={`dc-library-folder-chevron ${collapsed ? '' : 'is-open'}`} />
      </button>
      {!collapsed && <div className="dc-library-domain-groups">{children}</div>}
    </section>
  )
}

/** Subpasta (nível 2): pasta fechada/aberta na cor do domínio, nome, contagem e chevron. */
export function LibraryFolder({ id, label, accent, count, collapsed, onToggle, children }: {
  id: string
  label: string
  accent: string
  count: number
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="dc-library-folder" data-library-subgroup={id} aria-label={label}>
      <button type="button" aria-expanded={!collapsed} className="dc-library-folder-head" onClick={onToggle} title={`${collapsed ? 'Expandir' : 'Recolher'} ${label}`}>
        <span className={`dc-library-folder-icon dc-library-subfolder-icon ${collapsed ? '' : 'is-open'}`} style={{ color: accent }} aria-hidden="true">
          {collapsed ? <IconFolder size={13} /> : <IconOpen size={13} />}
        </span>
        <strong>{label}</strong>
        <span className="dc-library-folder-count">{count}</span>
        <IconChevronDown size={13} className={`dc-library-folder-chevron ${collapsed ? '' : 'is-open'}`} />
      </button>
      {!collapsed && children}
    </section>
  )
}
