import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { LadderTag } from '../types'
import TagSheetActions from '../excel/TagSheetActions'
import { IconClose, IconTag, IconPlus } from './icons'
import { canonicalAddress, compareTags, tagPrefixOf } from '../excel/tagSheet'
import '../styles/variable-table-overlay.css'

export type VariableTableScope = 'grafcet' | 'iec' | 'all'

interface Props {
  open: boolean
  onClose: () => void
  /** Contexto mostrado no cabeçalho e no import Excel. */
  scope: VariableTableScope
  /** Bits extra do GRAFCET (variáveis com nome) para o estado ao vivo. */
  extraLive?: Record<string, boolean>
  /** Posição inicial em px relativamente ao contentor. */
  initialPosition?: { x: number; y: number }
}

const AREA_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'I', label: 'I' },
  { id: 'Q', label: 'Q' },
  { id: 'M', label: 'M' },
  { id: 'T', label: 'T' },
  { id: 'C', label: 'C' },
] as const

const SCOPE_LABEL: Record<VariableTableScope, string> = {
  grafcet: 'GRAFCET · Variáveis',
  iec: 'Esquema IEC · Variáveis',
  all: 'Tabela de variáveis',
}

/**
 * Tabela de variáveis flutuante sobre o canvas (GRAFCET ou Esquema IEC).
 * Arrastável pelo cabeçalho, editável em linha, com indicador ao vivo de ativo/inativo
 * e importação Excel da tabela de tags já existente no projeto.
 */
export default function VariableTableOverlay({ open, onClose, scope, extraLive, initialPosition }: Props) {
  const tags = useSimStore((s) => s.tags)
  const table = useSimStore((s) => s.runtime.table)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const updateTag = useSimStore((s) => s.updateTag)
  const addTag = useSimStore((s) => s.addTag)
  const setTags = useSimStore((s) => s.setTags)

  const panelRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null)
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem(`dcsimu:var-table-pos:${scope}`)
      if (raw) return JSON.parse(raw) as { x: number; y: number }
    } catch { /* private */ }
    return initialPosition ?? { x: 16, y: 72 }
  })
  const [area, setArea] = useState<(typeof AREA_FILTERS)[number]['id']>('all')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(`dcsimu:var-table-pos:${scope}`, JSON.stringify(pos)) } catch { /* private */ }
  }, [pos, scope])

  const isActive = useCallback((address: string) => {
    const key = canonicalAddress(address)
    if (extraLive && key in extraLive) return !!extraLive[key]
    if (key in table) return !!table[key]
    // bits estilo I0.0 / Q1.0
    const dotted = key.replace(/^([IQM])(\d+)$/i, (_, p, n) => `${p}${Math.floor((Number(n) - 1) / 8)}.${(Number(n) - 1) % 8}`)
    if (dotted !== key && dotted in table) return !!table[dotted]
    // variáveis com nome (GRAFCET)
    for (const [k, v] of Object.entries(table)) {
      if (k.toUpperCase() === key) return !!v
    }
    if (extraLive) {
      for (const [k, v] of Object.entries(extraLive)) {
        if (k.toUpperCase() === key) return !!v
      }
    }
    return false
  }, [table, extraLive])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...tags]
      .filter((tag) => {
        const prefix = tagPrefixOf(tag.address)
        if (area !== 'all' && prefix !== area) return false
        if (!q) return true
        return [tag.address, tag.name, tag.comment ?? ''].some((s) => s.toLowerCase().includes(q))
      })
      .sort(compareTags)
  }, [tags, area, search])

  const activeCount = useMemo(() => rows.filter((t) => isActive(t.address)).length, [rows, isActive])

  const onHeaderDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, select, a')) return
    event.preventDefault()
    drag.current = { ox: pos.x, oy: pos.y, sx: event.clientX, sy: event.clientY }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* noop */ }
  }
  const onHeaderMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const dx = event.clientX - drag.current.sx
    const dy = event.clientY - drag.current.sy
    const next = { x: Math.max(4, drag.current.ox + dx), y: Math.max(4, drag.current.oy + dy) }
    setPos(next)
  }
  const onHeaderUp = () => { drag.current = null }

  const patch = (id: string, data: Partial<Omit<LadderTag, 'id'>>) => updateTag(id, data, 'auto')

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className={`vto-panel${collapsed ? ' is-collapsed' : ''}${running ? ' is-live' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={SCOPE_LABEL[scope]}
    >
      <div
        className="vto-header"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        onPointerCancel={onHeaderUp}
      >
        <span className="vto-title">
          <IconTag size={13} />
          <strong>{SCOPE_LABEL[scope]}</strong>
          <em className={activeCount ? 'is-on' : ''}>{activeCount}/{rows.length}</em>
        </span>
        <span className="vto-header-actions">
          <button type="button" className="vto-icon-btn" onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Expandir' : 'Recolher'} aria-label={collapsed ? 'Expandir tabela' : 'Recolher tabela'}>
            {collapsed ? '▢' : '—'}
          </button>
          <button type="button" className="vto-icon-btn" onClick={onClose} title="Fechar" aria-label="Fechar tabela de variáveis">
            <IconClose size={12} />
          </button>
        </span>
      </div>

      {!collapsed && (
        <>
          <div className="vto-toolbar">
            <div className="vto-filters" role="tablist" aria-label="Área">
              {AREA_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={area === item.id}
                  className={area === item.id ? 'is-active' : ''}
                  onClick={() => setArea(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input
              className="vto-search"
              type="search"
              placeholder="Pesquisar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Pesquisar variáveis"
            />
          </div>

          <div className="vto-table-wrap">
            <table className="vto-table">
              <thead>
                <tr>
                  <th scope="col" className="vto-col-live">Ativo</th>
                  <th scope="col">Endereço</th>
                  <th scope="col">Nome</th>
                  <th scope="col">Comentário</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tag) => {
                  const on = isActive(tag.address)
                  return (
                    <tr key={tag.id} className={on ? 'is-active' : ''}>
                      <td className="vto-col-live">
                        <span className={`vto-tag${on ? ' is-on' : ''}`} title={on ? 'Ativo' : 'Inativo'} aria-label={on ? `${tag.address} ativo` : `${tag.address} inativo`}>
                          <i />
                        </span>
                      </td>
                      <td>
                        <input
                          className="vto-input vto-code"
                          value={tag.address}
                          onChange={(e) => patch(tag.id, { address: e.target.value })}
                          aria-label={`Endereço de ${tag.name || tag.address}`}
                          spellCheck={false}
                        />
                      </td>
                      <td>
                        <input
                          className="vto-input"
                          value={tag.name}
                          onChange={(e) => patch(tag.id, { name: e.target.value })}
                          aria-label={`Nome de ${tag.address}`}
                          placeholder="Nome"
                        />
                      </td>
                      <td>
                        <input
                          className="vto-input"
                          value={tag.comment ?? ''}
                          onChange={(e) => patch(tag.id, { comment: e.target.value })}
                          aria-label={`Comentário de ${tag.address}`}
                          placeholder="Função"
                        />
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={4} className="vto-empty">
                      {search || area !== 'all'
                        ? 'Nenhuma variável corresponde ao filtro.'
                        : 'Ainda não há variáveis. Adicione uma linha ou importe uma tabela Excel.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="vto-footer">
            <div className="vto-add">
              {(['I', 'Q', 'M'] as const).map((prefix) => (
                <button key={prefix} type="button" className="vto-add-btn" onClick={() => addTag(prefix)} title={`Adicionar ${prefix}`}>
                  <IconPlus size={11} /> {prefix}
                </button>
              ))}
            </div>
            <TagSheetActions
              tags={tags}
              onApply={(next) => setTags(next)}
              fileName="tabela-de-variaveis"
              context={SCOPE_LABEL[scope]}
              className="vto-import"
            />
          </div>
        </>
      )}
    </div>
  )
}
