import { useEffect, useMemo, useRef, useState } from 'react'
import { transitionsOf } from './engine'
import type { GrafcetTemplateInfo } from './templates'
import { foldText } from '../utils/text'

type CategoryId = 'basico' | 'motores' | 'paralelo' | 'sistema'
type Level = 1 | 2 | 3

const CATEGORIES: Array<{ id: CategoryId; label: string; hint: string }> = [
  { id: 'basico', label: 'Primeiros passos', hint: 'Sequências curtas para aprender a estrutura' },
  { id: 'motores', label: 'Motores e arranques', hint: 'Partidas industriais com temporização' },
  { id: 'paralelo', label: 'Ramos paralelos (AND)', hint: 'Divergência, convergência e sincronização' },
  { id: 'sistema', label: 'Sistema G0 · G1 · G2', hint: 'Controlo, funcionamento e reposição' },
]

const LEVELS: Record<Level, string> = { 1: 'Básico', 2: 'Intermédio', 3: 'Avançado' }

/** Organização dos modelos: categoria, nível e ordem de apresentação (do mais simples ao mais completo). */
const META: Record<string, { category: CategoryId; level: Level; order: number; tag?: string }> = {
  'exemplo-didatico': { category: 'basico', level: 1, order: 1 },
  'iec-sequencia-simples': { category: 'basico', level: 1, order: 2, tag: 'IEC 60848' },
  'partida-direta': { category: 'motores', level: 1, order: 1 },
  'estrela-triangulo': { category: 'motores', level: 2, order: 2, tag: 'Temporizador' },
  'concorrente-and': { category: 'paralelo', level: 2, order: 1, tag: 'AND' },
  'iec-motores-paralelo': { category: 'paralelo', level: 2, order: 2, tag: 'IEC 60848' },
  'iec-processo-timers': { category: 'paralelo', level: 3, order: 3, tag: 'Falha + timers' },
  'g2-reset': { category: 'sistema', level: 2, order: 1 },
  'g0-controlo': { category: 'sistema', level: 3, order: 2, tag: 'Divergência OU' },
  'g1-funcionamento': { category: 'sistema', level: 3, order: 3 },
}

export const EXAMPLE_TEMPLATE_ID = 'exemplo-didatico'

interface Entry {
  key: string
  name: string
  description: string
  category: CategoryId
  level: Level
  order: number
  tag?: string
  steps: number | null
  transitions: number | null
  template: GrafcetTemplateInfo | null
}

export default function GrafcetTemplatesDialog({
  open, templates, onClose, onLoad, onLoadExample,
}: {
  open: boolean
  templates: GrafcetTemplateInfo[]
  onClose: () => void
  onLoad: (template: GrafcetTemplateInfo) => void
  onLoadExample: () => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | CategoryId>('all')
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery(''); setCategory('all'); setConfirmKey(null)
    dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const entries = useMemo<Entry[]>(() => {
    const fromTemplates = templates.map((template): Entry => {
      const meta = META[template.id] ?? { category: 'basico' as CategoryId, level: 2 as Level, order: 99 }
      return {
        key: template.id, name: template.name, description: template.description, ...meta,
        steps: template.program.steps.length, transitions: transitionsOf(template.program).length, template,
      }
    })
    const example: Entry = {
      key: EXAMPLE_TEMPLATE_ID, name: 'Exemplo didático de 3 etapas',
      description: 'Espera, Motor A (Q1) e Motor B (Q2) em sequência fechada.',
      ...META[EXAMPLE_TEMPLATE_ID], steps: 3, transitions: 3, template: null,
    }
    return [example, ...fromTemplates].sort((a, b) => a.order - b.order)
  }, [templates])

  const visible = useMemo(() => {
    const q = foldText(query.trim())
    return entries.filter((entry) =>
      (category === 'all' || entry.category === category) &&
      (!q || foldText(`${entry.name} ${entry.description} ${entry.tag ?? ''} ${LEVELS[entry.level]}`).includes(q)))
  }, [entries, query, category])

  if (!open) return null

  const confirmLoad = (entry: Entry) => {
    if (entry.template) onLoad(entry.template)
    else onLoadExample()
  }

  return (
    <div className="gtpl-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="gtpl-dialog" role="dialog" aria-modal="true" aria-label="Modelos de GRAFCET" tabIndex={-1} ref={dialogRef}>
        <header className="gtpl-head">
          <div>
            <strong>Modelos prontos</strong>
            <small>{entries.length} modelos · escolha um ponto de partida</small>
          </div>
          <button type="button" className="gtpl-close" onClick={onClose} aria-label="Fechar modelos">✕</button>
        </header>

        <div className="gtpl-tools">
          <input
            className="dc-input gtpl-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar modelos…"
            aria-label="Pesquisar modelos"
          />
          <div className="gtpl-chips" role="tablist" aria-label="Categorias">
            <button type="button" role="tab" aria-selected={category === 'all'} className={category === 'all' ? 'is-active' : ''} onClick={() => setCategory('all')}>Todos</button>
            {CATEGORIES.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={category === item.id} className={category === item.id ? 'is-active' : ''} onClick={() => setCategory(item.id)}>{item.label}</button>
            ))}
          </div>
        </div>

        <div className="gtpl-body">
          {CATEGORIES.map((group) => {
            const items = visible.filter((entry) => entry.category === group.id)
            if (!items.length) return null
            return (
              <section key={group.id} className="gtpl-group">
                <h3>{group.label}<small>{group.hint}</small></h3>
                {items.map((entry) => (
                  <article key={entry.key} className="gtpl-card">
                    <div className="gtpl-card-main">
                      <strong>{entry.name}</strong>
                      <p>{entry.description}</p>
                      <div className="gtpl-meta">
                        <span className={`gtpl-level is-${entry.level}`}>{LEVELS[entry.level]}</span>
                        {entry.steps !== null && <span>{entry.steps} etapas</span>}
                        {entry.transitions !== null && <span>{entry.transitions} transições</span>}
                        {entry.tag && <span className="gtpl-tag">{entry.tag}</span>}
                      </div>
                    </div>
                    {confirmKey === entry.key ? (
                      <div className="gtpl-confirm">
                        <small>Substitui o diagrama atual.</small>
                        <div>
                          <button type="button" className="dc-btn" onClick={() => setConfirmKey(null)}>Cancelar</button>
                          <button type="button" className="dc-btn dc-btn-primary" onClick={() => confirmLoad(entry)}>Substituir</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="dc-btn dc-btn-primary gtpl-load" onClick={() => setConfirmKey(entry.key)}>Carregar</button>
                    )}
                  </article>
                ))}
              </section>
            )
          })}
          {!visible.length && <div className="gtpl-empty">Nenhum modelo encontrado. Limpe a pesquisa ou escolha «Todos».</div>}
        </div>
      </div>
    </div>
  )
}
