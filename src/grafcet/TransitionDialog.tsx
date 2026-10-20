import { useEffect, useState } from 'react'
import { validCondition, type GrafcetTransition, type GrafcetStep } from './engine'
import PropertyDialog from '../ui/PropertyDialog'
import ConditionEditor from './ConditionEditor'
import type { GrafcetSignalSuggestion } from './signals'

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
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!transition) return
    setSubmitted(false)
    setName(transition.name ?? `T${transitionIndex + 1}`)
    setCondition(transition.condition ?? '1')
    setDescription(transition.description ?? transition.comment ?? '')
    setDisplayDescription(!!transition.displayDescription)
    setTargetInfo(transition.targetInfo ?? '')
    setFrom([...transition.from])
    setTo([...transition.to])
  }, [transition, transitionIndex, open])

  if (!open || !transition) return null
  const conditionError = !validCondition(condition) ? 'Indique uma condição válida antes de guardar.' : ''
  const save = () => {
    setSubmitted(true)
    if (conditionError) { document.getElementById('trans-condition-input')?.focus(); return }
    onSave({ name: name.trim() || `T${transitionIndex + 1}`, condition: condition.trim(), description: description.trim(), comment: description.trim(), displayDescription, targetInfo: targetInfo.trim(), from: [...from], to: [...to] })
    onClose()
  }
  const labelOf = (id: string) => {
    const index = availableSteps.findIndex((step) => step.id === id)
    return index < 0 ? 'Etapa indisponível · ligação guardada' : `Etapa ${index} · ${availableSteps[index].name || index}`
  }
  const toggle = (side: 'from' | 'to', id: string) => {
    const update = (current: string[]) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    if (side === 'from') setFrom(update)
    else setTo(update)
  }
  const renderConnections = (side: 'from' | 'to', ids: string[]) => (
    <fieldset className="grafcet-property-section grafcet-connection-selector" aria-label={side === 'from' ? 'Origens · todas ativas' : 'Destinos · ativados juntos'}>
      <legend>{side === 'from' ? 'Origens · todas ativas' : 'Destinos · ativados juntos'} <span>{ids.length}</span></legend>
      <div className="grafcet-connection-options">
        {availableSteps.map((step, index) => <label key={step.id} className={ids.includes(step.id) ? 'is-selected' : ''}><input type="checkbox" checked={ids.includes(step.id)} onChange={() => toggle(side, step.id)} /><span><b>Etapa {index}</b><small>{step.name || String(index)}</small></span></label>)}
        {[...new Set(ids.filter((id) => !availableSteps.some((step) => step.id === id)))].map((id, index) => <label key={id} className="is-selected is-unresolved"><input type="checkbox" checked onChange={() => toggle(side, id)} /><span><b>Etapa indisponível {index + 1}</b><small>Ligação preservada. Desmarque apenas para a remover.</small></span></label>)}
        {!availableSteps.length && !ids.length && <p className="grafcet-property-note">Ainda não existem etapas para ligar.</p>}
      </div>
    </fieldset>
  )
  return (
    <PropertyDialog open={open} id="trans-dialog" title="Propriedades da transição" subtitle="Ligue as etapas e defina a condição que permite avançar." onSave={save} onClose={onClose}>
      <div className="grafcet-property-grid">
        <section className="grafcet-property-fields" aria-label="Definições da transição">
          <div className="grafcet-property-field"><label htmlFor="trans-name-input">Nome <span className="grafcet-optional">opcional</span></label><input id="trans-name-input" className="dc-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={`T${transitionIndex + 1}`} /></div>
          <ConditionEditor id="trans-condition-input" value={condition} onChange={setCondition} signals={signals} availableSteps={availableSteps} resetKey={`${transition.id}:${open}`} initialDefaultOne={(transition.condition ?? '1') === '1'} initialFocus error={submitted ? conditionError : undefined} />
          <div className="grafcet-connection-editors">{renderConnections('from', from)}{renderConnections('to', to)}</div>
          <p className="grafcet-property-note">A transição exige todas as origens ativas e a condição verdadeira. Ao disparar, desativa as origens e ativa todos os destinos (AND).</p>
          {(!from.length || !to.length) && <p className="grafcet-property-warning" role="status">Transição solta: faltam {(!from.length && !to.length) ? 'origens e destinos' : !from.length ? 'origens' : 'destinos'}. Pode guardar o rascunho e completar as ligações depois.</p>}
          <div className="grafcet-property-field"><label htmlFor="trans-desc-input">Descrição <span className="grafcet-optional">opcional</span></label><textarea id="trans-desc-input" className="dc-input" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Cilindro A no fim de curso" /><label className="grafcet-property-checkbox"><input type="checkbox" checked={displayDescription} onChange={(event) => setDisplayDescription(event.target.checked)} /><span>Mostrar a descrição em vez da expressão no diagrama</span></label></div>
          <div className="grafcet-property-field"><label htmlFor="trans-reference-input">Referência visual <span className="grafcet-optional">opcional</span></label><input id="trans-reference-input" className="dc-input" value={targetInfo} onChange={(event) => setTargetInfo(event.target.value)} placeholder="Ex.: Continuação na folha 2" /><p className="grafcet-property-note">Anotação do diagrama. Não cria um salto nem altera os destinos acima.</p></div>
          <details className="grafcet-context-help"><summary>Como configurar esta transição</summary><div><p>A condição é uma expressão booleana: <code>I1 * /I2</code> exige I1 ativa e I2 inativa. Use AND (*), OR (+), NOT (/), flancos e parênteses.</p><p><code>X0</code> consulta a primeira etapa da lista global, independentemente do nome. <code>T(2s)</code> verifica dois segundos de atividade das origens desta transição.</p><p>Selecione várias origens para sincronizar ramos. Todas são necessárias; a seleção não cria uma alternativa OR. Desmarcar todas as ligações mantém uma transição solta.</p></div></details>
        </section>
        <aside className="grafcet-property-preview">
          <div className="grafcet-property-preview-label"><span>Ligações reais</span><span>IEC 60848</span></div>
          <div className="grafcet-transition-map" aria-label="Resumo das ligações da transição">
            <span className="grafcet-map-label">ORIGENS · TODAS ATIVAS</span><div className="grafcet-map-steps">{from.length ? from.map((id, index) => <span key={`${id}:${index}`}>{labelOf(id)}</span>) : <em>Sem origem</em>}</div>
            <span className="grafcet-map-arrow" aria-hidden="true">↓</span>
            <div className="grafcet-map-transition"><strong>{name || `T${transitionIndex + 1}`}</strong><code>{displayDescription && description ? description : condition || 'Condição por definir'}</code><span className={validCondition(condition) ? 'is-valid' : 'is-incomplete'}>{validCondition(condition) ? 'Sintaxe válida' : 'Expressão incompleta'}</span></div>
            <span className="grafcet-map-arrow" aria-hidden="true">↓</span>
            <span className="grafcet-map-label">DESTINOS · ATIVADOS JUNTOS</span><div className="grafcet-map-steps">{to.length ? to.map((id, index) => <span key={`${id}:${index}`}>{labelOf(id)}</span>) : <em>Sem destino</em>}</div>
          </div>
          <p className="grafcet-property-note">Esquema das ligações guardadas. A pré-visualização não executa a simulação.</p>
          {targetInfo && <div className="grafcet-property-preview-value"><span>Referência visual</span><span>{targetInfo}</span></div>}
        </aside>
      </div>
    </PropertyDialog>
  )
}
