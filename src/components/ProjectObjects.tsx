import { useMemo, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { ComponentThumb } from '../three/componentThumbnails'
import { paletteDomains } from '../electrical/factory'
import type { ComponentType, ElectricalComponent } from '../types'
import ComponentTableDialog from './ComponentTableDialog'
import { IconChevronUp, IconChevronDown, IconEye, IconEyeOff, IconFolder, IconLayers, IconLock, IconOpen, IconRotate, IconSearch, IconUnlock } from '../ui/icons'

interface SubgroupNode {
  id: string
  title: string
  items: ElectricalComponent[]
}

interface DomainNode {
  id: string
  title: string
  subgroups: SubgroupNode[]
  items: ElectricalComponent[]
}

/**
 * Lista dos elementos do projeto (lado direito, ao lado do GRAFCET): mostra
 * tudo o que está no esquema/painel, organizado em árvore igual à Biblioteca
 * (Domínio → Subgrupo → Componentes), com olho para ocultar/mostrar,
 * rotação, ordem de desenho (frente/trás) e bloqueio.
 */
export default function ProjectObjects() {
  const components = useSimStore((s) => s.components)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const selectComponents = useSimStore((s) => s.selectComponents)
  const rotateComponents = useSimStore((s) => s.rotateComponents)
  const reorderComponents = useSimStore((s) => s.reorderComponents)
  const updateComponent = useSimStore((s) => s.updateComponent)
  const [query, setQuery] = useState('')
  const [tableOpen, setTableOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  /** Âncora da seleção por intervalo (Shift+clique): a última linha clicada sem Shift. */
  const [anchor, setAnchor] = useState<string | null>(null)

  const typeLookup = useMemo(() => {
    const map = new Map<ComponentType, { domainId: string; domainTitle: string; domainOrder: number; subgroupId: string; subgroupTitle: string; subgroupOrder: number }>()
    const domains = paletteDomains()
    domains.forEach((d, dIdx) => {
      d.subgroups.forEach((sg, sgIdx) => {
        sg.items.forEach((it) => {
          if (!map.has(it.type)) {
            map.set(it.type, {
              domainId: d.id,
              domainTitle: d.label,
              domainOrder: dIdx,
              subgroupId: sg.id,
              subgroupTitle: sg.label,
              subgroupOrder: sgIdx,
            })
          }
        })
      })
    })
    return map
  }, [])

  const tree = useMemo<DomainNode[]>(() => {
    const text = query.trim().toLowerCase()
    const ordered = components
      .map((item, index) => ({ item, index, z: item.z ?? 0 }))
      .sort((a, b) => b.z - a.z || b.index - a.index)
      .map((entry) => entry.item)

    const matches = (item: ElectricalComponent) =>
      !text || `${item.ref} ${item.label ?? ''} ${item.type}`.toLowerCase().includes(text)

    const domainMap = new Map<string, { id: string; title: string; order: number; subgroups: Map<string, { id: string; title: string; order: number; items: ElectricalComponent[] }> }>()

    for (const item of ordered) {
      if (!matches(item)) continue
      const meta = typeLookup.get(item.type) ?? {
        domainId: 'outros',
        domainTitle: 'Outros',
        domainOrder: 999,
        subgroupId: 'outros',
        subgroupTitle: 'Outros',
        subgroupOrder: 999,
      }
      let dNode = domainMap.get(meta.domainId)
      if (!dNode) {
        dNode = { id: meta.domainId, title: meta.domainTitle, order: meta.domainOrder, subgroups: new Map() }
        domainMap.set(meta.domainId, dNode)
      }
      let sgNode = dNode.subgroups.get(meta.subgroupId)
      if (!sgNode) {
        sgNode = { id: meta.subgroupId, title: meta.subgroupTitle, order: meta.subgroupOrder, items: [] }
        dNode.subgroups.set(meta.subgroupId, sgNode)
      }
      sgNode.items.push(item)
    }

    return Array.from(domainMap.values())
      .sort((a, b) => a.order - b.order)
      .map((d) => {
        const subgroups = Array.from(d.subgroups.values()).sort((a, b) => a.order - b.order)
        return {
          id: d.id,
          title: d.title,
          subgroups,
          items: subgroups.flatMap((sg) => sg.items),
        }
      })
  }, [components, query, typeLookup])

  const isExpanded = (nodeKey: string) => !!query.trim() || !collapsed.has(nodeKey)

  const toggleNode = (nodeKey: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(nodeKey)) next.delete(nodeKey)
      else next.add(nodeKey)
      return next
    })
  }

  const expandAll = () => setCollapsed(new Set())
  const collapseAll = () => {
    const keys: string[] = []
    for (const d of tree) {
      keys.push(`dom:${d.id}`)
      for (const sg of d.subgroups) keys.push(`sg:${d.id}:${sg.id}`)
    }
    setCollapsed(new Set(keys))
  }

  /** Linhas visíveis pela ordem do ecrã: cada uma com a chave e os componentes que representa. */
  const visible = useMemo(() => {
    const out: Array<{ key: string; ids: string[] }> = []
    for (const d of tree) {
      const dKey = `dom:${d.id}`
      const dOpen = isExpanded(dKey)
      out.push({ key: dKey, ids: d.items.map((m) => m.id) })
      if (!dOpen) continue
      for (const sg of d.subgroups) {
        const sgKey = `sg:${d.id}:${sg.id}`
        const sgOpen = isExpanded(sgKey)
        out.push({ key: sgKey, ids: sg.items.map((m) => m.id) })
        if (!sgOpen) continue
        for (const m of sg.items) out.push({ key: m.id, ids: [m.id] })
      }
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, collapsed, query])

  const pick = (key: string, ids: string[], event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    if (event.shiftKey && anchor) {
      const a = visible.findIndex((r) => r.key === anchor)
      const b = visible.findIndex((r) => r.key === key)
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

  const toggleHidden = (items: ElectricalComponent[]) => {
    const allHidden = items.every((i) => i.hidden)
    const store = useSimStore.getState()
    store.commitHistory()
    items.forEach((i) => store.updateComponentRaw(i.id, { hidden: !allHidden }))
  }

  const itemRow = (item: ElectricalComponent) => {
    const selected = selectedIds.includes(item.id)
    return (
      <li key={item.id} className={`dc-objects-row is-nested${selected ? ' is-on' : ''}${item.hidden ? ' is-hidden' : ''}`} data-object-id={item.id}>
        <button
          type="button"
          className="dc-objects-main"
          onClick={(event) => pick(item.id, [item.id], event)}
          title={`${item.ref} · ${item.type} · rotação ${item.rotation}°${item.hidden ? ' (oculto)' : ''}`}
        >
          <span className="dc-objects-card"><ComponentThumb type={item.type} size={34} /></span>
          <span className="dc-objects-text">
            <span className="dc-objects-ref">{item.ref}{item.rotation !== 0 && <span className="dc-objects-badge">{item.rotation}°</span>}</span>
            <span className="dc-objects-name">{item.label || item.type}</span>
          </span>
        </button>
        <span className="dc-objects-tools">
          <button type="button" title={item.hidden ? 'Mostrar componente' : 'Ocultar componente'} aria-label={item.hidden ? 'Mostrar componente' : 'Ocultar componente'} onClick={() => updateComponent(item.id, { hidden: !item.hidden })}>
            {item.hidden ? <IconEyeOff size={11} /> : <IconEye size={11} />}
          </button>
          <button type="button" title="Rodar 90°" onClick={() => rotateComponents([item.id], 90)}><IconRotate size={11} /></button>
          <button type="button" title="Trazer para a frente" onClick={() => reorderComponents([item.id], 'front')}><IconChevronUp size={11} /></button>
          <button type="button" title="Enviar para trás" onClick={() => reorderComponents([item.id], 'back')}><IconChevronDown size={11} /></button>
          <button type="button" title={item.locked ? 'Desbloquear' : 'Bloquear'} onClick={() => updateComponent(item.id, { locked: !item.locked })}>{item.locked ? <IconLock size={11} /> : <IconUnlock size={11} />}</button>
        </span>
      </li>
    )
  }

  return (
    <div className="dc-objects">
      <div className="dc-objects-head">
        <span className="dc-objects-title">
          <IconLayers size={12} /> Objetos do projeto <b>{components.length}</b>
          <button type="button" className="dc-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setTableOpen(true)} title="Criar e posicionar componentes por tabela ou Excel">Tabela</button>
        </span>
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
        {tree.length > 0 && (
          <button type="button" className="dc-btn-sm" style={{ marginLeft: 'auto' }} onClick={collapsed.size > 0 ? expandAll : collapseAll} title={collapsed.size > 0 ? 'Expandir árvore' : 'Recolher árvore'}>
            {collapsed.size > 0 ? 'Expandir' : 'Recolher'}
          </button>
        )}
      </div>

      {components.length === 0 && <p className="dc-objects-empty">O projeto ainda não tem componentes. Adicione-os pela Biblioteca.</p>}
      {components.length > 0 && tree.length === 0 && <p className="dc-objects-empty">Nenhum objeto corresponde a «{query}».</p>}

      <ul className="dc-objects-list">
        {tree.map((domain) => {
          const dKey = `dom:${domain.id}`
          const dOpen = isExpanded(dKey)
          const dIds = domain.items.map((m) => m.id)
          const dAllSelected = dIds.length > 0 && dIds.every((id) => selectedIds.includes(id))
          const dAllHidden = dIds.length > 0 && domain.items.every((m) => m.hidden)
          return (
            <li key={dKey} className="dc-objects-group" data-object-domain={domain.id}>
              <div className={`dc-objects-row dc-objects-group-head${dAllSelected ? ' is-on' : ''}${dAllHidden ? ' is-hidden' : ''}`}>
                <button type="button" className="dc-objects-twisty" aria-expanded={dOpen} title={dOpen ? 'Recolher domínio' : 'Expandir domínio'} onClick={() => toggleNode(dKey)}>
                  <IconChevronDown size={12} className={dOpen ? 'is-open' : ''} />
                </button>
                <button type="button" className="dc-objects-main" onClick={(event) => pick(dKey, dIds, event)} title={`${domain.title} · ${domain.items.length} objetos`}>
                  <span className="dc-objects-card dc-objects-group-card">
                    <span className="dc-objects-group-icon">{dOpen ? <IconOpen size={14} /> : <IconFolder size={14} />}</span>
                  </span>
                  <span className="dc-objects-text">
                    <span className="dc-objects-ref">{domain.title}<span className="dc-objects-count">{domain.items.length}</span></span>
                  </span>
                </button>
                <span className="dc-objects-tools">
                  <button type="button" title={dAllHidden ? 'Mostrar domínio' : 'Ocultar domínio'} aria-label={dAllHidden ? 'Mostrar domínio' : 'Ocultar domínio'} onClick={() => toggleHidden(domain.items)}>
                    {dAllHidden ? <IconEyeOff size={11} /> : <IconEye size={11} />}
                  </button>
                </span>
              </div>
              {dOpen && (
                <ul className="dc-objects-children">
                  {domain.subgroups.map((sg) => {
                    const sgKey = `sg:${domain.id}:${sg.id}`
                    const sgOpen = isExpanded(sgKey)
                    const sgIds = sg.items.map((m) => m.id)
                    const sgAllSelected = sgIds.length > 0 && sgIds.every((id) => selectedIds.includes(id))
                    const sgAllHidden = sgIds.length > 0 && sg.items.every((m) => m.hidden)
                    return (
                      <li key={sgKey} className="dc-objects-group" data-object-subgroup={sg.id}>
                        <div className={`dc-objects-row dc-objects-group-head is-nested${sgAllSelected ? ' is-on' : ''}${sgAllHidden ? ' is-hidden' : ''}`}>
                          <button type="button" className="dc-objects-twisty" aria-expanded={sgOpen} title={sgOpen ? 'Recolher subgrupo' : 'Expandir subgrupo'} onClick={() => toggleNode(sgKey)}>
                            <IconChevronDown size={12} className={sgOpen ? 'is-open' : ''} />
                          </button>
                          <button type="button" className="dc-objects-main" onClick={(event) => pick(sgKey, sgIds, event)} title={`${sg.title} · ${sg.items.length} objetos`}>
                            <span className="dc-objects-text">
                              <span className="dc-objects-ref">{sg.title}<span className="dc-objects-count">{sg.items.length}</span></span>
                            </span>
                          </button>
                          <span className="dc-objects-tools">
                            <button type="button" title={sgAllHidden ? 'Mostrar subgrupo' : 'Ocultar subgrupo'} aria-label={sgAllHidden ? 'Mostrar subgrupo' : 'Ocultar subgrupo'} onClick={() => toggleHidden(sg.items)}>
                              {sgAllHidden ? <IconEyeOff size={11} /> : <IconEye size={11} />}
                            </button>
                          </span>
                        </div>
                        {sgOpen && <ul className="dc-objects-children">{sg.items.map((m) => itemRow(m))}</ul>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      {tableOpen && <ComponentTableDialog onClose={() => setTableOpen(false)} />}
    </div>
  )
}
