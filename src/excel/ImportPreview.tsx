import { useState, type ReactNode } from 'react'
import PropertyDialog from '../ui/PropertyDialog'
import type { ImportIssue } from './sheetIO'

export interface ImportMode { id: string; label: string; hint: string }

interface ImportPreviewProps {
  title: string
  eyebrow: string
  fileName: string
  /** Resumo do que vai acontecer (uma frase por linha). */
  summary: ReactNode[]
  issues: ImportIssue[]
  modes?: ImportMode[]
  /** Nada para aplicar (só erros): desativa o botão. */
  empty?: boolean
  onApply: (mode: string) => void
  onClose: () => void
}

/** Pré-visualização única para todas as importações: resumo, modo de aplicação e lista de avisos/erros. */
export default function ImportPreview({ title, eyebrow, fileName, summary, issues, modes, empty = false, onApply, onClose }: ImportPreviewProps) {
  const [mode, setMode] = useState(modes?.[0]?.id ?? '')
  const errors = issues.filter((issue) => issue.level === 'error').length
  const warnings = issues.length - errors
  return (
    <PropertyDialog open id="sheet-import" title={title} subtitle={`Ficheiro: ${fileName}`} eyebrow={eyebrow} saveLabel="Importar" saveDisabled={empty} onClose={onClose} onSave={() => onApply(mode)} className="sheet-import-dialog">
      <div className="sheet-import">
        <ul className="sheet-import-summary">{summary.map((line, index) => <li key={index}>{line}</li>)}</ul>
        {modes && modes.length > 1 && (
          <fieldset className="sheet-import-modes">
            <legend>Como aplicar</legend>
            {modes.map((option) => (
              <label key={option.id} className={mode === option.id ? 'is-selected' : undefined}>
                <input type="radio" name="sheet-import-mode" checked={mode === option.id} onChange={() => setMode(option.id)} />
                <span><b>{option.label}</b><small>{option.hint}</small></span>
              </label>
            ))}
          </fieldset>
        )}
        {issues.length > 0 && (
          <section aria-label="Avisos da importação">
            <p className="sheet-import-count">{errors > 0 && <b className="is-error">{errors} erro(s)</b>}{errors > 0 && warnings > 0 && ' · '}{warnings > 0 && <b className="is-warning">{warnings} aviso(s)</b>}</p>
            <ul className="sheet-import-issues">
              {issues.slice(0, 200).map((issue, index) => (
                <li key={index} className={`is-${issue.level}`}>
                  <span>{issue.sheet ? `${issue.sheet}${issue.row ? ` · linha ${issue.row}` : ''}` : 'Ficheiro'}</span>{issue.message}
                </li>
              ))}
            </ul>
            {issues.length > 200 && <p className="sheet-import-count">…e mais {issues.length - 200} ocorrências.</p>}
          </section>
        )}
      </div>
    </PropertyDialog>
  )
}
