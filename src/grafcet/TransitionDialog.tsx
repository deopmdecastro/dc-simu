import { useEffect, useMemo, useState } from 'react'
import {
  graphKey,
  stepNumberOf,
  stepReferenceText,
  stepStateReferences,
  validCondition,
  type GrafcetGraph,
  type GrafcetStep,
  type GrafcetTransition,
  type GrafcetTransitionComparison,
  type StepStateReference,
} from './engine'
import PropertyDialog from '../ui/PropertyDialog'
import Select from '../ui/Select'
import ConditionEditor from './ConditionEditor'
import type { GrafcetSignalSuggestion } from './signals'
import { foldText } from '../utils/text'
import { IconArrowDown, IconCheck, IconChevronRight, IconClose, IconCompare, IconEye, IconGrafcet, IconLink, IconPlus, IconSearch, IconStep, IconSwap, IconWarning } from '../ui/icons'
import '../styles/grafcet-dialog-ux.css'

interface TransitionDialogProps {
  open: boolean
  transition: GrafcetTransition | null
  transitionIndex?: number
  /** Todas as etapas do programa (rótulos, sugestões e referências a outros GRAFCETs). */
  availableSteps?: GrafcetStep[]
  /** Etapas que podem ser origem/destino: as da página desta transição. */
  linkableSteps?: GrafcetStep[]
  /** Páginas do programa como GRAFCETs numerados (G0, G1…). */
  graphs?: GrafcetGraph[]
  /** Página a que esta transição pertence: as suas origens e destinos são aqui. */
  graphNumber?: number
  signals?: GrafcetSignalSuggestion[]
  onSave: (patch: Partial<GrafcetTransition>) => void
  onClose: () => void
  onHelp?: () => void
}

/** Referência ao estado de uma etapa: `G0 <=> X9`, `G1 <> X11`, `X9`, `/X9`. */
type StateTerm = StepStateReference

export default function TransitionDialog({
  open,
  transition,
  transitionIndex = 0,
  availableSteps = [],
  linkableSteps,
  graphs,
  graphNumber = 0,
  signals = [],
  onSave,
  onClose,
}: TransitionDialogProps) {
  const [name, setName] = useState('')
  const [condition, setCondition] = useState('1')
  const [description, setDescription] = useState('')
  const [displayDescription, setDisplayDescription] = useState(false)
  const [targetInfo, setTargetInfo] = useState('')
  const [comparisons, setComparisons] = useState<GrafcetTransitionComparison[]>([])
  const [from, setFrom] = useState<string[]>([])
  const [to, setTo] = useState<string[]>([])
  const [wireless, setWireless] = useState(false)
  const [source, setSource] = useState(false)
  // Construtor de dependências de estado (mesmo GRAFCET ou outro).
  const [stateGraph, setStateGraph] = useState('G0')
  const [stateStep, setStateStep] = useState('')
  const [stateActive, setStateActive] = useState<'inactive' | 'active'>('active')
  const [stateOpen, setStateOpen] = useState(false)
  const [stateIndex, setStateIndex] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  // Seletor de etapas (um por lado): texto escrito, lista aberta e opção realçada.
  const [pickQuery, setPickQuery] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [pickOpen, setPickOpen] = useState<'from' | 'to' | null>(null)
  const [pickIndex, setPickIndex] = useState(0)
  const [quickMsg, setQuickMsg] = useState('')
  const [annotationsOpen, setAnnotationsOpen] = useState(false)
  const [comparisonsOpen, setComparisonsOpen] = useState(false)

  useEffect(() => {
    if (!transition) return
    setSubmitted(false)
    setPickQuery({ from: '', to: '' })
    setPickOpen(null)
    setName(transition.name ?? `T${transitionIndex + 1}`)
    setCondition(transition.condition ?? '1')
    setDescription(transition.description ?? transition.comment ?? '')
    setDisplayDescription(!!transition.displayDescription)
    setTargetInfo(transition.targetInfo ?? '')
    setComparisons((transition.comparisons ?? []).map((item) => ({ grafcet: item.grafcet ?? '', transition: item.transition ?? '', condition: item.condition ?? '', note: item.note ?? '' })))
    setFrom([...transition.from])
    setTo([...transition.to])
    setWireless(!!transition.wireless)
    setSource(!!transition.source && !transition.from.length)
    setStateGraph(graphKey(graphNumber))
    setStateStep('')
    setStateActive('active')
    setStateOpen(false)
    setQuickMsg('')
    setAnnotationsOpen(!!transition.description || !!transition.comment || !!transition.targetInfo || !!transition.displayDescription)
    setComparisonsOpen(!!transition.comparisons?.length)
  }, [transition, transitionIndex, open, graphNumber])

  // Páginas do programa: G0 é a primeira, G1, G2… as seguintes. Sem páginas, o programa é G0.
  const programGraphs = useMemo<GrafcetGraph[]>(() => (
    graphs?.length ? graphs : [{ number: 0, key: 'G0', label: 'Este GRAFCET', steps: availableSteps }]
  ), [graphs, availableSteps])
  const linkSteps = linkableSteps?.length ? linkableSteps : (programGraphs.find((graph) => graph.number === graphNumber)?.steps ?? availableSteps)

  if (!open || !transition) return null
  const conditionError = !validCondition(condition) ? 'Indique uma condição válida antes de guardar.' : ''
  const save = () => {
    setSubmitted(true)
    if (conditionError) { document.getElementById('trans-condition-input')?.focus(); return }
    onSave({ name: name.trim() || `T${transitionIndex + 1}`, condition: condition.trim(), description: description.trim(), comment: description.trim(), displayDescription, targetInfo: targetInfo.trim(), comparisons: comparisons.map((item) => ({ grafcet: item.grafcet.trim(), transition: item.transition.trim(), condition: item.condition?.trim(), note: item.note?.trim() })).filter((item) => item.grafcet || item.transition || item.condition || item.note), wireless, source: source && !from.length, from: [...from], to: [...to] })
    onClose()
  }
  /** Índice global de uma etapa (a base do número mostrado no diagrama e em X<n>). */
  const globalIndex = (id: string) => availableSteps.findIndex((step) => step.id === id)
  /** Número que o diagrama mostra (o mesmo de X<n> e do «Ligar nº»). */
  const numberOf = (step: GrafcetStep) => stepNumberOf(step, Math.max(0, globalIndex(step.id)))
  /** Rótulo curto: o nome só se junta quando acrescenta informação (evita «Etapa 0 · Etapa 0»). */
  const pointOf = (step: GrafcetStep): { number: string; name: string } => {
    const number = numberOf(step)
    const folded = foldText(step.name).replace(/\s+/g, ' ')
    const generic = folded === number || new RegExp(`^(?:etapa|step|e)\s*${number}$`).test(folded)
    return { number, name: generic || !step.name.trim() ? '' : step.name.trim() }
  }
  const labelOf = (id: string) => {
    const step = availableSteps.find((item) => item.id === id)
    if (!step) return 'Etapa indisponível · ligação preservada'
    const point = pointOf(step)
    return `Etapa ${point.number}${point.name ? ` · ${point.name}` : ''}`
  }
  const directCycle = from.filter((id) => to.includes(id))
  const updateComparison = (index: number, patch: Partial<GrafcetTransitionComparison>) => setComparisons((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const addComparison = () => {
    setComparisonsOpen(true)
    setComparisons((current) => [...current, { grafcet: '', transition: '', condition: '', note: '' }])
  }
  const removeComparison = (index: number) => setComparisons((current) => current.filter((_, itemIndex) => itemIndex !== index))
  const toggle = (side: 'from' | 'to', id: string) => {
    const update = (current: string[]) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    if (side === 'from') setFrom(update)
    else setTo(update)
  }
  /** Etapas que o seletor propõe para o texto escrito (número exato primeiro, depois número/nome que contém). */
  const pickOptions = (side: 'from' | 'to') => {
    const query = foldText(pickQuery[side].trim()).replace(/^x(?=\d)/, '')
    const all = linkSteps.map((step) => ({ step, point: pointOf(step) }))
    if (!query) return all
    const hits = all.filter(({ step, point }) => foldText(`${point.number} etapa ${point.number} ${step.name} ${step.description ?? ''} ${step.comment ?? ''}`).includes(query))
    return [...hits.filter(({ point }) => foldText(point.number) === query), ...hits.filter(({ point }) => foldText(point.number) !== query)]
  }
  /** Junta (ou retira) uma etapa ao lado indicado, com uma mensagem curta. */
  const pickStep = (side: 'from' | 'to', id: string) => {
    const ids = side === 'from' ? from : to
    const label = labelOf(id)
    toggle(side, id)
    if (side === 'from' && !ids.includes(id)) setSource(false)
    setQuickMsg(`${label} ${ids.includes(id) ? 'retirada' : 'juntada'} ${side === 'from' ? 'às origens' : 'aos destinos'} — guarde para aplicar.`)
    setPickQuery((current) => ({ ...current, [side]: '' }))
    setPickIndex(0)
  }
  /** Enter no seletor: número exato ou a opção realçada. */
  const pickFromKeyboard = (side: 'from' | 'to') => {
    const options = pickOptions(side)
    if (pickQuery[side].trim() && !options.length) { setQuickMsg(`Não existe a etapa «${pickQuery[side].trim()}» nesta página do GRAFCET.`); return }
    const choice = options[Math.min(pickIndex, options.length - 1)]
    if (choice) pickStep(side, choice.step.id)
  }

  /* ── Dependências do estado de etapas ─────────────────────────────────────
     A leitura da expressão é a mesma do motor (`stepStateReferences`), por isso
     cada termo escrito à mão aparece aqui e pode ser alterado sem reescrever. */
  const stateTerms: StateTerm[] = stepStateReferences(condition)
  const graphOfTerm = (term: StateTerm) => programGraphs.find((graph) => graph.key === graphKey(term.graph === null ? 0 : Number(term.graph)))
  const stepOfTerm = (term: StateTerm) => graphOfTerm(term)?.steps.find((step) => numberOf(step) === term.step)
  const stepIdByNumber = (number: string) => availableSteps.find((step) => numberOf(step) === number)?.id
  const stepExists = (number: string) => !!stepIdByNumber(number)
  const stepLabelByNumber = (number: string) => { const id = stepIdByNumber(number); return id ? labelOf(id) : `Etapa ${number}` }
  const selectedGraph = programGraphs.find((graph) => graph.key === stateGraph) ?? programGraphs[0]
  const selectedGraphSteps = selectedGraph?.steps ?? []
  const stateNumber = foldText(stateStep.trim()).replace(/^x/, '')
  const stateStepChoices = (() => {
    const query = foldText(stateStep.trim()).replace(/^x(?=\d)/, '')
    const all = selectedGraphSteps.map((step) => ({ step, point: pointOf(step) }))
    if (!query) return all
    const hits = all.filter(({ step, point }) => foldText(`${point.number} etapa ${point.number} ${step.name} ${step.description ?? ''} ${step.comment ?? ''}`).includes(query))
    return [...hits.filter(({ point }) => foldText(point.number) === query), ...hits.filter(({ point }) => foldText(point.number) !== query)]
  })()
  const stateChoice = stateStep.trim() ? stateStepChoices[Math.min(stateIndex, Math.max(0, stateStepChoices.length - 1))] : undefined
  const otherGraphCount = programGraphs.filter((graph) => graph.number !== 0 && graph.steps.length).length
  /** Junta «G1 <=> X11» à condição com E (os OU existentes ficam entre parênteses). */
  const addStateTerm = () => {
    const number = (stateChoice?.step ? numberOf(stateChoice.step) : stateNumber) || stateNumber
    if (!/^[0-9]+[a-zA-Z]?$/.test(number)) { setQuickMsg('Indique o número da etapa (ex.: 9).'); return }
    const term = stepReferenceText(String(selectedGraph?.number ?? 0), number, stateActive === 'active')
    const current = condition.trim()
    const next = !current || current === '1' ? term : `${/\+|\bOR\b/i.test(current) ? `(${current})` : current} * ${term}`
    setCondition(next)
    setStateStep('')
    setStateOpen(false)
    const where = (selectedGraph?.number ?? 0) === 0 ? 'neste GRAFCET' : `na página ${selectedGraph?.label ?? stateGraph}`
    const missing = !(selectedGraph?.steps ?? []).some((step) => numberOf(step) === number)
    setQuickMsg(`${term} junto à condição — ${missing ? `atenção: não existe a Etapa ${number} ${where}` : `Etapa ${number} ${where}`}. Guarde para aplicar.`)
  }
  /** Retira um termo de estado e o operador E que o ligava. */
  const withoutTerm = (term: StateTerm) => {
    const before = condition.slice(0, term.at)
    const after = condition.slice(term.at + term.text.length)
    let next: string
    if (/\*\s*$/.test(before)) next = before.replace(/\s*\*\s*$/, '') + after
    else if (/^\s*\*/.test(after)) next = before + after.replace(/^\s*\*\s*/, '')
    else next = before + after
    return next.trim().replace(/^\((.*)\)$/, (whole, inner: string) => (/[()]/.test(inner) ? whole : inner)) || '1'
  }
  const removeStateTerm = (term: StateTerm) => {
    setCondition(withoutTerm(term))
    setQuickMsg(`${term.text.trim()} retirado da condição — guarde para aplicar.`)
  }
  /** Troca ativa/inativa, escrevendo a forma explícita G0 <=> Xn / G0 <> Xn. */
  const setTermState = (term: StateTerm, active: boolean) => {
    if (term.active === active && !term.implicit) return
    setCondition(condition.slice(0, term.at) + stepReferenceText(term.graph ?? 0, term.step, active) + condition.slice(term.at + term.text.length))
  }
  /** A etapa consultada passa a origem: sai da condição e entra nas origens (será desativada ao disparar). */
  const promoteTerm = (term: StateTerm) => {
    const id = stepIdByNumber(term.step)
    if (!id || !linkSteps.some((step) => step.id === id)) return
    setCondition(withoutTerm(term))
    if (!from.includes(id)) setFrom((current) => [...current, id])
    setSource(false)
    setQuickMsg(`${labelOf(id)} passou a origem: será desativada quando a transição disparar — guarde para aplicar.`)
  }
  const renderConnections = (side: 'from' | 'to', ids: string[]) => {
    const isFrom = side === 'from'
    const listId = `trans-pick-${side}`
    const options = pickOpen === side ? pickOptions(side) : []
    const active = Math.min(pickIndex, Math.max(options.length - 1, 0))
    const sourceMode = isFrom && source && !ids.length
    const missing = new Set(ids.filter((id) => !availableSteps.some((step) => step.id === id)))
    return (
    <fieldset className={`grafcet-link-side is-${side}`} aria-label={isFrom ? 'Origens' : 'Destinos'}>
      <legend><b>{isFrom ? 'Origens' : 'Destinos'}</b><small>{isFrom ? 'têm de estar todas ativas' : 'são ativados juntos'}</small><span className="grafcet-link-count">{ids.length}</span></legend>
      <div className="grafcet-link-chips" data-property-save-ignore aria-label={isFrom ? 'Etapas de origem' : 'Etapas de destino'}>
        {ids.map((id, index) => <span key={`${id}:${index}`} className={`grafcet-link-chip${missing.has(id) ? ' is-missing' : ''}`}>{labelOf(id)}<button type="button" onClick={() => pickStep(side, id)} aria-label={`Retirar ${labelOf(id)}`} title="Retirar">×</button></span>)}
        {sourceMode && <span className="grafcet-link-chip is-source">Transição-fonte · sempre validada<button type="button" onClick={() => setSource(false)} aria-label="Deixar de ser transição-fonte" title="Desfazer">×</button></span>}
        {!ids.length && !sourceMode && <span className="grafcet-link-empty">{isFrom ? 'Sem origem' : 'Sem destino'}</span>}
      </div>
      {!sourceMode && <div className="grafcet-link-picker" data-property-save-ignore>
        <IconSearch size={12} />
        <input
          className="dc-input" role="combobox" aria-expanded={pickOpen === side} aria-controls={listId} aria-autocomplete="list"
          aria-label={isFrom ? 'Adicionar etapa de origem' : 'Adicionar etapa de destino'}
          aria-activedescendant={pickOpen === side && options.length ? `${listId}-${active}` : undefined}
          placeholder="Adicionar etapa desta página — nº ou nome" value={pickQuery[side]}
          onFocus={() => { setPickOpen(side); setPickIndex(0) }}
          onBlur={() => window.setTimeout(() => setPickOpen((current) => (current === side ? null : current)), 120)}
          onChange={(event) => { const value = event.target.value; setPickQuery((current) => ({ ...current, [side]: value })); setPickOpen(side); setPickIndex(0) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); pickFromKeyboard(side) }
            else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setPickOpen(side)
              const count = pickOptions(side).length
              setPickIndex((value) => (count ? (value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count : 0))
            } else if (event.key === 'Escape' && pickOpen === side) { event.preventDefault(); event.stopPropagation(); setPickOpen(null) }
          }}
        />
        {pickOpen === side && <ul id={listId} className="grafcet-link-options" role="listbox" aria-multiselectable="true" aria-label={isFrom ? 'Etapas para as origens' : 'Etapas para os destinos'}>
          {options.map(({ step, point }, index) => {
            const chosen = ids.includes(step.id)
            const elsewhere = (isFrom ? to : from).includes(step.id)
            return <li key={step.id} id={`${listId}-${index}`} role="option" aria-selected={chosen} className={`${chosen ? 'is-chosen' : ''}${index === active ? ' is-active' : ''}`}
              onMouseDown={(event) => { event.preventDefault(); pickStep(side, step.id) }} onMouseEnter={() => setPickIndex(index)}>
              <span className="grafcet-link-option-check" aria-hidden="true">{chosen ? <IconCheck size={11} /> : null}</span>
              <span className="grafcet-link-option-text"><b>Etapa {point.number}</b>{point.name && <span> · {point.name}</span>}{(step.description || step.comment) && <small>{step.description || step.comment}</small>}</span>
              {elsewhere && <em>{isFrom ? 'é destino' : 'é origem'}</em>}
            </li>
          })}
          {!options.length && <li className="is-empty" aria-disabled="true">{linkSteps.length ? 'Nenhuma etapa corresponde.' : 'Ainda não existem etapas nesta página.'}</li>}
        </ul>}
      </div>}
      {isFrom && !ids.length && !source && <button type="button" className="grafcet-link-source-offer" onClick={() => setSource(true)}>Sem origem de propósito? <b>Usar como transição-fonte</b></button>}
      {sourceMode && <p className="grafcet-property-note">Dispara em qualquer situação quando a condição é verdadeira (ex.: emergência). Para a limitar, use «Depende do estado de outras etapas» abaixo.</p>}
    </fieldset>
  )}
  const stateCount = stateTerms.length
  const externalCount = stateTerms.filter((term) => (term.graph !== null && Number(term.graph) !== 0) || (graphOfTerm(term)?.number ?? 0) !== 0).length
  return (
    <PropertyDialog open={open} id="trans-dialog" className="grafcet-compact-dialog grafcet-transition-dialog" title="Propriedades da transição" subtitle="Receptividade, ligações e dependências de etapas deste ou de outro GRAFCET." onSave={save} onClose={onClose}>
      <div className="grafcet-property-grid">
        <section className="grafcet-property-fields" aria-label="Definições da transição">
          <div className="grafcet-transition-identity">
            <div className="grafcet-property-field grafcet-transition-name"><label htmlFor="trans-name-input">Nome</label><input id="trans-name-input" className="dc-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={`T${transitionIndex + 1}`} /></div>
            <div className="grafcet-transition-condition">
              <ConditionEditor id="trans-condition-input" value={condition} onChange={setCondition} signals={signals} availableSteps={availableSteps} resetKey={`${transition.id}:${open}`} initialDefaultOne={(transition.condition ?? '1') === '1'} initialFocus error={submitted ? conditionError : undefined} />
            </div>
          </div>
          <section className="grafcet-transition-connections" aria-label="Ligações da transição">
            <div className="grafcet-connections-heading"><h3><IconLink size={13} /> Ligações <span className="grafcet-connections-graph">{graphKey(graphNumber)}</span></h3><p>Com <b>todas as origens</b> ativas e a condição verdadeira, ativa <b>todos os destinos</b>.</p></div>
            <div className="grafcet-link-flow">{renderConnections('from', from)}<span className="grafcet-link-flow-arrow" aria-hidden="true"><IconArrowDown size={14} /></span>{renderConnections('to', to)}</div>
            <div className="grafcet-link-options-row">
              <label className="grafcet-property-checkbox"><input type="checkbox" checked={wireless} onChange={(event) => setWireless(event.target.checked)} /><span>Ligação por referência <small>sem linha; mostra o nº da etapa nas pontas</small></span></label>
              <button type="button" className="dc-btn grafcet-connections-swap" onClick={() => { setFrom([...to]); setTo([...from]); setSource(false) }} disabled={!from.length && !to.length} title="Troca origens e destinos"><IconSwap size={12} /> Inverter</button>
            </div>
          </section>

          <section className="grafcet-state-conditions" data-property-save-ignore role="group" aria-label="Dependências do estado de etapas">
            <div className="grafcet-connections-heading">
              <h3><IconEye size={13} /> Depende do estado de etapas {stateCount ? <span className="grafcet-link-count">{stateCount}</span> : <span className="grafcet-optional">opcional</span>}</h3>
              <p>Consulta etapas <b>deste</b> ou de <b>outro GRAFCET</b> sem as desativar.</p>
            </div>
            {!!stateCount && <ul className="grafcet-state-list" aria-label="Dependências de estado na receptividade">
              {stateTerms.map((term, index) => {
                const graph = graphOfTerm(term)
                const step = stepOfTerm(term)
                const isOther = !!graph && graph.number !== 0
                const id = step?.id
                const canPromote = !!id && term.active && !from.includes(id) && linkSteps.some((item) => item.id === id)
                return <li key={`${term.at}:${index}`} className={`grafcet-state-item${term.active ? ' is-active' : ''}${step ? '' : ' is-missing'}${isOther ? ' is-external' : ''}`}>
                  <span className={`grafcet-state-scope${isOther ? ' is-external' : ''}`} title={graph ? `${graph.key} · ${graph.label}` : undefined}>{graph ? graph.key : 'G0'}{isOther && <small>outro GRAFCET</small>}</span>
                  <span className="grafcet-state-item-text">
                    <b>{step ? labelOf(step.id) : `Etapa ${term.step}`}</b>
                    <span> tem de estar <b>{term.active ? 'ativa' : 'inativa'}</b></span>
                    <code title={term.implicit ? `${term.text.trim()} é lido como ${stepReferenceText(term.graph ?? 0, term.step, term.active)}` : undefined}>{term.text.trim()}</code>
                    {!step && <small>não existe {isOther && graph ? `na página ${graph.label}` : 'neste GRAFCET'}</small>}
                    {!!id && !isOther && from.includes(id) && <small>também é origem — redundante</small>}
                  </span>
                  <span className="grafcet-state-toggle" role="radiogroup" aria-label={`Estado exigido para ${graph ? graph.key : 'G0'} X${term.step}`}>
                    <button type="button" role="radio" aria-checked={term.active} className={term.active ? 'is-on' : ''} onClick={() => setTermState(term, true)}>ativa</button>
                    <button type="button" role="radio" aria-checked={!term.active} className={!term.active ? 'is-on' : ''} onClick={() => setTermState(term, false)}>inativa</button>
                  </span>
                  {canPromote && <button type="button" className="dc-btn grafcet-state-promote" onClick={() => promoteTerm(term)} title="Passa esta etapa a origem: fica desativada quando a transição disparar">Usar como origem</button>}
                  <button type="button" className="grafcet-state-remove" onClick={() => removeStateTerm(term)} aria-label={`Retirar ${term.text.trim()} da condição`} title="Retirar da condição"><IconClose size={12} /></button>
                </li>
              })}
            </ul>}
            <div className="grafcet-state-builder">
              <div className="grafcet-state-builder-row">
                <span className="grafcet-state-sentence"><IconStep size={12} /> Etapa</span>
                <Select className="grafcet-state-graph" value={stateGraph} onChange={(event) => { setStateGraph(event.target.value); setStateStep(''); setStateIndex(0) }} aria-label="GRAFCET da etapa consultada">
                  {programGraphs.map((graph) => <option key={graph.key} value={graph.key}>{graph.key} · {graph.number === graphNumber ? 'este' : graph.label}</option>)}
                </Select>
                <div className="grafcet-state-step-picker">
                  <IconSearch size={12} />
                  <input
                    className="dc-input" role="combobox" aria-expanded={stateOpen} aria-controls="trans-state-choices" aria-autocomplete="list"
                    aria-activedescendant={stateOpen && stateStepChoices.length ? `trans-state-choices-${Math.min(stateIndex, stateStepChoices.length - 1)}` : undefined}
                    placeholder="nº/nome" value={stateStep} aria-label="Etapa a consultar"
                    onFocus={() => { setStateOpen(true); setStateIndex(0) }}
                    onBlur={() => window.setTimeout(() => setStateOpen(false), 120)}
                    onChange={(event) => { setStateStep(event.target.value); setStateOpen(true); setStateIndex(0) }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); const current = ((stateOpen) && stateStepChoices.length) ? stateStepChoices[Math.min(stateIndex, stateStepChoices.length - 1)].step : null; if (current) setStateStep(numberOf(current)); else addStateTerm() }
                      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault()
                        setStateOpen(true)
                        const count = stateStepChoices.length
                        setStateIndex((value) => (count ? (value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count : 0))
                      } else if (event.key === 'Escape' && stateOpen) { event.preventDefault(); event.stopPropagation(); setStateOpen(false) }
                    }}
                  />
                  {stateOpen && <ul id="trans-state-choices" className="grafcet-link-options" role="listbox" aria-label="Etapas do GRAFCET escolhido">
                    {stateStepChoices.map(({ step, point }, index) => <li key={step.id} id={`trans-state-choices-${index}`} role="option" aria-selected={foldText(numberOf(step)) === foldText(stateStep)} className={index === Math.min(stateIndex, Math.max(0, stateStepChoices.length - 1)) ? 'is-active' : ''}
                      onMouseDown={(event) => { event.preventDefault(); setStateStep(point.number); setStateOpen(false) }} onMouseEnter={() => setStateIndex(index)}>
                      <span className="grafcet-link-option-text"><b>Etapa {point.number}</b>{point.name && <span> · {point.name}</span>}{(step.description || step.comment) && <small>{step.description || step.comment}</small>}</span>
                      {step.initial && <em>inicial</em>}
                    </li>)}
                    {!stateStepChoices.length && <li className="is-empty" aria-disabled="true">{selectedGraphSteps.length ? 'Nenhuma etapa corresponde.' : 'Esta página ainda não tem etapas.'}</li>}
                  </ul>}
                </div>
                <div className="grafcet-state-toggle" role="radiogroup" aria-label="Estado da etapa consultada">
                  <button type="button" role="radio" aria-checked={stateActive === 'active'} className={stateActive === 'active' ? 'is-on' : ''} onClick={() => setStateActive('active')} title="Insere G0 <=> Xn: a etapa deve estar ativa">ativa</button>
                  <button type="button" role="radio" aria-checked={stateActive === 'inactive'} className={stateActive === 'inactive' ? 'is-on' : ''} onClick={() => setStateActive('inactive')} title="Insere G0 <> Xn: a etapa deve estar inativa">inativa</button>
                </div>
                <button type="button" className="dc-btn grafcet-state-add" onClick={addStateTerm} disabled={!stateStep.trim() && !stateNumber} aria-label="Adicionar à condição" title="Acrescenta a etapa e o estado à condição, com E"><IconPlus size={12} /> Adicionar</button>
              </div>
              <p className="grafcet-property-note grafcet-state-builder-note">
                Acrescenta <code>{`* ${stepReferenceText(selectedGraph?.number ?? 0, stateNumber || (stateChoice ? numberOf(stateChoice.step) : 'n'), stateActive === 'active')}`}</code>
                {stateChoice && <span> — {pointOf(stateChoice.step).name || `Etapa ${pointOf(stateChoice.step).number}`}</span>}
                {(selectedGraph?.number ?? 0) !== 0 && <span> · <b>outro GRAFCET</b></span>}
                {!otherGraphCount && <span> · só existe este GRAFCET (use «Nova página» para ter um G1)</span>}
              </p>
            </div>
          </section>
          {quickMsg && <p className="grafcet-property-note grafcet-transition-status" role="status">{quickMsg}</p>}
          {!!directCycle.length && <p className="grafcet-property-warning" role="status">Ciclo direto: {directCycle.map((id) => labelOf(id)).join(', ')} {directCycle.length === 1 ? 'é origem e destino' : 'são origem e destino'} ao mesmo tempo — enquanto a condição for verdadeira a transição dispara continuamente, sem esperar noutra etapa.</p>}
          {((!from.length && !source) || !to.length) && <p className="grafcet-property-warning" role="status">{source && !from.length ? 'Transição-fonte sem destino: escolha a etapa a ativar.' : <>Transição solta: faltam {(!from.length && !to.length) ? 'origens e destinos' : !from.length ? 'origens' : 'destinos'}. Use «Adicionar etapa», marque «Usar como transição-fonte» se não tiver origem de propósito, ou guarde o rascunho e complete depois.</>}{!from.length && !source && stateTerms.some((term) => term.active && stepExists(term.step)) && <> A condição consulta {stateTerms.filter((term) => term.active && stepExists(term.step)).map((term) => `X${term.step}`).join(', ')}: se essa etapa deve ser desativada ao disparar, use «Usar como origem».</>}</p>}

          <details className="grafcet-transition-comparisons" open={comparisonsOpen} onToggle={(event) => setComparisonsOpen(event.currentTarget.open)}>
            <summary><IconCompare size={13} /> Equivalências documentais <span className="grafcet-optional">{comparisons.length ? `${comparisons.length} registada${comparisons.length === 1 ? '' : 's'}` : 'nenhuma'}</span><IconChevronRight size={11} /></summary>
            <div className="grafcet-transition-comparisons-body">
              <p className="grafcet-property-note">Para revisão e rastreabilidade: a mesma transição em <b>outros GRAFCETs</b>. Não altera a simulação deste.</p>
              {comparisons.map((item, index) => (
                <div className="grafcet-comparison-card" key={index}>
                  <div className="grafcet-comparison-head"><span>Equivalência {index + 1}</span><button type="button" className="grafcet-comparison-remove" onClick={() => removeComparison(index)} aria-label={`Remover equivalência ${index + 1}`} title="Remover"><IconClose size={12} /></button></div>
                  <div className="grafcet-comparison-grid">
                    <label className="grafcet-comparison-field"><span>GRAFCET</span><input className="dc-input" value={item.grafcet} onChange={(event) => updateComparison(index, { grafcet: event.target.value })} placeholder="Ex.: GRAFCET de segurança" /></label>
                    <label className="grafcet-comparison-field"><span>Transição</span><input className="dc-input" value={item.transition} onChange={(event) => updateComparison(index, { transition: event.target.value })} placeholder="Ex.: T12" /></label>
                    <label className="grafcet-comparison-field"><span>Condição equivalente</span><input className="dc-input grafcet-code-input" value={item.condition ?? ''} onChange={(event) => updateComparison(index, { condition: event.target.value })} placeholder="Ex.: /Emerg_NF * X4" /></label>
                    <label className="grafcet-comparison-field"><span>Nota</span><input className="dc-input" value={item.note ?? ''} onChange={(event) => updateComparison(index, { note: event.target.value })} placeholder="Diferença ou observação" /></label>
                  </div>
                </div>
              ))}
              {!comparisons.length && <button type="button" className="grafcet-comparison-empty" onClick={addComparison}><IconPlus size={12} /> Registar a primeira equivalência</button>}
              {!!comparisons.length && <button type="button" className="dc-btn grafcet-comparison-add" onClick={addComparison}><IconPlus size={12} /> Adicionar equivalência</button>}
            </div>
          </details>

          <details className="grafcet-context-help grafcet-dialog-annotations" open={annotationsOpen} onToggle={(event) => setAnnotationsOpen(event.currentTarget.open)}><summary><IconChevronRight size={11} />Descrição e referência visual <span>opcional</span></summary><div>
            <div className="grafcet-property-field"><label htmlFor="trans-desc-input">Descrição</label><textarea id="trans-desc-input" className="dc-input" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Cilindro A no fim de curso" /><label className="grafcet-property-checkbox"><input type="checkbox" checked={displayDescription} onChange={(event) => setDisplayDescription(event.target.checked)} /><span>Mostrar a descrição em vez da expressão no diagrama</span></label></div>
            <div className="grafcet-property-field"><label htmlFor="trans-reference-input">Referência visual</label><input id="trans-reference-input" className="dc-input" value={targetInfo} onChange={(event) => setTargetInfo(event.target.value)} placeholder="Ex.: Continuação na folha 2" /><p className="grafcet-property-note">Anotação do diagrama. Os destinos são definidos nas ligações acima.</p></div>
          </div></details>
          <details className="grafcet-context-help grafcet-inline-disclosure"><summary><IconChevronRight size={11} />Ajuda sobre transições</summary><div><p>A condição é uma expressão booleana: <code>I1 * /I2</code> exige I1 ativa e I2 inativa. Use AND (*), OR (+), NOT (/), flancos e parênteses.</p><p><code>X10</code> consulta a etapa com o número 10 no diagrama. <code>T(2s)</code> verifica dois segundos de atividade das origens.</p><p><b>Etapas de outro GRAFCET:</b> <code>G1 &lt;=&gt; X11</code> exige a etapa 11 da página G1 ativa; <code>G1 &lt;&gt; X11</code> exige-a inativa. G0 é a primeira página (este GRAFCET quando só há uma), G1 a segunda, e assim por diante. As páginas correm em simultâneo e partilham sinais, por isso a dependência entre elas é avaliada no mesmo ciclo.</p><p>Várias origens sincronizam ramos: todas precisam de estar ativas. Com a condição verdadeira, a transição ativa todos os destinos (AND). Pode guardar uma transição solta e completá-la no diagrama.</p><p>Uma <b>transição-fonte</b> não tem etapa de origem: está sempre validada e dispara quando a condição é verdadeira. Para consultar outras etapas sem as desativar, use «Depende do estado de etapas».</p></div></details>
        </section>
        <aside className="grafcet-property-preview">
          <div className="grafcet-property-preview-label"><span>Pré-visualização</span><span className="grafcet-preview-live">Ao editar</span></div>
          <div className="grafcet-transition-map" aria-label="Resumo das ligações da transição">
            <span className="grafcet-map-label">ORIGENS · TODAS ATIVAS</span><div className="grafcet-map-steps">{from.length ? from.map((id, index) => <span key={`${id}:${index}`}>{labelOf(id)}</span>) : source ? <span className="is-source">Transição-fonte · sempre validada</span> : <em>Sem origem</em>}</div>
            {!!stateCount && <><span className="grafcet-map-label">SE · ETAPAS CONSULTADAS</span><div className="grafcet-map-steps">{stateTerms.map((term, index) => {
              const graph = graphOfTerm(term)
              const isOther = !!graph && graph.number !== 0
              return <span key={`s:${term.at}:${index}`} className={`is-state${isOther ? ' is-external' : ''}`}>{isOther ? `${graph!.key} · ` : ''}X{term.step} {term.active ? 'ativa' : 'inativa'}</span>
            })}</div></>}
            <span className="grafcet-map-arrow"><IconArrowDown size={15} /></span>
            <div className="grafcet-map-transition"><strong>{name || `T${transitionIndex + 1}`}</strong><code>{displayDescription && description ? description : condition || 'Condição por definir'}</code><span className={validCondition(condition) ? 'is-valid' : 'is-incomplete'}>{validCondition(condition) ? <IconCheck size={11} /> : <IconWarning size={11} />}{validCondition(condition) ? 'Sintaxe válida' : 'Expressão incompleta'}</span></div>
            <span className="grafcet-map-arrow"><IconArrowDown size={15} /></span>
            <span className="grafcet-map-label">DESTINOS · ATIVADOS JUNTOS</span><div className="grafcet-map-steps">{to.length ? to.map((id, index) => <span key={`${id}:${index}`}>{labelOf(id)}</span>) : <em>Sem destino</em>}</div>
          </div>
          <p className="grafcet-property-note">Pré-visualização do rascunho. Guarde para aplicar.</p>
          {externalCount > 0 && <p className="grafcet-preview-external" role="status"><IconGrafcet size={12} /> {externalCount === 1 ? '1 dependência' : `${externalCount} dependências`} de outro GRAFCET{externalCount === 1 ? '' : 's'}.</p>}
          {!!comparisons.length && <p className="grafcet-preview-external is-doc" role="status"><IconCompare size={12} /> {comparisons.length} equivalência{comparisons.length === 1 ? '' : 's'} documental{comparisons.length === 1 ? '' : 'is'}.</p>}
          {targetInfo && <div className="grafcet-property-preview-value"><span>Referência visual</span><span>{targetInfo}</span></div>}
        </aside>
      </div>
    </PropertyDialog>
  )
}
