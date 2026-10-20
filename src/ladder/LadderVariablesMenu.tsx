import { useEffect, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import TagSheetActions from '../excel/TagSheetActions'
import { IconTag } from '../ui/icons'
import type { LadderTag } from '../types'

interface Props {
  /** Navega para a tabela de variáveis do editor Ladder. */
  onOpenTable: () => void
}

/** Botão «Variáveis» da barra do Ladder: importar/exportar tabelas sem sair da vista atual. */
export default function LadderVariablesMenu({ onOpenTable }: Props) {
  const tags = useSimStore((s) => s.tags)
  const setTags = useSimStore((s) => s.setTags)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const apply = (next: LadderTag[]) => {
    const ok = setTags(next)
    setNotice(ok ? `${next.length} variável(is) importada(s) para o PLC ativo.` : 'Não foi possível aplicar: o projeto mudou durante a importação.')
    setOpen(true)
  }

  return (
    <div className="ladder-variables-menu" ref={root}>
      <button type="button" className={`dc-tool-btn ladder-variables-tool ${open ? 'dc-tool-active' : ''}`} aria-haspopup="true" aria-expanded={open}
        onClick={() => { setNotice(''); setOpen((value) => !value) }} title="Variáveis: importar, exportar ou abrir a tabela do PLC">
        <IconTag size={13} /><span>Variáveis</span>
      </button>
      {/* Mantido montado (só oculto) para a pré-visualização da importação sobreviver ao fecho do menu. */}
      <div className="ladder-variables-panel" role="group" aria-label="Importar tabelas de variáveis" hidden={!open}>
        <strong>Tabela de variáveis · {tags.length} tag(s)</strong>
        <small>Importe um .xlsx (juntar ou substituir); as tags ficam logo disponíveis em Main e FC.</small>
        <TagSheetActions tags={tags} context="LADDER · TABELA DE VARIÁVEIS" fileName="variaveis-ladder" onApply={apply} />
        {notice && <small className="ladder-variables-notice" role="status">{notice}</small>}
        <button type="button" className="dc-btn" onClick={() => { setOpen(false); onOpenTable() }}>Abrir tabela completa</button>
      </div>
    </div>
  )
}
