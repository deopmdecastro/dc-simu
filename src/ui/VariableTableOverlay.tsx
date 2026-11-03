import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { LadderTag } from '../types'
import TagSheetActions from '../excel/TagSheetActions'
import { IconClose, IconTag, IconPlus } from './icons'
import { canonicalAddress, compareTags, tagPrefixOf } from '../excel/tagSheet'
import { detectGrafcetSignalsDetailed, nextDeclaredTagAddress } from '../grafcet/signals'
import { actionsOfStep, transitionsOf, normalizeActionVariable } from '../grafcet/engine'
import { isSymbolicSignalName } from '../grafcet/inputDetect'
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
 * Recolhe nomes de acionamentos (ações) que ainda não estão como tag:
 * se o endereço/variable for simbólico (L_Verde, Y0_A, fc_a0…) e não existir
 * na tabela, a deteção detalhada já o trata; aqui só reforçamos nomes que
 * falharam o filtro I/Q/M puro mas são identificadores válidos no diagrama.
 */
function extraActionSymbols(program: ReturnType<typeof useSimStore.getState>['grafcet'], tags: readonly Pick<LadderTag, 'address' | 'name'>[]): string[] {
  const known = new Set(tags.map((t) => (t.name || t.address).trim().toUpperCase()).filter(Boolean))
  const out: string[] = []
  const note = (raw: string) => {
    const name = normalizeActionVariable(raw).trim().replace(/[+-]$/, '')
    if (!name || !isSymbolicSignalName(name)) return
    const key = name.toUpperCase()
    if (known.has(key)) return
    known.add(key)
    out.push(name)
  }
  for (const step of program.steps) {
    for (const action of actionsOfStep(step)) {
      note(action.address || action.variable || '')
    }
  }
  for (const action of program.freeActions ?? []) {
    note(action.address || action.variable || '')
  }
  return out
}

/**
 * Tabela de variáveis flutuante sobre o canvas (GRAFCET ou Esquema IEC).
 * Arrastável pelo cabeçalho, editável em linha, com indicador ao vivo de ativo/inativo,
 * importação Excel e deteção a partir das transições/ações do projeto.
 */
export default function VariableTableOverlay({ open, onClose, scope, extraLive, initialPosition }: Props) {
  const tags = useSimStore((s) => s.tags)
  const table = useSimStore((s) => s.runtime.table)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const updateTag = useSimStore((s) => s.updateTag)
  const addTag = useSimStore((s) => s.addTag)
  const setTags = useSimStore((s) => s.setTags)
  const grafcet = useSimStore((s) => s.grafcet)

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
  const [notice, setNotice] = useState('')

  useEffect(() => {
    try { localStorage.setItem(`dcsimu:var-table-pos:${scope}`, JSON.stringify(pos)) } catch { /* private */ }
  }, [pos, scope])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(''), 6000)
    return () => window.clearTimeout(t)
  }, [notice])

  const isActive = useCallback((address: string) => {
    const key = canonicalAddress(address)
    if (extraLive && key in extraLive) return !!extraLive[key]
    if (key in table) return !!table[key]
    const dotted = key.replace(/^([IQM])(\d+)$/i, (_, p, n) => `${p}${Math.floor((Number(n) - 1) / 8)}.${(Number(n) - 1) % 8}`)
    if (dotted !== key && dotted in table) return !!table[dotted]
    for (const [k, v] of Object.entries(table)) {
      if (k.toUpperCase() === key) return !!v
    }
    if (extraLive) {
      for (const [k, v] of Object.entries(extraLive)) {
        if (k.toUpperCase() === key) return !!v
      }
    }
    // Match by tag name used as live bit (GRAFCET symbolic)
    const tag = tags.find((t) => canonicalAddress(t.address) === key)
    if (tag?.name) {
      const n = tag.name.toUpperCase()
      if (n in table) return !!table[n]
      if (extraLive && n in extraLive) return !!extraLive[n]
    }
    return false
  }, [table, extraLive, tags])

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

  /** Importa variáveis já usadas no projeto: condições de transição + acionamentos (ações). */
  const detectFromProject = () => {
    const program = useSimStore.getState().grafcet
    const current = useSimStore.getState().tags
    const found = detectGrafcetSignalsDetailed(program, current)
    // Garante acionamentos simbólicos mesmo se a passagem anterior os omitiu
    const extras = extraActionSymbols(program, current)
    const claimed = [...current, ...found.map((s) => ({ address: s.address, name: s.name }))]
    const more: typeof found = []
    for (const name of extras) {
      if (found.some((s) => s.name.toUpperCase() === name.toUpperCase())) continue
      if (claimed.some((t) => (t.name || '').toUpperCase() === name.toUpperCase())) continue
      // assign via detailed path: treat as written (Q)
      const address = nextDeclaredTagAddress('Q', claimed)
      if (!address) continue
      claimed.push({ address, name })
      more.push({ address, name, area: 'Q', symbolic: true })
    }
    const all = [...found, ...more]
    if (!all.length) {
      const trans = transitionsOf(program).length
      const acts = program.steps.reduce((n, s) => n + actionsOfStep(s).length, 0) + (program.freeActions?.length ?? 0)
      setNotice(trans || acts
        ? 'Todas as variáveis das transições e acionamentos já estão na tabela.'
        : 'O GRAFCET ainda não tem transições nem ações com variáveis para detetar.')
      return
    }
    const added: LadderTag[] = all.map((signal) => ({
      id: crypto.randomUUID(),
      address: signal.address,
      name: signal.name,
      comment: signal.symbolic ? 'Detetado no diagrama' : '',
      dataType: 'Bool' as const,
    }))
    setTags([...current, ...added])
    const preview = all.slice(0, 6).map((s) => (s.symbolic ? `${s.name}→${s.address}` : s.address))
    const rest = all.length > preview.length ? ` +${all.length - preview.length}` : ''
    setNotice(`${added.length} variável(eis) importada(s) do projeto (${preview.join(', ')}${rest}).`)
    if (all.some((s) => s.area === 'I')) setArea('I')
    else if (all.some((s) => s.area === 'Q')) setArea('Q')
  }

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
    setPos({ x: Math.max(4, drag.current.ox + dx), y: Math.max(4, drag.current.oy + dy) })
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

          {notice && <p className="vto-notice" role="status">{notice}</p>}

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
                        : 'Ainda não há variáveis. Detete do projeto, adicione uma linha ou importe Excel.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="vto-footer">
            <div className="vto-add">
              <button
                type="button"
                className="vto-add-btn vto-detect"
                onClick={detectFromProject}
                title="Lê condições das transições e variáveis dos acionamentos (ações) do GRAFCET do projeto e declara o que ainda falta na tabela"
              >
                ⟲ Do projeto
              </button>
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
