import PropertyDialog from '../ui/PropertyDialog'
import { useSimStore } from '../store/useSimStore'
import TagTable from './TagTable'

interface Props {
  onClose: () => void
  /** Fecha a modal e abre a mesma tabela na vista «Projeto» do editor Ladder. */
  onOpenInEditor: () => void
}

/**
 * Modal «Variáveis» do Ladder: tabela de tags completa (por área I/Q/M/T/C) com
 * Modelo · Exportar · Importar. A importação abre a sua própria pré-visualização
 * por cima desta modal (ver TagSheetActions), por isso nada fica preso a um menu
 * suspenso que o overflow da barra de ferramentas possa cortar.
 * As edições aplicam-se de imediato ao PLC ativo, daí não haver «Guardar».
 */
export default function LadderVariablesDialog({ onClose, onOpenInEditor }: Props) {
  const activePlcId = useSimStore((state) => state.activePlcId)
  const plc = useSimStore((state) => state.components.find((component) => component.id === state.activePlcId))
  const projectName = useSimStore((state) => state.currentProjectName)
  const subtitle = `${activePlcId ? `PLC ativo · ${plc?.ref || 'PLC selecionado'}` : 'Tabela do projeto'}${projectName ? ` · ${projectName}` : ''}`

  return (
    <PropertyDialog
      open
      id="ladder-variables-dialog"
      eyebrow="LADDER · VARIÁVEIS"
      title="Tabela de variáveis"
      subtitle={subtitle}
      onClose={onClose}
      onSave={onClose}
      hideSave
      closeLabel="Fechar"
      footerHint="As alterações aplicam-se de imediato · Esc para fechar"
      className="ladder-variables-dialog"
    >
      <div className="ladder-variables-dialog-bar">
        <span>Importe um .xlsx (juntar ou substituir), exporte ou edite as tags. Ficam logo disponíveis em Main e FC.</span>
        <button type="button" className="dc-btn" onClick={onOpenInEditor}>Abrir na vista Projeto</button>
      </div>
      <TagTable />
    </PropertyDialog>
  )
}
