import Select from '../ui/Select'
import { useMemo, useState } from 'react'
import { TEMPLATES } from '../electrical/factory'
import { COMPONENT_OPTIONS, formatDate } from '../contrib/ContribParts'
import type { Contribution } from '../contrib/types'
import { getComponentPhysicalSizeMm, hasComponent3DModel } from '../three/modelPaths'
import type { ComponentType } from '../types'
import { adminApi } from './adminApi'
import type { ComponentSetting } from './adminTypes'
import { usePlanStore } from '../saas/usePlan'
import { COMPONENT_STATUS_LABEL, componentStatusOf, type ComponentStatus, type PlanId } from '../saas/platformCore.mjs'

type Props = {
  settings: ComponentSetting[]
  contributions: Contribution[]
  onChanged: (message: string) => Promise<void> | void
  onError: (message: string) => void
  onOpenContributions: (type: string) => void
}

type StateFilter = 'library' | 'active' | 'blocked' | 'archived' | 'deleted' | 'premium' | 'no3d' | 'nosize' | 'nodatasheet' | 'pending'
type SortKey = 'name' | 'group' | 'state' | 'completeness'
type PendingAction = { types: string[]; status: ComponentStatus; note: string } | null

const STATUS_ORDER: Record<ComponentStatus, number> = { blocked: 0, archived: 1, deleted: 2, active: 3 }
const ACTION_DONE: Record<ComponentStatus, string> = { active: 'reposto(s) na biblioteca', blocked: 'bloqueado(s)', archived: 'arquivado(s)', deleted: 'eliminado(s) do catálogo' }
const ACTION_HELP: Record<Exclude<ComponentStatus, 'active'>, string> = {
  blocked: 'Continua visível na biblioteca com um cadeado e o motivo; não pode ser inserido.',
  archived: 'Sai da biblioteca e da pesquisa. Os projetos que já o usam continuam a abrir. Pode ser reposto a qualquer momento.',
  deleted: 'Sai do catálogo e só aparece no filtro «Eliminados». Os projetos existentes continuam a abrir; pode ser reposto a partir desse filtro.',
}

/** Catálogo de componentes: estado na biblioteca, plano mínimo, modelo 3D oficial e contribuições da comunidade. */
export default function ComponentsTab({ settings, contributions, onChanged, onError, onOpenContributions }: Props) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [state, setState] = useState<StateFilter>('library')
  const [pending, setPending] = useState<PendingAction>(null)
  const [busy, setBusy] = useState(false)
  const [sort, setSort] = useState<SortKey>('group')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const pricing = usePlanStore((s) => s.pricing)

  const settingMap = useMemo(() => new Map(settings.map((entry) => [String(entry.type), entry])), [settings])
  const groups = useMemo(() => [...new Set(COMPONENT_OPTIONS.map((option) => option.group))], [])

  const rows = useMemo(() => COMPONENT_OPTIONS.map((option) => {
    const mine = contributions.filter((item) => item.componentType === option.type)
    const setting = settingMap.get(option.type)
    return {
      ...option,
      setting,
      status: componentStatusOf(setting),
      minPlan: setting?.minPlan ?? null,
      official3d: hasComponent3DModel(option.type),
      sized: !!getComponentPhysicalSizeMm(option.type),
      datasheets: mine.filter((item) => item.kind === 'datasheet' && item.status === 'approved').length,
      models: mine.filter((item) => item.kind === 'model3d' && item.status === 'approved').length,
      pending: mine.filter((item) => item.status === 'pending').length,
      /** 0–3: modelo 3D, escala real e pelo menos uma ficha técnica aprovada */
      score: Number(hasComponent3DModel(option.type)) + Number(!!getComponentPhysicalSizeMm(option.type)) + Number(mine.some((item) => item.kind === 'datasheet' && item.status === 'approved')),
    }
  }), [contributions, settingMap])
  type Row = (typeof rows)[number]

  const matchesState = (row: Row) => {
    switch (state) {
      case 'library': return row.status === 'active' || row.status === 'blocked'
      case 'active': case 'blocked': case 'archived': case 'deleted': return row.status === state
      case 'premium': return !!row.minPlan && row.status !== 'deleted'
      case 'no3d': return !row.official3d && row.status !== 'deleted'
      case 'nosize': return row.official3d && !row.sized && row.status !== 'deleted'
      case 'nodatasheet': return row.datasheets === 0 && row.status !== 'deleted'
      case 'pending': return row.pending > 0
    }
  }
  const visibleUnsorted = rows.filter((row) => (group === 'all' || row.group === group) && matchesState(row)
    && `${row.label} ${row.type} ${row.group}`.toLowerCase().includes(query.trim().toLowerCase()))
  const visible = [...visibleUnsorted].sort((a, b) =>
    sort === 'name' ? a.label.localeCompare(b.label, 'pt-PT')
      : sort === 'state' ? STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.label.localeCompare(b.label, 'pt-PT')
        : sort === 'completeness' ? a.score - b.score || a.label.localeCompare(b.label, 'pt-PT')
          : a.group.localeCompare(b.group, 'pt-PT') || a.label.localeCompare(b.label, 'pt-PT'))
  const visibleTypes = visible.map((row) => row.type)
  const selectedVisible = visibleTypes.filter((type) => selected.has(type))
  const toggle = (type: string) => setSelected((current) => { const next = new Set(current); next.has(type) ? next.delete(type) : next.add(type); return next })
  const toggleAllVisible = () => setSelected((current) => {
    const next = new Set(current)
    if (selectedVisible.length === visibleTypes.length) visibleTypes.forEach((type) => next.delete(type)); else visibleTypes.forEach((type) => next.add(type))
    return next
  })
  const nameOf = (type: string) => TEMPLATES[type as ComponentType]?.paletteName ?? type

  /** Aplica um estado a vários tipos, mantendo o plano mínimo de cada um. */
  async function applyStatus(types: string[], status: ComponentStatus, note = '') {
    const targets = types.filter((type) => componentStatusOf(settingMap.get(type)) !== status || status === 'blocked')
    if (!targets.length) { onError('Os componentes selecionados já estão nesse estado.'); return }
    setBusy(true)
    let done = 0
    try {
      for (const type of targets) {
        await adminApi.setComponentStatus(type, { status, note: status === 'active' ? '' : note, minPlan: settingMap.get(type)?.minPlan ?? null })
        done++
      }
      setSelected(new Set()); setPending(null)
      await onChanged(targets.length === 1 ? `«${nameOf(targets[0])}» ${ACTION_DONE[status].replace('(s)', '')}.` : `${done} componente(s) ${ACTION_DONE[status]}.`)
    } catch (value) {
      onError(`${value instanceof Error ? value.message : 'Falha na operação'}${done ? ` (${done} já aplicados)` : ''}`)
      if (done) await onChanged(`${done} componente(s) alterado(s) antes do erro.`)
    } finally { setBusy(false) }
  }

  async function setMinPlan(row: Row, minPlan: PlanId | null) {
    setBusy(true)
    try {
      await adminApi.setComponentStatus(row.type, { status: row.status, note: row.setting?.note ?? '', minPlan })
      await onChanged(minPlan ? `«${row.label}» reservado ao plano ${pricing.plans.find((p) => p.id === minPlan)?.name ?? minPlan} ou superior.` : `«${row.label}» disponível em todos os planos.`)
    } catch (value) { onError(value instanceof Error ? value.message : 'Falha na operação') }
    finally { setBusy(false) }
  }

  function exportCsv() {
    const cell = (value: string | number) => { const text = String(value); return /^[=+\-@\t\r]/.test(text) || /[",;\n]/.test(text) ? `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"` : text }
    const header = ['tipo', 'nome', 'grupo', 'estado', 'motivo', 'plano_minimo', 'modelo3d', 'escala_real', 'fichas_aprovadas', 'modelos_comunidade', 'em_revisao']
    const lines = rows.map((row) => [row.type, row.label, row.group, COMPONENT_STATUS_LABEL[row.status].toLowerCase(), row.setting?.note ?? '', row.minPlan ?? '', row.official3d ? 'sim' : 'não', row.sized ? 'sim' : 'não', row.datasheets, row.models, row.pending].map(cell).join(','))
    const blob = new Blob(['\uFEFF' + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `dc-simu-componentes-${new Date().toISOString().slice(0, 10)}.csv`; link.click()
    URL.revokeObjectURL(url)
  }

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

  const counts = Object.fromEntries((['active', 'blocked', 'archived', 'deleted'] as ComponentStatus[]).map((status) => [status, rows.filter((row) => row.status === status).length])) as Record<ComponentStatus, number>
  const premiumCount = rows.filter((row) => row.minPlan && row.status !== 'deleted').length
  const no3d = rows.filter((row) => !row.official3d).length

  const confirmBar = (types: string[]) => pending && pending.types.join(',') === types.join(',') && pending.status !== 'active' && <div className={`cb-reject cb-confirm is-${pending.status}`} role="group" aria-label="Confirmar alteração do componente">
    <span className="cb-confirm-text">{ACTION_HELP[pending.status as Exclude<ComponentStatus, 'active'>]}</span>
    <input className="dx-input" value={pending.note} maxLength={300} autoFocus placeholder={pending.status === 'blocked' ? 'Motivo (obrigatório, visível para os utilizadores)…' : 'Nota interna (opcional)…'} onChange={(event) => setPending({ ...pending, note: event.target.value })} aria-label="Motivo" />
    <button className="dx-btn dx-btn-danger dx-btn-sm" disabled={busy || (pending.status === 'blocked' && !pending.note.trim())} onClick={() => void applyStatus(pending.types, pending.status, pending.note.trim())}>
      {pending.status === 'blocked' ? 'Confirmar bloqueio' : pending.status === 'archived' ? 'Confirmar arquivo' : 'Confirmar eliminação'}
    </button>
    <button className="dx-btn dx-btn-ghost dx-btn-sm" onClick={() => setPending(null)}>Cancelar</button>
  </div>

  return <>
    <div className="dx-admin-section"><h2>Componentes</h2><span>{counts.active} ativos · {counts.blocked} bloqueados · {counts.archived} arquivados · {counts.deleted} eliminados · {premiumCount} com plano mínimo · {no3d} sem modelo 3D</span></div>
    <p className="cb-note cb-banner"><strong>Bloquear</strong> mantém o componente visível com cadeado; <strong>arquivar</strong> retira-o da biblioteca; <strong>eliminar</strong> retira-o do catálogo (fica no filtro «Eliminados» e pode ser reposto). O <strong>plano mínimo</strong> reserva o componente a utilizadores desse plano ou superior. Os projetos que já usam o componente continuam sempre a abrir.</p>

    <div className="cb-filters cb-filters-components">
      <input className="dx-input" type="search" placeholder="Pesquisar componente…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Pesquisar componentes" />
      <Select className="dx-input" value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Filtrar por grupo">
        <option value="all">Todos os grupos</option>{groups.map((name) => <option key={name} value={name}>{name}</option>)}
      </Select>
      <Select className="dx-input" value={state} onChange={(event) => setState(event.target.value as StateFilter)} aria-label="Filtrar por estado">
        <option value="library">Na biblioteca (ativos e bloqueados)</option><option value="active">Ativos</option><option value="blocked">Bloqueados</option><option value="archived">Arquivados</option><option value="deleted">Eliminados</option><option value="premium">Com plano mínimo</option><option value="no3d">Sem modelo 3D</option><option value="nosize">3D sem escala real</option><option value="nodatasheet">Sem ficha técnica</option><option value="pending">Com contribuições em revisão</option>
      </Select>
      <Select className="dx-input" value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Ordenar componentes">
        <option value="group">Ordenar: grupo</option><option value="name">Ordenar: nome</option><option value="state">Ordenar: estado (bloqueados primeiro)</option><option value="completeness">Ordenar: menos completos primeiro</option>
      </Select>
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={exportCsv} title="Exporta o catálogo completo (CSV)">Exportar CSV</button>
    </div>

    <div className="cb-bulk" role="toolbar" aria-label="Ações em lote">
      <label><input type="checkbox" checked={!!visibleTypes.length && selectedVisible.length === visibleTypes.length} onChange={toggleAllVisible} disabled={!visibleTypes.length} /> Selecionar visíveis ({selectedVisible.length}/{visibleTypes.length})</label>
      {selectedVisible.length > 0 && <>
        <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy} onClick={() => void applyStatus(selectedVisible, 'active')}>Repor / desbloquear</button>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={busy} onClick={() => setPending({ types: selectedVisible, status: 'blocked', note: '' })}>Bloquear…</button>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={busy} onClick={() => setPending({ types: selectedVisible, status: 'archived', note: '' })}>Arquivar…</button>
        <button className="dx-btn dx-btn-danger dx-btn-sm" disabled={busy} onClick={() => setPending({ types: selectedVisible, status: 'deleted', note: '' })}>Eliminar…</button>
        <button className="dx-btn dx-btn-ghost dx-btn-sm" onClick={() => setSelected(new Set())}>Limpar seleção</button>
      </>}
      {selectedVisible.length > 0 && confirmBar(selectedVisible)}
    </div>

    <div className="cb-components">
      {visible.length === 0 && <div className="dx-admin-empty">Nenhum componente com este filtro.</div>}
      {visible.map((row) => <article key={row.type} className={`cb-component ${row.status !== 'active' ? 'is-disabled' : ''} is-${row.status}`} data-status={row.status}>
        <div className="cb-component-main">
          <label className="cb-select"><input type="checkbox" checked={selected.has(row.type)} onChange={() => toggle(row.type)} aria-label={`Selecionar ${row.label}`} /></label>
          <strong>{row.label}</strong>
          <small>{row.group} · <code>{row.type}</code></small>
          {row.setting && row.status !== 'active' && <small className="cb-component-note">{COMPONENT_STATUS_LABEL[row.status]}{row.setting.updatedBy ? ` por ${row.setting.updatedBy}` : ''}{row.setting.updatedAt ? ` · ${formatDate(row.setting.updatedAt)}` : ''}{row.setting.note ? ` — ${row.setting.note}` : ''}</small>}
        </div>
        <div className="cb-component-chips">
          <span className={`cb-badge cb-status is-${row.status}`}>{COMPONENT_STATUS_LABEL[row.status]}</span>
          {row.minPlan && <span className="cb-badge is-plan">Plano {pricing.plans.find((p) => p.id === row.minPlan)?.name ?? row.minPlan}+</span>}
          <span className={`cb-badge ${row.official3d ? 'is-ok' : 'is-off'}`}>{row.official3d ? (row.sized ? '3D com escala real' : '3D oficial') : 'Sem modelo 3D'}</span>
          <span className={`cb-badge ${row.score === 3 ? 'is-ok' : row.score === 0 ? 'is-off' : ''}`} title="Modelo 3D + escala real + ficha técnica">{row.score}/3 completo</span>
          <span className="cb-badge">{row.datasheets} ficha(s)</span>
          <span className="cb-badge">{row.models} modelo(s) da comunidade</span>
          {row.pending > 0 && <span className="cb-badge is-warn">{row.pending} em revisão</span>}
        </div>
        <div className="cb-actions">
          {(row.datasheets + row.models + row.pending) > 0 && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => onOpenContributions(row.type)}>Ver contribuições</button>}
          {row.status !== 'deleted' && <Select className="dx-input dx-input-sm" value={row.minPlan ?? ''} disabled={busy} aria-label={`Plano mínimo de ${row.label}`} onChange={(event) => void setMinPlan(row, (event.target.value || null) as PlanId | null)}>
            <option value="">Todos os planos</option>
            {pricing.plans.filter((p) => p.id !== 'free').map((p) => <option key={p.id} value={p.id}>A partir de {p.name}</option>)}
          </Select>}
          {row.status === 'active'
            ? <>
              <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={busy} onClick={() => setPending({ types: [row.type], status: 'blocked', note: '' })}>Bloquear…</button>
              <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={busy} onClick={() => setPending({ types: [row.type], status: 'archived', note: '' })}>Arquivar…</button>
            </>
            : <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy} onClick={() => void applyStatus([row.type], 'active')}>{row.status === 'blocked' ? 'Desbloquear' : 'Repor'}</button>}
          {row.status === 'blocked' && <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={busy} onClick={() => setPending({ types: [row.type], status: 'archived', note: '' })}>Arquivar…</button>}
          {row.status !== 'deleted' && <button className="dx-btn dx-btn-danger dx-btn-sm" disabled={busy} onClick={() => setPending({ types: [row.type], status: 'deleted', note: '' })}>Eliminar…</button>}
        </div>
        {confirmBar([row.type])}
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
