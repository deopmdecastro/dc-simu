import { useState, useEffect } from 'react'
import { ACTION_KINDS, validGrafcetVariable, validCondition, type GrafcetAction, type GrafcetActionKind, type GrafcetActionAllocation, type GrafcetStep } from './engine'
import PropertyDialog from '../ui/PropertyDialog'
import ConditionEditor from './ConditionEditor'
import SignalPicker from './SignalPicker'
import { canonicalSignalAddress, type GrafcetSignalSuggestion } from './signals'

interface ActionDialogProps {
  open: boolean
  action: GrafcetAction | null
  signals?: GrafcetSignalSuggestion[]
  availableSteps?: GrafcetStep[]
  onSave: (patch: Partial<GrafcetAction>) => void
  onClose: () => void
  onHelp?: () => void
}

type AssignationType = 'simple' | 'conditional'

export default function ActionDialog({ open, action, signals = [], availableSteps = [], onSave, onClose }: ActionDialogProps) {
  const [assignation, setAssignation] = useState<AssignationType>('simple')
  const [allocation, setAllocation] = useState<GrafcetActionAllocation>('continuous')
  const [kind, setKind] = useState<GrafcetActionKind>('N')
  const [variable, setVariable] = useState('')
  const [condition, setCondition] = useState('1')
  const [description, setDescription] = useState('')
  const [displayDescription, setDisplayDescription] = useState(false)
  const [duration, setDuration] = useState('2')
  const [submitted, setSubmitted] = useState(false)
  const [outputPickerOpen, setOutputPickerOpen] = useState(false)
  const timeMs = Number(duration) * 1000

  useEffect(() => {
    if (action) {
      setSubmitted(false)
      setOutputPickerOpen(false)
      setVariable(action.variable ?? action.address ?? '')
      setDescription(action.description ?? '')
      setDisplayDescription(action.displayDescription ?? (!!action.description && action.description !== action.address && action.description !== action.variable))
      setCondition(action.condition ?? '1')
      setDuration(String((action.timeMs ?? 2000) / 1000))

      // Infer assignation & allocation
      const actKind = action.kind || 'N'
      setKind(['N', 'S', 'R', 'D', 'L'].includes(actKind) ? actKind : 'N')
      if (action.type) {
        setAssignation(action.type)
      } else if (action.condition && action.condition !== '1') {
        setAssignation('conditional')
      } else {
        setAssignation('simple')
      }

      if (action.allocation) {
        setAllocation(action.allocation)
      } else if (actKind === 'A') {
        setAllocation('activation')
      } else if (actKind === 'DA') {
        setAllocation('deactivation')
      } else if (actKind === 'EV') {
        setAllocation('event')
      } else if (actKind === 'C') {
        setAllocation('compulsory')
      } else {
        setAllocation('continuous')
      }
    }
  }, [action, open])

  if (!open || !action) return null

  const effectiveKind: GrafcetActionKind = allocation === 'activation' ? 'A' : allocation === 'deactivation' ? 'DA' : allocation === 'event' ? 'EV' : allocation === 'compulsory' ? 'C' : (['N', 'S', 'R', 'D', 'L'].includes(kind) ? kind : 'N')
  const timed = effectiveKind === 'D' || effectiveKind === 'L'
  const variableError = !variable.trim() ? 'Indique a variável ou saída da ação.' : !validGrafcetVariable(variable.trim()) ? 'Use uma variável válida, por exemplo Q1, %Q0.0 ou Motor_A.' : ''
  const conditionError = assignation === 'conditional' && !validCondition(condition) ? 'Indique uma condição válida, por exemplo I1 ou I1 * /I2.' : ''
  const timeError = timed && (!duration.trim() || !Number.isFinite(timeMs) || timeMs <= 0) ? 'Indique uma duração finita superior a zero.' : ''
  const handleOk = () => {
    setSubmitted(true)
    const invalid = variableError ? 'action-var-input' : conditionError ? 'action-cond-input' : timeError ? 'action-time-input' : ''
    if (invalid) { document.getElementById(invalid)?.focus(); return }
    onSave({
      address: variable.trim(), variable: variable.trim(), description: description.trim(), displayDescription,
      condition: assignation === 'conditional' ? condition.trim() : '1', kind: effectiveKind, type: assignation, allocation,
      timeMs: timed ? timeMs : undefined,
    })
    onClose()
  }

  // Label to show in the action preview
  const displayText = displayDescription && description
    ? description
    : (variable || 'Ação')

  // Render SVG Preview normalizado IEC 60848
  const renderPreview = () => {
    const isCompulsory = allocation === 'compulsory'
    const isActivation = allocation === 'activation'
    const isDeactivation = allocation === 'deactivation'
    const isEvent = allocation === 'event'
    const isConditional = assignation === 'conditional'

    const hasQualifier = allocation === 'continuous'
    const qualifierText = effectiveKind

    const boxW = 160
    const boxH = 38
    const startX = 20
    const startY = isConditional ? 38 : 22

    return (
      <svg width="100%" height="110" viewBox="0 0 200 110" className="grafcet-preview-svg" role="img" aria-label={`Pré-visualização da ação ${variable || "sem variável"}`}><title>{displayText}</title>
        {/* Conditional notch/flag on top */}
        {isConditional && (
          <g>
            <path d={`M ${startX + 18} ${startY} V ${startY - 14} H ${startX + 80}`} fill="none" stroke="#1e293b" strokeWidth="1.6" />
            <text x={startX + 22} y={startY - 17} fontSize="10" fontWeight="700" fill="#2563eb">
              {condition.length > 23 ? condition.slice(0, 22) + '…' : condition || 'condição'}
            </text>
          </g>
        )}

        {/* Main action rectangle */}
        <rect
          x={startX}
          y={startY}
          width={boxW}
          height={boxH}
          fill="white"
          stroke="#1e293b"
          strokeWidth="1.8"
        />

        {/* Compulsory command double line */}
        {isCompulsory && (
          <rect
            x={startX + 3}
            y={startY + 3}
            width={boxW - 6}
            height={boxH - 6}
            fill="none"
            stroke="#1e293b"
            strokeWidth="1.2"
          />
        )}

        {/* Activation arrow UP on left edge */}
        {isActivation && (
          <g stroke="#1e293b" strokeWidth="1.8" fill="none">
            <line x1={startX + 10} y1={startY + 27} x2={startX + 10} y2={startY + 11} />
            <path d={`M ${startX + 6} ${startY + 16} L ${startX + 10} ${startY + 10} L ${startX + 14} ${startY + 16}`} />
          </g>
        )}

        {/* Deactivation arrow DOWN on left edge */}
        {isDeactivation && (
          <g stroke="#1e293b" strokeWidth="1.8" fill="none">
            <line x1={startX + 10} y1={startY + 11} x2={startX + 10} y2={startY + 27} />
            <path d={`M ${startX + 6} ${startY + 22} L ${startX + 10} ${startY + 28} L ${startX + 14} ${startY + 22}`} />
          </g>
        )}

        {/* Event arrow notch */}
        {isEvent && (
          <g stroke="#1e293b" strokeWidth="1.6" fill="none">
            <path d={`M ${startX + 6} ${startY + 24} L ${startX + 12} ${startY + 13} L ${startX + 16} ${startY + 13}`} />
          </g>
        )}

        {/* IEC Qualifier section (S, R, D, L, N) */}
        {hasQualifier && (
          <g>
            <line x1={startX + 32} y1={startY} x2={startX + 32} y2={startY + boxH} stroke="#1e293b" strokeWidth="1.5" />
            <text
              x={startX + 16}
              y={startY + 23}
              textAnchor="middle"
              fontSize={kind === 'D' || kind === 'L' ? '9' : '11.5'}
              fontWeight="700"
              fill={kind === 'N' ? '#64748b' : '#2563eb'}
            >
              {qualifierText}
            </text>
          </g>
        )}

        {/* Text inside box */}
        <text
          x={hasQualifier ? startX + 41 : isActivation || isDeactivation || isEvent ? startX + 26 : startX + 16}
          y={startY + 24}
          fontSize={displayText.length > 12 ? '11' : '12.5'}
          fontWeight="600"
          fill="#0f172a"
        >
          {displayText.length > 19 ? displayText.slice(0, 18) + '…' : displayText}
        </text>
        {timed && <text x="100" y="97" textAnchor="middle" fontSize="10" fill="#435773">{effectiveKind === 'D' ? 'Atraso' : 'Limite'}: {duration || '—'} s</text>}
      </svg>
    )
  }

  const outputSignals = signals.filter((signal) => signal.area === 'Q' || signal.area === 'M')
  const variableInTable = outputSignals.find((signal) => signal.address === canonicalSignalAddress(variable))

  const allocationOptions: Array<{ id: GrafcetActionAllocation; kind: GrafcetActionKind; label: string }> = [
    { id: 'continuous', kind: 'N', label: 'Durante a etapa' }, { id: 'activation', kind: 'A', label: 'Ao ativar ↑' },
    { id: 'deactivation', kind: 'DA', label: 'Ao desativar ↓' }, { id: 'event', kind: 'EV', label: 'No evento' },
    { id: 'compulsory', kind: 'C', label: 'Forçagem' },
  ]
  const selectedKind = ACTION_KINDS.find((item) => item.id === effectiveKind)
  const originalAllocation = action.allocation ?? (action.kind === 'DA' ? 'deactivation' : action.kind === 'EV' ? 'event' : action.kind === 'C' ? 'compulsory' : action.kind === 'A' ? 'activation' : 'continuous')
  const notExecuted = ['DA', 'EV', 'C'].includes(effectiveKind)
  const behaviorHint = notExecuted ? 'Tipo histórico guardado como notação. Esta ação não é executada pelo simulador atual.' : selectedKind?.hint
  return (
    <PropertyDialog open={open} id="action-dialog" title="Propriedades da ação" subtitle="Defina a saída, o comportamento e as condições de execução." onSave={handleOk} onClose={onClose}>
      <div className="grafcet-property-grid">
        <section className="grafcet-property-fields" aria-label="Definições da ação">
          <div className="grafcet-property-field">
            <label htmlFor="action-var-input">Variável / saída <span className="grafcet-required">obrigatória</span></label>
            <input id="action-var-input" data-initial-focus className="dc-input grafcet-code-input" list="grafcet-action-variables-list" value={variable} onChange={(e) => setVariable(e.target.value)} placeholder="Ex.: Q1, Motor_A, Y1_A-" aria-invalid={submitted && !!variableError} aria-describedby={submitted && variableError ? 'action-var-error' : undefined} />
            <datalist id="grafcet-action-variables-list">{outputSignals.map((signal) => <option key={signal.address} value={signal.address}>{signal.name} {signal.comment}</option>)}</datalist>
            {submitted && variableError && <p id="action-var-error" className="grafcet-field-error" role="alert">{variableError}</p>}
            <SignalPicker signals={outputSignals} inputId="action-var-input" onChoose={setVariable} onOpenChange={setOutputPickerOpen} />
            <div className="grafcet-property-chips" aria-label="Sugestões de saídas">{outputSignals.slice(0, 5).map((signal) => <button type="button" key={signal.address} onClick={() => setVariable(signal.address)} aria-pressed={canonicalSignalAddress(variable) === signal.address} title={signal.comment}><code>{signal.address}</code>{signal.name && ` · ${signal.name}`}</button>)}</div>
            {variable.trim() && !variableInTable && <p className="grafcet-signal-undeclared">Esta variável não está na tabela de saídas/memórias booleanas. A ação manual é mantida.</p>}
            {!outputSignals.length && <p className="grafcet-property-note">Declare saídas ou memórias em «Variáveis» para obter sugestões. Pode manter endereços introduzidos manualmente.</p>}
          </div>
          <fieldset className="grafcet-property-section">
            <legend>Execução</legend>
            <div className="grafcet-property-choice-row">
              <label className={`grafcet-property-option ${assignation === 'simple' ? 'is-selected' : ''}`}><input type="radio" name="assignation" checked={assignation === 'simple'} onChange={() => setAssignation('simple')} /><span><strong>Ação simples</strong><small>Sem condição adicional</small></span></label>
              <label className={`grafcet-property-option ${assignation === 'conditional' ? 'is-selected' : ''}`}><input type="radio" name="assignation" checked={assignation === 'conditional'} onChange={() => setAssignation('conditional')} /><span><strong>Condicional</strong><small>Depende de uma expressão</small></span></label>
            </div>
            <div hidden={assignation !== 'conditional'}><ConditionEditor id="action-cond-input" value={condition} onChange={setCondition} signals={signals} availableSteps={availableSteps} resetKey={`${action.id}:${open}`} initialDefaultOne={(action.condition ?? '1') === '1'} active={assignation === 'conditional' && !outputPickerOpen} error={submitted ? conditionError : undefined} /></div>
          </fieldset>
          <fieldset className="grafcet-property-section">
            <legend>Quando executar</legend>
            <div className="grafcet-allocation-options">{allocationOptions.map((option) => {
              const unsupported = ['deactivation', 'event', 'compulsory'].includes(option.id)
              const disabled = unsupported && originalAllocation !== option.id
              return <label key={option.id} className={`grafcet-property-option ${allocation === option.id ? 'is-selected' : ''} ${disabled ? 'is-unavailable' : ''}`}><input type="radio" name="allocation" checked={allocation === option.id} disabled={disabled} onChange={() => setAllocation(option.id)} /><span>{option.label}{unsupported && <small>Apenas notação · sem execução</small>}</span></label>
            })}</div>
            <p className="grafcet-property-note">Ao desativar, no evento e forçagem são tipos históricos sem execução. Pode manter uma seleção existente; novas ações usam os modos disponíveis.</p>
            {notExecuted && <p className="grafcet-property-warning" role="status">Esta ação ({effectiveKind}) será guardada, mas não liga nem desliga a saída na simulação atual.</p>}
            {allocation === 'continuous' && <>
              <span className="grafcet-property-label">Qualificador IEC</span>
              <div className="grafcet-qualifier-options" role="group" aria-label="Qualificador IEC">{ACTION_KINDS.filter((item) => ['N', 'S', 'R', 'D', 'L'].includes(item.id)).map((item) => <button type="button" key={item.id} aria-pressed={kind === item.id} onClick={() => setKind(item.id)} title={item.hint}><code>{item.id}</code><span>{item.label.split(' · ')[1].replace(' (set)', '').replace(' (reset)', '')}</span></button>)}</div>
            </>}
            <p className="grafcet-property-note">{behaviorHint}</p>
            {timed && <div className="grafcet-property-field">
              <label htmlFor="action-time-input">Duração <span className="grafcet-optional">segundos</span></label>
              <input id="action-time-input" type="number" step="any" min="0" className="dc-input grafcet-code-input" value={duration} onChange={(e) => setDuration(e.target.value)} aria-invalid={submitted && !!timeError} aria-describedby={submitted && timeError ? 'action-time-error' : undefined} />
              {submitted && timeError && <p id="action-time-error" className="grafcet-field-error" role="alert">{timeError}</p>}
            </div>}
          </fieldset>
          <div className="grafcet-property-field">
            <label htmlFor="action-desc-input">Descrição <span className="grafcet-optional">opcional</span></label>
            <input id="action-desc-input" className="dc-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Ligar motor de avanço" />
            <label className="grafcet-property-checkbox"><input type="checkbox" checked={displayDescription} onChange={(e) => setDisplayDescription(e.target.checked)} /><span>Mostrar a descrição no diagrama</span></label>
          </div>
          <details className="grafcet-context-help"><summary>Como configurar esta ação</summary><div><p><b>N</b> acompanha a etapa; <b>S</b> memoriza a saída e <b>R</b> repõe a memória. <b>D</b> atrasa a ativação e <b>L</b> limita a duração, em segundos. <b>Ao ativar</b> gera um pulso à entrada na etapa.</p><p>Ao alternar entre «Durante a etapa» e «Ao ativar», o qualificador e a duração em edição são mantidos até guardar ou cancelar.</p><p>A condição usa o tempo da própria etapa: <code>T(2s)</code> torna-se verdadeira após dois segundos de atividade. Os estados <code>X0</code>, <code>X1</code> usam os índices globais das etapas.</p><p>A descrição é opcional e serve para apresentar a ação no diagrama. A saída executada continua a ser a variável escolhida.</p></div></details>
        </section>
        <aside className="grafcet-property-preview">
          <div className="grafcet-property-preview-label"><span>Pré-visualização</span><span>IEC 60848</span></div>
          <div className="grafcet-property-drawing">{renderPreview()}</div>
          <strong>{selectedKind?.label}</strong><p>{behaviorHint}</p>
          <div className="grafcet-property-preview-value"><span>Saída</span><code>{variable || 'Por definir'}</code></div>
          {assignation === 'conditional' && <div className="grafcet-property-preview-value"><span>Condição</span><code>{condition || 'Por definir'}</code></div>}
          {timed && <div className="grafcet-property-preview-value"><span>Duração</span><code>{duration || '—'} s</code></div>}
          {description && <div className="grafcet-property-preview-value"><span>Descrição</span><span>{description}</span></div>}
        </aside>
      </div>
    </PropertyDialog>
  )
}
