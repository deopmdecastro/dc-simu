import { useMemo, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { ComponentThumb } from '../three/componentThumbnails'
import type { ElectricalComponent } from '../types'
import type { SelectionGroup } from '../ui/selectionGroups'
import ComponentTableDialog from './ComponentTableDialog'
import { IconChevronUp, IconChevronDown, IconFolder, IconLayers, IconLock, IconOpen, IconRotate, IconSearch, IconUngroup, IconUnlock } from '../ui/icons'

type Row =
  | { kind: 'item'; item: ElectricalComponent; nested: boolean }
  | { kind: 'group'; group: SelectionGroup; label: string; members: ElectricalComponent[]; total: number }

/** Resumo dos membros de um grupo: «RMP1, RMP2, CAL5 +9». */
const summary = (members: ElectricalComponent[]) => {
  const refs = members.map((m) => m.ref)
  return refs.length <= 3 ? refs.join(', ') : `${refs.slice(0, 3).join(', ')} +${refs.length - 3}`
}

/**
 * Lista dos elementos do projeto (lado direito, ao lado do GRAFCET): mostra
 * tudo o que está no esquema/painel, seleciona ao clicar e dá as ações de
 * rotação e de ordem de desenho (trazer para a frente / enviar para trás).
 * A ordem da lista é a ordem de desenho: o último é o que fica por cima.
 * Os grupos (Ctrl+G) aparecem como árvore: uma pasta por grupo, na posição do
 * seu membro mais à frente, com os membros por baixo. Shift+clique seleciona o intervalo
 * entre duas linhas; Ctrl+clique junta ou retira uma linha.
 */
export default function ProjectObjects() {
  const components = useSimStore((s) => s.components)
  const selectionGroups = useSimStore((s) => s.selectionGroups)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const selectComponents = useSimStore((s) => s.selectComponents)
  const rotateComponents = useSimStore((s) => s.rotateComponents)
  const reorderComponents = useSimStore((s) => s.reorderComponents)
  const updateComponent = useSimStore((s) => s.updateComponent)
  const ungroupItems = useSimStore((s) => s.ungroupItems)
  const [query, setQuery] = useState('')
  const [tableOpen, setTableOpen] = useState(false)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  /** Âncora da seleção por intervalo (Shift+clique): a última linha clicada sem Shift. */
  const [anchor, setAnchor] = useState<string | null>(null)

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase()
    // De cima para baixo = da frente para trás, pela camada real de desenho
    // (campo `z`, com a ordem de inserção a desempatar).
    const ordered = components
      .map((item, index) => ({ item, index, z: item.z ?? 0 }))
      .sort((a, b) => b.z - a.z || b.index - a.index)
      .map((entry) => entry.item)
    const matches = (item: ElectricalComponent) => !text || `${item.ref} ${item.label ?? ''} ${item.type}`.toLowerCase().includes(text)
    const groups = selectionGroups.filter((g) => g.view === 'schematic')
    const groupOfId = new Map<string, SelectionGroup>()
    for (const g of groups) for (const m of g.members) groupOfId.set(m, g)
    const out: Row[] = []
    const placed = new Set<string>()
    for (const item of ordered) {
      const g = groupOfId.get(item.id)
      if (!g) {
        if (matches(item)) out.push({ kind: 'item', item, nested: false })
        continue
      }
      if (placed.has(g.id)) continue
      placed.add(g.id)
      const all = ordered.filter((c) => groupOfId.get(c.id) === g)
      const label = g.name?.trim() || `Grupo ${groups.indexOf(g) + 1}`
      const members = !text || label.toLowerCase().includes(text) ? all : all.filter(matches)
      if (members.length) out.push({ kind: 'group', group: g, label, members, total: all.length })
    }
    return out
  }, [components, selectionGroups, query])

  const isExpanded = (g: SelectionGroup, members: ElectricalComponent[]) => {
    const ids = members.map((m) => m.id)
    const some = ids.some((id) => selectedIds.includes(id)) && !ids.every((id) => selectedIds.includes(id))
    return open.has(g.id) || !!query.trim() || some
  }
  /** Linhas visíveis pela ordem do ecrã: cada uma com a chave e os componentes que representa. */
  const visible = useMemo(() => {
    const out: Array<{ key: string; ids: string[] }> = []
    for (const row of rows) {
      if (row.kind === 'item') { out.push({ key: row.item.id, ids: [row.item.id] }); continue }
      // Pasta aberta: o intervalo conta só os membros visíveis; recolhida, conta o grupo inteiro.
      const shown = isExpanded(row.group, row.members)
      out.push({ key: `group:${row.group.id}`, ids: shown ? [] : row.members.map((m) => m.id) })
      if (shown) for (const m of row.members) out.push({ key: m.id, ids: [m.id] })
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, open, query, selectedIds])
  /**
   * Clique numa linha: simples seleciona só essa linha (um membro sozinho, sem arrastar o grupo);
   * Ctrl/⌘ liga ou desliga a linha; Shift seleciona tudo entre a âncora e esta linha.
   */
  const pick = (key: string, ids: string[], event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    if (event.shiftKey && anchor) {
      const a = visible.findIndex((r) => r.key === anchor), b = visible.findIndex((r) => r.key === key)
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a]
        const range = [...new Set(visible.slice(from, to + 1).flatMap((r) => r.ids))]
        selectComponents(event.ctrlKey || event.metaKey ? [...new Set([...selectedIds, ...range])] : range, false, false)
        return
      }
    }
    setAnchor(key)
    if (event.ctrlKey || event.metaKey) {
      const on = ids.every((id) => selectedIds.includes(id))
      selectComponents(on ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])], false, false)
      return
    }
    selectComponents(ids, false, false)
  }

  const targets = selectedIds.length ? selectedIds : []
  const act = (where: 'front' | 'back' | 'forward' | 'backward') => targets.length && reorderComponents(targets, where)
  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const rename = (group: SelectionGroup, name: string) => {
    setRenaming(null)
    const clean = name.trim()
    if (clean === (group.name ?? '')) return
    useSimStore.getState().commitHistory()
    useSimStore.setState((s) => ({
      selectionGroups: s.selectionGroups.map((g) => g.id === group.id ? { ...g, name: clean || undefined } : g),
      dirty: true,
    }))
  }

  const itemRow = (item: ElectricalComponent, nested: boolean) => {
    const selected = selectedIds.includes(item.id)
    return <li key={item.id} className={`dc-objects-row${selected ? ' is-on' : ''}${nested ? ' is-nested' : ''}`} data-object-id={item.id}>
      <button type="button" className="dc-objects-main" onClick={(event) => pick(item.id, [item.id], event)}
        title={`${item.ref} · ${item.type} · rotação ${item.rotation}°`}>
        <span className="dc-objects-card"><ComponentThumb type={item.type} size={nested ? 34 : 40} /></span>
        <span className="dc-objects-text">
          <span className="dc-objects-ref">{item.ref}{item.rotation !== 0 && <span className="dc-objects-badge">{item.rotation}°</span>}</span>
          <span className="dc-objects-name">{item.label || item.type}</span>
        </span>
      </button>
      <span className="dc-objects-tools">
        <button type="button" title="Rodar 90°" onClick={() => rotateComponents([item.id], 90)}><IconRotate size={11} /></button>
        <button type="button" title="Trazer para a frente" onClick={() => reorderComponents([item.id], 'front')}><IconChevronUp size={11} /></button>
        <button type="button" title="Enviar para trás" onClick={() => reorderComponents([item.id], 'back')}><IconChevronDown size={11} /></button>
        <button type="button" title={item.locked ? 'Desbloquear' : 'Bloquear'} onClick={() => updateComponent(item.id, { locked: !item.locked })}>{item.locked ? <IconLock size={11} /> : <IconUnlock size={11} />}</button>
      </span>
    </li>
  }

  const groupRow = (row: Extract<Row, { kind: 'group' }>) => {
    const { group, label, members, total } = row
    const ids = members.map((m) => m.id)
    const allSelected = ids.every((id) => selectedIds.includes(id))
    // Aberto por escolha, durante a pesquisa ou quando só parte do grupo está selecionada.
    const expanded = isExpanded(group, members)
    const locked = members.every((m) => m.locked)
    return <li key={`group-${group.id}`} className="dc-objects-group" data-object-group={group.id}>
      <div className={`dc-objects-row dc-objects-group-head${allSelected ? ' is-on' : ''}`}>
        <button type="button" className="dc-objects-twisty" aria-expanded={expanded} title={expanded ? 'Recolher grupo' : 'Expandir grupo'} onClick={() => toggle(group.id)}>
          <IconChevronDown size={12} className={expanded ? 'is-open' : ''} />
        </button>
        <button type="button" className="dc-objects-main" onClick={(event) => pick(`group:${group.id}`, ids, event)}
          onDoubleClick={() => setRenaming(group.id)} title={`${label} · ${total} objetos (duplo clique para mudar o nome)`}>
          <span className="dc-objects-card dc-objects-group-card">
            <ComponentThumb type={members[0].type} size={40} />
            <span className="dc-objects-group-icon">{expanded ? <IconOpen size={11} /> : <IconFolder size={11} />}</span>
          </span>
          <span className="dc-objects-text">
            {renaming === group.id
              ? <input className="dc-objects-rename" autoFocus defaultValue={group.name ?? ''} placeholder={label} aria-label="Nome do grupo"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => rename(group, e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }} />
              : <span className="dc-objects-ref">{label}<span className="dc-objects-count">{total}</span></span>}
            <span className="dc-objects-name">{summary(members)}</span>
          </span>
        </button>
        <span className="dc-objects-tools">
          <button type="button" title="Rodar o grupo 90°" onClick={() => rotateComponents(ids, 90)}><IconRotate size={11} /></button>
          <button type="button" title="Trazer o grupo para a frente" onClick={() => reorderComponents(ids, 'front')}><IconChevronUp size={11} /></button>
          <button type="button" title="Enviar o grupo para trás" onClick={() => reorderComponents(ids, 'back')}><IconChevronDown size={11} /></button>
          <button type="button" title={locked ? 'Desbloquear o grupo' : 'Bloquear o grupo'} onClick={() => ids.forEach((id) => updateComponent(id, { locked: !locked }))}>{locked ? <IconLock size={11} /> : <IconUnlock size={11} />}</button>
          <button type="button" title="Desagrupar (Ctrl+Shift+G)" onClick={() => ungroupItems('schematic', ids)}><IconUngroup size={11} /></button>
        </span>
      </div>
      {expanded && <ul className="dc-objects-children">{members.map((m) => itemRow(m, true))}</ul>}
    </li>
  }

  return <div className="dc-objects">
    <div className="dc-objects-head">
      <span className="dc-objects-title"><IconLayers size={12} /> Objetos do projeto <b>{components.length}</b><button type="button" className="dc-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setTableOpen(true)} title="Criar e posicionar componentes por tabela ou Excel">Tabela</button></span>
      <label className="dc-objects-search">
        <IconSearch size={11} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar por referência, nome ou tipo" aria-label="Procurar objeto" />
      </label>
    </div>

    <div className="dc-objects-actions">
      <button type="button" className="dc-btn-sm" disabled={!targets.length} title="Rodar 90° para a esquerda (Shift+R)" onClick={() => rotateComponents(targets, -90)}><IconRotate size={12} />−90°</button>
      <button type="button" className="dc-btn-sm" disabled={!targets.length} title="Rodar 90° para a direita (R)" onClick={() => rotateComponents(targets, 90)}><IconRotate size={12} />+90°</button>
      <button type="button" className="dc-btn-sm" disabled={!targets.length} title="Trazer para a frente (Ctrl+])" onClick={() => act('front')}><IconChevronUp size={12} />Frente</button>
      <button type="button" className="dc-btn-sm" disabled={!targets.length} title="Um passo para a frente" onClick={() => act('forward')}>+1</button>
      <button type="button" className="dc-btn-sm" disabled={!targets.length} title="Um passo para trás" onClick={() => act('backward')}>−1</button>
      <button type="button" className="dc-btn-sm" disabled={!targets.length} title="Enviar para trás (Ctrl+[)" onClick={() => act('back')}><IconChevronDown size={12} />Trás</button>
    </div>

    {components.length === 0 && <p className="dc-objects-empty">O projeto ainda não tem componentes. Adicione-os pela Biblioteca.</p>}
    {components.length > 0 && rows.length === 0 && <p className="dc-objects-empty">Nenhum objeto corresponde a «{query}».</p>}

    <ul className="dc-objects-list">
      {rows.map((row) => row.kind === 'group' ? groupRow(row) : itemRow(row.item, row.nested))}
    </ul>
    {tableOpen && <ComponentTableDialog onClose={() => setTableOpen(false)} />}
  </div>
}
