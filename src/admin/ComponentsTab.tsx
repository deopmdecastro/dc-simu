import { useMemo, useState } from 'react'
import { TEMPLATES } from '../electrical/factory'
import { COMPONENT_OPTIONS, formatDate } from '../contrib/ContribParts'
import type { Contribution } from '../contrib/types'
import { getComponentPhysicalSizeMm, hasComponent3DModel } from '../three/modelPaths'
import type { ComponentType } from '../types'
import { adminApi } from './adminApi'
import type { ComponentSetting } from './adminTypes'

type Props = {
  settings: ComponentSetting[]
  contributions: Contribution[]
  onChanged: (message: string) => Promise<void> | void
  onError: (message: string) => void
  onOpenContributions: (type: string) => void
}

type StateFilter = 'all' | 'active' | 'disabled' | 'no3d' | 'pending'

/** Catálogo de componentes: disponibilidade na biblioteca, modelo 3D oficial e contribuições da comunidade. */
export default function ComponentsTab({ settings, contributions, onChanged, onError, onOpenContributions }: Props) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [state, setState] = useState<StateFilter>('all')
  const [disabling, setDisabling] = useState<{ type: string; note: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const disabledMap = useMemo(() => new Map(settings.filter((entry) => !entry.enabled).map((entry) => [String(entry.type), entry])), [settings])
  const groups = useMemo(() => [...new Set(COMPONENT_OPTIONS.map((option) => option.group))], [])

  const rows = useMemo(() => COMPONENT_OPTIONS.map((option) => {
    const mine = contributions.filter((item) => item.componentType === option.type)
    return {
      ...option,
      setting: disabledMap.get(option.type),
      official3d: hasComponent3DModel(option.type),
      sized: !!getComponentPhysicalSizeMm(option.type),
      datasheets: mine.filter((item) => item.kind === 'datasheet' && item.status === 'approved').length,
      models: mine.filter((item) => item.kind === 'model3d' && item.status === 'approved').length,
      pending: mine.filter((item) => item.status === 'pending').length,
    }
  }), [contributions, disabledMap])

  const visible = rows.filter((row) => (group === 'all' || row.group === group)
    && (state === 'all' || (state === 'active' && !row.setting) || (state === 'disabled' && !!row.setting) || (state === 'no3d' && !row.official3d) || (state === 'pending' && row.pending > 0))
    && `${row.label} ${row.type} ${row.group}`.toLowerCase().includes(query.trim().toLowerCase()))

  // Propostas de componentes que ainda não existem no simulador.
  const proposals = useMemo(() => {
    const map = new Map<string, { name: string; count: number; pending: number; authors: Set<string> }>()
    for (const item of contributions) {
      if (item.componentType || !item.customName) continue
      const key = item.customName.trim().toLowerCase()
      const entry = map.get(key) ?? { name: item.customName.trim(), count: 0, pending: 0, authors: new Set<string>() }
      entry.count++
      if (item.status === 'pending') entry.pending++
      entry.authors.add(item.authorName)
      map.set(key, entry)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [contributions])

  async function setEnabled(type: string, enabled: boolean, note = '') {
    setBusy(true)
    try {
      await adminApi.setComponent(type, enabled, note)
      setDisabling(null)
      await onChanged(enabled ? `«${TEMPLATES[type as ComponentType]?.paletteName ?? type}» reativado na biblioteca.` : `«${TEMPLATES[type as ComponentType]?.paletteName ?? type}» desativado na biblioteca.`)
    } catch (value) { onError(value instanceof Error ? value.message : 'Falha na operação') }
    finally { setBusy(false) }
  }

  const counts = { total: rows.length, disabled: rows.filter((row) => row.setting).length, no3d: rows.filter((row) => !row.official3d).length }

  return <>
    <div className="dx-admin-section"><h2>Componentes</h2><span>{counts.total - counts.disabled} ativos · {counts.disabled} desativados · {counts.no3d} sem modelo 3D</span></div>
    <p className="cb-note cb-banner">Um componente desativado deixa de poder ser inserido a partir da biblioteca. Os projetos que já o usam continuam a abrir normalmente.</p>

    <div className="cb-filters cb-filters-components">
      <input className="dx-input" type="search" placeholder="Pesquisar componente…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Pesquisar componentes" />
      <select className="dx-input" value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Filtrar por grupo">
        <option value="all">Todos os grupos</option>{groups.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <select className="dx-input" value={state} onChange={(event) => setState(event.target.value as StateFilter)} aria-label="Filtrar por estado">
        <option value="all">Todos</option><option value="active">Ativos</option><option value="disabled">Desativados</option><option value="no3d">Sem modelo 3D</option><option value="pending">Com contribuições em revisão</option>
      </select>
    </div>

    <div className="cb-components">
      {visible.length === 0 && <div className="dx-admin-empty">Nenhum componente com este filtro.</div>}
      {visible.map((row) => <article key={row.type} className={`cb-component ${row.setting ? 'is-disabled' : ''}`}>
        <div className="cb-component-main">
          <strong>{row.label}</strong>
          <small>{row.group} · <code>{row.type}</code></small>
          {row.setting && <small className="cb-component-note">Desativado{row.setting.updatedBy ? ` por ${row.setting.updatedBy}` : ''}{row.setting.updatedAt ? ` · ${formatDate(row.setting.updatedAt)}` : ''}{row.setting.note ? ` — ${row.setting.note}` : ''}</small>}
        </div>
        <div className="cb-component-chips">
          <span className={`cb-badge ${row.official3d ? 'is-ok' : 'is-off'}`}>{row.official3d ? (row.sized ? '3D com escala real' : '3D oficial') : 'Sem modelo 3D'}</span>
          <span className="cb-badge">{row.datasheets} ficha(s)</span>
          <span className="cb-badge">{row.models} modelo(s) da comunidade</span>
          {row.pending > 0 && <span className="cb-badge is-warn">{row.pending} em revisão</span>}
        </div>
        <div className="cb-actions">
          {(row.datasheets + row.models + row.pending) > 0 && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => onOpenContributions(row.type)}>Ver contribuições</button>}
          {row.setting
            ? <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy} onClick={() => void setEnabled(row.type, true)}>Reativar</button>
            : <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={busy} onClick={() => setDisabling(disabling?.type === row.type ? null : { type: row.type, note: '' })}>{disabling?.type === row.type ? 'Cancelar' : 'Desativar…'}</button>}
        </div>
        {disabling?.type === row.type && <div className="cb-reject">
          <input className="dx-input" value={disabling.note} maxLength={300} autoFocus placeholder="Motivo (visível para os utilizadores)…" onChange={(event) => setDisabling({ type: row.type, note: event.target.value })} />
          <button className="dx-btn dx-btn-danger dx-btn-sm" disabled={busy || !disabling.note.trim()} onClick={() => void setEnabled(row.type, false, disabling.note.trim())}>Confirmar</button>
        </div>}
      </article>)}
    </div>

    <div className="dx-admin-section"><h2>Componentes propostos pela comunidade</h2><span>{proposals.length}</span></div>
    <div className="dx-admin-table">
      {proposals.length === 0 && <div className="dx-admin-empty">Ninguém propôs componentes novos.</div>}
      {proposals.map((entry) => <div key={entry.name}>
        <span><strong>{entry.name}</strong> · {entry.count} ficheiro(s) · {[...entry.authors].join(', ')}</span>
        {entry.pending > 0 ? <span className="cb-badge is-warn">{entry.pending} em revisão</span> : <span className="cb-badge">Sem pendentes</span>}
      </div>)}
    </div>
  </>
}
