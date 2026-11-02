import { useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import RightDockPanel, { RIGHT_DOCK_TITLE } from './RightDockPanel'
import SidePanelHeader from './SidePanelHeader'
import type { RightDockTab } from './RightDockTabs'

/**
 * Painel inferior do Esquema 3D (telemóvel): o painel lateral completo (GRAFCET, E/S, Objetos e Diagnóstico),
 * o mesmo da coluna da direita no tablet/PC. Usa a mesma gaveta do inspetor do GRAFCET (`grafcet-properties`
 * + `SidePanelHeader`), por isso tem o mesmo cabeçalho, o mesmo espaçamento e o mesmo comportamento de
 * abrir/recolher que o CommandsSimDock e o inspetor GRAFCET. O transporte fica na barra de cima.
 */
export default function SchematicSimDock({
  open,
  onToggle,
  tab,
  onTab,
  onOpenGrafcet,
}: {
  open: boolean
  onToggle: () => void
  tab: RightDockTab
  onTab: (tab: RightDockTab) => void
  onOpenGrafcet?: () => void
}) {
  const runState = useSimStore((s) => s.sim.runState)
  const [tall, setTall] = useState(false)
  // Como no GRAFCET / IEC: o estado só aparece na gaveta enquanto a simulação corre ou está em pausa.
  const state = runState === 'running' ? 'RUN' : runState === 'stopped' ? undefined : 'PAUSA'

  return (
    <aside
      className={`grafcet-properties cmd-dock schematic-sim-dock-phone ${open ? 'is-open' : ''} ${tall ? 'is-tall' : ''}`}
      aria-label={RIGHT_DOCK_TITLE}
      data-schematic-sim-dock
    >
      <SidePanelHeader
        className="grafcet-properties-summary"
        eyebrow="3D Realista"
        title="Propriedades"
        detail={state}
        side="bottom"
        expanded={open}
        onToggle={onToggle}
        toggleTitle
        toggleLabel={open ? 'Recolher propriedades' : 'Abrir propriedades'}
        actions={open ? (
          <div className="grafcet-selection-actions">
            <button
              type="button"
              className="grafcet-properties-tall"
              aria-pressed={tall}
              aria-label={tall ? 'Reduzir painel' : 'Ampliar painel'}
              title={tall ? 'Reduzir painel' : 'Ampliar painel'}
              onClick={() => setTall((value) => !value)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {tall ? <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
              </svg>
            </button>
          </div>
        ) : undefined}
      />
      {open && <RightDockPanel mode="schematic" tab={tab} onTab={onTab} onOpenGrafcet={onOpenGrafcet} />}
    </aside>
  )
}
