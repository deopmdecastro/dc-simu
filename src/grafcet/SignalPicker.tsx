import { useEffect, useRef, useState } from 'react'
import { signalSearchText, type GrafcetSignalSuggestion } from './signals'
import { foldText } from '../utils/text'
import { IconChevronDown, IconClose, IconSearch } from '../ui/icons'

/** Explicit search includes human labels/comments, but selection inserts only the address. */
export default function SignalPicker({ signals, inputId, onChoose, onOpenChange }: { signals: GrafcetSignalSuggestion[]; inputId: string; onChoose: (address: string) => void; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const query = foldText(search)
  const filtered = signals.filter((signal) => signalSearchText(signal).includes(query))
  const close = (restoreFocus = false) => { if (restoreFocus) document.getElementById(inputId)?.focus(); setOpen(false); onOpenChange?.(false) }
  const choose = (address: string) => { onChoose(address); close(true) }
  useEffect(() => { if (open) searchRef.current?.focus() }, [open])
  return <div ref={containerRef} className="grafcet-signal-picker" onBlur={(event) => { if (event.relatedTarget instanceof Node && !containerRef.current?.contains(event.relatedTarget)) close() }} onKeyDown={(event) => {
    if (!open) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const nodes = Array.from(containerRef.current?.querySelectorAll<HTMLButtonElement>('[data-output-signal]') ?? [])
      const index = nodes.indexOf(event.target as HTMLButtonElement)
      if (event.target === searchRef.current || index >= 0) {
        event.preventDefault()
        if (event.key === 'ArrowUp' && index === 0) searchRef.current?.focus()
        else nodes[event.target === searchRef.current ? (event.key === 'ArrowDown' ? 0 : nodes.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length]?.focus()
      }
    }
  }}>
    <button type="button" className="dc-btn grafcet-signal-picker-trigger" aria-expanded={open} aria-controls={open ? `${inputId}-signals` : undefined} onClick={() => { setOpen(!open); onOpenChange?.(!open) }}><IconSearch size={12} />Escolher saída ou memória<IconChevronDown size={10} /></button>
    {open && <div className="grafcet-condition-picker" id={`${inputId}-signals`} data-property-save-ignore><div className="grafcet-condition-picker-head"><strong>Sinais da tabela · Q/M</strong><button type="button" aria-label="Fechar pesquisa de saídas" onClick={() => close(true)}><IconClose size={13} /></button></div><label htmlFor={`${inputId}-search`}>Pesquisar saída ou memória</label><input ref={searchRef} id={`${inputId}-search`} className="dc-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Endereço, nome ou comentário…" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!event.ctrlKey && !event.metaKey && filtered[0]) choose(filtered[0].address) } }} /><div className="grafcet-condition-results" role="group" aria-label="Saídas e memórias disponíveis">{filtered.map((signal) => <button key={signal.address} type="button" data-output-signal onClick={() => choose(signal.address)}><code>{signal.address}</code><span>{signal.name && <b>{signal.name}</b>}{signal.comment && <small>{signal.comment}</small>}</span></button>)}{!filtered.length && <p>{signals.length ? 'Nenhum sinal corresponde à pesquisa.' : 'Não há saídas ou memórias booleanas na tabela. Declare-as em «Variáveis» para as sugerir aqui.'}</p>}</div></div>}
  </div>
}
