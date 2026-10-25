import { useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { isDeclarableAddress } from './ladderEngine'

/** Tabela de forçar valores (diagnóstico PLC): impõe 0/1 a uma entrada, saída ou memória durante o RUN.
 *  O forçar prevalece sobre bobinas e entradas físicas/virtuais e só existe em memória (não é gravado). */
export default function ForcePanel() {
  const forces = useSimStore((s) => s.forces)
  const table = useSimStore((s) => s.runtime.table)
  const tags = useSimStore((s) => s.tags)
  const setForce = useSimStore((s) => s.setForce)
  const clearForces = useSimStore((s) => s.clearForces)
  const [draft, setDraft] = useState('')
  const address = draft.trim().toUpperCase().replace(/^%/, '')
  const valid = isDeclarableAddress(address) && !/^[TC]\d+$/.test(address) && !/^MW/.test(address)
  const entries = Object.entries(forces)
  const nameOf = (a: string) => tags.find((t) => t.address.toUpperCase() === a)?.name

  return <section className="ladder-force" aria-label="Forçar valores">
    <div className="ladder-force-add">
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Endereço (ex.: I0.0, Q0.1, M0.0)" aria-label="Endereço a forçar" list="ladder-force-addresses" />
      <datalist id="ladder-force-addresses">{Object.keys(table).filter((k) => /^[IQM]\d+\.\d$/.test(k)).map((k) => <option key={k} value={k} />)}</datalist>
      <button type="button" disabled={!valid} onClick={() => { setForce(address, true); setDraft('') }} title="Forçar a 1">Forçar 1</button>
      <button type="button" disabled={!valid} onClick={() => { setForce(address, false); setDraft('') }} title="Forçar a 0">Forçar 0</button>
      <button type="button" disabled={!entries.length} onClick={clearForces} title="Remover todos os forçar">Remover todos</button>
    </div>
    {entries.length
      ? <ul className="ladder-force-list">{entries.map(([a, v]) => <li key={a} className={`ladder-force-row ${table[a] ? 'is-on' : ''}`}>
          <b>{a}</b><small>{nameOf(a) ?? '—'}</small>
          <span className="ladder-force-val" title="Valor imposto">{v ? '1' : '0'}</span>
          <button type="button" onClick={() => setForce(a, !v)} title="Inverter o valor forçado">Inverter</button>
          <button type="button" onClick={() => setForce(a, null)} title="Libertar este endereço">Libertar</button>
        </li>)}</ul>
      : <p className="ladder-status-empty">Sem valores forçados. Indique um endereço e escolha «Forçar 1» ou «Forçar 0» — o valor mantém-se durante o RUN, mesmo que o programa tente alterá-lo.</p>}
    {entries.length > 0 && <p className="ladder-force-warn" role="status">⚠ {entries.length} endereço{entries.length === 1 ? '' : 's'} forçado{entries.length === 1 ? '' : 's'}: o programa não controla {entries.length === 1 ? 'esse endereço' : 'esses endereços'}.</p>}
  </section>
}
