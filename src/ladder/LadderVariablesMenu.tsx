import { useState } from 'react'
import { IconTag } from '../ui/icons'
import LadderVariablesDialog from './LadderVariablesDialog'

interface Props {
  /** Navega para a tabela de variáveis do editor Ladder. */
  onOpenTable: () => void
}

/** Botão «Variáveis» da barra do Ladder: abre a modal da tabela de tags (com importar/exportar). */
export default function LadderVariablesMenu({ onOpenTable }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="ladder-variables-menu">
      <button type="button" className={`dc-tool-btn ladder-variables-tool ${open ? 'dc-tool-active' : ''}`} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)} title="Variáveis: tabela de tags, importar e exportar">
        <IconTag size={13} /><span>Variáveis</span>
      </button>
      {open && <LadderVariablesDialog onClose={() => setOpen(false)} onOpenInEditor={() => { setOpen(false); onOpenTable() }} />}
    </div>
  )
}
