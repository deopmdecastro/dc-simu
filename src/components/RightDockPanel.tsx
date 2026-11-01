import { Suspense, lazy } from 'react'
import RightDockTabs, { type RightDockTab } from './RightDockTabs'
import ProjectObjects from './ProjectObjects'
import SimulationDock from './SimulationDock'
import { CommandsDiagnosticsPanel, SchematicDiagnosticsPanel } from '../diagnostics/DiagnosticsUi'
import RouteLoading from '../ui/RouteLoading'

const GrafcetEditor = lazy(() => import('../grafcet/GrafcetEditor'))
const CommandsIoPanel = lazy(() => import('../commands/CommandsPanels').then((m) => ({ default: m.CommandsIoPanel })))
const CommandsObjects = lazy(() => import('../commands/CommandsPanels').then((m) => ({ default: m.CommandsObjects })))

export const RIGHT_DOCK_TITLE = 'GRAFCET, sinais, objetos e diagnóstico'

/**
 * Painel lateral completo do Esquema 3D e do Esquema IEC: separadores (GRAFCET, E/S, Objetos, Diagnóstico)
 * e o conteúdo do separador ativo. É o mesmo corpo na coluna da direita (tablet/PC) e no painel inferior do
 * Esquema IEC no telemóvel — nunca existem duas versões diferentes do mesmo painel.
 */
export default function RightDockPanel({ mode, tab, onTab, onOpenGrafcet }: {
  mode: 'schematic' | 'commands'
  tab: RightDockTab
  onTab: (tab: RightDockTab) => void
  onOpenGrafcet?: () => void
}) {
  const commands = mode === 'commands'
  return (
    <>
      {/* Separadores iguais aos do inspetor GRAFCET: mosaicos com ícone + contagem e nome por baixo. */}
      <RightDockTabs mode={mode} value={tab} onChange={onTab} />
      <Suspense fallback={<RouteLoading label="A carregar o painel…" />}>
        {tab === 'diagnostics'
          ? (commands ? <CommandsDiagnosticsPanel /> : <SchematicDiagnosticsPanel />)
          : tab === 'grafcet'
            ? <GrafcetEditor onOpenEditor={onOpenGrafcet} />
            : commands
              ? tab === 'signals' ? <CommandsIoPanel /> : <CommandsObjects />
              : tab === 'signals' ? <SimulationDock embedded /> : <ProjectObjects />}
      </Suspense>
    </>
  )
}
