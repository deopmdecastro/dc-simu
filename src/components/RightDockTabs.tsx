import { useMemo, type ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import { isProgrammablePlc } from '../ladder/plcPrograms'
import { plcIoRows } from '../ladder/plcIo'
import { devicesOf } from '../commands/engine'
import { emptyCommands } from '../commands/model'
import { MOMENTARY, TOGGLES } from '../commands/commandsUi'
import { useSchematicDiagnostics, useCommandsDiagnostics } from '../diagnostics/viewDiagnostics'
import { IconCheckCircle, IconGrafcet, IconLayers, IconSchematic, IconWarning } from '../ui/icons'

export type RightDockTab = 'grafcet' | 'signals' | 'objects' | 'diagnostics'

/** Tipos de símbolo que o painel E/S do esquema IEC lista (entradas e saídas). */
const COMMAND_IO_KINDS = new Set<string>([...MOMENTARY, ...TOGGLES, 'coil', 'timerCoil', 'lamp', 'motor3', 'motor6'])
const isCommandIo = (kind: string) => COMMAND_IO_KINDS.has(kind) || kind.startsWith('thermal')

/** Número de etapas do GRAFCET (o mesmo que o inspetor do editor GRAFCET mostra no separador «Etapas»). */
function useStepCount() {
  return useSimStore((s) => s.grafcet.steps.length)
}

/** Pontos de E/S que o painel vai listar: bornes do PLC do esquema ou E/S virtuais (I/Q/M). */
function useIoCount(commands: boolean) {
  const diagram = useSimStore((s) => (commands ? (s.commands ?? emptyCommands()) : null))
  const components = useSimStore((s) => s.components)
  const activePlcId = useSimStore((s) => s.activePlcId)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const plc = useMemo(() => {
    if (commands) return undefined
    const plcs = components.filter(isProgrammablePlc)
    const selected = selectedIds.length === 1 ? plcs.find((item) => item.id === selectedIds[0]) : undefined
    return selected ?? plcs.find((item) => item.id === activePlcId) ?? plcs[0]
  }, [commands, components, activePlcId, selectedIds])
  const virtualInputs = useSimStore((s) => s.virtualInputCount)
  const virtualOutputs = useSimStore((s) => s.virtualOutputCount)
  // Painel IEC: as entradas e saídas são aparelhos do esquema de comandos.
  const commandIo = useMemo(() => {
    if (!diagram) return 0
    const devices = devicesOf(diagram)
    return devices.filter(({ kinds }) => kinds.some(isCommandIo)).length
  }, [diagram])
  if (commands) return commandIo
  return plc ? plc.terminals.filter((terminal) => /^[IQ]\d+\.\d+$/.test(terminal.label.trim())).length : virtualInputs + virtualOutputs
}

/** Objetos do projeto: componentes do esquema ou símbolos do esquema IEC (sem nós de ligação). */
function useObjectCount(commands: boolean) {
  const components = useSimStore((s) => s.components)
  const parts = useSimStore((s) => (commands ? (s.commands?.parts.length ?? 0) : 0))
  return commands ? parts : components.length
}

type TileProps = { icon: ReactNode; label: string; count: number; title: string; active: boolean; warning?: boolean; valid?: boolean; onClick: () => void; ariaLabel: string; testId?: string }

function DockTile({ icon, label, count, title, active, warning = false, valid = false, onClick, ariaLabel, testId }: TileProps) {
  const state = active ? ' is-on' : ''
  const tone = warning ? ' has-warning' : valid ? ' is-valid' : ''
  return (
    <button
      type="button"
      role="tab"
      aria-label={ariaLabel}
      aria-selected={active}
      title={title}
      data-dock-tab={testId}
      className={`dc-dock-tab${state}${tone}`}
      onClick={onClick}
    >
      <span className="dc-dock-tab-icon" aria-hidden="true">{icon}</span>
      <em className="dc-dock-tab-count">{count > 99 ? '99+' : count}</em>
      <span className="dc-dock-tab-label">{label}</span>
    </button>
  )
}

/**
 * Separadores do painel direito do Esquema 3D e do Esquema IEC.
 *
 * O desenho é o mesmo do inspetor do GRAFCET (`grafcet-tabs`): quatro mosaicos
 * iguais, com o ícone e a contagem em cima e o nome por baixo — antes eram
 * pastilhas baixas com o ícone ao lado do texto, diferentes das do GRAFCET.
 */
export default function RightDockTabs({ mode, value, onChange }: { mode: 'schematic' | 'commands'; value: RightDockTab; onChange: (tab: RightDockTab) => void }) {
  const commands = mode === 'commands'
  const steps = useStepCount()
  const io = useIoCount(commands)
  const objects = useObjectCount(commands)
  const schematic = useSchematicDiagnostics()
  const commandDiag = useCommandsDiagnostics()
  const diag = commands ? commandDiag : schematic
  const issues = diag.errors + diag.warnings

  // No Esquema IEC a aba «GRAFCET» mostra a sequência e, por isso, conta etapas;
  // no Esquema 3D mostra o GRAFCET ativo — a contagem é a mesma.
  return (
    <div className="dc-dock-tabs" role="tablist" aria-label="Painel direito">
      <DockTile
        icon={<IconGrafcet size={14} />} label="GRAFCET" count={steps} title={`GRAFCET: ${steps} etapa(s)`}
        ariaLabel="GRAFCET" active={value === 'grafcet'} onClick={() => onChange('grafcet')} testId="grafcet"
      />
      <DockTile
        icon={<IconSchematic size={14} />} label="E/S" count={io} title={`Entradas/Saídas: ${io} ponto(s)`}
        ariaLabel="Entradas/Saídas" active={value === 'signals'} onClick={() => onChange('signals')} testId="signals"
      />
      <DockTile
        icon={<IconLayers size={14} />} label="Objetos" count={objects} title={`Objetos do projeto: ${objects}`}
        ariaLabel="Objetos" active={value === 'objects'} onClick={() => onChange('objects')} testId="objects"
      />
      <DockTile
        icon={issues ? <IconWarning size={14} /> : <IconCheckCircle size={14} />}
        label="Diagnóstico" count={issues}
        title={issues ? `Diagnóstico: ${diag.errors} erro(s), ${diag.warnings} aviso(s)` : 'Diagnóstico: tudo OK'}
        ariaLabel="Diagnóstico" active={value === 'diagnostics'} warning={issues > 0} valid={issues === 0}
        onClick={() => onChange('diagnostics')} testId="diagnostics"
      />
    </div>
  )
}
