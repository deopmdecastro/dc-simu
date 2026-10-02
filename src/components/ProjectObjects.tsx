import { useMemo, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { ElectricalComponent } from '../types'
import { SymbolGlyph } from '../schematic/symbols'
import { IconChevronUp, IconChevronDown, IconLayers, IconLock, IconRotate, IconSearch, IconUnlock } from '../ui/icons'

/**
 * Lista dos elementos do projeto (lado direito, ao lado do GRAFCET): mostra
 * tudo o que está no esquema/painel, seleciona ao clicar e dá as ações de
 * rotação e de ordem de desenho (trazer para a frente / enviar para trás).
 * A ordem da lista é a ordem de desenho: o último é o que fica por cima.
 */
/** Pré-visualização do objeto: o mesmo símbolo que é desenhado no esquema. */
function ObjectPreview({ component }: { component: ElectricalComponent }) {
  const pad = 4
  const width = Math.max(1, component.w)
  const height = Math.max(1, component.h)
  return <svg className="dc-objects-thumb" viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <g transform={`rotate(${component.rotation},${width / 2},${height / 2}) ${component.mirrored ? `translate(${width},0) scale(-1,1)` : ''}`}>
      <SymbolGlyph c={component} selected={false} />
    </g>
  </svg>
}

export default function ProjectObjects() {
  const components = useSimStore((s) => s.components)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const selectComponents = useSimStore((s) => s.selectComponents)
  const rotateComponents = useSimStore((s) => s.rotateComponents)
  const reorderComponents = useSimStore((s) => s.reorderComponents)
  const updateComponent = useSimStore((s) => s.updateComponent)
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase()
    // De cima para baixo = da frente para trás, pela camada real de desenho
    // (campo `z`, com a ordem de inserção a desempatar).
    const ordered = components
      .map((item, index) => ({ item, index, z: item.z ?? 0 }))
      .sort((a, b) => b.z - a.z || b.index - a.index)
      .map((entry) => entry.item)
    if (!text) return ordered
    return ordered.filter((item) => `${item.ref} ${item.label ?? ''} ${item.type}`.toLowerCase().includes(text))
  }, [components, query])

  const targets = selectedIds.length ? selectedIds : []
  const act = (where: 'front' | 'back' | 'forward' | 'backward') => targets.length && reorderComponents(targets, where)

  return <div className="dc-objects">
    <div className="dc-objects-head">
      <span className="dc-objects-title"><IconLayers size={12} /> Objetos do projeto <b>{components.length}</b></span>
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

    {components.length === 0 && <p className="dc-objects-empty">O projeto ainda não tem componentes. Adicione-os pela biblioteca, à esquerda.</p>}
    {components.length > 0 && rows.length === 0 && <p className="dc-objects-empty">Nenhum objeto corresponde a «{query}».</p>}

    <ul className="dc-objects-list">
      {rows.map((item) => {
        const selected = selectedIds.includes(item.id)
        return <li key={item.id} className={`dc-objects-row${selected ? ' is-on' : ''}`}>
          <button type="button" className="dc-objects-main" onClick={(event) => selectComponents([item.id], event.ctrlKey || event.metaKey || event.shiftKey)}
            title={`${item.ref} · ${item.type} · rotação ${item.rotation}°`}>
            <span className="dc-objects-card"><ObjectPreview component={item} /></span>
            <span className="dc-objects-text">
              <span className="dc-objects-ref">{item.ref}{item.rotation !== 0 && <span className="dc-objects-badge">{item.rotation}°</span>}{item.allowOverlap && <span className="dc-objects-badge" title="Está à frente e pode ficar por cima de outros">à frente</span>}</span>
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
      })}
    </ul>
  </div>
}
