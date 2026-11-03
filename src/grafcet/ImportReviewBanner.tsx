/** Barra «Revisão da importação» no topo do editor GRAFCET: mostra o que ainda bloqueia
 *  (erros do Diagnóstico, em direto) separado das notas do importador (fixas, agrupadas e sem
 *  repetições), e só propõe «Concluir revisão» quando não há nada por corrigir. */
import { useState } from 'react'
import type { GrafcetIssue as ValidationIssue } from './engine'
import { IconCheck, IconChevronDown, IconWarning } from '../ui/icons'
import '../styles/grafcet-import-review.css'

const GROUPS: Array<{ id: string; label: string; test: RegExp }> = [
  { id: 'refs', label: 'Referências entre GRAFCETs', test: /refer[eê]ncias? a outros|G\d+X\d+/i },
  { id: 'structure', label: 'Estrutura', test: /etapas? iniciais|GRAFCET \d+ tem/i },
  { id: 'actions', label: 'Ações', test: /(?:^|[\s(])a[cç](?:[aã]o|[oõ]es)\b|qualificador/i },
  { id: 'links', label: 'Ligações', test: /\btransi[cç](?:[aã]o|[oõ]es)\b|\bliga[cç]/i },
]

/** Agrupa por tema e junta mensagens iguais («… ×3»). */
function groupNotes(warnings: string[]) {
  const groups = new Map<string, { label: string; items: Map<string, number> }>()
  for (const warning of warnings) {
    const text = warning.trim().replace(/\.$/, '')
    if (!text) continue
    const group = GROUPS.find((candidate) => candidate.test.test(text)) ?? { id: 'other', label: 'Outras notas' }
    const entry = groups.get(group.id) ?? { label: group.label, items: new Map<string, number>() }
    entry.items.set(text, (entry.items.get(text) ?? 0) + 1)
    groups.set(group.id, entry)
  }
  return [...groups.values()]
}

interface ImportReviewBannerProps {
  warnings: string[]
  blockers: ValidationIssue[]
  onSelectIssue: (issue: ValidationIssue) => void
  onFinish: () => void
}

export default function ImportReviewBanner({ warnings, blockers, onSelectIssue, onFinish }: ImportReviewBannerProps) {
  const [open, setOpen] = useState(false)
  const notes = groupNotes(warnings)
  const noteCount = notes.reduce((total, group) => total + group.items.size, 0)
  const ready = blockers.length === 0
  return (
    <section className={`grafcet-review${ready ? ' is-ready' : ''}`} aria-label="Revisão da importação">
      <div className="grafcet-review-bar">
        <span className="grafcet-review-icon" aria-hidden="true">{ready ? <IconCheck size={14} /> : <IconWarning size={14} />}</span>
        <div className="grafcet-review-text">
          <strong>Revisão da importação</strong>
          <span>{ready ? 'Sem erros por corrigir. Confirme as notas e conclua para simular e gerar Ladder.' : 'Simulação e Ladder bloqueados até corrigir os erros e concluir a revisão.'}</span>
        </div>
        <span className="grafcet-review-chips">
          <span className={`grafcet-review-chip ${ready ? 'is-ok' : 'is-error'}`}>{ready ? 'Sem erros' : `${blockers.length} ${blockers.length === 1 ? 'erro' : 'erros'} por corrigir`}</span>
          {noteCount > 0 && <span className="grafcet-review-chip">{noteCount} {noteCount === 1 ? 'nota' : 'notas'} da importação</span>}
        </span>
        <button type="button" className="dc-btn grafcet-review-toggle" aria-expanded={open} aria-controls="grafcet-review-details" onClick={() => setOpen(!open)}>
          {open ? 'Ocultar' : 'Ver detalhes'}<IconChevronDown size={11} className={open ? 'is-open' : ''} />
        </button>
        {ready
          ? <button type="button" className="dc-btn dc-btn-primary grafcet-review-finish" onClick={onFinish}>Concluir revisão</button>
          : !open && <button type="button" className="dc-btn grafcet-review-finish" onClick={() => setOpen(true)} title="Mostra os erros que impedem concluir">Corrigir erros</button>}
      </div>
      {open && (
        <div id="grafcet-review-details" className="grafcet-review-details">
          <div className="grafcet-review-col">
            <h4>Por corrigir <small>atualiza enquanto edita</small></h4>
            {ready
              ? <p className="grafcet-review-empty"><IconCheck size={12} /> Nada bloqueia a conclusão.</p>
              : <ul>{blockers.map((issue) => (
                <li key={issue.id}>
                  <button type="button" onClick={() => onSelectIssue(issue)} disabled={!issue.entityId} title={issue.entityId ? 'Selecionar no desenho' : undefined}>
                    <span className="grafcet-review-dot" aria-hidden="true" />{issue.message}
                  </button>
                </li>
              ))}</ul>}
          </div>
          {noteCount > 0 && (
            <div className="grafcet-review-col">
              <h4>Notas da importação <small>registadas ao importar; confirme no desenho</small></h4>
              {notes.map((group) => (
                <div key={group.label} className="grafcet-review-group">
                  <b>{group.label}</b>
                  <ul>{[...group.items].map(([text, count]) => <li key={text}>{text}{count > 1 && <em> ×{count}</em>}</li>)}</ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
