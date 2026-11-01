import { useState } from 'react'
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
  const [tall, setTall] = useState(false)
  // Como no GRAFCET: o estado só aparece na gaveta enquanto a simulação corre ou está em pausa.
  const state = running ? 'RUN' : stopped ? undefined : 'PAUSA'

  return (
    <aside className={`grafcet-properties cmd-dock ${open ? 'is-open' : ''} ${tall ? 'is-tall' : ''}`} aria-label={RIGHT_DOCK_TITLE} data-cmd-sim-dock>
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
        actions={open ? (
          <div className="grafcet-selection-actions">
            <button type="button" className="grafcet-properties-tall" aria-pressed={tall} aria-label={tall ? 'Reduzir painel' : 'Ampliar painel'} title={tall ? 'Reduzir painel' : 'Ampliar painel'} onClick={() => setTall((value) => !value)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {tall ? <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
              </svg>
            </button>
          </div>
        ) : undefined}
      />
      {open && <RightDockPanel mode="commands" tab={tab} onTab={setTab} onOpenGrafcet={onOpenGrafcet} />}
    </aside>
  )
}
