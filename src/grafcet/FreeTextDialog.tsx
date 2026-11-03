import { useEffect, useRef, useState } from 'react'
import PropertyDialog from '../ui/PropertyDialog'
import { IconDelete } from '../ui/icons'
import '../styles/grafcet-dialog-ux.css'

interface Props {
  open: boolean
  text: string
  onSave: (text: string) => void
  onDelete: () => void
  onClose: () => void
}

/**
 * Edição de um texto livre do GRAFCET no telemóvel.
 * A caixa no próprio desenho não abre o teclado de forma fiável em iOS/Android; aqui o campo é de um
 * diálogo normal. Texto vazio apaga o texto (igual à edição no sítio).
 */
export default function FreeTextDialog({ open, text, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState(text)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (open) setDraft(text) }, [open, text])
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => areaRef.current?.focus(), 120)
    return () => window.clearTimeout(timer)
  }, [open])
  return (
    <PropertyDialog
      open={open}
      id="free-text-dialog"
      className="grafcet-compact-dialog grafcet-free-text-dialog"
      title="Editar texto"
      subtitle="Texto livre do desenho: título, legenda ou comparação como «G3 <> X149»."
      saveLabel={draft.trim() ? 'Guardar texto' : 'Apagar texto'}
      onSave={() => { if (draft.trim()) onSave(draft); else onDelete() }}
      onClose={onClose}
    >
      <div className="grafcet-free-text-body">
        <label htmlFor="free-text-input">Texto</label>
        <textarea
          id="free-text-input"
          ref={areaRef}
          value={draft}
          rows={4}
          spellCheck
          autoCapitalize="off"
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Texto livre do GRAFCET"
          style={{ fontSize: 16 }}
        />
        <button type="button" className="dx-btn grafcet-free-text-delete" onClick={onDelete}><IconDelete size={14} /> Eliminar texto</button>
      </div>
    </PropertyDialog>
  )
}
