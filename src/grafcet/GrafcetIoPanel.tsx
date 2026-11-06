import { useEffect, useMemo } from 'react'
import { useSimStore } from '../store/useSimStore'
import { SimulationSignals } from '../components/SimulationDock'
import { detectGrafcetIo } from './inputDetect'
import { signalAliasMap } from './signals'
import type { GrafcetProgram } from './engine'

/**
 * Separador «E/S» do inspetor do GRAFCET: reutiliza os mesmos cartões do Ladder e do Esquema IEC
 * (`SimulationSignals` → `VirtualIoPanel`/`PlcSignalPanel`) — botões de entrada com o tipo
 * INT/NO/NC e lâmpadas das saídas Q/M — em vez de uma versão própria do GRAFCET.
 * Garante só que as entradas usadas nas condições das transições existem nos cartões.
 */
export default function GrafcetIoPanel({ program, stepLabel, extraBits }: {
  program: GrafcetProgram
  stepLabel: (stepId: string) => string
  /** Endereços de saída usados nas ações das etapas (aparecem mesmo a 0). */
  extraBits: string[]
}) {
  const tags = useSimStore((s) => s.tags)
  const inputCount = useSimStore((s) => s.virtualInputCount)
  const setCount = useSimStore((s) => s.setVirtualInputCount)
  const aliases = useMemo(() => signalAliasMap(tags), [tags])
  const detection = useMemo(() => detectGrafcetIo(program, stepLabel, aliases), [program, stepLabel, aliases])
  useEffect(() => {
    if (detection.maxInput > inputCount) setCount(detection.maxInput)
  }, [detection.maxInput, inputCount, setCount])
  return <div className="grafcet-io" data-grafcet-io>
    <SimulationSignals extraBits={extraBits} />
  </div>
}
