import { useMemo } from 'react'
import { useSimStore } from '../store/useSimStore'
import { bitAddresses, bitAddressOrder } from '../ladder/addresses'
import VirtualInputButton from './VirtualInputButton'

/** Painel de entradas/saídas virtuais: liga/desliga I0.0…Ix.y com o rato e mostra Q/M em tempo real.
 *  Serve para simular Ladder e GRAFCET sem PLC no esquema. */
export default function VirtualIoPanel({ compact = false, extraBits = [] }: { compact?: boolean; extraBits?: string[] }) {
  const count = useSimStore((s) => s.virtualInputCount)
  const table = useSimStore((s) => s.runtime.table)
  const tags = useSimStore((s) => s.tags)
  const setCount = useSimStore((s) => s.setVirtualInputCount)
  const clear = useSimStore((s) => s.clearVirtualInputs)
  const hasPlc = useSimStore((s) => s.components.some((c) => /^plc/i.test(c.type)))

  const nameOf = (address: string) => { const n = tags.find((t) => t.address.toUpperCase() === address)?.name; return n && n.toUpperCase() !== address ? n : undefined }
  const outputs = useMemo(() => {
    const known = new Set<string>([...extraBits.filter((a) => /^[QM]\d+\.\d$/.test(a))])
    for (const [key, value] of Object.entries(table)) if (/^[QM]\d+\.\d$/.test(key) && (value || /^Q/.test(key) && bitAddressOrder(key) < 8)) known.add(key)
    return [...known].sort((a, b) => a[0] === b[0] ? bitAddressOrder(a) - bitAddressOrder(b) : a[0] < b[0] ? 1 : -1)
  }, [table, extraBits])
  const addresses = bitAddresses('I', count)

  const activeInputs = addresses.filter((a) => table[a]).length
  const activeOutputs = outputs.filter((a) => table[a]).length

  return <section className={`vio-panel ${compact ? 'is-compact' : ''}`} aria-label="Entradas e saídas virtuais">
    {hasPlc && <p className="vio-note">Há um PLC no esquema: as entradas vêm dos seus bornes. Estas entradas só atuam em projetos sem PLC.</p>}
    <div className="vio-cols">
      <div className="vio-col">
        <div className="vio-head">
          <strong>Entradas virtuais <em className={activeInputs ? 'is-live' : ''}>{activeInputs}/{count}</em></strong>
          <span className="vio-actions">
            <button type="button" onClick={() => setCount(count - 1)} disabled={count <= 1} title="Menos entradas" aria-label="Menos entradas">−</button>
            <span className="vio-count">{count}</span>
            <button type="button" onClick={() => setCount(count + 1)} disabled={count >= 32} title="Mais entradas" aria-label="Mais entradas">+</button>
            <button type="button" onClick={clear} disabled={!activeInputs} title="Desligar todas as entradas">Limpar</button>
          </span>
        </div>
        <div className="vio-inputs">
          {addresses.map((address) => {
            const name = nameOf(address)
            return <VirtualInputButton key={address} address={address} className="vio-switch" title={`${address}${name ? ` · ${name}` : ''}`}>
              <i /><b>{address}</b><small>{name ?? '—'}</small>
            </VirtualInputButton>
          })}
        </div>
      </div>
      <div className="vio-col">
        <div className="vio-head"><strong>Saídas e memórias <em className={activeOutputs ? 'is-live' : ''}>{activeOutputs} ativa{activeOutputs === 1 ? '' : 's'}</em></strong></div>
        <div className="vio-outputs">
          {outputs.map((address) => {
            const name = nameOf(address)
            return <span key={address} className={`vio-lamp ${table[address] ? 'is-on' : ''}`} title={name ? `${address} · ${name}` : address}><i /><b>{address}</b>{name && <small>{name}</small>}</span>
          })}
          {!outputs.length && <small className="vio-empty">Nenhuma saída ativa.</small>}
        </div>
      </div>
    </div>
  </section>
}
