import { useMemo, useState } from 'react'
import type { LadderTag } from '../types'
import { useSimStore } from '../store/useSimStore'
import { declareSignals } from './declareSignals'
import { isSignalAddress, canonicalSignalAddress, signalSearchText, type SignalArea, type SignalUsage } from './signals'
import { foldText } from '../utils/text'

export interface SignalsContext {
  /** Frase que explica o que o botão «Usar» faz para a seleção atual. */
  text: string
  /** Que áreas podem ser usadas neste contexto (ex.: ações só aceitam Q e M). */
  accepts: (area: SignalArea) => boolean
}

interface Props {
  tags: readonly LadderTag[]
  /** Valores atuais dos bits na simulação. */
  live: Record<string, unknown>
  running: boolean
  usage: ReadonlyMap<string, SignalUsage>
  /** Endereços usados no GRAFCET que ainda não estão na tabela. */
  undeclared: readonly string[]
  context: SignalsContext | null
  onUse: (address: string, area: SignalArea) => void
  onOpenTable: () => void
}

const AREAS: Array<{ area: SignalArea; label: string; add: string }> = [
  { area: 'I', label: 'Entradas', add: '+ Entrada' },
  { area: 'Q', label: 'Saídas', add: '+ Saída' },
  { area: 'M', label: 'Memórias', add: '+ Memória' },
]

/**
 * Tabela de sinais (I/Q/M) integrada no painel do GRAFCET: sempre visível, em tempo real
 * e partilhada com o Ladder. O que se edita aqui alimenta logo as sugestões das condições.
 */
export default function SignalsPanel({ tags, live, running, usage, undeclared, context, onUse, onOpenTable }: Props) {
  const updateTag = useSimStore((state) => state.updateTag)
  const addTag = useSimStore((state) => state.addTag)
  const [area, setArea] = useState<SignalArea | 'all'>('all')
  const [search, setSearch] = useState('')
  /** Linha cujo campo de comentário foi aberto à mão (os que já têm comentário mostram-no sempre). */
  const [commentOpen, setCommentOpen] = useState<string | null>(null)

  const rows = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{ tag: LadderTag; address: string; area: SignalArea }> = []
    for (const tag of tags) {
      const address = canonicalSignalAddress(tag.address)
      if (tag.dataType !== 'Bool' || !isSignalAddress(address) || seen.has(address)) continue
      seen.add(address)
      out.push({ tag, address, area: address[0] as SignalArea })
    }
    return out.sort((a, b) => 'IQM'.indexOf(a.area) - 'IQM'.indexOf(b.area) || Number(a.address.slice(1)) - Number(b.address.slice(1)))
  }, [tags])

  const query = foldText(search).trim()
  const visible = rows.filter((row) => (area === 'all' || row.area === area) && (!query || signalSearchText({ address: row.address, name: row.tag.name, comment: row.tag.comment ?? '', area: row.area }).includes(query)))
  const count = (value: SignalArea) => rows.filter((row) => row.area === value).length

  return (
    <div className="grafcet-signals">
      <p className={`grafcet-signals-context${context ? ' is-ready' : ''}`} role="status">
        {context ? context.text : 'Selecione uma transição, uma etapa ou uma ação para usar um sinal com «Usar».'}
      </p>

      <div className="grafcet-signals-toolbar">
        <input className="dc-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar endereço, nome ou comentário…" aria-label="Pesquisar sinais" />
        <div className="grafcet-signals-chips" role="group" aria-label="Filtrar por área">
          <button type="button" aria-pressed={area === 'all'} onClick={() => setArea('all')}>Todos <em>{rows.length}</em></button>
          {AREAS.map((item) => <button key={item.area} type="button" aria-pressed={area === item.area} onClick={() => setArea(item.area)}>{item.label} <em>{count(item.area)}</em></button>)}
        </div>
      </div>

      {undeclared.length > 0 && (
        <div className="grafcet-signals-banner" role="alert">
          <span><b>{undeclared.length}</b> {undeclared.length === 1 ? 'sinal usado' : 'sinais usados'} no GRAFCET sem estar na tabela: <code>{undeclared.join(', ')}</code></span>
          <button type="button" onClick={() => declareSignals(undeclared)}>Declarar {undeclared.length === 1 ? '' : 'todos'}</button>
        </div>
      )}

      <ul className="grafcet-signals-list" aria-label="Tabela de sinais">
        {visible.map(({ tag, address, area: rowArea }) => {
          const use = usage.get(address)
          const on = !!live[address]
          const usable = !context || context.accepts(rowArea)
          return (
            <li key={tag.id} className={`grafcet-signal-row is-${rowArea}${on ? ' is-on' : ''}`}>
              <span className="grafcet-signal-led" role="img" aria-label={on ? 'ativo' : 'inativo'} title={running ? (on ? 'Ativo (1)' : 'Inativo (0)') : 'Estado na simulação (parada)'} />
              <code className="grafcet-signal-address">{address}</code>
              <input className="dc-input grafcet-signal-name" value={tag.name === address ? '' : tag.name} placeholder="Nome" aria-label={`Nome de ${address}`} onChange={(event) => updateTag(tag.id, { name: event.target.value })} />
              <span className={`grafcet-signal-usage${use ? '' : ' is-unused'}`} title={use ? `Lido em ${use.transitions} transição(ões) · usado em ${use.actions} ação(ões)` : 'Ainda não é usado no GRAFCET'}>
                {use ? `${use.transitions}T · ${use.actions}A` : '—'}
              </span>
              <button type="button" className="grafcet-signal-use" disabled={!context || !usable} onClick={() => onUse(address, rowArea)} title={!context ? 'Selecione primeiro onde usar o sinal' : usable ? `Usar ${address}` : 'Neste contexto só se usam saídas e memórias'}>Usar</button>
              {tag.comment || commentOpen === tag.id ? (
                <input className="dc-input grafcet-signal-comment" autoFocus={commentOpen === tag.id && !tag.comment} value={tag.comment ?? ''} placeholder="Comentário (função do sinal)" aria-label={`Comentário de ${address}`} onChange={(event) => updateTag(tag.id, { comment: event.target.value })} onBlur={() => setCommentOpen(null)} />
              ) : (
                <button type="button" className="grafcet-signal-add-comment" onClick={() => setCommentOpen(tag.id)} aria-label={`Adicionar comentário a ${address}`}>+ comentário</button>
              )}
            </li>
          )
        })}
        {!visible.length && <li className="grafcet-signals-empty">{rows.length ? 'Nenhum sinal corresponde à pesquisa.' : 'A tabela ainda não tem entradas, saídas ou memórias. Adicione acima ou use «Tabela completa» para as detetar do GRAFCET.'}</li>}
      </ul>

      <div className="grafcet-signals-actions">
        {AREAS.map((item) => <button key={item.area} type="button" className="dc-btn" onClick={() => { addTag(item.area); setArea(item.area); setSearch('') }}>{item.add}</button>)}
        <button type="button" className="dc-btn" onClick={onOpenTable} title="Editar endereços, remover e detetar sinais do GRAFCET">Tabela completa…</button>
      </div>
    </div>
  )
}
