import { useMemo } from 'react'
import { useSimStore, type VirtualInputMode } from '../store/useSimStore'
import { bitAddresses, bitAddressOrder } from '../ladder/addresses'
import VirtualInputButton from './VirtualInputButton'

/** Painel de entradas/saídas virtuais: liga/desliga I0.0…Ix.y com o rato e mostra
 *  Q/M em tempo real. O utilizador escolhe quantas entradas, saídas e memórias
 *  quer (botões −/+, Shift = ±8). Serve para simular Ladder e GRAFCET sem PLC. */
export default function VirtualIoPanel({ compact = false, extraBits = [] }: { compact?: boolean; extraBits?: string[] }) {
  const count = useSimStore((s) => s.virtualInputCount)
  const outputCount = useSimStore((s) => s.virtualOutputCount)
  const memoryCount = useSimStore((s) => s.virtualMemoryCount)
  const table = useSimStore((s) => s.runtime.table)
  const tags = useSimStore((s) => s.tags)
  const setCount = useSimStore((s) => s.setVirtualInputCount)
  const setOutputCount = useSimStore((s) => s.setVirtualOutputCount)
  const setMemoryCount = useSimStore((s) => s.setVirtualMemoryCount)
  const clear = useSimStore((s) => s.clearVirtualInputs)
  const modes = useSimStore((s) => s.virtualInputModes)
  const setMode = useSimStore((s) => s.setVirtualInputMode)
  const hasPlc = useSimStore((s) => s.components.some((c) => /^plc/i.test(c.type)))
  const stopped = useSimStore((s) => s.sim.runState === 'stopped')

  const nameOf = (address: string) => { const n = tags.find((t) => t.address.toUpperCase() === address)?.name; return n && n.toUpperCase() !== address ? n : undefined }

  // Grupo Q/M: base = as primeiras N casas pedidas pelo utilizador; a isto
  // junta-se qualquer bit extra usado pelo programa (table/extraBits).
  const groupBits = (prefix: 'Q' | 'M', baseCount: number): string[] => {
    const known = new Set<string>(bitAddresses(prefix, baseCount))
    for (const a of extraBits) if (a.startsWith(prefix) && /^\w\d+\.\d$/.test(a)) known.add(a)
    for (const [key, value] of Object.entries(table))
      if (key.startsWith(prefix) && /^\w\d+\.\d$/.test(key) && value) known.add(key)
    return [...known].sort((a, b) => bitAddressOrder(a) - bitAddressOrder(b))
  }
  const outputs = useMemo(() => groupBits('Q', outputCount), [table, extraBits, outputCount])
  const memories = useMemo(() => groupBits('M', memoryCount), [table, extraBits, memoryCount])
  const addresses = bitAddresses('I', count)

  const activeInputs = addresses.filter((a) => table[a]).length
  const activeOutputs = outputs.filter((a) => table[a]).length
  const activeMemories = memories.filter((a) => table[a]).length

  const stepper = (value: number, set: (n: number) => void, kind: 'entradas' | 'saídas' | 'memórias', min: number) => (
    <span className="vio-stepper" role="group" aria-label={`Quantidade de ${kind}`}>
      <button type="button" onClick={(e) => set(value - (e.shiftKey ? 8 : 1))} disabled={value <= min} title={`Menos ${kind} (Shift = −8)`} aria-label={`Menos ${kind}`}>−</button>
      <output className="vio-count" aria-live="polite">{value}</output>
      <button type="button" onClick={(e) => set(value + (e.shiftKey ? 8 : 1))} disabled={value >= 32} title={`Mais ${kind} (Shift = +8)`} aria-label={`Mais ${kind}`}>+</button>
    </span>
  )

  // Tipo de botão visível e clicável (antes só havia o botão direito, inacessível em toque).
  const MODE_NEXT: Record<VirtualInputMode, VirtualInputMode> = { latch: 'push', push: 'nc', nc: 'latch' }
  const MODE_LABEL: Record<VirtualInputMode, string> = { latch: 'INT', push: 'NO', nc: 'NC' }
  const MODE_NAME: Record<VirtualInputMode, string> = { latch: 'interruptor (liga/desliga)', push: 'botão de pressão NO', nc: 'botão NC (repousa a 1)' }
  const inputCell = (address: string) => {
    const name = nameOf(address)
    const mode: VirtualInputMode = modes[address] ?? 'latch'
    return <div key={address} className="vio-cell">
      <VirtualInputButton address={address} className="vio-switch" title={`${address}${name ? ` · ${name}` : ''}`}>
        <i /><b>{address}</b><small className={name ? 'vio-name' : 'vio-name-empty'}>{name ?? '—'}</small>
      </VirtualInputButton>
      <div className="vio-cell-foot">
        <button type="button" className={`vio-mode is-${mode}`} onClick={() => setMode(address, MODE_NEXT[mode])}
          title={`${address}: ${MODE_NAME[mode]} — clique para mudar o tipo`} aria-label={`Tipo de ${address}: ${MODE_NAME[mode]}. Mudar tipo`}>{MODE_LABEL[mode]}</button>
        <span className={`plc-sim-state ${table[address] ? 'is-on' : ''}`} aria-hidden="true"><b>{table[address] ? '1' : '0'}</b></span>
      </div>
    </div>
  }

  const lamp = (address: string) => {
    const name = nameOf(address)
    return <span key={address} className={`vio-lamp ${table[address] ? 'is-on' : ''}`} title={name ? `${address} · ${name}` : address}><i /><b>{address}</b>{name && <small>{name}</small>}</span>
  }

  return <section className={`vio-panel ${compact ? 'is-compact' : ''} ${stopped ? 'is-stopped' : ''}`} aria-label="Entradas e saídas virtuais">
    {stopped && <details className="vio-help is-info"><summary><b>STOP</b> · Pode testar as entradas</summary><p>Cada alteração calcula um ciclo. Use Run para execução contínua.</p></details>}
    {hasPlc && <p className="vio-note">Há um PLC no esquema: as entradas vêm dos seus bornes. Estas entradas só atuam em projetos sem PLC.</p>}
    <div className="vio-cols">
      <div className="vio-col">
        <div className="vio-head">
          <strong>Entradas virtuais <em className={activeInputs ? 'is-live' : ''}>{activeInputs}/{count}</em></strong>
          <span className="vio-actions">
            {stepper(count, setCount, 'entradas', 1)}
            <button type="button" className="vio-clear" onClick={clear} disabled={!activeInputs} title="Desligar todas as entradas">Limpar</button>
          </span>
        </div>
        <div className="vio-inputs">
          {addresses.map(inputCell)}
        </div>
        <p className="vio-hint"><kbd>Clique</kbd> liga/desliga · <kbd>Shift</kbd> pressão momentânea · a etiqueta <b>INT</b>/<b>NO</b>/<b>NC</b> muda o tipo de botão</p>
      </div>
      <div className="vio-col">
        <div className="vio-head">
          <strong>Saídas (Q) <em className={activeOutputs ? 'is-live' : ''}>{activeOutputs} ativa{activeOutputs === 1 ? '' : 's'}</em></strong>
          {stepper(outputCount, setOutputCount, 'saídas', 1)}
        </div>
        <div className="vio-outputs">
          {outputs.map(lamp)}
          {!outputs.length && <div className="vio-empty-row"><small className="vio-empty">Sem saídas visíveis.</small><button type="button" className="vio-add" onClick={() => setOutputCount(1)}>+ Mostrar Q0.0</button></div>}
        </div>
        <div className="vio-head vio-head-m">
          <strong>Memórias (M) <em className={activeMemories ? 'is-live' : ''}>{activeMemories} ativa{activeMemories === 1 ? '' : 's'}</em></strong>
          {stepper(memoryCount, setMemoryCount, 'memórias', 0)}
        </div>
        {memoryCount === 0 && !memories.length
          ? <div className="vio-empty-row">
              <small className="vio-empty">Sem memórias visíveis. O programa mostra-as ao ligar.</small>
              <button type="button" className="vio-add" onClick={() => setMemoryCount(1)}>+ Adicionar M0.0</button>
            </div>
          : <div className="vio-outputs">{memories.map(lamp)}</div>}
      </div>
    </div>
  </section>
}
