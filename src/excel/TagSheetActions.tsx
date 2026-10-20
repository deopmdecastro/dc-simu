import { useState } from 'react'
import { nanoid } from 'nanoid'
import type { LadderTag } from '../types'
import ImportPreview, { type ImportMode } from './ImportPreview'
import SheetTransferBar from './SheetTransferBar'
import type { ImportIssue, RawSheet } from './sheetIO'
import { mergeTags, parseTagSheets, tagInfoSheet, tagTemplateSheets, tagsToSheet, type ParseTagOptions, type ParsedTag, type TagImportMode } from './tagSheet'

interface TagSheetActionsProps {
  /** Tags atuais (no Ladder, as do PLC ativo; no GRAFCET, o rascunho do diálogo). */
  tags: readonly LadderTag[]
  /** Recebe a tabela final já fundida. */
  onApply: (tags: LadderTag[]) => void
  fileName?: string
  /** Eyebrow do diálogo de pré-visualização («LADDER · TABELA DE TAGS»…). */
  context: string
  /** Só estas tags são afetadas pela importação; as restantes ficam intactas em qualquer modo. */
  scope?: (tag: LadderTag) => boolean
  restrict?: ParseTagOptions['restrict']
  disabled?: boolean
  className?: string
}

interface Pending { fileName: string; tags: ParsedTag[]; issues: ImportIssue[] }

/** Ações Excel da tabela de entradas/saídas/memórias: partilhadas pelo Ladder e pelo GRAFCET. */
export default function TagSheetActions({ tags, onApply, fileName = 'tabela-de-tags', context, scope, restrict, disabled, className }: TagSheetActionsProps) {
  const [pending, setPending] = useState<Pending | null>(null)

  const split = () => ({ inScope: scope ? tags.filter(scope) : [...tags], kept: scope ? tags.filter((tag) => !scope(tag)) : [] })
  const merged = (mode: TagImportMode, incoming: readonly ParsedTag[]) => { const { inScope, kept } = split(); const result = mergeTags(inScope, incoming, mode, () => nanoid(6)); return { ...result, tags: [...kept, ...result.tags] } }

  const read = (sheets: RawSheet[], file: string) => {
    const parsed = parseTagSheets(sheets, { restrict })
    setPending({ fileName: file, tags: parsed.tags, issues: parsed.issues })
  }

  const modes = (): ImportMode[] => {
    if (!pending) return []
    const join = merged('merge', pending.tags)
    const replace = merged('replace', pending.tags)
    return [
      { id: 'merge', label: 'Juntar às tags existentes', hint: `Acrescenta ${join.added} e atualiza ${join.updated} (por endereço); nada é removido.` },
      { id: 'replace', label: 'Substituir a tabela', hint: `Fica só com as ${pending.tags.length} tags do ficheiro; remove ${replace.removed} que não constam dele.` },
    ]
  }

  return (
    <>
      <SheetTransferBar className={className} fileName={fileName} disabled={disabled} template={tagTemplateSheets} current={() => [tagsToSheet(tags), tagInfoSheet()]} onImport={read} />
      {pending && (
        <ImportPreview
          title="Importar tabela de tags" eyebrow={context} fileName={pending.fileName} issues={pending.issues} empty={!pending.tags.length}
          summary={[`${pending.tags.length} tag(s) válida(s) encontrada(s) no ficheiro.`]}
          modes={pending.tags.length ? modes() : undefined}
          onClose={() => setPending(null)}
          onApply={(mode) => { onApply(merged(mode as TagImportMode, pending.tags).tags); setPending(null) }}
        />
      )}
    </>
  )
}
