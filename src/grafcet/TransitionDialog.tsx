import { useEffect, useState } from 'react'
import { stepNumberOf, validCondition, type GrafcetTransition, type GrafcetStep } from './engine'
import PropertyDialog from '../ui/PropertyDialog'
import ConditionEditor from './ConditionEditor'
import type { GrafcetSignalSuggestion } from './signals'
import { foldText } from '../utils/text'
import { IconArrowDown, IconCheck, IconChevronRight, IconLink, IconSearch, IconSwap, IconWarning } from '../ui/icons'
import '../styles/grafcet-dialog-ux.css'

interface TransitionDialogProps {
  open: boolean
  transition: GrafcetTransition | null
  transitionIndex?: number
  availableSteps?: GrafcetStep[]
  signals?: GrafcetSignalSuggestion[]
  onSave: (patch: Partial<GrafcetTransition>) => void
  onClose: () => void
  onHelp?: () => void
}

export default function TransitionDialog({ open, transition, transitionIndex = 0, availableSteps = [], signals = [], onSave, onClose }: TransitionDialogProps) {
  const [name, setName] = useState('')
  const [condition, setCondition] = useState('1')
  const [description, setDescription] = useState('')
  const [displayDescription, setDisplayDescription] = useState(false)
  const [targetInfo, setTargetInfo] = useState('')
  const [from, setFrom] = useState<string[]>([])
  const [to, setTo] = useState<string[]>([])
  const [wireless, setWireless] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [fromSearch, setFromSearch] = useState('')
  const [toSearch, setToSearch] = useState('')
  const [quickFrom, setQuickFrom] = useState('')
  const [quickTo, setQuickTo] = useState('')
  const [quickMsg, setQuickMsg] = useState('')
  const [annotationsOpen, setAnnotationsOpen] = useState(false)

  useEffect(() => {
    if (!transition) return
    setSubmitted(false)
    setFromSearch('')
    setToSearch('')
    setName(transition.name ?? `T${transitionIndex + 1}`)
    setCondition(transition.condition ?? '1')
    setDescription(transition.description ?? transition.comment ?? '')
    setDisplayDescription(!!transition.displayDescription)
    setTargetInfo(transition.targetInfo ?? '')
    setFrom([...transition.from])
    setTo([...transition.to])
    setWireless(!!transition.wireless)
    setQuickFrom('')
    setQuickTo('')
    setQuickMsg('')
    setAnnotationsOpen(!!transition.description || !!transition.comment || !!transition.targetInfo || !!transition.displayDescription)
  }, [transition, transitionIndex, open])

  if (!open || !transition) return null
  const conditionError = !validCondition(condition) ? 'Indique uma condição válida antes de guardar.' : ''
  const save = () => {
    setSubmitted(true)
    if (conditionError) { document.getElementById('trans-condition-input')?.focus(); return }
    onSave({ name: name.trim() || `T${transitionIndex + 1}`, condition: condition.trim(), description: description.trim(), comment: description.trim(), displayDescription, targetInfo: targetInfo.trim(), wireless, from: [...from], to: [...to] })
    onClose()
  }
  /** Número que o diagrama mostra (o mesmo de X<n> e do «Ligar nº»). */
  const numberOf = (index: number) => stepNumberOf(availableSteps[index], index)
  /** Rótulo curto: o nome só se junta quando acrescenta informação (evita «Etapa 0 · Etapa 0»). */
  const pointOf = (index: number): { number: string; name: string } => {
    const step = availableSteps[index]
    const number = numberOf(index)
    const folded = foldText(step.name).replace(/\s+/g, ' ')
    const generic = folded === number || new RegExp(`^(?:etapa|step|e)\\s*${number}$`).test(folded)
    return { number, name: generic || !step.name.trim() ? '' : step.name.trim() }
  }
  const labelOf = (id: string) => {
    const index = availableSteps.findIndex((step) => step.id === id)
    if (index < 0) return 'Etapa indisponível · ligação preservada'
    const point = pointOf(index)
    return `Etapa ${point.number}${point.name ? ` · ${point.name}` : ''}`
  }
  const directCycle = from.filter((id) => to.includes(id))
  const toggle = (side: 'from' | 'to', id: string) => {
    const update = (current: string[]) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    if (side === 'from') setFrom(update)
    else setTo(update)
  }
  /** Liga pelo número da etapa tal como aparece no diagrama (ex.: 141 ou X141). */
  const connectByNumber = (side: 'from' | 'to') => {
    const raw = foldText((side === 'from' ? quickFrom : quickTo).trim()).replace(/^x/, '')
    if (!raw) return
    const index = availableSteps.findIndex((step, i) => foldText(stepNumberOf(step, i)) === raw)
    if (index < 0) { setQuickMsg(`Não existe etapa com o número ${raw}.`); return }
    const id = availableSteps[index].id
    const ids = side === 'from' ? from : to
    if (ids.includes(id)) { setQuickMsg(`A Etapa ${raw} já está ligada ${side === 'from' ? 'nas origens' : 'nos destinos'}.`); return }
    if (side === 'from') setFrom([...from, id])
    else setTo([...to, id])
    ;(side === 'from' ? setQuickFrom : setQuickTo)('')
    setQuickMsg(`Etapa ${raw} ligada ${side === 'from' ? 'às origens' : 'aos destinos'} — guarde para aplicar.`)
  }
  const renderConnections = (side: 'from' | 'to', ids: string[]) => {
    const query = foldText((side === 'from' ? fromSearch : toSearch).trim())
    const matches = availableSteps.map((step, index) => ({ step, index })).filter(({ step, index }) => { const point = pointOf(index); return foldText(`${index} Etapa ${index} ${point.number} ${step.name} ${step.description ?? ''} ${step.comment ?? ''}`).includes(query) })
    const missing = [...new Set(ids.filter((id) => !availableSteps.some((step) => step.id === id)))]
    return (
    <fieldset className="grafcet-property-section grafcet-connection-selector" aria-label={side === 'from' ? 'Origens · todas ativas' : 'Destinos · ativados juntos'}>
      <legend>{side === 'from' ? 'Origens · todas ativas' : 'Destinos · ativados juntos'} <span>{ids.length}</span></legend>
      {!!ids.length && (
        <div className="grafcet-connection-chips" data-property-save-ignore aria-label={side === 'from' ? 'Etapas ligadas nas origens' : 'Etapas ligadas nos destinos'}>
          {ids.map((id, index) => <span key={`${id}:${index}`} className="grafcet-connection-chip">{labelOf(id)}<button type="button" onClick={() => toggle(side, id)} aria-label={`Desligar ${labelOf(id)}`}>×</button></span>)}
        </div>
      )}
      <div className="grafcet-connection-search" data-property-save-ignore><IconSearch size={12} /><input type="search" className="dc-input" aria-label={side === 'from' ? 'Pesquisar etapas de origem' : 'Pesquisar etapas de destino'} placeholder="Pesquisar etapa…" value={side === 'from' ? fromSearch : toSearch} onChange={(event) => (side === 'from' ? setFromSearch : setToSearch)(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }} /></div>
      <div className="grafcet-connection-options">
        {matches.map(({ step, index }) => { const point = pointOf(index); return <label key={step.id} className={ids.includes(step.id) ? 'is-selected' : ''}><input type="checkbox" checked={ids.includes(step.id)} onChange={() => toggle(side, step.id)} /><span><b>Etapa {point.number}{point.name && <span className="grafcet-connection-name"> · {point.name}</span>}</b>{(step.description || step.comment) && <small>{step.description || step.comment}</small>}</span></label> })}
        {missing.map((id, index) => <label key={id} className="is-selected is-unresolved"><input type="checkbox" checked onChange={() => toggle(side, id)} /><span><b>Etapa indisponível {index + 1}</b><small>Ligação preservada. Desmarque para remover.</small></span></label>)}
        {!!query && !matches.length && <p className="grafcet-property-note">Nenhuma etapa corresponde à pesquisa.</p>}
        {!availableSteps.length && !ids.length && <p className="grafcet-property-note">Ainda não existem etapas para ligar.</p>}
      </div>
      <details className="grafcet-connection-by-number" data-property-save-ignore><summary><IconChevronRight size={10} />Ligar pelo número</summary><div className="grafcet-connection-quick">
        <input className="dc-input" inputMode="numeric" placeholder="Ligar pelo nº (ex.: 141)" value={side === 'from' ? quickFrom : quickTo} onChange={(event) => (side === 'from' ? setQuickFrom : setQuickTo)(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); connectByNumber(side) } }} aria-label={side === 'from' ? 'Ligar origem pelo número da etapa' : 'Ligar destino pelo número da etapa'} />
        <button type="button" className="grafcet-link-button" onClick={() => connectByNumber(side)}>Ligar nº</button>
      </div></details>
      <div className="grafcet-connection-selector-footer"><span>{ids.length} selecionada{ids.length === 1 ? '' : 's'}</span><button type="button" className="grafcet-link-button" disabled={!ids.length} onClick={() => (side === 'from' ? setFrom : setTo)([])} aria-label={side === 'from' ? 'Limpar origens' : 'Limpar destinos'}>Limpar</button></div>
    </fieldset>
  )}
  return (
    <PropertyDialog open={open} id="trans-dialog" className="grafcet-compact-dialog grafcet-transition-dialog" title="Propriedades da transição" subtitle="Defina a condição e escolha as etapas de origem e destino." onSave={save} onClose={onClose}>
      <div className="grafcet-property-grid">
        <section className="grafcet-property-fields" aria-label="Definições da transição">
          <div className="grafcet-property-field"><label htmlFor="trans-name-input">Nome <span className="grafcet-optional">opcional</span></label><input id="trans-name-input" className="dc-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={`T${transitionIndex + 1}`} /></div>
          <ConditionEditor id="trans-condition-input" value={condition} onChange={setCondition} signals={signals} availableSteps={availableSteps} resetKey={`${transition.id}:${open}`} initialDefaultOne={(transition.condition ?? '1') === '1'} initialFocus error={submitted ? conditionError : undefined} />
          <section className="grafcet-transition-connections" aria-label="Ligações da transição"><div className="grafcet-connections-heading"><h3><IconLink size={13} /> Ligações</h3><button type="button" className="dc-btn grafcet-connections-swap" onClick={() => { setFrom([...to]); setTo([...from]) }} disabled={!from.length && !to.length}><IconSwap size={12} /> Inverter ligações</button></div>
          <label className="grafcet-property-checkbox"><input type="checkbox" checked={wireless} onChange={(event) => setWireless(event.target.checked)} /><span>Ligação por referência (sem linha)</span></label>
          <p className="grafcet-property-note">A referência mostra o número da etapa na ponta da ligação.</p>
          <div className="grafcet-connection-editors">{renderConnections('from', from)}{renderConnections('to', to)}</div>
          {quickMsg && <p className="grafcet-property-note" role="status">{quickMsg}</p>}
          {!!directCycle.length && <p className="grafcet-property-warning" role="status">Ciclo direto: {directCycle.map((id) => labelOf(id)).join(', ')} {directCycle.length === 1 ? 'é origem e destino' : 'são origem e destino'} ao mesmo tempo — enquanto a condição for verdadeira a transição dispara continuamente, sem esperar noutra etapa.</p>}
          </section>
          {(!from.length || !to.length) && <p className="grafcet-property-warning" role="status">Transição solta: faltam {(!from.length && !to.length) ? 'origens e destinos' : !from.length ? 'origens' : 'destinos'}. Pode guardar o rascunho e completar as ligações depois.</p>}
          <details className="grafcet-context-help grafcet-dialog-annotations" open={annotationsOpen} onToggle={(event) => setAnnotationsOpen(event.currentTarget.open)}><summary><IconChevronRight size={11} />Descrição e referência visual <span>opcional</span></summary><div>
            <div className="grafcet-property-field"><label htmlFor="trans-desc-input">Descrição</label><textarea id="trans-desc-input" className="dc-input" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Cilindro A no fim de curso" /><label className="grafcet-property-checkbox"><input type="checkbox" checked={displayDescription} onChange={(event) => setDisplayDescription(event.target.checked)} /><span>Mostrar a descrição em vez da expressão no diagrama</span></label></div>
            <div className="grafcet-property-field"><label htmlFor="trans-reference-input">Referência visual</label><input id="trans-reference-input" className="dc-input" value={targetInfo} onChange={(event) => setTargetInfo(event.target.value)} placeholder="Ex.: Continuação na folha 2" /><p className="grafcet-property-note">Anotação do diagrama. Os destinos são definidos nas ligações acima.</p></div>
          </div></details>
          <details className="grafcet-context-help grafcet-inline-disclosure"><summary><IconChevronRight size={11} />Ajuda sobre transições</summary><div><p>A condição é uma expressão booleana: <code>I1 * /I2</code> exige I1 ativa e I2 inativa. Use AND (*), OR (+), NOT (/), flancos e parênteses.</p><p><code>X10</code> consulta a etapa com o número 10 no diagrama. <code>T(2s)</code> verifica dois segundos de atividade das origens.</p><p>Várias origens sincronizam ramos: todas precisam de estar ativas. Com a condição verdadeira, a transição ativa todos os destinos (AND). Pode guardar uma transição solta e completá-la no diagrama.</p></div></details>
        </section>
        <aside className="grafcet-property-preview">
          <div className="grafcet-property-preview-label"><span>Pré-visualização</span><span className="grafcet-preview-live">Ao editar</span></div>
          <div className="grafcet-transition-map" aria-label="Resumo das ligações da transição">
            <span className="grafcet-map-label">ORIGENS · TODAS ATIVAS</span><div className="grafcet-map-steps">{from.length ? from.map((id, index) => <span key={`${id}:${index}`}>{labelOf(id)}</span>) : <em>Sem origem</em>}</div>
            <span className="grafcet-map-arrow"><IconArrowDown size={15} /></span>
            <div className="grafcet-map-transition"><strong>{name || `T${transitionIndex + 1}`}</strong><code>{displayDescription && description ? description : condition || 'Condição por definir'}</code><span className={validCondition(condition) ? 'is-valid' : 'is-incomplete'}>{validCondition(condition) ? <IconCheck size={11} /> : <IconWarning size={11} />}{validCondition(condition) ? 'Sintaxe válida' : 'Expressão incompleta'}</span></div>
            <span className="grafcet-map-arrow"><IconArrowDown size={15} /></span>
            <span className="grafcet-map-label">DESTINOS · ATIVADOS JUNTOS</span><div className="grafcet-map-steps">{to.length ? to.map((id, index) => <span key={`${id}:${index}`}>{labelOf(id)}</span>) : <em>Sem destino</em>}</div>
          </div>
          <p className="grafcet-property-note">Pré-visualização do rascunho. Guarde para aplicar.</p>
          {targetInfo && <div className="grafcet-property-preview-value"><span>Referência visual</span><span>{targetInfo}</span></div>}
        </aside>
      </div>
    </PropertyDialog>
  )
}
