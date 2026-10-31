/**
 * Diálogo de exemplos IEC — mesma experiência visual e de interação do
 * diálogo de modelos do GRAFCET (gtpl-* em clean-mode.css): categorias em
 * chips, cartões com nível/tag e confirmação antes de substituir o esquema.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  COMMANDS_EXAMPLE_CATEGORIES,
  COMMANDS_EXAMPLES,
  type CommandsExampleCategory,
  type CommandsExampleInfo,
} from './examples'

const LEVELS: Record<1 | 2 | 3, string> = { 1: 'Básico', 2: 'Intermédio', 3: 'Avançado' }

interface Props {
  open: boolean
  onClose: () => void
  onLoad: (example: CommandsExampleInfo) => void
}

export default function CommandsExamplesDialog({ open, onClose, onLoad }: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CommandsExampleCategory | 'all'>('all')
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setCategory('all')
      setConfirmKey(null)
      return
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 80)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (confirmKey) setConfirmKey(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, confirmKey, onClose])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return COMMANDS_EXAMPLES
      .filter((ex) => category === 'all' || ex.category === category)
      .filter((ex) => {
        if (!q) return true
        return (
          ex.title.toLowerCase().includes(q)
          || ex.detail.toLowerCase().includes(q)
          || (ex.tag?.toLowerCase().includes(q) ?? false)
        )
      })
      .slice()
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  }, [query, category])

  if (!open) return null

  const confirmLoad = (entry: CommandsExampleInfo) => {
    onLoad(entry)
    onClose()
  }

  return (
    <div className="gtpl-backdrop" role="presentation" onClick={onClose}>
      <div
        className="gtpl-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cmd-examples-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gtpl-head">
          <div>
            <strong id="cmd-examples-title">Exemplos de esquema IEC</strong>
            <small>Substitui o esquema atual · pode desfazer com Ctrl+Z</small>
          </div>
          <button type="button" className="gtpl-close" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>

        <div className="gtpl-tools">
          <input
            ref={searchRef}
            className="gtpl-search dc-input"
            type="search"
            placeholder="Pesquisar exemplos…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <div className="gtpl-chips" role="tablist" aria-label="Categorias">
            <button
              type="button"
              role="tab"
              aria-selected={category === 'all'}
              className={category === 'all' ? 'is-active' : ''}
              onClick={() => setCategory('all')}
            >
              Todos
            </button>
            {COMMANDS_EXAMPLE_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={category === item.id}
                className={category === item.id ? 'is-active' : ''}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="gtpl-body">
          {COMMANDS_EXAMPLE_CATEGORIES.map((group) => {
            const items = visible.filter((entry) => entry.category === group.id)
            if (!items.length) return null
            return (
              <section key={group.id} className="gtpl-group">
                <h3>
                  {group.label}
                  <small>{group.hint}</small>
                </h3>
                {items.map((entry) => (
                  <article key={entry.id} className="gtpl-card">
                    <div className="gtpl-card-main">
                      <strong>{entry.title}</strong>
                      <p>{entry.detail}</p>
                      <div className="gtpl-meta">
                        <span className={`gtpl-level is-${entry.level}`}>{LEVELS[entry.level]}</span>
                        {entry.tag && <span className="gtpl-tag">{entry.tag}</span>}
                      </div>
                    </div>
                    {confirmKey === entry.id ? (
                      <div className="gtpl-confirm">
                        <small>Substitui o esquema atual.</small>
                        <div>
                          <button type="button" className="dc-btn" onClick={() => setConfirmKey(null)}>Cancelar</button>
                          <button type="button" className="dc-btn dc-btn-primary" onClick={() => confirmLoad(entry)}>
                            Substituir
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="dc-btn dc-btn-primary gtpl-load" onClick={() => setConfirmKey(entry.id)}>
                        Carregar
                      </button>
                    )}
                  </article>
                ))}
              </section>
            )
          })}
          {!visible.length && (
            <div className="gtpl-empty">Nenhum exemplo encontrado. Limpe a pesquisa ou escolha «Todos».</div>
          )}
        </div>
      </div>
    </div>
  )
}
