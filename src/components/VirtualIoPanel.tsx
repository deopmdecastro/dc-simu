import { useMemo } from 'react'
import { useSimStore } from '../store/useSimStore'

/** Painel de entradas/saídas virtuais: liga/desliga I1…In com o rato e mostra Q/M em tempo real.
 *  Serve para simular Ladder e GRAFCET sem PLC no esquema. */
export default function VirtualIoPanel({ compact = false, extraBits = [] }: { compact?: boolean; extraBits?: string[] }) {
  const inputs = useSimStore((s) => s.virtualInputs)
  const count = useSimStore((s) => s.virtualInputCount)
  const table = useSimStore((s) => s.runtime.table)
  const tags = useSimStore((s) => s.tags)
  const setInput = useSimStore((s) => s.setVirtualInput)
  const setCount = useSimStore((s) => s.setVirtualInputCount)
  const clear = useSimStore((s) => s.clearVirtualInputs)
  const hasPlc = useSimStore((s) => s.components.some((c) => /^plc/i.test(c.type)))

  const nameOf = (address: string) => tags.find((t) => t.address.toUpperCase() === address)?.name
  const outputs = useMemo(() => {
    const known = new Set<string>([...extraBits.filter((a) => /^[QM]\d+$/.test(a))])
    for (const [key, value] of Object.entries(table)) if (/^[QM]\d+$/.test(key) && (value || /^Q/.test(key) && Number(key.slice(1)) <= 8)) known.add(key)
    return [...known].sort((a, b) => a[0] === b[0] ? Number(a.slice(1)) - Number(b.slice(1)) : a[0] < b[0] ? 1 : -1)
  }, [table, extraBits])
  const addresses = Array.from({ length: count }, (_, i) => `I${i + 1}`)

  return <section className={`vio-panel ${compact ? 'is-compact' : ''}`} aria-label="Entradas e saídas virtuais">
    <div className="vio-head">
      <strong>Entradas virtuais</strong>
      <span className="vio-actions">
        <button type="button" onClick={() => setCount(count - 1)} disabled={count <= 1} title="Menos entradas" aria-label="Menos entradas">−</button>
        <span>{count}</span>
        <button type="button" onClick={() => setCount(count + 1)} disabled={count >= 32} title="Mais entradas" aria-label="Mais entradas">+</button>
        <button type="button" onClick={clear} title="Desligar todas as entradas">Limpar</button>
      </span>
    </div>
    {hasPlc && <p className="vio-note">Há um PLC no esquema: as entradas vêm dos seus bornes. Estas entradas só atuam em projetos sem PLC.</p>}
    <div className="vio-inputs">
      {addresses.map((address) => {
        const on = !!inputs[address]
        return <button key={address} type="button" role="switch" aria-checked={on} className={`vio-switch ${on ? 'is-on' : ''}`}
          title={`${address}${nameOf(address) ? ` · ${nameOf(address)}` : ''} — clique para ${on ? 'desligar' : 'ligar'}; mantenha Shift para botão de pressão`}
          onClick={(event) => { if (!event.shiftKey) setInput(address, !on) }}
          onPointerDown={(event) => { if (event.shiftKey) { event.preventDefault(); setInput(address, true) } }}
          onPointerUp={(event) => { if (event.shiftKey) setInput(address, false) }}
          onPointerLeave={(event) => { if (event.shiftKey && inputs[address]) setInput(address, false) }}>
          <i /><b>{address}</b>{nameOf(address) && <small>{nameOf(address)}</small>}
        </button>
      })}
    </div>
    <div className="vio-head"><strong>Saídas e memórias</strong></div>
    <div className="vio-outputs">
      {outputs.map((address) => <span key={address} className={`vio-lamp ${table[address] ? 'is-on' : ''}`} title={nameOf(address) ?? address}><i />{address}</span>)}
      {!outputs.length && <small>Nenhuma saída ativa.</small>}
    </div>
  </section>
}
