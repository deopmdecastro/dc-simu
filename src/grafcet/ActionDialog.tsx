import { useState, useEffect } from 'react'
import { ACTION_KINDS, validGrafcetVariable, validCondition, normalizeActionVariable, type GrafcetAction, type GrafcetActionKind, type GrafcetActionAllocation, type GrafcetStep } from './engine'
import PropertyDialog from '../ui/PropertyDialog'
import ConditionEditor from './ConditionEditor'
import SignalPicker from './SignalPicker'
import { canonicalSignalAddress, type GrafcetSignalSuggestion } from './signals'
import { IconChevronRight } from '../ui/icons'

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

const INK = '#1e293b'
const QUALIFIERS: GrafcetActionKind[] = ['N', 'S', 'R', 'D', 'L']

/** Símbolo IEC 60848 da ação, usado nas miniaturas dos tipos e na pré-visualização. */
function ActionGlyph({ assignation, allocation, qualifier, text, condition, width = 160, height = 38, mini = false }: {
  assignation: AssignationType; allocation: GrafcetActionAllocation; qualifier?: string; text?: string; condition?: string
  width?: number; height?: number; mini?: boolean
}) {
  const conditional = assignation === 'conditional'
  const pad = 6
  const top = conditional ? (mini ? 12 : 26) : (mini ? 6 : 16)
  const sw = mini ? 1.4 : 1.8
  const bx = pad
  const total = width + pad * 2
  const totalH = top + height + (mini ? 6 : 26)
  const showQualifier = allocation === 'continuous' && !!qualifier
  const textX = showQualifier ? bx + 40 : allocation === 'continuous' ? bx + 12 : bx + 28
  const cy = top + height / 2
  return (
    <svg viewBox={`0 0 ${total} ${totalH}`} width={mini ? 62 : '100%'} height={mini ? 34 : 118} aria-hidden="true" focusable="false" className="grafcet-preview-svg">
      {conditional && (
        <g>
          <path d={`M ${bx + 14} ${top} V ${top - (mini ? 7 : 12)} H ${bx + (mini ? 40 : 84)}`} fill="none" stroke={INK} strokeWidth={sw} />
          {!mini && <text x={bx + 18} y={top - 15} fontSize="10" fontWeight="700" fill="#2563eb">{(condition || 'condição').slice(0, 24)}</text>}
        </g>
      )}
      <rect x={bx} y={top} width={width} height={height} fill="#fff" stroke={INK} strokeWidth={sw} />
      {allocation === 'compulsory' && <rect x={bx + 3} y={top + 3} width={width - 6} height={height - 6} fill="none" stroke={INK} strokeWidth={sw * 0.7} />}
      {allocation === 'activation' && (
        <g stroke={INK} strokeWidth={sw} fill="none">
          <line x1={bx - 0.5} y1={top - 6} x2={bx - 0.5} y2={top + height * 0.55} />
          <path d={`M ${bx - 4} ${top - 1} L ${bx - 0.5} ${top - 7} L ${bx + 3} ${top - 1}`} />
        </g>
      )}
      {allocation === 'deactivation' && (
        <g stroke={INK} strokeWidth={sw} fill="none">
          <line x1={bx - 0.5} y1={top + height * 0.45} x2={bx - 0.5} y2={top + height + 6} />
          <path d={`M ${bx - 4} ${top + height + 1} L ${bx - 0.5} ${top + height + 7} L ${bx + 3} ${top + height + 1}`} />
        </g>
      )}
      {allocation === 'event' && <path d={`M ${bx} ${top + height * 0.2} L ${bx + 9} ${top + height * 0.2 + 7} L ${bx} ${top + height * 0.2 + 14} Z`} fill={INK} />}
      {showQualifier && !mini && (
        <g>
          <line x1={bx + 28} y1={top} x2={bx + 28} y2={top + height} stroke={INK} strokeWidth="1.4" />
          <text x={bx + 14} y={cy + 4.5} textAnchor="middle" fontSize="12" fontWeight="700" fill={qualifier === 'N' ? '#64748b' : '#2563eb'}>{qualifier}</text>
        </g>
      )}
      {!mini && <text x={textX} y={cy + 4.5} fontSize={(text ?? '').length > 12 ? 11 : 12.5} fontWeight="600" fill="#0f172a">{(text ?? '').length > 18 ? `${(text ?? '').slice(0, 17)}…` : text}</text>}
    </svg>
  )
}

const ASSIGNATIONS: Array<{ id: AssignationType; label: string; hint: string }> = [
  { id: 'simple', label: 'Ação simples', hint: 'Sempre que a etapa está ativa' },
  { id: 'conditional', label: 'Ação condicionada', hint: 'Só se a condição for verdadeira' },
]

const ALLOCATIONS: Array<{ id: GrafcetActionAllocation; label: string; hint: string; executes: boolean }> = [
  { id: 'continuous', label: 'Durante a etapa', hint: 'Enquanto a etapa está ativa (N, S, R, D, L)', executes: true },
  { id: 'activation', label: 'Ao ativar', hint: 'Pulso à entrada na etapa', executes: true },
  { id: 'deactivation', label: 'Ao desativar', hint: 'Pulso à saída da etapa', executes: true },
  { id: 'event', label: 'No evento', hint: 'Apenas notação · sem execução', executes: false },
  { id: 'compulsory', label: 'Comando forçado', hint: 'Força a saída enquanto a etapa está ativa', executes: true },
]

const KIND_OF_ALLOCATION: Record<GrafcetActionAllocation, GrafcetActionKind> = { continuous: 'N', activation: 'A', deactivation: 'DA', event: 'EV', compulsory: 'C' }

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

  useEffect(() => {
    if (!action) return
    setSubmitted(false)
    setOutputPickerOpen(false)
    setVariable(action.variable ?? action.address ?? '')
    setDescription(action.description ?? '')
    setDisplayDescription(action.displayDescription ?? (!!action.description && action.description !== action.address && action.description !== action.variable))
    setCondition(action.condition ?? '1')
    setDuration(String((action.timeMs ?? 2000) / 1000))
    const actKind = action.kind || 'N'
    setKind(QUALIFIERS.includes(actKind) ? actKind : 'N')
    setAssignation(action.type ?? (action.condition && action.condition !== '1' ? 'conditional' : 'simple'))
    setAllocation(action.allocation ?? (actKind === 'A' ? 'activation' : actKind === 'DA' ? 'deactivation' : actKind === 'EV' ? 'event' : actKind === 'C' ? 'compulsory' : 'continuous'))
  }, [action, open])

  if (!open || !action) return null

  const effectiveKind: GrafcetActionKind = allocation === 'continuous' ? (QUALIFIERS.includes(kind) ? kind : 'N') : KIND_OF_ALLOCATION[allocation]
  const timed = effectiveKind === 'D' || effectiveKind === 'L'
  const timeMs = Number(duration) * 1000
  const resolved = normalizeActionVariable(variable)
  const numberOnly = /^\d+$/.test(variable.trim())
  const variableError = !variable.trim() ? 'Indique o número ou nome da ação (ex.: 1, Q1, Motor_A).' : !validGrafcetVariable(resolved) ? 'Use um número (1), uma saída (Q1, %Q0.0) ou um nome válido (Motor_A).' : ''
  const conditionError = assignation === 'conditional' && !validCondition(condition) ? 'Indique uma condição válida, por exemplo I1 ou I1 * /I2.' : ''
  const timeError = timed && (!duration.trim() || !Number.isFinite(timeMs) || timeMs <= 0) ? 'Indique uma duração finita superior a zero.' : ''

  const handleOk = () => {
    setSubmitted(true)
    const invalid = variableError ? 'action-var-input' : conditionError ? 'action-cond-input' : timeError ? 'action-time-input' : ''
    if (invalid) { document.getElementById(invalid)?.focus(); return }
    onSave({
      address: resolved, variable: resolved, description: description.trim(), displayDescription,
      condition: assignation === 'conditional' ? condition.trim() : '1', kind: effectiveKind, type: assignation, allocation,
      timeMs: timed ? timeMs : undefined,
    })
    onClose()
  }

  const shown = resolved || 'Ação'
  const displayText = displayDescription && description ? description : shown
  const outputSignals = signals.filter((signal) => signal.area === 'Q' || signal.area === 'M')
  const variableInTable = outputSignals.find((signal) => signal.address === canonicalSignalAddress(resolved))
  const selectedKind = ACTION_KINDS.find((item) => item.id === effectiveKind)
  const selectedAllocation = ALLOCATIONS.find((item) => item.id === allocation)
  const notExecuted = !selectedAllocation?.executes

  const typeCard = (name: string, checked: boolean, onSelect: () => void, label: string, hint: string, glyph: React.ReactNode) => (
    <label key={`${name}-${label}`} className={`grafcet-type-card ${checked ? 'is-selected' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} />
      <span className="grafcet-type-glyph">{glyph}</span>
      <span className="grafcet-type-text"><strong>{label}</strong><small>{hint}</small></span>
    </label>
  )

  return (
    <PropertyDialog open={open} id="action-dialog" title="Propriedades da ação" subtitle="Escolha a saída, o tipo de ação e quando ela atua." onSave={handleOk} onClose={onClose}>
      <div className="grafcet-property-grid">
        <section className="grafcet-property-fields" aria-label="Definições da ação">
          <div className="grafcet-step-block">
            <h3 className="grafcet-step-heading"><span>1</span>Saída ou número da ação</h3>
            <div className="grafcet-var-row">
              <input id="action-var-input" data-initial-focus className="dc-input grafcet-code-input" list="grafcet-action-variables-list" value={variable} onChange={(e) => setVariable(e.target.value)} placeholder="Ex.: 1, Q1, Motor_A" aria-invalid={submitted && !!variableError} aria-describedby={submitted && variableError ? 'action-var-error' : undefined} />
              {numberOnly && !variableError && <span className="grafcet-var-resolved" title="Só o número foi indicado">→ <code>{resolved}</code></span>}
            </div>
            <datalist id="grafcet-action-variables-list">{outputSignals.map((signal) => <option key={signal.address} value={signal.address}>{signal.name} {signal.comment}</option>)}</datalist>
            {submitted && variableError && <p id="action-var-error" className="grafcet-field-error" role="alert">{variableError}</p>}
            <SignalPicker signals={outputSignals} inputId="action-var-input" onChoose={setVariable} onOpenChange={setOutputPickerOpen} />
            {outputSignals.length > 0 && <div className="grafcet-property-chips" aria-label="Sugestões de saídas">{outputSignals.slice(0, 5).map((signal) => <button type="button" key={signal.address} onClick={() => setVariable(signal.address)} aria-pressed={canonicalSignalAddress(resolved) === signal.address} title={signal.comment}><code>{signal.address}</code>{signal.name && ` · ${signal.name}`}</button>)}</div>}
            <p className="grafcet-property-note">
              {!variable.trim() ? 'Pode escrever só o número: «1» cria a ação Q1, mesmo sem estar ligada a uma etapa.' : !variableInTable ? 'Variável manual. Adicione-a em «Variáveis» para a encontrar nas sugestões.' : `Saída «${variableInTable.name || variableInTable.address}» encontrada na tabela de variáveis.`}
            </p>
          </div>

          <div className="grafcet-step-block">
            <h3 className="grafcet-step-heading"><span>2</span>Tipo de ação</h3>
            <div className="grafcet-type-group">
              <span className="grafcet-type-group-label">Atribuição</span>
              <div className="grafcet-type-grid grafcet-type-grid-2">
                {ASSIGNATIONS.map((item) => typeCard('assignation', assignation === item.id, () => setAssignation(item.id), item.label, item.hint,
                  <ActionGlyph mini assignation={item.id} allocation="continuous" />))}
              </div>
            </div>
            <div className="grafcet-type-group">
              <span className="grafcet-type-group-label">Alocação — quando atua</span>
              <div className="grafcet-type-grid">
                {ALLOCATIONS.map((item) => typeCard('allocation', allocation === item.id, () => setAllocation(item.id), item.label, item.hint,
                  <ActionGlyph mini assignation={assignation} allocation={item.id} />))}
              </div>
            </div>
            {notExecuted && <p className="grafcet-property-warning" role="status">O tipo «{selectedAllocation?.label}» fica guardado como notação, mas não liga nem desliga a saída na simulação atual.</p>}
          </div>

          {allocation === 'continuous' && (
            <div className="grafcet-step-block">
              <h3 className="grafcet-step-heading"><span>3</span>Qualificador</h3>
              <div className="grafcet-qualifier-options" role="group" aria-label="Qualificador IEC">
                {ACTION_KINDS.filter((item) => QUALIFIERS.includes(item.id)).map((item) => <button type="button" key={item.id} aria-pressed={kind === item.id} onClick={() => setKind(item.id)} title={item.hint}><code>{item.id}</code><span>{item.label.split(' · ')[1].replace(' (set)', '').replace(' (reset)', '')}</span></button>)}
              </div>
              <p className="grafcet-property-note">{selectedKind?.hint}</p>
              {timed && <div className="grafcet-property-field">
                <label htmlFor="action-time-input">{effectiveKind === 'D' ? 'Atraso' : 'Duração máxima'} <span className="grafcet-optional">segundos</span></label>
                <input id="action-time-input" type="number" step="any" min="0" className="dc-input grafcet-code-input" value={duration} onChange={(e) => setDuration(e.target.value)} aria-invalid={submitted && !!timeError} aria-describedby={submitted && timeError ? 'action-time-error' : undefined} />
                {submitted && timeError && <p id="action-time-error" className="grafcet-field-error" role="alert">{timeError}</p>}
              </div>}
            </div>
          )}

          <div className="grafcet-step-block" hidden={assignation !== 'conditional'}>
            <h3 className="grafcet-step-heading"><span>{allocation === 'continuous' ? 4 : 3}</span>Condição</h3>
            <ConditionEditor id="action-cond-input" value={condition} onChange={setCondition} signals={signals} availableSteps={availableSteps} resetKey={`${action.id}:${open}`} initialDefaultOne={(action.condition ?? '1') === '1'} active={assignation === 'conditional' && !outputPickerOpen} error={submitted ? conditionError : undefined} />
          </div>

          <details className="grafcet-context-help grafcet-inline-disclosure">
            <summary><IconChevronRight size={11} />Descrição (opcional)</summary>
            <div className="grafcet-property-field">
              <input id="action-desc-input" className="dc-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Ligar motor de avanço" />
              <label className="grafcet-property-checkbox"><input type="checkbox" checked={displayDescription} onChange={(e) => setDisplayDescription(e.target.checked)} /><span>Mostrar a descrição no diagrama</span></label>
            </div>
          </details>
        </section>

        <aside className="grafcet-property-preview">
          <div className="grafcet-property-preview-label"><span>Pré-visualização</span><span>IEC 60848</span></div>
          <div className="grafcet-property-drawing">
            <ActionGlyph assignation={assignation} allocation={allocation} qualifier={allocation === 'continuous' ? effectiveKind : undefined} text={displayText} condition={condition} />
          </div>
          <strong>{selectedKind?.label}</strong><p>{notExecuted ? 'Notação guardada; não é executada pelo simulador.' : selectedKind?.hint}</p>
          <div className="grafcet-property-preview-value"><span>Saída</span><code>{resolved || 'Por definir'}</code></div>
          {assignation === 'conditional' && <div className="grafcet-property-preview-value"><span>Condição</span><code>{condition || 'Por definir'}</code></div>}
          {timed && <div className="grafcet-property-preview-value"><span>{effectiveKind === 'D' ? 'Atraso' : 'Duração'}</span><code>{duration || '—'} s</code></div>}
          {description && <div className="grafcet-property-preview-value"><span>Descrição</span><span>{description}</span></div>}
        </aside>
      </div>
    </PropertyDialog>
  )
}
