import { useEffect, useRef, useState } from 'react'
import { signalSearchText, type GrafcetSignalSuggestion } from './signals'
import { foldText } from '../utils/text'

/** Explicit search includes human labels/comments, but selection inserts only the address. */
export default function SignalPicker({ signals, inputId, onChoose, onOpenChange }: { signals: GrafcetSignalSuggestion[]; inputId: string; onChoose: (address: string) => void; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const query = foldText(search)
  const filtered = signals.filter((signal) => signalSearchText(signal).includes(query))
  const close = () => { setOpen(false); onOpenChange?.(false) }
  const choose = (address: string) => { onChoose(address); close(); requestAnimationFrame(() => document.getElementById(inputId)?.focus()) }
  useEffect(() => { if (open) searchRef.current?.focus() }, [open])
  return <div ref={containerRef} className="grafcet-signal-picker" onBlur={(event) => { if (event.relatedTarget instanceof Node && !containerRef.current?.contains(event.relatedTarget)) close() }} onKeyDown={(event) => { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); document.getElementById(inputId)?.focus() } }}>
    <button type="button" className="dc-btn" aria-expanded={open} onClick={() => { setOpen(!open); onOpenChange?.(!open) }}>Escolher saída ou memória</button>
    {open && <div className="grafcet-condition-picker"><div className="grafcet-condition-picker-head"><strong>Sinais da tabela · Q/M</strong><button type="button" aria-label="Fechar pesquisa de saídas" onClick={() => { close(); document.getElementById(inputId)?.focus() }}>×</button></div><label htmlFor={`${inputId}-search`}>Pesquisar saída ou memória</label><input ref={searchRef} id={`${inputId}-search`} className="dc-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Endereço, nome ou comentário…" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (filtered[0]) choose(filtered[0].address) } }} /><div className="grafcet-condition-results" role="group" aria-label="Saídas e memórias disponíveis">{filtered.map((signal) => <button key={signal.address} type="button" onClick={() => choose(signal.address)}><code>{signal.address}</code><span>{signal.name && <b>{signal.name}</b>}{signal.comment && <small>{signal.comment}</small>}</span></button>)}{!filtered.length && <p>{signals.length ? 'Nenhum sinal corresponde à pesquisa.' : 'Não há saídas ou memórias booleanas na tabela. Declare-as em «Variáveis» para as sugerir aqui.'}</p>}</div></div>}
  </div>
}
