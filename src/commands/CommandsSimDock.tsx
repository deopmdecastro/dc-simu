import { useCommandsUi } from './commandsUi'
import { useCommandsTransport } from './CommandsPanels'
import RightDockPanel, { RIGHT_DOCK_TITLE } from '../components/RightDockPanel'
import SidePanelHeader from '../components/SidePanelHeader'

/**
 * Painel inferior do Esquema IEC (telemóvel): o painel lateral completo (GRAFCET, E/S, Objetos e Diagnóstico),
 * o mesmo da coluna da direita no tablet/PC. Usa a mesma gaveta do inspetor do GRAFCET (`grafcet-properties`
 * + `SidePanelHeader`), por isso tem o mesmo cabeçalho, o mesmo espaçamento e o mesmo comportamento de
 * abrir/recolher. O transporte (Run/Pausa/Stop) fica na barra de cima, como no GRAFCET.
 */
export default function CommandsSimDock({ onOpenGrafcet }: { onOpenGrafcet?: () => void }) {
  const open = useCommandsUi((s) => s.dockOpen)
  const toggle = useCommandsUi((s) => s.toggleDock)
  const tab = useCommandsUi((s) => s.dockTab)
  const setTab = useCommandsUi((s) => s.setDockTab)
  const { running, stopped } = useCommandsTransport()
  const state = running ? 'RUN' : stopped ? 'STOP' : 'PAUSA'

  return (
    <aside className={`grafcet-properties cmd-dock ${open ? 'is-open' : ''}`} aria-label={RIGHT_DOCK_TITLE} data-cmd-sim-dock>
      <SidePanelHeader
        className="grafcet-properties-summary"
        eyebrow="Esquema IEC"
        title="Propriedades"
        detail={state}
        side="bottom"
        expanded={open}
        onToggle={toggle}
        toggleTitle
        toggleLabel={open ? 'Recolher propriedades' : 'Abrir propriedades'}
      />
      {open && <RightDockPanel mode="commands" tab={tab} onTab={setTab} onOpenGrafcet={onOpenGrafcet} />}
    </aside>
  )
}
